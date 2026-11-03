import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(notify => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-appearance', 'data-ui-theme'] });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}
function snapshot() {
  const { uiAppearance, uiTheme } = document.documentElement.dataset;
  return uiAppearance === 'modern' ? 'modern' : uiTheme || 'classic';
}

/** 使用已应用的外观，包含设置切换与跟随系统的结果；多个控件共享一个观察器。 */
export default function useResolvedUiPalette() {
  return useSyncExternalStore(subscribe, snapshot, () => 'modern');
}
