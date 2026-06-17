import type { TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../types';

const validSteps: TechnicalPlanStep[] = [
  'document-analysis',
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
  async load(workflowKind?: TechnicalPlanWorkflowKind): Promise<TechnicalPlanState | null> {
    const state = await window.yibiao?.technicalPlan.loadState(workflowKind);

    if (!isTechnicalPlanState(state || null)) {
      return null;
    }

    return state || null;
  },
};
