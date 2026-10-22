const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createBlindCheckStore } = require('./blindCheckStore.cjs');
const { createTaskLogStore } = require('./taskLogStore.cjs');
const { createBlindEngine } = require('./engine.cjs');
const { createBlindAgentAdapter } = require('./agentAdapter.cjs');
const { runBlindCheckTask } = require('./blindCheckTask.cjs');
const { runBlindCheckFixTask } = require('./blindCheckFixTask.cjs');
const { runBlindCheckPresetExtractionTask } = require('./blindCheckPresetExtractionTask.cjs');
const { parseDocumentWithConfig } = require('../fileService.cjs');
function createFullBlindCheckController({ app, db, aiService, configStore, credentialLibraryService, technicalPlanStore, dialog, shell, emit = () => {} }) {
  const store = createBlindCheckStore({ app, db, taskLogStore: createTaskLogStore({ db }), credentialLibraryService, technicalPlanStore, fileService: { parseBlindCheckTender: async file => ({ fileName: path.basename(file), content: await parseDocumentWithConfig(app, file, configStore.load(), { assetScope: 'blind-check-tender', preserveImages: false }) }) } });
  const engine = createBlindEngine({ app });
  const ai = { ...aiService, getConfig: () => { const config = configStore.load(); return config.text_model_profiles?.[config.text_model_provider] || config; } };
  const agent = createBlindAgentAdapter({ app, aiService: ai });
  let active = null;
  app.once?.('before-quit', () => { active?.controller.abort(); void engine.close(); });
  const exports = new Set();
  function snapshot() { return store.loadBlindCheck(); }
  function publish() { const state = snapshot(); emit({ task: active?.task || state.checkTask || state.fixTask || state.extractionTask, blindCheck: state }); return state; }
  function assertIdle() { if (active) throw new Error('暗标任务正在执行，请先等待完成或重置任务'); }
  // 恢复未完成快照，不能将上次运行中的任务当作已完成。
  for (const field of ['checkTask', 'fixTask', 'extractionTask']) {
    const task = snapshot()[field];
    if (task?.status === 'running') store.updateBlindCheckWithoutReload({ [field]: { ...task, status: 'error', error: '上次暗标任务因应用退出而中断，请重新执行。' } });
  }
  function start(type, field, runner, payload) {
    assertIdle();
    const controller = new AbortController();
    const timestamp = new Date().toISOString();
    const run = { controller, task: { type, task_id: crypto.randomUUID(), status: 'running', progress: 0, logs: ['正在准备暗标任务'], started_at: timestamp, updated_at: timestamp } };
    active = run;
    store.updateBlindCheckWithoutReload({ [field]: run.task }); publish();
    const updateTask = (partial, patch) => {
      if (active !== run) return run.task;
      run.task = { ...run.task, ...partial, updated_at: new Date().toISOString() };
      store.updateBlindCheckWithoutReload({ ...(patch || {}), [field]: run.task }); publish(); return run.task;
    };
    const checkpointTask = (partial, patch) => ({ task: updateTask(partial, patch), state: snapshot() });
    run.promise = Promise.resolve().then(() => runner({ agentService: agent, aiService: ai, workspaceStore: store, openXmlHelperService: engine, updateTask, checkpointTask, payload, taskControl: { signal: controller.signal } })).catch(error => {
      if (active !== run) return;
      const message = error?.message || '暗标任务执行失败';
      const patch = field === 'checkTask' ? { result: { ...snapshot().result, status: 'error', error: message } }
        : field === 'fixTask' ? { fixResult: { ...snapshot().fixResult, status: 'error', error: message } }
          : {};
      updateTask({ status: 'error', progress: 100, error: message, logs: [...run.task.logs, message] }, patch);
    }).finally(() => { if (active === run) { if (run.task.status === 'running') updateTask({ status: 'success', progress: 100 }); active = null; publish(); } });
    return run.task;
  }
  async function cancel() { if (active) { const run = active; run.controller.abort(new Error('暗标任务已停止')); await run.promise; } }
  return {
    store, loadState: snapshot,
    getActiveTasks: () => active ? [{ ...active.task, group: 'blind-check' }] : [],
    startCheck: payload => start('blind-check-run', 'checkTask', runBlindCheckTask, payload),
    startFix: payload => start('blind-check-fix', 'fixTask', runBlindCheckFixTask, payload),
    startExtraction: payload => start('blind-check-preset-extraction', 'extractionTask', runBlindCheckPresetExtractionTask, payload),
    async importFile(file) { await cancel(); const state = await store.importFile(file); publish(); return state; },
    async removeFile() { await cancel(); const state = store.removeFile(); publish(); return state; },
    async clear() { await cancel(); const state = store.clearBlindCheck(); publish(); return state; },
    mutate(method, ...args) { assertIdle(); const result = store[method](...args); publish(); return result; },
    async saveFixedDocument() {
      assertIdle(); const file = store.getFixedDocument(); if (!file) throw new Error('没有可导出的修复副本，或检查条件已改变');
      const selected = await dialog.showSaveDialog({ title: '导出暗标修复副本', defaultPath: file.fileName.replace(/\.docx$/i, '-暗标修复.docx'), filters: [{ name: 'Word 文档', extensions: ['docx'] }] });
      if (selected.canceled || !selected.filePath) return { success: false, canceled: true };
      const destination = /\.docx$/i.test(selected.filePath) ? selected.filePath : selected.filePath + '.docx';
      const originalStat = file.originalPath && fs.existsSync(file.originalPath) ? await fs.promises.stat(file.originalPath) : null;
      const targetStat = fs.existsSync(destination) ? await fs.promises.stat(destination) : null;
      if (path.resolve(destination).toLowerCase() === path.resolve(file.originalPath).toLowerCase() || (originalStat && targetStat && originalStat.dev === targetStat.dev && originalStat.ino === targetStat.ino)) throw new Error('修复结果不能覆盖原始文档，请选择其他位置');
      await fs.promises.copyFile(file.path, destination); exports.add(path.resolve(destination)); return { success: true, path: destination, message: '修复副本已导出，请核对版面' };
    },
    async openExport(file) { if (!exports.has(path.resolve(file))) throw new Error('只能打开本次导出的修复副本'); const error = await shell.openPath(file); if (error) throw new Error(error); },
  };
}
module.exports = { createFullBlindCheckController };
