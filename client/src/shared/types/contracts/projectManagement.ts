export interface ProjectManagementProfile {
  projectName: string;
  clientName: string;
  vendorName: string;
  projectType: string;
  projectGroup: string;
  currentStage: string;
  startDate: string;
  endDate: string;
  contractAmount: string;
  paymentTerms: string;
  teamRoles: string;
  keyConstraints: string;
}

export interface ProjectManagementPlanningInput {
  background: string;
  objectives: string;
  scope: string;
  knownRisks: string;
  extraRequirements: string;
}

export interface ProjectManagementDiscoveryInput {
  interviewNotes: string;
  userRoles: string;
  businessProcesses: string;
  featureRequests: string;
  acceptanceNotes: string;
  extraRequirements: string;
}

export interface ProjectManagementExecutionInput {
  workstreams: string;
  milestones: string;
  resources: string;
  dependencies: string;
  blockers: string;
  cadence: string;
  extraRequirements: string;
}

export interface ProjectManagementRiskInput {
  riskSignals: string;
  currentIssues: string;
  stakeholderPressure: string;
  scheduleBudgetImpact: string;
  mitigationActions: string;
  escalationNeeds: string;
  extraRequirements: string;
}

export interface ProjectManagementStakeholderInput {
  stakeholders: string;
  conflicts: string;
  changeRequests: string;
  meetingNotes: string;
  communicationHistory: string;
  decisionsNeeded: string;
  extraRequirements: string;
}

export interface ProjectManagementDeliveryInput {
  testStatus: string;
  uatScope: string;
  releaseChecklist: string;
  acceptanceCriteria: string;
  trainingHandover: string;
  rollbackPlan: string;
  extraRequirements: string;
}

export interface ProjectManagementReportingInput {
  reportPeriod: string;
  audience: string;
  completedWork: string;
  progressMetrics: string;
  risksIssues: string;
  nextPlan: string;
  extraRequirements: string;
}

export interface ProjectManagementCommercialInput {
  contractTerms: string;
  paymentMilestones: string;
  acceptanceTriggers: string;
  invoiceCollectionStatus: string;
  blockers: string;
  renewalUpsellOpportunities: string;
  extraRequirements: string;
}

export interface ProjectManagementRetrospectiveInput {
  projectOutcome: string;
  goalsReview: string;
  keyEvents: string;
  problemsLessons: string;
  teamClientFeedback: string;
  reusableAssets: string;
  extraRequirements: string;
}

export interface ProjectManagementComplianceInput {
  systemScope: string;
  dataTypes: string;
  integrations: string;
  deploymentEnvironment: string;
  complianceStatus: string;
  securityRisks: string;
  extraRequirements: string;
}

export interface ProjectManagementTask {
  id: string;
  type: 'planning' | 'discovery' | 'execution' | 'risk' | 'stakeholder' | 'delivery' | 'reporting' | 'commercial' | 'retrospective' | 'compliance' | string;
  status: 'running' | 'success' | 'error';
  progress: number;
  message: string;
  started_at?: string;
  finished_at?: string;
}

export interface ProjectManagementState {
  projectId: string;
  created_at: string;
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
  latestPrompt: string;
  task?: ProjectManagementTask;
  updated_at: string;
}

export interface ProjectManagementProjectRecord {
  id: string;
  name: string;
  clientName: string;
  vendorName: string;
  projectType: string;
  projectGroup: string;
  currentStage: string;
  completedCount: number;
  created_at: string;
  updated_at: string;
  isActive: boolean;
  state: ProjectManagementState;
}

export interface ProjectManagementDictionaries {
  projectTypes: string[];
  projectGroups: string[];
}

export interface ProjectManagementProjectList {
  activeProjectId: string;
  projects: ProjectManagementProjectRecord[];
}
