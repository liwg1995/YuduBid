const { ipcMain, Notification } = require('electron');

function registerBidOpportunityIpc({ bidOpportunityService }) {
  ipcMain.handle('bid-opportunity:get-snapshot', (event, filters) => {
    bidOpportunityService.subscribe(event.sender);
    return bidOpportunityService.getSnapshot(filters);
  });
  ipcMain.handle('bid-opportunity:get', (_event, opportunityId) => bidOpportunityService.getOpportunity(opportunityId));
  ipcMain.handle('bid-opportunity:show-reminder', () => {
    const summary = bidOpportunityService.getReminderSummary();
    if (!Notification.isSupported()) return { ...summary, shown: false, message: '当前系统不支持桌面通知' };
    const body = summary.overdue || summary.today || summary.urgentDeadlines
      ? `逾期待办 ${summary.overdue} 项，今日到期 ${summary.today} 项，3 天内投标截止 ${summary.urgentDeadlines} 项`
      : '当前没有逾期、今日到期或 3 天内投标截止事项。';
    new Notification({ title: '投标机会提醒', body }).show();
    return { ...summary, shown: true, message: body };
  });
  ipcMain.handle('bid-opportunity:create-workspace-backup', () => bidOpportunityService.createWorkspaceBackup());
  ipcMain.handle('bid-opportunity:verify-latest-backup', () => bidOpportunityService.verifyLatestBackup());
  ipcMain.handle('bid-opportunity:save', (_event, payload) => bidOpportunityService.saveOpportunity(payload));
  ipcMain.handle('bid-opportunity:import-file', () => bidOpportunityService.importOpportunityFile());
  ipcMain.handle('bid-opportunity:import-tender-file', (_event, opportunityId) => bidOpportunityService.importTenderFile(opportunityId));
  ipcMain.handle('bid-opportunity:update-status', (_event, payload) => bidOpportunityService.updateStatus(payload));
  ipcMain.handle('bid-opportunity:bulk-update', (_event, payload) => bidOpportunityService.bulkUpdate(payload));
  ipcMain.handle('bid-opportunity:update-decision-workflow', (_event, payload) => bidOpportunityService.updateDecisionWorkflow(payload));
  ipcMain.handle('bid-opportunity:save-monitor', (_event, payload) => bidOpportunityService.saveMonitor(payload));
  ipcMain.handle('bid-opportunity:delete-monitor', (_event, monitorId) => bidOpportunityService.deleteMonitor(monitorId));
  ipcMain.handle('bid-opportunity:create-presales-project', (_event, opportunityId) => bidOpportunityService.createPresalesProject(opportunityId));
  ipcMain.handle('bid-opportunity:send-tender-to-technical-plan', (_event, opportunityId) => bidOpportunityService.sendTenderToTechnicalPlan(opportunityId));
  ipcMain.handle('bid-opportunity:send-tender-to-rejection-check', (_event, opportunityId) => bidOpportunityService.sendTenderToRejectionCheck(opportunityId));
  ipcMain.handle('bid-opportunity:get-enterprise-profile', () => bidOpportunityService.getEnterpriseProfile());
  ipcMain.handle('bid-opportunity:save-enterprise-profile', (_event, payload) => bidOpportunityService.saveEnterpriseProfile(payload));
  ipcMain.handle('bid-opportunity:start-deep-analysis', (event, opportunityId) => {
    bidOpportunityService.subscribe(event.sender);
    return bidOpportunityService.startDeepAnalysis(opportunityId);
  });
  ipcMain.handle('bid-opportunity:start-source-scan', (event, sourceId) => {
    bidOpportunityService.subscribe(event.sender);
    return bidOpportunityService.startSourceScan(sourceId);
  });
  ipcMain.handle('bid-opportunity:start-all-source-scans', (event) => {
    bidOpportunityService.subscribe(event.sender);
    return bidOpportunityService.startAllSourceScans();
  });
  ipcMain.handle('bid-opportunity:merge-project-clusters', (_event, payload) => bidOpportunityService.mergeProjectClusters(payload));
  ipcMain.handle('bid-opportunity:split-project-cluster', (_event, opportunityId) => bidOpportunityService.splitOpportunityCluster(opportunityId));
  ipcMain.handle('bid-opportunity:update-source', (_event, payload) => bidOpportunityService.updateSource(payload));
  ipcMain.on('bid-opportunity:subscribe', (event) => bidOpportunityService.subscribe(event.sender));
}

module.exports = { registerBidOpportunityIpc };
