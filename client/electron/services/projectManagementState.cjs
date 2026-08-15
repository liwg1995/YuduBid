const initialProfile = {
  projectName: '',
  clientName: '',
  vendorName: '',
  projectType: 'IT服务项目',
  projectGroup: '',
  currentStage: '项目启动',
  startDate: '',
  endDate: '',
  contractAmount: '',
  paymentTerms: '',
  teamRoles: '',
  keyConstraints: '',
};

const initialPlanningInput = {
  background: '',
  objectives: '',
  scope: '',
  knownRisks: '',
  extraRequirements: '',
};

const initialDiscoveryInput = {
  interviewNotes: '',
  userRoles: '',
  businessProcesses: '',
  featureRequests: '',
  acceptanceNotes: '',
  extraRequirements: '',
};

const initialExecutionInput = {
  workstreams: '',
  milestones: '',
  resources: '',
  dependencies: '',
  blockers: '',
  cadence: '',
  extraRequirements: '',
};

const initialRiskInput = {
  riskSignals: '',
  currentIssues: '',
  stakeholderPressure: '',
  scheduleBudgetImpact: '',
  mitigationActions: '',
  escalationNeeds: '',
  extraRequirements: '',
};

const initialStakeholderInput = {
  stakeholders: '',
  conflicts: '',
  changeRequests: '',
  meetingNotes: '',
  communicationHistory: '',
  decisionsNeeded: '',
  extraRequirements: '',
};

const initialDeliveryInput = {
  testStatus: '',
  uatScope: '',
  releaseChecklist: '',
  acceptanceCriteria: '',
  trainingHandover: '',
  rollbackPlan: '',
  extraRequirements: '',
};

const initialReportingInput = {
  reportPeriod: '',
  audience: '',
  completedWork: '',
  progressMetrics: '',
  risksIssues: '',
  nextPlan: '',
  extraRequirements: '',
};

const initialCommercialInput = {
  contractTerms: '',
  paymentMilestones: '',
  acceptanceTriggers: '',
  invoiceCollectionStatus: '',
  blockers: '',
  renewalUpsellOpportunities: '',
  extraRequirements: '',
};

const initialRetrospectiveInput = {
  projectOutcome: '',
  goalsReview: '',
  keyEvents: '',
  problemsLessons: '',
  teamClientFeedback: '',
  reusableAssets: '',
  extraRequirements: '',
};

const initialComplianceInput = {
  systemScope: '',
  dataTypes: '',
  integrations: '',
  deploymentEnvironment: '',
  complianceStatus: '',
  securityRisks: '',
  extraRequirements: '',
};

const initialState = {
  projectId: '',
  created_at: '',
  profile: initialProfile,
  planningInput: initialPlanningInput,
  planningResult: '',
  discoveryInput: initialDiscoveryInput,
  discoveryResult: '',
  executionInput: initialExecutionInput,
  executionResult: '',
  riskInput: initialRiskInput,
  riskResult: '',
  stakeholderInput: initialStakeholderInput,
  stakeholderResult: '',
  deliveryInput: initialDeliveryInput,
  deliveryResult: '',
  reportingInput: initialReportingInput,
  reportingResult: '',
  commercialInput: initialCommercialInput,
  commercialResult: '',
  retrospectiveInput: initialRetrospectiveInput,
  retrospectiveResult: '',
  complianceInput: initialComplianceInput,
  complianceResult: '',
  latestPrompt: '',
  task: undefined,
  updated_at: '',
};

const maxInputChars = 20000;

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value, maxLength = maxInputChars) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeProfile(profile = {}) {
  const merged = { ...initialProfile, ...profile };
  return {
    projectName: normalizeString(merged.projectName, 160),
    clientName: normalizeString(merged.clientName, 160),
    vendorName: normalizeString(merged.vendorName, 160),
    projectType: normalizeString(merged.projectType, 80) || initialProfile.projectType,
    projectGroup: normalizeString(merged.projectGroup, 80),
    currentStage: normalizeString(merged.currentStage, 80) || initialProfile.currentStage,
    startDate: normalizeString(merged.startDate, 40),
    endDate: normalizeString(merged.endDate, 40),
    contractAmount: normalizeString(merged.contractAmount, 120),
    paymentTerms: normalizeString(merged.paymentTerms, 3000),
    teamRoles: normalizeString(merged.teamRoles, 5000),
    keyConstraints: normalizeString(merged.keyConstraints, 5000),
  };
}

function normalizePlanningInput(input = {}) {
  const merged = { ...initialPlanningInput, ...input };
  return {
    background: normalizeString(merged.background),
    objectives: normalizeString(merged.objectives),
    scope: normalizeString(merged.scope),
    knownRisks: normalizeString(merged.knownRisks),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeDiscoveryInput(input = {}) {
  const merged = { ...initialDiscoveryInput, ...input };
  return {
    interviewNotes: normalizeString(merged.interviewNotes),
    userRoles: normalizeString(merged.userRoles),
    businessProcesses: normalizeString(merged.businessProcesses),
    featureRequests: normalizeString(merged.featureRequests),
    acceptanceNotes: normalizeString(merged.acceptanceNotes),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeExecutionInput(input = {}) {
  const merged = { ...initialExecutionInput, ...input };
  return {
    workstreams: normalizeString(merged.workstreams),
    milestones: normalizeString(merged.milestones),
    resources: normalizeString(merged.resources),
    dependencies: normalizeString(merged.dependencies),
    blockers: normalizeString(merged.blockers),
    cadence: normalizeString(merged.cadence),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeRiskInput(input = {}) {
  const merged = { ...initialRiskInput, ...input };
  return {
    riskSignals: normalizeString(merged.riskSignals),
    currentIssues: normalizeString(merged.currentIssues),
    stakeholderPressure: normalizeString(merged.stakeholderPressure),
    scheduleBudgetImpact: normalizeString(merged.scheduleBudgetImpact),
    mitigationActions: normalizeString(merged.mitigationActions),
    escalationNeeds: normalizeString(merged.escalationNeeds),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeStakeholderInput(input = {}) {
  const merged = { ...initialStakeholderInput, ...input };
  return {
    stakeholders: normalizeString(merged.stakeholders),
    conflicts: normalizeString(merged.conflicts),
    changeRequests: normalizeString(merged.changeRequests),
    meetingNotes: normalizeString(merged.meetingNotes),
    communicationHistory: normalizeString(merged.communicationHistory),
    decisionsNeeded: normalizeString(merged.decisionsNeeded),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeDeliveryInput(input = {}) {
  const merged = { ...initialDeliveryInput, ...input };
  return {
    testStatus: normalizeString(merged.testStatus),
    uatScope: normalizeString(merged.uatScope),
    releaseChecklist: normalizeString(merged.releaseChecklist),
    acceptanceCriteria: normalizeString(merged.acceptanceCriteria),
    trainingHandover: normalizeString(merged.trainingHandover),
    rollbackPlan: normalizeString(merged.rollbackPlan),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeReportingInput(input = {}) {
  const merged = { ...initialReportingInput, ...input };
  return {
    reportPeriod: normalizeString(merged.reportPeriod),
    audience: normalizeString(merged.audience),
    completedWork: normalizeString(merged.completedWork),
    progressMetrics: normalizeString(merged.progressMetrics),
    risksIssues: normalizeString(merged.risksIssues),
    nextPlan: normalizeString(merged.nextPlan),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeCommercialInput(input = {}) {
  const merged = { ...initialCommercialInput, ...input };
  return {
    contractTerms: normalizeString(merged.contractTerms),
    paymentMilestones: normalizeString(merged.paymentMilestones),
    acceptanceTriggers: normalizeString(merged.acceptanceTriggers),
    invoiceCollectionStatus: normalizeString(merged.invoiceCollectionStatus),
    blockers: normalizeString(merged.blockers),
    renewalUpsellOpportunities: normalizeString(merged.renewalUpsellOpportunities),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeRetrospectiveInput(input = {}) {
  const merged = { ...initialRetrospectiveInput, ...input };
  return {
    projectOutcome: normalizeString(merged.projectOutcome),
    goalsReview: normalizeString(merged.goalsReview),
    keyEvents: normalizeString(merged.keyEvents),
    problemsLessons: normalizeString(merged.problemsLessons),
    teamClientFeedback: normalizeString(merged.teamClientFeedback),
    reusableAssets: normalizeString(merged.reusableAssets),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeComplianceInput(input = {}) {
  const merged = { ...initialComplianceInput, ...input };
  return {
    systemScope: normalizeString(merged.systemScope),
    dataTypes: normalizeString(merged.dataTypes),
    integrations: normalizeString(merged.integrations),
    deploymentEnvironment: normalizeString(merged.deploymentEnvironment),
    complianceStatus: normalizeString(merged.complianceStatus),
    securityRisks: normalizeString(merged.securityRisks),
    extraRequirements: normalizeString(merged.extraRequirements),
  };
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return undefined;
  const status = ['running', 'success', 'error'].includes(task.status) ? task.status : 'running';
  return {
    id: normalizeString(task.id, 120) || `project-management-${Date.now()}`,
    type: normalizeString(task.type, 80) || 'planning',
    status,
    progress: Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0))),
    message: normalizeString(task.message, 300),
    started_at: normalizeString(task.started_at, 80),
    finished_at: normalizeString(task.finished_at, 80),
  };
}

function recoverInterruptedTask(state) {
  if (state?.task?.status !== 'running') return state;
  return {
    ...state,
    task: {
      ...state.task,
      status: 'error',
      progress: 100,
      message: '上次任务未完成，请重新执行。',
      finished_at: now(),
    },
  };
}

function normalizeState(state = {}) {
  return {
    projectId: normalizeString(state.projectId, 120),
    created_at: normalizeString(state.created_at, 80) || now(),
    profile: normalizeProfile(state.profile),
    planningInput: normalizePlanningInput(state.planningInput),
    planningResult: String(state.planningResult || ''),
    discoveryInput: normalizeDiscoveryInput(state.discoveryInput),
    discoveryResult: String(state.discoveryResult || ''),
    executionInput: normalizeExecutionInput(state.executionInput),
    executionResult: String(state.executionResult || ''),
    riskInput: normalizeRiskInput(state.riskInput),
    riskResult: String(state.riskResult || ''),
    stakeholderInput: normalizeStakeholderInput(state.stakeholderInput),
    stakeholderResult: String(state.stakeholderResult || ''),
    deliveryInput: normalizeDeliveryInput(state.deliveryInput),
    deliveryResult: String(state.deliveryResult || ''),
    reportingInput: normalizeReportingInput(state.reportingInput),
    reportingResult: String(state.reportingResult || ''),
    commercialInput: normalizeCommercialInput(state.commercialInput),
    commercialResult: String(state.commercialResult || ''),
    retrospectiveInput: normalizeRetrospectiveInput(state.retrospectiveInput),
    retrospectiveResult: String(state.retrospectiveResult || ''),
    complianceInput: normalizeComplianceInput(state.complianceInput),
    complianceResult: String(state.complianceResult || ''),
    latestPrompt: String(state.latestPrompt || ''),
    task: normalizeTask(state.task),
    updated_at: normalizeString(state.updated_at, 80) || now(),
  };
}


module.exports = {
  clone,
  initialState,
  normalizeCommercialInput,
  normalizeComplianceInput,
  normalizeDeliveryInput,
  normalizeDiscoveryInput,
  normalizeExecutionInput,
  normalizePlanningInput,
  normalizeProfile,
  normalizeReportingInput,
  normalizeRetrospectiveInput,
  normalizeRiskInput,
  normalizeStakeholderInput,
  normalizeState,
  normalizeString,
  normalizeTask,
  now,
  recoverInterruptedTask,
};
