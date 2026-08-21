import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { OutlineItem } from '../../../shared/types/outline';
import { MarkdownEditor, MarkdownRenderer, useAppDialog, useToast } from '../../../shared/ui';
import type { FeasibilityContentGenerationOptions, FeasibilityReportState } from '../types';
import { isTaskRunning } from './TaskProgressCard';

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
};

function normalizeGenerationOptions(options: FeasibilityContentGenerationOptions | undefined, imageModelAvailable: boolean, technicalDiagramAvailable: boolean, leafCount: number): FeasibilityContentGenerationOptions {
  const source = { ...defaultGenerationOptions, ...(options || {}) };
  return {
    useAiImages: Boolean(source.useAiImages && imageModelAvailable),
    maxAiImages: Math.max(0, Math.min(Math.round(Number(source.maxAiImages) || 0), Math.max(1, leafCount))),
    useMermaidImages: Boolean(source.useMermaidImages),
    useTechnicalDiagrams: Boolean(source.useTechnicalDiagrams && technicalDiagramAvailable),
  };
}

function ContentNavigation({ items, level, selectedId, reviewingNodeId, state, onSelect }: { items: OutlineItem[]; level: number; selectedId: string; reviewingNodeId: string; state: FeasibilityReportState; onSelect: (id: string) => void }) {
  return <>{items.map((item) => {
    const leaf = !item.children?.length;
    const childLeaves = leaf ? [] : collectLeaves(item.children || []);
    const completedChildren = childLeaves.filter(({ item: child }) => child.content?.trim()).length;
    const reviewing = Boolean(reviewingNodeId && (leaf ? item.id === reviewingNodeId : childLeaves.some(({ item: child }) => child.id === reviewingNodeId)));
    const status = reviewing ? 'running' : leaf
      ? state.contentSections[item.id]?.status || (item.content?.trim() ? 'success' : 'idle')
      : completedChildren === childLeaves.length && childLeaves.length ? 'success' : childLeaves.some(({ item: child }) => state.contentSections[child.id]?.status === 'running') ? 'running' : 'idle';
    const label = reviewing ? '审校中' : status === 'success' ? '已生成' : status === 'running' ? '生成中' : status === 'error' ? '生成失败' : '待生成';
    const words = String(item.content || '').replace(/\s+/g, '').length;
    return <div className="content-outline-node" key={item.id} style={{ '--content-level': level - 1 } as CSSProperties}>
      <button type="button" className={`content-outline-item is-${status}${item.id === selectedId ? ' is-active' : ''}`} onClick={() => leaf && onSelect(item.id)}>
        <span className="content-outline-dot" aria-hidden="true" />
        <span className="content-outline-text"><strong>{item.title}</strong><small>{leaf ? `${label} · ${words} 字` : `${label} · ${childLeaves.length} 个小节`}</small></span>
        <em>{label}</em>
      </button>
      {item.children?.length ? <ContentNavigation items={item.children} level={level + 1} selectedId={selectedId} reviewingNodeId={reviewingNodeId} state={state} onSelect={onSelect} /> : null}
    </div>;
  })}</>;
}

export default function ContentPanel({ projectId, state, onStateChange }: { projectId: string; state: FeasibilityReportState; onStateChange: (state: FeasibilityReportState) => void }) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const leaves = useMemo(() => collectLeaves(state.outlineData?.outline || []), [state.outlineData]);
  const [selectedId, setSelectedId] = useState(leaves[0]?.item.id || '');
  const selected = leaves.find((entry) => entry.item.id === selectedId) || leaves[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(selected?.item.content || '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [imageModelStatus, setImageModelStatus] = useState<'untested' | 'available' | 'unavailable'>('untested');
  const [technicalDiagramAvailable, setTechnicalDiagramAvailable] = useState(false);
  const [draftGenerationOptions, setDraftGenerationOptions] = useState<FeasibilityContentGenerationOptions>(state.contentGenerationOptions || defaultGenerationOptions);
  useEffect(() => {
    if (!leaves.some((entry) => entry.item.id === selectedId)) setSelectedId(leaves[0]?.item.id || '');
  }, [leaves, selectedId]);
  useEffect(() => { if (!editing) setDraft(selected?.item.content || ''); }, [editing, selected?.item.content, selected?.item.id]);
  const contentRunning = isTaskRunning(state.contentTask);
  const humanWritingRunning = isTaskRunning(state.humanWritingTask);
  const running = contentRunning || humanWritingRunning;
  const humanWritingStats = state.humanWritingTask?.stats && typeof state.humanWritingTask.stats === 'object' ? state.humanWritingTask.stats as { currentNodeId?: unknown } : undefined;
  const reviewingNodeId = humanWritingRunning && typeof humanWritingStats?.currentNodeId === 'string' ? humanWritingStats.currentNodeId : '';
  const failedIds = leaves.filter(({ item }) => state.contentSections[item.id]?.status === 'error').map(({ item }) => item.id);
  const completed = leaves.filter(({ item }) => String(item.content || '').trim()).length;
  const allContentCompleted = Boolean(leaves.length && completed === leaves.length);
  const hasContentTargets = Boolean(leaves.length && (!allContentCompleted || failedIds.length));

  const start = async (payload: { sectionIds?: string[]; regenerateAll?: boolean; contentGenerationOptions?: FeasibilityContentGenerationOptions } = {}) => {
    try { await window.yibiao!.feasibilityReport.startContent({ projectId, ...payload }); setGenerationDialogOpen(false); showToast('正文生成已在后台启动', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const openGenerationDialog = async () => {
    if (running) { showToast('正文任务进行中，请暂停后再修改生成配置', 'info'); return; }
    try {
      const config = await window.yibiao!.config.load();
      const nextImageStatus = config?.image_model?.status || 'untested';
      const nextTechnicalDiagramAvailable = Boolean(config?.skill_settings?.skills?.['technical-diagram']?.enabled);
      setImageModelStatus(nextImageStatus);
      setTechnicalDiagramAvailable(nextTechnicalDiagramAvailable);
      setDraftGenerationOptions(normalizeGenerationOptions(state.contentGenerationOptions, nextImageStatus === 'available', nextTechnicalDiagramAvailable, leaves.length));
      setGenerationDialogOpen(true);
    } catch (error) { showToast(error instanceof Error ? error.message : '读取正文生成配置失败', 'error'); }
  };
  const persistGenerationOptions = async () => {
    const options = normalizeGenerationOptions(draftGenerationOptions, imageModelStatus === 'available', technicalDiagramAvailable, leaves.length);
    const saveOptions = window.yibiao?.feasibilityReport?.saveContentGenerationOptions;
    if (typeof saveOptions !== 'function') {
      throw new Error('正文配图接口已更新，请重启客户端后再保存配置');
    }
    const nextState = await saveOptions({ projectId, contentGenerationOptions: options });
    onStateChange(nextState);
    setDraftGenerationOptions(options);
    return options;
  };
  const saveGenerationOptions = async () => {
    try { await persistGenerationOptions(); setGenerationDialogOpen(false); showToast('正文生成配置已保存', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '正文生成配置保存失败', 'error'); }
  };
  const startConfiguredGeneration = async () => {
    if (!hasContentTargets) { showToast('所有正文小节均已生成，无需补写', 'info'); return; }
    try { const options = await persistGenerationOptions(); await start({ contentGenerationOptions: options }); }
    catch (error) { showToast(error instanceof Error ? error.message : '启动正文生成失败', 'error'); }
  };
  const pause = async () => {
    try { await window.yibiao!.feasibilityReport.pauseContent({ projectId }); showToast('已请求暂停，当前小节完成后生效', 'info'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const regenerateCurrent = async () => {
    if (!selected) return;
    if (selected.item.content?.trim() && !await confirm({ title: '重新生成当前小节', description: `将覆盖“${selected.item.title}”现有正文，其他小节不受影响。`, confirmLabel: '重新生成', danger: true })) return;
    await start({ sectionIds: [selected.item.id] });
  };
  const regenerateAll = async () => {
    if (completed && !await confirm({ title: '重新生成全部正文', description: `将逐节覆盖当前已完成的 ${completed} 个小节。任务中途暂停时，尚未处理的小节仍保留原内容。`, confirmLabel: '重新生成全部', danger: true })) return;
    await start({ regenerateAll: true });
  };
  const save = async () => {
    if (!selected) return;
    try { onStateChange(await window.yibiao!.feasibilityReport.saveChapterContent({ projectId, nodeId: selected.item.id, content: draft })); setEditing(false); showToast('本节正文已保存', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const humanize = async (sectionIds?: string[]) => {
    const targetCount = sectionIds?.length || completed;
    if (!targetCount) { showToast('当前没有可审校的正文', 'info'); return; }
    if (!await confirm({ title: sectionIds?.length === 1 ? '自然化审校当前小节' : '自然化审校全部正文', description: `AI 将在保持事实、数字、表格、图片和 Mermaid 图不变的前提下改写 ${targetCount} 个小节，并逐节覆盖保存。`, confirmLabel: '开始审校' })) return;
    try { await window.yibiao!.feasibilityReport.startHumanWriting({ projectId, sectionIds }); showToast('自然化审校已在后台启动', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const fullMarkdown = useMemo(() => buildFullMarkdown(state.outlineData?.outline || []), [state.outlineData]);
  const mermaidCount = useMemo(() => countMermaid(state.outlineData?.outline || []), [state.outlineData]);

  const activeTask = humanWritingRunning || (state.humanWritingTask?.updated_at || '') > (state.contentTask?.updated_at || '') ? state.humanWritingTask : state.contentTask;
  const progress = !running && allContentCompleted ? 100 : Math.max(0, Math.min(100, Math.round(activeTask?.progress ?? (leaves.length ? completed / leaves.length * 100 : 0))));
  const statusText = running ? '进行中' : state.contentTask?.status === 'paused' ? '已暂停' : completed === leaves.length && leaves.length ? '已完成' : '等待开始';
  const statusMessage = !running && allContentCompleted ? '全部正文小节已生成。' : activeTask?.error || activeTask?.logs?.at(-1) || (completed ? `已完成 ${completed}/${leaves.length} 个小节。` : '点击“生成正文”后，后台会按目录顺序逐节撰写。');
  const configuredIllustrations = [state.contentGenerationOptions?.useAiImages ? 'AI 生图' : '', state.contentGenerationOptions?.useTechnicalDiagrams ? '技术图谱' : '', state.contentGenerationOptions?.useMermaidImages ? 'Mermaid' : ''].filter(Boolean);

  return <div className="feasibility-stage-content feasibility-content-layout">
    <section className="content-generation-command-bar feasibility-content-command-row">
      <div><strong>正文生成</strong><p>按目录叶子小节生成并即时保存。配图方式：{configuredIllustrations.join('、') || '不配图'}。</p></div>
      <div className="content-generation-stats" aria-label="正文生成统计"><span><strong>{leaves.length}</strong> 个小节</span><span><strong>{completed}</strong> 已生成</span><span><strong>{leaves.length - completed}</strong> 待生成</span></div>
      <div className="content-generation-actions">
        <button type="button" className="outline-config-action" disabled={running || !leaves.length} onClick={() => void openGenerationDialog()} aria-label="打开正文生成配置" title="正文生成配置">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.93a1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 10 3.01V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>
        </button>
        {contentRunning ? <button type="button" className="primary-action" onClick={() => void pause()}>暂停</button> : <button type="button" className="primary-action" disabled={humanWritingRunning || !hasContentTargets} onClick={() => void openGenerationDialog()}>{state.contentTask?.status === 'paused' ? '继续生成' : completed ? '补写正文' : '生成正文'}</button>}
      </div>
    </section>
    <section className="feasibility-content-utility-actions" aria-label="正文批量操作">
      <button type="button" className="secondary-action" disabled={running || !failedIds.length} onClick={() => void start({ sectionIds: failedIds })}>重试失败</button>
      <button type="button" className="secondary-action" disabled={running} onClick={() => void regenerateAll()}>重新生成全部</button>
      <button type="button" className="secondary-action" disabled={!selected?.item.content?.trim() || running} onClick={() => void humanize(selected ? [selected.item.id] : undefined)}>审校本节</button>
      <button type="button" className="secondary-action" disabled={!completed || running} onClick={() => void humanize()}>审校全文</button>
      <button type="button" className="secondary-action" disabled={!completed} onClick={() => setPreviewOpen(true)}>整篇预览</button>
    </section>
    <section className="content-generation-workspace feasibility-content-workspace">
      <aside className="content-outline-panel">
        <div className="analysis-result-head"><strong>报告目录</strong><span>{leaves.length} 个小节</span></div>
        <div className="content-outline-stats"><button type="button" aria-expanded="true"><span>生成进度</span><strong>{progress}%</strong><em>{statusText}</em></button><div className="content-outline-stats-body"><div className={`content-generation-progress-track${running ? ' is-active' : ''}`} aria-label={`正文生成进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div><p>{statusMessage}</p>{failedIds.length ? <small>失败 {failedIds.length} 个小节</small> : null}</div></div>
        <div className="content-outline-list"><ContentNavigation items={state.outlineData?.outline || []} level={1} selectedId={selected?.item.id || ''} reviewingNodeId={reviewingNodeId} state={state} onSelect={(id) => { setSelectedId(id); setEditing(false); }} /></div>
      </aside>
      <article className="content-reader-panel">
        {selected ? <><div className="content-reader-head"><div><span className="section-kicker">正文内容</span><strong>{selected.item.title}</strong><p>{selected.path.join(' / ')} · {state.contentSections[selected.item.id]?.status === 'running' ? '正在生成' : selected.item.content?.trim() ? '已生成' : '待生成'}</p></div><div className="content-reader-actions"><span className={`content-status-badge is-${selected.item.content?.trim() ? 'success' : state.contentSections[selected.item.id]?.status || 'idle'}`}>{selected.item.content?.trim() ? '已生成' : state.contentSections[selected.item.id]?.status === 'running' ? '生成中' : '待生成'}</span><button type="button" className="secondary-action" disabled={running} onClick={() => setEditing(!editing)}>{editing ? '取消' : '编辑'}</button>{editing ? <button type="button" className="primary-action" onClick={() => void save()}>保存</button> : <button type="button" className="secondary-action" disabled={running} onClick={() => void regenerateCurrent()}>重新生成本节</button>}</div></div><div className={editing ? '' : 'markdown-viewer content-generation-output'}>{editing ? <MarkdownEditor value={draft} onChange={setDraft} placeholder="在此编写本节正文…" /> : selected.item.content?.trim() ? <MarkdownRenderer allowRawHtml={false}>{selected.item.content}</MarkdownRenderer> : <div className="markdown-empty-state content-generation-empty"><strong>{state.contentSections[selected.item.id]?.status === 'running' ? '正在生成此章节' : '正文待生成'}</strong><p>{state.contentSections[selected.item.id]?.error || (state.contentSections[selected.item.id]?.status === 'running' ? '模型返回内容后会自动显示在这里。' : '点击上方“生成正文”后，后台会按目录顺序撰写并保存。')}</p></div>}</div></> : <div className="markdown-empty-state content-generation-empty"><strong>当前目录没有可生成的小节</strong></div>}
      </article>
    </section>
    <Dialog.Root open={generationDialogOpen} onOpenChange={setGenerationDialogOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="content-generation-config-card">
          <div className="content-regenerate-card-head">
            <span className="section-kicker">生成配置</span>
            <Dialog.Title>正文生成与配图配置</Dialog.Title>
            <Dialog.Description>配图会在正文生成后按章节价值进行编排，三种方式可同时启用。</Dialog.Description>
          </div>
          <div className="content-generation-config-list">
            <label className="content-generation-config-row">
              <span><strong>使用 AI 生图</strong><small>当前生图模型状态：{imageModelStatus === 'available' ? '可用' : imageModelStatus === 'unavailable' ? '不可用，请到设置页面检查生图模型' : '未测试，请到设置页面测试生图模型'}</small></span>
              <div className="content-generation-config-control">
                <em className={`content-image-status is-${imageModelStatus}`}>{imageModelStatus === 'available' ? '可用' : imageModelStatus === 'unavailable' ? '不可用' : '未测试'}</em>
                <Switch.Root className="content-generation-switch" checked={draftGenerationOptions.useAiImages && imageModelStatus === 'available'} disabled={imageModelStatus !== 'available'} onCheckedChange={(checked) => setDraftGenerationOptions((current) => ({ ...current, useAiImages: checked }))} aria-label="是否使用 AI 生图"><Switch.Thumb className="content-generation-switch-thumb" /></Switch.Root>
              </div>
            </label>
            <label className="content-generation-config-row">
              <span><strong>全文 AI 图片最大数量</strong><small>模型会按章节价值择优编排，不会要求每个小节都插图。</small></span>
              <input type="number" min="0" max={Math.max(1, leaves.length)} value={draftGenerationOptions.maxAiImages} disabled={!draftGenerationOptions.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraftGenerationOptions((current) => ({ ...current, maxAiImages: Math.max(0, Math.min(Math.round(Number(event.target.value) || 0), Math.max(1, leaves.length))) }))} />
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
            {draftGenerationOptions.useMermaidImages ? <p className="content-generation-config-note">Mermaid 图不会调用第三方图片转换服务，生成失败时保留正文，不影响后续章节。</p> : null}
          </div>
          <div className="content-regenerate-actions">
            <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
            <button type="button" className="secondary-action" onClick={() => void saveGenerationOptions()}>保存配置</button>
            <button type="button" className="primary-action" disabled={!hasContentTargets} onClick={() => void startConfiguredGeneration()}>{state.contentTask?.status === 'paused' ? '继续生成' : hasContentTargets ? (completed ? '补写正文' : '开始生成') : '无需补写'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}><Dialog.Portal><Dialog.Overlay className="detail-help-modal" /><Dialog.Content className="detail-help-card feasibility-full-preview"><header className="detail-help-head"><div><Dialog.Title>可行性研究报告整篇预览</Dialog.Title><Dialog.Description>{completed}/{leaves.length} 小节已完成，包含 {mermaidCount} 张 Mermaid 图。</Dialog.Description></div><Dialog.Close type="button" className="detail-help-close" aria-label="关闭整篇预览">×</Dialog.Close></header><div className="feasibility-full-preview-body markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{fullMarkdown}</MarkdownRenderer></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
