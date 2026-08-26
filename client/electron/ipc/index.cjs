const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ipcMain, shell } = require('electron');
const { registerAiIpc } = require('./aiIpc.cjs');
const { registerBidOpportunityIpc } = require('./bidOpportunityIpc.cjs');
const { registerCodeGenerationIpc } = require('./codeGenerationIpc.cjs');
const { registerConfigIpc } = require('./configIpc.cjs');
const { registerDuplicateCheckIpc } = require('./duplicateCheckIpc.cjs');
const { registerExportIpc } = require('./exportIpc.cjs');
const { registerFeasibilityReportIpc } = require('./feasibilityReportIpc.cjs');
const { registerFileIpc } = require('./fileIpc.cjs');
const { registerGrantApplicationIpc } = require('./grantApplicationIpc.cjs');
const { registerKnowledgeBaseIpc } = require('./knowledgeBaseIpc.cjs');
const { registerOfficialDocumentIpc } = require('./officialDocumentIpc.cjs');
const { registerPatentGenerationIpc } = require('./patentGenerationIpc.cjs');
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
const { createOfficialDocumentService } = require('../services/officialDocumentService.cjs');
const { createPatentGenerationService } = require('../services/patentGenerationService.cjs');
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
const { registerUsageStatsIpc } = require('./usageStatsIpc.cjs');

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

function isReleaseDownloadUrl(value) {
  const url = String(value || '');
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/.+/i.test(url);
}

function normalizeReleaseAsset(asset) {
  return {
    name: String(asset?.name || ''),
    browser_download_url: String(asset?.browser_download_url || ''),
    size: Number(asset?.size || 0),
  };
}

function pickReleaseDownloadAsset(assets = []) {
  const candidates = (Array.isArray(assets) ? assets : [])
    .map(normalizeReleaseAsset)
    .filter((asset) => {
      const name = asset.name.toLowerCase();
      return (
        asset.name &&
        isReleaseDownloadUrl(asset.browser_download_url) &&
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

async function fetchReleaseJson(url, signal) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'YuDuBid-Client',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`GitHub 返回 ${response.status}`);
  }

  return response.json();
}

async function fetchReleaseByTag(tagName, signal) {
  const tag = String(tagName || '').trim();
  if (!tag) {
    return null;
  }
  return fetchReleaseJson(`${releasesApiUrl}/tags/${encodeURIComponent(tag)}`, signal);
}

function shouldIncludePrerelease(app) {
  return String(app?.getVersion?.() || '').includes('-') || process.env.YIBIAO_INCLUDE_PRERELEASE_UPDATE === '1';
}

async function fetchLatestReleaseInfo(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const includePrerelease = Boolean(options.includePrerelease);
    const payload = await fetchReleaseJson(includePrerelease ? `${releasesApiUrl}?per_page=20` : latestReleaseApiUrl, controller.signal);
    let release = Array.isArray(payload)
      ? payload.find((item) => item && !item.draft && (includePrerelease || !item.prerelease))
      : payload;
    if (!release) {
      throw new Error('未找到可用版本');
    }

    let assets = Array.isArray(release.assets) ? release.assets : [];
    let downloadAsset = pickReleaseDownloadAsset(assets);
    if (!downloadAsset && release.tag_name) {
      const tagRelease = await fetchReleaseByTag(release.tag_name, controller.signal);
      if (tagRelease && !tagRelease.draft) {
        release = tagRelease;
        assets = Array.isArray(release.assets) ? release.assets : [];
        downloadAsset = pickReleaseDownloadAsset(assets);
      }
    }

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
      assets: assets.map(normalizeReleaseAsset),
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
  ].forEach((channel) => ipcMain.handle(channel, throwUnavailable));
  ipcMain.on('tasks:subscribe', () => {});
}

function registerIpcHandlers({ app, mainWindow, checkAndDownloadUpdate, triggerUpdateDownload, downloadReleaseInstaller, cancelReleaseInstallerDownload, installDownloadedRelease, getDownloadedReleasePath, quitAndInstall }) {
  const configStore = createConfigStore(app);
  const usageStatsStore = createUsageStatsStore(app);
  const aiService = createAiService({ app, configStore, usageStatsStore });
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
  const systemFontService = createSystemFontService();

  registerConfigIpc({ configStore, aiService });
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
  registerSoftwareCopyrightIpc({ softwareCopyrightService: createSoftwareCopyrightService({ app, aiService, configStore, codeGenerationService }) });
  registerPatentGenerationIpc({ patentGenerationService });
  registerSystemFontIpc({ systemFontService });

  try {
    const sqliteDatabase = createSqliteDatabase(app);
    const existingPlanExpansionApp = createScopedApp(app, 'existing-plan-expansion');
    const existingPlanExpansionDatabase = createSqliteDatabase(existingPlanExpansionApp);
    const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: sqliteDatabase.db });
    templateStore = createTemplateStore({ app, db: sqliteDatabase.db });
    const knowledgeBaseService = createKnowledgeBaseService({ app, aiService, configStore, knowledgeBaseStore });
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
    const technicalDiagramService = createTechnicalDiagramService({ app });
    const feasibilityReportTaskService = createFeasibilityReportTaskService({ aiService, technicalDiagramService, knowledgeBaseService, feasibilityReportStore: feasibilityReportStoreRouter });
    const duplicateCheckStore = createDuplicateCheckStore({ app, db: sqliteDatabase.db });
    const rejectionCheckStore = createRejectionCheckStore({ app, db: sqliteDatabase.db, fileService, technicalPlanStore: technicalPlanStoreRouter });
    const bidOpportunityService = createBidOpportunityService({ app, db: sqliteDatabase.db, fileService, presalesWorkbenchService, aiService, technicalPlanStore: technicalPlanStoreRouter, rejectionCheckStore });
    const duplicateCheckService = createDuplicateCheckService({ app, configStore, workspaceStore: duplicateCheckStore });
    const taskService = createTaskService({ aiService, technicalDiagramService, technicalPlanStore: technicalPlanStoreRouter, rejectionCheckStore, duplicateCheckStore, knowledgeBaseService, duplicateCheckService });
    registerKnowledgeBaseIpc({ knowledgeBaseService });
    registerTemplateIpc({ templateStore });
    registerBidOpportunityIpc({ bidOpportunityService });
    registerTechnicalPlanIpc({ technicalPlanStore: technicalPlanStoreRouter });
    registerFeasibilityReportIpc({ feasibilityReportStore: feasibilityReportStoreRouter, feasibilityReportTaskService });
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

  ipcMain.handle('app:download-release-installer', (event, payload = {}) => {
    const webContents = event.sender;
    return downloadReleaseInstaller({
      app,
      mainWindow,
      url: payload.download_url,
      fileName: payload.download_name,
      version: payload.version,
      size: payload.size,
      onProgress: (progress) => {
        webContents.send('app:update-progress', progress);
      },
    });
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
