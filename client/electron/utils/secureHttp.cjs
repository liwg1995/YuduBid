const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

function normalizeTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  return Number.isFinite(value) && value > 0 ? Math.max(1000, Math.floor(value)) : DEFAULT_TIMEOUT_MS;
}

function normalizeMaxBytes(maxBytes) {
  const value = Number(maxBytes);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_BYTES;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isPrivateHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
  if (isPrivateIpv4(normalized)) return true;
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  return false;
}

function assertRemoteHttpUrl(value, message = '远程 URL 不安全') {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error(message);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHostname(parsed.hostname)) {
    throw new Error(message);
  }
  return parsed.toString();
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(url, { ...options, signal, timeoutMs: undefined });
  } catch (error) {
    if ((error?.name === 'AbortError' || error?.name === 'TimeoutError') && !options.signal?.aborted) {
      const timeoutError = new Error(`网络请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  }
}

async function readResponseBuffer(response, maxBytes = DEFAULT_MAX_BYTES) {
  const limit = normalizeMaxBytes(maxBytes);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error(`远程响应过大，已超过 ${Math.round(limit / 1024 / 1024)} MB 限制`);
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limit) throw new Error(`远程响应过大，已超过 ${Math.round(limit / 1024 / 1024)} MB 限制`);
    return buffer;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > limit) throw new Error(`远程响应过大，已超过 ${Math.round(limit / 1024 / 1024)} MB 限制`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

async function readResponseText(response, maxBytes = 8 * 1024 * 1024) {
  return (await readResponseBuffer(response, maxBytes)).toString('utf8');
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  assertRemoteHttpUrl,
  fetchWithTimeout,
  readResponseBuffer,
  readResponseText,
};
