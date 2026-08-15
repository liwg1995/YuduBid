const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const AdmZip = require('adm-zip');
const { parseDocumentWithConfig, resolveFileParser } = require('./fileService.cjs');
const { getGrantApplicationDir } = require('../utils/paths.cjs');

const validPanels = new Set(['diagnosis', 'topic-policy', 'proposal', 'review-defense']);
const defaultProjectId = 'default';

const initialProfile = {
  level: '市级',
  discipline: '教育学',
  direction: '',
  stage: '准备申报',
  deadline: '',
  sourceNotes: '',
};

const proposalModuleDefinitions = [
  { key: 'project_name', label: '课题名称', instruction: '生成 3-5 个候选课题名称，并推荐 1 个最稳妥题目。' },
  { key: 'background', label: '研究背景', instruction: '撰写研究背景，突出政策背景、现实问题、研究价值和申报必要性。' },
  { key: 'goals', label: '研究目标', instruction: '撰写总体目标和 3-5 条具体目标，目标要可评价、可落地。' },
  { key: 'content', label: '研究内容', instruction: '撰写 3-5 项研究内容，明确每项内容解决什么问题、产出什么结果。' },
  { key: 'methods', label: '研究方法', instruction: '撰写研究方法与技术路线，说明调查、访谈、案例、行动研究、数据分析等方法如何使用。' },
  { key: 'innovation', label: '创新点', instruction: '撰写创新点，区分理念创新、路径创新、工具方法创新和实践应用创新。' },
  { key: 'plan', label: '实施计划', instruction: '撰写分阶段实施计划，包含时间、任务、负责人、阶段成果和风险控制。' },
  { key: 'outcomes', label: '预期成果', instruction: '撰写预期成果，区分论文、报告、案例、课例、资源包、制度方案等成果形式。' },
  { key: 'foundation', label: '研究基础', instruction: '撰写前期研究基础和团队条件；缺少事实时用“需补充”占位，不得编造。' },
  { key: 'guarantee', label: '保障条件', instruction: '撰写组织、制度、经费、数据、场景、专家支持和质量保障条件。' },
];

const initialProposalModules = proposalModuleDefinitions.reduce((modules, module) => ({
  ...modules,
  [module.key]: '',
}), {});

const initialProposalVisualSettings = {
  useAiImage: false,
  useTechnicalDiagram: true,
  useMermaid: true,
};

const initialProposalModuleQuality = {
  status: 'unchecked',
  score: 0,
  summary: '',
  report: '',
  checked_at: '',
};

const initialProposalModuleQualityChecks = proposalModuleDefinitions.reduce((checks, module) => ({
  ...checks,
  [module.key]: initialProposalModuleQuality,
}), {});

const initialProposalFinalReview = {
  status: 'unchecked',
  score: 0,
  summary: '',
  report: '',
  checked_at: '',
};

const initialProposalTemplateMapping = {
  fileName: '',
  sourceFilePath: '',
  imported_at: '',
  sections: [],
  summary: { total: 0, matched: 0, missing: 0, unmatched: 0, verify: 0, too_long: 0 },
  rawMarkdown: '',
};

const initialProposalTemplateFillReport = {
  filePath: '',
  generated_at: '',
  total: 0,
  filled: 0,
  skipped: 0,
  items: [],
};

const initialState = {
  profile: initialProfile,
  activePanel: 'diagnosis',
  inputs: {
    diagnosis: { taskText: '', materialText: '' },
    'topic-policy': { taskText: '', materialText: '' },
    proposal: { taskText: '', materialText: '' },
    'review-defense': { taskText: '', materialText: '' },
  },
  outputs: {
    diagnosis: '',
    'topic-policy': '',
    proposal: '',
    'review-defense': '',
  },
  proposalModules: initialProposalModules,
  proposalVisualSettings: initialProposalVisualSettings,
  proposalModuleQualityChecks: initialProposalModuleQualityChecks,
  proposalFinalReview: initialProposalFinalReview,
  reviewDefenseReport: '',
  proposalTemplateMapping: initialProposalTemplateMapping,
  proposalTemplateFillReport: initialProposalTemplateFillReport,
  task: undefined,
  updated_at: '',
};

const panelLabels = {
  diagnosis: '启动诊断',
  'topic-policy': '选题与政策',
  proposal: '申报书撰写',
  'review-defense': '评审优化与答辩',
};

const formFieldDefinitions = [
  { key: 'project_name', label: '课题名称', aliases: ['课题名称', '题目', '推荐题目'] },
  { key: 'background', label: '研究背景', aliases: ['研究背景', '立项背景', '问题提出', '选题背景'] },
  { key: 'goals', label: '研究目标', aliases: ['研究目标', '目标'] },
  { key: 'content', label: '研究内容', aliases: ['研究内容', '主要内容'] },
  { key: 'methods', label: '研究方法', aliases: ['研究方法', '方法路径', '研究思路'] },
  { key: 'innovation', label: '创新点', aliases: ['创新点', '创新之处', '特色创新'] },
  { key: 'plan', label: '实施计划', aliases: ['实施计划', '研究计划', '进度安排'] },
  { key: 'outcomes', label: '预期成果', aliases: ['预期成果', '成果形式'] },
  { key: 'foundation', label: '研究基础', aliases: ['研究基础', '前期基础', '工作基础'] },
  { key: 'guarantee', label: '保障条件', aliases: ['保障条件', '条件保障', '组织保障'] },
];

function now() {
  return new Date().toISOString();
}

function createProjectId() {
  return `grant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeString(value, maxLength = 120000) {
  return String(value || '').trim().slice(0, maxLength);
}

function compactPromptText(value, maxLength = 6000) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  const headLength = Math.max(800, Math.floor(maxLength * 0.45));
  const tailLength = Math.max(800, maxLength - headLength - 80);
  return [
    text.slice(0, headLength),
    `\n\n……中间 ${text.length - headLength - tailLength} 字已省略，保留开头和结尾供模型判断……\n\n`,
    text.slice(-tailLength),
  ].join('');
}

function isModelOverloadedError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('system memory overloaded')
    || message.includes('memory overloaded')
    || message.includes('overloaded');
}

function normalizeProjectId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || defaultProjectId;
}

function normalizePanel(value) {
  return validPanels.has(value) ? value : 'diagnosis';
}

function normalizeProfile(profile = {}) {
  return {
    level: normalizeString(profile.level, 80) || initialProfile.level,
    discipline: normalizeString(profile.discipline, 80) || initialProfile.discipline,
    direction: normalizeString(profile.direction, 500),
    stage: normalizeString(profile.stage, 80) || initialProfile.stage,
    deadline: normalizeString(profile.deadline, 80),
    sourceNotes: normalizeString(profile.sourceNotes, 10000),
  };
}

function normalizePanelInput(input = {}) {
  return {
    taskText: normalizeString(input.taskText, 30000),
    materialText: normalizeString(input.materialText, 90000),
  };
}

function normalizeInputs(inputs = {}) {
  return {
    diagnosis: normalizePanelInput(inputs.diagnosis),
    'topic-policy': normalizePanelInput(inputs['topic-policy']),
    proposal: normalizePanelInput(inputs.proposal),
    'review-defense': normalizePanelInput(inputs['review-defense']),
  };
}

function normalizeOutputs(outputs = {}) {
  return {
    diagnosis: String(outputs.diagnosis || ''),
    'topic-policy': String(outputs['topic-policy'] || ''),
    proposal: String(outputs.proposal || ''),
    'review-defense': String(outputs['review-defense'] || ''),
  };
}

function normalizeProposalModules(modules = {}) {
  return proposalModuleDefinitions.reduce((nextModules, module) => ({
    ...nextModules,
    [module.key]: String(modules[module.key] || ''),
  }), {});
}

function normalizeProposalVisualSettings(settings = {}) {
  return {
    useAiImage: Boolean(settings.useAiImage),
    useTechnicalDiagram: settings.useTechnicalDiagram !== false,
    useMermaid: settings.useMermaid !== false,
  };
}

function normalizeProposalModuleQualityChecks(checks = {}) {
  return proposalModuleDefinitions.reduce((nextChecks, module) => {
    const value = checks[module.key] || {};
    const status = ['unchecked', 'pass', 'warning', 'risk'].includes(value.status) ? value.status : 'unchecked';
    return {
      ...nextChecks,
      [module.key]: {
        status,
        score: Math.max(0, Math.min(100, Number(value.score || 0))),
        summary: normalizeString(value.summary, 1000),
        report: String(value.report || ''),
        checked_at: normalizeString(value.checked_at, 80),
      },
    };
  }, {});
}

function normalizeProposalFinalReview(review = {}) {
  const status = ['unchecked', 'pass', 'warning', 'risk'].includes(review.status) ? review.status : 'unchecked';
  return {
    status,
    score: Math.max(0, Math.min(100, Number(review.score || 0))),
    summary: normalizeString(review.summary, 1000),
    report: String(review.report || ''),
    checked_at: normalizeString(review.checked_at, 80),
  };
}

function normalizeProposalTemplateMapping(mapping = {}) {
  const sections = Array.isArray(mapping.sections) ? mapping.sections.map((section, index) => {
    const status = ['matched', 'missing', 'unmatched', 'verify', 'too_long'].includes(section.status) ? section.status : 'unmatched';
    return {
      id: normalizeString(section.id, 80) || `section-${index + 1}`,
      title: normalizeString(section.title, 300) || `栏目 ${index + 1}`,
      instruction: normalizeString(section.instruction, 3000),
      matchedFieldKey: normalizeString(section.matchedFieldKey || section.matched_field_key, 80),
      matchedFieldLabel: normalizeString(section.matchedFieldLabel || section.matched_field_label, 120),
      status,
      content: String(section.content || ''),
      note: normalizeString(section.note, 1000),
      length: Math.max(0, Number(section.length || stripMarkdown(section.content).length || 0)),
    };
  }) : [];
  const summary = {
    total: sections.length,
    matched: sections.filter((section) => section.status === 'matched').length,
    missing: sections.filter((section) => section.status === 'missing').length,
    unmatched: sections.filter((section) => section.status === 'unmatched').length,
    verify: sections.filter((section) => section.status === 'verify').length,
    too_long: sections.filter((section) => section.status === 'too_long').length,
  };
  return {
    fileName: normalizeString(mapping.fileName || mapping.file_name, 300),
    sourceFilePath: normalizeString(mapping.sourceFilePath || mapping.source_file_path, 1000),
    imported_at: normalizeString(mapping.imported_at, 80),
    sections,
    summary,
    rawMarkdown: String(mapping.rawMarkdown || mapping.raw_markdown || ''),
  };
}

function normalizeProposalTemplateFillReport(report = {}) {
  const items = Array.isArray(report.items) ? report.items.map((item) => ({
    title: normalizeString(item.title, 300),
    status: item.status === 'filled' ? 'filled' : 'skipped',
    message: normalizeString(item.message, 1000),
  })) : [];
  return {
    filePath: normalizeString(report.filePath || report.file_path, 1000),
    generated_at: normalizeString(report.generated_at, 80),
    total: Math.max(0, Number(report.total || items.length || 0)),
    filled: Math.max(0, Number(report.filled || items.filter((item) => item.status === 'filled').length || 0)),
    skipped: Math.max(0, Number(report.skipped || items.filter((item) => item.status !== 'filled').length || 0)),
    items,
  };
}

function isReviewQualityReportText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const hitCount = [
    /八维检测/,
    /文本质量参考分/,
    /总体评分参考/,
    /总体判断/,
    /修改优先级/,
    /不代表.*(立项|评审)/,
  ].filter((pattern) => pattern.test(text)).length;
  return hitCount >= 2 && !/答辩问题与参考回答|实施管理建议/.test(text.slice(0, 800));
}

function migrateMisroutedWorkDraft(state) {
  const nextState = {
    ...state,
    outputs: normalizeOutputs(state.outputs),
    reviewDefenseReport: String(state.reviewDefenseReport || ''),
  };
  const taskType = normalizePanel(state.task?.type || state.activePanel);
  const misroutedText = nextState.reviewDefenseReport.trim();
  if (!misroutedText || isReviewQualityReportText(misroutedText)) return nextState;
  if (nextState.task?.status !== 'success') return nextState;
  if (!nextState.task?.id || String(nextState.task.id).includes('quality')) return nextState;
  if (nextState.outputs[taskType]?.trim()) return nextState;
  return {
    ...nextState,
    outputs: {
      ...nextState.outputs,
      [taskType]: misroutedText,
    },
    reviewDefenseReport: '',
  };
}

function cloneState(state = {}) {
  const normalized = {
    ...initialState,
    ...state,
    profile: normalizeProfile(state.profile),
    activePanel: normalizePanel(state.activePanel),
    inputs: normalizeInputs(state.inputs),
    outputs: normalizeOutputs(state.outputs),
    proposalModules: normalizeProposalModules(state.proposalModules),
    proposalVisualSettings: normalizeProposalVisualSettings(state.proposalVisualSettings),
    proposalModuleQualityChecks: normalizeProposalModuleQualityChecks(state.proposalModuleQualityChecks),
    proposalFinalReview: normalizeProposalFinalReview(state.proposalFinalReview),
    reviewDefenseReport: String(state.reviewDefenseReport || ''),
    proposalTemplateMapping: normalizeProposalTemplateMapping(state.proposalTemplateMapping),
    proposalTemplateFillReport: normalizeProposalTemplateFillReport(state.proposalTemplateFillReport),
    task: state.task,
    updated_at: normalizeString(state.updated_at, 80),
  };
  return migrateMisroutedWorkDraft(normalized);
}

function recoverInterruptedTask(state) {
  if (state?.task?.status !== 'running') return state;
  return {
    ...state,
    task: {
      ...state.task,
      status: 'error',
      progress: 100,
      message: '上次任务未完成，请重新执行。',
      finished_at: now(),
    },
  };
}

function ensureTextModelReady(configStore, actionName) {
  if (!configStore) return;
  const config = configStore.load();
  const missing = [];
  if (!String(config?.api_key || '').trim()) missing.push('API Key');
  if (!String(config?.base_url || '').trim()) missing.push('Base URL');
  if (!String(config?.model_name || '').trim()) missing.push('模型名称');
  if (missing.length) {
    throw new Error(`无法${actionName}：请先到“设置 - 文本模型”完善${missing.join('、')}。`);
  }
}

function createPrompt(panel, profile, input) {
  const label = panelLabels[panel] || '课题申报';
  const commonRules = [
    '你是课题申报专家，服务对象是中文科研课题申报者。',
    '输出中文 Markdown，内容要具体、审慎、可执行。',
    '不得编造政策文号、文献题名、作者、数据、获奖、论文、单位成果或真实评审结论。',
    '如果材料不足，用“需补充”标明缺口，而不是虚构事实。',
    '按照校级、县级、市级、省级、国家级差异调整深度和评审语气。',
  ];

  const panelInstructions = {
    diagnosis: [
      '请完成启动诊断：判断课题级别、学科策略、当前阶段、材料完整度和最短推进路径。',
      '输出栏目：总体判断、关键信息、材料缺口、推荐流程、本周任务。',
    ],
    'topic-policy': [
      '请完成选题与政策分析：给出候选题、政策契合点、研究空白、可行性风险和推荐题目。',
      '不能引用不存在的政策或文献；如用户未提供，输出检索关键词和待核验方向。',
      '输出栏目：政策对接、候选题评估、推荐题目、研究空白、文献检索式、风险提示。',
    ],
    proposal: [
      '请生成课题申报书工作稿，结构要贴近中文课题申报书。',
      '输出栏目：课题名称、研究背景、研究目标、研究内容、研究方法、创新点、实施计划、预期成果、研究基础、保障条件、需补充信息。',
      '如果缺少团队成果、数据、单位基础，必须用占位提示，不得编造。',
    ],
    'review-defense': [
      '请完成评审优化与答辩准备：像评审专家一样检查材料，并给出修改优先级。',
      '输出栏目：总体评分参考、严重问题、需关注问题、政策匹配、AI痕迹与空泛表达、修改优先级、答辩问题与参考回答、实施管理建议。',
      '评分仅作为文本质量参考，必须提示不代表真实立项结果。',
    ],
  };

  return [
    ...commonRules,
    '',
    `当前入口：${label}`,
    ...panelInstructions[panel],
    '',
    '课题档案：',
    `- 课题级别：${profile.level || '未填写'}`,
    `- 学科领域：${profile.discipline || '未填写'}`,
    `- 研究方向：${profile.direction || '未填写'}`,
    `- 当前阶段：${profile.stage || '未填写'}`,
    `- 截止时间：${profile.deadline || '未填写'}`,
    `- 基础说明：${profile.sourceNotes || '未填写'}`,
    '',
    '用户任务：',
    input.taskText || '未填写',
    '',
    '用户材料：',
    input.materialText || '未提供',
  ].join('\n');
}

function createQualityReviewPrompt(profile, input, state) {
  const proposal = String(state.outputs?.proposal || '').trim();
  const topicPolicy = String(state.outputs?.['topic-policy'] || '').trim();
  const diagnosis = String(state.outputs?.diagnosis || '').trim();
  const material = String(input.materialText || '').trim();
  const taskText = String(input.taskText || '').trim();

  return [
    '你是课题申报评审专家。请基于用户提供的申报书、前序材料和课题档案，生成“八维质量检测报告”。',
    '',
    '硬性边界：',
    '1. 不得编造政策文号、文献题名、论文、获奖、数据、单位成果或真实评审结论。',
    '2. 如果材料不足，必须明确写“需补充”，不能替用户虚构。',
    '3. “通过概率/评分”只能作为文本质量参考，不能暗示真实立项承诺。',
    '4. 输出中文 Markdown，问题要有位置、原因、风险和可执行修改建议。',
    '',
    '请按以下结构输出：',
    '## 总体判断',
    '- 给出 0-100 的文本质量参考分、一句话结论、3 个优先修改方向。',
    '## 八维检测',
    '### 1. 生命周期连贯性',
    '检查题目、目标、内容、方法、成果和实施计划是否前后一致。',
    '### 2. 真实性与证据链',
    '检查前期基础、成果、数据、案例、团队能力是否有可核验证据。',
    '### 3. 可行性',
    '检查时间、样本、方法、团队、资源、成果承诺是否可落地。',
    '### 4. AI 痕迹与空泛表达',
    '定位套话、机械排比、泛泛而谈、缺少对象/动作/数据的段落。',
    '### 5. 内容真伪核查',
    '检查政策、概念、文献、数据和事实表述是否需要核验。',
    '### 6. 规范合规',
    '检查申报书结构、层级、术语、政治性/政策性表述和格式风险。',
    '### 7. 政策匹配度',
    '结合用户提供的政策/指南和学科方向判断契合度；没有政策材料时给出待检索方向。',
    '### 8. 通过概率参考',
    '给出相对风险等级和影响因素，必须声明不代表真实评审结果。',
    '## 严重问题',
    '列出必须修改的问题。',
    '## 修改优先级',
    '按“立即修改 / 二轮优化 / 可选增强”给出清单。',
    '## 可直接替换的修改示例',
    '给出 3-5 条可复制的改写示例，不能新增未提供事实。',
    '',
    '课题档案：',
    `- 课题级别：${profile.level || '未填写'}`,
    `- 学科领域：${profile.discipline || '未填写'}`,
    `- 研究方向：${profile.direction || '未填写'}`,
    `- 当前阶段：${profile.stage || '未填写'}`,
    `- 截止时间：${profile.deadline || '未填写'}`,
    `- 基础说明：${profile.sourceNotes || '未填写'}`,
    '',
    '用户检测要求：',
    taskText || '请对现有申报材料进行深度质量检测。',
    '',
    '启动诊断成果：',
    diagnosis || '未提供',
    '',
    '选题与政策成果：',
    topicPolicy || '未提供',
    '',
    '申报书草稿：',
    proposal || '未提供',
    '',
    '补充待评审材料：',
    material || '未提供',
  ].join('\n');
}

function getProposalModuleDefinition(moduleKey) {
  return proposalModuleDefinitions.find((module) => module.key === moduleKey);
}

function buildProposalMarkdown(modules = {}) {
  const normalizedModules = normalizeProposalModules(modules);
  return proposalModuleDefinitions
    .map((module) => {
      const content = String(normalizedModules[module.key] || '').trim();
      return content ? `## ${module.label}\n\n${content}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function createProposalModulePrompt(moduleKey, profile, input, state) {
  const moduleDefinition = getProposalModuleDefinition(moduleKey);
  const modules = normalizeProposalModules(state.proposalModules);
  const visualSettings = normalizeProposalVisualSettings(state.proposalVisualSettings);
  const generatedContext = proposalModuleDefinitions
    .filter((module) => module.key !== moduleKey && String(modules[module.key] || '').trim())
    .map((module) => `## ${module.label}\n${modules[module.key].trim()}`)
    .join('\n\n');

  return [
    '你是严谨、材料优先的中文科研课题申报书撰写专家。请只生成当前指定模块，不要输出整份申报书。',
    '',
    '硬性边界：',
    '1. 不得编造政策文号、文献题名、论文、获奖、数据、单位成果、团队履历或真实评审结论。',
    '2. 缺少事实依据时，用“需补充：……”标注，不得虚构。',
    '3. 输出中文 Markdown，但不要再写一级标题；可以使用小标题、条目和表格。',
    '4. 内容要符合课题级别、学科领域和申报阶段，避免空泛口号。',
    visualSettings.useMermaid ? '5. 如当前模块适合图示表达，可加入一个稳定 Mermaid 代码块；优先用于研究内容、研究方法、实施计划、预期成果。' : '5. 不要输出 Mermaid 代码块。',
    visualSettings.useTechnicalDiagram ? '6. 如涉及研究框架、技术路线或实施流程，请输出“图示建议”，说明图名、图注、节点和使用位置。' : '6. 不要输出技术路线图或研究框架图建议。',
    visualSettings.useAiImage ? '7. 可在末尾输出“AI 配图提示词”，仅用于生成学术风格示意图，不要把提示词当正文事实。' : '7. 不要输出 AI 配图提示词。',
    '',
    `当前模块：${moduleDefinition.label}`,
    `模块任务：${moduleDefinition.instruction}`,
    '',
    '课题档案：',
    `- 课题级别：${profile.level || '未填写'}`,
    `- 学科领域：${profile.discipline || '未填写'}`,
    `- 研究方向：${profile.direction || '未填写'}`,
    `- 当前阶段：${profile.stage || '未填写'}`,
    `- 截止时间：${profile.deadline || '未填写'}`,
    `- 基础说明：${profile.sourceNotes || '未填写'}`,
    '',
    '用户撰写任务：',
    input.taskText || '未填写',
    '',
    '撰写依据与材料：',
    input.materialText || '未提供',
    '',
    '启动诊断成果：',
    String(state.outputs?.diagnosis || '').trim() || '未提供',
    '',
    '选题与政策成果：',
    String(state.outputs?.['topic-policy'] || '').trim() || '未提供',
    '',
    '已生成的其他申报书模块：',
    generatedContext || '暂无',
  ].join('\n');
}

function createProposalModuleQualityPrompt(moduleKey, profile, input, state) {
  const moduleDefinition = getProposalModuleDefinition(moduleKey);
  const modules = normalizeProposalModules(state.proposalModules);
  const content = String(modules[moduleKey] || '').trim();
  const visualSettings = normalizeProposalVisualSettings(state.proposalVisualSettings);
  const sourceNotes = compactPromptText(profile.sourceNotes, 2400) || '未填写';
  const taskText = compactPromptText(input.taskText, 3200) || '未填写';
  const materialText = compactPromptText(input.materialText, 6000) || '未提供';
  const diagnosisOutput = compactPromptText(state.outputs?.diagnosis, 3600) || '未提供';
  const topicPolicyOutput = compactPromptText(state.outputs?.['topic-policy'], 4200) || '未提供';
  const moduleContent = compactPromptText(content, 9000) || '未填写';

  return [
    '你是课题申报质量评审专家。请检查指定申报书模块，不要重写正文，只输出检查报告。',
    '',
    '检查边界：',
    '1. 不得编造政策、文献、数据、成果或真实评审结论。',
    '2. 明确指出空泛表达、事实缺口、逻辑不一致、可行性风险和 AI 痕迹。',
    '3. 如果模块为空，直接判为高风险，并列出需要补充的材料。',
    '',
    '请按以下 Markdown 结构输出：',
    '## 质量结论',
    '- 状态：通过 / 需补充 / 高风险',
    '- 参考分：0-100',
    '- 一句话结论：',
    '## 主要问题',
    '## 事实缺口',
    '## 与前序成果一致性',
    '## 图示建议',
    '根据用户勾选项判断是否需要 Mermaid、技术路线图或 AI 配图提示词；不需要则说明“不建议强行配图”。',
    '## 修改建议',
    '',
    `当前模块：${moduleDefinition.label}`,
    '',
    '图示配置：',
    `- AI 生图提示词：${visualSettings.useAiImage ? '启用' : '未启用'}`,
    `- 技术路线/框架图建议：${visualSettings.useTechnicalDiagram ? '启用' : '未启用'}`,
    `- Mermaid 图：${visualSettings.useMermaid ? '启用' : '未启用'}`,
    '',
    '课题档案：',
    `- 课题级别：${profile.level || '未填写'}`,
    `- 学科领域：${profile.discipline || '未填写'}`,
    `- 研究方向：${profile.direction || '未填写'}`,
    `- 当前阶段：${profile.stage || '未填写'}`,
    `- 截止时间：${profile.deadline || '未填写'}`,
    `- 基础说明：${sourceNotes}`,
    '',
    '撰写任务：',
    taskText,
    '',
    '撰写依据：',
    materialText,
    '',
    '启动诊断成果：',
    diagnosisOutput,
    '',
    '选题与政策成果：',
    topicPolicyOutput,
    '',
    '待检查模块正文：',
    moduleContent,
  ].join('\n');
}

function createProposalModulePolishPrompt(moduleKey, profile, input, state) {
  const moduleDefinition = getProposalModuleDefinition(moduleKey);
  const modules = normalizeProposalModules(state.proposalModules);
  const qualityChecks = normalizeProposalModuleQualityChecks(state.proposalModuleQualityChecks);
  const content = String(modules[moduleKey] || '').trim();
  const qualityReport = String(qualityChecks[moduleKey]?.report || '').trim();
  const visualSettings = normalizeProposalVisualSettings(state.proposalVisualSettings);

  return [
    '你是严谨、材料优先的中文科研课题申报书修改专家。请按质量检查意见优化当前模块，只输出优化后的模块正文。',
    '',
    '硬性边界：',
    '1. 不得编造政策文号、文献题名、论文、获奖、数据、单位成果、团队履历或真实评审结论。',
    '2. 尽量保留原文中可用的事实、结构和用户表达，只修正空泛、跳跃、不一致和评审风险。',
    '3. 缺少事实依据时，用“需补充：……”标注，不得替用户虚构。',
    '4. 输出中文 Markdown，但不要输出模块标题，不要解释修改过程。',
    visualSettings.useMermaid ? '5. 如该模块适合图示表达，可保留或补充一个稳定 Mermaid 代码块。' : '5. 不要输出 Mermaid 代码块。',
    visualSettings.useTechnicalDiagram ? '6. 如涉及研究框架、技术路线或实施流程，可保留或补充“图示建议”。' : '6. 不要输出技术路线图或研究框架图建议。',
    visualSettings.useAiImage ? '7. 可保留或补充“AI 配图提示词”，但提示词不能替代正文事实。' : '7. 不要输出 AI 配图提示词。',
    '',
    `当前模块：${moduleDefinition.label}`,
    `模块目标：${moduleDefinition.instruction}`,
    '',
    '课题档案：',
    `- 课题级别：${profile.level || '未填写'}`,
    `- 学科领域：${profile.discipline || '未填写'}`,
    `- 研究方向：${profile.direction || '未填写'}`,
    `- 当前阶段：${profile.stage || '未填写'}`,
    `- 截止时间：${profile.deadline || '未填写'}`,
    `- 基础说明：${profile.sourceNotes || '未填写'}`,
    '',
    '用户撰写任务：',
    input.taskText || '未填写',
    '',
    '撰写依据与材料：',
    input.materialText || '未提供',
    '',
    '启动诊断成果：',
    String(state.outputs?.diagnosis || '').trim() || '未提供',
    '',
    '选题与政策成果：',
    String(state.outputs?.['topic-policy'] || '').trim() || '未提供',
    '',
    '当前模块原文：',
    content || '未填写',
    '',
    '质量检查报告：',
    qualityReport || '暂无质量检查报告。请基于原文自行检查并审慎优化。',
  ].join('\n');
}

function createProposalFinalReviewPrompt(profile, input, state) {
  const modules = normalizeProposalModules(state.proposalModules);
  const qualityChecks = normalizeProposalModuleQualityChecks(state.proposalModuleQualityChecks);
  const visualSettings = normalizeProposalVisualSettings(state.proposalVisualSettings);
  const moduleTexts = proposalModuleDefinitions
    .map((module) => `## ${module.label}\n${String(modules[module.key] || '').trim() || '未填写'}`)
    .join('\n\n');
  const moduleQuality = proposalModuleDefinitions
    .map((module) => {
      const quality = qualityChecks[module.key] || initialProposalModuleQuality;
      return `- ${module.label}：${quality.status}，参考分 ${quality.score || '未评分'}，${quality.summary || '未检查'}`;
    })
    .join('\n');

  return [
    '你是课题申报终稿评审专家。请对整份申报书进行定稿前质量检查，只输出检查报告，不要重写申报书。',
    '',
    '硬性边界：',
    '1. 不得承诺真实立项结果，不得编造政策、文献、数据、成果或评审意见。',
    '2. 检查必须落到模块之间的一致性、事实缺口、图示一致性和定稿前核验项。',
    '3. 对“需补充 / 待核验 / 未填写”必须汇总成清单。',
    '4. 评分仅为文本质量参考，不代表真实评审结果。',
    '',
    '请按以下 Markdown 结构输出：',
    '## 终稿质量结论',
    '- 状态：通过 / 需补充 / 高风险',
    '- 参考分：0-100',
    '- 一句话结论：',
    '## 严重问题',
    '按影响立项风险排序。',
    '## 模块一致性检查',
    '检查题目、背景、目标、内容、方法、计划、成果、基础、保障之间是否前后一致。',
    '## 图示一致性检查',
    '检查 Mermaid、技术路线/研究框架图建议、AI 配图提示词是否与正文一致，是否存在图里有但正文没有的内容。',
    '## 需补充项汇总',
    '汇总全文需补充、待核验、未填写内容。',
    '## 可优化表达',
    '列出空泛、AI 味、套话和可压实表达。',
    '## 定稿前核验清单',
    '给出提交前必须人工核验的事实、政策、文献、数据、成果和格式项。',
    '',
    '图示配置：',
    `- AI 生图提示词：${visualSettings.useAiImage ? '启用' : '未启用'}`,
    `- 技术路线/研究框架图：${visualSettings.useTechnicalDiagram ? '启用' : '未启用'}`,
    `- Mermaid 图：${visualSettings.useMermaid ? '启用' : '未启用'}`,
    '',
    '课题档案：',
    `- 课题级别：${profile.level || '未填写'}`,
    `- 学科领域：${profile.discipline || '未填写'}`,
    `- 研究方向：${profile.direction || '未填写'}`,
    `- 当前阶段：${profile.stage || '未填写'}`,
    `- 截止时间：${profile.deadline || '未填写'}`,
    `- 基础说明：${profile.sourceNotes || '未填写'}`,
    '',
    '撰写任务：',
    input.taskText || '未填写',
    '',
    '撰写依据：',
    input.materialText || '未提供',
    '',
    '启动诊断成果：',
    String(state.outputs?.diagnosis || '').trim() || '未提供',
    '',
    '选题与政策成果：',
    String(state.outputs?.['topic-policy'] || '').trim() || '未提供',
    '',
    '模块质量摘要：',
    moduleQuality,
    '',
    '整份申报书：',
    String(state.outputs?.proposal || '').trim() || moduleTexts,
  ].join('\n');
}

function sanitizeFilename(value) {
  return String(value || '课题申报')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || '课题申报';
}

function createProjectName(profile = {}) {
  const normalized = normalizeProfile(profile);
  return normalizeString(normalized.direction || `${normalized.level}${normalized.discipline}课题`, 80) || '未命名课题';
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[`*_>#~-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitMarkdownSections(markdown) {
  const sections = [];
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  let current = { title: '正文', content: [] };

  for (const line of lines) {
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current.title || current.content.length) {
        sections.push({ title: current.title, content: current.content.join('\n').trim() });
      }
      current = { title: match[2].trim(), content: [] };
      continue;
    }
    current.content.push(line);
  }

  if (current.title || current.content.length) {
    sections.push({ title: current.title, content: current.content.join('\n').trim() });
  }
  return sections;
}

function findSectionText(sections, aliases) {
  const match = sections.find((section) => aliases.some((alias) => String(section.title || '').includes(alias)));
  return stripMarkdown(match?.content || '');
}

function buildFormFields(state) {
  const profile = normalizeProfile(state.profile);
  const proposal = String(state.outputs?.proposal || '');
  const topicPolicy = String(state.outputs?.['topic-policy'] || '');
  const sections = splitMarkdownSections(proposal || topicPolicy);
  const fields = {};

  for (const definition of formFieldDefinitions) {
    fields[definition.key] = findSectionText(sections, definition.aliases) || '需补充';
  }

  if (fields.project_name === '需补充') {
    const titleMatch = /(?:课题名称|题目)[:：]\s*(.+)/.exec(proposal);
    fields.project_name = normalizeString(titleMatch?.[1], 200) || profile.direction || '需补充';
  }

  return {
    profile: {
      level: profile.level,
      discipline: profile.discipline,
      direction: profile.direction,
      stage: profile.stage,
      deadline: profile.deadline,
    },
    fields,
  };
}

function getFormFieldStatus(content) {
  const text = stripMarkdown(content);
  if (!text || /^需补充$/.test(text) || /未填写|暂无|未提供/.test(text)) return 'missing';
  if (/需补充|待补充|待核验|需核验|待确认/.test(text)) return 'verify';
  if (text.length > 2500) return 'too_long';
  return 'ready';
}

function getFormFieldNote(status, content) {
  if (status === 'missing') return '内容缺失，提交前必须补充。';
  if (status === 'verify') return '含需补充或待核验信息，提交前需要人工确认。';
  if (status === 'too_long') return `当前约 ${stripMarkdown(content).length} 字，可能超过线上系统字段限制，建议压缩。`;
  return '可作为填报初稿，提交前仍需核对事实和格式。';
}

function normalizeHeadingText(value) {
  return stripMarkdown(value)
    .replace(/^[一二三四五六七八九十\d]+[、.．)]\s*/, '')
    .replace(/[：:]\s*$/, '')
    .trim();
}

function extractTemplateSections(markdown) {
  const sections = [];
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  let current = null;

  function pushCurrent() {
    if (!current || !current.title) return;
    sections.push({
      id: `template-section-${sections.length + 1}`,
      title: current.title,
      instruction: current.instruction.join('\n').trim(),
    });
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    const tableCells = line.startsWith('|') ? line.split('|').map((cell) => normalizeHeadingText(cell)).filter(Boolean) : [];
    const colonMatch = /^(.{2,40})[:：]\s*(.*)$/.exec(stripMarkdown(line));
    const numberedMatch = /^[一二三四五六七八九十\d]+[、.．)]\s*(.{2,40})$/.exec(stripMarkdown(line));
    const titleCandidate = headingMatch?.[2] || numberedMatch?.[1] || (colonMatch ? colonMatch[1] : '');

    if (titleCandidate) {
      const title = normalizeHeadingText(titleCandidate);
      if (title && !/^(是|否|有|无|年月日|签字|盖章|说明)$/.test(title)) {
        pushCurrent();
        current = { title, instruction: [] };
        if (colonMatch?.[2]) current.instruction.push(colonMatch[2]);
        continue;
      }
    }

    if (tableCells.length) {
      for (const cell of tableCells) {
        if (cell.length >= 2 && cell.length <= 40 && /课题|研究|目标|内容|方法|创新|计划|成果|基础|保障|摘要|说明|申请|负责人|单位/.test(cell)) {
          pushCurrent();
          current = { title: cell, instruction: [] };
        }
      }
      continue;
    }

    if (current && current.instruction.join('\n').length < 1200) {
      current.instruction.push(stripMarkdown(line));
    }
  }
  pushCurrent();

  const uniqueSections = [];
  const seen = new Set();
  for (const section of sections) {
    const key = section.title;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueSections.push(section);
  }
  return uniqueSections.slice(0, 40);
}

function matchTemplateSectionToField(section, fieldMapping) {
  const title = normalizeHeadingText(section.title);
  const instruction = normalizeHeadingText(section.instruction);
  const searchText = `${title} ${instruction}`;
  let best = null;

  for (const definition of formFieldDefinitions) {
    const aliases = [definition.label, ...definition.aliases];
    const score = aliases.reduce((total, alias) => {
      if (searchText.includes(alias)) return total + 6;
      if (alias.includes(title) || title.includes(alias)) return total + 4;
      return total;
    }, 0);
    if (!best || score > best.score) {
      best = { definition, score };
    }
  }

  if (!best || best.score <= 0) return null;
  return fieldMapping.fields.find((field) => field.key === best.definition.key) || null;
}

function buildTemplateMappingFromMarkdown(fileName, markdown, state) {
  const fieldMapping = buildFormFieldMapping(state);
  const templateSections = extractTemplateSections(markdown);
  const sections = templateSections.map((section) => {
    const matchedField = matchTemplateSectionToField(section, fieldMapping);
    if (!matchedField) {
      return {
        ...section,
        matchedFieldKey: '',
        matchedFieldLabel: '',
        status: 'unmatched',
        content: '',
        note: '未能自动匹配到通用申报字段，请人工判断该栏目需要填写什么内容。',
        length: 0,
      };
    }
    const status = matchedField.status === 'ready' ? 'matched' : matchedField.status;
    return {
      ...section,
      matchedFieldKey: matchedField.key,
      matchedFieldLabel: matchedField.label,
      status,
      content: matchedField.content,
      note: matchedField.note,
      length: matchedField.length,
    };
  });
  const mapping = normalizeProposalTemplateMapping({
    fileName,
    imported_at: now(),
    sections,
    rawMarkdown: markdown,
  });
  return mapping;
}

function escapeXmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractDocxXmlText(xml) {
  return String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDocxParagraphsXml(content) {
  const paragraphs = String(content || '需人工补充')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 40);
  const items = paragraphs.length ? paragraphs : ['需人工补充'];
  return items.map((paragraph) => `<w:p><w:r><w:t xml:space="preserve">${escapeXmlText(paragraph)}</w:t></w:r></w:p>`).join('');
}

function replaceDocxCellContent(cellXml, content) {
  const tcPrMatch = cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
  const prefix = tcPrMatch ? tcPrMatch[0] : '';
  return `<w:tc>${prefix}${buildDocxParagraphsXml(content)}</w:tc>`;
}

function fillDocxTemplateDocumentXml(documentXml, mapping) {
  const reportItems = [];
  let nextXml = String(documentXml || '');

  for (const section of mapping.sections) {
    if (!section.content || section.status === 'unmatched' || section.status === 'missing') {
      reportItems.push({ title: section.title, status: 'skipped', message: section.status === 'unmatched' ? '栏目未匹配到通用字段' : '匹配字段内容缺失' });
      continue;
    }

    let filled = false;
    nextXml = nextXml.replace(/<w:tr[\s\S]*?<\/w:tr>/g, (rowXml) => {
      if (filled) return rowXml;
      const cells = rowXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
      if (cells.length < 2) return rowXml;
      const titleIndex = cells.findIndex((cell) => extractDocxXmlText(cell).includes(section.title));
      if (titleIndex < 0 || titleIndex >= cells.length - 1) return rowXml;
      const nextCell = cells[titleIndex + 1];
      const nextCellText = extractDocxXmlText(nextCell);
      if (nextCellText && nextCellText.length > 20 && !/请|填写|空白|待填|请输入/.test(nextCellText)) return rowXml;
      const replacedCell = replaceDocxCellContent(nextCell, section.content);
      filled = true;
      return rowXml.replace(nextCell, replacedCell);
    });

    reportItems.push({
      title: section.title,
      status: filled ? 'filled' : 'skipped',
      message: filled ? '已写入匹配栏目右侧单元格' : '未找到可安全写入的同表格单元格',
    });
  }

  return {
    documentXml: nextXml,
    report: {
      filePath: '',
      generated_at: now(),
      total: reportItems.length,
      filled: reportItems.filter((item) => item.status === 'filled').length,
      skipped: reportItems.filter((item) => item.status !== 'filled').length,
      items: reportItems,
    },
  };
}

function buildFormFieldMapping(state) {
  const payload = buildFormFields(state);
  const fields = formFieldDefinitions.map((definition) => {
    const content = payload.fields[definition.key] || '需补充';
    const status = getFormFieldStatus(content);
    return {
      key: definition.key,
      label: definition.label,
      content,
      status,
      note: getFormFieldNote(status, content),
      length: stripMarkdown(content).length,
    };
  });
  const summary = {
    total: fields.length,
    ready: fields.filter((field) => field.status === 'ready').length,
    missing: fields.filter((field) => field.status === 'missing').length,
    verify: fields.filter((field) => field.status === 'verify').length,
    too_long: fields.filter((field) => field.status === 'too_long').length,
  };

  return {
    profile: payload.profile,
    fields,
    summary,
    updated_at: now(),
  };
}

function buildFormFieldsText(state) {
  const payload = buildFormFieldMapping(state);
  const profileLines = [
    `课题级别：${payload.profile.level || '需补充'}`,
    `学科领域：${payload.profile.discipline || '需补充'}`,
    `研究方向：${payload.profile.direction || '需补充'}`,
    `当前阶段：${payload.profile.stage || '需补充'}`,
    `截止时间：${payload.profile.deadline || '需补充'}`,
  ];
  const fieldLines = payload.fields.flatMap((field) => [
    `## ${field.label}`,
    `状态：${field.status === 'ready' ? '已填写' : field.status === 'missing' ? '缺失' : field.status === 'verify' ? '待核验' : '过长'}`,
    `字数：${field.length}`,
    `注意事项：${field.note}`,
    '',
    field.content || '需补充',
    '',
  ]);

  return [
    '# 课题申报系统填报字段摘要',
    '',
    '## 基本信息',
    ...profileLines,
    '',
    ...fieldLines,
    '## 使用提示',
    '本文件由本地工作区内容整理生成。导入线上申报系统前，请逐项核对事实、政策文件、文献、成果和格式要求。',
  ].join('\n');
}

function summarizeModuleQuality(report) {
  const text = String(report || '');
  const scoreMatch = /(?:参考分|评分|分数)[:：]?\s*(\d{1,3})/.exec(text);
  const score = Math.max(0, Math.min(100, Number(scoreMatch?.[1] || 0)));
  const firstConclusion = text.split('\n').map((line) => line.replace(/^[-#*\s]+/, '').trim()).find((line) => /结论|状态|风险|补充|通过/.test(line)) || '已完成模块质量检查';
  const hasRisk = /高风险|严重|必须|编造|缺少依据|无法判断/.test(text);
  const hasWarning = /需补充|待补充|建议补充|风险|空泛|不一致|AI/.test(text);
  const status = hasRisk || (score > 0 && score < 70) ? 'risk' : hasWarning || (score > 0 && score < 85) ? 'warning' : 'pass';
  return {
    status,
    score,
    summary: normalizeString(firstConclusion, 300),
    report: text,
    checked_at: now(),
  };
}

function summarizeFinalReview(report) {
  return summarizeModuleQuality(report);
}

function createGrantApplicationService({ app, aiService, configStore }) {
  const subscribers = new Set();
  let activeTask = null;

  const rootDir = () => ensureDir(getGrantApplicationDir(app));
  const registryPath = () => path.join(rootDir(), 'projects.json');
  const projectDir = (projectId = getActiveProjectId()) => ensureDir(path.join(rootDir(), 'projects', normalizeProjectId(projectId)));
  const statePath = (projectId) => path.join(projectDir(projectId), 'state.json');
  const outputPath = (panel, projectId) => path.join(projectDir(projectId), `${normalizePanel(panel)}.md`);

  function legacyStatePath() {
    return path.join(rootDir(), 'state.json');
  }

  function readRegistryRaw() {
    if (!fs.existsSync(registryPath())) {
      return null;
    }
    return safeJsonParse(fs.readFileSync(registryPath(), 'utf-8'), null);
  }

  function writeRegistry(registry) {
    ensureDir(path.dirname(registryPath()));
    fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2), 'utf-8');
  }

  function createDefaultProject(timestamp = now()) {
    return {
      id: defaultProjectId,
      name: '默认课题',
      created_at: timestamp,
      updated_at: timestamp,
      isLegacy: true,
    };
  }

  function ensureRegistry() {
    const timestamp = now();
    const raw = readRegistryRaw();
    let registry = {
      activeProjectId: raw?.activeProjectId || defaultProjectId,
      projects: Array.isArray(raw?.projects) && raw.projects.length ? raw.projects : [createDefaultProject(timestamp)],
    };

    registry.projects = registry.projects.map((project) => ({
      id: normalizeProjectId(project.id),
      name: normalizeString(project.name, 100) || '未命名课题',
      created_at: normalizeString(project.created_at, 80) || timestamp,
      updated_at: normalizeString(project.updated_at, 80) || timestamp,
      isLegacy: Boolean(project.isLegacy),
    }));

    if (!registry.projects.some((project) => project.id === registry.activeProjectId)) {
      registry.activeProjectId = registry.projects[0]?.id || defaultProjectId;
    }

    if (fs.existsSync(legacyStatePath()) && !fs.existsSync(statePath(defaultProjectId))) {
      ensureDir(projectDir(defaultProjectId));
      fs.copyFileSync(legacyStatePath(), statePath(defaultProjectId));
      for (const panel of validPanels) {
        const legacyOutput = path.join(rootDir(), `${panel}.md`);
        if (fs.existsSync(legacyOutput) && !fs.existsSync(outputPath(panel, defaultProjectId))) {
          fs.copyFileSync(legacyOutput, outputPath(panel, defaultProjectId));
        }
      }
      const legacyState = loadState(defaultProjectId);
      registry.projects = registry.projects.map((project) => project.id === defaultProjectId
        ? {
          ...project,
          name: createProjectName(legacyState.profile) || project.name,
          updated_at: legacyState.updated_at || timestamp,
        }
        : project);
    }

    writeRegistry(registry);
    return registry;
  }

  function getActiveProjectId() {
    return normalizeProjectId(ensureRegistry().activeProjectId);
  }

  function updateProjectTimestamp(projectId, patch = {}) {
    const registry = ensureRegistry();
    const normalizedProjectId = normalizeProjectId(projectId);
    const projects = registry.projects.map((project) => project.id === normalizedProjectId
      ? { ...project, ...patch, updated_at: patch.updated_at || now() }
      : project);
    writeRegistry({ ...registry, projects });
  }

  function loadState(projectId = getActiveProjectId()) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const state = fs.existsSync(statePath(normalizedProjectId))
      ? safeJsonParse(fs.readFileSync(statePath(normalizedProjectId), 'utf-8'), initialState)
      : initialState;
    const normalized = cloneState(activeTask ? state : recoverInterruptedTask(state));
    const registry = ensureRegistry();
    const project = registry.projects.find((item) => item.id === normalizedProjectId);
    normalized.projectId = normalizedProjectId;
    normalized.projectName = project?.name || createProjectName(normalized.profile);
    for (const panel of validPanels) {
      const filePath = outputPath(panel, normalizedProjectId);
      if (fs.existsSync(filePath)) {
        normalized.outputs[panel] = fs.readFileSync(filePath, 'utf-8');
      }
    }
    if (!activeTask && state?.task?.status === 'running') {
      fs.writeFileSync(statePath(normalizedProjectId), JSON.stringify(normalized, null, 2), 'utf-8');
    }
    return normalized;
  }

  function broadcast(state = loadState()) {
    for (const webContents of subscribers) {
      if (!webContents || webContents.isDestroyed()) {
        subscribers.delete(webContents);
        continue;
      }
      webContents.send('grant-application:event', state);
    }
  }

  function saveState(partial = {}) {
    const projectId = normalizeProjectId(partial.projectId || partial.project_id || getActiveProjectId());
    const nextState = cloneState({ ...loadState(projectId), ...partial, updated_at: now() });
    nextState.projectId = projectId;
    nextState.projectName = normalizeString(partial.projectName || nextState.projectName || createProjectName(nextState.profile), 100);
    ensureDir(path.dirname(statePath(projectId)));
    for (const panel of validPanels) {
      const content = String(nextState.outputs[panel] || '');
      const filePath = outputPath(panel, projectId);
      if (content) {
        fs.writeFileSync(filePath, content, 'utf-8');
      } else if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    }
    fs.writeFileSync(statePath(projectId), JSON.stringify(nextState, null, 2), 'utf-8');
    updateProjectTimestamp(projectId, { name: nextState.projectName || createProjectName(nextState.profile), updated_at: nextState.updated_at });
    broadcast(nextState);
    return nextState;
  }

  function listProjects() {
    const registry = ensureRegistry();
    return {
      activeProjectId: registry.activeProjectId,
      projects: registry.projects
        .map((project) => ({
          ...project,
          isActive: project.id === registry.activeProjectId,
        }))
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
    };
  }

  function createProject(payload = {}) {
    const registry = ensureRegistry();
    const timestamp = now();
    const profile = normalizeProfile(payload.profile || {
      ...initialProfile,
      direction: normalizeString(payload.projectName || payload.name, 200),
    });
    const project = {
      id: createProjectId(),
      name: normalizeString(payload.projectName || payload.name, 100) || createProjectName(profile),
      created_at: timestamp,
      updated_at: timestamp,
      isLegacy: false,
    };
    writeRegistry({
      activeProjectId: project.id,
      projects: [project, ...registry.projects],
    });
    const state = saveState({ ...initialState, projectId: project.id, projectName: project.name, profile });
    return { project, projects: listProjects(), state };
  }

  function switchProject(projectId) {
    const registry = ensureRegistry();
    const normalizedProjectId = normalizeProjectId(projectId);
    const project = registry.projects.find((item) => item.id === normalizedProjectId);
    if (!project) throw new Error('未找到课题项目');
    writeRegistry({ ...registry, activeProjectId: normalizedProjectId });
    const state = loadState(normalizedProjectId);
    broadcast(state);
    return state;
  }

  function renameProject(payload = {}) {
    const registry = ensureRegistry();
    const projectId = normalizeProjectId(payload.projectId || payload.project_id || registry.activeProjectId);
    const name = normalizeString(payload.name || payload.projectName, 100);
    if (!name) throw new Error('项目名称不能为空');
    const projects = registry.projects.map((project) => project.id === projectId ? { ...project, name, updated_at: now() } : project);
    if (!projects.some((project) => project.id === projectId)) throw new Error('未找到课题项目');
    writeRegistry({ ...registry, projects });
    const state = saveState({ projectId, projectName: name });
    return { projects: listProjects(), state };
  }

  function deleteProject(projectIdValue) {
    const registry = ensureRegistry();
    const projectId = normalizeProjectId(projectIdValue || registry.activeProjectId);
    if (registry.projects.length <= 1) {
      throw new Error('至少保留一个课题项目');
    }
    const projects = registry.projects.filter((project) => project.id !== projectId);
    if (projects.length === registry.projects.length) throw new Error('未找到课题项目');
    if (fs.existsSync(projectDir(projectId))) {
      fs.rmSync(projectDir(projectId), { recursive: true, force: true });
    }
    const activeProjectId = registry.activeProjectId === projectId ? projects[0].id : registry.activeProjectId;
    writeRegistry({ activeProjectId, projects });
    const state = loadState(activeProjectId);
    broadcast(state);
    return { success: true, projects: listProjects(), state };
  }

  function saveTaskProgress(taskId, progress, message) {
    if (!activeTask || activeTask.id !== taskId) return;
    activeTask = { ...activeTask, progress, message };
    saveState({ task: activeTask });
  }

  function startProgressPulse(taskId) {
    const checkpoints = [
      { progress: 24, message: '正在整理课题档案和材料边界' },
      { progress: 42, message: '正在匹配课题申报阶段要求' },
      { progress: 64, message: '正在生成结构化工作稿' },
      { progress: 82, message: '正在检查事实缺口和评审风险' },
      { progress: 94, message: '正在保存结果到本机工作区' },
    ];
    let index = 0;
    const timer = setInterval(() => {
      if (!activeTask || activeTask.id !== taskId) {
        clearInterval(timer);
        return;
      }
      const checkpoint = checkpoints[index];
      if (checkpoint) {
        index += 1;
        saveTaskProgress(taskId, checkpoint.progress, checkpoint.message);
        return;
      }
      const currentProgress = Number(activeTask.progress || 0);
      saveTaskProgress(taskId, Math.min(96, currentProgress + 1), '文本模型仍在处理，请稍候');
    }, 1200);
    return () => clearInterval(timer);
  }

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    const isNewSubscriber = !subscribers.has(webContents);
    subscribers.add(webContents);
    if (isNewSubscriber) {
      webContents.once('destroyed', () => subscribers.delete(webContents));
    }
    broadcast(loadState());
  }

  function saveWorkspace(payload = {}) {
    const currentState = loadState();
    const panel = normalizePanel(payload.panel || payload.activePanel || currentState.activePanel);
    const inputs = {
      ...currentState.inputs,
      [panel]: normalizePanelInput(payload.input || payload.inputs?.[panel] || currentState.inputs[panel]),
    };
    const outputs = payload.output !== undefined
      ? { ...currentState.outputs, [panel]: String(payload.output || '') }
      : currentState.outputs;
    return saveState({
      profile: normalizeProfile(payload.profile || currentState.profile),
      activePanel: panel,
      inputs,
      outputs,
    });
  }

  function saveOutput(payload = {}) {
    const currentState = loadState();
    const panel = normalizePanel(payload.panel || currentState.activePanel);
    return saveState({
      activePanel: panel,
      outputs: {
        ...currentState.outputs,
        [panel]: String(payload.output || ''),
      },
    });
  }

  async function generate(payload = {}) {
    if (activeTask) {
      throw new Error('课题申报任务正在生成中，请稍后再试');
    }
    ensureTextModelReady(configStore, '生成课题申报工作稿');

    const currentState = saveWorkspace(payload);
    const panel = normalizePanel(payload.panel || currentState.activePanel);
    const profile = normalizeProfile(payload.profile || currentState.profile);
    const input = normalizePanelInput(payload.input || currentState.inputs[panel]);
    const prompt = createPrompt(panel, profile, input);
    const task = {
      id: `grant-application-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 10,
      message: '正在准备课题申报生成任务',
      started_at: now(),
    };

    activeTask = task;
    saveState({ activePanel: panel, profile, inputs: { ...currentState.inputs, [panel]: input }, task });
    const stopProgress = startProgressPulse(task.id);

    try {
      saveTaskProgress(task.id, 16, '正在请求文本模型生成工作稿');
      const output = await aiService.chat({
        messages: [
          { role: 'system', content: '你是专业、审慎、材料优先的中文科研课题申报专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.45,
        logTitle: `课题申报-${panelLabels[panel]}`,
      });
      stopProgress();
      activeTask = null;
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '课题申报工作稿已生成',
        finished_at: now(),
      };
      return saveState({
        activePanel: panel,
        profile,
        inputs: { ...loadState().inputs, [panel]: input },
        outputs: { ...loadState().outputs, [panel]: String(output || '').trim() },
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '课题申报生成失败',
        finished_at: now(),
      };
      saveState({ activePanel: panel, profile, task: failedTask });
      throw error;
    }
  }

  async function generateProposalModule(payload = {}) {
    if (activeTask) {
      throw new Error('课题申报任务正在生成中，请稍后再试');
    }
    ensureTextModelReady(configStore, '生成申报书模块');

    const panel = 'proposal';
    const moduleKey = normalizeString(payload.moduleKey || payload.module_key, 80);
    const moduleDefinition = getProposalModuleDefinition(moduleKey);
    if (!moduleDefinition) {
      throw new Error('请选择要生成的申报书模块');
    }

    const currentState = saveWorkspace({ ...payload, panel });
    const profile = normalizeProfile(payload.profile || currentState.profile);
    const input = normalizePanelInput(payload.input || currentState.inputs[panel]);
    const prompt = createProposalModulePrompt(moduleKey, profile, input, currentState);
    const task = {
      id: `grant-application-proposal-module-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 10,
      message: `正在准备生成${moduleDefinition.label}`,
      started_at: now(),
      stats: { moduleKey },
    };

    activeTask = task;
    saveState({ activePanel: panel, profile, inputs: { ...currentState.inputs, [panel]: input }, task });
    const stopProgress = startProgressPulse(task.id);

    try {
      saveTaskProgress(task.id, 16, `正在请求文本模型生成${moduleDefinition.label}`);
      const output = await aiService.chat({
        messages: [
          { role: 'system', content: '你是专业、审慎、材料优先的中文科研课题申报书撰写专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        logTitle: `课题申报-申报书模块-${moduleDefinition.label}`,
      });
      stopProgress();
      activeTask = null;
      const latestState = loadState();
      const proposalModules = {
        ...normalizeProposalModules(latestState.proposalModules),
        [moduleKey]: String(output || '').trim(),
      };
      const proposalMarkdown = buildProposalMarkdown(proposalModules);
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: `${moduleDefinition.label}已生成`,
        finished_at: now(),
      };
      return saveState({
        activePanel: panel,
        profile,
        inputs: { ...latestState.inputs, [panel]: input },
        proposalModules,
        outputs: { ...latestState.outputs, [panel]: proposalMarkdown },
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || `${moduleDefinition.label}生成失败`,
        finished_at: now(),
      };
      saveState({ activePanel: panel, profile, task: failedTask });
      throw error;
    }
  }

  function saveProposalModule(payload = {}) {
    const moduleKey = normalizeString(payload.moduleKey || payload.module_key, 80);
    const moduleDefinition = getProposalModuleDefinition(moduleKey);
    if (!moduleDefinition) {
      throw new Error('请选择要保存的申报书模块');
    }

    const currentState = loadState();
    const proposalModules = {
      ...normalizeProposalModules(currentState.proposalModules),
      [moduleKey]: String(payload.content || ''),
    };
    const proposalMarkdown = buildProposalMarkdown(proposalModules);
    return saveState({
      activePanel: 'proposal',
      proposalModules,
      outputs: {
        ...currentState.outputs,
        proposal: proposalMarkdown,
      },
    });
  }

  function saveProposalVisualSettings(payload = {}) {
    const currentState = loadState();
    return saveState({
      activePanel: 'proposal',
      proposalVisualSettings: normalizeProposalVisualSettings(payload.settings || payload),
      outputs: currentState.outputs,
    });
  }

  async function polishProposalModule(payload = {}) {
    if (activeTask) {
      throw new Error('课题申报任务正在生成中，请稍后再试');
    }
    ensureTextModelReady(configStore, '优化申报书模块');

    const panel = 'proposal';
    const moduleKey = normalizeString(payload.moduleKey || payload.module_key, 80);
    const moduleDefinition = getProposalModuleDefinition(moduleKey);
    if (!moduleDefinition) {
      throw new Error('请选择要优化的申报书模块');
    }

    const currentState = saveWorkspace({ ...payload, panel });
    const profile = normalizeProfile(payload.profile || currentState.profile);
    const input = normalizePanelInput(payload.input || currentState.inputs[panel]);
    const prompt = createProposalModulePolishPrompt(moduleKey, profile, input, currentState);
    const task = {
      id: `grant-application-proposal-polish-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 10,
      message: `正在优化${moduleDefinition.label}`,
      started_at: now(),
      stats: { moduleKey },
    };

    activeTask = task;
    saveState({ activePanel: panel, profile, inputs: { ...currentState.inputs, [panel]: input }, task });
    const stopProgress = startProgressPulse(task.id);

    try {
      saveTaskProgress(task.id, 16, `正在请求文本模型优化${moduleDefinition.label}`);
      const output = await aiService.chat({
        messages: [
          { role: 'system', content: '你是专业、审慎、材料优先的中文科研课题申报书修改专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.32,
        logTitle: `课题申报-模块优化-${moduleDefinition.label}`,
      });
      stopProgress();
      activeTask = null;
      const latestState = loadState();
      const proposalModules = {
        ...normalizeProposalModules(latestState.proposalModules),
        [moduleKey]: String(output || '').trim(),
      };
      const qualityChecks = {
        ...normalizeProposalModuleQualityChecks(latestState.proposalModuleQualityChecks),
        [moduleKey]: initialProposalModuleQuality,
      };
      const proposalMarkdown = buildProposalMarkdown(proposalModules);
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: `${moduleDefinition.label}已优化`,
        finished_at: now(),
      };
      return saveState({
        activePanel: panel,
        profile,
        inputs: { ...latestState.inputs, [panel]: input },
        proposalModules,
        proposalModuleQualityChecks: qualityChecks,
        outputs: { ...latestState.outputs, [panel]: proposalMarkdown },
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || `${moduleDefinition.label}优化失败`,
        finished_at: now(),
      };
      saveState({ activePanel: panel, profile, task: failedTask });
      throw error;
    }
  }

  function combineProposalModules() {
    const currentState = loadState();
    const proposalModules = normalizeProposalModules(currentState.proposalModules);
    const proposalMarkdown = buildProposalMarkdown(proposalModules);
    return saveState({
      activePanel: 'proposal',
      proposalModules,
      outputs: {
        ...currentState.outputs,
        proposal: proposalMarkdown,
      },
    });
  }

  async function generateProposalModuleQualityCheck(payload = {}) {
    if (activeTask) {
      throw new Error('课题申报任务正在生成中，请稍后再试');
    }
    ensureTextModelReady(configStore, '检查申报书模块');

    const panel = 'proposal';
    const moduleKey = normalizeString(payload.moduleKey || payload.module_key, 80);
    const moduleDefinition = getProposalModuleDefinition(moduleKey);
    if (!moduleDefinition) {
      throw new Error('请选择要检查的申报书模块');
    }

    const currentState = saveWorkspace({ ...payload, panel });
    const profile = normalizeProfile(payload.profile || currentState.profile);
    const input = normalizePanelInput(payload.input || currentState.inputs[panel]);
    const prompt = createProposalModuleQualityPrompt(moduleKey, profile, input, currentState);
    const task = {
      id: `grant-application-proposal-quality-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 10,
      message: `正在检查${moduleDefinition.label}`,
      started_at: now(),
      stats: { moduleKey },
    };

    activeTask = task;
    saveState({ activePanel: panel, profile, inputs: { ...currentState.inputs, [panel]: input }, task });
    const stopProgress = startProgressPulse(task.id);

    try {
      saveTaskProgress(task.id, 16, `正在请求文本模型检查${moduleDefinition.label}`);
      const report = await aiService.chat({
        messages: [
          { role: 'system', content: '你是严谨、审慎、材料优先的中文科研课题申报评审专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.25,
        logTitle: `课题申报-模块质量检查-${moduleDefinition.label}`,
      });
      stopProgress();
      activeTask = null;
      const latestState = loadState();
      const qualityChecks = {
        ...normalizeProposalModuleQualityChecks(latestState.proposalModuleQualityChecks),
        [moduleKey]: summarizeModuleQuality(report),
      };
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: `${moduleDefinition.label}质量检查已完成`,
        finished_at: now(),
      };
      return saveState({
        activePanel: panel,
        profile,
        inputs: { ...latestState.inputs, [panel]: input },
        proposalModuleQualityChecks: qualityChecks,
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      const message = isModelOverloadedError(error)
        ? '模型服务当前内存繁忙，已停止本次模块质量检查。请稍后重试，或先减少撰写依据/材料长度后再检测。'
        : error?.message || `${moduleDefinition.label}质量检查失败`;
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message,
        finished_at: now(),
      };
      saveState({ activePanel: panel, profile, task: failedTask });
      throw new Error(message);
    }
  }

  async function generateQualityReview(payload = {}) {
    if (activeTask) {
      throw new Error('课题申报任务正在生成中，请稍后再试');
    }
    ensureTextModelReady(configStore, '生成八维检测报告');

    const panel = 'review-defense';
    const currentState = saveWorkspace({ ...payload, panel });
    const profile = normalizeProfile(payload.profile || currentState.profile);
    const input = normalizePanelInput(payload.input || currentState.inputs[panel]);
    const prompt = createQualityReviewPrompt(profile, input, currentState);
    const task = {
      id: `grant-application-quality-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 10,
      message: '正在准备八维检测任务',
      started_at: now(),
    };

    activeTask = task;
    saveState({ activePanel: panel, profile, inputs: { ...currentState.inputs, [panel]: input }, task });
    const stopProgress = startProgressPulse(task.id);

    try {
      saveTaskProgress(task.id, 16, '正在请求文本模型生成检测报告');
      const output = await aiService.chat({
        messages: [
          { role: 'system', content: '你是严谨、审慎、材料优先的中文科研课题评审专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        logTitle: '课题申报-八维检测',
      });
      stopProgress();
      activeTask = null;
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '八维检测报告已生成',
        finished_at: now(),
      };
      return saveState({
        activePanel: panel,
        profile,
        inputs: { ...loadState().inputs, [panel]: input },
        reviewDefenseReport: String(output || '').trim(),
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '八维检测生成失败',
        finished_at: now(),
      };
      saveState({ activePanel: panel, profile, task: failedTask });
      throw error;
    }
  }

  async function generateProposalFinalReview(payload = {}) {
    if (activeTask) {
      throw new Error('课题申报任务正在生成中，请稍后再试');
    }
    ensureTextModelReady(configStore, '检查申报书终稿');

    const panel = 'proposal';
    const currentState = saveWorkspace({ ...payload, panel });
    const profile = normalizeProfile(payload.profile || currentState.profile);
    const input = normalizePanelInput(payload.input || currentState.inputs[panel]);
    const prompt = createProposalFinalReviewPrompt(profile, input, currentState);
    const task = {
      id: `grant-application-proposal-final-review-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 10,
      message: '正在准备整稿质量检查',
      started_at: now(),
    };

    activeTask = task;
    saveState({ activePanel: panel, profile, inputs: { ...currentState.inputs, [panel]: input }, task });
    const stopProgress = startProgressPulse(task.id);

    try {
      saveTaskProgress(task.id, 16, '正在请求文本模型检查申报书终稿');
      const report = await aiService.chat({
        messages: [
          { role: 'system', content: '你是严谨、审慎、材料优先的中文科研课题申报终稿评审专家。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.25,
        logTitle: '课题申报-整稿质量检查',
      });
      stopProgress();
      activeTask = null;
      const latestState = loadState();
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '整稿质量检查已完成',
        finished_at: now(),
      };
      return saveState({
        activePanel: panel,
        profile,
        inputs: { ...latestState.inputs, [panel]: input },
        proposalFinalReview: summarizeFinalReview(report),
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '整稿质量检查失败',
        finished_at: now(),
      };
      saveState({ activePanel: panel, profile, task: failedTask });
      throw error;
    }
  }

  async function importMaterial(payload = {}) {
    const currentState = loadState();
    const panel = normalizePanel(payload.panel || currentState.activePanel);
    const config = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
    const provider = config.file_parser?.provider || 'local';
    const result = await dialog.showOpenDialog({
      title: '选择课题申报材料',
      properties: ['openFile'],
      filters: [
        { name: '课题申报材料', extensions: ['docx', 'doc', 'pdf', 'md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择', state: loadState() };
    }

    const filePath = result.filePaths[0];
    const parser = resolveFileParser(config, filePath);
    let markdown = '';
    try {
      markdown = (await parseDocumentWithConfig(app, filePath, config, {
        assetScope: 'grant-application',
        preserveImages: false,
      })).trim();
    } catch (error) {
      return {
        success: false,
        message: error?.message || '当前解析方式不支持该文件格式',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
      };
    }

    if (!markdown) {
      return {
        success: false,
        message: '未提取到有效文本内容，请检查文件内容',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
      };
    }

    const currentInput = normalizePanelInput(currentState.inputs[panel]);
    const nextMaterial = [
      currentInput.materialText,
      `## 导入材料：${path.basename(filePath)}`,
      markdown,
    ].filter((item) => String(item || '').trim()).join('\n\n');
    const nextState = saveState({
      activePanel: panel,
      inputs: {
        ...currentState.inputs,
        [panel]: {
          ...currentInput,
          materialText: nextMaterial,
        },
      },
    });

    return {
      success: true,
      message: parser.fallbackToLocal ? '材料已导入，当前格式已自动使用本地解析' : '材料已导入',
      fileName: path.basename(filePath),
      parserProvider: parser.provider || provider,
      state: nextState,
    };
  }

  async function exportWorkspaceJson() {
    const state = loadState();
    const exportPayload = {
      schema: 'yibiao-grant-application-workspace',
      version: 1,
      exported_at: now(),
      state,
    };
    const profile = normalizeProfile(state.profile);
    const defaultName = `${sanitizeFilename(profile.direction || profile.level || '课题申报')}-工作区备份.json`;
    const result = await dialog.showSaveDialog({
      title: '导出课题申报工作区 JSON',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    fs.writeFileSync(result.filePath, JSON.stringify(exportPayload, null, 2), 'utf-8');
    return { success: true, filePath: result.filePath, message: '工作区 JSON 已导出', state };
  }

  async function exportFormFields() {
    const state = loadState();
    const profile = normalizeProfile(state.profile);
    const content = buildFormFieldsText(state);
    const defaultName = `${sanitizeFilename(profile.direction || profile.level || '课题申报')}-申报系统字段摘要.md`;
    const result = await dialog.showSaveDialog({
      title: '导出申报系统字段摘要',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [
        { name: 'Markdown 文件', extensions: ['md'] },
        { name: '文本文件', extensions: ['txt'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath, message: '申报系统字段摘要已导出', state };
  }

  function getFormFields() {
    const state = loadState();
    return { success: true, mapping: buildFormFieldMapping(state), state };
  }

  async function importProposalTemplate() {
    const currentState = loadState();
    const config = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
    const provider = config.file_parser?.provider || 'local';
    const result = await dialog.showOpenDialog({
      title: '选择课题申报模板',
      properties: ['openFile'],
      filters: [
        { name: '课题申报模板', extensions: ['docx', 'doc', 'pdf', 'md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择', state: loadState() };
    }

    const filePath = result.filePaths[0];
    const parser = resolveFileParser(config, filePath);
    let markdown = '';
    try {
      markdown = (await parseDocumentWithConfig(app, filePath, config, {
        assetScope: 'grant-application-template',
        preserveImages: false,
      })).trim();
    } catch (error) {
      return {
        success: false,
        message: error?.message || '当前解析方式不支持该模板格式',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
      };
    }

    if (!markdown) {
      return {
        success: false,
        message: '未提取到有效模板内容，请检查文件内容',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
      };
    }

    const mapping = {
      ...buildTemplateMappingFromMarkdown(path.basename(filePath), markdown, currentState),
      sourceFilePath: filePath,
    };
    const nextState = saveState({
      activePanel: 'proposal',
      proposalTemplateMapping: mapping,
    });

    return {
      success: true,
      message: parser.fallbackToLocal ? '模板已导入，当前格式已自动使用本地解析' : '模板已导入',
      fileName: path.basename(filePath),
      parserProvider: parser.provider || provider,
      mapping,
      state: nextState,
    };
  }

  async function exportFilledProposalTemplate() {
    const state = loadState();
    const mapping = normalizeProposalTemplateMapping(state.proposalTemplateMapping);
    const sourceFilePath = mapping.sourceFilePath;
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      throw new Error('请先导入可访问的 Word 申报模板');
    }
    if (path.extname(sourceFilePath).toLowerCase() !== '.docx') {
      throw new Error('模板原位填充当前仅支持 .docx。请将 .doc/.pdf 模板另存为 .docx 后再导入。');
    }
    if (!mapping.sections.length) {
      throw new Error('模板栏目为空，请重新导入申报模板');
    }

    const profile = normalizeProfile(state.profile);
    const defaultName = `${sanitizeFilename(profile.direction || profile.level || '课题申报')}-原位填充申报表.docx`;
    const result = await dialog.showSaveDialog({
      title: '导出原位填充申报表',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    const zip = new AdmZip(sourceFilePath);
    const documentEntry = zip.getEntry('word/document.xml');
    if (!documentEntry) {
      throw new Error('模板文件缺少 word/document.xml，无法填充');
    }
    const documentXml = documentEntry.getData().toString('utf-8');
    const filled = fillDocxTemplateDocumentXml(documentXml, mapping);
    zip.updateFile('word/document.xml', Buffer.from(filled.documentXml, 'utf-8'));
    zip.writeZip(result.filePath);

    const report = normalizeProposalTemplateFillReport({
      ...filled.report,
      filePath: result.filePath,
    });
    const nextState = saveState({
      activePanel: 'proposal',
      proposalTemplateFillReport: report,
    });

    return {
      success: true,
      filePath: result.filePath,
      message: `原位填充申报表已导出，成功写入 ${report.filled}/${report.total} 个栏目`,
      report,
      state: nextState,
    };
  }

  function clear() {
    activeTask = null;
    const projectId = getActiveProjectId();
    if (fs.existsSync(projectDir(projectId))) {
      fs.rmSync(projectDir(projectId), { recursive: true, force: true });
    }
    const registry = ensureRegistry();
    const project = registry.projects.find((item) => item.id === projectId);
    const state = saveState({ ...initialState, projectId, projectName: project?.name || '默认课题' });
    return { success: true, state };
  }

  return {
    loadState,
    listProjects,
    createProject,
    switchProject,
    renameProject,
    deleteProject,
    saveWorkspace,
    saveOutput,
    importMaterial,
    exportWorkspaceJson,
    exportFormFields,
    getFormFields,
    importProposalTemplate,
    exportFilledProposalTemplate,
    generate,
    generateProposalModule,
    saveProposalModule,
    saveProposalVisualSettings,
    polishProposalModule,
    combineProposalModules,
    generateProposalModuleQualityCheck,
    generateProposalFinalReview,
    generateQualityReview,
    clear,
    subscribe,
  };
}

module.exports = {
  createGrantApplicationService,
};
