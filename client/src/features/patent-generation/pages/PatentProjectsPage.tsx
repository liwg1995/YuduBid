import ProjectDetailsDrawer from '../../../shared/ui/ProjectDetailsDrawer';
import useDialogReturnFocus from '../../../shared/ui/useDialogReturnFocus';
import type { InputRef } from 'antd';
import { ProjectListEmpty, ProjectListHeader, ProjectListToolbar, ProjectListTable, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import WorkspaceLoadError from '../../../shared/ui/WorkspaceLoadError';
import { Button, Empty } from 'antd';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SectionId } from '../../../shared/types/navigation';
import type { PatentApplicationType, PatentWorkspaceProject, PatentWorkspaceProjectList } from '../types';
import '../patentGeneration.css';
import './modernPatentProjects.css';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';


interface Props { onNavigate: (section: SectionId) => void }

const stageLabel: Record<string, string> = {
  setup: '待准备', mining: '专利挖掘', disclosure: '交底书', 'prior-art': '查新增强', iteration: '修订迭代',
};
const typeLabel: Record<PatentApplicationType, string> = {
  invention: '发明', 'utility-model': '实用新型', design: '外观设计', unknown: '待确认',
};

function PatentProjectsPage({ onNavigate }: Props) {
  const { showToast } = useToast();
  const dialogFocus = useDialogReturnFocus();
  const [data, setData] = useState<PatentWorkspaceProjectList>({ activeProjectId: '', projects: [] });
  const [loading, setLoading] = useState(true);
  const projectSearchRef = useRef<InputRef>(null);
  const [keyword, setKeyword] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'create' | 'rename'; project?: PatentWorkspaceProject } | null>(null);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [applicationType, setApplicationType] = useState<PatentApplicationType>('invention');
  const [deleteTarget, setDeleteTarget] = useState<PatentWorkspaceProject | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = data.projects.find((project) => project.id === detailId);
  const [busy, setBusy] = useState('');
  const [operationError, setOperationError] = useState('');
  const loadErrorShown = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);

  async function refresh() {
    const api = window.yibiao?.patentGeneration;
    if (!api?.listProjects) throw new Error('专利项目服务尚未加载，请完全退出开发窗口后重新运行 npm run dev');
    const result = await api.listProjects();
    if (result) setData(result);
  }

  useEffect(() => {
    setLoading(true); setLoadError('');
    refresh().catch((error) => {
      setLoadError(error instanceof Error ? error.message : String(error));
      if (loadErrorShown.current) return;
      loadErrorShown.current = true;
      showToast(error instanceof Error ? error.message : '读取专利项目失败', 'error');
    }).finally(() => setLoading(false));
  }, [showToast, loadRevision]);

  const visible = useMemo(() => data.projects.filter((project) => {
    if (!showArchived && project.archived) return false;
    const needle = keyword.trim().toLowerCase();
    return !needle || [project.name, project.caseName, project.topic, project.selectedPatentTitle].some((value) => value.toLowerCase().includes(needle));
  }), [data.projects, keyword, showArchived]);

  async function enter(project: PatentWorkspaceProject) {
    if (busy) return;
    setOperationError('');
    setBusy(project.id);
    try {
      await window.yibiao?.patentGeneration.switchProject(project.id);
      setDetailId(null);
      onNavigate('patent-mining');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error)); showToast(error instanceof Error ? error.message : '进入专利项目失败', 'error'); }
    finally { setBusy(''); }
  }

  async function submit() {
    if (!editor || !name.trim() || busy) return;
    setOperationError('');
    setBusy(editor.project?.id || 'new');
    try {
      if (editor.mode === 'create') {
        const api = window.yibiao?.patentGeneration;
        if (!api?.createProject) throw new Error('专利项目服务尚未加载，请完全退出开发窗口后重新运行 npm run dev');
        const result = await api.createProject({ name: name.trim(), caseName: name.trim(), topic: topic.trim(), applicationType });
        if (!result?.project?.id) throw new Error('专利项目创建失败，请重新启动客户端后再试');
        showToast('专利项目已创建', 'success');
        onNavigate('patent-mining');
      } else if (editor.project) {
        const result = await window.yibiao?.patentGeneration.renameProject({ id: editor.project.id, name: name.trim() });
        if (result) setData(result);
        showToast('项目名称已更新', 'success');
      }
      setEditor(null);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error)); showToast(error instanceof Error ? error.message : '项目操作失败', 'error'); }
    finally { setBusy(''); }
  }

  async function toggleArchive(project: PatentWorkspaceProject) {
    if (busy) return;
    setOperationError('');
    setBusy(project.id);
    try {
      const result = await window.yibiao?.patentGeneration.archiveProject({ id: project.id, archived: !project.archived });
      if (result) setData(result);
      showToast(project.archived ? '项目已恢复' : '项目已归档', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error)); showToast(error instanceof Error ? error.message : '项目操作失败', 'error'); }
    finally { setBusy(''); }
  }

  async function removeProject() {
    if (!deleteTarget || busy) return;
    setOperationError('');
    setBusy(deleteTarget.id);
    try {
      const result = await window.yibiao?.patentGeneration.deleteProject(deleteTarget.id);
      if (result) setData(result);
      setDeleteTarget(null);
      showToast('专利项目已删除', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error)); showToast(error instanceof Error ? error.message : '删除专利项目失败', 'error'); }
    finally { setBusy(''); }
  }

  const activeCount = data.projects.filter((item) => !item.archived).length;
  const draftCount = data.projects.reduce((sum, item) => sum + item.draftCount, 0);

  if (loadError) return <WorkspaceLoadError message={loadError} onRetry={() => setLoadRevision(value => value + 1)} />;

  return <main className={getStoredUiAppearance() === 'modern' ? 'modern-patent-projects' : 'patent-projects-page'}>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
    {getStoredUiAppearance() === 'modern' ? <>
      <ProjectListHeader title="专利项目" description="案件资料、候选专利点和交底书按项目独立保存。" actions={<button type="button" className="primary-action" onClick={() => { setOperationError(''); setName(''); setTopic(''); setApplicationType('invention'); dialogFocus.rememberTrigger(); setEditor({ mode: 'create' }); }}>新建项目</button>} />
      <ProjectListToolbar inputRef={projectSearchRef} query={keyword} onQueryChange={setKeyword} label="搜索专利项目" placeholder="搜索项目、案件或技术主题" count={`${visible.length} / ${data.projects.length} 个项目`}><label><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />显示已归档</label></ProjectListToolbar>
      <div className="yb-project-list-summary"><span>进行中 {activeCount}</span><span>交底书草稿 {draftCount}</span></div>
      <EnterpriseUiProvider>
        <div className="modern-patent-table">
          <ProjectListTable<PatentWorkspaceProject> rowKey="id" loading={loading} dataSource={visible}
            pagination={{ hideOnSinglePage: true, defaultPageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 个项目` }}
            scroll={{ x: 1000 }} locale={{ emptyText: <ProjectListEmpty subject="专利项目" filtered={Boolean(keyword.trim())} disabled={Boolean(busy)} onReset={() => { setKeyword(''); requestAnimationFrame(() => projectSearchRef.current?.focus()); }} onCreate={() => { setOperationError(''); setName(''); setTopic(''); setApplicationType('invention'); dialogFocus.rememberTrigger(); setEditor({ mode: 'create' }); }} /> }}
            columns={[
              { title: '项目名称', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name, 'zh-CN'), render: (_, project) => <div className="yb-project-list-name"><button type="button" onClick={() => { setOperationError(''); setDetailId(project.id); }}>{project.name}</button></div> },
              { title: '类型', width: 100, dataIndex: 'applicationType', filters: Object.entries(typeLabel).map(([value, text]) => ({ value, text })), onFilter: (value, project) => project.applicationType === value, render: (value: PatentApplicationType) => typeLabel[value] },
              { title: '阶段', width: 120, dataIndex: 'stage', filters: Object.entries(stageLabel).map(([value, text]) => ({ value, text })), onFilter: (value, project) => project.stage === value, render: (_, project) => project.archived ? '已归档' : stageLabel[project.stage] },
              { title: '交底书', width: 100, dataIndex: 'draftCount', align: 'right', sorter: (a, b) => a.draftCount - b.draftCount },
              { title: '更新时间', width: 180, dataIndex: 'updated_at', defaultSortOrder: 'descend', sorter: (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at), render: formatProjectListTime },
              { title: '操作', key: 'actions', width: 180, fixed: 'right', render: (_, project) => <ProjectListActions name={project.name} disabled={Boolean(busy)} onEnter={project.archived ? undefined : () => void enter(project)} items={[
                { key: 'detail', label: '查看详情', onClick: () => setDetailId(project.id) },
                { key: 'rename', label: '重命名', onClick: () => { setOperationError(''); setName(project.name); dialogFocus.rememberTrigger(); setEditor({ mode: 'rename', project }); } },
                { key: 'archive', label: project.archived ? '恢复项目' : '归档项目', onClick: () => void toggleArchive(project) },
                { key: 'delete', label: '删除项目', danger: true, onClick: () => setDeleteTarget(project) },
              ]} /> },
            ]} />
        </div>
        <ProjectDetailsDrawer open={Boolean(detail)} onClose={() => setDetailId(null)} enterDisabled={Boolean(busy) || detail?.archived} entering={Boolean(busy)} error={operationError}
          onEnter={detail ? () => void enter(detail) : undefined} items={detail ? [
            { key: 'name', label: '项目名称', children: detail.name },
            { key: 'topic', label: '技术主题', children: detail.topic || detail.selectedPatentTitle || '待填写' },
            { key: 'type', label: '申请类型', children: typeLabel[detail.applicationType] },
            { key: 'stage', label: '当前阶段', children: stageLabel[detail.stage] },
            { key: 'state', label: '项目状态', children: detail.archived ? '已归档' : '进行中' },
            { key: 'count', label: '候选专利点 / 交底书', children: `${detail.candidateCount} / ${detail.draftCount}` },
            { key: 'updated', label: '更新时间', children: new Date(detail.updated_at).toLocaleString('zh-CN') },
          ] : []} />
      </EnterpriseUiProvider>
    </> : <>
    <header className="patent-projects-header">
      <div><span>专利生成</span><h1>专利项目</h1><p>每个项目独立保存案件资料、候选专利点、交底书和修订版本。</p></div>
      <button className="patent-projects-primary create-action" onClick={() => { setOperationError(''); setName(''); setTopic(''); setApplicationType('invention'); dialogFocus.rememberTrigger(); setEditor({ mode: 'create' }); }}>创建专利项目</button>
    </header>
    <section className="patent-projects-toolbar">
      <div className="patent-projects-stats"><strong>{activeCount}</strong><span>进行中的项目</span><strong>{draftCount}</strong><span>交底书草稿</span></div>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目、案件或技术主题" aria-label="搜索专利项目" />
      <label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />显示已归档</label>
    </section>
    <section className="patent-projects-grid">
      {loading ? <div className="patent-projects-empty">正在读取专利项目…</div> : visible.map((project) => <article className={`patent-project-card${project.id === data.activeProjectId ? ' is-active' : ''}${project.archived ? ' is-archived' : ''}`} key={project.id}>
        <div className="patent-project-card-top"><span>{typeLabel[project.applicationType]}</span><small>{stageLabel[project.stage]}</small></div>
        <h2>{project.name}</h2>
        <p>{project.topic || project.selectedPatentTitle || '尚未填写技术主题，进入项目后即可完善。'}</p>
        <div className="patent-project-card-metrics"><span><strong>{project.candidateCount}</strong> 候选专利点</span><span><strong>{project.draftCount}</strong> 交底书版本</span></div>
        <time>更新于 {new Date(project.updated_at).toLocaleString('zh-CN', { hour12: false })}</time>
        <div className="patent-project-card-actions">
          {!project.archived && <button className="is-enter" disabled={busy === project.id} onClick={() => enter(project)}>{busy === project.id ? '处理中…' : '进入项目'}</button>}
          <button onClick={() => { setOperationError(''); setName(project.name); dialogFocus.rememberTrigger(); setEditor({ mode: 'rename', project }); }}>重命名</button>
          <button onClick={() => toggleArchive(project)}>{project.archived ? '恢复' : '归档'}</button>
          <button className="is-danger" onClick={() => { setOperationError(''); setDeleteTarget(project); }}>删除</button>
        </div>
      </article>)}
      {!loading && visible.length === 0 && <div className="patent-projects-empty"><strong>{data.projects.length ? '没有符合条件的项目' : '从一个专利项目开始'}</strong><span>创建后，专利挖掘到交底书修订的全部资料都会归入该项目。</span><button className="create-action" onClick={() => { setOperationError(''); setName(''); setTopic(''); setApplicationType('invention'); dialogFocus.rememberTrigger(); setEditor({ mode: 'create' }); }}>创建专利项目</button></div>}
    </section>

    </>}
    <Dialog.Root open={Boolean(editor)} onOpenChange={(open) => !open && !busy && setEditor(null)}><Dialog.Portal><Dialog.Overlay className="patent-project-dialog-overlay" /><Dialog.Content {...dialogFocus.focusProps} className="patent-project-dialog" aria-busy={Boolean(busy)} onEscapeKeyDown={Boolean(busy) ? event => event.preventDefault() : undefined} onPointerDownOutside={Boolean(busy) ? event => event.preventDefault() : undefined}>
      <Dialog.Title>{editor?.mode === 'rename' ? '重命名项目' : '创建专利项目'}</Dialog.Title>
      <Dialog.Description>{editor?.mode === 'rename' ? '项目内的案件资料不会改变。' : '先建立项目，再进入专利挖掘及后续步骤。'}</Dialog.Description>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
      <label>项目名称<input disabled={Boolean(busy)} autoFocus value={name} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} onChange={(event) => setName(event.target.value)} placeholder="例如：无限画布并行生成专利" /></label>
      {editor?.mode === 'create' && <><label>技术主题（可稍后填写）<input disabled={Boolean(busy)} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="用一句话描述核心技术" /></label><label>申请类型<select disabled={Boolean(busy)} value={applicationType} onChange={(event) => setApplicationType(event.target.value as PatentApplicationType)}><option value="invention">发明</option><option value="utility-model">实用新型</option><option value="design">外观设计</option></select></label></>}
      <div className="patent-project-dialog-actions"><Dialog.Close asChild><button type="button" disabled={Boolean(busy)}>取消</button></Dialog.Close><button className={`is-primary${editor?.mode === 'create' ? ' create-action' : ''}`} disabled={!name.trim() || Boolean(busy)} onClick={submit}>{busy ? (editor?.mode === 'rename' ? '保存中…' : '创建中…') : editor?.mode === 'rename' ? '保存名称' : '创建并进入'}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>

    <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}><Dialog.Portal><Dialog.Overlay className="patent-project-dialog-overlay" /><Dialog.Content className="patent-project-dialog" aria-busy={Boolean(busy)} onEscapeKeyDown={Boolean(busy) ? event => event.preventDefault() : undefined} onPointerDownOutside={Boolean(busy) ? event => event.preventDefault() : undefined}>
      <Dialog.Title>删除专利项目？</Dialog.Title><Dialog.Description>“{deleteTarget?.name}”的案件资料、交底书和修订记录将一并删除，此操作无法撤销。</Dialog.Description>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
      <div className="patent-project-dialog-actions"><Dialog.Close asChild><button type="button" disabled={Boolean(busy)}>取消</button></Dialog.Close><button className="is-danger" disabled={Boolean(busy)} onClick={removeProject}>{busy ? '删除中…' : '确认删除'}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </main>;
}

export default PatentProjectsPage;
