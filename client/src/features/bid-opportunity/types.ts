export type OpportunityStatus = 'new' | 'review' | 'following' | 'won' | 'abandoned' | 'archived';
export type OpportunityWorkflowStage = 'discovery' | 'screening' | 'qualification' | 'decision' | 'bidding' | 'closed';
export type OpportunityDecisionOutcome = 'undecided' | 'bid' | 'no_bid';

export interface OpportunityMonitor {
  monitorId: string;
  name: string;
  enabled: boolean;
  industry: string;
  regions: string[];
  noticeTypes: string[];
  requiredKeywords: string[];
  optionalKeywords: string[];
  excludedKeywords: string[];
  buyerKeywords: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityEvent {
  eventId: string;
  eventType: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface OpportunityMonitorMatch {
  monitorId: string;
  monitorName: string;
  matchedKeywords: string[];
  matchScore: number;
  reasons: string[];
}

export interface OpportunityProjectTimelineItem {
  opportunityId: string;
  title: string;
  noticeType: string;
  announcementStage: string;
  sourceName: string;
  sourceUrl: string;
  publishDate: string;
  budget: number | null;
  awardSupplier: string;
  awardAmount: number | null;
  terminationReason: string;
  isCurrent: boolean;
  changeSummary: string;
}

export interface OpportunityRelationCandidate {
  clusterId: string; title: string; buyer: string; projectCode: string; noticeCount: number; latestDate: string; confidence: number; reason: string;
}

export interface BidOpportunity {
  opportunityId: string;
  title: string;
  noticeType: string;
  sourceName: string;
  sourceUrl: string;
  projectCode: string;
  buyer: string;
  region: string;
  industry: string;
  publishDate: string;
  bidDeadline: string;
  expectedPurchaseDate: string;
  awardSupplier: string;
  awardAmount: number | null;
  terminationReason: string;
  changeSummary: string;
  workflowStage: OpportunityWorkflowStage;
  decisionOutcome: OpportunityDecisionOutcome;
  decisionReason: string;
  decisionDueAt: string;
  nextAction: string;
  nextActionDueAt: string;
  tenderFile: { fileName: string; markdownPath: string; contentHash: string; parserLabel: string; importedAt: string } | null;
  technicalPlanProjectId: string;
  budget: number | null;
  summary: string;
  content: string;
  sourceKind: string;
  projectClusterId: string;
  announcementStage: string;
  clusterConfidence: number | null;
  clusterMethod: string;
  ruleScore: number;
  informationScore: number;
  qualificationStatus: string;
  valueScore: number;
  feasibilityScore: number;
  recommendation: string;
  matchedKeywords: string[];
  riskFlags: string[];
  status: OpportunityStatus;
  owner: string;
  notes: string;
  presalesProjectId: string;
  deepAnalysis: OpportunityDeepAnalysis | null;
  analysisTask: OpportunityAnalysisTask | null;
  analysisSignature: string;
  analyzedAt: string;
  createdAt: string;
  updatedAt: string;
  events?: OpportunityEvent[];
  monitorMatches?: OpportunityMonitorMatch[];
  projectTimeline?: OpportunityProjectTimelineItem[];
  relationCandidates?: OpportunityRelationCandidate[];
}

export interface OpportunitySource {
  sourceId: string;
  name: string;
  adapterType: string;
  baseUrl: string;
  enabled: boolean;
  config: { maxItems?: number };
  healthStatus: 'untested' | 'healthy' | 'warning' | 'error';
  lastRunAt: string;
  lastSuccessAt: string;
  lastError: string;
  lastResult: OpportunityScanRun | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityScanRun {
  runId: string;
  sourceId: string;
  status: 'running' | 'success' | 'error';
  progress: number;
  message: string;
  fetchedCount: number;
  matchedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
}

export interface OpportunityScanBatch {
  status: 'idle' | 'running'; startedAt: string; total: number; completed: number; running: number; createdCount: number; updatedCount: number;
}

export interface OpportunityOperatingMetrics {
  activeCount: number;
  pipelineBudget: number;
  tasks: { overdue: number; today: number; upcoming: number; items: Array<{ opportunityId: string; opportunityTitle: string; owner: string; type: string; title: string; dueAt: string }> };
  deadlines: { overdue: number; urgent: number };
  funnel: Array<{ stage: OpportunityWorkflowStage; count: number }>;
  decisions: { undecided: number; bid: number; noBid: number; won: number };
  owners: Array<{ owner: string; total: number; following: number; overdue: number }>;
}

export interface OpportunityEnterpriseProfile {
  companyName: string;
  industries: string[];
  serviceRegions: string[];
  capabilities: string[];
  qualifications: string[];
  personnel: string[];
  performances: string[];
  advantages: string;
  limitations: string;
  updatedAt: string;
}

export interface OpportunityEvidence { quote: string; source: string; verified: boolean }
export interface OpportunityRequirement {
  category: string; requirement: string; matchStatus: 'met' | 'partial' | 'unmet' | 'unknown'; profileEvidence: string; evidence: OpportunityEvidence;
}
export interface OpportunityDeepAnalysis {
  conclusion: 'recommend' | 'conditional' | 'not_recommend';
  conclusionReason: string;
  projectSummary: string;
  qualificationStatus: 'met' | 'partial' | 'unmet' | 'unknown';
  valueScore: number;
  feasibilityScore: number;
  requirements: OpportunityRequirement[];
  strengths: string[];
  risks: Array<{ title: string; detail: string; evidence: OpportunityEvidence }>;
  pendingConfirmations: string[];
  recommendedActions: string[];
  signature?: string;
}
export interface OpportunityAnalysisTask {
  taskId: string; status: 'running' | 'success' | 'error'; progress: number; message: string; error?: string; startedAt: string; updatedAt: string; finishedAt?: string;
}

export interface OpportunitySnapshot {
  opportunities: BidOpportunity[];
  monitors: OpportunityMonitor[];
  enterpriseProfile: OpportunityEnterpriseProfile;
  sources: OpportunitySource[];
  scans: Record<string, OpportunityScanRun>;
  scanBatch: OpportunityScanBatch;
  diagnostics: { interruptedAnalyses: number; interruptedScans: number; errorSources: number; warningSources: number; untestedSources: number; failedNotices: number; issues: Array<{ issueId: string; kind: 'source' | 'analysis'; severity: 'error' | 'warning'; sourceId: string; opportunityId: string; objectName: string; title: string; detail: string; affectedCount: number; occurredAt: string }> };
  backup: { latestId: string; createdAt: string; verified: boolean; verifiedAt?: string; message: string };
  inboxCounts: { new: number; changes: number; due: number; tasks: number; relation: number };
  operatingMetrics: OpportunityOperatingMetrics;
  counts: { total: number; new: number; review: number; following: number; abandoned: number };
}

export interface OpportunityDraft {
  opportunityId?: string;
  title: string;
  noticeType: string;
  sourceName: string;
  sourceUrl: string;
  projectCode: string;
  buyer: string;
  region: string;
  industry: string;
  publishDate: string;
  bidDeadline: string;
  budget: string;
  summary: string;
  content: string;
  owner: string;
  notes: string;
  status?: OpportunityStatus;
  sourceKind?: string;
}

export interface OpportunityMonitorDraft {
  monitorId?: string;
  name: string;
  enabled: boolean;
  industry: string;
  regions: string;
  noticeTypes: string[];
  requiredKeywords: string;
  optionalKeywords: string;
  excludedKeywords: string;
  buyerKeywords: string;
  budgetMin: string;
  budgetMax: string;
}
