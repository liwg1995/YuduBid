const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createSqliteDatabase } = require('./sqliteDatabase.cjs');
const { createFeasibilityReportStore, DEFAULT_PROJECT_INFO } = require('./feasibilityReportStore.cjs');
const { deleteImportedImageBatches } = require('../utils/importedImages.cjs');

function createScopedApp(app, scopeName) {
  return {
    getPath(name) {
      if (name === 'userData') return path.join(app.getPath('userData'), scopeName);
      return app.getPath(name);
    },
    once: (...args) => app.once(...args),
  };
}

function createFeasibilityReportStoreRouter({ app, fileService }) {
  const registryPath = path.join(app.getPath('userData'), 'workspace', 'feasibility-report', 'projects.json');
  const projectRoot = path.join(app.getPath('userData'), 'feasibility-report-projects');
  const storeCache = new Map();

  const now = () => new Date().toISOString();
  const normalizeProjectId = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!normalized) throw new Error('可研项目 ID 无效');
    return normalized;
  };
  const createProjectId = () => `fr-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const createSourceId = () => `src-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

  function readRegistry() {
    if (!fs.existsSync(registryPath)) return { activeProjectId: undefined, projects: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      return {
        activeProjectId: parsed?.activeProjectId ? normalizeProjectId(parsed.activeProjectId) : undefined,
        projects: Array.isArray(parsed?.projects) ? parsed.projects.map((project) => ({
          id: normalizeProjectId(project.id),
          name: String(project.name || '').trim() || '未命名可研项目',
          created_at: String(project.created_at || now()),
          updated_at: String(project.updated_at || project.created_at || now()),
        })) : [],
      };
    } catch {
      return { activeProjectId: undefined, projects: [] };
    }
  }

  function writeRegistry(registry) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  }

  function getProjectId(payload) {
    const requested = typeof payload === 'string' ? payload : payload?.projectId || payload?.project_id;
    if (requested) return normalizeProjectId(requested);
    const registry = readRegistry();
    if (registry.activeProjectId) return registry.activeProjectId;
    throw new Error('请先创建可研项目');
  }

  function getProject(projectId) {
    const registry = readRegistry();
    const project = registry.projects.find((item) => item.id === projectId);
    if (!project) throw new Error('可研项目不存在或已删除');
    return { registry, project };
  }

  function createProjectStore(projectId) {
    const scopedApp = createScopedApp(app, path.join('feasibility-report-projects', projectId));
    const database = createSqliteDatabase(scopedApp);
    const store = createFeasibilityReportStore({ app: scopedApp, db: database.db });
    return { app: scopedApp, database, store };
  }

  function getOrCreateProjectStore(projectId) {
    if (!storeCache.has(projectId)) storeCache.set(projectId, createProjectStore(projectId));
    return storeCache.get(projectId);
  }

  function pickStore(payload) {
    const projectId = getProjectId(payload);
    getProject(projectId);
    return { projectId, ...getOrCreateProjectStore(projectId) };
  }

  function getProjectSummary(projectId) {
    const state = getOrCreateProjectStore(projectId).store.loadFeasibilityReport();
    let contentTotal = 0;
    let contentCompleted = 0;
    const visit = (items) => (Array.isArray(items) ? items : []).forEach((item) => {
      if (Array.isArray(item.children) && item.children.length) {
        visit(item.children);
        return;
      }
      contentTotal += 1;
      if (String(item.content || '').trim()) contentCompleted += 1;
    });
    visit(state.outlineData?.outline);
    return { step: state.step, contentCompleted, contentTotal };
  }

  function withProjectMeta(state, projectId) {
    const { project } = getProject(projectId);
    return { ...state, projectId, projectName: project.name };
  }

  function touchProject(projectId) {
    const registry = readRegistry();
    const projects = registry.projects.map((project) => project.id === projectId ? { ...project, updated_at: now() } : project);
    writeRegistry({ ...registry, projects });
  }

  function mutate(payload, method, ...args) {
    const { projectId, store } = pickStore(payload);
    const result = store[method](...args);
    touchProject(projectId);
    return withProjectMeta(result, projectId);
  }

  return {
    listProjects() {
      const registry = readRegistry();
      const activeProjectId = registry.activeProjectId && registry.projects.some((project) => project.id === registry.activeProjectId)
        ? registry.activeProjectId
        : registry.projects[0]?.id;
      if (activeProjectId !== registry.activeProjectId) writeRegistry({ ...registry, activeProjectId });
      return {
        activeProjectId,
        projects: registry.projects
          .map((project) => ({ ...project, ...getProjectSummary(project.id), isActive: project.id === activeProjectId }))
          .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
      };
    },

    createProject(payload = {}) {
      const registry = readRegistry();
      const timestamp = now();
      const name = String(payload.projectName || payload.name || '').trim();
      if (!name) throw new Error('可研项目名称不能为空');
      const project = { id: createProjectId(), name, created_at: timestamp, updated_at: timestamp };
      writeRegistry({ activeProjectId: project.id, projects: [project, ...registry.projects] });
      const { store } = pickStore(project.id);
      store.saveProjectInfo({ ...DEFAULT_PROJECT_INFO, projectName: name }, { clearDownstream: false });
      return { project: { ...project, isActive: true }, projects: this.listProjects() };
    },

    renameProject(payload = {}) {
      const projectId = getProjectId(payload);
      const name = String(payload.name || payload.projectName || '').trim();
      if (!name) throw new Error('可研项目名称不能为空');
      const { registry } = getProject(projectId);
      const { store } = pickStore({ projectId });
      const currentState = store.loadFeasibilityReport();
      store.saveProjectInfo({ ...currentState.projectInfo, projectName: name }, { clearDownstream: false });
      const projects = registry.projects.map((project) => project.id === projectId ? { ...project, name, updated_at: now() } : project);
      writeRegistry({ ...registry, projects });
      return this.listProjects();
    },

    deleteProject(payload = {}) {
      const projectId = getProjectId(payload);
      const { registry } = getProject(projectId);
      const projects = registry.projects.filter((project) => project.id !== projectId);
      const activeProjectId = registry.activeProjectId === projectId ? projects[0]?.id : registry.activeProjectId;
      const cached = storeCache.get(projectId);
      if (cached?.database?.close) cached.database.close();
      storeCache.delete(projectId);
      const targetPath = path.resolve(projectRoot, projectId);
      const relative = path.relative(path.resolve(projectRoot), targetPath);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('可研项目目录无效，已停止删除');
      fs.rmSync(targetPath, { recursive: true, force: true });
      writeRegistry({ activeProjectId, projects });
      return this.listProjects();
    },

    switchProject(payload = {}) {
      const projectId = getProjectId(payload);
      const { registry } = getProject(projectId);
      writeRegistry({ ...registry, activeProjectId: projectId });
      return this.loadState({ projectId });
    },

    loadState(payload = {}) {
      const { projectId, store } = pickStore(payload);
      return withProjectMeta(store.loadFeasibilityReport(), projectId);
    },

    updateStep(payload = {}) {
      return mutate(payload, 'updateStep', payload.step);
    },

    saveProjectInfo(payload = {}) {
      return mutate(payload, 'saveProjectInfo', payload.projectInfo || payload, { clearDownstream: payload.clearDownstream !== false });
    },

    async importSources(payload = {}) {
      if (!fileService?.importDocuments) throw new Error('文件导入服务尚未初始化');
      const { projectId, app: scopedApp, store } = pickStore(payload);
      const sourceIds = [];
      const result = await fileService.importDocuments({
        title: '选择可研项目资料（可多选）',
        filterName: '可研项目资料',
        multiple: true,
        preserveImages: true,
        storageApp: scopedApp,
        createAssetScope: () => {
          const sourceId = createSourceId();
          sourceIds.push(sourceId);
          return `feasibility-report-source-${sourceId}`;
        },
      });
      if (!result?.success) {
        sourceIds.forEach((sourceId) => deleteImportedImageBatches(scopedApp, `feasibility-report-source-${sourceId}`));
        return {
          success: false,
          message: result?.message || '未导入项目资料',
          state: withProjectMeta(store.loadFeasibilityReport(), projectId),
        };
      }
      try {
        const state = store.importSources(result.documents.map((document, index) => ({
          id: sourceIds[index],
          fileName: document.file_name,
          markdown: document.file_content,
          parserLabel: document.parser_label,
        })));
        touchProject(projectId);
        return {
          success: true,
          message: result.message || `已导入 ${result.documents.length} 份项目资料`,
          importedSourceIds: sourceIds,
          state: withProjectMeta(state, projectId),
        };
      } catch (error) {
        sourceIds.forEach((sourceId) => deleteImportedImageBatches(scopedApp, `feasibility-report-source-${sourceId}`));
        throw error;
      }
    },

    readSourceMarkdown(payload = {}) {
      const { store } = pickStore(payload);
      return store.readSourceMarkdown(payload.sourceId);
    },

    readCombinedSourceMarkdown(payload = {}) {
      const { store } = pickStore(payload);
      return store.readCombinedSourceMarkdown();
    },

    saveTask(payload = {}) {
      return mutate(payload, 'saveTask', payload.type, payload.task);
    },

    removeSource(payload = {}) {
      return mutate(payload, 'removeSource', payload.sourceId);
    },

    saveAnalysis(payload = {}) {
      return mutate(payload, 'saveAnalysis', payload.markdown);
    },

    saveOutlineConfig(payload = {}) {
      return mutate(payload, 'saveOutlineConfig', payload);
    },

    saveOutline(payload = {}) {
      return mutate(payload, 'saveOutline', payload.outlineData);
    },

    saveKeyParameters(payload = {}) {
      return mutate(payload, 'saveKeyParameters', payload.markdown);
    },

    saveChapterContent(payload = {}) {
      return mutate(payload, 'saveChapterContent', payload);
    },

    saveContentGenerationOptions(payload = {}) {
      return mutate(payload, 'saveContentGenerationOptions', payload.contentGenerationOptions || payload.options || payload);
    },

    saveContentSection(payload = {}) {
      return mutate(payload, 'saveContentSection', payload);
    },

    saveGeneratedChapterContent(payload = {}) {
      return mutate(payload, 'saveGeneratedChapterContent', payload);
    },

    saveReviewedChapterContent(payload = {}) {
      return mutate(payload, 'saveReviewedChapterContent', payload);
    },

    recoverInterruptedContentSections(payload = {}) {
      return mutate(payload, 'recoverInterruptedContentSections');
    },

    clearProject(payload = {}) {
      const { projectId, store } = pickStore(payload);
      const result = store.clearFeasibilityReport();
      touchProject(projectId);
      return { ...result, state: withProjectMeta(result.state, projectId) };
    },
  };
}

module.exports = { createFeasibilityReportStoreRouter };
