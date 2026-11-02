import * as Popover from '@radix-ui/react-popover';
import { useEffect, useMemo, useRef, useState } from 'react';
import { aiActivityLabel, normalizeTask, statusLabel, taskHasEnded, taskIsRunning, updateTaskSnapshot, type TaskSnapshot } from './taskMonitorModel';
import './taskMonitor.css';

export default function TaskMonitor() {
  const [tasks, setTasks] = useState<TaskSnapshot[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const dismissedIds = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    let readingSnapshot = true;
    const received: TaskSnapshot[] = [];
    setLoadError(false);
    setLoading(true);
    // 先订阅事件，再读快照；用期间收到的事件覆盖快照中的旧状态。
    const unsubscribe = window.yibiao?.tasks?.onTaskEvent((event) => {
      const next = normalizeTask(event?.task);
      if (!next || !mounted) return;
      if (dismissedIds.current.has(next.id)) {
        if (taskHasEnded(next)) return;
        dismissedIds.current.delete(next.id);
      }
      if (readingSnapshot) received.push(next);
      setTasks((current) => updateTaskSnapshot(current, next));
    });
    void window.yibiao?.tasks?.getActiveTasks().then((items) => {
      if (!mounted) return;
      const snapshot = (items || []).map(normalizeTask).filter((item): item is TaskSnapshot => item !== null && !dismissedIds.current.has(item.id));
      setTasks((current) => received.reduce(updateTaskSnapshot, snapshot.reduce(updateTaskSnapshot, current.filter((task) => taskHasEnded(task) || task.status === 'paused'))));
    }).catch(() => { if (mounted) setLoadError(true); }).finally(() => { readingSnapshot = false; if (mounted) setLoading(false); });
    return () => { mounted = false; unsubscribe?.(); };
  }, [revision]);

  const activeCount = tasks.filter(taskIsRunning).length;
  const pausedCount = tasks.filter((task) => task.status === 'paused').length;
  const failedCount = tasks.filter((task) => task.status === 'error').length;
  const confirmationCount = tasks.filter((task) => task.needsConfirmation).length;
  const endedCount = tasks.filter(taskHasEnded).length;
  const needsAttention = pausedCount + failedCount + confirmationCount;
  const projectScopes = useMemo(() => [...new Set(tasks.filter((task) => task.projectId && task.workflowKind).map((task) => task.workflowKind!))].sort().join(','), [tasks]);
  useEffect(() => {
    if (!open || !projectScopes || !window.yibiao) return;
    let mounted = true;
    void Promise.allSettled(projectScopes.split(',').map(async (kind) => {
      const workflowKind = kind as 'technical-plan' | 'existing-plan-expansion';
      const list = await window.yibiao!.technicalPlan.listProjects(workflowKind);
      if (mounted) setProjectNames((current) => ({ ...current, ...Object.fromEntries(list.projects.map((project) => [`${kind}:${project.id}`, project.name])) }));
    }));
    return () => { mounted = false; };
  }, [open, projectScopes]);
  useEffect(() => {
    if (!open || !activeCount) return undefined;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, activeCount]);

  const dismissEnded = () => {
    tasks.filter(taskHasEnded).forEach((task) => dismissedIds.current.add(task.id));
    setTasks((current) => current.filter((task) => !taskHasEnded(task)));
    panelRef.current?.focus();
  };
  if (!tasks.length && !loadError && !open) return null;
  const triggerLabel = activeCount ? `${activeCount} 个任务运行中${needsAttention ? ` · ${needsAttention} 项待处理` : ''}`
    : needsAttention ? `${needsAttention} 项任务待处理` : endedCount ? `${endedCount} 个任务已结束` : loadError ? '任务状态读取失败' : '后台任务';

  return <Popover.Root open={open} onOpenChange={setOpen}>
    <div className="task-monitor">
      <Popover.Trigger asChild><button type="button" className={`task-monitor-trigger${activeCount ? ' is-active' : ''}${needsAttention ? ' needs-attention' : ''}`}>
        <span className="task-monitor-dot" aria-hidden="true" /><span>{triggerLabel}</span><span className={`task-monitor-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button></Popover.Trigger>
    </div>
    <Popover.Portal><Popover.Content ref={panelRef} className="task-monitor-panel" side="bottom" align="end" sideOffset={8} collisionPadding={16} aria-label="后台任务状态">
      <header className="task-monitor-head"><div><strong>后台任务</strong><span>切换页面后任务会继续运行</span></div><Popover.Close type="button" className="task-monitor-close" aria-label="关闭后台任务">×</Popover.Close></header>
      <div className="task-monitor-items">
        {loading && <p className="task-monitor-empty" role="status">正在读取任务状态…</p>}
        {!loading && !loadError && !tasks.length && <p className="task-monitor-empty">当前没有后台任务</p>}
        {loadError && <div className="task-monitor-load-error" role="alert"><p>未能读取完整任务状态，已收到的任务更新仍会显示。</p><button type="button" onClick={() => { panelRef.current?.focus(); setRevision((value) => value + 1); }}>重新读取</button></div>}
        {tasks.map((task) => {
          const activity = aiActivityLabel(task, nowMs);
          const showProgress = ['running', 'pausing', 'stopping', 'paused', 'error'].includes(task.status) && !task.needsConfirmation;
          const projectName = task.projectId && task.workflowKind ? projectNames[`${task.workflowKind}:${task.projectId}`] : undefined;
          return <article className="task-monitor-item" key={task.id}>
            <div className="task-monitor-item-head"><strong>{task.label}</strong><span className={`task-monitor-state is-${task.needsConfirmation ? 'waiting' : task.status}`}>{task.needsConfirmation ? '待确认' : statusLabel(task.status)}</span></div>
            {task.workflowKind && <p className="task-monitor-project">{task.workflowKind === 'existing-plan-expansion' ? '已有方案扩写' : '技术方案'}{projectName ? ` · ${projectName}` : ''}</p>}
            {showProgress && <><div className="task-monitor-progress-heading"><span>{task.stage || '任务进度'}</span><strong>{task.progress === null ? '进度待更新' : `${Math.round(task.progress)}%`}</strong></div><div className={`task-monitor-progress is-${task.status}${task.progress === null && taskIsRunning(task) ? ' is-indeterminate' : ''}`} role="progressbar" aria-label={`${task.label}进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress ?? undefined}><i style={{ width: `${task.progress ?? (taskIsRunning(task) ? 35 : 0)}%` }} /></div></>}
            {task.detail && <p className="task-monitor-detail">{task.detail}</p>}
            {task.needsConfirmation && <p className="task-monitor-guidance">请返回目录生成页面，确认目录后继续。</p>}
            {task.status === 'error' && <p className="task-monitor-guidance is-error">{task.error || '任务未完成，请返回原项目查看原因并重试。'}</p>}
            {task.status === 'paused' && <p className="task-monitor-guidance">请返回原项目继续处理。</p>}
            {activity && !task.needsConfirmation && <small className="task-monitor-ai-activity">{activity}</small>}
            {!!task.logs.length && <details className="task-monitor-logs"><summary>最近记录</summary>{task.logs.map((log, index) => <p className="task-monitor-log" key={index}>{log}</p>)}</details>}
          </article>;
        })}
      </div>
      <footer className="task-monitor-footer"><span>{activeCount || needsAttention ? `${activeCount} 项进行中 · ${needsAttention} 项待处理` : endedCount ? `${endedCount} 项已结束` : '任务状态'}</span>{endedCount > 0 && <button type="button" onClick={dismissEnded}>清除已结束记录</button>}</footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
