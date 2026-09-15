'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getAgentRunsDir } = require('../utils/paths.cjs');

const SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_APPROVALS = 200;

function now() {
  return new Date().toISOString();
}

function stableValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map((item) => stableValue(item, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) throw new Error('审批参数不能包含循环引用');
  seen.add(value);
  const result = Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key], seen)]));
  seen.delete(value);
  return result;
}

function hashArgs(args) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(args || {})), 'utf-8').digest('hex');
}

function safeText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
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

function createApprovalService({ app, clock = Date.now }) {
  if (!app?.getPath) throw new Error('Approval Service 缺少 Electron app');
  const filePath = path.join(getAgentRunsDir(app), 'approvals.json');

  function loadData() {
    const data = readJson(filePath, { schemaVersion: SCHEMA_VERSION, approvals: [] });
    return {
      schemaVersion: SCHEMA_VERSION,
      approvals: (Array.isArray(data?.approvals) ? data.approvals : []).filter((item) => item?.approvalId).slice(0, MAX_APPROVALS),
    };
  }

  function saveApprovals(approvals) {
    writeJsonAtomic(filePath, { schemaVersion: SCHEMA_VERSION, approvals: approvals.slice(0, MAX_APPROVALS) });
  }

  function updateApproval(approvalId, updater) {
    const data = loadData();
    const index = data.approvals.findIndex((item) => item.approvalId === approvalId);
    if (index < 0) throw new Error('审批请求不存在');
    const updated = updater({ ...data.approvals[index] });
    data.approvals[index] = updated;
    saveApprovals(data.approvals);
    return { ...updated };
  }

  function requestApproval(input = {}) {
    const runId = safeText(input.runId, 128);
    const agentId = safeText(input.agentId, 128);
    const toolId = safeText(input.toolId, 160);
    const summary = safeText(input.summary, 500);
    if (!runId || !agentId || !toolId || !summary) throw new Error('审批请求信息不完整');
    const ttlMs = Math.max(1000, Math.min(MAX_TTL_MS, Math.round(Number(input.ttlMs || DEFAULT_TTL_MS))));
    const createdAtMs = clock();
    const approval = {
      approvalId: crypto.randomUUID(),
      runId,
      agentId,
      toolId,
      argsHash: hashArgs(input.args),
      summary,
      status: 'pending',
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + ttlMs).toISOString(),
    };
    const data = loadData();
    saveApprovals([approval, ...data.approvals.filter((item) => item.approvalId !== approval.approvalId)]);
    return { ...approval };
  }

  function decide(approvalId, decision) {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('审批决定无效');
    return updateApproval(String(approvalId || '').trim(), (approval) => {
      if (approval.status !== 'pending') throw new Error('审批请求已经处理');
      if (Date.parse(approval.expiresAt) <= clock()) return { ...approval, status: 'expired', decidedAt: now() };
      return { ...approval, status: decision, decidedAt: now(), decidedBy: 'user' };
    });
  }

  function consume(input = {}) {
    const approvalId = String(input.approvalId || '').trim();
    return updateApproval(approvalId, (approval) => {
      if (approval.status !== 'approved') throw new Error('审批未通过或已经使用');
      if (Date.parse(approval.expiresAt) <= clock()) throw new Error('审批已经过期');
      if (approval.runId !== String(input.runId || '').trim()) throw new Error('审批与 Agent Run 不匹配');
      if (approval.agentId !== String(input.agentId || '').trim()) throw new Error('审批与 Agent 不匹配');
      if (approval.toolId !== String(input.toolId || '').trim()) throw new Error('审批与 Tool 不匹配');
      if (approval.argsHash !== hashArgs(input.args)) throw new Error('审批参数已经变化，请重新确认');
      return { ...approval, status: 'consumed', consumedAt: now() };
    });
  }

  function getApproval(approvalId) {
    const item = loadData().approvals.find((approval) => approval.approvalId === String(approvalId || '').trim());
    return item ? { ...item } : undefined;
  }

  function listApprovals({ runId, status, limit = 20 } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Math.round(Number(limit || 20))));
    return loadData().approvals
      .filter((item) => !runId || item.runId === String(runId))
      .filter((item) => !status || item.status === String(status))
      .slice(0, safeLimit)
      .map((item) => ({ ...item }));
  }

  return { requestApproval, approve: (id) => decide(id, 'approved'), reject: (id) => decide(id, 'rejected'), consume, getApproval, listApprovals };
}

module.exports = { createApprovalService, hashArgs };
