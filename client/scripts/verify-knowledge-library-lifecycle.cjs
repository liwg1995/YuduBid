const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createKnowledgeBaseStore } = require('../electron/services/knowledgeBaseStore.cjs');
const { createKnowledgeBaseService } = require('../electron/services/knowledgeBaseService.cjs');
const { getKnowledgeBaseDir, getImportedImagesDir } = require('../electron/utils/paths.cjs');

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-knowledge-lifecycle-'));
  const fakeApp = { getPath: () => path.join(root, '中文工作区'), once: () => {} };
  let database;
  try {
    database = createSqliteDatabase(fakeApp);
    let store = createKnowledgeBaseStore({ app: fakeApp, db: database.db });
    const folder = store.createFolder('中文资料文件夹');
    const baseDir = getKnowledgeBaseDir(fakeApp);
    const importedImages = getImportedImagesDir(fakeApp);
    const createDocument = (id) => {
      const document = store.createDocument({ id, folder_id: folder.id, file_name: `${id}中文资料.md`, status: 'success', progress: 100 });
      const directory = path.join(baseDir, document.document_dir);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(baseDir, document.source_path), '# 原始资料\n中文内容', 'utf8');
      fs.writeFileSync(path.join(baseDir, document.markdown_path), '# 解析结果\n隔离样本', 'utf8');
      store.updateMarkdownMetadata(id, '# 解析结果\n隔离样本', 'local');
      store.saveBlocks(id, [{ id: 'block-1', content: '隔离样本正文' }], []);
      store.saveMatchResult(id, { finalItems: [{ id: `item-${id}`, title: '知识条目', content: '隔离样本正文', source_block_ids: ['block-1'] }] });
      const imageBatch = path.join(importedImages, `knowledge-${id}-sample`);
      fs.mkdirSync(imageBatch, { recursive: true });
      fs.writeFileSync(path.join(imageBatch, '中文图片.png'), 'synthetic fixture', 'utf8');
      const logPath = path.join(fakeApp.getPath('userData'), 'logs', 'knowledge-base', `${id}.jsonl`);
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, '{"fixture":true}\n', 'utf8');
      return { directory, imageBatch, logPath };
    };
    const first = createDocument('document-one');
    const second = createDocument('document-two');
    const unrelated = path.join(importedImages, 'unrelated-batch');
    fs.mkdirSync(unrelated, { recursive: true });
    fs.writeFileSync(path.join(unrelated, '保留.txt'), '不能删除其他功能资料', 'utf8');
    database.close();
    database = createSqliteDatabase(fakeApp);
    store = createKnowledgeBaseStore({ app: fakeApp, db: database.db });
    assert.equal(store.list().documents.length, 2);
    assert.equal(store.readItems('document-two').length, 1);
    const service = createKnowledgeBaseService({ app: fakeApp, knowledgeBaseStore: store, configStore: { load: () => ({ developer_mode: false }) }, aiService: {} });
    const originalRemove = fs.rmSync;
    try {
      fs.rmSync = (file, options) => {
        if (path.resolve(file) === path.resolve(first.imageBatch)) throw new Error('隔离验收图片目录被占用');
        return originalRemove(file, options);
      };
      assert.throws(() => service.deleteDocument('document-one'), /隔离验收图片目录被占用/);
    } finally { fs.rmSync = originalRemove; }
    assert.equal(store.list().documents.length, 2);
    assert.equal(store.readItems('document-one').length, 1);
    assert.ok(fs.existsSync(first.directory));
    assert.ok(fs.existsSync(first.imageBatch));
    assert.ok(fs.existsSync(first.logPath));
    const result = service.deleteDocument('document-one');
    assert.equal(result.success, true);
    assert.throws(() => store.getDocument('document-one'), /知识库文档不存在/);
    for (const table of ['knowledge_blocks', 'knowledge_items', 'knowledge_item_blocks']) {
      assert.equal(database.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE document_id = ?`).get('document-one').count, 0, `${table}应级联清理`);
    }
    for (const file of Object.values(first)) assert.equal(fs.existsSync(file), false);
    for (const file of Object.values(second)) assert.ok(fs.existsSync(file), '删除一个文档不能影响另一个文档');
    assert.ok(fs.existsSync(path.join(unrelated, '保留.txt')));
    assert.throws(() => service.deleteDocument('document-one'), /知识库文档不存在/);
    database.close();
    database = createSqliteDatabase(fakeApp);
    store = createKnowledgeBaseStore({ app: fakeApp, db: database.db });
    assert.deepEqual(store.list().documents.map(document => document.id), ['document-two']);
    assert.equal(store.readItems('document-two').length, 1);
    console.log('[knowledge-library] 中文目录、重启持久化、首步文件失败保留、成功删除及关联清理、其他文档与功能图片隔离通过');
  } finally {
    try { database?.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
}

app.whenReady().then(() => {
  let exitCode = 0;
  try { run(); } catch (error) { console.error(error); exitCode = 1; }
  app.exit(exitCode);
}).catch((error) => { console.error(error); app.exit(1); });
