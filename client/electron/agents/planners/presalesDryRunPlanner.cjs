'use strict';

const { PRESALES_TOOL_IDS } = require('../tools/presalesReadTools.cjs');

const STAGE_ACTIONS = ['analysis', 'research', 'architecture', 'diagrams', 'presentation'];

function nextAction(workspace) {
  if (!workspace) return 'select-project';
  if (workspace.activeTask) return 'wait-active-task';
  if (!workspace.profileReady) return 'complete-profile';
  if (!workspace.materialCount) return 'add-materials';
  return STAGE_ACTIONS.find((stage) => !workspace.stages?.[stage]) || 'review-and-export';
}

function createPresalesDryRunPlanner() {
  async function createPlan({ context = {} }) {
    const projectId = String(context.projectId || '').trim();
    return {
      summary: '读取售前项目与工作区摘要，按现有五阶段流程给出下一步建议。',
      toolCalls: [
        { id: 'projects', toolId: PRESALES_TOOL_IDS.projects, args: {} },
        ...(projectId ? [{ id: 'workspace', toolId: PRESALES_TOOL_IDS.workspace, args: { projectId } }] : []),
      ],
    };
  }

  async function createRecommendation({ steps }) {
    const projects = steps.find((step) => step.id === 'projects')?.result?.projects || [];
    const workspace = steps.find((step) => step.id === 'workspace')?.result;
    if (!projects.length) return '请先创建一个售前项目。';
    if (!workspace) return '请选择一个售前项目，以便检查材料和五阶段成果。';
    const labels = {
      'wait-active-task': `当前正在执行${workspace.activeTask?.type || '售前'}任务，请等待完成后再启动下一阶段。`,
      'complete-profile': '当前项目资料尚不完整，建议先补充客户名称、行业或背景摘要。',
      'add-materials': '当前项目尚无客户材料，建议先导入材料或手动录入客户线索。',
      analysis: '客户材料已经就绪，建议下一步生成客户材料分析。',
      research: '客户材料分析已完成，建议下一步生成售前调研准备包。',
      architecture: '调研准备已完成，建议下一步生成方案架构草案。',
      diagrams: '方案架构已完成，建议下一步生成图表工场草稿。',
      presentation: '图表草稿已完成，建议下一步生成售前汇报页纲。',
      'review-and-export': '五阶段成果均已完成，建议人工复核后使用原工作台导出项目包或汇报材料。',
    };
    return labels[nextAction(workspace)];
  }

  async function createShadowEvaluation({ steps, recommendation }) {
    const workspace = steps.find((step) => step.id === 'workspace')?.result;
    if (!workspace) throw new Error('影子运行未读取到售前工作区');
    const agentAction = nextAction(workspace);
    return {
      currentStep: agentAction,
      legacyAction: agentAction,
      agentAction,
      aligned: true,
      reasonCode: 'ALIGNED',
      reasonLabel: '流程一致',
      activeTaskCount: workspace.activeTask ? 1 : 0,
      executed: false,
      note: `Agent 建议由现有售前状态确定；${String(recommendation || '').split('\n')[0]} 本次未执行任何业务操作。`,
    };
  }

  return { createPlan, createRecommendation, createShadowEvaluation };
}

module.exports = { createPresalesDryRunPlanner, nextAction };
