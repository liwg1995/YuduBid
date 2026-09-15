'use strict';

const { createSummary } = require('../../plugins/technicalPlanCapabilities.cjs');
const { createKnowledgeBaseSummary } = require('../../plugins/knowledgeBaseCapabilities.cjs');

const WORKFLOW_KINDS = new Set(['technical-plan', 'existing-plan-expansion']);
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

const TOOL_IDS = Object.freeze({
  projects: 'bid.technical-plan.projects.read',
  workspace: 'bid.technical-plan.workspace.read',
  tasks: 'bid.technical-plan.tasks.read',
  knowledgeBase: 'bid.knowledge-base.summary.read',
});

function safeText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeWorkflowKind(value) {
  const workflowKind = String(value || 'technical-plan').trim();
  if (!WORKFLOW_KINDS.has(workflowKind)) throw new Error('不支持的技术方案工作流');
  return workflowKind;
}

function requireProjectId(value) {
  const projectId = String(value || '').trim();
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new Error('请提供有效的技术方案项目 ID');
  return projectId;
}

function normalizeProject(project) {
  return {
    id: safeText(project?.id, 128),
    name: safeText(project?.name || '未命名项目', 160),
    isActive: Boolean(project?.isActive),
  };
}

function normalizeTask(task) {
  const progress = Number(task?.progress || 0);
  return {
    id: safeText(task?.task_id || task?.id, 128),
    type: safeText(task?.type, 80),
    group: safeText(task?.group, 80),
    workflowKind: safeText(task?.workflow_kind, 80) || undefined,
    projectId: safeText(task?.project_id, 128) || undefined,
    status: safeText(task?.status, 32) || 'running',
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
    updatedAt: safeText(task?.updated_at, 40) || undefined,
  };
}

function registerBidReadTools(toolRegistry, { technicalPlanStore, taskService, knowledgeBaseService }) {
  if (!toolRegistry || !technicalPlanStore || typeof taskService?.peekActiveTasks !== 'function' || !knowledgeBaseService) {
    throw new Error('招投标只读 Tool 依赖未完整初始化');
  }

  toolRegistry.register({
    id: TOOL_IDS.projects,
    name: '读取技术方案项目列表',
    version: '1.0.0',
    permission: TOOL_IDS.projects,
    risk: 'read',
    approval: 'never',
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: { workflowKind: { enum: [...WORKFLOW_KINDS] } },
      additionalProperties: false,
    },
  }, (args = {}) => {
    const workflowKind = normalizeWorkflowKind(args.workflowKind);
    const result = technicalPlanStore.listProjects(workflowKind);
    return {
      workflowKind,
      activeProjectId: safeText(result?.activeProjectId, 128) || undefined,
      projects: (Array.isArray(result?.projects) ? result.projects : []).map(normalizeProject).filter((item) => item.id),
    };
  });

  toolRegistry.register({
    id: TOOL_IDS.workspace,
    name: '读取技术方案工作区摘要',
    version: '1.0.0',
    permission: TOOL_IDS.workspace,
    risk: 'read',
    approval: 'never',
    idempotent: true,
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        workflowKind: { enum: [...WORKFLOW_KINDS] },
        projectId: { type: 'string', minLength: 1, maxLength: 128 },
      },
      additionalProperties: false,
    },
  }, (args = {}) => {
    const workflowKind = normalizeWorkflowKind(args.workflowKind);
    const projectId = requireProjectId(args.projectId);
    const projects = technicalPlanStore.listProjects(workflowKind)?.projects || [];
    if (!projects.some((project) => String(project?.id) === projectId)) throw new Error('技术方案项目不存在');
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind, projectId });
    return createSummary({ ...state, projectId }, workflowKind);
  });

  toolRegistry.register({
    id: TOOL_IDS.tasks,
    name: '读取技术方案活动任务',
    version: '1.0.0',
    permission: TOOL_IDS.tasks,
    risk: 'read',
    approval: 'never',
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        workflowKind: { enum: [...WORKFLOW_KINDS] },
        projectId: { type: 'string', maxLength: 128 },
      },
      additionalProperties: false,
    },
  }, (args = {}) => {
    const workflowKind = normalizeWorkflowKind(args.workflowKind);
    const projectId = args.projectId ? requireProjectId(args.projectId) : '';
    const tasks = (taskService.peekActiveTasks() || [])
      .filter((task) => task?.group === 'technical-plan')
      .filter((task) => !task?.workflow_kind || task.workflow_kind === workflowKind)
      .filter((task) => !projectId || !task?.project_id || String(task.project_id) === projectId)
      .map(normalizeTask);
    return { workflowKind, projectId: projectId || undefined, tasks };
  });

  toolRegistry.register({
    id: TOOL_IDS.knowledgeBase,
    name: '读取知识库摘要',
    version: '1.0.0',
    permission: TOOL_IDS.knowledgeBase,
    risk: 'read',
    approval: 'never',
    idempotent: true,
  }, () => createKnowledgeBaseSummary(knowledgeBaseService.list()));

  return TOOL_IDS;
}

module.exports = { TOOL_IDS, registerBidReadTools };
