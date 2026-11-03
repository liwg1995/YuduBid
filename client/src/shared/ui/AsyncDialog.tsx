import * as Dialog from '@radix-ui/react-dialog';
import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import './asyncDialog.css';

const BusyContext = createContext(false);

/** 仅保护当前弹窗内的提交过程；不取消或接管后台任务。 */
export function AsyncDialogRoot({ busy, onOpenChange, children, ...props }: ComponentPropsWithoutRef<typeof Dialog.Root> & { open: boolean; busy: boolean }) {
  return <BusyContext.Provider value={busy}><Dialog.Root {...props} onOpenChange={open => { if (!busy) onOpenChange?.(open); }}>{children}</Dialog.Root></BusyContext.Provider>;
}

export const AsyncDialogContent = forwardRef<ElementRef<typeof Dialog.Content>, ComponentPropsWithoutRef<typeof Dialog.Content>>(function AsyncDialogContent({ onEscapeKeyDown, onPointerDownOutside, ...props }, ref) {
  const busy = useContext(BusyContext);
  return <Dialog.Content {...props} ref={ref} aria-busy={busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); else onEscapeKeyDown?.(event); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); else onPointerDownOutside?.(event); }} />;
});

export const AsyncDialogClose = forwardRef<ElementRef<typeof Dialog.Close>, ComponentPropsWithoutRef<typeof Dialog.Close>>(function AsyncDialogClose({ disabled, ...props }, ref) {
  const busy = useContext(BusyContext);
  return <Dialog.Close {...props} ref={ref} disabled={disabled || busy} />;
});

/** 原生禁用语义覆盖输入、选择和嵌套按钮，保留原有字段布局。 */
export function AsyncDialogFields({ children, ...props }: ComponentPropsWithoutRef<'fieldset'>) {
  const busy = useContext(BusyContext);
  return <fieldset {...props} className={`yb-async-dialog-fields ${props.className || ''}`} disabled={busy || props.disabled}>{children}</fieldset>;
}
