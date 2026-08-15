const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf-8'));
const rendererOnlyDependencies = [
  '@radix-ui/react-dialog',
  '@radix-ui/react-popover',
  '@radix-ui/react-switch',
  '@radix-ui/react-toast',
  '@radix-ui/react-tooltip',
  'react',
  'react-dom',
  'react-markdown',
  'rehype-raw',
];

for (const dependency of rendererOnlyDependencies) {
  assert.equal(
    packageJson.dependencies?.[dependency],
    undefined,
    `${dependency} 仅供 Renderer 构建使用，不应声明为生产依赖`,
  );
  assert.ok(
    packageJson.devDependencies?.[dependency],
    `${dependency} 必须保留为 Renderer 构建依赖`,
  );
}

assert.equal(packageJson.dependencies?.['@radix-ui/react-separator'], undefined, '未使用的 Separator 不应声明为生产依赖');
assert.equal(packageJson.devDependencies?.['@radix-ui/react-separator'], undefined, '未使用的 Separator 应从项目依赖中移除');

console.log('[renderer-packaging-verify] passed', JSON.stringify({
  rendererOnlyDependencies,
  removedDependencies: ['@radix-ui/react-separator'],
}));
