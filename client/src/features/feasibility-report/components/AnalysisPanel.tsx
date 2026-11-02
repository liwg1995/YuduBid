import { useEffect, useRef, useState } from 'react';
import { AppDialog, MarkdownEditor, MarkdownRenderer, useAppDialog, useToast } from '../../../shared/ui';
import type { FeasibilityBackgroundTaskState, FeasibilityReportState } from '../types';
import { isTaskRunning } from './TaskProgressCard';
import AnalysisTaskFeedback from './AnalysisTaskFeedback';

interface Props {
  projectId: string;
  state: FeasibilityReportState;
  disabled?: boolean;
  onStateChange: (state: FeasibilityReportState) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}
type AnalysisView = 'preview' | 'markdown' | 'compare';
const views: { id: AnalysisView; label: string }[] = [{ id: 'preview', label: '阅读' }, { id: 'markdown', label: '源码' }, { id: 'compare', label: '对照' }];
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || '操作失败'); }

export default function AnalysisPanel({ projectId, state, disabled = false, onStateChange, onDirtyChange, onBusyChange }: Props) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.analysisMarkdown);
  const [view, setView] = useState<AnalysisView>('preview');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [submittedTask, setSubmittedTask] = useState<FeasibilityBackgroundTaskState>();
  const task = submittedTask && state.analysisTask?.task_id !== submittedTask.task_id ? submittedTask : state.analysisTask;
  const running = isTaskRunning(task);
  const busyRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dirty = editing && draft !== state.analysisMarkdown;
  const locked = disabled || running || saving || starting;
  const content = editing ? draft : state.analysisMarkdown;
  useEffect(() => { if (!editing) setDraft(state.analysisMarkdown); }, [editing, state.analysisMarkdown]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(saving || starting); return () => onBusyChange?.(false); }, [saving, starting, onBusyChange]);
  // 后台事件已接管后不再保留启动响应，避免后续新任务被旧响应遮挡。
  useEffect(() => { if (submittedTask && state.analysisTask?.task_id === submittedTask.task_id) setSubmittedTask(undefined); }, [submittedTask, state.analysisTask]);

  const start = async () => {
    if (busyRef.current || locked) return;
    busyRef.current = true; setStarting(true); setOperationError('');
    try {
      if ((dirty || state.analysisMarkdown || state.outlineData || state.keyParametersMarkdown) && !await confirm({
        title: '重新分析项目资料',
        description: `${dirty ? '这次未保存的修改将被放弃。' : ''}新分析成功保存后会替换原底稿，并清空已有报告目录、关键参数和正文。`, confirmLabel: '确认重新分析',
      })) return;
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const nextTask = await bridge.startAnalysis({ projectId });
      setSubmittedTask(nextTask); setEditing(false); setView('preview');
      showToast('项目分析已在后台启动', 'info');
    } catch (error) { const message = `启动分析失败：${errorMessage(error)}`; setOperationError(message); showToast(message, 'error'); }
    finally { busyRef.current = false; setStarting(false); }
  };
  const save = async () => {
    if (busyRef.current || locked) return;
    if (!draft.trim()) { setOperationError('分析底稿不能为空，请填写后保存。'); rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); return; }
    busyRef.current = true; setSaving(true); setOperationError('');
    try {
      if ((state.outlineData || state.keyParametersMarkdown) && !await confirm({ title: '保存分析底稿', description: '修改分析底稿后，已有报告目录、关键参数和正文将被清空。', confirmLabel: '保存并清空下游' })) return;
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      onStateChange(await bridge.saveAnalysis({ projectId, markdown: draft }));
      setEditing(false); setView('preview'); showToast('分析底稿已保存', 'success');
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>('[data-analysis-edit]')?.focus());
    } catch (error) { const message = `保存分析底稿失败：${errorMessage(error)}`; setOperationError(message); showToast(message, 'error'); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()); }
    finally { busyRef.current = false; setSaving(false); }
  };
  const cancelEdit = async () => {
    if (locked || busyRef.current) return;
    busyRef.current = true;
    try {
      if (dirty && !await confirm({ title: '分析底稿尚未保存', description: '取消后，这次修改会丢失。', confirmLabel: '放弃修改' })) return;
      setEditing(false); setDraft(state.analysisMarkdown); setView('preview'); setOperationError('');
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>('[data-analysis-edit]')?.focus());
    } finally { busyRef.current = false; }
  };
  return <div className="feasibility-analysis-panel" ref={rootRef}>
    <div className="feasibility-analysis-actions"><span>{state.sourceFiles.length ? `已导入 ${state.sourceFiles.length} 份资料` : '将基于已保存的项目基本信息分析'}</span><button type="button" className="primary-action" disabled={locked} onClick={() => void start()}>{starting ? '正在启动…' : running ? '分析中…' : task?.status === 'error' ? '重试分析' : state.analysisMarkdown ? '重新分析' : '开始分析'}</button></div>
    {operationError && <div className="feasibility-operation-error" role="alert">{operationError}</div>}
    {!editing && <AnalysisTaskFeedback task={task} hasResult={Boolean(state.analysisMarkdown)} />}
    <section className="feasibility-analysis-document" aria-label="分析底稿">
      <header><div><strong>分析底稿</strong><span role="status">{saving ? '保存中' : editing ? dirty ? '未保存修改' : '编辑中' : state.analysisMarkdown ? '已保存结果' : '尚未生成'}</span></div><div className="feasibility-analysis-document-actions">
        {editing ? <><button type="button" className="secondary-action" disabled={locked} onClick={() => void cancelEdit()}>取消编辑</button><button type="button" className="primary-action" disabled={locked || !dirty} onClick={() => void save()}>{saving ? '保存中…' : '保存底稿'}</button></> : <button data-analysis-edit type="button" className="secondary-action" disabled={locked || !state.analysisMarkdown} onClick={() => { setDraft(state.analysisMarkdown); setEditing(true); setView('markdown'); setOperationError(''); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()); }}>编辑底稿</button>}
        <button type="button" className="secondary-action" disabled={!content.trim()} onClick={() => setPreviewOpen(true)}>全屏预览</button>
      </div></header>
      <div className="feasibility-analysis-viewbar"><fieldset className="feasibility-analysis-views"><legend className="sr-only">底稿视图</legend>{views.filter(item => !editing || item.id !== 'preview').map(item => <label key={item.id}><input type="radio" name="feasibility-analysis-view" value={item.id} checked={view === item.id} onChange={() => setView(item.id)} /><span>{item.label}</span></label>)}</fieldset><span>{editing ? '保存底稿会清空后续目录、参数和正文' : '核对项目事实、缺口与编制依据'}</span></div>
      <div className={`feasibility-analysis-reading is-${view}`}>
        {view !== 'preview' && <div className="feasibility-analysis-markdown" aria-label="分析底稿源码">{editing ? <MarkdownEditor ariaLabel="分析底稿" value={draft} onChange={setDraft} disabled={locked} placeholder="在此校正资料分析底稿…" /> : <pre>{content || '尚无分析底稿'}</pre>}</div>}
        {view !== 'markdown' && <div className="feasibility-analysis-preview markdown-viewer" aria-label="分析底稿阅读">{content ? <MarkdownRenderer allowRawHtml={false}>{content}</MarkdownRenderer> : <div className="feasibility-pane-empty"><strong>{running ? '正在分析项目资料' : task?.status === 'error' ? '本次分析未完成' : '尚未生成分析底稿'}</strong><p>{running ? '分析完成后将在这里显示结果，可切换页面等待。' : task?.status === 'error' ? '请查看上方失败原因，调整后重试分析。' : '点击开始分析，提取项目事实、信息缺口与主要风险。'}</p></div>}</div>}
      </div>
    </section>
    <AppDialog open={previewOpen} onOpenChange={setPreviewOpen} title={editing ? '分析底稿草稿预览' : '分析底稿预览'} description={editing ? '当前预览包含尚未保存的修改。' : '已保存的资料分析结果。'} cardClassName="feasibility-analysis-full-preview" actions={<button type="button" className="secondary-action" onClick={() => setPreviewOpen(false)}>关闭预览</button>}><div className="markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{content}</MarkdownRenderer></div></AppDialog>
  </div>;
}
