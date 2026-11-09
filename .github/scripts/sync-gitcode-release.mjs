import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';

const apiBase = 'https://api.gitcode.com/api/v5';
const token = process.env.ATOMGIT_ACCESS_TOKEN;
const owner = process.env.ATOMGIT_OWNER;
const repo = process.env.ATOMGIT_REPO;
const tag = process.env.TAG_NAME;
const directory = process.argv[2];
const githubRepository = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;
const notesOnly = directory === '--notes-only';
const checksumsOnly = process.env.GITCODE_CHECKSUMS_ONLY === 'true';
const repairName = process.env.GITCODE_REPAIR_ASSET || '';
const replaceExisting = process.env.REPLACE_EXISTING_RELEASE === 'true';

if (![token, owner, repo, tag, githubRepository, githubToken].every(Boolean) || (!notesOnly && !directory)) {
  throw new Error('GitCode credentials, GitHub release credentials, tag and asset directory are required');
}

const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const endpoint = `${apiBase}/repos/${repoPath}`;

async function request(path, options = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (response.status === 404 && options.allow404) return null;
  const body = await response.text();
  if (!response.ok) throw new Error(`GitCode API ${path}: HTTP ${response.status} ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    const authorization = Buffer.from(`${owner}:${token}`).toString('base64');
    const child = spawn('git', args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`git push failed: ${code}`)));
  });
}

async function uploadAssetOnce(file) {
  const name = basename(file);
  const upload = await request(`/releases/${encodeURIComponent(tag)}/upload_url?file_name=${encodeURIComponent(name)}`);
  if (!upload?.url) throw new Error(`GitCode did not provide an upload URL for ${name}`);
  await new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/octet-stream', ...upload.headers };
    const args = ['--fail', '--silent', '--show-error', '--location', '--connect-timeout', '30', '--max-time', '1800', '--request', 'PUT'];
    for (const [key, value] of Object.entries(headers)) args.push('--header', `${key}: ${value}`);
    args.push('--upload-file', file, '--output', '/dev/null', upload.url);
    const child = spawn('curl', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`GitCode asset upload failed for ${name}: curl exited ${code}`)));
  });
}

async function uploadAsset(file) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await uploadAssetOnce(file);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`GitCode upload interrupted for ${basename(file)}; requesting a new upload URL (${attempt}/3): ${error.message}`);
      await delay(attempt * 5000);
    }
  }
}

function knownAssetSize(asset) {
  const size = Number(asset?.size ?? asset?.file_size ?? asset?.filesize);
  return Number.isFinite(size) && size > 0 ? size : null;
}

async function fetchGithubRelease() {
  const response = await fetch(`https://api.github.com/repos/${githubRepository}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'YuDuBid-Release-Sync',
    },
  });
  if (!response.ok) throw new Error(`GitHub Release ${tag}: HTTP ${response.status}`);
  const release = await response.json();
  if (!release?.tag_name || !String(release.body || '').trim()) {
    throw new Error(`GitHub Release ${tag} is missing its tag or release notes`);
  }
  return release;
}

async function main() {
  const githubRelease = await fetchGithubRelease();
  if (githubRelease.tag_name !== tag) throw new Error(`GitHub Release tag does not match ${tag}`);
  const releasePath = `/releases/${encodeURIComponent(tag)}`;
  const releaseInfo = { name: githubRelease.name || tag, body: githubRelease.body };
  if (notesOnly) {
    const release = await request(releasePath, { allow404: true });
    if (!release) throw new Error(`GitCode Release ${tag} does not exist`);
    await request(releasePath, { method: 'PATCH', body: JSON.stringify({ ...releaseInfo, release_status: release.release_status || 'latest' }) });
    console.log(`GitCode Release notes synchronized: ${tag}`);
    return;
  }

  const assets = new Map((githubRelease.assets || []).map((asset) => [asset.name, asset]));
  const version = tag.replace(/^[vV]/, '');
  const checksums = ['Windows', 'macOS'].map((platform) => {
    const name = `YuDuBid-${version}-${platform}-sha256.txt`;
    const asset = assets.get(name);
    if (!asset || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) {
      throw new Error(`Published GitHub Release is missing a verified checksum asset: ${name}`);
    }
    return asset;
  });
  const localNames = new Set(await readdir(directory));
  const repairAsset = repairName ? assets.get(repairName) : null;
  if (repairName && (!checksumsOnly || !repairAsset || checksums.includes(repairAsset) || !/^sha256:[a-f0-9]{64}$/i.test(repairAsset.digest || ''))) {
    throw new Error(`Invalid GitHub attachment selected for repair: ${repairName}`);
  }
  const syncAssets = checksumsOnly ? [...checksums, ...(repairAsset ? [repairAsset] : [])] : [...assets.values()];
  const files = [];
  for (const asset of syncAssets) {
    const { name } = asset;
    const file = join(directory, name);
    if (!localNames.has(name)) throw new Error(`GitCode sync input is missing GitHub attachment: ${name}`);
    if ((await stat(file)).size !== asset.size) throw new Error(`GitCode sync input has the wrong size: ${name}`);
    if (checksums.includes(asset) || asset === repairAsset) {
      const hash = createHash('sha256');
      await pipeline(createReadStream(file), hash);
      const digest = `sha256:${hash.digest('hex')}`;
      if (digest !== asset.digest.toLowerCase()) throw new Error(`GitCode sync input has the wrong checksum: ${name}`);
    }
    files.push(file);
  }

  await runGit(['push', `https://gitcode.com/${repoPath}.git`, `${replaceExisting ? '+' : ''}refs/tags/${tag}:refs/tags/${tag}`]);
  let release = await request(releasePath, { allow404: true });
  if (!release) {
    if (checksumsOnly) throw new Error('Cannot repair checksums before the GitCode Release exists');
    await request('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, ...releaseInfo, release_status: 'pre' }) });
    release = await request(releasePath);
  }

  const existing = new Map((release.assets || []).filter((asset) => asset.type !== 'source').map((asset) => [asset.name, asset]));
  if (checksumsOnly) {
    for (const [name, asset] of assets) {
      if (syncAssets.includes(asset)) continue;
      const mirror = existing.get(name);
      if (!mirror || (knownAssetSize(mirror) !== null && knownAssetSize(mirror) !== asset.size)) {
        throw new Error(`Cannot repair checksums while a GitCode attachment is missing or has the wrong size: ${name}`);
      }
    }
  }
  if ([...existing.values()].some((asset) => knownAssetSize(asset) === null)) {
    console.warn('GitCode did not return asset sizes; existing attachments will be checked by name');
  }
  for (const file of files) {
    const size = (await stat(file)).size;
    const asset = existing.get(basename(file));
    if (asset && !replaceExisting && (knownAssetSize(asset) === null || knownAssetSize(asset) === size)) continue;
    if (asset && !replaceExisting && basename(file) !== repairName) throw new Error(`Existing GitCode asset differs in size: ${basename(file)} (local=${size}, remote=${knownAssetSize(asset)})`);
    if (asset) {
      if (!asset.id) throw new Error(`GitCode asset ID is missing: ${basename(file)}`);
      await request(`${releasePath}/attach_files/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
    }
    console.log(`Uploading ${basename(file)} (${size} bytes)`);
    await uploadAsset(file);
  }

  release = await request(releasePath);
  const uploaded = new Map((release.assets || []).filter((asset) => asset.type !== 'source').map((asset) => [asset.name, asset]));
  for (const file of files) {
    const asset = uploaded.get(basename(file));
    if (!asset || (knownAssetSize(asset) !== null && knownAssetSize(asset) !== (await stat(file)).size)) {
      throw new Error(`GitCode asset is missing or has the wrong size: ${basename(file)}`);
    }
  }
  await request(releasePath, { method: 'PATCH', body: JSON.stringify({ ...releaseInfo, release_status: 'latest' }) });
  for (const asset of checksums) {
    const url = `https://gitcode.com/${repoPath}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        if (digest !== asset.digest.toLowerCase()) throw new Error('SHA-256 differs from GitHub');
        console.log(`Verified public GitCode checksum: ${asset.name}`);
        break;
      } catch (error) {
        if (attempt === 5) throw new Error(`GitCode checksum unavailable or invalid: ${asset.name}: ${error.message}`);
        await delay(attempt * 3000);
      }
    }
  }
  console.log(`GitCode Release published: https://gitcode.com/${repoPath}/releases/${encodeURIComponent(tag)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
