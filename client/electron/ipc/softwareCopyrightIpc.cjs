const { ipcMain } = require('electron');

function registerSoftwareCopyrightIpc({ softwareCopyrightService }) {
  ipcMain.handle('software-copyright:load-state', () => softwareCopyrightService.loadState());
  ipcMain.handle('software-copyright:select-project', () => softwareCopyrightService.selectProject());
  ipcMain.handle('software-copyright:save-fields', (_event, fields) => softwareCopyrightService.saveFields(fields));
  ipcMain.handle('software-copyright:save-options', (_event, options) => softwareCopyrightService.saveOptions(options));
  ipcMain.handle('software-copyright:read-draft', (_event, draftKey) => softwareCopyrightService.readDraft(draftKey));
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
