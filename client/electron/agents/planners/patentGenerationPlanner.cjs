'use strict';
const { PATENT_GENERATION_TOOL_IDS } = require('../tools/patentGenerationReadTools.cjs');
function derivePatentGenerationAction(workspace) {
  if (!workspace?.caseId) return 'select-case';
  if (workspace.activeTask) return 'wait-active-task';
  if (!workspace.caseReady) return 'complete-case-info';
  if (!workspace.hasProject) return 'select-project';
  if (!workspace.candidateCount) return 'start-mining';
  if (!workspace.selectedPointReady) return 'select-patent-point';
  if (workspace.unresolvedFactCount > 0) return workspace.hasFactSuggestions ? 'confirm-fact-supplements' : 'generate-fact-supplements';
  if (!workspace.hasDisclosure) return 'generate-disclosure';
  if (!workspace.hasPriorArt) return 'complete-prior-art';
  if (!workspace.revisionCount) return 'consider-revision';
  return 'review-and-export';
}
function createPatentGenerationPlanner() {
  const createPlan = () => ({ summary: '读取专利工作区摘要，按现有案件流程规划下一步。', toolCalls: [{ id: 'workspace', toolId: PATENT_GENERATION_TOOL_IDS.workspace, args: {} }] });
  const createRecommendation = ({ steps }) => ({ 'select-case': '请先创建或进入专利项目。', 'wait-active-task': '当前有专利任务运行，请等待完成。', 'complete-case-info': '请先完善案件名称或技术主题并保存。', 'select-project': '请导入项目目录，建立真实技术证据来源。', 'start-mining': '案件和项目已就绪，建议开始专利点挖掘。', 'select-patent-point': '请人工比较候选点并选择主专利点。', 'generate-fact-supplements': '主专利点仍有待补事实，建议生成补充建议供人工核验。', 'confirm-fact-supplements': '请修改并保存事实补充，AI 建议不能直接作为确认事实。', 'generate-disclosure': '事实已补齐，建议生成技术交底书草稿。', 'complete-prior-art': '交底书已生成，可补充公开资料进行查新增强。', 'consider-revision': '请人工复核交底书；如需合并或纠错，可生成修订版本。', 'review-and-export': '交底书、查新和修订已完成，建议人工复核后导出 Word。' }[derivePatentGenerationAction(steps[0]?.result)]);
  const createShadowEvaluation = ({ steps, recommendation }) => { const workspace = steps[0]?.result; const action = derivePatentGenerationAction(workspace); return { currentStep: action, legacyAction: action, agentAction: action, aligned: true, reasonCode: 'ALIGNED', reasonLabel: '流程一致', activeTaskCount: workspace?.activeTask ? 1 : 0, executed: false, note: `${recommendation} 本次规划未执行业务操作。` }; };
  return { createPlan, createRecommendation, createShadowEvaluation };
}
module.exports = { createPatentGenerationPlanner, derivePatentGenerationAction };
