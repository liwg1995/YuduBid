const path = require('node:path');
const { ipcMain, shell } = require('electron');
const { registerAiIpc } = require('./aiIpc.cjs');
const { registerCodeGenerationIpc } = require('./codeGenerationIpc.cjs');
const { registerConfigIpc } = require('./configIpc.cjs');
const { registerDuplicateCheckIpc } = require('./duplicateCheckIpc.cjs');
const { registerExportIpc } = require('./exportIpc.cjs');
const { registerFileIpc } = require('./fileIpc.cjs');
const { registerKnowledgeBaseIpc } = require('./knowledgeBaseIpc.cjs');
const { registerOfficialDocumentIpc } = require('./officialDocumentIpc.cjs');
const { registerPatentGenerationIpc } = require('./patentGenerationIpc.cjs');
const { registerRejectionCheckIpc } = require('./rejectionCheckIpc.cjs');
const { registerSoftwareCopyrightIpc } = require('./softwareCopyrightIpc.cjs');
const { registerTaskIpc } = require('./taskIpc.cjs');
const { registerTechnicalPlanIpc } = require('./technicalPlanIpc.cjs');
const { createAiService } = require('../services/aiService.cjs');
const { createCodeGenerationService } = require('../services/codeGenerationService.cjs');
const { createConfigStore } = require('../services/configStore.cjs');
const { createDuplicateCheckService } = require('../services/duplicateCheckService.cjs');
const { createDuplicateCheckStore } = require('../services/duplicateCheckStore.cjs');
const { createExportService } = require('../services/exportService.cjs');
const { createFileService } = require('../services/fileService.cjs');
const { createKnowledgeBaseService } = require('../services/knowledgeBaseService.cjs');
const { createKnowledgeBaseStore } = require('../services/knowledgeBaseStore.cjs');
const { createOfficialDocumentService } = require('../services/officialDocumentService.cjs');
const { createPatentGenerationService } = require('../services/patentGenerationService.cjs');
const { createRejectionCheckStore } = require('../services/rejectionCheckStore.cjs');
const { createSoftwareCopyrightService } = require('../services/softwareCopyrightService.cjs');
const { createSqliteDatabase } = require('../services/sqliteDatabase.cjs');
const { createTaskService } = require('../services/taskService.cjs');
const { createTechnicalPlanStore } = require('../services/technicalPlanStore.cjs');

const latestReleaseApiUrl = 'https://api.github.com/repos/liwg1995/YuduBid/releases/latest';
const releasesApiUrl = 'https://api.github.com/repos/liwg1995/YuduBid/releases';

function normalizeTechnicalPlanWorkflowKind(value) {
  return value === 'existing-plan-expansion' ? 'existing-plan-expansion' : 'technical-plan';
}

function pickTechnicalPlanWorkflowKind(value) {
  if (typeof value === 'string') {
    return normalizeTechnicalPlanWorkflowKind(value);
  }
  return normalizeTechnicalPlanWorkflowKind(value?.workflowKind || value?.workflow_kind);
}

function createScopedApp(app, scopeName) {
  return {
    getPath(name) {
      if (name === 'userData') {
        return path.join(app.getPath('userData'), scopeName);
      }
      return app.getPath(name);
    },
    once: (...args) => app.once(...args),
  };
}

function createTechnicalPlanStoreRouter(technicalPlanStore, existingPlanExpansionStore) {
  const pickStore = (value) => (
    pickTechnicalPlanWorkflowKind(value) === 'existing-plan-expansion'
      ? existingPlanExpansionStore
      : technicalPlanStore
  );
  const withoutWorkflowKind = (payload = {}) => {
    const { workflowKind: _workflowKind, workflow_kind: _workflowKindSnake, ...rest } = payload || {};
    return rest;
  };

  return {
    forWorkflow(workflowKind) {
      return pickStore(workflowKind);
    },
    loadTechnicalPlan(workflowKind) {
      return pickStore(workflowKind).loadTechnicalPlan();
    },
    updateTechnicalPlan(partial = {}) {
      return pickStore(partial).updateTechnicalPlan(withoutWorkflowKind(partial));
    },
    clearTechnicalPlan(workflowKind) {
      return pickStore(workflowKind).clearTechnicalPlan();
    },
    importTenderDocument(workflowKind) {
      return pickStore(workflowKind).importTenderDocument();
    },
    importOriginalPlanDocument(workflowKind) {
      return pickStore(workflowKind).importOriginalPlanDocument();
    },
    readTenderMarkdown(workflowKind) {
      return pickStore(workflowKind).readTenderMarkdown();
    },
    readOriginalPlanMarkdown(workflowKind) {
      return pickStore(workflowKind).readOriginalPlanMarkdown();
    },
    updateStep(payload) {
      const step = typeof payload === 'string' ? payload : payload?.step;
      return pickStore(payload).updateStep(step);
    },
    switchWorkflowKind(workflowKind) {
      return pickStore(workflowKind).loadTechnicalPlan();
    },
    saveOutlineConfig(payload = {}) {
      return pickStore(payload).saveOutlineConfig(withoutWorkflowKind(payload));
    },
    saveOutline(payload) {
      const outlineData = payload?.outlineData || payload;
      return pickStore(payload).saveOutline(outlineData);
    },
    saveGlobalFacts(payload) {
      const globalFacts = Array.isArray(payload) ? payload : payload?.globalFacts;
      return pickStore(payload).saveGlobalFacts(globalFacts || []);
    },
    saveContentGenerationOptions(payload) {
      const contentGenerationOptions = payload?.contentGenerationOptions || payload?.options || payload;
      return pickStore(payload).saveContentGenerationOptions(contentGenerationOptions);
    },
    saveChapterContent(payload = {}) {
      return pickStore(payload).saveChapterContent(withoutWorkflowKind(payload));
    },
  };
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
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes(archKeyword) && name.includes('manual-package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes('manual-package')) ||
      byName((name) => name.endsWith('.dmg') && name.includes(archKeyword)) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes(archKeyword) && name.includes('package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes(archKeyword)) ||
      byName((name) => name.endsWith('.dmg') && name.includes('mac')) ||
      byName((name) => name.endsWith('.dmg')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes('package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac'))
    );
  }

  return candidates[0];
}

function shouldIncludePrerelease(app) {
  return String(app?.getVersion?.() || '').includes('-') || process.env.YIBIAO_INCLUDE_PRERELEASE_UPDATE === '1';
}

async function fetchLatestReleaseInfo(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const includePrerelease = Boolean(options.includePrerelease);
    const response = await fetch(includePrerelease ? `${releasesApiUrl}?per_page=20` : latestReleaseApiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'YuDuBid-Client',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub 返回 ${response.status}`);
    }

    const payload = await response.json();
    const release = Array.isArray(payload)
      ? payload.find((item) => item && !item.draft && (includePrerelease || !item.prerelease))
      : payload;
    if (!release) {
      throw new Error('未找到可用版本');
    }

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
    'technical-plan:import-original-plan-document',
    'technical-plan:read-tender-markdown',
    'technical-plan:read-original-plan-markdown',
    'technical-plan:update-step',
    'technical-plan:switch-workflow-kind',
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
  const codeGenerationService = createCodeGenerationService({ app });
  const officialDocumentService = createOfficialDocumentService({ app, aiService, configStore });
  const patentGenerationService = createPatentGenerationService({ app, aiService });

  registerConfigIpc({ configStore, aiService });
  registerAiIpc({ aiService });
  registerFileIpc({ fileService });
  registerExportIpc({ exportService });
  registerCodeGenerationIpc({ codeGenerationService });
  registerOfficialDocumentIpc({ officialDocumentService });
  registerSoftwareCopyrightIpc({ softwareCopyrightService: createSoftwareCopyrightService({ app, aiService, configStore, codeGenerationService }) });
  registerPatentGenerationIpc({ patentGenerationService });

  try {
    const sqliteDatabase = createSqliteDatabase(app);
    const existingPlanExpansionApp = createScopedApp(app, 'existing-plan-expansion');
    const existingPlanExpansionDatabase = createSqliteDatabase(existingPlanExpansionApp);
    const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: sqliteDatabase.db });
    const knowledgeBaseService = createKnowledgeBaseService({ app, aiService, configStore, knowledgeBaseStore });
    const technicalPlanStore = createTechnicalPlanStore({ app, db: sqliteDatabase.db, fileService });
    const existingPlanExpansionStore = createTechnicalPlanStore({
      app: existingPlanExpansionApp,
      db: existingPlanExpansionDatabase.db,
      fileService,
    });
    existingPlanExpansionStore.switchWorkflowKind('existing-plan-expansion');
    const technicalPlanStoreRouter = createTechnicalPlanStoreRouter(technicalPlanStore, existingPlanExpansionStore);
    const duplicateCheckStore = createDuplicateCheckStore({ app, db: sqliteDatabase.db });
    const rejectionCheckStore = createRejectionCheckStore({ app, db: sqliteDatabase.db, fileService, technicalPlanStore: technicalPlanStoreRouter });
    const duplicateCheckService = createDuplicateCheckService({ app, configStore, workspaceStore: duplicateCheckStore });
    const taskService = createTaskService({ aiService, technicalPlanStore: technicalPlanStoreRouter, rejectionCheckStore, duplicateCheckStore, knowledgeBaseService, duplicateCheckService });
    registerKnowledgeBaseIpc({ knowledgeBaseService });
    registerTechnicalPlanIpc({ technicalPlanStore: technicalPlanStoreRouter });
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

  ipcMain.handle('app:get-latest-version', () => fetchLatestReleaseInfo({ includePrerelease: shouldIncludePrerelease(app) }));
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
