import { useEffect, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightExportBatch } from '../types';

interface ExportBatchHistoryProps {
  revision?: string;
}

function statusText(status?: SoftwareCopyrightExportBatch['status']) {
  if (status === 'missing') return '文件缺失';
  if (status === 'changed') return '摘要不一致';
  return '完整性通过';
}

export function ExportBatchHistory({ revision }: ExportBatchHistoryProps) {
  const { showToast } = useToast();
  const [batches, setBatches] = useState<SoftwareCopyrightExportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.yibiao?.softwareCopyright.listExportBatches()
      .then((items) => active && setBatches(items || []))
      .catch((error) => active && showToast(error.message || '读取交付批次失败', 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [revision, showToast]);

  async function openBatch(batch: SoftwareCopyrightExportBatch) {
    setOpeningId(batch.id);
    try {
      await window.yibiao?.softwareCopyright.openExportBatch(batch.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开交付批次失败', 'error');
    } finally {
      setOpeningId('');
    }
  }

  if (loading && !batches.length) return <div className="software-copyright-empty">正在校验历史交付批次...</div>;
  if (!batches.length) return <div className="software-copyright-empty">完成首次正式导出后，这里会保留交付批次、ZIP 文件和摘要校验结果。</div>;

  return (
    <div className="software-copyright-batch-list" aria-label="历史交付批次">
      {batches.map((batch, index) => (
        <article className={`is-${batch.status || 'pass'}`} key={batch.id}>
          <header>
            <div>
              <span>{index === 0 ? '最新批次' : `历史批次 ${batches.length - index}`}</span>
              <strong>{batch.softwareName} {batch.version}</strong>
              <small>{new Date(batch.exportedAt).toLocaleString()} · {batch.files.length} 个文件</small>
            </div>
            <em>{statusText(batch.status)}</em>
          </header>
          <div className="software-copyright-batch-summary">
            <span>确认快照 <code>{batch.snapshotId.slice(0, 18)}</code></span>
            <span>ZIP <code>{batch.files.find((item) => item.path === batch.zipPath)?.sha256.slice(0, 12) || '未生成'}</code></span>
          </div>
          <details>
            <summary>查看文件摘要</summary>
            <div className="software-copyright-batch-files">
              {batch.files.map((file) => (
                <div key={file.path}>
                  <span>{file.name}</span>
                  <code>{file.sha256.slice(0, 16)}</code>
                  <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                </div>
              ))}
            </div>
          </details>
          <button type="button" className="secondary-action" disabled={openingId === batch.id || batch.status === 'missing'} onClick={() => void openBatch(batch)}>
            {openingId === batch.id ? '打开中...' : '打开批次目录'}
          </button>
        </article>
      ))}
    </div>
  );
}
