const fs = require('node:fs');
const path = require('node:path');

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_FILE_PATTERN = /^app-(info|warning)-\d{4}-\d{2}-\d{2}\.log$/;

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createAppLogger(app) {
  const directory = path.join(app.getPath('userData'), 'logs');
  let lastCleanupDate = '';

  function cleanup(now = new Date()) {
    fs.mkdirSync(directory, { recursive: true });
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && DATE_PATTERN.test(entry.name)) {
        const dayDirectory = path.join(directory, entry.name);
        for (const level of ['info', 'warning']) {
          const filePath = path.join(dayDirectory, `${level}.log`);
          try {
            if (fs.existsSync(filePath) && now.getTime() - fs.statSync(filePath).mtimeMs > RETENTION_MS) fs.rmSync(filePath);
          } catch (error) {
            console.warn('[appLogger] 清理过期日志失败', filePath, error?.message || String(error));
          }
        }
        if (fs.readdirSync(dayDirectory).length === 0) fs.rmdirSync(dayDirectory);
      } else if (entry.isFile() && LEGACY_FILE_PATTERN.test(entry.name)) {
        const filePath = path.join(directory, entry.name);
        try {
          if (now.getTime() - fs.statSync(filePath).mtimeMs > RETENTION_MS) fs.rmSync(filePath);
        } catch (error) {
          console.warn('[appLogger] 清理旧版日志失败', filePath, error?.message || String(error));
        }
      }
    }
    const legacyPath = path.join(directory, 'app-lifecycle.log');
    try {
      if (fs.existsSync(legacyPath) && now.getTime() - fs.statSync(legacyPath).mtimeMs > RETENTION_MS) fs.rmSync(legacyPath);
    } catch (error) {
      console.warn('[appLogger] 清理旧版生命周期日志失败', error?.message || String(error));
    }
  }

  function write(level, event, details = {}) {
    if (!['info', 'warning', 'error'].includes(level)) throw new Error('无效的日志级别');
    try {
      const now = new Date();
      const date = formatLocalDate(now);
      if (lastCleanupDate !== date) {
        cleanup(now);
        lastCleanupDate = date;
      }
      const dayDirectory = path.join(directory, date);
      fs.mkdirSync(dayDirectory, { recursive: true });
      const filePath = path.join(dayDirectory, `${level}.log`);
      fs.appendFileSync(filePath, `${JSON.stringify({ at: now.toISOString(), level, pid: process.pid, event, ...details })}\n`, 'utf8');
    } catch (error) {
      console.warn('[appLogger] 写入日志失败', error?.message || String(error));
    }
  }

  return {
    directory,
    cleanup,
    info: (event, details) => write('info', event, details),
    warning: (event, details) => write('warning', event, details),
    error: (event, details) => write('error', event, details),
  };
}

module.exports = { createAppLogger };
