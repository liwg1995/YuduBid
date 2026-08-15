const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf-8'));
const sourcePath = path.join(clientDir, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const resourceEntry = packageJson.build?.extraResources?.find((entry) => (
  entry?.from === 'node_modules/mermaid/dist/mermaid.min.js'
));

assert.equal(packageJson.dependencies?.mermaid, undefined, 'Mermaid 不应作为生产依赖打入应用');
assert.ok(packageJson.devDependencies?.mermaid, 'Mermaid 必须保留为 Renderer 构建依赖');
assert.equal(resourceEntry?.to, 'mermaid/mermaid.min.js', 'Mermaid 独立资源目标路径不正确');
assert.ok(fs.existsSync(sourcePath), `Mermaid 浏览器资源不存在：${sourcePath}`);

const source = fs.readFileSync(sourcePath, 'utf-8');
assert.ok(source.length > 1_000_000, 'Mermaid 浏览器资源大小异常');
assert.match(source.slice(0, 500), /mermaid/i, 'Mermaid 浏览器资源内容异常');

console.log('[mermaid-packaging-verify] passed', JSON.stringify({
  version: require(path.join(clientDir, 'node_modules', 'mermaid', 'package.json')).version,
  sourceBytes: Buffer.byteLength(source),
  target: resourceEntry.to,
}));
