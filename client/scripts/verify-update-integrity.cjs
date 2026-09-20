'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isOfficialReleaseDownloadUrl, parseSha256Digest, hashFile } = require('../electron/utils/updateIntegrity.cjs');

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
  console.log('[update-integrity-verify] passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
