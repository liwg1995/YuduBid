'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_VERSION = 1;

function createPluginRegistry(app) {
  const pluginsRoot = path.join(app.getPath('userData'), 'plugins');
  const dataRoot = path.join(app.getPath('userData'), 'plugins-data');
  const registryPath = path.join(pluginsRoot, 'registry.json');

  function ensureRoots() {
    fs.mkdirSync(pluginsRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
  }

  function read() {
    ensureRoots();
    if (!fs.existsSync(registryPath)) return { version: REGISTRY_VERSION, plugins: {} };
    try {
      const value = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      return {
        version: REGISTRY_VERSION,
        plugins: value?.plugins && typeof value.plugins === 'object' ? value.plugins : {},
      };
    } catch (error) {
      throw new Error(`插件注册表读取失败：${error.message || String(error)}`);
    }
  }

  function write(registry) {
    ensureRoots();
    const next = { version: REGISTRY_VERSION, plugins: registry.plugins || {} };
    const temporaryPath = `${registryPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(temporaryPath, registryPath);
    return next;
  }

  function update(mutator) {
    const current = read();
    const result = mutator(current) || current;
    return write(result);
  }

  function getPluginDir(pluginId, version) {
    return path.join(pluginsRoot, pluginId, version);
  }

  function getPluginDataDir(pluginId) {
    return path.join(dataRoot, pluginId);
  }

  return {
    pluginsRoot,
    dataRoot,
    registryPath,
    ensureRoots,
    read,
    write,
    update,
    getPluginDir,
    getPluginDataDir,
  };
}

module.exports = { createPluginRegistry };
