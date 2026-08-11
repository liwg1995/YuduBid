const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const { getCodeGenerationDir, getSoftwareCopyrightDir } = require('../utils/paths.cjs');
const { readSourceFile } = require('./softwareCopyrightCodePipeline.cjs');
const { detectProjectTechnologies } = require('./softwareProjectTechnologyDetector.cjs');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.vue', '.svelte', '.astro', '.py', '.java', '.kt', '.kts', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift', '.m', '.mm', '.php', '.rb', '.dart', '.lua', '.scala', '.sql', '.sh']);
const SKIP_DIRS = new Set(['.git', '.hg', '.svn', '.idea', '.vscode', 'node_modules', 'dist', 'build', 'release', 'coverage', 'archive', '软件著作权申请资料']);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'tsconfig.tsbuildinfo']);
const TARGET_LINES = 60 * 50;

const initialState = {
  project: null,
  analysis: null,
  selectedPaths: [],
  sortMode: 'smart',
  scannedAt: '',
  confirmed: false,
  confirmedAt: '',
  updated_at: '',
};

function now() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readText(filePath, limit) {
  const { text } = readSourceFile(filePath);
  return limit ? text.slice(0, limit) : text;
}

function rel(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isSkipped(filePath) {
  const parts = filePath.split(path.sep);
  if (parts.some((part) => SKIP_DIRS.has(part))) return true;
  const name = path.basename(filePath);
  if (SKIP_FILES.has(name)) return true;
  if (name.endsWith('.map') || name.endsWith('.min.js') || name.endsWith('.min.css')) return true;
  return false;
}

function walkFiles(root, results = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (isSkipped(filePath)) continue;
    if (entry.isDirectory()) {
      walkFiles(filePath, results);
    } else if (entry.isFile() && CODE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const stat = fs.statSync(filePath);
      if (stat.size > 0 && stat.size <= 900_000) {
        results.push({ filePath, size: stat.size });
      }
    }
  }
  return results;
}

function classifyFile(relativePath) {
  const r = relativePath.toLowerCase();
  const name = path.basename(r);
  if (['main.ts', 'main.tsx', 'main.js', 'main.jsx', 'app.tsx', 'app.vue', 'index.tsx', 'index.jsx'].includes(name)) return '入口';
  if (r.includes('/router') || r.includes('/routes') || name.includes('router') || name.includes('route')) return '路由';
  if (r.includes('/pages/') || r.includes('/views/') || r.includes('/screens/') || r.includes('/app/')) return '页面';
  if (r.includes('/services/') || r.includes('/api/') || r.includes('/ipc/') || r.includes('/handlers/')) return '业务服务';
  if (r.includes('/components/')) return '组件';
  if (r.includes('/store') || r.includes('/stores') || r.includes('/redux')) return '状态数据';
  if (r.includes('/utils/') || r.includes('/shared/') || r.includes('/hooks/')) return '通用能力';
  if (['.css', '.scss', '.less'].includes(path.extname(r))) return '样式';
  return '源码';
}

function categoryPriority(category) {
  const index = ['入口', '路由', '页面', '业务服务', '状态数据', '组件', '通用能力', '源码', '样式'].indexOf(category);
  return index >= 0 ? index : 99;
}

function analyzeProject(projectDir) {
  const files = walkFiles(projectDir).map((item) => {
    const relativePath = rel(item.filePath, projectDir);
    const text = readText(item.filePath, 400_000);
    const lineCount = text.split(/\r?\n/).length;
    return {
      path: relativePath,
      extension: path.extname(item.filePath).toLowerCase(),
      size: item.size,
      line_count: lineCount,
      category: classifyFile(relativePath),
    };
  });

  files.sort((a, b) => categoryPriority(a.category) - categoryPriority(b.category) || b.line_count - a.line_count);
  const technology = detectProjectTechnologies(projectDir, files);
  const packageJson = technology.packageJson;
  const lineCount = files.reduce((sum, item) => sum + item.line_count, 0);
  const languages = Array.from(new Set(files.map((item) => item.extension.replace('.', '')).filter(Boolean))).slice(0, 8);

  return {
    projectRoot: projectDir,
    projectName: path.basename(projectDir),
    packageName: packageJson.name || '',
    packageVersion: packageJson.version || '',
    frameworks: technology.frameworks,
    languages,
    fileCount: files.length,
    lineCount,
    candidates: files,
  };
}

function createDefaultSelectedPaths(analysis) {
  const selected = [];
  let lines = 0;
  for (const item of analysis.candidates || []) {
    if (item.category === '样式' && lines < TARGET_LINES) continue;
    selected.push(item.path);
    lines += item.line_count + 2;
    if (lines >= TARGET_LINES) break;
  }
  return selected.length ? selected : (analysis.candidates || []).slice(0, 20).map((item) => item.path);
}

function normalizeSelectedPaths(analysis, selectedPaths) {
  const available = new Set((analysis?.candidates || []).map((item) => item.path));
  return Array.from(new Set((Array.isArray(selectedPaths) ? selectedPaths : [])
    .map((item) => String(item || '').trim())
    .filter((item) => available.has(item))));
}

function orderSelectedPaths(analysis, selectedPaths, sortMode = 'smart') {
  const normalized = normalizeSelectedPaths(analysis, selectedPaths);
  if (sortMode === 'manual') return normalized;
  const selected = new Set(normalized);
  const candidates = (analysis?.candidates || []).filter((item) => selected.has(item.path));
  if (sortMode === 'path') {
    candidates.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  }
  return candidates.map((item) => item.path);
}

function selectionSummary(analysis, selectedPaths) {
  const byPath = new Map((analysis?.candidates || []).map((item) => [item.path, item]));
  const selectedFiles = (selectedPaths || []).map((filePath) => byPath.get(filePath)).filter(Boolean);
  const selectedLineCount = selectedFiles.reduce((sum, item) => sum + item.line_count + 2, 0);
  return {
    selectedCount: selectedFiles.length,
    selectedLineCount,
    estimatedPages: Math.ceil(selectedLineCount / 50),
    selectedFiles,
  };
}

function createCodeGenerationService({ app }) {
  const legacyRootDir = getCodeGenerationDir(app);
  const rootDir = path.join(getSoftwareCopyrightDir(app), 'code-generation');
  const statePath = path.join(rootDir, 'state.json');
  const legacyStatePath = path.join(legacyRootDir, 'state.json');
  const migrationMarkerPath = path.join(legacyRootDir, '.migrated-to-software-project');

  function migrateLegacyState() {
    if (fs.existsSync(statePath) || !fs.existsSync(legacyStatePath) || fs.existsSync(migrationMarkerPath)) return;
    ensureDir(rootDir);
    fs.copyFileSync(legacyStatePath, statePath);
    writeJson(migrationMarkerPath, { migratedAt: now(), target: statePath });
  }

  function loadState() {
    ensureDir(rootDir);
    migrateLegacyState();
    const saved = readJson(statePath, null);
    let next = { ...initialState, ...(saved || {}) };
    const projectDir = next.project?.path || next.analysis?.projectRoot;
    if (projectDir && fs.existsSync(projectDir) && next.analysis && !next.analysis.frameworks?.length) {
      const technology = detectProjectTechnologies(projectDir, next.analysis.candidates || []);
      if (technology.frameworks.length) {
        next = {
          ...next,
          analysis: {
            ...next.analysis,
            frameworks: technology.frameworks,
            packageName: next.analysis.packageName || technology.packageJson?.name || '',
            packageVersion: next.analysis.packageVersion || technology.packageJson?.version || '',
          },
          updated_at: now(),
        };
        writeJson(statePath, next);
      }
    }
    return {
      ...next,
      summary: selectionSummary(next.analysis, next.selectedPaths),
    };
  }

  function saveState(partial) {
    const previous = loadState();
    const next = {
      ...previous,
      ...partial,
      updated_at: now(),
    };
    delete next.summary;
    writeJson(statePath, next);
    return loadState();
  }

  return {
    loadState,
    async selectProject() {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择需要整理软著代码素材的项目目录' });
      if (result.canceled || !result.filePaths?.[0]) {
        return { success: false, message: '已取消选择', state: loadState() };
      }
      const projectDir = result.filePaths[0];
      const analysis = analyzeProject(projectDir);
      const selectedPaths = createDefaultSelectedPaths(analysis);
      const state = saveState({
        project: { path: projectDir, name: path.basename(projectDir) },
        analysis,
        selectedPaths,
        sortMode: 'smart',
        scannedAt: now(),
        confirmed: false,
        confirmedAt: '',
      });
      return { success: true, state };
    },
    updateSelection(payload = {}) {
      const current = loadState();
      const sortMode = ['smart', 'path', 'manual'].includes(payload.sortMode) ? payload.sortMode : current.sortMode;
      const requestedPaths = Array.isArray(payload.selectedPaths) ? payload.selectedPaths : current.selectedPaths;
      const selectedPaths = orderSelectedPaths(current.analysis, requestedPaths, sortMode);
      return saveState({ selectedPaths, sortMode, confirmed: false, confirmedAt: '' });
    },
    rescan() {
      const current = loadState();
      const projectDir = current.project?.path;
      if (!projectDir || !fs.existsSync(projectDir)) {
        throw new Error('当前项目目录不可用，请重新选择项目');
      }
      const analysis = analyzeProject(projectDir);
      const preserved = normalizeSelectedPaths(analysis, current.selectedPaths);
      const selectedPaths = orderSelectedPaths(
        analysis,
        preserved.length ? preserved : createDefaultSelectedPaths(analysis),
        current.sortMode,
      );
      return saveState({
        analysis,
        selectedPaths,
        scannedAt: now(),
        confirmed: false,
        confirmedAt: '',
      });
    },
    confirmSelection() {
      const current = loadState();
      if (!current.project || !current.analysis) {
        throw new Error('请先选择项目并扫描源码');
      }
      if (!current.selectedPaths?.length) {
        throw new Error('请至少选择一个源码文件');
      }
      return saveState({ confirmed: true, confirmedAt: now() });
    },
    clear() {
      const next = { ...initialState, updated_at: now() };
      writeJson(statePath, next);
      return { success: true, state: loadState() };
    },
    getConfirmedMaterials() {
      const state = loadState();
      if (!state.confirmed || !state.project || !state.analysis || !state.selectedPaths?.length) {
        return null;
      }
      return {
        project: state.project,
        analysis: state.analysis,
        selectedFiles: state.summary.selectedFiles,
        confirmedAt: state.confirmedAt,
        summary: state.summary,
      };
    },
  };
}

module.exports = {
  analyzeProject,
  createDefaultSelectedPaths,
  createCodeGenerationService,
  normalizeSelectedPaths,
  orderSelectedPaths,
  selectionSummary,
};
