'use strict';

const { ipcMain } = require('electron');

const AGENT_STATUS_CHANNEL = 'agent:get-status';
const AGENT_DRY_RUN_CHANNEL = 'agent:run-dry';
const AGENT_SHADOW_RUN_CHANNEL = 'agent:run-shadow';
const AGENT_SHADOW_REPORT_CHANNEL = 'agent:get-shadow-report';
const AGENT_OUTLINE_PREVIEW_CHANNEL = 'agent:preview-outline-generation';
const AGENT_CREATE_DRAFT_CHANNEL = 'agent:create-approval-draft';
const AGENT_LIST_DRAFTS_CHANNEL = 'agent:list-approval-drafts';
const AGENT_REVOKE_DRAFT_CHANNEL = 'agent:revoke-approval-draft';
const AGENT_DRAFT_INTEGRITY_CHANNEL = 'agent:get-approval-draft-integrity';
const AGENT_DRAFT_AUDIT_CHANNEL = 'agent:get-approval-draft-audit-log';
const AGENT_PACKAGE_PREVIEW_CHANNEL = 'agent:preview-approval-package';
const AGENT_PACKAGE_VALIDATE_CHANNEL = 'agent:validate-approval-package';
const AGENT_CONTINUOUS_GET_CHANNEL = 'agent:get-continuous-run';
const AGENT_CONTINUOUS_SAVE_CHANNEL = 'agent:save-continuous-run';

function registerAgentIpc({ agentHost, getAgentHost }) {
  const resolveAgentHost = () => getAgentHost?.() || agentHost;
  if (!resolveAgentHost()?.getStatus) throw new Error('Agent Host 未初始化');
  ipcMain.handle(AGENT_STATUS_CHANNEL, () => resolveAgentHost().getStatus());
  ipcMain.handle(AGENT_DRY_RUN_CHANNEL, (_event, input) => resolveAgentHost().runDryRun(input));
  ipcMain.handle(AGENT_SHADOW_RUN_CHANNEL, (_event, input) => resolveAgentHost().runShadowRun(input));
  ipcMain.handle(AGENT_SHADOW_REPORT_CHANNEL, (_event, options) => resolveAgentHost().getShadowReport(options));
  ipcMain.handle(AGENT_OUTLINE_PREVIEW_CHANNEL, (_event, input) => resolveAgentHost().previewOutlineGeneration(input));
  ipcMain.handle(AGENT_CREATE_DRAFT_CHANNEL, (_event, input) => resolveAgentHost().createOutlineApprovalDraft(input));
  ipcMain.handle(AGENT_LIST_DRAFTS_CHANNEL, (_event, options) => resolveAgentHost().listApprovalDrafts(options));
  ipcMain.handle(AGENT_REVOKE_DRAFT_CHANNEL, (_event, draftId) => resolveAgentHost().revokeApprovalDraft(draftId));
  ipcMain.handle(AGENT_DRAFT_INTEGRITY_CHANNEL, (_event, options) => resolveAgentHost().getApprovalDraftIntegrity(options));
  ipcMain.handle(AGENT_DRAFT_AUDIT_CHANNEL, (_event, options) => resolveAgentHost().getApprovalDraftAuditLog(options));
  ipcMain.handle(AGENT_PACKAGE_PREVIEW_CHANNEL, (_event, draftId) => resolveAgentHost().previewApprovalPackage(draftId));
  ipcMain.handle(AGENT_PACKAGE_VALIDATE_CHANNEL, (_event, approvalPackage) => resolveAgentHost().validateApprovalPackage(approvalPackage));
  ipcMain.handle(AGENT_CONTINUOUS_GET_CHANNEL, (_event, input) => resolveAgentHost().getContinuousRun(input));
  ipcMain.handle(AGENT_CONTINUOUS_SAVE_CHANNEL, (_event, input) => resolveAgentHost().saveContinuousRun(input));
}

module.exports = { AGENT_CONTINUOUS_GET_CHANNEL, AGENT_CONTINUOUS_SAVE_CHANNEL, AGENT_CREATE_DRAFT_CHANNEL, AGENT_DRAFT_AUDIT_CHANNEL, AGENT_DRAFT_INTEGRITY_CHANNEL, AGENT_DRY_RUN_CHANNEL, AGENT_LIST_DRAFTS_CHANNEL, AGENT_OUTLINE_PREVIEW_CHANNEL, AGENT_PACKAGE_PREVIEW_CHANNEL, AGENT_PACKAGE_VALIDATE_CHANNEL, AGENT_REVOKE_DRAFT_CHANNEL, AGENT_SHADOW_REPORT_CHANNEL, AGENT_SHADOW_RUN_CHANNEL, AGENT_STATUS_CHANNEL, registerAgentIpc };
