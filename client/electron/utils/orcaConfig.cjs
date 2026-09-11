// OrcaRouter origin policy.
//
// Authentication and inference live on two different public origins:
//   auth      -> https://www.orcarouter.ai          (authorize + code exchange)
//   inference -> https://api.orcarouter.ai/v1       (chat + model catalog)
//
// The two must never be derived from one another: `https://api.orcarouter.ai/v1/auth/keys`
// is a 404, and that mistake is invisible if you build one origin from the other.
// Self-hosted deployments may use a single shared origin, so ORCA_BASE_URL is the
// shared fallback while ORCA_AUTH_BASE_URL / ORCA_API_BASE_URL win when set.

const DEFAULT_AUTH_BASE_URL = 'https://www.orcarouter.ai';
const DEFAULT_API_BASE_URL = 'https://api.orcarouter.ai/v1';
const AUTHORIZE_PATH = '/auth';
const EXCHANGE_PATH = '/api/v1/auth/keys';
const DEVICE_CODE_PATH = '/api/v1/auth/device/code';
const DEVICE_TOKEN_PATH = '/api/v1/auth/device/token';
const KEY_CONSOLE_URL = 'https://www.orcarouter.ai/console';
const KEY_DASHBOARD_URL = 'https://www.orcarouter.ai/console/authorized-apps';
const LOGO_URL = 'https://www.orcarouter.ai/orca-logo-classic.png';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname || '').toLowerCase());
}

// Remote origins must be HTTPS; plain HTTP is only tolerated for loopback
// development, where there is no network to intercept.
function requireSafeOrigin(value, label) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error(`OrcaRouter ${label} 地址为空`);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`OrcaRouter ${label} 地址不是合法 URL`);
  }

  if (parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname)) {
    throw new Error(`OrcaRouter ${label} 地址必须使用 HTTPS（仅回环地址允许 HTTP）`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`OrcaRouter ${label} 地址必须使用 HTTP(S)`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`OrcaRouter ${label} 地址不允许携带用户信息或片段`);
  }
  return raw;
}

function normalizeApiBaseUrl(value) {
  const normalized = requireSafeOrigin(value, 'API 服务').replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function resolveOrcaOrigins(environment = process.env) {
  const env = environment || {};
  const shared = String(env.ORCA_BASE_URL || '').trim();
  const authBaseUrl = requireSafeOrigin(
    String(env.ORCA_AUTH_BASE_URL || '').trim() || shared || DEFAULT_AUTH_BASE_URL,
    '鉴权服务',
  );
  const apiBaseUrl = normalizeApiBaseUrl(
    String(env.ORCA_API_BASE_URL || '').trim() || shared || DEFAULT_API_BASE_URL,
  );

  return {
    authBaseUrl,
    apiBaseUrl,
    authorizeUrl: `${authBaseUrl}${AUTHORIZE_PATH}`,
    exchangeUrl: `${authBaseUrl}${EXCHANGE_PATH}`,
    deviceCodeUrl: `${authBaseUrl}${DEVICE_CODE_PATH}`,
    deviceTokenUrl: `${authBaseUrl}${DEVICE_TOKEN_PATH}`,
    keyConsoleUrl: KEY_CONSOLE_URL,
    keyDashboardUrl: KEY_DASHBOARD_URL,
    logoUrl: LOGO_URL,
  };
}

module.exports = {
  AUTHORIZE_PATH,
  DEFAULT_API_BASE_URL,
  DEFAULT_AUTH_BASE_URL,
  DEVICE_CODE_PATH,
  DEVICE_TOKEN_PATH,
  EXCHANGE_PATH,
  KEY_CONSOLE_URL,
  KEY_DASHBOARD_URL,
  LOGO_URL,
  isLoopbackHost,
  normalizeApiBaseUrl,
  requireSafeOrigin,
  resolveOrcaOrigins,
};
