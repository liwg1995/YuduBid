'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const { isOfficialReleaseDownloadUrl, parseSha256Digest, hashFile } = require('../electron/utils/updateIntegrity.cjs');
const { openMacInstaller } = require('../electron/services/updateService.cjs');

async function verifyMacInstallerLaunch() {
  const calls = [];
  let quitCount = 0;
  let scheduledQuit;
  const app = { quit: () => { quitCount += 1; } };
  const launch = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0));
    return child;
  };
  const scheduleQuit = (callback, delay) => {
    assert.equal(delay, 800);
    scheduledQuit = callback;
  };

  const dmg = await openMacInstaller('/tmp/update.dmg', app, { launch, scheduleQuit });
  assert.equal(dmg.success, true);
  assert.deepEqual(calls[0], { command: '/usr/bin/open', args: ['/tmp/update.dmg'], options: { stdio: 'ignore' } });
  assert.equal(quitCount, 0);
  assert.equal(typeof scheduledQuit, 'function');
  scheduledQuit();
  assert.equal(quitCount, 1);

  scheduledQuit = undefined;
  const zip = await openMacInstaller('/tmp/update.zip', app, { launch, scheduleQuit });
  assert.equal(zip.success, true);
  assert.equal(scheduledQuit, undefined);

  const failed = await openMacInstaller('/tmp/update.dmg', app, {
    launch: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 1));
      return child;
    },
    scheduleQuit,
  });
  assert.equal(failed.success, false);
  assert.equal(scheduledQuit, undefined);
  assert.equal(quitCount, 1);

  const launchError = await openMacInstaller('/tmp/update.dmg', app, {
    launch: () => {
      const child = new EventEmitter();
      queueMicrotask(() => {
        child.emit('error', new Error('open unavailable'));
        child.emit('close', 0);
      });
      return child;
    },
    scheduleQuit,
  });
  assert.equal(launchError.success, false);
  assert.equal(scheduledQuit, undefined);
  assert.equal(quitCount, 1);
}

async function main() {
  const official = 'https://github.com/liwg1995/YuduBid/releases/download/v0.9.13/YuDuBid.exe';
  assert.equal(isOfficialReleaseDownloadUrl(official), true);
  assert.equal(isOfficialReleaseDownloadUrl('https://github.com/other/YuduBid/releases/download/v1/setup.exe'), false);
  assert.equal(isOfficialReleaseDownloadUrl(`${official}?redirect=1`), false);
  assert.equal(isOfficialReleaseDownloadUrl(`${official}\n`), false);
  assert.equal(isOfficialReleaseDownloadUrl('https://github.com/liwg1995/YuduBid/releases/download/v1/../setup.exe'), false);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yudubid-update-integrity-'));
  try {
    const file = path.join(directory, 'test.exe');
    fs.writeFileSync(file, 'trusted artifact');
    const digest = crypto.createHash('sha256').update('trusted artifact').digest('hex');
    assert.equal(parseSha256Digest(`sha256:${digest}`), digest);
    assert.equal(parseSha256Digest(digest), '');
    assert.equal(await hashFile(file), digest);
    fs.appendFileSync(file, 'tampered');
    assert.notEqual(await hashFile(file), digest);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  await verifyMacInstallerLaunch();
  console.log('[update-integrity-verify] passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
