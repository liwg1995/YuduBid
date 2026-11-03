import ProjectDetailsDrawer from '../../../shared/ui/ProjectDetailsDrawer';
import ProjectDeleteDialog from '../../../shared/ui/ProjectDeleteDialog';
import type { InputRef } from 'antd';
import { ProjectListEmpty, ProjectListHeader, ProjectListToolbar, ProjectListTable, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import CollectionPagination from '../../../shared/ui/CollectionPagination';
import WorkspaceLoadError from '../../../shared/ui/WorkspaceLoadError';
import { useRef, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SectionId } from '../../../shared/types/navigation';
import type { PresalesProjectList, PresalesProjectListItem, PresalesProjectProfile, PresalesProjectState } from '../types';
import '../presalesWorkbench.css';
import './modernPresalesProjects.css';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';

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
  const projectSearchRef = useRef<InputRef>(null);
  const [keyword, setKeyword] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = projectList.projects.find(project => project.id === detailId);
  const [listPage, setListPage] = useState(1);
  useEffect(() => setListPage(1), [keyword]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
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
    setLoadError(''); setIsLoading(true);
    let mounted = true;
    loadProjects()
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : String(error)); showToast(error instanceof Error ? error.message : String(error), 'error', { title: '售前项目加载失败' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast, loadRevision]);

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
    if (isSaving) return;
    setOperationError(''); setIsSaving(true);
    try {
      const result = await getPresalesBridge().createProject({ projectName: '未命名售前项目' });
      setProjectList(result.projects);
      setSelectedProject(result.state);
      setProfileDraft(result.state.profile);
      showToast('售前项目已创建，可在右侧补充资料', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '创建失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProject() {
    if (!selectedProject || isSaving) return;
    setOperationError(''); setIsSaving(true);
    try {
      await getPresalesBridge().switchProject(selectedProject.projectId);
      const state = await getPresalesBridge().saveProfile(profileDraft);
      setSelectedProject(state);
      setProfileDraft(state.profile);
      await loadProjects(state.projectId);
      showToast('项目资料已保存', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function enterWorkbench(projectId: string) {
    if (isSaving) return;
    setIsSaving(true); setOperationError('');
    try {
      if (selectedProject?.projectId === projectId) {
        await getPresalesBridge().switchProject(projectId);
        await getPresalesBridge().saveProfile(profileDraft);
      } else {
        await getPresalesBridge().switchProject(projectId);
      }
      setDetailId(null);
      onNavigate('presales-workbench');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '进入工作台失败' });
    } finally { setIsSaving(false); }
  }

  async function deleteProject(projectId: string) {
    if (isSaving) return;
    if (deleteCandidateId !== projectId) {
      setOperationError('');
      setDeleteCandidateId(projectId);
      return;
    }
    setOperationError(''); setIsSaving(true);
    try {
      const result = await getPresalesBridge().deleteProject(projectId);
      setProjectList(result.projects);
      setSelectedProject(result.state);
      setProfileDraft(result.state.profile);
      setDeleteCandidateId('');
      showToast('售前项目已删除', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
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
            删除
          </button>
        </div>
      </article>
    );
  }

  const currentPage = Math.min(listPage, Math.max(1, Math.ceil(filteredProjects.length / 20)));
  const pageItems = filteredProjects.slice((currentPage - 1) * 20, currentPage * 20);

  if (loadError) return <WorkspaceLoadError message={loadError} onRetry={() => setLoadRevision(value => value + 1)} />;

  if (getStoredUiAppearance() === 'modern') return <div className="modern-presales-projects">
    {operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}<ProjectListHeader title="售前项目" description="选择项目，整理客户背景并进入售前工作台。" actions={<button type="button" className="primary-action" onClick={() => void createProject()} disabled={isSaving}>新建项目</button>} />
    <ProjectListToolbar inputRef={projectSearchRef} query={keyword} onQueryChange={setKeyword} placeholder="搜索项目、客户或行业" count={`${filteredProjects.length} / ${projectList.projects.length} 个项目`} />
    <div className="modern-presales-projects-layout"><section className="modern-presales-project-list" aria-label="售前项目列表"><div className="modern-presales-project-list-body"><ProjectListTable<PresalesProjectListItem> loading={isLoading} dataSource={pageItems} pagination={false} scroll={{ x: 600 }} columns={[
      { title: '项目名称', render: (_, project) => <div className="yb-project-list-name"><button type="button" disabled={isSaving} onClick={() => { setOperationError(''); setDetailId(project.id); }}>{project.name || '未命名售前项目'}</button><small>{project.customerName || '客户待填写'} · {project.currentStage || '阶段待填写'}</small><small>{project.industry || '行业待填写'} · {project.materialCount} 份材料 · {project.generatedCount}/5 输出{project.id === selectedProject?.projectId ? ' · 当前编辑' : ''}</small></div> },
      { title: '最近更新', dataIndex: 'updated_at', width: 180, render: formatProjectListTime },
      { title: '操作', width: 180, fixed: 'right', render: (_, project) => <ProjectListActions name={project.name} disabled={isSaving} onEnter={() => void enterWorkbench(project.id)} items={[{ key: 'edit', label: '编辑资料', onClick: () => void selectProject(project.id) }, { key: 'delete', label: '删除项目', danger: true, onClick: () => void deleteProject(project.id) }]} /> },
    ]} locale={{ emptyText: <ProjectListEmpty subject="售前项目" filtered={Boolean(keyword.trim())} disabled={isSaving} onReset={() => { setKeyword(''); requestAnimationFrame(() => projectSearchRef.current?.focus()); }} onCreate={() => void createProject()} /> }} /></div></section>
    <main className="modern-presales-project-editor"><div className="modern-presales-editor-head"><span>项目资料</span><strong>{selectedProject?.profile.projectName || '选择一个项目'}</strong>{selectedProject && <small>{selectedProject.materials.length} 份材料 · 更新于 {formatDateTime(selectedProject.updated_at)}</small>}</div>{selectedProject ? <><div className="modern-presales-editor-fields">{([{ key:'projectName', label:'项目名称', placeholder:'项目名称' }, { key:'customerName', label:'客户名称', placeholder:'客户单位或集团名称' }, { key:'industry', label:'行业领域', placeholder:'政企、制造、医疗等' }, { key:'currentStage', label:'当前阶段', placeholder:'线索识别 / 需求调研' }, { key:'opportunitySource', label:'机会来源', placeholder:'客户拜访、伙伴推荐等' }, { key:'owner', label:'负责人', placeholder:'售前负责人' }, { key:'expectedValue', label:'预估价值', placeholder:'预算或合作价值' }, { key:'decisionDate', label:'决策时间', placeholder:'' }] as const).map((field) => <label key={field.key}><span>{field.label}</span><input disabled={isSaving} type={field.key === 'decisionDate' ? 'date' : 'text'} value={profileDraft[field.key]} onChange={(event) => setProfileDraft({ ...profileDraft, [field.key]: event.target.value })} placeholder={field.placeholder} /></label>)}<label className="is-wide"><span>背景摘要</span><textarea disabled={isSaving} value={profileDraft.keyBackground} onChange={(event) => setProfileDraft({ ...profileDraft, keyBackground: event.target.value })} placeholder="记录客户背景、沟通结论和关键上下文" /></label></div><div className="modern-presales-editor-actions"><button type="button" onClick={() => void saveProject()} disabled={isSaving}>{isSaving ? '保存中…' : '保存修改'}</button><button type="button" onClick={() => void enterWorkbench(selectedProject.projectId)} disabled={isSaving}>进入售前工作台 →</button></div></> : <div className="modern-presales-empty"><strong>还没有选中项目</strong><p>从项目列表选择，或创建一个项目。</p></div>}</main></div>
  <ProjectDeleteDialog name={projectList.projects.find(project => project.id === deleteCandidateId)?.name} description="项目资料、材料与已生成的售前成果将被删除，此操作无法撤销。" busy={isSaving} error={operationError} onCancel={() => setDeleteCandidateId('')} onConfirm={() => void deleteProject(deleteCandidateId)} /><CollectionPagination page={currentPage} total={filteredProjects.length} onChange={setListPage} /><ProjectDetailsDrawer open={Boolean(detail)} onClose={() => setDetailId(null)} enterDisabled={isSaving} entering={isSaving} error={operationError}
      onEnter={detail ? () => void enterWorkbench(detail.id) : undefined} items={detail ? [
        { key: 'name', label: '项目名称', children: detail.name },
        { key: 'client', label: '客户', children: detail.customerName || '待填写' },
        { key: 'industry', label: '行业领域', children: detail.industry || '待填写' },
        { key: 'stage', label: '当前阶段', children: detail.currentStage || '待填写' },
        { key: 'materials', label: '资料与输出', children: `${detail.materialCount} 份材料 · ${detail.generatedCount} 份输出` },
        { key: 'updated', label: '更新时间', children: formatProjectListTime(detail.updated_at) },
      ] : []} /></div>;

  return (
    <div className="presales-projects-page">{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
      <section className="presales-projects-hero">
        <div>
          <span className="section-kicker">售前项目</span>
          <h2>先管理项目，再进入售前工作台</h2>
          <p>这里专门负责创建、检索、修改、删除项目，并展示每个售前机会的客户、阶段、材料和输出进度。</p>
        </div>
        <button type="button" className="primary-action create-action" onClick={createProject} disabled={isSaving}>
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
            ) : filteredProjects.length ? pageItems.map(renderProjectCard) : (
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
                  <input disabled={isSaving} value={profileDraft.projectName} onChange={(event) => setProfileDraft({ ...profileDraft, projectName: event.target.value })} placeholder="项目名称" />
                </label>
                <label>
                  <span>客户名称</span>
                  <input disabled={isSaving} value={profileDraft.customerName} onChange={(event) => setProfileDraft({ ...profileDraft, customerName: event.target.value })} placeholder="客户单位或集团名称" />
                </label>
                <label>
                  <span>行业领域</span>
                  <input disabled={isSaving} value={profileDraft.industry} onChange={(event) => setProfileDraft({ ...profileDraft, industry: event.target.value })} placeholder="政企、制造、医疗、教育等" />
                </label>
                <label>
                  <span>当前阶段</span>
                  <input disabled={isSaving} value={profileDraft.currentStage} onChange={(event) => setProfileDraft({ ...profileDraft, currentStage: event.target.value })} placeholder="线索识别 / 需求调研 / 方案汇报" />
                </label>
                <label>
                  <span>机会来源</span>
                  <input disabled={isSaving} value={profileDraft.opportunitySource} onChange={(event) => setProfileDraft({ ...profileDraft, opportunitySource: event.target.value })} placeholder="客户拜访、伙伴推荐、市场线索等" />
                </label>
                <label>
                  <span>负责人</span>
                  <input disabled={isSaving} value={profileDraft.owner} onChange={(event) => setProfileDraft({ ...profileDraft, owner: event.target.value })} placeholder="售前负责人或跟进人" />
                </label>
                <label>
                  <span>预估价值</span>
                  <input disabled={isSaving} value={profileDraft.expectedValue} onChange={(event) => setProfileDraft({ ...profileDraft, expectedValue: event.target.value })} placeholder="预算规模、战略价值或合作价值" />
                </label>
                <label>
                  <span>决策时间</span>
                  <input type="date" value={profileDraft.decisionDate} onChange={(event) => setProfileDraft({ ...profileDraft, decisionDate: event.target.value })} />
                </label>
                <label className="is-wide">
                  <span>背景摘要</span>
                  <textarea disabled={isSaving} value={profileDraft.keyBackground} onChange={(event) => setProfileDraft({ ...profileDraft, keyBackground: event.target.value })} placeholder="记录客户背景、机会背景、已有沟通结论和关键上下文。" />
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
      <ProjectDeleteDialog name={projectList.projects.find(project => project.id === deleteCandidateId)?.name} description="项目资料、材料与已生成的售前成果将被删除，此操作无法撤销。" busy={isSaving} error={operationError} onCancel={() => setDeleteCandidateId('')} onConfirm={() => void deleteProject(deleteCandidateId)} /><CollectionPagination page={currentPage} total={filteredProjects.length} onChange={setListPage} />
    </div>
  );
}

export default PresalesProjectsPage;
