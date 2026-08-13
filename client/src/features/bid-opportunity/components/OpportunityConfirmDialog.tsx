import * as Dialog from '@radix-ui/react-dialog';

interface OpportunityConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function OpportunityConfirmDialog({ open, title, description, confirmLabel, busy = false, danger = false, onOpenChange, onConfirm }: OpportunityConfirmDialogProps) {
  return <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-confirm-dialog"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description><div><Dialog.Close asChild><button type="button" className="secondary-action" disabled={busy}>取消</button></Dialog.Close><button type="button" className={danger ? 'danger-action' : 'primary-action'} onClick={onConfirm} disabled={busy}>{busy ? '处理中…' : confirmLabel}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
