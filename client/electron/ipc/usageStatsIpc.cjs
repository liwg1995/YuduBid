const { ipcMain } = require('electron');

function registerUsageStatsIpc({ usageStatsStore }) {
  ipcMain.handle('usage-stats:get-summary', (_event, range) => usageStatsStore.getSummary(range));
  ipcMain.handle('usage-stats:clear', () => usageStatsStore.clear());
}

module.exports = { registerUsageStatsIpc };
