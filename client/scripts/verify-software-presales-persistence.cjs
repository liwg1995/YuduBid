const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Separate processes verify disk recovery; fixture setup never touches user projects.
if (!process.versions.electron) {
  const { execFileSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-material-persistence-'));
  try {
    for (const phase of ['write', 'restore', 'verify']) {
      process.stdout.write(execFileSync(require('electron'), [__filename, `--root=${root}`, `--phase=${phase}`], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf-8', timeout: 90000, maxBuffer: 2 * 1024 * 1024,
      }));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
} else {
  const { app } = require('electron');
  const argument = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
  const root = argument('root');
  assert.ok(root && path.basename(root).startsWith('yibiao-material-persistence-'));
  const userData = path.join(root, '中文用户数据');
  fs.mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
  const expectedFile = path.join(root, 'expectations.json');
  const original = '# 甲项目操作手册\n\n中文初稿：进入工作台，核对资料。';
  const edited = '# 甲项目操作手册\n\n人工修订：保存后退出并重新打开。';
  const aiService = {
    getImageModelAvailability: () => ({ available: false, message: '离线验证' }),
    chat: async () => { throw new Error('离线验证禁止调用模型'); },
  };
  async function run() {
    const { createSoftwareCopyrightService } = require('../electron/services/softwareCopyrightService.cjs');
    const { createPresalesWorkbenchService } = require('../electron/services/presalesWorkbenchService.cjs');
    const { getSoftwareCopyrightDir } = require('../electron/utils/paths.cjs');
    const software = () => createSoftwareCopyrightService({ app, aiService, configStore: {}, codeGenerationService: null });
    const presales = createPresalesWorkbenchService({ app, aiService });
    const stages = ['Analysis', 'Research', 'Architecture', 'Diagram', 'Presentation'];
    if (argument('phase') === 'write') {
      const service = software();
      const initial = service.loadState();
      const a = service.listCases().activeCaseId;
      const draftDir = path.join(root, '甲项目中文草稿');
      fs.mkdirSync(draftDir, { recursive: true });
      const manual = path.join(draftDir, '操作手册.md');
      const application = path.join(draftDir, '申请表.md');
      fs.writeFileSync(manual, original, 'utf-8');
      fs.writeFileSync(application, '甲项目申请表独立内容', 'utf-8');
      // Seed generated-material fixture only; all subsequent writes use production APIs.
      fs.writeFileSync(path.join(getSoftwareCopyrightDir(app), 'state.json'), JSON.stringify({
        ...initial, draftDir, drafts: { manual, application }, step: 'draft',
      }), 'utf-8');
      const saved = service.saveDraft({ key: 'manual', content: edited });
      assert.equal(saved.content, edited);
      assert.equal(fs.readFileSync(manual, 'utf-8'), edited);
      assert.equal(service.readDraft('application').content, '甲项目申请表独立内容');
      const version = service.listDraftVersions('manual').find(item => item.reason === '保存前自动备份');
      assert.ok(version);
      service.saveDraft({ key: 'application', content: '' });
      assert.equal(service.readDraft('application').content, '');
      const b = service.createCase({ name: '乙项目空白中文样本' }).cases.activeCaseId;
      assert.throws(() => service.readDraft('manual'), /草稿文件不存在/);
      assert.throws(() => service.restoreDraftVersion({ key: 'manual', versionId: version.id }), /草稿文件不存在/);
      service.saveFields({ softwareName: '乙项目专属软件' });
      service.switchCase(a);
      assert.equal(service.readDraft('manual').content, edited);
      const pa = presales.createProject({ projectName: '售前甲中文项目' }).state.projectId;
      for (const stage of stages) presales[`save${stage}Result`]({ markdown: `# 甲项目${stage}\n\n独立保存的中文成果。` });
      const pb = presales.createProject({ projectName: '售前乙中文项目' }).state.projectId;
      for (const stage of stages) {
        const key = `${stage[0].toLowerCase()}${stage.slice(1)}Result`;
        assert.equal(presales.loadState()[key].markdown, '');
        presales[`save${stage}Result`]({ markdown: `乙项目${stage}专属内容` });
      }
      fs.writeFileSync(expectedFile, JSON.stringify({ a, b, version: version.id, pa, pb }), 'utf-8');
      console.log('[write] 软著双材料、清空保存、版本备份和售前双项目五阶段已落盘');
      return;
    }
    const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf-8'));
    const service = software();
    service.switchCase(expected.a);
    assert.equal(service.readDraft('application').content, '', '重启不得恢复已清空的旧稿');
    if (argument('phase') === 'restore') {
      assert.equal(service.readDraft('manual').content, edited);
      assert.equal(service.compareDraftVersion({ key: 'manual', versionId: expected.version }).changed, true);
      const restored = service.restoreDraftVersion({ key: 'manual', versionId: expected.version });
      assert.equal(restored.content, original);
      assert.equal(restored.state.draftConfirmed, false);
      assert.equal(restored.state.confirmedSnapshot, null);
      assert.deepEqual(restored.state.outputs, []);
      assert.ok(service.listDraftVersions('manual').some(item => item.reason === '恢复前自动备份'));
    } else {
      assert.equal(service.readDraft('manual').content, original, '第三进程必须读到恢复后的正文');
      assert.throws(() => service.restoreDraftVersion({ key: 'manual', versionId: expected.version }), /已经是这个版本/);
      assert.throws(() => service.restoreDraftVersion({ key: 'manual', versionId: '../非法版本' }), /标识无效/);
    }
    service.switchCase(expected.b);
    assert.equal(service.loadState().fields.softwareName, '乙项目专属软件');
    assert.throws(() => service.readDraft('manual'), /草稿文件不存在/);
    service.switchCase(expected.a);
    assert.equal(service.readDraft('manual').content, original);
    for (const [id, prefix] of [[expected.pa, '甲项目'], [expected.pb, '乙项目']]) {
      const state = presales.switchProject(id);
      for (const stage of stages) {
        const key = `${stage[0].toLowerCase()}${stage.slice(1)}Result`;
        if (argument('phase') === 'verify' && id === expected.pa && stage === 'Analysis') {
          assert.equal(state[key].markdown, '');
          continue;
        }
        assert.ok(state[key].markdown.includes(`${prefix}${stage}`));
        assert.ok(!state[key].markdown.includes(prefix === '甲项目' ? '乙项目' : '甲项目'));
      }
    }
    if (argument('phase') === 'restore') {
      presales.switchProject(expected.pa);
      presales.saveAnalysisResult({ markdown: '' });
    } else {
      assert.equal(presales.switchProject(expected.pa).analysisResult.markdown, '', '售前清空成果跨重启保留');
    }
    console.log(`[${argument('phase')}] 跨进程恢复、版本还原、空稿与项目隔离通过`);
  }
  app.whenReady().then(run).then(() => app.exit(0)).catch(error => {
    console.error(error.stack || error);
    app.exit(1);
  });
}
