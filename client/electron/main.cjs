const { app, BrowserWindow, nativeTheme, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { registerIpcHandlers } = require('./ipc/index.cjs');
const { setupAutoUpdate, checkAndDownloadUpdate, triggerUpdateDownload, downloadReleaseInstaller, cancelReleaseInstallerDownload, installDownloadedRelease, getDownloadedReleasePath, quitAndInstall } = require('./services/updateService.cjs');
const { getGeneratedImagesDir, getImportedImagesDir, getSoftwareCopyrightDir } = require('./utils/paths.cjs');

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const userDataDir = process.env.YIBIAO_USER_DATA_DIR;
const windowIconPath = process.platform === 'win32'
  ? path.join(__dirname, '../assets/icon.ico')
  : process.platform === 'linux'
    ? path.join(__dirname, '../assets/icon_256.png')
    : null;
const packagedIndexUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).toString();
const legacyUserDataNames = ['禹都AI投标助手', 'yudubid-client'];
let mainWindow = null;

if (userDataDir) {
  app.setPath('userData', path.resolve(userDataDir));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'yibiao-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

function registerAssetProtocol() {
  protocol.handle('yibiao-asset', (request) => {
    try {
      const url = new URL(request.url);
      const assetRoots = {
        'generated-images': getGeneratedImagesDir(app),
        'imported-images': getImportedImagesDir(app),
        'software-copyright-screenshots': path.join(getSoftwareCopyrightDir(app), 'manual-screenshots'),
        'software-copyright-ai-images': path.join(getSoftwareCopyrightDir(app), 'ai-illustrations'),
      };
      const rootDir = assetRoots[url.hostname];
      if (!rootDir) {
        return new Response('Not found', { status: 404 });
      }

      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!relativePath) {
        return new Response('Not found', { status: 404 });
      }

      const baseDir = path.resolve(rootDir);
      const filePath = path.resolve(baseDir, relativePath);
      if (filePath !== baseDir && !filePath.startsWith(`${baseDir}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Invalid asset url', { status: 400 });
    }
  });
}

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isAllowedAppNavigation(value) {
  try {
    const url = new URL(value);
    if (rendererUrl) {
      return url.origin === new URL(rendererUrl).origin;
    }

    const indexUrl = new URL(packagedIndexUrl);
    return url.protocol === 'file:' && url.pathname === indexUrl.pathname;
  } catch {
    return false;
  }
}

async function openExternalUrl(value) {
  const externalUrl = normalizeExternalUrl(value);
  if (!externalUrl) return;
  try {
    await shell.openExternal(externalUrl);
  } catch (error) {
    const preview = externalUrl.length > 300 ? `${externalUrl.slice(0, 300)}...` : externalUrl;
    console.warn('[electron] 打开外部链接失败', { url: preview, message: error.message || String(error) });
  }
}

function copyIfMissing(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  return true;
}

function migrateLegacyUserData() {
  try {
    const currentUserData = app.getPath('userData');
    const supportDir = path.dirname(currentUserData);
    const currentConfigPath = path.join(currentUserData, 'user_config.json');
    const currentWorkspacePath = path.join(currentUserData, 'workspace');

    for (const legacyName of legacyUserDataNames) {
      const legacyUserData = path.join(supportDir, legacyName);
      if (legacyUserData === currentUserData || !fs.existsSync(legacyUserData)) {
        continue;
      }

      const copiedConfig = copyIfMissing(path.join(legacyUserData, 'user_config.json'), currentConfigPath);
      const copiedWorkspace = copyIfMissing(path.join(legacyUserData, 'workspace'), currentWorkspacePath);
      if (copiedConfig || copiedWorkspace) {
        console.info('[electron] 已兼容迁移旧版用户数据', {
          from: legacyUserData,
          to: currentUserData,
          copiedConfig,
          copiedWorkspace,
        });
      }
    }
  } catch (error) {
    console.warn('[electron] 迁移旧版用户数据失败', error);
  }
}

function createMainWindow() {
  const appWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#f8fafd',
    title: '禹都AI解决方案助手',
    ...(windowIconPath && fs.existsSync(windowIconPath) ? { icon: windowIconPath } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  appWindow.setMenuBarVisibility(false);

  if (rendererUrl) {
    appWindow.loadURL(rendererUrl);
  } else {
    appWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });

  appWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) {
      return;
    }

    event.preventDefault();
    void openExternalUrl(url);
  });

  appWindow.on('closed', () => {
    if (mainWindow === appWindow) {
      mainWindow = null;
    }
  });

  return appWindow;
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    nativeTheme.themeSource = 'light';
    migrateLegacyUserData();
    registerAssetProtocol();
    mainWindow = createMainWindow();
    registerIpcHandlers({ app, mainWindow, checkAndDownloadUpdate, triggerUpdateDownload, downloadReleaseInstaller, cancelReleaseInstallerDownload, installDownloadedRelease, getDownloadedReleasePath, quitAndInstall });
    setupAutoUpdate({ app, mainWindow });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
