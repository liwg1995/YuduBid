import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightCase, SoftwareCopyrightCaseList, SoftwareCopyrightCaseMutationResult } from '../types';

interface SoftwareCopyrightCaseManagerProps {
  blocked?: boolean;
  onWorkspaceChanged: (result: SoftwareCopyrightCaseMutationResult) => void;
}

type EditorMode = 'create' | 'rename' | 'duplicate';

export function SoftwareCopyrightCaseManager({ blocked, onWorkspaceChanged }: SoftwareCopyrightCaseManagerProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [caseList, setCaseList] = useState<SoftwareCopyrightCaseList>({ activeCaseId: '', cases: [] });
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [editor, setEditor] = useState<{ mode: EditorMode; item?: SoftwareCopyrightCase } | null>(null);
  const [name, setName] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<SoftwareCopyrightCase | null>(null);

  useEffect(() => {
    if (!open) return;
    void refreshCases();
  }, [open, includeArchived]);

  async function refreshCases() {
    setLoading(true);
    try {
      const result = await window.yibiao?.softwareCopyright.listCases(includeArchived);
      if (result) setCaseList(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取软著项目失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openEditor(mode: EditorMode, item?: SoftwareCopyrightCase) {
    setEditor({ mode, item });
    setName(mode === 'rename' ? (item?.name || '') : mode === 'duplicate' ? `${item?.name || '软著项目'} 副本` : '');
  }

  async function submitEditor() {
    const nextName = name.trim();
    if (!nextName) return;
    setBusyId(editor?.item?.id || 'new');
    try {
      if (editor?.mode === 'create') {
        const result = await window.yibiao?.softwareCopyright.createCase({ name: nextName });
        if (result) {
          onWorkspaceChanged(result);
          setCaseList(result.cases);
          setOpen(false);
        }
        showToast('已创建新的软著项目', 'success');
      } else if (editor?.mode === 'duplicate' && editor.item) {
        const result = await window.yibiao?.softwareCopyright.duplicateCase({ id: editor.item.id, name: nextName });
        if (result) {
          onWorkspaceChanged(result);
          setCaseList(result.cases);
          setOpen(false);
        }
        showToast('项目副本已创建并切换', 'success');
      } else if (editor?.mode === 'rename' && editor.item) {
        const result = await window.yibiao?.softwareCopyright.renameCase({ id: editor.item.id, name: nextName });
        if (result) setCaseList(result.cases);
        showToast('项目名称已更新', 'success');
      }
      setEditor(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '项目操作失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function switchCase(item: SoftwareCopyrightCase) {
    setBusyId(item.id);
    try {
      const result = await window.yibiao?.softwareCopyright.switchCase(item.id);
      if (result) {
        onWorkspaceChanged(result);
        setCaseList(result.cases);
        setOpen(false);
      }
      showToast(`已切换到“${item.name}”`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换项目失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function changeArchive(item: SoftwareCopyrightCase, archived: boolean) {
    setBusyId(item.id);
    try {
      const result = await window.yibiao?.softwareCopyright.setCaseArchived({ id: item.id, archived });
      if (result) setCaseList(result.cases);
      setArchiveTarget(null);
      showToast(archived ? '项目已归档，可随时恢复' : '项目已恢复', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新归档状态失败', 'error');
    } finally {
      setBusyId('');
    }
  }

  const activeCase = caseList.cases.find((item) => item.id === caseList.activeCaseId);

  return (
    <>
      <button type="button" className="secondary-action" onClick={() => setOpen(true)}>项目档案</button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <Dialog.Content className="detail-help-card software-copyright-case-dialog">
            <div className="detail-help-head">
              <div>
                <span className="section-kicker">软件著作</span>
                <Dialog.Title>项目档案</Dialog.Title>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭项目档案">×</Dialog.Close>
            </div>
            <Dialog.Description>每个项目独立保存字段、草稿、图片、版本历史和正式输出，切换时不会覆盖其他项目。</Dialog.Description>
            <div className="software-copyright-case-toolbar">
              <div>
                <strong>{activeCase?.name || '当前项目'}</strong>
                <span>{caseList.cases.filter((item) => !item.archived).length} 个进行中项目</span>
              </div>
              <label>
                <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
                显示已归档
              </label>
              <button type="button" className="primary-action" disabled={blocked} onClick={() => openEditor('create')}>新建项目</button>
            </div>
            {blocked && <div className="software-copyright-case-blocked">请先保存当前草稿或等待任务结束，再切换、复制或新建项目。</div>}
            <div className="software-copyright-case-list" aria-label="软著项目列表">
              {loading ? <div className="software-copyright-empty">正在读取项目档案...</div> : caseList.cases.length ? caseList.cases.map((item) => {
                const active = item.id === caseList.activeCaseId;
                return (
                  <article className={`${active ? 'is-active' : ''} ${item.archived ? 'is-archived' : ''}`} key={item.id}>
                    <div className="software-copyright-case-status">
                      <span>{active ? '当前' : item.archived ? '已归档' : item.draftConfirmed ? '已确认' : '进行中'}</span>
                    </div>
                    <div className="software-copyright-case-main">
                      <strong>{item.name}</strong>
                      <span>{item.softwareName || '尚未填写软件名称'} · {item.version || 'V1.0'}</span>
                      <small>{item.projectPath || '尚未选择源码目录'}</small>
                      <small>更新于 {new Date(item.updatedAt).toLocaleString()}</small>
                    </div>
                    <div className="software-copyright-case-actions">
                      {!active && !item.archived && <button type="button" disabled={Boolean(blocked || busyId)} onClick={() => void switchCase(item)}>切换</button>}
                      {!item.archived && <button type="button" disabled={Boolean(blocked || busyId)} onClick={() => openEditor('duplicate', item)}>复制</button>}
                      <button type="button" disabled={Boolean(busyId)} onClick={() => openEditor('rename', item)}>重命名</button>
                      {item.archived ? (
                        <button type="button" disabled={Boolean(busyId)} onClick={() => void changeArchive(item, false)}>恢复</button>
                      ) : !active ? (
                        <button type="button" className="is-danger" disabled={Boolean(blocked || busyId)} onClick={() => setArchiveTarget(item)}>归档</button>
                      ) : null}
                    </div>
                  </article>
                );
              }) : <div className="software-copyright-empty">暂无软著项目，请新建项目开始准备材料。</div>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(editor)} onOpenChange={(next) => !next && setEditor(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal software-copyright-case-suboverlay" />
          <Dialog.Content className="detail-help-card software-copyright-case-editor">
            <Dialog.Title>{editor?.mode === 'create' ? '新建软著项目' : editor?.mode === 'duplicate' ? '复制软著项目' : '重命名软著项目'}</Dialog.Title>
            <Dialog.Description>{editor?.mode === 'duplicate' ? '将复制完整工作区并立即切换到副本。' : '项目名称仅用于本地档案管理，不会自动修改申请表中的软件全称。'}</Dialog.Description>
            <label className="software-copyright-case-name">
              <span>项目名称</span>
              <input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} placeholder="例如：禹都助手 V1.0 申报" />
            </label>
            <div className="software-copyright-dialog-actions">
              <button type="button" className="secondary-action" onClick={() => setEditor(null)}>取消</button>
              <button type="button" className="primary-action" disabled={!name.trim() || Boolean(busyId)} onClick={() => void submitEditor()}>确认</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(archiveTarget)} onOpenChange={(next) => !next && setArchiveTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal software-copyright-case-suboverlay" />
          <Dialog.Content className="detail-help-card software-copyright-case-editor">
            <Dialog.Title>归档软著项目</Dialog.Title>
            <Dialog.Description>“{archiveTarget?.name}”将移入已归档列表，项目文件不会删除，之后可以恢复。</Dialog.Description>
            <div className="software-copyright-dialog-actions">
              <button type="button" className="secondary-action" onClick={() => setArchiveTarget(null)}>取消</button>
              <button type="button" className="danger-action" disabled={Boolean(busyId)} onClick={() => archiveTarget && void changeArchive(archiveTarget, true)}>确认归档</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
