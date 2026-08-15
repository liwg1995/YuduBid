const fs = require('node:fs');
const path = require('node:path');
const { getProjectManagementDir } = require('../utils/paths.cjs');
const {
  clone,
  initialState,
  normalizeProfile,
  normalizeState,
  normalizeString,
  now,
  recoverInterruptedTask,
} = require('./projectManagementState.cjs');

const defaultProjectTypes = [
  'IT服务项目',
  '小程序建设',
  '系统集成',
  'SaaS 实施',
  '数据看板',
  '企业微信集成',
  '支付/会员系统',
  '运维续约项目',
  '合规上线项目',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function createProjectManagementStore({ app, getActiveTask = () => null, onStateChange = () => {} }) {
  const dir = () => ensureDir(getProjectManagementDir(app));
  const legacyStatePath = () => path.join(dir(), 'state.json');
  const indexPath = () => path.join(dir(), 'index.json');
  const dictionariesPath = () => path.join(dir(), 'dictionaries.json');
  const projectsDir = () => ensureDir(path.join(dir(), 'projects'));
  const statePath = (projectId) => path.join(projectsDir(), `${normalizeProjectId(projectId)}.json`);

  function normalizeProjectId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || `pm-${Date.now()}`;
  }

  function createProjectId() {
    return normalizeProjectId(`pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  function readIndexFile() {
    if (!fs.existsSync(indexPath())) return null;
    const index = safeJsonParse(fs.readFileSync(indexPath(), 'utf-8'), null);
    return index && typeof index === 'object' ? index : null;
  }

  function writeIndexFile(index) {
    fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2), 'utf-8');
  }

  function normalizeDictionaryItems(items = []) {
    return Array.from(new Set((Array.isArray(items) ? items : [])
      .map((item) => normalizeString(item, 80))
      .filter(Boolean)));
  }

  function readDictionaries() {
    const stored = fs.existsSync(dictionariesPath())
      ? safeJsonParse(fs.readFileSync(dictionariesPath(), 'utf-8'), {})
      : {};
    const dictionaries = {
      projectTypes: normalizeDictionaryItems([...(stored.projectTypes || []), ...defaultProjectTypes]),
      projectGroups: normalizeDictionaryItems(stored.projectGroups || []),
    };
    fs.writeFileSync(dictionariesPath(), JSON.stringify(dictionaries, null, 2), 'utf-8');
    return dictionaries;
  }

  function saveDictionary(kind, items = []) {
    const current = readDictionaries();
    const key = kind === 'projectGroups' ? 'projectGroups' : 'projectTypes';
    const next = {
      ...current,
      [key]: key === 'projectTypes'
        ? normalizeDictionaryItems([...defaultProjectTypes, ...items])
        : normalizeDictionaryItems(items),
    };
    fs.writeFileSync(dictionariesPath(), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  function upsertDictionaryItem(kind, value) {
    const item = normalizeString(value, 80);
    if (!item) return readDictionaries();
    const current = readDictionaries();
    const key = kind === 'projectGroups' ? 'projectGroups' : 'projectTypes';
    if (current[key].includes(item)) return current;
    return saveDictionary(key, [...current[key], item]);
  }

  function createBlankState(projectId, profile = {}) {
    return normalizeState({
      ...clone(initialState),
      projectId,
      created_at: now(),
      updated_at: now(),
      profile: normalizeProfile(profile),
    });
  }

  function completedCountFromState(state) {
    return [
      'planningResult', 'discoveryResult', 'executionResult', 'riskResult', 'stakeholderResult',
      'deliveryResult', 'reportingResult', 'commercialResult', 'retrospectiveResult', 'complianceResult',
    ].filter((key) => String(state?.[key] || '').trim()).length;
  }

  function ensureProjectIndex() {
    ensureDir(dir());
    ensureDir(projectsDir());
    let index = readIndexFile();
    const projects = Array.isArray(index?.projects) ? index.projects : [];

    if (!projects.length) {
      const legacyState = fs.existsSync(legacyStatePath())
        ? safeJsonParse(fs.readFileSync(legacyStatePath(), 'utf-8'), initialState)
        : initialState;
      const projectId = normalizeProjectId(legacyState.projectId || 'default');
      const normalized = normalizeState({
        ...clone(initialState),
        ...legacyState,
        projectId,
        created_at: legacyState.created_at || legacyState.updated_at || now(),
        updated_at: legacyState.updated_at || now(),
      });
      fs.writeFileSync(statePath(projectId), JSON.stringify(normalized, null, 2), 'utf-8');
      index = {
        activeProjectId: projectId,
        projects: [{ id: projectId, created_at: normalized.created_at, updated_at: normalized.updated_at }],
      };
      writeIndexFile(index);
      return index;
    }

    const normalizedProjects = projects
      .map((project) => ({
        id: normalizeProjectId(project.id),
        created_at: normalizeString(project.created_at, 80) || now(),
        updated_at: normalizeString(project.updated_at, 80) || now(),
      }))
      .filter((project, indexInList, list) => project.id && list.findIndex((item) => item.id === project.id) === indexInList);
    const activeProjectId = normalizedProjects.some((project) => project.id === index.activeProjectId)
      ? index.activeProjectId
      : normalizedProjects[0].id;
    const nextIndex = { activeProjectId, projects: normalizedProjects };
    writeIndexFile(nextIndex);
    return nextIndex;
  }

  function updateProjectIndexEntry(projectId, state) {
    const index = ensureProjectIndex();
    const nextProjects = index.projects.filter((project) => project.id !== projectId);
    nextProjects.unshift({
      id: projectId,
      created_at: state.created_at || now(),
      updated_at: state.updated_at || now(),
    });
    writeIndexFile({ ...index, activeProjectId: projectId, projects: nextProjects });
  }

  function loadState(projectId) {
    const index = ensureProjectIndex();
    const activeProjectId = normalizeProjectId(projectId || index.activeProjectId || index.projects[0]?.id);
    const filePath = statePath(activeProjectId);
    const storedState = fs.existsSync(filePath)
      ? safeJsonParse(fs.readFileSync(filePath, 'utf-8'), initialState)
      : initialState;
    const activeTask = getActiveTask();
    const stateWithRuntimeTask = {
      ...clone(initialState),
      ...storedState,
      projectId: activeProjectId,
      task: activeProjectId === index.activeProjectId ? activeTask || storedState.task : storedState.task,
    };
    const normalized = normalizeState(
      activeProjectId === index.activeProjectId && activeTask
        ? stateWithRuntimeTask
        : recoverInterruptedTask(stateWithRuntimeTask),
    );
    if (!fs.existsSync(filePath) || normalized.task?.status !== storedState.task?.status) {
      fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
    }
    return normalized;
  }

  function saveState(partial = {}) {
    const index = ensureProjectIndex();
    const projectId = normalizeProjectId(index.activeProjectId || index.projects[0]?.id);
    const current = loadState(projectId);
    const nextState = normalizeState({ ...current, ...partial, projectId, created_at: current.created_at || now(), updated_at: now() });
    fs.writeFileSync(statePath(projectId), JSON.stringify(nextState, null, 2), 'utf-8');
    updateProjectIndexEntry(projectId, nextState);
    onStateChange(nextState);
    return nextState;
  }

  function projectRecordFromState(state) {
    return {
      id: state.projectId,
      name: state?.profile?.projectName || '未命名项目',
      clientName: state.profile.clientName,
      vendorName: state.profile.vendorName,
      projectType: state.profile.projectType,
      projectGroup: state.profile.projectGroup,
      currentStage: state.profile.currentStage,
      completedCount: completedCountFromState(state),
      created_at: state.created_at,
      updated_at: state.updated_at,
      isActive: state.projectId === ensureProjectIndex().activeProjectId,
      state,
    };
  }

  function listProjects() {
    const index = ensureProjectIndex();
    const projects = index.projects
      .map((project) => loadState(project.id))
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
      .map(projectRecordFromState);
    return { activeProjectId: index.activeProjectId, projects };
  }

  function createProject(payload = {}) {
    const projectId = createProjectId();
    const profile = normalizeProfile({
      ...(payload.profile || {}),
      projectName: payload.projectName || payload.profile?.projectName || '',
    });
    upsertDictionaryItem('projectTypes', profile.projectType);
    upsertDictionaryItem('projectGroups', profile.projectGroup);
    const nextState = createBlankState(projectId, profile);
    fs.writeFileSync(statePath(projectId), JSON.stringify(nextState, null, 2), 'utf-8');
    const index = ensureProjectIndex();
    writeIndexFile({
      activeProjectId: projectId,
      projects: [{ id: projectId, created_at: nextState.created_at, updated_at: nextState.updated_at }, ...index.projects],
    });
    onStateChange(nextState);
    return { state: nextState, projects: listProjects() };
  }

  function switchProject(projectId) {
    const targetProjectId = normalizeProjectId(projectId);
    const index = ensureProjectIndex();
    if (!index.projects.some((project) => project.id === targetProjectId)) throw new Error('未找到要进入的项目');
    writeIndexFile({ ...index, activeProjectId: targetProjectId });
    const state = loadState(targetProjectId);
    onStateChange(state);
    return state;
  }

  function deleteProject(projectId) {
    const targetProjectId = normalizeProjectId(projectId);
    const index = ensureProjectIndex();
    if (!index.projects.some((project) => project.id === targetProjectId)) throw new Error('未找到要删除的项目');
    const nextProjects = index.projects.filter((project) => project.id !== targetProjectId);
    if (fs.existsSync(statePath(targetProjectId))) fs.rmSync(statePath(targetProjectId), { force: true });
    if (!nextProjects.length) {
      const nextState = createBlankState(createProjectId());
      fs.writeFileSync(statePath(nextState.projectId), JSON.stringify(nextState, null, 2), 'utf-8');
      writeIndexFile({
        activeProjectId: nextState.projectId,
        projects: [{ id: nextState.projectId, created_at: nextState.created_at, updated_at: nextState.updated_at }],
      });
      onStateChange(nextState);
      return { success: true, state: nextState, projects: listProjects() };
    }
    const activeProjectId = index.activeProjectId === targetProjectId ? nextProjects[0].id : index.activeProjectId;
    writeIndexFile({ activeProjectId, projects: nextProjects });
    const state = loadState(activeProjectId);
    onStateChange(state);
    return { success: true, state, projects: listProjects() };
  }

  function deleteProjects(projectIds = []) {
    const ids = normalizeDictionaryItems(projectIds).map(normalizeProjectId);
    if (!ids.length) throw new Error('请选择要删除的项目');
    let result = null;
    for (const id of ids) {
      const index = ensureProjectIndex();
      if (index.projects.some((project) => project.id === id)) result = deleteProject(id);
    }
    return result || { success: true, state: loadState(), projects: listProjects() };
  }

  function clear() {
    const current = loadState();
    const nextState = normalizeState({ ...clone(initialState), projectId: current.projectId, created_at: current.created_at, updated_at: now() });
    fs.writeFileSync(statePath(current.projectId), JSON.stringify(nextState, null, 2), 'utf-8');
    updateProjectIndexEntry(current.projectId, nextState);
    onStateChange(nextState);
    return { success: true, state: nextState };
  }

  return {
    clear,
    createProject,
    deleteProject,
    deleteProjects,
    listProjects,
    loadState,
    readDictionaries,
    saveDictionary,
    saveState,
    switchProject,
    upsertDictionaryItem,
  };
}

module.exports = { createProjectManagementStore };
