import type { TechnicalPlanProjectPayload, TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../types';

const validSteps: TechnicalPlanStep[] = [
  'document-analysis',
  'generation-settings',
  'bid-analysis',
  'outline-generation',
  'global-facts',
  'content-edit',
  'expand',
];

function isTechnicalPlanState(state: TechnicalPlanState | null): state is TechnicalPlanState {
  return Boolean(state && validSteps.includes(state.step));
}

export const technicalPlanStorage = {
  async load(workflowKind?: TechnicalPlanWorkflowKind, projectId?: string): Promise<TechnicalPlanState | null> {
    const payload: TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind } = { workflowKind };
    if (projectId) payload.projectId = projectId;
    const state = await window.yibiao?.technicalPlan.loadState(payload);

    if (!isTechnicalPlanState(state || null)) {
      if (state) console.warn('技术方案项目状态包含未知步骤，已忽略本次读取', { workflowKind, projectId, step: state.step });
      return null;
    }

    return state || null;
  },
};
