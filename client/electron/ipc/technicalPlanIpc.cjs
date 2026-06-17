const { ipcMain } = require('electron');

function registerTechnicalPlanIpc({ technicalPlanStore }) {
  ipcMain.handle('technical-plan:load-state', (_event, workflowKind) => technicalPlanStore.loadTechnicalPlan(workflowKind));
  ipcMain.handle('technical-plan:import-tender-document', (_event, workflowKind) => technicalPlanStore.importTenderDocument(workflowKind));
  ipcMain.handle('technical-plan:import-original-plan-document', (_event, workflowKind) => technicalPlanStore.importOriginalPlanDocument(workflowKind));
  ipcMain.handle('technical-plan:read-tender-markdown', (_event, workflowKind) => technicalPlanStore.readTenderMarkdown(workflowKind));
  ipcMain.handle('technical-plan:read-original-plan-markdown', (_event, workflowKind) => technicalPlanStore.readOriginalPlanMarkdown(workflowKind));
  ipcMain.handle('technical-plan:update-step', (_event, payload) => technicalPlanStore.updateStep(payload));
  ipcMain.handle('technical-plan:switch-workflow-kind', (_event, workflowKind) => technicalPlanStore.switchWorkflowKind(workflowKind));
  ipcMain.handle('technical-plan:save-outline-config', (_event, payload) => technicalPlanStore.saveOutlineConfig(payload));
  ipcMain.handle('technical-plan:save-outline', (_event, outlineData) => technicalPlanStore.saveOutline(outlineData));
  ipcMain.handle('technical-plan:save-global-facts', (_event, globalFacts) => technicalPlanStore.saveGlobalFacts(globalFacts));
  ipcMain.handle('technical-plan:save-content-generation-options', (_event, options) => technicalPlanStore.saveContentGenerationOptions(options));
  ipcMain.handle('technical-plan:save-chapter-content', (_event, payload) => technicalPlanStore.saveChapterContent(payload));
  ipcMain.handle('technical-plan:clear', (_event, workflowKind) => technicalPlanStore.clearTechnicalPlan(workflowKind));
}

module.exports = {
  registerTechnicalPlanIpc,
};
