const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeProject,
  createCodeGenerationService,
  createDefaultSelectedPaths,
  orderSelectedPaths,
  selectionSummary,
} = require('../electron/services/codeGenerationService.cjs');
const { getCodeGenerationDir, getSoftwareCopyrightDir } = require('../electron/utils/paths.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeSource(projectDir, relativePath, lines) {
  const filePath = path.join(projectDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Array.from({ length: lines }, (_, index) => `export const line${index + 1} = ${index + 1};`).join('\n'), 'utf-8');
}

function createTempApp(userData) {
  return {
    getPath(name) {
      if (name !== 'userData') throw new Error(`不支持的 app 路径：${name}`);
      return userData;
    },
  };
}

function writeState(app, projectDir, analysis, selectedPaths) {
  const stateDir = getCodeGenerationDir(app);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
    project: { path: projectDir, name: path.basename(projectDir) },
    analysis,
    selectedPaths,
    sortMode: 'manual',
    scannedAt: '2026-01-01T00:00:00.000Z',
    confirmed: true,
    confirmedAt: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }, null, 2), 'utf-8');
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-code-generation-'));
  const userData = path.join(root, 'user-data');
  const projectDir = path.join(root, '示例项目');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    name: 'code-generation-verify',
    version: '1.0.0',
    dependencies: { react: '^19.0.0' },
    devDependencies: { typescript: '^5.0.0' },
  }), 'utf-8');
  writeSource(projectDir, 'src/main.ts', 80);
  writeSource(projectDir, 'src/pages/Home.ts', 120);
  writeSource(projectDir, 'src/services/projectService.ts', 90);
  writeSource(projectDir, 'src/components/Panel.ts', 60);
  writeSource(projectDir, 'src/styles/app.css', 40);

  const analysis = analyzeProject(projectDir);
  assert(analysis.fileCount === 5, `扫描文件数量错误：${analysis.fileCount}`);
  assert(analysis.frameworks.includes('React') && analysis.frameworks.includes('TypeScript'), '未识别项目技术栈');
  assert(analysis.candidates[0].path === 'src/main.ts', '入口优先排序未将 main.ts 放在首位');

  const requested = ['src/components/Panel.ts', 'src/main.ts', 'src/pages/Home.ts'];
  const smart = orderSelectedPaths(analysis, requested, 'smart');
  const byPath = orderSelectedPaths(analysis, requested, 'path');
  const manual = orderSelectedPaths(analysis, requested, 'manual');
  assert(smart[0] === 'src/main.ts', '入口优先排序错误');
  assert(byPath.join('|') === [...requested].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('|'), '路径排序错误');
  assert(manual.join('|') === requested.join('|'), '手动排序未保留用户顺序');

  const summary = selectionSummary(analysis, manual);
  assert(summary.selectedFiles.map((item) => item.path).join('|') === requested.join('|'), '素材摘要未保留文件顺序');
  assert(summary.selectedLineCount === 266, `素材行数统计错误：${summary.selectedLineCount}`);
  assert(createDefaultSelectedPaths(analysis)[0] === 'src/main.ts', '默认选择未遵循入口优先顺序');

  const app = createTempApp(userData);
  writeState(app, projectDir, analysis, requested);
  fs.unlinkSync(path.join(projectDir, 'src/components/Panel.ts'));
  writeSource(projectDir, 'src/pages/Detail.ts', 70);

  const service = createCodeGenerationService({ app });
  const rescanned = service.rescan();
  const scopedStatePath = path.join(getSoftwareCopyrightDir(app), 'code-generation', 'state.json');
  assert(fs.existsSync(scopedStatePath), '旧版全局源码准备状态未迁移到当前软著项目工作区');
  assert(fs.existsSync(path.join(getCodeGenerationDir(app), '.migrated-to-software-project')), '旧版源码准备迁移未写入一次性标记');
  assert(!rescanned.confirmed && !rescanned.confirmedAt, '重新扫描后未清除旧确认状态');
  assert(!rescanned.selectedPaths.includes('src/components/Panel.ts'), '重新扫描后仍保留已删除文件');
  assert(!rescanned.selectedPaths.includes('src/pages/Detail.ts'), '重新扫描不应自动纳入新增文件');
  assert(rescanned.selectedPaths.join('|') === 'src/main.ts|src/pages/Home.ts', '重新扫描未保留有效文件的手动顺序');
  assert(rescanned.analysis.candidates.some((item) => item.path === 'src/pages/Detail.ts'), '重新扫描未发现新增文件');

  console.log(JSON.stringify({
    success: true,
    scannedFiles: rescanned.analysis.fileCount,
    preservedPaths: rescanned.selectedPaths,
    sortMode: rescanned.sortMode,
    scannedAt: rescanned.scannedAt,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
