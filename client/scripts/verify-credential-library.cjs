const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createCredentialLibraryService } = require('../electron/services/credentialLibraryService.cjs');

app.whenReady().then(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-credential-'));
  const fakeApp = { getPath: () => root, once: () => {} };
  try {
    const database = createSqliteDatabase(fakeApp);
    const service = createCredentialLibraryService({ app: fakeApp, db: database.db });
    service.saveProfile({ companyName: '测试企业', unifiedSocialCreditCode: '123456' });
    const imagePath = path.join(root, '中文图片.png');
    fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1cAAAAASUVORK5CYII=', 'base64'));
    const saved = service.saveCertificate({ record: { name: '测试证书', number: 'A1' }, newImages: [{ fieldKey: 'certificateImages', filePath: imagePath }] });
    assert.equal(saved.snapshot.certificates.length, 1);
    assert.equal(saved.snapshot.images.length, 1);
    assert.equal(saved.snapshot.profile.companyName, '测试企业');
    const id = saved.snapshot.certificates[0].certificateId;
    assert.equal(service.deleteCertificate(id).snapshot.images.length, 0);
    database.close();
    const reopened = createSqliteDatabase(fakeApp);
    assert.equal(createCredentialLibraryService({ app: fakeApp, db: reopened.db }).load().profile.companyName, '测试企业');
    reopened.close();
    console.log('[credential-library] migration, persistence, image copy and delete passed');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}).catch((error) => { console.error(error); app.exit(1); });
