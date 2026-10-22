const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { assertOutlineEditable } = require('../electron/services/outlineEditPolicy.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/features/technical-plan/services/outlineOrdering.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const runtime = { exports: {} };
vm.runInNewContext(compiled, runtime);
const { moveOutlineSibling, renumberOutlineItems } = runtime.exports;
const original = [{ id: '1', title: '第一章', description: '', children: [{ id: '1.1', title: '子一', description: '', children: [{ id: '1.1.1', title: '叶子', description: '', content: '旧正文' }] }, { id: '1.2', title: '子二', description: '' }] }, { id: '2', title: '第二章', description: '', source_requirement_id: 'R2' }];
const before = JSON.stringify(original);
assert.equal(moveOutlineSibling(original, '1', -1), original);
const draft = moveOutlineSibling(moveOutlineSibling(original, '1.2', -1), '2', -1);
assert.equal(draft[0].title, '第二章');
assert.equal(draft[1].children[0].title, '子二');
const saved = renumberOutlineItems(draft);
assert.equal(saved[0].source_requirement_id, 'R2');
assert.equal(saved[1].children[1].children[0].id, '2.2.1');
assert.equal(saved[1].children[1].children[0].content, '旧正文'); // 清理职责在 Main 保存事务。
assert.equal(JSON.stringify(original), before);
for (const field of ['outlineGenerationTask', 'globalFactsTask', 'contentGenerationTask']) {
  for (const status of ['running', 'paused', 'pausing', 'stopping']) assert.throws(() => assertOutlineEditable({ [field]: { status } }));
  for (const status of ['success', 'error', 'stopped']) assert.doesNotThrow(() => assertOutlineEditable({ [field]: { status } }));
}
console.log('目录排序验证通过：同级移动、子树跟随、编号重建、评分项映射、原数据不变及任务锁。');
