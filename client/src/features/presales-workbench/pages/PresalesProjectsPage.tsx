import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SectionId } from '../../../shared/types/navigation';
import type { PresalesProjectList, PresalesProjectListItem, PresalesProjectProfile, PresalesProjectState } from '../types';
import '../presalesWorkbench.css';

const emptyProfile: PresalesProjectProfile = {
  projectName: '',
  customerName: '',
  industry: '',
  currentStage: '线索识别',
  opportunitySource: '',
  expectedValue: '',
  decisionDate: '',
  owner: '',
  keyBackground: '',
};

interface PresalesProjectsPageProps {
  onNavigate: (section: SectionId) => void;
}

function getPresalesBridge() {
  const bridge = window.yibiao?.presalesWorkbench;
  if (!bridge) {
    throw new Error('售前项目本地服务未就绪，请重启客户端后重试。');
  }
  return bridge;
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '暂无';
}

function PresalesProjectsPage({ onNavigate }: PresalesProjectsPageProps) {
  const { showToast } = useToast();
  const [projectList, setProjectList] = useState<PresalesProjectList>({ activeProjectId: '', projects: [] });
  const [selectedProject, setSelectedProject] = useState<PresalesProjectState | null>(null);
  const [profileDraft, setProfileDraft] = useState<PresalesProjectProfile>(emptyProfile);
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState('');

  const filteredProjects = useMemo(() => {
    const value = keyword.trim().toLowerCase();
    if (!value) return projectList.projects;
    return projectList.projects.filter((project) => [
      project.name,
      project.customerName,
      project.industry,
      project.currentStage,
      project.owner,
      project.expectedValue,
      project.decisionDate,
    ].some((item) => String(item || '').toLowerCase().includes(value)));
  }, [keyword, projectList.projects]);

  useEffect(() => {
    let mounted = true;
    loadProjects()
      .catch((error) => {
        showToast(error instanceof Error ? error.message : String(error), 'error', { title: '售前项目加载失败' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  async function loadProjects(selectProjectId?: string) {
    const projects = await getPresalesBridge().listProjects();
    setProjectList(projects);
    const projectId = selectProjectId || projects.activeProjectId || projects.projects[0]?.id;
    if (projectId) {
      await selectProject(projectId, false);
    }
  }

  async function selectProject(projectId: string, makeActive = false) {
    const state = makeActive
      ? await getPresalesBridge().switchProject(projectId)
      : await getPresalesBridge().loadState(projectId);
    setSelectedProject(state);
    setProfileDraft(state.profile);
    setDeleteCandidateId('');
  }

  async function createProject() {
    setIsSaving(true);
    try {
      const result = await getPresalesBridge().createProject({ projectName: '未命名售前项目' });
      setProjectList(result.projects);
      setSelectedProject(result.state);
      setProfileDraft(result.state.profile);
      showToast('售前项目已创建，可在右侧补充资料', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '创建失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProject() {
    if (!selectedProject) return;
    setIsSaving(true);
    try {
      await getPresalesBridge().switchProject(selectedProject.projectId);
      const state = await getPresalesBridge().saveProfile(profileDraft);
      setSelectedProject(state);
      setProfileDraft(state.profile);
      await loadProjects(state.projectId);
      showToast('项目资料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function enterWorkbench(projectId: string) {
    try {
      if (selectedProject?.projectId === projectId) {
        await getPresalesBridge().switchProject(projectId);
        await getPresalesBridge().saveProfile(profileDraft);
      } else {
        await getPresalesBridge().switchProject(projectId);
      }
      onNavigate('presales-workbench');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '进入工作台失败' });
    }
  }

  async function deleteProject(projectId: string) {
    if (deleteCandidateId !== projectId) {
      setDeleteCandidateId(projectId);
      return;
    }
    setIsSaving(true);
    try {
      const result = await getPresalesBridge().deleteProject(projectId);
      setProjectList(result.projects);
      setSelectedProject(result.state);
      setProfileDraft(result.state.profile);
      setDeleteCandidateId('');
      showToast('售前项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '删除失败' });
    } finally {
      setIsSaving(false);
    }
  }

  function renderProjectCard(project: PresalesProjectListItem) {
    const isSelected = project.id === selectedProject?.projectId;
    const isDeleteCandidate = deleteCandidateId === project.id;
    return (
      <article className={`presales-project-card ${isSelected ? 'is-active' : ''}`} key={project.id}>
        <button type="button" onClick={() => enterWorkbench(project.id)} className="presales-project-card-main">
          <div>
            <strong>{project.name || '未命名售前项目'}</strong>
            <span>{project.customerName || '未填写客户'} · {project.currentStage || '未填写阶段'} · 点击进入工作台</span>
          </div>
          <em>{project.generatedCount}/5 输出</em>
        </button>
        <div className="presales-project-meta-grid">
          <span>负责人：{project.owner || '未填写'}</span>
          <span>行业：{project.industry || '未填写'}</span>
          <span>材料：{project.materialCount} 份</span>
          <span>更新：{formatDateTime(project.updated_at)}</span>
        </div>
        <div className="presales-project-card-actions">
          <button type="button" className="secondary-action" onClick={() => selectProject(project.id)}>编辑资料</button>
          <button type="button" className={`secondary-action ${isDeleteCandidate ? 'is-danger' : ''}`} onClick={() => deleteProject(project.id)} disabled={isSaving}>
            {isDeleteCandidate ? '确认删除' : '删除'}
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="presales-projects-page">
      <section className="presales-projects-hero">
        <div>
          <span className="section-kicker">售前项目</span>
          <h2>先管理项目，再进入售前工作台</h2>
          <p>这里专门负责创建、检索、修改、删除项目，并展示每个售前机会的客户、阶段、材料和输出进度。</p>
        </div>
        <button type="button" className="primary-action" onClick={createProject} disabled={isSaving}>
          新建售前项目
        </button>
      </section>

      <div className="presales-projects-layout">
        <section className="presales-projects-list-panel">
          <div className="presales-projects-list-head">
            <div>
              <span className="section-kicker">项目列表</span>
              <h3>{filteredProjects.length} 个项目</h3>
            </div>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目、客户、行业、负责人" />
          </div>
          <div className="presales-projects-list">
            {isLoading ? (
              <div className="presales-empty-material">
                <strong>正在加载项目</strong>
                <span>读取本地售前项目数据。</span>
              </div>
            ) : filteredProjects.length ? filteredProjects.map(renderProjectCard) : (
              <div className="presales-empty-material">
                <strong>没有匹配项目</strong>
                <span>可清空搜索词，或新建一个售前项目。</span>
              </div>
            )}
          </div>
        </section>

        <aside className="presales-project-detail-panel">
          <div className="presales-section-head">
            <div>
              <span className="section-kicker">项目元数据</span>
              <h3>{selectedProject?.profile.projectName || '选择一个项目'}</h3>
            </div>
          </div>
          {selectedProject ? (
            <>
              <div className="presales-project-summary-strip">
                <span>创建：{formatDateTime(selectedProject.created_at)}</span>
                <span>更新：{formatDateTime(selectedProject.updated_at)}</span>
                <span>材料：{selectedProject.materials.length} 份</span>
              </div>
              <div className="presales-form-grid is-project-detail">
                <label>
                  <span>项目名称</span>
                  <input value={profileDraft.projectName} onChange={(event) => setProfileDraft({ ...profileDraft, projectName: event.target.value })} placeholder="项目名称" />
                </label>
                <label>
                  <span>客户名称</span>
                  <input value={profileDraft.customerName} onChange={(event) => setProfileDraft({ ...profileDraft, customerName: event.target.value })} placeholder="客户单位或集团名称" />
                </label>
                <label>
                  <span>行业领域</span>
                  <input value={profileDraft.industry} onChange={(event) => setProfileDraft({ ...profileDraft, industry: event.target.value })} placeholder="政企、制造、医疗、教育等" />
                </label>
                <label>
                  <span>当前阶段</span>
                  <input value={profileDraft.currentStage} onChange={(event) => setProfileDraft({ ...profileDraft, currentStage: event.target.value })} placeholder="线索识别 / 需求调研 / 方案汇报" />
                </label>
                <label>
                  <span>机会来源</span>
                  <input value={profileDraft.opportunitySource} onChange={(event) => setProfileDraft({ ...profileDraft, opportunitySource: event.target.value })} placeholder="客户拜访、伙伴推荐、市场线索等" />
                </label>
                <label>
                  <span>负责人</span>
                  <input value={profileDraft.owner} onChange={(event) => setProfileDraft({ ...profileDraft, owner: event.target.value })} placeholder="售前负责人或跟进人" />
                </label>
                <label>
                  <span>预估价值</span>
                  <input value={profileDraft.expectedValue} onChange={(event) => setProfileDraft({ ...profileDraft, expectedValue: event.target.value })} placeholder="预算规模、战略价值或合作价值" />
                </label>
                <label>
                  <span>决策时间</span>
                  <input type="date" value={profileDraft.decisionDate} onChange={(event) => setProfileDraft({ ...profileDraft, decisionDate: event.target.value })} />
                </label>
                <label className="is-wide">
                  <span>背景摘要</span>
                  <textarea value={profileDraft.keyBackground} onChange={(event) => setProfileDraft({ ...profileDraft, keyBackground: event.target.value })} placeholder="记录客户背景、机会背景、已有沟通结论和关键上下文。" />
                </label>
              </div>
              <div className="presales-project-detail-actions">
                <button type="button" className="primary-action" onClick={saveProject} disabled={isSaving}>{isSaving ? '保存中...' : '保存修改'}</button>
                <button type="button" className="secondary-action presales-enter-workbench-button" onClick={() => enterWorkbench(selectedProject.projectId)} disabled={isSaving}>
                  进入该项目的售前工作台
                </button>
              </div>
            </>
          ) : (
            <div className="presales-empty-material">
              <strong>还没有选中项目</strong>
              <span>从左侧项目列表选择一个项目，或新建项目。</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default PresalesProjectsPage;
