const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-window-lifecycle-'));
  const windows = [];
  let quitCount = 0;
  let registeredIpc = false;

  class MockWindow extends EventEmitter {
    constructor() {
      super();
      windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.destroyed = false;
      this.focused = false;
    }

    setMenuBarVisibility() {}
    loadFile() {}
    loadURL() {}
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    show() {}
    focus() { this.focused = true; }
    close() {
      this.destroyed = true;
      windows.splice(windows.indexOf(this), 1);
      this.emit('closed');
    }
  }
  MockWindow.getAllWindows = () => windows;

  const app = new EventEmitter();
  app.getPath = () => userDataDir;
  app.setPath = () => {};
  app.requestSingleInstanceLock = () => true;
  app.isReady = () => true;
  app.whenReady = () => Promise.resolve();
  app.quit = () => {
    quitCount += 1;
    app.emit('before-quit');
  };

  const electron = {
    app,
    BrowserWindow: MockWindow,
    nativeTheme: {},
    shell: {},
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    net: {},
  };
  const modulePath = path.join(__dirname, '../electron/main.cjs');
  const source = fs.readFileSync(modulePath, 'utf8');
  const mocks = {
    electron,
    './ipc/index.cjs': { registerIpcHandlers: () => { registeredIpc = true; } },
    './services/updateService.cjs': {},
    './utils/paths.cjs': {},
    './utils/appLogger.cjs': require('../electron/utils/appLogger.cjs'),
  };
  const requireMock = (name) => mocks[name] || require(name);

  try {
    vm.runInNewContext(source, {
      require: requireMock,
      __dirname: path.dirname(modulePath),
      process: { env: { YIBIAO_USER_DATA_DIR: userDataDir }, platform: 'win32', pid: 1234 },
      console,
      URL,
      Response,
    }, { filename: modulePath });
    await Promise.resolve();

    assert.equal(registeredIpc, true, '主窗口应完成初始化');
    assert.equal(windows.length, 1);
    const mainWindow = windows[0];
    windows.push({ hidden: true }); // 导出或绘图服务保留的隐藏窗口

    app.emit('second-instance');
    assert.equal(mainWindow.focused, true, '重复启动时应聚焦已有主窗口');

    mainWindow.close();
    assert.equal(windows.length, 1, '隐藏窗口仍然存在，window-all-closed 不会触发');
    assert.equal(quitCount, 1, '关闭 Windows 主窗口时应主动退出进程并释放单实例锁');

    const dayDirectory = fs.readdirSync(path.join(userDataDir, 'logs')).find((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
    assert.ok(dayDirectory);
    const log = fs.readFileSync(path.join(userDataDir, 'logs', dayDirectory, 'info.log'), 'utf8');
    assert.match(log, /"event":"main-window-closed","remainingWindows":1/);
    assert.match(log, /"event":"before-quit","remainingWindows":1/);
    console.log('Windows 主窗口关闭与单实例生命周期验证通过');
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
