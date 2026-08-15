import type {
  ThesisTutorChapter,
  ThesisTutorCheckItem,
  ThesisTutorFeedbackItem,
  ThesisTutorPanel,
  ThesisTutorReference,
} from '../types';
import { panelOrder } from './thesisTutorPanelConfig';

export function truncateExportText(value: string, maxLength = 2500) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n> 后续内容较长，已在导出上下文中截断；完整内容请回到论文导师工作区查看。`;
}

export function toMarkdownList(items: string[]) {
  return items.filter(Boolean).map((item) => `- ${item}`).join('\n') || '- 暂无';
}

export function getNextPanel(currentPanel: ThesisTutorPanel) {
  const currentIndex = panelOrder.indexOf(currentPanel);
  return currentIndex >= 0 && currentIndex < panelOrder.length - 1
    ? panelOrder[currentIndex + 1]
    : null;
}

export function extractResultTitle(content: string) {
  const line = String(content || '')
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^#+\s*/, '').replace(/^[-*\d.、\s]+/, ''))
    .find((item) => item && item.length <= 80);
  return line || '';
}

export function splitMaterialBlocks(content: string) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const roughBlocks = normalized
    .split(/\n{2,}|(?=\n#{1,4}\s)|(?=\n\s*[-*]\s+)|(?=\n\s*\d+[.、]\s+)/g)
    .map((item) => item.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.、]\s+/, '').trim())
    .filter((item) => item.length >= 12);
  const blocks = roughBlocks.length ? roughBlocks : [normalized];
  return blocks.slice(0, 8);
}

export function appendMaterial(current: string, addition: string) {
  const left = String(current || '').trim();
  const right = String(addition || '').trim();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
}

export function createLocalChapter(title = '新章节'): ThesisTutorChapter {
  const now = new Date().toISOString();
  return {
    id: `chapter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title,
    status: 'not_started',
    goal: '',
    material: '',
    advisorFeedback: '',
    draft: '',
    updated_at: now,
  };
}

export function createLocalReference(title = '新证据条目'): ThesisTutorReference {
  const now = new Date().toISOString();
  return {
    id: `ref-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'literature',
    verificationStatus: 'unverified',
    title,
    authors: '',
    year: '',
    source: '',
    citation: '',
    verificationSource: '',
    verificationNotes: '',
    keywords: '',
    summary: '',
    keyPoints: '',
    relatedChapterIds: [],
    updated_at: now,
  };
}

export function createLocalFeedback(title = '导师反馈任务'): ThesisTutorFeedbackItem {
  const now = new Date().toISOString();
  return {
    id: `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title,
    source: '',
    priority: 'medium',
    status: 'todo',
    relatedChapterIds: [],
    originalFeedback: '',
    actionPlan: '',
    revisionNotes: '',
    updated_at: now,
  };
}

export function createLocalCheckItem(title = '格式检查项'): ThesisTutorCheckItem {
  const now = new Date().toISOString();
  return {
    id: `check-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    category: 'format',
    title,
    status: 'unchecked',
    severity: 'medium',
    location: '',
    issue: '',
    suggestion: '',
    revisionNotes: '',
    updated_at: now,
  };
}

export function parseOutlinePlanToChapters(outlinePlan: string): ThesisTutorChapter[] {
  const lines = outlinePlan
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*+]\s*/, '').replace(/^\d+[.、]\s*/, ''))
    .filter(Boolean)
    .filter((line) => /第.{1,8}[章节篇]|chapter\s*\d+|\d+\.\d*|绪论|结论|文献综述|研究设计|研究方法|实证分析|案例分析/i.test(line));

  return Array.from(new Set(lines)).slice(0, 20).map((title) => createLocalChapter(title));
}
