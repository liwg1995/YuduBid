import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';

const apiBase = 'https://api.gitcode.com/api/v5';
const token = process.env.ATOMGIT_ACCESS_TOKEN;
const owner = process.env.ATOMGIT_OWNER;
const repo = process.env.ATOMGIT_REPO;
const tag = process.env.TAG_NAME;
const directory = process.argv[2];
const githubRepository = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;
const notesOnly = directory === '--notes-only';
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

async function uploadAsset(file) {
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

  const files = (await readdir(directory)).sort().map((name) => join(directory, name));
  if (!files.length) throw new Error('No release assets found');

  await runGit(['push', `https://gitcode.com/${repoPath}.git`, `${replaceExisting ? '+' : ''}refs/tags/${tag}:refs/tags/${tag}`]);
  let release = await request(releasePath, { allow404: true });
  if (!release) {
    await request('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, ...releaseInfo, release_status: 'pre' }) });
    release = await request(releasePath);
  }

  const existing = new Map((release.assets || []).filter((asset) => asset.type !== 'source').map((asset) => [asset.name, asset]));
  if ([...existing.values()].some((asset) => knownAssetSize(asset) === null)) {
    console.warn('GitCode did not return asset sizes; existing attachments will be checked by name');
  }
  for (const file of files) {
    const size = (await stat(file)).size;
    const asset = existing.get(basename(file));
    if (asset && !replaceExisting && (knownAssetSize(asset) === null || knownAssetSize(asset) === size)) continue;
    if (asset && !replaceExisting) throw new Error(`Existing GitCode asset differs in size: ${basename(file)} (local=${size}, remote=${knownAssetSize(asset)})`);
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
  console.log(`GitCode Release published: https://gitcode.com/${repoPath}/releases/${encodeURIComponent(tag)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
