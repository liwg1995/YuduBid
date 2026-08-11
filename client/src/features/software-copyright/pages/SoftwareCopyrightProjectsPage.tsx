import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightCase, SoftwareCopyrightCaseList } from '../types';

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
  const [projectList, setProjectList] = useState<SoftwareCopyrightCaseList>({ activeCaseId: '', cases: [] });
  const [keyword, setKeyword] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
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
    let mounted = true;
    window.yibiao?.softwareCopyright.listCases(true)
      .then((result) => {
        if (mounted && result) setProjectList(result);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取软著项目失败', 'error'))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  function openEditor(mode: ProjectEditor['mode'], project?: SoftwareCopyrightCase) {
    if (mode === 'create') {
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
    if (!name || !editor) return;
    setBusyId(editor.project?.id || 'new');
    try {
      if (editor.mode === 'create') {
        const result = await window.yibiao?.softwareCopyright.createCase({ name });
        if (!result) return;
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
      showToast(error instanceof Error ? error.message : '项目操作失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function enterProject(project: SoftwareCopyrightCase) {
    setBusyId(project.id);
    try {
      await window.yibiao?.softwareCopyright.switchCase(project.id);
      onEnterProject();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '进入软著项目失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function changeArchive(project: SoftwareCopyrightCase, archived: boolean) {
    setBusyId(project.id);
    try {
      const result = await window.yibiao?.softwareCopyright.setCaseArchived({ id: project.id, archived });
      if (result) setProjectList(result.cases);
      setArchiveTarget(null);
      showToast(archived ? '项目已归档，可随时恢复' : '项目已恢复', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新项目状态失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function deleteProject() {
    if (!deleteTarget || deleteConfirmName.trim() !== deleteTarget.name) return;
    setBusyId(deleteTarget.id);
    try {
      const result = await window.yibiao?.softwareCopyright.deleteCase(deleteTarget.id);
      if (result) setProjectList(result.cases);
      setDeleteTarget(null);
      setDeleteConfirmName('');
      showToast('软著项目已永久删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除软著项目失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  function openDeleteDialog(project: SoftwareCopyrightCase) {
    setDeleteTarget(project);
    setDeleteConfirmName('');
  }

  return (
    <div className="software-copyright-projects-page">
      <section className="software-copyright-projects-hero">
        <div>
          <span className="section-kicker">软件著作</span>
          <h2>软著项目管理</h2>
          <p>每个软件单独保存源码分析、登记信息、操作手册、代码材料、版本记录和导出成果。</p>
        </div>
        <button type="button" className="primary-action" onClick={() => openEditor('create')} disabled={Boolean(busyId)}>
          新建软著项目
        </button>
      </section>

      <section className="software-copyright-projects-overview" aria-label="软著项目概览">
        <article><span>进行中项目</span><strong>{activeCount}</strong></article>
        <article><span>已确认或完成</span><strong>{completedCount}</strong></article>
        <article><span>已关联源码</span><strong>{sourceReadyCount}</strong></article>
      </section>

      <section className="software-copyright-projects-panel">
        <div className="software-copyright-projects-toolbar">
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

        <div className="software-copyright-project-grid">
          {loading ? (
            <div className="software-copyright-project-empty">
              <strong>正在读取软著项目</strong>
              <span>正在加载本地项目档案和生成状态。</span>
            </div>
          ) : visibleProjects.length ? visibleProjects.map((project) => {
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
              {!keyword.trim() && <button type="button" className="primary-action" onClick={() => openEditor('create')}>新建软著项目</button>}
            </div>
          )}
        </div>
      </section>

      <Dialog.Root open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <Dialog.Content className="detail-help-card software-copyright-project-editor">
            <div className="detail-help-head">
              <div>
                <span className="section-kicker">软件著作</span>
                <Dialog.Title>{editor?.mode === 'create' ? '新建软著项目' : editor?.mode === 'duplicate' ? '复制软著项目' : '重命名软著项目'}</Dialog.Title>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭项目编辑">×</Dialog.Close>
            </div>
            <Dialog.Description>
              {editor?.mode === 'create' ? '创建后将直接进入项目工作台，软件全称和版本号可稍后继续完善。' : editor?.mode === 'duplicate' ? '完整复制当前项目资料，适合准备新版本或相近软件。' : '项目档案名称仅用于本地管理，不会修改申请材料中的软件全称。'}
            </Dialog.Description>
            <div className="software-copyright-project-editor-fields">
              <label>
                <span>项目名称</span>
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={80} placeholder="例如：禹都助手 V1.0 软著申报" autoFocus />
              </label>
              {editor?.mode === 'create' && (
                <>
                  <label>
                    <span>软件全称</span>
                    <input value={softwareName} onChange={(event) => setSoftwareName(event.target.value)} placeholder="例如：禹都AI解决方案助手软件" />
                  </label>
                  <label>
                    <span>版本号</span>
                    <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="V1.0" />
                  </label>
                </>
              )}
            </div>
            <div className="software-copyright-dialog-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={() => void submitEditor()} disabled={!projectName.trim() || Boolean(busyId)}>
                {editor?.mode === 'create' ? '创建并进入' : '确认'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <Dialog.Content className="detail-help-card software-copyright-project-editor">
            <Dialog.Title>归档软著项目</Dialog.Title>
            <Dialog.Description>“{archiveTarget?.name}”将移入归档列表，已有资料和输出文件不会删除，之后仍可恢复。</Dialog.Description>
            <div className="software-copyright-dialog-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="danger-action" onClick={() => archiveTarget && void changeArchive(archiveTarget, true)} disabled={Boolean(busyId)}>确认归档</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmName('');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <Dialog.Content className="detail-help-card software-copyright-project-editor software-copyright-delete-dialog">
            <div className="detail-help-head">
              <div>
                <span className="section-kicker">永久删除</span>
                <Dialog.Title>删除软著项目</Dialog.Title>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭删除确认">×</Dialog.Close>
            </div>
            <Dialog.Description>
              将永久删除“{deleteTarget?.name}”的登记字段、草稿、源码准备状态、历史版本和项目内成果，此操作无法恢复。
            </Dialog.Description>
            <div className="software-copyright-delete-warning">
              请输入完整项目名称以确认删除。删除当前项目后，系统会自动切换到其他项目；删除最后一个项目后会建立新的空白项目。
            </div>
            <div className="software-copyright-project-editor-fields">
              <label>
                <span>项目名称</span>
                <input
                  value={deleteConfirmName}
                  onChange={(event) => setDeleteConfirmName(event.target.value)}
                  placeholder={deleteTarget?.name || ''}
                  autoFocus
                />
              </label>
            </div>
            <div className="software-copyright-dialog-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button
                type="button"
                className="danger-action"
                onClick={() => void deleteProject()}
                disabled={deleteConfirmName.trim() !== deleteTarget?.name || Boolean(busyId)}
              >
                永久删除
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default SoftwareCopyrightProjectsPage;
