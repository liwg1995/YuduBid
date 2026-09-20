'use strict';

const assert = require('node:assert/strict');
const { assertRemoteHttpUrl, fetchRemoteWithTimeout, isPublicIp, lookupPublicAddress } = require('../electron/utils/secureHttp.cjs');

async function main() {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.1.1', '192.168.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicIp(address), false, address);
  }
  for (const address of ['8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicIp(address), true, address);
  assert.throws(() => assertRemoteHttpUrl('http://[::ffff:127.0.0.1]/secret'), /不安全/);
  assert.throws(() => assertRemoteHttpUrl('https://user:secret@example.com/'), /不安全/);

  await new Promise((resolve, reject) => lookupPublicAddress('example.com', {}, (error, address) => {
    try { assert.match(error?.message || '', /非公网 IP/); assert.equal(address, undefined); resolve(); } catch (failure) { reject(failure); }
  }, (_host, _options, callback) => callback(null, [{ address: '93.184.215.14', family: 4 }, { address: '127.0.0.1', family: 4 }])));
  await new Promise((resolve, reject) => lookupPublicAddress('example.com', {}, (error, address) => {
    try { assert.equal(error, null); assert.equal(address, '93.184.215.14'); resolve(); } catch (failure) { reject(failure); }
  }, (_host, _options, callback) => callback(null, [{ address: '93.184.215.14', family: 4 }])));

  const visited = [];
  const fakeFetch = async (url, options) => {
    visited.push({ url, redirect: options.redirect, dispatcher: options.dispatcher });
    if (visited.length === 1) return new Response(null, { status: 302, headers: { location: '/safe' } });
    return new Response('safe');
  };
  const response = await fetchRemoteWithTimeout('https://example.com/start', { fetchImpl: fakeFetch });
  assert.equal(await response.text(), 'safe');
  assert.equal(visited[1].url, 'https://example.com/safe');
  assert.ok(visited.every((entry) => entry.redirect === 'manual' && entry.dispatcher));
  await assert.rejects(() => fetchRemoteWithTimeout('https://example.com/start', {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
  }), /不安全/);
  await assert.rejects(() => fetchRemoteWithTimeout('https://example.com/start', {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://example.com/unsafe' } }),
  }), /降级/);
  let forwardedHeaders;
  await fetchRemoteWithTimeout('https://example.com/start', {
    headers: { Authorization: 'Bearer secret', Cookie: 'session=secret', 'X-Trace': 'okay' },
    fetchImpl: async (_url, options) => {
      if (!forwardedHeaders) {
        forwardedHeaders = options.headers;
        return new Response(null, { status: 302, headers: { location: 'https://other.example.com/next' } });
      }
      const headers = new Headers(options.headers);
      assert.equal(headers.has('authorization'), false);
      assert.equal(headers.has('cookie'), false);
      assert.equal(headers.get('x-trace'), 'okay');
      return new Response('okay');
    },
  });
  const dns = require('node:dns');
  const originalLookup = dns.lookup;
  try {
    dns.lookup = (_host, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]);
    await assert.rejects(() => fetchRemoteWithTimeout('http://rebind-test.invalid:12345/'),
      (error) => /非公网 IP/.test(error?.cause?.message || ''));
  } finally {
    dns.lookup = originalLookup;
  }
  console.log('[secure-http-verify] passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
