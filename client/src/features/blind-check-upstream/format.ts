export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** 后台任务已运行时长，格式 mm:ss。 */
export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** 模型服务可能把错误包在 JSON 字符串里；结果页只显示可操作的中文说明。 */
export function formatReviewFailure(error: string | null | undefined) {
  const raw = String(error || '').trim();
  if (/rpm exhausted|requests? per minute|rate.?limit/i.test(raw)) {
    return '模型服务的每分钟请求额度已用尽。请稍后重新检查并选择 AI 复核，或在设置中切换模型。';
  }
  if (/quota_exceeded_error|insufficient[_ ]quota|quota exceeded|余额不足|额度不足/i.test(raw)) {
    return '模型服务额度不足。请检查模型账号额度，或在设置中切换模型后重试。';
  }
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || '模型服务未能完成复核，请稍后重试。';
  } catch {
    return raw || '模型服务未能完成复核，请稍后重试。';
  }
}
