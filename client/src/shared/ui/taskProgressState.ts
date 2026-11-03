export type TaskProgressStatus = 'normal' | 'active' | 'success' | 'exception';

export const taskProgressStatusLabels: Record<TaskProgressStatus, string> = {
  normal: '',
  active: '进行中',
  success: '已完成',
  exception: '失败',
};

/** 仅规范展示范围；未知进度保持未知，不补造百分比。 */
export function normalizeTaskProgress(percent?: number): number | undefined {
  return percent === undefined || !Number.isFinite(percent) ? undefined : Math.round(Math.max(0, Math.min(100, percent)));
}
