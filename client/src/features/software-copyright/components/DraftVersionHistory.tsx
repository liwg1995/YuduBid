import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightDraftSaveResult, SoftwareCopyrightDraftVersion, SoftwareCopyrightDraftVersionComparison } from '../types';

interface DraftVersionHistoryProps {
  draftKey: string;
  revision?: string;
  disabled?: boolean;
  onRestored: (result: SoftwareCopyrightDraftSaveResult) => void;
}

export function DraftVersionHistory({ draftKey, revision, disabled, onRestored }: DraftVersionHistoryProps) {
  const { showToast } = useToast();
  const [versions, setVersions] = useState<SoftwareCopyrightDraftVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [comparison, setComparison] = useState<SoftwareCopyrightDraftVersionComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setComparison(null);
    window.yibiao?.softwareCopyright.listDraftVersions(draftKey)
      .then((items) => {
        if (!active) return;
        setVersions(items || []);
        setSelectedId((current) => items?.some((item) => item.id === current) ? current : (items?.[0]?.id || ''));
      })
      .catch((error) => active && showToast(error.message || '读取草稿版本失败', 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [draftKey, revision, showToast]);

  useEffect(() => {
    if (!selectedId) {
      setComparison(null);
      return;
    }
    let active = true;
    setLoading(true);
    window.yibiao?.softwareCopyright.compareDraftVersion({ key: draftKey, versionId: selectedId })
      .then((result) => active && setComparison(result || null))
      .catch((error) => active && showToast(error.message || '比较草稿版本失败', 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [draftKey, selectedId, revision, showToast]);

  async function handleRestore() {
    if (!selectedId) return;
    setRestoring(true);
    try {
      const result = await window.yibiao?.softwareCopyright.restoreDraftVersion({ key: draftKey, versionId: selectedId });
      if (result) onRestored(result);
      setConfirmOpen(false);
      showToast('历史版本已恢复，恢复前内容已自动备份', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '恢复草稿版本失败', 'error');
    } finally {
      setRestoring(false);
    }
  }

  if (loading && !versions.length) return <div className="software-copyright-empty">正在读取版本历史...</div>;
  if (!versions.length) {
    return (
      <div className="software-copyright-version-empty">
        <strong>还没有历史版本</strong>
        <span>编辑并保存草稿后，系统会自动保留保存前内容；确认草稿时也会记录确认版本。</span>
      </div>
    );
  }

  return (
    <div className="software-copyright-version-workspace">
      <aside className="software-copyright-version-list" aria-label="草稿版本列表">
        {versions.map((version, index) => (
          <button
            type="button"
            className={selectedId === version.id ? 'is-active' : ''}
            onClick={() => setSelectedId(version.id)}
            key={version.id}
          >
            <span>版本 {versions.length - index}</span>
            <strong>{version.reason}</strong>
            <small>{new Date(version.createdAt).toLocaleString()} · {version.lineCount} 行</small>
          </button>
        ))}
      </aside>
      <div className="software-copyright-version-detail">
        {comparison ? (
          <>
            <header>
              <div>
                <strong>{comparison.changed ? '与当前草稿存在差异' : '与当前草稿一致'}</strong>
                <span>新增 {comparison.addedLineCount} 行，删除 {comparison.removedLineCount} 行</span>
              </div>
              <button
                type="button"
                className="secondary-action"
                disabled={disabled || restoring || !comparison.changed}
                onClick={() => setConfirmOpen(true)}
              >
                恢复此版本
              </button>
            </header>
            <div className="software-copyright-version-diff" aria-label="版本差异预览">
              {comparison.lines.length ? comparison.lines.map((line, index) => (
                <div className={`is-${line.type}`} key={`${line.type}-${line.oldLine || 0}-${line.newLine || 0}-${index}`}>
                  <span>{line.oldLine || ''}</span>
                  <span>{line.newLine || ''}</span>
                  <code>{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '} {line.content || ' '}</code>
                </div>
              )) : <div className="software-copyright-version-same">内容完全一致</div>}
            </div>
            {comparison.truncated && <p className="software-copyright-version-note">差异较多，当前仅展示前 120 行新增和前 120 行删除内容。</p>}
          </>
        ) : <div className="software-copyright-empty">请选择需要比较的版本。</div>}
      </div>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-help-modal" />
          <Dialog.Content className="detail-help-card software-copyright-version-dialog">
            <div className="detail-help-head">
              <div>
                <span className="section-kicker">版本恢复</span>
                <Dialog.Title>恢复选中的草稿版本</Dialog.Title>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭版本恢复确认">×</Dialog.Close>
            </div>
            <Dialog.Description>
              当前草稿会被选中版本替换，同时自动保存为“恢复前自动备份”。恢复后需要重新检查并确认草稿。
            </Dialog.Description>
            <div className="software-copyright-dialog-actions">
              <Dialog.Close className="secondary-action" type="button" disabled={restoring}>取消</Dialog.Close>
              <button className="primary-action" type="button" disabled={restoring} onClick={() => void handleRestore()}>
                {restoring ? '恢复中...' : '确认恢复'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
