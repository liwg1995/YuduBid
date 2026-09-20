const dns = require('node:dns');
const ipaddr = require('ipaddr.js');
const { Agent } = require('undici');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPublicIp(value) {
  try {
    return ipaddr.process(String(value || '').replace(/^\[|\]$/g, '')).range() === 'unicast';
  } catch {
    return false;
  }
}

function lookupPublicAddress(hostname, options, callback, lookup = dns.lookup) {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
      return callback(new Error('远程地址解析到了非公网 IP，已阻止连接'));
    }
    const selected = addresses[0];
    return options?.all
      ? callback(null, [selected])
      : callback(null, selected.address, selected.family);
  });
}

const safeRemoteAgent = new Agent({ connect: { lookup: lookupPublicAddress } });

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
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || isPrivateHostname(parsed.hostname)
    || (ipaddr.isValid(parsed.hostname.replace(/^\[|\]$/g, '')) && !isPublicIp(parsed.hostname))) {
    throw new Error(message);
  }
  return parsed.toString();
}

async function fetchRemoteWithTimeout(url, options = {}) {
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  const { timeoutMs: _timeoutMs, fetchImpl = fetch, ...requestOptions } = options;
  let currentUrl = assertRemoteHttpUrl(url);
  let headers = requestOptions.headers;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetchImpl(currentUrl, {
        ...requestOptions, headers, signal, redirect: 'manual', dispatcher: safeRemoteAgent,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      let nextUrl;
      try {
        if (redirects === MAX_REDIRECTS) throw new Error('远程地址跳转次数过多');
        const method = String(requestOptions.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') throw new Error('远程上传地址不允许跳转');
        const location = response.headers.get('location');
        if (!location) throw new Error('远程地址跳转缺少目标地址');
        nextUrl = assertRemoteHttpUrl(new URL(location, currentUrl).toString());
        if (currentUrl.startsWith('https:') && nextUrl.startsWith('http:')) throw new Error('远程地址不允许降级到 HTTP');
      } finally {
        await response.body?.cancel();
      }
      if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
        headers = new Headers(headers);
        for (const name of ['authorization', 'proxy-authorization', 'cookie']) headers.delete(name);
      }
      currentUrl = nextUrl;
    }
  } catch (error) {
    if ((error?.name === 'AbortError' || error?.name === 'TimeoutError') && !options.signal?.aborted) {
      const timeoutError = new Error(`网络请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  }
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
  fetchRemoteWithTimeout,
  isPublicIp,
  lookupPublicAddress,
  readResponseBuffer,
  readResponseText,
};
