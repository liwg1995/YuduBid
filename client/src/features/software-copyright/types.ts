export type SoftwareCopyrightStep = 'setup' | 'generating' | 'draft' | 'exporting' | 'result';

export interface SoftwareCopyrightProject {
  name: string;
  path: string;
}

export interface SoftwareCopyrightAnalysisFile {
  path: string;
  extension: string;
  size: number;
  line_count: number;
  category: string;
}

export interface SoftwareCopyrightAnalysis {
  projectRoot: string;
  projectName: string;
  packageName: string;
  packageVersion: string;
  scripts: Record<string, string>;
  frameworks: string[];
  languages: string[];
  fileCount: number;
  lineCount: number;
  candidates: SoftwareCopyrightAnalysisFile[];
  readmeExcerpt: string;
}

export interface SoftwareCopyrightFields {
  softwareName: string;
  shortName: string;
  version: string;
  category: string;
  developmentCompletedDate: string;
  developmentMode: string;
  softwareDescription: string;
  publishStatus: string;
  firstPublishDate: string;
  copyrightOwner: string;
  rightsScope: string;
  rightsAcquisition: string;
  developmentHardware: string;
  runningHardware: string;
  developmentOs: string;
  developmentTools: string;
  runningPlatform: string;
  runtimeSupport: string;
  programmingLanguage: string;
  sourceLineCount: string;
  developmentPurpose: string;
  industry: string;
  mainFunctions: string;
  technicalFeatures: string;
  pageCount: string;
}

export interface SoftwareCopyrightOptions {
  sourceMode: 'project' | 'code-generation';
  screenshotMode: 'skip' | 'manual' | 'ai';
  useAiImages: boolean;
  codeExcludedPaths: string[];
  codeIncludedPaths: string[];
  exportItems: {
    application: boolean;
    manual: boolean;
    code: boolean;
    report: boolean;
  };
}

export interface SoftwareCopyrightTask {
  task_id: string;
  type: string;
  status: 'running' | 'success' | 'error';
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  recovery?: {
    title: string;
    message: string;
    actions: string[];
  };
}

export interface SoftwareCopyrightOutput {
  name: string;
  path: string;
}

export interface SoftwareCopyrightDraftFile {
  key: string;
  name: string;
  path: string;
  content: string;
  updatedAt: string;
}

export interface SoftwareCopyrightDraftSaveResult extends SoftwareCopyrightDraftFile {
  state: SoftwareCopyrightState;
}

export interface SoftwareCopyrightDraftValidationIssue {
  type: 'field' | 'draft' | 'code';
  severity: 'error' | 'warning';
  key?: string;
  message: string;
}

export interface SoftwareCopyrightDraftValidationResult {
  valid: boolean;
  issues: SoftwareCopyrightDraftValidationIssue[];
  checkedAt: string;
}

export interface SoftwareCopyrightCodeManifestFile {
  path: string;
  category: string;
  selection_score?: number;
  source_line_count: number;
  material_line_start: number;
  material_line_end: number;
}

export interface SoftwareCopyrightCodeManifest {
  software_name: string;
  version: string;
  project_root: string;
  lines_per_page: number;
  total_pages: number;
  mode: 'front30_back30' | 'all_under_60_pages' | string;
  material_line_count: number;
  selection_strategy?: string;
  excluded_paths?: string[];
  included_paths?: string[];
  category_summary?: Record<string, number>;
  files: SoftwareCopyrightCodeManifestFile[];
}

export interface SoftwareCopyrightState {
  step: SoftwareCopyrightStep;
  project: SoftwareCopyrightProject | null;
  analysis: SoftwareCopyrightAnalysis | null;
  fields: SoftwareCopyrightFields;
  options: SoftwareCopyrightOptions;
  imageModel: {
    available: boolean;
    status: string;
    message: string;
  };
  codeGeneration?: {
    available: boolean;
    project: { name: string; path: string } | null;
    confirmedAt: string;
    summary: {
      selectedCount: number;
      selectedLineCount: number;
      estimatedPages: number;
    } | null;
  };
  task?: SoftwareCopyrightTask;
  drafts: Record<string, string>;
  draftConfirmed: boolean;
  draftConfirmedAt?: string;
  draftDir?: string;
  outputRoot?: string;
  outputs: SoftwareCopyrightOutput[];
  outputDir?: string;
  updated_at: string;
}

export interface SoftwareCopyrightSelectResult {
  success: boolean;
  message?: string;
  state: SoftwareCopyrightState;
}
