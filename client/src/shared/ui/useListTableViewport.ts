import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface Options {
  page: number;
  total: number;
  resetKey: string;
  onPageChange: (page: number) => void;
  scrollPosition?: RefObject<number>;
}

/** 翻页/筛选回到结果顶部；数据缩减时同步真实页码，返回详情不重置列表。 */
export default function useListTableViewport({ page, total, resetKey, onPageChange, scrollPosition }: Options) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
  const previousView = useRef({ page: currentPage, resetKey });
  useEffect(() => {
    if (page !== currentPage) onPageChange(currentPage);
  }, [page, currentPage, onPageChange]);
  useLayoutEffect(() => {
    const previous = previousView.current;
    previousView.current = { page: currentPage, resetKey };
    if (previous.page === currentPage && previous.resetKey === resetKey) return;
    const container = scrollRef.current;
    if (!container) return;
    // 翻页后分页器移出视野，将键盘焦点交回结果区域；筛选时保留输入焦点。
    const active = document.activeElement;
    const paginationFocused = active instanceof HTMLElement && container.contains(active) && Boolean(active.closest('.ant-pagination'));
    container.scrollTop = 0;
    if (scrollPosition) scrollPosition.current = 0;
    if (paginationFocused) container.focus({ preventScroll: true });
  }, [currentPage, resetKey, scrollPosition]);
  return { scrollRef, currentPage };
}
