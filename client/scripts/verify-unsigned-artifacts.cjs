const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const clientDir = path.resolve(__dirname, '..');
const releaseDir = path.join(clientDir, 'release');
const packageJson = JSON.parse(fs.readFileSync(path.join(clientDir, 'package.json'), 'utf-8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPeSignature(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert(buffer.length > 256 && buffer.toString('ascii', 0, 2) === 'MZ', `不是有效的 PE 文件：${filePath}`);
  const peOffset = buffer.readUInt32LE(0x3c);
  assert(buffer.toString('ascii', peOffset, peOffset + 4) === 'PE\0\0', `PE 头无效：${filePath}`);
  const optionalOffset = peOffset + 24;
  const magic = buffer.readUInt16LE(optionalOffset);
  const dataDirectoryOffset = optionalOffset + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0);
  assert(dataDirectoryOffset > optionalOffset, `无法识别 PE 可选头：${filePath}`);
  const certificateDirectoryOffset = dataDirectoryOffset + 4 * 8;
  return {
    filePath,
    format: magic === 0x20b ? 'PE32+' : 'PE32',
    certificateOffset: buffer.readUInt32LE(certificateDirectoryOffset),
    certificateSize: buffer.readUInt32LE(certificateDirectoryOffset + 4),
  };
}

function verifyWindowsUnsigned() {
  const candidates = [
    path.join(releaseDir, 'win-unpacked', `${packageJson.build.productName}.exe`),
    path.join(releaseDir, `YuDuBid-${packageJson.version}-win-x64.exe`),
  ].filter((filePath) => fs.existsSync(filePath));
  assert(candidates.length, '未找到 Windows 主程序或安装包');
  return candidates.map((filePath) => {
    const result = readPeSignature(filePath);
    assert(result.certificateOffset === 0 && result.certificateSize === 0, `Windows 产物包含证书签名：${filePath}`);
    return result;
  });
}

function verifyMacUnsigned() {
  const appPath = path.join(releaseDir, 'mac-arm64', `${packageJson.build.productName}.app`);
  if (!fs.existsSync(appPath)) return null;

  const verification = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { encoding: 'utf-8' });
  assert(verification.status !== 0, 'macOS 应用存在有效的完整代码签名');
  const details = spawnSync('/usr/bin/codesign', ['-dvvv', appPath], { encoding: 'utf-8' });
  const detailText = `${details.stdout || ''}\n${details.stderr || ''}`;
  assert(!/^Authority=/m.test(detailText), 'macOS 应用包含证书签名 Authority');
  assert(!/^TeamIdentifier=(?!not set)/m.test(detailText), 'macOS 应用包含签名团队标识');
  return {
    appPath,
    strictVerificationPassed: false,
    certificateAuthority: null,
    teamIdentifier: null,
    linkerAdhocSignature: /Signature=adhoc/.test(detailText),
  };
}

function main() {
  assert(packageJson.build?.forceCodeSigning === false, 'forceCodeSigning 必须明确为 false');
  assert(packageJson.build?.mac?.identity === null, 'mac.identity 必须为 null');
  assert(packageJson.build?.win?.signExecutable === false, 'win.signExecutable 必须为 false');
  assert(!packageJson.build?.win?.signtoolOptions, '未签名版本不应配置 signtoolOptions');
  assert(!packageJson.build?.win?.azureSignOptions, '未签名版本不应配置 azureSignOptions');

  const result = {
    success: true,
    product: packageJson.build.productName,
    version: packageJson.version,
    mode: 'unsigned',
    mac: verifyMacUnsigned(),
    windows: verifyWindowsUnsigned(),
    verifiedAt: new Date().toISOString(),
  };
  console.log('[unsigned-artifact-verify] passed');
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error('[unsigned-artifact-verify] failed');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
