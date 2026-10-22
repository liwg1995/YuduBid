const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
if (!process.versions.electron) { const result = require('node:child_process').spawnSync(require('electron'), [__filename], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' }); process.exit(result.status ?? 1); }
const { Document, Paragraph, TextRun, Packer } = require('docx');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createCredentialLibraryService } = require('../electron/services/credentialLibraryService.cjs');
const { createFullBlindCheckController } = require('../electron/services/blind-check-upstream/controller.cjs');
(async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), '完整暗标-')); let database;
 try {
  const app = { getPath: () => root, getAppPath: () => path.resolve(__dirname, '..'), once() {}, isPackaged: false };
  database = createSqliteDatabase(app);
  const input = path.join(root, '中文原始文件.docx');
  const binary = await Packer.toBuffer(new Document({ creator: '测试作者', sections: [{ children: [new Paragraph({ children: [new TextRun({ text: '测试单位的技术方案', color: 'FF0000', bold: true })] }), new Paragraph('实施与验收方案')] }] }));
  fs.writeFileSync(input, binary);
  let notifications = 0;
  const output = path.join(root, '导出副本.docx');
  const credentials = createCredentialLibraryService({ app, db: database.db });
  const controller = createFullBlindCheckController({ app, db: database.db, aiService: {}, configStore: { load: () => ({}) }, credentialLibraryService: credentials, technicalPlanStore: { readTenderMarkdown: () => '' }, dialog: { showSaveDialog: async () => ({ canceled: false, filePath: output }) }, shell: { openPath: async () => '' }, emit: () => notifications++ });
  assert.deepEqual(controller.store.getCredentialWords(), [], '空资信库可正常初始化');
  assert.equal(controller.loadState().credentialCompanyId, '');
  const first = credentials.createCompany({ companyName: '第一企业有限公司' }).companyId;
  assert.equal(controller.loadState().credentialCompanyId, first, '仅一个企业时自动选择');
  const second = credentials.createCompany({ companyName: '第二企业有限公司' }).companyId;
  assert.equal(controller.loadState().credentialCompanyId, '', '多企业必须明确选择');
  controller.store.selectCredentialCompany(first);
  assert(controller.store.getCredentialWords().some(item => item.value === '第一企业有限公司'));
  assert(!controller.store.getCredentialWords().some(item => item.value === '第二企业有限公司'));
  controller.store.selectCredentialCompany(second);
  assert(controller.store.getCredentialWords().some(item => item.value === '第二企业有限公司'));
  assert(!controller.store.getCredentialWords().some(item => item.value === '第一企业有限公司'));
  assert.throws(() => controller.store.selectCredentialCompany('不存在'));
  await controller.importFile(input);
  assert(controller.store.listPresets().length > 0);
  controller.startCheck({ aiReview: false });
  async function wait(field) { const until = Date.now() + 30000; while (controller.loadState()[field]?.status === 'running' && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100)); const state = controller.loadState(); assert.equal(state[field]?.status, 'success', JSON.stringify(state[field])); return state; }
  const checked = await wait('checkTask');
  assert(checked.result.groups.some(group => group.ruleId === 'font.color'));
  assert(checked.result.groups.some(group => group.ruleId === 'struct.doc_props'));
  controller.store.saveFixRules(['font.color', 'struct.doc_props']);
  controller.startFix({ ai: false });
  const fixed = await wait('fixTask');
  assert.equal(fixed.fixResult.status, 'success');
  assert(!fixed.fixResult.groups.some(group => ['font.color', 'struct.doc_props'].includes(group.ruleId)));
  assert(fixed.fixResult.items.length > 0, '修复应有逐项对账');
  await controller.saveFixedDocument(); assert(fs.existsSync(output));
  assert.deepEqual(fs.readFileSync(input), binary, '原始文档保持不变');
  assert(notifications > 3);
  console.log('完整暗标引擎验证通过：数据库迁移、完整预设、文档检查、程序修复、修复后复查、逐项对账、中文路径与副本导出。');
 } finally { database?.close(); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
