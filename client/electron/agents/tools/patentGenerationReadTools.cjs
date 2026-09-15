'use strict';
const PATENT_GENERATION_TOOL_IDS = Object.freeze({ workspace: 'patent-generation.workspace.summary.read' });
function hasText(value) { return Boolean(String(value || '').trim()); }
function summarizePatentGenerationState(state = {}) {
  const selectedPoint = (state.miningResult || []).find((point) => point.id === state.selectedPatentPointId);
  const confirmedFacts = new Set((selectedPoint?.factSupplements || []).filter((item) => item.source === 'manual' && hasText(item.content)).map((item) => String(item.fact || '').trim()));
  const unresolvedFactCount = (selectedPoint?.missingFacts || []).filter((fact) => !confirmedFacts.has(String(fact || '').trim())).length;
  return {
    caseId: String(state.caseId || '').slice(0, 128),
    caseReady: Boolean(hasText(state.caseInfo?.caseName) || hasText(state.caseInfo?.topic)),
    hasProject: Boolean(state.project?.path),
    candidateCount: Array.isArray(state.miningResult) ? state.miningResult.length : 0,
    selectedPointReady: Boolean(selectedPoint),
    unresolvedFactCount,
    hasFactSuggestions: Boolean(selectedPoint?.factSupplements?.some((item) => item.source === 'ai' && hasText(item.content))),
    hasDisclosure: Boolean(state.activeDraftId && state.disclosureDrafts?.length),
    hasPriorArt: hasText(state.priorArtMarkdown),
    revisionCount: Array.isArray(state.revisionLogs) ? state.revisionLogs.length : 0,
    activeTask: ['running', 'pausing', 'stopping'].includes(state.task?.status) ? { type: String(state.task.type || '').slice(0, 60), progress: Math.max(0, Math.min(100, Number(state.task.progress || 0))) } : null,
    updatedAt: String(state.updated_at || '').slice(0, 40),
  };
}
function registerPatentGenerationReadTools(toolRegistry, { patentGenerationService }) {
  if (!toolRegistry || typeof patentGenerationService?.loadState !== 'function') throw new Error('专利生成只读 Tool 依赖未完整初始化');
  toolRegistry.register({ id: PATENT_GENERATION_TOOL_IDS.workspace, name: '读取专利生成工作区摘要', version: '1.0.0', permission: PATENT_GENERATION_TOOL_IDS.workspace, risk: 'read', approval: 'never', idempotent: true }, () => summarizePatentGenerationState(patentGenerationService.loadState()));
  return PATENT_GENERATION_TOOL_IDS;
}
module.exports = { PATENT_GENERATION_TOOL_IDS, registerPatentGenerationReadTools, summarizePatentGenerationState };
