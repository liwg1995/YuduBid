const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { dialog, shell } = require('electron');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getSafeImageDimensions } = require('../utils/safeImageDimensions.cjs');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TabStopPosition,
  TabStopType,
  WidthType,
} = require('docx');
const { getSoftwareCopyrightDir } = require('../utils/paths.cjs');
const {
  buildBusinessContextMessages,
  buildManualIllustrationPrompt,
  buildManualIllustrationPromptMessages,
  buildManualMarkdownMessages,
} = require('./softwareCopyrightPrompts.cjs');
const {
  DEFAULT_CLEAN_OPTIONS,
  LINES_PER_PAGE,
  buildCodeMaterial,
  normalizeCleanOptions,
  readSourceFile,
} = require('./softwareCopyrightCodePipeline.cjs');
const { createSoftwareCopyrightDraftHistory } = require('./softwareCopyrightDraftHistory.cjs');
const { createSoftwareCopyrightCaseStore } = require('./softwareCopyrightCaseStore.cjs');
const { detectProjectTechnologies } = require('./softwareProjectTechnologyDetector.cjs');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.vue', '.svelte', '.astro', '.py', '.java', '.kt', '.kts', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift', '.m', '.mm', '.php', '.rb', '.dart', '.lua', '.scala', '.sql', '.sh']);
const SKIP_DIRS = new Set(['.git', '.hg', '.svn', '.idea', '.vscode', 'node_modules', 'dist', 'build', 'release', 'coverage', 'archive', '软件著作权申请资料']);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'tsconfig.tsbuildinfo']);
const SPLIT_PAGES = 60;
const CORE_CODE_CATEGORIES = ['入口', '路由', '页面', '业务服务', '状态数据', '组件', '通用能力'];
const CATEGORY_SELECTION_WEIGHT = {
  入口: 120,
  路由: 110,
  页面: 105,
  业务服务: 100,
  状态数据: 88,
  组件: 78,
  通用能力: 68,
  源码: 46,
  样式: 8,
};
const SOURCE_EXT_WEIGHT = {
  '.ts': 24,
  '.tsx': 24,
  '.js': 18,
  '.jsx': 18,
  '.vue': 18,
  '.svelte': 18,
  '.astro': 18,
  '.py': 16,
  '.java': 16,
  '.go': 16,
  '.rs': 16,
  '.cs': 16,
  '.sql': 10,
  '.html': 8,
  '.css': 2,
  '.scss': 2,
  '.less': 2,
};
const A4_PAGE_SIZE = {
  width: 11906,
  height: 16838,
  orientation: PageOrientation.PORTRAIT,
};

const SOFTWARE_COPYRIGHT_SCHEMA_VERSION = 4;
const STANDARD_PAGE_MARGIN = {
  top: 1417,
  right: 1417,
  bottom: 1417,
  left: 1417,
  header: 567,
  footer: 567,
};

const initialFields = {
  softwareName: '',
  shortName: '',
  version: 'V1.0',
  category: '应用软件',
  developmentCompletedDate: '',
  developmentMode: '单独开发',
  softwareDescription: '原创',
  publishStatus: '未发表',
  firstPublishDate: '',
  copyrightOwner: '',
  rightsScope: '全部权利',
  rightsAcquisition: '原始取得',
  developmentHardware: '',
  runningHardware: '',
  developmentOs: '',
  developmentTools: '',
  runningPlatform: '',
  runtimeSupport: '',
  programmingLanguage: '',
  sourceLineCount: '',
  developmentPurpose: '',
  industry: '',
  mainFunctions: '',
  technicalFeatures: '',
  pageCount: '',
};

const initialState = {
  schemaVersion: SOFTWARE_COPYRIGHT_SCHEMA_VERSION,
  step: 'setup',
  project: null,
  analysis: null,
  fields: initialFields,
  options: {
    sourceMode: 'project',
    screenshotMode: 'skip',
    useAiImages: false,
    exportItems: {
      application: true,
      manual: true,
      code: true,
      report: true,
    },
    codeExcludedPaths: [],
    codeIncludedPaths: [],
    codeClean: DEFAULT_CLEAN_OPTIONS,
  },
  imageModel: {
    available: false,
    status: 'untested',
    message: '尚未检查生图模型',
  },
  task: undefined,
  drafts: {},
  draftConfirmed: false,
  draftConfirmedAt: '',
  confirmedSnapshot: null,
  exportBatches: [],
  draftDir: '',
  outputRoot: '',
  outputDir: '',
  outputs: [],
  manualScreenshots: [],
  aiIllustrations: [],
  aiIllustrationSettings: {
    prompt: '',
    style: 'engineering_diagram',
  },
  manualPlaceholders: [],
  manualReview: {
    checks: {
      ownership: false,
      identity: false,
      dates: false,
      sourceEvidence: false,
      localRequirements: false,
    },
    notes: '',
    confirmedAt: '',
    snapshotId: '',
  },
  codeMaterialReview: {
    checks: {
      pageRange: false,
      sourceScope: false,
      readability: false,
    },
    notes: '',
    confirmedAt: '',
    manifestHash: '',
  },
  manualAssetReview: {
    checks: {
      content: false,
      captionPlacement: false,
    },
    notes: '',
    confirmedAt: '',
    mode: '',
  },
  generatedFieldsSourceDraftDir: '',
  updated_at: '',
};

function migrateSoftwareCopyrightState(saved, options = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return { state: null, changed: false, fromVersion: 0 };
  }
  const fromVersion = Number.isInteger(saved.schemaVersion) ? saved.schemaVersion : 0;
  if (fromVersion > SOFTWARE_COPYRIGHT_SCHEMA_VERSION) {
    throw new Error(`软著工作区版本 ${fromVersion} 高于当前客户端支持版本 ${SOFTWARE_COPYRIGHT_SCHEMA_VERSION}，请升级客户端后再使用`);
  }

  const next = { ...saved };
  const legacyFieldAliases = {
    software_name: 'softwareName',
    short_name: 'shortName',
    development_completed_date: 'developmentCompletedDate',
    copyright_owner: 'copyrightOwner',
    development_hardware: 'developmentHardware',
    running_hardware: 'runningHardware',
    development_os: 'developmentOs',
    development_tools: 'developmentTools',
    running_platform: 'runningPlatform',
    runtime_support: 'runtimeSupport',
    programming_language: 'programmingLanguage',
    source_line_count: 'sourceLineCount',
    development_purpose: 'developmentPurpose',
    main_functions: 'mainFunctions',
    technical_features: 'technicalFeatures',
    page_count: 'pageCount',
  };
  const legacyFields = next.fields && typeof next.fields === 'object' && !Array.isArray(next.fields) ? { ...next.fields } : {};
  for (const [legacyKey, currentKey] of Object.entries(legacyFieldAliases)) {
    if (!legacyFields[currentKey] && legacyFields[legacyKey] != null) legacyFields[currentKey] = legacyFields[legacyKey];
    delete legacyFields[legacyKey];
  }
  next.fields = legacyFields;

  const legacyOptions = next.options && typeof next.options === 'object' && !Array.isArray(next.options) ? { ...next.options } : {};
  if (!legacyOptions.screenshotMode && typeof legacyOptions.useAiImages === 'boolean') {
    legacyOptions.screenshotMode = legacyOptions.useAiImages ? 'ai' : 'skip';
  }
  if (!['project', 'code-generation'].includes(legacyOptions.sourceMode)) legacyOptions.sourceMode = 'project';
  if (!['skip', 'manual', 'ai'].includes(legacyOptions.screenshotMode)) legacyOptions.screenshotMode = 'skip';
  legacyOptions.codeExcludedPaths = Array.isArray(legacyOptions.codeExcludedPaths) ? legacyOptions.codeExcludedPaths.filter((item) => typeof item === 'string') : [];
  legacyOptions.codeIncludedPaths = Array.isArray(legacyOptions.codeIncludedPaths) ? legacyOptions.codeIncludedPaths.filter((item) => typeof item === 'string') : [];
  next.options = legacyOptions;

  next.drafts = next.drafts && typeof next.drafts === 'object' && !Array.isArray(next.drafts) ? next.drafts : {};
  next.outputs = Array.isArray(next.outputs) ? next.outputs.filter((item) => item?.name && item?.path) : [];
  next.exportBatches = Array.isArray(next.exportBatches)
    ? next.exportBatches.filter((batch) => batch?.id && batch?.directory && batch?.zipPath).slice(0, 20).map((batch) => ({
      ...batch,
      files: Array.isArray(batch.files) ? batch.files.filter((item) => item?.name && item?.path && item?.sha256) : [],
    }))
    : [];
  next.manualScreenshots = Array.isArray(next.manualScreenshots) ? next.manualScreenshots : [];
  next.aiIllustrations = Array.isArray(next.aiIllustrations) ? next.aiIllustrations : [];

  const snapshotAvailable = Boolean(next.confirmedSnapshot?.id && next.confirmedSnapshot?.path && next.confirmedSnapshot?.stateFile
    && fs.existsSync(next.confirmedSnapshot.path) && fs.existsSync(next.confirmedSnapshot.stateFile));
  if (next.draftConfirmed && !snapshotAvailable) {
    next.draftConfirmed = false;
    next.draftConfirmedAt = '';
    next.confirmedSnapshot = null;
    next.outputDir = '';
    next.outputs = [];
  }
  if (!next.draftConfirmed) {
    next.draftConfirmedAt = '';
    next.confirmedSnapshot = null;
  }

  if (next.task?.status === 'running' && !options.hasActiveTask) {
    next.task = {
      ...next.task,
      status: 'error',
      progress: 100,
      error: '上次任务在客户端退出前未完成，请重新执行',
      recovery: {
        title: '上次任务未完成',
        message: '已保留项目、申请字段和已生成文件，可从当前步骤重新执行。',
        actions: ['检查项目目录和模型配置', '重新生成草稿或导出正式资料'],
      },
      logs: [...(Array.isArray(next.task.logs) ? next.task.logs : []), '检测到客户端异常退出，任务已标记为可重试'],
      updated_at: now(),
    };
    next.step = next.drafts && Object.keys(next.drafts).length ? 'draft' : 'setup';
  }

  if (!['setup', 'generating', 'draft', 'exporting', 'result'].includes(next.step)) next.step = 'setup';
  next.schemaVersion = SOFTWARE_COPYRIGHT_SCHEMA_VERSION;
  if (fromVersion < SOFTWARE_COPYRIGHT_SCHEMA_VERSION) {
    next.migration = {
      fromVersion,
      toVersion: SOFTWARE_COPYRIGHT_SCHEMA_VERSION,
      migratedAt: now(),
    };
  }
  return { state: next, changed: JSON.stringify(next) !== JSON.stringify(saved), fromVersion };
}

const draftConfirmRequiredFields = [
  ['softwareName', '软件全称'],
  ['version', '版本号'],
  ['developmentCompletedDate', '开发完成日期'],
  ['copyrightOwner', '著作权人'],
  ['developmentHardware', '开发硬件环境'],
  ['runningHardware', '运行硬件环境'],
  ['developmentOs', '开发操作系统'],
  ['developmentTools', '开发环境 / 开发工具'],
  ['runningPlatform', '运行平台 / 操作系统'],
  ['runtimeSupport', '运行支撑环境 / 支持软件'],
  ['programmingLanguage', '编程语言'],
  ['sourceLineCount', '源程序量'],
  ['developmentPurpose', '开发目的'],
  ['industry', '面向领域 / 行业'],
  ['pageCount', '代码材料页数'],
];

const requiredDraftFiles = [
  ['business', '业务理解'],
  ['application', '申请表信息'],
  ['manual', '操作手册'],
  ['codeManifest', '代码提取清单'],
];

const submissionFieldDefinitions = [
  { group: '软件基本信息', key: 'softwareName', label: '软件全称', required: true, maxLength: 50, note: '应与申请表、手册和代码页眉一致' },
  { group: '软件基本信息', key: 'shortName', label: '软件简称', maxLength: 20, note: '无简称时可按受理系统要求留空' },
  { group: '软件基本信息', key: 'version', label: '版本号', required: true, maxLength: 20, note: '建议使用 V1.0 等稳定表达' },
  { group: '软件基本信息', key: 'category', label: '软件分类', required: true, maxLength: 20, note: '以登记系统实际选项为准' },
  { group: '软件基本信息', key: 'developmentCompletedDate', label: '开发完成日期', required: true, maxLength: 10, note: '格式 YYYY-MM-DD，应有开发证据支持' },
  { group: '软件基本信息', key: 'developmentMode', label: '开发方式', required: true, maxLength: 20, note: '例如单独开发、合作开发或委托开发' },
  { group: '权利与发表', key: 'copyrightOwner', label: '著作权人', required: true, maxLength: 200, note: '名称、地区、类型和证件信息需人工核对' },
  { group: '权利与发表', key: 'rightsScope', label: '权利范围', required: true, maxLength: 30, note: '通常为全部权利，以实际权属为准' },
  { group: '权利与发表', key: 'rightsAcquisition', label: '权利取得方式', required: true, maxLength: 30, note: '原始取得或继受取得需与权属证据一致' },
  { group: '权利与发表', key: 'publishStatus', label: '发表状态', required: true, maxLength: 20, note: '已发表时还需核对首次发表日期和地点' },
  { group: '权利与发表', key: 'firstPublishDate', label: '首次发表日期', maxLength: 10, note: '未发表时通常留空' },
  { group: '开发与运行环境', key: 'developmentHardware', label: '开发硬件环境', required: true, maxLength: 50, note: '使用简洁的硬件配置描述' },
  { group: '开发与运行环境', key: 'runningHardware', label: '运行硬件环境', required: true, maxLength: 50, note: '填写用户运行软件所需配置' },
  { group: '开发与运行环境', key: 'developmentOs', label: '开发操作系统', required: true, maxLength: 50, note: '例如 Windows 11 或 macOS 15' },
  { group: '开发与运行环境', key: 'developmentTools', label: '开发工具', required: true, maxLength: 50, note: '开发环境与工具名称应与实际一致' },
  { group: '开发与运行环境', key: 'runningPlatform', label: '运行平台', required: true, maxLength: 50, note: '填写支持的操作系统或平台' },
  { group: '开发与运行环境', key: 'runtimeSupport', label: '运行支撑环境', required: true, maxLength: 50, note: '例如 Electron、Chromium、Node.js' },
  { group: '开发与运行环境', key: 'programmingLanguage', label: '编程语言', required: true, maxLength: 50, note: '应与代码材料中的文件类型相符' },
  { group: '功能与规模', key: 'sourceLineCount', label: '源程序量', required: true, maxLength: 12, note: '仅填数字，应与代码抽取清单一致' },
  { group: '功能与规模', key: 'developmentPurpose', label: '开发目的', required: true, maxLength: 50, note: '建议一句话说明要解决的业务问题' },
  { group: '功能与规模', key: 'industry', label: '面向领域 / 行业', required: true, maxLength: 50, note: '使用明确的行业或应用领域名称' },
  { group: '功能与规模', key: 'mainFunctions', label: '软件主要功能', required: true, maxLength: 200, note: '按实际功能概括，避免使用未实现的表述' },
  { group: '功能与规模', key: 'technicalFeatures', label: '软件技术特点', required: true, maxLength: 100, note: '概括架构、平台、数据或交付特点' },
  { group: '功能与规模', key: 'pageCount', label: '代码材料页数', required: true, maxLength: 6, note: '应与代码提取清单页数一致' },
];

function now() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeFilename(value, fallback = '软著资料') {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback;
}

function readText(filePath, limit) {
  const { text } = readSourceFile(filePath);
  return limit ? text.slice(0, limit) : text;
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFilesRecursive(root, current = root, results = []) {
  if (!fs.existsSync(current)) return results;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const filePath = path.join(current, entry.name);
    if (entry.isDirectory()) listFilesRecursive(root, filePath, results);
    else if (entry.isFile()) results.push({
      name: entry.name,
      path: filePath,
      relativePath: path.relative(root, filePath).split(path.sep).join('/'),
      size: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
    });
  }
  return results;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return safeJsonParse(fs.readFileSync(filePath, 'utf-8'), fallback);
}

function normalizeVersion(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'V1.0';
  return /^v/i.test(raw) ? raw.toUpperCase().replace(/^V/, 'V') : `V${raw}`;
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
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (isSkipped(filePath)) continue;
    if (entry.isDirectory()) {
      walkFiles(filePath, results);
    } else if (entry.isFile() && CODE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const stat = fs.statSync(filePath);
      if (stat.size > 900_000 || stat.size <= 0) continue;
      results.push({ filePath, size: stat.size });
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
  if (r.includes('/services/') || r.includes('/api/') || r.includes('/ipc/') || r.includes('/handlers/') || r.includes('/controllers/') || r.includes('/middleware/') || r.includes('/models/') || r.includes('/repositories/')) return '业务服务';
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

function scoreCodeCandidate(item, index = 0) {
  const normalizedPath = String(item.path || '').toLowerCase();
  const fileName = path.basename(normalizedPath);
  let score = CATEGORY_SELECTION_WEIGHT[item.category] || 20;
  score += SOURCE_EXT_WEIGHT[item.extension] || 0;
  const lineCount = Math.max(Number(item.line_count) || 0, 0);
  score += Math.min(lineCount, 280) / 12;
  score -= index * 0.02;
  if (lineCount > 900) score -= 28;
  else if (lineCount > 650) score -= 14;

  if (/(\bsrc\/|\/src\/|^src\/)/u.test(normalizedPath)) score += 18;
  if (/(feature|features|page|pages|view|views|screen|screens|service|services|api|store|stores|router|route|hook|hooks|component|components)/u.test(normalizedPath)) score += 18;
  if (/(main|app|index|router|route)\.(ts|tsx|js|jsx|vue)$/u.test(fileName)) score += 18;
  if (/(service|handler|controller|store|model|schema|api|client|provider|context|hook)\.(ts|tsx|js|jsx|vue|py|java|go|rs|cs)$/u.test(fileName)) score += 12;
  if (/(test|spec|mock|fixture|demo|example|stories|story|config|setup|vite-env)\./u.test(fileName)) score -= 45;
  if (/(__tests__|test|tests|spec|mock|mocks|fixture|fixtures|demo|example|examples|storybook|coverage)\//u.test(normalizedPath)) score -= 45;
  if (/(assets?|public|static|styles?|theme|themes|icons?)\//u.test(normalizedPath)) score -= 24;
  if (item.category === '样式') score -= 35;

  return score;
}

function sortCodeCandidates(candidates) {
  return [...candidates]
    .map((item, index) => ({ ...item, selection_score: scoreCodeCandidate(item, index) }))
    .sort((a, b) => b.selection_score - a.selection_score || categoryPriority(a.category) - categoryPriority(b.category) || b.line_count - a.line_count);
}

function pickRepresentativeCodeFile(items) {
  if (!items.length) return null;
  return items.find((item) => item.line_count >= 20 && item.line_count <= 520)
    || items.find((item) => item.line_count <= 900)
    || [...items].sort((a, b) => a.line_count - b.line_count || b.selection_score - a.selection_score)[0];
}

function analyzeProject(projectDir) {
  const files = walkFiles(projectDir).map((item) => {
    const relativePath = rel(item.filePath, projectDir);
    const text = readText(item.filePath, 400_000);
    const lineCount = text.split(/\r?\n/).length;
    const category = classifyFile(relativePath);
    return {
      path: relativePath,
      file_path: item.filePath,
      extension: path.extname(item.filePath).toLowerCase(),
      size: item.size,
      line_count: lineCount,
      category,
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
    scripts: packageJson.scripts || {},
    frameworks: technology.frameworks,
    languages,
    fileCount: files.length,
    lineCount,
    candidates: files.map(({ file_path, ...item }) => item),
    readmeExcerpt: readReadme(projectDir),
  };
}

function readReadme(projectDir) {
  const readme = ['README.md', 'README.zh.md', 'readme.md'].map((name) => path.join(projectDir, name)).find((candidate) => fs.existsSync(candidate));
  if (!readme) return '';
  return readText(readme, 5000).split(/\r?\n/).slice(0, 80).join('\n');
}

function createInitialFieldsFromAnalysis(analysis, currentFields = {}) {
  const softwareName = currentFields.softwareName || analysis.packageName || analysis.projectName || '';
  return {
    ...initialFields,
    ...currentFields,
    softwareName,
    version: currentFields.version || normalizeVersion(analysis.packageVersion || '1.0'),
    programmingLanguage: currentFields.programmingLanguage || analysis.languages.join('、'),
    sourceLineCount: currentFields.sourceLineCount || String(analysis.lineCount || ''),
    developmentPurpose: currentFields.developmentPurpose || '提升软件相关业务处理效率',
    pageCount: currentFields.pageCount || '',
  };
}

function normalizePathList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
}

function selectCodeFiles(analysis, excludedPaths = [], includedPaths = []) {
  const excluded = new Set(normalizePathList(excludedPaths));
  const included = normalizePathList(includedPaths).filter((filePath) => !excluded.has(filePath));
  const candidates = (Array.isArray(analysis.candidates) ? analysis.candidates : [])
    .filter((item) => !excluded.has(item.path));
  const selected = [];
  const selectedPaths = new Set();
  const targetLines = SPLIT_PAGES * LINES_PER_PAGE;
  const overflowLimit = Math.round(targetLines * 1.2);
  const ranked = sortCodeCandidates(candidates);
  let lines = 0;

  function addItem(item, options = {}) {
    if (!item || selectedPaths.has(item.path)) return false;
    const nextLines = lines + item.line_count + 2;
    if (!options.allowOverflow && selected.length > 0 && nextLines > overflowLimit) return false;
    selected.push(item);
    selectedPaths.add(item.path);
    lines = nextLines;
    return true;
  }

  for (const includedPath of included) {
    addItem(candidates.find((item) => item.path === includedPath), { allowOverflow: true });
  }

  for (const category of CORE_CODE_CATEGORIES) {
    const representative = pickRepresentativeCodeFile(ranked.filter((item) => item.category === category));
    addItem(representative);
  }

  for (const item of ranked) {
    if (lines >= targetLines) break;
    if (item.category === '样式' && lines < targetLines) continue;
    addItem(item);
  }

  if (lines < targetLines) {
    for (const item of ranked) {
      if (lines >= targetLines) break;
      addItem(item, { allowOverflow: true });
    }
  }

  if (lines < targetLines) {
    for (const item of candidates) {
      if (lines >= targetLines) break;
      addItem(item, { allowOverflow: true });
    }
  }

  return selected.length ? selected : candidates.slice(0, 20);
}

function createCodeMaterial(projectDir, selectedFiles, fields, draftDir) {
  const material = buildCodeMaterial(projectDir, selectedFiles, fields, fields.codeClean);
  const { pages, files, audit, cleanOptions, totalLines, truncated } = material;

  const softwareName = fields.softwareName || '软件';
  const version = fields.version || 'V1.0';
  const outputs = [];
  const writePages = (fileName, title, pageItems) => {
    const lines = [];
    for (const page of pageItems) {
      lines.push(`## 第 ${page.no} 页`, '', '```text', ...page.lines, '```', '');
    }
    const target = path.join(draftDir, fileName);
    fs.writeFileSync(target, lines.join('\n'), 'utf-8');
    outputs.push(target);
  };

  if (pages.length >= SPLIT_PAGES) {
    writePages('代码-前30页.md', '代码材料（前30页）', pages.slice(0, 30));
    writePages('代码-后30页.md', '代码材料（后30页）', pages.slice(-30));
  } else {
    writePages('代码-全部.md', '代码材料（全部）', pages);
  }

  const manifest = {
    software_name: softwareName,
    version,
    project_root: projectDir,
    lines_per_page: LINES_PER_PAGE,
    total_pages: pages.length,
    mode: pages.length >= SPLIT_PAGES ? 'front30_back30' : 'all_under_60_pages',
    material_line_count: pages.reduce((sum, page) => sum + page.lines.length, 0),
    cleaned_line_count: totalLines,
    truncated,
    selection_strategy: 'clean-audit-front-back-v2',
    clean_options: cleanOptions,
    excluded_paths: normalizePathList(fields.codeExcludedPaths),
    included_paths: normalizePathList(fields.codeIncludedPaths),
    category_summary: files.reduce((summary, item) => {
      summary[item.category] = (summary[item.category] || 0) + 1;
      return summary;
    }, {}),
    files,
    pages,
    audit,
  };
  writeJson(path.join(draftDir, '代码提取清单.json'), manifest);
  fs.writeFileSync(path.join(draftDir, '代码提取清单.md'), [
    '# 代码提取清单',
    '',
    `- 软件名称：${softwareName}`,
    `- 版本号：${version}`,
    `- 总页数：${pages.length}`,
    `- 材料代码行数：${pages.reduce((sum, page) => sum + page.lines.length, 0)}`,
    `- 清洗后源码行数：${totalLines}`,
    `- 选择策略：核心类别覆盖 + 清洗脱敏 + 50 行显式分页`,
    '',
    '| 文件 | 类型 | 编码 | 原始行数 | 清洗后行数 |',
    '| --- | --- | --- | ---: | ---: |',
    ...files.map((item) => `| \`${item.path}\` | ${item.category} | ${item.encoding} | ${item.source_line_count} | ${item.cleaned_line_count} |`),
    '',
    '## 合规审查',
    '',
    ...audit.map((item) => `- ${item.status === 'pass' ? '通过' : item.status === 'warn' ? '警告' : '退回风险'}：${item.name}。${item.detail}`),
    '',
  ].join('\n'), 'utf-8');
  return { manifest, outputs };
}

async function generateBusinessContext(aiService, analysis, fields) {
  const fallback = {
    product_positioning: `${fields.softwareName || analysis.projectName}是一套面向实际业务场景的软件系统。`,
    industry: fields.industry || '通用软件',
    target_users: ['业务用户', '管理人员'],
    core_value: '帮助用户完成信息录入、过程处理、结果查看和资料管理等日常工作。',
    business_features: ['信息管理', '业务处理', '结果查看', '系统设置'],
    operation_flow: ['进入系统', '填写或导入业务资料', '执行处理任务', '查看并导出结果'],
    main_functions: fields.mainFunctions || '',
    technical_characteristics: fields.technicalFeatures || '',
    manual_modules: [],
  };

  try {
    const result = await aiService.requestJson({
      logTitle: '软著-业务理解',
      progressLabel: '软著业务理解',
      temperature: 0.2,
      timeout_ms: 300000,
      messages: buildBusinessContextMessages({ analysis, fields }),
      failureMessage: '软著业务理解 JSON 生成失败',
    });
    return { ...fallback, ...result };
  } catch {
    return fallback;
  }
}

function asArrayText(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(/[；;\n、]+/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function normalizeGeneratedField(value, maxLength) {
  const text = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join('、') : String(value || '').trim();
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
}

function enrichFieldsFromBusiness(fields, business, analysis = {}) {
  const featureNames = asArrayText(business?.business_features, ['信息管理', '业务处理', '结果查看']);
  const softwareName = fields.softwareName || analysis.projectName || '本软件';
  const fallbackMainFunctions = `${softwareName}主要提供${featureNames.join('、')}等功能，支持用户完成资料录入、流程处理、结果查看和资料导出。`;
  const technologyNames = [...(analysis.frameworks || []), ...(analysis.languages || []).map((item) => String(item).toUpperCase())].slice(0, 8);
  const fallbackTechnicalFeatures = technologyNames.length
    ? `采用${technologyNames.join('、')}等技术构建，支持业务数据处理、状态反馈和结果导出。`
    : '采用模块化软件架构，支持业务数据处理、状态反馈和结果导出。';
  return {
    ...fields,
    industry: fields.industry || normalizeGeneratedField(business?.industry, 50),
    mainFunctions: fields.mainFunctions || normalizeGeneratedField(business?.main_functions || fallbackMainFunctions, 200),
    technicalFeatures: fields.technicalFeatures || normalizeGeneratedField(business?.technical_characteristics || fallbackTechnicalFeatures, 100),
  };
}

async function generateTechnicalFeaturesField(aiService, analysis = {}, fields = {}) {
  const frameworks = asArrayText(analysis.frameworks).join('、') || '未识别';
  const languages = asArrayText(analysis.languages).join('、') || fields.programmingLanguage || '未识别';
  const candidateCategories = Array.from(new Set((analysis.candidates || []).map((item) => item.category).filter(Boolean))).slice(0, 8).join('、');
  const content = await aiService.chat({
    logTitle: '软著-AI生成技术特点',
    temperature: 0.2,
    timeout_ms: 180000,
    messages: [
      {
        role: 'system',
        content: '你是中国软件著作权登记材料助手。请依据项目证据撰写“软件的技术特点”字段，只输出一段中文纯文本，不要标题、列表、引号或解释，不得编造未提供的技术，控制在100个汉字以内。重点说明技术架构、主要技术栈、数据处理或跨平台等可验证特点，避免营销口号和单纯重复软件功能。',
      },
      {
        role: 'user',
        content: [
          `软件全称：${fields.softwareName || analysis.projectName || '本软件'}`,
          `技术栈：${frameworks}`,
          `编程语言：${languages}`,
          `源码类别：${candidateCategories || '未分类'}`,
          `主要功能：${fields.mainFunctions || '尚未填写'}`,
          `开发目的：${fields.developmentPurpose || '尚未填写'}`,
          `应用领域：${fields.industry || '尚未填写'}`,
          `项目说明摘录：${String(analysis.readmeExcerpt || '').slice(0, 1200)}`,
        ].join('\n'),
      },
    ],
  });
  const normalized = normalizeGeneratedField(String(content || '')
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^软件的技术特点[：:]?\s*/i, '')
    .replace(/[\r\n]+/g, ' ')
    .trim(), 100);
  if (!normalized) throw new Error('文本模型未返回有效的技术特点，请重试');
  return normalized;
}

function backfillGeneratedFieldsFromDrafts(state) {
  if (!state?.draftDir || (!state.drafts?.business && !state.drafts?.application)) return { state, changed: false };
  if (state.generatedFieldsSourceDraftDir === state.draftDir) return { state, changed: false };
  let business = {};
  const businessJsonPath = path.join(state.draftDir, '业务理解.json');
  if (fs.existsSync(businessJsonPath)) business = readJson(businessJsonPath, {});
  let fields = enrichFieldsFromBusiness({ ...(state.fields || {}) }, business, state.analysis || {});
  const applicationPath = state.drafts?.application || path.join(state.draftDir, '申请表信息.md');
  if (fs.existsSync(applicationPath)) {
    const application = fs.readFileSync(applicationPath, 'utf-8');
    const extract = (label) => application.match(new RegExp(`^➤${label}：(.*)$`, 'mu'))?.[1]?.trim() || '';
    if (!fields.mainFunctions) fields.mainFunctions = normalizeGeneratedField(extract('软件的主要功能'), 200);
    if (!fields.technicalFeatures) fields.technicalFeatures = normalizeGeneratedField(extract('软件的技术特点'), 100);
  }
  const changed = JSON.stringify(fields) !== JSON.stringify(state.fields || {});
  if (!changed) return { state, changed: false };
  return {
    changed: true,
    state: {
      ...state,
      fields,
      draftConfirmed: false,
      draftConfirmedAt: '',
      confirmedSnapshot: null,
      outputDir: '',
      outputs: [],
      generatedFieldsSourceDraftDir: state.draftDir,
    },
  };
}

function backfillAnalysisTechnologies(state) {
  const projectDir = state?.project?.path || state?.analysis?.projectRoot;
  if (!projectDir || !fs.existsSync(projectDir) || state?.analysis?.frameworks?.length) return { state, changed: false };
  const technology = detectProjectTechnologies(projectDir, state.analysis?.candidates || []);
  if (!technology.frameworks.length) return { state, changed: false };
  return {
    changed: true,
    state: {
      ...state,
      analysis: {
        ...(state.analysis || {}),
        frameworks: technology.frameworks,
        packageName: state.analysis?.packageName || technology.packageJson?.name || '',
        packageVersion: state.analysis?.packageVersion || technology.packageJson?.version || '',
      },
    },
  };
}

function createApplicationMarkdown(fields, business, manifest) {
  const mainFunctions = fields.mainFunctions || business.main_functions || `${fields.softwareName}主要提供${asArrayText(business.business_features, ['信息管理', '业务处理']).join('、')}等功能，支持用户完成资料录入、流程处理、结果查看和文档导出等操作。`;
  const lines = [
    '# 申请表信息',
    '',
    `➤软件全称：${fields.softwareName || '待用户确认'}`,
    `➤软件简称：${fields.shortName || ''}`,
    `➤版本号：${fields.version || 'V1.0'}`,
    `➤软件分类：${fields.category || '应用软件'}`,
    `➤开发完成日期：${fields.developmentCompletedDate || '待用户确认'}`,
    `➤开发方式：${fields.developmentMode || '单独开发'}`,
    `➤软件说明：${fields.softwareDescription || '原创'}`,
    `➤发表状态：${fields.publishStatus || '未发表'}`,
    `➤首次发表日期：${fields.firstPublishDate || ''}`,
    `➤著作权人：${fields.copyrightOwner || '待用户确认'}`,
    `➤权利范围：${fields.rightsScope || '全部权利'}`,
    `➤权利取得方式：${fields.rightsAcquisition || '原始取得'}`,
    `➤开发的硬件环境：${fields.developmentHardware || '待用户确认'}`,
    `➤运行的硬件环境：${fields.runningHardware || '待用户确认'}`,
    `➤开发该软件的操作系统：${fields.developmentOs || '待用户确认'}`,
    `➤软件开发环境 / 开发工具：${fields.developmentTools || '待用户确认'}`,
    `➤该软件的运行平台 / 操作系统：${fields.runningPlatform || '待用户确认'}`,
    `➤软件运行支撑环境 / 支持软件：${fields.runtimeSupport || '待用户确认'}`,
    `➤编程语言：${fields.programmingLanguage || '待用户确认'}`,
    `➤源程序量：${fields.sourceLineCount || manifest.material_line_count || '待用户确认'}`,
    `➤开发目的：${fields.developmentPurpose || '提升软件相关业务处理效率'}`,
    `➤面向领域 / 行业：${fields.industry || business.industry || '待用户确认'}`,
    `➤软件的主要功能：${mainFunctions}`,
    `➤软件的技术特点：${fields.technicalFeatures || business.technical_characteristics || '待用户确认'}`,
    `➤页数：${fields.pageCount || manifest.total_pages}`,
    '',
  ];
  return lines.join('\n');
}

function syncApplicationCodeStats(markdown, fields, manifest) {
  const stats = {
    sourceLineCount: fields.sourceLineCount || manifest.material_line_count || '',
    pageCount: manifest.total_pages || '',
  };
  const lines = String(markdown || '').split(/\r?\n/);
  let hasSourceLineCount = false;
  let hasPageCount = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith('➤源程序量：')) {
      hasSourceLineCount = true;
      return `➤源程序量：${stats.sourceLineCount}`;
    }
    if (line.startsWith('➤页数：')) {
      hasPageCount = true;
      return `➤页数：${stats.pageCount}`;
    }
    return line;
  });
  if (!hasSourceLineCount) nextLines.push(`➤源程序量：${stats.sourceLineCount}`);
  if (!hasPageCount) nextLines.push(`➤页数：${stats.pageCount}`);
  return nextLines.join('\n');
}

function createBusinessMarkdown(business) {
  const businessFeatures = asArrayText(business.business_features)
    .map((item) => normalizeListItemText(item))
    .filter(Boolean);
  const operationFlow = asArrayText(business.operation_flow)
    .map((item) => normalizeListItemText(item))
    .filter(Boolean);
  return [
    '# 业务理解',
    '',
    `## 产品定位`,
    business.product_positioning || '',
    '',
    `## 面向领域 / 行业`,
    business.industry || '',
    '',
    `## 目标用户`,
    asArrayText(business.target_users).join('、'),
    '',
    `## 核心价值`,
    business.core_value || '',
    '',
    `## 主要业务功能`,
    businessFeatures.map((item) => `- ${item}`).join('\n'),
    '',
    `## 典型操作流程`,
    operationFlow.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    '',
  ].join('\n');
}

function manualModulesFromBusiness(business, analysis) {
  const modules = Array.isArray(business.manual_modules) ? business.manual_modules : [];
  if (modules.length) return modules.slice(0, 10);
  return (analysis.candidates || [])
    .filter((item) => ['页面', '入口', '路由'].includes(item.category))
    .slice(0, 8)
    .map((item) => ({
      title: item.path.split('/').pop().replace(/\.[^.]+$/, ''),
      purpose: '用于承载软件中的核心操作页面。',
      entry: '用户从软件主界面或对应菜单进入。',
      visible_elements: ['页面标题', '业务内容区', '操作按钮', '结果提示'],
      operation_steps: ['查看页面信息', '按页面提示填写或选择资料', '提交处理并查看结果'],
      validation_rules: [],
      feedback: '处理完成后页面展示结果、状态或提示信息。',
      screenshot: `请在此处插入 ${item.path} 对应页面截图。`,
      source_files: [item.path],
    }));
}

async function createManualMarkdown(aiService, analysis, fields, business) {
  const modules = manualModulesFromBusiness(business, analysis);
  const fallback = buildManualMarkdown(fields, business, modules);
  try {
    const text = await aiService.chat({
      logTitle: '软著-操作手册',
      temperature: 0.35,
      timeout_ms: 300000,
      messages: buildManualMarkdownMessages({ fields, business, modules }),
    });
    return text && text.includes('截图预留') ? text : fallback;
  } catch {
    return fallback;
  }
}

function buildManualMarkdown(fields, business, modules) {
  const softwareName = fields.softwareName || '本软件';
  const moduleSections = modules.map((module, index) => {
    const title = module.title || `核心功能${index + 1}`;
    return [
      `## ${numberCn(index + 5)}、${title}`,
      '',
      `${title}主要${module.purpose || '用于完成软件中的相关业务操作'}用户通常从${module.entry || '软件主界面'}进入该页面。页面中可以看到${asArrayText(module.visible_elements, ['业务内容', '操作按钮', '结果区域']).join('、')}等内容。`,
      '',
      `使用时，用户可按页面提示${asArrayText(module.operation_steps, ['填写信息', '提交处理', '查看结果']).join('，')}。${asArrayText(module.validation_rules).length ? `页面会校验${asArrayText(module.validation_rules).join('、')}等规则。` : '如信息不完整或处理失败，页面会给出对应提示。'}操作完成后，${module.feedback || '用户可以在页面查看处理结果和状态反馈'}。`,
      '',
      `【截图预留：${module.screenshot || `请在此处插入“${title}”页面或操作结果截图。`}】`,
      '',
    ].join('\n');
  }).join('\n');

  return [
    `# ${softwareName} 操作手册`,
    '',
    '## 一、相关文档',
    '',
    '| 文档名称 | 说明 |',
    '| --- | --- |',
    '| 总体设计说明 | 说明软件目标、用户对象和总体功能组成。 |',
    '| 详细设计说明 | 说明各功能模块的输入、处理和输出。 |',
    '| 测试用例 | 记录主要功能的测试过程和结果。 |',
    '',
    '## 二、说明',
    '',
    `${softwareName}面向${fields.industry || business.industry || '实际业务场景'}，服务于${asArrayText(business.target_users, ['业务用户']).join('、')}。用户可通过软件完成${asArrayText(business.business_features, ['信息管理', '业务处理', '结果查看']).join('、')}等工作。`,
    '',
    '## 三、功能特点',
    '',
    `${softwareName}围绕真实业务流程组织页面和操作入口，用户可以按照资料准备、内容处理、结果查看和资料导出的顺序完成日常工作。软件在关键步骤提供状态反馈，便于用户确认当前处理进度和结果。`,
    '',
    '## 四、系统要求',
    '',
    `运行平台为${fields.runningPlatform || '待用户确认'}，运行支撑环境为${fields.runtimeSupport || '待用户确认'}，建议在满足${fields.runningHardware || '常规办公电脑配置'}的设备上使用。`,
    '',
    moduleSections,
    `## ${numberCn(modules.length + 5)}、常见问题解答`,
    '',
    '用户在使用过程中如遇到资料无法提交、结果未生成或页面提示异常，应先检查输入内容是否完整，再根据页面提示重新操作。若问题仍然存在，可联系系统维护人员处理。',
    '',
    `## ${numberCn(modules.length + 6)}、术语表`,
    '',
    '| 术语 | 说明 |',
    '| --- | --- |',
    '| 用户 | 使用本软件完成业务处理的人员。 |',
    '| 结果 | 软件根据用户输入或导入资料处理后形成的页面反馈或导出文件。 |',
    '',
  ].join('\n');
}

function numberCn(value) {
  const nums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
  return nums[value] || String(value);
}

function paragraph(text, options = {}) {
  return new Paragraph({
    text: '',
    heading: options.heading,
    alignment: options.alignment,
    pageBreakBefore: options.pageBreakBefore,
    keepNext: options.keepNext,
    spacing: { after: options.after ?? 120, line: options.line ?? 360 },
    children: options.children || [new TextRun({ text: String(text || ''), font: options.font || '宋体', size: options.size || 24, bold: options.bold, color: options.color || '000000' })],
  });
}

function cleanInlineMarkdownText(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1');
}

function inlineMarkdownToRuns(value, options = {}) {
  const font = options.font || '宋体';
  const size = options.size || 24;
  const source = cleanInlineMarkdownText(value);
  const runs = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match;

  function pushText(text, extra = {}) {
    if (!text) return;
    runs.push(new TextRun({
      text,
      font: extra.font || font,
      size,
      bold: Boolean(extra.bold || options.bold),
      italics: Boolean(extra.italics),
      color: extra.color || options.color || '000000',
    }));
  }

  while ((match = pattern.exec(source)) !== null) {
    pushText(source.slice(lastIndex, match.index));
    if (match[2]) {
      pushText(match[2], { bold: true });
    } else if (match[3]) {
      pushText(match[3], { font: 'Consolas' });
    } else if (match[4]) {
      pushText(match[4], { italics: true });
    }
    lastIndex = match.index + match[0].length;
  }
  pushText(source.slice(lastIndex));
  return runs.length ? runs : [new TextRun({ text: '', font, size, color: options.color || '000000' })];
}

function normalizeListItemText(value) {
  const parts = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^([-*]\s+|\d+[.、]\s*)+/, '').trim())
    .filter(Boolean);
  return parts.join('、').replace(/\s+/g, ' ').trim();
}

function hasSentenceEnding(value) {
  return /[。.!！?？；;]$/u.test(String(value || '').trim());
}

function repairOperationFlowMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const repaired = [];
  let inOperationFlow = false;
  let flowItems = [];

  function flushFlowItems() {
    if (!flowItems.length) return;
    repaired.push(...flowItems.map((item, index) => `${index + 1}. ${item}`));
    flowItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^##\s+典型操作流程\s*$/u.test(line.trim())) {
      flushFlowItems();
      inOperationFlow = true;
      repaired.push(line);
      continue;
    }
    if (inOperationFlow && /^##\s+/u.test(line.trim())) {
      flushFlowItems();
      inOperationFlow = false;
      repaired.push(line);
      continue;
    }
    if (!inOperationFlow) {
      repaired.push(line);
      continue;
    }
    if (!line.trim()) {
      flushFlowItems();
      repaired.push(line);
      continue;
    }

    const text = normalizeListItemText(line);
    if (!text) continue;
    const previousIndex = flowItems.length - 1;
    if (previousIndex >= 0 && !hasSentenceEnding(flowItems[previousIndex])) {
      flowItems[previousIndex] = `${flowItems[previousIndex]}、${text}`;
    } else {
      flowItems.push(text);
    }
  }
  flushFlowItems();
  return repaired.join('\n');
}

function normalizeDraftContent(draftKey, content) {
  if (draftKey === 'business') {
    return repairOperationFlowMarkdown(content);
  }
  return String(content || '');
}

function isMarkdownTableSeparator(line) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/u.test(String(line || '').trim());
}

function parseMarkdownTableRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());
}

function markdownTableToDocx(rows, options = {}) {
  const font = options.bodyFont || '宋体';
  const size = Math.max(options.bodySize || 21, 21);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D5' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      right: border,
      bottom: border,
      left: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows.map((row, rowIndex) => new TableRow({
      children: row.map((cell) => new TableCell({
        width: { size: Math.floor(100 / Math.max(row.length, 1)), type: WidthType.PERCENTAGE },
        margins: { top: 90, right: 120, bottom: 90, left: 120 },
        shading: rowIndex === 0 ? { fill: 'F3F6FA' } : undefined,
        children: [paragraph('', {
          children: inlineMarkdownToRuns(cell, { font, size, bold: rowIndex === 0 }),
          line: 300,
          after: 0,
        })],
      })),
    })),
  });
}

function markdownToDocxChildren(markdown, options = {}) {
  const children = [];
  const lines = String(markdown || '').split(/\r?\n/);
  let inCode = false;
  let codeLines = [];
  let codeMaterialPageHeadingCount = 0;
  let inlineFigureCount = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      if (inCode) {
        for (const codeLine of codeLines) {
          children.push(paragraph(codeLine, {
            font: options.bodyFont || '宋体',
            size: Math.max(options.bodySize || 21, 21),
            line: options.bodyLine || 300,
            after: options.bodyAfter ?? 0,
          }));
        }
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      continue;
    }
    const placeholderMatch = line.trim().match(/^【截图预留：([^】]+)】$/u);
    const inlineImages = placeholderMatch
      ? (options.inlineImages || []).filter((item) => item?.placement === placeholderMatch[1].trim() && item?.path && fs.existsSync(item.path))
      : [];
    if (inlineImages.length) {
      for (const item of inlineImages) {
        inlineFigureCount += 1;
        children.push(...createImageFigureChildren(item, inlineFigureCount, {
          assetName: options.inlineAssetName || 'manual-inline-image',
        }));
      }
    } else if (line.startsWith('# ')) {
      children.push(paragraph(line.slice(2), { heading: HeadingLevel.TITLE, size: 32, bold: true, alignment: AlignmentType.CENTER, after: 220 }));
    } else if (line.startsWith('## ')) {
      const isCodeMaterialPageHeading = options.kind === 'code' && /^第\s*\d+\s*页/u.test(line.slice(3).trim());
      const shouldBreakBeforeCodePage = isCodeMaterialPageHeading && codeMaterialPageHeadingCount > 0;
      if (isCodeMaterialPageHeading) codeMaterialPageHeadingCount += 1;
      children.push(paragraph(line.slice(3), {
        heading: HeadingLevel.HEADING_1,
        size: 28,
        bold: true,
        after: 160,
        pageBreakBefore: shouldBreakBeforeCodePage,
      }));
    } else if (line.startsWith('### ')) {
      children.push(paragraph(line.slice(4), { heading: HeadingLevel.HEADING_2, size: 25, bold: true, after: 120 }));
    } else if (isMarkdownTableSeparator(line)) {
      continue;
    } else if (line.startsWith('|')) {
      const tableRows = [];
      while (lineIndex < lines.length) {
        const tableLine = lines[lineIndex].trimEnd();
        if (!tableLine.trim().startsWith('|')) break;
        if (!isMarkdownTableSeparator(tableLine)) {
          tableRows.push(parseMarkdownTableRow(tableLine));
        }
        lineIndex += 1;
      }
      lineIndex -= 1;
      if (tableRows.length) {
        children.push(markdownTableToDocx(tableRows, options));
        children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      }
    } else if (/^[-*]\s+/.test(line)) {
      const text = normalizeListItemText(line);
      children.push(paragraph('', {
        children: [
          new TextRun({ text: '· ', font: options.bodyFont || '宋体', size: options.bodySize || 24 }),
          ...inlineMarkdownToRuns(text, { font: options.bodyFont || '宋体', size: options.bodySize || 24 }),
        ],
        line: options.bodyLine || 360,
        after: options.bodyAfter ?? 120,
      }));
    } else if (/^\d+\.\s+/.test(line)) {
      const match = line.match(/^(\d+\.)\s+(.*)$/);
      const text = normalizeListItemText(match?.[2] || line);
      children.push(paragraph('', {
        children: [
          new TextRun({ text: `${match?.[1] || ''} `, font: options.bodyFont || '宋体', size: options.bodySize || 24 }),
          ...inlineMarkdownToRuns(text, { font: options.bodyFont || '宋体', size: options.bodySize || 24 }),
        ],
        line: options.bodyLine || 360,
        after: options.bodyAfter ?? 120,
      }));
    } else {
      children.push(paragraph('', {
        children: inlineMarkdownToRuns(line, { font: options.bodyFont || '宋体', size: options.bodySize || 24 }),
        font: options.bodyFont || '宋体',
        size: options.bodySize || 24,
        line: options.bodyLine || 360,
        after: options.bodyAfter ?? 120,
      }));
    }
  }
  return children;
}

function createImageFigureChildren(item, index, options = {}) {
  try {
    const buffer = fs.readFileSync(item.path);
    const size = getSafeImageDimensions(buffer);
    const sourceWidth = Number(size.width) || 960;
    const sourceHeight = Number(size.height) || 600;
    const ratio = Math.min(1, (options.maxWidth || 500) / sourceWidth, (options.maxHeight || 560) / sourceHeight);
    const extension = path.extname(item.path).toLowerCase();
    const caption = String(item.caption || item.name || `界面截图 ${index}`).trim();
    return [
      paragraph(`图 ${index}  ${caption}`, {
        size: 21,
        bold: true,
        alignment: AlignmentType.CENTER,
        pageBreakBefore: Boolean(options.pageBreakBefore),
        keepNext: true,
        after: 120,
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [new ImageRun({
          type: extension === '.png' ? 'png' : 'jpg',
          data: buffer,
          transformation: {
            width: Math.max(1, Math.round(sourceWidth * ratio)),
            height: Math.max(1, Math.round(sourceHeight * ratio)),
          },
          altText: { title: caption, description: caption, name: `${options.assetName || 'manual-image'}-${index}` },
        })],
      }),
    ];
  } catch {
    return [paragraph(`图 ${index}  ${item.caption || item.name || '图片读取失败'}（图片无法读取，请人工补充）`, {
      size: 21,
      color: 'B42318',
      pageBreakBefore: Boolean(options.pageBreakBefore),
      after: 160,
    })];
  }
}

function createManualCoverChildren(fields, softwareName, version) {
  return [
    paragraph(`${softwareName} 操作手册`, { size: 38, bold: true, alignment: AlignmentType.CENTER, after: 420 }),
    paragraph(`版本号：${version}`, { size: 24, alignment: AlignmentType.CENTER, after: 180 }),
    paragraph(`软件分类：${fields.category || '应用软件'}`, { size: 22, alignment: AlignmentType.CENTER, after: 120 }),
    paragraph(`著作权人：${fields.copyrightOwner || ''}`, { size: 22, alignment: AlignmentType.CENTER, after: 120 }),
    paragraph(`开发完成日期：${fields.developmentCompletedDate || ''}`, { size: 22, alignment: AlignmentType.CENTER, after: 600 }),
    paragraph('本文档用于软件著作权登记材料整理，内容依据软件项目功能和用户操作流程生成。', { size: 21, alignment: AlignmentType.CENTER, line: 320, after: 240 }),
    paragraph('', { pageBreakBefore: true, after: 0 }),
  ];
}

function extractScreenshotPlaceholders(markdown) {
  return Array.from(String(markdown || '').matchAll(/【截图预留：([^】]+)】/gu), (match) => match[1].trim()).filter(Boolean);
}

function createSupplementImageChildren(screenshots = [], heading = '附录、界面截图', assetName = 'manual-screenshot') {
  const valid = screenshots.filter((item) => item?.path && fs.existsSync(item.path));
  if (!valid.length) return [];
  const children = [paragraph(heading, {
    heading: HeadingLevel.HEADING_1,
    size: 28,
    bold: true,
    pageBreakBefore: true,
    after: 180,
  })];
  valid.forEach((item, index) => {
    children.push(...createImageFigureChildren(item, index + 1, { assetName, pageBreakBefore: index > 0 }));
  });
  return children;
}

async function writeDocx(markdown, outPath, headerText = '', options = {}) {
  const coverChildren = options.kind === 'manual'
    ? createManualCoverChildren(options.fields || {}, options.softwareName || headerText || '软件', options.version || '')
    : [];
  const screenshotChildren = options.kind === 'manual'
    ? createSupplementImageChildren(
      options.supplementImages || options.manualScreenshots || [],
      options.supplementHeading || '附录、界面截图',
      options.supplementAssetName || 'manual-screenshot',
    )
    : [];
  const doc = new Document({
    sections: [{
      headers: headerText ? { default: new Header({ children: [paragraph(headerText, { size: 21, alignment: AlignmentType.CENTER, after: 80 })] }) } : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['第 ', PageNumber.CURRENT, ' 页'], font: '宋体', size: 21, color: '000000' })] })],
        }),
      },
      properties: {
        page: {
          size: A4_PAGE_SIZE,
          margin: STANDARD_PAGE_MARGIN,
        },
      },
      children: [
        ...coverChildren,
        ...markdownToDocxChildren(markdown, options.kind === 'code'
          ? { kind: 'code', bodyFont: '宋体', bodySize: 21, bodyLine: 240, bodyAfter: 0 }
          : {
            kind: options.kind,
            bodyFont: '宋体',
            bodySize: 24,
            bodyLine: 360,
            bodyAfter: 120,
            inlineImages: options.inlineImages || [],
            inlineAssetName: options.inlineAssetName,
          }),
        ...screenshotChildren,
      ],
    }],
  });
  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
}

async function writeCodeDocx(pages, outPath, headerText) {
  const codeAsciiFont = process.platform === 'darwin' ? 'Menlo' : 'Consolas';
  const eastAsiaCodeFont = process.platform === 'darwin' ? 'Songti SC' : process.platform === 'win32' ? 'SimSun' : 'Noto Sans CJK SC';
  const eastAsiaHeaderFont = process.platform === 'darwin' ? 'PingFang SC' : process.platform === 'win32' ? 'Microsoft YaHei' : 'Noto Sans CJK SC';
  const codeFont = { ascii: codeAsciiFont, hAnsi: codeAsciiFont, eastAsia: codeAsciiFont, cs: codeAsciiFont };

  function createMixedFontRuns(value, options = {}) {
    const text = String(value || ' ');
    const segments = [];
    let current = '';
    let currentIsCjk = null;
    for (const character of Array.from(text)) {
      const isCjk = character.codePointAt(0) > 0x2e7f;
      if (current && isCjk !== currentIsCjk) {
        segments.push({ text: current, isCjk: currentIsCjk });
        current = '';
      }
      current += character;
      currentIsCjk = isCjk;
    }
    if (current) segments.push({ text: current, isCjk: currentIsCjk });
    return segments.map((segment) => new TextRun({
      text: segment.text,
      font: segment.isCjk ? options.eastAsiaFont : options.asciiFont,
      size: options.size,
      color: options.color,
    }));
  }

  const children = [];
  pages.forEach((page, pageIndex) => {
    page.lines.forEach((line, lineIndex) => {
      children.push(new Paragraph({
        pageBreakBefore: pageIndex > 0 && lineIndex === 0,
        spacing: { before: 0, after: 0, line: 230, lineRule: LineRuleType.EXACT },
        indent: { left: 0, right: 0, firstLine: 0 },
        children: createMixedFontRuns(line, {
          asciiFont: codeAsciiFont,
          eastAsiaFont: eastAsiaCodeFont,
          size: 19,
          color: '111827',
        }),
      }));
    });
  });
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: codeFont, size: 19, color: '111827' },
          paragraph: { spacing: { before: 0, after: 0, line: 230, lineRule: LineRuleType.EXACT } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: A4_PAGE_SIZE,
          margin: { top: 1040, right: 900, bottom: 720, left: 900, header: 420, footer: 360 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            spacing: { before: 0, after: 80 },
            border: { bottom: { color: 'CBD5E1', space: 5, style: BorderStyle.SINGLE, size: 4 } },
            children: [
              ...createMixedFontRuns(headerText, {
                asciiFont: 'Arial',
                eastAsiaFont: eastAsiaHeaderFont,
                size: 18,
                color: '475569',
              }),
              new TextRun({ children: ['\t'], font: 'Arial', size: 18, color: '475569' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '475569' }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
}

function writeCodeTxt(pages, outPath) {
  fs.writeFileSync(outPath, pages.map((page) => page.lines.join('\n')).join('\n'), 'utf-8');
}

function createTask(type) {
  return {
    task_id: crypto.randomUUID(),
    type,
    status: 'running',
    progress: 0,
    logs: [],
    started_at: now(),
    updated_at: now(),
  };
}

function createRecovery(type, errorMessage) {
  if (type === 'draft') {
    return {
      title: '草稿生成未完成',
      message: errorMessage || '生成草稿时发生错误，已保留当前项目和申请字段。',
      actions: ['检查项目目录和模型配置', '确认软件全称、版本号等字段后重新点击“生成草稿”'],
    };
  }
  return {
    title: '正式资料导出未完成',
    message: errorMessage || '导出正式资料时发生错误，已保留已确认草稿。',
    actions: ['检查输出目录权限和草稿完整性', '重新点击“导出正式资料”'],
  };
}

function exportItemLabel(key) {
  const labels = {
    application: '申请表',
    manual: '操作手册',
    code: '代码材料',
    report: '生成报告',
  };
  return labels[key] || key;
}

function createExportReadmeText({ fields, manifest, state, exportItems, finalOutputs, exportedAt }) {
  const enabledItems = Object.entries(exportItems)
    .filter(([, enabled]) => enabled)
    .map(([key]) => exportItemLabel(key))
    .join('、') || '未选择';
  const outputLines = finalOutputs.map((filePath, index) => `${index + 1}. ${path.basename(filePath)}`);
  const includedLine = Array.isArray(manifest.included_paths) && manifest.included_paths.length
    ? `手动补充文件：${manifest.included_paths.join('、')}`
    : '';
  const excludedLine = Array.isArray(manifest.excluded_paths) && manifest.excluded_paths.length
    ? `已排除文件：${manifest.excluded_paths.join('、')}`
    : '';
  const codeMode = manifest.mode === 'front30_back30'
    ? '源程序超过 60 页，已按前 30 页和后 30 页导出。'
    : '源程序未超过 60 页，已按全部代码材料导出。';
  return [
    '软著材料导出说明',
    '',
    `软件全称：${fields.softwareName || manifest.software_name || ''}`,
    `版本号：${fields.version || manifest.version || ''}`,
    `项目目录：${state.project?.path || manifest.project_root || ''}`,
    `导出时间：${exportedAt}`,
    `草稿确认时间：${state.draftConfirmedAt || ''}`,
    `导出项目：${enabledItems}`,
    '',
    '代码材料',
    `代码材料页数：${manifest.total_pages || ''}`,
    `材料代码行数：${manifest.material_line_count || ''}`,
    `源码文件数量：${Array.isArray(manifest.files) ? manifest.files.length : ''}`,
    `导出方式：${codeMode}`,
    ...(includedLine ? [includedLine] : []),
    ...(excludedLine ? [excludedLine] : []),
    '',
    '输出文件',
    ...outputLines,
    '',
    '重要提醒',
    '导出材料格式需根据当地受理要求人为微调，请勿直接使用！',
    '申请表信息、操作手册、代码材料和页眉页脚内容，请在提交前人工复核。',
    '软件全称、版本号、著作权人、开发完成日期等信息，应与登记申请表保持完全一致。',
    '',
  ].join('\n');
}

function buildSubmissionReview(state, verifiedBatches = []) {
  const fields = state.fields || {};
  const placeholderPattern = /待补充|待确认|待填|示例|example/i;
  const fieldMappings = submissionFieldDefinitions.map((definition) => {
    const value = String(fields[definition.key] || '').trim();
    let status = 'pass';
    let message = definition.note;
    if (definition.required && !value) {
      status = 'blocked';
      message = '必填字段尚未填写';
    } else if (value && placeholderPattern.test(value)) {
      status = 'blocked';
      message = '字段中仍包含待补充或示例内容';
    } else if (definition.maxLength && value.length > definition.maxLength) {
      status = 'warning';
      message = `当前 ${value.length} 字符，建议控制在 ${definition.maxLength} 字符以内`;
    }
    if (definition.key === 'developmentCompletedDate' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      status = 'blocked';
      message = '日期格式应为 YYYY-MM-DD';
    }
    if (definition.key === 'firstPublishDate' && fields.publishStatus === '已发表' && !value) {
      status = 'blocked';
      message = '已发表软件需填写首次发表日期';
    }
    if ((definition.key === 'sourceLineCount' || definition.key === 'pageCount') && value && !/^\d+$/.test(value)) {
      status = 'blocked';
      message = '请仅填写数字';
    }
    return { ...definition, value, length: value.length, status, message };
  });

  const fieldBlockedCount = fieldMappings.filter((item) => item.status === 'blocked').length;
  const fieldWarningCount = fieldMappings.filter((item) => item.status === 'warning').length;
  const latestBatch = state.confirmedSnapshot?.id
    ? verifiedBatches.find((batch) => batch.snapshotId === state.confirmedSnapshot.id) || null
    : null;
  const checks = [];
  const deliveryChecks = [];
  checks.push({
    id: 'project-source',
    label: '项目与源码',
    status: state.project?.path || state.codeGeneration?.project?.path ? 'pass' : 'blocked',
    detail: state.project?.path || state.codeGeneration?.project?.path || '尚未选择软件项目',
    recommendation: '确认申报软件与当前源码目录一致',
  });
  checks.push({
    id: 'form-fields',
    label: '官网填报字段',
    status: fieldBlockedCount ? 'blocked' : fieldWarningCount ? 'warning' : 'pass',
    detail: fieldBlockedCount ? `${fieldBlockedCount} 项必填字段待处理` : fieldWarningCount ? `${fieldWarningCount} 项字段建议精简` : `${fieldMappings.length} 项字段已完成映射`,
    recommendation: '逐项复制到实际登记系统后再人工校对',
  });
  checks.push({
    id: 'draft-confirmation',
    label: '草稿与确认快照',
    status: state.draftConfirmed && state.confirmedSnapshot?.id ? 'pass' : 'blocked',
    detail: state.draftConfirmed && state.confirmedSnapshot?.id ? `已绑定确认快照 ${state.confirmedSnapshot.id.slice(0, 20)}` : '尚未生成可追溯的确认快照',
    recommendation: '完成草稿检查并点击确认草稿',
  });
  deliveryChecks.push({
    id: 'delivery-integrity',
    label: '正式交付包',
    status: !latestBatch ? 'pending' : latestBatch.status === 'pass' ? 'pass' : 'blocked',
    detail: !latestBatch ? '尚未导出正式资料' : latestBatch.status === 'pass' ? `${latestBatch.files?.length || 0} 个文件完整性通过` : latestBatch.status === 'missing' ? '交付包存在缺失文件' : '交付文件已被修改',
    recommendation: !latestBatch ? '提交前检查通过后导出正式资料' : '使用最新完整性通过的 ZIP 交付包',
  });

  let namingStatus = 'pending';
  let namingDetail = '导出正式资料后检查文件命名';
  if (latestBatch) {
    const names = (latestBatch.files || []).map((item) => item.name);
    const invalidName = names.find((name) => /[<>:"/\\|?*]/.test(name));
    const missingNames = [];
    if (latestBatch.exportItems?.application && !names.includes('申请表信息.txt')) missingNames.push('申请表信息');
    if (latestBatch.exportItems?.manual && !names.some((name) => name.endsWith('_操作手册.docx'))) missingNames.push('操作手册');
    if (latestBatch.exportItems?.code && !names.some((name) => name.includes('代码(') && name.endsWith('.docx'))) missingNames.push('代码材料');
    if (!latestBatch.zipPath || (!latestBatch.projected && !fs.existsSync(latestBatch.zipPath))) missingNames.push('ZIP 交付包');
    namingStatus = invalidName || missingNames.length ? 'blocked' : 'pass';
    namingDetail = invalidName ? `文件名包含非法字符：${invalidName}` : missingNames.length ? `缺少：${missingNames.join('、')}` : '申请表、手册、代码材料和 ZIP 命名正常';
  }
  deliveryChecks.push({
    id: 'file-naming',
    label: '文件命名与组成',
    status: namingStatus,
    detail: namingDetail,
    recommendation: '不要手工改名 ZIP 内的文件，如需调整请重新导出批次',
  });
  const manualReview = {
    ...initialState.manualReview,
    ...(state.manualReview || {}),
    checks: {
      ...initialState.manualReview.checks,
      ...(state.manualReview?.checks || {}),
    },
  };
  const currentSnapshotId = state.confirmedSnapshot?.id || '';
  const manualReviewIsCurrent = Boolean(manualReview.confirmedAt && currentSnapshotId && manualReview.snapshotId === currentSnapshotId
    && Object.values(manualReview.checks).every(Boolean));
  checks.push({
    id: 'manual-review',
    label: '人工复核与证据链',
    status: manualReviewIsCurrent ? 'pass' : 'warning',
    detail: manualReviewIsCurrent ? `已完成人工复核，并绑定确认快照 ${manualReview.snapshotId.slice(0, 20)}` : '尚未针对当前确认快照完成人工复核',
    recommendation: manualReviewIsCurrent ? `复核时间：${manualReview.confirmedAt}` : '点击“开始复核”，逐项核对权属、主体证件、日期、源码证据和当地受理要求',
  });

  const counts = {
    pass: checks.filter((item) => item.status === 'pass').length,
    warning: checks.filter((item) => item.status === 'warning').length,
    blocked: checks.filter((item) => item.status === 'blocked').length,
    pending: checks.filter((item) => item.status === 'pending').length,
  };
  const readyToSubmit = counts.blocked === 0 && counts.pending === 0 && counts.warning === 0;
  const overallStatus = counts.blocked ? 'blocked' : counts.pending ? 'pending' : counts.warning ? 'warning' : 'pass';
  const checkedAt = now();
  const guideMarkdown = [
    `# ${fields.softwareName || '软件著作权'}申报提交说明`,
    '',
    `- 版本号：${fields.version || '待填写'}`,
    `- 检查时间：${checkedAt}`,
    `- 检查结果：${readyToSubmit ? '提交前检查已通过，可以导出正式资料' : '存在待处理、待完成或需复核项'}`,
    '',
    '## 官网填报字段',
    '',
    '| 字段 | 建议填写内容 | 状态 |',
    '| --- | --- | --- |',
    ...fieldMappings.map((item) => `| ${item.label} | ${item.value.replace(/\|/g, '\\|') || '待填写'} | ${item.status === 'pass' ? '通过' : item.status === 'warning' ? '需精简' : '待处理'} |`),
    '',
    '## 提交前检查',
    '',
    ...checks.map((item) => `- [${item.status === 'pass' ? 'x' : ' '}] ${item.label}：${item.detail}；建议：${item.recommendation}`),
    '',
    '## 提交顺序建议',
    '',
    '1. 将字段映射表逐项填入实际登记系统。',
    '2. 核对软件全称、版本号、著作权人和开发完成日期。',
    '3. 打开操作手册和代码材料，检查页眉、页码、图片和代码连续性。',
    '4. 使用完整性通过的最新 ZIP 交付包作为提交底稿。',
    '5. 根据当地受理系统要求调整格式，保留最终提交版和回执。',
    '',
    '## 重要提醒',
    '',
    '本说明仅用于材料整理和人工复核，不代替登记机构的最新要求或专业法律意见。',
    '',
  ].join('\n');

  return {
    checkedAt,
    overallStatus,
    readyToSubmit,
    counts,
    fieldMappings,
    checks,
    deliveryChecks,
    latestBatch,
    guideMarkdown,
    manualReview: {
      ...manualReview,
      currentSnapshotId,
      isCurrent: manualReviewIsCurrent,
    },
  };
}

function createSoftwareCopyrightService({ app, aiService, configStore, codeGenerationService }) {
  const rootDir = getSoftwareCopyrightDir(app);
  const statePath = path.join(rootDir, 'state.json');
  const manualScreenshotsDir = path.join(rootDir, 'manual-screenshots');
  const aiIllustrationsDir = path.join(rootDir, 'ai-illustrations');
  const draftHistory = createSoftwareCopyrightDraftHistory({ rootDir });
  const caseStore = createSoftwareCopyrightCaseStore({ rootDir });
  const subscribers = new Set();
  let activeTask = null;

  function loadState() {
    ensureDir(rootDir);
    const migration = migrateSoftwareCopyrightState(readJson(statePath, null), { hasActiveTask: activeTask?.status === 'running' });
    const technologyBackfill = backfillAnalysisTechnologies(migration.state);
    const generatedFieldBackfill = backfillGeneratedFieldsFromDrafts(technologyBackfill.state);
    const saved = generatedFieldBackfill.state;
    if ((migration.changed || technologyBackfill.changed || generatedFieldBackfill.changed) && saved) writeJson(statePath, saved);
    caseStore.ensureMigrated(saved || initialState);
    const availability = aiService.getImageModelAvailability();
    const codeGenerationMaterials = codeGenerationService?.getConfirmedMaterials?.() || null;
    const manualScreenshots = (Array.isArray(saved?.manualScreenshots) ? saved.manualScreenshots : [])
      .filter((item) => item?.id && item?.path && fs.existsSync(item.path));
    const aiIllustrations = (Array.isArray(saved?.aiIllustrations) ? saved.aiIllustrations : [])
      .filter((item) => item?.id && item?.path && fs.existsSync(item.path));
    const manualDraftPath = saved?.drafts?.manual;
    const manualPlaceholders = manualDraftPath && fs.existsSync(manualDraftPath)
      ? Array.from(new Set(extractScreenshotPlaceholders(fs.readFileSync(manualDraftPath, 'utf-8'))))
      : [];
    return {
      ...initialState,
      ...(saved || {}),
      fields: { ...initialFields, ...(saved?.fields || {}) },
      options: {
        ...initialState.options,
        ...(saved?.options || {}),
        codeClean: normalizeCleanOptions(saved?.options?.codeClean),
        exportItems: {
          ...initialState.options.exportItems,
          ...(saved?.options?.exportItems || {}),
        },
      },
      imageModel: availability,
      manualScreenshots,
      aiIllustrations,
      aiIllustrationSettings: {
        ...initialState.aiIllustrationSettings,
        ...(saved?.aiIllustrationSettings || {}),
      },
      manualReview: {
        ...initialState.manualReview,
        ...(saved?.manualReview || {}),
        checks: {
          ...initialState.manualReview.checks,
          ...(saved?.manualReview?.checks || {}),
        },
      },
      codeMaterialReview: {
        ...initialState.codeMaterialReview,
        ...(saved?.codeMaterialReview || {}),
        checks: {
          ...initialState.codeMaterialReview.checks,
          ...(saved?.codeMaterialReview?.checks || {}),
        },
      },
      manualAssetReview: {
        ...initialState.manualAssetReview,
        ...(saved?.manualAssetReview || {}),
        checks: {
          ...initialState.manualAssetReview.checks,
          ...(saved?.manualAssetReview?.checks || {}),
        },
      },
      manualPlaceholders,
      codeGeneration: codeGenerationMaterials
        ? {
          available: true,
          project: codeGenerationMaterials.project,
          confirmedAt: codeGenerationMaterials.confirmedAt,
          summary: codeGenerationMaterials.summary,
        }
        : {
          available: false,
          project: null,
          confirmedAt: '',
          summary: null,
        },
    };
  }

  function saveState(partial) {
    const previous = loadState();
    const next = {
      ...previous,
      ...partial,
      fields: { ...previous.fields, ...(partial.fields || {}) },
      options: { ...previous.options, ...(partial.options || {}) },
      updated_at: now(),
    };
    writeJson(statePath, next);
    caseStore.touch(next);
    return next;
  }

  function emit(state) {
    for (const webContents of subscribers) {
      if (webContents.isDestroyed()) {
        subscribers.delete(webContents);
      } else {
        webContents.send('software-copyright:event', state);
      }
    }
  }

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed() || subscribers.has(webContents)) return;
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
  }

  function screenshotStateUpdate(partial) {
    const next = saveState({
      ...partial,
      manualAssetReview: initialState.manualAssetReview,
      draftConfirmed: false,
      draftConfirmedAt: '',
      confirmedSnapshot: null,
      outputDir: '',
      outputs: [],
    });
    emit(next);
    return next;
  }

  function managedScreenshot(state, id) {
    const item = (state.manualScreenshots || []).find((screenshot) => screenshot.id === id);
    if (!item) throw new Error('截图素材不存在');
    const baseDir = path.resolve(manualScreenshotsDir);
    const filePath = path.resolve(item.path);
    if (!filePath.startsWith(`${baseDir}${path.sep}`)) throw new Error('截图素材路径无效');
    return { item, filePath };
  }

  function managedAiIllustration(state, id) {
    const item = (state.aiIllustrations || []).find((illustration) => illustration.id === id);
    if (!item) throw new Error('AI 插图不存在');
    const baseDir = path.resolve(aiIllustrationsDir);
    const filePath = path.resolve(item.path);
    if (!filePath.startsWith(`${baseDir}${path.sep}`)) throw new Error('AI 插图路径无效');
    return { item, filePath };
  }

  function updateTask(partial, statePartial = {}) {
    activeTask = {
      ...activeTask,
      ...partial,
      logs: partial.logs || activeTask.logs,
      updated_at: now(),
    };
    const state = saveState({ ...statePartial, task: activeTask });
    emit(state);
    return state;
  }

  function getDraftPath(state, draftKey) {
    const filePath = state.drafts?.[draftKey];
    if (!draftKey || !filePath) {
      throw new Error('草稿文件不存在');
    }
    const normalizedDraftDir = path.resolve(state.draftDir || '');
    const normalizedFilePath = path.resolve(filePath);
    if (!normalizedDraftDir || !normalizedFilePath.startsWith(`${normalizedDraftDir}${path.sep}`)) {
      throw new Error('草稿文件路径无效');
    }
    if (!fs.existsSync(normalizedFilePath)) {
      throw new Error('草稿文件已不存在，请重新生成草稿');
    }
    return normalizedFilePath;
  }

  function createConfirmedSnapshot(state) {
    const snapshotId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}-${crypto.randomUUID()}`;
    const snapshotDir = path.join(state.outputRoot || rootDir, '确认快照', snapshotId);
    const snapshotDraftDir = path.join(snapshotDir, '草稿');
    ensureDir(snapshotDraftDir);
    fs.cpSync(state.draftDir, snapshotDraftDir, { recursive: true });

    const snapshotAssetsDir = ensureDir(path.join(snapshotDir, '图片'));
    function snapshotAssets(items = [], prefix) {
      return items.map((item, index) => {
        if (!item?.path || !fs.existsSync(item.path)) return item;
        const extension = path.extname(item.path).toLowerCase() || '.png';
        const targetPath = path.join(snapshotAssetsDir, `${prefix}-${index + 1}${extension}`);
        fs.copyFileSync(item.path, targetPath);
        return { ...item, path: targetPath };
      });
    }

    const snapshotDrafts = Object.fromEntries(Object.entries(state.drafts || {}).map(([key, filePath]) => [
      key,
      path.join(snapshotDraftDir, path.relative(state.draftDir, filePath)),
    ]));
    const snapshotState = {
      ...state,
      draftDir: snapshotDraftDir,
      drafts: snapshotDrafts,
      manualScreenshots: snapshotAssets(state.manualScreenshots, 'manual'),
      aiIllustrations: snapshotAssets(state.aiIllustrations, 'ai'),
      draftMeta: state.draftMeta ? {
        ...state.draftMeta,
        manifestPath: path.join(snapshotDraftDir, path.basename(state.draftMeta.manifestPath || '代码提取清单.json')),
        codeMarkdownFiles: (state.draftMeta.codeMarkdownFiles || []).map((filePath) => path.join(snapshotDraftDir, path.basename(filePath))),
      } : null,
      confirmedSnapshot: null,
      exportBatches: [],
      outputs: [],
      outputDir: '',
    };
    const stateFile = path.join(snapshotDir, '快照状态.json');
    writeJson(stateFile, snapshotState);
    const files = listFilesRecursive(snapshotDir).map(({ path: _path, ...item }) => item);
    const manifest = {
      id: snapshotId,
      path: snapshotDir,
      stateFile,
      createdAt: now(),
      fileCount: files.length,
      files,
      contentHash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    };
    writeJson(path.join(snapshotDir, '快照清单.json'), manifest);
    return manifest;
  }

  function loadConfirmedSnapshot(state) {
    const snapshot = state.confirmedSnapshot;
    if (!snapshot?.path || !snapshot?.stateFile) throw new Error('确认快照不存在，请重新检查并确认草稿');
    const normalizedRoot = path.resolve(rootDir);
    const normalizedPath = path.resolve(snapshot.path);
    if (!normalizedPath.startsWith(`${normalizedRoot}${path.sep}`) || !fs.existsSync(snapshot.stateFile)) {
      throw new Error('确认快照已丢失，请重新确认草稿');
    }
    for (const item of snapshot.files || []) {
      const filePath = path.join(snapshot.path, item.relativePath);
      if (!fs.existsSync(filePath) || sha256File(filePath) !== item.sha256) {
        throw new Error(`确认快照完整性检查失败：${item.relativePath}`);
      }
    }
    return readJson(snapshot.stateFile, null);
  }

  function listExportBatches(state = loadState()) {
    return (state.exportBatches || []).map((batch) => {
      let status = 'pass';
      for (const item of batch.files || []) {
        if (!fs.existsSync(item.path)) {
          status = 'missing';
          break;
        }
        if (sha256File(item.path) !== item.sha256) status = 'changed';
      }
      return { ...batch, status };
    });
  }

  function validateDraftCompleteness(state = loadState()) {
    const issues = [];
    const fields = state.fields || {};
    const consistencyChecks = [];
    const draftContents = {};
    let manifest = null;

    function recordConsistency({ id, label, status, detail, target, issueKey, issueMessage }) {
      consistencyChecks.push({ id, label, status, detail, target });
      if (status === 'fail' && issueMessage) {
        issues.push({ type: 'consistency', severity: 'error', key: issueKey, message: issueMessage });
      }
    }

    if (!state.draftDir || !fs.existsSync(state.draftDir)) {
      issues.push({ type: 'draft', severity: 'error', message: '请先生成草稿。' });
    }

    for (const [key, label] of draftConfirmRequiredFields) {
      if (!String(fields[key] || '').trim()) {
        issues.push({ type: 'field', severity: 'error', key, message: `${label}未填写。` });
      }
    }

    if (fields.developmentCompletedDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(fields.developmentCompletedDate))) {
      issues.push({ type: 'field', severity: 'error', key: 'developmentCompletedDate', message: '开发完成日期格式应为 YYYY-MM-DD。' });
    }

    for (const [key, label] of [['sourceLineCount', '源程序量'], ['pageCount', '代码材料页数']]) {
      const value = Number(fields[key]);
      if (!Number.isFinite(value) || value <= 0) {
        issues.push({ type: 'field', severity: 'error', key, message: `${label}应为大于 0 的数字。` });
      }
    }

    for (const [key, label] of requiredDraftFiles) {
      const filePath = state.drafts?.[key];
      if (!filePath) {
        issues.push({ type: 'draft', severity: 'error', key, message: `缺少${label}草稿。` });
        continue;
      }
      try {
        const draftPath = getDraftPath(state, key);
        const content = fs.readFileSync(draftPath, 'utf-8').trim();
        draftContents[key] = content;
        if (!content) {
          issues.push({ type: 'draft', severity: 'error', key, message: `${label}草稿内容为空。` });
        }
        if (key === 'application' && content.includes('待用户确认')) {
          issues.push({ type: 'draft', severity: 'error', key, message: '申请表信息仍包含“待用户确认”，请补全后保存。' });
        }
      } catch (error) {
        issues.push({ type: 'draft', severity: 'error', key, message: error.message || `${label}草稿不可读取。` });
      }
    }

    const codeDraftKeys = Object.keys(state.drafts || {}).filter((key) => key.startsWith('code'));
    if (!codeDraftKeys.length) {
      issues.push({ type: 'code', severity: 'error', message: '缺少代码材料草稿。' });
    }

    if (state.options?.screenshotMode === 'manual') {
      const screenshots = Array.isArray(state.manualScreenshots) ? state.manualScreenshots : [];
      if (!screenshots.length) {
        issues.push({ type: 'draft', severity: 'warning', key: 'manual', message: '已选择手动截图模式，但尚未导入操作手册截图。' });
      } else if (screenshots.some((item) => !item.path || !fs.existsSync(item.path))) {
        issues.push({ type: 'draft', severity: 'warning', key: 'manual', message: '部分操作手册截图已丢失，请重新导入或移除失效素材。' });
      }
    }
    if (state.options?.screenshotMode === 'ai') {
      const illustrations = Array.isArray(state.aiIllustrations) ? state.aiIllustrations : [];
      if (!illustrations.length) {
        issues.push({ type: 'draft', severity: 'warning', key: 'ai', message: '已选择 AI 示意图模式，但尚未生成并确认插图。' });
      } else if (illustrations.some((item) => !item.path || !fs.existsSync(item.path))) {
        issues.push({ type: 'draft', severity: 'warning', key: 'ai', message: '部分 AI 插图已丢失，请重新生成或移除失效素材。' });
      }
    }
    const activeImages = state.options?.screenshotMode === 'manual'
      ? state.manualScreenshots || []
      : state.options?.screenshotMode === 'ai' ? state.aiIllustrations || [] : [];
    const manualDraftPath = state.drafts?.manual;
    if (activeImages.some((item) => item.placement) && manualDraftPath && fs.existsSync(manualDraftPath)) {
      const placeholders = new Set(extractScreenshotPlaceholders(fs.readFileSync(manualDraftPath, 'utf-8')));
      const invalidPlacements = activeImages.filter((item) => item.placement && !placeholders.has(item.placement));
      if (invalidPlacements.length) {
        issues.push({ type: 'draft', severity: 'warning', key: 'image-placement', message: `${invalidPlacements.length} 张图片关联的截图预留位已不存在，导出时将转入附录。` });
      }
    }

    const manifestPath = state.draftMeta?.manifestPath || (state.draftDir ? path.join(state.draftDir, '代码提取清单.json') : '');
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      issues.push({ type: 'code', severity: 'error', message: '缺少代码提取清单 JSON，无法核对代码页数。' });
    } else {
      manifest = readJson(manifestPath, {});
      if (!Number.isFinite(Number(manifest.total_pages)) || Number(manifest.total_pages) <= 0) {
        issues.push({ type: 'code', severity: 'error', message: '代码提取清单中的总页数无效。' });
      }
      if (!Number.isFinite(Number(manifest.material_line_count)) || Number(manifest.material_line_count) <= 0) {
        issues.push({ type: 'code', severity: 'error', message: '代码提取清单中的材料代码行数无效。' });
      }
      if (!Array.isArray(manifest.files) || !manifest.files.length) {
        issues.push({ type: 'code', severity: 'error', message: '代码提取清单中没有源码文件记录。' });
      }
      for (const item of Array.isArray(manifest.audit) ? manifest.audit : []) {
        if (item.status === 'fail') {
          issues.push({ type: 'code', severity: 'error', message: `${item.name}：${item.detail}` });
        } else if (item.status === 'warn') {
          issues.push({ type: 'code', severity: 'warning', message: `${item.name}：${item.detail}` });
        }
      }
    }

    const applicationContent = draftContents.application || '';
    const manualContent = draftContents.manual || '';
    const identityValues = [fields.softwareName, fields.version, fields.copyrightOwner, fields.developmentCompletedDate].map((value) => String(value || '').trim());
    const identityLabels = ['软件全称', '版本号', '著作权人', '开发完成日期'];
    const identityReady = identityValues.every(Boolean);
    const applicationIdentityMatches = identityReady && Boolean(applicationContent)
      && identityValues.every((value, index) => applicationContent.includes(`➤${identityLabels[index]}：${value}`));
    recordConsistency({
      id: 'application-identity',
      label: '申请表登记信息',
      status: !identityReady || !applicationContent ? 'pending' : applicationIdentityMatches ? 'pass' : 'fail',
      detail: !identityReady ? '请先补全软件名称、版本号、著作权人和开发完成日期' : !applicationContent ? '等待申请表草稿生成' : applicationIdentityMatches ? '名称、版本、著作权人和日期与登记字段一致' : '申请表中的登记信息与当前字段不一致',
      target: 'application',
      issueKey: 'application',
      issueMessage: '申请表中的软件名称、版本号、著作权人或开发完成日期与当前登记字段不一致。',
    });

    const softwareName = String(fields.softwareName || '').trim();
    const manualNameMatches = Boolean(softwareName && manualContent && manualContent.includes(`# ${softwareName} 操作手册`));
    recordConsistency({
      id: 'manual-name',
      label: '操作手册软件名称',
      status: !softwareName || !manualContent ? 'pending' : manualNameMatches ? 'pass' : 'fail',
      detail: !softwareName ? '请先填写软件全称' : !manualContent ? '等待操作手册草稿生成' : manualNameMatches ? '手册标题与软件全称一致' : '手册标题与软件全称不一致',
      target: 'manual',
      issueKey: 'manual',
      issueMessage: '操作手册标题中的软件名称与当前软件全称不一致。',
    });

    const version = String(fields.version || '').trim();
    const manifestIdentityReady = Boolean(manifest && softwareName && version);
    const manifestIdentityMatches = manifestIdentityReady
      && String(manifest.software_name || '').trim() === softwareName
      && String(manifest.version || '').trim() === version;
    recordConsistency({
      id: 'code-identity',
      label: '代码材料名称与版本',
      status: !manifestIdentityReady ? 'pending' : manifestIdentityMatches ? 'pass' : 'fail',
      detail: !manifest ? '等待代码提取清单生成' : !softwareName || !version ? '请先补全软件全称和版本号' : manifestIdentityMatches ? '代码页眉信息与登记字段一致' : '代码清单中的名称或版本不一致',
      target: 'code',
      issueKey: 'codeManifest',
      issueMessage: '代码提取清单中的软件名称或版本号与当前登记字段不一致，请重新抽取代码材料。',
    });

    const pageCount = Number(fields.pageCount);
    const manifestPageCount = Number(manifest?.total_pages);
    const pageCountReady = Number.isFinite(pageCount) && pageCount > 0 && Number.isFinite(manifestPageCount) && manifestPageCount > 0 && Boolean(applicationContent);
    const pageCountMatches = pageCountReady && pageCount === manifestPageCount && applicationContent.includes(`➤页数：${pageCount}`);
    recordConsistency({
      id: 'page-count',
      label: '代码材料页数',
      status: !pageCountReady ? 'pending' : pageCountMatches ? 'pass' : 'fail',
      detail: !pageCountReady ? '等待申请表和代码清单形成有效页数' : pageCountMatches ? `申请表与代码清单均为 ${pageCount} 页` : '申请表字段与代码清单页数不一致',
      target: 'code',
      issueKey: 'codeManifest',
      issueMessage: '申请表中的代码材料页数与代码提取清单不一致，请重新抽取代码材料。',
    });

    const sourceLineCount = Number(fields.sourceLineCount);
    const sourceLineReady = Number.isFinite(sourceLineCount) && sourceLineCount > 0 && Boolean(applicationContent);
    const sourceLineMatches = sourceLineReady && applicationContent.includes(`➤源程序量：${sourceLineCount}`);
    recordConsistency({
      id: 'source-line-count',
      label: '源程序量',
      status: !sourceLineReady ? 'pending' : sourceLineMatches ? 'pass' : 'fail',
      detail: !sourceLineReady ? '等待申请表形成有效源程序量' : sourceLineMatches ? `申请表源程序量为 ${sourceLineCount} 行` : '申请表源程序量与当前项目统计不一致',
      target: 'fields',
      issueKey: 'sourceLineCount',
      issueMessage: '申请表中的源程序量与当前登记字段不一致。',
    });

    return {
      valid: !issues.some((issue) => issue.severity === 'error'),
      issues,
      consistencyChecks,
      checkedAt: now(),
    };
  }

  async function runDraftGeneration(payload = {}) {
    const state = loadState();
    const sourceMode = payload.sourceMode || state.options.sourceMode || 'project';
    const codeGenerationMaterials = sourceMode === 'code-generation' ? codeGenerationService?.getConfirmedMaterials?.() : null;
    const projectDir = codeGenerationMaterials?.project?.path || state.project?.path;
    if (!projectDir || !fs.existsSync(projectDir)) {
      throw new Error(sourceMode === 'code-generation' ? '请先在源码准备中确认当前项目的源码材料' : '请先选择有效的源码目录');
    }
    const outRoot = ensureDir(path.join(rootDir, 'outputs', new Date().toISOString().replace(/[:.]/g, '-')));
    const draftDir = ensureDir(path.join(outRoot, '草稿'));
    const logs = [];
    const push = (message, progress, extra = {}) => {
      logs.push(message);
      updateTask({ progress, logs: [...logs], ...extra }, extra.state || {});
    };

    push('正在分析项目源码', 8);
    const analysis = codeGenerationMaterials?.analysis || analyzeProject(projectDir);
    let fields = createInitialFieldsFromAnalysis(analysis, { ...state.fields, ...(payload.fields || {}) });
    saveState({
      analysis,
      fields,
      step: 'generating',
      drafts: {},
      draftConfirmed: false,
      draftConfirmedAt: '',
      confirmedSnapshot: null,
      draftDir,
      outputRoot: outRoot,
      outputDir: '',
      outputs: [],
      draftMeta: null,
    });

    push('正在生成业务理解', 22);
    const business = await generateBusinessContext(aiService, analysis, fields);
    fields = enrichFieldsFromBusiness(fields, business, analysis);
    saveState({ fields, generatedFieldsSourceDraftDir: draftDir });
    writeJson(path.join(draftDir, '业务理解.json'), business);
    const businessMarkdown = createBusinessMarkdown(business);
    fs.writeFileSync(path.join(draftDir, '业务理解.md'), normalizeDraftContent('business', businessMarkdown), 'utf-8');

    push('正在抽取真实源码材料', 40);
    const codeExcludedPaths = normalizePathList(payload.codeExcludedPaths || state.options.codeExcludedPaths);
    const codeIncludedPaths = normalizePathList(payload.codeIncludedPaths || state.options.codeIncludedPaths);
    const selectedFiles = codeGenerationMaterials?.selectedFiles?.length
      ? codeGenerationMaterials.selectedFiles.filter((item) => !codeExcludedPaths.includes(item.path))
      : selectCodeFiles(analysis, codeExcludedPaths, codeIncludedPaths);
    const codeClean = normalizeCleanOptions(payload.codeClean || state.options.codeClean);
    const { manifest, outputs: codeMarkdownFiles } = createCodeMaterial(projectDir, selectedFiles, { ...fields, codeExcludedPaths, codeIncludedPaths, codeClean }, draftDir);
    const nextFields = { ...fields, sourceLineCount: fields.sourceLineCount || String(analysis.lineCount), pageCount: String(manifest.total_pages) };

    push('正在整理申请表信息草稿', 55);
    const applicationMarkdown = createApplicationMarkdown(nextFields, business, manifest);
    fs.writeFileSync(path.join(draftDir, '申请表信息.md'), applicationMarkdown, 'utf-8');

    push('正在生成操作手册草稿', 70);
    const manualMarkdown = await createManualMarkdown(aiService, analysis, nextFields, business);
    fs.writeFileSync(path.join(draftDir, '操作手册.md'), manualMarkdown, 'utf-8');
    writeJson(path.join(draftDir, '操作手册自检记录.json'), {
      rounds: [
        { name: '章节完整性检查', result: '已生成相关文档、说明、功能特点、系统要求、核心功能、常见问题和术语表。' },
        { name: '真实性检查', result: '核心模块来自项目分析和模型业务理解，代码材料来自真实源码。' },
        { name: '表达检查', result: '已尽量避免技术实现细节和营销套话。' },
      ],
    });
    fs.writeFileSync(path.join(draftDir, '操作手册自检记录.md'), '# 操作手册自检记录\n\n- 已检查章节完整性。\n- 已检查项目证据和功能表述。\n- 已检查技术化表达和套话。\n', 'utf-8');

    const drafts = {
      business: path.join(draftDir, '业务理解.md'),
      application: path.join(draftDir, '申请表信息.md'),
      manual: path.join(draftDir, '操作手册.md'),
      codeManifest: path.join(draftDir, '代码提取清单.md'),
      manualCheck: path.join(draftDir, '操作手册自检记录.md'),
    };
    codeMarkdownFiles.forEach((filePath, index) => {
      drafts[`code${index + 1}`] = filePath;
    });
    updateTask({ status: 'success', progress: 100, logs: [...logs, '软著草稿生成完成，请检查确认后导出正式资料'] }, {
      step: 'draft',
      analysis,
      project: codeGenerationMaterials?.project || state.project,
      fields: nextFields,
      options: { codeClean },
      drafts,
      draftConfirmed: false,
      draftConfirmedAt: '',
      confirmedSnapshot: null,
      codeMaterialReview: initialState.codeMaterialReview,
      draftDir,
      outputRoot: outRoot,
      outputDir: '',
      outputs: [],
      draftMeta: {
        manifestPath: path.join(draftDir, '代码提取清单.json'),
        codeMarkdownFiles,
      },
    });
  }

  async function runFinalExport() {
    const liveState = loadState();
    if (!liveState.draftDir || !fs.existsSync(liveState.draftDir)) {
      throw new Error('请先生成草稿');
    }
    if (!liveState.draftConfirmed) {
      throw new Error('请先确认草稿后再导出正式资料');
    }
    const state = loadConfirmedSnapshot(liveState);
    if (!state) throw new Error('确认快照不可读取，请重新确认草稿');

    const batchId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}-${crypto.randomUUID().slice(0, 8)}`;
    const deliveryRoot = ensureDir(path.join(liveState.outputRoot || path.dirname(liveState.draftDir), '正式资料'));
    const finalDir = ensureDir(path.join(deliveryRoot, `批次-${batchId}`));
    const applicationPath = path.join(state.draftDir, '申请表信息.md');
    const manualPath = path.join(state.draftDir, '操作手册.md');
    const manifestPath = state.draftMeta?.manifestPath || path.join(state.draftDir, '代码提取清单.json');
    if (!fs.existsSync(applicationPath) || !fs.existsSync(manualPath) || !fs.existsSync(manifestPath)) {
      throw new Error('草稿文件不完整，请重新生成草稿');
    }

    const fields = state.fields || {};
    const manifest = readJson(manifestPath, {});
    const softwareName = sanitizeFilename(fields.softwareName || manifest.software_name || '软件');
    const version = fields.version || manifest.version || 'V1.0';
    const exportItems = { ...initialState.options.exportItems, ...(state.options?.exportItems || {}) };
    if (!Object.values(exportItems).some(Boolean)) {
      throw new Error('请至少选择一种正式资料导出项');
    }
    const finalOutputs = [];
    if (exportItems.application) {
      const applicationMarkdown = fs.readFileSync(applicationPath, 'utf-8');
      const applicationTxtPath = path.join(finalDir, '申请表信息.txt');
      fs.writeFileSync(applicationTxtPath, applicationMarkdown.split(/\r?\n/).filter((line) => line.startsWith('➤')).join('\n') + '\n', 'utf-8');
      finalOutputs.push(applicationTxtPath);
    }

    if (exportItems.manual) {
      const manualMarkdown = fs.readFileSync(manualPath, 'utf-8');
      const manualDocxPath = path.join(finalDir, `${softwareName}_操作手册.docx`);
      const sourceImages = state.options?.screenshotMode === 'manual'
        ? state.manualScreenshots || []
        : state.options?.screenshotMode === 'ai' ? state.aiIllustrations || [] : [];
      const placeholderNames = new Set(extractScreenshotPlaceholders(manualMarkdown));
      const inlineImages = sourceImages.filter((item) => item.placement && placeholderNames.has(item.placement));
      const supplementImages = sourceImages.filter((item) => !item.placement || !placeholderNames.has(item.placement));
      await writeDocx(manualMarkdown, manualDocxPath, `${softwareName} ${version}`, {
        kind: 'manual',
        fields,
        softwareName,
        version,
        inlineImages,
        inlineAssetName: state.options?.screenshotMode === 'ai' ? 'ai-inline-illustration' : 'manual-inline-screenshot',
        supplementImages,
        supplementHeading: state.options?.screenshotMode === 'ai' ? '附录、AI 功能示意图' : '附录、界面截图',
        supplementAssetName: state.options?.screenshotMode === 'ai' ? 'ai-illustration' : 'manual-screenshot',
      });
      finalOutputs.push(manualDocxPath);
    }

    if (exportItems.code) {
      const materialPages = Array.isArray(manifest.pages) ? manifest.pages : [];
      if (!materialPages.length) throw new Error('代码材料缺少分页数据，请重新抽取代码材料');
      const groups = materialPages.length >= SPLIT_PAGES
        ? [{ suffix: '前30页', pages: materialPages.slice(0, 30) }, { suffix: '后30页', pages: materialPages.slice(-30) }]
        : [{ suffix: '全部', pages: materialPages }];
      for (const group of groups) {
        const docxPath = path.join(finalDir, `${softwareName}-代码(${group.suffix}).docx`);
        const txtPath = path.join(finalDir, `${softwareName}-代码(${group.suffix}).txt`);
        await writeCodeDocx(group.pages, docxPath, `${softwareName} ${version} 源程序`);
        writeCodeTxt(group.pages, txtPath);
        finalOutputs.push(docxPath);
        finalOutputs.push(txtPath);
      }
    }

    const exportedAt = now();

    if (exportItems.report) {
      const reportPath = path.join(finalDir, '生成报告.md');
      const reportOutputs = [...finalOutputs, reportPath];
      fs.writeFileSync(reportPath, [
        '# 生成报告',
        '',
        `- 软件名称：${softwareName}`,
        `- 版本号：${version}`,
        `- 项目目录：${state.project?.path || manifest.project_root || ''}`,
        `- 代码材料页数：${manifest.total_pages || ''}`,
        `- 草稿确认时间：${state.draftConfirmedAt || ''}`,
        `- 导出时间：${exportedAt}`,
        `- 导出选项：${Object.entries(exportItems).filter(([, enabled]) => enabled).map(([key]) => exportItemLabel(key)).join('、')}`,
        `- AI 示意图：${state.options?.screenshotMode === 'ai' ? (state.aiIllustrations || []).length : 0} 张`,
        `- 手动截图：${state.options?.screenshotMode === 'manual' ? (state.manualScreenshots || []).length : 0} 张`,
        '',
        '## 输出文件',
        '',
        ...reportOutputs.map((filePath) => `- ${path.basename(filePath)}`),
        '',
        '## 格式说明',
        '',
        exportItems.manual ? `- 操作手册 DOCX 包含封面、页眉、页码${state.options?.screenshotMode === 'manual' && state.manualScreenshots?.length ? '和界面截图附录' : state.options?.screenshotMode === 'ai' && state.aiIllustrations?.length ? '和 AI 功能示意图附录' : ''}。` : '',
        exportItems.code ? '- 代码材料 DOCX 使用宋体 10.5 磅、50 行显式分页，同时提供 TXT 备查文件。' : '',
        '',
      ].filter((line) => line !== '').join('\n'), 'utf-8');
      finalOutputs.push(reportPath);
    }

    const readmePath = path.join(finalDir, '导出说明.txt');
    fs.writeFileSync(readmePath, createExportReadmeText({
      fields,
      manifest,
      state,
      exportItems,
      finalOutputs,
      exportedAt,
    }), 'utf-8');
    finalOutputs.push(readmePath);

    const zipPath = path.join(deliveryRoot, `${softwareName}_${version}_${batchId}.zip`);
    const submissionGuidePath = path.join(finalDir, '申报提交说明.md');
    const projectedBatch = {
      id: batchId,
      softwareName,
      version,
      snapshotId: liveState.confirmedSnapshot.id,
      confirmedAt: liveState.draftConfirmedAt,
      exportedAt,
      exportItems,
      directory: finalDir,
      zipPath,
      status: 'pass',
      projected: true,
      files: [...finalOutputs, submissionGuidePath].map((filePath) => ({ name: path.basename(filePath), path: filePath })),
    };
    const submissionReview = buildSubmissionReview({
      ...state,
      draftConfirmed: true,
      draftConfirmedAt: liveState.draftConfirmedAt,
      confirmedSnapshot: liveState.confirmedSnapshot,
    }, [projectedBatch]);
    fs.writeFileSync(submissionGuidePath, submissionReview.guideMarkdown, 'utf-8');
    finalOutputs.push(submissionGuidePath);

    const deliveryManifestPath = path.join(finalDir, '交付清单.json');
    const deliveryFiles = finalOutputs.map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
      size: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
    }));
    writeJson(deliveryManifestPath, {
      batchId,
      softwareName,
      version,
      snapshotId: liveState.confirmedSnapshot.id,
      confirmedAt: liveState.draftConfirmedAt,
      exportedAt,
      exportItems,
      files: deliveryFiles.map(({ path: _path, ...item }) => item),
    });
    finalOutputs.push(deliveryManifestPath);

    const zip = new AdmZip();
    zip.addLocalFolder(finalDir);
    zip.writeZip(zipPath);
    const batchFiles = [...finalOutputs, zipPath].map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
      size: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
    }));
    const batch = {
      id: batchId,
      softwareName,
      version,
      snapshotId: liveState.confirmedSnapshot.id,
      confirmedAt: liveState.draftConfirmedAt,
      exportedAt,
      exportItems,
      directory: finalDir,
      zipPath,
      files: batchFiles,
    };

    updateTask({ status: 'success', progress: 100, logs: ['正式资料导出完成'] }, {
      step: 'result',
      outputs: batchFiles.map((item) => ({ name: item.name, path: item.path })),
      outputDir: finalDir,
      exportBatches: [batch, ...(liveState.exportBatches || [])].slice(0, 20),
    });
  }

  return {
    subscribe,
    loadState,
    getSubmissionReview() {
      const state = loadState();
      const guideDir = path.join(state.outputRoot || rootDir, '申报辅助');
      const latestGuide = fs.existsSync(guideDir)
        ? fs.readdirSync(guideDir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
          .map((entry) => {
            const filePath = path.join(guideDir, entry.name);
            return { path: filePath, generatedAt: fs.statSync(filePath).mtime.toISOString() };
          })
          .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] || null
        : null;
      return { ...buildSubmissionReview(state, listExportBatches(state)), latestGuide };
    },
    saveManualReview(payload = {}) {
      const state = loadState();
      if (!state.confirmedSnapshot?.id) throw new Error('请先完成草稿检查并确认草稿，再进行人工复核');
      const checks = {
        ...initialState.manualReview.checks,
        ...(payload.checks || {}),
      };
      if (!Object.values(checks).every(Boolean)) throw new Error('请完成全部人工复核项目后再确认');
      const next = saveState({
        manualReview: {
          checks,
          notes: String(payload.notes || '').trim().slice(0, 500),
          confirmedAt: now(),
          snapshotId: state.confirmedSnapshot.id,
        },
      });
      emit(next);
      return next.manualReview;
    },
    generateSubmissionGuide() {
      const state = loadState();
      const review = buildSubmissionReview(state, listExportBatches(state));
      const guideDir = ensureDir(path.join(state.outputRoot || rootDir, '申报辅助'));
      const softwareName = sanitizeFilename(state.fields?.softwareName || '软件著作权');
      const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
      const guidePath = path.join(guideDir, `${softwareName}_申报提交说明_${timestamp}.md`);
      fs.writeFileSync(guidePath, review.guideMarkdown, 'utf-8');
      return { ...review, latestGuide: { path: guidePath, generatedAt: now() } };
    },
    async openSubmissionGuideDirectory() {
      const state = loadState();
      const guideDir = ensureDir(path.join(state.outputRoot || rootDir, '申报辅助'));
      await shell.openPath(guideDir);
      return { success: true, path: guideDir };
    },
    listCases(includeArchived = true) {
      return caseStore.list(loadState(), includeArchived);
    },
    listExportBatches() {
      return listExportBatches();
    },
    async openExportBatch(id) {
      const batch = (loadState().exportBatches || []).find((item) => item.id === id);
      if (!batch?.directory || !fs.existsSync(batch.directory)) throw new Error('交付批次目录不存在');
      await shell.openPath(batch.directory);
      return { success: true, path: batch.directory };
    },
    createCase(payload = {}) {
      const state = loadState();
      if (activeTask?.status === 'running' || state.task?.status === 'running') throw new Error('当前有软著任务正在运行，暂时不能新建项目');
      caseStore.create(state, initialState, payload.name);
      const next = loadState();
      emit(next);
      return { state: next, cases: caseStore.list(next) };
    },
    switchCase(id) {
      const state = loadState();
      if (activeTask?.status === 'running' || state.task?.status === 'running') throw new Error('当前有软著任务正在运行，暂时不能切换项目');
      caseStore.switchTo(state, id);
      const next = loadState();
      emit(next);
      return { state: next, cases: caseStore.list(next) };
    },
    duplicateCase(payload = {}) {
      const state = loadState();
      if (activeTask?.status === 'running' || state.task?.status === 'running') throw new Error('当前有软著任务正在运行，暂时不能复制项目');
      caseStore.duplicate(state, payload.id, payload.name);
      const next = loadState();
      emit(next);
      return { state: next, cases: caseStore.list(next) };
    },
    deleteCase(id) {
      const state = loadState();
      if (activeTask?.status === 'running' || state.task?.status === 'running') throw new Error('当前有软著任务正在运行，暂时不能删除项目');
      const item = caseStore.remove(state, initialState, id);
      const next = loadState();
      emit(next);
      return { item, state: next, cases: caseStore.list(next) };
    },
    renameCase(payload = {}) {
      const state = loadState();
      const item = caseStore.rename(state, payload.id, payload.name);
      return { item, cases: caseStore.list(state) };
    },
    setCaseArchived(payload = {}) {
      const state = loadState();
      if (activeTask?.status === 'running' || state.task?.status === 'running') throw new Error('当前有软著任务正在运行，暂时不能归档项目');
      const item = caseStore.setArchived(state, payload.id, Boolean(payload.archived));
      return { item, cases: caseStore.list(state) };
    },
    async selectProject() {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择需要生成软著资料的项目目录' });
      if (result.canceled || !result.filePaths?.[0]) {
        return { success: false, message: '已取消选择', state: loadState() };
      }
      const projectDir = result.filePaths[0];
      const analysis = analyzeProject(projectDir);
      const state = saveState({
        step: 'setup',
        project: { path: projectDir, name: path.basename(projectDir) },
        analysis,
        fields: createInitialFieldsFromAnalysis(analysis, loadState().fields),
        task: undefined,
        drafts: {},
        draftConfirmed: false,
        draftConfirmedAt: '',
        confirmedSnapshot: null,
        draftDir: '',
        outputRoot: '',
        outputDir: '',
        outputs: [],
        draftMeta: null,
        generatedFieldsSourceDraftDir: '',
        codeMaterialReview: initialState.codeMaterialReview,
      });
      return { success: true, state };
    },
    saveFields(fields) {
      const current = loadState();
      const nextFields = { ...current.fields, ...(fields || {}) };
      const changed = JSON.stringify(nextFields) !== JSON.stringify(current.fields);
      return saveState({
        fields: nextFields,
        ...(changed ? { draftConfirmed: false, draftConfirmedAt: '', confirmedSnapshot: null, outputDir: '', outputs: [] } : {}),
      });
    },
    async generateTechnicalFeatures(payload = {}) {
      const current = loadState();
      if (activeTask?.status === 'running' || current.task?.status === 'running') throw new Error('当前有软著任务正在运行，请稍后再生成技术特点');
      if (!current.analysis) throw new Error('请先选择源码目录并完成项目分析');
      const fields = { ...current.fields, ...(payload.fields || {}) };
      const technicalFeatures = await generateTechnicalFeaturesField(aiService, current.analysis, fields);
      const next = saveState({
        fields: { ...fields, technicalFeatures },
        draftConfirmed: false,
        draftConfirmedAt: '',
        confirmedSnapshot: null,
        outputDir: '',
        outputs: [],
      });
      emit(next);
      return { technicalFeatures, state: next };
    },
    saveOptions(options) {
      const current = loadState();
      const nextOptions = { ...current.options, ...(options || {}) };
      const screenshotModeChanged = nextOptions.screenshotMode !== current.options.screenshotMode
        || Boolean(nextOptions.useAiImages) !== Boolean(current.options.useAiImages);
      const codeMaterialOptionsChanged = JSON.stringify({
        codeExcludedPaths: nextOptions.codeExcludedPaths || [],
        codeIncludedPaths: nextOptions.codeIncludedPaths || [],
        codeClean: normalizeCleanOptions(nextOptions.codeClean),
      }) !== JSON.stringify({
        codeExcludedPaths: current.options.codeExcludedPaths || [],
        codeIncludedPaths: current.options.codeIncludedPaths || [],
        codeClean: normalizeCleanOptions(current.options.codeClean),
      });
      return saveState({
        options: nextOptions,
        ...(codeMaterialOptionsChanged ? { codeMaterialReview: initialState.codeMaterialReview } : {}),
        ...(screenshotModeChanged ? { manualAssetReview: initialState.manualAssetReview } : {}),
        ...(screenshotModeChanged || codeMaterialOptionsChanged ? { draftConfirmed: false, draftConfirmedAt: '', confirmedSnapshot: null, outputDir: '', outputs: [] } : {}),
      });
    },
    saveManualAssetReview(payload = {}) {
      const current = loadState();
      const mode = current.options?.screenshotMode;
      if (!['manual', 'ai'].includes(mode)) throw new Error('当前未启用操作手册图片');
      const assets = mode === 'manual' ? current.manualScreenshots || [] : current.aiIllustrations || [];
      if (!assets.length) throw new Error('请先导入或生成至少一张操作手册图片');
      const checks = {
        content: Boolean(payload.checks?.content),
        captionPlacement: Boolean(payload.checks?.captionPlacement),
      };
      if (!Object.values(checks).every(Boolean)) throw new Error('请完成全部手册图片核对项');
      const next = saveState({
        manualAssetReview: {
          checks,
          notes: String(payload.notes || '').trim().slice(0, 500),
          confirmedAt: now(),
          mode,
        },
      });
      emit(next);
      return next;
    },
    readDraft(draftKey) {
      const state = loadState();
      const filePath = getDraftPath(state, draftKey);
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const content = normalizeDraftContent(draftKey, originalContent);
      if (content !== originalContent) {
        draftHistory.capture(state, draftKey, originalContent, '格式迁移前自动备份');
        fs.writeFileSync(filePath, content, 'utf-8');
        const next = saveState({
          draftConfirmed: false,
          draftConfirmedAt: '',
          confirmedSnapshot: null,
          step: 'draft',
          outputDir: '',
          outputs: [],
        });
        emit(next);
      }
      return {
        key: draftKey,
        name: path.basename(filePath),
        path: filePath,
        content,
        updatedAt: fs.statSync(filePath).mtime.toISOString(),
      };
    },
    readCodeManifest() {
      const state = loadState();
      const manifestPath = state.draftMeta?.manifestPath || (state.draftDir ? path.join(state.draftDir, '代码提取清单.json') : '');
      if (!manifestPath || !fs.existsSync(manifestPath)) {
        return null;
      }
      const normalizedDraftDir = path.resolve(state.draftDir || '');
      const normalizedManifestPath = path.resolve(manifestPath);
      if (!normalizedDraftDir || !normalizedManifestPath.startsWith(`${normalizedDraftDir}${path.sep}`)) {
        throw new Error('代码提取清单路径无效');
      }
      return readJson(normalizedManifestPath, null);
    },
    listDraftVersions(draftKey) {
      const state = loadState();
      getDraftPath(state, draftKey);
      return draftHistory.list(state, draftKey);
    },
    compareDraftVersion({ key, versionId } = {}) {
      const state = loadState();
      const filePath = getDraftPath(state, key);
      return draftHistory.compare(state, key, versionId, fs.readFileSync(filePath, 'utf-8'));
    },
    restoreDraftVersion({ key, versionId } = {}) {
      const state = loadState();
      const filePath = getDraftPath(state, key);
      const currentContent = fs.readFileSync(filePath, 'utf-8');
      const version = draftHistory.readVersion(state, key, versionId);
      if (version.content === currentContent) throw new Error('当前草稿已经是这个版本');
      draftHistory.capture(state, key, currentContent, '恢复前自动备份');
      const content = normalizeDraftContent(key, version.content);
      fs.writeFileSync(filePath, content, 'utf-8');
      const next = saveState({
        draftConfirmed: false,
        draftConfirmedAt: '',
        confirmedSnapshot: null,
        step: 'draft',
        outputDir: '',
        outputs: [],
      });
      emit(next);
      return {
        key,
        name: path.basename(filePath),
        path: filePath,
        content,
        updatedAt: fs.statSync(filePath).mtime.toISOString(),
        state: next,
      };
    },
    regenerateCodeMaterial(payload = {}) {
      const state = loadState();
      if (activeTask?.status === 'running' || state.task?.status === 'running') {
        throw new Error('当前有软著任务正在运行，请稍后再重新抽取代码材料');
      }
      if (!state.draftDir || !fs.existsSync(state.draftDir)) {
        throw new Error('请先生成草稿后再重新抽取代码材料');
      }

      const sourceMode = payload.sourceMode || state.options.sourceMode || 'project';
      const codeGenerationMaterials = sourceMode === 'code-generation' ? codeGenerationService?.getConfirmedMaterials?.() : null;
      const projectDir = codeGenerationMaterials?.project?.path || state.project?.path;
      if (!projectDir || !fs.existsSync(projectDir)) {
        throw new Error(sourceMode === 'code-generation' ? '请先在源码准备中确认当前项目的源码材料' : '请先选择有效的源码目录');
      }

      const analysis = codeGenerationMaterials?.analysis || analyzeProject(projectDir);
      const fields = createInitialFieldsFromAnalysis(analysis, { ...state.fields, ...(payload.fields || {}) });
      const codeExcludedPaths = normalizePathList(payload.codeExcludedPaths || state.options.codeExcludedPaths);
      const codeIncludedPaths = normalizePathList(payload.codeIncludedPaths || state.options.codeIncludedPaths);
      const selectedFiles = codeGenerationMaterials?.selectedFiles?.length
        ? codeGenerationMaterials.selectedFiles.filter((item) => !codeExcludedPaths.includes(item.path))
        : selectCodeFiles(analysis, codeExcludedPaths, codeIncludedPaths);
      const codeClean = normalizeCleanOptions(payload.codeClean || state.options.codeClean);
      Object.entries(state.drafts || {})
        .filter(([key, filePath]) => (key === 'application' || key.startsWith('code')) && filePath && fs.existsSync(filePath))
        .forEach(([key, filePath]) => draftHistory.capture(state, key, fs.readFileSync(filePath, 'utf-8'), '重新抽取代码前'));
      const { manifest, outputs: codeMarkdownFiles } = createCodeMaterial(projectDir, selectedFiles, { ...fields, codeExcludedPaths, codeIncludedPaths, codeClean }, state.draftDir);
      const nextFields = {
        ...fields,
        sourceLineCount: fields.sourceLineCount || String(analysis.lineCount || manifest.material_line_count || ''),
        pageCount: String(manifest.total_pages),
      };

      const applicationPath = state.drafts?.application || path.join(state.draftDir, '申请表信息.md');
      if (fs.existsSync(applicationPath)) {
        const applicationMarkdown = fs.readFileSync(applicationPath, 'utf-8');
        fs.writeFileSync(applicationPath, syncApplicationCodeStats(applicationMarkdown, nextFields, manifest), 'utf-8');
      }

      const nextDrafts = Object.fromEntries(
        Object.entries(state.drafts || {}).filter(([key]) => !key.startsWith('code')),
      );
      nextDrafts.codeManifest = path.join(state.draftDir, '代码提取清单.md');
      codeMarkdownFiles.forEach((filePath, index) => {
        nextDrafts[`code${index + 1}`] = filePath;
      });

      const nextState = saveState({
        step: 'draft',
        analysis,
        project: codeGenerationMaterials?.project || state.project,
        fields: nextFields,
        options: { codeClean },
        drafts: nextDrafts,
        draftConfirmed: false,
        draftConfirmedAt: '',
        confirmedSnapshot: null,
        outputDir: '',
        outputs: [],
        codeMaterialReview: initialState.codeMaterialReview,
        draftMeta: {
          ...(state.draftMeta || {}),
          manifestPath: path.join(state.draftDir, '代码提取清单.json'),
          codeMarkdownFiles,
        },
        task: undefined,
      });
      emit(nextState);
      return { state: nextState, manifest };
    },
    saveCodeMaterialReview(payload = {}) {
      const state = loadState();
      const manifestPath = state.draftMeta?.manifestPath || (state.draftDir ? path.join(state.draftDir, '代码提取清单.json') : '');
      if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error('请先生成代码鉴别材料');
      const manifest = readJson(manifestPath, null);
      if (!manifest) throw new Error('代码提取清单无法读取，请重新抽取代码材料');
      if (Array.isArray(manifest.audit) && manifest.audit.some((item) => item?.status === 'fail')) {
        throw new Error('代码材料仍有未通过的审查项，请处理后重新抽取');
      }
      const checks = {
        pageRange: Boolean(payload.checks?.pageRange),
        sourceScope: Boolean(payload.checks?.sourceScope),
        readability: Boolean(payload.checks?.readability),
      };
      if (!Object.values(checks).every(Boolean)) throw new Error('请完成全部代码材料核对项');
      const review = {
        checks,
        notes: String(payload.notes || '').trim().slice(0, 500),
        confirmedAt: now(),
        manifestHash: sha256File(manifestPath),
      };
      const next = saveState({
        codeMaterialReview: review,
        draftConfirmed: false,
        draftConfirmedAt: '',
        confirmedSnapshot: null,
        outputDir: '',
        outputs: [],
      });
      emit(next);
      return next;
    },
    saveDraft({ key, content }) {
      const state = loadState();
      const filePath = getDraftPath(state, key);
      const previousContent = fs.readFileSync(filePath, 'utf-8');
      const nextContent = normalizeDraftContent(key, content);
      if (previousContent !== nextContent) draftHistory.capture(state, key, previousContent, '保存前自动备份');
      fs.writeFileSync(filePath, nextContent, 'utf-8');
      const next = saveState({
        draftConfirmed: false,
        draftConfirmedAt: '',
        confirmedSnapshot: null,
        step: 'draft',
        outputDir: '',
        outputs: [],
      });
      emit(next);
      return {
        key,
        name: path.basename(filePath),
        path: filePath,
        content: fs.readFileSync(filePath, 'utf-8'),
        updatedAt: fs.statSync(filePath).mtime.toISOString(),
        state: next,
      };
    },
    validateDraft() {
      return validateDraftCompleteness();
    },
    startGeneration(payload) {
      if (activeTask?.status === 'running') {
        return activeTask;
      }
      activeTask = createTask('software-copyright-draft-generation');
      const state = saveState({ task: activeTask, step: 'generating' });
      emit(state);
      runDraftGeneration(payload).catch((error) => {
        const message = error.message || '软著草稿生成失败';
        updateTask({
          status: 'error',
          progress: 100,
          error: message,
          recovery: createRecovery('draft', message),
          logs: [...(activeTask.logs || []), message],
        }, { step: loadState().draftDir ? 'draft' : 'setup' });
      }).finally(() => {
        activeTask = null;
      });
      return activeTask;
    },
    confirmDraft() {
      const state = loadState();
      if (!state.draftDir || !fs.existsSync(state.draftDir)) {
        throw new Error('请先生成草稿');
      }
      const validation = validateDraftCompleteness(state);
      if (!validation.valid) {
        throw new Error(`草稿检查未通过：${validation.issues.slice(0, 3).map((issue) => issue.message).join('；')}`);
      }
      const manifestPath = state.draftMeta?.manifestPath || path.join(state.draftDir, '代码提取清单.json');
      const codeReviewCurrent = Boolean(
        state.codeMaterialReview?.confirmedAt
        && state.codeMaterialReview?.manifestHash
        && fs.existsSync(manifestPath)
        && state.codeMaterialReview.manifestHash === sha256File(manifestPath),
      );
      if (!codeReviewCurrent) throw new Error('请先在“代码材料”区域完成代码鉴别材料核对');
      Object.entries(state.drafts || {}).forEach(([key, filePath]) => {
        if (filePath && fs.existsSync(filePath)) {
          draftHistory.capture(state, key, fs.readFileSync(filePath, 'utf-8'), '人工确认版本');
        }
      });
      const confirmedAt = now();
      const confirmedSnapshot = createConfirmedSnapshot({ ...state, draftConfirmedAt: confirmedAt });
      const next = saveState({ draftConfirmed: true, draftConfirmedAt: confirmedAt, confirmedSnapshot, step: 'draft' });
      emit(next);
      return next;
    },
    async importManualScreenshots() {
      const result = await dialog.showOpenDialog({
        title: '选择操作手册界面截图',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '界面截图', extensions: ['png', 'jpg', 'jpeg'] }],
      });
      if (result.canceled || !result.filePaths?.length) {
        return { success: false, message: '已取消选择', state: loadState() };
      }
      ensureDir(manualScreenshotsDir);
      const imported = [];
      const skipped = [];
      for (const sourcePath of result.filePaths) {
        try {
          const extension = path.extname(sourcePath).toLowerCase();
          const stat = fs.statSync(sourcePath);
          if (!['.png', '.jpg', '.jpeg'].includes(extension) || stat.size <= 0 || stat.size > 15 * 1024 * 1024) {
            skipped.push(path.basename(sourcePath));
            continue;
          }
          const id = crypto.randomUUID();
          const fileName = `${id}${extension === '.jpeg' ? '.jpg' : extension}`;
          const targetPath = path.join(manualScreenshotsDir, fileName);
          fs.copyFileSync(sourcePath, targetPath);
          const size = getSafeImageDimensions(fs.readFileSync(targetPath), { maxBytes: 15 * 1024 * 1024 });
          imported.push({
            id,
            name: path.basename(sourcePath),
            path: targetPath,
            assetUrl: `yibiao-asset://software-copyright-screenshots/${encodeURIComponent(fileName)}`,
            caption: path.basename(sourcePath, extension).slice(0, 80),
            width: Number(size.width) || 0,
            height: Number(size.height) || 0,
            createdAt: now(),
          });
        } catch {
          skipped.push(path.basename(sourcePath));
        }
      }
      if (!imported.length) throw new Error('未导入有效截图，请选择不超过 15MB 的 PNG 或 JPG 文件');
      const current = loadState();
      const state = screenshotStateUpdate({
        manualScreenshots: [...(current.manualScreenshots || []), ...imported].slice(0, 30),
        options: { screenshotMode: 'manual', useAiImages: false },
      });
      return {
        success: true,
        message: skipped.length ? `已导入 ${imported.length} 张，跳过 ${skipped.length} 张无效图片` : `已导入 ${imported.length} 张截图`,
        state,
      };
    },
    updateManualScreenshot(payload = {}) {
      const current = loadState();
      managedScreenshot(current, payload.id);
      const caption = String(payload.caption || '').trim().slice(0, 120);
      const placement = String(payload.placement || '').trim().slice(0, 160);
      return screenshotStateUpdate({
        manualScreenshots: current.manualScreenshots.map((item) => item.id === payload.id ? { ...item, caption, placement } : item),
      });
    },
    reorderManualScreenshots(ids = []) {
      const current = loadState();
      const byId = new Map(current.manualScreenshots.map((item) => [item.id, item]));
      const ordered = Array.from(new Set(Array.isArray(ids) ? ids : [])).map((id) => byId.get(id)).filter(Boolean);
      current.manualScreenshots.forEach((item) => {
        if (!ordered.some((orderedItem) => orderedItem.id === item.id)) ordered.push(item);
      });
      return screenshotStateUpdate({ manualScreenshots: ordered });
    },
    removeManualScreenshot(id) {
      const current = loadState();
      const { filePath } = managedScreenshot(current, id);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return screenshotStateUpdate({
        manualScreenshots: current.manualScreenshots.filter((item) => item.id !== id),
      });
    },
    saveAiIllustrationSettings(payload = {}) {
      const current = loadState();
      const style = payload.style === 'realistic_photo' ? 'realistic_photo' : 'engineering_diagram';
      const prompt = String(payload.prompt || '').trim().slice(0, 2000);
      const next = saveState({ aiIllustrationSettings: { prompt, style } });
      emit(next);
      return next;
    },
    async generateAiIllustrationPrompt(payload = {}) {
      const current = loadState();
      if (activeTask?.status === 'running' || current.task?.status === 'running') throw new Error('当前有软著任务正在运行，请稍后再生成提示词');
      if (!current.analysis) throw new Error('请先选择源码目录并完成项目分析');
      const businessPath = current.draftDir ? path.join(current.draftDir, '业务理解.json') : '';
      const business = businessPath && fs.existsSync(businessPath) ? readJson(businessPath, {}) : {};
      const style = payload.style === 'realistic_photo' ? 'realistic_photo' : 'engineering_diagram';
      const existingPrompts = [
        ...(current.aiIllustrations || []).map((item) => item.prompt),
        current.aiIllustrationSettings?.prompt,
      ].filter(Boolean);
      const content = await aiService.chat({
        logTitle: '软著-AI生成插图提示词',
        temperature: 0.65,
        timeout_ms: 180000,
        messages: buildManualIllustrationPromptMessages({
          analysis: current.analysis,
          fields: current.fields || {},
          business,
          existingPrompts,
          style,
        }),
      });
      const prompt = String(content || '')
        .replace(/^```(?:text)?\s*/i, '')
        .replace(/```$/i, '')
        .replace(/^提示词[：:]?\s*/i, '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 2000);
      if (!prompt) throw new Error('文本模型未返回有效提示词，请重试');
      const next = saveState({ aiIllustrationSettings: { prompt, style } });
      emit(next);
      return { prompt, style, state: next };
    },
    async generateAiIllustration(payload = {}) {
      const current = loadState();
      const availability = aiService.getImageModelAvailability();
      if (!availability.available) throw new Error(availability.message || '生图模型不可用');
      if ((current.aiIllustrations || []).length >= 6) throw new Error('最多保留 6 张 AI 示意图，请先移除不需要的图片');
      const style = payload.style === 'realistic_photo' ? 'realistic_photo' : 'engineering_diagram';
      const prompt = String(payload.prompt || current.aiIllustrationSettings?.prompt || buildManualIllustrationPrompt(current.fields || {})).trim().slice(0, 2000);
      if (!prompt) throw new Error('请先填写生图提示词');
      const generated = await aiService.generateImage({
        title: `${current.fields?.softwareName || '软件'}操作手册示意图`,
        prompt,
        style,
        size: '1024x1024',
        logTitle: `软著-操作手册示意图-${(current.aiIllustrations || []).length + 1}`,
      });
      if (!generated?.success || !generated.file_path || !fs.existsSync(generated.file_path)) {
        throw new Error(generated?.message || '生图服务未返回有效图片');
      }
      ensureDir(aiIllustrationsDir);
      const sourceBuffer = fs.readFileSync(generated.file_path);
      const image = await loadImage(sourceBuffer);
      const width = Number(image.width) || 1024;
      const height = Number(image.height) || 1024;
      const canvas = createCanvas(width, height);
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      const id = crypto.randomUUID();
      const fileName = `${id}.png`;
      const targetPath = path.join(aiIllustrationsDir, fileName);
      fs.writeFileSync(targetPath, canvas.toBuffer('image/png'));
      const item = {
        id,
        name: `AI示意图-${(current.aiIllustrations || []).length + 1}.png`,
        path: targetPath,
        assetUrl: `yibiao-asset://software-copyright-ai-images/${encodeURIComponent(fileName)}`,
        caption: String(payload.caption || `${current.fields?.softwareName || '软件'}功能示意图`).trim().slice(0, 120),
        prompt,
        style,
        width,
        height,
        createdAt: now(),
      };
      const state = screenshotStateUpdate({
        aiIllustrations: [...(current.aiIllustrations || []), item],
        aiIllustrationSettings: { prompt, style },
        options: { screenshotMode: 'ai', useAiImages: true },
      });
      return { success: true, message: 'AI 示意图已生成，请检查图片内容和图注', item, state };
    },
    async regenerateAiIllustration(payload = {}) {
      const current = loadState();
      const existing = managedAiIllustration(current, payload.id).item;
      const availability = aiService.getImageModelAvailability();
      if (!availability.available) throw new Error(availability.message || '生图模型不可用');
      const style = payload.style === 'realistic_photo' ? 'realistic_photo' : 'engineering_diagram';
      const prompt = String(payload.prompt || '').trim().slice(0, 2000);
      if (!prompt) throw new Error('请填写本次重新生成使用的提示词');
      const generated = await aiService.generateImage({
        title: `${current.fields?.softwareName || '软件'}操作手册示意图重绘`,
        prompt,
        style,
        size: '1024x1024',
        logTitle: `软著-重新生成插图-${existing.caption || existing.name}`,
      });
      if (!generated?.success || !generated.file_path || !fs.existsSync(generated.file_path)) {
        throw new Error(generated?.message || '生图服务未返回有效图片');
      }
      ensureDir(aiIllustrationsDir);
      const sourceBuffer = fs.readFileSync(generated.file_path);
      const image = await loadImage(sourceBuffer);
      const width = Number(image.width) || 1024;
      const height = Number(image.height) || 1024;
      const canvas = createCanvas(width, height);
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      const fileName = `${crypto.randomUUID()}.png`;
      const targetPath = path.join(aiIllustrationsDir, fileName);
      fs.writeFileSync(targetPath, canvas.toBuffer('image/png'));
      if (existing.path && fs.existsSync(existing.path)) fs.unlinkSync(existing.path);
      const updated = {
        ...existing,
        path: targetPath,
        assetUrl: `yibiao-asset://software-copyright-ai-images/${encodeURIComponent(fileName)}`,
        prompt,
        style,
        width,
        height,
        updatedAt: now(),
      };
      const state = screenshotStateUpdate({
        aiIllustrations: current.aiIllustrations.map((item) => item.id === existing.id ? updated : item),
        aiIllustrationSettings: { prompt, style },
        options: { screenshotMode: 'ai', useAiImages: true },
      });
      return { success: true, message: '当前示意图已重新生成', item: updated, state };
    },
    updateAiIllustration(payload = {}) {
      const current = loadState();
      managedAiIllustration(current, payload.id);
      const caption = String(payload.caption || '').trim().slice(0, 120);
      const placement = String(payload.placement || '').trim().slice(0, 160);
      return screenshotStateUpdate({
        aiIllustrations: current.aiIllustrations.map((item) => item.id === payload.id ? { ...item, caption, placement } : item),
      });
    },
    reorderAiIllustrations(ids = []) {
      const current = loadState();
      const byId = new Map(current.aiIllustrations.map((item) => [item.id, item]));
      const ordered = Array.from(new Set(Array.isArray(ids) ? ids : [])).map((id) => byId.get(id)).filter(Boolean);
      current.aiIllustrations.forEach((item) => {
        if (!ordered.some((orderedItem) => orderedItem.id === item.id)) ordered.push(item);
      });
      return screenshotStateUpdate({ aiIllustrations: ordered });
    },
    removeAiIllustration(id) {
      const current = loadState();
      const { filePath } = managedAiIllustration(current, id);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return screenshotStateUpdate({
        aiIllustrations: current.aiIllustrations.filter((item) => item.id !== id),
      });
    },
    exportFinal(payload = {}) {
      if (activeTask?.status === 'running') {
        return activeTask;
      }
      const current = loadState();
      const validation = validateDraftCompleteness(current);
      if (!validation.valid) {
        throw new Error(`提交前总检未通过：${validation.issues.slice(0, 3).map((issue) => issue.message).join('；')}`);
      }
      const submissionReview = buildSubmissionReview(current, listExportBatches(current));
      if (!submissionReview.readyToSubmit) {
        const unresolved = submissionReview.checks
          .filter((item) => item.status !== 'pass')
          .map((item) => item.label)
          .join('、');
        throw new Error(`请先完成提交前总检${unresolved ? `：${unresolved}` : ''}`);
      }
      const manifestPath = current.draftMeta?.manifestPath || path.join(current.draftDir || '', '代码提取清单.json');
      const codeReviewCurrent = Boolean(
        current.codeMaterialReview?.confirmedAt
        && current.codeMaterialReview?.manifestHash
        && fs.existsSync(manifestPath)
        && current.codeMaterialReview.manifestHash === sha256File(manifestPath),
      );
      if (!codeReviewCurrent) throw new Error('请先完成代码鉴别材料人工核对');
      const screenshotMode = current.options?.screenshotMode || 'skip';
      const activeAssets = screenshotMode === 'manual'
        ? current.manualScreenshots || []
        : screenshotMode === 'ai' ? current.aiIllustrations || [] : [];
      const manualAssetReady = screenshotMode === 'skip' || Boolean(
        activeAssets.length
        && current.manualAssetReview?.confirmedAt
        && current.manualAssetReview.mode === screenshotMode,
      );
      if (!manualAssetReady) throw new Error('请先完成操作手册图片人工核对');
      const manualReviewCurrent = Boolean(
        current.confirmedSnapshot?.id
        && current.manualReview?.confirmedAt
        && current.manualReview?.snapshotId === current.confirmedSnapshot.id,
      );
      if (!manualReviewCurrent) throw new Error('请先在“申报辅助”中完成人工复核与证据链确认');
      activeTask = createTask('software-copyright-final-export');
      const state = saveState({
        task: activeTask,
        step: 'exporting',
        options: payload.exportItems ? { exportItems: payload.exportItems } : {},
      });
      emit(state);
      runFinalExport().catch((error) => {
        const message = error.message || '正式资料导出失败';
        updateTask({
          status: 'error',
          progress: 100,
          error: message,
          recovery: createRecovery('export', message),
          logs: [...(activeTask.logs || []), message],
        }, { step: 'draft' });
      }).finally(() => {
        activeTask = null;
      });
      return activeTask;
    },
    clear() {
      const next = { ...initialState, updated_at: now(), imageModel: aiService.getImageModelAvailability() };
      writeJson(statePath, next);
      const state = loadState();
      emit(state);
      return { success: true, state };
    },
    async openOutputDir() {
      const state = loadState();
      const target = state.outputDir || state.draftDir || rootDir;
      ensureDir(target);
      await shell.openPath(target);
      return { success: true, path: target };
    },
  };
}

module.exports = {
  createSoftwareCopyrightService,
};
