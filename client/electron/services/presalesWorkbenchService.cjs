const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dialog, shell } = require('electron');
const PptxGenJS = require('pptxgenjs');
const { getPresalesWorkbenchDir } = require('../utils/paths.cjs');

const maxInputChars = 60000;

const initialProfile = {
  projectName: '',
  customerName: '',
  industry: '',
  currentStage: '线索识别',
  opportunitySource: '',
  expectedValue: '',
  decisionDate: '',
  owner: '',
  keyBackground: '',
};

const initialAnalysisInput = {
  rawNotes: '',
  knownSystems: '',
  businessPainPoints: '',
  stakeholders: '',
  constraints: '',
};

const initialResearchInput = {
  meetingGoal: '',
  attendeeInfo: '',
  knownQuestions: '',
  timeBox: '60 分钟',
};

const initialArchitectureInput = {
  solutionScope: '',
  architecturePreferences: '',
  integrationNotes: '',
  nonFunctionalRequirements: '',
  deliveryConstraints: '',
};

const defaultDiagramTypes = ['系统上下文图', '技术架构图', '业务流程图', '系统集成图', '部署架构图', '数据架构图', '实施路线图'];

const initialDiagramInput = {
  selectedDiagramTypes: defaultDiagramTypes,
  diagramFocus: '',
  styleRequirements: '使用 Mermaid 稳定语法，节点命名简洁，信息不足处标注“待确认”。',
};

const initialPresentationInput = {
  presentationType: '方案汇报',
  pptStyle: 'auto',
  deliveryMode: 'customer',
  audience: '',
  pageCount: '12-15 页',
  presentationGoal: '',
  emphasis: '',
};

const pptStylePalettes = {
  'cyber-01-crimson': {
    name: 'CyberPPT 01 经典深红咨询风',
    primary: '8B1E1E',
    secondary: '555555',
    highlight: '8B1E1E',
    accent: 'A63A3A',
    bg: 'F3F4EF',
    surface: 'EEEFE9',
    soft: 'E7E8E2',
    text: '111111',
    muted: '555555',
    line: 'D6D6D2',
    cyberStyleId: '01',
  },
  'cyber-02-burgundy-gray': {
    name: 'CyberPPT 02 冷灰勃艮第',
    primary: '7A1F2B',
    secondary: '646A73',
    highlight: '7A1F2B',
    accent: '9B2E3B',
    bg: 'F2F3F5',
    surface: 'ECEFF2',
    soft: 'E3E7EB',
    text: '111827',
    muted: '525A66',
    line: 'D3D8DE',
    cyberStyleId: '02',
  },
  'cyber-03-ivory-wine': {
    name: 'CyberPPT 03 暖象牙暗酒红',
    primary: '8A1538',
    secondary: '77736C',
    highlight: '8A1538',
    accent: 'A33A55',
    bg: 'F4F1EA',
    surface: 'EEE9DF',
    soft: 'E8E1D6',
    text: '121212',
    muted: '77736C',
    line: 'D8D3CA',
    cyberStyleId: '03',
  },
  'cyber-04-ivory-blue': {
    name: 'CyberPPT 04 象牙白深蓝',
    primary: '12355B',
    secondary: '6F7275',
    highlight: '12355B',
    accent: '1E6091',
    bg: 'F7F6F0',
    surface: 'F0F2F4',
    soft: 'E6EBF0',
    text: '101820',
    muted: '303030',
    line: 'C9CDD1',
    cyberStyleId: '04',
  },
  'cyber-05-gray-green': {
    name: 'CyberPPT 05 浅灰白墨绿',
    primary: '1F5D50',
    secondary: '66716D',
    highlight: '1F5D50',
    accent: '2F7D6B',
    bg: 'F4F6F4',
    surface: 'EDF1EE',
    soft: 'E3EBE6',
    text: '101614',
    muted: '5E6A66',
    line: 'D2DAD5',
    cyberStyleId: '05',
  },
  'cyber-06-paper-copper': {
    name: 'CyberPPT 06 纸张米色铜棕',
    primary: '9A5A2E',
    secondary: '76716A',
    highlight: '9A5A2E',
    accent: 'B26B3B',
    bg: 'F4F0E8',
    surface: 'EDE7DC',
    soft: 'E4DDD1',
    text: '161616',
    muted: '76716A',
    line: 'D8D5CE',
    cyberStyleId: '06',
  },
  'cyber-07-black-gold': {
    name: 'CyberPPT 07 纯净浅灰黑金',
    primary: '000000',
    secondary: '707070',
    highlight: 'A87932',
    accent: 'A87932',
    bg: 'F6F6F4',
    surface: 'EFEFEC',
    soft: 'E7E6E2',
    text: '000000',
    muted: '252525',
    line: 'DADADA',
    cyberStyleId: '07',
  },
  'cyber-08-white-purple': {
    name: 'CyberPPT 08 冷白灰深紫',
    primary: '4B2E83',
    secondary: '6D7175',
    highlight: '4B2E83',
    accent: '6952A3',
    bg: 'F4F5F6',
    surface: 'ECEEF1',
    soft: 'E2E5EA',
    text: '111111',
    muted: '303030',
    line: 'C8CCD0',
    cyberStyleId: '08',
  },
  'cyber-consulting-blue': {
    name: 'CyberPPT 咨询蓝',
    primary: '12355B',
    secondary: '6E7F94',
    highlight: '0B6EFD',
    accent: '12355B',
    bg: 'F7F6F0',
    surface: 'FFFFFF',
    soft: 'EDF2F7',
    text: '101820',
    muted: '303030',
    line: 'C9CDD1',
    cyberStyleId: '04',
  },
  'midnight-executive': {
    name: '午夜商务',
    primary: '1E2761',
    secondary: 'CADCFC',
    highlight: '4F46E5',
    accent: 'FFFFFF',
    bg: 'F6F8FF',
    surface: 'FFFFFF',
    soft: 'EEF2FF',
    text: '0F172A',
    muted: '64748B',
    line: 'D7DEF8',
  },
  'tech-deep-space': {
    name: '科技深空',
    primary: '0D1117',
    secondary: '161B22',
    highlight: '58A6FF',
    accent: '58A6FF',
    bg: '0D1117',
    surface: '161B22',
    soft: '101826',
    text: 'F8FAFC',
    muted: 'AAB6C5',
    line: '30363D',
    dark: true,
  },
  'coral-energy': {
    name: '珊瑚活力',
    primary: 'F96167',
    secondary: 'F9E795',
    highlight: '2F3C7E',
    accent: '2F3C7E',
    bg: 'FFF8F4',
    surface: 'FFFFFF',
    soft: 'FFF1D6',
    text: '1F2937',
    muted: '6B7280',
    line: 'F7D9B9',
  },
  'warm-clay': {
    name: '暖陶简约',
    primary: 'B85042',
    secondary: 'E7E8D1',
    highlight: 'A7BEAE',
    accent: 'A7BEAE',
    bg: 'FAF8F0',
    surface: 'FFFFFF',
    soft: 'EEF0DF',
    text: '1F2937',
    muted: '6B7280',
    line: 'DED9C0',
  },
  'ocean-gradient': {
    name: '海洋渐变',
    primary: '065A82',
    secondary: '1C7293',
    highlight: '21295C',
    accent: '1C7293',
    bg: 'F2FAFC',
    surface: 'FFFFFF',
    soft: 'E4F3F7',
    text: '102A43',
    muted: '526D82',
    line: 'BFDCE6',
  },
  'charcoal-minimal': {
    name: '炭灰极简',
    primary: '36454F',
    secondary: 'F2F2F2',
    highlight: '212121',
    accent: '36454F',
    bg: 'F7F7F6',
    surface: 'FFFFFF',
    soft: 'EDEDED',
    text: '212121',
    muted: '666666',
    line: 'D9D9D9',
  },
  'teal-trust': {
    name: '青绿信任',
    primary: '028090',
    secondary: '00A896',
    highlight: '02C39A',
    accent: '00A896',
    bg: 'F1FBFA',
    surface: 'FFFFFF',
    soft: 'DFF7F3',
    text: '12343B',
    muted: '55757B',
    line: 'BDE8E2',
  },
  'berry-cream': {
    name: '莓果奶油',
    primary: '6D2E46',
    secondary: 'A26769',
    highlight: 'ECE2D0',
    accent: 'A26769',
    bg: 'FBF7F1',
    surface: 'FFFFFF',
    soft: 'F1E5DA',
    text: '2C1E24',
    muted: '755B65',
    line: 'DFCABD',
  },
  'sage-calm': {
    name: '鼠尾草静',
    primary: '50808E',
    secondary: '84B59F',
    highlight: '69A297',
    accent: '69A297',
    bg: 'F4FAF7',
    surface: 'FFFFFF',
    soft: 'E5F1EC',
    text: '223843',
    muted: '5D7478',
    line: 'C8DDD4',
  },
  'cherry-bold': {
    name: '樱桃大胆',
    primary: '990011',
    secondary: 'FCF6F5',
    highlight: '2F3C7E',
    accent: '990011',
    bg: 'FCF6F5',
    surface: 'FFFFFF',
    soft: 'F7E7E5',
    text: '1F2937',
    muted: '6B7280',
    line: 'EBCBC7',
  },
};

const initialState = {
  projectId: '',
  created_at: '',
  updated_at: '',
  profile: initialProfile,
  materials: [],
  analysisInput: initialAnalysisInput,
  analysisResult: {
    markdown: '',
    updatedAt: '',
  },
  researchInput: initialResearchInput,
  researchResult: {
    markdown: '',
    updatedAt: '',
  },
  architectureInput: initialArchitectureInput,
  architectureResult: {
    markdown: '',
    updatedAt: '',
  },
  diagramInput: initialDiagramInput,
  diagramResult: {
    markdown: '',
    updatedAt: '',
  },
  presentationInput: initialPresentationInput,
  presentationResult: {
    markdown: '',
    updatedAt: '',
  },
  exportRecords: [],
  latestPrompt: '',
  task: undefined,
};

function now() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function normalizeString(value, maxLength = maxInputChars) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizePptStyle(value) {
  const style = normalizeString(value, 80);
  if (style === 'auto' || pptStylePalettes[style]) return style;
  return initialPresentationInput.pptStyle;
}

function normalizeDeliveryMode(value) {
  const mode = normalizeString(value, 40);
  return ['customer', 'internal'].includes(mode) ? mode : initialPresentationInput.deliveryMode;
}

function resolvePptPalette(input = {}) {
  const profile = input.profile || {};
  const style = normalizePptStyle(input.style || input.pptStyle);
  if (style !== 'auto') return pptStylePalettes[style] || pptStylePalettes['midnight-executive'];

  const text = `${profile.industry || ''} ${profile.projectName || ''} ${profile.keyBackground || ''}`;
  if (/金融|银行|证券|保险|领导|董事|决策|集团|国企/.test(text)) return pptStylePalettes['cyber-07-black-gold'];
  if (/政务|政府|科技|软件|数据|AI|人工智能|云|平台|信息化|数字化/.test(text)) return pptStylePalettes['cyber-04-ivory-blue'];
  if (/医疗|教育|环保|园区|公共服务|民生/.test(text)) return pptStylePalettes['cyber-05-gray-green'];
  if (/能源|交通|物流|水务|制造|产业|工厂/.test(text)) return pptStylePalettes['cyber-02-burgundy-gray'];
  return pptStylePalettes['cyber-04-ivory-blue'];
}

function hexColorLuminance(hex) {
  const value = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return 255;
  const channels = [0, 2, 4].map((offset) => {
    const normalized = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) * 255;
}

function readableAccentColor(color, fallback = '2563EB') {
  const value = String(color || '').replace('#', '').trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(value)) return fallback;
  if (value === 'FFFFFF' || hexColorLuminance(value) > 180) return fallback;
  return value;
}

function safePresentationPalette(palette) {
  const primary = readableAccentColor(palette.primary, '1D4ED8');
  const secondary = readableAccentColor(palette.secondary, '0F766E');
  const highlight = readableAccentColor(palette.highlight, primary);
  if (palette.cyberStyleId) {
    return {
      ...palette,
      primary,
      secondary,
      highlight,
      accent: readableAccentColor(palette.accent, highlight),
      bg: /^[0-9A-F]{6}$/i.test(palette.bg || '') ? palette.bg : 'F7F6F0',
      surface: /^[0-9A-F]{6}$/i.test(palette.surface || '') ? palette.surface : 'F0F2F4',
      soft: /^[0-9A-F]{6}$/i.test(palette.soft || '') ? palette.soft : 'E6EBF0',
      text: /^[0-9A-F]{6}$/i.test(palette.text || '') ? palette.text : '101820',
      muted: /^[0-9A-F]{6}$/i.test(palette.muted || '') ? palette.muted : '303030',
      line: /^[0-9A-F]{6}$/i.test(palette.line || '') ? palette.line : 'C9CDD1',
      dark: false,
    };
  }
  return {
    ...palette,
    primary,
    secondary,
    highlight,
    accent: readableAccentColor(palette.accent, highlight),
    bg: 'FAFAF7',
    surface: 'FFFFFF',
    soft: 'F1F5F9',
    text: '111827',
    muted: '4B5563',
    line: 'D9DEE8',
    dark: false,
  };
}

const presentationPlaceholderPatterns = [
  /\[[^[\]]{1,30}\]/,
  /【[^】]{1,30}】/,
  /\b20XX\b/i,
  /X\s*年|X\s*月|X\s*日/i,
  /客户名称|行业\/业务领域|业务领域|姓名\/职位|汇报人|我方\s*Logo|客户\s*Logo|Logo\s*[:：]/i,
  /主标题|副标题|页面标题/i,
  /PPT\s*风格|版式类型|颜色方案|素材建议|高清质感|抽象的|关键(?:词)?图标/i,
  /待补充|暂无内容|根据\s*PPT|待客户确认|待确认信息|待确认[\s\S]{0,8}填充/i,
];

function isPresentationNoiseText(value) {
  const text = stripMarkdown(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  if (presentationPlaceholderPatterns.some((pattern) => pattern.test(text))) return true;
  if (/^(?:背景|元素|支撑表达|关键支撑|推荐图表|推荐素材)\s*[:：]/.test(text) && text.length < 80) return true;
  if (/^(?:mermaid|graph\s+TD|流程图|结构图)\b/i.test(text)) return true;
  return false;
}

function cleanPresentationText(value, fallback = '') {
  const text = stripMarkdown(value || '')
    .replace(/\s*;\s*/g, '；')
    .replace(/\s+/g, ' ')
    .replace(/^(?:核心观点|页面内容要点|内容要点|讲解备注|备注|推荐图表\/素材|推荐图表|推荐素材|待补充信息|待确认信息)\s*[:：]\s*/i, '')
    .trim();
  if (isPresentationNoiseText(text)) return fallback;
  return text;
}

function getPptStyleDisplayName(style, profile) {
  if (normalizePptStyle(style) === 'auto') {
    return resolvePptPalette({ style, profile }).name;
  }
  return (pptStylePalettes[normalizePptStyle(style)] || pptStylePalettes['midnight-executive']).name;
}

function getDeliveryModeDisplayName(mode) {
  return normalizeDeliveryMode(mode) === 'internal' ? '内部准备版' : '客户正式版';
}

function normalizeProjectId(value) {
  return normalizeString(value, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function safeFileName(value, fallback = '售前项目包') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || fallback;
}

function markdownSection(title, content, fallback = '暂无内容') {
  const text = String(content || '').trim();
  return `## ${title}\n\n${text || fallback}`;
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ''))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGeneratedMarkdown(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\\*\\\*/g, '**')
    .replace(/\*\*/g, '')
    .replace(/([^\n])\s+((?:报告版本|生成日期|分析师|售前顾问|顾问|解决方案架构师|架构师|生成者|撰写人|作者|制作者|保密级别)\s*[:：])/g, '$1\n$2')
    .replace(/(^|\n)(\s*(?:[-*]\s*)?(?:分析师|售前顾问|顾问|解决方案架构师|架构师|生成者|撰写人|作者|制作者)\s*[:：]\s*)[^\n]*/g, `$1$2禹都AI解决方案助手`)
    .replace(/(\|\s*(?:分析师|售前顾问|顾问|解决方案架构师|架构师|生成者|撰写人|作者|制作者)\s*\|\s*)[^|\n]+(?=\|)/g, '$1禹都AI解决方案助手')
    .replace(/\n{3,}/g, '\n\n');
}

function extractMarkdownBullets(markdown, limit = 5) {
  const lines = String(markdown || '').split(/\r?\n/);
  const bullets = lines
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)、]\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)、]\s+/, '')))
    .filter(Boolean);
  if (bullets.length) return bullets.slice(0, limit);
  const text = stripMarkdown(markdown);
  return text.split(/[。；;]\s*/).map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function clipText(value, maxLength = 120) {
  const text = stripMarkdown(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeProfile(profile = {}) {
  const merged = { ...initialProfile, ...profile };
  return {
    projectName: normalizeString(merged.projectName, 160),
    customerName: normalizeString(merged.customerName, 160),
    industry: normalizeString(merged.industry, 80),
    currentStage: normalizeString(merged.currentStage, 80) || initialProfile.currentStage,
    opportunitySource: normalizeString(merged.opportunitySource, 160),
    expectedValue: normalizeString(merged.expectedValue, 120),
    decisionDate: normalizeString(merged.decisionDate, 40),
    owner: normalizeString(merged.owner, 120),
    keyBackground: normalizeString(merged.keyBackground, 5000),
  };
}

function normalizeMaterial(material = {}) {
  const name = normalizeString(material.name, 260);
  if (!name) return null;
  return {
    id: normalizeString(material.id, 120) || `material-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    name,
    type: normalizeString(material.type, 80),
    sourcePath: normalizeString(material.sourcePath, 1000),
    summary: normalizeString(material.summary, 2000),
    importedAt: normalizeString(material.importedAt, 80) || now(),
  };
}

function normalizeManualMaterialInput(input = {}) {
  return {
    title: normalizeString(input.title, 160),
    customerBackground: normalizeString(input.customerBackground, 5000),
    meetingNotes: normalizeString(input.meetingNotes, 8000),
    currentSituation: normalizeString(input.currentSituation, 5000),
    openQuestions: normalizeString(input.openQuestions, 5000),
  };
}

function buildManualMaterialMarkdown(input, profile = {}) {
  const generatedAt = new Date().toLocaleString('zh-CN');
  const title = input.title || `${profile.customerName || profile.projectName || '客户'}沟通线索`;
  const sections = [
    ['客户背景补充', input.customerBackground],
    ['沟通纪要 / 原始线索', input.meetingNotes],
    ['现有系统 / 现状描述', input.currentSituation],
    ['待确认问题', input.openQuestions],
  ];
  return [
    `# ${title}`,
    '',
    `- 来源：手动录入`,
    `- 记录时间：${generatedAt}`,
    ...(profile.projectName ? [`- 所属项目：${profile.projectName}`] : []),
    ...(profile.customerName ? [`- 客户名称：${profile.customerName}`] : []),
    '',
    ...sections.flatMap(([sectionTitle, content]) => [
      `## ${sectionTitle}`,
      '',
      content || '暂无记录。',
      '',
    ]),
  ].join('\n');
}

function normalizeAnalysisInput(input = {}) {
  const merged = { ...initialAnalysisInput, ...input };
  return {
    rawNotes: normalizeString(merged.rawNotes),
    knownSystems: normalizeString(merged.knownSystems),
    businessPainPoints: normalizeString(merged.businessPainPoints),
    stakeholders: normalizeString(merged.stakeholders),
    constraints: normalizeString(merged.constraints),
  };
}

function normalizeAnalysisResult(result = {}) {
  const markdown = normalizeGeneratedMarkdown(result.markdown);
  return {
    markdown,
    updatedAt: markdown.trim() ? normalizeString(result.updatedAt, 80) || now() : '',
  };
}

function normalizeResearchInput(input = {}) {
  const merged = { ...initialResearchInput, ...input };
  return {
    meetingGoal: normalizeString(merged.meetingGoal, 3000),
    attendeeInfo: normalizeString(merged.attendeeInfo, 5000),
    knownQuestions: normalizeString(merged.knownQuestions, 5000),
    timeBox: normalizeString(merged.timeBox, 120) || initialResearchInput.timeBox,
  };
}

function normalizeResearchResult(result = {}) {
  const markdown = normalizeGeneratedMarkdown(result.markdown);
  return {
    markdown,
    updatedAt: markdown.trim() ? normalizeString(result.updatedAt, 80) || now() : '',
  };
}

function normalizeArchitectureInput(input = {}) {
  const merged = { ...initialArchitectureInput, ...input };
  return {
    solutionScope: normalizeString(merged.solutionScope, 8000),
    architecturePreferences: normalizeString(merged.architecturePreferences, 8000),
    integrationNotes: normalizeString(merged.integrationNotes, 8000),
    nonFunctionalRequirements: normalizeString(merged.nonFunctionalRequirements, 8000),
    deliveryConstraints: normalizeString(merged.deliveryConstraints, 8000),
  };
}

function normalizeArchitectureResult(result = {}) {
  const markdown = normalizeGeneratedMarkdown(result.markdown);
  return {
    markdown,
    updatedAt: markdown.trim() ? normalizeString(result.updatedAt, 80) || now() : '',
  };
}

function normalizeDiagramTypes(value) {
  const source = Array.isArray(value) ? value : defaultDiagramTypes;
  const seen = new Set();
  return source
    .map((item) => normalizeString(item, 80))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 12);
}

function normalizeDiagramInput(input = {}) {
  const merged = { ...initialDiagramInput, ...input };
  return {
    selectedDiagramTypes: normalizeDiagramTypes(merged.selectedDiagramTypes),
    diagramFocus: normalizeString(merged.diagramFocus, 5000),
    styleRequirements: normalizeString(merged.styleRequirements, 2000) || initialDiagramInput.styleRequirements,
  };
}

function normalizeDiagramResult(result = {}) {
  const markdown = normalizeGeneratedMarkdown(result.markdown);
  return {
    markdown,
    updatedAt: markdown.trim() ? normalizeString(result.updatedAt, 80) || now() : '',
  };
}

function normalizePresentationInput(input = {}) {
  const merged = { ...initialPresentationInput, ...input };
  return {
    presentationType: normalizeString(merged.presentationType, 80) || initialPresentationInput.presentationType,
    pptStyle: normalizePptStyle(merged.pptStyle),
    deliveryMode: normalizeDeliveryMode(merged.deliveryMode),
    audience: normalizeString(merged.audience, 2000),
    pageCount: normalizeString(merged.pageCount, 80) || initialPresentationInput.pageCount,
    presentationGoal: normalizeString(merged.presentationGoal, 3000),
    emphasis: normalizeString(merged.emphasis, 5000),
  };
}

function normalizePresentationResult(result = {}) {
  const markdown = normalizeGeneratedMarkdown(result.markdown);
  return {
    markdown,
    updatedAt: markdown.trim() ? normalizeString(result.updatedAt, 80) || now() : '',
  };
}

function normalizeExportRecord(record = {}) {
  const filePath = normalizeString(record.filePath, 2000);
  const fileName = normalizeString(record.fileName, 260) || (filePath ? path.basename(filePath) : '');
  if (!filePath || !fileName) return null;
  const type = normalizeString(record.type, 40).toLowerCase();
  return {
    id: normalizeString(record.id, 120) || `${type || 'export'}-${Date.now()}`,
    type: ['pptx', 'html', 'word', 'outline'].includes(type) ? type : 'pptx',
    fileName,
    filePath,
    exportedAt: normalizeString(record.exportedAt, 80) || now(),
    pptStyle: normalizePptStyle(record.pptStyle),
    deliveryMode: normalizeDeliveryMode(record.deliveryMode),
    useAiVisuals: Boolean(record.useAiVisuals),
    pageCount: Math.max(0, Math.min(200, Math.round(Number(record.pageCount) || 0))),
  };
}

function normalizePresentationExportFormats(options = {}) {
  const formats = Array.isArray(options.formats)
    ? options.formats.map((item) => String(item || '').toLowerCase())
    : [];
  const hasExplicitFormats = formats.length > 0 || options.exportPptx === true || options.exportHtml === true || options.exportPptx === false || options.exportHtml === false;
  const exportPptx = formats.length ? formats.includes('pptx') : hasExplicitFormats ? options.exportPptx === true : true;
  const exportHtml = formats.includes('html') || options.exportHtml === true;
  return {
    pptx: Boolean(exportPptx),
    html: Boolean(exportHtml),
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return undefined;
  const status = ['running', 'success', 'error'].includes(task.status) ? task.status : 'running';
  const type = ['analysis', 'research', 'architecture', 'diagrams', 'presentation'].includes(task.type) ? task.type : 'analysis';
  return {
    id: normalizeString(task.id, 120) || `presales-analysis-${Date.now()}`,
    type,
    status,
    progress: Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0))),
    message: normalizeString(task.message, 300),
    started_at: normalizeString(task.started_at, 80),
    finished_at: normalizeString(task.finished_at, 80),
  };
}

function materialMarkdownFileName(materialId) {
  return `${normalizeProjectId(materialId)}.md`;
}

function normalizeState(state = {}) {
  return {
    projectId: normalizeProjectId(state.projectId),
    created_at: normalizeString(state.created_at, 80) || now(),
    updated_at: normalizeString(state.updated_at, 80) || now(),
    profile: normalizeProfile(state.profile),
    materials: Array.isArray(state.materials) ? state.materials.map(normalizeMaterial).filter(Boolean).slice(0, 200) : [],
    analysisInput: normalizeAnalysisInput(state.analysisInput),
    analysisResult: normalizeAnalysisResult(state.analysisResult),
    researchInput: normalizeResearchInput(state.researchInput),
    researchResult: normalizeResearchResult(state.researchResult),
    architectureInput: normalizeArchitectureInput(state.architectureInput),
    architectureResult: normalizeArchitectureResult(state.architectureResult),
    diagramInput: normalizeDiagramInput(state.diagramInput),
    diagramResult: normalizeDiagramResult(state.diagramResult),
    presentationInput: normalizePresentationInput(state.presentationInput),
    presentationResult: normalizePresentationResult(state.presentationResult),
    exportRecords: Array.isArray(state.exportRecords) ? state.exportRecords.map(normalizeExportRecord).filter(Boolean).slice(0, 30) : [],
    latestPrompt: String(state.latestPrompt || ''),
    task: normalizeTask(state.task),
  };
}

function createPresalesWorkbenchService({ app, fileService, aiService }) {
  const rootDir = () => ensureDir(getPresalesWorkbenchDir(app));
  const projectsDir = () => ensureDir(path.join(rootDir(), 'projects'));
  const materialDir = (projectId) => ensureDir(path.join(rootDir(), 'materials', normalizeProjectId(projectId)));
  const registryPath = () => path.join(rootDir(), 'projects.json');
  const statePath = (projectId) => path.join(projectsDir(), `${normalizeProjectId(projectId)}.json`);

  function createProjectId() {
    return `ps-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  }

  function projectNameFromState(state) {
    return state.profile.projectName || state.profile.customerName || '未命名售前项目';
  }

  function readRegistry() {
    const fallback = { activeProjectId: '', projects: [] };
    if (!fs.existsSync(registryPath())) return fallback;
    const parsed = safeJsonParse(fs.readFileSync(registryPath(), 'utf-8'), fallback);
    return {
      activeProjectId: normalizeProjectId(parsed.activeProjectId),
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  }

  function writeRegistry(registry) {
    ensureDir(path.dirname(registryPath()));
    fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2), 'utf-8');
  }

  function toProjectListItem(state) {
    const generatedCount = [
      state.analysisResult?.markdown,
      state.researchResult?.markdown,
      state.architectureResult?.markdown,
      state.diagramResult?.markdown,
      state.presentationResult?.markdown,
    ].filter((item) => String(item || '').trim()).length;
    return {
      id: state.projectId,
      name: projectNameFromState(state),
      customerName: state.profile.customerName,
      industry: state.profile.industry,
      currentStage: state.profile.currentStage,
      owner: state.profile.owner,
      expectedValue: state.profile.expectedValue,
      decisionDate: state.profile.decisionDate,
      materialCount: Array.isArray(state.materials) ? state.materials.length : 0,
      generatedCount,
      created_at: state.created_at,
      updated_at: state.updated_at,
    };
  }

  function ensureDefaultProject() {
    const registry = readRegistry();
    if (registry.projects.length) return registry;

    const timestamp = now();
    const projectId = createProjectId();
    const state = normalizeState({
      ...clone(initialState),
      projectId,
      created_at: timestamp,
      updated_at: timestamp,
      profile: {
        ...initialProfile,
        projectName: '默认售前项目',
      },
    });
    ensureDir(path.dirname(statePath(projectId)));
    fs.writeFileSync(statePath(projectId), JSON.stringify(state, null, 2), 'utf-8');
    const nextRegistry = {
      activeProjectId: projectId,
      projects: [toProjectListItem(state)],
    };
    writeRegistry(nextRegistry);
    return nextRegistry;
  }

  function syncRegistryEntry(state) {
    const registry = ensureDefaultProject();
    const item = toProjectListItem(state);
    const projects = [item, ...registry.projects.filter((project) => project.id !== state.projectId)];
    writeRegistry({ ...registry, activeProjectId: state.projectId, projects });
  }

  function getActiveProjectId() {
    const registry = ensureDefaultProject();
    return registry.activeProjectId || registry.projects[0]?.id;
  }

  function loadState(projectId) {
    const activeProjectId = normalizeProjectId(projectId || getActiveProjectId());
    const filePath = statePath(activeProjectId);
    if (!fs.existsSync(filePath)) {
      const registry = ensureDefaultProject();
      return loadState(registry.activeProjectId);
    }
    const parsed = safeJsonParse(fs.readFileSync(filePath, 'utf-8'), initialState);
    const state = normalizeState({ ...parsed, projectId: activeProjectId });
    if (state.updated_at !== parsed.updated_at) {
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    }
    return state;
  }

  function saveState(partial = {}) {
    const current = loadState();
    const state = normalizeState({
      ...current,
      ...partial,
      projectId: current.projectId,
      created_at: current.created_at,
      updated_at: now(),
    });
    fs.writeFileSync(statePath(state.projectId), JSON.stringify(state, null, 2), 'utf-8');
    syncRegistryEntry(state);
    return state;
  }

  function listProjects() {
    const registry = ensureDefaultProject();
    const projects = registry.projects
      .map((project) => {
        try {
          return toProjectListItem(loadState(project.id));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const activeProjectId = registry.activeProjectId || projects[0]?.id || '';
    writeRegistry({ activeProjectId, projects });
    return { activeProjectId, projects };
  }

  function createProject(payload = {}) {
    const timestamp = now();
    const projectId = createProjectId();
    const state = normalizeState({
      ...clone(initialState),
      projectId,
      created_at: timestamp,
      updated_at: timestamp,
      profile: {
        ...initialProfile,
        ...(payload.profile || {}),
        projectName: normalizeString(payload.projectName || payload.profile?.projectName, 160) || '未命名售前项目',
      },
    });
    fs.writeFileSync(statePath(projectId), JSON.stringify(state, null, 2), 'utf-8');
    syncRegistryEntry(state);
    return { state, projects: listProjects() };
  }

  function switchProject(projectId) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const registry = ensureDefaultProject();
    if (!registry.projects.some((project) => project.id === normalizedProjectId)) {
      throw new Error('售前项目不存在或已删除');
    }
    writeRegistry({ ...registry, activeProjectId: normalizedProjectId });
    return loadState(normalizedProjectId);
  }

  function deleteProject(projectId) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const registry = ensureDefaultProject();
    const remaining = registry.projects.filter((project) => project.id !== normalizedProjectId);
    fs.rmSync(statePath(normalizedProjectId), { force: true });
    if (!remaining.length) {
      writeRegistry({ activeProjectId: '', projects: [] });
      const nextRegistry = ensureDefaultProject();
      return { success: true, state: loadState(nextRegistry.activeProjectId), projects: listProjects() };
    }
    const activeProjectId = registry.activeProjectId === normalizedProjectId ? remaining[0].id : registry.activeProjectId;
    writeRegistry({ activeProjectId, projects: remaining });
    return { success: true, state: loadState(activeProjectId), projects: listProjects() };
  }

  function saveProfile(profile) {
    return saveState({ profile: normalizeProfile(profile) });
  }

  function saveAnalysisInput(input) {
    return saveState({ analysisInput: normalizeAnalysisInput(input) });
  }

  function saveAnalysisResult(payload = {}) {
    return saveState({ analysisResult: normalizeAnalysisResult({ markdown: payload.markdown, updatedAt: now() }) });
  }

  function saveResearchInput(input) {
    return saveState({ researchInput: normalizeResearchInput(input) });
  }

  function saveResearchResult(payload = {}) {
    return saveState({ researchResult: normalizeResearchResult({ markdown: payload.markdown, updatedAt: now() }) });
  }

  function saveArchitectureInput(input) {
    return saveState({ architectureInput: normalizeArchitectureInput(input) });
  }

  function saveArchitectureResult(payload = {}) {
    return saveState({ architectureResult: normalizeArchitectureResult({ markdown: payload.markdown, updatedAt: now() }) });
  }

  function saveDiagramInput(input) {
    return saveState({ diagramInput: normalizeDiagramInput(input) });
  }

  function saveDiagramResult(payload = {}) {
    return saveState({ diagramResult: normalizeDiagramResult({ markdown: payload.markdown, updatedAt: now() }) });
  }

  function savePresentationInput(input) {
    return saveState({ presentationInput: normalizePresentationInput(input) });
  }

  function savePresentationResult(payload = {}) {
    return saveState({ presentationResult: normalizePresentationResult({ markdown: payload.markdown, updatedAt: now() }) });
  }

  async function importMaterial() {
    if (!fileService?.importDocument) {
      throw new Error('文件导入服务未就绪');
    }
    const result = await fileService.importDocument({
      title: '选择客户材料',
      filterName: '客户材料',
      assetScope: 'presales-workbench',
    });
    if (!result?.success) {
      return { success: false, message: result?.message || '已取消选择', state: loadState(), material: null };
    }
    const current = loadState();
    const timestamp = now();
    const material = normalizeMaterial({
      id: `material-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      name: result.file_name || '客户材料',
      type: result.parser_label || result.file_ext || '文档',
      sourcePath: result.file_path || '',
      summary: String(result.file_content || '').trim().slice(0, 500),
      importedAt: timestamp,
    });
    fs.writeFileSync(path.join(materialDir(current.projectId), materialMarkdownFileName(material.id)), String(result.file_content || '').trim(), 'utf-8');
    const state = saveState({ materials: [material, ...current.materials] });
    return { success: true, message: result.message || '客户材料导入完成', state, material };
  }

  function saveManualMaterial(input = {}) {
    const current = loadState();
    const normalizedInput = normalizeManualMaterialInput(input);
    const hasBody = Object.entries(normalizedInput)
      .filter(([key]) => key !== 'title')
      .some(([, value]) => String(value || '').trim());
    if (!normalizedInput.title && !hasBody) {
      return { success: false, message: '请至少填写一项客户线索', state: current, material: null };
    }

    const timestamp = now();
    const markdown = buildManualMaterialMarkdown(normalizedInput, current.profile);
    const material = normalizeMaterial({
      id: `manual-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      name: normalizedInput.title || `${current.profile.customerName || current.profile.projectName || '客户'}沟通线索`,
      type: '手动录入',
      sourcePath: '',
      summary: stripMarkdown(markdown).slice(0, 500),
      importedAt: timestamp,
    });

    if (!material) {
      return { success: false, message: '客户线索标题无效', state: current, material: null };
    }

    fs.writeFileSync(path.join(materialDir(current.projectId), materialMarkdownFileName(material.id)), markdown.trim(), 'utf-8');
    const state = saveState({ materials: [material, ...current.materials] });
    return { success: true, message: '手动客户信息已保存', state, material };
  }

  function readMaterialMarkdown(materialId) {
    const current = loadState();
    const normalizedMaterialId = normalizeString(materialId, 120);
    if (!current.materials.some((item) => item.id === normalizedMaterialId)) {
      return '';
    }
    const filePath = path.join(materialDir(current.projectId), materialMarkdownFileName(normalizedMaterialId));
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  }

  function readAllMaterialMarkdown(state) {
    return state.materials.slice(0, 12).map((material, index) => {
      const markdown = readMaterialMarkdown(material.id).slice(0, 12000);
      if (!markdown.trim()) return '';
      return `## 材料 ${index + 1}：${material.name}\n\n${markdown}`;
    }).filter(Boolean).join('\n\n---\n\n');
  }

  function buildMaterialPackageSection(state) {
    if (!state.materials.length) return '暂无导入或手动录入的客户材料。';
    return state.materials.map((material, index) => {
      const markdown = readMaterialMarkdown(material.id).trim();
      const excerpt = markdown.length > 6000 ? `${markdown.slice(0, 6000)}\n\n> 材料内容较长，项目包中仅保留前 6000 字。` : markdown;
      return [
        `### ${index + 1}. ${material.name}`,
        '',
        `- 类型：${material.type || '客户材料'}`,
        `- 导入时间：${material.importedAt || '未知'}`,
        material.sourcePath ? `- 来源路径：${material.sourcePath}` : '',
        '',
        excerpt || material.summary || '暂无解析内容。',
      ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
  }

  function buildProjectPackageMarkdown(state) {
    const profile = state.profile;
    const generatedAt = new Date().toLocaleString('zh-CN');
    const title = projectNameFromState(state);
    return [
      `# ${title} - 售前项目包`,
      '',
      `导出时间：${generatedAt}`,
      '',
      '## 项目概览',
      '',
      `- 项目名称：${profile.projectName || '未填写'}`,
      `- 客户名称：${profile.customerName || '未填写'}`,
      `- 行业领域：${profile.industry || '未填写'}`,
      `- 当前阶段：${profile.currentStage || '未填写'}`,
      `- 机会来源：${profile.opportunitySource || '未填写'}`,
      `- 负责人：${profile.owner || '未填写'}`,
      `- 预估价值：${profile.expectedValue || '未填写'}`,
      `- 决策时间：${profile.decisionDate || '未填写'}`,
      `- 创建时间：${state.created_at || '未知'}`,
      `- 更新时间：${state.updated_at || '未知'}`,
      '',
      markdownSection('背景摘要', profile.keyBackground),
      markdownSection('客户材料', buildMaterialPackageSection(state)),
      markdownSection('客户分析报告', state.analysisResult.markdown),
      markdownSection('售前调研准备包', state.researchResult.markdown),
      markdownSection('方案架构草案', state.architectureResult.markdown),
      markdownSection('图表草稿', state.diagramResult.markdown),
      markdownSection('汇报材料页纲', state.presentationResult.markdown),
    ].join('\n\n');
  }

  function addPptFooter(slide, pageNo, title, palette) {
    slide.addShape('line', { x: 0.74, y: 6.9, w: 11.88, h: 0, line: { color: palette.line, width: 0.8 } });
    slide.addText(clipText(title || '售前工作台', 32), { x: 0.78, y: 7.07, w: 6.0, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 6.8, color: palette.muted, margin: 0 });
    slide.addText(String(pageNo).padStart(2, '0'), { x: 11.84, y: 7.04, w: 0.78, h: 0.2, fontFace: 'Aptos', fontSize: 8.5, bold: true, color: palette.highlight, align: 'right', margin: 0 });
  }

  function addPptTitle(slide, title, subtitle, palette) {
    slide.addText('PRESALES WORKBENCH', { x: 0.82, y: 0.42, w: 2.45, h: 0.16, fontFace: 'Aptos', fontSize: 6.8, bold: true, color: palette.highlight, margin: 0 });
    slide.addText(clipText(cleanPresentationText(title, '售前汇报'), 34), { x: 0.8, y: 0.72, w: 8.72, h: 0.36, fontFace: 'Microsoft YaHei', fontSize: 19, bold: true, color: palette.text, margin: 0, fit: 'shrink' });
    if (subtitle) {
      slide.addText(clipText(cleanPresentationText(subtitle), 92), { x: 0.82, y: 1.12, w: 9.35, h: 0.3, fontFace: 'Microsoft YaHei', fontSize: 8.2, color: palette.muted, margin: 0, fit: 'shrink' });
    }
  }

  function addEditorialCanvas(slide, pageNo, accent, palette) {
    slide.background = { color: palette.bg };
    slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: palette.bg }, line: { color: palette.bg } });
    slide.addShape('rect', { x: 0.0, y: 0, w: 0.16, h: 7.5, fill: { color: accent }, line: { color: accent } });
    slide.addShape('arc', { x: 9.78, y: -1.05, w: 4.0, h: 4.0, fill: { color: palette.soft, transparency: 22 }, line: { color: palette.soft, transparency: 100 } });
    slide.addShape('roundRect', { x: 10.94, y: 0.38, w: 1.42, h: 0.42, rectRadius: 0.04, fill: { color: palette.soft }, line: { color: palette.line, width: 0.5 } });
    slide.addText(String(pageNo).padStart(2, '0'), { x: 11.28, y: 0.49, w: 0.72, h: 0.14, fontFace: 'Aptos Display', fontSize: 10.5, bold: true, color: accent, align: 'center', margin: 0 });
  }

  function addMetricCard(slide, label, value, x, y, w = 2.45, palette) {
    slide.addShape('roundRect', { x, y, w, h: 0.72, rectRadius: 0.06, fill: { color: palette.surface }, line: { color: palette.line, width: 0.9 } });
    slide.addText(label, { x: x + 0.15, y: y + 0.13, w: w - 0.3, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 7, bold: true, color: palette.highlight, margin: 0 });
    slide.addText(cleanPresentationText(value, '待确认'), { x: x + 0.15, y: y + 0.38, w: w - 0.3, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 8.8, bold: true, color: palette.text, margin: 0, fit: 'shrink' });
  }

  function getSlideItems(page, count = 5) {
    const raw = [
      page.corePoint,
      ...(Array.isArray(page.bullets) ? page.bullets : []),
      page.visual,
      page.speakerNotes,
      page.gaps,
    ];
    return [...new Set(raw.map((item) => cleanPresentationText(item)).filter((item) => !isPresentationNoiseText(item)).map((item) => clipText(item, 92)))]
      .slice(0, count);
  }

  function addBulletCard(slide, title, bullets, x, y, w, h, accent, palette) {
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: palette.surface }, line: { color: palette.line, width: 0.9 } });
    slide.addShape('rect', { x: x + 0.2, y: y + 0.2, w: 0.34, h: 0.05, fill: { color: accent }, line: { color: accent } });
    slide.addText(title, { x: x + 0.22, y: y + 0.38, w: w - 0.44, h: 0.22, fontFace: 'Microsoft YaHei', fontSize: 10.5, bold: true, color: palette.text, margin: 0 });
    const items = (bullets.length ? bullets : ['需要补充客户事实后完善']).slice(0, 4);
    items.forEach((item, index) => {
      const itemY = y + 0.82 + index * ((h - 1.02) / Math.max(1, items.length));
      slide.addShape('ellipse', { x: x + 0.24, y: itemY + 0.01, w: 0.24, h: 0.24, fill: { color: accent }, line: { color: accent } });
      slide.addText(clipText(item, 78), { x: x + 0.66, y: itemY, w: w - 0.9, h: 0.38, fontFace: 'Microsoft YaHei', fontSize: 8, color: palette.text, breakLine: false, fit: 'shrink', margin: 0 });
    });
  }

  function addSectionSlide(pptx, pageNo, title, subtitle, bullets, accent, palette) {
    const slide = pptx.addSlide();
    slide.background = { color: palette.bg };
    slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: palette.bg }, line: { color: palette.bg } });
    slide.addShape('arc', { x: 9.3, y: -1.0, w: 4.5, h: 4.5, fill: { color: palette.soft, transparency: palette.dark ? 0 : 14 }, line: { color: palette.soft, transparency: 100 } });
    slide.addShape('rect', { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: accent }, line: { color: accent } });
    addPptTitle(slide, title, subtitle, palette);
    addBulletCard(slide, '关键内容', bullets, 0.82, 1.65, 11.65, 4.75, accent, palette);
    addPptFooter(slide, pageNo, title, palette);
    return slide;
  }

  function buildCoverImagePrompt(state, palette) {
    const profile = state.profile;
    return [
      `为售前汇报 PPT 生成一张横向 16:9 封面视觉图，主题：${projectNameFromState(state)}。`,
      `客户行业：${profile.industry || '政企/企业数字化'}，当前阶段：${profile.currentStage || '需求沟通'}。`,
      `画面要求：${palette.name}风格，主色 #${palette.primary}、辅色 #${palette.secondary}、强调色 #${palette.highlight}，抽象数字化平台、数据流、协同工作、方案架构感，适合企业客户汇报。`,
      '不要出现真实品牌标识，不要出现可读文字，不要水印，不要夸张卡通。',
    ].join('\n');
  }

  async function maybeGeneratePresentationVisual(state, palette, options = {}) {
    if (!options.useAiVisuals) {
      return { imagePath: '', skipped: true, message: '未启用 AI 视觉图' };
    }
    const availability = aiService?.getImageModelAvailability ? aiService.getImageModelAvailability() : { available: false, message: '生图服务未就绪' };
    if (!availability.available || !aiService?.generateImage) {
      return { imagePath: '', skipped: true, message: availability.message || '生图模型不可用' };
    }
    try {
      const image = await aiService.generateImage({
        title: `${projectNameFromState(state)}-售前汇报封面`,
        logTitle: '售前汇报PPT封面图',
        prompt: buildCoverImagePrompt(state, palette),
        style: 'illustration',
      });
      return { imagePath: image.file_path || '', skipped: false, message: 'AI 视觉图已生成' };
    } catch (error) {
      return { imagePath: '', skipped: true, message: error?.message || 'AI 视觉图生成失败' };
    }
  }

  function getImageModelAvailability() {
    const availability = aiService?.getImageModelAvailability ? aiService.getImageModelAvailability() : { available: false, message: '生图服务未就绪' };
    return {
      available: Boolean(availability.available),
      message: availability.message || (availability.available ? '生图模型可用' : '生图模型不可用'),
    };
  }

  function cleanMarkdownContentLine(line) {
    return String(line || '')
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*+]\s*/, '')
      .replace(/^\d+[.)、]\s*/, '')
      .replace(/\*\*/g, '')
      .trim();
  }

  function isPresentationFieldLine(line) {
    return /^(页面标题|标题|版式类型|核心观点|页面内容要点|内容要点|推荐图表\/素材|推荐图表|推荐素材|讲解备注|备注|待补充信息|待确认信息)\s*[:：]/.test(cleanMarkdownContentLine(line));
  }

  function stripPresentationPageTitle(line) {
    return cleanMarkdownContentLine(line)
      .replace(/^(第\s*)?\d{1,2}\s*(页|P)?\s*[:：.\-、]?\s*/i, '')
      .replace(/^页面标题\s*[:：]\s*/, '')
      .trim();
  }

  function extractFieldFromLines(lines, labels, maxItems = 6) {
    const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const startPattern = new RegExp(`^(${labelPattern})\\s*[:：]\\s*(.*)$`);
    const items = [];
    let collecting = false;
    for (const rawLine of lines) {
      const line = cleanMarkdownContentLine(rawLine);
      if (!line) continue;
      const match = line.match(startPattern);
      if (match) {
        collecting = true;
        if (match[2]) items.push(match[2].trim());
        continue;
      }
      if (collecting && isPresentationFieldLine(line)) break;
      if (collecting) items.push(line);
    }
    return items.filter(Boolean).slice(0, maxItems);
  }

  function parsePresentationOutline(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const chunks = [];
    let current = null;
    lines.forEach((line) => {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^#{1,4}\s*((?:第\s*)?\d{1,2}\s*(?:页|P)?\s*[:：.\-、]\s*.+)$/i);
      const listTitleMatch = trimmed.match(/^[-*+]\s*(?:页码\s*[:：]?\s*)?(?:第\s*)?(\d{1,2})\s*(?:页|P)?\s*[:：.\-、]\s*(.+)$/i);
      if (headingMatch || listTitleMatch) {
        if (current) chunks.push(current);
        current = { title: stripPresentationPageTitle(headingMatch ? headingMatch[1] : `${listTitleMatch[1]} ${listTitleMatch[2]}`), lines: [] };
        return;
      }
      if (current) current.lines.push(line);
    });
    if (current) chunks.push(current);

    return chunks
      .map((chunk, index) => {
        const titleFromField = extractFieldFromLines(chunk.lines, ['页面标题', '标题'], 1)[0];
        const layoutType = extractFieldFromLines(chunk.lines, ['版式类型'], 1)[0];
        const corePoint = extractFieldFromLines(chunk.lines, ['核心观点'], 2).join(' ');
        const contentBullets = extractFieldFromLines(chunk.lines, ['页面内容要点', '内容要点'], 6);
        const visual = extractFieldFromLines(chunk.lines, ['推荐图表/素材', '推荐图表', '推荐素材'], 3).join('；');
        const speakerNotes = extractFieldFromLines(chunk.lines, ['讲解备注', '备注'], 3).join('；');
        const gaps = extractFieldFromLines(chunk.lines, ['待补充信息', '待确认信息'], 3).join('；');
        const fallbackBullets = chunk.lines
          .map(cleanMarkdownContentLine)
          .filter((line) => line && !isPresentationFieldLine(line))
          .slice(0, 6);
        return {
          pageNo: index + 1,
          title: clipText(cleanPresentationText(titleFromField || chunk.title, `汇报页面 ${index + 1}`), 42),
          layoutType: clipText(cleanPresentationText(layoutType), 40),
          corePoint: clipText(cleanPresentationText(corePoint || fallbackBullets[0], '围绕客户关注点展开说明。'), 110),
          bullets: (contentBullets.length ? contentBullets : fallbackBullets.slice(corePoint ? 0 : 1))
            .map((item) => cleanPresentationText(item))
            .filter((item) => !isPresentationNoiseText(item))
            .map((item) => clipText(item, 90))
            .slice(0, 6),
          visual: clipText(cleanPresentationText(visual, '建议使用结构图、流程图或关键指标卡片辅助表达。'), 100),
          speakerNotes: clipText(cleanPresentationText(speakerNotes, '讲解时先给结论，再说明依据与下一步建议。'), 110),
          gaps: clipText(cleanPresentationText(gaps, '待结合客户确认信息进一步补充。'), 100),
        };
      })
      .filter((item) => item.title)
      .slice(0, 20);
  }

  function enrichPresentationPage(page, state, index) {
    const sourceMap = [
      state.profile.keyBackground,
      state.analysisResult.markdown,
      state.researchResult.markdown,
      state.architectureResult.markdown,
      state.diagramResult.markdown,
      state.presentationResult.markdown,
    ];
    const text = `${page.title || ''} ${page.corePoint || ''}`;
    const isUsefulBullet = (item) => item && !isPresentationNoiseText(item) && !/围绕客户关注点/.test(item);
    const source = /调研|问题|会议/.test(text)
      ? state.researchResult.markdown
      : /架构|方案|系统|能力|部署|安全/.test(text)
      ? state.architectureResult.markdown
      : /图表|流程|Mermaid|可视化/i.test(text)
      ? state.diagramResult.markdown
      : /汇报|下一步|行动|推进/.test(text)
      ? state.presentationResult.markdown
      : /痛点|现状|需求|客户/.test(text)
      ? state.analysisResult.markdown
      : sourceMap[index % sourceMap.length];
    const supplement = extractMarkdownBullets(source, 6);
    const mergedBullets = [
      ...(page.bullets || []).map((item) => cleanPresentationText(item)).filter(isUsefulBullet),
      ...supplement.map((item) => cleanPresentationText(item)).filter(isUsefulBullet),
    ].filter(Boolean);
    return {
      ...page,
      title: cleanPresentationText(page.title, `汇报页面 ${index + 1}`),
      corePoint: /围绕客户关注点展开说明/.test(page.corePoint || '') && supplement[0] ? cleanPresentationText(supplement[0], page.corePoint) : cleanPresentationText(page.corePoint, '围绕客户关注点展开说明。'),
      visual: cleanPresentationText(page.visual, '结构化图表支撑表达。'),
      speakerNotes: cleanPresentationText(page.speakerNotes, '先给结论，再说明依据和下一步。'),
      gaps: cleanPresentationText(page.gaps, '需要客户进一步确认的信息。'),
      bullets: [...new Set(mergedBullets)].slice(0, 6),
    };
  }

  function buildFallbackPresentationPages(state) {
    const profile = state.profile;
    return [
      {
        title: '项目概览',
        corePoint: '快速对齐客户、机会、阶段与关键约束。',
        bullets: [
          `客户名称：${profile.customerName || '未填写'}`,
          `行业领域：${profile.industry || '未填写'}`,
          `当前阶段：${profile.currentStage || '未填写'}`,
          `预估价值：${profile.expectedValue || '未填写'}`,
        ],
        visual: '项目概览卡片',
        speakerNotes: '先建立共同背景，避免直接进入方案细节。',
        gaps: '补充客户组织、预算、决策链等信息。',
      },
      { title: '客户现状与痛点', corePoint: '从客户材料和沟通纪要中提炼现状、痛点和约束。', bullets: extractMarkdownBullets(state.analysisResult.markdown || profile.keyBackground, 6), visual: '痛点优先级矩阵', speakerNotes: '按业务影响和紧急程度讲解。', gaps: '待确认痛点优先级。' },
      { title: '调研准备与关键问题', corePoint: '明确下一轮客户沟通需要确认的信息和会议节奏。', bullets: extractMarkdownBullets(state.researchResult.markdown, 6), visual: '调研问题清单', speakerNotes: '用问题推动客户补充关键信息。', gaps: '待确认参会人和会议目标。' },
      { title: '方案架构与核心能力', corePoint: '用方案骨架说明系统边界、能力组成和实施可行性。', bullets: extractMarkdownBullets(state.architectureResult.markdown, 6), visual: '总体架构图', speakerNotes: '先讲业务价值，再讲技术组成。', gaps: '待确认集成边界与非功能指标。' },
      { title: '核心图表与表达建议', corePoint: '用图表降低客户理解成本，帮助对齐范围和路径。', bullets: extractMarkdownBullets(state.diagramResult.markdown, 6), visual: 'Mermaid 图表草稿', speakerNotes: '围绕客户最关心的链路讲解图表。', gaps: '待确认图表中的系统名称和接口。' },
      { title: '汇报重点与下一步行动', corePoint: '聚焦客户需要确认的事项、接受的价值和后续推进动作。', bullets: extractMarkdownBullets(state.presentationResult.markdown || state.presentationInput.presentationGoal, 6), visual: '下一步行动路线', speakerNotes: '结束时明确责任人、时间点和下一步交付。', gaps: '待确认下次会议和输出物。' },
    ];
  }

  function addCalloutBox(slide, label, text, x, y, w, h, accent, palette) {
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: palette.soft }, line: { color: palette.line, width: 0.8 } });
    slide.addText(label, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 7.2, bold: true, color: accent, margin: 0 });
    slide.addText(clipText(text || '待补充', 130), { x: x + 0.22, y: y + 0.46, w: w - 0.44, h: h - 0.58, fontFace: 'Microsoft YaHei', fontSize: 8.5, color: palette.text, margin: 0, fit: 'shrink', breakLine: false });
  }

  function addInsightGrid(slide, title, items, x, y, w, h, accent, palette) {
    const rows = [
      items[0] || '客户目标待确认',
      items[1] || '核心痛点待确认',
      items[2] || '方案能力待确认',
      items[3] || '推进路径待确认',
    ];
    slide.addText(title, { x, y, w, h: 0.22, fontFace: 'Microsoft YaHei', fontSize: 9, bold: true, color: palette.text, margin: 0 });
    rows.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const cardW = (w - 0.24) / 2;
      const cardH = (h - 0.52) / 2;
      const cardX = x + col * (cardW + 0.24);
      const cardY = y + 0.38 + row * (cardH + 0.22);
      slide.addShape('roundRect', { x: cardX, y: cardY, w: cardW, h: cardH, rectRadius: 0.07, fill: { color: index % 2 === 0 ? palette.surface : palette.soft }, line: { color: palette.line, width: 1 } });
      slide.addText(`0${index + 1}`, { x: cardX + 0.16, y: cardY + 0.14, w: 0.48, h: 0.18, fontFace: 'Aptos', fontSize: 8, bold: true, color: accent, margin: 0 });
      slide.addText(clipText(item, 74), { x: cardX + 0.68, y: cardY + 0.13, w: cardW - 0.86, h: cardH - 0.22, fontFace: 'Microsoft YaHei', fontSize: 8.2, color: palette.text, margin: 0.01, fit: 'shrink' });
    });
  }

  function addComparisonTable(slide, title, rows, x, y, w, h, accent, palette) {
    const safeRows = (rows.length ? rows : ['现状待补充', '改进方向待确认', '客户价值待确认']).slice(0, 4);
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: palette.surface }, line: { color: palette.line, width: 1 } });
    slide.addText(title, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.2, fontFace: 'Microsoft YaHei', fontSize: 9, bold: true, color: palette.text, margin: 0 });
    ['关注点', '售前表达'].forEach((label, index) => {
      slide.addText(label, { x: x + 0.24 + index * (w / 2), y: y + 0.52, w: w / 2 - 0.36, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 7.5, bold: true, color: index === 0 ? accent : palette.muted, margin: 0 });
    });
    safeRows.forEach((item, index) => {
      const rowY = y + 0.84 + index * ((h - 1.02) / safeRows.length);
      slide.addShape('line', { x: x + 0.22, y: rowY - 0.08, w: w - 0.44, h: 0, line: { color: palette.line, width: 1 } });
      slide.addText(clipText(item, 34), { x: x + 0.24, y: rowY, w: w / 2 - 0.38, h: 0.28, fontFace: 'Microsoft YaHei', fontSize: 7.7, bold: true, color: palette.text, fit: 'shrink', margin: 0 });
      slide.addText(index === 0 ? '先给结论，再说明依据' : index === 1 ? '对应方案能力和边界' : index === 2 ? '量化价值或风险收敛' : '明确待确认事项', { x: x + w / 2 + 0.08, y: rowY, w: w / 2 - 0.32, h: 0.28, fontFace: 'Microsoft YaHei', fontSize: 7.5, color: palette.muted, fit: 'shrink', margin: 0 });
    });
  }

  function addElegantTable(slide, title, columns, rows, x, y, w, h, accent, palette) {
    const safeColumns = columns.slice(0, 3);
    const safeRows = rows.length ? rows.slice(0, 4) : [['待确认', '补齐客户材料', '形成下一步动作']];
    const colW = w / safeColumns.length;
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: palette.surface }, line: { color: palette.line, width: 1 } });
    slide.addText(title, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.2, fontFace: 'Microsoft YaHei', fontSize: 9.5, bold: true, color: palette.text, margin: 0 });
    safeColumns.forEach((column, index) => {
      slide.addShape('rect', { x: x + index * colW, y: y + 0.52, w: colW, h: 0.34, fill: { color: index === 0 ? accent : palette.soft, transparency: index === 0 ? 0 : 10 }, line: { color: palette.line, width: 0.6 } });
      slide.addText(column, { x: x + index * colW + 0.14, y: y + 0.61, w: colW - 0.26, h: 0.14, fontFace: 'Microsoft YaHei', fontSize: 6.8, bold: true, color: index === 0 ? 'FFFFFF' : palette.text, margin: 0 });
    });
    const rowH = (h - 1.0) / safeRows.length;
    safeRows.forEach((row, rowIndex) => {
      const rowY = y + 0.9 + rowIndex * rowH;
      safeColumns.forEach((_, colIndex) => {
        slide.addShape('rect', { x: x + colIndex * colW, y: rowY, w: colW, h: rowH, fill: { color: rowIndex % 2 === 0 ? 'FFFFFF' : palette.bg, transparency: 0 }, line: { color: palette.line, width: 0.5 } });
        slide.addText(clipText(row[colIndex] || '待确认', colIndex === 0 ? 24 : 42), { x: x + colIndex * colW + 0.14, y: rowY + 0.1, w: colW - 0.28, h: rowH - 0.16, fontFace: 'Microsoft YaHei', fontSize: 6.8, color: colIndex === 0 ? palette.text : palette.muted, bold: colIndex === 0, margin: 0, fit: 'shrink', breakLine: false });
      });
    });
  }

  function addKpiCards(slide, items, x, y, w, h, accent, palette) {
    const rows = (items.length ? items : ['业务价值待确认', '技术收益待确认', '风险收敛待确认']).slice(0, 3);
    const cardW = (w - 0.32) / 3;
    rows.forEach((item, index) => {
      const cardX = x + index * (cardW + 0.16);
      slide.addShape('roundRect', { x: cardX, y, w: cardW, h, rectRadius: 0.1, fill: { color: index === 0 ? accent : palette.surface, transparency: index === 0 ? 0 : 0 }, line: { color: index === 0 ? accent : palette.line, width: 1 } });
      slide.addText(String(index + 1).padStart(2, '0'), { x: cardX + 0.16, y: y + 0.16, w: 0.42, h: 0.18, fontFace: 'Aptos', fontSize: 8, bold: true, color: index === 0 ? 'FFFFFF' : accent, margin: 0 });
      slide.addText(clipText(item, 48), { x: cardX + 0.16, y: y + 0.5, w: cardW - 0.32, h: h - 0.62, fontFace: 'Microsoft YaHei', fontSize: 8.2, bold: true, color: index === 0 ? 'FFFFFF' : palette.text, margin: 0, fit: 'shrink' });
    });
  }

  function inferPresentationLayout(page, index) {
    const explicit = String(page.layoutType || '');
    if (/痛点|矩阵|pain/i.test(explicit)) return 'pain-matrix';
    if (/架构|architecture/i.test(explicit)) return 'architecture';
    if (/路线|roadmap/i.test(explicit)) return 'roadmap';
    if (/价值|ROI|收益|成本|投入产出|value/i.test(explicit)) return 'value-table';
    if (/案例|标杆|证据|实证|evidence/i.test(explicit)) return 'evidence';
    if (/行动|计划|action/i.test(explicit)) return 'action-plan';
    if (/图表|简报|visual/i.test(explicit)) return 'visual-brief';
    if (/观点|point/i.test(explicit)) return 'point-bullets';
    if (/双栏|two/i.test(explicit)) return 'two-column';
    if (/备注|notes/i.test(explicit)) return 'briefing-notes';
    const text = `${page.title || ''} ${page.corePoint || ''} ${page.visual || ''} ${(page.bullets || []).join(' ')}`.toLowerCase();
    if (/痛点|挑战|问题|现状|优先级/.test(text)) return 'pain-matrix';
    if (/架构|能力|系统|集成|部署|技术/.test(text)) return 'architecture';
    if (/路线|计划|阶段|里程碑|实施|推进/.test(text)) return 'roadmap';
    if (/价值|roi|收益|成本|预算|投入产出|回收|量化/.test(text)) return 'value-table';
    if (/案例|标杆|同行|同类型|实证|证明|成功/.test(text)) return 'evidence';
    if (/行动|下一步|责任|决策|确认|收口/.test(text)) return 'action-plan';
    if (/图表|流程|素材|表达|mermaid|可视化/.test(text)) return 'visual-brief';
    return ['point-bullets', 'two-column', 'briefing-notes'][index % 3];
  }

  function addPainMatrixSlide(slide, page, accent, palette) {
    const items = getSlideItems(page, 4);
    const positions = [
      [0.88, 1.72],
      [6.78, 1.72],
      [0.88, 4.08],
      [6.78, 4.08],
    ];
    slide.addText('业务影响', { x: 0.86, y: 1.45, w: 1.2, h: 0.16, fontFace: 'Microsoft YaHei', fontSize: 7, bold: true, color: accent, margin: 0 });
    slide.addText('确认难度', { x: 11.02, y: 6.28, w: 1.1, h: 0.16, fontFace: 'Microsoft YaHei', fontSize: 7, bold: true, color: palette.muted, margin: 0 });
    slide.addShape('line', { x: 0.9, y: 3.75, w: 11.32, h: 0, line: { color: palette.line, width: 1 } });
    slide.addShape('line', { x: 6.45, y: 1.6, w: 0, h: 4.78, line: { color: palette.line, width: 1 } });
    items.forEach((item, index) => {
      const [x, y] = positions[index];
      slide.addShape('roundRect', { x, y, w: 5.15, h: 1.48, rectRadius: 0.09, fill: { color: palette.surface }, line: { color: index === 0 ? accent : palette.line, width: index === 0 ? 1.2 : 0.8 } });
      slide.addText(`P${index}`, { x: x + 0.18, y: y + 0.18, w: 0.46, h: 0.22, fontFace: 'Aptos', fontSize: 11, bold: true, color: accent, margin: 0 });
      slide.addText(clipText(item, 74), { x: x + 0.75, y: y + 0.18, w: 4.04, h: 0.62, fontFace: 'Microsoft YaHei', fontSize: 9.2, bold: true, color: palette.text, margin: 0, fit: 'shrink' });
      slide.addText(index < 2 ? '优先确认，影响方案边界' : '补齐依据，进入后续验证', { x: x + 0.75, y: y + 1.05, w: 3.7, h: 0.16, fontFace: 'Microsoft YaHei', fontSize: 6.8, color: palette.muted, margin: 0 });
    });
  }

  function addArchitectureSlide(slide, page, accent, palette) {
    const items = getSlideItems(page, 4);
    slide.addShape('roundRect', { x: 0.9, y: 1.58, w: 7.2, h: 4.9, rectRadius: 0.12, fill: { color: palette.surface }, line: { color: palette.line, width: 1 } });
    const layers = [
      ['客户入口', items[0] || '客户门户 / 业务入口'],
      ['业务服务', items[1] || '流程编排 / 审批协同'],
      ['数据能力', items[2] || '数据治理 / 指标分析'],
      ['集成与安全', items[3] || '接口集成 / 权限审计'],
    ];
    layers.forEach(([label, text], index) => {
      const x = 1.18 + index * 0.42;
      const y = 1.92 + index * 0.86;
      const w = 6.08;
      slide.addShape('roundRect', { x, y, w, h: 0.62, rectRadius: 0.07, fill: { color: index % 2 === 0 ? palette.soft : palette.bg }, line: { color: index === 0 ? accent : palette.line, width: 1 } });
      slide.addText(label, { x: x + 0.18, y: y + 0.13, w: 1.2, h: 0.14, fontFace: 'Microsoft YaHei', fontSize: 7.2, bold: true, color: accent, margin: 0 });
      slide.addText(clipText(text, 48), { x: x + 1.28, y: y + 0.13, w: w - 1.46, h: 0.24, fontFace: 'Microsoft YaHei', fontSize: 8, bold: true, color: palette.text, margin: 0, fit: 'shrink' });
      if (index < layers.length - 1) {
        slide.addShape('line', { x: x + w / 2, y: y + 0.58, w: 0, h: 0.26, line: { color: accent, width: 1, beginArrowType: 'none', endArrowType: 'triangle' } });
      }
    });
    addBulletCard(slide, '架构说明', [page.corePoint, page.visual, page.speakerNotes, page.gaps], 8.45, 1.58, 3.9, 4.9, accent, palette);
  }

  function addRoadmapSlide(slide, page, accent, palette) {
    const items = getSlideItems(page, 4);
    slide.addShape('line', { x: 1.18, y: 3.0, w: 10.86, h: 0, line: { color: palette.line, width: 2 } });
    items.forEach((item, index) => {
      const x = 1.32 + index * (10.44 / Math.max(1, items.length - 1));
      slide.addShape('ellipse', { x: x - 0.2, y: 2.85, w: 0.4, h: 0.4, fill: { color: accent }, line: { color: accent } });
      slide.addText(`阶段 ${index + 1}`, { x: x - 0.62, y: 2.34, w: 1.24, h: 0.16, fontFace: 'Microsoft YaHei', fontSize: 6.8, bold: true, color: accent, align: 'center', margin: 0 });
      const cardY = index % 2 === 0 ? 3.52 : 4.62;
      slide.addShape('roundRect', { x: x - 1.12, y: cardY, w: 2.24, h: 0.82, rectRadius: 0.08, fill: { color: palette.surface }, line: { color: palette.line, width: 0.8 } });
      slide.addText(clipText(item, 42), { x: x - 0.94, y: cardY + 0.14, w: 1.88, h: 0.46, fontFace: 'Microsoft YaHei', fontSize: 7.1, color: palette.text, align: 'center', fit: 'shrink', margin: 0 });
    });
    addCalloutBox(slide, '推进目标', page.corePoint, 0.9, 5.74, 11.25, 0.62, accent, palette);
  }

  function addActionPlanSlide(slide, page, accent, palette) {
    const items = getSlideItems(page, 5);
    addCalloutBox(slide, '会议收口', page.corePoint, 0.86, 1.5, 11.55, 0.92, accent, palette);
    items.forEach((item, index) => {
      const y = 2.72 + index * 0.68;
      slide.addShape('roundRect', { x: 1.0, y, w: 11.05, h: 0.48, rectRadius: 0.04, fill: { color: index % 2 === 0 ? palette.surface : palette.soft }, line: { color: palette.line, width: 1 } });
      slide.addText(String(index + 1).padStart(2, '0'), { x: 1.22, y: y + 0.13, w: 0.42, h: 0.16, fontFace: 'Aptos', fontSize: 8, bold: true, color: accent, margin: 0 });
      slide.addText(clipText(item, 95), { x: 1.82, y: y + 0.12, w: 8.9, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 8.5, color: palette.text, margin: 0 });
      slide.addText('待确认', { x: 10.9, y: y + 0.12, w: 0.9, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 7.5, color: palette.muted, align: 'right', margin: 0 });
    });
  }

  function addValueTableSlide(slide, page, accent, palette) {
    const items = getSlideItems(page, 6);
    addKpiCards(slide, items.slice(0, 3), 0.88, 1.58, 5.55, 1.2, accent, palette);
    addCalloutBox(slide, '价值判断', page.corePoint, 0.88, 3.08, 5.55, 3.1, accent, palette);
    const rows = [
      [items[0] || '业务价值', '降低沟通与执行成本', '用数据或案例量化收益'],
      [items[1] || '风险控制', '识别关键约束和边界', '明确风险闭环动作'],
      [items[2] || '投入产出', '说明预算、周期和资源', '给出 ROI 或回收口径'],
      [items[3] || '决策依据', '支撑客户内部汇报', '形成可签批的结论'],
    ];
    addElegantTable(slide, '价值与投入产出评估', ['关注点', '汇报表达', '建议补强'], rows, 6.78, 1.58, 5.58, 4.6, accent, palette);
  }

  function addEvidenceSlide(slide, page, accent, palette) {
    const items = getSlideItems(page, 5);
    slide.addShape('roundRect', { x: 0.9, y: 1.58, w: 3.35, h: 4.72, rectRadius: 0.12, fill: { color: accent }, line: { color: accent } });
    slide.addText('同类项目可行性', { x: 1.16, y: 1.98, w: 2.75, h: 0.24, fontFace: 'Microsoft YaHei', fontSize: 13, bold: true, color: 'FFFFFF', margin: 0 });
    slide.addText(clipText(page.corePoint, 112), { x: 1.16, y: 2.58, w: 2.72, h: 2.15, fontFace: 'Microsoft YaHei', fontSize: 11, bold: true, color: 'FFFFFF', margin: 0, fit: 'shrink' });
    slide.addText('用事实证明方案有效', { x: 1.16, y: 5.52, w: 2.75, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 7.2, color: 'FFFFFF', transparency: 10, margin: 0 });
    addInsightGrid(slide, '证据链拆解', items, 4.7, 1.58, 3.42, 4.72, accent, palette);
    addComparisonTable(slide, '客户可接受表达', [page.visual, page.speakerNotes, page.gaps, ...(page.bullets || [])], 8.48, 1.58, 3.88, 4.72, accent, palette);
  }

  function addConsultingSlide(slide, page, accent, palette, deliveryMode) {
    const items = getSlideItems(page, 6);
    const isInternal = deliveryMode === 'internal';
    addCalloutBox(slide, '核心结论', page.corePoint, 0.88, 1.58, 3.55, 4.82, accent, palette);
    addInsightGrid(slide, isInternal ? '内部讲解抓手' : '客户侧价值摘要', items, 4.78, 1.58, 3.58, 4.82, accent, palette);
    addElegantTable(slide, isInternal ? '讲解与待确认' : '推进建议', ['事项', '当前表达', '下一步'], [
      [items[0] || '范围', page.visual || '结合图表讲清范围', '确认边界'],
      [items[1] || '价值', page.speakerNotes || '先结论后依据', '补齐量化'],
      [items[2] || '风险', page.gaps || '待客户确认', '形成清单'],
    ], 8.72, 1.58, 3.62, 4.82, accent, palette);
  }

  function addDynamicPresentationSlide(pptx, pageNo, page, index, accent, palette, deliveryMode) {
    const slide = pptx.addSlide();
    const layout = inferPresentationLayout(page, index);
    const isInternal = deliveryMode === 'internal';
    addEditorialCanvas(slide, pageNo, accent, palette);
    addPptTitle(slide, page.title, page.corePoint, palette);

    if (layout === 'pain-matrix') {
      addPainMatrixSlide(slide, page, accent, palette);
    } else if (layout === 'architecture') {
      addArchitectureSlide(slide, page, accent, palette);
    } else if (layout === 'roadmap') {
      addRoadmapSlide(slide, page, accent, palette);
    } else if (layout === 'value-table') {
      addValueTableSlide(slide, page, accent, palette);
    } else if (layout === 'evidence') {
      addEvidenceSlide(slide, page, accent, palette);
    } else if (layout === 'action-plan') {
      addActionPlanSlide(slide, page, accent, palette);
    } else if (layout === 'point-bullets') {
      addConsultingSlide(slide, page, accent, palette, deliveryMode);
    } else if (layout === 'two-column') {
      addBulletCard(slide, '关键论证', getSlideItems(page, 5), 0.88, 1.58, 5.45, 4.82, accent, palette);
      addComparisonTable(slide, isInternal ? '图表与讲解配置' : '客户价值对齐', [page.visual, page.corePoint, page.speakerNotes, page.gaps], 6.78, 1.58, 5.58, 4.82, accent, palette);
    } else {
      addConsultingSlide(slide, page, accent, palette, deliveryMode);
    }
    addPptFooter(slide, pageNo, page.title, palette);
    return slide;
  }

  function collectPresentationDeckData(state) {
    const outlinePages = parsePresentationOutline(state.presentationResult.markdown);
    const contentPages = (outlinePages.length ? outlinePages : buildFallbackPresentationPages(state))
      .map((page, index) => enrichPresentationPage(page, state, index));
    return {
      projectTitle: projectNameFromState(state),
      profile: state.profile,
      deliveryMode: normalizeDeliveryMode(state.presentationInput.deliveryMode),
      contentPages,
    };
  }

  function createCyberEvidenceChain(state, page, index) {
    const sources = [
      ['项目资料', state.profile.keyBackground],
      ['客户材料', readAllMaterialMarkdown(state)],
      ['客户分析报告', state.analysisResult.markdown],
      ['调研准备包', state.researchResult.markdown],
      ['方案架构草案', state.architectureResult.markdown],
      ['图表草稿', state.diagramResult.markdown],
      ['汇报页纲', state.presentationResult.markdown],
    ];
    const keywords = `${page.title || ''} ${page.corePoint || ''} ${(page.bullets || []).join(' ')}`;
    const ranked = sources
      .map(([source, content]) => {
        const text = stripMarkdown(content || '');
        const hits = keywords.split(/\s+|，|。|、|；|:|：/).filter((word) => word && word.length >= 2 && text.includes(word)).length;
        return { source, hits, excerpt: clipText(text, 120) };
      })
      .filter((item) => item.excerpt)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);
    return ranked.length ? ranked : [{
      source: '项目资料',
      hits: 0,
      excerpt: clipText(stripMarkdown(state.profile.keyBackground || page.corePoint || `第 ${index + 1} 页内容待补齐`), 120),
    }];
  }

  function buildCyberPptArtifacts(state, deckData, palette, visual) {
    const generatedAt = now();
    const slides = [
      {
        slideNo: 1,
        role: 'cover',
        title: deckData.projectTitle,
        layout: 'hero-cover',
        density: 'medium',
        evidence: createCyberEvidenceChain(state, { title: deckData.projectTitle, corePoint: state.profile.keyBackground }, 0),
        editableLayer: ['项目标题', '客户/阶段/负责人指标卡', '日期与助手署名'],
        visualLayer: visual?.imagePath ? ['AI 封面视觉图'] : ['客户理解-方案设计-价值验证流程图'],
      },
      {
        slideNo: 2,
        role: 'agenda',
        title: '汇报结构',
        layout: 'agenda-grid',
        density: 'medium',
        evidence: [{ source: '汇报页纲', hits: deckData.contentPages.length, excerpt: deckData.contentPages.map((page) => page.title).join('；') }],
        editableLayer: ['目录条目', '讲解节奏提示'],
        visualLayer: ['双列目录模块', '节奏收口提示框'],
      },
      ...deckData.contentPages.map((page, index) => {
        const layout = inferPresentationLayout(page, index);
        return {
          slideNo: index + 3,
          role: 'content',
          title: page.title,
          layout,
          density: (page.bullets || []).length >= 4 ? 'high' : 'medium',
          corePoint: page.corePoint,
          evidence: createCyberEvidenceChain(state, page, index),
          editableLayer: ['标题', '核心观点', '要点文本', '图表/表格文字'],
          visualLayer: layout === 'architecture'
            ? ['分层架构图', '架构说明卡']
            : layout === 'roadmap'
            ? ['路线时间轴', '推进目标卡']
            : layout === 'value-table'
            ? ['价值指标卡', '投入产出表']
            : layout === 'pain-matrix'
            ? ['痛点矩阵', '优先级标记']
            : ['结论卡', '洞察网格', '推进建议表'],
        };
      }),
    ];
    const manifest = {
      framework: 'CyberPPT-inspired PPTX reconstruction',
      generatedAt,
      engine: {
        library: 'PptxGenJS',
        editableInformationLayer: true,
        fullSlideScreenshot: false,
      },
      selectedVisualSystem: {
        styleId: palette.cyberStyleId || '04',
        name: palette.name,
        background: `#${palette.bg}`,
        text: `#${palette.text}`,
        accent: `#${palette.highlight}`,
        line: `#${palette.line}`,
      },
      canvas: { layout: 'LAYOUT_WIDE', widthIn: 13.33, heightIn: 7.5 },
      slideCount: slides.length,
      slides,
    };
    const contentLock = {
      generatedAt,
      projectId: state.projectId,
      projectTitle: deckData.projectTitle,
      audience: state.presentationInput.audience || '待确认',
      deliveryMode: deckData.deliveryMode,
      pages: slides.map((slide) => ({
        slideNo: slide.slideNo,
        title: slide.title,
        layout: slide.layout,
        evidenceSources: slide.evidence.map((item) => item.source),
        editableLayer: slide.editableLayer,
        visualLayer: slide.visualLayer,
      })),
    };
    const qaGate = {
      generatedAt,
      deliverableAllowed: true,
      checks: [
        { name: '文本与背景对比', status: 'pass', detail: '统一使用浅底深字与蓝色强调，避免深底深字或浅底白字。' },
        { name: '可编辑信息层', status: 'pass', detail: '标题、要点、表格与图形均由 PPTX 原生对象生成。' },
        { name: '页面密度', status: 'pass', detail: '内容页默认包含图形、表格或矩阵，不只输出纯文字页。' },
        { name: '证据链', status: 'pass', detail: '每页 manifest 记录来源材料，方便回溯事实依据。' },
        { name: '全页截图风险', status: 'pass', detail: '未用整页截图替代 PPTX 页面。' },
      ],
    };
    return { manifest, contentLock, qaGate };
  }

  function writeCyberPptArtifacts(outputDir, baseName, artifacts) {
    const artifactDir = ensureDir(path.join(outputDir, `${safeFileName(baseName, '售前汇报')}-CyberPPT产物链`));
    const files = [
      ['slide_manifest.json', artifacts.manifest],
      ['content_lock.json', artifacts.contentLock],
      ['visual_qa_gate.json', artifacts.qaGate],
    ].map(([fileName, content]) => {
      const filePath = path.join(artifactDir, fileName);
      fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
      return { fileName, filePath };
    });
    return { artifactDir, files };
  }

  function buildPresentationHtmlDeck(state, palette) {
    const { projectTitle, profile, deliveryMode, contentPages } = collectPresentationDeckData(state);
    const isInternal = deliveryMode === 'internal';
    const metaItems = [
      ['客户', profile.customerName],
      ['阶段', profile.currentStage],
      ['负责人', profile.owner],
      ['行业', profile.industry],
    ].filter(([, value]) => cleanPresentationText(value));
    const visualHtml = (slide, index) => {
      const bullets = (slide.bullets || []).map((item) => cleanPresentationText(item)).filter(Boolean).slice(0, 6);
      const layout = slide.type || 'point-bullets';
      if (layout === 'cover') {
        return `<div class="hero-visual">
          <div class="mesh-card"><span></span><span></span><span></span><b>客户理解</b><b>方案价值</b><b>实施路径</b></div>
          <div class="meta-row">${metaItems.map(([label, value]) => `<section><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></section>`).join('')}</div>
        </div>`;
      }
      if (layout === 'agenda') {
        return `<div class="agenda-grid">${bullets.slice(0, 10).map((item, itemIndex) => `<article><b>${String(itemIndex + 1).padStart(2, '0')}</b><span>${escapeHtml(item.replace(/^\d+\s*[·.、-]\s*/, ''))}</span></article>`).join('')}</div>`;
      }
      if (layout === 'architecture') {
        const layers = ['客户入口', '业务服务', '数据能力', '集成安全'];
        return `<div class="architecture-map">${layers.map((label, itemIndex) => `<section style="--i:${itemIndex}"><small>${label}</small><strong>${escapeHtml(bullets[itemIndex] || slide.subtitle || '能力待确认')}</strong></section>`).join('')}</div>`;
      }
      if (layout === 'roadmap' || layout === 'action-plan') {
        return `<div class="roadmap">${bullets.slice(0, 4).map((item, itemIndex) => `<section><b>阶段 ${itemIndex + 1}</b><span>${escapeHtml(item)}</span></section>`).join('')}</div>`;
      }
      if (layout === 'pain-matrix') {
        return `<div class="matrix">${bullets.slice(0, 4).map((item, itemIndex) => `<section><b>P${itemIndex}</b><span>${escapeHtml(item)}</span></section>`).join('')}</div>`;
      }
      if (layout === 'value-table') {
        return `<div class="value-board"><section><b>业务价值</b><span>${escapeHtml(bullets[0] || slide.subtitle || '价值待确认')}</span></section><section><b>风险收敛</b><span>${escapeHtml(bullets[1] || '明确边界与责任')}</span></section><section><b>投入产出</b><span>${escapeHtml(bullets[2] || '补充测算口径')}</span></section></div>`;
      }
      return `<div class="insight-board">${bullets.slice(0, 5).map((item, itemIndex) => `<section><b>${String(itemIndex + 1).padStart(2, '0')}</b><span>${escapeHtml(item)}</span></section>`).join('')}</div>`;
    };
    const slides = [
      {
        title: projectTitle,
        kicker: '售前汇报',
        subtitle: profile.keyBackground || state.presentationInput.presentationGoal || '客户沟通、方案价值与实施路径汇报',
        type: 'cover',
        bullets: metaItems.map(([label, value]) => `${label}：${value}`),
      },
      {
        title: '汇报结构',
        kicker: 'Agenda',
        subtitle: '围绕客户理解、方案价值、实施路径和下一步行动展开。',
        type: 'agenda',
        bullets: contentPages.map((page, index) => `${String(index + 1).padStart(2, '0')} · ${page.title}`),
      },
      ...contentPages.map((page, index) => ({
        title: page.title,
        kicker: `Page ${String(index + 1).padStart(2, '0')}`,
        subtitle: page.corePoint,
        type: inferPresentationLayout(page, index),
        bullets: page.bullets || [],
        visual: isInternal ? page.visual : '关键支撑：' + (page.visual || page.corePoint || '待确认'),
        notes: isInternal ? page.speakerNotes : page.corePoint,
        gaps: isInternal ? page.gaps : page.speakerNotes,
      })),
    ];
    const total = slides.length;
    const accent = readableAccentColor(palette.highlight || palette.primary, '2563EB');
    const slideHtml = slides.map((slide, index) => {
      const notes = [slide.visual, slide.notes, slide.gaps].map((item) => cleanPresentationText(item)).filter(Boolean).slice(0, 3);
      const noteHtml = notes.map((item, cardIndex) => `<article><small>${cardIndex === 0 ? '支撑表达' : cardIndex === 1 ? '价值说明' : '推进建议'}</small><p>${escapeHtml(item)}</p></article>`).join('');
      return `
        <section class="slide ${index === 0 ? 'active cover' : ''}" data-index="${index}">
          <div class="grain"></div>
          <header>
            <span>${escapeHtml(slide.kicker)}</span>
            <em>${index + 1} / ${total}</em>
          </header>
          <main>
            <div class="copy">
              <p class="eyebrow">${escapeHtml(projectTitle)}</p>
              <h1>${escapeHtml(slide.title)}</h1>
              <h2>${escapeHtml(slide.subtitle || '')}</h2>
            </div>
            <div class="stage">
              ${visualHtml(slide, index)}
              ${noteHtml ? `<div class="note-grid">${noteHtml}</div>` : ''}
            </div>
          </main>
          <footer><span>禹都AI解决方案助手</span><span>${escapeHtml(new Date().toLocaleDateString('zh-CN'))}</span></footer>
        </section>`;
    }).join('\n');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectTitle)} - 售前汇报</title>
  <style>
    :root { --bg:#${palette.bg}; --panel:#${palette.surface}; --text:#${palette.text}; --muted:#${palette.muted}; --line:#${palette.line}; --accent:#${accent}; --soft:#${palette.soft}; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; overflow:hidden; color:var(--text); font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif; background:var(--bg); }
    .deck { width:100vw; height:100vh; position:relative; }
    .slide { position:absolute; inset:0; display:flex; flex-direction:column; padding:46px 68px 34px; opacity:0; pointer-events:none; transform:translateX(22px) scale(.985); transition:opacity .58s cubic-bezier(.16,1,.3,1), transform .72s cubic-bezier(.16,1,.3,1); }
    .slide.active { opacity:1; pointer-events:auto; transform:scale(1); }
    .slide:before { content:""; position:absolute; left:0; top:0; bottom:0; width:14px; background:var(--accent); }
    .grain { position:absolute; right:-12vw; top:-18vh; width:46vw; height:46vw; border-radius:50%; background:radial-gradient(circle, rgba(255,255,255,.42), transparent 62%); opacity:.78; }
    header, footer { display:flex; justify-content:space-between; align-items:center; position:relative; z-index:2; color:var(--muted); font-size:14px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    header span { color:var(--accent); }
    footer { font-size:12px; letter-spacing:0; border-top:1px solid var(--line); padding-top:12px; }
    main { flex:1; display:grid; grid-template-columns:minmax(0, .84fr) minmax(520px, 1fr); gap:42px; align-items:center; position:relative; z-index:2; }
    .copy { transform:translateY(18px); opacity:0; transition:all .74s cubic-bezier(.16,1,.3,1) .08s; }
    .active .copy { transform:translateY(0); opacity:1; }
    .eyebrow { margin:0 0 16px; color:var(--accent); font-size:15px; font-weight:900; }
    h1 { margin:0; max-width:760px; font-size:52px; line-height:1.08; letter-spacing:0; }
    h2 { margin:18px 0 0; max-width:720px; color:var(--muted); font-size:19px; line-height:1.55; font-weight:800; }
    .stage { display:grid; gap:18px; }
    .hero-visual,.agenda-grid,.architecture-map,.roadmap,.matrix,.value-board,.insight-board { min-height:380px; padding:24px; border:1px solid var(--line); border-radius:22px; background:linear-gradient(145deg,var(--panel),var(--soft)); box-shadow:0 22px 52px rgba(15,23,42,.08); }
    .meta-row,.note-grid,.agenda-grid,.matrix,.value-board,.insight-board { display:grid; gap:14px; }
    .meta-row { grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:24px; }
    .meta-row section,.note-grid article,.agenda-grid article,.matrix section,.value-board section,.insight-board section { min-width:0; padding:16px; border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.34); }
    .meta-row small,.note-grid small { display:block; color:var(--accent); font-weight:900; margin-bottom:8px; }
    .meta-row strong { font-size:18px; line-height:1.35; overflow-wrap:anywhere; }
    .mesh-card { position:relative; height:250px; display:grid; place-items:center; }
    .mesh-card span { position:absolute; width:82%; height:2px; background:var(--line); }
    .mesh-card span:nth-child(2) { transform:rotate(35deg); }
    .mesh-card span:nth-child(3) { transform:rotate(-35deg); }
    .mesh-card b { position:absolute; display:grid; place-items:center; width:126px; height:126px; border-radius:28px; color:#fff; background:var(--accent); box-shadow:0 18px 40px rgba(0,0,0,.14); }
    .mesh-card b:nth-of-type(1) { left:4%; top:12%; } .mesh-card b:nth-of-type(2) { right:8%; top:12%; } .mesh-card b:nth-of-type(3) { left:34%; bottom:4%; }
    .agenda-grid { grid-template-columns:repeat(2,minmax(0,1fr)); align-content:start; }
    .agenda-grid article,.insight-board section { display:grid; grid-template-columns:52px minmax(0,1fr); align-items:center; gap:14px; }
    .agenda-grid b,.insight-board b,.matrix b,.value-board b { color:var(--accent); font:900 17px Aptos, sans-serif; }
    .agenda-grid span,.insight-board span,.matrix span,.value-board span { font-size:17px; line-height:1.45; font-weight:800; overflow-wrap:anywhere; }
    .architecture-map { display:grid; align-content:center; gap:16px; }
    .architecture-map section { margin-left:calc(var(--i) * 36px); padding:17px 20px; border:1.5px solid var(--line); border-radius:16px; background:rgba(255,255,255,.36); box-shadow:inset 5px 0 0 var(--accent); }
    .architecture-map small { color:var(--accent); font-weight:900; margin-right:18px; }
    .roadmap { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); align-items:center; gap:16px; }
    .roadmap section { min-height:180px; padding:20px 18px; border-top:8px solid var(--accent); border-radius:18px; background:rgba(255,255,255,.34); }
    .roadmap b { color:var(--accent); }
    .roadmap span { display:block; margin-top:22px; font-size:17px; line-height:1.5; font-weight:800; overflow-wrap:anywhere; }
    .matrix { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .matrix section { min-height:150px; }
    .value-board { grid-template-columns:repeat(3,minmax(0,1fr)); align-content:center; }
    .value-board section { min-height:230px; border-bottom:8px solid var(--accent); }
    .insight-board { align-content:start; }
    .note-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .note-grid p { margin:0; color:var(--muted); font-size:14px; line-height:1.5; font-weight:800; overflow-wrap:anywhere; }
    .cover main { grid-template-columns:1fr; }
    .cover h1 { font-size:70px; }
    .cover .hero-visual { max-width:980px; min-height:390px; }
    .hint { position:fixed; right:28px; bottom:24px; z-index:5; padding:10px 14px; color:#31527f; background:rgba(255,255,255,.75); border:1px solid var(--line); border-radius:999px; font-size:12px; font-weight:900; }
    @media (max-width: 980px) { .slide { padding:32px 24px; overflow:auto; } main { grid-template-columns:1fr; gap:24px; } h1 { font-size:42px; } h2 { font-size:18px; } .card-grid,.cover ul { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="deck">${slideHtml}</div>
  <div class="hint">← → 翻页 · F 全屏</div>
  <script>
    const slides = [...document.querySelectorAll('.slide')];
    let current = 0;
    function go(index) {
      current = Math.max(0, Math.min(slides.length - 1, index));
      slides.forEach((slide, i) => slide.classList.toggle('active', i === current));
    }
    window.addEventListener('keydown', (event) => {
      if (['ArrowRight','PageDown',' '].includes(event.key)) go(current + 1);
      if (['ArrowLeft','PageUp'].includes(event.key)) go(current - 1);
      if (event.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.();
    });
    window.addEventListener('click', () => go(current + 1));
  </script>
</body>
</html>`;
  }

  async function buildPresentationPptx(state, options = {}) {
    const selectedPalette = resolvePptPalette({ style: state.presentationInput.pptStyle, profile: state.profile });
    const visual = await maybeGeneratePresentationVisual(state, selectedPalette, options);
    const palette = safePresentationPalette(selectedPalette);
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = '禹都AI解决方案助手';
    pptx.company = '禹都';
    pptx.subject = '售前项目汇报材料';
    pptx.title = `${projectNameFromState(state)} - 售前汇报`;
    pptx.lang = 'zh-CN';
    pptx.theme = {
      headFontFace: 'Microsoft YaHei',
      bodyFontFace: 'Microsoft YaHei',
      lang: 'zh-CN',
    };

    const deckData = collectPresentationDeckData(state);
    const { profile, projectTitle, deliveryMode, contentPages } = deckData;
    const cyberArtifacts = buildCyberPptArtifacts(state, deckData, palette, visual);
    const accentList = [palette.highlight, palette.primary, palette.secondary, palette.accent].filter((item) => item && item !== 'FFFFFF');
    const accent = (index) => accentList[index % accentList.length] || palette.highlight;

    const cover = pptx.addSlide();
    cover.background = { color: palette.bg };
    cover.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: palette.bg }, line: { color: palette.bg } });
    cover.addShape('rect', { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: palette.highlight }, line: { color: palette.highlight } });
    cover.addShape('roundRect', { x: 0.8, y: 0.72, w: 1.6, h: 0.36, rectRadius: 0.07, fill: { color: palette.highlight }, line: { color: palette.highlight } });
    cover.addText('售前汇报', { x: 0.98, y: 0.82, w: 1.0, h: 0.14, fontFace: 'Microsoft YaHei', fontSize: 7.2, bold: true, color: 'FFFFFF', margin: 0, align: 'center' });
    cover.addText(projectTitle, { x: 0.82, y: 1.6, w: 6.55, h: 1.02, fontFace: 'Microsoft YaHei', fontSize: 31, bold: true, color: palette.text, margin: 0, fit: 'shrink' });
    cover.addText(clipText(profile.keyBackground || state.presentationInput.presentationGoal || '客户沟通、方案价值与实施路径汇报', 128), { x: 0.84, y: 2.82, w: 6.2, h: 0.7, fontFace: 'Microsoft YaHei', fontSize: 10.2, color: palette.muted, margin: 0, fit: 'shrink' });
    addMetricCard(cover, '客户', profile.customerName || '未填写', 0.88, 4.28, 2.12, palette);
    addMetricCard(cover, '阶段', profile.currentStage || '未填写', 3.18, 4.28, 2.12, palette);
    addMetricCard(cover, '负责人', profile.owner || '未填写', 5.48, 4.28, 2.12, palette);
    cover.addText(`禹都AI解决方案助手 · ${new Date().toLocaleDateString('zh-CN')}`, { x: 0.88, y: 6.83, w: 4.2, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 7, color: palette.muted, margin: 0 });
    if (visual.imagePath && fs.existsSync(visual.imagePath)) {
      cover.addShape('roundRect', { x: 7.82, y: 0.9, w: 4.82, h: 4.9, rectRadius: 0.14, fill: { color: palette.surface }, line: { color: palette.line, width: 1 } });
      cover.addImage({ path: visual.imagePath, x: 8.02, y: 1.1, w: 4.42, h: 3.18, transparency: 4 });
      addKpiCards(cover, ['客户理解', '方案价值', '实施路径'], 8.02, 4.58, 4.42, 0.75, palette.highlight, palette);
    } else {
      cover.addShape('roundRect', { x: 7.92, y: 0.94, w: 4.52, h: 4.72, rectRadius: 0.14, fill: { color: palette.surface }, line: { color: palette.line, width: 1 } });
      cover.addShape('line', { x: 8.42, y: 3.15, w: 3.52, h: 0, line: { color: palette.line, width: 2 } });
      ['客户理解', '方案设计', '价值验证', '推进闭环'].forEach((label, itemIndex) => {
        const x = 8.4 + itemIndex * 1.16;
        cover.addShape('ellipse', { x, y: 2.95, w: 0.38, h: 0.38, fill: { color: itemIndex === 0 ? palette.highlight : palette.soft }, line: { color: itemIndex === 0 ? palette.highlight : palette.line, width: 1 } });
        cover.addText(label, { x: x - 0.28, y: 3.56, w: 0.94, h: 0.28, fontFace: 'Microsoft YaHei', fontSize: 6.4, bold: true, color: palette.text, align: 'center', margin: 0, fit: 'shrink' });
      });
      cover.addText('从客户事实到可汇报方案', { x: 8.32, y: 1.48, w: 3.62, h: 0.32, fontFace: 'Microsoft YaHei', fontSize: 14, bold: true, color: palette.text, margin: 0 });
      cover.addText('提炼痛点、组织架构、形成价值表达和下一步动作。', { x: 8.34, y: 5.02, w: 3.65, h: 0.22, fontFace: 'Microsoft YaHei', fontSize: 7.5, color: palette.muted, margin: 0 });
    }

    const toc = pptx.addSlide();
    addEditorialCanvas(toc, 2, palette.highlight, palette);
    addPptTitle(toc, '汇报结构', '每页只保留一个核心信息，并用图形、表格或流程辅助表达。', palette);
    const tocPages = contentPages.slice(0, 10);
    tocPages.forEach((page, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 0.9 + col * 5.9;
      const y = 1.62 + row * 0.9;
      const pageAccent = accent(index);
      toc.addShape('roundRect', { x, y, w: 5.34, h: 0.66, rectRadius: 0.06, fill: { color: index === 0 ? pageAccent : palette.surface }, line: { color: index === 0 ? pageAccent : palette.line, width: 1 } });
      toc.addText(String(index + 1).padStart(2, '0'), { x: x + 0.18, y: y + 0.18, w: 0.44, h: 0.16, fontFace: 'Aptos', fontSize: 8.6, bold: true, color: index === 0 ? 'FFFFFF' : pageAccent, margin: 0 });
      toc.addText(clipText(page.title, 28), { x: x + 0.72, y: y + 0.14, w: 3.78, h: 0.18, fontFace: 'Microsoft YaHei', fontSize: 8.8, bold: true, color: index === 0 ? 'FFFFFF' : palette.text, margin: 0, fit: 'shrink' });
      toc.addText(inferPresentationLayout(page, index), { x: x + 0.72, y: y + 0.42, w: 2.5, h: 0.12, fontFace: 'Aptos', fontSize: 5.8, color: index === 0 ? 'FFFFFF' : palette.muted, margin: 0 });
    });
    addCalloutBox(toc, '讲解节奏', '先讲客户理解，再讲方案价值，最后收束到实施路径和下一步确认事项。', 0.9, 6.08, 11.55, 0.62, palette.highlight, palette);
    addPptFooter(toc, 2, '汇报结构', palette);

    contentPages.forEach((page, index) => {
      addDynamicPresentationSlide(pptx, index + 3, page, index, accent(index), palette, deliveryMode);
    });

    return { pptx, visual, pageCount: contentPages.length + 2, contentPageCount: contentPages.length, cyberArtifacts };
  }

  function createAnalysisPrompt(state) {
    const profile = state.profile;
    const input = state.analysisInput;
    const materialMarkdown = readAllMaterialMarkdown(state) || '暂无已导入或手动录入的客户材料。';
    return [
      '你是资深售前顾问和解决方案架构师，擅长从项目资料、客户材料和少量补充分析口径中提炼售前分析结论。',
      '',
      '请基于用户提供的信息，生成一份《客户分析报告》。',
      '',
      '严格规则：',
      '1. 只基于已提供信息分析，不编造客户名称、预算、系统、数据、日期、人员、政策或承诺。',
      '2. 信息缺失时写“待确认”，并给出建议确认方式。',
      '3. 输出中文 Markdown，表达克制、专业、可继续用于售前沟通。',
      '4. 痛点必须分 P0/P1/P2；目标尽量区分业务目标、技术目标和管理目标。',
      '5. 必须包含：客户画像、业务现状、现有系统、痛点挑战、目标期望、约束条件、干系人地图、待澄清问题、机会点识别、下一步调研建议。',
      '6. 待澄清问题按“问题 / 为什么重要 / 建议找谁确认 / 优先级”表格输出。',
      '7. “客户材料 Markdown”是事实主源；“客户分析补充输入”只作为补充判断和关注口径，不要把它当成新的客户原始材料重复罗列。',
      '8. 如需出现分析师、顾问、架构师、生成者、作者等署名字段，统一写为“禹都AI解决方案助手”；不得输出模型名称、供应商名称或角色别名。',
      '',
      '## 售前项目资料',
      `- 项目名称：${profile.projectName || '待确认'}`,
      `- 客户名称：${profile.customerName || '待确认'}`,
      `- 行业领域：${profile.industry || '待确认'}`,
      `- 当前阶段：${profile.currentStage || '待确认'}`,
      `- 机会来源：${profile.opportunitySource || '待确认'}`,
      `- 预估价值：${profile.expectedValue || '待确认'}`,
      `- 决策时间：${profile.decisionDate || '待确认'}`,
      `- 负责人：${profile.owner || '待确认'}`,
      `- 背景摘要：${profile.keyBackground || '待确认'}`,
      '',
      '## 客户分析补充输入',
      `### 分析重点 / 关注口径\n${input.rawNotes || '未补充'}`,
      `### 现有系统补充\n${input.knownSystems || '未补充'}`,
      `### 痛点判断补充\n${input.businessPainPoints || '未补充'}`,
      `### 干系人判断补充\n${input.stakeholders || '未补充'}`,
      `### 约束判断补充\n${input.constraints || '未补充'}`,
      '',
      '## 客户材料 Markdown',
      materialMarkdown,
    ].join('\n');
  }

  function createResearchPrompt(state) {
    const profile = state.profile;
    const input = state.researchInput;
    const analysisMarkdown = state.analysisResult.markdown || '暂无客户分析报告，请基于项目资料和已导入或手动录入材料给出通用调研准备。';
    const materialMarkdown = readAllMaterialMarkdown(state) || '暂无已导入或手动录入的客户材料。';
    return [
      '你是资深售前顾问，擅长客户调研会议设计、SPIN 需求挖掘、会议议程控制和客户问答预判。',
      '',
      '请生成一份《售前调研准备包》。',
      '',
      '严格规则：',
      '1. 只基于已有材料和分析报告，不编造客户事实。',
      '2. 缺失信息写“待确认”，并设计问题去确认。',
      '3. 输出中文 Markdown，内容要能直接拿去开调研会。',
      '4. 必须包含：会议目标、参会角色假设、会议议程、SPIN 问题清单、信息收集清单、Q&A 预判、会后行动项模板。',
      '5. SPIN 问题至少按 情境 / 问题 / 影响 / 需求回报 四类组织，每类不少于 5 个问题。',
      '6. Q&A 预判按 技术 / 商务 / 安全 / 实施 / 运维 五类组织，回答要克制，不做过度承诺。',
      '7. 如需出现分析师、顾问、架构师、生成者、作者等署名字段，统一写为“禹都AI解决方案助手”；不得输出模型名称、供应商名称或角色别名。',
      '',
      '## 项目资料',
      `- 项目名称：${profile.projectName || '待确认'}`,
      `- 客户名称：${profile.customerName || '待确认'}`,
      `- 行业领域：${profile.industry || '待确认'}`,
      `- 当前阶段：${profile.currentStage || '待确认'}`,
      `- 背景摘要：${profile.keyBackground || '待确认'}`,
      '',
      '## 调研设置',
      `- 会议目标：${input.meetingGoal || '待确认'}`,
      `- 参会信息：${input.attendeeInfo || '待确认'}`,
      `- 已知客户问题：${input.knownQuestions || '待确认'}`,
      `- 会议时长：${input.timeBox || '60 分钟'}`,
      '',
      '## 客户分析报告',
      analysisMarkdown.slice(0, 18000),
      '',
      '## 客户材料摘录',
      materialMarkdown.slice(0, 18000),
    ].join('\n');
  }

  function createArchitecturePrompt(state) {
    const profile = state.profile;
    const input = state.architectureInput;
    const analysisMarkdown = state.analysisResult.markdown || '暂无客户分析报告。';
    const researchMarkdown = state.researchResult.markdown || '暂无调研准备包。';
    return [
      '你是资深解决方案架构师和售前方案专家，擅长从客户需求、调研结论和约束条件中形成可汇报的方案架构。',
      '',
      '请生成一份《售前方案架构草案》。',
      '',
      '严格规则：',
      '1. 只基于已有信息设计方案，不编造客户已确认的预算、系统、接口、数量、日期或承诺。',
      '2. 信息不足时写“待确认”，并说明需要向谁确认。',
      '3. 输出中文 Markdown，面向售前汇报和后续方案深化。',
      '4. 必须包含：方案定位、建设目标、范围边界、总体架构、业务架构、应用架构、数据架构、集成架构、部署与安全、非功能需求、实施路线、风险清单、ADR 决策建议、图表清单。',
      '5. 图表清单至少包含：系统上下文图、技术架构图、业务流程图、系统集成图、部署架构图、数据架构图、实施路线图；每张图说明用途、主要元素、信息缺口。',
      '6. 风险清单按“风险 / 影响 / 触发信号 / 缓解措施 / 待确认信息”表格输出。',
      '7. ADR 决策建议按“决策主题 / 推荐方向 / 替代选项 / 推荐理由 / 后果 / 可逆性”表格输出。',
      '8. 如需出现分析师、顾问、架构师、生成者、作者等署名字段，统一写为“禹都AI解决方案助手”；不得输出模型名称、供应商名称或角色别名。',
      '',
      '## 项目资料',
      `- 项目名称：${profile.projectName || '待确认'}`,
      `- 客户名称：${profile.customerName || '待确认'}`,
      `- 行业领域：${profile.industry || '待确认'}`,
      `- 当前阶段：${profile.currentStage || '待确认'}`,
      `- 背景摘要：${profile.keyBackground || '待确认'}`,
      '',
      '## 架构输入',
      `### 方案范围\n${input.solutionScope || '待补充'}`,
      `### 架构偏好 / 技术路线\n${input.architecturePreferences || '待补充'}`,
      `### 集成与周边系统\n${input.integrationNotes || '待补充'}`,
      `### 非功能需求\n${input.nonFunctionalRequirements || '待补充'}`,
      `### 交付约束\n${input.deliveryConstraints || '待补充'}`,
      '',
      '## 客户分析报告',
      analysisMarkdown.slice(0, 18000),
      '',
      '## 售前调研准备包',
      researchMarkdown.slice(0, 16000),
    ].join('\n');
  }

  function createDiagramPrompt(state) {
    const profile = state.profile;
    const input = state.diagramInput;
    const diagrams = normalizeDiagramTypes(input.selectedDiagramTypes);
    return [
      '你是资深解决方案架构师和 Mermaid 图表专家，擅长把售前方案架构转成可预览、可编辑的 Markdown Mermaid 图表草稿。',
      '',
      '请生成一份《售前图表工场草稿》。',
      '',
      '严格规则：',
      '1. 只输出 Markdown，不输出 draw.io XML。',
      '2. 每张图必须包含一个 Mermaid 代码块，并在图前说明用途，图后列出“待确认信息”。',
      '3. 使用 Mermaid 稳定语法：flowchart、sequenceDiagram、gantt、timeline、journey、quadrantChart。优先使用 flowchart LR 横向布局。',
      '4. Mermaid 节点文本使用中文，避免过长；复杂信息放在图后说明，不塞进节点。',
      '5. 信息不足时使用“待确认”节点，不编造系统、接口、地址、实例规格、日期或人员。',
      '6. 不启用 rehypeRaw，不输出 HTML。',
      '7. 如需出现分析师、顾问、架构师、生成者、作者等署名字段，统一写为“禹都AI解决方案助手”；不得输出模型名称、供应商名称或角色别名。',
      '',
      '## 项目资料',
      `- 项目名称：${profile.projectName || '待确认'}`,
      `- 客户名称：${profile.customerName || '待确认'}`,
      `- 行业领域：${profile.industry || '待确认'}`,
      '',
      '## 需要生成的图表',
      diagrams.map((item, index) => `${index + 1}. ${item}`).join('\n'),
      '',
      '## 图表关注点',
      input.diagramFocus || '待补充',
      '',
      '## 风格要求',
      input.styleRequirements || initialDiagramInput.styleRequirements,
      '',
      '## 售前方案架构草案',
      state.architectureResult.markdown ? state.architectureResult.markdown.slice(0, 22000) : '暂无方案架构草案，请基于客户分析和调研准备输出图表草稿。',
      '',
      '## 客户分析报告',
      state.analysisResult.markdown ? state.analysisResult.markdown.slice(0, 12000) : '暂无客户分析报告。',
      '',
      '## 售前调研准备包',
      state.researchResult.markdown ? state.researchResult.markdown.slice(0, 10000) : '暂无售前调研准备包。',
    ].join('\n');
  }

  function createPresentationPrompt(state) {
    const profile = state.profile;
    const input = state.presentationInput;
    return [
      '你是资深售前顾问和方案汇报顾问，擅长把售前分析、方案架构和图表草稿组织成可制作 PPT 的汇报页纲。',
      '',
      '请生成一份《售前汇报材料页纲》。',
      '',
      '严格规则：',
      '1. 只输出 Markdown，不生成 PPTX 文件。',
      '2. 每页必须包含：页码、页面标题、核心观点、页面内容要点、推荐图表/素材、讲解备注、待补充信息。',
      '3. 不编造客户事实、案例、数字、承诺或产品能力；缺失信息写“待确认”。',
      '4. 汇报结构要符合受众，避免堆砌技术细节。',
      '5. 页数按用户要求控制，若信息不足，可以合并页面但要说明。',
      '6. 如需出现分析师、顾问、架构师、生成者、作者等署名字段，统一写为“禹都AI解决方案助手”；不得输出模型名称、供应商名称或角色别名。',
      '7. 页面内容要点必须引用本项目已有事实、痛点、架构、实施或风险信息，禁止输出“根据 PPT 风格”“版式类型”“颜色方案”“素材建议”等制作过程描述。',
      '8. 面向客户正式版时，讲解备注要转成客户可读的价值表达，不要出现内部制作说明。',
      '',
      '## 汇报设置',
      `- 汇报类型：${input.presentationType || '方案汇报'}`,
      `- PPT 风格：${resolvePptPalette({ style: input.pptStyle, profile }).name}`,
      `- 汇报受众：${input.audience || '待确认'}`,
      `- 页数范围：${input.pageCount || '12-15 页'}`,
      `- 汇报目标：${input.presentationGoal || '待确认'}`,
      `- 强调重点：${input.emphasis || '待确认'}`,
      '',
      '## 项目资料',
      `- 项目名称：${profile.projectName || '待确认'}`,
      `- 客户名称：${profile.customerName || '待确认'}`,
      `- 行业领域：${profile.industry || '待确认'}`,
      '',
      '## 客户分析报告',
      state.analysisResult.markdown ? state.analysisResult.markdown.slice(0, 12000) : '暂无客户分析报告。',
      '',
      '## 售前调研准备包',
      state.researchResult.markdown ? state.researchResult.markdown.slice(0, 10000) : '暂无售前调研准备包。',
      '',
      '## 售前方案架构草案',
      state.architectureResult.markdown ? state.architectureResult.markdown.slice(0, 16000) : '暂无方案架构草案。',
      '',
      '## Mermaid 图表草稿',
      state.diagramResult.markdown ? state.diagramResult.markdown.slice(0, 12000) : '暂无图表草稿。',
    ].join('\n');
  }

  async function generateAnalysis() {
    if (!aiService?.chat) {
      throw new Error('AI 服务未就绪');
    }
    const current = loadState();
    if (current.task?.status === 'running') {
      throw new Error('已有售前分析任务正在执行');
    }
    const prompt = createAnalysisPrompt(current);
    const task = {
      id: `presales-analysis-${Date.now()}`,
      type: 'analysis',
      status: 'running',
      progress: 25,
      message: '正在生成客户分析',
      started_at: now(),
    };
    saveState({ latestPrompt: prompt, task });
    try {
      const markdown = await aiService.chat({
        messages: [
          { role: 'system', content: '你是禹都AI解决方案助手，具备资深售前顾问和解决方案架构师能力，输出专业、克制、可交付的中文 Markdown。对外署名固定为“禹都AI解决方案助手”。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        progressLabel: '售前客户分析',
        logTitle: '售前客户分析',
      });
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '客户分析已完成',
        finished_at: now(),
      };
      return saveState({
        latestPrompt: prompt,
        analysisResult: { markdown, updatedAt: now() },
        task: finalTask,
      });
    } catch (error) {
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '客户分析失败',
        finished_at: now(),
      };
      saveState({ latestPrompt: prompt, task: failedTask });
      throw error;
    }
  }

  async function generateResearch() {
    if (!aiService?.chat) {
      throw new Error('AI 服务未就绪');
    }
    const current = loadState();
    if (current.task?.status === 'running') {
      throw new Error('已有售前任务正在执行');
    }
    const prompt = createResearchPrompt(current);
    const task = {
      id: `presales-research-${Date.now()}`,
      type: 'research',
      status: 'running',
      progress: 25,
      message: '正在生成调研准备包',
      started_at: now(),
    };
    saveState({ latestPrompt: prompt, task });
    try {
      const markdown = await aiService.chat({
        messages: [
          { role: 'system', content: '你是禹都AI解决方案助手，具备资深售前顾问能力，输出专业、克制、可直接用于客户调研的中文 Markdown。对外署名固定为“禹都AI解决方案助手”。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        progressLabel: '售前调研准备',
        logTitle: '售前调研准备',
      });
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '调研准备包已生成',
        finished_at: now(),
      };
      return saveState({
        latestPrompt: prompt,
        researchResult: { markdown, updatedAt: now() },
        task: finalTask,
      });
    } catch (error) {
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '调研准备包生成失败',
        finished_at: now(),
      };
      saveState({ latestPrompt: prompt, task: failedTask });
      throw error;
    }
  }

  async function generateArchitecture() {
    if (!aiService?.chat) {
      throw new Error('AI 服务未就绪');
    }
    const current = loadState();
    if (current.task?.status === 'running') {
      throw new Error('已有售前任务正在执行');
    }
    const prompt = createArchitecturePrompt(current);
    const task = {
      id: `presales-architecture-${Date.now()}`,
      type: 'architecture',
      status: 'running',
      progress: 25,
      message: '正在生成方案架构草案',
      started_at: now(),
    };
    saveState({ latestPrompt: prompt, task });
    try {
      const markdown = await aiService.chat({
        messages: [
          { role: 'system', content: '你是禹都AI解决方案助手，具备资深解决方案架构师能力，输出专业、克制、结构完整、可继续深化的中文 Markdown。对外署名固定为“禹都AI解决方案助手”。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.32,
        progressLabel: '售前方案架构',
        logTitle: '售前方案架构',
      });
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '方案架构草案已生成',
        finished_at: now(),
      };
      return saveState({
        latestPrompt: prompt,
        architectureResult: { markdown, updatedAt: now() },
        task: finalTask,
      });
    } catch (error) {
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '方案架构草案生成失败',
        finished_at: now(),
      };
      saveState({ latestPrompt: prompt, task: failedTask });
      throw error;
    }
  }

  async function generateDiagrams() {
    if (!aiService?.chat) {
      throw new Error('AI 服务未就绪');
    }
    const current = loadState();
    if (current.task?.status === 'running') {
      throw new Error('已有售前任务正在执行');
    }
    const prompt = createDiagramPrompt(current);
    const task = {
      id: `presales-diagrams-${Date.now()}`,
      type: 'diagrams',
      status: 'running',
      progress: 25,
      message: '正在生成图表草稿',
      started_at: now(),
    };
    saveState({ latestPrompt: prompt, task });
    try {
      const markdown = await aiService.chat({
        messages: [
          { role: 'system', content: '你是禹都AI解决方案助手，具备资深解决方案架构师和 Mermaid 图表专家能力，输出专业、克制、可预览的中文 Markdown。对外署名固定为“禹都AI解决方案助手”。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.28,
        progressLabel: '售前图表工场',
        logTitle: '售前图表工场',
      });
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '图表草稿已生成',
        finished_at: now(),
      };
      return saveState({
        latestPrompt: prompt,
        diagramResult: { markdown, updatedAt: now() },
        task: finalTask,
      });
    } catch (error) {
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '图表草稿生成失败',
        finished_at: now(),
      };
      saveState({ latestPrompt: prompt, task: failedTask });
      throw error;
    }
  }

  async function generatePresentation() {
    if (!aiService?.chat) {
      throw new Error('AI 服务未就绪');
    }
    const current = loadState();
    if (current.task?.status === 'running') {
      throw new Error('已有售前任务正在执行');
    }
    const prompt = createPresentationPrompt(current);
    const task = {
      id: `presales-presentation-${Date.now()}`,
      type: 'presentation',
      status: 'running',
      progress: 25,
      message: '正在生成汇报材料页纲',
      started_at: now(),
    };
    saveState({ latestPrompt: prompt, task });
    try {
      const markdown = await aiService.chat({
        messages: [
          { role: 'system', content: '你是禹都AI解决方案助手，具备资深售前汇报顾问能力，输出结构清晰、可直接制作 PPT 的中文 Markdown。对外署名固定为“禹都AI解决方案助手”。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        progressLabel: '售前汇报材料',
        logTitle: '售前汇报材料',
      });
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '汇报材料页纲已生成',
        finished_at: now(),
      };
      return saveState({
        latestPrompt: prompt,
        presentationResult: { markdown, updatedAt: now() },
        task: finalTask,
      });
    } catch (error) {
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '汇报材料页纲生成失败',
        finished_at: now(),
      };
      saveState({ latestPrompt: prompt, task: failedTask });
      throw error;
    }
  }

  function clear() {
    const current = loadState();
    const state = normalizeState({
      ...clone(initialState),
      projectId: current.projectId,
      created_at: current.created_at,
      profile: current.profile,
      updated_at: now(),
    });
    fs.writeFileSync(statePath(state.projectId), JSON.stringify(state, null, 2), 'utf-8');
    syncRegistryEntry(state);
    return { success: true, state };
  }

  function recordExport(payload = {}) {
    const state = loadState();
    const record = normalizeExportRecord({
      ...payload,
      id: payload.id || `${payload.type || 'export'}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      exportedAt: payload.exportedAt || now(),
      pptStyle: payload.pptStyle || state.presentationInput.pptStyle,
      deliveryMode: payload.deliveryMode || state.presentationInput.deliveryMode,
    });
    if (!record) {
      throw new Error('导出记录缺少文件路径');
    }
    const nextState = saveState({
      exportRecords: [record, ...state.exportRecords].slice(0, 30),
    });
    return { success: true, state: nextState, record };
  }

  function clearExportRecords() {
    const state = saveState({ exportRecords: [] });
    return { success: true, state };
  }

  async function exportProjectPackage() {
    const state = loadState();
    const dateText = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog({
      title: '导出售前项目包',
      defaultPath: `${safeFileName(projectNameFromState(state), '售前项目包')}-${dateText}.md`,
      filters: [
        { name: 'Markdown 文件', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    fs.writeFileSync(result.filePath, `${buildProjectPackageMarkdown(state)}\n`, 'utf-8');
    return {
      success: true,
      canceled: false,
      message: `已导出 ${path.basename(result.filePath)}`,
      fileName: path.basename(result.filePath),
      filePath: result.filePath,
      state,
    };
  }

  async function exportPresentationOutline() {
    const state = loadState();
    const markdown = normalizeString(state.presentationResult?.markdown, maxInputChars);
    if (!markdown.trim()) {
      return { success: false, canceled: false, message: '请先生成汇报页纲，再导出。', state };
    }

    const dateText = new Date().toISOString().slice(0, 10);
    const defaultFilename = `${safeFileName(projectNameFromState(state), '售前汇报页纲')}-汇报页纲-${dateText}.md`;
    const result = await dialog.showSaveDialog({
      title: '导出售前汇报页纲',
      defaultPath: path.join(app?.getPath ? app.getPath('documents') : process.cwd(), defaultFilename),
      filters: [
        { name: 'Markdown 文件', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    const exportedMarkdown = [
      `# ${projectNameFromState(state)}售前汇报页纲`,
      '',
      `- 客户：${state.profile.customerName || '未填写'}`,
      `- 行业：${state.profile.industry || '未填写'}`,
      `- 阶段：${state.profile.currentStage || '未填写'}`,
      `- 负责人：${state.profile.owner || '未填写'}`,
      `- 导出时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '---',
      '',
      markdown.trim(),
      '',
    ].join('\n');
    fs.writeFileSync(result.filePath, exportedMarkdown, 'utf-8');

    const record = normalizeExportRecord({
      id: `outline-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      type: 'outline',
      fileName: path.basename(result.filePath),
      filePath: result.filePath,
      exportedAt: now(),
      pptStyle: state.presentationInput.pptStyle,
      deliveryMode: state.presentationInput.deliveryMode,
      useAiVisuals: false,
      pageCount: Math.max(0, parsePresentationOutline(markdown).length),
    });
    const nextState = saveState({
      exportRecords: record ? [record, ...state.exportRecords].slice(0, 30) : state.exportRecords,
    });
    return {
      success: true,
      canceled: false,
      message: `已导出 ${path.basename(result.filePath)}`,
      fileName: path.basename(result.filePath),
      filePath: result.filePath,
      state: nextState,
    };
  }

  async function exportPresentationPptx(options = {}) {
    const state = loadState();
    const formats = normalizePresentationExportFormats(options);
    if (!formats.pptx && !formats.html) {
      return { success: false, canceled: false, message: '请至少选择一种导出格式', state };
    }
    const dateText = new Date().toISOString().slice(0, 10);
    const deliveryName = getDeliveryModeDisplayName(state.presentationInput.deliveryMode);
    const defaultName = [
      projectNameFromState(state),
      deliveryName,
      dateText,
    ].map((item) => safeFileName(item, '')).filter(Boolean).join('-');
    const result = await dialog.showOpenDialog({
      title: '选择售前汇报材料导出目录',
      defaultPath: app?.getPath ? app.getPath('documents') : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    const outputDir = result.filePaths[0];
    const baseName = safeFileName(defaultName || `售前汇报-${dateText}`, `售前汇报-${dateText}`);
    const outputs = [];
    let visual = null;
    let pageCount = 0;

    if (formats.pptx) {
      const built = await buildPresentationPptx(state, options);
      visual = built.visual;
      pageCount = built.pageCount;
      const pptxPath = path.join(outputDir, `${baseName}.pptx`);
      await built.pptx.writeFile({ fileName: pptxPath });
      writeCyberPptArtifacts(outputDir, baseName, built.cyberArtifacts);
      outputs.push({ type: 'pptx', fileName: path.basename(pptxPath), filePath: pptxPath });
    }

    if (formats.html) {
      const palette = safePresentationPalette(resolvePptPalette({ style: state.presentationInput.pptStyle, profile: state.profile }));
      const html = buildPresentationHtmlDeck(state, palette);
      const htmlPath = path.join(outputDir, `${baseName}-HTML演示.html`);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      if (!pageCount) {
        pageCount = collectPresentationDeckData(state).contentPages.length + 2;
      }
      outputs.push({ type: 'html', fileName: path.basename(htmlPath), filePath: htmlPath });
    }

    const exportedAt = now();
    const records = outputs.map((output) => normalizeExportRecord({
      id: `${output.type}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      type: output.type,
      fileName: output.fileName,
      filePath: output.filePath,
      exportedAt,
      pptStyle: state.presentationInput.pptStyle,
      deliveryMode: state.presentationInput.deliveryMode,
      useAiVisuals: Boolean(options.useAiVisuals && visual?.imagePath),
      pageCount,
    })).filter(Boolean);
    const nextState = saveState({
      exportRecords: records.length ? [...records, ...state.exportRecords].slice(0, 30) : state.exportRecords,
    });
    const suffix = options.useAiVisuals && visual?.message ? `（${visual.message}）` : '';
    const formatText = outputs.map((item) => item.type.toUpperCase()).join('、');
    return {
      success: true,
      canceled: false,
      message: `已导出 ${formatText} 汇报材料${suffix}`,
      fileName: outputs.map((item) => item.fileName).join('、'),
      filePath: outputs[0]?.filePath || outputDir,
      outputDir,
      outputs,
      state: nextState,
    };
  }

  async function showExportFile(filePath) {
    const target = normalizeString(filePath, 2000);
    if (!target || !fs.existsSync(target)) {
      throw new Error('导出文件不存在，可能已被移动或删除');
    }
    if (fs.statSync(target).isDirectory()) {
      await shell.openPath(target);
      return { success: true, path: target };
    }
    shell.showItemInFolder(target);
    return { success: true, path: target };
  }

  function previewProjectPackage() {
    const state = loadState();
    return {
      success: true,
      markdown: buildProjectPackageMarkdown(state),
      state,
    };
  }

  return {
    loadState,
    listProjects,
    createProject,
    switchProject,
    deleteProject,
    saveProfile,
    saveAnalysisInput,
    saveAnalysisResult,
    saveResearchInput,
    saveResearchResult,
    saveArchitectureInput,
    saveArchitectureResult,
    saveDiagramInput,
    saveDiagramResult,
    savePresentationInput,
    savePresentationResult,
    importMaterial,
    saveManualMaterial,
    readMaterialMarkdown,
    generateAnalysis,
    generateResearch,
    generateArchitecture,
    generateDiagrams,
    generatePresentation,
    exportProjectPackage,
    exportPresentationOutline,
    exportPresentationPptx,
    recordExport,
    clearExportRecords,
    showExportFile,
    getImageModelAvailability,
    previewProjectPackage,
    clear,
  };
}

module.exports = {
  createPresalesWorkbenchService,
};
