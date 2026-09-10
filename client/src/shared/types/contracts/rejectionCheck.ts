export type RejectionDocumentRole = 'tender' | 'bid';

export type RejectionDocumentSource = 'upload' | 'technical-plan';

export type RejectionCheckStep = 'documents' | 'items' | 'results';

export type RejectionResultTab = 'analysis' | 'custom';

export type RejectionCheckResultTab = 'rejection' | 'qualification' | 'scoring' | 'facts' | 'typo' | 'logic' | 'submission';

export type RejectionSubmissionCheckStatus = 'pending' | 'passed' | 'risk' | 'notApplicable';

export interface RejectionSubmissionCheckItem {
  id: string;
  category: string;
  label: string;
  status: RejectionSubmissionCheckStatus;
  note: string;
  updatedAt?: string;
}

export type RejectionExtractionStatus = 'idle' | 'running' | 'success' | 'error';

export type RejectionExtractionSource = 'ai' | 'technical-plan';

export type RejectionCheckRunStatus = 'idle' | 'running' | 'success' | 'error';

export type RejectionFindingType = 'invalidBid' | 'rejectionItem';

export type RejectionFindingSeverity = 'high' | 'medium' | 'low';
export type RejectionResolutionStatus = 'pending' | 'processing' | 'resolved' | 'accepted';

export interface RejectionResolutionState {
  status: RejectionResolutionStatus;
  note?: string;
  updatedAt?: string;
}

export type RejectionBackgroundTaskType = 'rejection-items-extraction' | 'rejection-check-run';

export type RejectionBackgroundTaskStatus = 'running' | 'success' | 'error';

export interface RejectionBackgroundTaskState {
  task_id: string;
  type: RejectionBackgroundTaskType;
  status: RejectionBackgroundTaskStatus;
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
}

export interface RejectionDocumentContent {
  role: RejectionDocumentRole;
  fileName: string;
  content: string;
  source: RejectionDocumentSource;
  parserLabel?: string;
  sourceProjectId?: string;
  sourceProjectName?: string;
  sourceWorkflowKind?: 'technical-plan' | 'existing-plan-expansion';
  importedAt: string;
}

export interface RejectionBidDocument extends RejectionDocumentContent {
  documentId: string;
}

export type RejectionComplianceStatus = 'met' | 'partial' | 'missing' | 'unclear';

export interface RejectionComplianceItem {
  id: string;
  requirement: string;
  response: string;
  evidence: string;
  status: RejectionComplianceStatus;
  risk?: string;
  sourceFile?: string;
}

export type RejectionScoringCoverageStatus = 'covered' | 'partial' | 'missing' | 'unclear';

export interface RejectionScoringMatrixItem {
  id: string;
  category: string;
  scoringItem: string;
  maxScore?: number;
  scoringRule: string;
  response: string;
  evidence: string;
  status: RejectionScoringCoverageStatus;
  estimatedScore?: number;
  gap: string;
  suggestion: string;
}


export type RejectionQualificationStatus = 'met' | 'partial' | 'missing' | 'manual';

export interface RejectionQualificationCheckItem {
  id: string;
  category: string;
  requirement: string;
  status: RejectionQualificationStatus;
  subject: string;
  certificate: string;
  validity: string;
  evidence: string;
  risk: string;
  suggestion: string;
}

export interface RejectionFactOccurrence { value: string; location: string; sourceFile?: string }
export interface RejectionFactConsistencyItem {
  id: string;
  category: string;
  label: string;
  status: 'consistent' | 'conflict' | 'unclear';
  canonicalValue: string;
  occurrences: RejectionFactOccurrence[];
  risk: string;
  suggestion: string;
}

export interface RejectionCheckWorkspaceState {
  tenderDocument: RejectionDocumentContent | null;
  bidDocument: RejectionDocumentContent | null;
  bidDocuments?: RejectionBidDocument[];
  activeDocumentTab: RejectionDocumentRole;
  step?: RejectionCheckStep;
  activeResultTab?: RejectionResultTab;
  activeCheckResultTab?: RejectionCheckResultTab;
  invalidBidAndRejectionItems?: RejectionExtractionState;
  customCheckItems?: string;
  checkOptions?: RejectionCheckOptions;
  rejectionCheckResult?: RejectionCheckResultState;
  typoCheckResult?: TypoCheckResultState;
  logicCheckResult?: LogicCheckResultState;
  submissionChecklist?: RejectionSubmissionCheckItem[];
  extractionTask?: RejectionBackgroundTaskState;
  checkTask?: RejectionBackgroundTaskState;
}

export interface RejectionCheckOptions {
  rejectionCheck: boolean;
  typoCheck: boolean;
  logicCheck: boolean;
}

export interface RejectionExtractionState {
  status: RejectionExtractionStatus;
  content: string;
  source?: RejectionExtractionSource;
  tenderSignature?: string;
  updatedAt?: string;
  error?: string;
}

export interface RejectionCheckFinding {
  id: string;
  type: RejectionFindingType;
  severity: RejectionFindingSeverity;
  title: string;
  summary: string;
  requirement: string;
  bidEvidence: string;
  riskReason: string;
  suggestion: string;
}

export interface RejectionCheckResultState {
  status: RejectionCheckRunStatus;
  findings: RejectionCheckFinding[];
  complianceMatrix?: RejectionComplianceItem[];
  scoringMatrix?: RejectionScoringMatrixItem[];
  qualificationChecks?: RejectionQualificationCheckItem[];
  factConsistencyChecks?: RejectionFactConsistencyItem[];
  resolutions?: Record<string, RejectionResolutionState>;
  inputSignature?: string;
  activeFindingId?: string;
  progressMessage?: string;
  updatedAt?: string;
  error?: string;
}

export interface TypoCheckFinding {
  id: string;
  wrongText: string;
  correctText: string;
  originalExcerpt: string;
  reason: string;
  locationHint?: string;
}

export interface TypoCheckResultState {
  status: RejectionCheckRunStatus;
  findings: TypoCheckFinding[];
  inputSignature?: string;
  activeFindingId?: string;
  progressMessage?: string;
  updatedAt?: string;
  error?: string;
}

export interface LogicCheckFinding {
  id: string;
  title: string;
  originalText: string;
  locationHint: string;
  fallacyReason: string;
  suggestion: string;
}

export interface LogicCheckResultState {
  status: RejectionCheckRunStatus;
  findings: LogicCheckFinding[];
  inputSignature?: string;
  activeFindingId?: string;
  progressMessage?: string;
  updatedAt?: string;
  error?: string;
}

export interface RejectionRiskItem {
  id: string;
  title: string;
  source: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RejectionCheckReport {
  passed: boolean;
  risks: RejectionRiskItem[];
}
