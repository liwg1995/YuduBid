'use strict';

const { TOOL_IDS } = require('../tools/bidReadTools.cjs');

function deriveBidAction(workspace, activeTasks = []) {
  if (!workspace) return 'select-project';
  if (activeTasks.length) return 'wait-active-task';
  if (!workspace.document?.imported) return 'document-analysis';
  if (workspace.bidAnalysis?.taskStatus !== 'success') return 'bid-analysis';
  if (!workspace.outline?.ready) return 'outline-generation';
  if (!workspace.globalFacts?.count) return 'global-facts';
  if (workspace.content?.completedSections < workspace.content?.totalSections) return 'content-generation';
  return 'review-and-export';
}

function createBidDryRunPlanner() {
  async function createPlan({ context = {} }) {
    const workflowKind = context.workflowKind === 'existing-plan-expansion'
      ? 'existing-plan-expansion'
      : 'technical-plan';
    const projectId = String(context.projectId || '').trim();
    const toolCalls = [
      { id: 'projects', toolId: TOOL_IDS.projects, args: { workflowKind } },
      { id: 'tasks', toolId: TOOL_IDS.tasks, args: { workflowKind, ...(projectId ? { projectId } : {}) } },
      { id: 'knowledge-base', toolId: TOOL_IDS.knowledgeBase, args: {} },
    ];
    if (projectId) {
      toolCalls.splice(1, 0, { id: 'workspace', toolId: TOOL_IDS.workspace, args: { workflowKind, projectId } });
    }
    return { summary: '读取当前项目、工作区、活动任务和知识库摘要后给出下一步建议。', toolCalls };
  }

  async function createRecommendation({ steps }) {
    const resultById = new Map(steps.map((step) => [step.id, step.result]));
    const projects = resultById.get('projects')?.projects || [];
    const workspace = resultById.get('workspace');
    const tasks = resultById.get('tasks')?.tasks || [];
    const knowledge = resultById.get('knowledge-base')?.counts || {};
    const recommendations = [];

    if (!projects.length) recommendations.push('请先创建一个技术方案项目。');
    else if (!workspace) recommendations.push('请选择一个技术方案项目，以便检查材料和当前步骤。');
    else if (!workspace.document?.imported) recommendations.push('当前项目尚未导入业务文档，建议先完成材料导入。');
    else if (workspace.bidAnalysis?.taskStatus !== 'success') recommendations.push('材料已经导入，建议下一步完成招标文件分析。');
    else if (!workspace.outline?.ready) recommendations.push('招标文件分析已有结果，建议下一步生成并确认目录。');
    else if (!workspace.globalFacts?.count) recommendations.push('目录已经就绪，建议下一步生成并确认全局事实。');
    else if (workspace.content?.completedSections < workspace.content?.totalSections) recommendations.push('全局事实已经就绪，建议继续生成未完成章节。');
    else recommendations.push('当前技术方案主要步骤已完成，建议进行一致性检查和导出前复核。');

    if (tasks.length) recommendations.push(`当前有 ${tasks.length} 个技术方案任务正在运行，请等待完成后再启动冲突任务。`);
    if (!Number(knowledge.completed || 0)) recommendations.push('知识库暂无可用文档，可按项目需要补充企业资质、案例或产品资料。');
    return recommendations.join('\n');
  }

  async function createShadowEvaluation({ steps, recommendation }) {
    const workspace = steps.find((step) => step.id === 'workspace')?.result;
    const activeTasks = steps.find((step) => step.id === 'tasks')?.result?.tasks || [];
    if (!workspace) throw new Error('影子运行未读取到技术方案工作区');
    const currentStep = String(workspace.step || 'document-analysis');
    const legacyActionByStep = {
      'document-analysis': 'document-analysis',
      'bid-analysis': 'bid-analysis',
      'outline-generation': 'outline-generation',
      'global-facts': 'global-facts',
      'content-edit': 'content-generation',
      expand: 'review-and-export',
    };
    const stateAction = deriveBidAction(workspace);
    const agentAction = deriveBidAction(workspace, activeTasks);
    const legacyAction = legacyActionByStep[currentStep] || 'unknown';
    const actionRank = {
      'document-analysis': 0,
      'bid-analysis': 1,
      'outline-generation': 2,
      'global-facts': 3,
      'content-generation': 4,
      'review-and-export': 5,
    };
    const aligned = legacyAction === agentAction;
    const reasonCode = aligned
      ? 'ALIGNED'
      : activeTasks.length
        ? 'ACTIVE_TASK_CONFLICT'
        : actionRank[legacyAction] < actionRank[stateAction]
          ? 'WORKBENCH_STEP_BEHIND'
          : actionRank[legacyAction] > actionRank[stateAction]
            ? 'WORKBENCH_STEP_AHEAD'
            : 'STATE_INCONSISTENT';
    const reasonLabels = {
      ALIGNED: '流程一致',
      ACTIVE_TASK_CONFLICT: '存在活动任务冲突',
      WORKBENCH_STEP_BEHIND: '工作台步骤滞后',
      WORKBENCH_STEP_AHEAD: '工作台步骤超前',
      STATE_INCONSISTENT: '项目状态不一致',
    };
    return {
      currentStep,
      legacyAction,
      agentAction,
      aligned,
      reasonCode,
      reasonLabel: reasonLabels[reasonCode],
      activeTaskCount: activeTasks.length,
      executed: false,
      note: aligned
        ? 'Agent 建议与当前工作台步骤一致；本次未执行任何业务操作。'
        : `${reasonLabels[reasonCode]}：${String(recommendation || '').split('\n')[0] || '未生成建议'}；请人工检查项目状态。`,
    };
  }

  return { createPlan, createRecommendation, createShadowEvaluation };
}

module.exports = { createBidDryRunPlanner, deriveBidAction };
