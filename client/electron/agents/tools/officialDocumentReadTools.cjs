'use strict';

const OFFICIAL_DOCUMENT_TOOL_IDS = Object.freeze({
  workspace: 'official-document.workspace.summary.read',
});

function safeText(value, maxLength = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function summarizeOfficialDocumentState(state = {}) {
  const task = state.task || {};
  const input = state.input || {};
  const revisions = Array.isArray(state.revisions) ? state.revisions : [];
  return {
    inputReady: Boolean(safeText(input.facts, 1)),
    documentType: safeText(input.documentType, 40),
    scenarioReady: Boolean(safeText(input.scenario, 1)),
    hasDraft: Boolean(String(state.draft || '').trim()),
    draftLength: String(state.draft || '').trim().length,
    hasReview: Boolean(String(state.review || '').trim()),
    revisionCount: revisions.length,
    hasPolishedRevision: revisions.some((revision) => ['polish', 'rewrite'].includes(revision?.type)),
    imported: Boolean(safeText(state.importedFileName, 1)),
    activeTask: task.status === 'running' ? {
      id: safeText(task.id, 128),
      type: safeText(task.type, 40),
      progress: Math.max(0, Math.min(100, Math.round(Number(task.progress || 0)))),
    } : null,
    updatedAt: safeText(state.updated_at, 40),
  };
}

function registerOfficialDocumentReadTools(toolRegistry, { officialDocumentService }) {
  if (!toolRegistry || typeof officialDocumentService?.loadState !== 'function') throw new Error('公文写作只读 Tool 依赖未完整初始化');
  toolRegistry.register({
    id: OFFICIAL_DOCUMENT_TOOL_IDS.workspace,
    name: '读取公文写作工作区摘要',
    version: '1.0.0',
    permission: OFFICIAL_DOCUMENT_TOOL_IDS.workspace,
    risk: 'read',
    approval: 'never',
    idempotent: true,
  }, () => summarizeOfficialDocumentState(officialDocumentService.loadState()));
  return OFFICIAL_DOCUMENT_TOOL_IDS;
}

module.exports = { OFFICIAL_DOCUMENT_TOOL_IDS, registerOfficialDocumentReadTools, summarizeOfficialDocumentState };
