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
  applicationType: 'invention',
  claimForms: ['method', 'system'],
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
    technicalBackground: String(point?.technicalBackground || point?.technical_background || point?.background || '').trim(),
    innovation: String(point?.innovation || point?.coreInnovation || point?.core_innovation || point?.technicalSolution || point?.technicalMeans || '').trim(),
    difference: String(point?.difference || point?.differences || point?.distinction || '').trim(),
    feasibility: String(point?.feasibility || point?.implementation || point?.implementability || '').trim(),
    recommendedClaims: Array.isArray(point?.recommendedClaims)
      ? point.recommendedClaims.map(String).filter(Boolean)
      : Array.isArray(point?.recommended_claims)
        ? point.recommended_claims.map(String).filter(Boolean)
      : [],
    evidence: Array.isArray(point?.evidence) ? point.evidence.map((item) => ({
      filePath: String(item?.filePath || item?.file_path || '').trim(),
      lineStart: Number.isFinite(Number(item?.lineStart)) ? Number(item.lineStart) : undefined,
      lineEnd: Number.isFinite(Number(item?.lineEnd)) ? Number(item.lineEnd) : undefined,
      excerpt: String(item?.excerpt || '').trim().slice(0, 500),
      evidenceType: ['technical-problem', 'technical-means', 'implementation', 'technical-effect'].includes(item?.evidenceType)
        ? item.evidenceType : 'technical-means',
      confidence: ['high', 'medium', 'low'].includes(item?.confidence) ? item.confidence : 'medium',
    })).filter((item) => item.filePath && item.excerpt) : [],
    assumptions: Array.isArray(point?.assumptions) ? point.assumptions.map(String).filter(Boolean).slice(0, 6) : [],
    missingFacts: Array.isArray(point?.missingFacts) ? point.missingFacts.map(String).filter(Boolean).slice(0, 6) : [],
    factSupplements: Array.isArray(point?.factSupplements) ? point.factSupplements.map((item) => ({
      fact: String(item?.fact || '').trim(),
      content: sanitizeFactSupplementContent(item?.content),
      basis: String(item?.basis || '').trim(),
      confidence: ['high', 'medium', 'low'].includes(item?.confidence) ? item.confidence : 'low',
      source: item?.source === 'manual' ? 'manual' : 'ai',
    })).filter((item) => item.fact).slice(0, 6) : [],
    scores: point?.scores && typeof point.scores === 'object' ? Object.fromEntries(
      ['technicality', 'noveltyPotential', 'inventivenessPotential', 'evidenceStrength', 'feasibility', 'protectionValue']
        .map((key) => [key, Math.max(0, Math.min(100, Number(point.scores[key]) || 0))]),
    ) : undefined,
    score: Number.isFinite(Number(point?.score)) ? Number(point.score) : undefined,
  };
  const confirmedFactNames = new Set(
    normalized.factSupplements
      .filter((item) => item.source === 'manual' && item.content)
      .map((item) => normalizeFactKey(item.fact)),
  );
  normalized.missingFacts = normalized.missingFacts.filter((fact) => !confirmedFactNames.has(normalizeFactKey(fact)));
  return {
    ...normalized,
    qualityWarnings: evaluatePatentPointQuality(normalized),
  };
}

function normalizeFactKey(value) {
  return String(value || '').toLowerCase().replace(/[\s，。；：、,.!?！？:;"'“”‘’（）()【】\[\]]+/g, '');
}

function sanitizeFactSupplementContent(value) {
  return String(value || '')
    .trim()
    .replace(/^(?:(?:AI\s*)?建议补充|补充建议|建议内容)\s*[：:]\s*/i, '')
    .trim();
}

function sanitizeDisclosureMarkdown(value) {
  return String(value || '')
    .replace(/^##\s+注意事项\s*$[\s\S]*?(?=^##\s+|\s*$)/m, '')
    .replace(/^\s*(?:[-*+]\s*)?(?:\*{1,2}|_{1,2})?待补充查新资料[。.]?(?:\*{1,2}|_{1,2})?\s*$/gim, '')
    // Markdown 的单换行会被渲染器折叠，案件首部字段必须用空行分成独立段落。
    .replace(/\s*(\*\*(?:案件名称|技术联系人|专利类型|联系电话|联系邮箱)\*\*[：:]|(?:案件名称|技术联系人|专利类型|联系电话|联系邮箱)[：:])/g, '\n\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPatentPoints(response) {
  if (Array.isArray(response)) return response;
  const candidates = [
    response?.points,
    response?.patentPoints,
    response?.patent_points,
    response?.candidates,
    response?.result?.points,
    response?.data?.points,
  ];
  return candidates.find(Array.isArray) || [];
}

function buildMiningRepairMessages(state, scan, response) {
  return [
    ...buildMiningMessages(state, scan),
    { role: 'assistant', content: JSON.stringify(response) },
    {
      role: 'user',
      content: [
        '刚才的结果没有通过候选点结构校验。请重新依据前述项目资料输出 {"points":[...],"summary":"..."}。',
        '每个 point 必须至少包含非空 title、innovation、technicalBackground、difference、feasibility、recommendedClaims、evidence、assumptions、missingFacts。',
        '如果原字段使用 coreInnovation、technicalSolution、technicalMeans 等名称，请归并到 innovation。不要虚构项目证据。',
      ].join('\n'),
    },
  ];
}

function buildFactSupplementMessages(state, point) {
  return [
    {
      role: 'system',
      content: [
        '你是专利技术事实整理助手。',
        '针对待补事实，根据已有候选点、证据和案件主题生成可编辑的建议答案。',
        '不能确认的内容必须使用“建议由发明人确认”或条件式表述，不得伪装成项目既有事实。',
        '只输出严格 JSON。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `案件名称：${state.caseInfo?.caseName || '未填写'}`,
        `技术主题：${state.caseInfo?.topic || '未填写'}`,
        `候选专利点：${point.title}`,
        `核心创新：${point.innovation}`,
        `可实施性：${point.feasibility}`,
        `已有证据：${JSON.stringify(point.evidence || [])}`,
        `待补事实：${JSON.stringify(point.missingFacts || [])}`,
        '',
        '输出格式：{"suggestions":[{"fact":"原待补事实","content":"建议补充内容","basis":"建议依据或需确认来源","confidence":"high|medium|low"}]}',
      ].join('\n'),
    },
  ];
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
  if (!Array.isArray(point.evidence) || !point.evidence.length) {
    warnings.push('缺少可回查的项目证据');
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
  const applicationType = caseInfo.applicationType || 'invention';
  const typeInstruction = applicationType === 'utility-model'
    ? '本案为实用新型，候选点必须聚焦产品的形状、构造、连接关系或空间布局，不得以纯方法或算法作为主线。'
    : applicationType === 'design'
      ? '本案为外观设计，候选点只描述产品可见的形状、图案、色彩及其结合；当前扫描不含图像理解时，必须把视图不足列入 missingFacts。'
      : '本案为发明，候选点应聚焦可实施的技术流程、系统协同、算法机制或装置改进。';
  return [
    {
      role: 'system',
      content: [
        '你是中国专利技术交底书方向的技术分析助手。',
        '任务是基于项目资料挖掘可专利化技术点，输出严格 JSON。',
        '必须聚焦技术问题、技术手段、组合创新、可实施性，不要输出市场卖点、普通业务流程或泛泛的 AI 生成能力。',
        '每个候选点都必须能回答：解决什么技术问题、用了什么技术手段、相对现有方案区别在哪里、为什么能实施。',
        typeInstruction,
        '所有确定性技术事实必须给出 evidence；无法从材料确认的内容放入 assumptions 或 missingFacts，禁止补写成既定事实。',
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
        `申请类型：${applicationType}`,
        `权利要求形态：${(caseInfo.claimForms || []).join('、') || '待分析'}`,
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
        '      "evidence": [{"filePath":"src/example.ts","lineStart":10,"lineEnd":18,"excerpt":"原文摘录","evidenceType":"technical-means","confidence":"high"}],',
        '      "assumptions": ["尚需发明人确认的合理假设"],',
        '      "missingFacts": ["影响成稿质量的缺失事实"],',
        '      "scores": {"technicality":85,"noveltyPotential":70,"inventivenessPotential":72,"evidenceStrength":80,"feasibility":88,"protectionValue":75},',
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
  const applicationType = caseInfo.applicationType || 'invention';
  const confirmedFactSupplements = (selectedPoint.factSupplements || [])
    .filter((item) => item.source === 'manual' && sanitizeFactSupplementContent(item.content))
    .map((item) => ({ fact: item.fact, content: sanitizeFactSupplementContent(item.content) }));
  const typeGuidance = applicationType === 'utility-model'
    ? '围绕部件、连接关系、空间布局和结构效果成文；没有图证或尺寸依据的内容必须标为待确认，不得写成纯算法或纯方法方案。'
    : applicationType === 'design'
      ? '只描述产品用途和可见的形状、图案、色彩或其结合；不得把内部构造、算法或功能效果写成设计要点。视图不足时输出待补视图清单。'
      : '系统框图和流程图使用 fenced mermaid 代码块，不要使用 ASCII 框图。Mermaid 优先使用 flowchart TD，节点与正文步骤必须一一对应。';
  const disclosureSections = applicationType === 'design' ? [
    '# 外观设计专利技术交底书', '**案件名称**：...', '**技术联系人**：...', '**专利类型**：外观设计',
    '## 一、产品名称与用途', '## 二、设计要点', '## 三、视图与图证说明', '## 四、与在先设计的可见差异', '## 五、待补视图与待确认事实',
  ] : applicationType === 'utility-model' ? [
    '# 实用新型专利技术交底书', '**案件名称**：...', '**技术联系人**：...', '**专利类型**：实用新型',
    '## 一、现有结构及其缺点', '## 二、所要解决的技术问题', '## 三、产品结构的详细说明', '### 3.1 部件清单',
    '### 3.2 连接关系和空间布局', '### 3.3 附图及图号说明', '## 四、结构带来的技术效果', '## 五、技术关键点和欲保护点', '## 六、具体实施例与装配方式',
  ] : [
    '# 技术交底书', '**案件名称**：...', '**技术联系人**：...', '**专利类型**：发明',
    '## 一、相关技术背景', '### 1.1 现有技术', '### 1.2 现有技术存在的缺点',
    '## 二、针对上述缺点，说明本发明所要解决的技术问题', '## 三、本发明技术方案的详细阐述', '### 3.1 背景', '### 3.2 系统框图',
    '### 3.3 模块功能说明', '### 3.4 系统流程说明', '### 3.5 关键技术参数', '## 四、与现有技术相比，本发明具有哪些优点？',
    '## 五、本发明的技术关键点和欲保护点是什么？', '## 六、其它（实施例、技术效果、参数示例）',
  ];
  return [
    {
      role: 'system',
      content: [
        '你是中国专利技术交底书撰写助手。',
        '请基于给定案件信息和主专利点，生成结构完整、可交给代理人继续修改的技术交底书 Markdown 草稿。',
        '正文必须使用中文，避免虚构具体专利号、论文和查新结论。查新属于可选增强；若未提供查新材料，仅基于项目资料客观概括技术背景，不要在正文中输出“待补充查新资料”等占位提示。',
        typeGuidance,
        '必须保持标题、模块、流程步骤、保护点和实施例术语一致。仅把 evidence 支持的内容写成确定事实；人工确认的补充内容可以采用，AI 建议仍须显式标为“待发明人确认”。',
        '本次先生成用于后续逐章扩写的结构化基础稿，控制在 1500—2500 个中文字符；必须完整包含规定的一级章节，但不要在本轮一次性扩写成长篇全文。',
        '后续程序会逐章扩写并将全文控制在 12000—15000 个中文字符。不得用重复、空泛描述凑字数；资料不足的参数应说明确定方法或标为待确认。',
        '不要生成“注意事项”“撰写说明”“免责声明”“后续扩写建议”等系统说明章节或元话语，标题之后直接进入专利交底书正文。',
        '技术方案部分应逐模块说明输入、处理步骤、输出、模块关系、数据流、异常处理和技术效果；流程步骤应写明执行主体、触发条件及前后依赖。',
        '至少给出两个具体实施例或运行场景，并将实施例步骤与系统框图、流程图和欲保护点对应起来。关键参数应说明含义、约束、可选范围或确定方式。',
        '案件名称、技术联系人、专利类型、联系电话、联系邮箱必须各自单独成段，不得合并在同一行。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `案件名称：${caseInfo.caseName || selectedPoint.title}`,
        `技术主题：${caseInfo.topic || '待填写'}`,
        `申请类型：${caseInfo.applicationType || 'invention'}`,
        `权利要求形态：${(caseInfo.claimForms || []).join('、') || '待分析'}`,
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
        `证据：${JSON.stringify(selectedPoint.evidence || [])}`,
        `合理假设：${(selectedPoint.assumptions || []).join('；') || '无'}`,
        `待补事实：${(selectedPoint.missingFacts || []).join('；') || '无'}`,
        `已人工确认的事实补充：${JSON.stringify(confirmedFactSupplements)}`,
        '',
        '已有查新分析：',
        priorArtMarkdown || '未进行查新增强。请仅基于项目资料客观概括技术背景，不要编造具体专利号、公开来源或查新结论，也不要输出查新占位提示。',
        '',
        '请按以下章节生成 Markdown：',
        ...disclosureSections,
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

function inspectDisclosureMarkdown(markdown, applicationType = 'invention') {
  const text = String(markdown || '');
  const warnings = [];
  const requiredHeadings = applicationType === 'design' ? ['一、', '二、', '三、'] : ['一、', '二、', '三、', '四、', '五、', '六、'];
  for (const heading of requiredHeadings) {
    if (!new RegExp(`^#{1,4}\\s+${heading}`, 'm').test(text)) warnings.push(`缺少第${heading.replace('、', '')}部分`);
  }
  const mermaidBlocks = text.match(/```mermaid[\s\S]+?```/gi) || [];
  if (applicationType === 'invention' && mermaidBlocks.length < 2) warnings.push('缺少系统框图或执行流程图（至少需要 2 幅 Mermaid 技术图）');
  if (applicationType === 'invention' && !mermaidBlocks.some((block) => /flowchart\s+(?:TD|TB|LR|RL|BT)/i.test(block))) warnings.push('缺少 Mermaid 系统框图');
  if (applicationType === 'invention' && !mermaidBlocks.some((block) => /sequenceDiagram/i.test(block))) warnings.push('缺少 Mermaid 执行时序图');
  if (applicationType !== 'design' && !/(实施例|具体实施方式)/.test(text)) warnings.push('缺少实施例或具体实施方式');
  if (applicationType !== 'design' && !/(欲保护点|保护点|技术关键点)/.test(text)) warnings.push('缺少技术关键点和欲保护点');
  if (/CN\d{6,}|ZL\d{6,}/i.test(text) && !/https?:\/\//i.test(text)) warnings.push('出现未附公开来源 URL 的专利号');
  if (/\b(?:TODO|TBD)\b/i.test(text)) warnings.push('正文包含未清理的内部占位标记');
  const chineseCharacterCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (applicationType !== 'design' && chineseCharacterCount < 12_000) warnings.push(`正文篇幅不足 12000 个中文字符（当前约 ${chineseCharacterCount} 个）`);
  if (applicationType !== 'design' && chineseCharacterCount > 15_000) warnings.push(`正文超过 15000 个中文字符（当前约 ${chineseCharacterCount} 个）`);
  return warnings;
}

const disclosureRequiredSections = {
  invention: [
    '一、相关技术背景',
    '二、针对上述缺点，说明本发明所要解决的技术问题',
    '三、本发明技术方案的详细阐述',
    '四、与现有技术相比，本发明具有哪些优点？',
    '五、本发明的技术关键点和欲保护点是什么？',
    '六、其它（实施例、技术效果、参数示例）',
  ],
  'utility-model': [
    '一、现有结构及其缺点', '二、所要解决的技术问题', '三、产品结构的详细说明',
    '四、结构带来的技术效果', '五、技术关键点和欲保护点', '六、具体实施例与装配方式',
  ],
};

function ensureRequiredDisclosureSections(markdown, applicationType) {
  const required = disclosureRequiredSections[applicationType] || [];
  let result = String(markdown || '').trim();
  for (const title of required) {
    const numeral = title.split('、')[0];
    if (!new RegExp(`^##\\s+${numeral}、`, 'm').test(result)) {
      result += `\n\n## ${title}\n\n本部分将结合主专利点、项目证据和已确认事实进一步展开。`;
    }
  }
  return result;
}

function stripDisclosureHeadingPrefix(value) {
  let result = String(value || '').trim();
  const prefixPattern = /^(?:[一二三四五六七八九十]+[、.)）]|\d+(?:\.\d+)*[、.)）]?|[（(](?:\d+|[a-z]|[一二三四五六七八九十]+)[）)]|[a-z][.)）])\s*/i;
  let previous = '';
  while (result && result !== previous) {
    previous = result;
    result = result.replace(prefixPattern, '').trim();
  }
  return result;
}

function normalizeDisclosureHeadingNumbering(markdown) {
  const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const counters = [0, 0, 0, 0, 0];
  let started = false;
  return String(markdown || '').replace(/^(#{2,6})\s+(.+)$/gm, (_match, hashes, rawTitle) => {
    const level = hashes.length - 2;
    const title = stripDisclosureHeadingPrefix(rawTitle);
    if (level === 0 && /注意事项/.test(title) && !started) return `${hashes} ${title}`;
    if (level === 0) started = true;
    if (!started) return `${hashes} ${title}`;
    counters[level] += 1;
    for (let index = level + 1; index < counters.length; index += 1) counters[index] = 0;
    const markers = [
      `${chineseNumbers[counters[0] - 1] || counters[0]}、`,
      `${counters[1]}、`,
      `（${counters[2]}）`,
      `${counters[3]}）`,
      `（${String.fromCharCode(96 + Math.min(counters[4], 26))}）`,
    ];
    return `${hashes} ${markers[level]}${title}`;
  });
}

function normalizeDisclosureOrderedSteps(markdown) {
  let sequence = 0;
  let inCodeFence = false;
  return String(markdown || '').split('\n').map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      sequence = 0;
      return line;
    }
    if (inCodeFence) return line;
    const match = /^(\s*)\d+[.)、]\s+(.+)$/.exec(line);
    if (match) {
      const marker = String.fromCharCode(97 + Math.min(sequence, 25));
      sequence += 1;
      return `${match[1]}（${marker}）${stripDisclosureHeadingPrefix(match[2])}`;
    }
    if (line.trim()) sequence = 0;
    return line;
  }).join('\n');
}

function canonicalizeDisclosureSectionHeadings(markdown, applicationType) {
  const required = disclosureRequiredSections[applicationType] || [];
  let result = String(markdown || '');
  required.forEach((title) => {
    const numeral = title.split('、')[0];
    result = result.replace(new RegExp(`^##\\s+${numeral}、[^\\n]*`, 'm'), `## ${title}`);
  });
  return result;
}

function countChineseCharacters(value) {
  return (String(value || '').match(/[\u3400-\u9fff]/g) || []).length;
}

function buildDisclosureSectionExpansionMessages(state, selectedPoint, heading, sectionContent, sectionIndex, sectionTotal) {
  const confirmedFacts = (selectedPoint.factSupplements || [])
    .filter((item) => item.source === 'manual' && sanitizeFactSupplementContent(item.content))
    .map((item) => `${item.fact}：${sanitizeFactSupplementContent(item.content)}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是中国专利技术交底书长文扩写助手。只扩写用户指定的一个二级章节，并输出该章节完整 Markdown。',
        '保留用户给出的二级标题作为第一行，不得输出其他二级章节、全文标题、前言、自检报告或对话说明。',
        '目标为 1900—2300 个中文字符，内容应具体、连贯且可供专利代理人使用，不得重复堆砌。',
        '只能基于项目证据、主专利点和已人工确认事实展开。不得虚构专利号、外部来源、测试数据、精确参数或尚未确认的实现。',
        '资料不足时说明参数的确定规则、可选实现或验证方法，并标注“待发明人确认”。',
        '技术章节应详细解释输入、处理、输出、数据结构、模块关系、执行主体、触发条件、异常路径、替代方案和技术效果。',
        '正文步骤不要使用 Markdown 自动数字列表；需要顺序表达时，逐项使用全角序号“（a）”“（b）”“（c）”依次编号。',
        sectionIndex === 3
          ? '本章必须同时包含至少两幅 Mermaid 图：一幅 flowchart 系统结构图，以及一幅 sequenceDiagram 执行时序图；图中节点和消息必须与正文模块、步骤一致。'
          : '可以使用三级、四级标题和参数表，但不要重复案件基本信息。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `章节进度：${sectionIndex}/${sectionTotal}`,
        `指定二级标题：${heading}`,
        `案件名称：${state.caseInfo?.caseName || selectedPoint.title}`,
        `技术主题：${state.caseInfo?.topic || '未填写'}`,
        `主专利点：${selectedPoint.title}`,
        `技术背景：${selectedPoint.technicalBackground || '未提供'}`,
        `核心创新：${selectedPoint.innovation || '未提供'}`,
        `区别点：${selectedPoint.difference || '未提供'}`,
        `可实施性：${selectedPoint.feasibility || '未提供'}`,
        `项目证据：${JSON.stringify(selectedPoint.evidence || [])}`,
        `已人工确认事实：${confirmedFacts || '无'}`,
        `已有查新分析：${String(state.priorArtMarkdown || '').trim() || '未进行查新增强，不得编造外部现有技术资料'}`,
        '',
        '当前章节初稿：',
        sectionContent,
        '',
        '请输出扩写后的本章节 Markdown。',
      ].join('\n'),
    },
  ];
}

function buildDisclosureSupplementMessages(state, selectedPoint, sectionHeading, currentSection, missingCharacters) {
  return [
    {
      role: 'system',
      content: [
        '你是中国专利技术交底书补充撰写助手。请为指定章节补充新的、可直接追加到该章节末尾的正文。',
        `本次补充目标为 ${Math.max(900, Math.min(1800, missingCharacters))}—${Math.max(1200, Math.min(2200, missingCharacters + 300))} 个中文字符。`,
        '只输出新增内容，不得重复章节标题、已有段落、案件信息或系统说明。不得虚构测试数据、外部资料和未确认参数。',
        '补充内容应优先增加替代实现、异常路径、边界条件、数据流转、模块协作、实施细节及其与保护点的对应关系。',
        '顺序步骤使用“（a）”“（b）”“（c）”编号。涉及执行流程且当前章节缺图时，使用可渲染的 Mermaid flowchart 或 sequenceDiagram。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `指定章节：${sectionHeading}`,
        `案件名称：${state.caseInfo?.caseName || selectedPoint.title}`,
        `技术主题：${state.caseInfo?.topic || '未填写'}`,
        `核心创新：${selectedPoint.innovation || '未提供'}`,
        `区别点：${selectedPoint.difference || '未提供'}`,
        `项目证据：${JSON.stringify(selectedPoint.evidence || [])}`,
        '',
        '本章已有内容：',
        currentSection.slice(0, 30_000),
        '',
        '请输出不重复的新增正文。',
      ].join('\n'),
    },
  ];
}

async function expandDisclosureSections(aiService, state, selectedPoint, markdown, onProgress) {
  const headingPattern = /^##\s+((?:一|二|三|四|五|六)、[^\n]*)$/gm;
  const matches = [...String(markdown || '').matchAll(headingPattern)];
  if (!matches.length || state.caseInfo?.applicationType === 'design') return markdown;
  const preamble = markdown.slice(0, matches[0].index).trimEnd();
  const expandedSections = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
    const originalSection = markdown.slice(start, end).trim();
    const headingLine = `## ${matches[index][1]}`;
    onProgress?.(`正在扩写第 ${index + 1}/${matches.length} 章：${matches[index][1]}`, 48 + Math.round(((index + 1) / matches.length) * 38));
    const response = sanitizeDisclosureMarkdown(await aiService.chat({
      messages: buildDisclosureSectionExpansionMessages(state, selectedPoint, headingLine, originalSection, index + 1, matches.length),
      temperature: 0.3,
      logTitle: `专利技术交底书章节扩写-${index + 1}`,
      timeout_ms: 240000,
      timeout_message: `第 ${index + 1} 章扩写超时，请稍后重新生成`,
      max_request_attempts: 2,
      progressCallback: (message) => onProgress?.(message, 48 + Math.round((index / matches.length) * 38)),
    }));
    const h2Count = (response.match(/^##\s+/gm) || []).length;
    let expandedSection = response && h2Count === 1
      ? response.startsWith(headingLine) ? response : `${headingLine}\n\n${response.replace(/^##\s+[^\n]+\n?/, '')}`
      : originalSection;
    const originalMermaidBlocks = originalSection.match(/```mermaid[\s\S]*?```/gi) || [];
    if (originalMermaidBlocks.length && !/```mermaid[\s\S]*?```/i.test(expandedSection)) {
      expandedSection = `${expandedSection.trim()}\n\n### 技术图示\n\n${originalMermaidBlocks.join('\n\n')}`;
    }
    expandedSections.push(expandedSection);
  }
  return [preamble, ...expandedSections].filter(Boolean).join('\n\n');
}

async function completeDisclosureLength(aiService, state, selectedPoint, markdown, onProgress) {
  let result = String(markdown || '');
  const targetCharacters = 12_500;
  const maximumSupplementRounds = 10;
  for (let round = 0; round < maximumSupplementRounds && countChineseCharacters(result) < 12_000; round += 1) {
    const matches = [...result.matchAll(/^##\s+([^\n]+)$/gm)].filter((match) => !/注意事项/.test(match[1]));
    if (!matches.length) break;
    const sections = matches.map((match, index) => ({
      heading: match[1],
      start: match.index,
      end: index + 1 < matches.length ? matches[index + 1].index : result.length,
    }));
    const section = sections.reduce((shortest, item) => {
      const size = countChineseCharacters(result.slice(item.start, item.end));
      return !shortest || size < shortest.size ? { ...item, size } : shortest;
    }, null);
    if (!section) break;
    const currentCount = countChineseCharacters(result);
    const missingCharacters = targetCharacters - currentCount;
    onProgress?.(`正文约 ${currentCount} 字，正在补充“${section.heading}”`, 87 + Math.min(4, Math.floor(round / 2)));
    const addition = sanitizeDisclosureMarkdown(await aiService.chat({
      messages: buildDisclosureSupplementMessages(
        state,
        selectedPoint,
        section.heading,
        result.slice(section.start, section.end),
        missingCharacters,
      ),
      temperature: 0.3,
      logTitle: `专利技术交底书篇幅补充-${round + 1}`,
      timeout_ms: 180000,
      timeout_message: `交底书第 ${round + 1} 轮补充超时`,
      max_request_attempts: 2,
      progressCallback: (message) => onProgress?.(message, 89),
    }));
    if (!addition || countChineseCharacters(addition) < 80) break;
    result = `${result.slice(0, section.end).trimEnd()}\n\n${addition.replace(/^##\s+[^\n]+\n?/, '').trim()}\n\n${result.slice(section.end).trimStart()}`.trim();
  }
  return result;
}

async function completeDisclosureDiagrams(aiService, state, selectedPoint, markdown, onProgress) {
  const mermaidBlocks = String(markdown || '').match(/```mermaid[\s\S]*?```/gi) || [];
  const hasFlowchart = mermaidBlocks.some((block) => /flowchart\s+(?:TD|TB|LR|RL|BT)/i.test(block));
  const hasSequenceDiagram = mermaidBlocks.some((block) => /sequenceDiagram/i.test(block));
  if (state.caseInfo?.applicationType !== 'invention' || (hasFlowchart && hasSequenceDiagram)) return markdown;
  onProgress?.('正在补充系统框图和执行时序图...', 91);
  const diagrams = sanitizeDisclosureMarkdown(await aiService.chat({
    messages: [
      {
        role: 'system',
        content: [
          '你是专利技术图示助手。基于已有技术方案输出两幅可直接插入交底书第三章的 Mermaid 技术图。',
          '第一幅必须为 flowchart TD 系统框图，第二幅必须为 sequenceDiagram 执行时序图。',
          '每幅图前添加简短的四级标题和一段图示说明。只输出新增 Markdown，不输出第三章标题、解释或代码之外的内容。',
          '节点、参与者、消息和先后关系必须来自给定技术方案，不得虚构外部组件。Mermaid 语法必须可渲染。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `案件名称：${state.caseInfo?.caseName || selectedPoint.title}`,
          `技术主题：${state.caseInfo?.topic || '未填写'}`,
          `核心创新：${selectedPoint.innovation || '未提供'}`,
          `区别点：${selectedPoint.difference || '未提供'}`,
          '',
          '现有交底书第三章节选：',
          String(markdown || '').match(/^##\s+三、[\s\S]*?(?=^##\s+四、|$)/m)?.[0]?.slice(0, 24_000) || '',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    logTitle: '专利技术交底书技术图补充',
    timeout_ms: 120000,
    timeout_message: '交底书技术图补充超时',
    max_request_attempts: 2,
    progressCallback: (message) => onProgress?.(message, 91),
  }));
  if (!diagrams || !/```mermaid[\s\S]*?```/i.test(diagrams)) return markdown;
  const fourthSectionIndex = String(markdown || '').search(/^##\s+四、/m);
  if (fourthSectionIndex < 0) return `${markdown.trim()}\n\n${diagrams.trim()}`;
  return `${markdown.slice(0, fourthSectionIndex).trimEnd()}\n\n${diagrams.trim()}\n\n${markdown.slice(fourthSectionIndex).trimStart()}`;
}

function buildDisclosureRepairMessages(state, selectedPoint, markdown, warnings) {
  return [
    {
      role: 'system',
      content: [
        '你是中国专利技术交底书质量修订助手。',
        '根据质量检查问题修订完整 Markdown。不得引入材料和证据中不存在的新事实；信息不足时明确写“待发明人确认”。',
        '只输出修订后的完整交底书，不输出检查报告或解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `申请类型：${state.caseInfo?.applicationType || 'invention'}`,
        `案件名称：${state.caseInfo?.caseName || selectedPoint.title}`,
        `主专利点：${selectedPoint.title}`,
        `质量问题：${warnings.join('；')}`,
        '',
        '原始草稿：',
        markdown.slice(0, 180_000),
      ].join('\n'),
    },
  ];
}

function normalizeApplicationType(value, legacyValue) {
  if (['invention', 'utility-model', 'design', 'unknown'].includes(value)) return value;
  return ['method', 'system', 'device'].includes(legacyValue) ? 'invention' : 'invention';
}

function normalizeClaimForms(value, legacyValue) {
  const allowed = ['method', 'system', 'device', 'storage-medium'];
  const values = Array.isArray(value) ? value.filter((item) => allowed.includes(item)) : [];
  if (values.length) return [...new Set(values)];
  if (allowed.includes(legacyValue)) return [legacyValue];
  return ['method', 'system'];
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
    applicationType: normalizeApplicationType(caseInfo.applicationType, caseInfo.patentType),
    claimForms: normalizeClaimForms(caseInfo.claimForms, caseInfo.patentType),
    contact: normalizeContact(caseInfo.contact),
  };
}

function createPatentGenerationService({ app, aiService }) {
  const rootDir = getPatentGenerationDir(app);
  const registryPath = path.join(rootDir, 'projects.json');
  const projectsDir = path.join(rootDir, 'projects');
  let statePath = '';
  let draftsDir = '';
  const subscribers = new Set();
  let activeMiningTask = null;
  let disclosureGenerationRunning = false;

  function projectPaths(projectId) {
    const safeId = String(projectId || '').trim();
    if (!/^[a-zA-Z0-9-]+$/.test(safeId)) throw new Error('专利项目标识无效');
    const projectDir = path.join(projectsDir, safeId);
    return { projectDir, statePath: path.join(projectDir, 'state.json'), draftsDir: path.join(projectDir, 'drafts') };
  }

  function loadRegistry() {
    ensureDir(rootDir);
    const saved = readJson(registryPath, null);
    if (saved && Array.isArray(saved.projects)) return saved;

    const legacyStatePath = path.join(rootDir, 'state.json');
    if (fs.existsSync(legacyStatePath)) {
      const id = crypto.randomUUID();
      const paths = projectPaths(id);
      ensureDir(paths.draftsDir);
      const legacy = readJson(legacyStatePath, {});
      const legacyDraftsDir = path.join(rootDir, 'drafts');
      const migratedDrafts = (legacy.disclosureDrafts || []).map((draft) => {
        const source = String(draft.file_path || '');
        if (!source || !fs.existsSync(source)) return draft;
        const destination = path.join(paths.draftsDir, path.basename(source));
        fs.copyFileSync(source, destination);
        return { ...draft, file_path: destination };
      });
      const migrated = { ...legacy, disclosureDrafts: migratedDrafts, outputDir: paths.projectDir, updated_at: now() };
      writeJson(paths.statePath, migrated);
      const registry = {
        activeProjectId: id,
        projects: [{ id, name: legacy.caseInfo?.caseName || legacy.caseInfo?.topic || '历史专利项目', archived: false, created_at: legacy.updated_at || now(), updated_at: now() }],
      };
      writeJson(registryPath, registry);
      return registry;
    }

    const registry = { activeProjectId: '', projects: [] };
    writeJson(registryPath, registry);
    return registry;
  }

  function saveRegistry(registry) {
    writeJson(registryPath, registry);
    return registry;
  }

  function activateProjectPaths(projectId) {
    const paths = projectPaths(projectId);
    statePath = paths.statePath;
    draftsDir = paths.draftsDir;
    return paths;
  }

  function requireActiveProject() {
    const registry = loadRegistry();
    const project = registry.projects.find((item) => item.id === registry.activeProjectId && !item.archived);
    if (!project) throw new Error('请先创建或进入一个专利项目');
    activateProjectPaths(project.id);
    return { registry, project };
  }

  function summarizeProject(project) {
    const paths = projectPaths(project.id);
    const state = readJson(paths.statePath, null);
    const selected = (state?.miningResult || []).find((item) => item.id === state?.selectedPatentPointId);
    return {
      ...project,
      caseName: state?.caseInfo?.caseName || '',
      topic: state?.caseInfo?.topic || '',
      applicationType: state?.caseInfo?.applicationType || 'invention',
      stage: state?.stage || 'setup',
      candidateCount: state?.miningResult?.length || 0,
      draftCount: state?.disclosureDrafts?.length || 0,
      selectedPatentTitle: selected?.title || '',
    };
  }

  function listProjects() {
    const registry = loadRegistry();
    return { activeProjectId: registry.activeProjectId, projects: registry.projects.map(summarizeProject) };
  }

  function createProject(payload = {}) {
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('请输入专利项目名称');
    const registry = loadRegistry();
    const id = crypto.randomUUID();
    const paths = activateProjectPaths(id);
    ensureDir(paths.draftsDir);
    const createdAt = now();
    const state = mergeState({
      ...initialState,
      caseId: crypto.randomUUID(),
      caseInfo: normalizeCaseInfo({
        ...initialCaseInfo,
        caseName: String(payload.caseName || name).trim(),
        topic: String(payload.topic || '').trim(),
        applicationType: payload.applicationType || 'invention',
      }),
      outputDir: paths.projectDir,
      updated_at: createdAt,
    });
    writeJson(paths.statePath, state);
    saveRegistry({ activeProjectId: id, projects: [{ id, name, archived: false, created_at: createdAt, updated_at: createdAt }, ...registry.projects] });
    emit(state);
    return { project: summarizeProject({ id, name, archived: false, created_at: createdAt, updated_at: createdAt }), state };
  }

  function switchProject(projectId) {
    if (activeMiningTask || disclosureGenerationRunning) throw new Error('当前生成任务尚未结束，请先停止或等待任务完成');
    const registry = loadRegistry();
    const project = registry.projects.find((item) => item.id === String(projectId || '') && !item.archived);
    if (!project) throw new Error('专利项目不存在或已归档');
    saveRegistry({ ...registry, activeProjectId: project.id });
    activateProjectPaths(project.id);
    const state = loadState();
    emit(state);
    return state;
  }

  function renameProject(payload = {}) {
    const id = String(payload.id || '').trim();
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('请输入新的专利项目名称');
    const registry = loadRegistry();
    if (!registry.projects.some((item) => item.id === id)) throw new Error('专利项目不存在');
    const updated = { ...registry, projects: registry.projects.map((item) => item.id === id ? { ...item, name, updated_at: now() } : item) };
    saveRegistry(updated);
    return listProjects();
  }

  function archiveProject(payload = {}) {
    const id = String(payload.id || '').trim();
    const archived = payload.archived !== false;
    const registry = loadRegistry();
    if (!registry.projects.some((item) => item.id === id)) throw new Error('专利项目不存在');
    const activeProjectId = archived && registry.activeProjectId === id ? '' : registry.activeProjectId;
    saveRegistry({ activeProjectId, projects: registry.projects.map((item) => item.id === id ? { ...item, archived, updated_at: now() } : item) });
    return listProjects();
  }

  function deleteProject(projectId) {
    const id = String(projectId || '').trim();
    const registry = loadRegistry();
    if (!registry.projects.some((item) => item.id === id)) throw new Error('专利项目不存在');
    const paths = projectPaths(id);
    if (fs.existsSync(paths.projectDir)) fs.rmSync(paths.projectDir, { recursive: true, force: true });
    saveRegistry({ activeProjectId: registry.activeProjectId === id ? '' : registry.activeProjectId, projects: registry.projects.filter((item) => item.id !== id) });
    return listProjects();
  }

  function mergeState(saved) {
    const caseId = saved?.caseId || crypto.randomUUID();
    return {
      ...initialState,
      ...(saved || {}),
      caseId,
      caseInfo: normalizeCaseInfo(saved?.caseInfo),
      project: saved?.project || null,
      materials: Array.isArray(saved?.materials) ? saved.materials : [],
      scanSummary: String(saved?.scanSummary || ''),
      miningResult: Array.isArray(saved?.miningResult) ? saved.miningResult.map((point, index) => normalizePatentPoint(point, index)) : [],
      disclosureDrafts: Array.isArray(saved?.disclosureDrafts) ? saved.disclosureDrafts : [],
      revisionLogs: Array.isArray(saved?.revisionLogs) ? saved.revisionLogs : [],
      outputDir: saved?.outputDir || path.dirname(statePath),
      updated_at: saved?.updated_at || now(),
    };
  }

  function loadState() {
    requireActiveProject();
    const saved = readJson(statePath, null);
    let state = mergeState(saved);
    const miningResultMigrated = Boolean(saved)
      && JSON.stringify(saved.miningResult || []) !== JSON.stringify(state.miningResult || []);
    const orphanedMiningTask = state.task?.type === 'patent-mining'
      && ['running', 'pausing', 'stopping'].includes(state.task.status)
      && !activeMiningTask;
    const orphanedDisclosureTask = state.task?.type === 'patent-disclosure'
      && state.task.status === 'running'
      && !disclosureGenerationRunning;
    if (orphanedMiningTask) {
      state = {
        ...state,
        task: {
          ...state.task,
          status: 'stopped',
          message: '上次专利挖掘未完成，请重新开始',
          logs: [...(state.task.logs || []), '客户端重启后已结束未完成的专利挖掘任务'],
          updated_at: now(),
        },
        updated_at: now(),
      };
    }
    if (orphanedDisclosureTask) {
      state = {
        ...state,
        task: {
          ...state.task,
          status: 'error',
          message: '上次交底书生成已中断，请重新生成',
          error: '客户端退出或重启导致生成中断',
          logs: [...(state.task.logs || []), '检测到上次未完成的交底书生成任务，已结束遗留状态'],
          updated_at: now(),
        },
        updated_at: now(),
      };
    }
    if (orphanedMiningTask || orphanedDisclosureTask || miningResultMigrated || !saved || !saved.caseId || !saved.updated_at || !saved.outputDir) {
      writeJson(statePath, state);
    }
    return state;
  }

  function saveState(partial) {
    const { registry, project } = requireActiveProject();
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
    saveRegistry({ ...registry, projects: registry.projects.map((item) => item.id === project.id ? { ...item, updated_at: next.updated_at } : item) });
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

  async function generateTechnicalTopic() {
    const current = loadState();
    const selected = getSelectedPatentPoint(current);
    const candidate = selected || current.miningResult?.[0];
    if (!candidate && !current.project && !current.caseInfo.caseName) {
      throw new Error('请先填写专利名称或选择项目目录，再生成技术主题');
    }
    const response = await aiService.collectJsonResponse({
      messages: [{
        role: 'user',
        content: [
          '请为以下专利项目提炼一个简洁、准确的中文技术主题。',
          '要求：8至24个中文字符；描述技术领域或核心技术对象；不要使用“一种”“方法”“系统”等专利标题套话；只通过 JSON 返回 topic 字段。',
          `专利名称：${current.caseInfo.caseName || '未填写'}`,
          `项目名称：${current.project?.name || '未选择'}`,
          `候选专利点：${candidate?.title || '暂无'}`,
          `核心创新：${candidate?.innovation || '暂无'}`,
          `扫描摘要：${current.scanSummary || '暂无'}`,
        ].join('\n'),
      }],
      schemaName: 'PatentTechnicalTopic',
      temperature: 0.2,
      logTitle: '专利技术主题生成',
      progressLabel: '技术主题',
      failureMessage: 'AI 生成技术主题失败',
      timeout_ms: 90000,
    });
    const topic = String(response?.topic || response?.technicalTopic || '').trim()
      .replace(/[。；;，,]+$/g, '')
      .slice(0, 48);
    if (!topic) throw new Error('模型未返回有效技术主题，请重新生成');
    return saveState({ caseInfo: { ...current.caseInfo, topic } });
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

  async function generateFactSupplements(pointId) {
    const current = loadState();
    const point = (current.miningResult || []).find((item) => item.id === String(pointId || '').trim());
    if (!point) throw new Error('候选专利点不存在，请重新挖掘后再补充');
    if (!point.missingFacts?.length) throw new Error('该候选专利点没有待补事实');
    const response = await aiService.collectJsonResponse({
      messages: buildFactSupplementMessages(current, point),
      schemaName: 'PatentFactSupplements',
      temperature: 0.2,
      logTitle: '专利待补事实建议',
      progressLabel: '待补事实建议',
      failureMessage: 'AI 生成待补事实建议失败',
      timeout_ms: 120000,
    });
    const rawSuggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
    const suggestions = point.missingFacts.map((fact, index) => {
      const matched = rawSuggestions.find((item) => String(item?.fact || '').trim() === fact) || rawSuggestions[index] || {};
      return {
        fact,
        content: sanitizeFactSupplementContent(matched?.content),
        basis: String(matched?.basis || '建议由发明人结合设计文档或代码实现确认').trim(),
        confidence: ['high', 'medium', 'low'].includes(matched?.confidence) ? matched.confidence : 'low',
        source: 'ai',
      };
    });
    const retainedConfirmed = (point.factSupplements || [])
      .filter((item) => item.source === 'manual' && item.content && !point.missingFacts.includes(item.fact));
    return saveState({
      miningResult: current.miningResult.map((item) => item.id === point.id
        ? normalizePatentPoint({ ...item, factSupplements: [...retainedConfirmed, ...suggestions] }, 0)
        : item),
    });
  }

  function saveFactSupplements(payload = {}) {
    const current = loadState();
    const pointId = String(payload.pointId || '').trim();
    const point = (current.miningResult || []).find((item) => item.id === pointId);
    if (!point) throw new Error('候选专利点不存在，请重新挖掘后再保存');
    const submitted = Array.isArray(payload.supplements) ? payload.supplements : [];
    const knownFacts = new Map([
      ...point.missingFacts.map((fact) => [normalizeFactKey(fact), fact]),
      ...(point.factSupplements || []).map((item) => [normalizeFactKey(item.fact), item.fact]),
    ]);
    const submittedSupplements = submitted.flatMap((item) => {
      const fact = knownFacts.get(normalizeFactKey(item?.fact));
      if (!fact) return [];
      const existing = (point.factSupplements || []).find((entry) => normalizeFactKey(entry.fact) === normalizeFactKey(fact));
      return {
        fact,
        content: sanitizeFactSupplementContent(item?.content),
        basis: String(item?.basis || existing?.basis || '').trim(),
        confidence: ['high', 'medium', 'low'].includes(item?.confidence) ? item.confidence : existing?.confidence || 'low',
        source: 'manual',
      };
    });
    if (!submittedSupplements.length) throw new Error('没有可保存的补充事实');
    if (submittedSupplements.some((item) => !item.content)) throw new Error('补充内容不能为空，请填写后再保存');
    const submittedFacts = new Set(submittedSupplements.map((item) => normalizeFactKey(item.fact)));
    const retainedConfirmed = (point.factSupplements || [])
      .filter((item) => item.source === 'manual' && item.content && !submittedFacts.has(normalizeFactKey(item.fact)));
    const factSupplements = [...retainedConfirmed, ...submittedSupplements];
    const confirmedFacts = new Set(
      factSupplements.filter((item) => item.content).map((item) => normalizeFactKey(item.fact)),
    );
    const unresolvedMissingFacts = point.missingFacts.filter((fact) => !confirmedFacts.has(normalizeFactKey(fact)));
    return saveState({
      miningResult: current.miningResult.map((item) => item.id === point.id
        ? normalizePatentPoint({ ...item, missingFacts: unresolvedMissingFacts, factSupplements }, 0)
        : item),
    });
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
    const storedContent = fs.readFileSync(filePath, 'utf-8');
    const content = normalizeDisclosureOrderedSteps(
      normalizeDisclosureHeadingNumbering(
        canonicalizeDisclosureSectionHeadings(
          sanitizeDisclosureMarkdown(storedContent),
          state.caseInfo.applicationType,
        ),
      ),
    );
    if (content !== storedContent.trim()) fs.writeFileSync(filePath, content, 'utf-8');
    return {
      ...draft,
      content,
    };
  }

  function saveDisclosureDraft(payload = {}) {
    const state = loadState();
    const draftId = String(payload.id || state.activeDraftId || '').trim();
    const content = String(payload.content || '');
    const { draft, filePath } = getDraftPath(state, draftId);
    const normalizedContent = normalizeDisclosureOrderedSteps(
      normalizeDisclosureHeadingNumbering(
        canonicalizeDisclosureSectionHeadings(
          sanitizeDisclosureMarkdown(content),
          state.caseInfo.applicationType,
        ),
      ),
    );
    fs.writeFileSync(filePath, normalizedContent, 'utf-8');
    const nextDraft = {
      ...draft,
      updated_at: now(),
      qualityWarnings: inspectDisclosureMarkdown(normalizedContent, state.caseInfo.applicationType),
    };
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
    disclosureGenerationRunning = true;

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
      error: '',
    }, { stage: 'disclosure' });

    try {
      pushDisclosureProgress('正在整理主专利点和案件信息...', 24);
      pushDisclosureProgress('正在构建交底书章节结构...', 36);

      let simulatedProgress = 36;
      disclosureProgressTimer = setInterval(() => {
        simulatedProgress = Math.min(40, simulatedProgress + 2);
        pushDisclosureProgress('模型正在撰写技术背景、方案、实施例和保护点...', simulatedProgress);
        if (simulatedProgress >= 40) {
          stopDisclosureProgressTimer();
        }
      }, 2200);

      const content = await aiService.chat({
        messages: buildDisclosureMessages(state, selectedPoint),
        temperature: 0.35,
        logTitle: '专利技术交底书草稿生成',
        timeout_ms: 120000,
        timeout_message: '交底书草稿生成超时，请稍后重试',
        max_request_attempts: 2,
        progressCallback: (message) => pushDisclosureProgress(message, 40),
      });
      stopDisclosureProgressTimer();
      pushDisclosureProgress('正在校验交底书章节结构...', 42);
      let markdown = sanitizeDisclosureMarkdown(content);
      if (!markdown) {
        throw new Error('模型未返回有效交底书草稿');
      }

      let qualityWarnings = inspectDisclosureMarkdown(markdown, state.caseInfo.applicationType);
      const structuralWarnings = qualityWarnings.filter((warning) => !warning.startsWith('正文篇幅'));
      if (structuralWarnings.length) {
        pushDisclosureProgress(`发现 ${structuralWarnings.length} 项结构问题，正在自动修订...`, 44);
        const repaired = String(await aiService.chat({
          messages: buildDisclosureRepairMessages(state, selectedPoint, markdown, structuralWarnings),
          temperature: 0.18,
          logTitle: '专利技术交底书质量修订',
          timeout_ms: 180000,
          timeout_message: '交底书质量修订超时，已保留初稿',
        }) || '').trim();
        const repairedWarnings = inspectDisclosureMarkdown(repaired, state.caseInfo.applicationType)
          .filter((warning) => !warning.startsWith('正文篇幅'));
        if (repaired && repairedWarnings.length < structuralWarnings.length) {
          markdown = sanitizeDisclosureMarkdown(repaired);
        }
      }

      stopDisclosureProgressTimer();
      markdown = ensureRequiredDisclosureSections(markdown, state.caseInfo.applicationType);
      markdown = canonicalizeDisclosureSectionHeadings(markdown, state.caseInfo.applicationType);
      markdown = await expandDisclosureSections(aiService, state, selectedPoint, markdown, pushDisclosureProgress);
      markdown = await completeDisclosureLength(aiService, state, selectedPoint, markdown, pushDisclosureProgress);
      markdown = await completeDisclosureDiagrams(aiService, state, selectedPoint, markdown, pushDisclosureProgress);
      markdown = canonicalizeDisclosureSectionHeadings(markdown, state.caseInfo.applicationType);
      markdown = normalizeDisclosureHeadingNumbering(markdown);
      markdown = normalizeDisclosureOrderedSteps(markdown);
      pushDisclosureProgress('正在校验长篇交底书并保存草稿...', 92);
      qualityWarnings = inspectDisclosureMarkdown(markdown, state.caseInfo.applicationType);

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
        qualityWarnings,
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
    } finally {
      disclosureGenerationRunning = false;
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

  async function startMining(options = {}) {
    const current = loadState();
    if (!current.project?.path) {
      throw new Error('请先选择用于专利挖掘的项目目录');
    }
    if (activeMiningTask) {
      throw new Error('专利挖掘任务正在运行');
    }
    const controller = new AbortController();
    const taskControl = { controller, pauseRequested: false, stopRequested: false };
    activeMiningTask = taskControl;
    const logs = [options.resume ? '继续专利挖掘，重新发起本轮模型分析' : '开始扫描项目资料'];
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
        pushMiningProgress(
          simulatedProgress >= 88
            ? '模型仍在整理完整结果，可暂停或停止任务。'
            : '模型正在识别技术问题、创新组合和可保护点...',
          simulatedProgress,
        );
        if (simulatedProgress >= 88) {
          stopAiProgressTimer();
        }
      }, 2200);

      let response = await aiService.collectJsonResponse({
        messages: buildMiningMessages(current, scan),
        schemaName: 'PatentMiningResult',
        temperature: 0.25,
        logTitle: '专利挖掘候选点生成',
        progressLabel: '专利挖掘结果',
        progressCallback: (message) => pushMiningProgress(message || '正在校验专利挖掘结果格式...', 90),
        failureMessage: '专利点挖掘失败，请检查文本模型配置后重试',
        timeout_ms: 180000,
        signal: controller.signal,
        abort_message: '专利挖掘请求已中断',
      });
      stopAiProgressTimer();
      pushMiningProgress('正在校验并排序候选专利点...', 92);
      let rawPoints = extractPatentPoints(response);
      let points = rawPoints
        .map((point, index) => normalizePatentPoint(point, index, scan))
        .filter((point) => point.title && point.innovation)
        .sort((a, b) => (a.qualityWarnings?.length || 0) - (b.qualityWarnings?.length || 0) || (Number(b.score || 0) - Number(a.score || 0)))
        .slice(0, 5);
      if (!points.length) {
        pushMiningProgress('首轮结果字段不完整，正在自动纠正格式...', 94);
        response = await aiService.collectJsonResponse({
          messages: buildMiningRepairMessages(current, scan, response),
          schemaName: 'PatentMiningResultRepair',
          temperature: 0.1,
          logTitle: '专利挖掘候选点结构纠正',
          progressLabel: '候选点结构纠正结果',
          failureMessage: '候选专利点结构纠正失败',
          timeout_ms: 120000,
          signal: controller.signal,
          abort_message: '专利挖掘请求已中断',
        });
        rawPoints = extractPatentPoints(response);
        points = rawPoints
          .map((point, index) => normalizePatentPoint(point, index, scan))
          .filter((point) => point.title && point.innovation)
          .sort((a, b) => (a.qualityWarnings?.length || 0) - (b.qualityWarnings?.length || 0) || (Number(b.score || 0) - Number(a.score || 0)))
          .slice(0, 5);
      }
      if (!points.length) {
        throw new Error('模型两次返回的候选点字段均不完整，请检查模型能力或切换文本模型后重试');
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
      if (taskControl.stopRequested) {
        return updateTask({
          status: 'stopped',
          message: '专利挖掘已停止',
          error: undefined,
          logs: [...(loadState().task?.logs || []), '专利挖掘已停止'],
        });
      }
      if (taskControl.pauseRequested) {
        return updateTask({
          status: 'paused',
          message: '专利挖掘已暂停',
          error: undefined,
          logs: [...(loadState().task?.logs || []), '专利挖掘已暂停，继续时将重新发起本轮模型分析'],
        });
      }
      updateTask({
        status: 'error',
        progress: 100,
        message: '专利点挖掘失败',
        error: error.message || String(error),
        logs: [...(loadState().task?.logs || []), error.message || String(error)],
      });
      throw error;
    } finally {
      if (activeMiningTask === taskControl) activeMiningTask = null;
    }
  }

  function pauseMining() {
    const state = loadState();
    if (activeMiningTask) {
      activeMiningTask.pauseRequested = true;
      updateTask({ status: 'pausing', message: '正在暂停，等待当前模型请求中断...' });
      activeMiningTask.controller.abort();
      return loadState();
    }
    if (state.task?.type === 'patent-mining' && state.task.status === 'running') {
      return updateTask({ status: 'paused', message: '专利挖掘已暂停，继续时将重新发起本轮模型分析' });
    }
    return state;
  }

  function stopMining() {
    const state = loadState();
    if (activeMiningTask) {
      activeMiningTask.stopRequested = true;
      updateTask({ status: 'stopping', message: '正在停止专利挖掘...' });
      activeMiningTask.controller.abort();
      return loadState();
    }
    if (state.task?.type === 'patent-mining' && ['running', 'pausing', 'paused'].includes(state.task.status)) {
      return updateTask({ status: 'stopped', message: '专利挖掘已停止' });
    }
    return state;
  }

  function clear() {
    const { project } = requireActiveProject();
    const paths = activateProjectPaths(project.id);
    const next = mergeState({
      ...initialState,
      caseId: crypto.randomUUID(),
      outputDir: paths.projectDir,
      updated_at: now(),
    });
    writeJson(statePath, next);
    emit(next);
    return { success: true, state: next };
  }

  return {
    listProjects,
    createProject,
    switchProject,
    renameProject,
    archiveProject,
    deleteProject,
    loadState,
    saveCaseInfo,
    generateTechnicalTopic,
    selectPatentPoint,
    generateFactSupplements,
    saveFactSupplements,
    selectProject,
    startMining,
    pauseMining,
    stopMining,
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
