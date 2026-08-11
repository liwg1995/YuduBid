import type { ChatCompletionRequest, JsonCompletionRequest } from './ai';
import type { DuplicateCheckWorkspaceState, FileSelectionResult } from './bid';
import type { ClientConfig, ConfigSaveResult, ImageModelTestResult, ModelCapabilityInfo, ModelListResult } from './config';
import type { CodeGenerationSelectResult, CodeGenerationState } from '../../features/code-generation/types';
import type { GrantApplicationPanel, GrantApplicationProfile, GrantApplicationProject, GrantApplicationProjectList, GrantApplicationState, GrantFormFieldMapping, GrantProposalModuleKey, GrantProposalTemplateMapping, GrantProposalVisualSettings, GrantTemplateFillReport } from '../../features/grant-application/types';
import type { KnowledgeAnalysisSnapshot, KnowledgeBaseEvent, KnowledgeBaseIndex, KnowledgeBaseMigrationResult, KnowledgeBaseMigrationStatus, KnowledgeBaseMutationResult, KnowledgeBaseStartMatchingResult, KnowledgeBaseUploadResult, KnowledgeDocument, KnowledgeFolder, KnowledgeItem } from '../../features/knowledge-base/types';
import type { OfficialDocumentPromptInput } from '../prompts/officialDocument';
import type { OfficialDocumentImportResult, OfficialDocumentState } from '../../features/official-document/types';
import type { PatentCaseInfo, PatentDisclosureDraftFile, PatentGenerationSelectProjectResult, PatentGenerationState, PatentRevisionResult } from '../../features/patent-generation/types';
import type { PresalesAnalysisInput, PresalesArchitectureInput, PresalesDiagramInput, PresalesExportRecord, PresalesManualMaterialInput, PresalesMaterialItem, PresalesPresentationInput, PresalesProjectList, PresalesProjectProfile, PresalesProjectState, PresalesResearchInput } from '../../features/presales-workbench/types';
import type { ProjectManagementCommercialInput, ProjectManagementComplianceInput, ProjectManagementDeliveryInput, ProjectManagementDictionaries, ProjectManagementDiscoveryInput, ProjectManagementExecutionInput, ProjectManagementPlanningInput, ProjectManagementProfile, ProjectManagementProjectList, ProjectManagementReportingInput, ProjectManagementRetrospectiveInput, ProjectManagementRiskInput, ProjectManagementStakeholderInput, ProjectManagementState } from '../../features/project-management/types';
import type { RejectionCheckWorkspaceState, RejectionDocumentRole } from '../../features/rejection-check/types';
import type { SoftwareCopyrightAiIllustration, SoftwareCopyrightCase, SoftwareCopyrightCaseList, SoftwareCopyrightCaseMutationResult, SoftwareCopyrightCodeManifest, SoftwareCopyrightCodeMaterialReviewChecks, SoftwareCopyrightDraftFile, SoftwareCopyrightDraftSaveResult, SoftwareCopyrightDraftValidationResult, SoftwareCopyrightDraftVersion, SoftwareCopyrightDraftVersionComparison, SoftwareCopyrightExportBatch, SoftwareCopyrightFields, SoftwareCopyrightManualAssetReviewChecks, SoftwareCopyrightManualReviewChecks, SoftwareCopyrightManualReviewState, SoftwareCopyrightOptions, SoftwareCopyrightSelectResult, SoftwareCopyrightState, SoftwareCopyrightSubmissionReview } from '../../features/software-copyright/types';
import type { BidAnalysisTaskState, ContentGenerationOptions, ContentGenerationPlanState, ContentGenerationRuntimeState, ContentGenerationSectionState, GlobalFactGroupState, TechnicalPlanProject, TechnicalPlanProjectList, TechnicalPlanProjectPayload, TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../../features/technical-plan/types';
import type { ThesisTutorGeneratePayload, ThesisTutorHistoryItem, ThesisTutorImportSourceResult, ThesisTutorProfile, ThesisTutorState, ThesisTutorWorkspaceTransferResult } from '../../features/thesis-tutor/types';
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
  filePath?: string;
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

export interface ReleaseInstallerDownloadRequest {
  version: string;
  download_url: string;
  download_name?: string;
  size?: number;
}

export interface ReleaseInstallerDownloadResult {
  success: boolean;
  downloaded?: boolean;
  canceled?: boolean;
  version?: string;
  path?: string;
  fileName?: string;
  message?: string;
}

export interface UpdateProgressEvent {
  percent: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  fileName?: string;
  version?: string;
}

export type UsageTrendRange = '1h' | '6h' | '1d' | '7d' | '14d';

export interface UsageStatsSummary {
  version: number;
  updated_at?: string | null;
  totals: { requests: number; prompt_tokens: number; completion_tokens: number; reasoning_tokens: number; total_tokens: number };
  daily: Array<{ date: string; requests: number; prompt_tokens: number; completion_tokens: number; reasoning_tokens: number; total_tokens: number }>;
  trend: Array<{ date: string; requests: number; prompt_tokens: number; completion_tokens: number; reasoning_tokens: number; total_tokens: number }>;
  by_model: Array<{ provider: string; model: string; requests: number; total_tokens: number }>;
}

export interface YuDuBidBridge {
  appName: string;
  platform: string;
  getVersion: () => Promise<string>;
  getLatestVersion: () => Promise<LatestReleaseInfo>;
  openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
  checkUpdate: () => Promise<UpdateCheckResult>;
  startUpdate: () => Promise<UpdateCheckResult>;
  downloadReleaseInstaller: (payload: ReleaseInstallerDownloadRequest) => Promise<ReleaseInstallerDownloadResult>;
  cancelReleaseInstallerDownload: () => Promise<{ success: boolean; canceled?: boolean; message?: string }>;
  installDownloadedRelease: () => Promise<{ success: boolean; message?: string }>;
  showDownloadedRelease: () => Promise<{ success: boolean; path?: string; fileName?: string; version?: string; message?: string }>;
  quitAndInstall: () => Promise<void>;
  onUpdateProgress: (callback: (event: UpdateProgressEvent) => void) => () => void;
  onUpdateDownloaded: (callback: (event: { version: string }) => void) => () => void;
  onUpdateError: (callback: (event: { message: string }) => void) => () => void;
  config: {
    load: () => Promise<ClientConfig>;
    save: (config: ClientConfig) => Promise<ConfigSaveResult>;
    listModels: (config?: ClientConfig) => Promise<ModelListResult>;
    getModelCapabilities: (config?: ClientConfig) => Promise<ModelCapabilityInfo>;
    openConfigFolder: () => Promise<{ success: boolean; path: string }>;
  };
  ai: {
    chat: (request: ChatCompletionRequest) => Promise<string>;
    requestJson: <TResult = unknown>(request: JsonCompletionRequest) => Promise<TResult>;
    testImageModel: (config: ClientConfig) => Promise<ImageModelTestResult>;
  };
  usageStats: {
    getSummary: (range?: UsageTrendRange) => Promise<UsageStatsSummary>;
    clear: () => Promise<{ success: boolean }>;
  };
  file: {
    selectDuplicateCheckFiles: (options?: { multiple?: boolean }) => Promise<FileSelectionResult>;
  };
  codeGeneration: {
    loadState: () => Promise<CodeGenerationState>;
    selectProject: () => Promise<CodeGenerationSelectResult>;
    updateSelection: (payload: { selectedPaths: string[]; sortMode?: CodeGenerationState['sortMode'] }) => Promise<CodeGenerationState>;
    rescan: () => Promise<CodeGenerationState>;
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
  grantApplication: {
    loadState: () => Promise<GrantApplicationState>;
    listProjects: () => Promise<GrantApplicationProjectList>;
    createProject: (payload?: { projectName?: string; name?: string; profile?: Partial<GrantApplicationProfile> }) => Promise<{ project: GrantApplicationProject; projects: GrantApplicationProjectList; state: GrantApplicationState }>;
    switchProject: (projectId: string) => Promise<GrantApplicationState>;
    renameProject: (payload: { projectId?: string; projectName?: string; name?: string }) => Promise<{ projects: GrantApplicationProjectList; state: GrantApplicationState }>;
    deleteProject: (projectId: string) => Promise<{ success: boolean; projects: GrantApplicationProjectList; state: GrantApplicationState }>;
    saveWorkspace: (payload: { panel: GrantApplicationPanel; profile: GrantApplicationProfile; input: { taskText: string; materialText: string }; output?: string }) => Promise<GrantApplicationState>;
    saveOutput: (payload: { panel: GrantApplicationPanel; output: string }) => Promise<GrantApplicationState>;
    importMaterial: (payload: { panel: GrantApplicationPanel }) => Promise<{ success: boolean; message?: string; fileName?: string; parserProvider?: string; state: GrantApplicationState }>;
    exportWorkspaceJson: () => Promise<{ success: boolean; canceled?: boolean; message?: string; filePath?: string; state: GrantApplicationState }>;
    exportFormFields: () => Promise<{ success: boolean; canceled?: boolean; message?: string; filePath?: string; state: GrantApplicationState }>;
    getFormFields: () => Promise<{ success: boolean; mapping: GrantFormFieldMapping; state: GrantApplicationState }>;
    importProposalTemplate: () => Promise<{ success: boolean; message?: string; fileName?: string; parserProvider?: string; mapping?: GrantProposalTemplateMapping; state: GrantApplicationState }>;
    exportFilledProposalTemplate: () => Promise<{ success: boolean; canceled?: boolean; message?: string; filePath?: string; report?: GrantTemplateFillReport; state: GrantApplicationState }>;
    generate: (payload: { panel: GrantApplicationPanel; profile: GrantApplicationProfile; input: { taskText: string; materialText: string } }) => Promise<GrantApplicationState>;
    generateProposalModule: (payload: { moduleKey: GrantProposalModuleKey; profile: GrantApplicationProfile; input: { taskText: string; materialText: string } }) => Promise<GrantApplicationState>;
    saveProposalModule: (payload: { moduleKey: GrantProposalModuleKey; content: string }) => Promise<GrantApplicationState>;
    saveProposalVisualSettings: (payload: { settings: GrantProposalVisualSettings }) => Promise<GrantApplicationState>;
    polishProposalModule: (payload: { moduleKey: GrantProposalModuleKey; profile: GrantApplicationProfile; input: { taskText: string; materialText: string } }) => Promise<GrantApplicationState>;
    combineProposalModules: () => Promise<GrantApplicationState>;
    generateProposalModuleQualityCheck: (payload: { moduleKey: GrantProposalModuleKey; profile: GrantApplicationProfile; input: { taskText: string; materialText: string } }) => Promise<GrantApplicationState>;
    generateProposalFinalReview: (payload: { profile: GrantApplicationProfile; input: { taskText: string; materialText: string } }) => Promise<GrantApplicationState>;
    generateQualityReview: (payload: { profile: GrantApplicationProfile; input: { taskText: string; materialText: string } }) => Promise<GrantApplicationState>;
    clear: () => Promise<{ success: boolean; state: GrantApplicationState }>;
    onEvent: (callback: (event: GrantApplicationState) => void) => () => void;
  };
  projectManagement: {
    loadState: () => Promise<ProjectManagementState>;
    listProjects: () => Promise<ProjectManagementProjectList>;
    readDictionaries: () => Promise<ProjectManagementDictionaries>;
    saveDictionary: (payload: { kind: keyof ProjectManagementDictionaries; items: string[] }) => Promise<ProjectManagementDictionaries>;
    createProject: (payload?: { projectName?: string; profile?: Partial<ProjectManagementProfile> }) => Promise<{ state: ProjectManagementState; projects: ProjectManagementProjectList }>;
    switchProject: (projectId: string) => Promise<ProjectManagementState>;
    deleteProject: (projectId: string) => Promise<{ success: boolean; state: ProjectManagementState; projects: ProjectManagementProjectList }>;
    deleteProjects: (projectIds: string[]) => Promise<{ success: boolean; state: ProjectManagementState; projects: ProjectManagementProjectList }>;
    saveProfile: (profile: ProjectManagementProfile) => Promise<ProjectManagementState>;
    savePlanningInput: (payload: ProjectManagementPlanningInput) => Promise<ProjectManagementState>;
    generatePlanning: (payload: { profile: ProjectManagementProfile; planningInput: ProjectManagementPlanningInput }) => Promise<ProjectManagementState>;
    savePlanningResult: (payload: { planningResult: string }) => Promise<ProjectManagementState>;
    saveDiscoveryInput: (payload: ProjectManagementDiscoveryInput) => Promise<ProjectManagementState>;
    generateDiscovery: (payload: { profile: ProjectManagementProfile; discoveryInput: ProjectManagementDiscoveryInput; planningResult?: string }) => Promise<ProjectManagementState>;
    saveDiscoveryResult: (payload: { discoveryResult: string }) => Promise<ProjectManagementState>;
    saveExecutionInput: (payload: ProjectManagementExecutionInput) => Promise<ProjectManagementState>;
    generateExecution: (payload: { profile: ProjectManagementProfile; executionInput: ProjectManagementExecutionInput; planningResult?: string; discoveryResult?: string }) => Promise<ProjectManagementState>;
    saveExecutionResult: (payload: { executionResult: string }) => Promise<ProjectManagementState>;
    saveRiskInput: (payload: ProjectManagementRiskInput) => Promise<ProjectManagementState>;
    generateRisk: (payload: { profile: ProjectManagementProfile; riskInput: ProjectManagementRiskInput; planningResult?: string; discoveryResult?: string; executionResult?: string }) => Promise<ProjectManagementState>;
    saveRiskResult: (payload: { riskResult: string }) => Promise<ProjectManagementState>;
    saveStakeholderInput: (payload: ProjectManagementStakeholderInput) => Promise<ProjectManagementState>;
    generateStakeholder: (payload: { profile: ProjectManagementProfile; stakeholderInput: ProjectManagementStakeholderInput; planningResult?: string; discoveryResult?: string; executionResult?: string; riskResult?: string }) => Promise<ProjectManagementState>;
    saveStakeholderResult: (payload: { stakeholderResult: string }) => Promise<ProjectManagementState>;
    saveDeliveryInput: (payload: ProjectManagementDeliveryInput) => Promise<ProjectManagementState>;
    generateDelivery: (payload: { profile: ProjectManagementProfile; deliveryInput: ProjectManagementDeliveryInput; planningResult?: string; discoveryResult?: string; executionResult?: string; riskResult?: string; stakeholderResult?: string }) => Promise<ProjectManagementState>;
    saveDeliveryResult: (payload: { deliveryResult: string }) => Promise<ProjectManagementState>;
    saveReportingInput: (payload: ProjectManagementReportingInput) => Promise<ProjectManagementState>;
    generateReporting: (payload: { profile: ProjectManagementProfile; reportingInput: ProjectManagementReportingInput; planningResult?: string; discoveryResult?: string; executionResult?: string; riskResult?: string; stakeholderResult?: string; deliveryResult?: string }) => Promise<ProjectManagementState>;
    saveReportingResult: (payload: { reportingResult: string }) => Promise<ProjectManagementState>;
    saveCommercialInput: (payload: ProjectManagementCommercialInput) => Promise<ProjectManagementState>;
    generateCommercial: (payload: { profile: ProjectManagementProfile; commercialInput: ProjectManagementCommercialInput; planningResult?: string; discoveryResult?: string; executionResult?: string; riskResult?: string; stakeholderResult?: string; deliveryResult?: string; reportingResult?: string }) => Promise<ProjectManagementState>;
    saveCommercialResult: (payload: { commercialResult: string }) => Promise<ProjectManagementState>;
    saveRetrospectiveInput: (payload: ProjectManagementRetrospectiveInput) => Promise<ProjectManagementState>;
    generateRetrospective: (payload: { profile: ProjectManagementProfile; retrospectiveInput: ProjectManagementRetrospectiveInput; planningResult?: string; discoveryResult?: string; executionResult?: string; riskResult?: string; stakeholderResult?: string; deliveryResult?: string; reportingResult?: string; commercialResult?: string }) => Promise<ProjectManagementState>;
    saveRetrospectiveResult: (payload: { retrospectiveResult: string }) => Promise<ProjectManagementState>;
    saveComplianceInput: (payload: ProjectManagementComplianceInput) => Promise<ProjectManagementState>;
    generateCompliance: (payload: { profile: ProjectManagementProfile; complianceInput: ProjectManagementComplianceInput; planningResult?: string; discoveryResult?: string; executionResult?: string; riskResult?: string; stakeholderResult?: string; deliveryResult?: string; reportingResult?: string; commercialResult?: string; retrospectiveResult?: string }) => Promise<ProjectManagementState>;
    saveComplianceResult: (payload: { complianceResult: string }) => Promise<ProjectManagementState>;
    clear: () => Promise<{ success: boolean; state: ProjectManagementState }>;
    onEvent: (callback: (event: ProjectManagementState) => void) => () => void;
  };
  presalesWorkbench: {
    loadState: (projectId?: string) => Promise<PresalesProjectState>;
    listProjects: () => Promise<PresalesProjectList>;
    createProject: (payload?: { projectName?: string; profile?: Partial<PresalesProjectProfile> }) => Promise<{ state: PresalesProjectState; projects: PresalesProjectList }>;
    switchProject: (projectId: string) => Promise<PresalesProjectState>;
    deleteProject: (projectId: string) => Promise<{ success: boolean; state: PresalesProjectState; projects: PresalesProjectList }>;
    saveProfile: (profile: PresalesProjectProfile) => Promise<PresalesProjectState>;
    saveAnalysisInput: (input: PresalesAnalysisInput) => Promise<PresalesProjectState>;
    saveAnalysisResult: (payload: { markdown: string }) => Promise<PresalesProjectState>;
    saveResearchInput: (input: PresalesResearchInput) => Promise<PresalesProjectState>;
    saveResearchResult: (payload: { markdown: string }) => Promise<PresalesProjectState>;
    saveArchitectureInput: (input: PresalesArchitectureInput) => Promise<PresalesProjectState>;
    saveArchitectureResult: (payload: { markdown: string }) => Promise<PresalesProjectState>;
    saveDiagramInput: (input: PresalesDiagramInput) => Promise<PresalesProjectState>;
    saveDiagramResult: (payload: { markdown: string }) => Promise<PresalesProjectState>;
    savePresentationInput: (input: PresalesPresentationInput) => Promise<PresalesProjectState>;
    savePresentationResult: (payload: { markdown: string }) => Promise<PresalesProjectState>;
    importMaterial: () => Promise<{ success: boolean; message?: string; state: PresalesProjectState; material: PresalesMaterialItem | null }>;
    saveManualMaterial: (input: PresalesManualMaterialInput) => Promise<{ success: boolean; message?: string; state: PresalesProjectState; material: PresalesMaterialItem | null }>;
    readMaterialMarkdown: (materialId: string) => Promise<string>;
    generateAnalysis: () => Promise<PresalesProjectState>;
    generateResearch: () => Promise<PresalesProjectState>;
    generateArchitecture: () => Promise<PresalesProjectState>;
    generateDiagrams: () => Promise<PresalesProjectState>;
    generatePresentation: () => Promise<PresalesProjectState>;
    exportProjectPackage: () => Promise<{ success: boolean; canceled?: boolean; message?: string; fileName?: string; filePath?: string; state: PresalesProjectState }>;
    exportPresentationOutline: () => Promise<{ success: boolean; canceled?: boolean; message?: string; fileName?: string; filePath?: string; state: PresalesProjectState }>;
    exportPresentationPptx: (options?: { useAiVisuals?: boolean; formats?: Array<'pptx' | 'html'> }) => Promise<{ success: boolean; canceled?: boolean; message?: string; fileName?: string; filePath?: string; outputDir?: string; outputs?: Array<{ type: 'pptx' | 'html'; fileName: string; filePath: string }>; state: PresalesProjectState }>;
    recordExport: (record: Partial<PresalesExportRecord> & { type: 'pptx' | 'html' | 'word' | 'outline'; filePath: string; fileName?: string }) => Promise<{ success: boolean; state: PresalesProjectState; record: PresalesExportRecord }>;
    clearExportRecords: () => Promise<{ success: boolean; state: PresalesProjectState }>;
    showExportFile: (filePath: string) => Promise<{ success: boolean; path: string }>;
    getImageModelAvailability: () => Promise<{ available: boolean; message?: string }>;
    previewProjectPackage: () => Promise<{ success: boolean; markdown: string; state: PresalesProjectState }>;
    clear: () => Promise<{ success: boolean; state: PresalesProjectState }>;
  };
  thesisTutor: {
    loadState: () => Promise<ThesisTutorState>;
    saveProfile: (profile: ThesisTutorProfile) => Promise<ThesisTutorState>;
    saveChapters: (payload: { chapters: ThesisTutorGeneratePayload['chapters']; activeChapterId?: string }) => Promise<ThesisTutorState>;
    saveReferences: (payload: { references: ThesisTutorGeneratePayload['references']; activeReferenceId?: string }) => Promise<ThesisTutorState>;
    saveFeedback: (payload: { feedbackItems: ThesisTutorGeneratePayload['feedbackItems']; activeFeedbackId?: string }) => Promise<ThesisTutorState>;
    saveChecks: (payload: { checkItems: ThesisTutorGeneratePayload['checkItems']; activeCheckId?: string }) => Promise<ThesisTutorState>;
    saveHistory: (payload: { history: ThesisTutorHistoryItem[] }) => Promise<ThesisTutorState>;
    saveProfileLock: (payload: { locked: boolean }) => Promise<ThesisTutorState>;
    generate: (payload: ThesisTutorGeneratePayload) => Promise<ThesisTutorState>;
    saveDraft: (payload: {
      panel?: ThesisTutorGeneratePayload['panel'];
      draft?: string;
      sourceText?: string;
      userInput?: string;
      chapters?: ThesisTutorGeneratePayload['chapters'];
      activeChapterId?: string;
      references?: ThesisTutorGeneratePayload['references'];
      activeReferenceId?: string;
      feedbackItems?: ThesisTutorGeneratePayload['feedbackItems'];
      activeFeedbackId?: string;
      checkItems?: ThesisTutorGeneratePayload['checkItems'];
      activeCheckId?: string;
    }) => Promise<ThesisTutorState>;
    importSource: () => Promise<ThesisTutorImportSourceResult>;
    exportWorkspace: () => Promise<ThesisTutorWorkspaceTransferResult>;
    exportProjectPackage: () => Promise<ThesisTutorWorkspaceTransferResult>;
    importWorkspace: () => Promise<ThesisTutorWorkspaceTransferResult>;
    clear: () => Promise<{ success: boolean; state: ThesisTutorState }>;
    onEvent: (callback: (event: ThesisTutorState) => void) => () => void;
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
    listProjects: (workflowKind?: TechnicalPlanWorkflowKind) => Promise<TechnicalPlanProjectList>;
    createProject: (payload?: { workflowKind?: TechnicalPlanWorkflowKind; projectName?: string; name?: string }) => Promise<{ project: TechnicalPlanProject; projects: TechnicalPlanProjectList }>;
    renameProject: (payload: TechnicalPlanProjectPayload & { name: string; projectName?: string }) => Promise<TechnicalPlanProjectList>;
    deleteProject: (payload: TechnicalPlanProjectPayload) => Promise<TechnicalPlanProjectList>;
    switchProject: (payload: TechnicalPlanProjectPayload) => Promise<TechnicalPlanState>;
    loadState: (payload?: TechnicalPlanWorkflowKind | (TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind })) => Promise<TechnicalPlanState>;
    importTenderDocument: (payload?: TechnicalPlanWorkflowKind | TechnicalPlanProjectPayload) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string }>;
    importOriginalPlanDocument: (payload?: TechnicalPlanWorkflowKind | TechnicalPlanProjectPayload) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string }>;
    importGeneratedOriginalPlan: (payload?: TechnicalPlanProjectPayload & { sourceProjectId?: string; source_project_id?: string }) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string; tenderMarkdown?: string }>;
    readTenderMarkdown: (payload?: TechnicalPlanWorkflowKind | TechnicalPlanProjectPayload) => Promise<string>;
    readOriginalPlanMarkdown: (payload?: TechnicalPlanWorkflowKind | TechnicalPlanProjectPayload) => Promise<string>;
    updateStep: (payload: TechnicalPlanStep | (TechnicalPlanProjectPayload & { step: TechnicalPlanStep })) => Promise<TechnicalPlanState>;
    switchWorkflowKind: (workflowKind: TechnicalPlanWorkflowKind) => Promise<TechnicalPlanState>;
    saveOutlineConfig: (payload: TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind; outlineMode: OutlineMode; referenceKnowledgeDocumentIds: string[] }) => Promise<TechnicalPlanState>;
    saveOutline: (payload: OutlineData | (TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind; outlineData: OutlineData })) => Promise<TechnicalPlanState>;
    saveGlobalFacts: (payload: GlobalFactGroupState[] | (TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind; globalFacts: GlobalFactGroupState[] })) => Promise<TechnicalPlanState>;
    saveContentGenerationOptions: (payload: ContentGenerationOptions | (TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind; contentGenerationOptions: ContentGenerationOptions })) => Promise<TechnicalPlanState>;
    saveChapterContent: (payload: TechnicalPlanProjectPayload & { workflowKind?: TechnicalPlanWorkflowKind; nodeId: string; content: string }) => Promise<TechnicalPlanState>;
    clear: (payload?: TechnicalPlanWorkflowKind | TechnicalPlanProjectPayload) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState }>;
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
    importBidDocuments: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    importTenderFromTechnicalPlan: (payload?: { projectId?: string; project_id?: string }) => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    importBidFromTechnicalPlan: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    removeDocument: (role: RejectionDocumentRole) => Promise<RejectionCheckWorkspaceState>;
    saveUiState: (payload: Partial<Pick<RejectionCheckWorkspaceState, 'step' | 'activeDocumentTab' | 'activeResultTab' | 'activeCheckResultTab' | 'customCheckItems' | 'checkOptions'>>) => Promise<RejectionCheckWorkspaceState>;
    updateState: (partial: Partial<RejectionCheckWorkspaceState>) => Promise<RejectionCheckWorkspaceState>;
    clear: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
  };
  softwareCopyright: {
    loadState: () => Promise<SoftwareCopyrightState>;
    listCases: (includeArchived?: boolean) => Promise<SoftwareCopyrightCaseList>;
    listExportBatches: () => Promise<SoftwareCopyrightExportBatch[]>;
    openExportBatch: (id: string) => Promise<{ success: boolean; path: string }>;
    getSubmissionReview: () => Promise<SoftwareCopyrightSubmissionReview>;
    saveManualReview: (payload: { checks: SoftwareCopyrightManualReviewChecks; notes?: string }) => Promise<SoftwareCopyrightManualReviewState>;
    saveCodeMaterialReview: (payload: { checks: SoftwareCopyrightCodeMaterialReviewChecks; notes?: string }) => Promise<SoftwareCopyrightState>;
    generateSubmissionGuide: () => Promise<SoftwareCopyrightSubmissionReview>;
    openSubmissionGuideDirectory: () => Promise<{ success: boolean; path: string }>;
    createCase: (payload: { name: string }) => Promise<SoftwareCopyrightCaseMutationResult>;
    switchCase: (id: string) => Promise<SoftwareCopyrightCaseMutationResult>;
    duplicateCase: (payload: { id: string; name?: string }) => Promise<SoftwareCopyrightCaseMutationResult>;
    deleteCase: (id: string) => Promise<{ item: SoftwareCopyrightCase; state: SoftwareCopyrightState; cases: SoftwareCopyrightCaseList }>;
    renameCase: (payload: { id: string; name: string }) => Promise<{ item: SoftwareCopyrightCase; cases: SoftwareCopyrightCaseList }>;
    setCaseArchived: (payload: { id: string; archived: boolean }) => Promise<{ item: SoftwareCopyrightCase; cases: SoftwareCopyrightCaseList }>;
    selectProject: () => Promise<SoftwareCopyrightSelectResult>;
    saveFields: (fields: Partial<SoftwareCopyrightFields>) => Promise<SoftwareCopyrightState>;
    generateTechnicalFeatures: (payload: { fields: SoftwareCopyrightFields }) => Promise<{ technicalFeatures: string; state: SoftwareCopyrightState }>;
    saveOptions: (options: Partial<SoftwareCopyrightOptions>) => Promise<SoftwareCopyrightState>;
    saveManualAssetReview: (payload: { checks: SoftwareCopyrightManualAssetReviewChecks; notes?: string }) => Promise<SoftwareCopyrightState>;
    importManualScreenshots: () => Promise<{ success: boolean; message?: string; state: SoftwareCopyrightState }>;
    updateManualScreenshot: (payload: { id: string; caption: string; placement?: string }) => Promise<SoftwareCopyrightState>;
    reorderManualScreenshots: (ids: string[]) => Promise<SoftwareCopyrightState>;
    removeManualScreenshot: (id: string) => Promise<SoftwareCopyrightState>;
    saveAiIllustrationSettings: (payload: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) => Promise<SoftwareCopyrightState>;
    generateAiIllustrationPrompt: (payload: { style: 'engineering_diagram' | 'realistic_photo' }) => Promise<{ prompt: string; style: 'engineering_diagram' | 'realistic_photo'; state: SoftwareCopyrightState }>;
    generateAiIllustration: (payload: { prompt: string; style: 'engineering_diagram' | 'realistic_photo'; caption?: string }) => Promise<{ success: boolean; message?: string; state: SoftwareCopyrightState }>;
    regenerateAiIllustration: (payload: { id: string; prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) => Promise<{ success: boolean; message?: string; item?: SoftwareCopyrightAiIllustration; state: SoftwareCopyrightState }>;
    updateAiIllustration: (payload: { id: string; caption: string; placement?: string }) => Promise<SoftwareCopyrightState>;
    reorderAiIllustrations: (ids: string[]) => Promise<SoftwareCopyrightState>;
    removeAiIllustration: (id: string) => Promise<SoftwareCopyrightState>;
    readDraft: (draftKey: string) => Promise<SoftwareCopyrightDraftFile>;
    listDraftVersions: (draftKey: string) => Promise<SoftwareCopyrightDraftVersion[]>;
    compareDraftVersion: (payload: { key: string; versionId: string }) => Promise<SoftwareCopyrightDraftVersionComparison>;
    restoreDraftVersion: (payload: { key: string; versionId: string }) => Promise<SoftwareCopyrightDraftSaveResult>;
    readCodeManifest: () => Promise<SoftwareCopyrightCodeManifest | null>;
    regenerateCodeMaterial: (payload?: { fields?: Partial<SoftwareCopyrightFields>; sourceMode?: 'project' | 'code-generation'; codeExcludedPaths?: string[]; codeIncludedPaths?: string[]; codeClean?: SoftwareCopyrightOptions['codeClean'] }) => Promise<{ state: SoftwareCopyrightState; manifest: SoftwareCopyrightCodeManifest }>;
    saveDraft: (payload: { key: string; content: string }) => Promise<SoftwareCopyrightDraftSaveResult>;
    validateDraft: () => Promise<SoftwareCopyrightDraftValidationResult>;
    startGeneration: (payload?: { fields?: Partial<SoftwareCopyrightFields>; useAiImages?: boolean; sourceMode?: 'project' | 'code-generation'; codeExcludedPaths?: string[]; codeIncludedPaths?: string[]; codeClean?: SoftwareCopyrightOptions['codeClean'] }) => Promise<unknown>;
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
    stopContentGeneration: (payload?: unknown) => Promise<unknown>;
    startRejectionItemsExtraction: (payload: unknown) => Promise<unknown>;
    startRejectionCheck: (payload: unknown) => Promise<unknown>;
    startDuplicateAnalysis: (payload: unknown) => Promise<unknown>;
    getActiveTasks: () => Promise<unknown[]>;
    onTaskEvent: <TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown>(callback: (event: TaskEvent<TState, TRejectionCheckState, TDuplicateCheckState>) => void) => () => void;
  };
  export: {
  exportWord: (payload: unknown) => Promise<WordExportResult>;
    showExportFile: (filePath: string) => Promise<{ success: boolean; path: string }>;
    onWordExportProgress: (callback: (event: WordExportProgressEvent) => void) => () => void;
  };
}
