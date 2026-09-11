const { ipcMain } = require('electron');

// Registers and forwards only. The credential logic lives in
// electron/services/orcaAuthService.cjs and the secret itself never leaves
// Main: these handlers return account state, never the key.
function registerOrcaIpc({ orcaAuthService }) {
  ipcMain.handle('orca:status', () => orcaAuthService.getStatus());
  ipcMain.handle('orca:save-api-key', (_event, payload) => {
    const credential = orcaAuthService.saveApiKey(payload?.apiKey);
    return {
      success: true,
      accountId: credential.accountId,
      source: credential.source,
      redactedKey: orcaAuthService.getStatus().redactedKey,
    };
  });
  ipcMain.handle('orca:clear-credential', () => orcaAuthService.clearCredential());
  // Opens the consent screen. The PKCE verifier stays in Main; the renderer
  // only ever receives the authorization URL it may show to the user.
  ipcMain.handle('orca:start-login', (_event, payload) => (
    orcaAuthService.startLogin({ appName: payload?.appName, flow: payload?.flow })
  ));
  ipcMain.handle('orca:submit-code', (_event, payload) => (
    orcaAuthService.submitOutOfBandCode({ attemptId: payload?.attemptId, code: payload?.code })
      .then((result) => ({ success: true, accountId: result.credential.accountId, scope: result.scope }))
      .catch((error) => ({ success: false, code: error.code || '', message: error.message }))
  ));
  ipcMain.handle('orca:cancel-login', (_event, attemptId) => orcaAuthService.cancelLogin(attemptId));
  ipcMain.handle('orca:open-external', async (_event, url) => {
    const { shell } = require('electron');
    await shell.openExternal(String(url || ''));
    return { success: true };
  });
}

module.exports = {
  registerOrcaIpc,
};
