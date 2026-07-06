const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const updateState = {
  configured: false,
  checkingPromise: null,
  downloadPromise: null,
  updateInfo: null,
  downloadedVersion: '',
  releaseDownloadPromise: null,
  releaseDownloadAbortController: null,
  releaseInstallerPath: '',
  releaseInstallerVersion: '',
  releaseInstallerName: '',
};

const updateCheckTimeoutMs = Number(process.env.YIBIAO_UPDATE_CHECK_TIMEOUT_MS || 180000);
const updateDownloadRetryDelaysMs = [0, 5000, 15000];

function setProgressBar(mainWindow, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.setProgressBar(progress);
}

function getDisabledResult(message = '包内自动更新已关闭，请在关于页面下载最新版安装包。') {
  return {
    enabled: false,
    updateAvailable: false,
    message,
  };
}

function getUnsupportedResult() {
  return getDisabledResult();
}

function canUseAutoUpdate(app) {
  return false;
}

function shouldAllowPrerelease(app) {
  return String(app?.getVersion?.() || '').includes('-') || process.env.YIBIAO_INCLUDE_PRERELEASE_UPDATE === '1';
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function isReleaseDownloadUrl(value) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/.+/i.test(String(value || ''));
}

function sanitizeInstallerName(value, fallbackName) {
  const rawName = path.basename(String(value || fallbackName || '').replace(/\\/g, '/'));
  const normalized = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return normalized || 'Yibiao-update-installer.exe';
}

function getManualUpdateDir(app, version) {
  const safeVersion = normalizeVersion(version).replace(/[^a-zA-Z0-9._-]/g, '_') || 'latest';
  return path.join(app.getPath('userData'), 'updates', safeVersion);
}

function createReleaseDownloadResult(version, installerPath, installerName, message = '安装包已下载完成') {
  return {
    success: true,
    downloaded: true,
    version: normalizeVersion(version),
    path: installerPath,
    fileName: installerName,
    message,
  };
}

function createReleaseDownloadCanceledResult(message = '已取消更新下载') {
  return {
    success: false,
    downloaded: false,
    canceled: true,
    message,
  };
}

function emitReleaseDownloadProgress(options, payload) {
  if (typeof options.onProgress === 'function') {
    options.onProgress(payload);
  }
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
    message: normalizeUpdateErrorMessage(message),
  };
}

function emitError(options, message) {
  if (typeof options.onError === 'function') {
    options.onError(normalizeUpdateErrorMessage(message));
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyNetworkTimeout(value) {
  const message = String(value || '').toLowerCase();
  return [
    'timeout',
    'timed out',
    'etimedout',
    'econnreset',
    'econnaborted',
    'enotfound',
    'eai_again',
    'network',
    'fetch failed',
    'failed to fetch',
    'connect',
    'socket hang up',
    'aborted',
  ].some((keyword) => message.includes(keyword));
}

function getErrorMessage(error, fallbackMessage) {
  const message = error?.message || String(error || fallbackMessage || '');
  const causeCode = error?.cause?.code ? String(error.cause.code) : '';
  const causeMessage = error?.cause?.message ? String(error.cause.message) : '';
  return [message, causeCode, causeMessage].filter(Boolean).join(' ');
}

function isAbortError(error) {
  return error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted');
}

function normalizeUpdateErrorMessage(value) {
  const message = String(value || '').trim();
  if (!message) {
    return '更新失败，请稍后重试；如果网络较慢，可以在关于页面打开最新版下载链接手动下载安装。';
  }
  if (
    message.includes('ERR_UPDATER_INVALID_SIGNATURE') ||
    message.includes('not signed by the application owner') ||
    message.includes('not digitally signed')
  ) {
    return '当前安装包未进行代码签名，Windows 包内自动安装已被安全校验拦截。请在更新详情中点击“手动下载”，下载最新版安装包后覆盖安装。';
  }
  if (isLikelyNetworkTimeout(message)) {
    return '连接 GitHub 更新服务器超时或网络中断。大陆网络较慢时请稍后重试，或在关于页面使用“获取最新版”打开下载链接手动下载安装。';
  }
  return message;
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
    }, Math.max(60000, updateCheckTimeoutMs));

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

  updateState.downloadPromise = (async () => {
    let lastError = null;
    for (let index = 0; index < updateDownloadRetryDelaysMs.length; index += 1) {
      const delayMs = updateDownloadRetryDelaysMs[index];
      if (delayMs > 0) {
        await wait(delayMs);
      }

      try {
        await autoUpdater.downloadUpdate();
        return updateState.downloadedVersion;
      } catch (error) {
        lastError = error;
        const message = error?.message || String(error || '');
        const canRetry = index < updateDownloadRetryDelaysMs.length - 1 && isLikelyNetworkTimeout(message);
        if (!canRetry) {
          throw error;
        }
        console.warn(`[update] 下载更新失败，准备第 ${index + 2}/${updateDownloadRetryDelaysMs.length} 次重试`, error);
      }
    }
    throw lastError || new Error('下载更新失败');
  })().finally(() => {
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

async function downloadReleaseInstaller(options = {}) {
  const app = options.app;
  const url = String(options.url || '').trim();
  const version = normalizeVersion(options.version || '');
  const installerName = sanitizeInstallerName(options.fileName, `Yibiao-${version || 'latest'}-${process.platform}-${process.arch}.exe`);
  const expectedSize = Number(options.size || 0);

  if (!app?.getPath) {
    return { success: false, downloaded: false, message: '客户端更新服务未初始化' };
  }

  if (!isReleaseDownloadUrl(url)) {
    return { success: false, downloaded: false, message: '不支持的安装包下载链接' };
  }

  if (process.platform === 'darwin' && !installerName.toLowerCase().endsWith('.dmg') && !installerName.toLowerCase().endsWith('.zip')) {
    return { success: false, downloaded: false, message: '当前系统安装包格式不匹配' };
  }

  if (process.platform === 'win32' && !installerName.toLowerCase().endsWith('.exe')) {
    return { success: false, downloaded: false, message: '当前系统安装包格式不匹配' };
  }

  if (
    updateState.releaseInstallerPath &&
    updateState.releaseInstallerVersion === version &&
    fs.existsSync(updateState.releaseInstallerPath)
  ) {
    return createReleaseDownloadResult(version, updateState.releaseInstallerPath, updateState.releaseInstallerName);
  }

  if (updateState.releaseDownloadPromise) {
    return updateState.releaseDownloadPromise;
  }

  updateState.releaseDownloadPromise = (async () => {
    const updateDir = getManualUpdateDir(app, version);
    const installerPath = path.join(updateDir, installerName);
    const tempPath = `${installerPath}.download`;
    const abortController = new AbortController();
    updateState.releaseDownloadAbortController = abortController;

    fs.mkdirSync(updateDir, { recursive: true });
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // 忽略上一次中断下载留下的临时文件清理失败。
    }

    setProgressBar(options.mainWindow, 0);

    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'YuDuBid-Client',
        },
        signal: abortController.signal,
      });
    } catch (error) {
      setProgressBar(options.mainWindow, -1);
      if (isAbortError(error) || abortController.signal.aborted) {
        return createReleaseDownloadCanceledResult();
      }
      console.warn('[update] 下载安装包请求失败', {
        message: getErrorMessage(error, '下载安装包失败'),
      });
      return { success: false, downloaded: false, message: normalizeUpdateErrorMessage(getErrorMessage(error, '下载安装包失败')) };
    }

    if (!response.ok || !response.body) {
      setProgressBar(options.mainWindow, -1);
      return { success: false, downloaded: false, message: `下载安装包失败：服务器返回 ${response.status}` };
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    const total = contentLength > 0 ? contentLength : expectedSize;
    const reader = response.body.getReader();
    const fileStream = fs.createWriteStream(tempPath);
    let transferred = 0;
    let lastEmitAt = 0;
    let lastBytes = 0;
    let lastSpeedAt = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        await new Promise((resolve, reject) => {
          fileStream.write(Buffer.from(value), (error) => (error ? reject(error) : resolve()));
        });

        transferred += value.byteLength;
        const now = Date.now();
        if (now - lastEmitAt >= 250 || (total > 0 && transferred >= total)) {
          const elapsed = Math.max(1, now - lastSpeedAt) / 1000;
          const bytesPerSecond = Math.max(0, Math.round((transferred - lastBytes) / elapsed));
          lastBytes = transferred;
          lastSpeedAt = now;
          lastEmitAt = now;

          const percent = total > 0 ? Math.max(0, Math.min(100, (transferred / total) * 100)) : 0;
          setProgressBar(options.mainWindow, total > 0 ? percent / 100 : 2);
          emitReleaseDownloadProgress(options, {
            percent,
            transferred,
            total,
            bytesPerSecond,
            fileName: installerName,
            version,
          });
        }
      }
    } catch (error) {
      fileStream.destroy();
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // 忽略临时文件清理失败。
      }
      setProgressBar(options.mainWindow, -1);
      if (isAbortError(error) || abortController.signal.aborted) {
        return createReleaseDownloadCanceledResult();
      }
      console.warn('[update] 安装包下载中断', {
        message: getErrorMessage(error, '安装包下载中断'),
      });
      return { success: false, downloaded: false, message: normalizeUpdateErrorMessage(getErrorMessage(error, '安装包下载中断')) };
    }

    await new Promise((resolve, reject) => {
      fileStream.end((error) => (error ? reject(error) : resolve()));
    });

    if (total > 0 && transferred < total) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // 忽略临时文件清理失败。
      }
      setProgressBar(options.mainWindow, -1);
      return { success: false, downloaded: false, message: '安装包下载不完整，请重新下载' };
    }

    fs.renameSync(tempPath, installerPath);
    updateState.releaseInstallerPath = installerPath;
    updateState.releaseInstallerVersion = version;
    updateState.releaseInstallerName = installerName;

    setProgressBar(options.mainWindow, -1);
    emitReleaseDownloadProgress(options, {
      percent: 100,
      transferred,
      total: total || transferred,
      bytesPerSecond: 0,
      fileName: installerName,
      version,
    });

    return createReleaseDownloadResult(version, installerPath, installerName);
  })().finally(() => {
    updateState.releaseDownloadPromise = null;
    updateState.releaseDownloadAbortController = null;
  });

  return updateState.releaseDownloadPromise;
}

function cancelReleaseInstallerDownload(options = {}) {
  if (!updateState.releaseDownloadPromise || !updateState.releaseDownloadAbortController) {
    return { success: true, canceled: false, message: '当前没有正在下载的更新' };
  }

  updateState.releaseDownloadAbortController.abort();
  setProgressBar(options.mainWindow, -1);
  return { success: true, canceled: true, message: '已取消更新下载' };
}

async function installDownloadedRelease(options = {}) {
  const app = options.app;
  const installerPath = updateState.releaseInstallerPath;

  if (!installerPath || !fs.existsSync(installerPath)) {
    return { success: false, message: '安装包尚未下载完成，请先下载更新' };
  }

  if (process.platform === 'win32') {
    try {
      const child = spawn(installerPath, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      setTimeout(() => {
        app?.quit?.();
      }, 800);
      return { success: true, message: '安装程序已启动' };
    } catch (error) {
      return { success: false, message: error?.message || '启动安装程序失败' };
    }
  }

  if (process.platform === 'darwin') {
    try {
      const child = spawn('open', [installerPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return { success: true, message: '安装包已打开，请按提示覆盖安装' };
    } catch (error) {
      return { success: false, message: error?.message || '打开安装包失败' };
    }
  }

  return { success: false, message: '当前系统暂不支持包内安装' };
}

function getDownloadedReleasePath() {
  const installerPath = updateState.releaseInstallerPath;
  if (!installerPath || !fs.existsSync(installerPath)) {
    return { success: false, message: '安装包尚未下载完成，请先下载更新' };
  }
  return {
    success: true,
    path: installerPath,
    fileName: updateState.releaseInstallerName || path.basename(installerPath),
    version: updateState.releaseInstallerVersion,
  };
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
  downloadReleaseInstaller,
  cancelReleaseInstallerDownload,
  installDownloadedRelease,
  getDownloadedReleasePath,
  quitAndInstall,
};
