import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { OutlineData, OutlineItem } from '../../../shared/types/outline';
import type { KnowledgeBaseIndex, KnowledgeDocument } from '../../knowledge-base/types';
import { useToast } from '../../../shared/ui';
import type { FeasibilityOutlineTemplate, FeasibilityReportState } from '../types';
import TaskProgressCard, { isTaskRunning } from './TaskProgressCard';

const templates: { value: FeasibilityOutlineTemplate; label: string }[] = [
  { value: 'government', label: '政府投资项目通用大纲' }, { value: 'enterprise', label: '企业投资项目大纲' },
  { value: 'industrial', label: '工业项目大纲' }, { value: 'hi_tech', label: '高新技术项目大纲' },
  { value: 'infrastructure', label: '基础设施项目大纲' }, { value: 'eco_environmental', label: '生态环保项目大纲' },
  { value: 'commercial_realestate', label: '商业地产项目大纲' },
];
const emptyKnowledgeIndex: KnowledgeBaseIndex = { folders: [], documents: [] };

function updateNode(items: OutlineItem[], id: string, patch: Partial<OutlineItem>): OutlineItem[] {
  return items.map((item) => item.id === id ? { ...item, ...patch } : { ...item, children: item.children ? updateNode(item.children, id, patch) : undefined });
}
function removeNode(items: OutlineItem[], id: string): OutlineItem[] {
  return items.filter((item) => item.id !== id).map((item) => ({ ...item, children: item.children ? removeNode(item.children, id) : undefined }));
}
function addChild(items: OutlineItem[], id: string, child: OutlineItem): OutlineItem[] {
  return items.map((item) => item.id === id ? { ...item, children: [...(item.children || []), child] } : { ...item, children: item.children ? addChild(item.children, id, child) : undefined });
}
function findNode(items: OutlineItem[], id: string): OutlineItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children?.length ? findNode(item.children, id) : null;
    if (child) return child;
  }
  return null;
}
function countNodes(items: OutlineItem[]): number {
  return items.reduce((sum, item) => sum + 1 + countNodes(item.children || []), 0);
}
function collectExpandableIds(items: OutlineItem[], ids = new Set<string>()): Set<string> {
  items.forEach((item) => {
    if (item.children?.length) {
      ids.add(item.id);
      collectExpandableIds(item.children, ids);
    }
  });
  return ids;
}

function OutlineNavigation({ items, level, selectedId, expandedIds, onSelect, onToggle }: {
  items: OutlineItem[];
  level: number;
  selectedId: string;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return <>{items.map((item) => {
    const hasChildren = Boolean(item.children?.length);
    const expanded = expandedIds.has(item.id);
    return <div className="outline-tree-node" key={item.id} style={{ '--outline-level': level - 1 } as CSSProperties}>
      <div className={`outline-tree-item${item.id === selectedId ? ' is-active' : ''}`}>
        <button type="button" className={`outline-tree-toggle${hasChildren ? '' : ' is-leaf'}${expanded ? ' is-expanded' : ''}`} disabled={!hasChildren} onClick={() => hasChildren && onToggle(item.id)} aria-label={hasChildren ? `${expanded ? '折叠' : '展开'} ${item.title}` : `${item.title} 无子目录`}>{hasChildren ? '›' : '•'}</button>
        <button type="button" className="outline-tree-content" onClick={() => onSelect(item.id)} onDoubleClick={() => hasChildren && onToggle(item.id)}><strong>{item.id} {item.title}</strong><small>{item.description || '无描述'}</small></button>
      </div>
      {hasChildren && expanded ? <OutlineNavigation items={item.children || []} level={level + 1} selectedId={selectedId} expandedIds={expandedIds} onSelect={onSelect} onToggle={onToggle} /> : null}
    </div>;
  })}</>;
}

export default function OutlinePanel({ projectId, state, onStateChange }: { projectId: string; state: FeasibilityReportState; onStateChange: (state: FeasibilityReportState) => void }) {
  const { showToast } = useToast();
  const [template, setTemplate] = useState(state.outlineTemplate);
  const [targetWords, setTargetWords] = useState(state.targetWords);
  const [referenceIds, setReferenceIds] = useState(state.referenceDocumentIds);
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeBaseIndex>(emptyKnowledgeIndex);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [expandedKnowledgeFolderIds, setExpandedKnowledgeFolderIds] = useState<Set<string>>(new Set());
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  const [draft, setDraft] = useState<OutlineData | null>(state.outlineData);
  const [selectedId, setSelectedId] = useState(state.outlineData?.outline[0]?.id || '');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectExpandableIds(state.outlineData?.outline || []));
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setDraft(state.outlineData);
    setSelectedId((current) => current && state.outlineData && findNode(state.outlineData.outline, current) ? current : state.outlineData?.outline[0]?.id || '');
    setExpandedIds(collectExpandableIds(state.outlineData?.outline || []));
    setEditingItemId(null);
  }, [state.outlineData]);
  useEffect(() => {
    setLoadingKnowledge(true);
    void window.yibiao!.knowledgeBase.list()
      .then((index) => {
        setKnowledgeIndex(index);
        setExpandedKnowledgeFolderIds(new Set(index.folders.map((folder) => folder.id)));
      })
      .catch(() => setKnowledgeIndex(emptyKnowledgeIndex))
      .finally(() => setLoadingKnowledge(false));
  }, []);

  const task = state.outlineAdjustmentTask && (state.outlineAdjustmentTask.updated_at > (state.outlineTask?.updated_at || '')) ? state.outlineAdjustmentTask : state.outlineTask;
  const running = isTaskRunning(state.outlineTask) || isTaskRunning(state.outlineAdjustmentTask);
  const selected = draft ? findNode(draft.outline, selectedId) : null;
  const templateLabel = templates.find((item) => item.value === template)?.label || '通用大纲';
  const totalNodes = useMemo(() => countNodes(draft?.outline || []), [draft]);

  const generate = async () => {
    try { await window.yibiao!.feasibilityReport.startOutline({ projectId, outlineTemplate: template, targetWords, referenceDocumentIds: referenceIds }); setSettingsOpen(false); showToast('报告目录生成已在后台启动', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const save = async () => {
    if (!draft?.outline.length) return;
    try { onStateChange(await window.yibiao!.feasibilityReport.saveOutline({ projectId, outlineData: draft })); setEditingItemId(null); showToast('目录已保存，旧关键参数和正文内容已失效', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const adjust = async () => {
    try { await window.yibiao!.feasibilityReport.startOutlineAdjustment({ projectId, instruction }); setInstruction(''); showToast('AI 目录调整已在后台启动', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const updateSelected = (patch: Partial<OutlineItem>) => { if (draft && selected) setDraft({ ...draft, outline: updateNode(draft.outline, selected.id, patch) }); };
  const removeSelected = () => {
    if (!draft || !selected) return;
    const nextOutline = removeNode(draft.outline, selected.id);
    setDraft({ ...draft, outline: nextOutline });
    setSelectedId(nextOutline[0]?.id || '');
    setEditingItemId(null);
  };
  const addRoot = () => {
    if (!draft) return;
    const node = { id: `manual-${Date.now()}`, title: '新增一级目录', description: '' };
    setDraft({ ...draft, outline: [...draft.outline, node] });
    setSelectedId(node.id);
    setEditingItemId(node.id);
  };
  const addSelectedChild = () => {
    if (!draft || !selected) return;
    const child = { id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`, title: '新增目录项', description: '' };
    setDraft({ ...draft, outline: addChild(draft.outline, selected.id, child) });
    setExpandedIds((current) => new Set(current).add(selected.id));
    setSelectedId(child.id);
    setEditingItemId(child.id);
  };
  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleKnowledgeFolder = (id: string) => setExpandedKnowledgeFolderIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleReference = (document: KnowledgeDocument) => setReferenceIds((current) => current.includes(document.id) ? current.filter((id) => id !== document.id) : [...current, document.id]);
  const saveConfig = async () => {
    try {
      onStateChange(await window.yibiao!.feasibilityReport.saveOutlineConfig({ projectId, outlineTemplate: template, targetWords, referenceDocumentIds: referenceIds }));
      setSettingsOpen(false);
      showToast('目录生成配置已保存', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const renderKnowledgePicker = () => {
    if (loadingKnowledge) return <div className="outline-knowledge-empty">正在读取知识库...</div>;
    const availableDocuments = knowledgeIndex.documents.filter((document) => document.status === 'success');
    if (!availableDocuments.length) return <div className="outline-knowledge-empty">暂无已完成的知识库文档，可先到知识库上传并处理完成后再选择。</div>;
    const keyword = knowledgeSearch.trim().toLocaleLowerCase('zh-CN');
    const selectedDocuments = referenceIds.map((id) => availableDocuments.find((document) => document.id === id)).filter((document): document is KnowledgeDocument => Boolean(document));
    const visibleFolders = knowledgeIndex.folders.flatMap((folder) => {
      const folderDocuments = availableDocuments.filter((document) => document.folder_id === folder.id);
      const folderMatched = keyword ? folder.name.toLocaleLowerCase('zh-CN').includes(keyword) : false;
      const documents = keyword ? folderDocuments.filter((document) => folderMatched || document.file_name.toLocaleLowerCase('zh-CN').includes(keyword)) : folderDocuments;
      return documents.length ? [{ folder, documents }] : [];
    });
    return <div className="outline-knowledge-compact">
      <input className="outline-knowledge-search" value={knowledgeSearch} onChange={(event) => setKnowledgeSearch(event.target.value)} placeholder="搜索文件夹或文档" />
      <div className="outline-knowledge-grid">
        <div className="outline-knowledge-browser">
          <div className="outline-knowledge-pane-head"><strong>知识库</strong><span>{availableDocuments.length} 个可用</span></div>
          <div className="outline-knowledge-folder-list compact">{visibleFolders.length ? visibleFolders.map(({ folder, documents }) => {
            const expanded = Boolean(keyword) || expandedKnowledgeFolderIds.has(folder.id);
            const selectedCount = documents.filter((document) => referenceIds.includes(document.id)).length;
            return <section className="outline-knowledge-folder compact" key={folder.id}>
              <div className="outline-knowledge-folder-head compact">
                <button type="button" onClick={() => toggleKnowledgeFolder(folder.id)} disabled={Boolean(keyword)}><span>{expanded ? '▾' : '▸'}</span><strong title={folder.name}>{folder.name}</strong></button>
                <small>{documents.length} 个 / 已选 {selectedCount}</small>
                <div className="outline-knowledge-folder-actions"><button type="button" disabled={running || selectedCount === documents.length} onClick={() => setReferenceIds((current) => [...new Set([...current, ...documents.map((document) => document.id)])])}>全选</button><button type="button" disabled={running || !selectedCount} onClick={() => setReferenceIds((current) => current.filter((id) => !documents.some((document) => document.id === id)))}>取消</button></div>
              </div>
              {expanded ? <div className="outline-knowledge-document-list compact">{documents.map((document) => <label className={`outline-knowledge-document compact${referenceIds.includes(document.id) ? ' is-selected' : ''}`} key={document.id}><input type="checkbox" checked={referenceIds.includes(document.id)} disabled={running} onChange={() => toggleReference(document)} /><strong title={document.file_name}>{document.file_name}</strong><small>{document.item_count || 0} 条</small></label>)}</div> : null}
            </section>;
          }) : <div className="outline-knowledge-empty compact">没有匹配的知识库文档</div>}</div>
        </div>
        <aside className="outline-knowledge-selected-pane">
          <div className="outline-knowledge-pane-head"><strong>本次已选</strong><button type="button" disabled={running || !referenceIds.length} onClick={() => setReferenceIds([])}>清空</button></div>
          {selectedDocuments.length ? <div className="outline-knowledge-selected-list">{selectedDocuments.map((document) => <div className="outline-knowledge-selected-item" key={document.id}><strong title={document.file_name}>{document.file_name}</strong><button type="button" disabled={running} onClick={() => setReferenceIds((current) => current.filter((id) => id !== document.id))}>移除</button></div>)}</div> : <div className="outline-knowledge-empty compact">未选择知识库文档</div>}
        </aside>
      </div>
    </div>;
  };

  return <div className="feasibility-stage-content feasibility-outline-layout">
    <section className="feasibility-step-action-row">
      <div><strong>报告目录</strong><p>当前模板：{templateLabel}；目标约 {targetWords.toLocaleString('zh-CN')} 字；知识库 {referenceIds.length ? `已选 ${referenceIds.length} 项` : '未选择'}。</p></div>
      <div><button type="button" className="outline-config-action" aria-label="打开目录生成配置" title="目录生成配置" onClick={() => setSettingsOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.93a1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87-.34A1.7 1.7 0 0 0 10 3.01V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></svg></button><button type="button" className="primary-action" disabled={running || !state.analysisMarkdown} onClick={() => void generate()}>{running ? 'AI 正在生成目录' : state.outlineData ? '重新生成目录' : '生成报告目录'}</button></div>
    </section>
    <section className="feasibility-three-pane-workspace feasibility-outline-workspace">
      <TaskProgressCard task={task} emptyMessage="配置模板、目标字数和知识库后即可生成目录。" />
      <article className="feasibility-outline-structure-pane">
        <header className="outline-tree-head"><div><strong>目录结构</strong><span>{draft?.outline.length || 0} 个一级目录 · {totalNodes} 个目录项</span></div><div className="outline-tree-tools"><button type="button" className="outline-add-root-action" disabled={!draft || running} onClick={addRoot}>添加一级目录</button><button type="button" disabled={!draft?.outline.length} onClick={() => setExpandedIds(collectExpandableIds(draft?.outline || []))}>全部展开</button><button type="button" disabled={!draft?.outline.length} onClick={() => setExpandedIds(new Set())}>全部折叠</button></div></header>
        <div className="outline-tree-list">{draft?.outline.length ? <OutlineNavigation items={draft.outline} level={1} selectedId={selectedId} expandedIds={expandedIds} onSelect={(id) => { setSelectedId(id); setEditingItemId(null); }} onToggle={toggleExpanded} /> : <div className="feasibility-pane-empty"><strong>尚未生成目录</strong><p>通过右上角设置选择大纲模板后生成三级以内目录。</p></div>}</div>
      </article>
      <article className="feasibility-outline-detail-pane">
        <header><strong>目录项详情</strong><span>{selected ? selected.id : '未选择'}</span></header>
        {selected ? <div className="outline-detail-body feasibility-outline-detail-body">
          {editingItemId === selected.id ? <><label><span>目录标题</span><input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} disabled={running} /></label><label><span>写作说明</span><textarea value={selected.description || ''} onChange={(event) => updateSelected({ description: event.target.value })} placeholder="说明本目录项的内容边界、重点和目标字数…" disabled={running} /></label><div className="outline-detail-actions"><button type="button" className="primary-action" disabled={running} onClick={() => void save()}>保存</button><button type="button" className="secondary-action" onClick={() => setEditingItemId(null)}>取消</button></div></> : <><h3>{selected.title}</h3><p>{selected.description || '无描述'}</p><div className="outline-detail-actions"><button type="button" className="primary-action" disabled={running} onClick={() => setEditingItemId(selected.id)}>编辑</button><button type="button" className="secondary-action" disabled={running} onClick={addSelectedChild}>添加子目录</button><button type="button" className="danger-action" disabled={running} onClick={removeSelected}>删除</button></div></>}
          <div className="feasibility-ai-adjust-block"><label><span>AI 调整要求</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：加强财务评价章节，并补充敏感性分析小节" disabled={running} /></label><small>目录已生成且填写调整要求后，AI 调整目录按钮才可使用。</small><button type="button" className="secondary-action" title={!instruction.trim() ? '请先填写 AI 调整要求' : '根据要求调整整个报告目录'} disabled={!state.outlineData || !instruction.trim() || running} onClick={() => void adjust()}>AI 调整目录</button></div>
        </div> : <div className="feasibility-pane-empty"><strong>选择一个目录项</strong><p>在中间目录树中选择章节后，可查看并编辑标题和写作重点。</p></div>}
      </article>
    </section>
    <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}><Dialog.Portal><Dialog.Overlay className="content-regenerate-modal" /><Dialog.Content className="outline-generation-config-card feasibility-outline-settings"><Dialog.Title>报告目录生成设置</Dialog.Title><Dialog.Description>配置适用模板、目标全文字数和知识库参考范围。</Dialog.Description><div className="feasibility-outline-settings-body"><label>适用模板<select value={template} onChange={(event) => setTemplate(event.target.value as FeasibilityOutlineTemplate)}>{templates.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>目标全文字数<input type="number" min={5000} max={200000} step={1000} value={targetWords} onChange={(event) => setTargetWords(Number(event.target.value))} /></label><section className="outline-generation-config-section outline-knowledge-picker feasibility-outline-knowledge-picker"><div className="outline-generation-config-head"><strong>知识库参考（可选）</strong><span>已选择 {referenceIds.length} 个文档</span></div>{renderKnowledgePicker()}</section></div><div className="content-regenerate-actions"><Dialog.Close type="button" className="secondary-action">取消</Dialog.Close><button type="button" className="secondary-action" disabled={running} onClick={() => void saveConfig()}>保存配置</button><button type="button" className="primary-action" disabled={running || !state.analysisMarkdown} onClick={() => void generate()}>开始生成</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
