'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getAgentRunsDir } = require('../utils/paths.cjs');
const { hashArgs } = require('./approvalService.cjs');

const SCHEMA_VERSION = 2;
const INTEGRITY_VERSION = 1;
const MAX_DRAFTS = 100;
const MAX_EVENTS = 500;
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return { schemaVersion: SCHEMA_VERSION, drafts: [] }; }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    try { fs.renameSync(temporaryFile, filePath); } catch (error) {
      if (process.platform !== 'win32' || !fs.existsSync(filePath)) throw error;
      fs.rmSync(filePath, { force: true });
      fs.renameSync(temporaryFile, filePath);
    }
  } finally { fs.rmSync(temporaryFile, { force: true }); }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function calculateIntegrityHash(draft) {
  const { integrityHash, ...payload } = draft || {};
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

function signDraft(draft) {
  const next = { ...draft, integrityVersion: INTEGRITY_VERSION };
  return { ...next, integrityHash: calculateIntegrityHash(next) };
}

function createPolicySnapshot(preview, capturedAt) {
  const snapshot = {
    version: 'agent-admission/v1',
    capturedAt,
    status: String(preview?.admission?.status || 'insufficient-data'),
    eligibleForHumanApprovalPilot: Boolean(preview?.admission?.eligibleForHumanApprovalPilot),
    policy: preview?.admission?.policy || {},
    checks: Array.isArray(preview?.admission?.checks) ? preview.admission.checks : [],
    toolContract: {
      id: String(preview?.tool?.id || ''),
      version: String(preview?.tool?.version || ''),
      risk: String(preview?.tool?.risk || ''),
      approval: String(preview?.tool?.approval || ''),
    },
  };
  return { ...snapshot, snapshotHash: crypto.createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex') };
}

function createContextFingerprint(preview) {
  const context = {
    tool: preview?.tool || {},
    parameters: preview?.parameters || {},
    impact: preview?.impact || {},
    blockers: preview?.blockers || [],
    admission: {
      status: preview?.admission?.status,
      eligibleForHumanApprovalPilot: preview?.admission?.eligibleForHumanApprovalPilot,
      policy: preview?.admission?.policy || {},
      checks: preview?.admission?.checks || [],
    },
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(context))).digest('hex');
}

function createApprovalDraftService({ app }) {
  if (!app?.getPath) throw new Error('Agent Approval Draft Service 缺少 Electron app');
  const filePath = path.join(getAgentRunsDir(app), 'approval-drafts.json');
  const quarantinePath = path.join(getAgentRunsDir(app), 'approval-drafts-quarantine.json');
  const eventsPath = path.join(getAgentRunsDir(app), 'approval-draft-events.json');

  function appendEvent({ draftId, type, fromStatus, toStatus, reason }) {
    const data = readJson(eventsPath);
    const events = Array.isArray(data?.events) ? data.events : [];
    const previousHash = events.at(-1)?.eventHash || '';
    const event = {
      eventId: crypto.randomUUID(),
      draftId: String(draftId || '').slice(0, 128),
      type,
      fromStatus: fromStatus || undefined,
      toStatus: toStatus || undefined,
      reason: reason || undefined,
      occurredAt: new Date().toISOString(),
      previousHash,
    };
    event.eventHash = crypto.createHash('sha256').update(JSON.stringify(canonicalize(event))).digest('hex');
    writeJsonAtomic(eventsPath, { schemaVersion: 1, events: [...events, event].slice(-MAX_EVENTS) });
  }

  function normalizeStatus(draft, currentTime = Date.now()) {
    if (draft.status === 'active' && Date.parse(draft.expiresAt) <= currentTime) return { ...draft, status: 'expired' };
    return draft;
  }

  function load() {
    const data = readJson(filePath);
    const drafts = (Array.isArray(data?.drafts) ? data.drafts : []).filter((draft) => draft?.draftId).slice(0, MAX_DRAFTS);
    const valid = [];
    const quarantined = [];
    let migrated = false;
    for (const draft of drafts) {
      if (!draft.integrityHash) {
        valid.push(signDraft(draft));
        migrated = true;
        appendEvent({ draftId: draft.draftId, type: 'MIGRATED', fromStatus: draft.status, toStatus: draft.status });
      } else if (draft.integrityVersion === INTEGRITY_VERSION && draft.integrityHash === calculateIntegrityHash(draft)) {
        valid.push(draft);
      } else {
        quarantined.push({
          draftId: String(draft.draftId || '').slice(0, 128),
          detectedAt: new Date().toISOString(),
          reason: 'INTEGRITY_CHECK_FAILED',
          storedHash: String(draft.integrityHash || '').slice(0, 128),
          calculatedHash: calculateIntegrityHash(draft),
        });
        appendEvent({ draftId: draft.draftId, type: 'QUARANTINED', fromStatus: draft.status, toStatus: 'quarantined', reason: 'INTEGRITY_CHECK_FAILED' });
      }
    }
    if (quarantined.length) {
      const existing = readJson(quarantinePath);
      writeJsonAtomic(quarantinePath, { schemaVersion: 1, records: [...quarantined, ...(Array.isArray(existing?.records) ? existing.records : [])].slice(0, MAX_DRAFTS) });
    }
    if (migrated || quarantined.length) save(valid);
    return valid;
  }

  function save(drafts) {
    writeJsonAtomic(filePath, { schemaVersion: SCHEMA_VERSION, drafts: drafts.slice(0, MAX_DRAFTS).map(signDraft) });
  }

  function create({ preview, args, ttlMs } = {}) {
    if (!preview?.previewOnly || preview.approvalCreated !== false || preview.executionStarted !== false) throw new Error('只能从有效的只读预览创建审批草稿');
    const createdAt = new Date();
    const duration = Math.max(60_000, Math.min(MAX_TTL_MS, Math.round(Number(ttlMs || DEFAULT_TTL_MS))));
    const draft = signDraft({
      draftId: crypto.randomUUID(),
      status: preview.readyForHumanApprovalPilot ? 'active' : 'blocked',
      executable: false,
      approvable: false,
      tool: preview.tool,
      summary: String(preview.summary || '').slice(0, 500),
      parameters: preview.parameters,
      impact: preview.impact,
      blockers: preview.blockers,
      argsHash: hashArgs(args || {}),
      policySnapshot: createPolicySnapshot(preview, createdAt.toISOString()),
      contextFingerprint: createContextFingerprint(preview),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + duration).toISOString(),
    });
    save([draft, ...load()]);
    appendEvent({ draftId: draft.draftId, type: 'CREATED', toStatus: draft.status });
    return draft;
  }

  function list({ limit = 10 } = {}) {
    const safeLimit = Math.max(1, Math.min(50, Math.round(Number(limit || 10))));
    const drafts = load();
    const normalized = drafts.map((draft) => normalizeStatus(draft));
    const signed = normalized.map(signDraft);
    normalized.forEach((draft, index) => {
      if (draft.status !== drafts[index].status) appendEvent({ draftId: draft.draftId, type: 'EXPIRED', fromStatus: drafts[index].status, toStatus: draft.status });
    });
    if (normalized.some((draft, index) => draft.status !== drafts[index].status)) save(signed);
    return signed.slice(0, safeLimit);
  }

  function revoke(draftId) {
    const id = String(draftId || '').trim();
    const drafts = load().map((draft) => normalizeStatus(draft));
    const index = drafts.findIndex((draft) => draft.draftId === id);
    if (index < 0) throw new Error('审批草稿不存在');
    if (!['active', 'blocked'].includes(drafts[index].status)) throw new Error('审批草稿当前状态不可撤销');
    const previousStatus = drafts[index].status;
    drafts[index] = signDraft({ ...drafts[index], status: 'revoked', revokedAt: new Date().toISOString() });
    save(drafts);
    appendEvent({ draftId: id, type: 'REVOKED', fromStatus: previousStatus, toStatus: 'revoked' });
    return drafts[index];
  }

  function reconcile({ preview } = {}) {
    if (!preview?.previewOnly) throw new Error('草稿漂移检测需要有效的只读预览');
    const fingerprint = createContextFingerprint(preview);
    const drafts = load();
    let staleCount = 0;
    const next = drafts.map((draft) => {
      const sameTarget = draft.tool?.id === preview.tool?.id && draft.parameters?.projectId === preview.parameters?.projectId;
      if (!sameTarget || !['active', 'blocked'].includes(draft.status) || draft.contextFingerprint === fingerprint) return draft;
      staleCount += 1;
      appendEvent({ draftId: draft.draftId, type: 'STALE', fromStatus: draft.status, toStatus: 'stale', reason: draft.contextFingerprint ? 'CONTEXT_DRIFT' : 'MISSING_CONTEXT_FINGERPRINT' });
      return signDraft({ ...draft, status: 'stale', staleAt: new Date().toISOString(), staleReason: draft.contextFingerprint ? 'CONTEXT_DRIFT' : 'MISSING_CONTEXT_FINGERPRINT' });
    });
    if (staleCount) save(next);
    return { staleCount, contextFingerprint: fingerprint };
  }

  function getIntegrityStatus({ limit = 10 } = {}) {
    load();
    const safeLimit = Math.max(1, Math.min(50, Math.round(Number(limit || 10))));
    const records = readJson(quarantinePath)?.records;
    const safeRecords = (Array.isArray(records) ? records : []).slice(0, safeLimit).map((record) => ({
      draftId: String(record?.draftId || ''),
      detectedAt: String(record?.detectedAt || ''),
      reason: 'INTEGRITY_CHECK_FAILED',
    }));
    return { integrityVersion: INTEGRITY_VERSION, quarantinedCount: Array.isArray(records) ? records.length : 0, recent: safeRecords };
  }

  function getAuditLog({ limit = 20 } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Math.round(Number(limit || 20))));
    const data = readJson(eventsPath);
    const events = Array.isArray(data?.events) ? data.events : [];
    let previousHash = events[0]?.previousHash || '';
    let chainValid = true;
    for (const event of events) {
      const { eventHash, ...payload } = event;
      const calculated = crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
      if (payload.previousHash !== previousHash || eventHash !== calculated) chainValid = false;
      previousHash = eventHash || '';
    }
    return {
      chainValid,
      total: events.length,
      recent: events.slice(-safeLimit).reverse().map((event) => ({
        eventId: String(event.eventId || ''),
        draftId: String(event.draftId || ''),
        type: String(event.type || ''),
        fromStatus: String(event.fromStatus || ''),
        toStatus: String(event.toStatus || ''),
        reason: String(event.reason || ''),
        occurredAt: String(event.occurredAt || ''),
      })),
    };
  }

  function previewPackage(draftId) {
    const id = String(draftId || '').trim();
    const drafts = load();
    const index = drafts.findIndex((draft) => draft.draftId === id);
    if (index < 0) throw new Error('审批草稿不存在或已被隔离');
    const normalized = normalizeStatus(drafts[index]);
    if (normalized.status !== drafts[index].status) {
      drafts[index] = signDraft(normalized);
      save(drafts);
      appendEvent({ draftId: id, type: 'EXPIRED', fromStatus: 'active', toStatus: 'expired' });
    }
    const draft = drafts[index];
    const audit = getAuditLog({ limit: 1 });
    const generatedAt = new Date().toISOString();
    const payload = {
      version: 'agent-approval-package/v1',
      generatedAt,
      inMemoryOnly: true,
      fileCreated: false,
      submitted: false,
      approvable: false,
      executable: false,
      draft: {
        draftId: draft.draftId,
        status: draft.status,
        summary: draft.summary,
        tool: draft.tool,
        parameters: draft.parameters,
        impact: draft.impact,
        blockers: draft.blockers,
        argsHash: draft.argsHash,
        contextFingerprint: draft.contextFingerprint || '',
        staleReason: draft.staleReason || '',
        createdAt: draft.createdAt,
        expiresAt: draft.expiresAt,
      },
      policySnapshot: draft.policySnapshot || null,
      integrity: { version: draft.integrityVersion, verified: true, hash: draft.integrityHash },
      audit: {
        chainValid: audit.chainValid,
        totalEvents: audit.total,
        latestEvent: audit.recent[0] || null,
      },
    };
    return { ...payload, packageHash: crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex') };
  }

  function validatePackage(input) {
    const serialized = JSON.stringify(input || {});
    if (serialized.length > 200_000) throw new Error('审批包超过校验大小限制');
    const { packageHash, ...payload } = input || {};
    const calculatedPackageHash = crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
    const packageHashValid = typeof packageHash === 'string' && packageHash === calculatedPackageHash;
    const policySnapshot = input?.policySnapshot;
    let policySnapshotValid = policySnapshot === null;
    if (policySnapshot && typeof policySnapshot === 'object') {
      const { snapshotHash, ...policyPayload } = policySnapshot;
      const calculatedPolicyHash = crypto.createHash('sha256').update(JSON.stringify(canonicalize(policyPayload))).digest('hex');
      policySnapshotValid = typeof snapshotHash === 'string' && snapshotHash === calculatedPolicyHash;
    }
    const draftId = String(input?.draft?.draftId || '').trim();
    const draft = load().find((item) => item.draftId === draftId);
    const draftAvailable = Boolean(draft);
    const draftIntegrityValid = Boolean(draft && input?.integrity?.verified === true && input?.integrity?.hash === draft.integrityHash);
    const contextFingerprintValid = Boolean(draft && input?.draft?.contextFingerprint === String(draft.contextFingerprint || ''));
    const audit = getAuditLog({ limit: 1 });
    const auditChainValid = audit.chainValid && input?.audit?.chainValid === true;
    const auditSnapshotCurrent = input?.audit?.totalEvents === audit.total;
    const checks = {
      packageHashValid,
      policySnapshotValid,
      draftAvailable,
      draftIntegrityValid,
      contextFingerprintValid,
      auditChainValid,
      auditSnapshotCurrent,
      safeFlagsValid: input?.inMemoryOnly === true
        && input?.fileCreated === false
        && input?.submitted === false
        && input?.approvable === false
        && input?.executable === false,
    };
    return {
      valid: Object.values(checks).every(Boolean),
      checkedAt: new Date().toISOString(),
      persisted: false,
      submitted: false,
      executed: false,
      checks,
      calculatedPackageHash,
    };
  }

  return { create, getAuditLog, getIntegrityStatus, list, previewPackage, reconcile, revoke, validatePackage };
}

module.exports = { calculateIntegrityHash, createApprovalDraftService, createContextFingerprint };
