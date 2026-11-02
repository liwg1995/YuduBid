const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createCredentialLibraryService } = require('../electron/services/credentialLibraryService.cjs');
const { getCredentialLibraryDir } = require('../electron/utils/paths.cjs');

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-credential-'));
  const fakeApp = { getPath: () => path.join(root, '中文工作区'), once: () => {} };
  let database;
  try {
    database = createSqliteDatabase(fakeApp);
    let service = createCredentialLibraryService({ app: fakeApp, db: database.db });
    const companyA = service.createCompany({ companyName: '甲企业', unifiedSocialCreditCode: 'A001' }).companyId;
    const companyB = service.createCompany({ companyName: '乙企业', unifiedSocialCreditCode: 'B002' }).companyId;
    service.saveProfile(companyA, { companyName: '甲企业（已校对）', phone: '010-12345678' });
    const imagePath = path.join(root, '中文原图.png');
    fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1cAAAAASUVORK5CYII=', 'base64'));
    const saveCertificate = (companyId) => service.saveCertificate(companyId, { record: { name: '测试证书', number: 'A1' }, newImages: [{ fieldKey: 'certificateImages', filePath: imagePath }] });
    const savedA = saveCertificate(companyA);
    const savedB = saveCertificate(companyB);
    const storedPath = (image) => path.join(getCredentialLibraryDir(fakeApp), image.relativePath);
    const storedA = storedPath(savedA.snapshot.images[0]);
    const storedB = storedPath(savedB.snapshot.images[0]);
    assert.ok(fs.existsSync(storedA));
    assert.ok(fs.existsSync(storedB));
    assert.notEqual(storedA, storedB);
    const certificateA = savedA.snapshot.certificates[0].certificateId;
    service.deleteCertificate(companyB, certificateA);
    assert.equal(service.load(companyA).certificates.length, 1, '不能跨企业删除记录');
    assert.equal(service.load(companyB).certificates.length, 1);

    database.db.exec("CREATE TRIGGER verify_company_delete_failure BEFORE DELETE ON credential_library_companies BEGIN SELECT RAISE(ABORT, '隔离验收数据库失败'); END");
    assert.throws(() => service.deleteCompany(companyA), /隔离验收数据库失败/);
    assert.equal(service.load(companyA).certificates.length, 1, '事务失败必须回滚资料');
    assert.equal(service.load(companyA).images.length, 1);
    assert.ok(fs.existsSync(storedA), '事务失败不得提前清理原图');
    database.db.exec('DROP TRIGGER verify_company_delete_failure');
    const deletedCertificate = service.deleteCertificate(companyA, certificateA);
    assert.equal(deletedCertificate.snapshot.images.length, 0);
    assert.equal(fs.existsSync(storedA), false);
    assert.ok(fs.existsSync(imagePath), '导入来源文件不得被删除');
    const remainingA = saveCertificate(companyA);
    const failedFile = storedPath(remainingA.snapshot.images[0]);
    const originalRemove = fs.rmSync;
    let result;
    try {
      fs.rmSync = (file, options) => {
        if (path.resolve(file) === path.resolve(failedFile)) throw new Error('隔离验收文件占用');
        return originalRemove(file, options);
      };
      result = service.deleteCompany(companyA);
    } finally { fs.rmSync = originalRemove; }
    assert.equal(result.fileDeleteFailures.length, 1, '清理失败必须明确报告');
    assert.throws(() => service.load(companyA), /企业不存在/);
    assert.ok(fs.existsSync(failedFile));
    assert.ok(fs.existsSync(storedB), '删除甲企业不能影响乙企业原图');
    assert.equal(service.load(companyB).profile.companyName, '乙企业');
    database.close();
    database = createSqliteDatabase(fakeApp);
    service = createCredentialLibraryService({ app: fakeApp, db: database.db });
    assert.deepEqual(service.listCompanies().map(company => company.companyId), [companyB]);
    assert.equal(service.load(companyB).certificates.length, 1);
    assert.equal(service.load(companyB).profile.unifiedSocialCreditCode, 'B002');
    const deletedB = service.deleteCompany(companyB);
    assert.equal(deletedB.companies.length, 0);
    assert.deepEqual(deletedB.fileDeleteFailures, []);
    assert.equal(fs.existsSync(storedB), false);
    assert.ok(fs.existsSync(imagePath));
    console.log('[credential-library] 多企业隔离、中文路径、复制原图、事务回滚、文件清理失败报告和重启持久化通过');
  } finally {
    try { database?.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
}

app.whenReady().then(() => {
  let exitCode = 0;
  try { run(); } catch (error) { console.error(error); exitCode = 1; }
  app.exit(exitCode);
}).catch((error) => { console.error(error); app.exit(1); });
