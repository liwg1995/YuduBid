import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useState } from 'react';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import { EmptyState } from '../../../shared/ui';
import type { OutlineItem } from '../../../shared/types';

interface Props {
  items: OutlineItem[];
  generatedIds: Set<string>;
  selectedIds: Set<string>;
  disabled: boolean;
  onChange: (ids: Set<string>) => void;
  onPreview: (id: string) => void;
  onOpenContent: () => void;
}

/** 只提交有正文的叶节点；搜索中的勾选不会丢失被筛选隐藏的选择。 */
export default function ExpandChapterPicker({ items, generatedIds, selectedIds, disabled, onChange, onPreview, onOpenContent }: Props) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>(() => items.filter((item) => item.children?.length).map((item) => item.id));
  const keyword = query.trim().toLocaleLowerCase();
  const visibleIds = new Set<string>();
  const branchIds: string[] = [];
  const hasContent = (item: OutlineItem): boolean => item.children?.length ? item.children.some(hasContent) : generatedIds.has(item.id);
  const build = (nodes: OutlineItem[], parentMatches = false): DataNode[] => nodes.flatMap((item): DataNode[] => {
    const matches = parentMatches || !keyword || `${item.id} ${item.title}`.toLocaleLowerCase().includes(keyword);
    const children = item.children?.length ? build(item.children, matches) : undefined;
    if (!matches && !children?.length) return [];
    const isLeaf = !item.children?.length;
    if (isLeaf && generatedIds.has(item.id)) visibleIds.add(item.id);
    if (children?.length) branchIds.push(item.id);
    return [{ key: item.id, children, disabled: disabled || !hasContent(item), title: <span className="expand-chapter-label">
      <span className="expand-chapter-number">{item.id}</span><span className="expand-chapter-title">{item.title || '未命名小节'}</span>
      {isLeaf && generatedIds.has(item.id) ? <button type="button" className="expand-chapter-preview" onClick={(event) => { event.stopPropagation(); onPreview(item.id); }} aria-label={`预览：${item.title || item.id}`}>预览</button> : isLeaf ? <span className="expand-chapter-unavailable">未生成</span> : null}
    </span> }];
  });
  const data = build(items);
  return <EnterpriseUiProvider><div className="expand-chapter-picker">
    <div className="expand-chapter-tools"><input type="search" aria-label="搜索扩写小节" placeholder="搜索章节名称或编号" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" disabled={Boolean(keyword)} onClick={() => setExpanded(expanded.length ? [] : branchIds)}>{expanded.length ? '收起全部' : '展开全部'}</button></div>
    <div className="expand-chapter-tree">
      {!items.length ? <EmptyState title="暂无目录" hint="请先完成目录和正文生成。"><button className="primary-action" type="button" onClick={onOpenContent}>返回正文生成</button></EmptyState> : !generatedIds.size ? <EmptyState title="暂无可扩写正文" hint="生成正文后，即可在这里选择小节。"><button className="primary-action" type="button" onClick={onOpenContent}>返回正文生成</button></EmptyState> : !data.length ? <EmptyState title="没有匹配的小节"><button className="secondary-action" type="button" onClick={() => setQuery('')}>清空搜索</button></EmptyState> : <Tree checkable blockNode selectable={false} virtual={false} showIcon={false} treeData={data} checkedKeys={[...selectedIds]} expandedKeys={keyword ? branchIds : expanded} autoExpandParent={false} onExpand={(keys) => { if (!keyword) setExpanded(keys.map(String)); }} onCheck={(keys) => {
        const checked = Array.isArray(keys) ? keys : keys.checked;
        const next = new Set([...selectedIds].filter((id) => !visibleIds.has(id)));
        checked.forEach((key) => { const id = String(key); if (generatedIds.has(id) && visibleIds.has(id)) next.add(id); });
        onChange(next);
      }} />}
    </div>
  </div></EnterpriseUiProvider>;
}
