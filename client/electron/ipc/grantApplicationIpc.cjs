const { ipcMain } = require('electron');

function registerGrantApplicationIpc({ grantApplicationService }) {
  ipcMain.handle('grant-application:load-state', () => grantApplicationService.loadState());
  ipcMain.handle('grant-application:list-projects', () => grantApplicationService.listProjects());
  ipcMain.handle('grant-application:create-project', (_event, payload) => grantApplicationService.createProject(payload));
  ipcMain.handle('grant-application:switch-project', (_event, projectId) => grantApplicationService.switchProject(projectId));
  ipcMain.handle('grant-application:rename-project', (_event, payload) => grantApplicationService.renameProject(payload));
  ipcMain.handle('grant-application:delete-project', (_event, projectId) => grantApplicationService.deleteProject(projectId));
  ipcMain.handle('grant-application:save-workspace', (_event, payload) => grantApplicationService.saveWorkspace(payload));
  ipcMain.handle('grant-application:save-output', (_event, payload) => grantApplicationService.saveOutput(payload));
  ipcMain.handle('grant-application:import-material', (_event, payload) => grantApplicationService.importMaterial(payload));
  ipcMain.handle('grant-application:export-workspace-json', () => grantApplicationService.exportWorkspaceJson());
  ipcMain.handle('grant-application:export-form-fields', () => grantApplicationService.exportFormFields());
  ipcMain.handle('grant-application:get-form-fields', () => grantApplicationService.getFormFields());
  ipcMain.handle('grant-application:import-proposal-template', () => grantApplicationService.importProposalTemplate());
  ipcMain.handle('grant-application:export-filled-proposal-template', () => grantApplicationService.exportFilledProposalTemplate());
  ipcMain.handle('grant-application:generate', (_event, payload) => grantApplicationService.generate(payload));
  ipcMain.handle('grant-application:generate-proposal-module', (_event, payload) => grantApplicationService.generateProposalModule(payload));
  ipcMain.handle('grant-application:save-proposal-module', (_event, payload) => grantApplicationService.saveProposalModule(payload));
  ipcMain.handle('grant-application:save-proposal-visual-settings', (_event, payload) => grantApplicationService.saveProposalVisualSettings(payload));
  ipcMain.handle('grant-application:polish-proposal-module', (_event, payload) => grantApplicationService.polishProposalModule(payload));
  ipcMain.handle('grant-application:combine-proposal-modules', () => grantApplicationService.combineProposalModules());
  ipcMain.handle('grant-application:generate-proposal-module-quality-check', (_event, payload) => grantApplicationService.generateProposalModuleQualityCheck(payload));
  ipcMain.handle('grant-application:generate-proposal-final-review', (_event, payload) => grantApplicationService.generateProposalFinalReview(payload));
  ipcMain.handle('grant-application:generate-quality-review', (_event, payload) => grantApplicationService.generateQualityReview(payload));
  ipcMain.handle('grant-application:clear', () => grantApplicationService.clear());
  ipcMain.on('grant-application:subscribe', (event) => {
    grantApplicationService.subscribe(event.sender);
  });
}

module.exports = {
  registerGrantApplicationIpc,
};
