import useListTableViewport from '../../../shared/ui/useListTableViewport';
import EnterpriseSearchInput from '../../../shared/ui/EnterpriseSearchInput';
import { useMemo, useRef, useState } from 'react';
import { Dropdown, Progress, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import type { KnowledgeDocument } from '../types';

interface Props {
  documents: KnowledgeDocument[];
  disabled: boolean;
  developerMode: boolean;
  canOpenMarkdown: (document: KnowledgeDocument) => boolean;
  canOpenAnalysis: (document: KnowledgeDocument) => boolean;
  onOpen: (document: KnowledgeDocument, mode: 'items' | 'markdown' | 'analysis') => void;
  onDelete: (document: KnowledgeDocument) => void;
}

export default function KnowledgeDocumentList({ documents, disabled, developerMode, canOpenMarkdown, canOpenAnalysis, onOpen, onDelete }: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuTriggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => documents.filter((document) => {
    const matchesStatus = status === 'all' || (status === 'processing' ? document.status !== 'success' && document.status !== 'error' : document.status === status);
    return matchesStatus && document.file_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }), [documents, query, status]);
  const { scrollRef, currentPage } = useListTableViewport({ page, total: filtered.length, resetKey: JSON.stringify([query, status, sortOrder]), onPageChange: setPage });
  // 菜单操作先阻止原 Enter 的默认激活，再回焦来源，供确认框记录稳定的返回位置。
  const columns: ColumnsType<KnowledgeDocument> = [
    { title: '文档名称', key: 'name', render: (_, document) => <div className="knowledge-list-name"><button data-knowledge-document={document.id} type="button" disabled={disabled || !canOpenMarkdown(document)} onClick={() => onOpen(document, 'markdown')}>{document.file_name}</button>{document.status === 'error' && <p className="knowledge-list-error">{document.error || document.message || '处理失败，请查看原文或重新上传。'}</p>}{developerMode && <small>文档 ID：{document.id}</small>}</div> },
    { title: '处理状态', key: 'status', width: 190, render: (_, document) => {
      if (document.status === 'success') return <Tag color="success">已完成</Tag>;
      if (document.status === 'error') return <Tag color="error">处理失败</Tag>;
      if (document.status === 'pending') return <Tag>等待处理</Tag>;
      const known = typeof document.progress === 'number' && Number.isFinite(document.progress);
      const percent = known ? Math.round(Math.max(0, Math.min(100, document.progress))) : 0;
      return <div className="knowledge-list-progress"><span>{document.message || '正在处理文档'}</span>{known ? <Progress aria-label={`${document.file_name}处理进度`} percent={percent} size="small" status="active" /> : <span className="knowledge-list-pending">正在等待进度更新</span>}</div>;
    } },
    { title: '知识条目', dataIndex: 'item_count', width: 100, align: 'right', sortOrder, sorter: (a, b) => (a.item_count || 0) - (b.item_count || 0), render: (count: number) => <span className="knowledge-list-count">{count || 0}</span> },
    { title: '操作', key: 'actions', width: 148, fixed: 'right', render: (_, document) => <div className="knowledge-list-actions" onKeyDownCapture={(event) => { if (event.key === 'Escape' && openMenuId === document.id) { event.preventDefault(); event.stopPropagation(); setOpenMenuId(null); menuTriggers.current[document.id]?.focus(); } }}><button type="button" onClick={() => onOpen(document, 'items')} disabled={disabled || document.status !== 'success'}>知识条目</button><Dropdown autoFocus open={openMenuId === document.id} onOpenChange={(open) => setOpenMenuId(open ? document.id : null)} trigger={['click']} menu={{ items: [
      { key: 'markdown', label: '查看原文', disabled: !canOpenMarkdown(document) },
      ...(developerMode ? [{ key: 'analysis', label: '分析调试', disabled: !canOpenAnalysis(document) }] : []),
      { type: 'divider' as const }, { key: 'delete', label: '删除文档', danger: true },
    ], onClick: ({ key, domEvent }) => { domEvent.preventDefault(); setOpenMenuId(null); menuTriggers.current[document.id]?.focus({ preventScroll: true }); if (key === 'delete') onDelete(document); else onOpen(document, key as 'markdown' | 'analysis'); } }}><button ref={(element) => { menuTriggers.current[document.id] = element; }} type="button" disabled={disabled} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpenMenuId(document.id); } }} aria-label={`${document.file_name}的更多操作`}>更多</button></Dropdown></div> },
  ];
  return <EnterpriseUiProvider><div className="knowledge-document-table">
    <div className="knowledge-list-toolbar"><EnterpriseSearchInput aria-label="搜索文档名称" placeholder="搜索文档名称" allowClear value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><Select aria-label="筛选文档状态" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: 'all', label: '全部状态' }, { value: 'processing', label: '处理中' }, { value: 'success', label: '已完成' }, { value: 'error', label: '处理失败' }]} /><span aria-live="polite">{filtered.length} / {documents.length} 个文档</span></div>
    <div ref={scrollRef} tabIndex={-1} role="region" aria-label="知识库文档列表" className="knowledge-list-table-scroll"><Table rowKey="id" columns={columns} dataSource={filtered} size="middle" scroll={{ x: 640 }} onChange={(_, __, sorter, extra) => { if (extra.action === 'sort' && !Array.isArray(sorter)) { setSortOrder(sorter.order || null); setPage(1); } }} pagination={{ current: currentPage, pageSize: 20, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: <div className="knowledge-list-no-results"><strong>没有符合条件的文档</strong><p>调整名称或状态筛选后重试。</p><button className="secondary-action" type="button" onClick={() => { setQuery(''); setStatus('all'); setPage(1); }}>清除筛选</button></div> }} /></div>
  </div></EnterpriseUiProvider>;
}
