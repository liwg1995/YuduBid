import { useState } from 'react';
import type { FeasibilityBackgroundTaskState } from '../types';

export function isTaskRunning(task?: FeasibilityBackgroundTaskState) {
  return Boolean(task && ['running', 'pausing', 'stopping'].includes(task.status));
}

function getStatus(task?: FeasibilityBackgroundTaskState) {
  if (!task) return '等待开始';
  return task.status === 'success' ? '已完成' : task.status === 'error' ? '失败' : task.status === 'paused' ? '已暂停' : task.status === 'pausing' ? '暂停中' : '进行中';
}

export default function TaskProgressCard({ task, emptyMessage = '等待生成任务启动。', compact = false }: { task?: FeasibilityBackgroundTaskState; emptyMessage?: string; compact?: boolean }) {
  const [collapsed, setCollapsed] = useState(true);
  const status = getStatus(task);
  const progress = Math.max(0, Math.min(100, Math.round(task?.progress || 0)));
  const logs = task?.logs?.slice(-7) || [];
  if (compact) return <section className={`feasibility-task-card is-compact is-${task?.status || 'idle'}`} aria-label="目录生成过程">
    <div className="feasibility-task-compact-summary">
      <span className="feasibility-task-compact-status">{status}</span>
      <strong>{progress}%</strong>
      <progress max={100} value={progress} aria-label={`目录生成进度 ${progress}%`} />
      <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>{collapsed ? '查看过程' : '收起过程'}</button>
    </div>
    {!collapsed && <div className="feasibility-task-compact-detail">
      <p>{task?.error || logs.at(-1) || emptyMessage}</p>
      {logs.length ? <ol>{logs.map((log, index) => <li className={index === logs.length - 1 ? 'is-current' : ''} key={`${index}-${log}`}>{log}</li>)}</ol> : null}
    </div>}
  </section>;
  return <section className={`feasibility-task-card is-${task?.status || 'idle'}`}>
    <header><strong>生成过程</strong><span>{status}</span></header>
    <div className="feasibility-task-progress-head"><span>生成进度</span><strong>{progress}%</strong></div>
    <progress max={100} value={progress} aria-label={`生成进度 ${progress}%`} />
    <p className="feasibility-task-message">{task?.error || logs.at(-1) || emptyMessage}</p>
    {task?.error ? <p className="field-error">{task.error}</p> : null}
    <ol>{logs.map((log, index) => <li className={index === logs.length - 1 ? 'is-current' : ''} key={`${index}-${log}`}>{log}</li>)}</ol>
  </section>;
}
