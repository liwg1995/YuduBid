const fs = require('node:fs');

const retryableCodes = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function clearReadonly(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    fs.chmodSync(targetPath, stat.isDirectory() ? 0o777 : 0o666);
    if (stat.isDirectory()) {
      fs.readdirSync(targetPath).forEach((name) => clearReadonly(require('node:path').join(targetPath, name)));
    }
  } catch {
    // 删除流程会给出最终错误；这里只做 Windows 只读属性的尽力清理。
  }
}

function safeRemoveSync(targetPath, options = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  clearReadonly(targetPath);
  let lastError;
  for (let attempt = 0; attempt < (options.attempts || 12); attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: Boolean(options.recursive), force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code)) throw error;
      sleep(options.delayMs || 150);
    }
  }
  const error = new Error(options.message || `文件正在被占用，无法清理：${targetPath}`);
  error.code = 'WORKSPACE_FILE_IN_USE';
  error.cause = lastError;
  throw error;
}

module.exports = { safeRemoveSync, isFileLockError: (error) => retryableCodes.has(error?.code) };
