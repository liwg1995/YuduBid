const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_VERSIONS_PER_DRAFT = 30;
const MAX_DIFF_LINES = 240;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf-8').digest('hex');
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function sanitizeKey(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'draft';
}

function createSoftwareCopyrightDraftHistory({ rootDir }) {
  const historyRoot = path.join(rootDir, 'draft-history');

  function batchId(state) {
    if (!state?.draftDir) throw new Error('当前没有可用的草稿批次');
    return hash(path.resolve(state.draftDir)).slice(0, 20);
  }

  function draftDir(state, key) {
    return path.join(historyRoot, batchId(state), sanitizeKey(key));
  }

  function list(state, key) {
    const targetDir = draftDir(state, key);
    if (!fs.existsSync(targetDir)) return [];
    return fs.readdirSync(targetDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJson(path.join(targetDir, name)))
      .filter((item) => item?.id && item?.key === key && typeof item.content === 'string')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(({ content, ...metadata }) => metadata);
  }

  function readVersion(state, key, versionId) {
    const safeId = String(versionId || '');
    if (!/^[a-f0-9-]{20,80}$/i.test(safeId)) throw new Error('草稿版本标识无效');
    const filePath = path.join(draftDir(state, key), `${safeId}.json`);
    const item = readJson(filePath);
    if (!item || item.key !== key || typeof item.content !== 'string') {
      throw new Error('草稿历史版本不存在');
    }
    return item;
  }

  function capture(state, key, content, reason = '保存前自动备份') {
    const normalizedContent = String(content || '');
    const contentHash = hash(normalizedContent);
    const existing = list(state, key);
    if (existing[0]?.contentHash === contentHash) return existing[0];

    const createdAt = new Date().toISOString();
    const item = {
      id: `${createdAt.replace(/\D/g, '').slice(0, 17)}-${crypto.randomUUID()}`,
      key,
      reason: String(reason || '自动备份').slice(0, 80),
      createdAt,
      contentHash,
      lineCount: normalizedContent ? normalizedContent.split(/\r?\n/).length : 0,
      charCount: normalizedContent.length,
      content: normalizedContent,
    };
    const targetDir = ensureDir(draftDir(state, key));
    fs.writeFileSync(path.join(targetDir, `${item.id}.json`), JSON.stringify(item), 'utf-8');

    const versionFiles = fs.readdirSync(targetDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({ name, item: readJson(path.join(targetDir, name)) }))
      .filter(({ item: saved }) => saved?.createdAt)
      .sort((a, b) => String(b.item.createdAt).localeCompare(String(a.item.createdAt)));
    versionFiles.slice(MAX_VERSIONS_PER_DRAFT).forEach(({ name }) => fs.unlinkSync(path.join(targetDir, name)));
    const { content: _content, ...metadata } = item;
    return metadata;
  }

  function compare(state, key, versionId, currentContent) {
    const version = readVersion(state, key, versionId);
    const previousLines = version.content.split(/\r?\n/);
    const currentLines = String(currentContent || '').split(/\r?\n/);
    let prefix = 0;
    while (prefix < previousLines.length && prefix < currentLines.length && previousLines[prefix] === currentLines[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < previousLines.length - prefix
      && suffix < currentLines.length - prefix
      && previousLines[previousLines.length - 1 - suffix] === currentLines[currentLines.length - 1 - suffix]
    ) suffix += 1;

    const removed = previousLines.slice(prefix, previousLines.length - suffix);
    const added = currentLines.slice(prefix, currentLines.length - suffix);
    const contextBefore = previousLines.slice(Math.max(0, prefix - 3), prefix);
    const contextAfter = previousLines.slice(previousLines.length - suffix, previousLines.length - suffix + 3);
    const diffLines = [
      ...contextBefore.map((content, index) => ({ type: 'context', content, oldLine: prefix - contextBefore.length + index + 1, newLine: prefix - contextBefore.length + index + 1 })),
      ...removed.slice(0, MAX_DIFF_LINES / 2).map((content, index) => ({ type: 'remove', content, oldLine: prefix + index + 1 })),
      ...added.slice(0, MAX_DIFF_LINES / 2).map((content, index) => ({ type: 'add', content, newLine: prefix + index + 1 })),
      ...contextAfter.map((content, index) => ({ type: 'context', content, oldLine: previousLines.length - suffix + index + 1, newLine: currentLines.length - suffix + index + 1 })),
    ];
    return {
      version: (({ content, ...metadata }) => metadata)(version),
      changed: version.content !== String(currentContent || ''),
      addedLineCount: added.length,
      removedLineCount: removed.length,
      unchangedLineCount: prefix + suffix,
      truncated: removed.length > MAX_DIFF_LINES / 2 || added.length > MAX_DIFF_LINES / 2,
      lines: diffLines,
    };
  }

  return { capture, compare, list, readVersion };
}

module.exports = { createSoftwareCopyrightDraftHistory };
