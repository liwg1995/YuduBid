const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { isOfficialReleaseDownloadUrl, parseSha256Digest, hashFile } = require('../utils/updateIntegrity.cjs');

const updateState = {
  releaseDownloadPromise: null,
  releaseDownloadAbortController: null,
  releaseInstallerPath: '',
  releaseInstallerVersion: '',
  releaseInstallerName: '',
  releaseInstallerDigest: '',
};

function setProgressBar(mainWindow, progress) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(progress);
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
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
  return { success: true, downloaded: true, version: normalizeVersion(version), path: installerPath, fileName: installerName, message };
}

function createReleaseDownloadCanceledResult(message = '已取消更新下载') {
  return { success: false, downloaded: false, canceled: true, message };
}

function emitReleaseDownloadProgress(options, payload) {
  if (typeof options.onProgress === 'function') options.onProgress(payload);
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
  if (!message) return '更新失败，请稍后重试；也可以在关于页面手动下载安装。';
  if (/timeout|timed out|etimedout|econnreset|econnaborted|enotfound|eai_again|fetch failed|network|socket hang up/i.test(message)) {
    return '连接 GitHub 更新服务器超时或网络中断，请稍后重试，或在关于页面手动下载安装。';
  }
  return message;
}

async function downloadReleaseInstaller(options = {}) {
  const app = options.app;
  const url = String(options.url || '').trim();
  const version = normalizeVersion(options.version || '');
  const installerName = sanitizeInstallerName(options.fileName, `Yibiao-${version || 'latest'}-${process.platform}-${process.arch}.exe`);
  const expectedSize = Number(options.size || 0);
  const expectedDigest = parseSha256Digest(options.digest);

  if (!app?.getPath) {
    return { success: false, downloaded: false, message: '客户端更新服务未初始化' };
  }

  if (!isOfficialReleaseDownloadUrl(url)) {
    return { success: false, downloaded: false, message: '不支持的安装包下载链接' };
  }

  if (!expectedDigest) {
    return { success: false, downloaded: false, message: '官方安装包缺少有效的 SHA-256 摘要，已停止下载' };
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
    if (updateState.releaseInstallerDigest === expectedDigest && await hashFile(updateState.releaseInstallerPath) === expectedDigest) {
      return createReleaseDownloadResult(version, updateState.releaseInstallerPath, updateState.releaseInstallerName);
    }
    updateState.releaseInstallerPath = '';
    updateState.releaseInstallerDigest = '';
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
    const hash = crypto.createHash('sha256');
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
        hash.update(value);

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

    if ((expectedSize > 0 && transferred !== expectedSize) || (contentLength > 0 && transferred !== contentLength)) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // 忽略临时文件清理失败。
      }
      setProgressBar(options.mainWindow, -1);
      return { success: false, downloaded: false, message: '安装包下载不完整，请重新下载' };
    }

    if (hash.digest('hex') !== expectedDigest) {
      fs.rmSync(tempPath, { force: true });
      setProgressBar(options.mainWindow, -1);
      return { success: false, downloaded: false, message: '安装包 SHA-256 校验失败，已删除下载文件' };
    }

    if (fs.existsSync(installerPath)) fs.rmSync(installerPath, { force: true });
    fs.renameSync(tempPath, installerPath);
    updateState.releaseInstallerPath = installerPath;
    updateState.releaseInstallerVersion = version;
    updateState.releaseInstallerName = installerName;
    updateState.releaseInstallerDigest = expectedDigest;

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

  if (!updateState.releaseInstallerDigest || await hashFile(installerPath) !== updateState.releaseInstallerDigest) {
    updateState.releaseInstallerPath = '';
    updateState.releaseInstallerDigest = '';
    return { success: false, message: '安装包完整性校验失败，请重新下载' };
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

module.exports = {
  downloadReleaseInstaller,
  cancelReleaseInstallerDownload,
  installDownloadedRelease,
  getDownloadedReleasePath,
};
