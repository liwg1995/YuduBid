import { useEffect, useRef, useState } from 'react';
import { useAppDialog, useToast } from '../../../shared/ui';
import type { FeasibilityBackgroundTaskState, FeasibilityReportState } from '../types';
import { isTaskRunning } from './TaskProgressCard';
import AnalysisTaskFeedback from './AnalysisTaskFeedback';
import FeasibilityMarkdownWorkspace from './FeasibilityMarkdownWorkspace';

interface Props {
  projectId: string; state: FeasibilityReportState; disabled?: boolean;
  onStateChange: (state: FeasibilityReportState) => void;
  onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error || '操作失败'); }
export default function ParametersPanel({ projectId, state, disabled = false, onStateChange, onDirtyChange, onBusyChange }: Props) {
  const { showToast } = useToast(); const { confirm } = useAppDialog();
  const [draft, setDraft] = useState(state.keyParametersMarkdown);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'generate' | ''>('');
  const [error, setError] = useState('');
  const [submittedTask, setSubmittedTask] = useState<FeasibilityBackgroundTaskState>();
  const busyRef = useRef(false); const rootRef = useRef<HTMLDivElement>(null);
  const task = submittedTask && state.parametersTask?.task_id !== submittedTask.task_id ? submittedTask : state.parametersTask;
  const running = isTaskRunning(task); const locked = disabled || running || Boolean(busy);
  const dirty = editing && draft !== state.keyParametersMarkdown;
  const hasInputs = Boolean(state.analysisMarkdown.trim() && state.outlineData?.outline.length);
  useEffect(() => { if (!editing) setDraft(state.keyParametersMarkdown); }, [editing, state.keyParametersMarkdown]);
  useEffect(() => { if (submittedTask && state.parametersTask?.task_id === submittedTask.task_id) setSubmittedTask(undefined); }, [submittedTask, state.parametersTask]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(Boolean(busy)); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const focusEditor = () => requestAnimationFrame(() => rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
  const focusEditButton = () => requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>('[data-parameters-edit]')?.focus());
  const begin = (kind: typeof busy) => { if (busyRef.current || locked) return false; busyRef.current = true; setBusy(kind); setError(''); return true; };
  const finish = () => { busyRef.current = false; setBusy(''); };
  const generate = async () => {
    if (!hasInputs || !begin('generate')) return;
    try {
      if ((dirty || state.keyParametersMarkdown.trim()) && !await confirm({ title: '重新生成关键参数', description: `${dirty ? '这次未保存的修改将被放弃。' : ''}新参数保存成功后会替换原口径，并清空已有正文和相关生成缓存；报告目录保留。`, confirmLabel: '确认重新生成' })) return;
      const bridge = window.yibiao?.feasibilityReport; if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      setSubmittedTask(await bridge.startParameters({ projectId }));
      setEditing(false); showToast('关键参数生成已在后台启动', 'info');
    } catch (cause) { const message = `启动关键参数生成失败：${errorMessage(cause)}`; setError(message); showToast(message, 'error'); }
    finally { finish(); }
  };
  const save = async () => {
    if (locked || !dirty) return;
    if (!draft.trim()) { setError('关键参数不能为空，请填写后保存。'); focusEditor(); return; }
    if (!begin('save')) return;
    try {
      if (!await confirm({ title: '保存关键参数', description: '保存后，已有正文和相关生成缓存将被清空，需要按新口径重新生成。报告目录和分析底稿保留。', confirmLabel: '保存并清空正文' })) return;
      const bridge = window.yibiao?.feasibilityReport; if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      onStateChange(await bridge.saveKeyParameters({ projectId, markdown: draft }));
      setEditing(false); showToast('关键参数已保存，请按新口径生成正文', 'success'); focusEditButton();
    } catch (cause) { const message = `保存关键参数失败：${errorMessage(cause)}`; setError(message); showToast(message, 'error'); focusEditor(); }
    finally { finish(); }
  };
  const cancel = async () => {
    if (locked || busyRef.current) return;
    busyRef.current = true;
    try {
      if (dirty && !await confirm({ title: '关键参数尚未保存', description: '取消后，这次参数修改会丢失。已保存参数和正文不受影响。', confirmLabel: '放弃参数修改' })) return;
      setDraft(state.keyParametersMarkdown); setEditing(false); setError(''); focusEditButton();
    } finally { busyRef.current = false; }
  };
  const content = editing ? draft : state.keyParametersMarkdown;
  return <div className="feasibility-analysis-panel feasibility-parameters-panel" ref={rootRef}>
    <div className="feasibility-analysis-actions"><span>{hasInputs ? '基于已保存的分析与目录统一全文口径' : '请先完成资料分析和报告目录'}</span><button type="button" className={editing ? 'secondary-action' : 'primary-action'} disabled={locked || !hasInputs} onClick={() => void generate()}>{busy === 'generate' ? '正在启动…' : running ? '生成中…' : task?.status === 'error' ? '重试生成关键参数' : state.keyParametersMarkdown.trim() ? '重新生成参数' : '生成关键参数'}</button></div>
    {error && <div className="feasibility-operation-error" role="alert">{error}</div>}
    {!editing && (task?.status === 'success' ? <details className="feasibility-parameters-completed-task"><summary>上次参数任务已完成 · 查看过程</summary><ol>{task.logs.slice(-7).map((log, index) => <li key={index}>{log}</li>)}</ol></details> : <AnalysisTaskFeedback task={task} subject="关键参数生成" hasResult={Boolean(state.keyParametersMarkdown.trim())} />)}
    <FeasibilityMarkdownWorkspace title="关键参数" content={content} editing={editing} disabled={locked} status={busy === 'save' ? '保存中' : editing ? dirty ? '未保存修改' : '编辑中' : state.keyParametersMarkdown.trim() ? '已保存参数' : '尚未生成'} note={editing ? '保存参数会清空正文，目录保留' : '核对投资、周期、规模及待确认信息'} onChange={value => { setDraft(value); if (value.trim()) setError(current => current === '关键参数不能为空，请填写后保存。' ? '' : current); }} empty={<div className="feasibility-pane-empty"><strong>{running ? '正在整理关键参数' : task?.status === 'error' ? '本次参数生成未完成' : '尚未生成关键参数'}</strong><p>{running ? '任务在后台执行，完成后会显示统一口径。' : !hasInputs ? '请先完成资料分析和报告目录。' : task?.status === 'error' ? '请查看失败原因，调整后重试生成。' : '生成后核对建设规模、投资、周期和效益指标。'}</p></div>} actions={editing ? <><button type="button" className="secondary-action" disabled={locked} onClick={() => void cancel()}>取消编辑</button><button type="button" className="primary-action" disabled={locked || !dirty} onClick={() => void save()}>{busy === 'save' ? '保存中…' : '保存参数'}</button></> : <button data-parameters-edit type="button" className="secondary-action" disabled={locked || !state.keyParametersMarkdown.trim()} onClick={() => { setDraft(state.keyParametersMarkdown); setEditing(true); setError(''); focusEditor(); }}>编辑参数</button>} />
  </div>;
}
