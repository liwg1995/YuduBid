const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { dialog } = require('electron');
const { parseDocumentWithConfig, resolveFileParser } = require('./fileService.cjs');
const { getThesisTutorDir } = require('../utils/paths.cjs');

const panelDefinitions = {
  diagnosis: {
    label: '启动诊断',
    intent: '诊断学位、专业、语种、当前阶段和卡点，给出阶段路径与时间安排。',
    assetFiles: ['super-thesis-tutor.md', 'writing-phases.md', 'academic-paper-writing-assistant.md'],
    knowledgeFiles: ['thesis_stages.md', 'faq.md'],
  },
  topic: {
    label: '选题与开题',
    intent: '生成候选选题、评估可行性，并输出开题报告结构。',
    assetFiles: ['super-thesis-tutor.md', 'writing-phases.md', 'templates.md'],
    knowledgeFiles: ['thesis_stages.md', 'research_methods.md'],
  },
  literature: {
    label: '文献综述',
    intent: '生成检索策略、关键词、文献分类框架、综述大纲和综述写作建议。',
    assetFiles: ['super-thesis-tutor.md', 'writing-phases.md', 'templates.md'],
    knowledgeFiles: ['research_tools.md', 'academic_writing.md'],
  },
  methodology: {
    label: '研究设计',
    intent: '匹配量化、质性、混合方法，设计变量、问卷、访谈、案例或数据分析路线。',
    assetFiles: ['writing-phases.md', 'academic-paper-writing-assistant.md'],
    knowledgeFiles: ['research_methods.md'],
  },
  data: {
    label: '数据与实证',
    intent: '检查数据来源、样本、变量、真实性边界和可做分析，输出实证预检与分析路线。',
    assetFiles: ['writing-phases.md', 'academic-paper-writing-assistant.md'],
    knowledgeFiles: ['research_methods.md', 'research_tools.md'],
  },
  charts: {
    label: '图表与模型图',
    intent: '生成论文可用的 Mermaid 研究框架图、技术路线图、变量关系图、章节结构图和数据分析流程图。',
    assetFiles: ['writing-phases.md', 'templates.md', 'academic-paper-writing-assistant.md'],
    knowledgeFiles: ['research_methods.md', 'academic_writing.md'],
  },
  drafting: {
    label: '自动成稿',
    intent: '基于论文档案、章节计划、真实材料和证据链生成可编辑论文初稿，缺材料处明确标注。',
    assetFiles: ['super-thesis-tutor.md', 'writing-phases.md', 'templates.md', 'academic-paper-writing-assistant.md'],
    knowledgeFiles: ['academic_writing.md', 'research_methods.md'],
  },
  writing: {
    label: '逐章写作',
    intent: '基于用户提供的真实文献和材料撰写、批注或改写章节。',
    assetFiles: ['super-thesis-tutor.md', 'writing-phases.md', 'templates.md'],
    knowledgeFiles: ['academic_writing.md'],
  },
  review: {
    label: '评审与答辩',
    intent: '进行论文质量评审、导师反馈拆解、修改清单、答辩 PPT 与自述稿准备。',
    assetFiles: ['super-thesis-tutor.md', 'review-defense.md', 'templates.md'],
    knowledgeFiles: ['thesis_stages.md', 'faq.md'],
  },
  format: {
    label: '格式与查重',
    intent: '执行终稿质量门检查，覆盖格式、引用、证据核验、数据边界、查重风险和 AI 味。',
    assetFiles: ['super-thesis-tutor.md', 'review-defense.md'],
    knowledgeFiles: ['academic_writing.md', 'research_tools.md'],
  },
};

const panelOrder = ['diagnosis', 'topic', 'literature', 'methodology', 'data', 'charts', 'drafting', 'writing', 'review', 'format'];
const workspaceExportSchema = 'yibiao-thesis-tutor-workspace';

const initialProfile = {
  degree: '本科',
  degreeType: '学术学位',
  discipline: '',
  direction: '',
  language: '中文',
  title: '',
  stage: '没方向',
  citationFormat: 'GB/T 7714',
  schoolRequirements: '',
  advisorPreferences: '',
  milestones: '',
  dataSources: '',
  researchType: '未确定',
  targetWordCount: '',
  writingScope: '章节初稿',
  dataIntegrityNotes: '',
  researchQuestions: '',
  methodologyNotes: '',
  outlinePlan: '',
  literatureNotes: '',
};

const initialState = {
  profile: initialProfile,
  activePanel: 'diagnosis',
  sourceText: '',
  importedSourceFileName: '',
  latestResult: '',
  draft: '',
  chapters: [],
  activeChapterId: '',
  references: [],
  activeReferenceId: '',
  feedbackItems: [],
  activeFeedbackId: '',
  checkItems: [],
  activeCheckId: '',
  profileLocked: false,
  panelResults: {},
  history: [],
  task: undefined,
  updated_at: '',
};

const maxContextChars = 9000;
const maxSourceChars = 50000;

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

function normalizeString(value, maxLength = 20000) {
  return String(value || '').trim().slice(0, maxLength);
}

function assetRoot() {
  return path.join(__dirname, '..', 'assets', 'thesis-tutor');
}

function readAsset(relativePath, maxLength = 12000) {
  const filePath = path.join(assetRoot(), relativePath);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8').slice(0, maxLength);
}

function normalizeProfile(profile = {}) {
  const merged = { ...initialProfile, ...profile };
  return {
    degree: normalizeString(merged.degree, 40) || initialProfile.degree,
    degreeType: normalizeString(merged.degreeType, 40) || initialProfile.degreeType,
    discipline: normalizeString(merged.discipline, 120),
    direction: normalizeString(merged.direction, 200),
    language: normalizeString(merged.language, 40) || initialProfile.language,
    title: normalizeString(merged.title, 300),
    stage: normalizeString(merged.stage, 80) || initialProfile.stage,
    citationFormat: normalizeString(merged.citationFormat, 80) || initialProfile.citationFormat,
    schoolRequirements: normalizeString(merged.schoolRequirements, 3000),
    advisorPreferences: normalizeString(merged.advisorPreferences, 3000),
    milestones: normalizeString(merged.milestones, 2000),
    dataSources: normalizeString(merged.dataSources, 3000),
    researchType: normalizeString(merged.researchType, 80) || initialProfile.researchType,
    targetWordCount: normalizeString(merged.targetWordCount, 80),
    writingScope: normalizeString(merged.writingScope, 80) || initialProfile.writingScope,
    dataIntegrityNotes: normalizeString(merged.dataIntegrityNotes, 3000),
    researchQuestions: normalizeString(merged.researchQuestions, 3000),
    methodologyNotes: normalizeString(merged.methodologyNotes, 3000),
    outlinePlan: normalizeString(merged.outlinePlan, 5000),
    literatureNotes: normalizeString(merged.literatureNotes, 5000),
  };
}

function normalizePanel(value) {
  return panelDefinitions[value] ? value : 'diagnosis';
}

const chapterStatusValues = new Set(['not_started', 'writing', 'drafted', 'needs_revision', 'done']);

function normalizeChapterStatus(value) {
  return chapterStatusValues.has(value) ? value : 'not_started';
}

function createChapterId(seed = '') {
  const normalizedSeed = String(seed || '')
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `chapter-${normalizedSeed || Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeChapter(item, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const title = normalizeString(item.title, 160) || `第 ${index + 1} 章`;
  return {
    id: normalizeString(item.id, 120) || createChapterId(title),
    title,
    status: normalizeChapterStatus(item.status),
    goal: normalizeString(item.goal, 3000),
    material: normalizeString(item.material, 12000),
    advisorFeedback: normalizeString(item.advisorFeedback, 5000),
    draft: String(item.draft || ''),
    updated_at: normalizeString(item.updated_at, 60) || now(),
  };
}

function normalizeChapters(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeChapter).filter(Boolean).slice(0, 30);
}

function inferChaptersFromOutline(outlinePlan = '') {
  const lines = String(outlinePlan || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*+]\s*/, '').replace(/^\d+[.、]\s*/, ''))
    .filter(Boolean)
    .filter((line) => /第.{1,8}[章节篇]|chapter\s*\d+|\d+\.\d*|绪论|结论|文献综述|研究设计|研究方法|实证分析|案例分析/i.test(line))
    .slice(0, 20);

  const uniqueLines = Array.from(new Set(lines));
  return uniqueLines.map((title, index) => ({
    id: createChapterId(`${index}-${title}`),
    title: normalizeString(title, 160) || `第 ${index + 1} 章`,
    status: 'not_started',
    goal: '',
    material: '',
    advisorFeedback: '',
    draft: '',
    updated_at: now(),
  }));
}

function resolveChapters(state = {}, profile = normalizeProfile(state?.profile)) {
  const chapters = normalizeChapters(state?.chapters);
  return chapters.length ? chapters : inferChaptersFromOutline(profile.outlinePlan);
}

function resolveActiveChapterId(activeChapterId, chapters) {
  const candidate = normalizeString(activeChapterId, 120);
  if (candidate && chapters.some((chapter) => chapter.id === candidate)) return candidate;
  return chapters[0]?.id || '';
}

function getActiveChapter(chapters, activeChapterId) {
  return chapters.find((chapter) => chapter.id === activeChapterId) || chapters[0] || null;
}

function upsertActiveChapter(chapters, activeChapterId, patch) {
  const targetId = resolveActiveChapterId(activeChapterId, chapters);
  if (!targetId) return chapters;
  return chapters.map((chapter) => (
    chapter.id === targetId
      ? { ...chapter, ...patch, updated_at: now() }
      : chapter
  ));
}

const referenceTypes = new Set(['literature', 'policy', 'case', 'data', 'quote', 'other']);
const referenceVerificationStatuses = new Set(['unverified', 'verified', 'partial', 'invalid']);

function normalizeReferenceType(value) {
  return referenceTypes.has(value) ? value : 'literature';
}

function normalizeReferenceVerificationStatus(value) {
  return referenceVerificationStatuses.has(value) ? value : 'unverified';
}

function createReferenceId(seed = '') {
  const normalizedSeed = String(seed || '')
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `ref-${normalizedSeed || Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeReference(item, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const title = normalizeString(item.title, 260) || `文献/证据 ${index + 1}`;
  const relatedChapterIds = Array.isArray(item.relatedChapterIds)
    ? item.relatedChapterIds.map((id) => normalizeString(id, 120)).filter(Boolean).slice(0, 20)
    : [];
  return {
    id: normalizeString(item.id, 120) || createReferenceId(title),
    type: normalizeReferenceType(item.type),
    verificationStatus: normalizeReferenceVerificationStatus(item.verificationStatus),
    title,
    authors: normalizeString(item.authors, 240),
    year: normalizeString(item.year, 40),
    source: normalizeString(item.source, 300),
    citation: normalizeString(item.citation, 1200),
    verificationSource: normalizeString(item.verificationSource, 500),
    verificationNotes: normalizeString(item.verificationNotes, 1500),
    keywords: normalizeString(item.keywords, 500),
    summary: normalizeString(item.summary, 5000),
    keyPoints: normalizeString(item.keyPoints, 5000),
    relatedChapterIds,
    updated_at: normalizeString(item.updated_at, 60) || now(),
  };
}

function normalizeReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeReference).filter(Boolean).slice(0, 80);
}

function resolveActiveReferenceId(activeReferenceId, references) {
  const candidate = normalizeString(activeReferenceId, 120);
  if (candidate && references.some((reference) => reference.id === candidate)) return candidate;
  return references[0]?.id || '';
}

function buildReferenceContext(panel, references = [], activeReferenceId = '') {
  const shouldUseReferences = ['literature', 'charts', 'drafting', 'writing', 'review', 'format'].includes(panel);
  if (!shouldUseReferences) return '';
  const normalizedReferences = normalizeReferences(references);
  if (!normalizedReferences.length) {
    return '暂无结构化文献或证据条目；如需正文写作，请优先依据用户提供材料，不要编造引用。';
  }
  const activeId = resolveActiveReferenceId(activeReferenceId, normalizedReferences);
  const sorted = [...normalizedReferences].sort((left, right) => {
    if (left.id === activeId) return -1;
    if (right.id === activeId) return 1;
    return 0;
  });
  return sorted.slice(0, 20).map((item, index) => [
    `## 证据 ${index + 1}${item.id === activeId ? '（当前选中）' : ''}`,
    `- 类型：${item.type}`,
    `- 核验状态：${item.verificationStatus}`,
    `- 标题：${item.title}`,
    `- 作者/年份：${item.authors || '未填写'} ${item.year || ''}`.trim(),
    `- 来源：${item.source || '未填写'}`,
    `- 引用格式：${item.citation || '未整理'}`,
    `- 核验来源：${item.verificationSource || '未填写'}`,
    `- 核验备注：${item.verificationNotes || '未填写'}`,
    `- 关键词：${item.keywords || '未填写'}`,
    `- 摘要：${item.summary || '未填写'}`,
    `- 可用观点/证据：${item.keyPoints || '未填写'}`,
    `- 关联章节ID：${item.relatedChapterIds.length ? item.relatedChapterIds.join(', ') : '未关联'}`,
  ].join('\n')).join('\n\n').slice(0, 9000);
}

const feedbackStatuses = new Set(['todo', 'doing', 'done', 'deferred']);
const feedbackPriorities = new Set(['high', 'medium', 'low']);

function normalizeFeedbackStatus(value) {
  return feedbackStatuses.has(value) ? value : 'todo';
}

function normalizeFeedbackPriority(value) {
  return feedbackPriorities.has(value) ? value : 'medium';
}

function createFeedbackId(seed = '') {
  const normalizedSeed = String(seed || '')
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `feedback-${normalizedSeed || Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeFeedbackItem(item, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const title = normalizeString(item.title, 180) || `导师反馈 ${index + 1}`;
  const relatedChapterIds = Array.isArray(item.relatedChapterIds)
    ? item.relatedChapterIds.map((id) => normalizeString(id, 120)).filter(Boolean).slice(0, 20)
    : [];
  return {
    id: normalizeString(item.id, 120) || createFeedbackId(title),
    title,
    source: normalizeString(item.source, 160),
    priority: normalizeFeedbackPriority(item.priority),
    status: normalizeFeedbackStatus(item.status),
    relatedChapterIds,
    originalFeedback: normalizeString(item.originalFeedback, 5000),
    actionPlan: normalizeString(item.actionPlan, 5000),
    revisionNotes: normalizeString(item.revisionNotes, 5000),
    updated_at: normalizeString(item.updated_at, 60) || now(),
  };
}

function normalizeFeedbackItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeFeedbackItem).filter(Boolean).slice(0, 80);
}

function resolveActiveFeedbackId(activeFeedbackId, feedbackItems) {
  const candidate = normalizeString(activeFeedbackId, 120);
  if (candidate && feedbackItems.some((item) => item.id === candidate)) return candidate;
  return feedbackItems[0]?.id || '';
}

function buildFeedbackContext(panel, feedbackItems = [], activeFeedbackId = '') {
  const shouldUseFeedback = ['writing', 'review', 'format'].includes(panel);
  if (!shouldUseFeedback) return '';
  const normalizedFeedback = normalizeFeedbackItems(feedbackItems);
  if (!normalizedFeedback.length) {
    return '暂无结构化导师反馈任务。';
  }
  const activeId = resolveActiveFeedbackId(activeFeedbackId, normalizedFeedback);
  const sorted = [...normalizedFeedback].sort((left, right) => {
    if (left.id === activeId) return -1;
    if (right.id === activeId) return 1;
    const statusWeight = { doing: 0, todo: 1, deferred: 2, done: 3 };
    const priorityWeight = { high: 0, medium: 1, low: 2 };
    return (statusWeight[left.status] ?? 4) - (statusWeight[right.status] ?? 4)
      || (priorityWeight[left.priority] ?? 3) - (priorityWeight[right.priority] ?? 3);
  });
  return sorted.slice(0, 20).map((item, index) => [
    `## 反馈 ${index + 1}${item.id === activeId ? '（当前选中）' : ''}`,
    `- 标题：${item.title}`,
    `- 来源：${item.source || '未填写'}`,
    `- 优先级：${item.priority}`,
    `- 状态：${item.status}`,
    `- 关联章节ID：${item.relatedChapterIds.length ? item.relatedChapterIds.join(', ') : '未关联'}`,
    `- 原始意见：${item.originalFeedback || '未填写'}`,
    `- 处理方案：${item.actionPlan || '未填写'}`,
    `- 修改记录：${item.revisionNotes || '未填写'}`,
  ].join('\n')).join('\n\n').slice(0, 9000);
}

const checkCategories = new Set(['format', 'citation', 'duplication', 'ai_tone', 'logic', 'other']);
const checkStatuses = new Set(['unchecked', 'issue_found', 'fixed', 'ignored']);
const checkSeverities = new Set(['high', 'medium', 'low']);

function normalizeCheckCategory(value) {
  return checkCategories.has(value) ? value : 'format';
}

function normalizeCheckStatus(value) {
  return checkStatuses.has(value) ? value : 'unchecked';
}

function normalizeCheckSeverity(value) {
  return checkSeverities.has(value) ? value : 'medium';
}

function createCheckId(seed = '') {
  const normalizedSeed = String(seed || '')
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `check-${normalizedSeed || Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeCheckItem(item, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const title = normalizeString(item.title, 180) || `检查项 ${index + 1}`;
  return {
    id: normalizeString(item.id, 120) || createCheckId(title),
    category: normalizeCheckCategory(item.category),
    title,
    status: normalizeCheckStatus(item.status),
    severity: normalizeCheckSeverity(item.severity),
    location: normalizeString(item.location, 500),
    issue: normalizeString(item.issue, 5000),
    suggestion: normalizeString(item.suggestion, 5000),
    revisionNotes: normalizeString(item.revisionNotes, 5000),
    updated_at: normalizeString(item.updated_at, 60) || now(),
  };
}

function normalizeCheckItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeCheckItem).filter(Boolean).slice(0, 120);
}

function resolveActiveCheckId(activeCheckId, checkItems) {
  const candidate = normalizeString(activeCheckId, 120);
  if (candidate && checkItems.some((item) => item.id === candidate)) return candidate;
  return checkItems[0]?.id || '';
}

function buildCheckContext(panel, checkItems = [], activeCheckId = '') {
  if (panel !== 'format') return '';
  const normalizedChecks = normalizeCheckItems(checkItems);
  if (!normalizedChecks.length) {
    return '暂无结构化格式与查重检查项。';
  }
  const activeId = resolveActiveCheckId(activeCheckId, normalizedChecks);
  const sorted = [...normalizedChecks].sort((left, right) => {
    if (left.id === activeId) return -1;
    if (right.id === activeId) return 1;
    const statusWeight = { issue_found: 0, unchecked: 1, fixed: 2, ignored: 3 };
    const severityWeight = { high: 0, medium: 1, low: 2 };
    return (statusWeight[left.status] ?? 4) - (statusWeight[right.status] ?? 4)
      || (severityWeight[left.severity] ?? 3) - (severityWeight[right.severity] ?? 3);
  });
  return sorted.slice(0, 30).map((item, index) => [
    `## 检查项 ${index + 1}${item.id === activeId ? '（当前选中）' : ''}`,
    `- 分类：${item.category}`,
    `- 标题：${item.title}`,
    `- 状态：${item.status}`,
    `- 严重级别：${item.severity}`,
    `- 位置：${item.location || '未填写'}`,
    `- 问题描述：${item.issue || '未填写'}`,
    `- 修改建议：${item.suggestion || '未填写'}`,
    `- 修改记录：${item.revisionNotes || '未填写'}`,
  ].join('\n')).join('\n\n').slice(0, 9000);
}

function cloneState(state) {
  const profile = normalizeProfile(state?.profile);
  const chapters = resolveChapters(state, profile);
  const activeChapterId = resolveActiveChapterId(state?.activeChapterId, chapters);
  const references = normalizeReferences(state?.references);
  const activeReferenceId = resolveActiveReferenceId(state?.activeReferenceId, references);
  const feedbackItems = normalizeFeedbackItems(state?.feedbackItems);
  const activeFeedbackId = resolveActiveFeedbackId(state?.activeFeedbackId, feedbackItems);
  const checkItems = normalizeCheckItems(state?.checkItems);
  const activeCheckId = resolveActiveCheckId(state?.activeCheckId, checkItems);
  return {
    ...initialState,
    ...state,
    profile,
    activePanel: normalizePanel(state?.activePanel),
    sourceText: String(state?.sourceText || ''),
    importedSourceFileName: normalizeString(state?.importedSourceFileName, 260),
    latestResult: String(state?.latestResult || ''),
    draft: String(state?.draft || ''),
    chapters,
    activeChapterId,
    references,
    activeReferenceId,
    feedbackItems,
    activeFeedbackId,
    checkItems,
    activeCheckId,
    profileLocked: Boolean(state?.profileLocked),
    panelResults: normalizePanelResults(state?.panelResults),
    history: Array.isArray(state?.history) ? state.history.map(normalizeHistoryItem).filter(Boolean).slice(0, 30) : [],
    task: state?.task,
  };
}

function normalizePanelResults(value) {
  if (!value || typeof value !== 'object') return {};
  const results = {};
  for (const panel of panelOrder) {
    const normalized = normalizePanelResult(value[panel]);
    if (normalized) {
      results[panel] = normalized;
    }
  }
  return results;
}

function normalizePanelResult(item) {
  if (!item || typeof item !== 'object') return null;
  const panel = normalizePanel(item.panel);
  const content = String(item.content || '').trim();
  if (!content) return null;
  return {
    panel,
    panelLabel: panelDefinitions[panel].label,
    input: normalizeString(item.input, 1000),
    content,
    updated_at: normalizeString(item.updated_at, 60) || now(),
  };
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== 'object') return null;
  const content = String(item.content || '');
  if (!content.trim()) return null;
  const panel = normalizePanel(item.panel);
  return {
    id: normalizeString(item.id, 80) || `thesis-${Date.now()}`,
    panel,
    panelLabel: panelDefinitions[panel].label,
    title: normalizeString(item.title, 160) || panelDefinitions[panel].label,
    customTitle: normalizeString(item.customTitle, 160),
    important: Boolean(item.important),
    input: normalizeString(item.input, 1000),
    content,
    created_at: normalizeString(item.created_at, 60) || now(),
  };
}

const chapterStatusLabels = {
  not_started: '未开始',
  writing: '写作中',
  drafted: '已成稿',
  needs_revision: '待修改',
  done: '已完成',
};

const referenceTypeLabels = {
  literature: '文献',
  policy: '政策/规范',
  case: '案例',
  data: '数据',
  quote: '原文摘录',
  other: '其他',
};

const referenceVerificationLabels = {
  unverified: '待核验',
  verified: '已核验',
  partial: '信息不完整',
  invalid: '不可查/慎用',
};

const feedbackPriorityLabels = {
  high: '高',
  medium: '中',
  low: '低',
};

const feedbackStatusLabels = {
  todo: '待处理',
  doing: '处理中',
  done: '已完成',
  deferred: '暂缓',
};

const checkCategoryLabels = {
  format: '格式',
  citation: '引用',
  duplication: '重复表达',
  ai_tone: 'AI 味',
  logic: '逻辑',
  other: '其他',
};

const checkStatusLabels = {
  unchecked: '未检查',
  issue_found: '发现问题',
  fixed: '已修正',
  ignored: '暂不处理',
};

const checkSeverityLabels = {
  high: '高',
  medium: '中',
  low: '低',
};

function labelOf(labels, value) {
  return labels[value] || value || '未填写';
}

function safeFileName(value, fallback = '论文导师项目包') {
  const text = normalizeString(value, 80)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
}

function escapeMarkdownTableCell(value) {
  return String(value || '未填写')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function markdownTable(rows) {
  return [
    '| 项目 | 内容 |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${escapeMarkdownTableCell(label)} | ${escapeMarkdownTableCell(value)} |`),
  ].join('\n');
}

function formatExportTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function buildProjectProfileMarkdown(state) {
  const profile = normalizeProfile(state.profile);
  const rows = [
    ['学位/类型', `${profile.degree || '未填写'} / ${profile.degreeType || '未填写'}`],
    ['专业方向', `${profile.discipline || '未填写'}${profile.direction ? ` / ${profile.direction}` : ''}`],
    ['语种', profile.language || '未填写'],
    ['当前阶段', profile.stage || '未填写'],
    ['引用格式', profile.citationFormat || '未填写'],
    ['论文题目', profile.title || '未定题'],
    ['研究类型', profile.researchType || '未确定'],
    ['目标字数', profile.targetWordCount || '未填写'],
    ['成稿范围', profile.writingScope || '章节初稿'],
    ['学校/学院要求', profile.schoolRequirements || '未填写'],
    ['导师偏好', profile.advisorPreferences || '未填写'],
    ['时间节点', profile.milestones || '未填写'],
    ['可用数据源', profile.dataSources || '未填写'],
    ['数据/材料真实性说明', profile.dataIntegrityNotes || '未填写'],
    ['已定研究问题', profile.researchQuestions || '未填写'],
    ['方法/变量/样本条件', profile.methodologyNotes || '未填写'],
    ['论文目录或章节计划', profile.outlinePlan || '未填写'],
    ['已有文献线索', profile.literatureNotes || '未填写'],
    ['档案锁定', state.profileLocked ? '已锁定' : '未锁定'],
  ];

  return [
    '# 论文档案',
    '',
    `导出时间：${formatExportTime()}`,
    '',
    markdownTable(rows),
    '',
    '## 当前材料',
    state.importedSourceFileName ? `导入文件：${state.importedSourceFileName}` : '未导入文件。',
    '',
    String(state.sourceText || '').trim() || '暂无材料正文。',
  ].join('\n');
}

function buildProjectPanelResultsMarkdown(state) {
  const panelResults = normalizePanelResults(state.panelResults);
  const parts = panelOrder.map((panel) => {
    const item = panelResults[panel];
    if (!item) {
      return `## ${panelDefinitions[panel].label}\n\n暂无阶段成果。`;
    }
    return [
      `## ${panelDefinitions[panel].label}`,
      '',
      item.input ? `本阶段需求：${item.input}` : '本阶段需求：未填写。',
      '',
      `更新时间：${item.updated_at || '未知'}`,
      '',
      item.content || '暂无内容。',
    ].join('\n');
  });

  return ['# 阶段成果', '', ...parts].join('\n\n');
}

function buildProjectChaptersMarkdown(state) {
  const chapters = normalizeChapters(state.chapters);
  if (!chapters.length) return '# 章节草稿\n\n暂无章节。';
  const activeChapterId = resolveActiveChapterId(state.activeChapterId, chapters);
  const parts = chapters.map((chapter, index) => [
    `## ${index + 1}. ${chapter.title}${chapter.id === activeChapterId ? '（当前章节）' : ''}`,
    '',
    `- 状态：${labelOf(chapterStatusLabels, chapter.status)}`,
    `- 本章目标：${chapter.goal || '未填写'}`,
    `- 导师反馈/修改要求：${chapter.advisorFeedback || '未填写'}`,
    `- 更新时间：${chapter.updated_at || '未知'}`,
    '',
    '### 本章材料',
    chapter.material || '未填写。',
    '',
    '### 已保存草稿',
    chapter.draft || '暂无草稿。',
  ].join('\n'));
  return ['# 章节草稿', '', ...parts].join('\n\n');
}

function buildProjectReferencesMarkdown(state) {
  const references = normalizeReferences(state.references);
  if (!references.length) return '# 文献与证据链\n\n暂无文献或证据条目。';
  const parts = references.map((reference, index) => [
    `## ${index + 1}. ${reference.title}`,
    '',
    `- 类型：${labelOf(referenceTypeLabels, reference.type)}`,
    `- 核验状态：${labelOf(referenceVerificationLabels, reference.verificationStatus)}`,
    `- 作者/机构：${reference.authors || '未填写'}`,
    `- 年份：${reference.year || '未填写'}`,
    `- 来源：${reference.source || '未填写'}`,
    `- 关键词：${reference.keywords || '未填写'}`,
    `- 规范引用/出处：${reference.citation || '未填写'}`,
    `- 核验来源：${reference.verificationSource || '未填写'}`,
    `- 核验备注：${reference.verificationNotes || '未填写'}`,
    `- 关联章节ID：${reference.relatedChapterIds.length ? reference.relatedChapterIds.join(', ') : '未关联'}`,
    `- 更新时间：${reference.updated_at || '未知'}`,
    '',
    '### 摘要/证据内容',
    reference.summary || '未填写。',
    '',
    '### 可用观点/写作用途',
    reference.keyPoints || '未填写。',
  ].join('\n'));
  return ['# 文献与证据链', '', ...parts].join('\n\n');
}

function buildProjectFeedbackMarkdown(state) {
  const feedbackItems = normalizeFeedbackItems(state.feedbackItems);
  if (!feedbackItems.length) return '# 导师反馈闭环\n\n暂无导师反馈任务。';
  const parts = feedbackItems.map((item, index) => [
    `## ${index + 1}. ${item.title}`,
    '',
    `- 来源：${item.source || '未填写'}`,
    `- 优先级：${labelOf(feedbackPriorityLabels, item.priority)}`,
    `- 状态：${labelOf(feedbackStatusLabels, item.status)}`,
    `- 关联章节ID：${item.relatedChapterIds.length ? item.relatedChapterIds.join(', ') : '未关联'}`,
    `- 更新时间：${item.updated_at || '未知'}`,
    '',
    '### 原始意见',
    item.originalFeedback || '未填写。',
    '',
    '### 处理方案',
    item.actionPlan || '未填写。',
    '',
    '### 修改记录',
    item.revisionNotes || '未填写。',
  ].join('\n'));
  return ['# 导师反馈闭环', '', ...parts].join('\n\n');
}

function buildProjectChecksMarkdown(state) {
  const checkItems = normalizeCheckItems(state.checkItems);
  if (!checkItems.length) return '# 终稿检查清单\n\n暂无检查项。';
  const parts = checkItems.map((item, index) => [
    `## ${index + 1}. ${item.title}`,
    '',
    `- 分类：${labelOf(checkCategoryLabels, item.category)}`,
    `- 严重级别：${labelOf(checkSeverityLabels, item.severity)}`,
    `- 状态：${labelOf(checkStatusLabels, item.status)}`,
    `- 位置：${item.location || '未填写'}`,
    `- 更新时间：${item.updated_at || '未知'}`,
    '',
    '### 问题描述',
    item.issue || '未填写。',
    '',
    '### 修改建议',
    item.suggestion || '未填写。',
    '',
    '### 修改记录',
    item.revisionNotes || '未填写。',
  ].join('\n'));
  return ['# 终稿检查清单', '', ...parts].join('\n\n');
}

function buildProjectLatestResultMarkdown(state) {
  const panel = normalizePanel(state.activePanel);
  return [
    '# 最新结果',
    '',
    `当前模块：${panelDefinitions[panel].label}`,
    '',
    state.latestResult || state.draft || '暂无最新结果。',
  ].join('\n');
}

function buildProjectHistoryMarkdown(state) {
  const history = Array.isArray(state.history) ? state.history.map(normalizeHistoryItem).filter(Boolean) : [];
  if (!history.length) return '# 历史记录\n\n暂无历史记录。';
  const parts = history.map((item, index) => [
    `## ${index + 1}. ${item.customTitle || item.title}`,
    '',
    `- 模块：${item.panelLabel || panelDefinitions[item.panel].label}`,
    `- 重要版本：${item.important ? '是' : '否'}`,
    `- 创建时间：${item.created_at || '未知'}`,
    item.input ? `- 原始需求：${item.input}` : '- 原始需求：未填写',
    '',
    item.content,
  ].join('\n'));
  return ['# 历史记录', '', ...parts].join('\n\n');
}

function buildProjectPackageReadme(state) {
  const profile = normalizeProfile(state.profile);
  return [
    '# 论文导师项目包',
    '',
    `导出时间：${formatExportTime()}`,
    `论文题目：${profile.title || '未定题'}`,
    '',
    '## 文件说明',
    '',
    '- `00-论文档案.md`：论文基础档案、学校/导师要求、阶段、数据与材料说明。',
    '- `01-阶段成果.md`：启动诊断、选题、综述、研究设计、数据实证、自动成稿等模块沉淀结果。',
    '- `02-章节草稿.md`：章节计划、章节材料、导师要求和已保存草稿。',
    '- `03-文献与证据链.md`：文献、政策、案例、数据和引用核验状态。',
    '- `04-导师反馈.md`：导师反馈、处理方案和修改记录。',
    '- `05-终稿检查清单.md`：格式、引用、查重、AI 味和逻辑检查项。',
    '- `06-最新结果.md`：当前页面最新生成或编辑的结果。',
    '- `07-历史记录.md`：最近生成历史，便于回溯版本。',
    '- `workspace.json`：完整机器可读工作区快照，可用于排查或后续兼容导入。',
    '',
    '## 使用提醒',
    '',
    '论文导师是论文辅导、写作管理和材料组织工具，不替代真实研究、真实数据核验和导师/学校审核。正式提交前，请逐条核验引用、数据、格式要求和学术诚信边界。',
  ].join('\n');
}

function buildProjectPackageFiles(state) {
  return [
    ['README.md', buildProjectPackageReadme(state)],
    ['00-论文档案.md', buildProjectProfileMarkdown(state)],
    ['01-阶段成果.md', buildProjectPanelResultsMarkdown(state)],
    ['02-章节草稿.md', buildProjectChaptersMarkdown(state)],
    ['03-文献与证据链.md', buildProjectReferencesMarkdown(state)],
    ['04-导师反馈.md', buildProjectFeedbackMarkdown(state)],
    ['05-终稿检查清单.md', buildProjectChecksMarkdown(state)],
    ['06-最新结果.md', buildProjectLatestResultMarkdown(state)],
    ['07-历史记录.md', buildProjectHistoryMarkdown(state)],
    ['workspace.json', JSON.stringify({
      schema: workspaceExportSchema,
      version: 1,
      exported_at: now(),
      state,
    }, null, 2)],
  ];
}

function parseWorkspaceImportFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  let rawJson = '';

  if (extension === '.zip') {
    const zip = new AdmZip(filePath);
    const workspaceEntry = zip.getEntries().find((entry) => (
      !entry.isDirectory
      && (entry.entryName === 'workspace.json' || entry.entryName.endsWith('/workspace.json'))
    ));
    if (!workspaceEntry) {
      throw new Error('项目包中未找到 workspace.json，无法恢复工作区');
    }
    rawJson = workspaceEntry.getData().toString('utf-8');
  } else {
    rawJson = fs.readFileSync(filePath, 'utf-8');
  }

  const parsed = safeJsonParse(rawJson, null);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(extension === '.zip' ? '项目包中的 workspace.json 不是有效 JSON' : '备份文件不是有效 JSON');
  }
  return parsed.schema === workspaceExportSchema && parsed.state && typeof parsed.state === 'object'
    ? parsed.state
    : parsed;
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

function createHistoryItem(panel, input, content) {
  return {
    id: `thesis-${panel}-${Date.now()}`,
    panel,
    panelLabel: panelDefinitions[panel].label,
    title: `${panelDefinitions[panel].label} · ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    customTitle: '',
    important: false,
    input: normalizeString(input, 1000),
    content: String(content || '').trim(),
    created_at: now(),
  };
}

function createPanelResult(panel, input, content) {
  return {
    panel,
    panelLabel: panelDefinitions[panel].label,
    input: normalizeString(input, 1000),
    content: String(content || '').trim(),
    updated_at: now(),
  };
}

function buildWorkflowContext(panel, panelResults = {}) {
  const currentIndex = panelOrder.indexOf(panel);
  const orderedPanels = panelOrder.filter((item) => item !== panel);
  const priorPanels = currentIndex > -1
    ? panelOrder.slice(0, currentIndex)
    : orderedPanels;
  const laterCompletedPanels = orderedPanels.filter((item) => !priorPanels.includes(item) && panelResults[item]);
  const relevantPanels = [...priorPanels, ...laterCompletedPanels].filter((item) => panelResults[item]);

  if (!relevantPanels.length) {
    return '暂无已沉淀的阶段成果。';
  }

  return relevantPanels.map((item) => {
    const result = panelResults[item];
    const inputLine = result.input ? `\n本阶段原始需求：${result.input}` : '';
    return `## ${panelDefinitions[item].label}${inputLine}\n${String(result.content || '').slice(0, 1800)}`;
  }).join('\n\n').slice(0, 7000);
}

function buildChapterContext(panel, chapters = [], activeChapterId = '') {
  if (panel !== 'writing') return '';
  const activeChapter = getActiveChapter(chapters, activeChapterId);
  if (!activeChapter) {
    return '未选择具体章节；请按用户本次需求判断写作边界。';
  }
  return [
    `- 当前章节：${activeChapter.title}`,
    `- 章节状态：${activeChapter.status}`,
    `- 本章目标：${activeChapter.goal || '未填写'}`,
    `- 本章材料：${activeChapter.material || '未填写'}`,
    `- 导师反馈/修改要求：${activeChapter.advisorFeedback || '未填写'}`,
    `- 已有章节草稿：${activeChapter.draft ? activeChapter.draft.slice(0, 5000) : '未填写'}`,
  ].join('\n');
}

function buildDisciplineKnowledge(profile) {
  const disciplineText = `${profile.discipline} ${profile.direction}`.toLowerCase();
  const disciplineMap = [
    ['计算机', 'disciplines/cs.md'],
    ['软件', 'disciplines/cs.md'],
    ['经济', 'disciplines/economics.md'],
    ['教育', 'disciplines/education.md'],
    ['工程', 'disciplines/engineering.md'],
    ['法学', 'disciplines/law.md'],
    ['法律', 'disciplines/law.md'],
    ['文学', 'disciplines/literature.md'],
    ['管理', 'disciplines/management.md'],
    ['医学', 'disciplines/medical.md'],
    ['心理', 'disciplines/psychology.md'],
    ['艺术', 'disciplines/art.md'],
    ['农', 'disciplines/agriculture.md'],
    ['图书馆', 'disciplines/library_science.md'],
    ['考古', 'disciplines/archaeology.md'],
    ['体育', 'disciplines/sports_science.md'],
  ];
  const matched = disciplineMap.find(([keyword]) => disciplineText.includes(keyword));
  return matched ? readAsset(`knowledge_base_zh/${matched[1]}`, 2600) : '';
}

function buildKnowledgeContext(panel, profile) {
  const definition = panelDefinitions[panel];
  const chunks = [];
  for (const fileName of definition.assetFiles) {
    const content = readAsset(fileName, 3600);
    if (content) chunks.push(`## ${fileName}\n${content}`);
  }
  for (const fileName of definition.knowledgeFiles) {
    const content = readAsset(`knowledge_base_zh/${fileName}`, 2800);
    if (content) chunks.push(`## ${fileName}\n${content}`);
  }
  const disciplineKnowledge = buildDisciplineKnowledge(profile);
  if (disciplineKnowledge) {
    chunks.push(`## 学科知识\n${disciplineKnowledge}`);
  }
  return chunks.join('\n\n').slice(0, maxContextChars);
}

function createPrompt(payload) {
  const panel = normalizePanel(payload.panel);
  const definition = panelDefinitions[panel];
  const profile = normalizeProfile(payload.profile);
  const userInput = normalizeString(payload.userInput, 8000);
  const sourceText = normalizeString(payload.sourceText, maxSourceChars);
  const panelResults = normalizePanelResults(payload.panelResults);
  const chapters = normalizeChapters(payload.chapters);
  const activeChapterId = resolveActiveChapterId(payload.activeChapterId, chapters);
  const references = normalizeReferences(payload.references);
  const activeReferenceId = resolveActiveReferenceId(payload.activeReferenceId, references);
  const feedbackItems = normalizeFeedbackItems(payload.feedbackItems);
  const activeFeedbackId = resolveActiveFeedbackId(payload.activeFeedbackId, feedbackItems);
  const checkItems = normalizeCheckItems(payload.checkItems);
  const activeCheckId = resolveActiveCheckId(payload.activeCheckId, checkItems);
  const knowledgeContext = buildKnowledgeContext(panel, profile);
  const workflowContext = buildWorkflowContext(panel, panelResults);
  const chapterContext = buildChapterContext(panel, chapters, activeChapterId);
  const referenceContext = buildReferenceContext(panel, references, activeReferenceId);
  const feedbackContext = buildFeedbackContext(panel, feedbackItems, activeFeedbackId);
  const checkContext = buildCheckContext(panel, checkItems, activeCheckId);

  return [
    '你是“论文导师”模块的学术写作辅导助手。请使用中文，直接给出可执行成果。',
    '',
    '底线：',
    '1. 不编造文献、作者、DOI、统计结果、访谈对象、实验数据或学校规定。',
    '2. 涉及正文写作时，必须基于用户提供的真实文献和材料；材料不足处用“需补充：...”标注。',
    '3. 证据链中只有“已核验”的条目可作为正式引用；待核验、信息不完整、不可查/慎用的条目只能作为线索或用“待核验：...”标注。',
    '4. 查重和 AI 检测只提供合规修改、引用规范和表达自然化建议，不提供规避检测的方法。',
    '5. 输出要像导师批注和任务清单，少讲空话，多给下一步。',
    '',
    `当前二级模块：${definition.label}`,
    `模块目标：${definition.intent}`,
    '',
    '论文档案：',
    `- 学位：${profile.degree} / ${profile.degreeType}`,
    `- 专业方向：${profile.discipline || '未填写'} ${profile.direction || ''}`,
    `- 语种：${profile.language}`,
    `- 论文题目：${profile.title || '未定题'}`,
    `- 当前阶段：${profile.stage}`,
    `- 引用格式：${profile.citationFormat}`,
    `- 学校/学院要求：${profile.schoolRequirements || '未填写'}`,
    `- 导师偏好：${profile.advisorPreferences || '未填写'}`,
    `- 时间节点：${profile.milestones || '未填写'}`,
    `- 可用数据源：${profile.dataSources || '未填写'}`,
    `- 研究类型：${profile.researchType || '未确定'}`,
    `- 目标字数：${profile.targetWordCount || '未填写'}`,
    `- 成稿范围：${profile.writingScope || '章节初稿'}`,
    `- 数据/材料真实性说明：${profile.dataIntegrityNotes || '未填写'}`,
    `- 已定研究问题：${profile.researchQuestions || '未填写'}`,
    `- 方法/变量/样本条件：${profile.methodologyNotes || '未填写'}`,
    `- 论文目录或章节计划：${profile.outlinePlan || '未填写'}`,
    `- 已有文献线索：${profile.literatureNotes || '未填写'}`,
    '',
    '用户本次需求：',
    userInput || '请根据论文档案和当前模块，生成下一步建议。',
    '',
    '用户提供材料：',
    sourceText || '未提供材料。',
    '',
    '论文项目已沉淀的前序成果：',
    workflowContext,
    '',
    ...(referenceContext ? ['结构化文献与证据链：', referenceContext, ''] : []),
    ...(feedbackContext ? ['导师反馈闭环任务：', feedbackContext, ''] : []),
    ...(checkContext ? ['格式与查重检查清单：', checkContext, ''] : []),
    ...(chapterContext ? ['当前逐章写作上下文：', chapterContext, ''] : []),
    '可参考的内置方法论和知识库摘录：',
    knowledgeContext || '无。',
    '',
    '请按 Markdown 输出。若是启动诊断，输出“启动预检报告 + 风险清单 + 推荐路径 + 本周任务”，必须明确档案缺口、材料缺口、文献/数据真实性风险和下一步先后顺序。若是选题，给 3-5 个候选题并评估难度、创新性、资料充足度、风险。若是文献综述，给检索式、分类框架和综述写法。若是研究设计，给方法匹配、数据需求和风险。若是数据与实证，输出“数据真实性判断 + 样本/变量预检 + 可做分析 + 不建议做的分析 + 写作边界”，不得编造统计结果；没有真实数据时只能给数据需求和分析计划。若是图表与模型图，先判断适合的图类型，再至少输出 1 个 Mermaid 代码块（如 flowchart、graph、mindmap、timeline），并给“图名/图注 + 适用章节 + 图中节点解释 + 可修改项”；不得把未核验变量关系或数据结果画成确定结论，缺材料处用“待补充/待核验”标注。若是自动成稿，先输出“成稿前提检查 + 本次使用的材料 + 缺口标注规则”，再按用户指定范围生成可编辑论文初稿；不得编造文献、数据和统计结论，材料不足处用“需补充：...”或“待核验：...”标注。若是逐章写作或修改，先列材料使用情况，再给正文/批注，并标明使用了哪些证据条目和处理了哪些导师反馈。若是评审答辩，输出评分、问题清单、反馈拆解和答辩准备。若是格式查重，按“终稿质量门”输出可落地的检查清单、引用/证据核验问题、数据边界问题、重复表达/AI 味风险和合规修改建议，并对应已有检查项更新处理建议。',
  ].join('\n');
}

function createThesisTutorService({ app, aiService, configStore }) {
  const subscribers = new Set();
  let activeTask = null;

  const dir = () => ensureDir(getThesisTutorDir(app));
  const statePath = () => path.join(dir(), 'state.json');

  function loadState() {
    const state = fs.existsSync(statePath())
      ? safeJsonParse(fs.readFileSync(statePath(), 'utf-8'), initialState)
      : initialState;
    const normalized = cloneState(activeTask ? state : recoverInterruptedTask(state));
    if (!activeTask && state?.task?.status === 'running') {
      fs.writeFileSync(statePath(), JSON.stringify(normalized, null, 2), 'utf-8');
    }
    return normalized;
  }

  function broadcast(state = loadState()) {
    for (const webContents of subscribers) {
      if (!webContents || webContents.isDestroyed()) {
        subscribers.delete(webContents);
        continue;
      }
      webContents.send('thesis-tutor:event', state);
    }
  }

  function saveState(partial) {
    const nextState = cloneState({ ...loadState(), ...partial, updated_at: now() });
    fs.writeFileSync(statePath(), JSON.stringify(nextState, null, 2), 'utf-8');
    broadcast(nextState);
    return nextState;
  }

  function subscribe(webContents) {
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
    broadcast(loadState());
  }

  function ensureTextModelReady(actionName) {
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

  function updateActiveTask(patch) {
    if (!activeTask) return;
    activeTask = { ...activeTask, ...patch };
    saveState({ task: activeTask });
  }

  function startProgressPulse(panel) {
    const label = panelDefinitions[panel].label;
    const checkpoints = [
      { progress: 22, message: '正在读取论文档案与当前任务' },
      { progress: 34, message: `正在匹配${label}模板与输出结构` },
      { progress: 48, message: '正在筛选内置论文方法论与学科知识' },
      { progress: 62, message: '正在组织生成提纲和约束条件' },
      { progress: 76, message: '正在请求文本模型生成完整回复' },
      { progress: 88, message: '模型正在写作结果，请勿关闭窗口' },
      { progress: 94, message: '正在等待模型返回并整理结果' },
    ];
    let checkpointIndex = 0;
    let idleTick = 0;

    const timer = setInterval(() => {
      if (!activeTask || activeTask.status !== 'running') {
        clearInterval(timer);
        return;
      }

      const currentProgress = Number(activeTask.progress || 0);
      const checkpoint = checkpoints[checkpointIndex];
      if (checkpoint) {
        const step = currentProgress < 60 ? 4 : 3;
        const nextProgress = Math.min(checkpoint.progress, currentProgress + step);
        updateActiveTask({
          progress: nextProgress,
          message: checkpoint.message,
        });
        if (nextProgress >= checkpoint.progress) {
          checkpointIndex += 1;
        }
        return;
      }

      idleTick += 1;
      const waitingMessages = [
        '模型仍在生成完整内容，通常需要一点时间',
        '正在等待长文本返回，进度为阶段估算',
        '任务仍在进行，生成完成后会自动更新',
      ];
      updateActiveTask({
        progress: Math.min(96, currentProgress + (currentProgress < 96 ? 1 : 0)),
        message: waitingMessages[idleTick % waitingMessages.length],
      });
    }, 1200);

    return () => clearInterval(timer);
  }

  function saveProfile(profile) {
    const normalizedProfile = normalizeProfile(profile);
    const current = loadState();
    const currentChapters = normalizeChapters(current.chapters);
    const nextChapters = currentChapters.length ? currentChapters : inferChaptersFromOutline(normalizedProfile.outlinePlan);
    return saveState({
      profile: normalizedProfile,
      chapters: nextChapters,
      activeChapterId: resolveActiveChapterId(current.activeChapterId, nextChapters),
    });
  }

  function saveChapters(payload = {}) {
    const chapters = normalizeChapters(payload.chapters);
    return saveState({
      chapters,
      activeChapterId: resolveActiveChapterId(payload.activeChapterId, chapters),
    });
  }

  function saveReferences(payload = {}) {
    const references = normalizeReferences(payload.references);
    return saveState({
      references,
      activeReferenceId: resolveActiveReferenceId(payload.activeReferenceId, references),
    });
  }

  function saveFeedback(payload = {}) {
    const feedbackItems = normalizeFeedbackItems(payload.feedbackItems);
    return saveState({
      feedbackItems,
      activeFeedbackId: resolveActiveFeedbackId(payload.activeFeedbackId, feedbackItems),
    });
  }

  function saveChecks(payload = {}) {
    const checkItems = normalizeCheckItems(payload.checkItems);
    return saveState({
      checkItems,
      activeCheckId: resolveActiveCheckId(payload.activeCheckId, checkItems),
    });
  }

  function saveHistory(payload = {}) {
    const history = Array.isArray(payload.history)
      ? payload.history.map(normalizeHistoryItem).filter(Boolean).slice(0, 30)
      : loadState().history;
    return saveState({ history });
  }

  function saveProfileLock(payload = {}) {
    return saveState({ profileLocked: Boolean(payload.locked) });
  }

  function saveDraft(payload = {}) {
    const panel = normalizePanel(payload.panel || loadState().activePanel);
    const draft = String(payload.draft || '');
    const current = loadState();
    const chapters = normalizeChapters(payload.chapters).length ? normalizeChapters(payload.chapters) : current.chapters;
    const activeChapterId = resolveActiveChapterId(payload.activeChapterId || current.activeChapterId, chapters);
    const references = normalizeReferences(payload.references).length ? normalizeReferences(payload.references) : current.references;
    const activeReferenceId = resolveActiveReferenceId(payload.activeReferenceId || current.activeReferenceId, references);
    const feedbackItems = normalizeFeedbackItems(payload.feedbackItems).length ? normalizeFeedbackItems(payload.feedbackItems) : current.feedbackItems;
    const activeFeedbackId = resolveActiveFeedbackId(payload.activeFeedbackId || current.activeFeedbackId, feedbackItems);
    const checkItems = normalizeCheckItems(payload.checkItems).length ? normalizeCheckItems(payload.checkItems) : current.checkItems;
    const activeCheckId = resolveActiveCheckId(payload.activeCheckId || current.activeCheckId, checkItems);
    const nextChapters = (panel === 'writing' || panel === 'drafting') && draft.trim()
      ? upsertActiveChapter(chapters, activeChapterId, { draft, status: 'drafted' })
      : chapters;
    const nextPanelResults = { ...(current.panelResults || {}) };
    if (draft.trim()) {
      nextPanelResults[panel] = createPanelResult(panel, payload.userInput || nextPanelResults[panel]?.input || '', draft);
    }
    return saveState({
      activePanel: panel,
      draft,
      latestResult: draft || current.latestResult || '',
      sourceText: String(payload.sourceText || current.sourceText || '').slice(0, maxSourceChars),
      chapters: nextChapters,
      activeChapterId,
      references,
      activeReferenceId,
      feedbackItems,
      activeFeedbackId,
      checkItems,
      activeCheckId,
      panelResults: nextPanelResults,
    });
  }

  async function importSource() {
    const config = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
    const provider = config.file_parser?.provider || 'local';
    const result = await dialog.showOpenDialog({
      title: '选择论文材料、文献或草稿',
      properties: ['openFile'],
      filters: [
        { name: '论文材料', extensions: ['docx', 'doc', 'pdf', 'md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择', state: loadState(), markdown: '' };
    }

    const filePath = result.filePaths[0];
    const parser = resolveFileParser(config, filePath);
    let markdown = '';
    try {
      markdown = (await parseDocumentWithConfig(app, filePath, config, {
        assetScope: 'thesis-tutor',
        preserveImages: false,
      })).trim();
    } catch (error) {
      return {
        success: false,
        message: error?.message || '当前解析方式不支持该文件格式',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
        markdown: '',
      };
    }

    if (!markdown) {
      return {
        success: false,
        message: '未提取到有效文本内容，请检查文件内容',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
        markdown: '',
      };
    }

    const nextState = saveState({
      sourceText: markdown.slice(0, maxSourceChars),
      importedSourceFileName: path.basename(filePath),
    });
    return {
      success: true,
      message: `已导入 ${path.basename(filePath)}`,
      fileName: path.basename(filePath),
      parserProvider: parser.provider || provider,
      state: nextState,
      markdown,
    };
  }

  async function generate(payload = {}) {
    if (activeTask) {
      throw new Error('论文导师正在生成中，请稍后再试');
    }
    ensureTextModelReady('生成论文导师回复');

    const panel = normalizePanel(payload.panel);
    const profile = normalizeProfile(payload.profile);
    const userInput = normalizeString(payload.userInput, 8000);
    const sourceText = normalizeString(payload.sourceText, maxSourceChars);
    const currentBeforeGenerate = loadState();
    const payloadChapters = normalizeChapters(payload.chapters);
    const chapters = payloadChapters.length ? payloadChapters : currentBeforeGenerate.chapters;
    const activeChapterId = resolveActiveChapterId(payload.activeChapterId || currentBeforeGenerate.activeChapterId, chapters);
    const payloadReferences = normalizeReferences(payload.references);
    const references = payloadReferences.length ? payloadReferences : currentBeforeGenerate.references;
    const activeReferenceId = resolveActiveReferenceId(payload.activeReferenceId || currentBeforeGenerate.activeReferenceId, references);
    const payloadFeedbackItems = normalizeFeedbackItems(payload.feedbackItems);
    const feedbackItems = payloadFeedbackItems.length ? payloadFeedbackItems : currentBeforeGenerate.feedbackItems;
    const activeFeedbackId = resolveActiveFeedbackId(payload.activeFeedbackId || currentBeforeGenerate.activeFeedbackId, feedbackItems);
    const payloadCheckItems = normalizeCheckItems(payload.checkItems);
    const checkItems = payloadCheckItems.length ? payloadCheckItems : currentBeforeGenerate.checkItems;
    const activeCheckId = resolveActiveCheckId(payload.activeCheckId || currentBeforeGenerate.activeCheckId, checkItems);
    const prompt = createPrompt({
      panel,
      profile,
      userInput,
      sourceText,
      panelResults: currentBeforeGenerate.panelResults,
      chapters,
      activeChapterId,
      references,
      activeReferenceId,
      feedbackItems,
      activeFeedbackId,
      checkItems,
      activeCheckId,
    });
    const task = {
      id: `thesis-tutor-${Date.now()}`,
      type: panel,
      status: 'running',
      progress: 12,
      message: `正在准备${panelDefinitions[panel].label}任务`,
      started_at: now(),
    };

    activeTask = task;
    saveState({ profile, activePanel: panel, sourceText, chapters, activeChapterId, references, activeReferenceId, feedbackItems, activeFeedbackId, checkItems, activeCheckId, task });
    const stopProgressPulse = startProgressPulse(panel);

    try {
      updateActiveTask({ progress: 18, message: '正在准备模型请求上下文' });
      const content = await aiService.chat({
        messages: [
          { role: 'system', content: '你是严格、可靠、材料优先的中文论文导师。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        logTitle: `论文导师-${panelDefinitions[panel].label}`,
      });
      stopProgressPulse();
      const result = String(content || '').trim();
      const current = loadState();
      const nextPanelResults = {
        ...(current.panelResults || {}),
        [panel]: createPanelResult(panel, userInput, result),
      };
      const nextChapters = (panel === 'writing' || panel === 'drafting') && result
        ? upsertActiveChapter(chapters, activeChapterId, { draft: result, status: 'drafted' })
        : chapters;
      const finalTask = {
        ...(activeTask || task),
        status: 'success',
        progress: 100,
        message: `${panelDefinitions[panel].label}已完成`,
        finished_at: now(),
      };
      activeTask = null;
      return saveState({
        profile,
        activePanel: panel,
        sourceText,
        latestResult: result,
        draft: result,
        chapters: nextChapters,
        activeChapterId,
        references,
        activeReferenceId,
        feedbackItems,
        activeFeedbackId,
        checkItems,
        activeCheckId,
        panelResults: nextPanelResults,
        history: [createHistoryItem(panel, userInput, result), ...(current.history || [])].slice(0, 30),
        task: finalTask,
      });
    } catch (error) {
      stopProgressPulse();
      const failedTask = {
        ...(activeTask || task),
        status: 'error',
        progress: 100,
        message: error?.message || '论文导师生成失败',
        finished_at: now(),
      };
      activeTask = null;
      saveState({ profile, activePanel: panel, sourceText, chapters, activeChapterId, references, activeReferenceId, feedbackItems, activeFeedbackId, checkItems, activeCheckId, task: failedTask });
      throw error;
    }
  }

  function clear() {
    const nextState = cloneState(initialState);
    fs.writeFileSync(statePath(), JSON.stringify(nextState, null, 2), 'utf-8');
    broadcast(nextState);
    return { success: true, state: nextState };
  }

  async function exportWorkspace() {
    const state = loadState();
    const dateText = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog({
      title: '导出论文导师工作区备份',
      defaultPath: `论文导师工作区-${dateText}.json`,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    const payload = {
      schema: workspaceExportSchema,
      version: 1,
      exported_at: now(),
      state,
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return {
      success: true,
      canceled: false,
      message: `已导出 ${path.basename(result.filePath)}`,
      fileName: path.basename(result.filePath),
      filePath: result.filePath,
      state,
    };
  }

  async function exportProjectPackage() {
    const state = loadState();
    const dateText = new Date().toISOString().slice(0, 10);
    const profile = normalizeProfile(state.profile);
    const result = await dialog.showSaveDialog({
      title: '导出论文导师项目包',
      defaultPath: `${safeFileName(profile.title, '论文导师项目包')}-${dateText}.zip`,
      filters: [
        { name: 'ZIP 压缩包', extensions: ['zip'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, message: '已取消导出', state };
    }

    const zip = new AdmZip();
    for (const [fileName, content] of buildProjectPackageFiles(state)) {
      zip.addFile(fileName, Buffer.from(String(content || ''), 'utf-8'));
    }
    zip.writeZip(result.filePath);

    return {
      success: true,
      canceled: false,
      message: `已导出 ${path.basename(result.filePath)}`,
      fileName: path.basename(result.filePath),
      filePath: result.filePath,
      state,
    };
  }

  async function importWorkspace() {
    const currentState = loadState();
    const result = await dialog.showOpenDialog({
      title: '导入论文导师工作区备份或项目包',
      properties: ['openFile'],
      filters: [
        { name: '论文导师备份/项目包', extensions: ['json', 'zip'] },
        { name: 'JSON 文件', extensions: ['json'] },
        { name: 'ZIP 项目包', extensions: ['zip'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true, message: '已取消导入', state: currentState };
    }

    const filePath = result.filePaths[0];
    try {
      const importedState = parseWorkspaceImportFile(filePath);
      const nextState = cloneState({
        ...initialState,
        ...importedState,
        task: undefined,
        updated_at: now(),
      });
      fs.writeFileSync(statePath(), JSON.stringify(nextState, null, 2), 'utf-8');
      broadcast(nextState);
      return {
        success: true,
        canceled: false,
        message: `已导入 ${path.basename(filePath)}`,
        fileName: path.basename(filePath),
        state: nextState,
      };
    } catch (error) {
      return {
        success: false,
        canceled: false,
        message: error?.message || '导入论文导师工作区失败',
        fileName: path.basename(filePath),
        state: currentState,
      };
    }
  }

  return {
    loadState,
    saveProfile,
    saveChapters,
    saveReferences,
    saveFeedback,
    saveChecks,
    saveHistory,
    saveProfileLock,
    saveDraft,
    importSource,
    exportWorkspace,
    exportProjectPackage,
    importWorkspace,
    generate,
    clear,
    subscribe,
  };
}

module.exports = {
  createThesisTutorService,
  panelDefinitions,
};
