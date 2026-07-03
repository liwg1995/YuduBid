const { ipcMain } = require('electron');

function registerProjectManagementIpc({ projectManagementService }) {
  ipcMain.handle('project-management:load-state', () => projectManagementService.loadState());
  ipcMain.handle('project-management:list-projects', () => projectManagementService.listProjects());
  ipcMain.handle('project-management:read-dictionaries', () => projectManagementService.readDictionaries());
  ipcMain.handle('project-management:save-dictionary', (_event, payload) => projectManagementService.saveDictionary(payload?.kind, payload?.items));
  ipcMain.handle('project-management:create-project', (_event, payload) => projectManagementService.createProject(payload));
  ipcMain.handle('project-management:switch-project', (_event, projectId) => projectManagementService.switchProject(projectId));
  ipcMain.handle('project-management:delete-project', (_event, projectId) => projectManagementService.deleteProject(projectId));
  ipcMain.handle('project-management:delete-projects', (_event, projectIds) => projectManagementService.deleteProjects(projectIds));
  ipcMain.handle('project-management:save-profile', (_event, profile) => projectManagementService.saveProfile(profile));
  ipcMain.handle('project-management:save-planning-input', (_event, payload) => projectManagementService.savePlanningInput(payload));
  ipcMain.handle('project-management:generate-planning', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generatePlanning(payload);
  });
  ipcMain.handle('project-management:save-planning-result', (_event, payload) => projectManagementService.savePlanningResult(payload));
  ipcMain.handle('project-management:save-discovery-input', (_event, payload) => projectManagementService.saveDiscoveryInput(payload));
  ipcMain.handle('project-management:generate-discovery', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateDiscovery(payload);
  });
  ipcMain.handle('project-management:save-discovery-result', (_event, payload) => projectManagementService.saveDiscoveryResult(payload));
  ipcMain.handle('project-management:save-execution-input', (_event, payload) => projectManagementService.saveExecutionInput(payload));
  ipcMain.handle('project-management:generate-execution', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateExecution(payload);
  });
  ipcMain.handle('project-management:save-execution-result', (_event, payload) => projectManagementService.saveExecutionResult(payload));
  ipcMain.handle('project-management:save-risk-input', (_event, payload) => projectManagementService.saveRiskInput(payload));
  ipcMain.handle('project-management:generate-risk', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateRisk(payload);
  });
  ipcMain.handle('project-management:save-risk-result', (_event, payload) => projectManagementService.saveRiskResult(payload));
  ipcMain.handle('project-management:save-stakeholder-input', (_event, payload) => projectManagementService.saveStakeholderInput(payload));
  ipcMain.handle('project-management:generate-stakeholder', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateStakeholder(payload);
  });
  ipcMain.handle('project-management:save-stakeholder-result', (_event, payload) => projectManagementService.saveStakeholderResult(payload));
  ipcMain.handle('project-management:save-delivery-input', (_event, payload) => projectManagementService.saveDeliveryInput(payload));
  ipcMain.handle('project-management:generate-delivery', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateDelivery(payload);
  });
  ipcMain.handle('project-management:save-delivery-result', (_event, payload) => projectManagementService.saveDeliveryResult(payload));
  ipcMain.handle('project-management:save-reporting-input', (_event, payload) => projectManagementService.saveReportingInput(payload));
  ipcMain.handle('project-management:generate-reporting', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateReporting(payload);
  });
  ipcMain.handle('project-management:save-reporting-result', (_event, payload) => projectManagementService.saveReportingResult(payload));
  ipcMain.handle('project-management:save-commercial-input', (_event, payload) => projectManagementService.saveCommercialInput(payload));
  ipcMain.handle('project-management:generate-commercial', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateCommercial(payload);
  });
  ipcMain.handle('project-management:save-commercial-result', (_event, payload) => projectManagementService.saveCommercialResult(payload));
  ipcMain.handle('project-management:save-retrospective-input', (_event, payload) => projectManagementService.saveRetrospectiveInput(payload));
  ipcMain.handle('project-management:generate-retrospective', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateRetrospective(payload);
  });
  ipcMain.handle('project-management:save-retrospective-result', (_event, payload) => projectManagementService.saveRetrospectiveResult(payload));
  ipcMain.handle('project-management:save-compliance-input', (_event, payload) => projectManagementService.saveComplianceInput(payload));
  ipcMain.handle('project-management:generate-compliance', (event, payload) => {
    projectManagementService.subscribe(event.sender);
    return projectManagementService.generateCompliance(payload);
  });
  ipcMain.handle('project-management:save-compliance-result', (_event, payload) => projectManagementService.saveComplianceResult(payload));
  ipcMain.handle('project-management:clear', () => projectManagementService.clear());
  ipcMain.on('project-management:subscribe', (event) => {
    projectManagementService.subscribe(event.sender);
  });
}

module.exports = {
  registerProjectManagementIpc,
};
