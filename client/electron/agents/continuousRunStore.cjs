'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getAgentRunsDir } = require('../utils/paths.cjs');

const VALID_STATUSES = new Set(['running', 'paused', 'blocked', 'completed']);
const VALID_WORKFLOWS = new Set(['technical-plan', 'existing-plan-expansion', 'presales', 'official-document', 'grant-application', 'project-management', 'thesis-tutor', 'software-copyright', 'patent-generation']);

function createContinuousRunStore({ app }) {
  if (!app?.getPath) throw new Error('连续执行 Store 缺少 Electron app');
  const filePath = path.join(getAgentRunsDir(app), 'continuous-runs.json');

  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data && typeof data === 'object' && data.runs && typeof data.runs === 'object' ? data : { schemaVersion: 1, runs: {} };
    } catch {
      return { schemaVersion: 1, runs: {} };
    }
  }

  function keyOf(input = {}) {
    const workflowKind = String(input.workflowKind || '').trim();
    if (!VALID_WORKFLOWS.has(workflowKind)) throw new Error('连续执行工作流无效');
    const projectId = String(input.projectId || '').trim();
    if (!projectId) throw new Error('连续执行项目 ID 不能为空');
    return { key: `${workflowKind}:${projectId}`, workflowKind, projectId };
  }

  function save(input = {}) {
    const { key, workflowKind, projectId } = keyOf(input);
    if (!VALID_STATUSES.has(input.status)) throw new Error('连续执行状态无效');
    const data = load();
    const run = {
      workflowKind,
      projectId,
      status: input.status,
      message: String(input.message || '').slice(0, 1000),
      updatedAt: new Date().toISOString(),
    };
    data.runs[key] = run;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.renameSync(temporaryFile, filePath);
    } catch (error) {
      if (process.platform !== 'win32' || !fs.existsSync(filePath)) throw error;
      fs.rmSync(filePath, { force: true });
      fs.renameSync(temporaryFile, filePath);
    } finally {
      fs.rmSync(temporaryFile, { force: true });
    }
    return run;
  }

  function get(input = {}) {
    const { key } = keyOf(input);
    return load().runs[key] || null;
  }

  return { get, save };
}

module.exports = { createContinuousRunStore };
