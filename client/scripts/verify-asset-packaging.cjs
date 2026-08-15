const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf-8'));
const packagedFiles = packageJson.build?.files || [];
const runtimeAssets = ['assets/icon.ico', 'assets/icon_256.png'];
const buildAssets = [packageJson.build?.win?.icon, packageJson.build?.mac?.icon];

assert.ok(!packagedFiles.includes('assets/**/*'), '不应将整个 assets 目录复制进应用');
for (const relativePath of runtimeAssets) {
  assert.ok(packagedFiles.includes(relativePath), `运行时资源未加入打包清单：${relativePath}`);
  assert.ok(fs.existsSync(path.join(clientDir, relativePath)), `运行时资源不存在：${relativePath}`);
}
for (const relativePath of buildAssets) {
  assert.ok(relativePath, '平台构建图标未配置');
  assert.ok(fs.existsSync(path.join(clientDir, relativePath)), `平台构建图标不存在：${relativePath}`);
}

const mainSource = fs.readFileSync(path.join(clientDir, 'electron', 'main.cjs'), 'utf-8');
assert.match(mainSource, /assets\/icon\.ico/, 'Main 未引用 Windows 运行时图标');
assert.match(mainSource, /assets\/icon_256\.png/, 'Main 未引用 macOS 运行时图标');

console.log('[asset-packaging-verify] passed', JSON.stringify({
  runtimeAssets,
  buildAssets,
  excludedAssetGlob: 'assets/**/*',
}));
