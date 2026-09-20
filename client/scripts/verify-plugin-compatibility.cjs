'use strict';

const assert = require('node:assert/strict');
const { HOST_ID, validateManifest, validatePluginHostCompatibility } = require('../electron/plugins/pluginManifest.cjs');

const base = {
  id: 'com.example.plugin',
  name: '兼容性测试插件',
  version: '1.0.0',
  apiVersion: '1.0',
  entry: { main: 'main.cjs', renderer: 'renderer.js' },
  host: { id: HOST_ID, minVersion: '0.9.0' },
};

const app = (version) => ({ getVersion: () => version });
const manifest = validateManifest(base);
assert.doesNotThrow(() => validatePluginHostCompatibility(manifest, app('0.9.12')));
assert.throws(() => validatePluginHostCompatibility(manifest, app('0.8.9')), /请先升级客户端/);
assert.throws(() => validateManifest({ ...base, host: { id: 'other.host', minVersion: '0.9.0' } }), /宿主 ID/);
assert.throws(() => validateManifest({ ...base, host: undefined }), /宿主 ID/);
assert.throws(() => validateManifest({ ...base, host: { id: HOST_ID, minVersion: 'latest' } }), /SemVer/);
assert.throws(() => validatePluginHostCompatibility({ ...manifest, host: { id: 'other.host' } }, app('0.9.12')), /不适用于/);
assert.throws(() => validateManifest({ ...base, apiVersion: '2.0' }), /API 版本/);
console.log('[plugin-compatibility-verify] passed');
