import type {
  ThesisTutorChapterStatus,
  ThesisTutorCheckCategory,
  ThesisTutorCheckSeverity,
  ThesisTutorCheckStatus,
  ThesisTutorFeedbackPriority,
  ThesisTutorFeedbackStatus,
  ThesisTutorPanel,
  ThesisTutorReferenceType,
  ThesisTutorReferenceVerificationStatus,
} from '../types';

export const chapterStatusOptions: Array<{ value: ThesisTutorChapterStatus; label: string }> = [
  { value: 'not_started', label: '未开始' },
  { value: 'writing', label: '写作中' },
  { value: 'drafted', label: '已有初稿' },
  { value: 'needs_revision', label: '需修改' },
  { value: 'done', label: '已完成' },
];
export const referenceTypeOptions: Array<{ value: ThesisTutorReferenceType; label: string }> = [
  { value: 'literature', label: '文献' },
  { value: 'policy', label: '政策/规范' },
  { value: 'case', label: '案例' },
  { value: 'data', label: '数据' },
  { value: 'quote', label: '原文摘录' },
  { value: 'other', label: '其他' },
];

export const referenceVerificationOptions: Array<{ value: ThesisTutorReferenceVerificationStatus; label: string }> = [
  { value: 'unverified', label: '待核验' },
  { value: 'verified', label: '已核验' },
  { value: 'partial', label: '信息不完整' },
  { value: 'invalid', label: '不可查/慎用' },
];

export const referenceEnabledPanels = new Set<ThesisTutorPanel>(['literature', 'charts', 'drafting', 'writing', 'review', 'format']);
export const feedbackEnabledPanels = new Set<ThesisTutorPanel>(['drafting', 'writing', 'review', 'format']);

export const feedbackStatusOptions: Array<{ value: ThesisTutorFeedbackStatus; label: string }> = [
  { value: 'todo', label: '待处理' },
  { value: 'doing', label: '处理中' },
  { value: 'done', label: '已完成' },
  { value: 'deferred', label: '暂缓' },
];

export const feedbackPriorityOptions: Array<{ value: ThesisTutorFeedbackPriority; label: string }> = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

export const checkCategoryOptions: Array<{ value: ThesisTutorCheckCategory; label: string }> = [
  { value: 'format', label: '格式' },
  { value: 'citation', label: '引用' },
  { value: 'duplication', label: '重复表达' },
  { value: 'ai_tone', label: 'AI 味' },
  { value: 'logic', label: '逻辑' },
  { value: 'other', label: '其他' },
];

export const checkStatusOptions: Array<{ value: ThesisTutorCheckStatus; label: string }> = [
  { value: 'unchecked', label: '未检查' },
  { value: 'issue_found', label: '发现问题' },
  { value: 'fixed', label: '已修正' },
  { value: 'ignored', label: '暂不处理' },
];

export const checkSeverityOptions: Array<{ value: ThesisTutorCheckSeverity; label: string }> = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];
