const fs = require('node:fs');
const path = require('node:path');
const { getImportedImagesDir } = require('./paths.cjs');

function isPathInsideDirectory(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function deleteImportedImageBatches(app, scopePrefix) {
  const prefix = String(scopePrefix || '').trim();
  if (!prefix || !app?.getPath) return;

  const baseDir = path.resolve(getImportedImagesDir(app));
  if (!fs.existsSync(baseDir)) return;

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== prefix && !entry.name.startsWith(`${prefix}-`)) continue;

    const targetPath = path.resolve(baseDir, entry.name);
    if (!isPathInsideDirectory(baseDir, targetPath) || targetPath === baseDir) continue;
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

// 可研图片按项目存储，历史 Markdown 仍沿用 imported-images URL。
// 只查找该功能生成的图片批次，不把项目目录作为通用文件根暴露。
function findFeasibilityImportedImage(app, relativePath) {
  if (!app?.getPath) return null;
  const parts = String(relativePath || '').split(/[\\/]/);
  if (parts.length < 2 || !parts[0].startsWith('feasibility-report-source-')
    || parts.some((part) => !part || part === '.' || part === '..')) return null;
  const projectRoot = path.join(app.getPath('userData'), 'feasibility-report-projects');
  if (!fs.existsSync(projectRoot)) return null;
  for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9_-]*$/.test(entry.name)) continue;
    const baseDir = path.resolve(projectRoot, entry.name, 'workspace', 'imported-images');
    const candidate = path.resolve(baseDir, ...parts);
    if (candidate !== baseDir && isPathInsideDirectory(baseDir, candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

module.exports = {
  deleteImportedImageBatches,
  findFeasibilityImportedImage,
};
