const { app, dialog, ipcMain } = require('electron');
const { buildDocxBuffer } = require('../services/exportService.cjs');
const { checkWordLayout } = require('../services/wordLayoutAudit.cjs');

const { createBusinessTemplateService } = require('../services/businessTemplateService.cjs');

function registerExportIpc({ exportService, getCredentialLibraryService, getTenderSource, getScoringCoverage, getTenderParsedSource }) {
  const businessTemplates = createBusinessTemplateService(dialog, getCredentialLibraryService, app, getTenderSource, getTenderParsedSource, buildDocxBuffer);
  ipcMain.handle('export:scoring-coverage-report', (_event, payload) => getScoringCoverage?.(payload) || { status: 'missing', content: '' });
  ipcMain.handle('export:reset-business-session', ({ sender }, key) => businessTemplates.resetSession(sender, key));
  ipcMain.handle('export:load-business-session', ({ sender }, key) => businessTemplates.loadSession(sender, key));
  ipcMain.handle('export:save-business-session', ({ sender }, key, payload) => businessTemplates.saveSession(sender, key, payload));
  ipcMain.handle('export:inspect-tender-forms', ({ sender }, key) => businessTemplates.inspectTenderForms(sender, key));
  ipcMain.handle('export:read-tender-form-draft', ({ sender }, ids) => businessTemplates.readTenderFormDraft(sender, ids));
  ipcMain.handle('export:use-tender-forms', ({ sender }, ids, editedMarkdown) => businessTemplates.useTenderForms(sender, ids, editedMarkdown));
  ipcMain.handle('export:select-business-template', ({ sender }) => businessTemplates.select(sender));
  ipcMain.handle('export:fill-business-template', ({ sender }, values, attachments, prepareKey) => businessTemplates.export(sender, values, attachments, typeof prepareKey === 'string' ? prepareKey : undefined));
  ipcMain.handle('export:prepared-business-status', (_event, key) => businessTemplates.getPreparedStatus(key));
  ipcMain.handle('export:business-draft-word', (_event, payload) => businessTemplates.saveDraftWord(payload, buildDocxBuffer));
  ipcMain.handle('export:preview-word', (_event, payload) => exportService.previewWord(payload));
  ipcMain.handle('export:show-file', async (_event, filePath) => exportService.showExportFile(filePath));
  ipcMain.handle('export:check-word-layout', async (_event, filePath) => checkWordLayout(filePath));
  ipcMain.handle('export:word', async (event, payload = {}) => {
    const requestId = payload.requestId || payload.request_id;
    const sendProgress = (progress) => {
      event.sender.send('export:word-progress', { requestId, ...progress });
    };

    try {
      const businessBuffer = payload.businessProjectKey && await businessTemplates.getPrepared(payload.businessProjectKey);
      if (payload.businessProjectKey && !businessBuffer) throw new Error('请回到生成设置，先准备当前项目的商务部分');
      const scoringCoverageReport = Array.isArray(payload.scoringResponse) && payload.scoringResponse.length
        ? getScoringCoverage?.({ workflowKind: payload.workflowKind, projectId: payload.projectId }) : undefined;
      return await exportService.exportWord({ ...payload, scoringCoverageReport }, sendProgress, businessBuffer || undefined);
    } catch (error) {
      sendProgress({
        phase: 'error',
        progress: 100,
        message: error.message || '导出 Word 失败',
      });
      throw error;
    }
  });
}

module.exports = {
  registerExportIpc,
};
