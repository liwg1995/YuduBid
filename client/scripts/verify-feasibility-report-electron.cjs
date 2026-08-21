const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { createFeasibilityReportStoreRouter } = require('../electron/services/feasibilityReportStoreRouter.cjs');
const { createFeasibilityReportStore } = require('../electron/services/feasibilityReportStore.cjs');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { buildDocxResult } = require('../electron/services/exportService.cjs');
const AdmZip = require('adm-zip');

function createTestApp(userDataPath) {
  return {
    getPath(name) {
      if (name === 'userData') return userDataPath;
      return app.getPath(name);
    },
    once: (...args) => app.once(...args),
  };
}

async function run() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-feasibility-report-'));
  try {
    const testApp = createTestApp(testRoot);
    const firstRouter = createFeasibilityReportStoreRouter({ app: testApp });
    const created = firstRouter.createProject({ projectName: '持久化验证项目' });
    const projectId = created.project.id;

    assert.equal(created.projects.activeProjectId, projectId);
    assert.equal(created.projects.projects.length, 1);
    assert.equal(created.project.name, '持久化验证项目');

    firstRouter.updateStep({ projectId, step: 'analysis' });
    firstRouter.saveProjectInfo({
      projectId,
      projectInfo: {
        projectName: '持久化验证项目',
        projectType: 'government',
        industry: '基础设施',
        constructionUnit: '测试建设单位',
        location: '中文路径测试区',
        constructionContent: '验证多项目可研数据持久化',
        constructionPeriodYears: '2',
        operationPeriodYears: '10',
        totalInvestment: '12000',
        fundingSource: '财政资金',
      },
      clearDownstream: false,
    });
    firstRouter.saveAnalysis({ projectId, markdown: '# 项目分析\n\n中文内容可正常保存。' });
    firstRouter.saveContentGenerationOptions({ projectId, contentGenerationOptions: { useAiImages: true, maxAiImages: 4, useMermaidImages: false, useTechnicalDiagrams: true } });

    const secondRouter = createFeasibilityReportStoreRouter({ app: testApp });
    const restored = secondRouter.loadState({ projectId });
    assert.equal(restored.step, 'analysis');
    assert.equal(restored.projectInfo.location, '中文路径测试区');
    assert.match(restored.analysisMarkdown, /中文内容可正常保存/);
    assert.deepEqual(restored.contentGenerationOptions, { useAiImages: true, maxAiImages: 4, useMermaidImages: false, useTechnicalDiagrams: true });

    const renamed = secondRouter.renameProject({ projectId, name: '重命名后的项目' });
    assert.equal(renamed.projects[0].name, '重命名后的项目');

    const projectPath = path.join(testRoot, 'feasibility-report-projects', projectId);
    assert.equal(fs.existsSync(path.join(projectPath, 'workspace', 'yibiao.sqlite')), true);
    const deleted = secondRouter.deleteProject({ projectId });
    assert.equal(deleted.projects.length, 0);
    assert.equal(fs.existsSync(projectPath), false);

    const sourceApp = createTestApp(path.join(testRoot, 'source-store'));
    const sourceDatabase = createSqliteDatabase(sourceApp);
    const sourceStore = createFeasibilityReportStore({ app: sourceApp, db: sourceDatabase.db });
    const imported = sourceStore.importSources([
      { id: 'source-1', fileName: '项目建议书.md', markdown: '# 项目建议书\n\n建设规模为 120 亩。', parserLabel: '本地解析' },
      { id: 'source-2', fileName: '立项批复.md', markdown: '# 立项批复\n\n同意开展前期工作。', parserLabel: '本地解析' },
    ]);
    assert.equal(imported.sourceFiles.length, 2);
    assert.match(sourceStore.readSourceMarkdown('source-1'), /建设规模为 120 亩/);
    assert.match(sourceStore.readCombinedSourceMarkdown(), /资料：项目建议书.md/);
    sourceStore.saveOutline({ outline: [{ id: 'chapter-1', title: '总论', description: '', children: [{ id: 'section-1', title: '项目概况', description: '' }] }] });
    sourceStore.saveGeneratedChapterContent({ nodeId: 'section-1', content: 'AI 生成正文。' });
    assert.equal(sourceStore.loadFeasibilityReport().contentSections['section-1'].status, 'success');
    assert.match(sourceStore.loadFeasibilityReport().outlineData.outline[0].children[0].content, /AI 生成正文/);
    sourceStore.saveChapterContent({ nodeId: 'section-1', content: '人工修订正文。' });
    assert.match(sourceStore.loadFeasibilityReport().outlineData.outline[0].children[0].content, /人工修订正文/);
    sourceStore.saveReviewedChapterContent({ nodeId: 'section-1', content: '自然化审校正文。' });
    assert.match(sourceStore.loadFeasibilityReport().outlineData.outline[0].children[0].content, /自然化审校正文/);
    sourceStore.saveContentSection({ nodeId: 'section-1', status: 'error', error: '验证失败状态' });
    assert.equal(sourceStore.loadFeasibilityReport().contentSections['section-1'].error, '验证失败状态');
    sourceStore.saveContentSection({ nodeId: 'section-1', status: 'running' });
    sourceStore.recoverInterruptedContentSections();
    assert.match(sourceStore.loadFeasibilityReport().contentSections['section-1'].error, /上次生成未完成/);
    const exportResult = await buildDocxResult({ documentProfile: 'feasibility-report', document_title: '可行性研究报告', project_name: '中文导出验证项目', construction_unit: '测试建设单位', outline: sourceStore.loadFeasibilityReport().outlineData.outline });
    const documentXml = new AdmZip(exportResult.buffer).readAsText('word/document.xml');
    assert.match(documentXml, /可行性研究报告/);
    assert.match(documentXml, /自然化审校正文/);
    sourceStore.saveAnalysis('# 已有资料分析');
    const assetDir = path.join(sourceApp.getPath('userData'), 'workspace', 'imported-images', 'feasibility-report-source-source-1');
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, 'image.txt'), 'test', 'utf-8');
    const afterRemove = sourceStore.removeSource('source-1');
    assert.equal(afterRemove.sourceFiles.length, 1);
    assert.equal(afterRemove.analysisMarkdown, '');
    assert.equal(fs.existsSync(assetDir), false);
    sourceDatabase.close();

    console.log('[feasibility-report] project CRUD, source persistence, content persistence, downstream invalidation, asset cleanup and restart recovery verified.');
    app.exit(0);
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    app.exit(1);
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

app.whenReady().then(run, (error) => {
  console.error(error?.stack || error?.message || String(error));
  app.exit(1);
});
