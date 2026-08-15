const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const ipcTypePath = path.join(projectRoot, 'src', 'shared', 'types', 'ipc.ts');
const preloadPath = path.join(projectRoot, 'electron', 'preload.cjs');
const sharedRoot = path.join(projectRoot, 'src', 'shared');

function propertyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return node.getText().replace(/^['"]|['"]$/g, '');
}

function collectTypeLeaves(members, prefix = '', output = new Set()) {
  for (const member of members) {
    if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue;
    const name = propertyName(member.name);
    if (!name) continue;
    const currentPath = prefix ? `${prefix}.${name}` : name;
    if (ts.isPropertySignature(member) && member.type && ts.isTypeLiteralNode(member.type)) {
      collectTypeLeaves(member.type.members, currentPath, output);
    } else {
      output.add(currentPath);
    }
  }
  return output;
}

function collectObjectLeaves(objectLiteral, prefix = '', output = new Set()) {
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      throw new Error(`preload bridge 不允许使用无法静态校验的展开属性：${property.getText()}`);
    }
    const name = propertyName(property.name);
    if (!name) continue;
    const currentPath = prefix ? `${prefix}.${name}` : name;
    if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
      collectObjectLeaves(property.initializer, currentPath, output);
    } else {
      output.add(currentPath);
    }
  }
  return output;
}

function findBridgeInterface(sourceFile) {
  return sourceFile.statements.find((statement) => (
    ts.isInterfaceDeclaration(statement) && statement.name.text === 'YuDuBidBridge'
  ));
}

function findRuntimeBridge(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)
        && declaration.name.text === 'bridge'
        && declaration.initializer
        && ts.isObjectLiteralExpression(declaration.initializer)) {
        return declaration.initializer;
      }
    }
  }
  return null;
}

function difference(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const ipcSource = ts.createSourceFile(
  ipcTypePath,
  fs.readFileSync(ipcTypePath, 'utf-8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const preloadSource = ts.createSourceFile(
  preloadPath,
  fs.readFileSync(preloadPath, 'utf-8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const bridgeInterface = findBridgeInterface(ipcSource);
const runtimeBridge = findRuntimeBridge(preloadSource);

if (!bridgeInterface) throw new Error('未找到 YuDuBidBridge 接口');
if (!runtimeBridge) throw new Error('未找到 preload bridge 对象');

const typeLeaves = collectTypeLeaves(bridgeInterface.members);
const runtimeLeaves = collectObjectLeaves(runtimeBridge);
const missingAtRuntime = difference(typeLeaves, runtimeLeaves);
const missingInTypes = difference(runtimeLeaves, typeLeaves);

if (missingAtRuntime.length || missingInTypes.length) {
  throw new Error([
    'IPC Bridge 契约不一致。',
    missingAtRuntime.length ? `preload 缺少：${missingAtRuntime.join(', ')}` : '',
    missingInTypes.length ? `类型缺少：${missingInTypes.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
}

const sharedFeatureImports = [];
for (const filePath of listSourceFiles(sharedRoot)) {
  const source = fs.readFileSync(filePath, 'utf-8');
  if (/from\s+['"][^'"]*features\//.test(source)) {
    sharedFeatureImports.push(path.relative(projectRoot, filePath));
  }
}

if (sharedFeatureImports.length) {
  throw new Error(`shared 层不允许反向依赖 feature：${sharedFeatureImports.join(', ')}`);
}

console.log(`IPC contract verification passed (${runtimeLeaves.size} bridge methods/properties)`);
