import type { FeasibilityBackgroundTaskState } from '../types';

export function isTaskRunning(task?: FeasibilityBackgroundTaskState) {
  return Boolean(task && ['running', 'pausing', 'stopping'].includes(task.status));
}

function getStatus(task?: FeasibilityBackgroundTaskState) {
  if (!task) return '等待开始';
  return task.status === 'success' ? '已完成' : task.status === 'error' ? '失败' : task.status === 'paused' ? '已暂停' : task.status === 'pausing' ? '暂停中' : '进行中';
}

export default function TaskProgressCard({ task, emptyMessage = '等待生成任务启动。' }: { task?: FeasibilityBackgroundTaskState; emptyMessage?: string }) {
  const status = getStatus(task);
  const progress = Math.max(0, Math.min(100, Math.round(task?.progress || 0)));
  const logs = task?.logs?.slice(-7) || [];
  return <section className={`feasibility-task-card is-${task?.status || 'idle'}`}>
    <header><strong>生成过程</strong><span>{status}</span></header>
    <div className="feasibility-task-progress-head"><span>生成进度</span><strong>{progress}%</strong></div>
    <progress max={100} value={progress} aria-label={`生成进度 ${progress}%`} />
    <p className="feasibility-task-message">{task?.error || logs.at(-1) || emptyMessage}</p>
    {task?.error ? <p className="field-error">{task.error}</p> : null}
    <ol>{logs.map((log, index) => <li className={index === logs.length - 1 ? 'is-current' : ''} key={`${index}-${log}`}>{log}</li>)}</ol>
  </section>;
}
