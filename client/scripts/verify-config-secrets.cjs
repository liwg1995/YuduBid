'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore } = require('../electron/services/configStore.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yudubid-config-secrets-'));
const file = path.join(directory, 'user_config.json');
const app = { getPath: (name) => name === 'userData' ? directory : '' };
const storage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'keychain',
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (buffer) => {
    const value = buffer.toString('utf8');
    if (!value.startsWith('encrypted:')) throw new Error('密钥不匹配');
    return value.slice('encrypted:'.length);
  },
};

try {
  fs.writeFileSync(file, JSON.stringify({
    text_model_provider: 'custom', api_key: 'TEST_TEXT_KEY',
    text_model_profiles: { custom: { api_key: 'TEST_TEXT_KEY', base_url: 'https://example.com', model_name: 'test' } },
    image_model: { provider: 'custom', api_key: 'TEST_IMAGE_KEY' },
    image_model_profiles: { custom: { provider: 'custom', api_key: 'TEST_IMAGE_KEY' } },
    file_parser: { provider: 'local', mineru_token: 'TEST_MINERU_TOKEN' },
  }), 'utf8');

  const store = createConfigStore(app, { safeStorage: storage });
  const loaded = store.load();
  assert.equal(loaded.api_key, 'TEST_TEXT_KEY');
  assert.equal(loaded.image_model.api_key, 'TEST_IMAGE_KEY');
  assert.equal(loaded.file_parser.mineru_token, 'TEST_MINERU_TOKEN');
  let disk = fs.readFileSync(file, 'utf8');
  for (const value of ['TEST_TEXT_KEY', 'TEST_IMAGE_KEY', 'TEST_MINERU_TOKEN']) assert.equal(disk.includes(value), false);
  assert.equal(JSON.parse(disk).schema_version, 2);
  assert.equal(JSON.parse(disk).secrets_encrypted, true);
  const firstDisk = disk;
  store.load();
  assert.equal(fs.readFileSync(file, 'utf8'), firstDisk, '重复读取不应反复加密写盘');

  store.save({ developer_mode: true });
  assert.equal(store.load().api_key, 'TEST_TEXT_KEY');
  assert.equal(store.load().file_parser.mineru_token, 'TEST_MINERU_TOKEN');
  disk = fs.readFileSync(file, 'utf8');
  assert.equal(disk.includes('TEST_TEXT_KEY'), false);

  const unavailable = createConfigStore(app, { safeStorage: { isEncryptionAvailable: () => false } });
  assert.throws(() => unavailable.load(), /原文件未修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), disk);
  console.log('[config-secrets-verify] passed');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
