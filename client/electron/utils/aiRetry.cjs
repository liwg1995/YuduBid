const AI_REQUEST_MAX_ATTEMPTS = 3;
const AI_RETRY_BASE_DELAY_MS = 800;
const AI_RETRY_MAX_DELAY_MS = 4000;

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 429]);
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ABORT_ERR', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETDOWN', 'ENETUNREACH', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN',
  'UND_ERR_ABORTED', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_DESTROYED', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);

function normalizeHttpStatus(value) {
  const status = Number(value);
  return Number.isFinite(status) ? Math.floor(status) : 0;
}

function isRetryableHttpStatus(status) {
  const normalized = normalizeHttpStatus(status);
  return RETRYABLE_HTTP_STATUS_CODES.has(normalized) || (normalized >= 500 && normalized <= 599);
}

function walkErrorChain(error, visitor, seen = new Set()) {
  if (!error || seen.has(error)) return false;
  seen.add(error);
  if (visitor(error)) return true;
  if (Array.isArray(error.errors) && error.errors.some((item) => walkErrorChain(item, visitor, seen))) return true;
  return walkErrorChain(error.cause, visitor, seen);
}

function isAbortLikeError(error) {
  return walkErrorChain(error, (item) => ['AbortError', 'TimeoutError'].includes(String(item?.name || '')));
}

function isRetryableNetworkError(error) {
  return walkErrorChain(error, (item) => {
    const code = String(item?.code || '').toUpperCase();
    const message = String(item?.message || '').toLowerCase();
    return RETRYABLE_NETWORK_ERROR_CODES.has(code)
      || (item?.name === 'TypeError' && (message.includes('fetch failed') || message.includes('network') || message.includes('socket')));
  });
}

function markAiRequestError(error, options = {}) {
  const target = error instanceof Error ? error : new Error(String(error || 'AI 请求失败'));
  target.isAiRequestError = true;
  if (Object.prototype.hasOwnProperty.call(options, 'retryable')) {
    target.aiRequestRetryable = Boolean(options.retryable);
  }
  if (options.status && !target.status) target.status = options.status;
  return target;
}

function isRetryableAiRequestError(error) {
  if (!error || error.aiRequestRetryable === false) return false;
  if (error.aiRequestRetryable === true) return true;
  const status = normalizeHttpStatus(error.status || error.statusCode);
  return (status > 0 && isRetryableHttpStatus(status))
    || isAbortLikeError(error)
    || isRetryableNetworkError(error);
}

function getAiRetryDelayMs(failedAttempt) {
  return Math.min(AI_RETRY_MAX_DELAY_MS, AI_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, Number(failedAttempt) - 1)));
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function runWithAiRetry(runner, options = {}) {
  const maxAttempts = Math.max(1, Math.floor(Number(options.maxAttempts) || AI_REQUEST_MAX_ATTEMPTS));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runner({ attempt, maxAttempts });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableAiRequestError(error)) throw error;
      await Promise.resolve(options.onRetry?.({ error, attempt, nextAttempt: attempt + 1, maxAttempts }));
      await delay(typeof options.getDelayMs === 'function' ? options.getDelayMs({ attempt }) : getAiRetryDelayMs(attempt));
    }
  }

  throw lastError || new Error('AI 请求失败');
}

module.exports = {
  AI_REQUEST_MAX_ATTEMPTS,
  getAiRetryDelayMs,
  isRetryableAiRequestError,
  isRetryableHttpStatus,
  markAiRequestError,
  runWithAiRetry,
};
