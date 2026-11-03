'use strict';

/** Release 元数据请求共用短时缓存和限流冷却；不缓存失败为有效版本。 */
function createReleaseJsonFetcher({ fetchImpl = (...args) => fetch(...args), now = Date.now, syncPending } = {}) {
  const entries = new Map();
  return async function fetchReleaseJson(url, signal, source = 'github') {
    const key = `${source}:${url}`;
    const previous = entries.get(key);
    if (previous?.pending) return previous.pending;
    if (previous?.expiresAt > now()) {
      if (previous.error) throw previous.error;
      return previous.value;
    }
    const entry = {};
    const pending = (async () => {
      const response = await fetchImpl(url, {
        headers: { Accept: source === 'github' ? 'application/vnd.github+json' : 'application/json', 'User-Agent': 'YuDuBid-Client' },
        signal,
      });
      if (!response.ok) {
        if (source === 'gitcode' && response.status === 404 && syncPending) throw syncPending('GitCode Release 尚未同步完成');
        const name = source === 'github' ? 'GitHub' : 'GitCode';
        if (response.status === 429) {
          const retryAfter = response.headers?.get('retry-after');
          const seconds = retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN;
          const until = Number.isFinite(seconds) ? now() + seconds * 1000 : Date.parse(retryAfter || '');
          const delay = Math.max(1000, Math.min(86400000, Number.isFinite(until) ? until - now() : 60000));
          const error = new Error(`${name} 更新服务请求受限（429），请在 ${Math.ceil(delay / 1000)} 秒后重试；本次未完成版本检查。`);
          error.status = 429;
          error.retryAt = now() + delay;
          entry.error = error;
          entry.expiresAt = error.retryAt;
          throw error;
        }
        throw new Error(`${name} 返回 ${response.status}`);
      }
      const value = await response.json();
      entry.value = value;
      entry.expiresAt = now() + 5 * 60 * 1000;
      return value;
    })();
    entry.pending = pending;
    entries.set(key, entry);
    try { return await pending; }
    finally {
      delete entry.pending;
      if (!entry.expiresAt) entries.delete(key);
    }
  };
}

module.exports = { createReleaseJsonFetcher };
