const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preload scripts cannot require arbitrary local modules. Keep this
// small formatter here so a preload failure never removes the entire bridge.
function toChineseErrorMessage(value, fallback = '操作失败，请稍后重试') {
  let message = String(value?.message || value || '').trim();
  message = message
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, '')
    .replace(/^(?:(?:Error|ReferenceError|TypeError|RangeError|SyntaxError|NetworkError|AbortError):\s*)+/i, '')
    .split(/\n\s*at\s+/i)[0]
    .trim();

  if (/请求已取消|cancel(?:led)?|abort/i.test(message)) return '请求已取消';
  if (/超时|timed?\s*out|timeout/i.test(message)) return '请求超时，请稍后重试';
  if (/\b401\b|unauthorized|invalid api.?key|authentication/i.test(message)) return '服务认证失败，请检查密钥和模型配置';
  if (/\b403\b|forbidden/i.test(message)) return '当前服务拒绝访问，请检查账号权限';
  if (/\b404\b|not found/i.test(message)) return '请求的服务或资源不存在，请检查服务地址';
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return '请求过于频繁，请稍后重试';
  if (/\b5\d\d\b|bad gateway|service unavailable/i.test(message)) return '服务暂时不可用，请稍后重试';
  if (/failed to fetch|fetch failed|network(?: request)? failed|econnreset|enotfound|econnrefused/i.test(message)) return '网络请求失败，请检查网络和服务配置';
  if (/enoent|no such file or directory/i.test(message)) return '文件或目录不存在，请重新选择';
  if (/eacces|eperm|permission denied/i.test(message)) return '没有访问该文件或目录的权限';
  if (/is not defined|cannot read propert|undefined is not|not a function/i.test(message)) return '程序内部发生异常，请重启应用后重试';
  if (/unexpected token|json.*(?:parse|invalid)|invalid json/i.test(message)) return '返回数据格式错误，请重新生成';
  return /[\u3400-\u9fff]/.test(message) ? message : fallback;
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((error) => {
    throw new Error(toChineseErrorMessage(error));
  });
}

const bridge = {
  appName: '禹都AI解决方案助手',
  platform: process.platform,
  getVersion: () => invoke('app:get-version'),
  getLatestVersion: () => invoke('app:get-latest-version'),
  openExternal: (url) => invoke('app:open-external', url),
  checkUpdate: () => invoke('app:check-update'),
  startUpdate: () => invoke('app:start-update'),
  downloadReleaseInstaller: (payload) => invoke('app:download-release-installer', payload),
  cancelReleaseInstallerDownload: () => invoke('app:cancel-release-installer-download'),
  installDownloadedRelease: () => invoke('app:install-downloaded-release'),
  showDownloadedRelease: () => invoke('app:show-downloaded-release'),
  quitAndInstall: () => invoke('app:quit-and-install'),
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
    load: () => invoke('config:load'),
    save: (config) => invoke('config:save', config),
    listModels: (config) => invoke('config:list-models', config),
    getModelCapabilities: (config) => invoke('config:get-model-capabilities', config),
    openConfigFolder: () => invoke('config:open-config-folder'),
  },
  ai: {
    chat: (request) => invoke('ai:chat', request),
    requestJson: (request) => invoke('ai:request-json', request),
    testImageModel: (config) => invoke('ai:test-image-model', config),
  },
  usageStats: {
    getSummary: (range) => invoke('usage-stats:get-summary', range),
    clear: () => invoke('usage-stats:clear'),
  },
  file: {
    selectDuplicateCheckFiles: (options) => invoke('file:select-duplicate-check-files', options),
  },
  codeGeneration: {
    loadState: () => invoke('code-generation:load-state'),
    selectProject: () => invoke('code-generation:select-project'),
    updateSelection: (payload) => invoke('code-generation:update-selection', payload),
    rescan: () => invoke('code-generation:rescan'),
    confirmSelection: () => invoke('code-generation:confirm-selection'),
    clear: () => invoke('code-generation:clear'),
  },
  officialDocument: {
    loadState: () => invoke('official-document:load-state'),
    saveInput: (input) => invoke('official-document:save-input', input),
    saveDraft: (draft) => invoke('official-document:save-draft', draft),
    saveRevision: (payload) => invoke('official-document:save-revision', payload),
    importDraft: () => invoke('official-document:import-draft'),
    extractInput: (payload) => invoke('official-document:extract-input', payload),
    generateDraft: (payload) => invoke('official-document:generate-draft', payload),
    checkDraft: (payload) => invoke('official-document:check-draft', payload),
    polishDraft: (payload) => invoke('official-document:polish-draft', payload),
    rewriteDraft: (payload) => invoke('official-document:rewrite-draft', payload),
    clear: () => invoke('official-document:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('official-document:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('official-document:event', listener);
      return () => ipcRenderer.removeListener('official-document:event', listener);
    },
  },
  grantApplication: {
    loadState: () => invoke('grant-application:load-state'),
    listProjects: () => invoke('grant-application:list-projects'),
    createProject: (payload) => invoke('grant-application:create-project', payload),
    switchProject: (projectId) => invoke('grant-application:switch-project', projectId),
    renameProject: (payload) => invoke('grant-application:rename-project', payload),
    deleteProject: (projectId) => invoke('grant-application:delete-project', projectId),
    saveWorkspace: (payload) => invoke('grant-application:save-workspace', payload),
    saveOutput: (payload) => invoke('grant-application:save-output', payload),
    importMaterial: (payload) => invoke('grant-application:import-material', payload),
    exportWorkspaceJson: () => invoke('grant-application:export-workspace-json'),
    exportFormFields: () => invoke('grant-application:export-form-fields'),
    getFormFields: () => invoke('grant-application:get-form-fields'),
    importProposalTemplate: () => invoke('grant-application:import-proposal-template'),
    exportFilledProposalTemplate: () => invoke('grant-application:export-filled-proposal-template'),
    generate: (payload) => invoke('grant-application:generate', payload),
    generateProposalModule: (payload) => invoke('grant-application:generate-proposal-module', payload),
    saveProposalModule: (payload) => invoke('grant-application:save-proposal-module', payload),
    saveProposalVisualSettings: (payload) => invoke('grant-application:save-proposal-visual-settings', payload),
    polishProposalModule: (payload) => invoke('grant-application:polish-proposal-module', payload),
    combineProposalModules: () => invoke('grant-application:combine-proposal-modules'),
    generateProposalModuleQualityCheck: (payload) => invoke('grant-application:generate-proposal-module-quality-check', payload),
    generateProposalFinalReview: (payload) => invoke('grant-application:generate-proposal-final-review', payload),
    generateQualityReview: (payload) => invoke('grant-application:generate-quality-review', payload),
    clear: () => invoke('grant-application:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('grant-application:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('grant-application:event', listener);
      return () => ipcRenderer.removeListener('grant-application:event', listener);
    },
  },
  projectManagement: {
    loadState: () => invoke('project-management:load-state'),
    listProjects: () => invoke('project-management:list-projects'),
    readDictionaries: () => invoke('project-management:read-dictionaries'),
    saveDictionary: (payload) => invoke('project-management:save-dictionary', payload),
    createProject: (payload) => invoke('project-management:create-project', payload),
    switchProject: (projectId) => invoke('project-management:switch-project', projectId),
    deleteProject: (projectId) => invoke('project-management:delete-project', projectId),
    deleteProjects: (projectIds) => invoke('project-management:delete-projects', projectIds),
    saveProfile: (profile) => invoke('project-management:save-profile', profile),
    savePlanningInput: (payload) => invoke('project-management:save-planning-input', payload),
    generatePlanning: (payload) => invoke('project-management:generate-planning', payload),
    savePlanningResult: (payload) => invoke('project-management:save-planning-result', payload),
    saveDiscoveryInput: (payload) => invoke('project-management:save-discovery-input', payload),
    generateDiscovery: (payload) => invoke('project-management:generate-discovery', payload),
    saveDiscoveryResult: (payload) => invoke('project-management:save-discovery-result', payload),
    saveExecutionInput: (payload) => invoke('project-management:save-execution-input', payload),
    generateExecution: (payload) => invoke('project-management:generate-execution', payload),
    saveExecutionResult: (payload) => invoke('project-management:save-execution-result', payload),
    saveRiskInput: (payload) => invoke('project-management:save-risk-input', payload),
    generateRisk: (payload) => invoke('project-management:generate-risk', payload),
    saveRiskResult: (payload) => invoke('project-management:save-risk-result', payload),
    saveStakeholderInput: (payload) => invoke('project-management:save-stakeholder-input', payload),
    generateStakeholder: (payload) => invoke('project-management:generate-stakeholder', payload),
    saveStakeholderResult: (payload) => invoke('project-management:save-stakeholder-result', payload),
    saveDeliveryInput: (payload) => invoke('project-management:save-delivery-input', payload),
    generateDelivery: (payload) => invoke('project-management:generate-delivery', payload),
    saveDeliveryResult: (payload) => invoke('project-management:save-delivery-result', payload),
    saveReportingInput: (payload) => invoke('project-management:save-reporting-input', payload),
    generateReporting: (payload) => invoke('project-management:generate-reporting', payload),
    saveReportingResult: (payload) => invoke('project-management:save-reporting-result', payload),
    saveCommercialInput: (payload) => invoke('project-management:save-commercial-input', payload),
    generateCommercial: (payload) => invoke('project-management:generate-commercial', payload),
    saveCommercialResult: (payload) => invoke('project-management:save-commercial-result', payload),
    saveRetrospectiveInput: (payload) => invoke('project-management:save-retrospective-input', payload),
    generateRetrospective: (payload) => invoke('project-management:generate-retrospective', payload),
    saveRetrospectiveResult: (payload) => invoke('project-management:save-retrospective-result', payload),
    saveComplianceInput: (payload) => invoke('project-management:save-compliance-input', payload),
    generateCompliance: (payload) => invoke('project-management:generate-compliance', payload),
    saveComplianceResult: (payload) => invoke('project-management:save-compliance-result', payload),
    clear: () => invoke('project-management:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('project-management:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('project-management:event', listener);
      return () => ipcRenderer.removeListener('project-management:event', listener);
    },
  },
  presalesWorkbench: {
    loadState: (projectId) => invoke('presales-workbench:load-state', projectId),
    listProjects: () => invoke('presales-workbench:list-projects'),
    createProject: (payload) => invoke('presales-workbench:create-project', payload),
    switchProject: (projectId) => invoke('presales-workbench:switch-project', projectId),
    deleteProject: (projectId) => invoke('presales-workbench:delete-project', projectId),
    saveProfile: (profile) => invoke('presales-workbench:save-profile', profile),
    saveAnalysisInput: (input) => invoke('presales-workbench:save-analysis-input', input),
    saveAnalysisResult: (payload) => invoke('presales-workbench:save-analysis-result', payload),
    saveResearchInput: (input) => invoke('presales-workbench:save-research-input', input),
    saveResearchResult: (payload) => invoke('presales-workbench:save-research-result', payload),
    saveArchitectureInput: (input) => invoke('presales-workbench:save-architecture-input', input),
    saveArchitectureResult: (payload) => invoke('presales-workbench:save-architecture-result', payload),
    saveDiagramInput: (input) => invoke('presales-workbench:save-diagram-input', input),
    saveDiagramResult: (payload) => invoke('presales-workbench:save-diagram-result', payload),
    savePresentationInput: (input) => invoke('presales-workbench:save-presentation-input', input),
    savePresentationResult: (payload) => invoke('presales-workbench:save-presentation-result', payload),
    importMaterial: () => invoke('presales-workbench:import-material'),
    saveManualMaterial: (input) => invoke('presales-workbench:save-manual-material', input),
    readMaterialMarkdown: (materialId) => invoke('presales-workbench:read-material-markdown', materialId),
    generateAnalysis: () => invoke('presales-workbench:generate-analysis'),
    generateResearch: () => invoke('presales-workbench:generate-research'),
    generateArchitecture: () => invoke('presales-workbench:generate-architecture'),
    generateDiagrams: () => invoke('presales-workbench:generate-diagrams'),
    generatePresentation: () => invoke('presales-workbench:generate-presentation'),
    exportProjectPackage: () => invoke('presales-workbench:export-project-package'),
    exportPresentationOutline: () => invoke('presales-workbench:export-presentation-outline'),
    exportPresentationPptx: (options) => invoke('presales-workbench:export-presentation-pptx', options),
    recordExport: (payload) => invoke('presales-workbench:record-export', payload),
    clearExportRecords: () => invoke('presales-workbench:clear-export-records'),
    showExportFile: (filePath) => invoke('presales-workbench:show-export-file', filePath),
    getImageModelAvailability: () => invoke('presales-workbench:get-image-model-availability'),
    previewProjectPackage: () => invoke('presales-workbench:preview-project-package'),
    clear: () => invoke('presales-workbench:clear'),
  },
  bidOpportunity: {
    getSnapshot: (filters) => invoke('bid-opportunity:get-snapshot', filters),
    get: (opportunityId) => invoke('bid-opportunity:get', opportunityId),
    showReminder: () => invoke('bid-opportunity:show-reminder'),
    createWorkspaceBackup: () => invoke('bid-opportunity:create-workspace-backup'),
    verifyLatestBackup: () => invoke('bid-opportunity:verify-latest-backup'),
    save: (payload) => invoke('bid-opportunity:save', payload),
    importFile: () => invoke('bid-opportunity:import-file'),
    importTenderFile: (opportunityId) => invoke('bid-opportunity:import-tender-file', opportunityId),
    updateStatus: (payload) => invoke('bid-opportunity:update-status', payload),
    bulkUpdate: (payload) => invoke('bid-opportunity:bulk-update', payload),
    updateDecisionWorkflow: (payload) => invoke('bid-opportunity:update-decision-workflow', payload),
    saveMonitor: (payload) => invoke('bid-opportunity:save-monitor', payload),
    deleteMonitor: (monitorId) => invoke('bid-opportunity:delete-monitor', monitorId),
    createPresalesProject: (opportunityId) => invoke('bid-opportunity:create-presales-project', opportunityId),
    sendTenderToTechnicalPlan: (opportunityId) => invoke('bid-opportunity:send-tender-to-technical-plan', opportunityId),
    sendTenderToRejectionCheck: (opportunityId) => invoke('bid-opportunity:send-tender-to-rejection-check', opportunityId),
    getEnterpriseProfile: () => invoke('bid-opportunity:get-enterprise-profile'),
    saveEnterpriseProfile: (payload) => invoke('bid-opportunity:save-enterprise-profile', payload),
    startDeepAnalysis: (opportunityId) => invoke('bid-opportunity:start-deep-analysis', opportunityId),
    startSourceScan: (sourceId) => invoke('bid-opportunity:start-source-scan', sourceId),
    startAllSourceScans: () => invoke('bid-opportunity:start-all-source-scans'),
    mergeProjectClusters: (payload) => invoke('bid-opportunity:merge-project-clusters', payload),
    splitProjectCluster: (opportunityId) => invoke('bid-opportunity:split-project-cluster', opportunityId),
    updateSource: (payload) => invoke('bid-opportunity:update-source', payload),
    onEvent: (callback) => {
      ipcRenderer.send('bid-opportunity:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('bid-opportunity:event', listener);
      return () => ipcRenderer.removeListener('bid-opportunity:event', listener);
    },
  },
  thesisTutor: {
    loadState: () => invoke('thesis-tutor:load-state'),
    saveProfile: (profile) => invoke('thesis-tutor:save-profile', profile),
    saveChapters: (payload) => invoke('thesis-tutor:save-chapters', payload),
    saveReferences: (payload) => invoke('thesis-tutor:save-references', payload),
    saveFeedback: (payload) => invoke('thesis-tutor:save-feedback', payload),
    saveChecks: (payload) => invoke('thesis-tutor:save-checks', payload),
    saveHistory: (payload) => invoke('thesis-tutor:save-history', payload),
    saveProfileLock: (payload) => invoke('thesis-tutor:save-profile-lock', payload),
    generate: (payload) => invoke('thesis-tutor:generate', payload),
    saveDraft: (payload) => invoke('thesis-tutor:save-draft', payload),
    importSource: () => invoke('thesis-tutor:import-source'),
    exportWorkspace: () => invoke('thesis-tutor:export-workspace'),
    exportProjectPackage: () => invoke('thesis-tutor:export-project-package'),
    importWorkspace: () => invoke('thesis-tutor:import-workspace'),
    clear: () => invoke('thesis-tutor:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('thesis-tutor:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('thesis-tutor:event', listener);
      return () => ipcRenderer.removeListener('thesis-tutor:event', listener);
    },
  },
  knowledgeBase: {
    getMigrationStatus: () => invoke('knowledge-base:get-migration-status'),
    migrateLegacy: () => invoke('knowledge-base:migrate-legacy'),
    list: () => invoke('knowledge-base:list'),
    createFolder: (name) => invoke('knowledge-base:create-folder', name),
    renameFolder: (folderId, name) => invoke('knowledge-base:rename-folder', folderId, name),
    deleteFolder: (folderId) => invoke('knowledge-base:delete-folder', folderId),
    deleteDocument: (documentId) => invoke('knowledge-base:delete-document', documentId),
    uploadDocuments: (folderId) => invoke('knowledge-base:upload-documents', folderId),
    startMatching: (documentId, batchSize) => invoke('knowledge-base:start-matching', documentId, batchSize),
    readMarkdown: (documentId) => invoke('knowledge-base:read-markdown', documentId),
    readItems: (documentId) => invoke('knowledge-base:read-items', documentId),
    readAnalysis: (documentId) => invoke('knowledge-base:read-analysis', documentId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('knowledge-base:event', listener);
      return () => ipcRenderer.removeListener('knowledge-base:event', listener);
    },
  },
  knowledgeImage: {
    listFolders: () => invoke('knowledge-image:list-folders'),
    createFolder: (name) => invoke('knowledge-image:create-folder', name),
    renameFolder: (folderId, name) => invoke('knowledge-image:rename-folder', folderId, name),
    deleteFolder: (folderId, options) => invoke('knowledge-image:delete-folder', folderId, options),
    list: (folderId, query) => invoke('knowledge-image:list', folderId, query),
    upload: (folderId) => invoke('knowledge-image:upload', folderId),
    update: (imageId, patch) => invoke('knowledge-image:update', imageId, patch),
    move: (imageIds, folderId) => invoke('knowledge-image:move', imageIds, folderId),
    addTags: (imageIds, tags) => invoke('knowledge-image:add-tags', imageIds, tags),
    findReferences: (imageId) => invoke('knowledge-image:find-references', imageId),
    remove: (imageId, options) => invoke('knowledge-image:remove', imageId, options),
    getDataUrl: (imageId) => invoke('knowledge-image:get-data-url', imageId),
    getThumbnailDataUrl: (imageId) => invoke('knowledge-image:get-thumbnail-data-url', imageId),
  },
  technicalPlan: {
    listProjects: (workflowKind) => invoke('technical-plan:list-projects', workflowKind),
    createProject: (payload) => invoke('technical-plan:create-project', payload),
    renameProject: (payload) => invoke('technical-plan:rename-project', payload),
    deleteProject: (payload) => invoke('technical-plan:delete-project', payload),
    switchProject: (payload) => invoke('technical-plan:switch-project', payload),
    loadState: (payload) => invoke('technical-plan:load-state', payload),
    importTenderDocument: (payload) => invoke('technical-plan:import-tender-document', payload),
    importOriginalPlanDocument: (payload) => invoke('technical-plan:import-original-plan-document', payload),
    importGeneratedOriginalPlan: (payload) => invoke('technical-plan:import-generated-original-plan', payload),
    readTenderMarkdown: (payload) => invoke('technical-plan:read-tender-markdown', payload),
    readOriginalPlanMarkdown: (payload) => invoke('technical-plan:read-original-plan-markdown', payload),
    updateStep: (payload) => invoke('technical-plan:update-step', payload),
    switchWorkflowKind: (workflowKind) => invoke('technical-plan:switch-workflow-kind', workflowKind),
    saveOutlineConfig: (payload) => invoke('technical-plan:save-outline-config', payload),
    saveOutline: (outlineData) => invoke('technical-plan:save-outline', outlineData),
    saveTechnicalVolume: (payload) => invoke('technical-plan:save-technical-volume', payload),
    saveGlobalFacts: (globalFacts) => invoke('technical-plan:save-global-facts', globalFacts),
    saveContentGenerationOptions: (options) => invoke('technical-plan:save-content-generation-options', options),
    saveChapterContent: (payload) => invoke('technical-plan:save-chapter-content', payload),
    clear: (workflowKind) => invoke('technical-plan:clear', workflowKind),
  },
  feasibilityReport: {
    listProjects: () => invoke('feasibility-report:list-projects'),
    createProject: (payload) => invoke('feasibility-report:create-project', payload),
    renameProject: (payload) => invoke('feasibility-report:rename-project', payload),
    deleteProject: (payload) => invoke('feasibility-report:delete-project', payload),
    switchProject: (payload) => invoke('feasibility-report:switch-project', payload),
    loadState: (payload) => invoke('feasibility-report:load-state', payload),
    updateStep: (payload) => invoke('feasibility-report:update-step', payload),
    saveProjectInfo: (payload) => invoke('feasibility-report:save-project-info', payload),
    importSources: (payload) => invoke('feasibility-report:import-sources', payload),
    readSourceMarkdown: (payload) => invoke('feasibility-report:read-source-markdown', payload),
    removeSource: (payload) => invoke('feasibility-report:remove-source', payload),
    saveAnalysis: (payload) => invoke('feasibility-report:save-analysis', payload),
    saveOutlineConfig: (payload) => invoke('feasibility-report:save-outline-config', payload),
    saveOutline: (payload) => invoke('feasibility-report:save-outline', payload),
    saveKeyParameters: (payload) => invoke('feasibility-report:save-key-parameters', payload),
    saveChapterContent: (payload) => invoke('feasibility-report:save-chapter-content', payload),
    saveContentGenerationOptions: (payload) => invoke('feasibility-report:save-content-generation-options', payload),
    startAnalysis: (payload) => invoke('feasibility-report:start-analysis', payload),
    startOutline: (payload) => invoke('feasibility-report:start-outline', payload),
    startOutlineAdjustment: (payload) => invoke('feasibility-report:start-outline-adjustment', payload),
    startParameters: (payload) => invoke('feasibility-report:start-parameters', payload),
    startContent: (payload) => invoke('feasibility-report:start-content', payload),
    pauseContent: (payload) => invoke('feasibility-report:pause-content', payload),
    startHumanWriting: (payload) => invoke('feasibility-report:start-human-writing', payload),
    getActiveTasks: (payload) => invoke('feasibility-report:get-active-tasks', payload),
    onTaskEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.send('feasibility-report:subscribe-tasks');
      ipcRenderer.on('feasibility-report:task-event', listener);
      return () => ipcRenderer.removeListener('feasibility-report:task-event', listener);
    },
    clear: (payload) => invoke('feasibility-report:clear', payload),
  },
  duplicateCheck: {
    loadState: () => invoke('duplicate-check:load-state'),
    saveFiles: (payload) => invoke('duplicate-check:save-files', payload),
    saveUiState: (payload) => invoke('duplicate-check:save-ui-state', payload),
    updateState: (partial) => invoke('duplicate-check:update-state', partial),
    exportExcel: () => invoke('duplicate-check:export-excel'),
    clear: () => invoke('duplicate-check:clear'),
  },
  rejectionCheck: {
    loadState: () => invoke('rejection-check:load-state'),
    importDocument: (role) => invoke('rejection-check:import-document', role),
    importBidDocuments: () => invoke('rejection-check:import-bid-documents'),
    importTenderFromTechnicalPlan: (payload) => invoke('rejection-check:import-tender-from-technical-plan', payload),
    importBidFromTechnicalPlan: () => invoke('rejection-check:import-bid-from-technical-plan'),
    removeDocument: (role) => invoke('rejection-check:remove-document', role),
    saveUiState: (payload) => invoke('rejection-check:save-ui-state', payload),
    updateState: (partial) => invoke('rejection-check:update-state', partial),
    exportExcel: () => invoke('rejection-check:export-excel'),
    clear: () => invoke('rejection-check:clear'),
  },
  softwareCopyright: {
    loadState: () => invoke('software-copyright:load-state'),
    listCases: (includeArchived) => invoke('software-copyright:list-cases', includeArchived),
    listExportBatches: () => invoke('software-copyright:list-export-batches'),
    openExportBatch: (id) => invoke('software-copyright:open-export-batch', id),
    getSubmissionReview: () => invoke('software-copyright:get-submission-review'),
    saveManualReview: (payload) => invoke('software-copyright:save-manual-review', payload),
    saveCodeMaterialReview: (payload) => invoke('software-copyright:save-code-material-review', payload),
    generateSubmissionGuide: () => invoke('software-copyright:generate-submission-guide'),
    openSubmissionGuideDirectory: () => invoke('software-copyright:open-submission-guide-directory'),
    createCase: (payload) => invoke('software-copyright:create-case', payload),
    switchCase: (id) => invoke('software-copyright:switch-case', id),
    duplicateCase: (payload) => invoke('software-copyright:duplicate-case', payload),
    deleteCase: (id) => invoke('software-copyright:delete-case', id),
    renameCase: (payload) => invoke('software-copyright:rename-case', payload),
    setCaseArchived: (payload) => invoke('software-copyright:set-case-archived', payload),
    selectProject: () => invoke('software-copyright:select-project'),
    saveFields: (fields) => invoke('software-copyright:save-fields', fields),
    generateTechnicalFeatures: (payload) => invoke('software-copyright:generate-technical-features', payload),
    saveOptions: (options) => invoke('software-copyright:save-options', options),
    saveManualAssetReview: (payload) => invoke('software-copyright:save-manual-asset-review', payload),
    importManualScreenshots: () => invoke('software-copyright:import-manual-screenshots'),
    updateManualScreenshot: (payload) => invoke('software-copyright:update-manual-screenshot', payload),
    reorderManualScreenshots: (ids) => invoke('software-copyright:reorder-manual-screenshots', ids),
    removeManualScreenshot: (id) => invoke('software-copyright:remove-manual-screenshot', id),
    saveAiIllustrationSettings: (payload) => invoke('software-copyright:save-ai-illustration-settings', payload),
    generateAiIllustrationPrompt: (payload) => invoke('software-copyright:generate-ai-illustration-prompt', payload),
    generateAiIllustration: (payload) => invoke('software-copyright:generate-ai-illustration', payload),
    regenerateAiIllustration: (payload) => invoke('software-copyright:regenerate-ai-illustration', payload),
    updateAiIllustration: (payload) => invoke('software-copyright:update-ai-illustration', payload),
    reorderAiIllustrations: (ids) => invoke('software-copyright:reorder-ai-illustrations', ids),
    removeAiIllustration: (id) => invoke('software-copyright:remove-ai-illustration', id),
    readDraft: (draftKey) => invoke('software-copyright:read-draft', draftKey),
    listDraftVersions: (draftKey) => invoke('software-copyright:list-draft-versions', draftKey),
    compareDraftVersion: (payload) => invoke('software-copyright:compare-draft-version', payload),
    restoreDraftVersion: (payload) => invoke('software-copyright:restore-draft-version', payload),
    readCodeManifest: () => invoke('software-copyright:read-code-manifest'),
    regenerateCodeMaterial: (payload) => invoke('software-copyright:regenerate-code-material', payload),
    saveDraft: (payload) => invoke('software-copyright:save-draft', payload),
    validateDraft: () => invoke('software-copyright:validate-draft'),
    startGeneration: (payload) => invoke('software-copyright:start-generation', payload),
    confirmDraft: () => invoke('software-copyright:confirm-draft'),
    exportFinal: (payload) => invoke('software-copyright:export-final', payload),
    clear: () => invoke('software-copyright:clear'),
    openOutputDir: () => invoke('software-copyright:open-output-dir'),
    onEvent: (callback) => {
      ipcRenderer.send('software-copyright:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('software-copyright:event', listener);
      return () => ipcRenderer.removeListener('software-copyright:event', listener);
    },
  },
  patentGeneration: {
    listProjects: () => invoke('patent-generation:list-projects'),
    createProject: (payload) => invoke('patent-generation:create-project', payload),
    switchProject: (projectId) => invoke('patent-generation:switch-project', projectId),
    renameProject: (payload) => invoke('patent-generation:rename-project', payload),
    archiveProject: (payload) => invoke('patent-generation:archive-project', payload),
    deleteProject: (projectId) => invoke('patent-generation:delete-project', projectId),
    loadState: () => invoke('patent-generation:load-state'),
    saveCaseInfo: (payload) => invoke('patent-generation:save-case-info', payload),
    generateTechnicalTopic: () => invoke('patent-generation:generate-technical-topic'),
    selectPatentPoint: (pointId) => invoke('patent-generation:select-patent-point', pointId),
    generateFactSupplements: (pointId) => invoke('patent-generation:generate-fact-supplements', pointId),
    saveFactSupplements: (payload) => invoke('patent-generation:save-fact-supplements', payload),
    selectProject: () => invoke('patent-generation:select-project'),
    startMining: (payload) => invoke('patent-generation:start-mining', payload),
    pauseMining: () => invoke('patent-generation:pause-mining'),
    stopMining: () => invoke('patent-generation:stop-mining'),
    generateDisclosureDraft: () => invoke('patent-generation:generate-disclosure-draft'),
    readDisclosureDraft: (draftId) => invoke('patent-generation:read-disclosure-draft', draftId),
    saveDisclosureDraft: (payload) => invoke('patent-generation:save-disclosure-draft', payload),
    generatePriorArtAnalysis: (payload) => invoke('patent-generation:generate-prior-art-analysis', payload),
    savePriorArtMarkdown: (markdown) => invoke('patent-generation:save-prior-art-markdown', markdown),
    generateRevision: (payload) => invoke('patent-generation:generate-revision', payload),
    clear: () => invoke('patent-generation:clear'),
    onEvent: (callback) => {
      ipcRenderer.send('patent-generation:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('patent-generation:event', listener);
      return () => ipcRenderer.removeListener('patent-generation:event', listener);
    },
  },
  plugins: {
    list: () => invoke('plugins:list'),
    importPackage: () => invoke('plugins:import'),
    enable: (pluginId) => invoke('plugins:enable', pluginId),
    disable: (pluginId) => invoke('plugins:disable', pluginId),
    uninstall: (pluginId, options) => invoke('plugins:uninstall', pluginId, options),
    request: (pluginId, method, params) => invoke('plugins:request', pluginId, method, params),
    onEvent: (callback) => {
      ipcRenderer.send('plugins:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('plugins:event', listener);
      return () => ipcRenderer.removeListener('plugins:event', listener);
    },
  },
  tasks: {
    startBidAnalysis: (payload) => invoke('tasks:start-bid-analysis', payload),
    startOutlineGeneration: (payload) => invoke('tasks:start-outline-generation', payload),
    startGlobalFactsGeneration: (payload) => invoke('tasks:start-global-facts-generation', payload),
    startContentGeneration: (payload) => invoke('tasks:start-content-generation', payload),
    pauseContentGeneration: (payload) => invoke('tasks:pause-content-generation', payload),
    stopContentGeneration: (payload) => invoke('tasks:stop-content-generation', payload),
    startRejectionItemsExtraction: (payload) => invoke('tasks:start-rejection-items-extraction', payload),
    startRejectionCheck: (payload) => invoke('tasks:start-rejection-check', payload),
    startDuplicateAnalysis: (payload) => invoke('tasks:start-duplicate-analysis', payload),
    getActiveTasks: () => invoke('tasks:get-active'),
    onTaskEvent: (callback) => {
      ipcRenderer.send('tasks:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tasks:event', listener);
      return () => ipcRenderer.removeListener('tasks:event', listener);
    },
  },
  bidTemplates: {
    list: () => invoke('bid-templates:list'),
    get: (templateId) => invoke('bid-templates:get', templateId),
    create: (config) => invoke('bid-templates:create', config),
    update: (templateId, config) => invoke('bid-templates:update', templateId, config),
    delete: (templateId) => invoke('bid-templates:delete', templateId),
    selectCoverLogo: () => invoke('bid-templates:select-cover-logo'),
    getCoverLogoPreview: (filePath) => invoke('bid-templates:get-cover-logo-preview', filePath),
    export: (templateId) => invoke('bid-templates:export', templateId),
    import: () => invoke('bid-templates:import'),
  },
  systemFonts: {
    list: () => invoke('system-fonts:list'),
  },
  export: {
    exportWord: (payload) => invoke('export:word', payload),
    showExportFile: (filePath) => invoke('export:show-file', filePath),
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
