import { useReducer } from 'react';
import type {
  ProjectManagementCommercialInput,
  ProjectManagementComplianceInput,
  ProjectManagementDeliveryInput,
  ProjectManagementDiscoveryInput,
  ProjectManagementExecutionInput,
  ProjectManagementPlanningInput,
  ProjectManagementProfile,
  ProjectManagementReportingInput,
  ProjectManagementRetrospectiveInput,
  ProjectManagementRiskInput,
  ProjectManagementStakeholderInput,
  ProjectManagementState,
} from '../types';
import {
  defaultCommercialInput,
  defaultComplianceInput,
  defaultDeliveryInput,
  defaultDiscoveryInput,
  defaultExecutionInput,
  defaultPlanningInput,
  defaultProfile,
  defaultReportingInput,
  defaultRetrospectiveInput,
  defaultRiskInput,
  defaultStakeholderInput,
} from '../model/projectManagementPageModel';

type ModuleId = 'planning' | 'discovery' | 'execution' | 'risk' | 'stakeholder'
  | 'delivery' | 'reporting' | 'commercial' | 'retrospective' | 'compliance';
type ResultMode = 'edit' | 'preview';
type InputKey = 'planningInput' | 'discoveryInput' | 'executionInput' | 'riskInput'
  | 'stakeholderInput' | 'deliveryInput' | 'reportingInput' | 'commercialInput'
  | 'retrospectiveInput' | 'complianceInput';
type ResultKey = 'planningResult' | 'discoveryResult' | 'executionResult' | 'riskResult'
  | 'stakeholderResult' | 'deliveryResult' | 'reportingResult' | 'commercialResult'
  | 'retrospectiveResult' | 'complianceResult';

interface WorkspaceState {
  state: ProjectManagementState | null;
  profile: ProjectManagementProfile;
  planningInput: ProjectManagementPlanningInput;
  planningResult: string;
  discoveryInput: ProjectManagementDiscoveryInput;
  discoveryResult: string;
  executionInput: ProjectManagementExecutionInput;
  executionResult: string;
  riskInput: ProjectManagementRiskInput;
  riskResult: string;
  stakeholderInput: ProjectManagementStakeholderInput;
  stakeholderResult: string;
  deliveryInput: ProjectManagementDeliveryInput;
  deliveryResult: string;
  reportingInput: ProjectManagementReportingInput;
  reportingResult: string;
  commercialInput: ProjectManagementCommercialInput;
  commercialResult: string;
  retrospectiveInput: ProjectManagementRetrospectiveInput;
  retrospectiveResult: string;
  complianceInput: ProjectManagementComplianceInput;
  complianceResult: string;
  resultModes: Record<ModuleId, ResultMode>;
}

type WorkspaceAction =
  | { type: 'apply'; state: ProjectManagementState }
  | { type: 'update-profile'; key: keyof ProjectManagementProfile; value: string }
  | { type: 'update-input'; inputKey: InputKey; fieldKey: string; value: string }
  | { type: 'set-result'; resultKey: ResultKey; value: string }
  | { type: 'toggle-result-mode'; moduleId: ModuleId }
  | { type: 'show-result-editor'; moduleId: ModuleId };

const initialResultModes: Record<ModuleId, ResultMode> = {
  planning: 'edit',
  discovery: 'edit',
  execution: 'edit',
  risk: 'edit',
  stakeholder: 'edit',
  delivery: 'edit',
  reporting: 'edit',
  commercial: 'edit',
  retrospective: 'edit',
  compliance: 'edit',
};

const initialWorkspaceState: WorkspaceState = {
  state: null,
  profile: defaultProfile,
  planningInput: defaultPlanningInput,
  planningResult: '',
  discoveryInput: defaultDiscoveryInput,
  discoveryResult: '',
  executionInput: defaultExecutionInput,
  executionResult: '',
  riskInput: defaultRiskInput,
  riskResult: '',
  stakeholderInput: defaultStakeholderInput,
  stakeholderResult: '',
  deliveryInput: defaultDeliveryInput,
  deliveryResult: '',
  reportingInput: defaultReportingInput,
  reportingResult: '',
  commercialInput: defaultCommercialInput,
  commercialResult: '',
  retrospectiveInput: defaultRetrospectiveInput,
  retrospectiveResult: '',
  complianceInput: defaultComplianceInput,
  complianceResult: '',
  resultModes: initialResultModes,
};

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'apply':
      return {
        ...state,
        state: action.state,
        profile: action.state.profile || defaultProfile,
        planningInput: action.state.planningInput || defaultPlanningInput,
        planningResult: action.state.planningResult || '',
        discoveryInput: action.state.discoveryInput || defaultDiscoveryInput,
        discoveryResult: action.state.discoveryResult || '',
        executionInput: action.state.executionInput || defaultExecutionInput,
        executionResult: action.state.executionResult || '',
        riskInput: action.state.riskInput || defaultRiskInput,
        riskResult: action.state.riskResult || '',
        stakeholderInput: action.state.stakeholderInput || defaultStakeholderInput,
        stakeholderResult: action.state.stakeholderResult || '',
        deliveryInput: action.state.deliveryInput || defaultDeliveryInput,
        deliveryResult: action.state.deliveryResult || '',
        reportingInput: action.state.reportingInput || defaultReportingInput,
        reportingResult: action.state.reportingResult || '',
        commercialInput: action.state.commercialInput || defaultCommercialInput,
        commercialResult: action.state.commercialResult || '',
        retrospectiveInput: action.state.retrospectiveInput || defaultRetrospectiveInput,
        retrospectiveResult: action.state.retrospectiveResult || '',
        complianceInput: action.state.complianceInput || defaultComplianceInput,
        complianceResult: action.state.complianceResult || '',
      };
    case 'update-profile':
      return { ...state, profile: { ...state.profile, [action.key]: action.value } };
    case 'update-input':
      return {
        ...state,
        [action.inputKey]: {
          ...(state[action.inputKey] as unknown as Record<string, string>),
          [action.fieldKey]: action.value,
        },
      } as WorkspaceState;
    case 'set-result':
      return { ...state, [action.resultKey]: action.value };
    case 'toggle-result-mode':
      return {
        ...state,
        resultModes: {
          ...state.resultModes,
          [action.moduleId]: state.resultModes[action.moduleId] === 'edit' ? 'preview' : 'edit',
        },
      };
    case 'show-result-editor':
      return {
        ...state,
        resultModes: { ...state.resultModes, [action.moduleId]: 'edit' },
      };
  }
}

export function useProjectManagementWorkspaceState() {
  const [workspace, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);

  return {
    ...workspace,
    applyState: (state: ProjectManagementState) => dispatch({ type: 'apply', state }),
    updateProfileField: (key: keyof ProjectManagementProfile, value: string) => dispatch({ type: 'update-profile', key, value }),
    updatePlanningInputField: (key: keyof ProjectManagementPlanningInput, value: string) => dispatch({ type: 'update-input', inputKey: 'planningInput', fieldKey: key, value }),
    updateDiscoveryInputField: (key: keyof ProjectManagementDiscoveryInput, value: string) => dispatch({ type: 'update-input', inputKey: 'discoveryInput', fieldKey: key, value }),
    updateExecutionInputField: (key: keyof ProjectManagementExecutionInput, value: string) => dispatch({ type: 'update-input', inputKey: 'executionInput', fieldKey: key, value }),
    updateRiskInputField: (key: keyof ProjectManagementRiskInput, value: string) => dispatch({ type: 'update-input', inputKey: 'riskInput', fieldKey: key, value }),
    updateStakeholderInputField: (key: keyof ProjectManagementStakeholderInput, value: string) => dispatch({ type: 'update-input', inputKey: 'stakeholderInput', fieldKey: key, value }),
    updateDeliveryInputField: (key: keyof ProjectManagementDeliveryInput, value: string) => dispatch({ type: 'update-input', inputKey: 'deliveryInput', fieldKey: key, value }),
    updateReportingInputField: (key: keyof ProjectManagementReportingInput, value: string) => dispatch({ type: 'update-input', inputKey: 'reportingInput', fieldKey: key, value }),
    updateCommercialInputField: (key: keyof ProjectManagementCommercialInput, value: string) => dispatch({ type: 'update-input', inputKey: 'commercialInput', fieldKey: key, value }),
    updateRetrospectiveInputField: (key: keyof ProjectManagementRetrospectiveInput, value: string) => dispatch({ type: 'update-input', inputKey: 'retrospectiveInput', fieldKey: key, value }),
    updateComplianceInputField: (key: keyof ProjectManagementComplianceInput, value: string) => dispatch({ type: 'update-input', inputKey: 'complianceInput', fieldKey: key, value }),
    setPlanningResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'planningResult', value }),
    setDiscoveryResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'discoveryResult', value }),
    setExecutionResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'executionResult', value }),
    setRiskResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'riskResult', value }),
    setStakeholderResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'stakeholderResult', value }),
    setDeliveryResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'deliveryResult', value }),
    setReportingResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'reportingResult', value }),
    setCommercialResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'commercialResult', value }),
    setRetrospectiveResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'retrospectiveResult', value }),
    setComplianceResult: (value: string) => dispatch({ type: 'set-result', resultKey: 'complianceResult', value }),
    toggleResultMode: (moduleId: ModuleId) => dispatch({ type: 'toggle-result-mode', moduleId }),
    showResultEditor: (moduleId: ModuleId) => dispatch({ type: 'show-result-editor', moduleId }),
  };
}
