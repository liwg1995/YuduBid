'use strict';
const SOFTWARE_COPYRIGHT_TOOL_IDS = Object.freeze({ workspace: 'software-copyright.workspace.summary.read' });
const REQUIRED_FIELDS = Object.freeze(['softwareName', 'version', 'developmentCompletedDate', 'copyrightOwner', 'developmentHardware', 'runningHardware', 'developmentOs', 'developmentTools', 'runningPlatform', 'runtimeSupport', 'programmingLanguage', 'developmentPurpose', 'industry']);
function hasText(value) { return Boolean(String(value || '').trim()); }
function summarizeSoftwareCopyrightState(state = {}) {
  const sourceMode = state.options?.sourceMode || 'project';
  const hasSource = sourceMode === 'code-generation' ? Boolean(state.codeGeneration?.available) : Boolean(state.project?.path);
  const missingFieldCount = REQUIRED_FIELDS.filter((key) => !hasText(state.fields?.[key])).length;
  const screenshotMode = state.options?.screenshotMode || 'skip';
  const assetCount = screenshotMode === 'manual' ? state.manualScreenshots?.length || 0 : screenshotMode === 'ai' ? state.aiIllustrations?.length || 0 : 0;
  return {
    hasSource,
    missingFieldCount,
    hasDrafts: Boolean(state.drafts && Object.keys(state.drafts).length),
    codeMaterialReviewed: Boolean(state.codeMaterialReview?.confirmedAt && state.codeMaterialReview?.manifestHash),
    draftConfirmed: Boolean(state.draftConfirmed && state.confirmedSnapshot?.id),
    manualAssetReady: screenshotMode === 'skip' || Boolean(assetCount && state.manualAssetReview?.confirmedAt && state.manualAssetReview?.mode === screenshotMode),
    manualReviewCurrent: Boolean(state.confirmedSnapshot?.id && state.manualReview?.confirmedAt && state.manualReview?.snapshotId === state.confirmedSnapshot.id),
    hasOutputs: Boolean(state.outputs?.length),
    activeTask: state.task?.status === 'running' ? { type: String(state.task.type || '').slice(0, 60), progress: Math.max(0, Math.min(100, Number(state.task.progress || 0))) } : null,
    updatedAt: String(state.updated_at || '').slice(0, 40),
  };
}
function registerSoftwareCopyrightReadTools(toolRegistry, { softwareCopyrightService }) {
  if (!toolRegistry || typeof softwareCopyrightService?.loadState !== 'function') throw new Error('软件著作只读 Tool 依赖未完整初始化');
  toolRegistry.register({ id: SOFTWARE_COPYRIGHT_TOOL_IDS.workspace, name: '读取软件著作工作区摘要', version: '1.0.0', permission: SOFTWARE_COPYRIGHT_TOOL_IDS.workspace, risk: 'read', approval: 'never', idempotent: true }, () => summarizeSoftwareCopyrightState(softwareCopyrightService.loadState()));
  return SOFTWARE_COPYRIGHT_TOOL_IDS;
}
module.exports = { SOFTWARE_COPYRIGHT_TOOL_IDS, registerSoftwareCopyrightReadTools, summarizeSoftwareCopyrightState };
