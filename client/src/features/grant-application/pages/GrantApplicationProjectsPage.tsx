import ProjectDeleteDialog from '../../../shared/ui/ProjectDeleteDialog';
import type { InputRef } from 'antd';
import { ProjectListEmpty, ProjectListHeader, ProjectListToolbar, ProjectListTable, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import CollectionPagination from '../../../shared/ui/CollectionPagination';
import WorkspaceLoadError from '../../../shared/ui/WorkspaceLoadError';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useEffect, useMemo, useState } from 'react';
import type { SectionId } from '../../../shared/types/navigation';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { GrantApplicationProfile, GrantApplicationProject, GrantApplicationProjectList } from '../types';
import '../grantApplication.css';
import './modernGrantProjects.css';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import { projectNameInitials } from '../../../shared/utils/projectNameInitials';

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
  const projectSearchRef = useRef<InputRef>(null);
  const [keyword, setKeyword] = useState('');
  const [listPage, setListPage] = useState(1);
  useEffect(() => setListPage(1), [keyword]);
  const [editingProjectId, setEditingProjectId] = useState('');
  const [editingProjectName, setEditingProjectName] = useState('');
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState('');

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
      setLoading(true); setLoadError(''); setOperationError('');
      const projects = await window.yibiao?.grantApplication.listProjects();
      if (projects) setProjectList(projects);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      setLoadError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '读取课题项目失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, [loadRevision]);

  async function createProject() {
    if (busy) return;
    const name = projectName.trim();
    if (!name) {
      showToast('请先填写课题项目名称', 'info');
      return;
    }
    try {
      setOperationError(''); setBusy(true);
      const result = await window.yibiao?.grantApplication.createProject({ projectName: name, profile: projectProfileDraft });
      if (result?.projects) setProjectList(result.projects);
      setProjectName('');
      setProjectProfileDraft(defaultProjectProfile);
      setCreateDialogOpen(false);
      showToast('课题项目已创建', 'success');
      onNavigate?.('grant-diagnosis');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '创建课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function enterProject(project: GrantApplicationProject) {
    if (busy) return;
    try {
      setOperationError(''); setBusy(true);
      await window.yibiao?.grantApplication.switchProject(project.id);
      onNavigate?.('grant-diagnosis');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '进入课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function renameProject(project: GrantApplicationProject) {
    if (busy) return;
    const name = editingProjectName.trim();
    if (!name || name === project.name) {
      setEditingProjectId('');
      setEditingProjectName('');
      return;
    }
    try {
      setOperationError(''); setBusy(true);
      const result = await window.yibiao?.grantApplication.renameProject({ projectId: project.id, name });
      if (result?.projects) setProjectList(result.projects);
      setEditingProjectId('');
      setEditingProjectName('');
      showToast('课题项目已重命名', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '重命名课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(project: GrantApplicationProject) {
    if (busy) return;
    if (pendingDeleteProjectId !== project.id) {
      setOperationError('');
      setPendingDeleteProjectId(project.id);
      return;
    }
    try {
      setOperationError(''); setBusy(true);
      const result = await window.yibiao?.grantApplication.deleteProject(project.id);
      if (result?.projects) setProjectList(result.projects);
      setPendingDeleteProjectId('');
      showToast('课题项目已删除', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '删除课题项目失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  const currentPage = Math.min(listPage, Math.max(1, Math.ceil(filteredProjects.length / 20)));
  const pageItems = filteredProjects.slice((currentPage - 1) * 20, currentPage * 20);

  if (loadError) return <WorkspaceLoadError message={loadError} onRetry={() => setLoadRevision(value => value + 1)} />;

  return (
    <div className={getStoredUiAppearance() === 'modern' ? 'modern-grant-projects' : 'page-stack grant-project-page'}>
      {operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
      {getStoredUiAppearance() === 'modern' ? <>
        <ProjectListHeader title="课题项目" description="让不同课题的档案、材料和申报成果各自归位。" actions={<button type="button" className="primary-action" onClick={() => setCreateDialogOpen(true)} disabled={busy}>新建项目</button>} />
        <ProjectListToolbar inputRef={projectSearchRef} query={keyword} onQueryChange={setKeyword} placeholder="搜索项目名称、历史项目或创建时间" count={`${filteredProjects.length} / ${projectList.projects.length} 个项目`} />
        <section className="modern-grant-list" aria-label="课题项目列表"><ProjectListTable<GrantApplicationProject> loading={loading} dataSource={pageItems} pagination={false} columns={[
          { title: '项目名称', render: (_, project) => <div className="yb-project-list-name">{editingProjectId === project.id ? <input disabled={busy} autoFocus value={editingProjectName} onChange={event => setEditingProjectName(event.target.value)} aria-label="编辑课题项目名称" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void renameProject(project); } else if (event.key === 'Escape' && !busy) setEditingProjectId(''); }} /> : <button type="button" disabled={busy} onClick={() => void enterProject(project)}>{project.name}</button>}<small>{project.isLegacy ? '历史项目 · 承接旧版数据' : '独立项目'}</small></div> },
          { title: '创建时间', dataIndex: 'created_at', width: 180, render: formatProjectListTime },
          { title: '最近更新', dataIndex: 'updated_at', width: 180, render: formatProjectListTime },
          { title: '操作', width: 180, fixed: 'right', render: (_, project) => editingProjectId === project.id ? <div className="yb-project-list-actions"><button type="button" disabled={busy} onClick={() => void renameProject(project)}>保存</button><button type="button" disabled={busy} onClick={() => setEditingProjectId('')}>取消</button></div> : <ProjectListActions name={project.name} disabled={busy} onEnter={() => void enterProject(project)} items={[{ key: 'rename', label: '重命名', onClick: () => { setEditingProjectId(project.id); setEditingProjectName(project.name); } }, ...(projectList.projects.length > 1 ? [{ key: 'delete', label: '删除项目', danger: true, onClick: () => void deleteProject(project) }] : [])]} /> },
        ]} locale={{ emptyText: <ProjectListEmpty subject="课题项目" filtered={Boolean(keyword.trim())} disabled={busy} onReset={() => { setKeyword(''); requestAnimationFrame(() => projectSearchRef.current?.focus()); }} onCreate={() => setCreateDialogOpen(true)} /> }} /></section>
      </> : <>
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
          <p>一个申报题目对应一个项目，材料和成果独立保存。</p>
        </div>
        <button type="button" className="primary-action create-action" onClick={() => setCreateDialogOpen(true)} disabled={busy}>新建课题项目</button>
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
        {pageItems.map((project) => (
          <article className="technical-project-card" key={project.id}>
            <div>
              {editingProjectId === project.id ? (
                <input disabled={busy} className="technical-project-name-input" value={editingProjectName} onChange={(event) => setEditingProjectName(event.target.value)} aria-label="编辑课题项目名称" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void renameProject(project); } else if (event.key === 'Escape' && !busy) setEditingProjectId(''); }} />
              ) : (
                <button type="button" className="project-open-name" disabled={busy} onClick={() => void enterProject(project)}>{project.name}</button>
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
                  删除
                </button>
              )}
              <button type="button" className="primary-action" onClick={() => void enterProject(project)} disabled={busy}>进入项目</button>
            </div>
          </article>
        ))}
      </section>
      </>}
      <ProjectDeleteDialog name={projectList.projects.find(project => project.id === pendingDeleteProjectId)?.name} description="该课题项目的档案、材料和工作稿将被删除，此操作无法撤销。" busy={busy} error={operationError} onCancel={() => setPendingDeleteProjectId('')} onConfirm={() => { const target = projectList.projects.find(project => project.id === pendingDeleteProjectId); if (target) void deleteProject(target); }} />
      <CollectionPagination page={currentPage} total={filteredProjects.length} onChange={setListPage} />
      <Dialog.Root open={createDialogOpen} onOpenChange={open => { if (!busy) { setOperationError(''); setCreateDialogOpen(open); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card grant-application-create-dialog" onEscapeKeyDown={busy ? event => event.preventDefault() : undefined} onPointerDownOutside={busy ? event => event.preventDefault() : undefined}>
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>新建课题项目</Dialog.Title>
                <Dialog.Description>创建项目时填写课题档案，后续诊断、选题、撰写和评审会自动引用。</Dialog.Description>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
              </div>
            </div>
            <div className="grant-application-create-profile-grid">
              <label>
                <span>项目名称</span>
                <input disabled={busy} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：市级课题-分层作业设计研究" autoFocus />
              </label>
              <label>
                <span>课题级别</span>
                <select disabled={busy} value={projectProfileDraft.level} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, level: event.target.value }))}>
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
                <select disabled={busy} value={projectProfileDraft.discipline} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, discipline: event.target.value }))}>
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
                <select disabled={busy} value={projectProfileDraft.stage} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, stage: event.target.value }))}>
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
                <input disabled={busy} type="date" value={projectProfileDraft.deadline} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, deadline: event.target.value }))} />
              </label>
              <label className="is-wide">
                <span>研究方向</span>
                <input disabled={busy} value={projectProfileDraft.direction} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, direction: event.target.value }))} placeholder="一句话描述课题方向" />
              </label>
              <label className="is-wide">
                <span>基础说明</span>
                <textarea disabled={busy} value={projectProfileDraft.sourceNotes} onChange={(event) => setProjectProfileDraft((prev) => ({ ...prev, sourceNotes: event.target.value }))} placeholder="补充团队基础、学校场景、已有成果、数据来源或申报限制。" />
              </label>
            </div>
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="secondary-action" type="button" disabled={busy}>取消</Dialog.Close>
              <button type="button" className="primary-action create-action" onClick={() => void createProject()} disabled={busy || !projectName.trim()}>
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
