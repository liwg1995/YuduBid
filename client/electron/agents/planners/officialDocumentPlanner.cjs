'use strict';

const { OFFICIAL_DOCUMENT_TOOL_IDS } = require('../tools/officialDocumentReadTools.cjs');

function deriveOfficialDocumentAction(workspace) {
  if (!workspace) return 'load-workspace';
  if (workspace.activeTask) return 'wait-active-task';
  if (!workspace.hasDraft && !workspace.inputReady) return 'complete-input';
  if (!workspace.hasDraft) return 'generate-draft';
  if (!workspace.hasReview) return 'check-draft';
  if (!workspace.hasPolishedRevision) return 'polish-draft';
  return 'review-and-export';
}

function createOfficialDocumentPlanner() {
  const createPlan = () => ({
    summary: '读取公文工作区摘要并按起草、检查、润色、复核导出的顺序规划。',
    toolCalls: [{ id: 'workspace', toolId: OFFICIAL_DOCUMENT_TOOL_IDS.workspace, args: {} }],
  });
  const createRecommendation = ({ steps }) => {
    const workspace = steps.find((step) => step.id === 'workspace')?.result;
    const messages = {
      'load-workspace': '请先打开公文写作工作区。',
      'wait-active-task': '当前有公文任务正在运行，请等待完成。',
      'complete-input': '请先补充材料要点，至少写清背景、事项或任务。',
      'generate-draft': '起草要素已经具备，建议下一步生成公文草稿。',
      'check-draft': '草稿已经就绪，建议下一步执行格式与内容检查。',
      'polish-draft': '检查结果已经就绪，建议下一步在不新增事实的前提下降低 AI 味。',
      'review-and-export': '起草、检查和润色已完成，建议人工复核后导出 Word。',
    };
    return messages[deriveOfficialDocumentAction(workspace)];
  };
  const createShadowEvaluation = ({ steps, recommendation }) => {
    const workspace = steps.find((step) => step.id === 'workspace')?.result;
    const action = deriveOfficialDocumentAction(workspace);
    return {
      currentStep: action,
      legacyAction: action,
      agentAction: action,
      aligned: true,
      reasonCode: 'ALIGNED',
      reasonLabel: '流程一致',
      activeTaskCount: workspace?.activeTask ? 1 : 0,
      executed: false,
      note: `${recommendation} 本次规划未执行任何业务操作。`,
    };
  };
  return { createPlan, createRecommendation, createShadowEvaluation };
}

module.exports = { createOfficialDocumentPlanner, deriveOfficialDocumentAction };
