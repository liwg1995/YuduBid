'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { dialog, shell } = require('electron');
const { createCapabilityRegistry } = require('./capabilityRegistry.cjs');
const { validateManifest } = require('./pluginManifest.cjs');
const { createPluginRegistry } = require('./pluginRegistry.cjs');
const { createPluginRuntime } = require('./pluginRuntime.cjs');
const { registerPluginStorageCapabilities } = require('./pluginStorageCapabilities.cjs');

const MAX_PACKAGE_FILES = 2000;
const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;
const NAVIGATION_SECTION_IDS = new Set([
  'home',
  'presales-projects',
  'presales-workbench',
  'technical-plan',
  'existing-plan-expansion',
  'feasibility-report',
  'bid-template-management',
  'knowledge-base',
  'duplicate-check',
  'rejection-check',
  'bid-opportunity',
  'official-document-drafting',
  'official-document-check',
  'official-document-polish',
  'official-document-templates',
  'grant-projects',
  'grant-diagnosis',
  'grant-topic-policy',
  'grant-proposal',
  'grant-review-defense',
  'project-types',
  'project-management',
  'project-history',
  'thesis-diagnosis',
  'thesis-topic',
  'thesis-literature',
  'thesis-methodology',
  'thesis-data',
  'thesis-charts',
  'thesis-drafting',
  'thesis-writing',
  'thesis-review',
  'thesis-format',
  'software-copyright',
  'code-generation',
  'patent-mining',
  'patent-disclosure',
  'patent-prior-art',
  'patent-iteration',
  'settings',
]);
const TECHNICAL_PLAN_SECTION_IDS = new Set(['technical-plan', 'existing-plan-expansion']);
const TECHNICAL_PLAN_VIEW_IDS = new Set([
  'document-analysis',
  'bid-analysis',
  'outline-generation',
  'global-facts',
  'content-edit',
  'expand',
]);

function normalizeArchivePath(value) {
  const raw = String(value || '').replaceAll('\\', '/');
  const normalized = path.posix.normalize(raw);
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`插件包包含不安全路径：${raw || '(empty)'}`);
  }
  return normalized.replace(/^\.\//, '');
}

function isSymbolicLinkEntry(entry) {
  const unixMode = (Number(entry.attr || 0) >>> 16) & 0o170000;
  return unixMode === 0o120000;
}

function inspectPackage(packagePath) {
  const zip = new AdmZip(packagePath);
  const entries = zip.getEntries();
  if (!entries.length || entries.length > MAX_PACKAGE_FILES) throw new Error('插件包文件数量无效或超过限制');

  let totalSize = 0;
  const names = new Set();
  for (const entry of entries) {
    const name = normalizeArchivePath(entry.entryName);
    if (names.has(name)) throw new Error(`插件包包含重复路径：${name}`);
    names.add(name);
    if (isSymbolicLinkEntry(entry)) throw new Error(`插件包不允许符号链接：${name}`);
    totalSize += Number(entry.header?.size || 0);
    if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new Error('插件包解压后超过 150MB 限制');
  }

  const manifestEntry = zip.getEntry('plugin.json');
  if (!manifestEntry || manifestEntry.isDirectory) throw new Error('插件包根目录缺少 plugin.json');
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(manifestEntry.getData().toString('utf8')));
  } catch (error) {
    throw new Error(`插件 Manifest 校验失败：${error.message || String(error)}`);
  }
  for (const entryPath of [manifest.entry.main, manifest.entry.renderer]) {
    const entry = zip.getEntry(entryPath);
    if (!entry || entry.isDirectory) throw new Error(`插件入口不存在：${entryPath}`);
  }
  return { zip, manifest, totalSize };
}

function normalizeChatMessages(args) {
  const messages = Array.isArray(args?.messages) ? args.messages : [];
  if (!messages.length || messages.length > 20) throw new Error('AI 对话消息数量必须为 1-20 条');
  let totalLength = 0;
  const normalized = messages.map((message) => {
    const role = String(message?.role || '').trim();
    const content = String(message?.content || '').trim();
    if (!['system', 'user', 'assistant'].includes(role)) throw new Error(`AI 对话消息角色无效：${role || 'empty'}`);
    if (!content || content.length > 8000) throw new Error('AI 对话单条消息必须为 1-8000 个字符');
    totalLength += content.length;
    return { role, content };
  });
  if (totalLength > 32000) throw new Error('AI 对话消息总长度不能超过 32000 个字符');
  return normalized;
}

function createPluginManager({ app, aiService }) {
  const registry = createPluginRegistry(app);
  const capabilityRegistry = createCapabilityRegistry();
  const listeners = new Set();

  registerPluginStorageCapabilities(capabilityRegistry);

  capabilityRegistry.register({
    id: 'ai.chat',
    name: 'AI 文本对话',
    version: '1.0',
    permission: 'ai.chat',
  }, async (args) => {
    if (!aiService?.chat) throw new Error('宿主 AI 服务未就绪');
    const content = await aiService.chat({
      messages: normalizeChatMessages(args),
      temperature: 0.3,
      logTitle: 'YuduAssistant-对话',
    });
    return { message: { role: 'assistant', content: String(content || '').trim() } };
  });

  function emit(event) {
    for (const listener of listeners) {
      try { listener(event); } catch { /* Renderer 订阅异常不能影响插件状态。 */ }
    }
  }

  capabilityRegistry.register({
    id: 'navigation.open',
    name: '打开宿主页面',
    version: '1.1',
    permission: 'navigation.open',
  }, (args, plugin) => {
    const sectionId = String(args?.sectionId || '').trim();
    if (!NAVIGATION_SECTION_IDS.has(sectionId)) {
      throw new Error(`不允许打开页面：${sectionId || 'empty'}`);
    }
    const viewId = String(args?.viewId || '').trim();
    const projectId = String(args?.projectId || '').trim();
    const workflowKind = String(args?.workflowKind || '').trim();
    const panelId = String(args?.panelId || '').trim();
    if (viewId) {
      if (!TECHNICAL_PLAN_SECTION_IDS.has(sectionId) || workflowKind !== sectionId) {
        throw new Error('项目步骤导航与目标工作流不匹配');
      }
      if (!TECHNICAL_PLAN_VIEW_IDS.has(viewId)) {
        throw new Error(`不允许打开工作步骤：${viewId}`);
      }
      if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(projectId)) {
        throw new Error('项目步骤导航缺少有效项目 ID');
      }
    } else if (projectId || workflowKind) {
      throw new Error('一级页面导航不能携带项目上下文');
    }
    if (panelId && !(sectionId === 'technical-plan' && viewId === 'outline-generation' && panelId === 'outline-generation-config')) {
      throw new Error(`不允许打开功能面板：${panelId}`);
    }
    emit({
      type: 'navigation-requested',
      pluginId: plugin.manifest.id,
      plugin: get(plugin.manifest.id),
      sectionId,
      ...(viewId ? { workflowKind, projectId, viewId, ...(panelId ? { panelId } : {}) } : {}),
    });
    return { opened: true, sectionId, ...(viewId ? { workflowKind, projectId, viewId, ...(panelId ? { panelId } : {}) } : {}) };
  });

  function updateRuntimeStatus(pluginId, patch) {
    const snapshot = registry.read();
    const current = snapshot.plugins[pluginId];
    if (!current) return;
    registry.update((next) => {
      if (!next.plugins[pluginId]) return next;
      next.plugins[pluginId] = { ...next.plugins[pluginId], ...patch, updatedAt: new Date().toISOString() };
      return next;
    });
    emit({ type: 'status-changed', pluginId, plugin: get(pluginId) });
  }

  const runtime = createPluginRuntime({ app, capabilityRegistry, onStatusChange: updateRuntimeStatus });
  app.once('before-quit', () => runtime.stopAll());

  function toPublicRecord(record) {
    return {
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.activeVersion,
      apiVersion: record.manifest.apiVersion,
      publisher: record.manifest.publisher,
      license: record.manifest.license,
      permissions: record.manifest.permissions,
      contributes: record.manifest.contributes,
      enabled: Boolean(record.enabled),
      status: runtime.isRunning(record.manifest.id) ? 'running' : record.status || 'stopped',
      lastError: record.lastError || '',
      installedAt: record.installedAt,
      updatedAt: record.updatedAt,
    };
  }

  function list() {
    return Object.values(registry.read().plugins).map(toPublicRecord).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  function get(pluginId) {
    const record = registry.read().plugins[pluginId];
    return record ? toPublicRecord(record) : null;
  }

  function getRuntimePlugin(record) {
    return {
      manifest: record.manifest,
      installDir: registry.getPluginDir(record.manifest.id, record.activeVersion),
      dataDir: registry.getPluginDataDir(record.manifest.id),
    };
  }

  async function importPackage() {
    const selection = await dialog.showOpenDialog({
      title: '导入禹都插件',
      properties: ['openFile'],
      filters: [
        { name: '禹都插件包', extensions: ['yudu-plugin'] },
        { name: 'ZIP 压缩包', extensions: ['zip'] },
      ],
    });
    if (selection.canceled || !selection.filePaths[0]) return { success: false, canceled: true, plugins: list() };
    return installFromPath(selection.filePaths[0]);
  }

  async function installFromPath(packagePath) {
    const { zip, manifest } = inspectPackage(packagePath);
    registry.ensureRoots();
    const targetDir = registry.getPluginDir(manifest.id, manifest.version);
    if (fs.existsSync(targetDir)) throw new Error(`插件 ${manifest.name} ${manifest.version} 已安装`);

    const stagingRoot = path.join(registry.pluginsRoot, '.staging');
    const stagingDir = path.join(stagingRoot, crypto.randomUUID());
    fs.mkdirSync(stagingDir, { recursive: true });
    try {
      zip.extractAllTo(stagingDir, true);
      for (const entryPath of [manifest.entry.main, manifest.entry.renderer]) {
        const resolved = path.resolve(stagingDir, entryPath);
        if (!resolved.startsWith(`${path.resolve(stagingDir)}${path.sep}`) || !fs.existsSync(resolved)) {
          throw new Error(`插件入口解压失败：${entryPath}`);
        }
      }
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.renameSync(stagingDir, targetDir);
    } catch (error) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      throw error;
    }

    const now = new Date().toISOString();
    if (runtime.isRunning(manifest.id)) runtime.stop(manifest.id);
    registry.update((snapshot) => {
      const previous = snapshot.plugins[manifest.id];
      snapshot.plugins[manifest.id] = {
        manifest,
        installedVersions: [...new Set([...(previous?.installedVersions || []), manifest.version])],
        activeVersion: manifest.version,
        enabled: false,
        status: 'stopped',
        lastError: '',
        installedAt: previous?.installedAt || now,
        updatedAt: now,
      };
      return snapshot;
    });
    emit({ type: 'installed', pluginId: manifest.id, plugin: get(manifest.id) });
    return { success: true, canceled: false, plugin: get(manifest.id), plugins: list() };
  }

  async function enable(pluginId) {
    const snapshot = registry.read();
    const record = snapshot.plugins[pluginId];
    if (!record) throw new Error('插件不存在或已卸载');
    try {
      await runtime.start(getRuntimePlugin(record));
      registry.update((next) => {
        next.plugins[pluginId] = { ...next.plugins[pluginId], enabled: true, status: 'running', lastError: '', updatedAt: new Date().toISOString() };
        return next;
      });
      emit({ type: 'enabled', pluginId, plugin: get(pluginId) });
      return { success: true, plugin: get(pluginId), plugins: list() };
    } catch (error) {
      registry.update((next) => {
        next.plugins[pluginId] = { ...next.plugins[pluginId], enabled: false, status: 'error', lastError: error.message || String(error), updatedAt: new Date().toISOString() };
        return next;
      });
      emit({ type: 'error', pluginId, plugin: get(pluginId) });
      throw error;
    }
  }

  function disable(pluginId) {
    const snapshot = registry.read();
    if (!snapshot.plugins[pluginId]) throw new Error('插件不存在或已卸载');
    runtime.stop(pluginId);
    registry.update((next) => {
      next.plugins[pluginId] = { ...next.plugins[pluginId], enabled: false, status: 'stopped', lastError: '', updatedAt: new Date().toISOString() };
      return next;
    });
    emit({ type: 'disabled', pluginId, plugin: get(pluginId) });
    return { success: true, plugin: get(pluginId), plugins: list() };
  }

  async function uninstall(pluginId, options = {}) {
    const snapshot = registry.read();
    const record = snapshot.plugins[pluginId];
    if (!record) throw new Error('插件不存在或已卸载');
    runtime.stop(pluginId);
    const pluginDir = path.join(registry.pluginsRoot, pluginId);
    if (fs.existsSync(pluginDir)) await shell.trashItem(pluginDir);
    if (options.removeData) {
      const dataDir = registry.getPluginDataDir(pluginId);
      if (fs.existsSync(dataDir)) await shell.trashItem(dataDir);
    }
    registry.update((next) => {
      delete next.plugins[pluginId];
      return next;
    });
    emit({ type: 'uninstalled', pluginId, plugin: null });
    return { success: true, plugins: list() };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notifyWorkspaceChanged(sectionId, plugin) {
    if (!NAVIGATION_SECTION_IDS.has(sectionId)) throw new Error('工作区刷新目标无效');
    const pluginId = plugin?.manifest?.id || String(plugin || '');
    emit({
      type: 'workspace-changed',
      pluginId,
      plugin: get(pluginId),
      sectionId,
    });
  }

  function request(pluginId, method, params) {
    const record = registry.read().plugins[pluginId];
    if (!record || !record.enabled || !runtime.isRunning(pluginId)) throw new Error('插件未启用或未运行');
    return runtime.request(pluginId, method, params);
  }

  async function initialize() {
    registry.ensureRoots();
    const records = Object.values(registry.read().plugins).filter((record) => record.enabled);
    for (const record of records) {
      try {
        await runtime.start(getRuntimePlugin(record));
      } catch (error) {
        updateRuntimeStatus(record.manifest.id, { status: 'error', lastError: error.message || String(error), enabled: false });
      }
    }
  }

  return {
    initialize,
    list,
    get,
    importPackage,
    installFromPath,
    enable,
    disable,
    uninstall,
    request,
    subscribe,
    notifyWorkspaceChanged,
    capabilityRegistry,
  };
}

module.exports = { createPluginManager };
