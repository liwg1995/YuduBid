'use strict';

const OUTLINE_START_TOOL_ID = 'bid.technical-plan.outline.start';
const WORKFLOW_KINDS = new Set(['technical-plan', 'existing-plan-expansion']);
const OUTLINE_MODES = new Set(['free', 'aligned', 'response-file']);
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

function safeText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeOutlineGenerationArgs(input = {}) {
  const workflowKind = String(input.workflowKind || 'technical-plan').trim();
  const projectId = String(input.projectId || '').trim();
  const mode = String(input.mode || 'aligned').trim();
  if (!WORKFLOW_KINDS.has(workflowKind)) throw new Error('不支持的技术方案工作流');
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new Error('请提供有效的技术方案项目 ID');
  if (!OUTLINE_MODES.has(mode)) throw new Error('技术方案目录模式无效');
  const referenceKnowledgeDocumentIds = [...new Set((Array.isArray(input.referenceKnowledgeDocumentIds) ? input.referenceKnowledgeDocumentIds : [])
    .map((item) => String(item || '').trim())
    .filter((item) => PROJECT_ID_PATTERN.test(item)))].slice(0, 100);
  return { workflowKind, projectId, mode, referenceKnowledgeDocumentIds };
}

function registerBidWriteTools(toolRegistry, { technicalPlanStore, taskService }) {
  if (!toolRegistry || !technicalPlanStore || typeof taskService?.startOutlineGeneration !== 'function') {
    throw new Error('招投标写 Tool 依赖未完整初始化');
  }

  toolRegistry.register({
    id: OUTLINE_START_TOOL_ID,
    name: '启动技术方案目录生成',
    version: '0.1.0',
    permission: OUTLINE_START_TOOL_ID,
    risk: 'high',
    approval: 'always',
    idempotent: false,
    taskGroup: 'technical-plan',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        workflowKind: { enum: [...WORKFLOW_KINDS] },
        projectId: { type: 'string', minLength: 1, maxLength: 128 },
        mode: { enum: [...OUTLINE_MODES] },
        referenceKnowledgeDocumentIds: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 128 } },
      },
      additionalProperties: false,
    },
  }, (input = {}) => {
    const args = normalizeOutlineGenerationArgs(input);
    const projects = technicalPlanStore.listProjects(args.workflowKind)?.projects || [];
    if (!projects.some((project) => String(project?.id) === args.projectId)) throw new Error('技术方案项目不存在');
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind: args.workflowKind, projectId: args.projectId });
    if (state?.bidAnalysisTask?.status !== 'success') throw new Error('请先完成招标文件分析');
    const task = taskService.startOutlineGeneration({
      workflowKind: args.workflowKind,
      projectId: args.projectId,
      mode: args.mode,
      reference_knowledge_document_ids: args.referenceKnowledgeDocumentIds,
    });
    return {
      started: true,
      projectId: args.projectId,
      task: {
        id: safeText(task?.task_id, 128),
        type: safeText(task?.type || 'outline-generation', 80),
        status: safeText(task?.status || 'running', 32),
        progress: Math.max(0, Math.min(100, Math.round(Number(task?.progress || 0)))),
      },
    };
  });

  return OUTLINE_START_TOOL_ID;
}

module.exports = { OUTLINE_START_TOOL_ID, normalizeOutlineGenerationArgs, registerBidWriteTools };
