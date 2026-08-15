const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { createThesisTutorService } = require('../electron/services/thesisTutorService.cjs');
const { getThesisTutorDir } = require('../electron/utils/paths.cjs');

function createMockApp(userDataDir) {
  return {
    getPath() {
      return userDataDir;
    },
  };
}

function createDialogService() {
  let nextOpenPath = '';
  let nextSavePath = '';
  return {
    selectOpenPath(filePath) {
      nextOpenPath = filePath;
    },
    selectSavePath(filePath) {
      nextSavePath = filePath;
    },
    async showOpenDialog() {
      const filePath = nextOpenPath;
      nextOpenPath = '';
      return filePath
        ? { canceled: false, filePaths: [filePath] }
        : { canceled: true, filePaths: [] };
    },
    async showSaveDialog() {
      const filePath = nextSavePath;
      nextSavePath = '';
      return filePath
        ? { canceled: false, filePath }
        : { canceled: true, filePath: '' };
    },
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-thesis-tutor-'));
  const userDataDir = path.join(tempRoot, 'userData');
  const exportDir = path.join(tempRoot, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const app = createMockApp(userDataDir);
  const dialogService = createDialogService();
  const aiRequests = [];
  const aiService = {
    async chat(request) {
      aiRequests.push(request);
      return '# 评审结果\n\n- 已根据真实材料生成评审清单。';
    },
  };
  const configStore = {
    load() {
      return {
        api_key: 'fixture-key',
        base_url: 'https://example.invalid/v1',
        model_name: 'fixture-model',
      };
    },
  };
  const service = createThesisTutorService({ app, aiService, configStore, dialogService });

  try {
    let state = service.loadState();
    assert.equal(state.activePanel, 'diagnosis');
    assert.equal(state.profile.citationFormat, 'GB/T 7714');
    assert.deepEqual(state.chapters, []);

    const receivedEvents = [];
    let destroyedListener = null;
    const subscriber = {
      isDestroyed: () => false,
      send: (channel, payload) => receivedEvents.push({ channel, payload }),
      once: (event, listener) => {
        if (event === 'destroyed') destroyedListener = listener;
      },
    };
    service.subscribe(subscriber);
    assert.equal(receivedEvents[0].channel, 'thesis-tutor:event');

    state = service.saveProfile({
      degree: '硕士',
      discipline: '计算机科学与技术',
      title: '智能投标文件风险识别研究',
      outlinePlan: '第一章 绪论\n第二章 文献综述\n第三章 研究设计\n第四章 实证分析\n第五章 结论',
    });
    assert.equal(state.profile.degree, '硕士');
    assert.equal(state.chapters.length, 5);
    assert.equal(state.activeChapterId, state.chapters[0].id);

    const chapterId = state.chapters[0].id;
    state = service.saveChapters({
      activeChapterId: 'missing-chapter',
      chapters: [{
        id: chapterId,
        title: '第一章 绪论',
        status: 'unexpected-status',
        goal: '明确研究背景与问题',
        material: '真实项目材料',
      }],
    });
    assert.equal(state.chapters[0].status, 'not_started');
    assert.equal(state.activeChapterId, chapterId);

    state = service.saveReferences({
      activeReferenceId: 'missing-reference',
      references: [{
        id: 'ref-1',
        type: 'unknown',
        verificationStatus: 'unknown',
        title: '投标文件风险识别研究',
        summary: '用于验证证据链保存。',
      }],
    });
    assert.equal(state.references[0].type, 'literature');
    assert.equal(state.references[0].verificationStatus, 'unverified');
    assert.equal(state.activeReferenceId, 'ref-1');

    state = service.saveFeedback({
      feedbackItems: [{ id: 'feedback-1', title: '补充研究边界', priority: 'urgent', status: 'open' }],
    });
    assert.equal(state.feedbackItems[0].priority, 'medium');
    assert.equal(state.feedbackItems[0].status, 'todo');

    state = service.saveChecks({
      checkItems: [{ id: 'check-1', title: '核验引用', category: 'unknown', severity: 'urgent', status: 'open' }],
    });
    assert.equal(state.checkItems[0].category, 'format');
    assert.equal(state.checkItems[0].severity, 'medium');
    assert.equal(state.checkItems[0].status, 'unchecked');

    state = service.saveDraft({
      panel: 'writing',
      activeChapterId: chapterId,
      chapters: state.chapters,
      draft: '这是基于真实材料保存的章节草稿。',
      sourceText: '真实项目材料',
      userInput: '完善第一章',
    });
    assert.equal(state.chapters[0].status, 'drafted');
    assert.equal(state.chapters[0].draft, '这是基于真实材料保存的章节草稿。');
    assert.equal(state.panelResults.writing.content, state.chapters[0].draft);

    state = await service.generate({
      panel: 'review',
      profile: state.profile,
      userInput: '检查论文结构和证据边界',
      sourceText: state.sourceText,
      chapters: state.chapters,
      activeChapterId: chapterId,
      references: state.references,
      activeReferenceId: state.activeReferenceId,
      feedbackItems: state.feedbackItems,
      activeFeedbackId: state.activeFeedbackId,
      checkItems: state.checkItems,
      activeCheckId: state.activeCheckId,
    });
    assert.equal(state.task.status, 'success');
    assert.equal(state.task.progress, 100);
    assert.match(state.latestResult, /评审结果/);
    assert.equal(state.history[0].panel, 'review');
    assert.match(aiRequests[0].messages[1].content, /智能投标文件风险识别研究/);
    assert.match(aiRequests[0].messages[1].content, /真实项目材料/);
    assert.match(aiRequests[0].messages[1].content, /待核验/);

    const backupPath = path.join(exportDir, 'workspace.json');
    dialogService.selectSavePath(backupPath);
    const backupResult = await service.exportWorkspace();
    assert.equal(backupResult.success, true);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    assert.equal(backup.schema, 'yibiao-thesis-tutor-workspace');
    assert.equal(backup.state.profile.title, '智能投标文件风险识别研究');

    const packagePath = path.join(exportDir, 'project.zip');
    dialogService.selectSavePath(packagePath);
    const packageResult = await service.exportProjectPackage();
    assert.equal(packageResult.success, true);
    const zip = new AdmZip(packagePath);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    assert.ok(entryNames.includes('README.md'));
    assert.ok(entryNames.includes('workspace.json'));
    assert.ok(entryNames.includes('02-章节草稿.md'));
    assert.match(zip.readAsText('README.md'), /智能投标文件风险识别研究/);

    state = service.clear().state;
    assert.equal(state.profile.title, '');
    assert.deepEqual(state.references, []);

    dialogService.selectOpenPath(backupPath);
    let importResult = await service.importWorkspace();
    assert.equal(importResult.success, true);
    assert.equal(importResult.state.profile.title, '智能投标文件风险识别研究');
    assert.equal(importResult.state.task, undefined);

    service.clear();
    dialogService.selectOpenPath(packagePath);
    importResult = await service.importWorkspace();
    assert.equal(importResult.success, true);
    assert.equal(importResult.state.chapters[0].draft, '这是基于真实材料保存的章节草稿。');

    const invalidBackupPath = path.join(exportDir, 'invalid.json');
    fs.writeFileSync(invalidBackupPath, '{invalid json', 'utf-8');
    dialogService.selectOpenPath(invalidBackupPath);
    importResult = await service.importWorkspace();
    assert.equal(importResult.success, false);
    assert.match(importResult.message, /有效 JSON/);

    const eventCountBeforeDestroy = receivedEvents.length;
    destroyedListener();
    service.saveProfile({ title: '订阅释放验证' });
    assert.equal(receivedEvents.length, eventCountBeforeDestroy);

    const statePath = path.join(getThesisTutorDir(app), 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      ...service.loadState(),
      task: {
        id: 'stale-thesis-task',
        type: 'review',
        status: 'running',
        progress: 42,
        message: '仍在生成',
      },
    }, null, 2), 'utf-8');
    const restartedService = createThesisTutorService({ app, aiService, configStore, dialogService });
    state = restartedService.loadState();
    assert.equal(state.task.status, 'error');
    assert.equal(state.task.progress, 100);
    assert.equal(state.task.message, '上次任务未完成，请重新执行。');

    const missingConfigService = createThesisTutorService({
      app,
      aiService,
      configStore: { load: () => ({}) },
      dialogService,
    });
    await assert.rejects(
      missingConfigService.generate({ panel: 'diagnosis' }),
      /API Key、Base URL、模型名称/,
    );

    console.log('[thesis-tutor-verify] passed');
    console.log(JSON.stringify({
      chapters: backup.state.chapters.length,
      references: backup.state.references.length,
      feedbackItems: backup.state.feedbackItems.length,
      checkItems: backup.state.checkItems.length,
      history: backup.state.history.length,
      projectPackageEntries: entryNames.length,
      subscriberEvents: receivedEvents.length,
      interruptedTaskRecovered: state.task.status === 'error',
    }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
