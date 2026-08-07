const { ipcMain } = require('electron');

function registerRejectionCheckIpc({ rejectionCheckStore }) {
  ipcMain.handle('rejection-check:load-state', () => rejectionCheckStore.loadRejectionCheck());
  ipcMain.handle('rejection-check:import-document', (_event, role) => rejectionCheckStore.importDocument(role));
  ipcMain.handle('rejection-check:import-bid-documents', () => rejectionCheckStore.importBidDocuments());
  ipcMain.handle('rejection-check:import-tender-from-technical-plan', (_event, payload) => rejectionCheckStore.importTenderFromTechnicalPlan(payload));
  ipcMain.handle('rejection-check:import-bid-from-technical-plan', () => rejectionCheckStore.importBidFromTechnicalPlan());
  ipcMain.handle('rejection-check:remove-document', (_event, role) => rejectionCheckStore.removeDocument(role));
  ipcMain.handle('rejection-check:save-ui-state', (_event, payload) => rejectionCheckStore.saveUiState(payload));
  ipcMain.handle('rejection-check:update-state', (_event, partial) => rejectionCheckStore.updateRejectionCheck(partial));
  ipcMain.handle('rejection-check:clear', () => rejectionCheckStore.clearRejectionCheck());
}

module.exports = {
  registerRejectionCheckIpc,
};
