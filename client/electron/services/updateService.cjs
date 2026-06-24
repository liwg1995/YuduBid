const { autoUpdater } = require('electron-updater');

const updateState = {
  configured: false,
  checkingPromise: null,
  downloadPromise: null,
  updateInfo: null,
  downloadedVersion: '',
};

function setProgressBar(mainWindow, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.setProgressBar(progress);
}

function getDisabledResult(message = '本地开发模式已关闭远程更新检查') {
  return {
    enabled: false,
    updateAvailable: false,
    message,
  };
}

function getUnsupportedResult() {
  return getDisabledResult('macOS 版本暂不启用包内自动更新，请在关于页面手动下载最新版。');
}

function canUseAutoUpdate(app) {
  return Boolean(app?.isPackaged) && process.platform === 'win32' && process.env.YIBIAO_DISABLE_AUTO_UPDATE !== '1';
}

function shouldAllowPrerelease(app) {
  return String(app?.getVersion?.() || '').includes('-') || process.env.YIBIAO_INCLUDE_PRERELEASE_UPDATE === '1';
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function createNoUpdateResult() {
  return {
    enabled: true,
    updateAvailable: false,
    message: '当前已是最新版本',
  };
}

function createDownloadedResult(version) {
  return {
    enabled: true,
    updateAvailable: true,
    downloaded: true,
    version: normalizeVersion(version),
    message: '更新已下载完成',
  };
}

function createAvailableResult(version) {
  return {
    enabled: true,
    updateAvailable: true,
    downloaded: false,
    version: normalizeVersion(version),
    message: '发现新版本',
  };
}

function createFailedResult(message) {
  return {
    enabled: true,
    updateAvailable: false,
    failed: true,
    message: message || '检查更新失败',
  };
}

function emitError(options, message) {
  if (typeof options.onError === 'function') {
    options.onError(message);
  }
}

function setupAutoUpdate({ app, mainWindow }) {
  if (!canUseAutoUpdate(app)) {
    setProgressBar(mainWindow, -1);
    return;
  }

  if (updateState.configured) {
    return;
  }

  updateState.configured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = shouldAllowPrerelease(app);

  autoUpdater.on('checking-for-update', () => {
    setProgressBar(mainWindow, 2);
  });

  autoUpdater.on('update-available', (info) => {
    updateState.updateInfo = info;
    setProgressBar(mainWindow, 2);
  });

  autoUpdater.on('update-not-available', () => {
    updateState.updateInfo = null;
    setProgressBar(mainWindow, -1);
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
    setProgressBar(mainWindow, percent / 100);
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState.downloadedVersion = normalizeVersion(info?.version || updateState.updateInfo?.version || '');
    setProgressBar(mainWindow, -1);
  });

  autoUpdater.on('error', (error) => {
    console.warn('[update] 自动更新失败', error);
    setProgressBar(mainWindow, -1);
  });
}

async function checkForUpdate() {
  if (updateState.checkingPromise) {
    return updateState.checkingPromise;
  }

  updateState.checkingPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('检查更新超时'));
    }, 60000);

    const cleanup = () => {
      clearTimeout(timer);
      autoUpdater.removeListener('update-available', availableHandler);
      autoUpdater.removeListener('update-not-available', notAvailableHandler);
      autoUpdater.removeListener('error', errorHandler);
    };

    const availableHandler = (info) => {
      cleanup();
      resolve({ available: true, info });
    };

    const notAvailableHandler = (info) => {
      cleanup();
      resolve({ available: false, info });
    };

    const errorHandler = (error) => {
      cleanup();
      reject(error);
    };

    autoUpdater.once('update-available', availableHandler);
    autoUpdater.once('update-not-available', notAvailableHandler);
    autoUpdater.once('error', errorHandler);

    autoUpdater.checkForUpdates().catch((error) => {
      cleanup();
      reject(error);
    });
  }).finally(() => {
    updateState.checkingPromise = null;
  });

  return updateState.checkingPromise;
}

async function downloadUpdate() {
  if (updateState.downloadedVersion) {
    return updateState.downloadedVersion;
  }

  if (updateState.downloadPromise) {
    return updateState.downloadPromise;
  }

  updateState.downloadPromise = autoUpdater.downloadUpdate()
    .then(() => updateState.downloadedVersion)
    .finally(() => {
      updateState.downloadPromise = null;
    });

  return updateState.downloadPromise;
}

async function checkAndDownloadUpdate(options = {}) {
  if (process.platform === 'darwin') {
    return getUnsupportedResult();
  }

  if (!canUseAutoUpdate(options.app)) {
    return getDisabledResult();
  }

  setProgressBar(options.mainWindow, -1);

  try {
    setupAutoUpdate({ app: options.app, mainWindow: options.mainWindow });

    const progressHandler = (progress) => {
      const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
      if (typeof options.onProgress === 'function') {
        options.onProgress(percent);
      }
    };
    const downloadedHandler = (info) => {
      const version = normalizeVersion(info?.version || updateState.updateInfo?.version || '');
      if (typeof options.onDownloaded === 'function') {
        options.onDownloaded(version);
      }
    };
    const errorHandler = (error) => {
      emitError(options, error?.message || String(error || '自动更新失败'));
    };

    autoUpdater.on('download-progress', progressHandler);
    autoUpdater.on('update-downloaded', downloadedHandler);
    autoUpdater.on('error', errorHandler);

    try {
      const result = await checkForUpdate();
      if (!result?.available || !result.info?.version) {
        return createNoUpdateResult();
      }

      updateState.updateInfo = result.info;
      const version = normalizeVersion(result.info.version);
      await downloadUpdate();
      updateState.downloadedVersion = updateState.downloadedVersion || version;
      return createDownloadedResult(version);
    } finally {
      autoUpdater.removeListener('download-progress', progressHandler);
      autoUpdater.removeListener('update-downloaded', downloadedHandler);
      autoUpdater.removeListener('error', errorHandler);
    }
  } catch (error) {
    const message = error?.message || String(error || '检查更新失败');
    emitError(options, message);
    return createFailedResult(message);
  } finally {
    setProgressBar(options.mainWindow, -1);
  }
}

async function triggerUpdateDownload(options = {}) {
  if (process.platform === 'darwin') {
    return getUnsupportedResult();
  }

  if (!canUseAutoUpdate(options.app)) {
    return getDisabledResult();
  }

  try {
    setupAutoUpdate({ app: options.app, mainWindow: options.mainWindow });

    if (!updateState.updateInfo) {
      const result = await checkForUpdate();
      updateState.updateInfo = result?.available ? result.info : null;
    }

    if (!updateState.updateInfo?.version) {
      return createNoUpdateResult();
    }

    if (updateState.downloadedVersion) {
      return createDownloadedResult(updateState.downloadedVersion);
    }

    const version = normalizeVersion(updateState.updateInfo.version);
    const progressHandler = (progress) => {
      const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
      if (typeof options.onProgress === 'function') {
        options.onProgress(percent);
      }
    };
    const downloadedHandler = (info) => {
      const downloadedVersion = normalizeVersion(info?.version || version);
      if (typeof options.onDownloaded === 'function') {
        options.onDownloaded(downloadedVersion);
      }
    };
    const errorHandler = (error) => {
      emitError(options, error?.message || String(error || '下载更新失败'));
    };

    autoUpdater.on('download-progress', progressHandler);
    autoUpdater.on('update-downloaded', downloadedHandler);
    autoUpdater.on('error', errorHandler);

    try {
      await downloadUpdate();
      updateState.downloadedVersion = updateState.downloadedVersion || version;
      return createDownloadedResult(version);
    } finally {
      autoUpdater.removeListener('download-progress', progressHandler);
      autoUpdater.removeListener('update-downloaded', downloadedHandler);
      autoUpdater.removeListener('error', errorHandler);
    }
  } catch (error) {
    const message = error?.message || String(error || '下载更新失败');
    emitError(options, message);
    return createFailedResult(message);
  } finally {
    setProgressBar(options.mainWindow, -1);
  }
}

function quitAndInstall() {
  if (process.platform !== 'win32') {
    return getUnsupportedResult();
  }

  if (!updateState.downloadedVersion) {
    return createAvailableResult(updateState.updateInfo?.version || '');
  }

  autoUpdater.quitAndInstall(false, true);
  return { enabled: true, updateAvailable: true, downloaded: true, version: updateState.downloadedVersion };
}

module.exports = {
  setupAutoUpdate,
  checkAndDownloadUpdate,
  triggerUpdateDownload,
  quitAndInstall,
};
