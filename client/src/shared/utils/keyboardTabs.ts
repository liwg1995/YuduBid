import type { KeyboardEvent } from 'react';

/** Keep one tab in the keyboard order and let arrow keys activate adjacent tabs. */
export function handleTabListKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
  if (!tabs.length) return;
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[role="tab"]') : null;
  const currentIndex = target ? tabs.indexOf(target) : -1;
  if (currentIndex < 0) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}
