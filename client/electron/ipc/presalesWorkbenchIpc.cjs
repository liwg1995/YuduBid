const { ipcMain } = require('electron');

function registerPresalesWorkbenchIpc({ presalesWorkbenchService }) {
  ipcMain.handle('presales-workbench:load-state', (_event, projectId) => presalesWorkbenchService.loadState(projectId));
  ipcMain.handle('presales-workbench:list-projects', () => presalesWorkbenchService.listProjects());
  ipcMain.handle('presales-workbench:create-project', (_event, payload) => presalesWorkbenchService.createProject(payload));
  ipcMain.handle('presales-workbench:switch-project', (_event, projectId) => presalesWorkbenchService.switchProject(projectId));
  ipcMain.handle('presales-workbench:delete-project', (_event, projectId) => presalesWorkbenchService.deleteProject(projectId));
  ipcMain.handle('presales-workbench:save-profile', (_event, profile) => presalesWorkbenchService.saveProfile(profile));
  ipcMain.handle('presales-workbench:save-analysis-input', (_event, input) => presalesWorkbenchService.saveAnalysisInput(input));
  ipcMain.handle('presales-workbench:save-analysis-result', (_event, payload) => presalesWorkbenchService.saveAnalysisResult(payload));
  ipcMain.handle('presales-workbench:save-research-input', (_event, input) => presalesWorkbenchService.saveResearchInput(input));
  ipcMain.handle('presales-workbench:save-research-result', (_event, payload) => presalesWorkbenchService.saveResearchResult(payload));
  ipcMain.handle('presales-workbench:save-architecture-input', (_event, input) => presalesWorkbenchService.saveArchitectureInput(input));
  ipcMain.handle('presales-workbench:save-architecture-result', (_event, payload) => presalesWorkbenchService.saveArchitectureResult(payload));
  ipcMain.handle('presales-workbench:save-diagram-input', (_event, input) => presalesWorkbenchService.saveDiagramInput(input));
  ipcMain.handle('presales-workbench:save-diagram-result', (_event, payload) => presalesWorkbenchService.saveDiagramResult(payload));
  ipcMain.handle('presales-workbench:save-presentation-input', (_event, input) => presalesWorkbenchService.savePresentationInput(input));
  ipcMain.handle('presales-workbench:save-presentation-result', (_event, payload) => presalesWorkbenchService.savePresentationResult(payload));
  ipcMain.handle('presales-workbench:import-material', () => presalesWorkbenchService.importMaterial());
  ipcMain.handle('presales-workbench:save-manual-material', (_event, input) => presalesWorkbenchService.saveManualMaterial(input));
  ipcMain.handle('presales-workbench:read-material-markdown', (_event, materialId) => presalesWorkbenchService.readMaterialMarkdown(materialId));
  ipcMain.handle('presales-workbench:generate-analysis', () => presalesWorkbenchService.generateAnalysis());
  ipcMain.handle('presales-workbench:generate-research', () => presalesWorkbenchService.generateResearch());
  ipcMain.handle('presales-workbench:generate-architecture', () => presalesWorkbenchService.generateArchitecture());
  ipcMain.handle('presales-workbench:generate-diagrams', () => presalesWorkbenchService.generateDiagrams());
  ipcMain.handle('presales-workbench:generate-presentation', () => presalesWorkbenchService.generatePresentation());
  ipcMain.handle('presales-workbench:export-project-package', () => presalesWorkbenchService.exportProjectPackage());
  ipcMain.handle('presales-workbench:export-presentation-outline', () => presalesWorkbenchService.exportPresentationOutline());
  ipcMain.handle('presales-workbench:export-presentation-pptx', (_event, options) => presalesWorkbenchService.exportPresentationPptx(options));
  ipcMain.handle('presales-workbench:record-export', (_event, payload) => presalesWorkbenchService.recordExport(payload));
  ipcMain.handle('presales-workbench:clear-export-records', () => presalesWorkbenchService.clearExportRecords());
  ipcMain.handle('presales-workbench:show-export-file', (_event, filePath) => presalesWorkbenchService.showExportFile(filePath));
  ipcMain.handle('presales-workbench:get-image-model-availability', () => presalesWorkbenchService.getImageModelAvailability());
  ipcMain.handle('presales-workbench:preview-project-package', () => presalesWorkbenchService.previewProjectPackage());
  ipcMain.handle('presales-workbench:clear', () => presalesWorkbenchService.clear());
}

module.exports = {
  registerPresalesWorkbenchIpc,
};
