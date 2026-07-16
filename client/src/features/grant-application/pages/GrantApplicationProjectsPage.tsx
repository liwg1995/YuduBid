import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import type { SectionId } from '../../../shared/types/navigation';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { GrantApplicationProfile, GrantApplicationProject, GrantApplicationProjectList } from '../types';

interface GrantApplicationProjectsPageProps {
  onNavigate?: (section: SectionId) => void;
}

const defaultProjectProfile: GrantApplicationProfile = {
  level: '市级',
  discipline: '教育学',
  direction: '',
  stage: '准备申报',
  deadline: '',
  sourceNotes: '',
};

function GrantApplicationProjectsPage({ onNavigate }: GrantApplicationProjectsPageProps) {
  const { showToast } = useToast();
  const [projectList, setProjectList] = useState<GrantApplicationProjectList>({ activeProjectId: 'default', projects: [] });
  const [projectName, setProjectName] = useState('');
  const [projectProfileDraft, setProjectProfileDraft] = useState<GrantApplicationProfile>(defaultProjectProfile);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [editingProjectName, setEditingProjectName] = useState('');
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredProjects = useMemo(() => {
    const projects = projectList.projects || [];
    if (!normalizedKeyword) return projects;
    return projects.filter((project) => {
      const searchText = [
        project.name,
        project.id,
        project.isLegacy ? '历史项目 旧数据' : '',
        project.created_at ? new Date(project.created_at).toLocaleString('zh-CN', { hour12: false }) : '',
      ].join(' ').toLowerCase();
      return searchText.includes(normalizedKeyword);
    });
  }, [normalizedKeyword, projectList.projects]);

  async function loadProjects() {
    try {
      setLoading(true);
      const projects = await window.yibiao?.grantApplication.listProjects();
      if (projects) setProjectList(projects);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取课题项目失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function createProject() {
    const name = projectName.trim();
    if (!name) {
      showToast('请先填写课题项目名称', 'info');
      return;
    }
    try {
      setBusy(true);
      const result = await window.yibiao?.grantApplication.createProject({ projectName: name, profile: projectProfileDraft });
      if (result?.projects) setProjectList(result.projects);
      setProjectName('');
      setProjectProfileDraft(defaultProjectProfile);
      setCreateDialogOpen(false);
      showToast('课题项目已创建', 'success');
      onNavigate?.('grant-diagnosis');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function enterProject(project: GrantApplicationProject) {
    try {
      setBusy(true);
      await window.yibiao?.grantApplication.switchProject(project.id);
      onNavigate?.('grant-diagnosis');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '进入课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function renameProject(project: GrantApplicationProject) {
    const name = editingProjectName.trim();
    if (!name || name === project.name) {
      setEditingProjectId('');
      setEditingProjectName('');
      return;
    }
    try {
      setBusy(true);
      const result = await window.yibiao?.grantApplication.renameProject({ projectId: project.id, name });
      if (result?.projects) setProjectList(result.projects);
      setEditingProjectId('');
      setEditingProjectName('');
      showToast('课题项目已重命名', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重命名课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(project: GrantApplicationProject) {
    if (pendingDeleteProjectId !== project.id) {
      setPendingDeleteProjectId(project.id);
      return;
    }
    try {
      setBusy(true);
      const result = await window.yibiao?.grantApplication.deleteProject(project.id);
      if (result?.projects) setProjectList(result.projects);
      setPendingDeleteProjectId('');
      showToast('课题项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack grant-project-page">
      <section className="technical-project-hero">
        <div>
          <span className="section-kicker">课题申报</span>
          <strong>课题项目</strong>
          <p>为不同课题分别保存档案、材料、诊断、选题、申报书模块、质量检查和导出成果。</p>
        </div>
      </section>

      <section className="technical-project-guide">
        <div className="technical-project-guide-main">
          <span className="section-kicker">创建课题项目</span>
          <strong>{projectList.projects.length ? `当前已有 ${projectList.projects.length} 个课题项目` : '还没有课题项目'}</strong>
          <p>建议一个申报题目对应一个课题项目。后续生成的申报书模块、图示建议、八维检测报告都会跟随项目保存。</p>
          <div className="grant-project-create-row">
            <button type="button" className="primary-action" onClick={() => setCreateDialogOpen(true)} disabled={busy}>新建课题项目</button>
          </div>
        </div>
        <div className="technical-project-guide-grid">
          <article>
            <strong>独立工作区</strong>
            <span>每个课题单独保存材料、草稿、模块和导出结果。</span>
          </article>
          <article>
            <strong>图示增强</strong>
            <span>申报书可按需加入研究框架图、技术路线图和 Mermaid 图。</span>
          </article>
          <article>
            <strong>质量闭环</strong>
            <span>模块生成后可继续做事实缺口、空泛表达和评审风险检查。</span>
          </article>
        </div>
      </section>

      {!loading && projectList.projects.length > 0 && (
        <section className="technical-project-toolbar" aria-label="课题项目检索">
          <input className="technical-project-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索课题项目名称、历史项目或创建时间" />
          <span>共 {projectList.projects.length} 个项目{normalizedKeyword ? `，匹配 ${filteredProjects.length} 个` : ''}</span>
        </section>
      )}

      <section className="technical-project-list">
        {loading && <div className="markdown-empty-state">正在读取课题项目...</div>}
        {!loading && !projectList.projects.length && <div className="markdown-empty-state">暂无课题项目，先创建一个项目。</div>}
        {!loading && projectList.projects.length > 0 && !filteredProjects.length && <div className="markdown-empty-state">没有匹配的课题项目，换个关键词试试。</div>}
        {filteredProjects.map((project) => (
          <article className="technical-project-card" key={project.id}>
            <div>
              {editingProjectId === project.id ? (
                <input className="technical-project-name-input" value={editingProjectName} onChange={(event) => setEditingProjectName(event.target.value)} aria-label="编辑课题项目名称" />
              ) : (
                <strong>{project.name}</strong>
              )}
              <p>{project.isLegacy ? '历史项目，承接旧版单项目数据' : `创建时间：${new Date(project.created_at).toLocaleString('zh-CN', { hour12: false })}`}</p>
            </div>
            <div className="technical-project-actions">
              {editingProjectId === project.id ? (
                <>
                  <button type="button" className="secondary-action" onClick={() => void renameProject(project)} disabled={busy}>保存</button>
                  <button type="button" className="secondary-action" onClick={() => setEditingProjectId('')} disabled={busy}>取消</button>
                </>
              ) : (
                <button type="button" className="secondary-action" onClick={() => { setEditingProjectId(project.id); setEditingProjectName(project.name); }} disabled={busy}>重命名</button>
              )}
              {projectList.projects.length > 1 && (
                <button type="button" className="secondary-action danger-action" onClick={() => void deleteProject(project)} disabled={busy}>
                  {pendingDeleteProjectId === project.id ? '确认删除' : '删除'}
                </button>
              )}
              <button type="button" className="primary-action" onClick={() => void enterProject(project)} disabled={busy}>进入项目</button>
            </div>
          </article>
        ))}
      </section>
      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card grant-application-create-dialog">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>新建课题项目</Dialog.Title>
                <Dialog.Description>创建项目时填写课题档案，后续诊断、选题、撰写和评审会自动引用。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭新建课题项目">×</Dialog.Close>
            </div>
            <div className="grant-application-create-profile-grid">
              <label>
                <span>项目名称</span>
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：市级课题-分层作业设计研究" autoFocus />
              </label>
              <label>
                <span>课题级别</span>
                <select value={projectProfileDraft.level} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, level: event.target.value }))}>
                  <option>校级</option>
                  <option>县级</option>
                  <option>市级</option>
                  <option>省级</option>
                  <option>国家级</option>
                  <option>不确定</option>
                </select>
              </label>
              <label>
                <span>学科领域</span>
                <select value={projectProfileDraft.discipline} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, discipline: event.target.value }))}>
                  <option>教育学</option>
                  <option>医学/临床</option>
                  <option>工程技术</option>
                  <option>农业科学</option>
                  <option>艺术/体育</option>
                  <option>基础科学</option>
                  <option>其他</option>
                </select>
              </label>
              <label>
                <span>当前阶段</span>
                <select value={projectProfileDraft.stage} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, stage: event.target.value }))}>
                  <option>准备申报</option>
                  <option>已有方向</option>
                  <option>已有草稿</option>
                  <option>等待评审</option>
                  <option>答辩准备</option>
                  <option>立项实施</option>
                </select>
              </label>
              <label>
                <span>截止时间</span>
                <input type="date" value={projectProfileDraft.deadline} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, deadline: event.target.value }))} />
              </label>
              <label className="is-wide">
                <span>研究方向</span>
                <input value={projectProfileDraft.direction} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, direction: event.target.value }))} placeholder="一句话描述课题方向" />
              </label>
              <label className="is-wide">
                <span>基础说明</span>
                <textarea value={projectProfileDraft.sourceNotes} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, sourceNotes: event.target.value }))} placeholder="补充团队基础、学校场景、已有成果、数据来源或申报限制。" />
              </label>
            </div>
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="secondary-action" type="button" disabled={busy}>取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={() => void createProject()} disabled={busy || !projectName.trim()}>
                {busy ? '创建中...' : '创建并进入'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default GrantApplicationProjectsPage;
