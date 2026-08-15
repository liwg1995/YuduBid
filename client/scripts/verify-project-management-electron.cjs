const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { registerProjectManagementIpc } = require('../electron/ipc/projectManagementIpc.cjs');
const { createProjectManagementService } = require('../electron/services/projectManagementService.cjs');
const { getProjectManagementDir } = require('../electron/utils/paths.cjs');

const ipcChannels = [
  'load-state', 'list-projects', 'read-dictionaries', 'save-dictionary', 'create-project',
  'switch-project', 'delete-project', 'delete-projects', 'save-profile',
  'save-planning-input', 'generate-planning', 'save-planning-result',
  'save-discovery-input', 'generate-discovery', 'save-discovery-result',
  'save-execution-input', 'generate-execution', 'save-execution-result',
  'save-risk-input', 'generate-risk', 'save-risk-result',
  'save-stakeholder-input', 'generate-stakeholder', 'save-stakeholder-result',
  'save-delivery-input', 'generate-delivery', 'save-delivery-result',
  'save-reporting-input', 'generate-reporting', 'save-reporting-result',
  'save-commercial-input', 'generate-commercial', 'save-commercial-result',
  'save-retrospective-input', 'generate-retrospective', 'save-retrospective-result',
  'save-compliance-input', 'generate-compliance', 'save-compliance-result', 'clear',
].map((name) => `project-management:${name}`);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-project-management-electron-'));
const userDataDir = path.join(tempRoot, '中文用户数据');
app.setPath('userData', userDataDir);

function removeIpcHandlers() {
  for (const channel of ipcChannels) ipcMain.removeHandler(channel);
  ipcMain.removeAllListeners('project-management:subscribe');
}

async function run() {
  const aiRequests = [];
  const aiService = {
    async chat(request) {
      aiRequests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 15));
      return '# Electron 全链路规划结果\n\n- 中文项目资料已成功传递。';
    },
  };
  const configStore = {
    load: () => ({
      api_key: 'electron-fixture-key',
      base_url: 'https://example.invalid/v1',
      model_name: 'electron-fixture-model',
    }),
  };
  const service = createProjectManagementService({ app, aiService, configStore });
  registerProjectManagementIpc({ projectManagementService: service });

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await window.loadURL('data:text/html;charset=utf-8,<main id="app">project-management-smoke</main>');
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const api = window.yibiao?.projectManagement;
        const requiredMethods = ${JSON.stringify([
          'loadState', 'listProjects', 'readDictionaries', 'saveDictionary', 'createProject',
          'switchProject', 'deleteProject', 'deleteProjects', 'saveProfile', 'savePlanningInput',
          'generatePlanning', 'savePlanningResult', 'clear', 'onEvent',
        ])};
        const missingMethods = requiredMethods.filter((name) => typeof api?.[name] !== 'function');
        if (missingMethods.length) throw new Error('preload API 缺失：' + missingMethods.join('、'));

        const events = [];
        const unsubscribe = api.onEvent((state) => {
          events.push({
            projectId: state?.projectId,
            status: state?.task?.status || '',
            progress: state?.task?.progress ?? null,
            message: state?.task?.message || '',
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 30));

        try {
          const initial = await api.loadState();
          const created = await api.createProject({
            projectName: ' Electron 中文链路项目 ',
            profile: {
              clientName: '华东示例客户',
              vendorName: '禹都交付团队',
              projectType: '定制开发',
              projectGroup: '重点项目',
              currentStage: '项目规划',
            },
          });
          const projectId = created.state.projectId;
          const saved = await api.savePlanningInput({
            background: '建设统一项目管理与交付平台',
            objectives: '验证 preload、IPC、Service 与 Store 全链路',
          });
          const generated = await api.generatePlanning({});
          const projectsBeforeDelete = await api.listProjects();
          const switched = await api.switchProject(initial.projectId);
          const deleted = await api.deleteProject(projectId);
          const projectsAfterDelete = await api.listProjects();

          return {
            initialProjectId: initial.projectId,
            projectId,
            savedBackground: saved.planningInput.background,
            generatedResult: generated.planningResult,
            generatedTask: generated.task,
            projectNamesBeforeDelete: projectsBeforeDelete.projects.map((item) => item.name),
            switchedProjectId: switched.projectId,
            deletedSuccess: deleted.success,
            remainingProjectIds: projectsAfterDelete.projects.map((item) => item.id),
            events,
          };
        } finally {
          unsubscribe();
        }
      })()
    `, true);

    assert.notEqual(result.projectId, result.initialProjectId);
    assert.equal(result.savedBackground, '建设统一项目管理与交付平台');
    assert.match(result.generatedResult, /Electron 全链路规划结果/);
    assert.equal(result.generatedTask.status, 'success');
    assert.equal(result.generatedTask.progress, 100);
    assert.ok(result.projectNamesBeforeDelete.includes('Electron 中文链路项目'));
    assert.equal(result.switchedProjectId, result.initialProjectId);
    assert.equal(result.deletedSuccess, true);
    assert.ok(!result.remainingProjectIds.includes(result.projectId));
    assert.equal(aiRequests.length, 1);
    assert.equal(aiRequests[0].logTitle, '项目管理-启动与规划');
    assert.ok(aiRequests[0].messages.some((message) => message.content.includes('建设统一项目管理与交付平台')));

    const progress = result.events
      .filter((event) => event.projectId === result.projectId)
      .map((event) => event.progress);
    for (const expected of [12, 35, 72, 100]) {
      assert.ok(progress.includes(expected), `Renderer 应收到进度 ${expected}`);
    }

    const projectDir = getProjectManagementDir(app);
    const index = JSON.parse(fs.readFileSync(path.join(projectDir, 'index.json'), 'utf-8'));
    const initialProjectPath = path.join(projectDir, 'projects', `${result.initialProjectId}.json`);
    assert.ok(fs.existsSync(initialProjectPath), '项目状态文件应写入临时 userData');
    assert.ok(!index.projects.some((project) => project.id === result.projectId), '删除项目后索引不应残留');

    console.log(JSON.stringify({
      preloadApiReady: true,
      ipcRoundTripReady: true,
      generatedProgress: progress.filter((value) => [12, 35, 72, 100].includes(value)),
      chinesePersistenceReady: true,
      projectCrudReady: true,
      aiRequestCount: aiRequests.length,
    }, null, 2));
  } finally {
    if (!window.isDestroyed()) window.destroy();
    removeIpcHandlers();
  }
}

app.whenReady().then(async () => {
  try {
    await run();
    console.log('[project-management-electron] full preload and IPC smoke checks passed.');
    app.exit(0);
  } catch (error) {
    console.error('[project-management-electron] smoke verification failed.');
    console.error(error?.stack || error?.message || String(error));
    app.exit(1);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}, (error) => {
  console.error(error?.stack || error?.message || String(error));
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(1);
});
