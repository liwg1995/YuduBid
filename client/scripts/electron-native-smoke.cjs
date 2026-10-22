const { app } = require('electron');

function exitWithCode(code) {
  if (app?.isReady?.()) {
    app.exit(code);
    return;
  }
  process.exit(code);
}

function runSmoke() {
  try {
    console.log(`[native-smoke] electron=${process.versions.electron || 'unknown'} node=${process.versions.node} modules=${process.versions.modules} platform=${process.platform} arch=${process.arch}`);
    // 启动链直接加载暗标复核；必须声明生产依赖，避免开发环境可用但安装包缺模块。
    const packageJson = require('../package.json');
    if (!packageJson.dependencies?.ajv) {
      throw new Error('暗标复核依赖 ajv 必须声明在 dependencies 中');
    }
    require('../electron/services/blind-check-upstream/blindCheckReview.cjs');
    console.log('[native-smoke] blind-check review loaded and AJV schemas compiled successfully.');
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    try {
      const row = db.prepare('SELECT 1 AS ok').get();
      if (!row || row.ok !== 1) {
        throw new Error(`Unexpected SQLite result: ${JSON.stringify(row)}`);
      }
    } finally {
      db.close();
    }
    console.log('[native-smoke] better-sqlite3 loaded and queried successfully.');
    exitWithCode(0);
  } catch (error) {
    console.error('[native-smoke] Electron native dependency smoke test failed.');
    console.error(error?.stack || error?.message || String(error));
    exitWithCode(1);
  }
}

if (app?.whenReady) {
  app.whenReady().then(runSmoke, (error) => {
    console.error('[native-smoke] Electron app failed to become ready.');
    console.error(error?.stack || error?.message || String(error));
    exitWithCode(1);
  });
} else {
  runSmoke();
}
