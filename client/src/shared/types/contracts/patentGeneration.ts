export type PatentGenerationStage =
  | 'setup'
  | 'mining'
  | 'disclosure'
  | 'prior-art'
  | 'iteration';

export type PatentTypePreference = 'method' | 'system' | 'device' | 'unknown';

export interface PatentContactInfo {
  name: string;
  phone: string;
  email: string;
}

export interface PatentCaseInfo {
  caseName: string;
  topic: string;
  patentType: PatentTypePreference;
  contact: PatentContactInfo;
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
  score?: number;
  qualityWarnings?: string[];
}

export interface PatentTaskState {
  task_id: string;
  type: string;
  status: 'idle' | 'running' | 'success' | 'error';
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
