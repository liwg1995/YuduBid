import type { OutlineData, OutlineMode } from '../outline';

export type TechnicalPlanStep = 'document-analysis' | 'generation-settings' | 'bid-analysis' | 'outline-generation' | 'global-facts' | 'content-edit' | 'expand';
export type TechnicalPlanWorkflowKind = 'technical-plan' | 'existing-plan-expansion';
export type BidAnalysisMode = 'key' | 'full';
export type BidAnalysisTaskStatus = 'idle' | 'running' | 'success' | 'error';
export type BackgroundTaskType = 'bid-section-extraction' | 'bid-analysis' | 'outline-generation' | 'global-facts-generation' | 'content-generation';
export type BackgroundTaskStatus = 'running' | 'pausing' | 'stopping' | 'stopped' | 'paused' | 'success' | 'error';
export type ContentGenerationSectionStatus = 'idle' | 'running' | 'success' | 'error';
export type ContentTableRequirement = 'none' | 'light' | 'moderate' | 'heavy';
export type MissingFactPolicy = 'infer' | 'placeholder' | 'generic';
export type ContentAiImageStyle = 'auto' | 'engineering_diagram' | 'realistic_photo' | 'product_shot' | 'architectural_render' | '3d_render' | 'isometric_illustration' | 'cutaway_illustration' | 'exploded_view' | 'line_drawing' | 'flat_illustration';

export interface ContentGenerationOptions {
  useAiImages: boolean;
  aiImageStyle?: ContentAiImageStyle;
  maxAiImages: number;
  useMermaidImages: boolean;
  useTechnicalDiagrams: boolean;
  tableRequirement: ContentTableRequirement;
  minimumWords: number;
  maximumWords?: number;
  sectionWords?: number;
  wordCountRepair?: boolean;
  layoutCheck?: boolean;
  contentConcurrency: number;
  enableConsistencyAudit: boolean;
  enableOriginalPlanCoverageAudit?: boolean;
  missingFactPolicy?: MissingFactPolicy;
  wordExportMode?: 'basic' | 'word-optimization' | 'custom-template';
  wordExportTemplateId?: string;
}

export interface ContentImageStats {
  planned: number;
  attempted: number;
  success: number;
  failed: number;
  skipped: number;
}

export interface BackgroundTaskState {
  task_id: string;
  type: BackgroundTaskType;
  project_id?: string;
  status: BackgroundTaskStatus;
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  last_ai_request_at?: string;
  last_ai_response_at?: string;
  last_ai_retry_at?: string;
  ai_retry_count?: number;
  error?: string;
  pause_requested?: boolean;
  stop_requested?: boolean;
  stats?: {
    globalFactsPolicy?: MissingFactPolicy;
    content?: {
      phase: 'planning' | 'generating' | 'outline-expanding' | 'expanding' | 'auditing' | 'illustrating' | 'layout-checking' | 'validating-images' | 'done';
      planning_total: number;
      planning_completed: number;
      generation_total: number;
      generation_completed: number;
      outline_expansion_total?: number;
      outline_expansion_completed?: number;
      outline_expansion_step_total?: number;
      outline_expansion_step_completed?: number;
      outline_expansion_round?: number;
      outline_expansion_round_total?: number;
      outline_expansion_step_label?: string;
      minimum_words?: number;
      current_words?: number;
      word_repair_mode?: 'maximum';
      word_repair_total?: number;
      word_repair_completed?: number;
      word_limit_warning?: string;
      audit_group_total?: number;
      audit_group_completed?: number;
      audit_conflict_total?: number;
      audit_fix_total?: number;
      audit_fix_completed?: number;
      audit_fix_failed?: number;
      illustration_total?: number;
      illustration_completed?: number;
      expansion_total?: number;
      expansion_completed?: number;
      expansion_failed?: number;
    };
    images?: Partial<ContentImageStats> & {
      total?: ContentImageStats;
      ai?: ContentImageStats;
      mermaid?: ContentImageStats;
      diagram?: ContentImageStats;
    };
  };
}

export interface BidAnalysisTaskState {
  id: string;
  label: string;
  status: BidAnalysisTaskStatus;
  content: string;
  error?: string;
}

export type BidAnalysisTasks = Record<string, BidAnalysisTaskState>;

export interface GlobalFactGroupState {
  id: string;
  title: string;
  content: string;
  updated_at?: string;
}

export interface ContentGenerationSectionState {
  id: string;
  title: string;
  status: ContentGenerationSectionStatus;
  content: string;
  error?: string;
  updated_at?: string;
}

export type ContentGenerationSections = Record<string, ContentGenerationSectionState>;

export type ContentIllustrationType = 'ai' | 'mermaid' | 'none';

export interface ContentGenerationPlanData {
  knowledge: {
    item_ids: string[];
  };
  facts: {
    titles: string[];
  };
  table: {
    needed: boolean;
    purpose: string;
  };
  mermaid: {
    needed: boolean;
    title: string;
    code: string;
    priority: number;
    reason: string;
  };
  image: {
    needed: boolean;
    style: Exclude<ContentAiImageStyle, 'auto'> | '';
    title: string;
    prompt: string;
    priority: number;
    reason: string;
  };
}

export interface ContentGenerationPlanState {
  plan: ContentGenerationPlanData;
  illustration_type: ContentIllustrationType;
  updated_at?: string;
}

export type ContentGenerationPlans = Record<string, ContentGenerationPlanState>;

export interface ContentGenerationRuntimeState {
  phase?: string;
  touched_item_ids?: string[];
  outline_expansion_completed?: number;
  expansion_cycle_item_ids?: string[];
  expansion_attempted_item_ids?: string[];
  expansion_cycle_start_words?: number;
  target_item_id?: string;
  regenerate_requirement?: string;
  expand_only?: boolean;
  updated_at?: string;
}

export interface TechnicalPlanTenderFile {
  fileName: string;
  markdownPath: string;
  markdownChars: number;
  contentHash: string;
  parserLabel?: string;
  importedAt?: string;
  updatedAt: string;
}

export interface TechnicalPlanOriginalPlanFile {
  fileName: string;
  markdownPath: string;
  markdownChars: number;
  contentHash: string;
  sourcePath?: string;
  sourceExt?: string;
  parserLabel?: string;
  importedAt?: string;
  updatedAt: string;
}

export interface TechnicalPlanState {
  projectId?: string;
  projectName?: string;
  workflowKind: TechnicalPlanWorkflowKind;
  step: TechnicalPlanStep;
  tenderFile: TechnicalPlanTenderFile | null;
  bidSections?: Array<{ id: string; title: string; startLine: number; endLine: number; includeRanges?: Array<{ startLine: number; endLine: number; reason?: string }>; evidence?: string[] }>;
  selectedBidSectionId?: string;
  bidSectionSource?: 'heading' | 'evidence';
  bidSectionExtractionTask?: BackgroundTaskState;
  originalPlanFile: TechnicalPlanOriginalPlanFile | null;
  projectOverview: string;
  techRequirements: string;
  responseFileRequirements: string;
  bidAnalysisMode: BidAnalysisMode;
  bidAnalysisTasks: BidAnalysisTasks;
  bidAnalysisProgress: number;
  outlineMode: OutlineMode;
  referenceKnowledgeDocumentIds: string[];
  bidAnalysisTask?: BackgroundTaskState;
  outlineGenerationTask?: BackgroundTaskState;
  globalFactsTask?: BackgroundTaskState;
  globalFacts: GlobalFactGroupState[];
  contentGenerationTask?: BackgroundTaskState;
  contentGenerationOptions?: ContentGenerationOptions;
  generationSettingsSnapshot?: { minimumWords: number; maximumWords?: number; sectionWords?: number };
  contentGenerationSections: ContentGenerationSections;
  contentGenerationPlans: ContentGenerationPlans;
  contentGenerationRuntime?: ContentGenerationRuntimeState;
  outlineData: OutlineData | null;
  technicalVolume?: TechnicalVolumeConfig;
}

export interface TechnicalVolumeConfig {
  nodeIds: string[];
  updatedAt?: string;
}

export interface TechnicalPlanProject {
  id: string;
  workflowKind: TechnicalPlanWorkflowKind;
  name: string;
  created_at: string;
  updated_at: string;
  isActive?: boolean;
}

export interface TechnicalPlanProjectList {
  activeProjectId: string;
  projects: TechnicalPlanProject[];
}

export interface TechnicalPlanProjectPayload {
  workflowKind?: TechnicalPlanWorkflowKind;
  projectId?: string;
  project_id?: string;
}
