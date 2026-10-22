const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStorageSpaceService } = require('../electron/services/storageSpaceService.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yibiao-storage-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'yibiao-storage-outside-'));
  let busy = false;
  let cacheClears = 0;
  const db = { prepare: sql => ({ all: () => sql.includes('knowledge_documents')
    ? [{ document_dir: 'folders/f/documents/kept' }] : [{ relative_path: 'images/kept.png' }] }) };
  const service = createStorageSpaceService({ app: { getPath: () => root }, db,
    taskService: { getActiveTasks: () => busy ? [{}] : [] },
    browserSession: { clearCache: async () => { cacheClears += 1; }, clearCodeCaches: async () => {} } });
  const write = async relative => {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'fixture', 'utf8');
    return target;
  };
  try {
    const kept = await write('workspace/knowledge-base/folders/f/documents/kept/content.md');
    const orphan = await write('workspace/knowledge-base/folders/f/documents/orphan/content.md');
    const keptImage = await write('workspace/credential-library/images/kept.png');
    const orphanImage = await write('workspace/credential-library/images/orphan.png');
    const config = await write('user_config.json');
    const log = await write('logs/ai/request.json');
    await write('Cache/data');
    await fs.writeFile(path.join(outside, 'keep.txt'), 'external', 'utf8');
    await fs.symlink(outside, path.join(root, 'logs', 'external'));
    const usage = await service.getUsage();
    assert(usage.groups.find(group => group.id === 'legacy').bytes > 0);
    busy = true;
    const skipped = await service.clean('legacy');
    assert.equal(skipped.freedBytes, 0);
    assert.equal(skipped.skipped.length, 2);
    await fs.access(orphan);
    busy = false;
    const cleaned = await service.clean('legacy');
    assert(cleaned.freedBytes > 0);
    await assert.rejects(fs.access(orphan));
    await assert.rejects(fs.access(orphanImage));
    for (const target of [kept, keptImage, config]) await fs.access(target);
    const temporary = await service.clean('temporary');
    assert(temporary.freedBytes > 0);
    assert.equal(cacheClears, 1);
    await assert.rejects(fs.access(log));
    await fs.access(path.join(outside, 'keep.txt'));
    await assert.rejects(service.clean('protected'));
    await assert.rejects(service.clean('../workspace'));
    console.log('存储清理验证通过：引用保护、任务跳过、缓存清理、符号链接及非法类型。');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
