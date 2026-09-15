'use strict';

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

const PRESALES_TOOL_IDS = Object.freeze({
  projects: 'presales.projects.read',
  workspace: 'presales.workspace.summary.read',
});

function safeText(value, maxLength = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function requireProjectId(value) {
  const projectId = String(value || '').trim();
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new Error('请提供有效的售前项目 ID');
  return projectId;
}

function hasContent(result) {
  return Boolean(String(result?.markdown || '').trim());
}

function summarizeState(state) {
  const task = state?.task || {};
  return {
    projectId: safeText(state?.projectId, 128),
    project: {
      name: safeText(state?.profile?.projectName || '未命名售前项目'),
      customerName: safeText(state?.profile?.customerName),
      industry: safeText(state?.profile?.industry, 80),
      currentStage: safeText(state?.profile?.currentStage, 80),
      owner: safeText(state?.profile?.owner, 80),
    },
    profileReady: Boolean(safeText(state?.profile?.customerName) || safeText(state?.profile?.industry) || safeText(state?.profile?.keyBackground)),
    materialCount: Array.isArray(state?.materials) ? state.materials.length : 0,
    stages: {
      analysis: hasContent(state?.analysisResult),
      research: hasContent(state?.researchResult),
      architecture: hasContent(state?.architectureResult),
      diagrams: hasContent(state?.diagramResult),
      presentation: hasContent(state?.presentationResult),
    },
    activeTask: task.status === 'running' ? {
      id: safeText(task.id, 128),
      type: safeText(task.type, 40),
      progress: Math.max(0, Math.min(100, Math.round(Number(task.progress || 0)))),
      message: safeText(task.message, 240),
    } : null,
    exportCount: Array.isArray(state?.exportRecords) ? state.exportRecords.length : 0,
    updatedAt: safeText(state?.updated_at, 40),
  };
}

function registerPresalesReadTools(toolRegistry, { presalesWorkbenchService }) {
  if (!toolRegistry || typeof presalesWorkbenchService?.listProjects !== 'function' || typeof presalesWorkbenchService?.loadState !== 'function') {
    throw new Error('售前只读 Tool 依赖未完整初始化');
  }

  toolRegistry.register({
    id: PRESALES_TOOL_IDS.projects,
    name: '读取售前项目列表',
    version: '1.0.0',
    permission: PRESALES_TOOL_IDS.projects,
    risk: 'read',
    approval: 'never',
    idempotent: true,
  }, () => {
    const result = presalesWorkbenchService.listProjects();
    return {
      activeProjectId: safeText(result?.activeProjectId, 128) || undefined,
      projects: (Array.isArray(result?.projects) ? result.projects : []).map((project) => ({
        id: safeText(project?.id, 128),
        name: safeText(project?.name || '未命名售前项目'),
        customerName: safeText(project?.customerName),
        materialCount: Math.max(0, Math.round(Number(project?.materialCount || 0))),
        generatedCount: Math.max(0, Math.round(Number(project?.generatedCount || 0))),
        updatedAt: safeText(project?.updated_at, 40),
      })).filter((project) => project.id),
    };
  });

  toolRegistry.register({
    id: PRESALES_TOOL_IDS.workspace,
    name: '读取售前工作区摘要',
    version: '1.0.0',
    permission: PRESALES_TOOL_IDS.workspace,
    risk: 'read',
    approval: 'never',
    idempotent: true,
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: { projectId: { type: 'string', minLength: 1, maxLength: 128 } },
      additionalProperties: false,
    },
  }, (args = {}) => {
    const projectId = requireProjectId(args.projectId);
    const projects = presalesWorkbenchService.listProjects()?.projects || [];
    if (!projects.some((project) => String(project?.id) === projectId)) throw new Error('售前项目不存在');
    return summarizeState(presalesWorkbenchService.loadState(projectId));
  });

  return PRESALES_TOOL_IDS;
}

module.exports = { PRESALES_TOOL_IDS, registerPresalesReadTools, summarizeState };
