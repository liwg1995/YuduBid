const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (!process.versions.electron) {
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createTechnicalPlanStore } = require('../electron/services/technicalPlanStore.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-outline-store-'));
let database;
try {
  const app = { getPath: () => root, once: () => {} };
  database = createSqliteDatabase(app);
  const store = createTechnicalPlanStore({ app, db: database.db, fileService: {} });
  const outline = { outline: [{ id: '1', title: '技术方案', description: '部署', content: '旧正文', children: [{ id: '1.1', title: '部署流程', description: '', content: '旧子正文' }] }] };
  store.updateTechnicalPlan({ outlineData: outline, globalFacts: [{ id: 'fact-1', title: '项目', content: '事实', updated_at: new Date().toISOString() }], contentGenerationPlans: { '1.1': { plan: { image: { needed: true } } } }, contentGenerationSections: { '1.1': { status: 'success', content: '缓存正文' } }, contentGenerationRuntime: { test: true } });
  assert(database.db.prepare('SELECT COUNT(*) n FROM technical_plan_content_plans').get().n > 0);
  for (const [field, type] of [['outlineGenerationTask', 'outline-generation'], ['globalFactsTask', 'global-facts-generation'], ['contentGenerationTask', 'content-generation']]) {
    store.updateTechnicalPlan({ [field]: { task_id: 'busy', type, status: 'paused', logs: [], progress: 10 } });
    const before = JSON.stringify(store.loadTechnicalPlan());
    assert.throws(() => store.saveOutline(outline), /尚未结束/);
    assert.equal(JSON.stringify(store.loadTechnicalPlan()), before);
    store.updateTechnicalPlan({ [field]: { task_id: 'busy', type, status: 'stopped', logs: [], progress: 10 } });
  }
  const saved = store.saveOutline({ outline: [{ ...outline.outline[0], description: '新描述' }] });
  assert.equal(saved.outlineData.outline[0].description, '新描述');
  assert.equal(saved.outlineData.outline[0].content || '', '');
  assert.equal(saved.outlineData.outline[0].children[0].content || '', '');
  for (const table of ['technical_plan_content_sections', 'technical_plan_content_plans', 'technical_plan_global_fact_groups']) assert.equal(database.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  assert.equal(saved.contentGenerationRuntime, undefined);
  console.log('Electron SQLite 目录保存验证通过：任务冲突拒绝、事务保留原数据、正文与生成缓存清理。');
} finally {
  database?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
