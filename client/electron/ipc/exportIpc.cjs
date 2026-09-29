const { ipcMain } = require('electron');
const { checkWordLayout } = require('../services/wordLayoutAudit.cjs');

function registerExportIpc({ exportService }) {
  ipcMain.handle('export:preview-word', (_event, payload) => exportService.previewWord(payload));
  ipcMain.handle('export:show-file', async (_event, filePath) => exportService.showExportFile(filePath));
  ipcMain.handle('export:check-word-layout', async (_event, filePath) => checkWordLayout(filePath));
  ipcMain.handle('export:word', async (event, payload = {}) => {
    const requestId = payload.requestId || payload.request_id;
    const sendProgress = (progress) => {
      event.sender.send('export:word-progress', { requestId, ...progress });
    };

    try {
      return await exportService.exportWord(payload, sendProgress);
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
