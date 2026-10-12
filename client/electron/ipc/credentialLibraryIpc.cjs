const { dialog, ipcMain } = require('electron');

/** 注册资信库数据库和原图文件操作。 */
function registerCredentialLibraryIpc({ credentialLibraryService, configStore }) {
  ipcMain.handle('credential-library:select-images', async () => {
    const result = await dialog.showOpenDialog({ title: '选择资信图片', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('credential-library:list-companies', () => credentialLibraryService.listCompanies());
  ipcMain.handle('credential-library:create-company', (_event, input) => credentialLibraryService.createCompany(input));
  ipcMain.handle('credential-library:delete-company', (_event, companyId) => credentialLibraryService.deleteCompany(companyId));
  ipcMain.handle('credential-library:load', (_event, companyId) => credentialLibraryService.load(companyId));
  ipcMain.handle('credential-library:import-test-data', async (_event, companyId) => {
    if (!configStore.load()?.developer_mode) throw new Error('请先开启开发者模式');
    const result = await dialog.showOpenDialog({
      title: '选择资信库测试数据文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return credentialLibraryService.importTestData(companyId, result.filePaths[0]);
  });
  ipcMain.handle('credential-library:save-profile', (_event, companyId, partial) => credentialLibraryService.saveProfile(companyId, partial));
  ipcMain.handle('credential-library:add-profile-images', (_event, companyId, fieldKey, filePaths) => credentialLibraryService.addProfileImages(companyId, fieldKey, filePaths));
  ipcMain.handle('credential-library:delete-image', (_event, companyId, imageId) => credentialLibraryService.deleteImage(companyId, imageId));
  ipcMain.handle('credential-library:save-certificate', (_event, companyId, payload) => credentialLibraryService.saveCertificate(companyId, payload));
  ipcMain.handle('credential-library:delete-certificate', (_event, companyId, recordId) => credentialLibraryService.deleteCertificate(companyId, recordId));
  ipcMain.handle('credential-library:save-employee', (_event, companyId, payload) => credentialLibraryService.saveEmployee(companyId, payload));
  ipcMain.handle('credential-library:delete-employee', (_event, companyId, recordId) => credentialLibraryService.deleteEmployee(companyId, recordId));
  ipcMain.handle('credential-library:save-project', (_event, companyId, payload) => credentialLibraryService.saveProject(companyId, payload));
  ipcMain.handle('credential-library:delete-project', (_event, companyId, recordId) => credentialLibraryService.deleteProject(companyId, recordId));
  ipcMain.handle('credential-library:save-other-material', (_event, companyId, payload) => credentialLibraryService.saveOtherMaterial(companyId, payload));
  ipcMain.handle('credential-library:delete-other-material', (_event, companyId, recordId) => credentialLibraryService.deleteOtherMaterial(companyId, recordId));
}

module.exports = {
  registerCredentialLibraryIpc,
};
