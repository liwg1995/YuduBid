import useDialogReturnFocus from '../../../shared/ui/useDialogReturnFocus';
import * as Dialog from '@radix-ui/react-dialog';
import MarkdownRenderer from '../../../shared/ui/MarkdownRenderer';

interface PresalesPackagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
  exporting: boolean;
  onExport: () => void;
}

export default function PresalesPackagePreviewDialog({ open, onOpenChange, markdown, exporting, onExport }: PresalesPackagePreviewDialogProps) {
  const dialogFocus = useDialogReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content {...dialogFocus.focusProps} className="presales-package-preview-dialog">
          <div className="presales-package-preview-head">
            <div>
              <Dialog.Title>售前项目包预览</Dialog.Title>
              <Dialog.Description>导出前查看当前项目会汇总成哪些内容。</Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭预览">×</Dialog.Close>
          </div>
          <div className="presales-package-preview-body">
            <MarkdownRenderer allowRawHtml={false}>{markdown || '暂无可预览内容。'}</MarkdownRenderer>
          </div>
          <div className="presales-package-preview-actions">
            <Dialog.Close className="secondary-action" type="button">关闭</Dialog.Close>
            <button type="button" className="primary-action" onClick={onExport} disabled={exporting}>
              {exporting ? '导出中...' : '导出项目包'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
