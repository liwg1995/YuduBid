function setProgressBar(mainWindow, progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.setProgressBar(progress);
}

function getDisabledResult() {
  return {
    enabled: false,
    updateAvailable: false,
    message: '本地开发模式已关闭远程更新检查',
  };
}

async function checkAndDownloadUpdate(options = {}) {
  setProgressBar(options.mainWindow, -1);
  return getDisabledResult();
}

function triggerUpdateDownload(options) {
  return checkAndDownloadUpdate(options);
}

function quitAndInstall() {
  return getDisabledResult();
}

function setupAutoUpdate({ app, mainWindow }) {
  setProgressBar(mainWindow, -1);
}

module.exports = {
  setupAutoUpdate,
  checkAndDownloadUpdate,
  triggerUpdateDownload,
  quitAndInstall,
};
