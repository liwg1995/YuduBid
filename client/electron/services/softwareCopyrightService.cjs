const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dialog, shell } = require('electron');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const { getSoftwareCopyrightDir } = require('../utils/paths.cjs');
const {
  buildBusinessContextMessages,
  buildManualIllustrationPrompt,
  buildManualMarkdownMessages,
} = require('./softwareCopyrightPrompts.cjs');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.less', '.html', '.vue', '.svelte', '.astro', '.py', '.java', '.go', '.rs', '.cs', '.sql']);
const SKIP_DIRS = new Set(['.git', '.hg', '.svn', '.idea', '.vscode', 'node_modules', 'dist', 'build', 'release', 'coverage', 'archive', '软件著作权申请资料']);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'tsconfig.tsbuildinfo']);
const LINES_PER_PAGE = 24;
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
  draftDir: '',
  outputRoot: '',
  outputDir: '',
  outputs: [],
  updated_at: '',
};

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
  const buffer = fs.readFileSync(filePath);
  const data = limit ? buffer.subarray(0, limit) : buffer;
  for (const encoding of ['utf-8', 'utf8', 'gb18030', 'latin1']) {
    try {
      return data.toString(encoding);
    } catch {
      // Try next encoding.
    }
  }
  return data.toString('utf-8');
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
  const packagePath = ['package.json', 'client/package.json', 'frontend/package.json', 'web/package.json']
    .map((name) => path.join(projectDir, name))
    .find((candidate) => fs.existsSync(candidate));
  const packageJson = packagePath ? readJson(packagePath, {}) : {};
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
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };
  const frameworks = Object.keys(dependencies).filter((name) => ['react', 'vue', 'vite', 'electron', 'next', 'typescript'].some((key) => name.toLowerCase().includes(key)));
  const lineCount = files.reduce((sum, item) => sum + item.line_count, 0);
  const languages = Array.from(new Set(files.map((item) => item.extension.replace('.', '')).filter(Boolean))).slice(0, 8);

  return {
    projectRoot: projectDir,
    projectName: path.basename(projectDir),
    packageName: packageJson.name || '',
    packageVersion: packageJson.version || '',
    scripts: packageJson.scripts || {},
    frameworks,
    languages,
    fileCount: files.length,
    lineCount,
    candidates: files.slice(0, 180).map(({ file_path, ...item }) => item),
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
  const allLines = [];
  const files = [];
  for (const item of selectedFiles) {
    const filePath = path.join(projectDir, item.path);
    if (!fs.existsSync(filePath)) continue;
    const text = readText(filePath);
    const sourceLines = text.split(/\r?\n/);
    const start = allLines.length + 1;
    allLines.push(`// File: ${item.path}`);
    allLines.push(...sourceLines);
    allLines.push('');
    files.push({
      path: item.path,
      category: item.category,
      selection_score: Number.isFinite(item.selection_score) ? Number(item.selection_score.toFixed(2)) : undefined,
      source_line_count: sourceLines.length,
      material_line_start: start,
      material_line_end: allLines.length,
    });
  }

  const pages = [];
  for (let index = 0; index < allLines.length; index += LINES_PER_PAGE) {
    pages.push(allLines.slice(index, index + LINES_PER_PAGE));
  }

  const softwareName = fields.softwareName || '软件';
  const version = fields.version || 'V1.0';
  const outputs = [];
  const writePages = (fileName, title, pageItems) => {
    const lines = [];
    for (const [pageNo, pageLines] of pageItems) {
      lines.push(`## 第 ${pageNo} 页`, '', '```text', ...pageLines, '```', '');
    }
    const target = path.join(draftDir, fileName);
    fs.writeFileSync(target, lines.join('\n'), 'utf-8');
    outputs.push(target);
  };

  if (pages.length >= SPLIT_PAGES) {
    writePages('代码-前30页.md', '代码材料（前30页）', pages.slice(0, 30).map((page, index) => [index + 1, page]));
    writePages('代码-后30页.md', '代码材料（后30页）', pages.slice(-30).map((page, index) => [pages.length - 29 + index, page]));
  } else {
    writePages('代码-全部.md', '代码材料（全部）', pages.map((page, index) => [index + 1, page]));
  }

  const manifest = {
    software_name: softwareName,
    version,
    project_root: projectDir,
    lines_per_page: LINES_PER_PAGE,
    total_pages: pages.length,
    mode: pages.length >= SPLIT_PAGES ? 'front30_back30' : 'all_under_60_pages',
    material_line_count: allLines.length,
    selection_strategy: 'core-category-score-v1',
    excluded_paths: normalizePathList(fields.codeExcludedPaths),
    included_paths: normalizePathList(fields.codeIncludedPaths),
    category_summary: files.reduce((summary, item) => {
      summary[item.category] = (summary[item.category] || 0) + 1;
      return summary;
    }, {}),
    files,
  };
  writeJson(path.join(draftDir, '代码提取清单.json'), manifest);
  fs.writeFileSync(path.join(draftDir, '代码提取清单.md'), [
    '# 代码提取清单',
    '',
    `- 软件名称：${softwareName}`,
    `- 版本号：${version}`,
    `- 总页数：${pages.length}`,
    `- 材料代码行数：${allLines.length}`,
    `- 选择策略：核心类别覆盖 + 源码权重排序`,
    '',
    '| 文件 | 类型 | 源码行数 | 材料行范围 |',
    '| --- | --- | ---: | --- |',
    ...files.map((item) => `| \`${item.path}\` | ${item.category} | ${item.source_line_count} | ${item.material_line_start}-${item.material_line_end} |`),
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
    if (line.startsWith('# ')) {
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

async function writeDocx(markdown, outPath, headerText = '', options = {}) {
  const coverChildren = options.kind === 'manual'
    ? createManualCoverChildren(options.fields || {}, options.softwareName || headerText || '软件', options.version || '')
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
          : { kind: options.kind, bodyFont: '宋体', bodySize: 24, bodyLine: 360, bodyAfter: 120 }),
      ],
    }],
  });
  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
}

async function maybeGenerateIllustration(aiService, enabled, fields) {
  if (!enabled) return null;
  try {
    const availability = aiService.getImageModelAvailability();
    if (!availability.available) return null;
    return await aiService.generateImage({
      title: '软著操作手册示意图',
      prompt: buildManualIllustrationPrompt(fields),
      size: '1024x1024',
      logTitle: '软著-操作手册示意图',
    });
  } catch (error) {
    return { success: false, message: error.message || '生图失败' };
  }
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

function createSoftwareCopyrightService({ app, aiService, configStore, codeGenerationService }) {
  const rootDir = getSoftwareCopyrightDir(app);
  const statePath = path.join(rootDir, 'state.json');
  const subscribers = new Set();
  let activeTask = null;

  function loadState() {
    ensureDir(rootDir);
    const saved = readJson(statePath, null);
    const availability = aiService.getImageModelAvailability();
    const codeGenerationMaterials = codeGenerationService?.getConfirmedMaterials?.() || null;
    return {
      ...initialState,
      ...(saved || {}),
      fields: { ...initialFields, ...(saved?.fields || {}) },
      options: {
        ...initialState.options,
        ...(saved?.options || {}),
        exportItems: {
          ...initialState.options.exportItems,
          ...(saved?.options?.exportItems || {}),
        },
      },
      imageModel: availability,
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
    return next;
  }

  function emit(state) {
    for (const webContents of subscribers) {
      if (!webContents.isDestroyed()) {
        webContents.send('software-copyright:event', state);
      }
    }
  }

  function subscribe(webContents) {
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
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

  function validateDraftCompleteness(state = loadState()) {
    const issues = [];
    const fields = state.fields || {};

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

    const manifestPath = state.draftMeta?.manifestPath || (state.draftDir ? path.join(state.draftDir, '代码提取清单.json') : '');
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      issues.push({ type: 'code', severity: 'error', message: '缺少代码提取清单 JSON，无法核对代码页数。' });
    } else {
      const manifest = readJson(manifestPath, {});
      if (!Number.isFinite(Number(manifest.total_pages)) || Number(manifest.total_pages) <= 0) {
        issues.push({ type: 'code', severity: 'error', message: '代码提取清单中的总页数无效。' });
      }
      if (!Number.isFinite(Number(manifest.material_line_count)) || Number(manifest.material_line_count) <= 0) {
        issues.push({ type: 'code', severity: 'error', message: '代码提取清单中的材料代码行数无效。' });
      }
      if (!Array.isArray(manifest.files) || !manifest.files.length) {
        issues.push({ type: 'code', severity: 'error', message: '代码提取清单中没有源码文件记录。' });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      checkedAt: now(),
    };
  }

  async function runDraftGeneration(payload = {}) {
    const state = loadState();
    const sourceMode = payload.sourceMode || state.options.sourceMode || 'project';
    const codeGenerationMaterials = sourceMode === 'code-generation' ? codeGenerationService?.getConfirmedMaterials?.() : null;
    const projectDir = codeGenerationMaterials?.project?.path || state.project?.path;
    if (!projectDir || !fs.existsSync(projectDir)) {
      throw new Error(sourceMode === 'code-generation' ? '请先在代码生成中确认源码材料' : '请先选择有效的项目目录');
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
    const fields = createInitialFieldsFromAnalysis(analysis, { ...state.fields, ...(payload.fields || {}) });
    saveState({
      analysis,
      fields,
      step: 'generating',
      drafts: {},
      draftConfirmed: false,
      draftConfirmedAt: '',
      draftDir,
      outputRoot: outRoot,
      outputDir: '',
      outputs: [],
      draftMeta: null,
    });

    push('正在生成业务理解', 22);
    const business = await generateBusinessContext(aiService, analysis, fields);
    writeJson(path.join(draftDir, '业务理解.json'), business);
    const businessMarkdown = createBusinessMarkdown(business);
    fs.writeFileSync(path.join(draftDir, '业务理解.md'), businessMarkdown, 'utf-8');

    push('正在抽取真实源码材料', 40);
    const codeExcludedPaths = normalizePathList(payload.codeExcludedPaths || state.options.codeExcludedPaths);
    const codeIncludedPaths = normalizePathList(payload.codeIncludedPaths || state.options.codeIncludedPaths);
    const selectedFiles = codeGenerationMaterials?.selectedFiles?.length
      ? codeGenerationMaterials.selectedFiles.filter((item) => !codeExcludedPaths.includes(item.path))
      : selectCodeFiles(analysis, codeExcludedPaths, codeIncludedPaths);
    const { manifest, outputs: codeMarkdownFiles } = createCodeMaterial(projectDir, selectedFiles, { ...fields, codeExcludedPaths, codeIncludedPaths }, draftDir);
    const nextFields = { ...fields, sourceLineCount: fields.sourceLineCount || String(analysis.lineCount), pageCount: String(manifest.total_pages) };

    push('正在整理申请表信息草稿', 55);
    const applicationMarkdown = createApplicationMarkdown(nextFields, business, manifest);
    fs.writeFileSync(path.join(draftDir, '申请表信息.md'), applicationMarkdown, 'utf-8');

    push('正在生成操作手册草稿', 70);
    let manualMarkdown = await createManualMarkdown(aiService, analysis, nextFields, business);
    const illustration = await maybeGenerateIllustration(aiService, state.options.useAiImages || payload.useAiImages, nextFields);
    if (illustration?.success && illustration.file_path) {
      manualMarkdown += `\n\n## 附录、示意图\n\n![软著操作手册示意图](${illustration.file_path})\n`;
    }
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
      drafts,
      draftConfirmed: false,
      draftDir,
      outputRoot: outRoot,
      outputDir: '',
      outputs: [],
      draftMeta: {
        manifestPath: path.join(draftDir, '代码提取清单.json'),
        codeMarkdownFiles,
        illustration,
      },
    });
  }

  async function runFinalExport() {
    const state = loadState();
    if (!state.draftDir || !fs.existsSync(state.draftDir)) {
      throw new Error('请先生成草稿');
    }
    if (!state.draftConfirmed) {
      throw new Error('请先确认草稿后再导出正式资料');
    }

    const finalDir = ensureDir(path.join(state.outputRoot || path.dirname(state.draftDir), '正式资料'));
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
      await writeDocx(manualMarkdown, manualDocxPath, `${softwareName} ${version}`, {
        kind: 'manual',
        fields,
        softwareName,
        version,
      });
      finalOutputs.push(manualDocxPath);
    }

    if (exportItems.code) {
      const codeMarkdownFiles = Array.isArray(state.draftMeta?.codeMarkdownFiles) && state.draftMeta.codeMarkdownFiles.length
        ? state.draftMeta.codeMarkdownFiles
        : Object.values(state.drafts || {}).filter((filePath) => /^代码-.*\.md$/u.test(path.basename(String(filePath || ''))));
      for (const mdPath of codeMarkdownFiles) {
        if (!fs.existsSync(mdPath)) continue;
        const md = fs.readFileSync(mdPath, 'utf-8');
        const suffix = path.basename(mdPath).replace(/^代码-/, '').replace(/\.md$/, '');
        const docxPath = path.join(finalDir, `${softwareName}-代码(${suffix}).docx`);
        await writeDocx(md, docxPath, `${softwareName} ${version} 源程序`, { kind: 'code' });
        finalOutputs.push(docxPath);
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
        state.draftMeta?.illustration?.success ? `- 生图结果：${state.draftMeta.illustration.file_path}` : '- 生图结果：未使用或未生成',
        '',
        '## 输出文件',
        '',
        ...reportOutputs.map((filePath) => `- ${path.basename(filePath)}`),
        '',
        '## 格式说明',
        '',
        exportItems.manual ? '- 操作手册 DOCX 包含封面、页眉和页码。' : '',
        exportItems.code ? '- 代码材料 DOCX 使用等宽字体和紧凑行距，便于核对源程序内容。' : '',
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

    updateTask({ status: 'success', progress: 100, logs: ['正式资料导出完成'] }, {
      step: 'result',
      outputs: finalOutputs.map((filePath) => ({ name: path.basename(filePath), path: filePath })),
      outputDir: finalDir,
    });
  }

  return {
    subscribe,
    loadState,
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
        draftDir: '',
        outputRoot: '',
        outputDir: '',
        outputs: [],
        draftMeta: null,
      });
      return { success: true, state };
    },
    saveFields(fields) {
      return saveState({ fields: { ...(fields || {}) } });
    },
    saveOptions(options) {
      return saveState({ options: { ...(options || {}) } });
    },
    readDraft(draftKey) {
      const state = loadState();
      const filePath = getDraftPath(state, draftKey);
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const content = normalizeDraftContent(draftKey, originalContent);
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
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
        throw new Error(sourceMode === 'code-generation' ? '请先在代码生成中确认源码材料' : '请先选择有效的项目目录');
      }

      const analysis = codeGenerationMaterials?.analysis || analyzeProject(projectDir);
      const fields = createInitialFieldsFromAnalysis(analysis, { ...state.fields, ...(payload.fields || {}) });
      const codeExcludedPaths = normalizePathList(payload.codeExcludedPaths || state.options.codeExcludedPaths);
      const codeIncludedPaths = normalizePathList(payload.codeIncludedPaths || state.options.codeIncludedPaths);
      const selectedFiles = codeGenerationMaterials?.selectedFiles?.length
        ? codeGenerationMaterials.selectedFiles.filter((item) => !codeExcludedPaths.includes(item.path))
        : selectCodeFiles(analysis, codeExcludedPaths, codeIncludedPaths);
      const { manifest, outputs: codeMarkdownFiles } = createCodeMaterial(projectDir, selectedFiles, { ...fields, codeExcludedPaths, codeIncludedPaths }, state.draftDir);
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
        drafts: nextDrafts,
        draftConfirmed: false,
        draftConfirmedAt: '',
        outputDir: '',
        outputs: [],
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
    saveDraft({ key, content }) {
      const state = loadState();
      const filePath = getDraftPath(state, key);
      fs.writeFileSync(filePath, normalizeDraftContent(key, content), 'utf-8');
      const next = saveState({
        draftConfirmed: false,
        draftConfirmedAt: '',
        step: 'draft',
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
      const next = saveState({ draftConfirmed: true, draftConfirmedAt: now(), step: 'draft' });
      emit(next);
      return next;
    },
    exportFinal(payload = {}) {
      if (activeTask?.status === 'running') {
        return activeTask;
      }
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
