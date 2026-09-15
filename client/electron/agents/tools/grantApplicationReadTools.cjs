'use strict';

const GRANT_TOOL_IDS = Object.freeze({ workspace: 'grant-application.workspace.summary.read' });
function hasText(value) { return Boolean(String(value || '').trim()); }
function summarizeGrantState(state = {}) {
  const outputs = state.outputs || {};
  const modules = state.proposalModules || {};
  const moduleValues = Object.values(modules);
  return {
    projectId: String(state.projectId || '').slice(0, 128),
    profileReady: Boolean(hasText(state.profile?.direction) || hasText(state.profile?.sourceNotes)),
    inputReady: Object.fromEntries(['diagnosis', 'topic-policy', 'proposal', 'review-defense'].map((panel) => [panel, hasText(state.inputs?.[panel]?.taskText) || hasText(state.inputs?.[panel]?.materialText)])),
    outputsReady: Object.fromEntries(['diagnosis', 'topic-policy', 'proposal', 'review-defense'].map((panel) => [panel, hasText(outputs[panel])])),
    moduleCount: moduleValues.filter(hasText).length,
    moduleTotal: Math.max(10, moduleValues.length),
    finalReviewStatus: String(state.proposalFinalReview?.status || 'unchecked').slice(0, 20),
    activeTask: state.task?.status === 'running' ? { type: String(state.task.type || '').slice(0, 40), progress: Math.max(0, Math.min(100, Number(state.task.progress || 0))) } : null,
    updatedAt: String(state.updated_at || '').slice(0, 40),
  };
}
function registerGrantApplicationReadTools(toolRegistry, { grantApplicationService }) {
  if (!toolRegistry || typeof grantApplicationService?.loadState !== 'function') throw new Error('课题申报只读 Tool 依赖未完整初始化');
  toolRegistry.register({ id: GRANT_TOOL_IDS.workspace, name: '读取课题申报工作区摘要', version: '1.0.0', permission: GRANT_TOOL_IDS.workspace, risk: 'read', approval: 'never', idempotent: true }, () => summarizeGrantState(grantApplicationService.loadState()));
  return GRANT_TOOL_IDS;
}
module.exports = { GRANT_TOOL_IDS, registerGrantApplicationReadTools, summarizeGrantState };
