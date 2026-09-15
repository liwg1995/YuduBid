'use strict';

const PROJECT_MANAGEMENT_TOOL_IDS = Object.freeze({ workspace: 'project-management.workspace.summary.read' });
const MODULE_IDS = Object.freeze(['planning', 'discovery', 'execution', 'risk', 'stakeholder', 'delivery', 'reporting', 'commercial', 'retrospective', 'compliance']);

function hasText(value) { return Boolean(String(value || '').trim()); }
function hasInput(input) { return Boolean(input && Object.values(input).some(hasText)); }

function summarizeProjectManagementState(state = {}) {
  return {
    projectId: String(state.projectId || '').slice(0, 128),
    profileReady: Boolean(hasText(state.profile?.projectName) && (hasText(state.profile?.clientName) || hasText(state.profile?.keyConstraints))),
    inputReady: Object.fromEntries(MODULE_IDS.map((id) => [id, hasInput(state[`${id}Input`])])),
    resultReady: Object.fromEntries(MODULE_IDS.map((id) => [id, hasText(state[`${id}Result`])])),
    completedCount: MODULE_IDS.filter((id) => hasText(state[`${id}Result`])).length,
    moduleTotal: MODULE_IDS.length,
    activeTask: state.task?.status === 'running' ? {
      type: String(state.task.type || '').slice(0, 40),
      progress: Math.max(0, Math.min(100, Number(state.task.progress || 0))),
    } : null,
    updatedAt: String(state.updated_at || '').slice(0, 40),
  };
}

function registerProjectManagementReadTools(toolRegistry, { projectManagementService }) {
  if (!toolRegistry || typeof projectManagementService?.loadState !== 'function') throw new Error('项目协作只读 Tool 依赖未完整初始化');
  toolRegistry.register({ id: PROJECT_MANAGEMENT_TOOL_IDS.workspace, name: '读取项目协作工作区摘要', version: '1.0.0', permission: PROJECT_MANAGEMENT_TOOL_IDS.workspace, risk: 'read', approval: 'never', idempotent: true }, () => summarizeProjectManagementState(projectManagementService.loadState()));
  return PROJECT_MANAGEMENT_TOOL_IDS;
}

module.exports = { MODULE_IDS, PROJECT_MANAGEMENT_TOOL_IDS, registerProjectManagementReadTools, summarizeProjectManagementState };
