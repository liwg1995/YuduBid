'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function isOfficialReleaseDownloadUrl(value) {
  const raw = String(value || '');
  if (/\s/.test(raw)) return false;
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.origin === 'https://github.com'
      && !url.username && !url.password && !url.search && !url.hash
      && parts.length === 6
      && parts[0].toLowerCase() === 'liwg1995'
      && parts[1].toLowerCase() === 'yudubid'
      && parts[2] === 'releases' && parts[3] === 'download'
      && parts[4] !== '.' && parts[4] !== '..'
      && parts[5] !== '.' && parts[5] !== '..'
      && !parts.some((part) => /%2f|%5c/i.test(part));
  } catch {
    return false;
  }
}

function parseSha256Digest(value) {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(String(value || '').trim());
  return match ? match[1].toLowerCase() : '';
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

module.exports = { isOfficialReleaseDownloadUrl, parseSha256Digest, hashFile };
