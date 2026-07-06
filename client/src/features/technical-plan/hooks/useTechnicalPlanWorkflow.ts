import { useEffect, useState } from 'react';
import { technicalPlanStorage } from '../services/technicalPlanStorage';
import type { TechnicalPlanState, TechnicalPlanWorkflowKind } from '../types';

function createInitialState(workflowKind: TechnicalPlanWorkflowKind): TechnicalPlanState {
  return {
    workflowKind,
    step: 'document-analysis',
    tenderFile: null,
    originalPlanFile: null,
    projectOverview: '',
    techRequirements: '',
    bidAnalysisMode: 'key',
    bidAnalysisTasks: {},
    bidAnalysisProgress: 0,
    outlineMode: 'aligned',
    referenceKnowledgeDocumentIds: [],
    bidAnalysisTask: undefined,
    outlineGenerationTask: undefined,
    globalFactsTask: undefined,
    globalFacts: [],
    contentGenerationTask: undefined,
    contentGenerationSections: {},
    contentGenerationPlans: {},
    contentGenerationRuntime: undefined,
    outlineData: null,
  };
}

export function useTechnicalPlanWorkflow(workflowKind: TechnicalPlanWorkflowKind = 'technical-plan', projectId?: string) {
  const [state, setState] = useState<TechnicalPlanState>(() => createInitialState(workflowKind));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    setHydrated(false);

    const loadCache = async () => {
      try {
        const cachedState = await technicalPlanStorage.load(workflowKind, projectId);
        if (mounted && cachedState) {
          setState({ ...createInitialState(workflowKind), ...cachedState, workflowKind, projectId });
        } else if (mounted) {
          setState(createInitialState(workflowKind));
        }
      } catch (error) {
        console.warn('技术方案缓存读取失败', error);
        if (mounted) setState(createInitialState(workflowKind));
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    };

    loadCache();

    return () => {
      mounted = false;
    };
  }, [workflowKind, projectId]);

  return {
    hydrated,
    state,
    setState,
  };
}
