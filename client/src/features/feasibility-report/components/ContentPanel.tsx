import { BufferedNumberInput } from '../../../shared/ui/BufferedNumberInput';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineItem } from '../../../shared/types/outline';
import { MarkdownRenderer, useAppDialog, useToast } from '../../../shared/ui';
import FeasibilityOutlineNavigator, { outlineEntries } from './FeasibilityOutlineNavigator';
import FeasibilityMarkdownWorkspace from './FeasibilityMarkdownWorkspace';
import AnalysisTaskFeedback from './AnalysisTaskFeedback';
import './feasibilityContentDesign.css';
import type { FeasibilityBackgroundTaskState, FeasibilityContentGenerationOptions, FeasibilityReportState } from '../types';
import { isTaskRunning } from './TaskProgressCard';

const ContentWordPreview = lazy(() => import('../../technical-plan/components/ContentWordPreview'));

interface LeafEntry { item: OutlineItem; path: string[] }
function collectLeaves(items: OutlineItem[], parents: string[] = []): LeafEntry[] {
  return items.flatMap((item) => {
    const path = [...parents, item.title];
    return item.children?.length ? collectLeaves(item.children, path) : [{ item, path }];
  });
}

function buildFullMarkdown(items: OutlineItem[], level = 1): string {
  return items.map((item) => {
    const heading = `${'#'.repeat(Math.min(6, level))} ${item.title}`;
    const body = item.children?.length ? buildFullMarkdown(item.children, level + 1) : String(item.content || '').trim();
    return `${heading}\n\n${body}`.trim();
  }).join('\n\n');
}

function countMermaid(items: OutlineItem[]) {
  return collectLeaves(items).reduce((sum, { item }) => sum + (String(item.content || '').match(/```mermaid[\s\S]*?```/gi) || []).length, 0);
}

const defaultGenerationOptions: FeasibilityContentGenerationOptions = {
  useAiImages: false,
  maxAiImages: 6,
  useMermaidImages: true,
  useTechnicalDiagrams: true,
  autoReview: false,
};

function normalizeGenerationOptions(options: FeasibilityContentGenerationOptions | undefined, imageModelAvailable: boolean, technicalDiagramAvailable: boolean, leafCount: number): FeasibilityContentGenerationOptions {
  const source = { ...defaultGenerationOptions, ...(options || {}) };
  return {
    useAiImages: Boolean(source.useAiImages && imageModelAvailable),
    maxAiImages: Math.max(0, Math.min(Math.round(Number(source.maxAiImages) || 0), Math.max(1, leafCount))),
    useMermaidImages: Boolean(source.useMermaidImages),
    useTechnicalDiagrams: Boolean(source.useTechnicalDiagrams && technicalDiagramAvailable),
    autoReview: Boolean(source.autoReview),
  };
}

export default function ContentPanel({ projectId, state, onStateChange, disabled = false, onDirtyChange, onBusyChange }: { projectId: string; state: FeasibilityReportState; disabled?: boolean; onStateChange: (state: FeasibilityReportState) => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const operationRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const rememberDialogTrigger = () => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogTriggerRef.current = active?.closest('details')?.querySelector<HTMLElement>('summary') || active;
  };
  const restoreDialogFocus = (event: Event) => {
    const trigger = dialogTriggerRef.current;
    if (trigger?.isConnected && trigger.getClientRects().length && !trigger.matches(':disabled')) {
      event.preventDefault(); trigger.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    const closeMenus = (event: Event) => {
      const target = event.target as HTMLElement | null;
      rootRef.current?.querySelectorAll<HTMLDetailsElement>('.feasibility-content-more[open]').forEach(menu => {
        if (event.type === 'keydown') {
          if ((event as KeyboardEvent).key !== 'Escape') return;
          menu.open = false; menu.querySelector<HTMLElement>('summary')?.focus();
        } else if (!target || !menu.contains(target) || target.closest('button')) menu.open = false;
      });
    };
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => { document.removeEventListener('click', closeMenus); document.removeEventListener('keydown', closeMenus); };
  }, []);
  const [pending, setPending] = useState('');
  const [operationError, setOperationError] = useState('');
  const [submittedTask, setSubmittedTask] = useState<FeasibilityBackgroundTaskState>();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>(() => outlineEntries(state.outlineData?.outline || []).filter(entry => entry.item.children?.length).map(entry => entry.item.id));
  const [navOpen, setNavOpen] = useState(true);
  const leaves = useMemo(() => collectLeaves(state.outlineData?.outline || []), [state.outlineData]);
  const [selectedId, setSelectedId] = useState(leaves[0]?.item.id || '');
  const selected = leaves.find((entry) => entry.item.id === selectedId) || leaves[0];
  const chapterNumbers = useMemo(() => new Map(outlineEntries(state.outlineData?.outline || []).map(entry => [entry.item.id, entry.number])), [state.outlineData]);
  const selectedNumber = selected ? chapterNumbers.get(selected.item.id) : undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(selected?.item.content || '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [wordPreviewOpen, setWordPreviewOpen] = useState(false);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [imageModelStatus, setImageModelStatus] = useState<'untested' | 'available' | 'unavailable'>('untested');
  const [technicalDiagramAvailable, setTechnicalDiagramAvailable] = useState(false);
  const [draftGenerationOptions, setDraftGenerationOptions] = useState<FeasibilityContentGenerationOptions>(state.contentGenerationOptions || defaultGenerationOptions);
  useEffect(() => {
    if (!leaves.some((entry) => entry.item.id === selectedId)) setSelectedId(leaves[0]?.item.id || '');
  }, [leaves, selectedId]);
  useEffect(() => { if (!editing) setDraft(selected?.item.content || ''); }, [editing, selected?.item.content, selected?.item.id]);
  const taskSnapshot = submittedTask && ![state.contentTask?.task_id, state.humanWritingTask?.task_id].includes(submittedTask.task_id) ? submittedTask : undefined;
  useEffect(() => { if (submittedTask && [state.contentTask?.task_id, state.humanWritingTask?.task_id].includes(submittedTask.task_id)) setSubmittedTask(undefined); }, [submittedTask, state.contentTask, state.humanWritingTask]);
  const dirty = editing && draft !== (selected?.item.content || '');
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(Boolean(pending)); return () => onBusyChange?.(false); }, [pending, onBusyChange]);
  const contentRunning = isTaskRunning(state.contentTask) || (taskSnapshot?.type === 'feasibility-content' && isTaskRunning(taskSnapshot));
  const humanWritingRunning = isTaskRunning(state.humanWritingTask) || (taskSnapshot?.type === 'feasibility-human-writing' && isTaskRunning(taskSnapshot));
  const running = contentRunning || humanWritingRunning;
  const humanWritingStats = state.humanWritingTask?.stats && typeof state.humanWritingTask.stats === 'object' ? state.humanWritingTask.stats as { currentNodeId?: unknown } : undefined;
  const reviewingNodeId = humanWritingRunning && typeof humanWritingStats?.currentNodeId === 'string' ? humanWritingStats.currentNodeId : '';
  const failedIds = leaves.filter(({ item }) => state.contentSections[item.id]?.status === 'error').map(({ item }) => item.id);
  const completed = leaves.filter(({ item }) => String(item.content || '').trim()).length;
  const allContentCompleted = Boolean(leaves.length && completed === leaves.length);
  const hasContentTargets = Boolean(leaves.length && (!allContentCompleted || failedIds.length));

  const locked = disabled || running || Boolean(pending);
  const bridge = () => { const api = window.yibiao?.feasibilityReport; if (!api) throw new Error('可研报告本地服务尚未就绪'); return api; };
  const runOperation = async (label: string, operation: () => Promise<void>) => {
    if (operationRef.current) return;
    operationRef.current = true; setPending(label); setOperationError('');
    try { await operation(); }
    catch (error) { const message = `${label}失败：${error instanceof Error ? error.message : String(error)}`; setOperationError(message); showToast(message, 'error'); }
    finally { operationRef.current = false; setPending(''); }
  };
  const discardDraft = () => !dirty ? Promise.resolve(true) : confirm({ title: '本节正文尚未保存', description: '继续后，本节未保存的修改会丢失。', confirmLabel: '放弃修改并继续' });
  const cancelEditing = async () => { if (locked || operationRef.current || !await discardDraft()) return; setDraft(selected?.item.content || ''); setEditing(false); setOperationError(''); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>('[data-content-edit]')?.focus()); };
  const selectSection = async (id: string) => { if (pending || id === selectedId || !leaves.some(entry => entry.item.id === id) || !await discardDraft()) return; setSelectedId(id); setEditing(false); setNavOpen(false); if ((rootRef.current?.clientWidth || 0) <= 720) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[data-content-heading]')?.focus()); };
  const launch = async (payload: { sectionIds?: string[]; regenerateAll?: boolean; contentGenerationOptions?: FeasibilityContentGenerationOptions }) => {
    setSubmittedTask(await bridge().startContent({ projectId, ...payload })); setEditing(false); setGenerationDialogOpen(false); showToast('正文生成已在后台启动', 'info');
  };
  const start = async (payload: { sectionIds?: string[]; regenerateAll?: boolean; contentGenerationOptions?: FeasibilityContentGenerationOptions } = {}, description?: string) => {
    if (locked || !leaves.length || !state.keyParametersMarkdown.trim()) return;
    await runOperation('启动正文生成', async () => { if (!await discardDraft()) return; if (description && !await confirm({ title: '重新生成正文', description, confirmLabel: '确认重新生成', danger: true })) return; await launch(payload); });
  };
  const openGenerationDialog = async () => {
    if (locked) return;
    rememberDialogTrigger();
    await runOperation('读取生成配置', async () => {
      if (!window.yibiao?.config) throw new Error('配置服务尚未就绪');
      const config = await window.yibiao.config.load();
      const status = config?.image_model?.status || 'untested';
      const available = Boolean(config?.skill_settings?.skills?.['technical-diagram']?.enabled);
      setImageModelStatus(status); setTechnicalDiagramAvailable(available);
      setDraftGenerationOptions(normalizeGenerationOptions(state.contentGenerationOptions, status === 'available', available, leaves.length)); setGenerationDialogOpen(true);
    });
  };
  const persistGenerationOptions = async () => {
    const options = normalizeGenerationOptions(draftGenerationOptions, imageModelStatus === 'available', technicalDiagramAvailable, leaves.length);
    onStateChange(await bridge().saveContentGenerationOptions({ projectId, contentGenerationOptions: options })); setDraftGenerationOptions(options); return options;
  };
  const saveGenerationOptions = () => runOperation('保存生成配置', async () => { await persistGenerationOptions(); setGenerationDialogOpen(false); showToast('生成配置已保存', 'success'); });
  const startConfiguredGeneration = () => runOperation('启动正文生成', async () => { if (!hasContentTargets || !await discardDraft()) return; const options = await persistGenerationOptions(); await launch({ contentGenerationOptions: options }); });
  const pause = () => runOperation('请求暂停', async () => { await bridge().pauseContent({ projectId }); showToast('已请求暂停，当前小节完成后生效', 'info'); });
  const regenerateCurrent = () => selected && start({ sectionIds: [selected.item.id] }, selected.item.content?.trim() ? `将重新撰写“${selected.item.title}”，新内容返回后覆盖保存。其他小节保留。` : undefined);
  const regenerateAll = () => start({ regenerateAll: true }, completed ? `将逐节覆盖已完成的 ${completed} 个小节，未处理的小节保留原文。` : undefined);
  const save = async () => {
    if (!selected || locked || !dirty) return;
    await runOperation('保存正文', async () => {
      if (!draft.trim() && selected.item.content?.trim() && !await confirm({ title: '清空本节正文', description: '保存空内容后，本节已保存正文将被清空。', confirmLabel: '确认清空', danger: true })) return;
      onStateChange(await bridge().saveChapterContent({ projectId, nodeId: selected.item.id, content: draft })); setEditing(false); showToast('本节正文已保存', 'success'); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>('[data-content-edit]')?.focus());
    });
  };
  const humanize = async (sectionIds?: string[]) => {
    if (locked || !(sectionIds?.length || completed)) return;
    await runOperation('启动审校', async () => {
      if (!await discardDraft() || !await confirm({ title: sectionIds?.length === 1 ? '审校当前小节' : '审校全部正文', description: `审校将逐节覆盖已保存正文；事实、数字、表格与图片须保持不变，失败时保留原正文。`, confirmLabel: '开始审校' })) return;
      setSubmittedTask(await bridge().startHumanWriting({ projectId, sectionIds })); setEditing(false); showToast('自然化审校已在后台启动', 'info');
    });
  };
  const fullMarkdown = useMemo(() => buildFullMarkdown(state.outlineData?.outline || []), [state.outlineData]);
  const mermaidCount = useMemo(() => countMermaid(state.outlineData?.outline || []), [state.outlineData]);

  const activeTask = taskSnapshot || (humanWritingRunning || (state.humanWritingTask?.updated_at || '') > (state.contentTask?.updated_at || '') ? state.humanWritingTask : state.contentTask);
  const selectedStatusLabel = reviewingNodeId === selected?.item.id ? '审校中' : state.contentSections[selected?.item.id || '']?.status === 'error' ? selected?.item.content?.trim() ? '生成失败，已有正文保留' : '生成失败' : state.contentSections[selected?.item.id || '']?.status === 'running' ? '生成中' : selected?.item.content?.trim() ? '已保存正文' : '待生成';
  return <div className="feasibility-content-design feasibility-analysis-panel" ref={rootRef}>
    <div className="feasibility-content-actions"><span>已保存 {completed} / {leaves.length} 节 · 失败 {failedIds.length} 节</span><div><button type="button" className="secondary-action" disabled={locked || !leaves.length} onClick={() => void openGenerationDialog()}>生成配置</button>{contentRunning ? <button type="button" className="primary-action" disabled={Boolean(pending) || state.contentTask?.status === 'pausing'} onClick={() => void pause()}>{state.contentTask?.status === 'pausing' ? '暂停中…' : '暂停生成'}</button> : <button type="button" className={editing ? 'secondary-action' : 'primary-action'} disabled={locked || !hasContentTargets || !state.keyParametersMarkdown.trim()} onClick={() => void openGenerationDialog()}>{pending || (state.contentTask?.status === 'paused' ? '继续生成' : completed ? '补写正文' : '生成正文')}</button>}<details className="feasibility-content-more"><summary>更多操作</summary><div><button type="button" disabled={locked || !failedIds.length} onClick={() => void start({ sectionIds: failedIds })}>重试失败小节</button><button type="button" disabled={locked || !leaves.length} onClick={() => void regenerateAll()}>重新生成全部</button><button type="button" disabled={locked || !completed} onClick={() => void humanize()}>审校全文</button><button type="button" disabled={!completed || editing} onClick={() => { rememberDialogTrigger(); setPreviewOpen(true); }}>整篇预览</button></div></details></div></div>
    {operationError && <div className="feasibility-operation-error" role="alert">{operationError}</div>}
    {!editing && activeTask && (activeTask.status === 'success' ? <details className="feasibility-content-completed"><summary>上次任务已完成 · 查看过程</summary><ol>{activeTask.logs.slice(-7).map((log, index) => <li key={index}>{log}</li>)}</ol></details> : <AnalysisTaskFeedback task={activeTask} hasResult={Boolean(completed)} subject={activeTask.type === 'feasibility-human-writing' ? '正文审校' : '正文生成'} />)}
    <div className="feasibility-content-pane-toggle"><button type="button" className="secondary-action" aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}>{navOpen ? '阅读本节' : '章节目录'}</button><span>{selected?.item.title}</span></div>
    <section className={`feasibility-content-columns${navOpen ? ' show-nav' : ''}`}>
      <aside className="feasibility-content-nav"><strong>章节目录</strong><input type="search" aria-label="搜索正文章节" placeholder="搜索名称或编号" value={query} onChange={event => setQuery(event.target.value)} /><div><FeasibilityOutlineNavigator items={state.outlineData?.outline || []} selectedId={selected?.item.id || ''} query={query} expanded={expanded} onExpand={setExpanded} onSelect={id => void selectSection(id)} leafOnly statusForItem={item => item.id === reviewingNodeId ? '审校中' : state.contentSections[item.id]?.status === 'error' ? '失败' : state.contentSections[item.id]?.status === 'running' ? '生成中' : item.content?.trim() ? '已保存' : '待生成'} /></div></aside>
      <div className="feasibility-content-reading"><div className="feasibility-content-context"><strong data-content-heading tabIndex={-1}>{selectedNumber && <span className="feasibility-content-section-number">{selectedNumber}</span>}{selected?.item.title || '尚无可生成小节'}</strong>{state.contentSections[selected?.item.id || '']?.error && <details><summary>失败原因</summary><p role="alert">{state.contentSections[selected?.item.id || '']?.error}</p></details>}{selected && <details><summary>写作说明</summary><p>{selected.item.description || '未设置写作说明。'}</p></details>}</div>
      <FeasibilityMarkdownWorkspace title="本节正文" content={editing ? draft : selected?.item.content || ''} editing={editing} disabled={locked} status={pending || (editing ? dirty ? '未保存修改' : '编辑中' : selectedStatusLabel)} note={editing ? '保存当前小节后再导出' : '正文以已保存内容为准'} onChange={setDraft} empty={<div className="feasibility-pane-empty"><strong>{selected ? selectedStatusLabel : '当前目录没有可生成的小节'}</strong><p>{state.contentSections[selected?.item.id || '']?.error || '完成目录与关键参数后，生成或手动编写本节正文。'}</p></div>} actions={selected ? editing ? <><button type="button" className="secondary-action" disabled={locked} onClick={() => void cancelEditing()}>取消编辑</button><button type="button" className="primary-action" disabled={locked || !dirty} onClick={() => void save()}>保存本节</button></> : <><button data-content-edit type="button" className="secondary-action" disabled={locked} onClick={() => { setDraft(selected.item.content || ''); setEditing(true); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()); }}>编辑本节</button><button type="button" className="secondary-action" disabled={locked} onClick={() => void regenerateCurrent()}>重新生成本节</button><details className="feasibility-content-more"><summary>更多</summary><div><button type="button" disabled={locked || !selected.item.content?.trim()} onClick={() => void humanize([selected.item.id])}>审校本节</button><button type="button" disabled={!selected.item.content?.trim()} onClick={() => { rememberDialogTrigger(); setWordPreviewOpen(true); }}>Word 预览</button></div></details></> : null} /></div>
    </section>
    <Dialog.Root open={generationDialogOpen} onOpenChange={open => { if (!pending) setGenerationDialogOpen(open); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content onCloseAutoFocus={restoreDialogFocus} className="content-generation-config-card feasibility-content-config" onEscapeKeyDown={pending ? event => event.preventDefault() : undefined} onPointerDownOutside={pending ? event => event.preventDefault() : undefined}>
          <div className="content-regenerate-card-head">
            <span className="section-kicker">生成配置</span>
            <Dialog.Title>正文生成与配图配置</Dialog.Title>
            <Dialog.Description>配图会在正文生成后按章节价值进行编排，三种方式可同时启用。</Dialog.Description>
          </div>
          <fieldset disabled={Boolean(pending)} className="content-generation-config-list">{operationError && <div className="feasibility-operation-error" role="alert">{operationError}</div>}
            <label className="content-generation-config-row">
              <span><strong>使用 AI 生图</strong><small>当前生图模型状态：{imageModelStatus === 'available' ? '可用' : imageModelStatus === 'unavailable' ? '不可用，请到设置页面检查生图模型' : '未测试，请到设置页面测试生图模型'}</small></span>
              <div className="content-generation-config-control">
                <em className={`content-image-status is-${imageModelStatus}`}>{imageModelStatus === 'available' ? '可用' : imageModelStatus === 'unavailable' ? '不可用' : '未测试'}</em>
                <Switch.Root className="content-generation-switch" checked={draftGenerationOptions.useAiImages && imageModelStatus === 'available'} disabled={imageModelStatus !== 'available'} onCheckedChange={(checked) => setDraftGenerationOptions((current) => ({ ...current, useAiImages: checked }))} aria-label="是否使用 AI 生图"><Switch.Thumb className="content-generation-switch-thumb" /></Switch.Root>
              </div>
            </label>
            <label className="content-generation-config-row">
              <span><strong>全文 AI 图片最大数量</strong><small>模型会按章节价值择优编排，不会要求每个小节都插图。</small></span>
              <BufferedNumberInput type="number" min="0" max={Math.max(1, leaves.length)} value={draftGenerationOptions.maxAiImages} disabled={!draftGenerationOptions.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraftGenerationOptions((current) => ({ ...current, maxAiImages: Math.max(0, Math.min(Math.round(Number(event.target.value) || 0), Math.max(1, leaves.length))) }))} />
            </label>
            <label className="content-generation-config-row">
              <span><strong>生成技术图谱</strong><small>{technicalDiagramAvailable ? '适合架构、拓扑、数据流、复杂流程和模块关系图。' : '请先到 设置 > 技能管理 启用 technical-diagram。'}</small></span>
              <div className="content-generation-config-control">
                <em className={`content-image-status ${technicalDiagramAvailable ? 'is-available' : 'is-unavailable'}`}>{technicalDiagramAvailable ? '已启用' : '未启用'}</em>
                <Switch.Root className="content-generation-switch" checked={draftGenerationOptions.useTechnicalDiagrams && technicalDiagramAvailable} disabled={!technicalDiagramAvailable} onCheckedChange={(checked) => setDraftGenerationOptions((current) => ({ ...current, useTechnicalDiagrams: checked }))} aria-label="是否生成技术图谱"><Switch.Thumb className="content-generation-switch-thumb" /></Switch.Root>
              </div>
            </label>
            <label className="content-generation-config-row">
              <span><strong>生成 Mermaid 图片</strong><small>适合流程、层级、时间线和关系图，预览和 Word 导出均在本地转换。</small></span>
              <Switch.Root className="content-generation-switch" checked={draftGenerationOptions.useMermaidImages} onCheckedChange={(checked) => setDraftGenerationOptions((current) => ({ ...current, useMermaidImages: checked }))} aria-label="是否生成 Mermaid 图片"><Switch.Thumb className="content-generation-switch-thumb" /></Switch.Root>
            </label>
            <label className="content-generation-config-row">
              <span><strong>生成后自动自然化审校</strong><small>每节正文保存后调用 AI 审校，校验事实、数字、表格和图片；审校失败时保留原正文。</small></span>
              <Switch.Root className="content-generation-switch" checked={draftGenerationOptions.autoReview} onCheckedChange={(checked) => setDraftGenerationOptions((current) => ({ ...current, autoReview: checked }))} aria-label="是否生成后自动自然化审校"><Switch.Thumb className="content-generation-switch-thumb" /></Switch.Root>
            </label>
            {draftGenerationOptions.useMermaidImages ? <p className="content-generation-config-note">Mermaid 图不会调用第三方图片转换服务，生成失败时保留正文，不影响后续章节。</p> : null}
          </fieldset>
          <div className="content-regenerate-actions">
            <Dialog.Close className="secondary-action" disabled={Boolean(pending)} type="button">取消</Dialog.Close>
            <button type="button" className="secondary-action" disabled={Boolean(pending)} onClick={() => void saveGenerationOptions()}>保存配置</button>
            <button type="button" className="primary-action" disabled={!hasContentTargets || Boolean(pending)} onClick={() => void startConfiguredGeneration()}>{state.contentTask?.status === 'paused' ? '继续生成' : hasContentTargets ? (completed ? '补写正文' : '开始生成') : '无需补写'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}><Dialog.Portal><Dialog.Overlay className="detail-help-modal" /><Dialog.Content onCloseAutoFocus={restoreDialogFocus} className="detail-help-card feasibility-full-preview"><header className="detail-help-head"><div><Dialog.Title>可行性研究报告整篇预览</Dialog.Title><Dialog.Description>{completed}/{leaves.length} 小节已完成，包含 {mermaidCount} 张 Mermaid 图。</Dialog.Description></div><Dialog.Close type="button" className="detail-help-close" aria-label="关闭整篇预览">×</Dialog.Close></header><div className="feasibility-full-preview-body markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{fullMarkdown}</MarkdownRenderer></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={wordPreviewOpen} onOpenChange={setWordPreviewOpen}><Dialog.Portal><Dialog.Overlay className="content-word-overlay" /><Dialog.Content onCloseAutoFocus={restoreDialogFocus} className="content-word-dialog"><div className="content-word-dialog-head"><div><Dialog.Title>{selected?.item.title || 'Word 预览'}</Dialog.Title><Dialog.Description>按本地基础排版预览当前小节；最终文件以实际导出排版为准。</Dialog.Description></div><Dialog.Close type="button" className="secondary-action">关闭</Dialog.Close></div>{wordPreviewOpen && selected ? <Suspense fallback={<div className="content-word-status">正在加载预览组件…</div>}><ContentWordPreview sectionId={selected.item.id} title={selected.item.title} content={selected.item.content || ''} projectName={state.projectInfo.projectName || state.projectName} documentProfile="feasibility-report" /></Suspense> : null}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
