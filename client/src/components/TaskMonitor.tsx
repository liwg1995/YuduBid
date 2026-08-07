import { useEffect, useMemo, useState } from 'react';

interface TaskSnapshot {
  type: string;
  label: string;
  status: string;
  progress: number;
  logs: string[];
  updated_at?: string;
}

function normalizeTask(value: unknown): TaskSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const task = value as Record<string, unknown>;
  return {
    type: String(task.type || ''),
    label: String(task.label || task.type || '后台任务'),
    status: String(task.status || 'running'),
    progress: Math.max(0, Math.min(100, Number(task.progress || 0))),
    logs: Array.isArray(task.logs) ? task.logs.map(String).slice(-2) : [],
    updated_at: typeof task.updated_at === 'string' ? task.updated_at : undefined,
  };
}

function statusLabel(status: string): string {
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  if (status === 'paused') return '已暂停';
  if (status === 'pausing') return '暂停中';
  if (status === 'stopping') return '停止中';
  return '运行中';
}

export default function TaskMonitor() {
  const [tasks, setTasks] = useState<TaskSnapshot[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.yibiao?.tasks?.getActiveTasks().then((items) => {
      if (!mounted) return;
      setTasks((items || []).map(normalizeTask).filter((item): item is TaskSnapshot => Boolean(item)));
    }).catch(() => undefined);
    const unsubscribe = window.yibiao?.tasks?.onTaskEvent((event) => {
      const next = normalizeTask(event?.task);
      if (!next || !mounted) return;
      setTasks((current) => {
        const index = current.findIndex((item) => item.type === next.type);
        if (['success', 'error', 'paused'].includes(next.status)) {
          return index >= 0 ? current.map((item, itemIndex) => itemIndex === index ? next : item) : current;
        }
        if (index < 0) return [...current, next];
        return current.map((item, itemIndex) => itemIndex === index ? next : item);
      });
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const activeCount = useMemo(() => tasks.filter((task) => ['running', 'pausing', 'stopping'].includes(task.status)).length, [tasks]);
  if (!tasks.length) return null;

  return (
    <div className="task-monitor">
      <button type="button" className={`task-monitor-trigger${activeCount ? ' is-active' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="task-monitor-dot" aria-hidden="true" />
        <span>{activeCount ? `${activeCount} 个任务运行中` : '后台任务'}</span>
      </button>
      {open && (
        <div className="task-monitor-panel" role="status">
          <div className="task-monitor-head"><strong>后台任务</strong><span>页面切换不会中断</span></div>
          {tasks.map((task) => (
            <div className="task-monitor-item" key={task.type}>
              <div className="task-monitor-item-head"><strong>{task.label}</strong><span>{statusLabel(task.status)}</span></div>
              <div className="task-monitor-progress"><i style={{ width: `${task.progress}%` }} /></div>
              <small>{task.progress}%{task.logs[task.logs.length - 1] ? ` · ${task.logs[task.logs.length - 1]}` : ''}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
