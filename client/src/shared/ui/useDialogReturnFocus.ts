import { useRef } from 'react';

/** 自控弹窗没有 Trigger 时，记录打开前的真实焦点；菜单入口返回摘要。 */
export default function useDialogReturnFocus() {
  const triggerRef = useRef<HTMLElement | null>(null);
  const rememberTrigger = () => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    triggerRef.current = active?.closest('details')?.querySelector<HTMLElement>('summary') || active;
  };
  return { rememberTrigger, focusProps: {
    onOpenAutoFocus: (event: Event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.contains(document.activeElement)) rememberTrigger();
    },
    onCloseAutoFocus: (event: Event) => {
      const trigger = triggerRef.current;
      if (trigger && trigger !== document.body && trigger.isConnected && trigger.getClientRects().length && !trigger.matches(':disabled')) {
        event.preventDefault();
        trigger.focus({ preventScroll: true });
      }
    },
  } };
}
