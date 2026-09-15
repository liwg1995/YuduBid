'use strict';
const { GRANT_TOOL_IDS } = require('../tools/grantApplicationReadTools.cjs');
function deriveGrantAction(w) {
  if (!w) return 'load-workspace';
  if (w.activeTask) return 'wait-active-task';
  if (!w.profileReady || !w.inputReady?.diagnosis) return 'complete-diagnosis-input';
  if (!w.outputsReady?.diagnosis) return 'generate-diagnosis';
  if (!w.inputReady?.['topic-policy']) return 'complete-topic-input';
  if (!w.outputsReady?.['topic-policy']) return 'generate-topic';
  if (!w.inputReady?.proposal) return 'complete-proposal-input';
  if (w.moduleCount < w.moduleTotal) return 'generate-proposal-modules';
  if (w.finalReviewStatus === 'unchecked') return 'check-final-proposal';
  if (!w.inputReady?.['review-defense']) return 'complete-review-input';
  if (!w.outputsReady?.['review-defense']) return 'generate-review-defense';
  return 'review-and-export';
}
function createGrantApplicationPlanner() {
  const createPlan = () => ({ summary: '读取课题申报摘要，按诊断、选题、申报书、终审和答辩顺序规划。', toolCalls: [{ id: 'workspace', toolId: GRANT_TOOL_IDS.workspace, args: {} }] });
  const createRecommendation = ({ steps }) => {
    const a = deriveGrantAction(steps[0]?.result);
    const labels = { 'load-workspace': '请先打开课题申报工作区。', 'wait-active-task': '当前有课题申报任务运行，请等待完成。', 'complete-diagnosis-input': '请先完善课题档案和启动诊断信息。', 'generate-diagnosis': '诊断信息已具备，建议生成申报路线诊断。', 'complete-topic-input': '请补充选题方向及政策材料。', 'generate-topic': '建议生成选题与政策方案。', 'complete-proposal-input': '请补充申报书撰写任务和依据。', 'generate-proposal-modules': '建议按顺序补齐申报书缺失模块。', 'check-final-proposal': '申报书模块已齐备，建议执行整稿质量检查。', 'complete-review-input': '请补充评审优化或答辩任务。', 'generate-review-defense': '建议生成评审优化与答辩稿。', 'review-and-export': '课题申报主要成果已完成，建议人工复核后导出。' };
    return labels[a];
  };
  const createShadowEvaluation = ({ steps, recommendation }) => { const w = steps[0]?.result; const a = deriveGrantAction(w); return { currentStep: a, legacyAction: a, agentAction: a, aligned: true, reasonCode: 'ALIGNED', reasonLabel: '流程一致', activeTaskCount: w?.activeTask ? 1 : 0, executed: false, note: `${recommendation} 本次规划未执行业务操作。` }; };
  return { createPlan, createRecommendation, createShadowEvaluation };
}
module.exports = { createGrantApplicationPlanner, deriveGrantAction };
