'use strict';

const { createSummary } = require('../plugins/technicalPlanCapabilities.cjs');
const { normalizeOutlineGenerationArgs, OUTLINE_START_TOOL_ID } = require('./tools/bidWriteTools.cjs');

function createActionPreviewService({ technicalPlanStore, taskService, getShadowReport }) {
  if (!technicalPlanStore || typeof taskService?.peekActiveTasks !== 'function' || typeof getShadowReport !== 'function') {
    throw new Error('Agent Action Preview 依赖未完整初始化');
  }

  function previewOutlineGeneration(input = {}) {
    const args = normalizeOutlineGenerationArgs(input);
    const projects = technicalPlanStore.listProjects(args.workflowKind)?.projects || [];
    const project = projects.find((item) => String(item?.id) === args.projectId);
    if (!project) throw new Error('技术方案项目不存在');
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind: args.workflowKind, projectId: args.projectId });
    const summary = createSummary({ ...state, projectId: args.projectId }, args.workflowKind);
    const activeTasks = (taskService.peekActiveTasks() || []).filter((task) => task?.group === 'technical-plan');
    const admission = getShadowReport({ limit: 1 }).admission;
    const blockers = [];
    if (summary.bidAnalysis?.taskStatus !== 'success') blockers.push({ code: 'BID_ANALYSIS_REQUIRED', message: '请先完成招标文件分析' });
    if (activeTasks.length) blockers.push({ code: 'ACTIVE_TASK_CONFLICT', message: `当前有 ${activeTasks.length} 个技术方案任务正在运行` });
    if (!admission.eligibleForHumanApprovalPilot) blockers.push({ code: 'ADMISSION_GATE_BLOCKED', message: admission.note });

    return {
      previewOnly: true,
      approvalCreated: false,
      executionStarted: false,
      readyForHumanApprovalPilot: blockers.length === 0,
      tool: { id: OUTLINE_START_TOOL_ID, name: '启动技术方案目录生成', version: '0.1.0', risk: 'high', approval: 'always' },
      summary: `为“${String(project.name || '未命名项目').slice(0, 160)}”重新生成技术方案目录`,
      parameters: {
        workflowKind: args.workflowKind,
        projectId: args.projectId,
        mode: args.mode,
        referenceKnowledgeDocumentCount: args.referenceKnowledgeDocumentIds.length,
      },
      impact: {
        startsBackgroundTask: true,
        replacesOutline: Boolean(summary.outline?.ready),
        clearsGlobalFacts: Boolean(summary.globalFacts?.count),
        clearsGeneratedContent: Boolean(summary.content?.completedSections),
        authoritativeStore: 'technical_plan workspace',
      },
      blockers,
      admission,
    };
  }

  return { previewOutlineGeneration };
}

module.exports = { createActionPreviewService };
