export type SoftwareCopyrightStep = 'setup' | 'generating' | 'draft' | 'exporting' | 'result';

export interface SoftwareCopyrightCase {
  id: string;
  name: string;
  softwareName: string;
  version: string;
  projectPath: string;
  step: SoftwareCopyrightStep;
  draftConfirmed: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SoftwareCopyrightCaseList {
  activeCaseId: string;
  cases: SoftwareCopyrightCase[];
}

export interface SoftwareCopyrightCaseMutationResult {
  state: SoftwareCopyrightState;
  cases: SoftwareCopyrightCaseList;
}

export interface SoftwareCopyrightHashedFile {
  name: string;
  path: string;
  size: number;
  sha256: string;
}

export interface SoftwareCopyrightConfirmedSnapshot {
  id: string;
  path: string;
  stateFile: string;
  createdAt: string;
  fileCount: number;
  contentHash: string;
  files: Array<Omit<SoftwareCopyrightHashedFile, 'path'> & { relativePath: string }>;
}

export interface SoftwareCopyrightExportBatch {
  id: string;
  softwareName: string;
  version: string;
  snapshotId: string;
  confirmedAt: string;
  exportedAt: string;
  exportItems: SoftwareCopyrightOptions['exportItems'];
  directory: string;
  zipPath: string;
  files: SoftwareCopyrightHashedFile[];
  status?: 'pass' | 'missing' | 'changed';
}

export type SoftwareCopyrightSubmissionStatus = 'pass' | 'warning' | 'blocked' | 'pending';

export interface SoftwareCopyrightManualReviewChecks {
  ownership: boolean;
  identity: boolean;
  dates: boolean;
  sourceEvidence: boolean;
  localRequirements: boolean;
}

export interface SoftwareCopyrightManualReviewState {
  checks: SoftwareCopyrightManualReviewChecks;
  notes: string;
  confirmedAt: string;
  snapshotId: string;
}

export interface SoftwareCopyrightCodeMaterialReviewChecks {
  pageRange: boolean;
  sourceScope: boolean;
  readability: boolean;
}

export interface SoftwareCopyrightCodeMaterialReviewState {
  checks: SoftwareCopyrightCodeMaterialReviewChecks;
  notes: string;
  confirmedAt: string;
  manifestHash: string;
}

export interface SoftwareCopyrightManualAssetReviewChecks {
  content: boolean;
  captionPlacement: boolean;
}

export interface SoftwareCopyrightManualAssetReviewState {
  checks: SoftwareCopyrightManualAssetReviewChecks;
  notes: string;
  confirmedAt: string;
  mode: 'manual' | 'ai' | '';
}

export interface SoftwareCopyrightSubmissionFieldMapping {
  group: string;
  key: keyof SoftwareCopyrightFields;
  label: string;
  required?: boolean;
  maxLength?: number;
  note: string;
  value: string;
  length: number;
  status: Exclude<SoftwareCopyrightSubmissionStatus, 'pending'>;
  message: string;
}

export interface SoftwareCopyrightSubmissionCheck {
  id: string;
  label: string;
  status: SoftwareCopyrightSubmissionStatus;
  detail: string;
  recommendation: string;
}

export interface SoftwareCopyrightSubmissionReview {
  checkedAt: string;
  overallStatus: SoftwareCopyrightSubmissionStatus;
  readyToSubmit: boolean;
  counts: Record<SoftwareCopyrightSubmissionStatus, number>;
  fieldMappings: SoftwareCopyrightSubmissionFieldMapping[];
  checks: SoftwareCopyrightSubmissionCheck[];
  deliveryChecks: SoftwareCopyrightSubmissionCheck[];
  latestBatch: SoftwareCopyrightExportBatch | null;
  latestGuide: { path: string; generatedAt: string } | null;
  guideMarkdown: string;
  manualReview: SoftwareCopyrightManualReviewState & {
    currentSnapshotId: string;
    isCurrent: boolean;
  };
}

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
  codeClean: SoftwareCopyrightCodeCleanOptions;
  exportItems: {
    application: boolean;
    manual: boolean;
    code: boolean;
    report: boolean;
  };
}

export interface SoftwareCopyrightCodeCleanOptions {
  removeComments: boolean;
  removeBlankLines: boolean;
  maskSensitive: boolean;
  wrapLongLines: boolean;
  maxLineWidth: number;
  tabWidth: number;
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

export interface SoftwareCopyrightManualScreenshot {
  id: string;
  name: string;
  path: string;
  assetUrl: string;
  caption: string;
  placement?: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface SoftwareCopyrightAiIllustration extends SoftwareCopyrightManualScreenshot {
  prompt: string;
  style: 'engineering_diagram' | 'realistic_photo';
}

export interface SoftwareCopyrightDraftFile {
  key: string;
  name: string;
  path: string;
  content: string;
  updatedAt: string;
}

export interface SoftwareCopyrightDraftVersion {
  id: string;
  key: string;
  reason: string;
  createdAt: string;
  contentHash: string;
  lineCount: number;
  charCount: number;
}

export interface SoftwareCopyrightDraftDiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface SoftwareCopyrightDraftVersionComparison {
  version: SoftwareCopyrightDraftVersion;
  changed: boolean;
  addedLineCount: number;
  removedLineCount: number;
  unchangedLineCount: number;
  truncated: boolean;
  lines: SoftwareCopyrightDraftDiffLine[];
}

export interface SoftwareCopyrightDraftSaveResult extends SoftwareCopyrightDraftFile {
  state: SoftwareCopyrightState;
}

export interface SoftwareCopyrightDraftValidationIssue {
  type: 'field' | 'draft' | 'code' | 'consistency';
  severity: 'error' | 'warning';
  key?: string;
  message: string;
}

export interface SoftwareCopyrightConsistencyCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  detail: string;
  target: 'fields' | 'application' | 'manual' | 'code';
}

export interface SoftwareCopyrightDraftValidationResult {
  valid: boolean;
  issues: SoftwareCopyrightDraftValidationIssue[];
  consistencyChecks: SoftwareCopyrightConsistencyCheck[];
  checkedAt: string;
}

export interface SoftwareCopyrightCodeManifestFile {
  path: string;
  category: string;
  selection_score?: number;
  source_line_count: number;
  cleaned_line_count?: number;
  encoding?: string;
  removed_comments?: number;
  removed_blank_lines?: number;
  masked_count?: number;
  sensitive_evidence?: Array<{ line: number; detail: string }>;
  wrapped_lines?: number;
  material_line_start: number;
  material_line_end: number;
}

export interface SoftwareCopyrightCodePage {
  no: number;
  lines: string[];
  start_file: string;
  end_file: string;
  segment: 'front' | 'back';
}

export interface SoftwareCopyrightCodeAuditEvidence {
  file: string;
  line?: number;
  detail: string;
  subject?: string;
}

export interface SoftwareCopyrightCodeAuditItem {
  status: 'pass' | 'warn' | 'fail';
  name: string;
  detail: string;
  recommendation?: string;
  evidence?: SoftwareCopyrightCodeAuditEvidence[];
}

export interface SoftwareCopyrightCodeManifest {
  software_name: string;
  version: string;
  project_root: string;
  lines_per_page: number;
  total_pages: number;
  mode: 'front30_back30' | 'all_under_60_pages' | string;
  material_line_count: number;
  cleaned_line_count?: number;
  truncated?: boolean;
  selection_strategy?: string;
  excluded_paths?: string[];
  included_paths?: string[];
  category_summary?: Record<string, number>;
  clean_options?: SoftwareCopyrightCodeCleanOptions;
  files: SoftwareCopyrightCodeManifestFile[];
  pages?: SoftwareCopyrightCodePage[];
  audit?: SoftwareCopyrightCodeAuditItem[];
}

export interface SoftwareCopyrightState {
  schemaVersion: number;
  migration?: {
    fromVersion: number;
    toVersion: number;
    migratedAt: string;
  };
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
  confirmedSnapshot?: SoftwareCopyrightConfirmedSnapshot | null;
  exportBatches?: SoftwareCopyrightExportBatch[];
  draftDir?: string;
  outputRoot?: string;
  outputs: SoftwareCopyrightOutput[];
  manualScreenshots: SoftwareCopyrightManualScreenshot[];
  aiIllustrations: SoftwareCopyrightAiIllustration[];
  aiIllustrationSettings: {
    prompt: string;
    style: 'engineering_diagram' | 'realistic_photo';
  };
  manualPlaceholders: string[];
  manualReview: SoftwareCopyrightManualReviewState;
  codeMaterialReview: SoftwareCopyrightCodeMaterialReviewState;
  manualAssetReview: SoftwareCopyrightManualAssetReviewState;
  generatedFieldsSourceDraftDir?: string;
  outputDir?: string;
  updated_at: string;
}

export interface SoftwareCopyrightSelectResult {
  success: boolean;
  message?: string;
  state: SoftwareCopyrightState;
}
