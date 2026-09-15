'use strict';
const { PANEL_IDS, THESIS_TUTOR_TOOL_IDS } = require('../tools/thesisTutorReadTools.cjs');
function deriveThesisTutorAction(workspace) {
  if (!workspace) return 'load-workspace';
  if (workspace.activeTask) return 'wait-active-task';
  if (!workspace.profileReady) return 'complete-profile';
  const missingPanel = PANEL_IDS.find((id) => !workspace.panelReady?.[id]);
  return missingPanel ? `generate-${missingPanel}` : 'review-and-export';
}
function createThesisTutorPlanner() {
  const createPlan = () => ({ summary: '读取论文导师摘要，按十个既有阶段规划下一步。', toolCalls: [{ id: 'workspace', toolId: THESIS_TUTOR_TOOL_IDS.workspace, args: {} }] });
  const createRecommendation = ({ steps }) => {
    const action = deriveThesisTutorAction(steps[0]?.result);
    if (action === 'load-workspace') return '请先打开论文导师工作区。';
    if (action === 'wait-active-task') return '当前已有论文生成任务运行，请等待完成。';
    if (action === 'complete-profile') return '请先完善论文专业、研究方向或题目。';
    if (action === 'review-and-export') return '论文导师各阶段已有成果，建议核验文献、数据和反馈后导出。';
    const labels = { diagnosis: '启动诊断', topic: '选题与开题', literature: '文献综述', methodology: '研究设计', data: '数据与实证预检', charts: '图表与模型图', drafting: '论文初稿', writing: '逐章写作', review: '评审与答辩', format: '格式与查重检查' };
    const panel = action.replace('generate-', '');
    return `建议进入${labels[panel] || panel}阶段，补充必要材料后生成工作稿。`;
  };
  const createShadowEvaluation = ({ steps, recommendation }) => { const workspace = steps[0]?.result; const action = deriveThesisTutorAction(workspace); return { currentStep: action, legacyAction: action, agentAction: action, aligned: true, reasonCode: 'ALIGNED', reasonLabel: '流程一致', activeTaskCount: workspace?.activeTask ? 1 : 0, executed: false, note: `${recommendation} 本次规划未执行业务操作。` }; };
  return { createPlan, createRecommendation, createShadowEvaluation };
}
module.exports = { createThesisTutorPlanner, deriveThesisTutorAction };
