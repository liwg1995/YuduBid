const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dialog } = require('electron');
const { getPatentGenerationDir } = require('../utils/paths.cjs');

const TEXT_EXTS = new Set(['.md', '.txt', '.doc.md', '.markdown', '.json', '.yml', '.yaml']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.vue', '.py', '.java', '.go', '.rs', '.cs', '.sql']);
const SKIP_DIRS = new Set(['.git', '.hg', '.svn', '.idea', '.vscode', 'node_modules', 'dist', 'build', 'release', 'coverage', 'archive', '软件著作权申请资料']);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'tsconfig.tsbuildinfo']);
const MAX_SCAN_FILES = 44;
const MAX_FILE_CHARS = 3800;
const MAX_PROMPT_CHARS = 120_000;

const initialCaseInfo = {
  caseName: '',
  topic: '',
  patentType: 'unknown',
  contact: {
    name: '',
    phone: '',
    email: '',
  },
};

const initialState = {
  stage: 'setup',
  caseId: '',
  caseInfo: initialCaseInfo,
  project: null,
  materials: [],
  scanSummary: '',
  miningResult: [],
  selectedPatentPointId: '',
  priorArtMarkdown: '',
  disclosureDrafts: [],
  activeDraftId: '',
  revisionLogs: [],
  task: undefined,
  outputDir: '',
  updated_at: '',
};

function now() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return safeJsonParse(fs.readFileSync(filePath, 'utf-8'), fallback);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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

function classifyFile(relativePath) {
  const r = relativePath.toLowerCase();
  const name = path.basename(r);
  if (r.includes('/doc') || r.includes('/docs') || r.endsWith('.md') || r.endsWith('.txt')) return '技术文档';
  if (['main.ts', 'main.tsx', 'main.js', 'main.jsx', 'app.tsx', 'index.tsx', 'index.jsx'].includes(name)) return '入口';
  if (r.includes('/router') || r.includes('/routes') || name.includes('router') || name.includes('route')) return '路由';
  if (r.includes('/pages/') || r.includes('/views/') || r.includes('/screens/') || r.includes('/app/')) return '页面';
  if (r.includes('/services/') || r.includes('/api/') || r.includes('/ipc/') || r.includes('/handlers/') || r.includes('/tasks/')) return '业务服务';
  if (r.includes('/store') || r.includes('/stores') || r.includes('/redux')) return '状态数据';
  if (r.includes('/utils/') || r.includes('/shared/') || r.includes('/hooks/')) return '通用能力';
  if (r.includes('/components/')) return '组件';
  return '源码';
}

function categoryPriority(category) {
  const order = ['技术文档', '业务服务', '入口', '路由', '页面', '状态数据', '通用能力', '组件', '源码'];
  const index = order.indexOf(category);
  return index >= 0 ? index : 99;
}

function walkPatentSourceFiles(root, results = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (isSkipped(filePath)) continue;
    if (entry.isDirectory()) {
      walkPatentSourceFiles(filePath, results);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTS.has(ext) && !CODE_EXTS.has(ext)) continue;

    const stat = fs.statSync(filePath);
    if (stat.size <= 0 || stat.size > 900_000) continue;
    const relativePath = rel(filePath, root);
    results.push({
      filePath,
      path: relativePath,
      extension: ext,
      size: stat.size,
      category: classifyFile(relativePath),
    });
  }
  return results;
}

function scanProjectMaterials(projectDir) {
  if (!projectDir || !fs.existsSync(projectDir)) {
    throw new Error('项目目录不存在，请重新选择用于专利挖掘的项目目录');
  }
  if (!fs.statSync(projectDir).isDirectory()) {
    throw new Error('请选择一个有效的项目目录');
  }

  const files = walkPatentSourceFiles(projectDir).map((file) => {
    const content = readText(file.filePath, MAX_FILE_CHARS * 4)
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .slice(0, MAX_FILE_CHARS);
    return {
      ...file,
      line_count: content.split('\n').length,
      excerpt: content,
    };
  });

  files.sort((a, b) => categoryPriority(a.category) - categoryPriority(b.category) || b.size - a.size);
  const selected = files.slice(0, MAX_SCAN_FILES);
  let promptText = '';
  const promptFiles = [];

  for (const file of selected) {
    const block = [
      `## ${file.path}`,
      `类型：${file.category}`,
      '```',
      file.excerpt,
      '```',
      '',
    ].join('\n');
    if (promptText.length + block.length > MAX_PROMPT_CHARS) break;
    promptText += block;
    promptFiles.push({
      path: file.path,
      category: file.category,
      line_count: file.line_count,
      size: file.size,
    });
  }

  const categorySummary = promptFiles.reduce((acc, file) => {
    acc[file.category] = (acc[file.category] || 0) + 1;
    return acc;
  }, {});

  return {
    projectName: path.basename(projectDir),
    projectRoot: projectDir,
    fileCount: files.length,
    scannedFileCount: promptFiles.length,
    categorySummary,
    files: promptFiles,
    promptText,
  };
}

function formatScanSummary(scan, aiSummary = '') {
  const lines = [
    `项目：${scan.projectName}`,
    `可扫描文件：${scan.fileCount}`,
    `纳入分析文件：${scan.scannedFileCount}`,
    `分类：${Object.entries(scan.categorySummary).map(([name, count]) => `${name} ${count}`).join('、') || '未识别'}`,
  ];
  const summary = String(aiSummary || '').trim();
  if (summary) {
    lines.push(`挖掘摘要：${summary}`);
  }
  return lines.join('\n');
}

function normalizePatentPoint(point, index) {
  const normalized = {
    id: point?.id ? String(point.id) : crypto.randomUUID(),
    title: String(point?.title || `候选专利点 ${index + 1}`).trim(),
    technicalBackground: String(point?.technicalBackground || point?.technical_background || '').trim(),
    innovation: String(point?.innovation || '').trim(),
    difference: String(point?.difference || '').trim(),
    feasibility: String(point?.feasibility || '').trim(),
    recommendedClaims: Array.isArray(point?.recommendedClaims)
      ? point.recommendedClaims.map(String).filter(Boolean)
      : Array.isArray(point?.recommended_claims)
        ? point.recommended_claims.map(String).filter(Boolean)
      : [],
    score: Number.isFinite(Number(point?.score)) ? Number(point.score) : undefined,
  };
  return {
    ...normalized,
    qualityWarnings: evaluatePatentPointQuality(normalized),
  };
}

function evaluatePatentPointQuality(point) {
  const warnings = [];
  const title = String(point.title || '');
  const innovation = String(point.innovation || '');
  const difference = String(point.difference || '');
  const background = String(point.technicalBackground || '');
  const feasibility = String(point.feasibility || '');
  const combined = [title, background, innovation, difference, feasibility].join('\n');

  if (!/(方法|系统|装置|设备|介质|模块|流程|引擎)/.test(title)) {
    warnings.push('标题缺少明确保护客体');
  }
  if (background.length < 18) {
    warnings.push('技术背景和问题偏短');
  }
  if (innovation.length < 24) {
    warnings.push('核心创新点偏短');
  }
  if (difference.length < 20) {
    warnings.push('与现有方案区别点偏短');
  }
  if (feasibility.length < 16) {
    warnings.push('可实施性说明偏短');
  }
  if (!Array.isArray(point.recommendedClaims) || !point.recommendedClaims.length) {
    warnings.push('缺少权利要求类型建议');
  }
  if (/(提升效率|用户体验|智能化|一键生成|自动生成|管理平台|业务流程)/.test(combined) && !/(抽取|匹配|校验|排序|分级|闭环|模型|规则|索引|缓存|解析|同步|映射|参数)/.test(combined)) {
    warnings.push('偏功能效果描述，需补充具体技术手段');
  }
  return warnings.slice(0, 4);
}

function sanitizeFilename(value, fallback = '技术交底书') {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || fallback;
}

function buildMiningMessages(state, scan) {
  const caseInfo = state.caseInfo || initialCaseInfo;
  return [
    {
      role: 'system',
      content: [
        '你是中国发明专利技术交底书方向的技术分析助手。',
        '任务是基于项目资料挖掘可专利化技术点，输出严格 JSON。',
        '必须聚焦技术问题、技术手段、组合创新、可实施性，不要输出市场卖点、普通业务流程或泛泛的 AI 生成能力。',
        '每个候选点都必须能回答：解决什么技术问题、用了什么技术手段、相对现有方案区别在哪里、为什么能实施。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于以下项目资料，生成 3 到 5 个候选专利点。',
        '质量要求：',
        '- 标题应体现保护客体，例如“方法”“系统”“装置”“介质”或明确的技术模块。',
        '- 核心创新必须写具体技术手段，不要只写“提高效率”“智能生成”“优化体验”。',
        '- 区别点必须说明相对人工处理、关键词检索、普通规则配置或常规流程的差异。',
        '- 可实施性必须落到项目中的数据、流程、模块、算法、规则或接口。',
        '',
        `案件名称：${caseInfo.caseName || '未填写'}`,
        `技术主题：${caseInfo.topic || '未填写'}`,
        `专利类型倾向：${caseInfo.patentType || 'unknown'}`,
        `项目名称：${scan.projectName}`,
        `扫描文件数：${scan.scannedFileCount}/${scan.fileCount}`,
        `文件分类：${JSON.stringify(scan.categorySummary)}`,
        '',
        '输出 JSON 格式：',
        '{',
        '  "points": [',
        '    {',
        '      "title": "候选专利点标题",',
        '      "technicalBackground": "技术背景和问题",',
        '      "innovation": "核心创新点",',
        '      "difference": "与常规方案或现有技术的区别",',
        '      "feasibility": "可实施性说明",',
        '      "recommendedClaims": ["方法", "系统"],',
        '      "score": 85',
        '    }',
        '  ],',
        '  "summary": "本次挖掘摘要"',
        '}',
        '',
        '项目资料：',
        scan.promptText,
      ].join('\n'),
    },
  ];
}

function buildDisclosureMessages(state, selectedPoint) {
  const caseInfo = state.caseInfo || initialCaseInfo;
  const contact = caseInfo.contact || {};
  const priorArtMarkdown = String(state.priorArtMarkdown || '').trim();
  return [
    {
      role: 'system',
      content: [
        '你是中国发明专利技术交底书撰写助手。',
        '请基于给定案件信息和主专利点，生成结构完整、可交给代理人继续修改的技术交底书 Markdown 草稿。',
        '正文必须使用中文，避免虚构具体专利号、论文和查新结论；若缺少查新材料，在现有技术部分明确写“待补充查新资料”。',
        '系统框图和流程图使用 fenced mermaid 代码块，不要使用 ASCII 框图。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `案件名称：${caseInfo.caseName || selectedPoint.title}`,
        `技术主题：${caseInfo.topic || '待填写'}`,
        `专利类型倾向：${caseInfo.patentType || 'unknown'}`,
        `联系人姓名：${contact.name || '待填写'}`,
        `联系人电话：${contact.phone || '待填写'}`,
        `联系人邮箱：${contact.email || '待填写'}`,
        '',
        '主专利点：',
        `标题：${selectedPoint.title}`,
        `技术背景：${selectedPoint.technicalBackground || '未提供'}`,
        `核心创新：${selectedPoint.innovation || '未提供'}`,
        `区别点：${selectedPoint.difference || '未提供'}`,
        `可实施性：${selectedPoint.feasibility || '未提供'}`,
        `权利要求倾向：${(selectedPoint.recommendedClaims || []).join('、') || '暂不确定'}`,
        '',
        '已有查新分析：',
        priorArtMarkdown || '暂无查新分析。生成交底书时请在现有技术部分写“待补充查新资料”，不要编造具体专利号或公开来源。',
        '',
        '请按以下章节生成 Markdown：',
        '# 技术交底书',
        '**案件名称**：...',
        '**技术联系人**：...',
        '**专利类型**：发明',
        '## 注意事项',
        '## 一、介绍相关技术背景，描述与本发明技术最相近的现有技术，并说明该现有技术存在的缺点',
        '### 1.1 现有技术',
        '### 1.2 现有技术存在的缺点',
        '## 二、针对上述缺点，说明本发明所要解决的技术问题',
        '## 三、本发明技术方案的详细阐述',
        '### 3.1 背景',
        '### 3.2 系统框图',
        '### 3.3 模块功能说明',
        '### 3.4 系统流程说明',
        '### 3.5 关键技术参数',
        '## 四、与现有技术相比，本发明具有哪些优点？',
        '## 五、本发明的技术关键点和欲保护点是什么？',
        '## 六、其它（实施例、技术效果、参数示例）',
      ].join('\n'),
    },
  ];
}

function buildPriorArtMessages(state, sourceText) {
  const caseInfo = state.caseInfo || initialCaseInfo;
  const selectedPoint = (state.miningResult || []).find((point) => point.id === state.selectedPatentPointId) || null;
  return [
    {
      role: 'system',
      content: [
        '你是中国发明专利查新资料整理助手。',
        '用户会粘贴公开专利、论文、网页或代理人检索资料。请只基于用户提供资料和本案主专利点进行归纳，不要编造专利号、申请人、URL 或论文信息。',
        '输出 Markdown，供技术交底书第一章引用。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `案件名称：${caseInfo.caseName || '未填写'}`,
        `技术主题：${caseInfo.topic || '未填写'}`,
        '',
        '主专利点：',
        selectedPoint
          ? [
            `标题：${selectedPoint.title}`,
            `核心创新：${selectedPoint.innovation || '未提供'}`,
            `区别点：${selectedPoint.difference || '未提供'}`,
          ].join('\n')
          : '尚未选择主专利点，请仍按资料本身整理。',
        '',
        '请输出以下 Markdown 结构：',
        '## 查新资料整理',
        '### 一、现有技术条目',
        '- 每条包含：名称/标识、公开来源、技术方案要点、应用场景、局限性。缺少字段请写“资料未提供”。',
        '### 二、与本案的区别点',
        '- 从技术问题、技术手段、流程闭环、数据处理、效果等角度归纳。',
        '### 三、可回写至交底书 1.1 的文字',
        '- 用交底书正文语气写 2-5 段，可直接粘贴到 1.1 现有技术。',
        '### 四、风险与待补充',
        '- 指出资料不足、需代理人核验或需继续检索的点。',
        '',
        '用户粘贴资料：',
        String(sourceText || '').slice(0, 80_000),
      ].join('\n'),
    },
  ];
}

function buildRevisionMessages(state, draftContent, instruction, kind) {
  const caseInfo = state.caseInfo || initialCaseInfo;
  const selectedPoint = (state.miningResult || []).find((point) => point.id === state.selectedPatentPointId) || null;
  const modeText = kind === 'correct' ? '事实纠错/参数修正' : '补充材料/扩展合并';
  return [
    {
      role: 'system',
      content: [
        '你是中国发明专利技术交底书修订助手。',
        '请基于已有 Markdown 草稿和用户修订说明生成新的完整 Markdown 草稿。',
        '必须保留技术交底书章节结构；不要输出修订说明以外的对话；不要覆盖旧稿。',
        '如用户要求纠错，应同步修订相关章节、参数、实施例和保护点；如用户补充材料，应合并到最合适章节。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `案件名称：${caseInfo.caseName || '未填写'}`,
        `修订类型：${modeText}`,
        '',
        '主专利点：',
        selectedPoint
          ? [
            `标题：${selectedPoint.title}`,
            `核心创新：${selectedPoint.innovation || '未提供'}`,
            `区别点：${selectedPoint.difference || '未提供'}`,
          ].join('\n')
          : '未选择主专利点。',
        '',
        '用户修订说明：',
        instruction,
        '',
        '已有技术交底书 Markdown：',
        draftContent.slice(0, 160_000),
        '',
        '请输出修订后的完整 Markdown 草稿。正文中不要包含“修订摘要”“自检清单”或本系统说明。',
      ].join('\n'),
    },
  ];
}

function buildRevisionSummaryMessages(instruction, beforeTitle, revisedContent) {
  return [
    {
      role: 'system',
      content: '你是专利交底书修订记录助手。请基于用户说明和修订后内容，输出 120 字以内的中文修订摘要。',
    },
    {
      role: 'user',
      content: [
        `原草稿：${beforeTitle || '未命名草稿'}`,
        '用户说明：',
        instruction,
        '',
        '修订后内容节选：',
        revisedContent.slice(0, 6000),
      ].join('\n'),
    },
  ];
}

function normalizePatentType(value) {
  return ['method', 'system', 'device', 'unknown'].includes(value) ? value : 'unknown';
}

function normalizeContact(contact = {}) {
  return {
    name: String(contact.name || '').trim(),
    phone: String(contact.phone || '').trim(),
    email: String(contact.email || '').trim(),
  };
}

function normalizeCaseInfo(caseInfo = {}) {
  return {
    caseName: String(caseInfo.caseName || '').trim(),
    topic: String(caseInfo.topic || '').trim(),
    patentType: normalizePatentType(caseInfo.patentType),
    contact: normalizeContact(caseInfo.contact),
  };
}

function createPatentGenerationService({ app, aiService }) {
  const rootDir = getPatentGenerationDir(app);
  const statePath = path.join(rootDir, 'state.json');
  const draftsDir = path.join(rootDir, 'drafts');
  const subscribers = new Set();

  function mergeState(saved) {
    const caseId = saved?.caseId || crypto.randomUUID();
    return {
      ...initialState,
      ...(saved || {}),
      caseId,
      caseInfo: {
        ...initialCaseInfo,
        ...(saved?.caseInfo || {}),
        contact: {
          ...initialCaseInfo.contact,
          ...(saved?.caseInfo?.contact || {}),
        },
      },
      project: saved?.project || null,
      materials: Array.isArray(saved?.materials) ? saved.materials : [],
      scanSummary: String(saved?.scanSummary || ''),
      miningResult: Array.isArray(saved?.miningResult) ? saved.miningResult : [],
      disclosureDrafts: Array.isArray(saved?.disclosureDrafts) ? saved.disclosureDrafts : [],
      revisionLogs: Array.isArray(saved?.revisionLogs) ? saved.revisionLogs : [],
      outputDir: saved?.outputDir || rootDir,
      updated_at: saved?.updated_at || now(),
    };
  }

  function loadState() {
    ensureDir(rootDir);
    const saved = readJson(statePath, null);
    const state = mergeState(saved);
    if (!saved || !saved.caseId || !saved.updated_at || !saved.outputDir) {
      writeJson(statePath, state);
    }
    return state;
  }

  function saveState(partial) {
    const previous = loadState();
    const next = {
      ...previous,
      ...partial,
      caseInfo: {
        ...previous.caseInfo,
        ...(partial.caseInfo || {}),
        contact: {
          ...previous.caseInfo.contact,
          ...(partial.caseInfo?.contact || {}),
        },
      },
      updated_at: now(),
    };
    writeJson(statePath, next);
    emit(next);
    return next;
  }

  function emit(state) {
    for (const webContents of subscribers) {
      if (webContents.isDestroyed()) {
        subscribers.delete(webContents);
      } else {
        webContents.send('patent-generation:event', state);
      }
    }
  }

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed() || subscribers.has(webContents)) return;
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
  }

  function saveCaseInfo(caseInfo) {
    const normalized = normalizeCaseInfo(caseInfo);
    return saveState({ caseInfo: normalized });
  }

  function selectPatentPoint(pointId) {
    const current = loadState();
    const normalizedPointId = String(pointId || '').trim();
    if (!normalizedPointId) {
      throw new Error('请选择一个候选专利点');
    }
    const exists = (current.miningResult || []).some((point) => point.id === normalizedPointId);
    if (!exists) {
      throw new Error('候选专利点不存在，请重新挖掘后再选择');
    }
    return saveState({
      selectedPatentPointId: normalizedPointId,
      stage: 'disclosure',
    });
  }

  function getSelectedPatentPoint(state = loadState()) {
    const selectedId = state.selectedPatentPointId;
    return (state.miningResult || []).find((point) => point.id === selectedId) || null;
  }

  function getDraftPath(state, draftId) {
    const draft = (state.disclosureDrafts || []).find((item) => item.id === draftId);
    if (!draft) {
      throw new Error('交底书草稿不存在');
    }
    const normalizedDraftsDir = path.resolve(draftsDir);
    const normalizedFilePath = path.resolve(draft.file_path);
    if (!normalizedFilePath.startsWith(`${normalizedDraftsDir}${path.sep}`)) {
      throw new Error('交底书草稿路径无效');
    }
    if (!fs.existsSync(normalizedFilePath)) {
      throw new Error('交底书草稿文件已不存在，请重新生成');
    }
    return { draft, filePath: normalizedFilePath };
  }

  function readDisclosureDraft(draftId) {
    const state = loadState();
    const activeDraftId = draftId || state.activeDraftId;
    const { draft, filePath } = getDraftPath(state, activeDraftId);
    return {
      ...draft,
      content: fs.readFileSync(filePath, 'utf-8'),
    };
  }

  function saveDisclosureDraft(payload = {}) {
    const state = loadState();
    const draftId = String(payload.id || state.activeDraftId || '').trim();
    const content = String(payload.content || '');
    const { draft, filePath } = getDraftPath(state, draftId);
    fs.writeFileSync(filePath, content, 'utf-8');
    const nextDraft = { ...draft, updated_at: now() };
    return saveState({
      disclosureDrafts: (state.disclosureDrafts || []).map((item) => item.id === draftId ? nextDraft : item),
      activeDraftId: draftId,
    });
  }

  function savePriorArtMarkdown(markdown) {
    return saveState({
      stage: 'prior-art',
      priorArtMarkdown: String(markdown || ''),
    });
  }

  async function generatePriorArtAnalysis(payload = {}) {
    const sourceText = String(payload.sourceText || '').trim();
    if (!sourceText) {
      throw new Error('请先粘贴现有技术、公开专利或论文资料');
    }

    const state = loadState();
    updateTask({
      task_id: crypto.randomUUID(),
      type: 'patent-prior-art',
      status: 'running',
      progress: 18,
      message: '正在整理查新资料...',
      logs: ['开始整理查新资料'],
      started_at: now(),
    }, { stage: 'prior-art' });

    try {
      const content = await aiService.chat({
        messages: buildPriorArtMessages(state, sourceText),
        temperature: 0.2,
        logTitle: '专利查新资料整理',
        timeout_ms: 150000,
        timeout_message: '查新资料整理超时，请稍后重试',
      });
      const markdown = String(content || '').trim();
      if (!markdown) {
        throw new Error('模型未返回有效查新分析');
      }
      const nextState = updateTask({
        status: 'success',
        progress: 100,
        message: '查新分析已生成',
        logs: ['开始整理查新资料', '查新分析已生成'],
      }, {
        priorArtMarkdown: markdown,
      });
      return nextState;
    } catch (error) {
      updateTask({
        status: 'error',
        progress: 100,
        message: '查新分析生成失败',
        error: error.message || String(error),
        logs: [...(loadState().task?.logs || []), error.message || String(error)],
      });
      throw error;
    }
  }

  async function generateDisclosureDraft() {
    const state = loadState();
    const selectedPoint = getSelectedPatentPoint(state);
    if (!selectedPoint) {
      throw new Error('请先在专利挖掘中选择一个主专利点');
    }
    const logs = ['开始生成技术交底书草稿'];
    let disclosureProgressTimer = null;

    const pushDisclosureProgress = (message, progress, extra = {}) => {
      if (message && logs[logs.length - 1] !== message) {
        logs.push(message);
      }
      return updateTask({
        status: 'running',
        progress,
        message,
        logs: [...logs],
      }, extra);
    };

    const stopDisclosureProgressTimer = () => {
      if (disclosureProgressTimer) {
        clearInterval(disclosureProgressTimer);
        disclosureProgressTimer = null;
      }
    };

    updateTask({
      task_id: crypto.randomUUID(),
      type: 'patent-disclosure',
      status: 'running',
      progress: 15,
      message: '正在生成技术交底书草稿...',
      logs: [...logs],
      started_at: now(),
    }, { stage: 'disclosure' });

    try {
      pushDisclosureProgress('正在整理主专利点和案件信息...', 24);
      pushDisclosureProgress('正在构建交底书章节结构...', 36);

      let simulatedProgress = 42;
      disclosureProgressTimer = setInterval(() => {
        simulatedProgress = Math.min(88, simulatedProgress + 4);
        pushDisclosureProgress('模型正在撰写技术背景、方案、实施例和保护点...', simulatedProgress);
        if (simulatedProgress >= 88) {
          stopDisclosureProgressTimer();
        }
      }, 2200);

      const content = await aiService.chat({
        messages: buildDisclosureMessages(state, selectedPoint),
        temperature: 0.35,
        logTitle: '专利技术交底书草稿生成',
        timeout_ms: 180000,
        timeout_message: '交底书草稿生成超时，请稍后重试',
      });
      stopDisclosureProgressTimer();
      pushDisclosureProgress('正在校验并保存交底书 Markdown 草稿...', 92);
      const markdown = String(content || '').trim();
      if (!markdown) {
        throw new Error('模型未返回有效交底书草稿');
      }

      ensureDir(draftsDir);
      const draftId = crypto.randomUUID();
      const title = state.caseInfo.caseName || selectedPoint.title || '技术交底书';
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const filePath = path.join(draftsDir, `${sanitizeFilename(title)}_${stamp}.md`);
      fs.writeFileSync(filePath, markdown, 'utf-8');
      const draft = {
        id: draftId,
        title,
        file_path: filePath,
        created_at: now(),
        updated_at: now(),
      };
      const nextState = updateTask({
        status: 'success',
        progress: 100,
        message: '技术交底书草稿已生成',
        logs: [...logs, '技术交底书草稿已生成'],
      }, {
        disclosureDrafts: [draft, ...(loadState().disclosureDrafts || [])],
        activeDraftId: draftId,
      });
      return nextState;
    } catch (error) {
      stopDisclosureProgressTimer();
      updateTask({
        status: 'error',
        progress: 100,
        message: '技术交底书草稿生成失败',
        error: error.message || String(error),
        logs: [...(loadState().task?.logs || []), error.message || String(error)],
      });
      throw error;
    }
  }

  async function generateRevision(payload = {}) {
    const instruction = String(payload.instruction || '').trim();
    const kind = payload.kind === 'correct' ? 'correct' : 'merge';
    if (!instruction) {
      throw new Error('请先填写修订说明或补充材料');
    }

    const state = loadState();
    if (!state.activeDraftId) {
      throw new Error('请先生成一份交底书草稿');
    }
    const { draft, filePath } = getDraftPath(state, state.activeDraftId);
    const draftContent = fs.readFileSync(filePath, 'utf-8');
    if (!draftContent.trim()) {
      throw new Error('当前交底书草稿为空，请先生成或编辑草稿');
    }

    updateTask({
      task_id: crypto.randomUUID(),
      type: 'patent-iteration',
      status: 'running',
      progress: 15,
      message: '正在生成修订版本...',
      logs: ['开始生成修订版本'],
      started_at: now(),
    }, { stage: 'iteration' });

    try {
      const revisedContent = String(await aiService.chat({
        messages: buildRevisionMessages(state, draftContent, instruction, kind),
        temperature: 0.28,
        logTitle: '专利交底书修订迭代',
        timeout_ms: 180000,
        timeout_message: '交底书修订生成超时，请稍后重试',
      }) || '').trim();
      if (!revisedContent) {
        throw new Error('模型未返回有效修订草稿');
      }

      const summary = String(await aiService.chat({
        messages: buildRevisionSummaryMessages(instruction, draft.title, revisedContent),
        temperature: 0.2,
        logTitle: '专利交底书修订摘要',
        timeout_ms: 90000,
        timeout_message: '修订摘要生成超时，请稍后重试',
      }) || '').trim();

      ensureDir(draftsDir);
      const draftId = crypto.randomUUID();
      const title = draft.title || state.caseInfo.caseName || '技术交底书';
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const nextFilePath = path.join(draftsDir, `${sanitizeFilename(title)}_修订_${stamp}.md`);
      fs.writeFileSync(nextFilePath, revisedContent, 'utf-8');
      const nextDraft = {
        id: draftId,
        title,
        file_path: nextFilePath,
        created_at: now(),
        updated_at: now(),
      };
      const revisionLog = {
        id: crypto.randomUUID(),
        kind,
        summary: summary || '已根据用户说明生成新的交底书修订版本。',
        artifact_paths: [nextFilePath],
        created_at: now(),
      };
      const nextState = updateTask({
        status: 'success',
        progress: 100,
        message: '修订版本已生成',
        logs: ['开始生成修订版本', '修订版本已生成'],
      }, {
        disclosureDrafts: [nextDraft, ...(loadState().disclosureDrafts || [])],
        activeDraftId: draftId,
        revisionLogs: [revisionLog, ...(loadState().revisionLogs || [])],
      });
      return {
        state: nextState,
        draft: {
          ...nextDraft,
          content: revisedContent,
        },
      };
    } catch (error) {
      updateTask({
        status: 'error',
        progress: 100,
        message: '修订版本生成失败',
        error: error.message || String(error),
        logs: [...(loadState().task?.logs || []), error.message || String(error)],
      });
      throw error;
    }
  }

  function updateTask(partial, statePartial = {}) {
    const previous = loadState();
    const task = {
      ...(previous.task || {
        task_id: crypto.randomUUID(),
        type: 'patent-mining',
        status: 'running',
        progress: 0,
        message: '',
        logs: [],
        started_at: now(),
      }),
      ...partial,
      logs: partial.logs || previous.task?.logs || [],
      updated_at: now(),
    };
    return saveState({ ...statePartial, task });
  }

  async function selectProject() {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择用于专利挖掘的项目目录' });
    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, message: '已取消选择', state: loadState() };
    }

    const projectDir = result.filePaths[0];
    const scan = scanProjectMaterials(projectDir);
    const state = saveState({
      stage: 'mining',
      project: { path: projectDir, name: path.basename(projectDir) },
      scanSummary: formatScanSummary(scan),
      miningResult: [],
      selectedPatentPointId: '',
      task: undefined,
    });
    return { success: true, state };
  }

  async function startMining() {
    const current = loadState();
    if (!current.project?.path) {
      throw new Error('请先选择用于专利挖掘的项目目录');
    }
    const logs = ['开始扫描项目资料'];
    let aiProgressTimer = null;

    const pushMiningProgress = (message, progress, extra = {}) => {
      if (message && logs[logs.length - 1] !== message) {
        logs.push(message);
      }
      return updateTask({
        status: 'running',
        progress,
        message,
        logs: [...logs],
      }, extra);
    };

    const stopAiProgressTimer = () => {
      if (aiProgressTimer) {
        clearInterval(aiProgressTimer);
        aiProgressTimer = null;
      }
    };

    updateTask({
      task_id: crypto.randomUUID(),
      type: 'patent-mining',
      status: 'running',
      progress: 12,
      message: '正在扫描项目资料...',
      logs: [...logs],
      started_at: now(),
    }, { stage: 'mining' });

    try {
      const scan = scanProjectMaterials(current.project.path);
      pushMiningProgress(`纳入分析文件 ${scan.scannedFileCount} 个`, 30, {
        scanSummary: formatScanSummary(scan),
      });
      pushMiningProgress('正在构建专利挖掘提示词...', 42);

      let simulatedProgress = 48;
      aiProgressTimer = setInterval(() => {
        simulatedProgress = Math.min(88, simulatedProgress + 4);
        pushMiningProgress('模型正在识别技术问题、创新组合和可保护点...', simulatedProgress);
        if (simulatedProgress >= 88) {
          stopAiProgressTimer();
        }
      }, 2200);

      const response = await aiService.collectJsonResponse({
        messages: buildMiningMessages(current, scan),
        schemaName: 'PatentMiningResult',
        temperature: 0.25,
        logTitle: '专利挖掘候选点生成',
        progressLabel: '专利挖掘结果',
        progressCallback: (message) => pushMiningProgress(message || '正在校验专利挖掘结果格式...', 90),
        failureMessage: '专利点挖掘失败，请检查文本模型配置后重试',
      });
      stopAiProgressTimer();
      pushMiningProgress('正在校验并排序候选专利点...', 92);
      const points = (Array.isArray(response?.points) ? response.points : [])
        .map(normalizePatentPoint)
        .filter((point) => point.title && point.innovation)
        .sort((a, b) => (a.qualityWarnings?.length || 0) - (b.qualityWarnings?.length || 0) || (Number(b.score || 0) - Number(a.score || 0)))
        .slice(0, 5);
      if (!points.length) {
        throw new Error('模型未返回有效候选专利点，请补充技术主题或更换项目资料后重试');
      }
      const selectedPatentPointId = points[0].id;
      const nextState = updateTask({
        status: 'success',
        progress: 100,
        message: '专利点挖掘完成',
        logs: [...logs, `生成候选专利点 ${points.length} 个`],
      }, {
        miningResult: points,
        selectedPatentPointId,
        scanSummary: formatScanSummary(scan, response?.summary),
      });
      return nextState;
    } catch (error) {
      stopAiProgressTimer();
      updateTask({
        status: 'error',
        progress: 100,
        message: '专利点挖掘失败',
        error: error.message || String(error),
        logs: [...(loadState().task?.logs || []), error.message || String(error)],
      });
      throw error;
    }
  }

  function clear() {
    ensureDir(rootDir);
    const next = mergeState({
      ...initialState,
      caseId: crypto.randomUUID(),
      outputDir: rootDir,
      updated_at: now(),
    });
    writeJson(statePath, next);
    emit(next);
    return { success: true, state: next };
  }

  return {
    loadState,
    saveCaseInfo,
    selectPatentPoint,
    selectProject,
    startMining,
    generateDisclosureDraft,
    readDisclosureDraft,
    saveDisclosureDraft,
    generatePriorArtAnalysis,
    savePriorArtMarkdown,
    generateRevision,
    clear,
    subscribe,
  };
}

module.exports = {
  createPatentGenerationService,
};
