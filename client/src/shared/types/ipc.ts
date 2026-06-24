import type { ChatCompletionRequest, JsonCompletionRequest } from './ai';
import type { DuplicateCheckWorkspaceState, FileSelectionResult } from './bid';
import type { ClientConfig, ConfigSaveResult, ImageModelTestResult, ModelListResult } from './config';
import type { CodeGenerationSelectResult, CodeGenerationState } from '../../features/code-generation/types';
import type { KnowledgeAnalysisSnapshot, KnowledgeBaseEvent, KnowledgeBaseIndex, KnowledgeBaseMigrationResult, KnowledgeBaseMigrationStatus, KnowledgeBaseMutationResult, KnowledgeBaseStartMatchingResult, KnowledgeBaseUploadResult, KnowledgeDocument, KnowledgeFolder, KnowledgeItem } from '../../features/knowledge-base/types';
import type { OfficialDocumentPromptInput } from '../prompts/officialDocument';
import type { OfficialDocumentImportResult, OfficialDocumentState } from '../../features/official-document/types';
import type { PatentCaseInfo, PatentDisclosureDraftFile, PatentGenerationSelectProjectResult, PatentGenerationState, PatentRevisionResult } from '../../features/patent-generation/types';
import type { RejectionCheckWorkspaceState, RejectionDocumentRole } from '../../features/rejection-check/types';
import type { SoftwareCopyrightCodeManifest, SoftwareCopyrightDraftFile, SoftwareCopyrightDraftSaveResult, SoftwareCopyrightDraftValidationResult, SoftwareCopyrightFields, SoftwareCopyrightOptions, SoftwareCopyrightSelectResult, SoftwareCopyrightState } from '../../features/software-copyright/types';
import type { BidAnalysisTaskState, ContentGenerationOptions, ContentGenerationPlanState, ContentGenerationRuntimeState, ContentGenerationSectionState, GlobalFactGroupState, TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../../features/technical-plan/types';
import type { OutlineData, OutlineMode } from './outline';

export interface TaskEvent<TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown> {
  task: unknown;
  technicalPlan?: TState;
  technicalPlanPatch?: Partial<TechnicalPlanState>;
  bidItem?: BidAnalysisTaskState;
  outlineData?: OutlineData | null;
  contentSection?: ContentGenerationSectionState;
  contentPlan?: { nodeId: string; value: ContentGenerationPlanState | null };
  contentRuntime?: ContentGenerationRuntimeState;
  rejectionCheck?: TRejectionCheckState;
  duplicateCheck?: TDuplicateCheckState;
}

export interface WordExportProgressEvent {
  requestId?: string;
  phase: 'running' | 'success' | 'error' | 'canceled';
  progress: number;
  message: string;
  warnings?: string[];
}

export interface WordExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message?: string;
  warnings?: string[];
}

export interface LatestReleaseInfo {
  version: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  download_url?: string;
  download_name?: string;
  platform?: string;
  arch?: string;
  assets?: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export interface UpdateCheckResult {
  enabled: boolean;
  updateAvailable: boolean;
  version?: string;
  downloaded?: boolean;
  failed?: boolean;
  message?: string;
}

export interface YuDuBidBridge {
  appName: string;
  platform: string;
  getVersion: () => Promise<string>;
  getLatestVersion: () => Promise<LatestReleaseInfo>;
  openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
  checkUpdate: () => Promise<UpdateCheckResult>;
  startUpdate: () => Promise<UpdateCheckResult>;
  quitAndInstall: () => Promise<void>;
  onUpdateProgress: (callback: (event: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (event: { version: string }) => void) => () => void;
  onUpdateError: (callback: (event: { message: string }) => void) => () => void;
  config: {
    load: () => Promise<ClientConfig>;
    save: (config: ClientConfig) => Promise<ConfigSaveResult>;
    listModels: (config?: ClientConfig) => Promise<ModelListResult>;
    openConfigFolder: () => Promise<{ success: boolean; path: string }>;
  };
  ai: {
    chat: (request: ChatCompletionRequest) => Promise<string>;
    requestJson: <TResult = unknown>(request: JsonCompletionRequest) => Promise<TResult>;
    testImageModel: (config: ClientConfig) => Promise<ImageModelTestResult>;
  };
  file: {
    selectDuplicateCheckFiles: (options?: { multiple?: boolean }) => Promise<FileSelectionResult>;
  };
  codeGeneration: {
    loadState: () => Promise<CodeGenerationState>;
    selectProject: () => Promise<CodeGenerationSelectResult>;
    updateSelection: (payload: { selectedPaths: string[] }) => Promise<CodeGenerationState>;
    confirmSelection: () => Promise<CodeGenerationState>;
    clear: () => Promise<{ success: boolean; state: CodeGenerationState }>;
  };
  officialDocument: {
    loadState: () => Promise<OfficialDocumentState>;
    saveInput: (input: OfficialDocumentPromptInput) => Promise<OfficialDocumentState>;
    saveDraft: (draft: string) => Promise<OfficialDocumentState>;
    saveRevision: (payload: { input: OfficialDocumentPromptInput; content: string }) => Promise<OfficialDocumentState>;
    importDraft: () => Promise<OfficialDocumentImportResult>;
    extractInput: (payload: { input: OfficialDocumentPromptInput; draft: string }) => Promise<OfficialDocumentState>;
    generateDraft: (payload: { input: OfficialDocumentPromptInput }) => Promise<OfficialDocumentState>;
    checkDraft: (payload: { input: OfficialDocumentPromptInput; draft: string }) => Promise<OfficialDocumentState>;
    polishDraft: (payload: { input: OfficialDocumentPromptInput; draft: string }) => Promise<OfficialDocumentState>;
    rewriteDraft: (payload: { input: OfficialDocumentPromptInput; draft: string; instruction: string }) => Promise<OfficialDocumentState>;
    clear: () => Promise<{ success: boolean; state: OfficialDocumentState }>;
    onEvent: (callback: (event: OfficialDocumentState) => void) => () => void;
  };
  knowledgeBase: {
    getMigrationStatus: () => Promise<KnowledgeBaseMigrationStatus>;
    migrateLegacy: () => Promise<KnowledgeBaseMigrationResult>;
    list: () => Promise<KnowledgeBaseIndex>;
    createFolder: (name: string) => Promise<KnowledgeFolder>;
    renameFolder: (folderId: string, name: string) => Promise<KnowledgeFolder>;
    deleteFolder: (folderId: string) => Promise<KnowledgeBaseMutationResult>;
    deleteDocument: (documentId: string) => Promise<KnowledgeBaseMutationResult>;
    uploadDocuments: (folderId: string) => Promise<KnowledgeBaseUploadResult>;
    startMatching: (documentId: string, batchSize: number) => Promise<KnowledgeBaseStartMatchingResult>;
    readMarkdown: (documentId: string) => Promise<string>;
    readItems: (documentId: string) => Promise<KnowledgeItem[]>;
    readAnalysis: (documentId: string) => Promise<KnowledgeAnalysisSnapshot>;
    onEvent: (callback: (event: KnowledgeBaseEvent) => void) => () => void;
  };
  technicalPlan: {
    loadState: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<TechnicalPlanState>;
    importTenderDocument: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string }>;
    importOriginalPlanDocument: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string }>;
    importGeneratedOriginalPlan: () => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string; tenderMarkdown?: string }>;
    readTenderMarkdown: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<string>;
    readOriginalPlanMarkdown: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<string>;
    updateStep: (payload: TechnicalPlanStep | { workflowKind?: TechnicalPlanWorkflowKind; step: TechnicalPlanStep }) => Promise<TechnicalPlanState>;
    switchWorkflowKind: (workflowKind: TechnicalPlanWorkflowKind) => Promise<TechnicalPlanState>;
    saveOutlineConfig: (payload: { workflowKind?: TechnicalPlanWorkflowKind; outlineMode: OutlineMode; referenceKnowledgeDocumentIds: string[] }) => Promise<TechnicalPlanState>;
    saveOutline: (payload: OutlineData | { workflowKind?: TechnicalPlanWorkflowKind; outlineData: OutlineData }) => Promise<TechnicalPlanState>;
    saveGlobalFacts: (payload: GlobalFactGroupState[] | { workflowKind?: TechnicalPlanWorkflowKind; globalFacts: GlobalFactGroupState[] }) => Promise<TechnicalPlanState>;
    saveContentGenerationOptions: (payload: ContentGenerationOptions | { workflowKind?: TechnicalPlanWorkflowKind; contentGenerationOptions: ContentGenerationOptions }) => Promise<TechnicalPlanState>;
    saveChapterContent: (payload: { workflowKind?: TechnicalPlanWorkflowKind; nodeId: string; content: string }) => Promise<TechnicalPlanState>;
    clear: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState }>;
  };
  duplicateCheck: {
    loadState: () => Promise<DuplicateCheckWorkspaceState>;
    saveFiles: (payload: Pick<DuplicateCheckWorkspaceState, 'tenderFile' | 'bidFiles'> & Partial<Pick<DuplicateCheckWorkspaceState, 'step' | 'activeAnalysisTab'>>) => Promise<DuplicateCheckWorkspaceState>;
    saveUiState: (payload: Partial<Pick<DuplicateCheckWorkspaceState, 'step' | 'activeAnalysisTab'>>) => Promise<DuplicateCheckWorkspaceState>;
    updateState: (partial: Partial<DuplicateCheckWorkspaceState>) => Promise<DuplicateCheckWorkspaceState>;
    clear: () => Promise<{ success: boolean; message?: string; state: DuplicateCheckWorkspaceState }>;
  };
  rejectionCheck: {
    loadState: () => Promise<RejectionCheckWorkspaceState>;
    importDocument: (role: RejectionDocumentRole) => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    importTenderFromTechnicalPlan: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    removeDocument: (role: RejectionDocumentRole) => Promise<RejectionCheckWorkspaceState>;
    saveUiState: (payload: Partial<Pick<RejectionCheckWorkspaceState, 'step' | 'activeDocumentTab' | 'activeResultTab' | 'activeCheckResultTab' | 'customCheckItems' | 'checkOptions'>>) => Promise<RejectionCheckWorkspaceState>;
    updateState: (partial: Partial<RejectionCheckWorkspaceState>) => Promise<RejectionCheckWorkspaceState>;
    clear: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
  };
  softwareCopyright: {
    loadState: () => Promise<SoftwareCopyrightState>;
    selectProject: () => Promise<SoftwareCopyrightSelectResult>;
    saveFields: (fields: Partial<SoftwareCopyrightFields>) => Promise<SoftwareCopyrightState>;
    saveOptions: (options: Partial<SoftwareCopyrightOptions>) => Promise<SoftwareCopyrightState>;
    readDraft: (draftKey: string) => Promise<SoftwareCopyrightDraftFile>;
    readCodeManifest: () => Promise<SoftwareCopyrightCodeManifest | null>;
    regenerateCodeMaterial: (payload?: { fields?: Partial<SoftwareCopyrightFields>; sourceMode?: 'project' | 'code-generation'; codeExcludedPaths?: string[]; codeIncludedPaths?: string[] }) => Promise<{ state: SoftwareCopyrightState; manifest: SoftwareCopyrightCodeManifest }>;
    saveDraft: (payload: { key: string; content: string }) => Promise<SoftwareCopyrightDraftSaveResult>;
    validateDraft: () => Promise<SoftwareCopyrightDraftValidationResult>;
    startGeneration: (payload?: { fields?: Partial<SoftwareCopyrightFields>; useAiImages?: boolean; sourceMode?: 'project' | 'code-generation'; codeExcludedPaths?: string[]; codeIncludedPaths?: string[] }) => Promise<unknown>;
    confirmDraft: () => Promise<SoftwareCopyrightState>;
    exportFinal: (payload?: { exportItems?: SoftwareCopyrightOptions['exportItems'] }) => Promise<unknown>;
    clear: () => Promise<{ success: boolean; message?: string; state: SoftwareCopyrightState }>;
    openOutputDir: () => Promise<{ success: boolean; path: string }>;
    onEvent: (callback: (event: SoftwareCopyrightState) => void) => () => void;
  };
  patentGeneration: {
    loadState: () => Promise<PatentGenerationState>;
    saveCaseInfo: (payload: Partial<PatentCaseInfo>) => Promise<PatentGenerationState>;
    selectPatentPoint: (pointId: string) => Promise<PatentGenerationState>;
    selectProject: () => Promise<PatentGenerationSelectProjectResult>;
    startMining: () => Promise<PatentGenerationState>;
    generateDisclosureDraft: () => Promise<PatentGenerationState>;
    readDisclosureDraft: (draftId?: string) => Promise<PatentDisclosureDraftFile>;
    saveDisclosureDraft: (payload: { id: string; content: string }) => Promise<PatentGenerationState>;
    generatePriorArtAnalysis: (payload: { sourceText: string }) => Promise<PatentGenerationState>;
    savePriorArtMarkdown: (markdown: string) => Promise<PatentGenerationState>;
    generateRevision: (payload: { kind: 'merge' | 'correct'; instruction: string }) => Promise<PatentRevisionResult>;
    clear: () => Promise<{ success: boolean; state: PatentGenerationState }>;
    onEvent: (callback: (event: PatentGenerationState) => void) => () => void;
  };
  tasks: {
    startBidAnalysis: (payload: unknown) => Promise<unknown>;
    startOutlineGeneration: (payload: unknown) => Promise<unknown>;
    startGlobalFactsGeneration: (payload: unknown) => Promise<unknown>;
    startContentGeneration: (payload: unknown) => Promise<unknown>;
    pauseContentGeneration: (payload?: unknown) => Promise<unknown>;
    startRejectionItemsExtraction: (payload: unknown) => Promise<unknown>;
    startRejectionCheck: (payload: unknown) => Promise<unknown>;
    startDuplicateAnalysis: (payload: unknown) => Promise<unknown>;
    getActiveTasks: () => Promise<unknown[]>;
    onTaskEvent: <TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown>(callback: (event: TaskEvent<TState, TRejectionCheckState, TDuplicateCheckState>) => void) => () => void;
  };
  export: {
    exportWord: (payload: unknown) => Promise<WordExportResult>;
    onWordExportProgress: (callback: (event: WordExportProgressEvent) => void) => () => void;
  };
}
