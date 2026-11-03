export interface ListRemovalFocus {
  source: HTMLElement | null;
  neighbours: HTMLElement[];
}

/** 使用实际可见顺序，避免重新计算表格的筛选、排序及分页。 */
export function captureListRemovalFocus(container: HTMLElement | null, itemSelector: string, removedItem: HTMLElement | undefined): ListRemovalFocus {
  const items = Array.from(container?.querySelectorAll<HTMLElement>(itemSelector) || []);
  const position = removedItem ? items.indexOf(removedItem) : -1;
  return {
    source: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    neighbours: position < 0 ? [] : [items[position + 1], items[position - 1]].filter((item): item is HTMLElement => Boolean(item)),
  };
}

export function restoreListRemovalFocus(plan: ListRemovalFocus | null, container: HTMLElement | null, itemSelector: string, fallbackSelectors: string[]): boolean {
  if (!plan || !container) return false;
  const candidates = [plan.source, ...plan.neighbours, ...container.querySelectorAll<HTMLElement>(itemSelector), ...fallbackSelectors.map(selector => container.querySelector<HTMLElement>(selector))];
  const target = candidates.find((item): item is HTMLElement => Boolean(item?.isConnected && !item.matches(':disabled') && !item.closest('[hidden], [aria-hidden="true"]')));
  if (!target) return false;
  // 相邻结果需要进入视野；取消返回原来源时保留滚动位置。
  target.focus({ preventScroll: target === plan.source });
  return true;
}
