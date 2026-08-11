const { ipcMain } = require('electron');

function registerCodeGenerationIpc({ codeGenerationService }) {
  ipcMain.handle('code-generation:load-state', () => codeGenerationService.loadState());
  ipcMain.handle('code-generation:select-project', () => codeGenerationService.selectProject());
  ipcMain.handle('code-generation:update-selection', (_event, payload) => codeGenerationService.updateSelection(payload));
  ipcMain.handle('code-generation:rescan', () => codeGenerationService.rescan());
  ipcMain.handle('code-generation:confirm-selection', () => codeGenerationService.confirmSelection());
  ipcMain.handle('code-generation:clear', () => codeGenerationService.clear());
}

module.exports = {
  registerCodeGenerationIpc,
};
