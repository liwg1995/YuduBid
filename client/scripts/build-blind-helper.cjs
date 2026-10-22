const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const client = path.resolve(__dirname, '..');
const host = `${process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'win' : 'linux'}-${process.arch}`;
const rids = process.argv.slice(2).length ? process.argv.slice(2) : [host];
for (const rid of rids) {
  if (!['win-x64', 'win-arm64', 'osx-x64', 'osx-arm64', 'linux-x64', 'linux-arm64'].includes(rid)) throw new Error('不支持的引擎构建目标');
  const output = path.join(client, 'vendor', 'openxmlhelper', rid);
  fs.mkdirSync(output, { recursive: true });
  const result = spawnSync(process.env.YIBIAO_DOTNET || 'dotnet', ['publish', path.join(client, '..', 'openxmlhelper', 'src', 'OpenXmlHelper', 'OpenXmlHelper.csproj'), '-c', 'Release', '-r', rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:DebugType=none', '-o', output], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
