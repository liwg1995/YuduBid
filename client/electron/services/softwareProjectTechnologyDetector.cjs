const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set(['.git', '.hg', '.svn', '.idea', '.vscode', '.venv', 'venv', 'node_modules', 'vendor', 'dist', 'build', 'release', 'coverage', 'archive', '软件著作权申请资料']);
const MAX_SCAN_DEPTH = 4;
const MAX_MANIFESTS = 40;

function isTechnologyManifest(name) {
  const lower = name.toLowerCase();
  return lower === 'package.json'
    || /^requirements(?:[-_.].*)?\.txt$/u.test(lower)
    || ['pyproject.toml', 'pipfile', 'poetry.lock', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'cargo.toml', 'go.mod', 'tauri.conf.json'].includes(lower)
    || lower.endsWith('.csproj');
}

function findTechnologyManifests(root, current = root, depth = 0, results = []) {
  if (depth > MAX_SCAN_DEPTH || results.length >= MAX_MANIFESTS) return results;
  let entries = [];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (results.length >= MAX_MANIFESTS) break;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const filePath = path.join(current, entry.name);
    if (entry.isDirectory()) findTechnologyManifests(root, filePath, depth + 1, results);
    else if (entry.isFile() && isTechnologyManifest(entry.name)) results.push(filePath);
  }
  return results;
}

function readManifestText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8').slice(0, 500_000);
  } catch {
    return '';
  }
}

function readPackageJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function detectProjectTechnologies(projectDir, sourceFiles = []) {
  const manifests = findTechnologyManifests(projectDir)
    .sort((left, right) => left.split(path.sep).length - right.split(path.sep).length || left.localeCompare(right));
  const packagePaths = manifests.filter((filePath) => path.basename(filePath).toLowerCase() === 'package.json');
  const packages = packagePaths.map(readPackageJson);
  const primaryPackage = packages[0] || {};
  const dependencies = new Set();
  for (const packageJson of packages) {
    for (const name of Object.keys({
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
      ...(packageJson.peerDependencies || {}),
    })) dependencies.add(name.toLowerCase());
  }

  const manifestEvidence = manifests.map(readManifestText).join('\n').toLowerCase();
  const paths = sourceFiles.map((item) => String(item?.path || item || '').toLowerCase());
  const hasDependency = (...patterns) => Array.from(dependencies).some((name) => patterns.some((pattern) => pattern.test(name)));
  const hasEvidence = (...patterns) => patterns.some((pattern) => pattern.test(manifestEvidence));
  const hasPath = (...patterns) => paths.some((filePath) => patterns.some((pattern) => pattern.test(filePath)));
  const frameworks = [];
  const add = (label, matched) => {
    if (matched && !frameworks.includes(label)) frameworks.push(label);
  };

  add('React', hasDependency(/^react$/u, /^react-dom$/u, /^@types\/react$/u) || hasPath(/\.tsx$/u));
  add('Vue', hasDependency(/^vue$/u, /^@vue\//u) || hasPath(/\.vue$/u));
  add('Vite', hasDependency(/^vite$/u, /^@vitejs\//u) || hasPath(/(^|\/)vite\.config\./u));
  add('Electron', hasDependency(/^electron$/u, /^electron-/u) || hasPath(/(^|\/)electron\//u, /electron\.(?:c?js|mjs|ts)$/u));
  add('Next.js', hasDependency(/^next$/u) || hasPath(/(^|\/)next\.config\./u));
  add('TypeScript', hasDependency(/^typescript$/u) || hasPath(/\.tsx?$/u));
  add('Angular', hasDependency(/^@angular\//u) || hasPath(/(^|\/)angular\.json$/u));
  add('Svelte', hasDependency(/^svelte$/u, /^@sveltejs\//u) || hasPath(/\.svelte$/u));
  add('Astro', hasDependency(/^astro$/u) || hasPath(/\.astro$/u));
  add('Express', hasDependency(/^express$/u));
  add('NestJS', hasDependency(/^@nestjs\//u));
  add('FastAPI', hasEvidence(/(^|[^a-z])fastapi([^a-z]|$)/u));
  add('SQLAlchemy', hasEvidence(/(^|[^a-z])sqlalchemy([^a-z]|$)/u));
  add('Pydantic', hasEvidence(/(^|[^a-z])pydantic([^a-z]|$)/u));
  add('Django', hasEvidence(/(^|[^a-z])django([^a-z]|$)/u) || hasPath(/(^|\/)manage\.py$/u));
  add('Flask', hasEvidence(/(^|[^a-z])flask([^a-z]|$)/u));
  add('Spring Boot', hasEvidence(/spring-boot/u));
  add('Tauri', hasDependency(/^@tauri-app\//u) || hasEvidence(/(^|[^a-z])tauri([^a-z]|$)/u));
  add('.NET', manifests.some((filePath) => filePath.toLowerCase().endsWith('.csproj')));

  return {
    packageJson: primaryPackage,
    packagePaths,
    manifestPaths: manifests,
    frameworks,
  };
}

module.exports = {
  detectProjectTechnologies,
  findTechnologyManifests,
};
