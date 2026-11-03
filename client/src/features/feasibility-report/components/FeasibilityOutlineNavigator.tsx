import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { OutlineItem } from '../../../shared/types/outline';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';

export interface OutlineEntry { item: OutlineItem; number: string; level: number }
export function outlineEntries(items: OutlineItem[], prefix = '', level = 1): OutlineEntry[] {
  return items.flatMap((item, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
    return [{ item, number, level }, ...outlineEntries(item.children || [], number, level + 1)];
  });
}
export default function FeasibilityOutlineNavigator({ items, selectedId, expanded, query, onSelect, onExpand, statusForItem, leafOnly = false }: {
  items: OutlineItem[]; selectedId: string; expanded: string[]; query: string;
  onSelect: (id: string) => void; onExpand: (ids: string[]) => void;
  statusForItem?: (item: OutlineItem) => string; leafOnly?: boolean;
}) {
  const keyword = query.trim().toLocaleLowerCase('zh-CN');
  const entries = outlineEntries(items);
  const numbers = new Map(entries.map(entry => [entry.item.id, entry.number]));
  const filter = (nodes: OutlineItem[]): OutlineItem[] => nodes.flatMap(item => {
    const children = filter(item.children || []);
    return !keyword || `${numbers.get(item.id)} ${item.title}`.toLocaleLowerCase('zh-CN').includes(keyword) || children.length ? [{ ...item, children }] : [];
  });
  const visible = filter(items);
  const searchExpanded = outlineEntries(visible).filter(entry => entry.item.children?.length).map(entry => entry.item.id);
  const activeExpanded = keyword ? searchExpanded : expanded;
  const renderTitle = (item: OutlineItem) => <span className="feasibility-outline-node-title"><span className="feasibility-outline-node-number">{numbers.get(item.id)}</span><span className="feasibility-outline-node-name">{item.title || '未填写标题'}</span>{statusForItem && !item.children?.length && <small>{statusForItem(item)}</small>}</span>;
  const treeData = (nodes: OutlineItem[]): DataNode[] => nodes.map(item => ({ key: item.id, title: renderTitle(item), selectable: !leafOnly || !item.children?.length, children: item.children?.length ? treeData(item.children) : undefined }));
  const classicNodes = (nodes: OutlineItem[], level = 1) => nodes.map(item => <li key={item.id}>
    <div className={item.id === selectedId ? 'is-selected' : ''} style={{ paddingLeft: (level - 1) * 12 }}>
      {item.children?.length ? <button type="button" aria-label={`${activeExpanded.includes(item.id) ? '折叠' : '展开'} ${item.title}`} aria-expanded={activeExpanded.includes(item.id)} disabled={Boolean(keyword)} onClick={() => onExpand(activeExpanded.includes(item.id) ? activeExpanded.filter(id => id !== item.id) : [...activeExpanded, item.id])}>{activeExpanded.includes(item.id) ? '▾' : '▸'}</button> : <span className="feasibility-outline-leaf" />}
      <button type="button" disabled={leafOnly && Boolean(item.children?.length)} aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => onSelect(item.id)}>{renderTitle(item)}</button>
    </div>
    {item.children?.length && activeExpanded.includes(item.id) ? <ul>{classicNodes(item.children, level + 1)}</ul> : null}
  </li>);
  if (!visible.length) return <p className="feasibility-outline-empty">没有匹配的目录，请调整或清空搜索。</p>;
  return getStoredUiAppearance() === 'modern' ? <EnterpriseUiProvider><Tree aria-label="报告章节目录" blockNode virtual={false} selectedKeys={[selectedId]} expandedKeys={activeExpanded} autoExpandParent={Boolean(keyword)} onExpand={keys => { if (!keyword) onExpand(keys.map(String)); }} onSelect={keys => { if (keys[0]) onSelect(String(keys[0])); }} treeData={treeData(visible)} /></EnterpriseUiProvider> : <ul className="feasibility-outline-native-tree" aria-label="报告章节目录">{classicNodes(visible)}</ul>;
}
