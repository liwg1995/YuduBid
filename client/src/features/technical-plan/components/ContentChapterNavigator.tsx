import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineItem } from '../../../shared/types';

interface Props {
  outline: OutlineItem[];
  selectedId: string;
  statusForItem: (id: string) => string;
  statusLabels: Record<string, string>;
  onSelect: (id: string) => void;
  running: boolean;
  progressLabel: string;
}

export default function ContentChapterNavigator({ outline, selectedId, statusForItem, statusLabels, onSelect, running, progressLabel }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string[]>([]);
  const revealedSelection = useRef<string | null>(null);
  const filtered = Boolean(query.trim()) || filter !== 'all';
  const ancestorIds = useMemo(() => {
    const visit = (items: OutlineItem[], ancestors: string[]): string[] | null => {
      for (const item of items) {
        if (item.id === selectedId) return ancestors;
        const found = item.children?.length ? visit(item.children, [...ancestors, item.id]) : null;
        if (found) return found;
      }
      return null;
    };
    return visit(outline, []) || [];
  }, [outline, selectedId]);
  useEffect(() => {
    if (revealedSelection.current === selectedId) return;
    revealedSelection.current = selectedId;
    setExpanded((current) => [...new Set([...current, ...ancestorIds])]);
  }, [selectedId, ancestorIds]);

  const matchedGroups: string[] = [];
  const build = (items: OutlineItem[], parentMatches = false): DataNode[] => items.flatMap((item): DataNode[] => {
    const matches = parentMatches || !query.trim() || `${item.id} ${item.title}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const children = item.children?.length ? build(item.children, matches) : undefined;
    const status = statusForItem(item.id);
    const statusMatches = filter === 'all' || (filter === 'error' ? status === 'error' : status !== 'success');
    if (!children?.length && (item.children?.length || !matches || !statusMatches)) return [];
    if (children?.length) matchedGroups.push(item.id);
    return [{ key: item.id, children, title: <span className={`chapter-tree-label is-${status}`} title={`${item.id} ${item.title} · ${statusLabels[status] || status}`}>
      <span className="chapter-tree-number">{item.id}</span><span className="chapter-tree-title">{item.title}</span>
      <span className="chapter-tree-status" aria-label={statusLabels[status] || status} />
    </span> }];
  });
  const data = build(outline);
  return <nav className="modern-content-navigator" aria-label="正文目录">
    <div className="chapter-navigation-heading"><strong>章节目录</strong><select aria-label="筛选章节状态" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部章节</option><option value="error">生成失败</option><option value="pending">尚未完成</option></select></div>
    <div className="chapter-navigation-search"><input type="search" aria-label="搜索章节" placeholder="搜索名称或编号" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="chapter-navigation-tree">
      {data.length ? <Tree blockNode virtual={false} showIcon={false} treeData={data} selectedKeys={[selectedId]}
        expandedKeys={filtered ? matchedGroups : expanded} autoExpandParent={false}
        onExpand={(keys) => { if (!filtered) setExpanded(keys.map(String)); }}
        onSelect={(keys) => { if (keys.length) onSelect(String(keys[0])); }} />
        : <div className="chapter-navigation-empty" role="status"><p>没有匹配的章节</p><button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选</button></div>}
    </div>
    {running && <div className="chapter-navigation-activity" role="status">{progressLabel}</div>}
  </nav>;
}
