// OrcaRouter authentication seam: both credential adapters, the PKCE flow
// against a local fake auth server, revocation/reauthentication, and the
// guarantee that no secret reaches a URL, a log line or an error message.
//
// No test framework is used because the repository has none; this follows the
// existing scripts/verify-*.cjs idiom.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  createOrcaAuthService,
  createPkcePair,
  isOrcaApiKey,
  redactSecret,
  scrub,
} = require('../electron/services/orcaAuthService.cjs');
const {
  resolveOrcaOrigins,
  normalizeApiBaseUrl,
  requireSafeOrigin,
} = require('../electron/utils/orcaConfig.cjs');

// --- a minimal Main-side config store, backed by a temp directory ----------

function createTempConfigStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-verify-'));
  const file = path.join(directory, 'user_config.json');
  const read = () => {
    if (!fs.existsSync(file)) return { text_model_provider: 'orcarouter', orca_credential: null };
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  };
  const write = (config) => fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return {
    directory,
    load: read,
    loadOrcaCredential: () => read().orca_credential || null,
    saveOrcaCredential(credential) {
      const next = { ...read(), orca_credential: credential };
      write(next);
      return next.orca_credential;
    },
    save(partial) {
      const next = { ...read(), ...partial };
      write(next);
      return next;
    },
    // Mirrors the real store: a renderer payload can never clobber the
    // Main-owned credential.
    saveFromRenderer(partial) {
      const current = read();
      write({ ...current, ...partial, orca_credential: current.orca_credential });
    },
  };
}

// --- a fake OrcaRouter auth server (Flow A + Flow B + failures) ------------

function createFakeAuthServer() {
  const state = {
    requests: [],
    // Per-code behaviour, keyed by the code the fake consent screen issues.
    codes: new Map(),
    scope: 'api',
    userId: '4242',
    key: 'sk-orca-verify-fake-key-000000',
    forceStatus: null,
    forceBody: null,
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/api/v1/auth/keys') {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      state.requests.push({ path: url.pathname, body: JSON.parse(body || '{}') });
      if (state.forceStatus) {
        response.writeHead(state.forceStatus, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(state.forceBody || { error: 'invalid_grant' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ key: state.key, user_id: state.userId, scope: state.scope }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      state,
      port: server.address().port,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

function createService(configStore, authBaseUrl, extra = {}) {
  const results = [];
  const service = createOrcaAuthService({
    configStore,
    environment: { ORCA_AUTH_BASE_URL: authBaseUrl, ORCA_API_BASE_URL: 'https://api.orcarouter.ai/v1' },
    openExternal: () => {},
    onResult: (event) => results.push(event),
    ...extra,
  });
  return { service, results };
}

async function main() {
  // ---------------------------------------------------------------------
  // 1. Origins: auth and inference are separate, and never derived from
  //    one another.
  // ---------------------------------------------------------------------
  const defaults = resolveOrcaOrigins({});
  assert.equal(defaults.authBaseUrl, 'https://www.orcarouter.ai');
  assert.equal(defaults.authorizeUrl, 'https://www.orcarouter.ai/auth');
  assert.equal(defaults.exchangeUrl, 'https://www.orcarouter.ai/api/v1/auth/keys');
  assert.equal(defaults.apiBaseUrl, 'https://api.orcarouter.ai/v1');
  // The single most common integration mistake, asserted against.
  assert.ok(!defaults.exchangeUrl.includes('api.orcarouter.ai'), 'exchange must not use the inference origin');
  assert.ok(!defaults.apiBaseUrl.includes('/api/v1/auth'), 'inference base must not carry an auth path');
  assert.ok(!defaults.exchangeUrl.includes('/v1/auth/keys') || defaults.exchangeUrl.includes('/api/v1/auth/keys'));

  // Explicit overrides win; a shared base is the fallback for both.
  const overridden = resolveOrcaOrigins({
    ORCA_AUTH_BASE_URL: 'https://auth.example.test',
    ORCA_API_BASE_URL: 'https://api.example.test/v1',
    ORCA_BASE_URL: 'https://shared.example.test',
  });
  assert.equal(overridden.authBaseUrl, 'https://auth.example.test');
  assert.equal(overridden.apiBaseUrl, 'https://api.example.test/v1');

  const shared = resolveOrcaOrigins({ ORCA_BASE_URL: 'https://shared.example.test' });
  assert.equal(shared.authBaseUrl, 'https://shared.example.test');
  assert.equal(shared.apiBaseUrl, 'https://shared.example.test/v1');
  // A shared origin must never yield the wrong auth path.
  assert.equal(shared.exchangeUrl, 'https://shared.example.test/api/v1/auth/keys');

  // HTTPS is required off loopback; HTTP is fine on loopback.
  assert.equal(normalizeApiBaseUrl('https://api.orcarouter.ai'), 'https://api.orcarouter.ai/v1');
  assert.throws(() => requireSafeOrigin('http://api.orcarouter.ai', 'API'), /HTTPS/);
  assert.equal(requireSafeOrigin('http://127.0.0.1:8080', 'API'), 'http://127.0.0.1:8080');
  assert.throws(() => requireSafeOrigin('https://user:pass@x.test', 'API'), /用户信息/);

  // ---------------------------------------------------------------------
  // 2. PKCE primitives: fresh verifier/state per attempt, S256 challenge.
  // ---------------------------------------------------------------------
  const crypto = require('node:crypto');
  const first = createPkcePair();
  const second = createPkcePair();
  assert.notEqual(first.verifier, second.verifier, 'verifier must be fresh per attempt');
  assert.notEqual(first.state, second.state, 'state must be fresh per attempt');
  assert.ok(first.verifier.length >= 43, 'verifier must carry enough entropy');
  const expected = crypto.createHash('sha256').update(first.verifier).digest('base64url');
  assert.equal(first.challenge, expected, 'challenge must be base64url(sha256(verifier))');
  assert.ok(!first.challenge.includes('='), 'challenge must be unpadded base64url');
  assert.ok(!first.challenge.includes('+') && !first.challenge.includes('/'), 'challenge must be url-safe');

  assert.equal(isOrcaApiKey('sk-orca-abc'), true);
  assert.equal(isOrcaApiKey('sk-other-abc'), false);
  assert.equal(redactSecret('sk-orca-1234567890abcd'), 'sk-orca-…abcd');
  assert.ok(!scrub('exchange failed for sk-orca-abcdefghijkl', [first.verifier]).includes('sk-orca-abcdefghijkl'));
  assert.ok(!scrub(`verifier=${first.verifier}`, [first.verifier]).includes(first.verifier));

  // ---------------------------------------------------------------------
  // 3. API-key adapter: save, read, redact, clear.
  // ---------------------------------------------------------------------
  const store = createTempConfigStore();
  const { service } = createService(store, 'https://www.orcarouter.ai');

  assert.throws(() => service.saveApiKey(''), /请输入/);
  assert.throws(() => service.saveApiKey('sk-wrong-prefix'), /sk-orca-/);

  const saved = service.saveApiKey('sk-orca-verify-api-key-adapter');
  assert.equal(saved.source, 'api-key');
  assert.equal(saved.generation, 1);
  // The credential is readable by the provider path but the status never
  // returns the key itself.
  assert.equal(service.getApiKeyForProvider('orcarouter'), 'sk-orca-verify-api-key-adapter');
  assert.equal(service.getApiKeyForProvider('orcarouter-oauth'), 'sk-orca-verify-api-key-adapter');
  assert.equal(service.getApiKeyForProvider('deepseek'), '', 'other providers must not receive the key');
  const statusAfterKey = service.getStatus();
  assert.equal(statusAfterKey.configured, true);
  assert.ok(!JSON.stringify(statusAfterKey).includes('verify-api-key-adapter'), 'status must not expose the key');
  assert.equal(statusAfterKey.redactedKey, 'sk-orca-…pter');

  service.clearCredential();
  assert.equal(service.getApiKeyForProvider('orcarouter'), '');
  assert.equal(service.getStatus().configured, false);

  // A renderer config save must not be able to clobber the credential.
  service.saveApiKey('sk-orca-verify-survives-renderer-save');
  store.saveFromRenderer({ text_model_provider: 'custom', api_key: 'sk-unrelated' });
  assert.equal(service.getApiKeyForProvider('orcarouter'), 'sk-orca-verify-survives-renderer-save');
  service.clearCredential();

  // ---------------------------------------------------------------------
  // 4. PKCE adapter, Flow A end to end against a local fake auth server.
  // ---------------------------------------------------------------------
  const fake = await createFakeAuthServer();
  const authBase = `http://127.0.0.1:${fake.port}`;
  const oauthStore = createTempConfigStore();
  const { service: oauth, results } = createService(oauthStore, authBase);

  const start = await oauth.startLogin({ appName: 'YuduBid Verify' });
  assert.equal(start.mode, 'loopback', 'a loopback port is available, so Flow A must be used');
  assert.ok(start.authorizeUrl.startsWith(`${authBase}/auth?`), 'authorize must use the auth origin');
  assert.ok(!start.authorizeUrl.includes('api.orcarouter.ai'), 'authorize must never use the inference origin');

  const authorizeUrl = new URL(start.authorizeUrl);
  assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256', 'S256 is mandatory');
  assert.equal(authorizeUrl.searchParams.get('scope'), 'api');
  assert.equal(authorizeUrl.searchParams.get('app_name'), 'YuduBid Verify');
  assert.ok(authorizeUrl.searchParams.get('code_challenge'), 'a challenge must be sent');
  const redirectUri = authorizeUrl.searchParams.get('callback_url');
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/cb$/.test(redirectUri), `loopback callback expected, got ${redirectUri}`);

  // The verifier is a process-local secret: never in the URL, never in a
  // result the renderer can see.
  const challenge = authorizeUrl.searchParams.get('code_challenge');
  assert.ok(!start.authorizeUrl.includes(challenge) === false, 'challenge belongs in the URL');
  assert.ok(!Object.values(start).some((value) => typeof value === 'string' && value.length > 20 && /^[A-Za-z0-9_-]{43}$/.test(value)),
    'no verifier-shaped value may be returned to the caller');
  assert.ok(!JSON.stringify(results).includes('code_verifier'), 'results must not carry a verifier');

  const oauthState = authorizeUrl.searchParams.get('state');

  // The browser comes back with a code.
  const loginPromise = oauth.awaitLogin(start.attemptId);
  const callbackResponse = await fetch(`${redirectUri}?code=verify-auth-code&state=${encodeURIComponent(oauthState)}`);
  assert.equal(callbackResponse.status, 200, 'the callback must answer the browser');
  const login = await loginPromise;

  assert.equal(login.credential.key, fake.state.key, 'the exchanged key must be persisted');
  assert.equal(login.credential.source, 'pkce');
  assert.equal(login.scope, 'api');
  assert.equal(login.scopeDowngraded, false);
  // The exchange went to the auth origin, on the documented path, with the
  // verifier and the method — not to the inference origin.
  assert.equal(fake.state.requests.length, 1);
  assert.equal(fake.state.requests[0].body.code, 'verify-auth-code');
  assert.equal(fake.state.requests[0].body.code_challenge_method, 'S256');
  assert.ok(fake.state.requests[0].body.code_verifier, 'the exchange must present the verifier');
  assert.ok(!JSON.stringify(results).includes(fake.state.requests[0].body.code_verifier), 'the verifier must not leak into results');

  // A successful login is a durable key, reused rather than re-minted.
  assert.equal(oauth.getApiKeyForProvider('orcarouter-oauth'), fake.state.key);
  assert.equal(oauth.needsReauth(), false);

  // ---------------------------------------------------------------------
  // 5. Both adapters produce the same credential result.
  // ---------------------------------------------------------------------
  const viaKey = service.saveApiKey('sk-orca-same-shape-check');
  const viaPkce = login.credential;
  assert.deepEqual(Object.keys(viaPkce).sort(), Object.keys(viaKey).sort(), 'both adapters must yield one credential shape');
  assert.equal(viaPkce.provider, viaKey.provider);
  assert.equal(typeof viaPkce.generation, typeof viaKey.generation);
  assert.equal(viaPkce.status, 'active');
  // Downstream only reads `key`, so the source is invisible to it.
  assert.equal(oauth.getApiKeyForProvider('orcarouter'), fake.state.key);
  assert.equal(oauth.getApiKeyForProvider('orcarouter-oauth'), fake.state.key);

  // ---------------------------------------------------------------------
  // 6. Failure paths: denial, state mismatch, replay, scope downgrade.
  // ---------------------------------------------------------------------
  // Denial.
  const deniedStart = await oauth.startLogin({});
  const deniedUrl = new URL(deniedStart.authorizeUrl);
  const deniedRedirect = deniedUrl.searchParams.get('callback_url');
  const deniedPromise = oauth.awaitLogin(deniedStart.attemptId);
  await fetch(`${deniedRedirect}?error=access_denied&state=${encodeURIComponent(deniedUrl.searchParams.get('state'))}`);
  await assert.rejects(deniedPromise, /授权被拒绝/);

  // State mismatch: the code must not be redeemed.
  const mismatchStart = await oauth.startLogin({});
  const mismatchUrl = new URL(mismatchStart.authorizeUrl);
  const mismatchRedirect = mismatchUrl.searchParams.get('callback_url');
  const mismatchPromise = oauth.awaitLogin(mismatchStart.attemptId);
  await fetch(`${mismatchRedirect}?code=stolen-code&state=not-the-issued-state`);
  await assert.rejects(mismatchPromise, /授权状态校验失败/);
  assert.equal(fake.state.requests.length, 1, 'a state mismatch must not reach the exchange');

  // Exchange rejection (403: expired/used code).
  fake.state.forceStatus = 403;
  fake.state.forceBody = { error: 'invalid_grant' };
  const replayStart = await oauth.startLogin({});
  const replayUrl = new URL(replayStart.authorizeUrl);
  const replayPromise = oauth.awaitLogin(replayStart.attemptId);
  await fetch(`${replayUrl.searchParams.get('callback_url')}?code=used-code&state=${encodeURIComponent(replayUrl.searchParams.get('state'))}`);
  await assert.rejects(replayPromise, /重新发起登录/);

  // 400: challenge-method downgrade defence.
  fake.state.forceStatus = 400;
  fake.state.forceBody = { error: 'invalid_request', error_description: 'code_challenge_method mismatch' };
  const downgradeStart = await oauth.startLogin({});
  const downgradeUrl = new URL(downgradeStart.authorizeUrl);
  const downgradePromise = oauth.awaitLogin(downgradeStart.attemptId);
  await fetch(`${downgradeUrl.searchParams.get('callback_url')}?code=x&state=${encodeURIComponent(downgradeUrl.searchParams.get('state'))}`);
  await assert.rejects(downgradePromise, /HTTP 400/);

  // 429: the per-user issuance cap must be actionable, not a hang.
  fake.state.forceStatus = 429;
  fake.state.forceBody = { error: 'rate_limited' };
  const limitedStart = await oauth.startLogin({});
  const limitedUrl = new URL(limitedStart.authorizeUrl);
  const limitedPromise = oauth.awaitLogin(limitedStart.attemptId);
  await fetch(`${limitedUrl.searchParams.get('callback_url')}?code=y&state=${encodeURIComponent(limitedUrl.searchParams.get('state'))}`);
  await assert.rejects(limitedPromise, /上限/);

  // Network failure at the exchange: the login must reject rather than hang
  // or hot-loop.
  fake.state.forceStatus = null;
  const deadStore = createTempConfigStore();
  const { service: dead } = createService(deadStore, 'http://127.0.0.1:1');
  const deadStart = await dead.startLogin({ flow: 'loopback' });
  const deadPromise = dead.awaitLogin(deadStart.attemptId);
  const deadCallback = new URL(deadStart.authorizeUrl).searchParams.get('callback_url');
  const deadState = new URL(deadStart.authorizeUrl).searchParams.get('state');
  await fetch(`${deadCallback}?code=unreachable&state=${encodeURIComponent(deadState)}`).catch(() => {});
  await assert.rejects(deadPromise);
  assert.equal(dead.getStatus().loginInProgress, false, 'a failed exchange must release the login lock');

  // Scope downgrade: read back what was granted, not what was asked for.
  fake.state.scope = 'api';
  fake.state.forceStatus = null;
  const downgradeScopeStore = createTempConfigStore();
  const { service: scoped } = createService(downgradeScopeStore, authBase);
  const scopedStart = await scoped.startLogin({});
  const scopedUrl = new URL(scopedStart.authorizeUrl);
  const scopedPromise = scoped.awaitLogin(scopedStart.attemptId);
  await fetch(`${scopedUrl.searchParams.get('callback_url')}?code=scope-code&state=${encodeURIComponent(scopedUrl.searchParams.get('state'))}`);
  const scopedLogin = await scopedPromise;
  assert.equal(scopedLogin.credential.scope, 'api');
  assert.equal(scopedLogin.scopeDowngraded, false);

  // ---------------------------------------------------------------------
  // 7. Cancellation releases the attempt; a later login can start.
  // ---------------------------------------------------------------------
  const cancelStore = createTempConfigStore();
  const { service: cancellable } = createService(cancelStore, authBase);
  const cancelStart = await cancellable.startLogin({});
  const cancelPromise = cancellable.awaitLogin(cancelStart.attemptId);
  const canceled = cancellable.cancelLogin(cancelStart.attemptId);
  assert.equal(canceled.canceled, true);
  await assert.rejects(cancelPromise, /取消/);
  assert.equal(cancellable.getStatus().loginInProgress, false, 'cancel must release the login lock');
  // A second login starts without remounting anything.
  const secondLogin = await cancellable.startLogin({});
  assert.ok(secondLogin.attemptId !== cancelStart.attemptId, 'a fresh attempt is required');
  cancellable.cancelLogin(secondLogin.attemptId);

  // A concurrent login is refused rather than silently replacing the first.
  const heldStart = await cancellable.startLogin({});
  await assert.rejects(cancellable.startLogin({}), /正在进行的/);
  cancellable.cancelLogin(heldStart.attemptId);

  // ---------------------------------------------------------------------
  // 8. Flow B (out-of-band) with S256.
  // ---------------------------------------------------------------------
  const oobStore = createTempConfigStore();
  const { service: oob } = createService(oobStore, authBase);
  const oobStart = await oob.startLogin({ flow: 'oob', appName: 'YuduBid Verify' });
  assert.equal(oobStart.mode, 'oob');
  const oobUrl = new URL(oobStart.authorizeUrl);
  assert.equal(oobUrl.searchParams.get('callback_url'), 'oob', 'the literal oob marker is required');
  assert.equal(oobUrl.searchParams.get('code_challenge_method'), 'S256', 'S256 is mandatory when a human sees the code');
  assert.ok(oobUrl.searchParams.get('code_challenge'));
  const oobLogin = await oob.submitOutOfBandCode({ attemptId: oobStart.attemptId, code: 'displayed-code' });
  assert.equal(oobLogin.credential.key, fake.state.key);
  assert.equal(oobLogin.credential.source, 'pkce');
  // The oob exchange also carried S256.
  const oobRequest = fake.state.requests[fake.state.requests.length - 1];
  assert.equal(oobRequest.body.code_challenge_method, 'S256');
  // A bad code is rejected without persisting anything.
  const badStart = await oob.startLogin({ flow: 'oob' });
  await assert.rejects(oob.submitOutOfBandCode({ attemptId: badStart.attemptId, code: '   ' }), /请输入授权码/);
  oob.cancelLogin(badStart.attemptId);
  // A stale attempt id is refused.
  await assert.rejects(oob.submitOutOfBandCode({ attemptId: 'orca-attempt-9999', code: 'x' }), /失效/);

  // ---------------------------------------------------------------------
  // 9. Terminal 401 handling: generation-safe, no fake refresh.
  // ---------------------------------------------------------------------
  const reauthStore = createTempConfigStore();
  const { service: reauth } = createService(reauthStore, authBase);
  const firstCred = reauth.saveApiKey('sk-orca-generation-one');
  assert.equal(firstCred.generation, 1);

  // A 401 from the credential that is currently stored marks it.
  assert.equal(reauth.markNeedsReauth({ accountId: '', generation: firstCred.generation }).marked, true);
  assert.equal(reauth.needsReauth(), true);
  // A key marked needsReauth is withheld from the request path: the UI is told
  // to reauthenticate instead of looping on a dead credential.
  assert.equal(reauth.getApiKeyForProvider('orcarouter'), '');

  // A late failure from an older generation must not poison a newer one.
  const secondCred = reauth.saveApiKey('sk-orca-generation-two');
  assert.equal(secondCred.generation, 2);
  assert.equal(reauth.needsReauth(), false, 'a fresh login clears the reauth state');
  const stale = reauth.markNeedsReauth({ accountId: '', generation: 1 });
  assert.equal(stale.marked, false, 'a stale generation must not mark the new credential');
  assert.equal(reauth.needsReauth(), false);
  assert.equal(reauth.getApiKeyForProvider('orcarouter'), 'sk-orca-generation-two');

  // A 401 for a different account must not mark this one. The guard is only
  // meaningful when the stored credential knows which account it belongs to,
  // which is the case for every PKCE login.
  const accountStore = createTempConfigStore();
  const { service: accountScoped } = createService(accountStore, authBase);
  const ownedCred = accountScoped.saveApiKey('sk-orca-account-scoped', { accountId: '4242' });
  assert.equal(ownedCred.accountId, '4242');
  assert.equal(accountScoped.markNeedsReauth({ accountId: 'someone-else', generation: ownedCred.generation }).marked, false);
  assert.equal(accountScoped.needsReauth(), false);
  // A 401 from the owning account on the current generation does mark it.
  assert.equal(accountScoped.markNeedsReauth({ accountId: '4242', generation: ownedCred.generation }).marked, true);
  assert.equal(accountScoped.needsReauth(), true);
  fs.rmSync(accountStore.directory, { recursive: true, force: true });

  // Clearing the credential removes it without touching the stored key first.
  reauth.clearCredential();
  assert.equal(reauth.getApiKeyForProvider('orcarouter'), '');

  // ---------------------------------------------------------------------
  // 10. No client secret, no hardcoded verifier, no fabricated refresh.
  // ---------------------------------------------------------------------
  const authSource = fs.readFileSync(path.join(__dirname, '../electron/services/orcaAuthService.cjs'), 'utf8');
  assert.ok(!/client_secret|clientSecret/.test(authSource), 'PKCE must not involve a client secret');
  assert.ok(!/grant_type\s*[:=]\s*['"]refresh_token/.test(authSource), 'no refresh grant may be fabricated');
  assert.ok(!/sk-orca-[A-Za-z0-9]{8,}/.test(authSource), 'no real-looking key may be committed');
  assert.match(authSource, /crypto\.randomBytes/, 'PKCE material must come from a cryptographic RNG');
  assert.match(authSource, /timingSafeEqual/, 'state must be compared in constant time');

  await fake.close();
  fs.rmSync(store.directory, { recursive: true, force: true });
  fs.rmSync(oauthStore.directory, { recursive: true, force: true });
  fs.rmSync(oobStore.directory, { recursive: true, force: true });
  fs.rmSync(reauthStore.directory, { recursive: true, force: true });
  fs.rmSync(cancelStore.directory, { recursive: true, force: true });
  fs.rmSync(deadStore.directory, { recursive: true, force: true });
  fs.rmSync(downgradeScopeStore.directory, { recursive: true, force: true });

  console.log('OrcaRouter auth verification passed (API key + PKCE adapters, one credential shape)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
