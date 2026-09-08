const { ipcMain } = require('electron');

function registerPatentGenerationIpc({ patentGenerationService }) {
  ipcMain.handle('patent-generation:list-projects', () => patentGenerationService.listProjects());
  ipcMain.handle('patent-generation:create-project', (_event, payload) => patentGenerationService.createProject(payload));
  ipcMain.handle('patent-generation:switch-project', (_event, projectId) => patentGenerationService.switchProject(projectId));
  ipcMain.handle('patent-generation:rename-project', (_event, payload) => patentGenerationService.renameProject(payload));
  ipcMain.handle('patent-generation:archive-project', (_event, payload) => patentGenerationService.archiveProject(payload));
  ipcMain.handle('patent-generation:delete-project', (_event, projectId) => patentGenerationService.deleteProject(projectId));
  ipcMain.handle('patent-generation:load-state', () => patentGenerationService.loadState());
  ipcMain.handle('patent-generation:save-case-info', (_event, payload) => patentGenerationService.saveCaseInfo(payload));
  ipcMain.handle('patent-generation:generate-technical-topic', () => patentGenerationService.generateTechnicalTopic());
  ipcMain.handle('patent-generation:select-patent-point', (_event, pointId) => patentGenerationService.selectPatentPoint(pointId));
  ipcMain.handle('patent-generation:generate-fact-supplements', (_event, pointId) => patentGenerationService.generateFactSupplements(pointId));
  ipcMain.handle('patent-generation:save-fact-supplements', (_event, payload) => patentGenerationService.saveFactSupplements(payload));
  ipcMain.handle('patent-generation:select-project', () => patentGenerationService.selectProject());
  ipcMain.handle('patent-generation:start-mining', (_event, payload) => patentGenerationService.startMining(payload));
  ipcMain.handle('patent-generation:pause-mining', () => patentGenerationService.pauseMining());
  ipcMain.handle('patent-generation:stop-mining', () => patentGenerationService.stopMining());
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
