// OrcaRouter authentication seam.
//
// Two credential acquisition paths sit on one interface and both end at the
// same place: a plain OrcaRouter API key (`sk-orca-…`) belonging to the user.
//
//   1. API key adapter  — the user pastes a key they already have.
//   2. PKCE adapter     — OAuth 2.0 + PKCE issues a key after the user approves
//                         in a browser (Flow A loopback redirect; Flow B
//                         out-of-band code when no loopback port can be bound).
//
// Everything downstream — the provider request path, the model catalog, every
// AI entry point — consumes the credential through `getApiKeyForProvider` and
// never learns which adapter produced it.
//
// A PKCE-issued key is a durable API key, NOT a refresh token. There is no
// refresh grant: a key is reused until OrcaRouter revokes it, and a relay 401
// is terminal reauthentication for the exact account generation that was
// rejected.

const crypto = require('node:crypto');
const http = require('node:http');

const { KEY_CONSOLE_URL, resolveOrcaOrigins } = require('../utils/orcaConfig.cjs');
const { fetchWithTimeout, readResponseBuffer } = require('../utils/secureHttp.cjs');

const API_KEY_PREFIX = 'sk-orca-';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const EXCHANGE_TIMEOUT_MS = 30000;
const EXCHANGE_MAX_BYTES = 64 * 1024;
const CALLBACK_PATH = '/cb';
const OAUTH_SCOPE = 'api';
const CREDENTIAL_PROVIDER = 'orcarouter';

// Provider ids that resolve to this credential store. Both are first-class
// provider entries so the two choices stay independently selectable, but they
// share one inference adapter, base URL, namespace and catalog.
const ORCA_PROVIDER_IDS = new Set(['orcarouter', 'orcarouter-oauth']);

const b64url = (buffer) => buffer.toString('base64url');

// Fresh, cryptographically random verifier and state for every attempt. The
// verifier never leaves this process until the exchange and is never logged.
function createPkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

function constantTimeEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isOrcaApiKey(value) {
  return String(value || '').trim().startsWith(API_KEY_PREFIX);
}

function redactSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  return text.length <= 8 ? '***' : `${text.slice(0, 8)}…${text.slice(-4)}`;
}

// Never let a secret reach a log line, an error message or a UI string: every
// message built here is scrubbed of the verifier and of any key-shaped token.
function scrub(text, secrets = []) {
  let output = String(text || '');
  for (const secret of secrets) {
    if (secret && String(secret).length >= 8) {
      output = output.split(String(secret)).join('[redacted]');
    }
  }
  return output.replace(/sk-orca-[A-Za-z0-9_-]{4,}/g, '[redacted]');
}

function createOrcaAuthService({
  configStore,
  openExternal,
  environment = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  onResult = () => {},
} = {}) {
  const origins = resolveOrcaOrigins(environment);
  let currentAttempt = null;
  let lastAttempt = null;
  let attemptCounter = 0;

  function readRecord() {
    const record = configStore?.loadOrcaCredential?.() || null;
    if (!record) return null;
    return {
      provider: CREDENTIAL_PROVIDER,
      key: String(record.key || ''),
      accountId: String(record.account_id || ''),
      scope: String(record.scope || ''),
      source: record.source === 'pkce' ? 'pkce' : 'api-key',
      generation: Number.isFinite(Number(record.generation)) ? Number(record.generation) : 0,
      issuedAt: String(record.issued_at || ''),
      status: record.status === 'needsReauth' ? 'needsReauth' : 'active',
    };
  }

  function persist(credential) {
    configStore.saveOrcaCredential({
      provider: CREDENTIAL_PROVIDER,
      key: credential.key,
      account_id: credential.accountId,
      scope: credential.scope,
      source: credential.source,
      generation: credential.generation,
      issued_at: credential.issuedAt,
      status: credential.status,
    });
    return credential;
  }

  // The single credential shape both adapters produce. Downstream code reads
  // `key` and nothing else about how it was obtained.
  function buildCredential({ key, accountId, scope, source, previous }) {
    return {
      provider: CREDENTIAL_PROVIDER,
      key: String(key || '').trim(),
      accountId: String(accountId || ''),
      scope: String(scope || ''),
      source,
      generation: (Number(previous?.generation) || 0) + 1,
      issuedAt: now().toISOString(),
      status: 'active',
    };
  }

  // ---- adapter 1: pasted API key -----------------------------------------

  function saveApiKey(apiKey, { accountId = '' } = {}) {
    const key = String(apiKey || '').trim();
    if (!key) throw new Error('请输入 OrcaRouter API Key');
    if (!isOrcaApiKey(key)) throw new Error('OrcaRouter API Key 应以 sk-orca- 开头');
    return persist(buildCredential({
      key,
      accountId,
      scope: OAUTH_SCOPE,
      source: 'api-key',
      previous: readRecord(),
    }));
  }

  // ---- attempt lifecycle --------------------------------------------------

  function beginAttempt(pkce, mode, appName) {
    attemptCounter += 1;
    const attempt = {
      id: `orca-attempt-${attemptCounter}`,
      mode,
      appName,
      verifier: pkce.verifier,
      state: pkce.state,
      startedAt: now().getTime(),
      ended: false,
      server: null,
      timer: null,
      authorizeUrl: '',
      completion: null,
      resolveCompletion: null,
      rejectCompletion: null,
    };
    attempt.completion = new Promise((resolve, reject) => {
      attempt.resolveCompletion = resolve;
      attempt.rejectCompletion = reject;
    });
    // The GUI consumes results through `onResult`; without this, a rejection
    // nobody awaits would surface as an unhandled rejection.
    attempt.completion.catch(() => {});
    currentAttempt = attempt;
    lastAttempt = attempt;
    return attempt;
  }

  // Releases everything the attempt held. Safe to call more than once, and on
  // every terminal path: success, denial, exchange error, timeout, cancel.
  function endAttempt(attempt) {
    if (!attempt || attempt.ended) return;
    attempt.ended = true;
    if (attempt.timer) clearTimeout(attempt.timer);
    if (attempt.server) {
      try {
        attempt.server.closeAllConnections?.();
        attempt.server.close();
      } catch {
        // Listener already gone; nothing left to release.
      }
    }
    // Drop the verifier as soon as the attempt is over so it cannot outlive
    // the exchange it was minted for.
    attempt.verifier = '';
    if (currentAttempt === attempt) currentAttempt = null;
  }

  function succeed(attempt, result) {
    endAttempt(attempt);
    onResult({ attemptId: attempt.id, result });
    attempt.resolveCompletion(result);
  }

  function failAttempt(attempt, error) {
    endAttempt(attempt);
    onResult({ attemptId: attempt.id, error });
    attempt.rejectCompletion(error);
  }

  function findAttempt(attemptId) {
    if (currentAttempt && currentAttempt.id === attemptId) return currentAttempt;
    if (lastAttempt && lastAttempt.id === attemptId) return lastAttempt;
    return null;
  }

  function buildAuthorizeUrl({ challenge, state, callbackUrl, appName }) {
    const url = new URL(origins.authorizeUrl);
    url.searchParams.set('callback_url', callbackUrl);
    // S256 unconditionally: the consent screen also lets the user ask to be
    // shown a code, and a displayed code must never be redeemable with a
    // challenge that travelled on the authorize URL.
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('app_name', appName);
    url.searchParams.set('scope', OAUTH_SCOPE);
    return url.toString();
  }

  // ---- PKCE exchange ------------------------------------------------------

  function exchangeErrorMessage(status, payload) {
    const description = scrub(payload?.error_description || payload?.error || '');
    const suffix = description ? `：${description}` : '';
    if (status === 400) return `授权码交换被拒绝（HTTP 400），请重新发起登录${suffix}`;
    if (status === 403) return `授权码无效、已过期或已使用，请重新发起登录${suffix}`;
    if (status === 429) return 'OrcaRouter 授权次数已达上限（每用户 24 小时 10 次），请稍后再试或直接填写 API Key';
    return `OrcaRouter 授权码交换失败（HTTP ${status}）${suffix}`;
  }

  async function exchangeCode({ code, verifier }) {
    const request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
      timeoutMs: EXCHANGE_TIMEOUT_MS,
    };

    const response = fetchImpl === fetch
      ? await fetchWithTimeout(origins.exchangeUrl, request)
      : await fetchImpl(origins.exchangeUrl, {
        ...request,
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
        timeoutMs: undefined,
      });

    const raw = (await readResponseBuffer(response, EXCHANGE_MAX_BYTES)).toString('utf8');
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(exchangeErrorMessage(response.status, payload));
      error.status = response.status;
      error.code = response.status === 429 ? 'rate_limited' : 'exchange_failed';
      throw error;
    }
    if (!isOrcaApiKey(payload.key)) {
      const error = new Error('OrcaRouter 未返回有效的 API Key');
      error.code = 'invalid_key_response';
      throw error;
    }
    return payload;
  }

  // Both adapters converge here: a PKCE login persists exactly the same
  // credential record an API key would.
  function settleLogin(attempt, payload) {
    if (!attempt || attempt.ended) {
      const error = new Error('登录尝试已失效，请重新发起');
      error.code = 'stale_attempt';
      throw error;
    }
    const previous = readRecord();
    const credential = persist(buildCredential({
      key: payload.key,
      accountId: payload.user_id,
      // Read the scope that was granted, not the one requested: a workspace
      // role may have approved less than we asked for.
      scope: payload.scope,
      source: 'pkce',
      previous,
    }));
    return {
      credential,
      scope: credential.scope,
      scopeDowngraded: Boolean(credential.scope) && credential.scope !== OAUTH_SCOPE,
    };
  }

  async function completeWithCode(attempt, code) {
    const verifier = attempt.verifier;
    try {
      const payload = await exchangeCode({ code, verifier });
      // The attempt may have been canceled while the exchange was in flight.
      if (attempt.ended) {
        const error = new Error('登录已取消');
        error.code = 'canceled';
        throw error;
      }
      const result = settleLogin(attempt, payload);
      succeed(attempt, result);
      return result;
    } catch (error) {
      failAttempt(attempt, error);
      throw error;
    }
  }

  // ---- Flow A: loopback redirect -----------------------------------------

  // Listen on loopback first, so the port is known before the browser opens
  // and nothing races. The user clicks once and is done.
  function startLoopbackAttempt(pkce, appName) {
    return new Promise((resolve, reject) => {
      const attempt = beginAttempt(pkce, 'loopback', appName);

      const server = http.createServer((request, response) => {
        let url;
        try {
          url = new URL(request.url, 'http://127.0.0.1');
        } catch {
          response.writeHead(400).end();
          return;
        }
        if (url.pathname !== CALLBACK_PATH) {
          response.writeHead(404).end();
          return;
        }

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><meta charset="utf-8"><title>OrcaRouter</title>'
          + '<p>已连接 OrcaRouter，可以关闭此页面了。</p>');

        if (attempt.ended) return;

        // Compare state before anything else: it is the only thing standing
        // between this listener and a code somebody else's page dropped on it.
        if (!constantTimeEquals(url.searchParams.get('state'), attempt.state)) {
          const error = new Error('授权状态校验失败，请重新发起登录');
          error.code = 'state_mismatch';
          failAttempt(attempt, error);
          return;
        }

        const errorParam = url.searchParams.get('error');
        if (errorParam) {
          const error = new Error(errorParam === 'access_denied' ? '授权被拒绝' : `授权失败：${errorParam}`);
          error.code = errorParam;
          failAttempt(attempt, error);
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          const error = new Error('授权回调缺少 code 参数');
          error.code = 'missing_code';
          failAttempt(attempt, error);
          return;
        }
        // The loopback callback only has the HTTP response to answer; the
        // outcome is delivered through the attempt completion promise, so a
        // rejection here is already handled by failAttempt and must not
        // surface as an unhandled rejection.
        completeWithCode(attempt, code).catch(() => {});
      });

      server.on('error', (error) => {
        // Release the listener and reject the start call. No result is emitted
        // here: the caller may still fall back to the out-of-band flow, and a
        // spurious error would otherwise surface in the GUI.
        endAttempt(attempt);
        reject(error);
      });

      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        attempt.server = server;
        attempt.authorizeUrl = buildAuthorizeUrl({
          challenge: pkce.challenge,
          state: pkce.state,
          callbackUrl: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
          appName,
        });
        resolve(attempt);
      });
    });
  }

  // ---- Flow B: out-of-band code ------------------------------------------

  // The code is displayed on the consent screen and pasted back. Used when no
  // loopback port can be bound; S256 is mandatory here, and it is sent in both
  // flows.
  function startOutOfBandAttempt(pkce, appName) {
    const attempt = beginAttempt(pkce, 'oob', appName);
    attempt.authorizeUrl = buildAuthorizeUrl({
      challenge: pkce.challenge,
      state: pkce.state,
      callbackUrl: 'oob',
      appName,
    });
    return Promise.resolve(attempt);
  }

  function armTimeout(attempt) {
    attempt.timer = setTimeout(() => {
      if (attempt.ended) return;
      const error = new Error('OrcaRouter 授权超时，请重新发起登录');
      error.code = 'timeout';
      failAttempt(attempt, error);
    }, LOGIN_TIMEOUT_MS);
    // Do not hold the process open purely for the authorization deadline.
    attempt.timer.unref?.();
  }

  async function startLogin({ appName = 'YuduBid', flow = 'auto' } = {}) {
    if (currentAttempt) {
      const error = new Error('已有正在进行的 OrcaRouter 登录，请先取消');
      error.code = 'login_in_progress';
      throw error;
    }

    const pkce = createPkcePair();
    let attempt;
    if (flow === 'oob') {
      attempt = await startOutOfBandAttempt(pkce, appName);
    } else {
      try {
        attempt = await startLoopbackAttempt(pkce, appName);
      } catch (error) {
        if (flow === 'loopback') throw error;
        // No loopback port available: fall back to the out-of-band code with a
        // brand new verifier, since the first one was minted for a listener
        // that never came up.
        attempt = await startOutOfBandAttempt(createPkcePair(), appName);
      }
    }

    // Arm the deadline only once the listener exists, so a slow bind cannot
    // race it.
    armTimeout(attempt);

    return {
      attemptId: attempt.id,
      mode: attempt.mode,
      authorizeUrl: attempt.authorizeUrl,
      authBaseUrl: origins.authBaseUrl,
      apiBaseUrl: origins.apiBaseUrl,
      keyConsoleUrl: KEY_CONSOLE_URL,
    };
  }

  // Resolves with the credential once the user approves, rejects on denial,
  // state mismatch, exchange error, timeout or cancel. Resolving an already
  // settled attempt is safe: the completion promise is sticky.
  function awaitLogin(attemptId) {
    const attempt = findAttempt(attemptId);
    if (!attempt) {
      const error = new Error('未找到对应的登录尝试，请重新发起');
      error.code = 'unknown_attempt';
      return Promise.reject(error);
    }
    return attempt.completion;
  }

  // Flow B completion: the user pasted the displayed code.
  async function submitOutOfBandCode({ attemptId, code }) {
    const attempt = findAttempt(attemptId);
    if (!attempt || attempt.ended) {
      const error = new Error('登录尝试已失效，请重新发起');
      error.code = 'stale_attempt';
      throw error;
    }
    if (attempt.mode !== 'oob') {
      const error = new Error('当前登录不是验证码模式');
      error.code = 'wrong_mode';
      throw error;
    }
    if (!String(code || '').trim()) {
      const error = new Error('请输入授权码');
      error.code = 'missing_code';
      throw error;
    }
    return completeWithCode(attempt, String(code).trim());
  }

  function cancelLogin(attemptId) {
    const attempt = currentAttempt;
    if (!attempt) return { success: true, canceled: false };
    if (attemptId && attempt.id !== attemptId) return { success: true, canceled: false };
    const error = new Error('登录已取消');
    error.code = 'canceled';
    failAttempt(attempt, error);
    return { success: true, canceled: true };
  }

  // ---- credential lifecycle ----------------------------------------------

  function getCredential() {
    return readRecord();
  }

  function clearCredential() {
    configStore.saveOrcaCredential(null);
    return { success: true };
  }

  // Terminal relay 401: mark only the exact account + credential generation
  // that made the rejected request. A late failure from an old request must
  // never mark a freshly re-authorized credential as broken, and the stored
  // key is deliberately kept until a new login succeeds.
  function markNeedsReauth({ accountId = '', generation = 0 } = {}) {
    const record = readRecord();
    if (!record) return { success: false, marked: false };
    if (accountId && record.accountId && record.accountId !== accountId) return { success: true, marked: false };
    if (Number.isFinite(Number(generation)) && Number(generation) > 0 && record.generation !== Number(generation)) {
      return { success: true, marked: false };
    }
    if (record.status === 'needsReauth') return { success: true, marked: true };
    persist({ ...record, status: 'needsReauth' });
    return { success: true, marked: true };
  }

  function needsReauth() {
    return readRecord()?.status === 'needsReauth';
  }

  // The one entry every AI call site uses. Both providers resolve here, so no
  // request path, model-catalog call or AI entry point carries its own copy of
  // the authentication logic.
  function getApiKeyForProvider(provider) {
    if (!ORCA_PROVIDER_IDS.has(provider)) return '';
    const record = readRecord();
    if (!record || !record.key) return '';
    if (record.status === 'needsReauth') return '';
    return record.key;
  }

  function getStatus() {
    const record = readRecord();
    return {
      configured: Boolean(record?.key),
      status: record?.status || 'unconfigured',
      source: record?.source || '',
      accountId: record?.accountId || '',
      scope: record?.scope || '',
      generation: record?.generation || 0,
      issuedAt: record?.issuedAt || '',
      redactedKey: record?.key ? redactSecret(record.key) : '',
      origins: {
        authBaseUrl: origins.authBaseUrl,
        apiBaseUrl: origins.apiBaseUrl,
        keyConsoleUrl: KEY_CONSOLE_URL,
        keyDashboardUrl: origins.keyDashboardUrl,
        logoUrl: origins.logoUrl,
      },
      loginInProgress: Boolean(currentAttempt),
      loginAttemptId: currentAttempt?.id || '',
    };
  }

  return {
    API_KEY_PREFIX,
    OAUTH_SCOPE,
    ORCA_PROVIDER_IDS,
    awaitLogin,
    cancelLogin,
    clearCredential,
    getApiKeyForProvider,
    getCredential,
    getStatus,
    isOrcaApiKey,
    markNeedsReauth,
    needsReauth,
    saveApiKey,
    startLogin,
    submitOutOfBandCode,
  };
}

module.exports = {
  API_KEY_PREFIX,
  CREDENTIAL_PROVIDER,
  LOGIN_TIMEOUT_MS,
  OAUTH_SCOPE,
  ORCA_PROVIDER_IDS,
  b64url,
  constantTimeEquals,
  createOrcaAuthService,
  createPkcePair,
  isOrcaApiKey,
  redactSecret,
  scrub,
};
