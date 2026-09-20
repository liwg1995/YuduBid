'use strict';

const path = require('node:path');
const semver = require('semver');

const HOST_API_VERSION = '1.0';
const HOST_ID = 'me.olei.bidkit';
const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function normalizeRelativeEntry(value, fieldName) {
  const raw = String(value || '').trim().replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`${fieldName} 必须是插件包内的相对路径`);
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${fieldName} 不能跳出插件目录`);
  }
  return normalized.replace(/^\.\//, '');
}

function validateManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('plugin.json 必须是 JSON 对象');
  }

  const id = String(input.id || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const version = String(input.version || '').trim();
  const apiVersion = String(input.apiVersion || '').trim();

  if (!PLUGIN_ID_PATTERN.test(id)) throw new Error('插件 ID 格式无效');
  if (!name || name.length > 80) throw new Error('插件名称不能为空且不能超过 80 个字符');
  if (!VERSION_PATTERN.test(version)) throw new Error('插件版本必须使用 SemVer，例如 1.0.0');
  if (apiVersion !== HOST_API_VERSION) {
    throw new Error(`插件 API 版本 ${apiVersion || '未声明'} 与宿主 ${HOST_API_VERSION} 不兼容`);
  }

  const main = normalizeRelativeEntry(input.entry?.main, 'entry.main');
  const renderer = normalizeRelativeEntry(input.entry?.renderer, 'entry.renderer');
  const permissions = Array.isArray(input.permissions)
    ? [...new Set(input.permissions.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
  const menu = input.contributes?.menu;

  const hostId = String(input.host?.id || '').trim();
  const minVersion = String(input.host?.minVersion || '').trim();
  if (hostId !== HOST_ID) throw new Error(`插件宿主 ID ${hostId || '未声明'} 与当前客户端不匹配`);
  if (minVersion && !semver.valid(minVersion)) throw new Error('host.minVersion 必须使用 SemVer，例如 1.2.0');

  return {
    id,
    name,
    version,
    apiVersion,
    publisher: {
      id: String(input.publisher?.id || '').trim(),
      name: String(input.publisher?.name || '').trim(),
    },
    license: String(input.license || 'Proprietary').trim(),
    entry: { main, renderer },
    host: {
      id: hostId,
      minVersion,
    },
    permissions,
    contributes: menu ? {
      menu: {
        id: String(menu.id || '').trim(),
        label: String(menu.label || name).trim(),
        description: String(menu.description || '').trim(),
      },
    } : {},
  };
}

function validatePluginHostCompatibility(manifest, app) {
  if (manifest?.host?.id !== HOST_ID) throw new Error('该插件不适用于当前客户端');
  const minimum = String(manifest?.host?.minVersion || '');
  const current = String(app?.getVersion?.() || '');
  if (minimum && (!semver.valid(current) || semver.lt(current, minimum))) {
    throw new Error(`该插件需要禹都AI解决方案助手 ${minimum} 或更高版本，当前客户端版本为 ${current || '未知'}，请先升级客户端`);
  }
}

module.exports = {
  HOST_API_VERSION,
  HOST_ID,
  normalizeRelativeEntry,
  validateManifest,
  validatePluginHostCompatibility,
};
