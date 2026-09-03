'use strict';

const { ipcMain } = require('electron');

function registerPluginIpc({ pluginManager }) {
  ipcMain.handle('plugins:list', () => pluginManager.list());
  ipcMain.handle('plugins:import', () => pluginManager.importPackage());
  ipcMain.handle('plugins:enable', (_event, pluginId) => pluginManager.enable(pluginId));
  ipcMain.handle('plugins:disable', (_event, pluginId) => pluginManager.disable(pluginId));
  ipcMain.handle('plugins:uninstall', (_event, pluginId, options) => pluginManager.uninstall(pluginId, options));
  ipcMain.handle('plugins:request', (_event, pluginId, method, params) => pluginManager.request(pluginId, method, params));

  ipcMain.on('plugins:subscribe', (event) => {
    const webContents = event.sender;
    if (!webContents || webContents.isDestroyed()) return;
    const unsubscribe = pluginManager.subscribe((payload) => {
      if (!webContents.isDestroyed()) webContents.send('plugins:event', payload);
    });
    webContents.once('destroyed', unsubscribe);
  });
}

module.exports = { registerPluginIpc };
