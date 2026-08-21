const { ipcMain } = require('electron');

function registerFeasibilityReportIpc({ feasibilityReportStore, feasibilityReportTaskService }) {
  ipcMain.handle('feasibility-report:list-projects', () => feasibilityReportStore.listProjects());
  ipcMain.handle('feasibility-report:create-project', (_event, payload) => feasibilityReportStore.createProject(payload));
  ipcMain.handle('feasibility-report:rename-project', (_event, payload) => feasibilityReportStore.renameProject(payload));
  ipcMain.handle('feasibility-report:delete-project', (_event, payload) => feasibilityReportStore.deleteProject(payload));
  ipcMain.handle('feasibility-report:switch-project', (_event, payload) => feasibilityReportStore.switchProject(payload));
  ipcMain.handle('feasibility-report:load-state', (_event, payload) => feasibilityReportStore.loadState(payload));
  ipcMain.handle('feasibility-report:update-step', (_event, payload) => feasibilityReportStore.updateStep(payload));
  ipcMain.handle('feasibility-report:save-project-info', (_event, payload) => feasibilityReportStore.saveProjectInfo(payload));
  ipcMain.handle('feasibility-report:import-sources', (_event, payload) => feasibilityReportStore.importSources(payload));
  ipcMain.handle('feasibility-report:read-source-markdown', (_event, payload) => feasibilityReportStore.readSourceMarkdown(payload));
  ipcMain.handle('feasibility-report:remove-source', (_event, payload) => feasibilityReportStore.removeSource(payload));
  ipcMain.handle('feasibility-report:save-analysis', (_event, payload) => feasibilityReportStore.saveAnalysis(payload));
  ipcMain.handle('feasibility-report:save-outline-config', (_event, payload) => feasibilityReportStore.saveOutlineConfig(payload));
  ipcMain.handle('feasibility-report:save-outline', (_event, payload) => feasibilityReportStore.saveOutline(payload));
  ipcMain.handle('feasibility-report:save-key-parameters', (_event, payload) => feasibilityReportStore.saveKeyParameters(payload));
  ipcMain.handle('feasibility-report:save-chapter-content', (_event, payload) => feasibilityReportStore.saveChapterContent(payload));
  ipcMain.handle('feasibility-report:save-content-generation-options', (_event, payload) => feasibilityReportStore.saveContentGenerationOptions(payload));
  ipcMain.handle('feasibility-report:clear', (_event, payload) => feasibilityReportStore.clearProject(payload));
  ipcMain.handle('feasibility-report:start-analysis', (_event, payload) => feasibilityReportTaskService.startAnalysis(payload));
  ipcMain.handle('feasibility-report:start-outline', (_event, payload) => feasibilityReportTaskService.startOutline(payload));
  ipcMain.handle('feasibility-report:start-outline-adjustment', (_event, payload) => feasibilityReportTaskService.startOutlineAdjustment(payload));
  ipcMain.handle('feasibility-report:start-parameters', (_event, payload) => feasibilityReportTaskService.startParameters(payload));
  ipcMain.handle('feasibility-report:start-content', (_event, payload) => feasibilityReportTaskService.startContent(payload));
  ipcMain.handle('feasibility-report:pause-content', (_event, payload) => feasibilityReportTaskService.pauseContent(payload));
  ipcMain.handle('feasibility-report:start-human-writing', (_event, payload) => feasibilityReportTaskService.startHumanWriting(payload));
  ipcMain.handle('feasibility-report:get-active-tasks', (_event, payload) => feasibilityReportTaskService.getActiveTasks(payload));
  ipcMain.on('feasibility-report:subscribe-tasks', (event) => feasibilityReportTaskService.subscribe(event.sender));
}

module.exports = { registerFeasibilityReportIpc };
