const { ipcMain } = require('electron');

function registerTemplateIpc({ templateStore }) {
  ipcMain.handle('bid-templates:list', () => templateStore.list());
  ipcMain.handle('bid-templates:get', (_event, templateId) => templateStore.get(templateId));
  ipcMain.handle('bid-templates:create', (_event, config) => templateStore.create(config));
  ipcMain.handle('bid-templates:update', (_event, templateId, config) => templateStore.update(templateId, config));
  ipcMain.handle('bid-templates:delete', (_event, templateId) => templateStore.remove(templateId));
  ipcMain.handle('bid-templates:select-cover-logo', () => templateStore.selectCoverLogo());
  ipcMain.handle('bid-templates:get-cover-logo-preview', (_event, filePath) => templateStore.getCoverLogoPreview(filePath));
  ipcMain.handle('bid-templates:export', (_event, templateId) => templateStore.exportTemplate(templateId));
  ipcMain.handle('bid-templates:import', () => templateStore.importTemplate());
}

module.exports = { registerTemplateIpc };
