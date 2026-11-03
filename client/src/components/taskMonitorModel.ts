export interface TaskSnapshot {
  id: string;
  projectId?: string;
  workflowKind?: 'technical-plan' | 'existing-plan-expansion';
  error?: string;
  needsConfirmation: boolean;
  type: string;
  label: string;
  status: string;
  progress: number | null;
  stage?: string;
  detail?: string;
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

export function normalizeTask(value: unknown): TaskSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const task = value as Record<string, unknown>;
  const progress = typeof task.progress === 'number' || typeof task.progress === 'string' && task.progress.trim() ? Number(task.progress) : NaN;
  const stats = task.stats && typeof task.stats === 'object' ? task.stats as Record<string, unknown> : {};
  const content = stats.content && typeof stats.content === 'object' ? stats.content as Record<string, unknown> : {};
  const phaseLabels: Record<string, string> = { planning: '规划正文', generating: '生成正文', 'outline-expanding': '扩充目录', expanding: '扩写正文', auditing: '一致性审计', illustrating: '编排配图', 'layout-checking': '检查排版', 'validating-images': '校验配图', done: '已完成' };
  const total = Number(content.generation_total);
  const completed = Number(content.generation_completed);
  return {
    id: String(task.task_id || `${task.type || 'task'}:${task.workflow_kind || ''}:${task.project_id || task.scope_id || ''}`),
    projectId: typeof task.project_id === 'string' ? task.project_id : undefined,
    workflowKind: task.workflow_kind === 'technical-plan' || task.workflow_kind === 'existing-plan-expansion' ? task.workflow_kind : undefined,
    error: typeof task.error === 'string' ? task.error : undefined,
    needsConfirmation: Boolean(stats.outlineQuestion && task.status === 'running'),
    stage: stats.outlineQuestion && task.status === 'running' ? '等待目录确认' : phaseLabels[String(content.phase)] || '',
    detail: content.phase === 'generating' && Number.isFinite(total) && total > 0 && Number.isFinite(completed) ? `已完成 ${Math.max(0, Math.min(total, completed))} / ${total} 个章节` : '',
    type: String(task.type || ''),
    label: /[\u3400-\u9fff]/u.test(String(task.label || ''))
      ? String(task.label)
      : taskNames[String(task.type || '')] || '后台任务',
    status: String(task.status || 'running'),
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null,
    logs: Array.isArray(task.logs) ? task.logs.map(String).slice(-2) : [],
    updated_at: typeof task.updated_at === 'string' ? task.updated_at : undefined,
    last_ai_request_at: typeof task.last_ai_request_at === 'string' ? task.last_ai_request_at : undefined,
    last_ai_response_at: typeof task.last_ai_response_at === 'string' ? task.last_ai_response_at : undefined,
    ai_retry_count: Number(task.ai_retry_count || 0),
  };
}

export function statusLabel(status: string): string {
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  if (status === 'paused') return '已暂停';
  if (status === 'pausing') return '暂停中';
  if (status === 'stopping') return '停止中';
  if (status === 'stopped') return '已停止';
  if (status === 'running') return '运行中';
  if (status === 'queued' || status === 'idle') return '等待执行';
  return '状态待更新';
}

export function aiActivityLabel(task: TaskSnapshot, nowMs: number): string {
  if (!['running', 'pausing', 'stopping'].includes(task.status)) return '';
  const responseAt = task.last_ai_response_at ? Date.parse(task.last_ai_response_at) : NaN;
  const requestAt = task.last_ai_request_at ? Date.parse(task.last_ai_request_at) : NaN;
  const waiting = Number.isFinite(requestAt) && (!Number.isFinite(responseAt) || requestAt > responseAt);
  const activity = waiting
    ? `等待模型响应 ${Math.max(0, Math.floor((nowMs - requestAt) / 1000))} 秒`
    : Number.isFinite(responseAt) ? `最近模型响应 ${Math.max(0, Math.floor((nowMs - responseAt) / 1000))} 秒前` : '';
  return activity && task.ai_retry_count ? `${activity} · 已自动重试 ${task.ai_retry_count} 次` : activity;
}

export function updateTaskSnapshot(current: TaskSnapshot[], next: TaskSnapshot): TaskSnapshot[] {
  const index = current.findIndex((item) => item.id === next.id);
  return index < 0 ? [next, ...current] : current.map((item, position) => position === index ? next : item);
}

export const taskHasEnded = (task: TaskSnapshot) => ['success', 'error', 'stopped'].includes(task.status);
export const taskIsRunning = (task: TaskSnapshot) => !task.needsConfirmation && ['running', 'pausing', 'stopping'].includes(task.status);
