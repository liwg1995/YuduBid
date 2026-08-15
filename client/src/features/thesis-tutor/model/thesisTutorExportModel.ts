import type {
  ThesisTutorChapter,
  ThesisTutorCheckItem,
  ThesisTutorFeedbackItem,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorReference,
} from '../types';
import {
  chapterStatusOptions,
  checkCategoryOptions,
  checkSeverityOptions,
  checkStatusOptions,
  feedbackPriorityOptions,
  feedbackStatusOptions,
  referenceTypeOptions,
  referenceVerificationOptions,
} from './thesisTutorWorkspaceOptions';
import { panelCopy } from './thesisTutorPanelConfig';
import { truncateExportText } from './thesisTutorWorkspaceModel';

function getOptionLabel<TValue extends string>(options: Array<{ value: TValue; label: string }>, value: TValue | string) {
  return options.find((item) => item.value === value)?.label || value || '未填写';
}

export function buildProfileExportMarkdown(profile: ThesisTutorProfile, panel: ThesisTutorPanel, userInput: string, sourceText: string) {
  const rows = [
    ['学位/类型', `${profile.degree || '未填写'} / ${profile.degreeType || '未填写'}`],
    ['专业方向', `${profile.discipline || '未填写'}${profile.direction ? ` / ${profile.direction}` : ''}`],
    ['语种', profile.language || '未填写'],
    ['当前阶段', profile.stage || '未填写'],
    ['引用格式', profile.citationFormat || '未填写'],
    ['论文题目', profile.title || '未定题'],
    ['学校/学院要求', profile.schoolRequirements || '未填写'],
    ['导师偏好', profile.advisorPreferences || '未填写'],
    ['时间节点', profile.milestones || '未填写'],
    ['可用数据源', profile.dataSources || '未填写'],
    ['研究类型', profile.researchType || '未确定'],
    ['目标字数', profile.targetWordCount || '未填写'],
    ['成稿范围', profile.writingScope || '章节初稿'],
    ['数据/材料真实性说明', profile.dataIntegrityNotes || '未填写'],
    ['已定研究问题', profile.researchQuestions || '未填写'],
    ['方法/变量/样本条件', profile.methodologyNotes || '未填写'],
    ['论文目录或章节计划', profile.outlinePlan || '未填写'],
    ['已有文献线索', profile.literatureNotes || '未填写'],
  ];
  return [
    `本次导出模块：${panelCopy[panel].label}`,
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${String(value).replace(/\n/g, '<br>')} |`),
    '',
    '## 本次需求',
    userInput.trim() || '未填写。',
    '',
    '## 材料摘要',
    sourceText.trim() ? truncateExportText(sourceText, 1800) : '未提供材料。',
  ].join('\n');
}

export function buildChapterExportMarkdown(chapters: ThesisTutorChapter[], activeChapterId: string) {
  if (!chapters.length) return '';
  return chapters.map((chapter, index) => [
    `## ${index + 1}. ${chapter.title}${chapter.id === activeChapterId ? '（当前章节）' : ''}`,
    `- 状态：${getOptionLabel(chapterStatusOptions, chapter.status)}`,
    `- 本章目标：${chapter.goal || '未填写'}`,
    `- 导师反馈/修改要求：${chapter.advisorFeedback || '未填写'}`,
    '',
    chapter.material ? `### 本章材料\n${truncateExportText(chapter.material, 1200)}` : '',
    chapter.draft ? `### 已保存草稿\n${truncateExportText(chapter.draft, 1800)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function buildReferenceExportMarkdown(references: ThesisTutorReference[]) {
  if (!references.length) return '';
  return references.map((reference, index) => [
    `## ${index + 1}. ${reference.title}`,
    `- 类型：${getOptionLabel(referenceTypeOptions, reference.type)}`,
    `- 核验状态：${getOptionLabel(referenceVerificationOptions, reference.verificationStatus)}`,
    `- 作者/机构：${reference.authors || '未填写'}`,
    `- 年份：${reference.year || '未填写'}`,
    `- 来源：${reference.source || '未填写'}`,
    `- 关键词：${reference.keywords || '未填写'}`,
    `- 规范引用/出处：${reference.citation || '未填写'}`,
    `- 核验来源：${reference.verificationSource || '未填写'}`,
    `- 核验备注：${reference.verificationNotes || '未填写'}`,
    '',
    reference.summary ? `### 摘要/证据内容\n${truncateExportText(reference.summary, 1400)}` : '',
    reference.keyPoints ? `### 可用观点/写作用途\n${truncateExportText(reference.keyPoints, 1200)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function buildFeedbackExportMarkdown(feedbackItems: ThesisTutorFeedbackItem[]) {
  if (!feedbackItems.length) return '';
  return feedbackItems.map((item, index) => [
    `## ${index + 1}. ${item.title}`,
    `- 来源：${item.source || '未填写'}`,
    `- 优先级：${getOptionLabel(feedbackPriorityOptions, item.priority)}`,
    `- 状态：${getOptionLabel(feedbackStatusOptions, item.status)}`,
    '',
    item.originalFeedback ? `### 原始意见\n${truncateExportText(item.originalFeedback, 1200)}` : '',
    item.actionPlan ? `### 处理方案\n${truncateExportText(item.actionPlan, 1200)}` : '',
    item.revisionNotes ? `### 修改记录\n${truncateExportText(item.revisionNotes, 1200)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function buildCheckExportMarkdown(checkItems: ThesisTutorCheckItem[]) {
  if (!checkItems.length) return '';
  return checkItems.map((item, index) => [
    `## ${index + 1}. ${item.title}`,
    `- 分类：${getOptionLabel(checkCategoryOptions, item.category)}`,
    `- 严重级别：${getOptionLabel(checkSeverityOptions, item.severity)}`,
    `- 状态：${getOptionLabel(checkStatusOptions, item.status)}`,
    `- 位置：${item.location || '未填写'}`,
    '',
    item.issue ? `### 问题描述\n${truncateExportText(item.issue, 1000)}` : '',
    item.suggestion ? `### 修改建议\n${truncateExportText(item.suggestion, 1000)}` : '',
    item.revisionNotes ? `### 修改记录\n${truncateExportText(item.revisionNotes, 1000)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}
