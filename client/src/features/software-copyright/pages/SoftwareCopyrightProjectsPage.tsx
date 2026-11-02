import ProjectDetailsDrawer from '../../../shared/ui/ProjectDetailsDrawer';
import useDialogReturnFocus from '../../../shared/ui/useDialogReturnFocus';
import { AsyncDialogRoot, AsyncDialogContent, AsyncDialogClose } from '../../../shared/ui/AsyncDialog';
import '../components/softwareProjectDialogs.css';
import type { InputRef } from 'antd';
import { ProjectListEmpty, ProjectListHeader, ProjectListToolbar, ProjectListTable, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import CollectionPagination from '../../../shared/ui/CollectionPagination';
import WorkspaceLoadError from '../../../shared/ui/WorkspaceLoadError';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import type { SoftwareCopyrightCase, SoftwareCopyrightCaseList } from '../types';
import './modernSoftwareProjects.css';

interface SoftwareCopyrightProjectsPageProps {
  onEnterProject: () => void;
}

type ProjectEditor =
  | { mode: 'create'; project?: undefined }
  | { mode: 'rename' | 'duplicate'; project: SoftwareCopyrightCase };

const stepLabels: Record<SoftwareCopyrightCase['step'], string> = {
  setup: '资料准备',
  generating: '正在生成',
  draft: '草稿校核',
  exporting: '正在导出',
  result: '已形成成果',
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function SoftwareCopyrightProjectsPage({ onEnterProject }: SoftwareCopyrightProjectsPageProps) {
  const { showToast } = useToast();
  const dialogFocus = useDialogReturnFocus();
  const [projectList, setProjectList] = useState<SoftwareCopyrightCaseList>({ activeCaseId: '', cases: [] });
  const projectSearchRef = useRef<InputRef>(null);
  const [keyword, setKeyword] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = projectList.cases.find(project => project.id === detailId);
  const [listPage, setListPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  useEffect(() => setListPage(1), [keyword, includeArchived]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [operationError, setOperationError] = useState('');
  const [createdCaseId, setCreatedCaseId] = useState('');
  const [editor, setEditor] = useState<ProjectEditor | null>(null);
  const [projectName, setProjectName] = useState('');
  const [softwareName, setSoftwareName] = useState('');
  const [version, setVersion] = useState('V1.0');
  const [archiveTarget, setArchiveTarget] = useState<SoftwareCopyrightCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SoftwareCopyrightCase | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const visibleProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return projectList.cases.filter((project) => {
      if (!includeArchived && project.archived) return false;
      if (!normalizedKeyword) return true;
      return [project.name, project.softwareName, project.version, project.projectPath, stepLabels[project.step]]
        .some((value) => String(value || '').toLowerCase().includes(normalizedKeyword));
    });
  }, [includeArchived, keyword, projectList.cases]);

  const activeCount = projectList.cases.filter((project) => !project.archived).length;
  const completedCount = projectList.cases.filter((project) => !project.archived && (project.draftConfirmed || project.step === 'result')).length;
  const sourceReadyCount = projectList.cases.filter((project) => !project.archived && Boolean(project.projectPath)).length;

  useEffect(() => {
    setLoadError(''); setLoading(true);
    let mounted = true;
    window.yibiao?.softwareCopyright.listCases(true)
      .then((result) => {
        if (mounted && result) setProjectList(result);
      })
      .catch((error) => { setLoadError(error instanceof Error ? error.message : String(error)); showToast(error instanceof Error ? error.message : '读取软著项目失败', 'error'); })
      .finally(() => {
        if (mounted) setLoading(false);
      });
  return () => {
      mounted = false;
    };
  }, [showToast, loadRevision]);

  function openEditor(mode: ProjectEditor['mode'], project?: SoftwareCopyrightCase) {
    if (busyId) return;
    dialogFocus.rememberTrigger();
    setOperationError('');
    if (mode === 'create') {
      setCreatedCaseId(''); setOperationError('');
      setEditor({ mode });
      setProjectName('');
      setSoftwareName('');
      setVersion('V1.0');
      return;
    }
    if (!project) return;
    setEditor({ mode, project });
    setProjectName(mode === 'duplicate' ? `${project.name} 副本` : project.name);
  }

  async function submitEditor() {
    const name = projectName.trim();
    if (!name || !editor || busyId) return;
    setOperationError(''); setBusyId(editor.project?.id || 'new');
    try {
      if (editor.mode === 'create') {
        const result = createdCaseId ? await window.yibiao?.softwareCopyright.switchCase(createdCaseId) : await window.yibiao?.softwareCopyright.createCase({ name });
        if (!result) throw new Error('软著项目服务尚未就绪');
        setProjectList(result.cases); setCreatedCaseId(result.cases.activeCaseId);
        if (createdCaseId && result.cases.cases.find((item) => item.id === createdCaseId)?.name !== name) {
          const renamed = await window.yibiao?.softwareCopyright.renameCase({ id: createdCaseId, name });
          if (!renamed) throw new Error('软著项目服务尚未就绪');
          setProjectList(renamed.cases);
        }
        if (softwareName.trim() || version.trim()) {
          await window.yibiao?.softwareCopyright.saveFields({
            softwareName: softwareName.trim(),
            version: version.trim() || 'V1.0',
          });
        }
        const cases = await window.yibiao?.softwareCopyright.listCases(true);
        if (cases) setProjectList(cases);
        setEditor(null);
        showToast('软著项目已创建', 'success');
        onEnterProject();
        return;
      }
      if (editor.mode === 'rename') {
        const result = await window.yibiao?.softwareCopyright.renameCase({ id: editor.project.id, name });
        if (result) setProjectList(result.cases);
        setEditor(null);
        showToast('项目名称已更新', 'success');
        return;
      }
      const result = await window.yibiao?.softwareCopyright.duplicateCase({ id: editor.project.id, name });
      if (result) setProjectList(result.cases);
      setEditor(null);
      showToast('项目副本已创建', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '项目操作失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function enterProject(project: SoftwareCopyrightCase) {
    if (busyId) return;
    setOperationError(''); setBusyId(project.id);
    try {
      // 当前项目无需重复切换；运行中的后台任务也应能重新进入查看。
      console.info('[soft-project-enter] start', { current: project.id === projectList.activeCaseId });
      if (project.id !== projectList.activeCaseId) {
        const bridge = window.yibiao?.softwareCopyright;
        if (!bridge) throw new Error('软著项目服务不可用，请重启客户端后重试');
        const result = await bridge.switchCase(project.id);
        if (!result) throw new Error('项目切换未返回结果，请重试');
      }
      setDetailId(null);
      onEnterProject();
      console.info('[soft-project-enter] workbench requested');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      console.error('[soft-project-enter] failed', error);
      showToast(error instanceof Error ? error.message : '进入软著项目失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function changeArchive(project: SoftwareCopyrightCase, archived: boolean) {
    if (busyId) return;
    setOperationError(''); setBusyId(project.id);
    try {
      const result = await window.yibiao?.softwareCopyright.setCaseArchived({ id: project.id, archived });
      if (result) setProjectList(result.cases);
      setArchiveTarget(null);
      showToast(archived ? '项目已归档，可随时恢复' : '项目已恢复', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '更新项目状态失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function deleteProject() {
    if (!deleteTarget || busyId || deleteConfirmName.trim() !== deleteTarget.name) return;
    setOperationError(''); setBusyId(deleteTarget.id);
    try {
      const result = await window.yibiao?.softwareCopyright.deleteCase(deleteTarget.id);
      if (result) setProjectList(result.cases);
      setDeleteTarget(null);
      setDeleteConfirmName('');
      showToast('软著项目已永久删除', 'success');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
      showToast(error instanceof Error ? error.message : '删除软著项目失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  function openDeleteDialog(project: SoftwareCopyrightCase) {
    setDeleteTarget(project);
    setDeleteConfirmName('');
  }

  const currentPage = Math.min(listPage, Math.max(1, Math.ceil(visibleProjects.length / 20)));
  const pageItems = visibleProjects.slice((currentPage - 1) * 20, currentPage * 20);

  if (loadError) return <WorkspaceLoadError message={loadError} onRetry={() => setLoadRevision(value => value + 1)} />;

  return (
    <div className={`software-copyright-projects-page${getStoredUiAppearance() === 'modern' ? ' modern-software-projects' : ''}`}>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
      {getStoredUiAppearance() === 'modern' ? <ProjectListHeader title="软著项目" description="每个软件单独保存源码分析、登记信息、生成材料和导出成果。" actions={<button type="button" className="primary-action" onClick={() => openEditor('create')} disabled={Boolean(busyId)}>新建项目</button>} /> : (      <section className="software-copyright-projects-hero">
        <div>
          <span className="section-kicker">软件著作</span>
          <h2>软著项目管理</h2>
          <p>每个软件单独保存源码分析、登记信息、操作手册、代码材料、版本记录和导出成果。</p>
        </div>
        <button type="button" className="primary-action create-action" onClick={() => openEditor('create')} disabled={Boolean(busyId)}>
          新建软著项目
        </button>
      </section>) }

      <section className="software-copyright-projects-overview" aria-label="软著项目概览">
        <article><span>进行中项目</span><strong>{activeCount}</strong></article>
        <article><span>已确认或完成</span><strong>{completedCount}</strong></article>
        <article><span>已关联源码</span><strong>{sourceReadyCount}</strong></article>
      </section>

      <section className="software-copyright-projects-panel">
        {getStoredUiAppearance() === 'modern' ? <ProjectListToolbar inputRef={projectSearchRef} query={keyword} onQueryChange={setKeyword} label="搜索软著项目" placeholder="搜索项目、软件名称、版本或源码路径" count={`${visibleProjects.length} / ${projectList.cases.length} 个项目`}><label><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />显示已归档</label></ProjectListToolbar> : (        <div className="software-copyright-projects-toolbar">
          <div>
            <span className="section-kicker">项目列表</span>
            <h3>{visibleProjects.length} 个项目</h3>
          </div>
          <div className="software-copyright-projects-filters">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目、软件名称、版本或源码路径" aria-label="搜索软著项目" />
            <label>
              <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
              显示已归档
            </label>
          </div>
        </div>
) }

        <div className="software-copyright-project-grid">
          {getStoredUiAppearance() === 'modern' ? <ProjectListTable<SoftwareCopyrightCase> scroll={{ x: 1160 }} loading={loading} dataSource={pageItems} pagination={false} columns={[
            { title: '项目名称', render: (_, project) => <div className="yb-project-list-name"><button type="button" onClick={() => { setOperationError(''); setDetailId(project.id); }}>{project.name}</button><small>{project.softwareName || '尚未填写软件全称'} · {project.version || 'V1.0'}{project.id === projectList.activeCaseId ? ' · 当前项目' : ''}</small></div> },
            { title: '当前阶段', width: 130, render: (_, project) => project.archived ? '已归档' : project.draftConfirmed ? '材料已确认' : stepLabels[project.step] },
            { title: '最近更新', dataIndex: 'updatedAt', width: 180, render: formatProjectListTime },
            { title: '创建时间', dataIndex: 'createdAt', width: 180, render: formatProjectListTime },
            { title: '源码目录', dataIndex: 'projectPath', width: 200, ellipsis: true, render: (value: string) => <span title={value}>{value || '尚未关联源码'}</span> },
            { title: '操作', width: 180, fixed: 'right', render: (_, project) => <ProjectListActions name={project.name} disabled={Boolean(busyId)} onEnter={project.archived ? undefined : () => void enterProject(project)} items={[
              { key: 'rename', label: '重命名', onClick: () => openEditor('rename', project) },
              ...(!project.archived ? [{ key: 'duplicate', label: '复制项目', onClick: () => openEditor('duplicate', project) }] : []),
              { key: 'archive', label: project.archived ? '恢复项目' : '归档项目', disabled: !project.archived && project.id === projectList.activeCaseId, onClick: () => project.archived ? void changeArchive(project, false) : setArchiveTarget(project) },
              { key: 'delete', label: '删除项目', danger: true, onClick: () => openDeleteDialog(project) },
            ]} /> },
          ]} locale={{ emptyText: <ProjectListEmpty subject="软著项目" filtered={Boolean(keyword.trim())} disabled={Boolean(busyId)} onReset={() => { setKeyword(''); requestAnimationFrame(() => projectSearchRef.current?.focus()); }} onCreate={() => openEditor('create')} /> }} /> : loading ? (
            <div className="software-copyright-project-empty">
              <strong>正在读取软著项目</strong>
              <span>正在加载本地项目档案和生成状态。</span>
            </div>
          ) : visibleProjects.length ? pageItems.map((project) => {
            const isActive = project.id === projectList.activeCaseId;
            const statusLabel = project.archived ? '已归档' : project.draftConfirmed ? '材料已确认' : stepLabels[project.step];
            return (
              <article className={`software-copyright-project-card ${isActive ? 'is-active' : ''} ${project.archived ? 'is-archived' : ''}`} key={project.id}>
                <div className="software-copyright-project-card-head">
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.softwareName || '尚未填写软件全称'} / {project.version || 'V1.0'}</span>
                  </div>
                  <em>{statusLabel}</em>
                </div>
                <dl className="software-copyright-project-meta">
                  <div><dt>源码目录</dt><dd title={project.projectPath}>{project.projectPath || '尚未关联'}</dd></div>
                  <div><dt>最近更新</dt><dd>{formatDateTime(project.updatedAt)}</dd></div>
                  <div><dt>创建时间</dt><dd>{formatDateTime(project.createdAt)}</dd></div>
                </dl>
                <div className="software-copyright-project-card-actions">
                  {!project.archived && (
                    <button type="button" className="primary-action" onClick={() => void enterProject(project)} disabled={Boolean(busyId)}>
                      {busyId === project.id ? '正在进入...' : '进入项目'}
                    </button>
                  )}
                  <button type="button" className="secondary-action" onClick={() => openEditor('rename', project)} disabled={Boolean(busyId)}>重命名</button>
                  {!project.archived && <button type="button" className="secondary-action" onClick={() => openEditor('duplicate', project)} disabled={Boolean(busyId)}>复制</button>}
                  {project.archived ? (
                    <button type="button" className="secondary-action" onClick={() => void changeArchive(project, false)} disabled={Boolean(busyId)}>恢复</button>
                  ) : isActive ? (
                    <button type="button" className="secondary-action" disabled title="当前项目不能直接归档">当前项目</button>
                  ) : (
                    <button type="button" className="danger-action" onClick={() => setArchiveTarget(project)} disabled={Boolean(busyId)}>归档</button>
                  )}
                  <button type="button" className="danger-action" onClick={() => openDeleteDialog(project)} disabled={Boolean(busyId)}>删除</button>
                </div>
              </article>
            );
          }) : (
            <div className="software-copyright-project-empty">
              <strong>{keyword.trim() ? '没有匹配项目' : '还没有软著项目'}</strong>
              <span>{keyword.trim() ? '请更换搜索关键词，或查看已归档项目。' : '点击右上角新建项目，开始准备第一套软著材料。'}</span>
              {!keyword.trim() && <button type="button" className="primary-action create-action" onClick={() => openEditor('create')}>新建软著项目</button>}
            </div>
          )}
        </div>
      </section>

      <CollectionPagination page={currentPage} total={visibleProjects.length} onChange={setListPage} />
      <AsyncDialogRoot busy={Boolean(busyId)} open={Boolean(editor)} onOpenChange={(open) => !open && !busyId && setEditor(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <AsyncDialogContent {...dialogFocus.focusProps} className="detail-help-card software-copyright-project-editor" onEscapeKeyDown={Boolean(busyId) ? event => event.preventDefault() : undefined} onPointerDownOutside={Boolean(busyId) ? event => event.preventDefault() : undefined}>
            <div className="detail-help-head">
              <div>
                <span className="section-kicker">软件著作</span>
                <Dialog.Title>{editor?.mode === 'create' ? '新建软著项目' : editor?.mode === 'duplicate' ? '复制软著项目' : '重命名软著项目'}</Dialog.Title>
              </div>
              <AsyncDialogClose className="detail-help-close" type="button" aria-label="关闭项目编辑">×</AsyncDialogClose>
            </div>
            <Dialog.Description>
              {editor?.mode === 'create' ? '创建后将直接进入项目工作台，软件全称和版本号可稍后继续完善。' : editor?.mode === 'duplicate' ? '完整复制当前项目资料，适合准备新版本或相近软件。' : '项目档案名称仅用于本地管理，不会修改申请材料中的软件全称。'}
            </Dialog.Description>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
            <div className="software-copyright-project-editor-fields">
              <label>
                <span>项目名称</span>
                <input disabled={Boolean(busyId)} value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={80} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submitEditor(); } }} placeholder="例如：禹都助手 V1.0 软著申报" autoFocus />
              </label>
              {editor?.mode === 'create' && (
                <>
                  <label>
                    <span>软件全称</span>
                    <input disabled={Boolean(busyId)} value={softwareName} onChange={(event) => setSoftwareName(event.target.value)} placeholder="例如：禹都AI解决方案助手软件" />
                  </label>
                  <label>
                    <span>版本号</span>
                    <input disabled={Boolean(busyId)} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="V1.0" />
                  </label>
                </>
              )}
            </div>
            <div className="software-copyright-dialog-actions">
              <AsyncDialogClose className="secondary-action" type="button">取消</AsyncDialogClose>
              <button type="button" className={`primary-action${editor?.mode === 'create' ? ' create-action' : ''}`} onClick={() => void submitEditor()} disabled={!projectName.trim() || Boolean(busyId)}>
                {busyId ? '处理中…' : editor?.mode === 'create' ? '创建并进入' : '确认'}
              </button>
            </div>
          </AsyncDialogContent>
        </Dialog.Portal>
      </AsyncDialogRoot>

      <AsyncDialogRoot busy={Boolean(busyId)} open={Boolean(archiveTarget)} onOpenChange={(open) => !open && !busyId && setArchiveTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <AsyncDialogContent className="detail-help-card software-copyright-project-editor" onEscapeKeyDown={Boolean(busyId) ? event => event.preventDefault() : undefined} onPointerDownOutside={Boolean(busyId) ? event => event.preventDefault() : undefined}>
            <Dialog.Title>归档软著项目</Dialog.Title>
            <Dialog.Description>“{archiveTarget?.name}”将移入归档列表，已有资料和输出文件不会删除，之后仍可恢复。</Dialog.Description>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
            <div className="software-copyright-dialog-actions">
              <AsyncDialogClose className="secondary-action" type="button">取消</AsyncDialogClose>
              <button type="button" className="danger-action" onClick={() => archiveTarget && void changeArchive(archiveTarget, true)} disabled={Boolean(busyId)}>{busyId ? '归档中…' : '确认归档'}</button>
            </div>
          </AsyncDialogContent>
        </Dialog.Portal>
      </AsyncDialogRoot>

      <AsyncDialogRoot busy={Boolean(busyId)}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setDeleteTarget(null);
            setDeleteConfirmName('');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <AsyncDialogContent className="detail-help-card software-copyright-project-editor software-copyright-delete-dialog" onEscapeKeyDown={Boolean(busyId) ? event => event.preventDefault() : undefined} onPointerDownOutside={Boolean(busyId) ? event => event.preventDefault() : undefined}>
            <div className="detail-help-head">
              <div>
                <span className="section-kicker">永久删除</span>
                <Dialog.Title>删除软著项目</Dialog.Title>
              </div>
              <AsyncDialogClose className="detail-help-close" type="button" aria-label="关闭删除确认">×</AsyncDialogClose>
            </div>
            <Dialog.Description>
              将永久删除“{deleteTarget?.name}”的登记字段、草稿、源码准备状态、历史版本和项目内成果，此操作无法恢复。
            </Dialog.Description>{operationError && <div className="yb-operation-error" role="alert">{operationError}</div>}
            <div className="software-copyright-delete-warning">
              请输入完整项目名称以确认删除。删除当前项目后，系统会自动切换到其他项目；删除最后一个项目后会建立新的空白项目。
            </div>
            <div className="software-copyright-project-editor-fields">
              <label>
                <span>项目名称</span>
                <input disabled={Boolean(busyId)}
                  value={deleteConfirmName}
                  onChange={(event) => setDeleteConfirmName(event.target.value)}
                  placeholder={deleteTarget?.name || ''}
                  autoFocus
                />
              </label>
            </div>
            <div className="software-copyright-dialog-actions">
              <AsyncDialogClose className="secondary-action" type="button">取消</AsyncDialogClose>
              <button
                type="button"
                className="danger-action"
                onClick={() => void deleteProject()}
                disabled={deleteConfirmName.trim() !== deleteTarget?.name || Boolean(busyId)}
              >
                {busyId ? '删除中…' : '永久删除'}
              </button>
            </div>
          </AsyncDialogContent>
        </Dialog.Portal>
      </AsyncDialogRoot>
      <ProjectDetailsDrawer open={Boolean(detail)} onClose={() => setDetailId(null)}
        onEnter={detail ? () => void enterProject(detail) : undefined} enterDisabled={Boolean(busyId) || detail?.archived} entering={Boolean(busyId)} error={operationError}
        items={detail ? [
          { key: 'name', label: '项目名称', children: detail.name },
          { key: 'software', label: '软件全称', children: detail.softwareName || '待填写' },
          { key: 'version', label: '软件版本', children: detail.version || 'V1.0' },
          { key: 'stage', label: '当前阶段', children: detail.draftConfirmed ? '材料已确认' : stepLabels[detail.step] },
          { key: 'state', label: '项目状态', children: detail.archived ? '已归档' : '进行中' },
          { key: 'path', label: '源码目录', children: detail.projectPath || '尚未关联源码' },
          { key: 'created', label: '创建时间', children: formatProjectListTime(detail.createdAt) },
          { key: 'updated', label: '更新时间', children: formatProjectListTime(detail.updatedAt) },
        ] : []} />

    </div>
  );
}

export default SoftwareCopyrightProjectsPage;
