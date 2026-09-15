'use strict';
const { SOFTWARE_COPYRIGHT_TOOL_IDS } = require('../tools/softwareCopyrightReadTools.cjs');
function deriveSoftwareCopyrightAction(workspace) {
  if (!workspace) return 'load-workspace';
  if (workspace.activeTask) return 'wait-active-task';
  if (!workspace.hasSource) return 'select-source';
  if (workspace.missingFieldCount > 0) return 'complete-fields';
  if (!workspace.hasDrafts) return 'generate-drafts';
  if (!workspace.codeMaterialReviewed) return 'review-code-material';
  if (!workspace.draftConfirmed) return 'confirm-draft';
  if (!workspace.manualAssetReady) return 'review-manual-assets';
  if (!workspace.manualReviewCurrent) return 'complete-submission-review';
  if (!workspace.hasOutputs) return 'review-and-export';
  return 'inspect-delivery';
}
function createSoftwareCopyrightPlanner() {
  const createPlan = () => ({ summary: '读取软件著作工作区摘要，按现有六阶段流程规划下一步。', toolCalls: [{ id: 'workspace', toolId: SOFTWARE_COPYRIGHT_TOOL_IDS.workspace, args: {} }] });
  const createRecommendation = ({ steps }) => ({ 'load-workspace': '请先打开软件著作工作区。', 'wait-active-task': '当前有软著任务运行，请等待完成。', 'select-source': '请先选择项目源码或确认代码生成素材。', 'complete-fields': '请补齐并保存软著登记必填字段。', 'generate-drafts': '源码与登记信息已具备，建议生成软著草稿。', 'review-code-material': '草稿已生成，请人工核对代码鉴别材料。', 'confirm-draft': '代码材料已核对，建议运行完整检查并确认草稿快照。', 'review-manual-assets': '请人工核对操作手册图片、图注和放置位置。', 'complete-submission-review': '请完成权属、主体、日期、源码证据和受理要求复核。', 'review-and-export': '材料已齐备，建议执行提交前总检并导出正式资料。', 'inspect-delivery': '正式资料已生成，建议核验交付批次和文件摘要。' }[deriveSoftwareCopyrightAction(steps[0]?.result)]);
  const createShadowEvaluation = ({ steps, recommendation }) => { const workspace = steps[0]?.result; const action = deriveSoftwareCopyrightAction(workspace); return { currentStep: action, legacyAction: action, agentAction: action, aligned: true, reasonCode: 'ALIGNED', reasonLabel: '流程一致', activeTaskCount: workspace?.activeTask ? 1 : 0, executed: false, note: `${recommendation} 本次规划未执行业务操作。` }; };
  return { createPlan, createRecommendation, createShadowEvaluation };
}
module.exports = { createSoftwareCopyrightPlanner, deriveSoftwareCopyrightAction };
