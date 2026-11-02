import type { WordExportProgressEvent, WordExportResult } from '../types/ipc';

/** Main 会将本次请求编号附在进度上；其他导出不应改写当前工作区。 */
export function isCurrentWordExportEvent(event: WordExportProgressEvent, requestId: string) {
  return event.requestId === requestId;
}

/** 取消由调用方处理；未抛异常的失败返回也必须按失败展示。 */
export function requireWordExportSuccess(result: WordExportResult) {
  if (!result?.success) throw new Error(result?.message || '导出未完成，请重试。');
}

export function lastWordExportPercent(value?: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value!)) : 0;
}
