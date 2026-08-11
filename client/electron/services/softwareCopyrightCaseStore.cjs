const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function caseName(state, fallback = '未命名软著项目') {
  return String(state?.fields?.softwareName || state?.project?.name || fallback).trim().slice(0, 80) || fallback;
}

function createSoftwareCopyrightCaseStore({ rootDir }) {
  const casesRoot = `${rootDir}-cases`;
  const indexPath = path.join(casesRoot, 'index.json');

  function assertSafePaths() {
    if (!path.basename(rootDir) || rootDir === path.parse(rootDir).root || casesRoot === rootDir) {
      throw new Error('软著项目工作区路径无效');
    }
  }

  function caseDir(id) {
    if (!/^[a-f0-9-]{20,80}$/i.test(String(id || ''))) throw new Error('软著项目标识无效');
    return path.join(casesRoot, id);
  }

  function readIndex() {
    return readJson(indexPath, { activeCaseId: '', cases: [] });
  }

  function saveIndex(index) {
    writeJson(indexPath, index);
    return index;
  }

  function createMetadata(state, overrides = {}) {
    const createdAt = new Date().toISOString();
    return {
      id: overrides.id || crypto.randomUUID(),
      name: overrides.name || caseName(state),
      softwareName: String(state?.fields?.softwareName || ''),
      version: String(state?.fields?.version || 'V1.0'),
      projectPath: String(state?.project?.path || ''),
      step: String(state?.step || 'setup'),
      draftConfirmed: Boolean(state?.draftConfirmed),
      archived: Boolean(overrides.archived),
      createdAt: overrides.createdAt || createdAt,
      updatedAt: overrides.updatedAt || createdAt,
    };
  }

  function ensureMigrated(state) {
    assertSafePaths();
    ensureDir(casesRoot);
    const current = readIndex();
    if (current.activeCaseId && current.cases?.length) return current;
    const metadata = createMetadata(state);
    return saveIndex({ activeCaseId: metadata.id, cases: [metadata] });
  }

  function touch(state) {
    const index = ensureMigrated(state);
    const updatedAt = new Date().toISOString();
    index.cases = index.cases.map((item) => item.id === index.activeCaseId ? {
      ...item,
      name: item.name === '未命名软著项目' ? caseName(state, item.name) : item.name,
      softwareName: String(state?.fields?.softwareName || ''),
      version: String(state?.fields?.version || 'V1.0'),
      projectPath: String(state?.project?.path || ''),
      step: String(state?.step || 'setup'),
      draftConfirmed: Boolean(state?.draftConfirmed),
      updatedAt,
    } : item);
    saveIndex(index);
    return index;
  }

  function snapshotActive(state) {
    const index = touch(state);
    const id = index.activeCaseId;
    const target = caseDir(id);
    const staging = `${target}.staging-${crypto.randomUUID()}`;
    fs.rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(rootDir)) fs.cpSync(rootDir, staging, { recursive: true });
    else ensureDir(staging);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(staging, target);
    return index;
  }

  function restoreWorkspace(id) {
    const source = caseDir(id);
    if (!fs.existsSync(source)) throw new Error('软著项目档案不存在或已损坏');
    const staging = `${rootDir}.restore-${crypto.randomUUID()}`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(source, staging, { recursive: true });
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.renameSync(staging, rootDir);
  }

  function list(state, includeArchived = true) {
    const index = touch(state);
    return {
      activeCaseId: index.activeCaseId,
      cases: index.cases
        .filter((item) => includeArchived || !item.archived)
        .sort((a, b) => Number(a.archived) - Number(b.archived) || String(b.updatedAt).localeCompare(String(a.updatedAt))),
    };
  }

  function create(state, blankState, name) {
    let index = snapshotActive(state);
    const metadata = createMetadata(blankState, { name: String(name || '').trim().slice(0, 80) || '未命名软著项目' });
    const target = caseDir(metadata.id);
    ensureDir(target);
    writeJson(path.join(target, 'state.json'), { ...blankState, updated_at: new Date().toISOString() });
    index = {
      activeCaseId: metadata.id,
      cases: [...index.cases, metadata],
    };
    saveIndex(index);
    restoreWorkspace(metadata.id);
    return metadata;
  }

  function switchTo(state, id) {
    let index = snapshotActive(state);
    const target = index.cases.find((item) => item.id === id);
    if (!target || target.archived) throw new Error('目标软著项目不存在或已归档');
    if (id === index.activeCaseId) return target;
    restoreWorkspace(id);
    index = { ...index, activeCaseId: id };
    saveIndex(index);
    return target;
  }

  function duplicate(state, id, name) {
    let index = snapshotActive(state);
    const sourceMeta = index.cases.find((item) => item.id === id);
    if (!sourceMeta) throw new Error('待复制的软著项目不存在');
    const source = caseDir(id);
    const metadata = createMetadata(readJson(path.join(source, 'state.json'), {}), {
      name: String(name || '').trim().slice(0, 80) || `${sourceMeta.name} 副本`,
    });
    fs.cpSync(source, caseDir(metadata.id), { recursive: true });
    index = { activeCaseId: metadata.id, cases: [...index.cases, metadata] };
    saveIndex(index);
    restoreWorkspace(metadata.id);
    return metadata;
  }

  function remove(state, blankState, id) {
    let index = snapshotActive(state);
    const target = index.cases.find((item) => item.id === id);
    if (!target) throw new Error('待删除的软著项目不存在');

    const remainingCases = index.cases.filter((item) => item.id !== id);
    if (id !== index.activeCaseId) {
      fs.rmSync(caseDir(id), { recursive: true, force: true });
      saveIndex({ ...index, cases: remainingCases });
      return target;
    }

    let nextCases = remainingCases;
    let nextActive = remainingCases
      .filter((item) => !item.archived)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (!nextActive && remainingCases.length) {
      nextActive = remainingCases.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
      nextCases = remainingCases.map((item) => item.id === nextActive.id ? { ...item, archived: false, updatedAt: new Date().toISOString() } : item);
      nextActive = nextCases.find((item) => item.id === nextActive.id);
    }

    if (!nextActive) {
      const replacement = createMetadata(blankState, { name: '未命名软著项目' });
      const replacementDir = caseDir(replacement.id);
      ensureDir(replacementDir);
      writeJson(path.join(replacementDir, 'state.json'), { ...blankState, updated_at: new Date().toISOString() });
      nextCases = [replacement];
      nextActive = replacement;
    }

    fs.rmSync(caseDir(id), { recursive: true, force: true });
    saveIndex({ activeCaseId: nextActive.id, cases: nextCases });
    restoreWorkspace(nextActive.id);
    return target;
  }

  function rename(state, id, name) {
    const index = touch(state);
    const nextName = String(name || '').trim().slice(0, 80);
    if (!nextName) throw new Error('项目名称不能为空');
    if (!index.cases.some((item) => item.id === id)) throw new Error('软著项目不存在');
    index.cases = index.cases.map((item) => item.id === id ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item);
    saveIndex(index);
    return index.cases.find((item) => item.id === id);
  }

  function setArchived(state, id, archived) {
    let index = snapshotActive(state);
    const target = index.cases.find((item) => item.id === id);
    if (!target) throw new Error('软著项目不存在');
    if (archived && id === index.activeCaseId) throw new Error('当前项目不能直接归档，请先切换到其他项目');
    index.cases = index.cases.map((item) => item.id === id ? { ...item, archived: Boolean(archived), updatedAt: new Date().toISOString() } : item);
    saveIndex(index);
    return index.cases.find((item) => item.id === id);
  }

  return { create, duplicate, ensureMigrated, list, remove, rename, setArchived, switchTo, touch };
}

module.exports = { createSoftwareCopyrightCaseStore };
