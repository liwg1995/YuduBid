'use strict';

const THESIS_TUTOR_TOOL_IDS = Object.freeze({ workspace: 'thesis-tutor.workspace.summary.read' });
const PANEL_IDS = Object.freeze(['diagnosis', 'topic', 'literature', 'methodology', 'data', 'charts', 'drafting', 'writing', 'review', 'format']);
function hasText(value) { return Boolean(String(value || '').trim()); }

function summarizeThesisTutorState(state = {}) {
  const panelResults = state.panelResults || {};
  return {
    profileReady: Boolean(hasText(state.profile?.discipline) && (hasText(state.profile?.direction) || hasText(state.profile?.title))),
    activePanel: PANEL_IDS.includes(state.activePanel) ? state.activePanel : 'diagnosis',
    sourceReady: hasText(state.sourceText),
    panelReady: Object.fromEntries(PANEL_IDS.map((id) => [id, hasText(panelResults[id]?.content)])),
    completedCount: PANEL_IDS.filter((id) => hasText(panelResults[id]?.content)).length,
    chapterCount: Array.isArray(state.chapters) ? state.chapters.length : 0,
    referenceCount: Array.isArray(state.references) ? state.references.length : 0,
    openFeedbackCount: Array.isArray(state.feedbackItems) ? state.feedbackItems.filter((item) => !['done', 'deferred'].includes(item?.status)).length : 0,
    openCheckCount: Array.isArray(state.checkItems) ? state.checkItems.filter((item) => !['fixed', 'ignored'].includes(item?.status)).length : 0,
    activeTask: state.task?.status === 'running' ? { type: String(state.task.type || '').slice(0, 40), progress: Math.max(0, Math.min(100, Number(state.task.progress || 0))) } : null,
    updatedAt: String(state.updated_at || '').slice(0, 40),
  };
}

function registerThesisTutorReadTools(toolRegistry, { thesisTutorService }) {
  if (!toolRegistry || typeof thesisTutorService?.loadState !== 'function') throw new Error('论文导师只读 Tool 依赖未完整初始化');
  toolRegistry.register({ id: THESIS_TUTOR_TOOL_IDS.workspace, name: '读取论文导师工作区摘要', version: '1.0.0', permission: THESIS_TUTOR_TOOL_IDS.workspace, risk: 'read', approval: 'never', idempotent: true }, () => summarizeThesisTutorState(thesisTutorService.loadState()));
  return THESIS_TUTOR_TOOL_IDS;
}
module.exports = { PANEL_IDS, THESIS_TUTOR_TOOL_IDS, registerThesisTutorReadTools, summarizeThesisTutorState };
