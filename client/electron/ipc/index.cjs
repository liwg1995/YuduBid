const { registerStorageIpc } = require('./storageIpc.cjs');
const { createStorageSpaceService } = require('../services/storageSpaceService.cjs');
const { createFullBlindCheckController } = require('../services/blind-check-upstream/controller.cjs');
const { registerFullBlindCheckIpc } = require('./fullBlindCheckIpc.cjs');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { registerAiIpc } = require('./aiIpc.cjs');
const { registerAgentIpc } = require('./agentIpc.cjs');
const { registerBidOpportunityIpc } = require('./bidOpportunityIpc.cjs');
const { registerCodeGenerationIpc } = require('./codeGenerationIpc.cjs');
const { registerCredentialLibraryIpc } = require('./credentialLibraryIpc.cjs');
const { registerConfigIpc } = require('./configIpc.cjs');
const { registerDuplicateCheckIpc } = require('./duplicateCheckIpc.cjs');
const { registerExportIpc } = require('./exportIpc.cjs');
const { registerFeasibilityReportIpc } = require('./feasibilityReportIpc.cjs');
const { registerFileIpc } = require('./fileIpc.cjs');
const { registerGrantApplicationIpc } = require('./grantApplicationIpc.cjs');
const { registerKnowledgeBaseIpc } = require('./knowledgeBaseIpc.cjs');
const { registerOfficialDocumentIpc } = require('./officialDocumentIpc.cjs');
const { registerPatentGenerationIpc } = require('./patentGenerationIpc.cjs');
const { registerPluginIpc } = require('./pluginIpc.cjs');
const { registerPresalesWorkbenchIpc } = require('./presalesWorkbenchIpc.cjs');
const { registerProjectManagementIpc } = require('./projectManagementIpc.cjs');
const { registerRejectionCheckIpc } = require('./rejectionCheckIpc.cjs');
const { registerSoftwareCopyrightIpc } = require('./softwareCopyrightIpc.cjs');
const { registerTaskIpc } = require('./taskIpc.cjs');
const { registerSystemFontIpc } = require('./systemFontIpc.cjs');
const { registerTemplateIpc } = require('./templateIpc.cjs');
const { registerTechnicalPlanIpc } = require('./technicalPlanIpc.cjs');
const { registerThesisTutorIpc } = require('./thesisTutorIpc.cjs');
const { createAiService } = require('../services/aiService.cjs');
const { createBidOpportunityService } = require('../services/bidOpportunityService.cjs');
const { createCodeGenerationService } = require('../services/codeGenerationService.cjs');
const { createCredentialLibraryService } = require('../services/credentialLibraryService.cjs');
const { createCheckResultExportService } = require('../services/checkResultExportService.cjs');
const { createConfigStore } = require('../services/configStore.cjs');
const { createDuplicateCheckService } = require('../services/duplicateCheckService.cjs');
const { createDuplicateCheckStore } = require('../services/duplicateCheckStore.cjs');
const { createExportService } = require('../services/exportService.cjs');
const { createFeasibilityReportStoreRouter } = require('../services/feasibilityReportStoreRouter.cjs');
const { createFeasibilityReportTaskService } = require('../services/feasibilityReportTaskService.cjs');
const { createFileService } = require('../services/fileService.cjs');
const { createGrantApplicationService } = require('../services/grantApplicationService.cjs');
const { createKnowledgeBaseService } = require('../services/knowledgeBaseService.cjs');
const { createKnowledgeBaseStore } = require('../services/knowledgeBaseStore.cjs');
const { createKnowledgeImageService } = require('../services/knowledgeImageService.cjs');
const { createOfficialDocumentService } = require('../services/officialDocumentService.cjs');
const { createPatentGenerationService } = require('../services/patentGenerationService.cjs');
const { createPluginManager } = require('../plugins/pluginManager.cjs');
const { registerBidReviewCapabilities } = require('../plugins/bidReviewCapabilities.cjs');
const { registerFeasibilityReportCapabilities } = require('../plugins/feasibilityReportCapabilities.cjs');
const { registerTechnicalPlanCapabilities } = require('../plugins/technicalPlanCapabilities.cjs');
const { registerKnowledgeBaseCapabilities } = require('../plugins/knowledgeBaseCapabilities.cjs');
const { registerBidOpportunityCapabilities } = require('../plugins/bidOpportunityCapabilities.cjs');
const { createPresalesWorkbenchService } = require('../services/presalesWorkbenchService.cjs');
const { createProjectManagementService } = require('../services/projectManagementService.cjs');
const { createRejectionCheckStore } = require('../services/rejectionCheckStore.cjs');
const { createSoftwareCopyrightService } = require('../services/softwareCopyrightService.cjs');
const { createSqliteDatabase } = require('../services/sqliteDatabase.cjs');
const { createTaskService } = require('../services/taskService.cjs');
const { createSystemFontService } = require('../services/systemFontService.cjs');
const { createTemplateStore } = require('../services/templateStore.cjs');
const { createTechnicalPlanStore } = require('../services/technicalPlanStore.cjs');
const { createTechnicalDiagramService } = require('../services/technicalDiagramService.cjs');
const { createThesisTutorService } = require('../services/thesisTutorService.cjs');
const { createUsageStatsStore } = require('../services/usageStatsStore.cjs');
const { createAgentHost } = require('../agents/agentHost.cjs');
const { registerUsageStatsIpc } = require('./usageStatsIpc.cjs');
const { isOfficialReleaseDownloadUrl } = require('../utils/updateIntegrity.cjs');
const { createAppLogger } = require('../utils/appLogger.cjs');

const releasesApiUrl = 'https://api.github.com/repos/liwg1995/YuduBid/releases';
const gitcodeReleasesApiUrl = 'https://api.gitcode.com/api/v5/repos/oleime/YuduBid/releases';
const updateSources = new Set(['auto', 'github', 'gitcode']);

function releaseSyncPending(message) {
  const error = new Error(message);
  error.syncPending = true;
  return error;
}

function normalizeUpdateSource(value) {
  return updateSources.has(value) ? value : 'auto';
}

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

function createTechnicalPlanStoreRouter({ app, fileService, technicalPlanStore, existingPlanExpansionStore }) {
  const registryPath = path.join(app.getPath('userData'), 'workspace', 'technical-plan', 'projects.json');
  const storeCache = new Map();
  const legacyProjectNames = {
    'technical-plan': '历史技术方案项目',
    'existing-plan-expansion': '历史已有方案扩写项目',
  };
  const baseStores = {
    'technical-plan': technicalPlanStore,
    'existing-plan-expansion': existingPlanExpansionStore,
  };
  const normalizeProjectId = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'default';
  };
  const createProjectId = () => `tp-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const now = () => new Date().toISOString();
  const stripFileExt = (value) => String(value || '').trim().replace(/\.[^.\\/]+$/, '');
  const hasTechnicalPlanData = (state = {}) => Boolean(
    state.tenderFile
    || state.originalPlanFile
    || state.outlineData
    || state.globalFacts?.length
    || Object.keys(state.bidAnalysisTasks || {}).length
    || Object.keys(state.contentGenerationSections || {}).length
    || state.bidAnalysisTask
    || state.outlineGenerationTask
    || state.globalFactsTask
    || state.contentGenerationTask
  );
  const getLegacyProjectName = (workflowKind) => {
    const state = baseStores[workflowKind]?.loadTechnicalPlan?.() || {};
    const outlineName = String(state.outlineData?.project_name || '').trim();
    const tenderName = stripFileExt(state.tenderFile?.fileName);
    const originalName = stripFileExt(state.originalPlanFile?.fileName);
    return outlineName || tenderName || originalName || legacyProjectNames[workflowKind];
  };
  const getLegacyProject = (workflowKind, timestamp = now()) => {
    const state = baseStores[workflowKind]?.loadTechnicalPlan?.() || {};
    if (!hasTechnicalPlanData(state)) return null;
    return {
      id: 'default',
      workflowKind,
      name: getLegacyProjectName(workflowKind),
      created_at: timestamp,
      updated_at: state.tenderFile?.updatedAt || state.originalPlanFile?.updatedAt || timestamp,
      isLegacy: true,
    };
  };
  const readRegistry = () => {
    const timestamp = now();
    const fallback = {
      activeProjectIds: {},
      projects: ['technical-plan', 'existing-plan-expansion'].map((workflowKind) => getLegacyProject(workflowKind, timestamp)).filter(Boolean),
    };
    if (!fs.existsSync(registryPath)) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      return {
        activeProjectIds: {
          ...fallback.activeProjectIds,
          ...(parsed?.activeProjectIds || {}),
        },
        projects: Array.isArray(parsed?.projects) ? parsed.projects : fallback.projects,
      };
    } catch {
      return fallback;
    }
  };
  const writeRegistry = (registry) => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  };
  const ensureRegistry = () => {
    const registry = readRegistry();
    let changed = false;
    for (const workflowKind of ['technical-plan', 'existing-plan-expansion']) {
      const legacyProject = getLegacyProject(workflowKind);
      const legacyIndex = registry.projects.findIndex((project) => project.workflowKind === workflowKind && project.id === 'default');
      if (legacyProject && legacyIndex < 0) {
        registry.projects.unshift(legacyProject);
        changed = true;
      } else if (legacyProject && legacyIndex >= 0 && legacyProjectNames[workflowKind] !== registry.projects[legacyIndex].name && /^默认/.test(registry.projects[legacyIndex].name || '')) {
        registry.projects[legacyIndex] = { ...registry.projects[legacyIndex], name: legacyProject.name, isLegacy: true };
        changed = true;
      } else if (!legacyProject && legacyIndex >= 0 && /^默认/.test(registry.projects[legacyIndex].name || '')) {
        registry.projects.splice(legacyIndex, 1);
        changed = true;
      }
      if (!registry.activeProjectIds?.[workflowKind] && registry.projects.some((project) => project.workflowKind === workflowKind)) {
        registry.activeProjectIds = {
          ...(registry.activeProjectIds || {}),
          [workflowKind]: registry.projects.find((project) => project.workflowKind === workflowKind)?.id,
        };
        changed = true;
      }
    }
    if (changed || !fs.existsSync(registryPath)) {
      writeRegistry(registry);
    }
    return registry;
  };
  const getProjectFromPayload = (value) => {
    const workflowKind = pickTechnicalPlanWorkflowKind(value);
    const registry = ensureRegistry();
    const requested = typeof value === 'object' && value ? value.projectId || value.project_id : undefined;
    const projectId = normalizeProjectId(requested || registry.activeProjectIds?.[workflowKind] || registry.projects.find((item) => item.workflowKind === workflowKind)?.id);
    const project = registry.projects.find((item) => item.workflowKind === workflowKind && item.id === projectId)
      || registry.projects.find((item) => item.workflowKind === workflowKind && item.id === 'default')
      || { id: 'default', workflowKind, name: legacyProjectNames[workflowKind] };
    return { workflowKind, projectId: project.id, project };
  };
  const createProjectStore = (workflowKind, projectId) => {
    if (projectId === 'default') {
      return { store: baseStores[workflowKind], database: null };
    }
    const scopeName = path.join('technical-plan-projects', workflowKind, normalizeProjectId(projectId));
    const scopedApp = createScopedApp(app, scopeName);
    const database = createSqliteDatabase(scopedApp);
    const store = createTechnicalPlanStore({ app: scopedApp, db: database.db, fileService });
    if (workflowKind === 'existing-plan-expansion') {
      store.switchWorkflowKind('existing-plan-expansion');
    }
    return { store, database };
  };
  const pickStore = (value) => {
    const { workflowKind, projectId } = getProjectFromPayload(value);
    const key = `${workflowKind}:${projectId}`;
    if (!storeCache.has(key)) {
      storeCache.set(key, createProjectStore(workflowKind, projectId));
    }
    return storeCache.get(key).store;
  };
  const withProjectMeta = (state, value) => {
    const { workflowKind, projectId, project } = getProjectFromPayload(value);
    return {
      ...state,
      workflowKind,
      projectId,
      projectName: project.name || legacyProjectNames[workflowKind],
    };
  };
  const withoutWorkflowKind = (payload = {}) => {
    const { workflowKind: _workflowKind, workflow_kind: _workflowKindSnake, projectId: _projectId, project_id: _projectIdSnake, ...rest } = payload || {};
    return rest;
  };
  const collectGeneratedContentMarkdown = (outlineItems, level = 1) => {
    const chunks = [];
    for (const item of Array.isArray(outlineItems) ? outlineItems : []) {
      const title = String(item?.title || '').trim();
      const content = String(item?.content || '').trim();
      const childMarkdown = collectGeneratedContentMarkdown(item?.children || [], Math.min(level + 1, 6));
      if (!title && !content && !childMarkdown) {
        continue;
      }
      if (title) {
        chunks.push(`${'#'.repeat(Math.max(1, Math.min(level, 6)))} ${title}`);
      }
      if (content) {
        chunks.push(content);
      }
      if (childMarkdown) {
        chunks.push(childMarkdown);
      }
    }
    return chunks.join('\n\n');
  };
  const countGeneratedContentNodes = (outlineItems) => {
    let count = 0;
    for (const item of Array.isArray(outlineItems) ? outlineItems : []) {
      if (String(item?.content || '').trim()) count += 1;
      count += countGeneratedContentNodes(item?.children || []);
    }
    return count;
  };

  return {
    listProjects(workflowKindValue) {
      const workflowKind = pickTechnicalPlanWorkflowKind(workflowKindValue);
      const registry = ensureRegistry();
      const activeProjectId = registry.activeProjectIds?.[workflowKind] || 'default';
      return {
        activeProjectId,
        projects: registry.projects
          .filter((project) => project.workflowKind === workflowKind)
          .map((project) => ({ ...project, isActive: project.id === activeProjectId }))
          .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
      };
    },
    createProject(payload = {}) {
      const workflowKind = pickTechnicalPlanWorkflowKind(payload);
      const registry = ensureRegistry();
      const timestamp = now();
      const project = {
        id: createProjectId(),
        workflowKind,
        name: String(payload.projectName || payload.name || '').trim() || `技术方案项目 ${registry.projects.filter((item) => item.workflowKind === workflowKind).length + 1}`,
        created_at: timestamp,
        updated_at: timestamp,
      };
      writeRegistry({
        ...registry,
        activeProjectIds: { ...(registry.activeProjectIds || {}), [workflowKind]: project.id },
        projects: [project, ...registry.projects],
      });
      pickStore(project);
      return { project, projects: this.listProjects(workflowKind) };
    },
    renameProject(payload = {}) {
      const workflowKind = pickTechnicalPlanWorkflowKind(payload);
      const projectId = normalizeProjectId(payload.projectId || payload.project_id);
      const name = String(payload.name || payload.projectName || '').trim();
      if (!name) throw new Error('项目名称不能为空');
      const registry = ensureRegistry();
      const projects = registry.projects.map((project) => (
        project.workflowKind === workflowKind && project.id === projectId
          ? { ...project, name, updated_at: now() }
          : project
      ));
      writeRegistry({ ...registry, projects });
      return this.listProjects(workflowKind);
    },
    deleteProject(payload = {}) {
      const workflowKind = pickTechnicalPlanWorkflowKind(payload);
      const projectId = normalizeProjectId(payload.projectId || payload.project_id);
      if (projectId === 'default') {
        throw new Error('历史项目不能直接删除，可以进入后重置内容');
      }
      const registry = ensureRegistry();
      const exists = registry.projects.some((project) => project.workflowKind === workflowKind && project.id === projectId);
      if (!exists) return this.listProjects(workflowKind);
      const projects = registry.projects.filter((project) => !(project.workflowKind === workflowKind && project.id === projectId));
      const nextActiveProjectId = registry.activeProjectIds?.[workflowKind] === projectId
        ? projects.find((project) => project.workflowKind === workflowKind)?.id
        : registry.activeProjectIds?.[workflowKind];
      writeRegistry({
        ...registry,
        activeProjectIds: { ...(registry.activeProjectIds || {}), [workflowKind]: nextActiveProjectId },
        projects,
      });
      const key = `${workflowKind}:${projectId}`;
      const cached = storeCache.get(key);
      if (cached?.database?.close) cached.database.close();
      storeCache.delete(key);
      fs.rmSync(path.join(app.getPath('userData'), 'technical-plan-projects', workflowKind, projectId), { recursive: true, force: true });
      return this.listProjects(workflowKind);
    },
    switchProject(payload = {}) {
      const workflowKind = pickTechnicalPlanWorkflowKind(payload);
      const projectId = normalizeProjectId(payload.projectId || payload.project_id);
      const registry = ensureRegistry();
      if (!registry.projects.some((project) => project.workflowKind === workflowKind && project.id === projectId)) {
        throw new Error('项目不存在或已删除');
      }
      writeRegistry({
        ...registry,
        activeProjectIds: { ...(registry.activeProjectIds || {}), [workflowKind]: projectId },
      });
      return withProjectMeta(pickStore({ workflowKind, projectId }).loadTechnicalPlan(), { workflowKind, projectId });
    },
    forWorkflow(workflowKind, projectId) {
      return pickStore({ workflowKind, projectId });
    },
    loadTechnicalPlan(payload) {
      return withProjectMeta(pickStore(payload).loadTechnicalPlan(), payload);
    },
    updateTechnicalPlan(partial = {}) {
      return withProjectMeta(pickStore(partial).updateTechnicalPlan(withoutWorkflowKind(partial)), partial);
    },
    clearTechnicalPlan(payload) {
      const result = pickStore(payload).clearTechnicalPlan();
      return { ...result, state: withProjectMeta(result.state, payload) };
    },
    importTenderDocument(payload) {
      const result = pickStore(payload).importTenderDocument();
      return Promise.resolve(result).then((value) => ({ ...value, state: withProjectMeta(value.state, payload) }));
    },
    importOriginalPlanDocument(payload) {
      const result = pickStore(payload).importOriginalPlanDocument();
      return Promise.resolve(result).then((value) => ({ ...value, state: withProjectMeta(value.state, payload) }));
    },
    importGeneratedOriginalPlan(payload = {}) {
      const { projectId } = getProjectFromPayload(payload);
      const sourcePayload = { workflowKind: 'technical-plan', projectId: payload.sourceProjectId || payload.source_project_id || projectId };
      const targetPayload = { workflowKind: 'existing-plan-expansion', projectId };
      const sourceStore = pickStore(sourcePayload);
      const targetStore = pickStore(targetPayload);
      const sourceState = sourceStore.loadTechnicalPlan();
      const tenderMarkdown = sourceStore.readTenderMarkdown();
      if (!sourceState?.tenderFile || !String(tenderMarkdown || '').trim()) {
        return {
          success: false,
          message: '技术方案模块尚未导入招标文件',
          state: withProjectMeta(targetStore.loadTechnicalPlan(), targetPayload),
          markdown: '',
          tenderMarkdown: '',
        };
      }

      const outlineData = sourceState?.outlineData;
      if (!outlineData?.outline?.length) {
        return {
          success: false,
          message: '技术方案模块尚未生成目录和正文',
          state: withProjectMeta(targetStore.loadTechnicalPlan(), targetPayload),
          markdown: '',
          tenderMarkdown: '',
        };
      }

      const markdown = collectGeneratedContentMarkdown(outlineData.outline);
      const contentNodeCount = countGeneratedContentNodes(outlineData.outline);
      if (!markdown.trim() || contentNodeCount === 0) {
        return {
          success: false,
          message: '技术方案模块尚未生成可导入的正文内容',
          state: withProjectMeta(targetStore.loadTechnicalPlan(), targetPayload),
          markdown: '',
          tenderMarkdown: '',
        };
      }

      targetStore.importTenderMarkdown({
        fileName: sourceState.tenderFile.fileName || '技术方案招标文件',
        markdown: tenderMarkdown,
        parserLabel: sourceState.tenderFile.parserLabel || '技术方案模块',
      });
      const result = targetStore.importOriginalPlanMarkdown({
        fileName: outlineData.project_name ? `${outlineData.project_name} - 技术方案生成内容` : '技术方案生成内容',
        markdown,
        parserLabel: '技术方案生成内容',
      });
      const finalState = targetStore.loadTechnicalPlan();
      const importedTenderMarkdown = targetStore.readTenderMarkdown();
      const importedOriginalMarkdown = targetStore.readOriginalPlanMarkdown();
      return {
        ...result,
        state: withProjectMeta(finalState, targetPayload),
        markdown: importedOriginalMarkdown || markdown,
        tenderMarkdown: importedTenderMarkdown || tenderMarkdown,
        message: `已导入技术方案模块的招标文件和生成内容，共 ${contentNodeCount} 个正文小节`,
      };
    },
    readTenderMarkdown(payload) {
      return pickStore(payload).readTenderMarkdown();
    },
    saveSelectedBidSection(payload = {}) {
      return withProjectMeta(pickStore(payload).saveSelectedBidSection(payload.sectionId), payload);
    },
    readOriginalPlanMarkdown(payload) {
      return pickStore(payload).readOriginalPlanMarkdown();
    },
    updateStep(payload) {
      const step = typeof payload === 'string' ? payload : payload?.step;
      return withProjectMeta(pickStore(payload).updateStep(step), payload);
    },
    switchWorkflowKind(workflowKind) {
      return withProjectMeta(pickStore(workflowKind).loadTechnicalPlan(), workflowKind);
    },
    saveOutlineConfig(payload = {}) {
      return withProjectMeta(pickStore(payload).saveOutlineConfig(withoutWorkflowKind(payload)), payload);
    },
    saveOutline(payload) {
      const outlineData = payload?.outlineData || payload;
      return withProjectMeta(pickStore(payload).saveOutline(outlineData), payload);
    },
    saveTechnicalVolume(payload = {}) {
      return withProjectMeta(pickStore(payload).saveTechnicalVolume(payload.technicalVolume || payload), payload);
    },
    saveGlobalFacts(payload) {
      const globalFacts = Array.isArray(payload) ? payload : payload?.globalFacts;
      return withProjectMeta(pickStore(payload).saveGlobalFacts(globalFacts || []), payload);
    },
    saveContentGenerationOptions(payload) {
      const contentGenerationOptions = payload?.contentGenerationOptions || payload?.options || payload;
      return withProjectMeta(pickStore(payload).saveContentGenerationOptions(contentGenerationOptions), payload);
    },
    saveChapterContent(payload = {}) {
      return withProjectMeta(pickStore(payload).saveChapterContent(withoutWorkflowKind(payload)), payload);
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

function normalizeReleaseAsset(asset) {
  return {
    name: String(asset?.name || ''),
    browser_download_url: String(asset?.browser_download_url || ''),
    size: Number(asset?.size || 0),
    digest: String(asset?.digest || ''),
    type: String(asset?.type || ''),
  };
}

function pickReleaseDownloadAsset(assets = []) {
  const candidates = (Array.isArray(assets) ? assets : [])
    .map(normalizeReleaseAsset)
    .filter((asset) => {
      const name = asset.name.toLowerCase();
      return (
        asset.name &&
        asset.type !== 'source' &&
        isOfficialReleaseDownloadUrl(asset.browser_download_url) &&
        !name.endsWith('-sha256.txt') &&
        !name.endsWith('.blockmap') &&
        name !== 'latest.yml' &&
        name !== 'latest-mac.yml'
      );
    });
  const arch = process.arch;
  const platform = process.platform;
  const byName = (predicate) => candidates.find((asset) => predicate(String(asset?.name || '').toLowerCase()));

  if (platform === 'win32') {
    return (
      byName((name) => name.endsWith('.exe') && name.includes('win') && name.includes('x64')) ||
      byName((name) => name.endsWith('.exe') && name.includes('win')) ||
      byName((name) => name.endsWith('.exe')) ||
      byName((name) => name.endsWith('.zip') && name.includes('win') && name.includes('x64')) ||
      byName((name) => name.endsWith('.zip') && name.includes('win'))
    );
  }

  if (platform === 'darwin') {
    const archKeyword = arch === 'arm64' ? 'arm64' : 'x64';
    return (
      byName((name) => name.endsWith('.dmg') && name.includes(archKeyword)) ||
      byName((name) => name.endsWith('.dmg') && name.includes('mac')) ||
      byName((name) => name.endsWith('.dmg')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes(archKeyword) && name.includes('manual-package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes('manual-package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes(archKeyword) && name.includes('package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes(archKeyword)) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac') && name.includes('package')) ||
      byName((name) => name.endsWith('.zip') && name.includes('mac'))
    );
  }

  return candidates[0];
}

async function fetchReleaseJson(url, signal, source = 'github') {
  const response = await fetch(url, {
    headers: {
      Accept: source === 'github' ? 'application/vnd.github+json' : 'application/json',
      'User-Agent': 'YuDuBid-Client',
    },
    signal,
  });

  if (!response.ok) {
    if (source === 'gitcode' && response.status === 404) {
      throw releaseSyncPending('GitCode Release 尚未同步完成');
    }
    throw new Error(`${source === 'github' ? 'GitHub' : 'GitCode'} 返回 ${response.status}`);
  }

  return response.json();
}

function shouldIncludePrerelease(app) {
  return String(app?.getVersion?.() || '').includes('-') || process.env.YIBIAO_INCLUDE_PRERELEASE_UPDATE === '1';
}

function compareReleaseVersions(left, right) {
  const parse = (value) => {
    const [numbers, suffix = ''] = normalizeVersion(value).split('-', 2);
    return { parts: numbers.split('.').map(Number), suffix };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  }
  if (!a.suffix && b.suffix) return 1;
  if (a.suffix && !b.suffix) return -1;
  return a.suffix.localeCompare(b.suffix, undefined, { numeric: true });
}

function releaseAssets(release) {
  return (Array.isArray(release?.assets) ? release.assets : []).map(normalizeReleaseAsset);
}

function releasePackageAssets(release) {
  return releaseAssets(release).filter((asset) => /\.(exe|msi|dmg|zip)$/i.test(asset.name)
    && isOfficialReleaseDownloadUrl(asset.browser_download_url));
}

function checksumAsset(release, platform) {
  const name = `YuDuBid-${normalizeVersion(release.tag_name)}-${platform}-sha256.txt`;
  return releaseAssets(release).find((asset) => asset.name === name && isOfficialReleaseDownloadUrl(asset.browser_download_url));
}

function releaseIsSynchronized(githubRelease, gitcodeRelease) {
  const githubPackages = releasePackageAssets(githubRelease);
  const gitcodePackages = new Map(releasePackageAssets(gitcodeRelease).map((asset) => [asset.name, asset]));
  if (!githubPackages.some((asset) => /\.exe$/i.test(asset.name))
    || !githubPackages.some((asset) => /\.dmg$/i.test(asset.name))) return false;
  if (githubPackages.some((asset) => {
    const mirror = gitcodePackages.get(asset.name);
    return !mirror || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest);
  })) return false;

  if (['Windows', 'macOS'].some((platform) => !checksumAsset(githubRelease, platform)
    || !checksumAsset(gitcodeRelease, platform))) return false;
  return new Map(githubPackages.map((asset) => [asset.name, asset.digest]));
}

async function verifyGitcodeReleaseChecksums(release, verifiedDigests, signal) {
  const checksumFiles = ['Windows', 'macOS'].map((platform) => checksumAsset(release, platform));
  const contents = await Promise.all(checksumFiles.map(async (asset) => {
    const response = await fetch(asset.browser_download_url, {
      signal,
      headers: { 'User-Agent': 'YuDuBid-Client' },
    });
    if (!response.ok) return null;
    const body = await response.text();
    return body.length <= 16384 ? body : null;
  }));
  if (contents.some((body) => body === null)) return false;
  const checksums = new Map();
  for (const body of contents) {
    for (const line of body.split(/\r?\n/)) {
      const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
      if (match) checksums.set(match[2], `sha256:${match[1].toLowerCase()}`);
    }
  }
  return [...verifiedDigests].every(([name, digest]) => checksums.get(name) === digest.toLowerCase());
}

async function fetchSynchronizedReleases(includePrerelease, signal, logger, limit = 1) {
  const [githubPayload, gitcodePayload] = await Promise.all([
    fetchReleaseJson(`${releasesApiUrl}?per_page=100`, signal),
    fetchReleaseJson(`${gitcodeReleasesApiUrl}?per_page=100&direction=desc`, signal, 'gitcode'),
  ]);
  const eligible = (release) => release?.tag_name && !release.draft
    && (includePrerelease || !release.prerelease)
    && /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(normalizeVersion(release.tag_name));
  const gitcodeByVersion = new Map((Array.isArray(gitcodePayload) ? gitcodePayload : [])
    .filter(eligible).map((release) => [normalizeVersion(release.tag_name), release]));
  const githubReleases = (Array.isArray(githubPayload) ? githubPayload : [])
    .filter(eligible).sort((left, right) => compareReleaseVersions(right.tag_name, left.tag_name));
  const synchronized = [];
  for (const githubRelease of githubReleases) {
    const gitcodeRelease = gitcodeByVersion.get(normalizeVersion(githubRelease.tag_name));
    if (!gitcodeRelease) continue;
    const verifiedDigests = releaseIsSynchronized(githubRelease, gitcodeRelease);
    if (verifiedDigests && await verifyGitcodeReleaseChecksums(gitcodeRelease, verifiedDigests, signal)) {
      synchronized.push({ githubRelease, gitcodeRelease, verifiedDigests });
      if (synchronized.length >= limit) break;
    } else {
      logger?.info('update-release-sync-pending', { version: normalizeVersion(githubRelease.tag_name) });
    }
  }
  return synchronized;
}

function gitcodeReleaseInfo(release, verifiedDigests) {
  const assets = releaseAssets(release);
  const downloadAsset = pickReleaseDownloadAsset(assets);
  for (const asset of assets) {
    if (verifiedDigests.has(asset.name)) asset.digest = verifiedDigests.get(asset.name);
  }

  return {
    version: normalizeVersion(release.tag_name),
    name: String(release.name || release.tag_name),
    body: String(release.body || ''),
    published_at: String(release.created_at || ''),
    html_url: `https://gitcode.com/oleime/YuduBid/releases/${encodeURIComponent(release.tag_name)}`,
    download_url: downloadAsset.browser_download_url,
    download_name: downloadAsset.name,
    platform: process.platform,
    arch: process.arch,
    source: 'gitcode',
    assets,
  };
}

function githubReleaseInfo(release, verifiedDigests) {
  const assets = releaseAssets(release);
  for (const asset of assets) {
    if (verifiedDigests.has(asset.name)) asset.digest = verifiedDigests.get(asset.name);
  }
  const downloadAsset = pickReleaseDownloadAsset(assets);
  return {
    version: normalizeVersion(release.tag_name || release.name || ''),
    name: String(release.name || release.tag_name || ''),
    body: String(release.body || ''),
    published_at: String(release.published_at || ''),
    html_url: String(release.html_url || 'https://github.com/liwg1995/YuduBid/releases/latest'),
    download_url: downloadAsset ? downloadAsset.browser_download_url : '',
    download_name: String(downloadAsset?.name || ''),
    platform: process.platform,
    arch: process.arch,
    source: 'github',
    assets,
  };
}

async function fetchLatestReleaseInfo(options = {}) {
  const startedAt = Date.now();
  const logger = options.logger;
  const source = normalizeUpdateSource(options.source);
  const includePrerelease = Boolean(options.includePrerelease);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    logger?.info('update-check-started', { includePrerelease, source });
    const synchronized = await fetchSynchronizedReleases(includePrerelease, controller.signal, logger);
    if (!synchronized.length) throw releaseSyncPending('暂未找到 GitHub 与 GitCode 产物均已同步的版本，请稍后再检查。');
    const latest = synchronized[0];
    const release = source === 'github'
      ? githubReleaseInfo(latest.githubRelease, latest.verifiedDigests)
      : gitcodeReleaseInfo(latest.gitcodeRelease, latest.verifiedDigests);
    logger?.info('update-check-succeeded', { source: release.source, version: release.version, durationMs: Date.now() - startedAt });
    return release;
  } catch (error) {
    logger?.error('update-check-failed', {
      errorName: error?.name || 'Error',
      message: error?.message || String(error),
      causeCode: error?.cause?.code || '',
      durationMs: Date.now() - startedAt,
    });
    throw error;
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
    'technical-plan:list-projects',
    'technical-plan:create-project',
    'technical-plan:rename-project',
    'technical-plan:delete-project',
    'technical-plan:switch-project',
    'technical-plan:import-tender-document',
    'technical-plan:import-original-plan-document',
    'technical-plan:import-generated-original-plan',
    'technical-plan:read-tender-markdown',
    'technical-plan:read-original-plan-markdown',
    'technical-plan:update-step',
    'technical-plan:switch-workflow-kind',
    'technical-plan:save-outline-config',
    'technical-plan:save-outline',
    'technical-plan:save-technical-volume',
    'technical-plan:save-global-facts',
    'technical-plan:save-content-generation-options',
    'technical-plan:save-chapter-content',
    'technical-plan:clear',
    'feasibility-report:list-projects',
    'feasibility-report:create-project',
    'feasibility-report:rename-project',
    'feasibility-report:delete-project',
    'feasibility-report:switch-project',
    'feasibility-report:load-state',
    'feasibility-report:update-step',
    'feasibility-report:save-project-info',
    'feasibility-report:import-sources',
    'feasibility-report:read-source-markdown',
    'feasibility-report:remove-source',
    'feasibility-report:save-analysis',
    'feasibility-report:save-outline-config',
    'feasibility-report:save-outline',
    'feasibility-report:save-key-parameters',
    'feasibility-report:save-chapter-content',
    'feasibility-report:save-content-generation-options',
    'feasibility-report:start-analysis',
    'feasibility-report:start-outline',
    'feasibility-report:start-outline-adjustment',
    'feasibility-report:start-parameters',
    'feasibility-report:start-content',
    'feasibility-report:pause-content',
    'feasibility-report:start-human-writing',
    'feasibility-report:get-active-tasks',
    'feasibility-report:clear',
    'duplicate-check:load-state',
    'duplicate-check:save-files',
    'duplicate-check:save-ui-state',
    'duplicate-check:update-state',
    'duplicate-check:export-excel',
    'duplicate-check:clear',
    'rejection-check:load-state',
    'rejection-check:import-document',
    'rejection-check:import-tender-from-technical-plan',
    'rejection-check:remove-document',
    'rejection-check:save-ui-state',
    'rejection-check:update-state',
    'rejection-check:export-excel',
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
    'knowledge-image:list-folders',
    'knowledge-image:create-folder',
    'knowledge-image:rename-folder',
    'knowledge-image:delete-folder',
    'knowledge-image:list',
    'knowledge-image:upload',
    'knowledge-image:update',
    'knowledge-image:move',
    'knowledge-image:add-tags',
    'knowledge-image:find-references',
    'knowledge-image:remove',
    'knowledge-image:get-data-url',
    'knowledge-image:get-thumbnail-data-url',
    'tasks:start-bid-analysis',
    'tasks:start-outline-generation',
    'tasks:pause-outline-generation',
    'tasks:resume-outline-generation',
    'tasks:stop-outline-generation',
    'tasks:start-global-facts-generation',
    'tasks:start-content-generation',
    'tasks:pause-content-generation',
    'tasks:stop-content-generation',
    'tasks:start-rejection-items-extraction',
    'tasks:start-rejection-check',
    'tasks:start-duplicate-analysis',
    'tasks:get-active',
    'bid-templates:list',
    'bid-templates:get',
    'bid-templates:create',
    'bid-templates:update',
    'bid-templates:delete',
    'bid-templates:import-word',
  ].forEach((channel) => ipcMain.handle(channel, throwUnavailable));
  ipcMain.on('tasks:subscribe', () => {});
}

function registerIpcHandlers({ app, mainWindow, appLogger = createAppLogger(app), downloadReleaseInstaller, cancelReleaseInstallerDownload, installDownloadedRelease, getDownloadedReleasePath }) {
  const configStore = createConfigStore(app);
  let agentEnabled = false;
  try {
    const startupConfig = configStore.load();
    agentEnabled = startupConfig.developer_mode === true && startupConfig.agent_settings?.enabled === true;
  } catch (error) {
    console.warn('[agents] Agent 启动配置读取失败，已保持关闭', error?.message || String(error));
  }
  let agentHost = createAgentHost({ app, enabled: false, experimentalWritesEnabled: false });
  let agentServices = null;
  const refreshAgentHost = (config) => {
    agentEnabled = config?.developer_mode === true && config?.agent_settings?.enabled === true;
    if (agentEnabled && !agentServices) return;
    agentHost = createAgentHost({
      app,
      enabled: agentEnabled,
      experimentalWritesEnabled: false,
      services: agentServices || {},
    });
  };
  const usageStatsStore = createUsageStatsStore(app);
  const aiService = createAiService({ app, configStore, usageStatsStore });
  const pluginManager = createPluginManager({ app, aiService });
  const fileService = createFileService({ app, configStore });
  let templateStore = null;
  const exportService = createExportService({ configStore, getTemplateStore: () => templateStore });
  const codeGenerationService = createCodeGenerationService({ app });
  const officialDocumentService = createOfficialDocumentService({ app, aiService, configStore });
  const grantApplicationService = createGrantApplicationService({ app, aiService, configStore });
  const patentGenerationService = createPatentGenerationService({ app, aiService });
  const presalesWorkbenchService = createPresalesWorkbenchService({ app, fileService, aiService });
  const projectManagementService = createProjectManagementService({ app, aiService, configStore });
  const thesisTutorService = createThesisTutorService({ app, aiService, configStore });
  const softwareCopyrightService = createSoftwareCopyrightService({ app, aiService, configStore, codeGenerationService });
  const systemFontService = createSystemFontService();

  registerConfigIpc({ configStore, aiService, onConfigSaved: refreshAgentHost });
  registerUsageStatsIpc({ usageStatsStore });
  registerAiIpc({ aiService });
  registerFileIpc({ fileService });
  registerExportIpc({ exportService });
  registerCodeGenerationIpc({ codeGenerationService });
  registerOfficialDocumentIpc({ officialDocumentService });
  registerGrantApplicationIpc({ grantApplicationService });
  registerPresalesWorkbenchIpc({ presalesWorkbenchService });
  registerProjectManagementIpc({ projectManagementService });
  registerThesisTutorIpc({ thesisTutorService });
  registerSoftwareCopyrightIpc({ softwareCopyrightService });
  registerPatentGenerationIpc({ patentGenerationService });
  registerPluginIpc({ pluginManager });
  registerSystemFontIpc({ systemFontService });

  try {
    const sqliteDatabase = createSqliteDatabase(app);
    const existingPlanExpansionApp = createScopedApp(app, 'existing-plan-expansion');
    const existingPlanExpansionDatabase = createSqliteDatabase(existingPlanExpansionApp);
    const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: sqliteDatabase.db });
    const credentialLibraryService = createCredentialLibraryService({ app, db: sqliteDatabase.db });
    templateStore = createTemplateStore({ app, db: sqliteDatabase.db });
    const knowledgeBaseService = createKnowledgeBaseService({ app, aiService, configStore, knowledgeBaseStore });
    const knowledgeImageService = createKnowledgeImageService({ app, db: sqliteDatabase.db });
    registerKnowledgeBaseCapabilities(pluginManager.capabilityRegistry, knowledgeBaseService, {
      onWorkspaceChanged: (sectionId, plugin) => pluginManager.notifyWorkspaceChanged(sectionId, plugin),
    });
    const technicalPlanStore = createTechnicalPlanStore({ app, db: sqliteDatabase.db, fileService });
    const existingPlanExpansionStore = createTechnicalPlanStore({
      app: existingPlanExpansionApp,
      db: existingPlanExpansionDatabase.db,
      fileService,
    });
    existingPlanExpansionStore.switchWorkflowKind('existing-plan-expansion');
    const technicalPlanStoreRouter = createTechnicalPlanStoreRouter({
      app,
      fileService,
      technicalPlanStore,
      existingPlanExpansionStore,
    });
    const feasibilityReportStoreRouter = createFeasibilityReportStoreRouter({ app, fileService });
    registerFeasibilityReportCapabilities(pluginManager.capabilityRegistry, feasibilityReportStoreRouter);
    const technicalDiagramService = createTechnicalDiagramService({ app });
    const feasibilityReportTaskService = createFeasibilityReportTaskService({ aiService, technicalDiagramService, knowledgeBaseService, feasibilityReportStore: feasibilityReportStoreRouter });
    const duplicateCheckStore = createDuplicateCheckStore({ app, db: sqliteDatabase.db });
    const rejectionCheckStore = createRejectionCheckStore({ app, db: sqliteDatabase.db, fileService, technicalPlanStore: technicalPlanStoreRouter });
    const checkResultExportService = createCheckResultExportService({ app, dialog, rejectionCheckStore, duplicateCheckStore });
    const bidOpportunityService = createBidOpportunityService({ app, db: sqliteDatabase.db, fileService, presalesWorkbenchService, aiService, technicalPlanStore: technicalPlanStoreRouter, rejectionCheckStore });
    registerBidOpportunityCapabilities(pluginManager.capabilityRegistry, bidOpportunityService, {
      onWorkspaceChanged: (sectionId, plugin) => pluginManager.notifyWorkspaceChanged(sectionId, plugin),
    });
    const duplicateCheckService = createDuplicateCheckService({ app, configStore, workspaceStore: duplicateCheckStore });
    const taskService = createTaskService({ app, aiService, technicalDiagramService, technicalPlanStore: technicalPlanStoreRouter, rejectionCheckStore, duplicateCheckStore, knowledgeBaseService, duplicateCheckService, configStore, templateStore });
    agentServices = { technicalPlanStore: technicalPlanStoreRouter, taskService, knowledgeBaseService, presalesWorkbenchService, officialDocumentService, grantApplicationService, projectManagementService, thesisTutorService, softwareCopyrightService, patentGenerationService };
    refreshAgentHost(configStore.load());
    registerBidReviewCapabilities(pluginManager.capabilityRegistry, {
      duplicateCheckStore,
      rejectionCheckStore,
      fileService,
      taskService,
      onWorkspaceChanged: (sectionId, plugin) => pluginManager.notifyWorkspaceChanged(sectionId, plugin),
    });
    registerTechnicalPlanCapabilities(pluginManager.capabilityRegistry, technicalPlanStoreRouter, {
      taskService,
      knowledgeBaseService,
      onWorkspaceChanged: (sectionId, plugin) => pluginManager.notifyWorkspaceChanged(sectionId, plugin),
    });
    const fullBlindCheckController = createFullBlindCheckController({ app, db: sqliteDatabase.db, aiService, configStore, credentialLibraryService, technicalPlanStore: technicalPlanStoreRouter, dialog, shell, emit: event => { for (const window of BrowserWindow.getAllWindows()) if (!window.webContents.isDestroyed()) window.webContents.send('tasks:event', event); } });
    const getBaseActiveTasks = taskService.getActiveTasks.bind(taskService);
    taskService.getActiveTasks = () => [...getBaseActiveTasks(), ...fullBlindCheckController.getActiveTasks()];
    registerFullBlindCheckIpc({ controller: fullBlindCheckController, dialog });
    registerKnowledgeBaseIpc({ knowledgeBaseService, knowledgeImageService });
    registerCredentialLibraryIpc({ credentialLibraryService, configStore });
    registerTemplateIpc({ templateStore });
    registerBidOpportunityIpc({ bidOpportunityService });
    registerTechnicalPlanIpc({ technicalPlanStore: technicalPlanStoreRouter, taskService });
    registerFeasibilityReportIpc({ feasibilityReportStore: feasibilityReportStoreRouter, feasibilityReportTaskService });
    registerDuplicateCheckIpc({ duplicateCheckStore, checkResultExportService });
    registerRejectionCheckIpc({ rejectionCheckStore, checkResultExportService });
    registerTaskIpc({ taskService });
    registerStorageIpc({ storageSpaceService: createStorageSpaceService({ app, db: sqliteDatabase.db, taskService, browserSession: require('electron').session.defaultSession }) });
  } catch (error) {
    registerUnavailableTechnicalPlanIpc(error);
  }
  registerAgentIpc({ getAgentHost: () => agentHost });

  void pluginManager.initialize().catch((error) => {
    console.warn('[plugins] 插件宿主初始化失败，现有业务功能不受影响', error);
  });

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

  ipcMain.handle('app:get-latest-version', (_event, source) => fetchLatestReleaseInfo({ includePrerelease: shouldIncludePrerelease(app), logger: appLogger, source }));
  ipcMain.handle('app:get-release-history', async (_event, source) => {
    const channel = source === 'gitcode' ? 'gitcode' : 'github';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = channel === 'gitcode' ? `${gitcodeReleasesApiUrl}?per_page=100&direction=desc` : `${releasesApiUrl}?per_page=100`;
      const payload = await fetchReleaseJson(url, controller.signal, channel);
      return (Array.isArray(payload) ? payload : [])
        .filter((release) => release?.tag_name && !release.draft && (shouldIncludePrerelease(app) || !release.prerelease))
        .map((release) => ({ version: normalizeVersion(release.tag_name), name: String(release.name || release.tag_name), body: String(release.body || ''), published_at: String(release.published_at || release.created_at || '') }))
        .filter((release) => /^\d+\.\d+\.\d+/.test(release.version));
    } finally {
      clearTimeout(timer);
    }
  });
  ipcMain.handle('app:open-log-directory', async () => {
    fs.mkdirSync(appLogger.directory, { recursive: true });
    const error = await shell.openPath(appLogger.directory);
    return error ? { success: false, message: error } : { success: true };
  });
  ipcMain.handle('app:download-release-installer', async (event, source) => {
    const webContents = event.sender;
    const selectedSource = normalizeUpdateSource(source);
    const checkedRelease = await fetchLatestReleaseInfo({ includePrerelease: shouldIncludePrerelease(app), logger: appLogger, source: selectedSource });
    if (checkedRelease.syncPending) {
      return { success: false, downloaded: false, message: checkedRelease.syncMessage };
    }
    const sources = selectedSource === 'auto' && checkedRelease.source === 'gitcode' ? ['gitcode', 'github'] : [checkedRelease.source];
    let lastError;
    for (const candidate of sources) {
      try {
        const release = candidate === checkedRelease.source
          ? checkedRelease
          : await fetchLatestReleaseInfo({ includePrerelease: shouldIncludePrerelease(app), logger: appLogger, source: candidate });
        if (release.version !== checkedRelease.version) {
          return { success: false, downloaded: false, message: '两个更新渠道的版本已发生变化，请刷新状态后重试。' };
        }
        const asset = release.assets.find((item) => item.browser_download_url === release.download_url && item.name === release.download_name);
        if (!asset) throw new Error('未找到当前系统的官方安装包');
        const result = await downloadReleaseInstaller({
          app,
          mainWindow,
          url: asset.browser_download_url,
          fileName: asset.name,
          version: release.version,
          size: asset.size,
          digest: asset.digest,
          logger: appLogger,
          onProgress: (progress) => webContents.send('app:update-progress', progress),
        });
        if (result.success) return { ...result, source: candidate };
        if (result.canceled) return result;
        lastError = new Error(result.message || '下载安装包失败');
      } catch (error) {
        lastError = error;
      }
      appLogger?.warning('update-download-source-failed', { source: candidate, message: lastError?.message || String(lastError) });
    }
    return { success: false, downloaded: false, message: lastError?.message || '下载安装包失败' };
  });

  ipcMain.handle('app:cancel-release-installer-download', () => cancelReleaseInstallerDownload({ mainWindow }));

  ipcMain.handle('app:install-downloaded-release', () => installDownloadedRelease({ app, mainWindow }));

  ipcMain.handle('app:show-downloaded-release', () => {
    const result = getDownloadedReleasePath();
    if (!result.success || !result.path) {
      return result;
    }
    try {
      shell.showItemInFolder(result.path);
      return { ...result, message: '已打开安装包所在文件夹' };
    } catch (error) {
      return { success: false, message: error?.message || '打开安装包所在文件夹失败' };
    }
  });
}

module.exports = {
  registerIpcHandlers,
};
