const { ipcMain } = require('electron');

function registerOfficialDocumentIpc({ officialDocumentService }) {
  ipcMain.handle('official-document:load-state', () => officialDocumentService.loadState());
  ipcMain.handle('official-document:save-input', (_event, input) => officialDocumentService.saveInput(input));
  ipcMain.handle('official-document:save-draft', (_event, draft) => officialDocumentService.saveDraft(draft));
  ipcMain.handle('official-document:save-revision', (_event, payload) => officialDocumentService.saveRevision(payload));
  ipcMain.handle('official-document:import-draft', () => officialDocumentService.importDraft());
  ipcMain.handle('official-document:extract-input', (event, payload) => {
    officialDocumentService.subscribe(event.sender);
    return officialDocumentService.extractInputFromDraft(payload);
  });
  ipcMain.handle('official-document:generate-draft', (event, payload) => {
    officialDocumentService.subscribe(event.sender);
    return officialDocumentService.generateDraft(payload);
  });
  ipcMain.handle('official-document:check-draft', (event, payload) => {
    officialDocumentService.subscribe(event.sender);
    return officialDocumentService.checkDraft(payload);
  });
  ipcMain.handle('official-document:polish-draft', (event, payload) => {
    officialDocumentService.subscribe(event.sender);
    return officialDocumentService.polishDraft(payload);
  });
  ipcMain.handle('official-document:rewrite-draft', (event, payload) => {
    officialDocumentService.subscribe(event.sender);
    return officialDocumentService.rewriteDraft(payload);
  });
  ipcMain.handle('official-document:clear', () => officialDocumentService.clear());
  ipcMain.on('official-document:subscribe', (event) => {
    officialDocumentService.subscribe(event.sender);
  });
}

module.exports = {
  registerOfficialDocumentIpc,
};
