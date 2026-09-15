'use strict';
const { MODULE_IDS, PROJECT_MANAGEMENT_TOOL_IDS } = require('../tools/projectManagementReadTools.cjs');

function deriveProjectManagementAction(workspace) {
  if (!workspace?.projectId) return 'select-project';
  if (workspace.activeTask) return 'wait-active-task';
  if (!workspace.profileReady) return 'complete-profile';
  for (const moduleId of MODULE_IDS) {
    if (workspace.resultReady?.[moduleId]) continue;
    return workspace.inputReady?.[moduleId] ? `generate-${moduleId}` : `complete-${moduleId}-input`;
  }
  return 'review-and-export';
}

function createProjectManagementPlanner() {
  const createPlan = () => ({ summary: '读取项目协作摘要，按十个既有模块的顺序规划下一步。', toolCalls: [{ id: 'workspace', toolId: PROJECT_MANAGEMENT_TOOL_IDS.workspace, args: {} }] });
  const createRecommendation = ({ steps }) => {
    const action = deriveProjectManagementAction(steps[0]?.result);
    if (action === 'select-project') return '请先选择或创建项目。';
    if (action === 'wait-active-task') return '当前已有项目协作任务运行，请等待完成。';
    if (action === 'complete-profile') return '请先完善并保存项目档案。';
    if (action === 'review-and-export') return '十个模块均已完成，建议人工复核后导出项目成果。';
    const moduleId = MODULE_IDS.find((id) => action.includes(id));
    const labels = { planning: '启动规划', discovery: '需求调研', execution: '排期推进', risk: '风险问题', stakeholder: '沟通变更', delivery: '交付验收', reporting: '项目汇报', commercial: '商务回款', retrospective: '项目复盘', compliance: '合规上线' };
    return action.startsWith('generate-') ? `材料已具备，建议生成${labels[moduleId] || moduleId}方案。` : `请先补充${labels[moduleId] || moduleId}材料。`;
  };
  const createShadowEvaluation = ({ steps, recommendation }) => { const workspace = steps[0]?.result; const action = deriveProjectManagementAction(workspace); return { currentStep: action, legacyAction: action, agentAction: action, aligned: true, reasonCode: 'ALIGNED', reasonLabel: '流程一致', activeTaskCount: workspace?.activeTask ? 1 : 0, executed: false, note: `${recommendation} 本次规划未执行业务操作。` }; };
  return { createPlan, createRecommendation, createShadowEvaluation };
}

module.exports = { createProjectManagementPlanner, deriveProjectManagementAction };
