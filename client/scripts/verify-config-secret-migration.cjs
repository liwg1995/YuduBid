const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore } = require('../electron/services/configStore.cjs');

const prefix = 'safeStorage:v1:';
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf-8'),
  decryptString: (buffer) => {
    const value = buffer.toString('utf-8');
    if (!value.startsWith('sealed:')) throw new Error('无法解密');
    return value.slice('sealed:'.length);
  },
};
const encrypt = (value) => `${prefix}${safeStorage.encryptString(value).toString('base64')}`;

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-config-secret-'));
try {
  const app = { getPath: () => directory };
  const store = createConfigStore(app, { safeStorage });
  const file = store.getConfigFilePath();
  store.save({ text_model_provider: 'agnes-ai-cn', api_key: 'test-key' });
  let disk = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.equal(disk.secrets_encrypted, true);
  assert.equal(disk.api_key, encrypt('test-key'));

  disk.api_key = encrypt(disk.api_key);
  disk.text_model_profiles['agnes-ai-cn'].api_key = encrypt(disk.text_model_profiles['agnes-ai-cn'].api_key);
  fs.writeFileSync(file, JSON.stringify(disk), 'utf-8');
  const recovered = store.load();
  assert.equal(recovered.api_key, 'test-key');
  assert.equal(recovered.text_model_profiles['agnes-ai-cn'].api_key, 'test-key');
  disk = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.equal(disk.api_key, encrypt('test-key'));

  store.save({ api_key: encrypt('replacement-key'), text_model_profiles: { 'agnes-ai-cn': { api_key: encrypt('replacement-key') } } });
  assert.equal(store.load().api_key, 'replacement-key');
  disk = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.equal(disk.api_key, encrypt('replacement-key'));

  const previousRaw = fs.readFileSync(file, 'utf-8');
  assert.throws(() => store.save({ api_key: `${prefix}bad` }), /配置文件保存失败/);
  assert.equal(fs.readFileSync(file, 'utf-8'), previousRaw);
  console.log('配置密钥多层解密、单层写回和损坏数据保护验证通过');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
