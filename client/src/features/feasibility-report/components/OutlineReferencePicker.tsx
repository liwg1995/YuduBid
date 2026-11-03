import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeBaseIndex } from '../../knowledge-base/types';

export default function OutlineReferencePicker({ selectedIds, onChange, disabled }: { selectedIds: string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const [index, setIndex] = useState<KnowledgeBaseIndex>({ folders: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let disposed = false; setLoading(true); setError('');
    void (async () => {
      try {
        if (!window.yibiao?.knowledgeBase) throw new Error('知识库服务尚未就绪');
        const next = await window.yibiao.knowledgeBase.list();
        if (!disposed) setIndex(next);
      } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; };
  }, [revision]);
  const available = useMemo(() => index.documents.filter(document => document.status === 'success'), [index]);
  const missing = selectedIds.filter(id => !available.some(document => document.id === id));
  const keyword = query.trim().toLocaleLowerCase('zh-CN');
  const groups = [...index.folders.map(folder => ({ name: folder.name, documents: available.filter(document => document.folder_id === folder.id) })), { name: '未分类文档', documents: available.filter(document => !index.folders.some(folder => folder.id === document.folder_id)) }].map(group => ({ ...group, documents: group.documents.filter(document => !keyword || `${group.name} ${document.file_name}`.toLocaleLowerCase('zh-CN').includes(keyword)) })).filter(group => group.documents.length);
  return <section className="feasibility-outline-references" aria-label="知识库参考文档">
    <div className="feasibility-outline-reference-head"><strong>知识库参考（可选）</strong><span>已选 {selectedIds.length} 份</span><button type="button" className="secondary-action" disabled={disabled || !selectedIds.length} onClick={() => onChange([])}>清空选择</button></div>
    {loading ? <p role="status">正在读取知识库…</p> : error ? <div role="alert" className="feasibility-reader-feedback"><strong>知识库读取失败</strong><p>{error}</p><button type="button" className="secondary-action" disabled={disabled} onClick={() => setRevision(value => value + 1)}>重新读取知识库</button><p>已有参考选择保留，可稍后重试。</p></div> : <>
      {missing.length > 0 && <div className="feasibility-outline-reference-warning"><span>{missing.length} 份已选文档当前不可用，生成时可能无法引用。</span><button type="button" className="secondary-action" disabled={disabled} onClick={() => onChange(selectedIds.filter(id => !missing.includes(id)))}>移除不可用选择</button></div>}
      {!available.length ? <p>暂无处理完成的知识库文档，可不选参考继续生成。</p> : <>
        <input type="search" aria-label="搜索参考文档" placeholder="搜索文件夹或文档" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="feasibility-outline-reference-list">{groups.length ? groups.map((group, index) => <fieldset key={`${index}-${group.name}`} disabled={disabled}><legend>{group.name}</legend><div className="feasibility-outline-reference-group-actions"><button type="button" className="secondary-action" disabled={disabled || group.documents.every(document => selectedIds.includes(document.id))} onClick={() => onChange([...new Set([...selectedIds, ...group.documents.map(document => document.id)])])}>选中本组</button><button type="button" className="secondary-action" disabled={disabled || !group.documents.some(document => selectedIds.includes(document.id))} onClick={() => onChange(selectedIds.filter(id => !group.documents.some(document => document.id === id)))}>取消本组</button></div>{group.documents.map(document => <label key={document.id}><input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => onChange(selectedIds.includes(document.id) ? selectedIds.filter(id => id !== document.id) : [...selectedIds, document.id])} /><span>{document.file_name}</span><small>{document.item_count || 0} 条</small></label>)}</fieldset>) : <p>没有匹配的文档，其他已选文档仍保留。</p>}</div>
      </>}
    </>}
    {selectedIds.length > 0 && !loading && !error && <details className="feasibility-outline-reference-selected"><summary>查看已选参考（{selectedIds.length}）</summary>{selectedIds.map((id, position) => { const document = available.find(item => item.id === id); const name = document?.file_name || `不可用文档 ${position + 1}`; return <div key={id}><span>{name}</span><button type="button" className="secondary-action" aria-label={`移除参考 ${name}`} disabled={disabled} onClick={() => onChange(selectedIds.filter(selectedId => selectedId !== id))}>移除</button></div>; })}</details>}
  </section>;
}
