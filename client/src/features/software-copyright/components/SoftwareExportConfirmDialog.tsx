import * as Dialog from '@radix-ui/react-dialog';
import './softwareExportDialog.css';

interface SoftwareExportConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  softwareName: string;
  version: string;
  draftConfirmed: boolean;
  codePageCount: string | number;
  exportLabels: string[];
  missingFieldCount: number;
  codeRiskTips: string[];
  canExport: boolean;
  onConfirm: () => void;
}

/** 正式导出前的信息核对；导出流程仍由工作台管理。 */
export default function SoftwareExportConfirmDialog({ open, onOpenChange, softwareName, version, draftConfirmed, codePageCount, exportLabels, missingFieldCount, codeRiskTips, canExport, onConfirm }: SoftwareExportConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="software-copyright-export-confirm-card">
          <div className="software-copyright-export-confirm-head">
            <div>
              <Dialog.Title>确认导出正式资料</Dialog.Title>
              <Dialog.Description>
                提交前总检已经通过，请最后确认软件信息和导出项目。
              </Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭导出确认">×</Dialog.Close>
          </div>

          <div className="software-copyright-export-confirm-body">
            <div className="software-copyright-export-confirm-grid">
              <article>
                <span>软件全称</span>
                <strong>{softwareName || '未填写'}</strong>
              </article>
              <article>
                <span>版本号</span>
                <strong>{version || '未填写'}</strong>
              </article>
              <article>
                <span>草稿状态</span>
                <strong>{draftConfirmed ? '已确认' : '未确认'}</strong>
              </article>
              <article>
                <span>代码页数</span>
                <strong>{codePageCount || '未生成'}</strong>
              </article>
            </div>

            <div className="software-copyright-export-confirm-section">
              <strong>导出项目</strong>
              <div className="software-copyright-export-confirm-tags">
                {exportLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
            </div>

            <div className="software-copyright-export-confirm-section">
              <strong>检查摘要</strong>
              <ul>
                {missingFieldCount > 0 && <li>仍有 {missingFieldCount} 项建议补全字段。</li>}
                {!draftConfirmed && <li>草稿尚未确认，请先返回确认草稿。</li>}
                {codeRiskTips.map((tip) => <li key={tip}>{tip}</li>)}
                {exportLabels.length === 0 && <li>尚未选择任何导出项目。</li>}
                {missingFieldCount === 0 && draftConfirmed && codeRiskTips.length === 0 && exportLabels.length > 0 && (
                  <li>当前未发现阻塞导出的检查项，仍建议导出后按当地受理要求人工复核。</li>
                )}
              </ul>
            </div>

            <div className="software-copyright-export-confirm-note">
              导出材料格式需根据当地受理要求人为微调，请勿直接使用！
            </div>
          </div>
          <div className="software-copyright-export-confirm-actions">
            <Dialog.Close className="secondary-action" type="button">返回修改</Dialog.Close>
            <button
              type="button"
              className="primary-action"
              onClick={onConfirm}
              disabled={!canExport}
            >
              确认导出
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
