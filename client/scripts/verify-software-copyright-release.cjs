const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const clientDir = path.resolve(__dirname, '..');
const packagePath = path.join(clientDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
const startedAt = new Date().toISOString();
const checks = [];

function record(name, detail) {
  checks.push({ name, status: 'pass', detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(relativePath) {
  execFileSync(process.execPath, [relativePath], { cwd: clientDir, stdio: 'inherit' });
}

function checkNodeSyntax(relativePath) {
  execFileSync(process.execPath, ['--check', relativePath], { cwd: clientDir, stdio: 'inherit' });
}

function runNpm(script) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, ['run', script], { cwd: clientDir, stdio: 'inherit' });
}

function main() {
  const requiredFiles = [
    'electron/services/softwareCopyrightService.cjs',
    'electron/services/softwareCopyrightCaseStore.cjs',
    'electron/services/softwareCopyrightCodePipeline.cjs',
    'electron/services/softwareCopyrightDraftHistory.cjs',
    'electron/ipc/softwareCopyrightIpc.cjs',
    'electron/preload.cjs',
    'src/features/software-copyright/pages/SoftwareCopyrightPage.tsx',
    'src/features/software-copyright/components/SubmissionAssistant.tsx',
    'doc/软著模块操作指南.md',
    'doc/软著模块发布候选版验收清单.md',
    'scripts/verify-software-copyright-artifact.cjs',
    'scripts/verify-document-security.cjs',
    'electron/utils/safeImageDimensions.cjs',
    'vendor/safe-image-size/index.cjs',
    'scripts/verify-unsigned-artifacts.cjs',
    'scripts/verify-windows-release.ps1',
    'doc/双平台未签名发布验收指南.md',
    'assets/icon.ico',
    'assets/icon.icns',
  ];
  const missingFiles = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(clientDir, relativePath)));
  assert(!missingFiles.length, `发布所需文件缺失：${missingFiles.join('、')}`);
  record('发布文件', `${requiredFiles.length} 个核心文件已就绪`);

  assert(packageJson.build?.asar === true, 'Electron 打包未启用 asar');
  assert(packageJson.build?.files?.includes('electron/**/*') && packageJson.build?.files?.includes('dist/**/*'), 'Electron 打包文件范围不完整');
  assert(packageJson.build?.files?.includes('vendor/**/*'), 'Electron 打包未包含本地安全依赖');
  assert(packageJson.dependencies?.['adm-zip'], '软著 ZIP 交付依赖未声明');
  assert(packageJson.scripts?.['verify:software-copyright:artifact'], '发布产物检查命令未声明');
  assert(packageJson.build?.mac?.identity === null, '当前未签名版应明确设置 mac.identity = null');
  assert(packageJson.build?.forceCodeSigning === false, '当前未签名版应明确设置 forceCodeSigning = false');
  assert(packageJson.build?.win?.signExecutable === false, '当前未签名版应明确设置 win.signExecutable = false');
  assert(!packageJson.build?.win?.signtoolOptions && !packageJson.build?.win?.azureSignOptions, '当前未签名版不应配置 Windows 签名服务');
  record('打包配置', `${packageJson.build.productName} ${packageJson.version}`);

  const preload = fs.readFileSync(path.join(clientDir, 'electron/preload.cjs'), 'utf-8');
  const ipc = fs.readFileSync(path.join(clientDir, 'electron/ipc/softwareCopyrightIpc.cjs'), 'utf-8');
  for (const channel of [
    'get-submission-review',
    'generate-submission-guide',
    'list-export-batches',
    'open-export-batch',
  ]) {
    assert(ipc.includes(`software-copyright:${channel}`), `IPC 通道未注册：${channel}`);
  }
  for (const method of ['getSubmissionReview', 'generateSubmissionGuide', 'listExportBatches', 'openExportBatch']) {
    assert(preload.includes(method), `preload 方法未暴露：${method}`);
  }
  record('IPC 与 preload', '提交辅助和交付批次通道已对齐');

  checkNodeSyntax('electron/services/softwareCopyrightService.cjs');
  checkNodeSyntax('electron/ipc/softwareCopyrightIpc.cjs');
  checkNodeSyntax('electron/preload.cjs');
  record('Electron 语法', 'Main、IPC 和 preload 检查通过');

  runNode('scripts/verify-code-generation.cjs');
  record('代码生成联动', '源码素材链路检查通过');
  runNode('scripts/verify-software-copyright.cjs');
  record('软著端到端', '迁移、生成、确认、导出和申报检查通过');
  runNode('scripts/verify-document-security.cjs');
  record('文档安全依赖', 'PDF.js、图片格式限制和 PPTX 导出检查通过');
  runNpm('build');
  record('生产构建', 'TypeScript 和 Vite 构建通过');

  const result = {
    success: true,
    product: packageJson.build.productName,
    version: packageJson.version,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
  };
  console.log('[software-copyright-release-verify] passed');
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error('[software-copyright-release-verify] failed');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
