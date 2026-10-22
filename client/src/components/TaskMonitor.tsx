import { useEffect, useMemo, useRef, useState } from 'react';

interface TaskSnapshot {
  type: string;
  label: string;
  status: string;
  progress: number;
  logs: string[];
  updated_at?: string;
  last_ai_request_at?: string;
  last_ai_response_at?: string;
  ai_retry_count?: number;
}

const taskNames: Record<string, string> = {
  'bid-section-extraction': '多标段识别',
  'bid-analysis': '招标文件解析',
  'outline-generation': '目录生成',
  'global-facts-generation': '全局事实设定',
  'content-generation': '正文生成',
  'rejection-items-extraction': '无效与废标项解析',
  'blind-check-run': '暗标检查',
  'blind-check-fix': '暗标自动修复',
  'blind-check-preset-extraction': '暗标格式提取',
  'rejection-check-run': '废标项检查',
  'duplicate-analysis': '标书查重分析',
};

function normalizeTask(value: unknown): TaskSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const task = value as Record<string, unknown>;
  return {
    type: String(task.type || ''),
    label: /[\u3400-\u9fff]/u.test(String(task.label || ''))
      ? String(task.label)
      : taskNames[String(task.type || '')] || '后台任务',
    status: String(task.status || 'running'),
    progress: Math.max(0, Math.min(100, Number(task.progress || 0))),
    logs: Array.isArray(task.logs) ? task.logs.map(String).slice(-2) : [],
    updated_at: typeof task.updated_at === 'string' ? task.updated_at : undefined,
    last_ai_request_at: typeof task.last_ai_request_at === 'string' ? task.last_ai_request_at : undefined,
    last_ai_response_at: typeof task.last_ai_response_at === 'string' ? task.last_ai_response_at : undefined,
    ai_retry_count: Number(task.ai_retry_count || 0),
  };
}

function statusLabel(status: string): string {
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  if (status === 'paused') return '已暂停';
  if (status === 'pausing') return '暂停中';
  if (status === 'stopping') return '停止中';
  if (status === 'stopped') return '已停止';
  return '运行中';
}

function aiActivityLabel(task: TaskSnapshot, nowMs: number): string {
  if (!['running', 'pausing', 'stopping'].includes(task.status)) return '';
  const responseAt = task.last_ai_response_at ? Date.parse(task.last_ai_response_at) : NaN;
  const requestAt = task.last_ai_request_at ? Date.parse(task.last_ai_request_at) : NaN;
  const waiting = Number.isFinite(requestAt) && (!Number.isFinite(responseAt) || requestAt > responseAt);
  const activity = waiting
    ? `等待模型响应 ${Math.max(0, Math.floor((nowMs - requestAt) / 1000))} 秒`
    : Number.isFinite(responseAt) ? `最近模型响应 ${Math.max(0, Math.floor((nowMs - responseAt) / 1000))} 秒前` : '';
  return activity && task.ai_retry_count ? `${activity} · 已自动重试 ${task.ai_retry_count} 次` : activity;
}

export default function TaskMonitor() {
  const [tasks, setTasks] = useState<TaskSnapshot[]>([]);
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const monitorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        if (next.status === 'stopped') return current.filter((item) => item.type !== next.type);
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
  const pausedCount = useMemo(() => tasks.filter((task) => task.status === 'paused').length, [tasks]);
  useEffect(() => {
    if (!open || !activeCount) return undefined;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, activeCount]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!monitorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  if (!tasks.length) return null;

  return (
    <div className="task-monitor" ref={monitorRef}>
      <button type="button" ref={triggerRef} className={`task-monitor-trigger${activeCount ? ' is-active' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="task-monitor-panel">
        <span className="task-monitor-dot" aria-hidden="true" />
        <span>{activeCount ? `${activeCount} 个任务运行中` : pausedCount ? `${pausedCount} 个任务已暂停` : '后台任务'}</span>
        <span className={`task-monitor-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="task-monitor-panel" id="task-monitor-panel" role="region" aria-label="后台任务状态">
          <div className="task-monitor-head"><div><strong>后台任务</strong><span>页面切换后继续运行</span></div><b>{activeCount ? `${activeCount} 项进行中` : `${pausedCount} 项已暂停`}</b></div>
          {tasks.map((task) => (
            <div className="task-monitor-item" key={task.type}>
              <div className="task-monitor-item-head"><strong>{task.label}</strong><span className={`task-monitor-state is-${task.status}`}>{statusLabel(task.status)}</span></div>
              <div className="task-monitor-progress-heading"><span>阶段进度</span><strong>{Math.round(task.progress)}%</strong></div>
              <div className="task-monitor-progress" role="progressbar" aria-label={`${task.label}进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress}><i style={{ width: `${task.progress}%` }} /></div>
              {task.logs[task.logs.length - 1] ? <p className="task-monitor-log">{task.logs[task.logs.length - 1]}</p> : null}
              {aiActivityLabel(task, nowMs) ? <small className="task-monitor-ai-activity">{aiActivityLabel(task, nowMs)}</small> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
