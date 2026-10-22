const assert = require('node:assert/strict');
const { enabledIllustrationTypes } = require('../electron/services/contentImagePolicy.cjs');
const cached = ['ai', 'mermaid', 'diagram'];
for (let mask = 0; mask < 8; mask++) {
  const enabled = Object.fromEntries(cached.map((type, i) => [type, Boolean(mask & (1 << i))]));
  const result = enabledIllustrationTypes(cached, enabled);
  assert.deepEqual(result, cached.filter(type => enabled[type]));
  assert.deepEqual(cached, ['ai', 'mermaid', 'diagram']);
}
assert.deepEqual(enabledIllustrationTypes(['unknown', 'ai'], {}), []);
console.log('配图缓存开关验证通过：全部八种开关组合及未知类型。');
// 复现单节复用历史编排的入口：缓存仍包含全部类型，本轮仅开启一种或全部关闭。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../electron/services/contentGenerationTask.cjs'), 'utf8');
const file = ts.createSourceFile('contentGenerationTask.cjs', source, ts.ScriptTarget.Latest, true);
let entry;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'applyIllustrationTargets') entry = node.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
assert(entry, '找不到缓存复用入口');
for (let mask = 0; mask < 8; mask++) {
  const context = {
    enabledIllustrationTypes, normalizeIllustrationTypes: value => value,
    aiImagesEnabled: Boolean(mask & 1), mermaidImagesEnabled: Boolean(mask & 2), technicalDiagramEnabled: Boolean(mask & 4),
    imageStats: { ai: {}, mermaid: {}, diagram: {} }, Set,
  };
  vm.createContext(context);
  vm.runInContext(`${entry}; applyIllustrationTargets([{ item: { id: 'cached-section' } }], () => ['ai', 'mermaid', 'diagram']);`, context);
  assert.equal(context.imageStats.ai.planned, mask & 1 ? 1 : 0);
  assert.equal(context.imageStats.mermaid.planned, mask & 2 ? 1 : 0);
  assert.equal(context.imageStats.diagram.planned, mask & 4 ? 1 : 0);
}
console.log('单节历史编排入口验证通过：关闭类型不进入执行队列。');
