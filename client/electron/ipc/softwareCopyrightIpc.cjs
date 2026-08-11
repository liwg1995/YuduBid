const { ipcMain } = require('electron');

function registerSoftwareCopyrightIpc({ softwareCopyrightService }) {
  ipcMain.handle('software-copyright:load-state', () => softwareCopyrightService.loadState());
  ipcMain.handle('software-copyright:list-cases', (_event, includeArchived) => softwareCopyrightService.listCases(includeArchived));
  ipcMain.handle('software-copyright:list-export-batches', () => softwareCopyrightService.listExportBatches());
  ipcMain.handle('software-copyright:open-export-batch', (_event, id) => softwareCopyrightService.openExportBatch(id));
  ipcMain.handle('software-copyright:get-submission-review', () => softwareCopyrightService.getSubmissionReview());
  ipcMain.handle('software-copyright:save-manual-review', (_event, payload) => softwareCopyrightService.saveManualReview(payload));
  ipcMain.handle('software-copyright:save-code-material-review', (_event, payload) => softwareCopyrightService.saveCodeMaterialReview(payload));
  ipcMain.handle('software-copyright:generate-submission-guide', () => softwareCopyrightService.generateSubmissionGuide());
  ipcMain.handle('software-copyright:open-submission-guide-directory', () => softwareCopyrightService.openSubmissionGuideDirectory());
  ipcMain.handle('software-copyright:create-case', (_event, payload) => softwareCopyrightService.createCase(payload));
  ipcMain.handle('software-copyright:switch-case', (_event, id) => softwareCopyrightService.switchCase(id));
  ipcMain.handle('software-copyright:duplicate-case', (_event, payload) => softwareCopyrightService.duplicateCase(payload));
  ipcMain.handle('software-copyright:delete-case', (_event, id) => softwareCopyrightService.deleteCase(id));
  ipcMain.handle('software-copyright:rename-case', (_event, payload) => softwareCopyrightService.renameCase(payload));
  ipcMain.handle('software-copyright:set-case-archived', (_event, payload) => softwareCopyrightService.setCaseArchived(payload));
  ipcMain.handle('software-copyright:select-project', () => softwareCopyrightService.selectProject());
  ipcMain.handle('software-copyright:save-fields', (_event, fields) => softwareCopyrightService.saveFields(fields));
  ipcMain.handle('software-copyright:generate-technical-features', (_event, payload) => softwareCopyrightService.generateTechnicalFeatures(payload));
  ipcMain.handle('software-copyright:save-options', (_event, options) => softwareCopyrightService.saveOptions(options));
  ipcMain.handle('software-copyright:save-manual-asset-review', (_event, payload) => softwareCopyrightService.saveManualAssetReview(payload));
  ipcMain.handle('software-copyright:import-manual-screenshots', () => softwareCopyrightService.importManualScreenshots());
  ipcMain.handle('software-copyright:update-manual-screenshot', (_event, payload) => softwareCopyrightService.updateManualScreenshot(payload));
  ipcMain.handle('software-copyright:reorder-manual-screenshots', (_event, ids) => softwareCopyrightService.reorderManualScreenshots(ids));
  ipcMain.handle('software-copyright:remove-manual-screenshot', (_event, id) => softwareCopyrightService.removeManualScreenshot(id));
  ipcMain.handle('software-copyright:save-ai-illustration-settings', (_event, payload) => softwareCopyrightService.saveAiIllustrationSettings(payload));
  ipcMain.handle('software-copyright:generate-ai-illustration-prompt', (_event, payload) => softwareCopyrightService.generateAiIllustrationPrompt(payload));
  ipcMain.handle('software-copyright:generate-ai-illustration', (_event, payload) => softwareCopyrightService.generateAiIllustration(payload));
  ipcMain.handle('software-copyright:regenerate-ai-illustration', (_event, payload) => softwareCopyrightService.regenerateAiIllustration(payload));
  ipcMain.handle('software-copyright:update-ai-illustration', (_event, payload) => softwareCopyrightService.updateAiIllustration(payload));
  ipcMain.handle('software-copyright:reorder-ai-illustrations', (_event, ids) => softwareCopyrightService.reorderAiIllustrations(ids));
  ipcMain.handle('software-copyright:remove-ai-illustration', (_event, id) => softwareCopyrightService.removeAiIllustration(id));
  ipcMain.handle('software-copyright:read-draft', (_event, draftKey) => softwareCopyrightService.readDraft(draftKey));
  ipcMain.handle('software-copyright:list-draft-versions', (_event, draftKey) => softwareCopyrightService.listDraftVersions(draftKey));
  ipcMain.handle('software-copyright:compare-draft-version', (_event, payload) => softwareCopyrightService.compareDraftVersion(payload));
  ipcMain.handle('software-copyright:restore-draft-version', (_event, payload) => softwareCopyrightService.restoreDraftVersion(payload));
  ipcMain.handle('software-copyright:read-code-manifest', () => softwareCopyrightService.readCodeManifest());
  ipcMain.handle('software-copyright:regenerate-code-material', (_event, payload) => softwareCopyrightService.regenerateCodeMaterial(payload));
  ipcMain.handle('software-copyright:save-draft', (_event, payload) => softwareCopyrightService.saveDraft(payload));
  ipcMain.handle('software-copyright:validate-draft', () => softwareCopyrightService.validateDraft());
  ipcMain.handle('software-copyright:start-generation', (event, payload) => {
    softwareCopyrightService.subscribe(event.sender);
    return softwareCopyrightService.startGeneration(payload);
  });
  ipcMain.handle('software-copyright:confirm-draft', () => softwareCopyrightService.confirmDraft());
  ipcMain.handle('software-copyright:export-final', (event, payload) => {
    softwareCopyrightService.subscribe(event.sender);
    return softwareCopyrightService.exportFinal(payload);
  });
  ipcMain.handle('software-copyright:clear', () => softwareCopyrightService.clear());
  ipcMain.handle('software-copyright:open-output-dir', () => softwareCopyrightService.openOutputDir());
  ipcMain.on('software-copyright:subscribe', (event) => {
    softwareCopyrightService.subscribe(event.sender);
  });
}

module.exports = {
  registerSoftwareCopyrightIpc,
};
