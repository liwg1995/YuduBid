const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
function createBlindEngine({ app }) {
  const children = new Set();
  const workspace = path.join(app.getPath('userData'), 'workspace');
  async function run(action, request, { signal, onProgress } = {}) {
    signal?.throwIfAborted();
    const rid = `${process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'win' : 'linux'}-${process.arch}`;
    const base = app.isPackaged ? path.join(process.resourcesPath, 'openxmlhelper') : path.join(app.getAppPath(), 'vendor', 'openxmlhelper');
    const exe = path.join(base, rid, `openxmlhelper${process.platform === 'win32' ? '.exe' : ''}`);
    if (!fs.existsSync(exe)) throw new Error('暗标检查引擎尚未构建，请运行 npm run build:blind-helper 后重试');
    const id = crypto.randomUUID();
    const dir = path.join(workspace, 'openxml-jobs', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify({ ...request, action }), 'utf8');
    const child = spawn(exe, ['--workspace', workspace], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    let stderr = '';
    child.stderr.on('data', value => { stderr = (stderr + value).slice(-4000); });
    child.stdout.resume();
    const poll = setInterval(() => { try { onProgress?.(JSON.parse(fs.readFileSync(path.join(dir, 'progress.json'), 'utf8'))); } catch {} }, 300);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15 * 60 * 1000);
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr || '暗标检查引擎异常退出')));
        child.stdin.on('error', reject);
        child.stdin.end(JSON.stringify({ v: 1, type: 'run', job: id }) + '\n');
      });
      signal?.throwIfAborted();
      if (timedOut) throw new Error('暗标任务超时，请拆分文件后重试');
      const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
      if (!result.ok) throw new Error(result.error || '暗标引擎任务失败');
      const output = path.resolve(dir, result.output || '');
      if (!output.startsWith(dir + path.sep)) throw new Error('引擎返回了无效结果路径');
      return JSON.parse(fs.readFileSync(output, 'utf8'));
    } catch (error) { signal?.throwIfAborted(); if (timedOut) throw new Error('暗标任务超时，请拆分文件后重试'); throw error; } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} children.delete(child); clearInterval(poll); clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const methods = Object.fromEntries([['runBlindCheck', 'blind-check-inspect'], ['runBlindCheckFix', 'blind-check-fix'], ['runBlindCheckDump', 'blind-check-dump'], ['runBlindCheckEdit', 'blind-check-edit']].map(([name, action]) => [name, (request, options) => run(action, request, options)]));
  const close = async () => { for (const child of children) child.kill(); };
  return { ...methods, close, closeBlindCheck: close };
}
module.exports = { createBlindEngine };
