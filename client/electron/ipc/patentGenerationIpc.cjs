const { ipcMain } = require('electron');

function registerPatentGenerationIpc({ patentGenerationService }) {
  ipcMain.handle('patent-generation:load-state', () => patentGenerationService.loadState());
  ipcMain.handle('patent-generation:save-case-info', (_event, payload) => patentGenerationService.saveCaseInfo(payload));
  ipcMain.handle('patent-generation:select-patent-point', (_event, pointId) => patentGenerationService.selectPatentPoint(pointId));
  ipcMain.handle('patent-generation:select-project', () => patentGenerationService.selectProject());
  ipcMain.handle('patent-generation:start-mining', () => patentGenerationService.startMining());
  ipcMain.handle('patent-generation:generate-disclosure-draft', () => patentGenerationService.generateDisclosureDraft());
  ipcMain.handle('patent-generation:read-disclosure-draft', (_event, draftId) => patentGenerationService.readDisclosureDraft(draftId));
  ipcMain.handle('patent-generation:save-disclosure-draft', (_event, payload) => patentGenerationService.saveDisclosureDraft(payload));
  ipcMain.handle('patent-generation:generate-prior-art-analysis', (_event, payload) => patentGenerationService.generatePriorArtAnalysis(payload));
  ipcMain.handle('patent-generation:save-prior-art-markdown', (_event, markdown) => patentGenerationService.savePriorArtMarkdown(markdown));
  ipcMain.handle('patent-generation:generate-revision', (_event, payload) => patentGenerationService.generateRevision(payload));
  ipcMain.handle('patent-generation:clear', () => patentGenerationService.clear());
  ipcMain.on('patent-generation:subscribe', (event) => {
    patentGenerationService.subscribe(event.sender);
  });
}

module.exports = {
  registerPatentGenerationIpc,
};
