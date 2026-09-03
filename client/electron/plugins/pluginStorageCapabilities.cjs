'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORAGE_PERMISSION = 'storage.local';
const STORAGE_FILE_NAME = 'storage.json';
const MAX_VALUE_BYTES = 256 * 1024;
const MAX_STORAGE_BYTES = 1024 * 1024;
const MAX_STORAGE_KEYS = 256;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function normalizeKey(value) {
  const key = String(value || '').trim();
  if (!KEY_PATTERN.test(key)) throw new Error('插件存储键格式无效');
  return key;
}

function getStoragePath(plugin) {
  if (!plugin?.dataDir || !path.isAbsolute(plugin.dataDir)) throw new Error('插件数据目录无效');
  fs.mkdirSync(plugin.dataDir, { recursive: true });
  return path.join(plugin.dataDir, STORAGE_FILE_NAME);
}

function readStorage(plugin) {
  const storagePath = getStoragePath(plugin);
  if (!fs.existsSync(storagePath)) return {};
  if (fs.lstatSync(storagePath).isSymbolicLink()) throw new Error('插件存储文件不能是符号链接');
  try {
    const value = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    throw new Error(`插件存储读取失败：${error.message || String(error)}`);
  }
}

function serializeValue(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new Error(`插件存储值无法序列化：${error.message || String(error)}`);
  }
  if (serialized === undefined) throw new Error('插件存储值必须是可序列化 JSON');
  if (Buffer.byteLength(serialized, 'utf8') > MAX_VALUE_BYTES) throw new Error('插件存储单值超过 256KB 限制');
  return JSON.parse(serialized);
}

function writeStorage(plugin, storage) {
  const storagePath = getStoragePath(plugin);
  const serialized = JSON.stringify(storage, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_BYTES) throw new Error('插件存储超过 1MB 限制');
  const temporaryPath = `${storagePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, serialized, 'utf8');
    fs.renameSync(temporaryPath, storagePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function registerPluginStorageCapabilities(capabilityRegistry) {
  capabilityRegistry.register({
    id: 'storage.get',
    name: '读取插件私有存储',
    version: '1.0',
    permission: STORAGE_PERMISSION,
  }, (args, plugin) => {
    const key = normalizeKey(args?.key);
    const storage = readStorage(plugin);
    return Object.prototype.hasOwnProperty.call(storage, key)
      ? { found: true, value: storage[key] }
      : { found: false, value: null };
  });

  capabilityRegistry.register({
    id: 'storage.set',
    name: '写入插件私有存储',
    version: '1.0',
    permission: STORAGE_PERMISSION,
  }, (args, plugin) => {
    const key = normalizeKey(args?.key);
    const value = serializeValue(args?.value);
    const storage = readStorage(plugin);
    if (!Object.prototype.hasOwnProperty.call(storage, key) && Object.keys(storage).length >= MAX_STORAGE_KEYS) {
      throw new Error('插件存储键数量超过限制');
    }
    storage[key] = value;
    writeStorage(plugin, storage);
    return { saved: true };
  });

  capabilityRegistry.register({
    id: 'storage.delete',
    name: '删除插件私有存储项',
    version: '1.0',
    permission: STORAGE_PERMISSION,
  }, (args, plugin) => {
    const key = normalizeKey(args?.key);
    const storage = readStorage(plugin);
    const deleted = Object.prototype.hasOwnProperty.call(storage, key);
    if (deleted) {
      delete storage[key];
      writeStorage(plugin, storage);
    }
    return { deleted };
  });
}

module.exports = { registerPluginStorageCapabilities };
