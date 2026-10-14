const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppLogger } = require('../electron/utils/appLogger.cjs');

const now = new Date();
const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-app-logger-'));
try {
  const logger = createAppLogger({ getPath: () => userDataDir });
  const oldDate = '2020-01-01';
  const oldInfo = path.join(logger.directory, oldDate, 'info.log');
  const oldWarning = path.join(logger.directory, oldDate, 'warning.log');
  const oldError = path.join(logger.directory, oldDate, 'error.log');
  fs.mkdirSync(path.join(logger.directory, oldDate), { recursive: true });
  for (const filePath of [oldInfo, oldWarning, oldError]) {
    fs.writeFileSync(filePath, 'old\n', 'utf8');
    fs.utimesSync(filePath, new Date(oldDate), new Date(oldDate));
  }

  logger.info('test-info');
  logger.warning('test-warning');
  logger.error('test-error', { code: 'ECONNRESET' });

  assert.equal(fs.existsSync(oldInfo), false);
  assert.equal(fs.existsSync(oldWarning), false);
  assert.equal(fs.existsSync(oldError), true);
  for (const level of ['info', 'warning', 'error']) {
    const filePath = path.join(logger.directory, localDate, `${level}.log`);
    assert.equal(fs.existsSync(filePath), true);
    assert.match(fs.readFileSync(filePath, 'utf8'), new RegExp(`"level":"${level}"`));
  }
  console.log('应用日志分级、按日切分和保留期验证通过');
} finally {
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
