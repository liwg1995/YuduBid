'use strict';
const assert = require('node:assert/strict');
const { createReleaseJsonFetcher } = require('../electron/services/releaseMetadataService.cjs');

async function main() {
  let time = Date.parse('2026-10-30T00:00:00Z');
  let calls = 0;
  let mode = 'success';
  const fetcher = createReleaseJsonFetcher({ now: () => time, fetchImpl: async () => {
    calls += 1;
    if (mode === 'network') throw new Error('network');
    return { ok: mode === 'success', status: mode === 'rate' ? 429 : mode === 'missing' ? 404 : 200, headers: { get: () => '120' }, json: async () => [{ tag_name: 'v1.0.0' }] };
  }, syncPending: (message) => Object.assign(new Error(message), { syncPending: true }) });
  const results = await Promise.all(Array.from({ length: 10 }, () => fetcher('releases', undefined, 'gitcode')));
  assert.equal(calls, 1);
  assert.equal(results[0][0].tag_name, 'v1.0.0');
  await fetcher('releases', undefined, 'gitcode');
  assert.equal(calls, 1);
  time += 300001;
  mode = 'rate';
  await assert.rejects(fetcher('releases', undefined, 'gitcode'), (error) => error.status === 429 && error.retryAt === time + 120000);
  const afterRate = calls;
  await assert.rejects(fetcher('releases', undefined, 'gitcode'), /429/);
  assert.equal(calls, afterRate);
  time += 120001;
  mode = 'success';
  await fetcher('releases', undefined, 'gitcode');
  assert.equal(calls, afterRate + 1);
  mode = 'network';
  await assert.rejects(fetcher('network'), /network/);
  await assert.rejects(fetcher('network'), /network/);
  assert.equal(calls, afterRate + 3);
  mode = 'missing';
  await assert.rejects(fetcher('missing', undefined, 'gitcode'), error => error.syncPending === true);
  for (const retry of [null, 'invalid', '0', new Date(time + 90000).toUTCString()]) {
    let count = 0;
    const limited = createReleaseJsonFetcher({ now: () => time, fetchImpl: async () => { count++; return { ok: false, status: 429, headers: { get: () => retry } }; } });
    await assert.rejects(limited('date'), error => error.retryAt > time);
    await assert.rejects(limited('date'), /429/);
    assert.equal(count, 1);
  }
  console.log('[release-metadata] concurrency, TTL, 429 cooldown/recovery, network retry, 404 and Retry-After passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
