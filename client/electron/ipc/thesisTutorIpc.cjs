const { ipcMain } = require('electron');

function registerThesisTutorIpc({ thesisTutorService }) {
  ipcMain.handle('thesis-tutor:load-state', () => thesisTutorService.loadState());
  ipcMain.handle('thesis-tutor:save-profile', (_event, profile) => thesisTutorService.saveProfile(profile));
  ipcMain.handle('thesis-tutor:save-chapters', (_event, payload) => thesisTutorService.saveChapters(payload));
  ipcMain.handle('thesis-tutor:save-references', (_event, payload) => thesisTutorService.saveReferences(payload));
  ipcMain.handle('thesis-tutor:save-feedback', (_event, payload) => thesisTutorService.saveFeedback(payload));
  ipcMain.handle('thesis-tutor:save-checks', (_event, payload) => thesisTutorService.saveChecks(payload));
  ipcMain.handle('thesis-tutor:save-history', (_event, payload) => thesisTutorService.saveHistory(payload));
  ipcMain.handle('thesis-tutor:save-profile-lock', (_event, payload) => thesisTutorService.saveProfileLock(payload));
  ipcMain.handle('thesis-tutor:generate', (event, payload) => {
    thesisTutorService.subscribe(event.sender);
    return thesisTutorService.generate(payload);
  });
  ipcMain.handle('thesis-tutor:save-draft', (_event, payload) => thesisTutorService.saveDraft(payload));
  ipcMain.handle('thesis-tutor:import-source', () => thesisTutorService.importSource());
  ipcMain.handle('thesis-tutor:export-workspace', () => thesisTutorService.exportWorkspace());
  ipcMain.handle('thesis-tutor:import-workspace', () => thesisTutorService.importWorkspace());
  ipcMain.handle('thesis-tutor:clear', () => thesisTutorService.clear());
  ipcMain.on('thesis-tutor:subscribe', (event) => {
    thesisTutorService.subscribe(event.sender);
  });
}

module.exports = {
  registerThesisTutorIpc,
};
