import { useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineData, OutlineItem } from '../../../shared/types/outline';
import { AppDialog, useAppDialog, useToast } from '../../../shared/ui';
import type { FeasibilityBackgroundTaskState, FeasibilityOutlineTemplate, FeasibilityReportState } from '../types';
import { isTaskRunning } from './TaskProgressCard';
import AnalysisTaskFeedback from './AnalysisTaskFeedback';
import FeasibilityOutlineNavigator, { outlineEntries } from './FeasibilityOutlineNavigator';
import OutlineReferencePicker from './OutlineReferencePicker';
import './feasibilityOutlineDesign.css';

const templates: { value: FeasibilityOutlineTemplate; label: string }[] = [
  { value: 'government', label: '政府投资项目通用大纲' }, { value: 'enterprise', label: '企业投资项目大纲' },
  { value: 'industrial', label: '工业项目大纲' }, { value: 'hi_tech', label: '高新技术项目大纲' },
  { value: 'infrastructure', label: '基础设施项目大纲' }, { value: 'eco_environmental', label: '生态环保项目大纲' },
  { value: 'commercial_realestate', label: '商业地产项目大纲' },
];
interface Props {
  projectId: string; state: FeasibilityReportState; disabled?: boolean;
  onStateChange: (state: FeasibilityReportState) => void;
  onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void;
}
function updateNode(items: OutlineItem[], id: string, patch: Partial<OutlineItem>): OutlineItem[] {
  return items.map(item => item.id === id ? { ...item, ...patch } : { ...item, children: item.children ? updateNode(item.children, id, patch) : undefined });
}
function removeNode(items: OutlineItem[], id: string): OutlineItem[] {
  return items.filter(item => item.id !== id).map(item => ({ ...item, children: item.children ? removeNode(item.children, id) : undefined }));
}
function addChild(items: OutlineItem[], id: string, child: OutlineItem): OutlineItem[] {
  return items.map(item => item.id === id ? { ...item, children: [...(item.children || []), child] } : { ...item, children: item.children ? addChild(item.children, id, child) : undefined });
}
function withoutContent(items: OutlineItem[]): OutlineItem[] {
  return items.map(item => ({ ...item, title: item.title.trim(), content: '', content_source: 'none', children: item.children ? withoutContent(item.children) : undefined }));
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || '操作失败'); }
function savedConfig(state: FeasibilityReportState) { return { template: state.outlineTemplate, words: String(state.targetWords), references: state.referenceDocumentIds }; }
function getLatestTask(state: FeasibilityReportState) {
  const tasks = [state.outlineTask, state.outlineAdjustmentTask].filter((task): task is FeasibilityBackgroundTaskState => Boolean(task));
  return tasks.find(isTaskRunning) || tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || Number(b.type === 'feasibility-outline-adjustment') - Number(a.type === 'feasibility-outline-adjustment'))[0];
}

export default function OutlinePanel({ projectId, state, disabled = false, onStateChange, onDirtyChange, onBusyChange }: Props) {
  const { showToast } = useToast(); const { confirm } = useAppDialog();
  const [draft, setDraft] = useState<OutlineData | null>(state.outlineData);
  const [selectedId, setSelectedId] = useState(state.outlineData?.outline[0]?.id || '');
  const [expanded, setExpanded] = useState<string[]>(() => outlineEntries(state.outlineData?.outline || []).filter(entry => entry.level === 1 && entry.item.children?.length).map(entry => entry.item.id));
  const [pane, setPane] = useState<'tree' | 'detail'>('tree');
  const [query, setQuery] = useState(''); const [instruction, setInstruction] = useState('');
  const [submittedInstruction, setSubmittedInstruction] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false); const [config, setConfig] = useState(() => savedConfig(state));
  const [configError, setConfigError] = useState(''); const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState<'save' | 'generate' | 'adjust' | 'config' | ''>('');
  const [submittedTask, setSubmittedTask] = useState<FeasibilityBackgroundTaskState>();
  const busyRef = useRef(false); const titleRef = useRef<HTMLTextAreaElement>(null); const wordsRef = useRef<HTMLInputElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null); const detailHeadingRef = useRef<HTMLElement>(null); const rootRef = useRef<HTMLDivElement>(null);
  const savedSignature = JSON.stringify(state.outlineData);
  const baselineRef = useRef(savedSignature);
  const draftRef = useRef(draft); draftRef.current = draft;
  // 后台回放不重置本地草稿；保存成功或产物实际变化时才更新目录。
  useEffect(() => {
    if (baselineRef.current === savedSignature) return;
    const hadDraft = JSON.stringify(draftRef.current) !== baselineRef.current;
    baselineRef.current = savedSignature;
    if (hadDraft) { setOperationError('已保存目录发生变化，当前草稿保留；保存前请核对最新项目状态。'); return; }
    setDraft(state.outlineData);
    const entries = outlineEntries(state.outlineData?.outline || []);
    setSelectedId(current => entries.some(entry => entry.item.id === current) ? current : entries[0]?.item.id || '');
    setExpanded(entries.filter(entry => entry.level === 1 && entry.item.children?.length).map(entry => entry.item.id));
  }, [savedSignature, state.outlineData]);
  const task = submittedTask && ![state.outlineTask?.task_id, state.outlineAdjustmentTask?.task_id].includes(submittedTask.task_id) ? submittedTask : getLatestTask(state);
  useEffect(() => { if (submittedTask && [state.outlineTask?.task_id, state.outlineAdjustmentTask?.task_id].includes(submittedTask.task_id)) setSubmittedTask(undefined); }, [submittedTask, state.outlineTask, state.outlineAdjustmentTask]);
  const running = isTaskRunning(task);
  const locked = disabled || running || Boolean(busy);
  const dirty = JSON.stringify(draft) !== savedSignature;
  const configDirty = config.template !== state.outlineTemplate || Number(config.words) !== state.targetWords || JSON.stringify([...config.references].sort()) !== JSON.stringify([...state.referenceDocumentIds].sort());
  useEffect(() => { onDirtyChange?.(dirty || Boolean(instruction.trim()) || (settingsOpen && configDirty)); return () => onDirtyChange?.(false); }, [dirty, instruction, settingsOpen, configDirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(Boolean(busy)); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const entries = useMemo(() => outlineEntries(draft?.outline || []), [draft]);
  const selected = entries.find(entry => entry.item.id === selectedId);
  const templateLabel = templates.find(template => template.value === state.outlineTemplate)?.label || '通用大纲';
  const begin = (kind: typeof busy) => { if (busyRef.current || locked) return false; busyRef.current = true; setBusy(kind); setOperationError(''); setConfigError(''); return true; };
  const finish = () => { busyRef.current = false; setBusy(''); };
  const focusTitle = () => { setPane('detail'); requestAnimationFrame(() => titleRef.current?.focus()); };
  const applyState = (next: FeasibilityReportState) => {
    baselineRef.current = JSON.stringify(next.outlineData); setDraft(next.outlineData); onStateChange(next);
    const nextEntries = outlineEntries(next.outlineData?.outline || []);
    setSelectedId(current => nextEntries.some(entry => entry.item.id === current) ? current : nextEntries[0]?.item.id || '');
  };
  const restore = async () => {
    if (locked || busyRef.current) return;
    if (!await confirm({ title: '撤销目录修改', description: '将恢复已保存的目录，本次新增、删除和编辑的目录草稿会丢失，已保存正文不受影响。', confirmLabel: '撤销修改' })) return;
    setDraft(state.outlineData); setPane('tree'); setQuery(''); setOperationError(''); setSelectedId(state.outlineData?.outline[0]?.id || ''); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>('[aria-label="搜索报告目录"]')?.focus());
  };
  const save = async () => {
    if (locked || !dirty) return;
    const invalid = entries.find(entry => !entry.item.title.trim());
    if (!entries.length || invalid) { setOperationError(invalid ? '请填写目录标题后再保存。' : '至少保留一个目录项后再保存。'); if (invalid) { setSelectedId(invalid.item.id); focusTitle(); } return; }
    if (!draft || !begin('save')) return;
    try {
      if (!await confirm({ title: '保存报告目录', description: '保存目录后，旧关键参数、全部正文和相关生成缓存将被清空，需要重新生成。', confirmLabel: '保存并清空下游' })) return;
      if (!window.yibiao?.feasibilityReport) throw new Error('可研报告本地服务尚未就绪');
      applyState(await window.yibiao.feasibilityReport.saveOutline({ projectId, outlineData: { ...draft, outline: withoutContent(draft.outline) } }));
      showToast('报告目录已保存，请重新生成关键参数与正文', 'success'); focusTitle();
    } catch (error) { setOperationError(`保存目录失败：${errorMessage(error)}`); showToast(`保存目录失败：${errorMessage(error)}`, 'error'); }
    finally { finish(); }
  };
  const changeSelected = (patch: Partial<OutlineItem>) => { if (!locked && draft && selected) { setDraft({ ...draft, outline: updateNode(draft.outline, selected.item.id, patch) }); if (patch.title?.trim()) setOperationError(current => current === '请填写目录标题后再保存。' ? '' : current); } };
  const add = (asChild: boolean) => {
    if (locked || !draft || (asChild && (!selected || selected.level >= 3))) return;
    const node = { id: `manual-${crypto.randomUUID()}`, title: asChild ? '新增子目录' : '新增一级目录', description: '' };
    setDraft({ ...draft, outline: asChild && selected ? addChild(draft.outline, selected.item.id, node) : [...draft.outline, node] });
    if (asChild && selected) setExpanded(current => [...new Set([...current, selected.item.id])]);
    setQuery(''); setSelectedId(node.id); focusTitle();
  };
  const remove = async () => {
    if (locked || busyRef.current || !draft || !selected) return;
    busyRef.current = true;
    try {
      if (!await confirm({ title: '从目录草稿删除章节', description: `将从草稿删除“${selected.item.title || '未填写标题'}”及其子目录，保存目录后才会生效。`, confirmLabel: '删除草稿章节', danger: true })) return;
      const remaining = removeNode(draft.outline, selected.item.id);
      setDraft({ ...draft, outline: remaining }); setSelectedId(remaining[0]?.id || ''); setQuery('');
      requestAnimationFrame(() => remaining.length ? titleRef.current?.focus() : Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-outline-add]') || []).find(button => button.getClientRects().length)?.focus());
    } finally { busyRef.current = false; }
  };
  const validateConfig = () => {
    const words = Number(config.words);
    if (!config.words.trim() || !Number.isFinite(words) || !Number.isInteger(words) || words < 5000 || words > 200000) { setConfigError('目标全文字数需为 5,000 至 200,000 的整数。'); requestAnimationFrame(() => wordsRef.current?.focus()); return false; }
    return true;
  };
  const closeSettings = async () => {
    if (busyRef.current) return;
    if (configDirty && !await confirm({ title: '目录配置尚未保存', description: '关闭后，这次模板、字数和参考文档的修改会丢失。', confirmLabel: '放弃配置修改' })) return;
    setSettingsOpen(false); setConfig(savedConfig(state)); setConfigError('');
  };
  const runConfig = async (generate: boolean) => {
    if (!validateConfig() || !begin(generate ? 'generate' : 'config')) return;
    try {
      if (!generate && !configDirty) { setSettingsOpen(false); return; }
      if ((state.outlineData || dirty || instruction.trim() || state.keyParametersMarkdown) && !await confirm({ title: generate ? '重新生成报告目录' : '保存目录生成配置', description: `${dirty || instruction.trim() ? '未保存的目录草稿与调整要求会被放弃。' : ''}${generate ? '启动任务会' : '保存配置会'}清空已有报告目录、关键参数及正文。项目资料与分析底稿保留。`, confirmLabel: generate ? '确认重新生成' : '保存并清空产物', danger: true })) return;
      const bridge = window.yibiao?.feasibilityReport; if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const payload = { projectId, outlineTemplate: config.template, targetWords: Number(config.words), referenceDocumentIds: config.references };
      if (generate) {
        const nextTask = await bridge.startOutline(payload); setSubmittedTask(nextTask);
        // 启动成功后再放弃本地草稿，并读取 Main 已清空/更新的权威产物。
        setDraft(null); baselineRef.current = 'null'; setSelectedId(''); setInstruction('');
      } else { applyState(await bridge.saveOutlineConfig(payload)); setInstruction(''); }
      setSettingsOpen(false); setQuery(''); showToast(generate ? '报告目录生成已在后台启动' : '目录配置已保存，请重新生成报告目录', generate ? 'info' : 'success');
    } catch (error) { setConfigError(`${generate ? '启动目录生成' : '保存配置'}失败：${errorMessage(error)}`); showToast(errorMessage(error), 'error'); }
    finally { finish(); }
  };
  const adjust = async () => {
    if (dirty) { setOperationError('请先保存或撤销目录草稿，再进行 AI 调整。'); return; }
    if (!instruction.trim()) { instructionRef.current?.focus(); return; }
    if (!state.outlineData || !begin('adjust')) return;
    try {
      if (!await confirm({ title: 'AI 调整报告目录', description: 'AI 将调整已保存的整个报告目录。新目录保存成功后，关键参数和正文会被清空。', confirmLabel: '开始调整' })) return;
      const bridge = window.yibiao?.feasibilityReport; if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      setSubmittedTask(await bridge.startOutlineAdjustment({ projectId, instruction: instruction.trim() }));
      setSubmittedInstruction(instruction.trim()); setInstruction(''); showToast('AI 目录调整已在后台启动', 'info');
    } catch (error) { setOperationError(`启动目录调整失败：${errorMessage(error)}`); showToast(errorMessage(error), 'error'); }
    finally { finish(); }
  };
  return <div className="feasibility-outline-panel" ref={rootRef}>
    <div className="feasibility-outline-overview"><span>{templateLabel} · 约 {state.targetWords.toLocaleString('zh-CN')} 字 · {state.referenceDocumentIds.length} 份参考</span><button type="button" className="secondary-action" disabled={locked} onClick={() => { setConfig(savedConfig(state)); setConfigError(''); setSettingsOpen(true); }}>目录生成设置</button></div>
    {operationError && <div className="feasibility-operation-error" role="alert">{operationError}</div>}
    {task?.status === 'success' ? <details className="feasibility-outline-completed-task"><summary>上次目录任务已完成 · 查看过程</summary><ol>{task.logs.slice(-7).map((log, index) => <li key={index}>{log}</li>)}</ol></details> : <AnalysisTaskFeedback task={task} subject={task?.type === 'feasibility-outline-adjustment' ? '目录调整' : '目录生成'} hasResult={Boolean(state.outlineData)} />}
    <section className="feasibility-outline-editor">
      <header><div><strong>报告目录</strong><span role="status">{busy === 'save' ? '保存中' : dirty ? '目录草稿未保存' : state.outlineData ? '已保存目录' : '尚未生成'}</span></div><div className="feasibility-outline-actions"><button type="button" className="secondary-action" disabled={locked || !dirty} onClick={() => void restore()}>撤销修改</button><button type="button" className="primary-action" disabled={locked || !dirty} onClick={() => void save()}>{busy === 'save' ? '保存中…' : '保存目录'}</button></div></header>
      <div className={`feasibility-outline-columns is-${pane}`}><div className="feasibility-outline-pane-switch" role="group" aria-label="目录工作区视图"><button type="button" aria-pressed={pane === 'tree'} onClick={() => setPane('tree')}>章节目录</button><button type="button" aria-pressed={pane === 'detail'} disabled={!selected} onClick={() => setPane('detail')}>章节详情</button></div>
        <aside className="feasibility-outline-nav"><div className="feasibility-outline-nav-tools"><input type="search" aria-label="搜索报告目录" placeholder="搜索标题或编号" value={query} onChange={event => setQuery(event.target.value)} /><div><span>{draft?.outline.length || 0} 章 · {entries.length} 项</span><details><summary>更多操作</summary><div><button data-outline-add type="button" disabled={locked || !draft} onClick={() => add(false)}>添加一级目录</button><button type="button" disabled={!entries.length || Boolean(query.trim())} onClick={() => setExpanded(entries.filter(entry => entry.item.children?.length).map(entry => entry.item.id))}>全部展开</button><button type="button" disabled={!entries.length || Boolean(query.trim())} onClick={() => setExpanded([])}>全部折叠</button></div></details></div></div>
          <div className="feasibility-outline-tree-scroll">{entries.length ? <FeasibilityOutlineNavigator items={draft?.outline || []} selectedId={selectedId} expanded={expanded} query={query} onSelect={id => { setSelectedId(id); setPane('detail'); if ((rootRef.current?.clientWidth || 0) <= 720) requestAnimationFrame(() => detailHeadingRef.current?.focus()); }} onExpand={setExpanded} /> : <div className="feasibility-outline-empty"><strong>{running ? '正在组织报告目录' : dirty ? '目录草稿暂无章节' : '尚未生成报告目录'}</strong><p>{dirty ? '添加一级目录或撤销修改后继续。' : running ? '任务在后台执行，完成后会显示目录。' : '打开目录生成设置，选择模板、目标字数和参考资料。'}</p>{!running && <button data-outline-add type="button" className="secondary-action" disabled={locked || !state.analysisMarkdown.trim()} onClick={() => { if (dirty && draft) add(false); else { setConfig(savedConfig(state)); setSettingsOpen(true); } }}>{dirty ? '添加一级目录' : '设置并生成目录'}</button>}</div>}</div>
        </aside>
        <section className="feasibility-outline-detail" aria-label="目录项详情"><div className="feasibility-outline-detail-scroll">{selected ? <>
          <div className="feasibility-outline-detail-heading"><strong ref={detailHeadingRef} tabIndex={-1}>章节 {selected.number}</strong><span>{selected.level} 级目录</span></div>
          <label><span>目录标题 <small className="feasibility-outline-required">（必填）</small></span><textarea ref={titleRef} className="feasibility-outline-title-input" rows={2} value={selected.item.title} aria-required="true" aria-invalid={operationError === '请填写目录标题后再保存。' && !selected.item.title.trim()} disabled={locked} onChange={event => changeSelected({ title: event.target.value.replace(/[\r\n]+/g, ' ') })} /></label>
          <label>写作说明<textarea value={selected.item.description || ''} disabled={locked} onChange={event => changeSelected({ description: event.target.value })} placeholder="说明章节的内容边界、重点和编写要求" /></label>
          <div className="feasibility-outline-actions"><button type="button" className="secondary-action" disabled={locked || selected.level >= 3} title={selected.level >= 3 ? '报告目录最多支持三级' : '添加到当前目录下'} onClick={() => add(true)}>添加子目录</button><button type="button" className="secondary-action feasibility-outline-delete" disabled={locked} onClick={() => void remove()}>删除章节</button></div>
          <p className="feasibility-outline-note">修改暂存为草稿；保存目录后会清空关键参数及正文。</p>
        </> : <div className="feasibility-outline-empty">选择目录项，查看或修改标题与写作说明。</div>}
          {state.outlineData && <details className="feasibility-outline-ai"><summary>AI 调整整个目录</summary><label>调整要求<textarea ref={instructionRef} value={instruction} disabled={locked} onChange={event => setInstruction(event.target.value)} placeholder="例如：补充财务评价与敏感性分析章节" /></label><p>根据已保存目录调整；请先保存或撤销当前草稿。</p>{submittedInstruction && task?.type === 'feasibility-outline-adjustment' && task.status === 'error' && <button type="button" className="secondary-action" disabled={locked} onClick={() => { setInstruction(submittedInstruction); requestAnimationFrame(() => instructionRef.current?.focus()); }}>恢复上次调整要求</button>}<button type="button" className="secondary-action" disabled={locked || dirty || !instruction.trim()} onClick={() => void adjust()}>{busy === 'adjust' ? '正在启动…' : '开始调整目录'}</button></details>}
        </div></section>
      </div>
    </section>
    <AppDialog open={settingsOpen} onOpenChange={open => { if (!open) void closeSettings(); }} preventClose={Boolean(busy)} title="报告目录生成设置" description="配置模板、目标全文字数和可选参考文档。保存配置会清空现有目录及后续产物。" cardClassName="feasibility-outline-config-dialog" actions={<><button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={() => void closeSettings()}>取消</button><button type="button" className="secondary-action" disabled={locked || !configDirty} onClick={() => void runConfig(false)}>{busy === 'config' ? '保存中…' : '保存配置'}</button><button type="button" className="primary-action" disabled={locked || !state.analysisMarkdown.trim()} onClick={() => void runConfig(true)}>{busy === 'generate' ? '正在启动…' : state.outlineData ? '重新生成目录' : '开始生成目录'}</button></>}>
      <div className="feasibility-outline-config-scroll">{configError && !configError.startsWith('目标全文字数') && <div className="feasibility-operation-error" role="alert">{configError}</div>}<fieldset disabled={locked} className="feasibility-outline-config-fields"><label>适用模板<select value={config.template} onChange={event => setConfig(current => ({ ...current, template: event.target.value as FeasibilityOutlineTemplate }))}>{templates.map(template => <option key={template.value} value={template.value}>{template.label}</option>)}</select></label><label>目标全文字数<input ref={wordsRef} type="number" min={5000} max={200000} step={1000} value={config.words} aria-invalid={configError.startsWith('目标全文字数')} onChange={event => { const words = event.target.value; setConfig(current => ({ ...current, words })); if (Number.isInteger(Number(words)) && Number(words) >= 5000 && Number(words) <= 200000) setConfigError(current => current.startsWith('目标全文字数') ? '' : current); }} /><small>支持 5,000 至 200,000 字</small>{configError.startsWith('目标全文字数') && <small className="feasibility-outline-field-error" role="alert">{configError}</small>}</label></fieldset><OutlineReferencePicker selectedIds={config.references} onChange={references => setConfig(current => ({ ...current, references }))} disabled={locked} /></div>
    </AppDialog>
  </div>;
}
