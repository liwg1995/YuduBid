const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Two independent Electron processes prove disk recovery rather than object reuse.
if (!process.versions.electron) {
  const { execFileSync } = require('node:child_process');
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-office-grant-'));
  try {
    for (const phase of ['write', 'read']) {
      const output = execFileSync(require('electron'), [__filename, `--phase=${phase}`, `--test-root=${testRoot}`], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf-8', timeout: 90000, maxBuffer: 2 * 1024 * 1024,
      });
      process.stdout.write(output);
    }
    console.log('[office-grant] isolated persistence, process restart, project isolation and real DOCX export passed.');
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
} else {
  const { app, dialog } = require('electron');
  const argument = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
  const testRoot = argument('test-root');
  assert.ok(testRoot && path.basename(testRoot).startsWith('yibiao-office-grant-'));
  const userData = path.join(testRoot, '中文工作区');
  const outputDir = path.join(testRoot, '中文导出目录');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  app.setPath('userData', userData);
  app.setPath('documents', outputDir);
  const originalSaveDialog = dialog.showSaveDialog;

  async function run() {
    const { createOfficialDocumentService } = require('../electron/services/officialDocumentService.cjs');
    const { createGrantApplicationService } = require('../electron/services/grantApplicationService.cjs');
    const { createExportService } = require('../electron/services/exportService.cjs');
    const mammoth = require('mammoth');
    const AdmZip = require('adm-zip');
    const mockApp = workspace => ({ getPath: name => name === 'userData' ? path.join(userData, workspace) : app.getPath(name) });
    const aiService = { chat: async () => { throw new Error('离线持久化验证禁止调用模型'); } };
    const configStore = { load: () => ({}) };
    const official = workspace => createOfficialDocumentService({ app: mockApp(workspace), aiService, configStore });
    const grant = () => createGrantApplicationService({ app: mockApp('主工作区'), aiService, configStore });
    const expectedPath = path.join(testRoot, 'expectations.json');

    if (argument('phase') === 'write') {
      const service = official('主工作区');
      service.saveInput({ documentType: '通知', issuer: '合成单位', facts: '用于离线验证的事实材料' });
      const first = '# 关于开展验证工作的通知\n\n公文恢复权威稿甲：请于十月三十日前完成复核。';
      const second = '# 公文修订版\n\n公文旧稿乙：此段不应进入恢复后的导出。';
      service.saveRevision({ content: first });
      service.saveRevision({ content: second });
      assert.equal(service.loadState().revisions.length, 2);
      service.saveDraft('');
      assert.equal(official('主工作区').loadState().draft, '', '清空草稿后不得从旧Markdown文件恢复');
      service.saveDraft(first);
      official('独立工作区').saveDraft('独立工作区私有样本');
      assert.equal(service.loadState().draft, first);

      const research = grant();
      const projectA = research.createProject({ name: '甲课题中文项目' }).project;
      research.saveWorkspace({ panel: 'diagnosis', input: { taskText: '甲任务', materialText: '甲材料' } });
      research.saveOutput({ panel: 'diagnosis', output: '甲课题前序诊断成果' });
      const background = '甲课题人工修订背景。\n\n| 项目 | 数量 |\n| --- | --- |\n| 合成样本 | 12 |';
      research.saveProposalModule({ moduleKey: 'background', content: background });
      research.saveProposalModule({ moduleKey: 'goals', content: '甲课题具体研究目标' });
      const projectB = research.createProject({ name: '乙课题中文项目' }).project;
      assert.equal(research.loadState().outputs.proposal, '', '新课题不得继承上一项目正文');
      research.saveProposalModule({ moduleKey: 'background', content: '乙课题独有正文' });
      research.switchProject(projectA.id);
      assert.equal(research.loadState().proposalModules.background, background);
      fs.writeFileSync(expectedPath, JSON.stringify({ first, second, projectA, projectB, background }), 'utf-8');
      console.log('[office-grant:write] public draft/revisions/empty recovery and grant projects saved.');
      return;
    }

    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));
    const loaded = official('主工作区').loadState();
    assert.equal(loaded.draft, expected.first);
    assert.equal(loaded.revisions.length, 2);
    assert.equal(official('独立工作区').loadState().draft, '独立工作区私有样本');
    const research = grant();
    const restoredA = research.switchProject(expected.projectA.id);
    assert.equal(restoredA.proposalModules.background, expected.background);
    assert.match(restoredA.outputs.proposal, /甲课题人工修订背景/);
    assert.match(restoredA.outputs.proposal, /甲课题具体研究目标/);
    assert.equal(restoredA.outputs.diagnosis, '甲课题前序诊断成果');
    assert.doesNotMatch(restoredA.outputs.proposal, /乙课题独有正文/);
    assert.match(research.switchProject(expected.projectB.id).outputs.proposal, /乙课题独有正文/);
    research.switchProject(expected.projectA.id);

    const exporter = createExportService({ configStore });
    async function exportAndInspect(profile, title, markdown, includes, excludes) {
      const target = path.join(outputDir, `${title}.docx`);
      let defaultPath = '';
      dialog.showSaveDialog = async options => { defaultPath = options.defaultPath; return { canceled: false, filePath: target }; };
      const progress = [];
      const result = await exporter.exportWord({ document_profile: profile, project_name: title,
        outline: [{ id: profile, title, hideTitle: true, content: markdown }] }, event => progress.push(event));
      assert.equal(result.success, true);
      assert.ok(fs.statSync(target).size > 0);
      const text = (await mammoth.extractRawText({ path: target })).value;
      for (const token of includes) assert.ok(text.includes(token), `Word遗漏权威内容：${token}`);
      for (const token of excludes) assert.ok(!text.includes(token), `Word串入旧稿/其他项目：${token}`);
      if (profile === 'grant-application') assert.match(new AdmZip(target).readAsText('word/document.xml'), /<w:tbl>/);
      assert.equal(progress.at(-1).phase, 'success');
      assert.equal(progress.at(-1).progress, 100);
      console.log(`[office-grant:export] ${profile}, default=${path.basename(defaultPath)}, text=${text.length}, bytes=${fs.statSync(target).size}`);
      assert.equal(path.basename(defaultPath), `${title}.docx`, '公文/课题的默认文件名不应追加技术方案后缀');
      dialog.showSaveDialog = async () => ({ canceled: true });
      const before = fs.readdirSync(outputDir).sort();
      const canceled = await exporter.exportWord({ document_profile: profile, project_name: title,
        outline: [{ id: profile, title, content: markdown }] });
      assert.equal(canceled.canceled, true);
      assert.deepEqual(fs.readdirSync(outputDir).sort(), before);
    }
    await exportAndInspect('official-document', '公文恢复验收通知', loaded.draft, ['公文恢复权威稿甲', '十月三十日'], ['公文旧稿乙', '独立工作区私有样本']);
    await exportAndInspect('grant-application', '甲课题申报书', restoredA.outputs.proposal, ['甲课题人工修订背景', '甲课题具体研究目标', '合成样本', '12'], ['乙课题独有正文']);
    for (const [payload, filename] of [
      [{ project_name: '技术方案对照' }, '技术方案对照-技术方案.docx'],
      [{ documentProfile: 'official-document' }, '公文文稿.docx'],
      [{ documentProfile: 'grant-application' }, '课题申报书.docx'],
    ]) {
      let defaultPath = '';
      dialog.showSaveDialog = async options => { defaultPath = options.defaultPath; return { canceled: true }; };
      const canceled = await exporter.exportWord({ ...payload, outline: [{ id: 'naming-check', title: '标题', content: '命名验证' }] });
      assert.equal(canceled.canceled, true);
      assert.equal(path.basename(defaultPath), filename);
    }
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(outputDir, '不存在的目录', '保存失败.docx') });
    const filesBeforeFailure = fs.readdirSync(outputDir).sort();
    await assert.rejects(exporter.exportWord({ document_profile: 'official-document',
      project_name: '失败验证', outline: [{ id: 'failed-write', title: '失败验证', content: loaded.draft }] }), /ENOENT/);
    assert.deepEqual(fs.readdirSync(outputDir).sort(), filesBeforeFailure, '失败不得新增导出文件');
    assert.equal(official('主工作区').loadState().draft, expected.first, '导出或取消不得改变草稿');
    const clearedModule = research.saveProposalModule({ moduleKey: 'background', content: '' });
    assert.doesNotMatch(clearedModule.outputs.proposal, /甲课题人工修订背景/);
    assert.match(grant().loadState().outputs.proposal, /甲课题具体研究目标/);
    console.log('[office-grant:read] separate Electron process recovery, DOCX content/table/progress and cancellation verified.');
  }

  app.whenReady().then(run).then(() => { dialog.showSaveDialog = originalSaveDialog; app.exit(0); }, error => {
    dialog.showSaveDialog = originalSaveDialog;
    console.error(error.stack || error);
    app.exit(1);
  });
}
