export type PatentGenerationStage =
  | 'setup'
  | 'mining'
  | 'disclosure'
  | 'prior-art'
  | 'iteration';

export type PatentApplicationType = 'invention' | 'utility-model' | 'design' | 'unknown';
export type PatentClaimForm = 'method' | 'system' | 'device' | 'storage-medium';

export interface PatentContactInfo {
  name: string;
  phone: string;
  email: string;
}

export interface PatentCaseInfo {
  caseName: string;
  topic: string;
  applicationType: PatentApplicationType;
  claimForms: PatentClaimForm[];
  contact: PatentContactInfo;
}

export interface PatentEvidence {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  excerpt: string;
  evidenceType: 'technical-problem' | 'technical-means' | 'implementation' | 'technical-effect';
  confidence: 'high' | 'medium' | 'low';
}

export interface PatentPointScores {
  technicality: number;
  noveltyPotential: number;
  inventivenessPotential: number;
  evidenceStrength: number;
  feasibility: number;
  protectionValue: number;
}

export interface PatentProjectInfo {
  path: string;
  name: string;
}

export interface PatentMaterial {
  id: string;
  name: string;
  kind: 'project' | 'document' | 'code' | 'note';
  file_path?: string;
  summary?: string;
  imported_at: string;
}

export interface PatentPoint {
  id: string;
  title: string;
  technicalBackground: string;
  innovation: string;
  difference: string;
  feasibility: string;
  recommendedClaims: string[];
  evidence: PatentEvidence[];
  assumptions: string[];
  missingFacts: string[];
  factSupplements?: Array<{
    fact: string;
    content: string;
    basis: string;
    confidence: 'high' | 'medium' | 'low';
    source: 'ai' | 'manual';
  }>;
  scores?: PatentPointScores;
  score?: number;
  qualityWarnings?: string[];
}

export interface PatentTaskState {
  task_id: string;
  type: string;
  status: 'idle' | 'running' | 'pausing' | 'paused' | 'stopping' | 'stopped' | 'success' | 'error';
  progress: number;
  message: string;
  logs: string[];
  started_at?: string;
  updated_at: string;
  error?: string;
}

export interface PatentDisclosureDraft {
  id: string;
  title: string;
  file_path: string;
  created_at: string;
  updated_at: string;
  qualityWarnings?: string[];
}

export interface PatentDisclosureDraftFile extends PatentDisclosureDraft {
  content: string;
}

export interface PatentRevisionLog {
  id: string;
  kind: 'merge' | 'correct';
  summary: string;
  artifact_paths: string[];
  created_at: string;
}

export interface PatentRevisionResult {
  state: PatentGenerationState;
  draft: PatentDisclosureDraftFile;
}

export interface PatentGenerationState {
  stage: PatentGenerationStage;
  caseId: string;
  caseInfo: PatentCaseInfo;
  project: PatentProjectInfo | null;
  materials: PatentMaterial[];
  scanSummary: string;
  miningResult: PatentPoint[];
  selectedPatentPointId: string;
  priorArtMarkdown: string;
  disclosureDrafts: PatentDisclosureDraft[];
  activeDraftId: string;
  revisionLogs: PatentRevisionLog[];
  task?: PatentTaskState;
  outputDir: string;
  updated_at: string;
}

export interface PatentGenerationSelectProjectResult {
  success: boolean;
  message?: string;
  state: PatentGenerationState;
}

export interface PatentWorkspaceProject {
  id: string;
  name: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  caseName: string;
  topic: string;
  applicationType: PatentApplicationType;
  stage: PatentGenerationStage;
  candidateCount: number;
  draftCount: number;
  selectedPatentTitle: string;
}

export interface PatentWorkspaceProjectList {
  activeProjectId: string;
  projects: PatentWorkspaceProject[];
}
