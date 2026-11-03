import BusinessTaskProgress from '../../../shared/ui/BusinessTaskProgress';
import type { FeasibilityBackgroundTaskState } from '../types';

const statusLabels = { pausing: '暂停中', stopping: '停止中', stopped: '已停止', paused: '已暂停' };

export default function AnalysisTaskFeedback({ task, hasResult, subject = '分析' }: { task?: FeasibilityBackgroundTaskState; hasResult: boolean; subject?: string }) {
  if (!task) return null;
  const status = task.status === 'running' ? `${subject}中` : task.status === 'success' ? `${subject}已完成` : task.status === 'error' ? `${subject}失败` : statusLabels[task.status];
  const hasProgress = Number.isFinite(task.progress) && task.progress >= 0;
  const logs = task.logs?.slice(-7) || [];
  const progress = !hasProgress && task.status !== 'running' && task.status !== 'error' ? null : <BusinessTaskProgress label={`${subject}阶段进度（估算）`} percent={hasProgress ? task.progress : undefined} status={task.status === 'error' ? 'exception' : task.status === 'success' ? 'success' : task.status === 'paused' ? 'paused' : task.status === 'stopped' ? 'stopped' : 'active'} />;
  const latestMessage = task.error || logs.at(-1);
  return <section className={`feasibility-analysis-feedback is-${task.status}`} aria-label={`${subject}任务`}>
    <div className="feasibility-analysis-task-head"><strong>{status}</strong>{hasResult && task.status !== 'success' && <span>下方保留已保存的结果</span>}</div>
    {['running', 'pausing', 'stopping'].includes(task.status) && progress}
    {latestMessage && latestMessage !== status && <p className={task.error ? 'feasibility-analysis-error' : ''} role={task.error ? 'alert' : 'status'}>{latestMessage}</p>}
    {(logs.length > 1 || task.status === 'error') && <details><summary>查看{subject}过程</summary>{task.status !== 'success' && !['running', 'pausing', 'stopping'].includes(task.status) && progress}<ol>{logs.map((log, index) => <li key={`${index}-${log}`}>{log}</li>)}</ol></details>}
  </section>;
}
