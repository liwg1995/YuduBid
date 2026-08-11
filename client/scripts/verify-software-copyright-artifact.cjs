const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const AdmZip = require('adm-zip');

const clientDir = path.resolve(__dirname, '..');
const releaseDir = path.join(clientDir, 'release');
const packageJson = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf-8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findFirst(rootDir, matcher) {
  if (!fs.existsSync(rootDir)) return null;
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (matcher(target, entry)) return target;
      if (entry.isDirectory() && !entry.isSymbolicLink()) queue.push(target);
    }
  }
  return null;
}

function detectArtifact() {
  const macApp = findFirst(releaseDir, (target, entry) => entry.isDirectory() && target.endsWith('.app'));
  if (macApp) return macApp;
  const windowsApp = findFirst(releaseDir, (target, entry) => entry.isDirectory() && entry.name === 'win-unpacked');
  if (windowsApp) return windowsApp;
  throw new Error('未找到可验收的 .app 或 win-unpacked 目录，请先完成目录打包');
}

function resolveArtifact(inputPath) {
  const artifactPath = path.resolve(clientDir, inputPath || detectArtifact());
  assert(fs.existsSync(artifactPath), `发布产物不存在：${artifactPath}`);

  if (artifactPath.endsWith('.app')) {
    return {
      artifactPath,
      platform: 'mac',
      resourcesDir: path.join(artifactPath, 'Contents', 'Resources'),
      executableDir: path.join(artifactPath, 'Contents', 'MacOS'),
      infoPath: path.join(artifactPath, 'Contents', 'Info.plist'),
    };
  }

  const resourcesDir = path.basename(artifactPath) === 'resources'
    ? artifactPath
    : path.join(artifactPath, 'resources');
  return {
    artifactPath,
    platform: 'win',
    resourcesDir,
    executableDir: artifactPath,
    infoPath: null,
  };
}

function verifyArtifact(inputPath) {
  const artifact = resolveArtifact(inputPath);
  const archivePath = path.join(artifact.resourcesDir, 'app.asar');
  const unpackedDir = path.join(artifact.resourcesDir, 'app.asar.unpacked');
  assert(fs.existsSync(archivePath), `产物缺少 app.asar：${archivePath}`);
  assert(fs.statSync(archivePath).size > 0, 'app.asar 为空');

  const entries = new Set(asar.listPackage(archivePath).map((entry) => entry.replace(/^\//, '')));
  const requiredEntries = [
    'package.json',
    'dist/index.html',
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/ipc/softwareCopyrightIpc.cjs',
    'electron/services/softwareCopyrightService.cjs',
    'electron/services/softwareCopyrightCaseStore.cjs',
    'electron/services/softwareCopyrightCodePipeline.cjs',
    'electron/services/softwareCopyrightDraftHistory.cjs',
    'electron/utils/safeImageDimensions.cjs',
    'vendor/safe-image-size/index.cjs',
  ];
  const missingEntries = requiredEntries.filter((entry) => !entries.has(entry));
  assert(!missingEntries.length, `app.asar 缺少核心文件：${missingEntries.join('、')}`);

  const packagedPackage = JSON.parse(asar.extractFile(archivePath, 'package.json').toString('utf-8'));
  assert(packagedPackage.version === packageJson.version, `产物版本 ${packagedPackage.version} 与源码版本 ${packageJson.version} 不一致`);
  assert(packagedPackage.main === packageJson.main, '产物主进程入口与源码配置不一致');

  const nativeModule = findFirst(unpackedDir, (target, entry) => entry.isFile() && entry.name === 'better_sqlite3.node');
  assert(nativeModule, '产物缺少 better-sqlite3 原生模块');

  let executablePath;
  let architecture = 'unknown';
  const distributables = [];
  if (artifact.platform === 'mac') {
    executablePath = findFirst(artifact.executableDir, (_target, entry) => entry.isFile());
    assert(executablePath, 'macOS 产物缺少主可执行文件');
    const fileOutput = execFileSync('file', [executablePath], { encoding: 'utf-8' }).trim();
    architecture = fileOutput.includes('arm64') ? 'arm64' : fileOutput.includes('x86_64') ? 'x64' : 'unknown';
    assert(architecture !== 'unknown', `无法识别 macOS 可执行文件架构：${fileOutput}`);

    const info = fs.readFileSync(artifact.infoPath, 'utf-8');
    assert(info.includes(`<string>${packageJson.version}</string>`), 'Info.plist 未包含当前应用版本');
  } else {
    const expectedExecutable = path.join(artifact.executableDir, `${packageJson.build.productName}.exe`);
    executablePath = fs.existsSync(expectedExecutable)
      ? expectedExecutable
      : findFirst(artifact.executableDir, (target, entry) => entry.isFile() && target.toLowerCase().endsWith('.exe'));
    assert(executablePath, 'Windows 产物缺少主可执行文件');
    const fileOutput = execFileSync('file', [executablePath], { encoding: 'utf-8' }).trim();
    architecture = /x86-64|x86_64/i.test(fileOutput) ? 'x64' : 'unknown';
    assert(architecture === 'x64', `Windows 可执行文件不是 x64 架构：${fileOutput}`);

    const baseName = `YuDuBid-${packageJson.version}-win-x64`;
    const zipPath = path.join(releaseDir, `${baseName}.zip`);
    const installerPath = path.join(releaseDir, `${baseName}.exe`);
    const blockMapPath = `${installerPath}.blockmap`;

    if (fs.existsSync(zipPath)) {
      const zipEntries = new Set(new AdmZip(zipPath).getEntries().map((entry) => entry.entryName.replace(/\\/g, '/')));
      assert(zipEntries.has(`${packageJson.build.productName}.exe`), 'Windows ZIP 缺少应用主程序');
      assert(zipEntries.has('resources/app.asar'), 'Windows ZIP 缺少 resources/app.asar');
      distributables.push({ type: 'zip', path: zipPath, size: fs.statSync(zipPath).size, sha256: sha256(zipPath) });
    }

    if (fs.existsSync(installerPath)) {
      assert(fs.statSync(installerPath).size > 1024 * 1024, 'Windows NSIS 安装包大小异常');
      const installerInfo = execFileSync('file', [installerPath], { encoding: 'utf-8' }).trim();
      assert(/PE32.*Nullsoft Installer/i.test(installerInfo), `Windows 安装包不是有效的 NSIS 自解压程序：${installerInfo}`);
      assert(fs.existsSync(blockMapPath), 'Windows NSIS 安装包缺少 blockmap');
      distributables.push({ type: 'nsis', path: installerPath, size: fs.statSync(installerPath).size, sha256: sha256(installerPath) });
      distributables.push({ type: 'blockmap', path: blockMapPath, size: fs.statSync(blockMapPath).size, sha256: sha256(blockMapPath) });
    }
  }

  return {
    success: true,
    product: packageJson.build.productName,
    version: packageJson.version,
    platform: artifact.platform,
    architecture,
    artifactPath: artifact.artifactPath,
    archiveSize: fs.statSync(archivePath).size,
    archiveEntryCount: entries.size,
    nativeModule,
    executablePath,
    distributables,
    verifiedAt: new Date().toISOString(),
  };
}

try {
  const result = verifyArtifact(process.argv[2]);
  console.log('[software-copyright-artifact-verify] passed');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('[software-copyright-artifact-verify] failed');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
