import type { OutlineItem } from '../../../shared/types';

// 顺序来自数组；保存时统一适配当前目录编号格式，子树随父节点一起移动。
export function renumberOutlineItems(items: OutlineItem[], prefix = ''): OutlineItem[] {
  return items.map((item, index) => {
    const id = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    return { ...item, id, children: item.children?.length ? renumberOutlineItems(item.children, id) : undefined };
  });
}

export function moveOutlineSibling(items: OutlineItem[], itemId: string, offset: -1 | 1): OutlineItem[] {
  const index = items.findIndex(item => item.id === itemId);
  if (index >= 0) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return items.map(item => item.children ? { ...item, children: moveOutlineSibling(item.children, itemId, offset) } : item);
}

export function outlineOrderKey(items: OutlineItem[]): string {
  const visit = (nodes: OutlineItem[]): unknown[] => nodes.map(item => [item.id, visit(item.children || [])]);
  return JSON.stringify(visit(items));
}
