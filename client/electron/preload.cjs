const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  appName: '禹都AI解决方案助手',
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getLatestVersion: () => ipcRenderer.invoke('app:get-latest-version'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  startUpdate: () => ipcRenderer.invoke('app:start-update'),
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
    loadState: (workflowKind) => ipcRenderer.invoke('technical-plan:load-state', workflowKind),
    importTenderDocument: (workflowKind) => ipcRenderer.invoke('technical-plan:import-tender-document', workflowKind),
    importOriginalPlanDocument: (workflowKind) => ipcRenderer.invoke('technical-plan:import-original-plan-document', workflowKind),
    importGeneratedOriginalPlan: () => ipcRenderer.invoke('technical-plan:import-generated-original-plan'),
    readTenderMarkdown: (workflowKind) => ipcRenderer.invoke('technical-plan:read-tender-markdown', workflowKind),
    readOriginalPlanMarkdown: (workflowKind) => ipcRenderer.invoke('technical-plan:read-original-plan-markdown', workflowKind),
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
