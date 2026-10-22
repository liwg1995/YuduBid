const fsp = require('node:fs/promises');
const path = require('node:path');
const { getAiLogsDir, getKnowledgeBaseDir, getCredentialLibraryDir } = require('../utils/paths.cjs');

// 分类和交互参考上游 storageSpaceService；路径、引用查询和任务保护适配本地版。
function createStorageSpaceService({ app, db, taskService, browserSession }) {
  const root = path.resolve(app.getPath('userData'));
  let cleaning = false;
  async function children(directory) {
    try {
      if (!(await fsp.lstat(directory)).isDirectory()) return [];
      return (await fsp.readdir(directory, { withFileTypes: true }))
        .filter(entry => !entry.isSymbolicLink()).map(entry => path.join(directory, entry.name));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  async function measure(target) {
    try {
      const stat = await fsp.lstat(target);
      if (stat.isSymbolicLink()) return 0;
      if (!stat.isDirectory()) return stat.size;
      let bytes = 0;
      for (const child of await children(target)) bytes += await measure(child);
      return bytes;
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }
  }
  async function measureAll(targets) {
    let bytes = 0;
    for (const target of targets) bytes += await measure(target);
    return bytes;
  }
  async function files(directory) {
    const result = [];
    for (const child of await children(directory)) {
      const stat = await fsp.lstat(child);
      if (stat.isDirectory()) result.push(...await files(child));
      else if (stat.isFile()) result.push(child);
    }
    return result;
  }
  // 删除只能落在本机 userData 下，并拒绝经过符号链接的路径。
  async function assertLocal(target) {
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('清理路径超出允许范围');
    let current = root;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      try {
        if ((await fsp.lstat(current)).isSymbolicLink()) throw new Error('清理路径包含符号链接');
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
    }
  }
  const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  async function knowledgeOrphans() {
    const base = getKnowledgeBaseDir(app);
    const referenced = new Set(db.prepare('SELECT document_dir FROM knowledge_documents').all().map(row => key(path.join(base, row.document_dir))));
    const targets = [];
    for (const folder of await children(path.join(base, 'folders'))) {
      for (const document of await children(path.join(folder, 'documents'))) {
        if (!referenced.has(key(document))) targets.push(document);
      }
    }
    return targets;
  }
  async function credentialOrphans() {
    const base = getCredentialLibraryDir(app);
    const referenced = new Set(db.prepare('SELECT relative_path FROM credential_library_images').all().map(row => key(path.join(base, row.relative_path))));
    return (await files(path.join(base, 'images'))).filter(file => !referenced.has(key(file)));
  }
  const legacy = [
    { id: 'knowledge-base-orphans', label: '知识库残留文档', description: '数据库中已无记录的文档目录', collect: knowledgeOrphans },
    { id: 'credential-library-orphans', label: '资信库残留图片', description: '数据库中已无引用的图片原件', collect: credentialOrphans },
  ];
  const temporary = [
    { id: 'ai-logs', label: 'AI 请求日志', description: '开发者模式下记录的 AI 请求', collect: () => children(getAiLogsDir(app)) },
    { id: 'developer-logs', label: '其他开发日志', description: '各功能模块运行日志', collect: async () => (await children(path.join(root, 'logs'))).filter(file => key(file) !== key(getAiLogsDir(app))) },
    { id: 'browser-cache', label: '页面缓存', description: '页面资源与脚本缓存，清理后自动重建', collect: async () => ['Cache', 'Code Cache'].map(name => path.join(root, name)), clean: async () => { await browserSession.clearCache(); await browserSession.clearCodeCaches({}); } },
  ];
  async function measureItems(items) {
    const results = [];
    for (const item of items) results.push({ id: item.id, label: item.label, description: item.description, bytes: await measureAll(await item.collect()) });
    return results;
  }
  const sum = items => items.reduce((total, item) => total + item.bytes, 0);
  async function getUsage() {
    const legacyItems = await measureItems(legacy);
    const temporaryItems = await measureItems(temporary);
    const totalBytes = await measure(root);
    const protectedBytes = Math.max(0, totalBytes - sum(legacyItems) - sum(temporaryItems));
    return {
      totalBytes, scannedAt: new Date().toISOString(),
      groups: [
        { id: 'legacy', label: '历史遗留文件', description: '已无数据库引用的知识库文档和资信图片', bytes: sum(legacyItems), items: legacyItems },
        { id: 'temporary', label: '临时、缓存、日志', description: '可重新产生的页面缓存和开发日志', bytes: sum(temporaryItems), items: temporaryItems },
        { id: 'protected', label: '保留的数据', description: '业务资料、配置、数据库、智能体会话和更新文件', bytes: protectedBytes, items: [{ id: 'business', label: '业务与运行数据', description: '保留正在使用的资料；未确认引用关系的文件不参与清理', bytes: protectedBytes }] },
      ],
    };
  }
  async function clean(groupId) {
    const items = groupId === 'legacy' ? legacy : groupId === 'temporary' ? temporary : null;
    if (!items) throw new Error('不支持的清理类型');
    if (cleaning) throw new Error('正在清理，请稍候');
    cleaning = true;
    try {
      const skipped = [];
      let freedBytes = 0;
      let failedCount = 0;
      for (const item of items) {
        const targets = await item.collect();
        const before = await measureAll(targets);
        if (!before) continue;
        if (taskService.getActiveTasks().length) {
          skipped.push({ label: item.label, reason: '后台任务运行中' });
          continue;
        }
        if (item.clean) {
          try { await item.clean(); } catch { failedCount += 1; }
        } else {
          for (const target of targets) {
            try {
              await assertLocal(target);
              // 再查引用与任务，避免扫描期间导入资料或启动生成。
              if (taskService.getActiveTasks().length) { skipped.push({ label: item.label, reason: '后台任务运行中' }); break; }
              if (groupId === 'legacy' && !(await item.collect()).some(file => key(file) === key(target))) continue;
              await fsp.rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
            } catch { failedCount += 1; }
          }
        }
        freedBytes += Math.max(0, before - await measureAll(targets));
      }
      const usage = await getUsage();
      console.info('[storage-space] 清理完成', { groupId, freedBytes, failedCount, skipped });
      return { freedBytes, failedCount, skipped, usage };
    } finally { cleaning = false; }
  }
  return { getUsage, clean };
}
module.exports = { createStorageSpaceService };
