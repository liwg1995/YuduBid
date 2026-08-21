import type { OutlineData } from '../outline';

export type FeasibilityReportStep = 'materials' | 'sources' | 'analysis' | 'outline' | 'parameters' | 'content';
export type FeasibilityProjectType = 'government' | 'enterprise';
export type FeasibilityOutlineTemplate = 'government' | 'enterprise' | 'industrial' | 'hi_tech' | 'infrastructure' | 'eco_environmental' | 'commercial_realestate';
export type FeasibilityTaskStatus = 'running' | 'pausing' | 'stopping' | 'stopped' | 'paused' | 'success' | 'error';
export type FeasibilityContentSectionStatus = 'idle' | 'running' | 'success' | 'error';

export interface FeasibilityContentGenerationOptions {
  useAiImages: boolean;
  maxAiImages: number;
  useMermaidImages: boolean;
  useTechnicalDiagrams: boolean;
}

export interface FeasibilityProjectInfo {
  projectName: string;
  projectType: FeasibilityProjectType;
  industry: string;
  constructionUnit: string;
  location: string;
  constructionContent: string;
  constructionPeriodYears: string;
  operationPeriodYears: string;
  totalInvestment: string;
  fundingSource: string;
}

export interface FeasibilityProjectRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  isActive?: boolean;
  step?: FeasibilityReportStep;
  contentCompleted?: number;
  contentTotal?: number;
}

export interface FeasibilityProjectList {
  activeProjectId?: string;
  projects: FeasibilityProjectRecord[];
}

export interface FeasibilityProjectPayload {
  projectId: string;
  project_id?: string;
}

export interface FeasibilitySourceFile {
  id: string;
  fileName: string;
  markdownPath: string;
  markdownChars: number;
  contentHash: string;
  parserLabel: string | null;
  importedAt: string;
}

export interface FeasibilityBackgroundTaskState {
  task_id: string;
  type: string;
  project_id?: string;
  status: FeasibilityTaskStatus;
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  pause_requested?: boolean;
  stats?: unknown;
}

export interface FeasibilityContentSectionState {
  nodeId: string;
  status: FeasibilityContentSectionStatus;
  error?: string;
  updatedAt: string;
}

export interface FeasibilityReportState {
  projectId: string;
  projectName: string;
  step: FeasibilityReportStep;
  projectInfo: FeasibilityProjectInfo;
  sourceFiles: FeasibilitySourceFile[];
  analysisMarkdown: string;
  outlineTemplate: FeasibilityOutlineTemplate;
  targetWords: number;
  referenceDocumentIds: string[];
  keyParametersMarkdown: string;
  contentGenerationOptions: FeasibilityContentGenerationOptions;
  outlineData: OutlineData | null;
  contentSections: Record<string, FeasibilityContentSectionState>;
  analysisTask?: FeasibilityBackgroundTaskState;
  outlineTask?: FeasibilityBackgroundTaskState;
  outlineAdjustmentTask?: FeasibilityBackgroundTaskState;
  parametersTask?: FeasibilityBackgroundTaskState;
  contentTask?: FeasibilityBackgroundTaskState;
  humanWritingTask?: FeasibilityBackgroundTaskState;
}

export interface FeasibilityTaskEvent {
  task: FeasibilityBackgroundTaskState;
  feasibilityReport: FeasibilityReportState;
}
