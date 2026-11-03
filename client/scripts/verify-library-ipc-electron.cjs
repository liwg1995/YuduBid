const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createCredentialLibraryService } = require('../electron/services/credentialLibraryService.cjs');
const { createKnowledgeBaseStore } = require('../electron/services/knowledgeBaseStore.cjs');
const { createKnowledgeBaseService } = require('../electron/services/knowledgeBaseService.cjs');
const { registerCredentialLibraryIpc } = require('../electron/ipc/credentialLibraryIpc.cjs');
const { registerKnowledgeBaseIpc } = require('../electron/ipc/knowledgeBaseIpc.cjs');
const { getCredentialLibraryDir, getKnowledgeBaseDir } = require('../electron/utils/paths.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-library-ipc-'));
const userData = path.join(root, '中文用户数据');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);

async function run() {
  let database;
  let window;
  let developerMode = false;
  let dialogCalls = 0;
  const channels = [];
  const originalHandle = ipcMain.handle;
  const originalDialog = dialog.showOpenDialog;
  try {
    database = createSqliteDatabase(app);
    const configStore = { load: () => ({ developer_mode: developerMode }) };
    const credentialLibraryService = createCredentialLibraryService({ app, db: database.db });
    const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: database.db });
    const knowledgeBaseService = createKnowledgeBaseService({ app, knowledgeBaseStore, configStore, aiService: {} });
    // 记录本测试注册的通道，退出时精确移除，不影响其他通道。
    try {
      ipcMain.handle = function (channel, listener) { channels.push(channel); return originalHandle.call(this, channel, listener); };
      registerCredentialLibraryIpc({ credentialLibraryService, configStore });
      registerKnowledgeBaseIpc({ knowledgeBaseService, knowledgeImageService: {} });
    } finally { ipcMain.handle = originalHandle; }
    dialog.showOpenDialog = async () => { dialogCalls += 1; return { canceled: true, filePaths: [] }; };
    window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const preloadErrors = [];
    window.webContents.on('preload-error', (_event, _preloadPath, error) => preloadErrors.push(error.message));
    await window.loadURL('data:text/html;charset=utf-8,<title>资料库IPC隔离验收</title>');
    // 仅调用进程桥接API，不查询、操作或自动化DOM和业务UI。
    const call = (section, method, args = []) => window.webContents.executeJavaScript(`window.yibiao[${JSON.stringify(section)}][${JSON.stringify(method)}](...${JSON.stringify(args)})`);
    const expectError = async (section, method, args, pattern) => {
      await assert.rejects(call(section, method, args), error => {
        assert.match(error.message, pattern);
        assert.doesNotMatch(error.message, /Error invoking remote method|credential-library:|knowledge-base:/, 'Renderer错误不应泄露IPC包装前缀');
        return true;
      });
    };
    assert.deepEqual(preloadErrors, []);
    assert.equal(await window.webContents.executeJavaScript('typeof require'), 'undefined');
    assert.equal(await window.webContents.executeJavaScript('typeof process'), 'undefined');
    assert.deepEqual(await call('credentialLibrary', 'listCompanies'), []);
    await expectError('credentialLibrary', 'createCompany', [{ companyName: '   ' }], /请填写企业名称/);
    const companyA = await call('credentialLibrary', 'createCompany', [{ companyName: '甲企业', unifiedSocialCreditCode: 'A001' }]);
    const companyB = await call('credentialLibrary', 'createCompany', [{ companyName: '乙企业', unifiedSocialCreditCode: 'B002' }]);
    const profile = await call('credentialLibrary', 'saveProfile', [companyA.companyId, { companyName: '甲企业（校对）', phone: '010-12345678' }]);
    assert.equal(profile.profile.companyName, '甲企业（校对）');
    assert.equal(profile.profile.phone, '010-12345678');
    const sourceImage = path.join(root, '中文来源图片.png');
    fs.writeFileSync(sourceImage, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1cAAAAASUVORK5CYII=', 'base64'));
    const certificate = await call('credentialLibrary', 'saveCertificate', [companyA.companyId, { record: { name: '资质证书', number: '证字001' }, newImages: [{ fieldKey: 'certificateImages', filePath: sourceImage }] }]);
    assert.equal(certificate.snapshot.certificates[0].name, '资质证书');
    assert.equal(certificate.snapshot.images.length, 1);
    const copy = path.join(getCredentialLibraryDir(app), certificate.snapshot.images[0].relativePath);
    assert.ok(fs.existsSync(copy));
    assert.deepEqual(await call('credentialLibrary', 'selectImages'), []);
    await expectError('credentialLibrary', 'importTestData', [companyA.companyId], /请先开启开发者模式/);
    assert.equal(dialogCalls, 1, '禁用开发者导入时不应打开文件选择器');
    developerMode = true;
    assert.equal(await call('credentialLibrary', 'importTestData', [companyA.companyId]), null);
    developerMode = false;
    assert.equal((await call('credentialLibrary', 'load', [companyA.companyId])).certificates.length, 1, '取消导入保留资料');
    await expectError('credentialLibrary', 'deleteCompany', ['missing-company'], /企业不存在/);
    const originalRemove = fs.rmSync;
    let deleted;
    try {
      fs.rmSync = (file, options) => {
        if (path.resolve(file) === path.resolve(copy)) throw new Error('隔离验收图片占用');
        return originalRemove(file, options);
      };
      deleted = await call('credentialLibrary', 'deleteCompany', [companyA.companyId]);
    } finally { fs.rmSync = originalRemove; }
    assert.equal(deleted.fileDeleteFailures.length, 1, '原图清理失败数组应完整传给Renderer');
    assert.deepEqual(deleted.companies.map(company => company.companyId), [companyB.companyId]);
    assert.ok(fs.existsSync(sourceImage), '不能删除用户选择的来源文件');
    await expectError('credentialLibrary', 'load', [companyA.companyId], /企业不存在/);

    const folder = await call('knowledgeBase', 'createFolder', ['中文知识库']);
    const renamed = await call('knowledgeBase', 'renameFolder', [folder.id, '中文资料（校对）']);
    assert.equal(renamed.name, '中文资料（校对）');
    const document = knowledgeBaseStore.createDocument({ id: 'ipc-sample', folder_id: folder.id, file_name: '中文资料.md', status: 'success', progress: 100 });
    const directory = path.join(getKnowledgeBaseDir(app), document.document_dir);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(getKnowledgeBaseDir(app), document.markdown_path), '# 中文资料\nIPC正文', 'utf8');
    knowledgeBaseStore.saveBlocks(document.id, [{ id: 'block-1', content: 'IPC正文' }], []);
    knowledgeBaseStore.saveMatchResult(document.id, { finalItems: [{ id: 'item-1', title: '中文条目', content: 'IPC正文', source_block_ids: ['block-1'] }] });
    const listed = await call('knowledgeBase', 'list');
    assert.equal(listed.documents.length, 1);
    assert.match(await call('knowledgeBase', 'readMarkdown', [document.id]), /中文资料/);
    const items = await call('knowledgeBase', 'readItems', [document.id]);
    assert.equal(items[0].title, '中文条目');
    const canceled = await call('knowledgeBase', 'uploadDocuments', [folder.id]);
    assert.equal(canceled.success, false);
    assert.match(canceled.message, /取消/);
    assert.equal((await call('knowledgeBase', 'list')).documents.length, 1);
    await expectError('knowledgeBase', 'deleteDocument', ['missing-document'], /知识库文档不存在/);
    const removed = await call('knowledgeBase', 'deleteDocument', [document.id]);
    assert.equal(removed.success, true);
    assert.equal((await call('knowledgeBase', 'list')).documents.length, 0);
    assert.equal(fs.existsSync(directory), false);
    await expectError('knowledgeBase', 'readMarkdown', [document.id], /知识库文档不存在/);
    console.log('[library-ipc] 沙箱preload、真实IPC、中文资料/原图、异常中文化、取消保留和删除结果传递通过');
  } finally {
    ipcMain.handle = originalHandle;
    dialog.showOpenDialog = originalDialog;
    if (window && !window.isDestroyed()) window.destroy();
    channels.forEach(channel => ipcMain.removeHandler(channel));
    try { database?.close(); } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); }
  }
}

app.whenReady().then(async () => {
  let exitCode = 0;
  try { await run(); } catch (error) { console.error(error); exitCode = 1; }
  app.exit(exitCode);
}).catch(error => { console.error(error); fs.rmSync(root, { recursive: true, force: true }); app.exit(1); });
