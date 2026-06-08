const { ipcMain, shell } = require('electron');
const { registerAiIpc } = require('./aiIpc.cjs');
const { registerConfigIpc } = require('./configIpc.cjs');
const { registerDuplicateCheckIpc } = require('./duplicateCheckIpc.cjs');
const { registerExportIpc } = require('./exportIpc.cjs');
const { registerFileIpc } = require('./fileIpc.cjs');
const { registerKnowledgeBaseIpc } = require('./knowledgeBaseIpc.cjs');
const { registerRejectionCheckIpc } = require('./rejectionCheckIpc.cjs');
const { registerTaskIpc } = require('./taskIpc.cjs');
const { registerTechnicalPlanIpc } = require('./technicalPlanIpc.cjs');
const { createAiService } = require('../services/aiService.cjs');
const { createConfigStore } = require('../services/configStore.cjs');
const { createDuplicateCheckService } = require('../services/duplicateCheckService.cjs');
const { createDuplicateCheckStore } = require('../services/duplicateCheckStore.cjs');
const { createExportService } = require('../services/exportService.cjs');
const { createFileService } = require('../services/fileService.cjs');
const { createKnowledgeBaseService } = require('../services/knowledgeBaseService.cjs');
const { createKnowledgeBaseStore } = require('../services/knowledgeBaseStore.cjs');
const { createRejectionCheckStore } = require('../services/rejectionCheckStore.cjs');
const { createSqliteDatabase } = require('../services/sqliteDatabase.cjs');
const { createTaskService } = require('../services/taskService.cjs');
const { createTechnicalPlanStore } = require('../services/technicalPlanStore.cjs');

const latestReleaseApiUrl = 'https://api.github.com/repos/liwg1995/YuduBid/releases/latest';

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

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function pickReleaseDownloadAsset(assets = []) {
  const candidates = Array.isArray(assets) ? assets : [];
  const arch = process.arch;
  const platform = process.platform;
  const byName = (predicate) => candidates.find((asset) => predicate(String(asset?.name || '').toLowerCase()));

  if (platform === 'win32') {
    return (
      byName((name) => name.endsWith('.exe') && name.includes('win')) ||
      byName((name) => name.endsWith('.exe')) ||
      byName((name) => name.endsWith('.zip') && name.includes('win'))
    );
  }

  if (platform === 'darwin') {
    const archKeyword = arch === 'arm64' ? 'arm64' : 'x64';
    return (
      byName((name) => name.endsWith('.dmg') && name.includes(archKeyword)) ||
      byName((name) => name.endsWith('.dmg') && name.includes('mac')) ||
      byName((name) => name.endsWith('.dmg'))
    );
  }

  return candidates[0];
}

async function fetchLatestReleaseInfo() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(latestReleaseApiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'YuDuBid-Client',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub 返回 ${response.status}`);
    }

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const downloadAsset = pickReleaseDownloadAsset(assets);

    return {
      version: normalizeVersion(release.tag_name || release.name || ''),
      name: String(release.name || release.tag_name || ''),
      body: String(release.body || ''),
      published_at: String(release.published_at || ''),
      html_url: String(release.html_url || 'https://github.com/liwg1995/YuduBid/releases/latest'),
      download_url: String(downloadAsset?.browser_download_url || release.html_url || 'https://github.com/liwg1995/YuduBid/releases/latest'),
      download_name: String(downloadAsset?.name || ''),
      platform: process.platform,
      arch: process.arch,
      assets: assets.map((asset) => ({
        name: String(asset?.name || ''),
        browser_download_url: String(asset?.browser_download_url || ''),
        size: Number(asset?.size || 0),
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

function registerUnavailableTechnicalPlanIpc(error) {
  const message = `工作区数据库初始化失败：${error?.message || String(error)}`;
  const throwUnavailable = () => {
    throw new Error(message);
  };

  console.error('[ipc] 工作区数据库初始化失败', error);
  [
    'technical-plan:load-state',
    'technical-plan:import-tender-document',
    'technical-plan:read-tender-markdown',
    'technical-plan:update-step',
    'technical-plan:save-outline-config',
    'technical-plan:save-outline',
    'technical-plan:save-global-facts',
    'technical-plan:save-content-generation-options',
    'technical-plan:save-chapter-content',
    'technical-plan:clear',
    'duplicate-check:load-state',
    'duplicate-check:save-files',
    'duplicate-check:save-ui-state',
    'duplicate-check:update-state',
    'duplicate-check:clear',
    'rejection-check:load-state',
    'rejection-check:import-document',
    'rejection-check:import-tender-from-technical-plan',
    'rejection-check:remove-document',
    'rejection-check:save-ui-state',
    'rejection-check:update-state',
    'rejection-check:clear',
    'knowledge-base:get-migration-status',
    'knowledge-base:migrate-legacy',
    'knowledge-base:list',
    'knowledge-base:create-folder',
    'knowledge-base:rename-folder',
    'knowledge-base:delete-folder',
    'knowledge-base:delete-document',
    'knowledge-base:upload-documents',
    'knowledge-base:start-matching',
    'knowledge-base:read-markdown',
    'knowledge-base:read-items',
    'knowledge-base:read-analysis',
    'tasks:start-bid-analysis',
    'tasks:start-outline-generation',
    'tasks:start-global-facts-generation',
    'tasks:start-content-generation',
    'tasks:pause-content-generation',
    'tasks:start-rejection-items-extraction',
    'tasks:start-rejection-check',
    'tasks:start-duplicate-analysis',
    'tasks:get-active',
  ].forEach((channel) => ipcMain.handle(channel, throwUnavailable));
  ipcMain.on('tasks:subscribe', () => {});
}

function registerIpcHandlers({ app, mainWindow, checkAndDownloadUpdate, triggerUpdateDownload, quitAndInstall }) {
  const configStore = createConfigStore(app);
  const aiService = createAiService({ app, configStore });
  const fileService = createFileService({ app, configStore });
  const exportService = createExportService({ configStore });

  registerConfigIpc({ configStore, aiService });
  registerAiIpc({ aiService });
  registerFileIpc({ fileService });
  registerExportIpc({ exportService });

  try {
    const sqliteDatabase = createSqliteDatabase(app);
    const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: sqliteDatabase.db });
    const knowledgeBaseService = createKnowledgeBaseService({ app, aiService, configStore, knowledgeBaseStore });
    const technicalPlanStore = createTechnicalPlanStore({ app, db: sqliteDatabase.db, fileService });
    const duplicateCheckStore = createDuplicateCheckStore({ app, db: sqliteDatabase.db });
    const rejectionCheckStore = createRejectionCheckStore({ app, db: sqliteDatabase.db, fileService, technicalPlanStore });
    const duplicateCheckService = createDuplicateCheckService({ app, configStore, workspaceStore: duplicateCheckStore });
    const taskService = createTaskService({ aiService, technicalPlanStore, rejectionCheckStore, duplicateCheckStore, knowledgeBaseService, duplicateCheckService });
    registerKnowledgeBaseIpc({ knowledgeBaseService });
    registerTechnicalPlanIpc({ technicalPlanStore });
    registerDuplicateCheckIpc({ duplicateCheckStore });
    registerRejectionCheckIpc({ rejectionCheckStore });
    registerTaskIpc({ taskService });
  } catch (error) {
    registerUnavailableTechnicalPlanIpc(error);
  }

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:open-external', async (_event, url) => {
    const externalUrl = normalizeExternalUrl(url);
    if (!externalUrl) {
      return { success: false, message: '不支持的外部链接' };
    }
    try {
      await shell.openExternal(externalUrl);
      return { success: true };
    } catch (error) {
      const preview = externalUrl.length > 300 ? `${externalUrl.slice(0, 300)}...` : externalUrl;
      console.warn('[app] 打开外部链接失败', { url: preview, message: error.message || String(error) });
      return { success: false, message: '外部链接打开失败' };
    }
  });

  ipcMain.handle('app:get-latest-version', () => fetchLatestReleaseInfo());
  ipcMain.handle('app:quit-and-install', () => {
    quitAndInstall();
  });

  ipcMain.handle('app:check-update', (event) => {
    const webContents = event.sender;
    return checkAndDownloadUpdate({
      app,
      mainWindow,
      onProgress: (percent) => {
        webContents.send('app:update-progress', { percent });
      },
      onDownloaded: (version) => {
        webContents.send('app:update-downloaded', { version });
      },
      onError: (message) => {
        webContents.send('app:update-error', { message });
      },
    });
  });

  ipcMain.handle('app:start-update', (event) => {
    const webContents = event.sender;
    return triggerUpdateDownload({
      app,
      mainWindow,
      onProgress: (percent) => {
        webContents.send('app:update-progress', { percent });
      },
      onDownloaded: (version) => {
        webContents.send('app:update-downloaded', { version });
      },
      onError: (message) => {
        webContents.send('app:update-error', { message });
      },
    });
  });
}

module.exports = {
  registerIpcHandlers,
};
