const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  appName: '禹都AI解决方案助手',
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getLatestVersion: () => ipcRenderer.invoke('app:get-latest-version'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  startUpdate: () => ipcRenderer.invoke('app:start-update'),
  downloadReleaseInstaller: (payload) => ipcRenderer.invoke('app:download-release-installer', payload),
  cancelReleaseInstallerDownload: () => ipcRenderer.invoke('app:cancel-release-installer-download'),
  installDownloadedRelease: () => ipcRenderer.invoke('app:install-downloaded-release'),
  showDownloadedRelease: () => ipcRenderer.invoke('app:show-downloaded-release'),
  quitAndInstall: () => ipcRenderer.invoke('app:quit-and-install'),
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-progress', listener);
    return () => ipcRenderer.removeListener('app:update-progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-downloaded', listener);
    return () => ipcRenderer.removeListener('app:update-downloaded', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-error', listener);
    return () => ipcRenderer.removeListener('app:update-error', listener);
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    listModels: (config) => ipcRenderer.invoke('config:list-models', config),
    openConfigFolder: () => ipcRenderer.invoke('config:open-config-folder'),
  },
  ai: {
    chat: (request) => ipcRenderer.invoke('ai:chat', request),
    requestJson: (request) => ipcRenderer.invoke('ai:request-json', request),
    testImageModel: (config) => ipcRenderer.invoke('ai:test-image-model', config),
  },
  file: {
    selectDuplicateCheckFiles: (options) => ipcRenderer.invoke('file:select-duplicate-check-files', options),
  },
  codeGeneration: {
    loadState: () => ipcRenderer.invoke('code-generation:load-state'),
    selectProject: () => ipcRenderer.invoke('code-generation:select-project'),
    updateSelection: (payload) => ipcRenderer.invoke('code-generation:update-selection', payload),
    confirmSelection: () => ipcRenderer.invoke('code-generation:confirm-selection'),
    clear: () => ipcRenderer.invoke('code-generation:clear'),
  },
  officialDocument: {
    loadState: () => ipcRenderer.invoke('official-document:load-state'),
    saveInput: (input) => ipcRenderer.invoke('official-document:save-input', input),
    saveDraft: (draft) => ipcRenderer.invoke('official-document:save-draft', draft),
    saveRevision: (payload) => ipcRenderer.invoke('official-document:save-revision', payload),
    importDraft: () => ipcRenderer.invoke('official-document:import-draft'),
    extractInput: (payload) => ipcRenderer.invoke('official-document:extract-input', payload),
    generateDraft: (payload) => ipcRenderer.invoke('official-document:generate-draft', payload),
    checkDraft: (payload) => ipcRenderer.invoke('official-document:check-draft', payload),
    polishDraft: (payload) => ipcRenderer.invoke('official-document:polish-draft', payload),
    rewriteDraft: (payload) => ipcRenderer.invoke('official-document:rewrite-draft', payload),
    clear: () => ipcRenderer.invoke('official-document:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('official-document:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('official-document:event', listener);
      return () => ipcRenderer.removeListener('official-document:event', listener);
    },
  },
  projectManagement: {
    loadState: () => ipcRenderer.invoke('project-management:load-state'),
    listProjects: () => ipcRenderer.invoke('project-management:list-projects'),
    readDictionaries: () => ipcRenderer.invoke('project-management:read-dictionaries'),
    saveDictionary: (payload) => ipcRenderer.invoke('project-management:save-dictionary', payload),
    createProject: (payload) => ipcRenderer.invoke('project-management:create-project', payload),
    switchProject: (projectId) => ipcRenderer.invoke('project-management:switch-project', projectId),
    deleteProject: (projectId) => ipcRenderer.invoke('project-management:delete-project', projectId),
    deleteProjects: (projectIds) => ipcRenderer.invoke('project-management:delete-projects', projectIds),
    saveProfile: (profile) => ipcRenderer.invoke('project-management:save-profile', profile),
    savePlanningInput: (payload) => ipcRenderer.invoke('project-management:save-planning-input', payload),
    generatePlanning: (payload) => ipcRenderer.invoke('project-management:generate-planning', payload),
    savePlanningResult: (payload) => ipcRenderer.invoke('project-management:save-planning-result', payload),
    saveDiscoveryInput: (payload) => ipcRenderer.invoke('project-management:save-discovery-input', payload),
    generateDiscovery: (payload) => ipcRenderer.invoke('project-management:generate-discovery', payload),
    saveDiscoveryResult: (payload) => ipcRenderer.invoke('project-management:save-discovery-result', payload),
    saveExecutionInput: (payload) => ipcRenderer.invoke('project-management:save-execution-input', payload),
    generateExecution: (payload) => ipcRenderer.invoke('project-management:generate-execution', payload),
    saveExecutionResult: (payload) => ipcRenderer.invoke('project-management:save-execution-result', payload),
    saveRiskInput: (payload) => ipcRenderer.invoke('project-management:save-risk-input', payload),
    generateRisk: (payload) => ipcRenderer.invoke('project-management:generate-risk', payload),
    saveRiskResult: (payload) => ipcRenderer.invoke('project-management:save-risk-result', payload),
    saveStakeholderInput: (payload) => ipcRenderer.invoke('project-management:save-stakeholder-input', payload),
    generateStakeholder: (payload) => ipcRenderer.invoke('project-management:generate-stakeholder', payload),
    saveStakeholderResult: (payload) => ipcRenderer.invoke('project-management:save-stakeholder-result', payload),
    saveDeliveryInput: (payload) => ipcRenderer.invoke('project-management:save-delivery-input', payload),
    generateDelivery: (payload) => ipcRenderer.invoke('project-management:generate-delivery', payload),
    saveDeliveryResult: (payload) => ipcRenderer.invoke('project-management:save-delivery-result', payload),
    saveReportingInput: (payload) => ipcRenderer.invoke('project-management:save-reporting-input', payload),
    generateReporting: (payload) => ipcRenderer.invoke('project-management:generate-reporting', payload),
    saveReportingResult: (payload) => ipcRenderer.invoke('project-management:save-reporting-result', payload),
    saveCommercialInput: (payload) => ipcRenderer.invoke('project-management:save-commercial-input', payload),
    generateCommercial: (payload) => ipcRenderer.invoke('project-management:generate-commercial', payload),
    saveCommercialResult: (payload) => ipcRenderer.invoke('project-management:save-commercial-result', payload),
    saveRetrospectiveInput: (payload) => ipcRenderer.invoke('project-management:save-retrospective-input', payload),
    generateRetrospective: (payload) => ipcRenderer.invoke('project-management:generate-retrospective', payload),
    saveRetrospectiveResult: (payload) => ipcRenderer.invoke('project-management:save-retrospective-result', payload),
    saveComplianceInput: (payload) => ipcRenderer.invoke('project-management:save-compliance-input', payload),
    generateCompliance: (payload) => ipcRenderer.invoke('project-management:generate-compliance', payload),
    saveComplianceResult: (payload) => ipcRenderer.invoke('project-management:save-compliance-result', payload),
    clear: () => ipcRenderer.invoke('project-management:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('project-management:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('project-management:event', listener);
      return () => ipcRenderer.removeListener('project-management:event', listener);
    },
  },
  presalesWorkbench: {
    loadState: (projectId) => ipcRenderer.invoke('presales-workbench:load-state', projectId),
    listProjects: () => ipcRenderer.invoke('presales-workbench:list-projects'),
    createProject: (payload) => ipcRenderer.invoke('presales-workbench:create-project', payload),
    switchProject: (projectId) => ipcRenderer.invoke('presales-workbench:switch-project', projectId),
    deleteProject: (projectId) => ipcRenderer.invoke('presales-workbench:delete-project', projectId),
    saveProfile: (profile) => ipcRenderer.invoke('presales-workbench:save-profile', profile),
    saveAnalysisInput: (input) => ipcRenderer.invoke('presales-workbench:save-analysis-input', input),
    saveAnalysisResult: (payload) => ipcRenderer.invoke('presales-workbench:save-analysis-result', payload),
    saveResearchInput: (input) => ipcRenderer.invoke('presales-workbench:save-research-input', input),
    saveResearchResult: (payload) => ipcRenderer.invoke('presales-workbench:save-research-result', payload),
    saveArchitectureInput: (input) => ipcRenderer.invoke('presales-workbench:save-architecture-input', input),
    saveArchitectureResult: (payload) => ipcRenderer.invoke('presales-workbench:save-architecture-result', payload),
    saveDiagramInput: (input) => ipcRenderer.invoke('presales-workbench:save-diagram-input', input),
    saveDiagramResult: (payload) => ipcRenderer.invoke('presales-workbench:save-diagram-result', payload),
    savePresentationInput: (input) => ipcRenderer.invoke('presales-workbench:save-presentation-input', input),
    savePresentationResult: (payload) => ipcRenderer.invoke('presales-workbench:save-presentation-result', payload),
    importMaterial: () => ipcRenderer.invoke('presales-workbench:import-material'),
    saveManualMaterial: (input) => ipcRenderer.invoke('presales-workbench:save-manual-material', input),
    readMaterialMarkdown: (materialId) => ipcRenderer.invoke('presales-workbench:read-material-markdown', materialId),
    generateAnalysis: () => ipcRenderer.invoke('presales-workbench:generate-analysis'),
    generateResearch: () => ipcRenderer.invoke('presales-workbench:generate-research'),
    generateArchitecture: () => ipcRenderer.invoke('presales-workbench:generate-architecture'),
    generateDiagrams: () => ipcRenderer.invoke('presales-workbench:generate-diagrams'),
    generatePresentation: () => ipcRenderer.invoke('presales-workbench:generate-presentation'),
    exportProjectPackage: () => ipcRenderer.invoke('presales-workbench:export-project-package'),
    exportPresentationOutline: () => ipcRenderer.invoke('presales-workbench:export-presentation-outline'),
    exportPresentationPptx: (options) => ipcRenderer.invoke('presales-workbench:export-presentation-pptx', options),
    recordExport: (payload) => ipcRenderer.invoke('presales-workbench:record-export', payload),
    clearExportRecords: () => ipcRenderer.invoke('presales-workbench:clear-export-records'),
    showExportFile: (filePath) => ipcRenderer.invoke('presales-workbench:show-export-file', filePath),
    getImageModelAvailability: () => ipcRenderer.invoke('presales-workbench:get-image-model-availability'),
    previewProjectPackage: () => ipcRenderer.invoke('presales-workbench:preview-project-package'),
    clear: () => ipcRenderer.invoke('presales-workbench:clear'),
  },
  thesisTutor: {
    loadState: () => ipcRenderer.invoke('thesis-tutor:load-state'),
    saveProfile: (profile) => ipcRenderer.invoke('thesis-tutor:save-profile', profile),
    saveChapters: (payload) => ipcRenderer.invoke('thesis-tutor:save-chapters', payload),
    saveReferences: (payload) => ipcRenderer.invoke('thesis-tutor:save-references', payload),
    saveFeedback: (payload) => ipcRenderer.invoke('thesis-tutor:save-feedback', payload),
    saveChecks: (payload) => ipcRenderer.invoke('thesis-tutor:save-checks', payload),
    saveHistory: (payload) => ipcRenderer.invoke('thesis-tutor:save-history', payload),
    saveProfileLock: (payload) => ipcRenderer.invoke('thesis-tutor:save-profile-lock', payload),
    generate: (payload) => ipcRenderer.invoke('thesis-tutor:generate', payload),
    saveDraft: (payload) => ipcRenderer.invoke('thesis-tutor:save-draft', payload),
    importSource: () => ipcRenderer.invoke('thesis-tutor:import-source'),
    exportWorkspace: () => ipcRenderer.invoke('thesis-tutor:export-workspace'),
    exportProjectPackage: () => ipcRenderer.invoke('thesis-tutor:export-project-package'),
    importWorkspace: () => ipcRenderer.invoke('thesis-tutor:import-workspace'),
    clear: () => ipcRenderer.invoke('thesis-tutor:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('thesis-tutor:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('thesis-tutor:event', listener);
      return () => ipcRenderer.removeListener('thesis-tutor:event', listener);
    },
  },
  knowledgeBase: {
    getMigrationStatus: () => ipcRenderer.invoke('knowledge-base:get-migration-status'),
    migrateLegacy: () => ipcRenderer.invoke('knowledge-base:migrate-legacy'),
    list: () => ipcRenderer.invoke('knowledge-base:list'),
    createFolder: (name) => ipcRenderer.invoke('knowledge-base:create-folder', name),
    renameFolder: (folderId, name) => ipcRenderer.invoke('knowledge-base:rename-folder', folderId, name),
    deleteFolder: (folderId) => ipcRenderer.invoke('knowledge-base:delete-folder', folderId),
    deleteDocument: (documentId) => ipcRenderer.invoke('knowledge-base:delete-document', documentId),
    uploadDocuments: (folderId) => ipcRenderer.invoke('knowledge-base:upload-documents', folderId),
    startMatching: (documentId, batchSize) => ipcRenderer.invoke('knowledge-base:start-matching', documentId, batchSize),
    readMarkdown: (documentId) => ipcRenderer.invoke('knowledge-base:read-markdown', documentId),
    readItems: (documentId) => ipcRenderer.invoke('knowledge-base:read-items', documentId),
    readAnalysis: (documentId) => ipcRenderer.invoke('knowledge-base:read-analysis', documentId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('knowledge-base:event', listener);
      return () => ipcRenderer.removeListener('knowledge-base:event', listener);
    },
  },
  technicalPlan: {
    listProjects: (workflowKind) => ipcRenderer.invoke('technical-plan:list-projects', workflowKind),
    createProject: (payload) => ipcRenderer.invoke('technical-plan:create-project', payload),
    renameProject: (payload) => ipcRenderer.invoke('technical-plan:rename-project', payload),
    deleteProject: (payload) => ipcRenderer.invoke('technical-plan:delete-project', payload),
    switchProject: (payload) => ipcRenderer.invoke('technical-plan:switch-project', payload),
    loadState: (payload) => ipcRenderer.invoke('technical-plan:load-state', payload),
    importTenderDocument: (payload) => ipcRenderer.invoke('technical-plan:import-tender-document', payload),
    importOriginalPlanDocument: (payload) => ipcRenderer.invoke('technical-plan:import-original-plan-document', payload),
    importGeneratedOriginalPlan: (payload) => ipcRenderer.invoke('technical-plan:import-generated-original-plan', payload),
    readTenderMarkdown: (payload) => ipcRenderer.invoke('technical-plan:read-tender-markdown', payload),
    readOriginalPlanMarkdown: (payload) => ipcRenderer.invoke('technical-plan:read-original-plan-markdown', payload),
    updateStep: (payload) => ipcRenderer.invoke('technical-plan:update-step', payload),
    switchWorkflowKind: (workflowKind) => ipcRenderer.invoke('technical-plan:switch-workflow-kind', workflowKind),
    saveOutlineConfig: (payload) => ipcRenderer.invoke('technical-plan:save-outline-config', payload),
    saveOutline: (outlineData) => ipcRenderer.invoke('technical-plan:save-outline', outlineData),
    saveGlobalFacts: (globalFacts) => ipcRenderer.invoke('technical-plan:save-global-facts', globalFacts),
    saveContentGenerationOptions: (options) => ipcRenderer.invoke('technical-plan:save-content-generation-options', options),
    saveChapterContent: (payload) => ipcRenderer.invoke('technical-plan:save-chapter-content', payload),
    clear: (workflowKind) => ipcRenderer.invoke('technical-plan:clear', workflowKind),
  },
  duplicateCheck: {
    loadState: () => ipcRenderer.invoke('duplicate-check:load-state'),
    saveFiles: (payload) => ipcRenderer.invoke('duplicate-check:save-files', payload),
    saveUiState: (payload) => ipcRenderer.invoke('duplicate-check:save-ui-state', payload),
    updateState: (partial) => ipcRenderer.invoke('duplicate-check:update-state', partial),
    clear: () => ipcRenderer.invoke('duplicate-check:clear'),
  },
  rejectionCheck: {
    loadState: () => ipcRenderer.invoke('rejection-check:load-state'),
    importDocument: (role) => ipcRenderer.invoke('rejection-check:import-document', role),
    importTenderFromTechnicalPlan: () => ipcRenderer.invoke('rejection-check:import-tender-from-technical-plan'),
    removeDocument: (role) => ipcRenderer.invoke('rejection-check:remove-document', role),
    saveUiState: (payload) => ipcRenderer.invoke('rejection-check:save-ui-state', payload),
    updateState: (partial) => ipcRenderer.invoke('rejection-check:update-state', partial),
    clear: () => ipcRenderer.invoke('rejection-check:clear'),
  },
  softwareCopyright: {
    loadState: () => ipcRenderer.invoke('software-copyright:load-state'),
    selectProject: () => ipcRenderer.invoke('software-copyright:select-project'),
    saveFields: (fields) => ipcRenderer.invoke('software-copyright:save-fields', fields),
    saveOptions: (options) => ipcRenderer.invoke('software-copyright:save-options', options),
    readDraft: (draftKey) => ipcRenderer.invoke('software-copyright:read-draft', draftKey),
    readCodeManifest: () => ipcRenderer.invoke('software-copyright:read-code-manifest'),
    regenerateCodeMaterial: (payload) => ipcRenderer.invoke('software-copyright:regenerate-code-material', payload),
    saveDraft: (payload) => ipcRenderer.invoke('software-copyright:save-draft', payload),
    validateDraft: () => ipcRenderer.invoke('software-copyright:validate-draft'),
    startGeneration: (payload) => ipcRenderer.invoke('software-copyright:start-generation', payload),
    confirmDraft: () => ipcRenderer.invoke('software-copyright:confirm-draft'),
    exportFinal: (payload) => ipcRenderer.invoke('software-copyright:export-final', payload),
    clear: () => ipcRenderer.invoke('software-copyright:clear'),
    openOutputDir: () => ipcRenderer.invoke('software-copyright:open-output-dir'),
    onEvent: (callback) => {
      ipcRenderer.send('software-copyright:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('software-copyright:event', listener);
      return () => ipcRenderer.removeListener('software-copyright:event', listener);
    },
  },
  patentGeneration: {
    loadState: () => ipcRenderer.invoke('patent-generation:load-state'),
    saveCaseInfo: (payload) => ipcRenderer.invoke('patent-generation:save-case-info', payload),
    selectPatentPoint: (pointId) => ipcRenderer.invoke('patent-generation:select-patent-point', pointId),
    selectProject: () => ipcRenderer.invoke('patent-generation:select-project'),
    startMining: () => ipcRenderer.invoke('patent-generation:start-mining'),
    generateDisclosureDraft: () => ipcRenderer.invoke('patent-generation:generate-disclosure-draft'),
    readDisclosureDraft: (draftId) => ipcRenderer.invoke('patent-generation:read-disclosure-draft', draftId),
    saveDisclosureDraft: (payload) => ipcRenderer.invoke('patent-generation:save-disclosure-draft', payload),
    generatePriorArtAnalysis: (payload) => ipcRenderer.invoke('patent-generation:generate-prior-art-analysis', payload),
    savePriorArtMarkdown: (markdown) => ipcRenderer.invoke('patent-generation:save-prior-art-markdown', markdown),
    generateRevision: (payload) => ipcRenderer.invoke('patent-generation:generate-revision', payload),
    clear: () => ipcRenderer.invoke('patent-generation:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('patent-generation:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('patent-generation:event', listener);
      return () => ipcRenderer.removeListener('patent-generation:event', listener);
    },
  },
  tasks: {
    startBidAnalysis: (payload) => ipcRenderer.invoke('tasks:start-bid-analysis', payload),
    startOutlineGeneration: (payload) => ipcRenderer.invoke('tasks:start-outline-generation', payload),
    startGlobalFactsGeneration: (payload) => ipcRenderer.invoke('tasks:start-global-facts-generation', payload),
    startContentGeneration: (payload) => ipcRenderer.invoke('tasks:start-content-generation', payload),
    pauseContentGeneration: (payload) => ipcRenderer.invoke('tasks:pause-content-generation', payload),
    startRejectionItemsExtraction: (payload) => ipcRenderer.invoke('tasks:start-rejection-items-extraction', payload),
    startRejectionCheck: (payload) => ipcRenderer.invoke('tasks:start-rejection-check', payload),
    startDuplicateAnalysis: (payload) => ipcRenderer.invoke('tasks:start-duplicate-analysis', payload),
    getActiveTasks: () => ipcRenderer.invoke('tasks:get-active'),
    onTaskEvent: (callback) => {
      ipcRenderer.send('tasks:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tasks:event', listener);
      return () => ipcRenderer.removeListener('tasks:event', listener);
    },
  },
  export: {
    exportWord: (payload) => ipcRenderer.invoke('export:word', payload),
    onWordExportProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('export:word-progress', listener);
      return () => ipcRenderer.removeListener('export:word-progress', listener);
    },
  },
};

contextBridge.exposeInMainWorld('yibiao', bridge);

contextBridge.exposeInMainWorld('yibiaoClient', {
  appName: bridge.appName,
  platform: bridge.platform,
});
