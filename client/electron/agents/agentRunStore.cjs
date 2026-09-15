'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getAgentRunsDir } = require('../utils/paths.cjs');

const SCHEMA_VERSION = 1;
const MAX_RUNS = 100;
const MAX_STRING_LENGTH = 20000;
const SENSITIVE_KEYS = /^(?:instructions|reasoning|chain_?of_?thought|api_?key|authorization|access_?token|token|secret|password)$/i;

function sanitize(value, depth = 0) {
  if (depth > 12) return '[内容层级过深，已省略]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, MAX_STRING_LENGTH);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEYS.test(key))
    .map(([key, item]) => [key, sanitize(item, depth + 1)]));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.renameSync(temporaryFile, filePath);
    } catch (error) {
      if (process.platform !== 'win32' || !fs.existsSync(filePath)) throw error;
      fs.rmSync(filePath, { force: true });
      fs.renameSync(temporaryFile, filePath);
    }
  } finally {
    fs.rmSync(temporaryFile, { force: true });
  }
}

function normalizeRun(run) {
  const normalized = sanitize(run);
  const runId = String(normalized?.runId || '').trim();
  const agentId = String(normalized?.agentId || '').trim();
  if (!runId) throw new Error('Agent Run ID 不能为空');
  if (!agentId) throw new Error('Agent ID 不能为空');
  return { ...normalized, runId, agentId };
}

function createAgentRunStore({ app, maxRuns = MAX_RUNS }) {
  if (!app?.getPath) throw new Error('Agent Run Store 缺少 Electron app');
  const limit = Math.max(1, Math.min(1000, Math.round(Number(maxRuns || MAX_RUNS))));
  const filePath = path.join(getAgentRunsDir(app), 'runs.json');

  function loadData() {
    const data = readJson(filePath, { schemaVersion: SCHEMA_VERSION, runs: [] });
    return {
      schemaVersion: SCHEMA_VERSION,
      runs: (Array.isArray(data?.runs) ? data.runs : []).filter((run) => run?.runId && run?.agentId).slice(0, limit),
    };
  }

  function saveRun(run) {
    const normalized = normalizeRun(run);
    const current = loadData();
    const runs = [normalized, ...current.runs.filter((item) => item.runId !== normalized.runId)].slice(0, limit);
    writeJsonAtomic(filePath, { schemaVersion: SCHEMA_VERSION, runs });
    return sanitize(normalized);
  }

  function getRun(runId) {
    const id = String(runId || '').trim();
    const run = loadData().runs.find((item) => item.runId === id);
    return run ? sanitize(run) : undefined;
  }

  function listRuns({ agentId, limit: requestedLimit = 20 } = {}) {
    const safeLimit = Math.max(1, Math.min(limit, Math.round(Number(requestedLimit || 20))));
    return loadData().runs
      .filter((run) => !agentId || run.agentId === String(agentId))
      .slice(0, safeLimit)
      .map((run) => sanitize(run));
  }

  return { saveRun, getRun, listRuns };
}

module.exports = { createAgentRunStore };
