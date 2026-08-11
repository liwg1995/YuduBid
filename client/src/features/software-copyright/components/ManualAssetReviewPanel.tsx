import { useEffect, useState } from 'react';
import type { SoftwareCopyrightManualAssetReviewChecks, SoftwareCopyrightManualAssetReviewState } from '../types';

interface ManualAssetReviewPanelProps {
  assetCount: number;
  review: SoftwareCopyrightManualAssetReviewState;
  saving?: boolean;
  disabled?: boolean;
  onConfirm: (checks: SoftwareCopyrightManualAssetReviewChecks, notes: string) => void;
}

const emptyChecks: SoftwareCopyrightManualAssetReviewChecks = {
  content: false,
  captionPlacement: false,
};

export function ManualAssetReviewPanel({ assetCount, review, saving, disabled, onConfirm }: ManualAssetReviewPanelProps) {
  const [checks, setChecks] = useState<SoftwareCopyrightManualAssetReviewChecks>(emptyChecks);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setChecks({ ...emptyChecks, ...(review?.checks || {}) });
    setNotes(review?.notes || '');
  }, [review]);

  const confirmed = Boolean(review?.confirmedAt);

  return (
    <div className={`software-copyright-manual-asset-review ${confirmed ? 'is-confirmed' : ''}`}>
      <div className="software-copyright-manual-asset-review-head">
        <div>
          <strong>{confirmed ? '操作手册图片已核对' : '完成操作手册图片核对'}</strong>
          <span>确认后“提交前总检”中的操作手册图片才会变为就绪；图片发生变化后需重新核对。</span>
        </div>
        {confirmed && <em>已核对</em>}
      </div>
      <div className="software-copyright-manual-asset-review-checks">
        <label>
          <input type="checkbox" checked={checks.content} disabled={!assetCount || disabled || saving} onChange={(event) => setChecks((current) => ({ ...current, content: event.target.checked }))} />
          <span><strong>图片内容</strong><small>已逐张预览，确认没有错误文字、敏感信息、水印或与源码功能不符的画面。</small></span>
        </label>
        <label>
          <input type="checkbox" checked={checks.captionPlacement} disabled={!assetCount || disabled || saving} onChange={(event) => setChecks((current) => ({ ...current, captionPlacement: event.target.checked }))} />
          <span><strong>图注与插入位置</strong><small>已核对图片说明和插入位置；选择文末附录也视为主动确认。</small></span>
        </label>
      </div>
      <label className="software-copyright-manual-asset-review-notes">
        <span>核对备注（选填）</span>
        <input value={notes} maxLength={500} disabled={!assetCount || disabled || saving} placeholder="例如：2张图片均已预览，统一放入文末附录。" onChange={(event) => setNotes(event.target.value)} />
      </label>
      <button type="button" className="primary-action" disabled={!assetCount || disabled || saving || !Object.values(checks).every(Boolean)} onClick={() => onConfirm(checks, notes)}>
        {saving ? '保存中...' : confirmed ? '更新核对记录' : '确认操作手册图片'}
      </button>
    </div>
  );
}
