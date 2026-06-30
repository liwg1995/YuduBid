export type ThesisTutorPanel =
  | 'diagnosis'
  | 'topic'
  | 'literature'
  | 'methodology'
  | 'writing'
  | 'review'
  | 'format';

export interface ThesisTutorProfile {
  degree: string;
  degreeType: string;
  discipline: string;
  direction: string;
  language: string;
  title: string;
  stage: string;
  citationFormat: string;
  schoolRequirements: string;
  advisorPreferences: string;
  milestones: string;
  dataSources: string;
  researchQuestions: string;
  methodologyNotes: string;
  outlinePlan: string;
  literatureNotes: string;
}

export interface ThesisTutorHistoryItem {
  id: string;
  panel: ThesisTutorPanel;
  panelLabel: string;
  title: string;
  customTitle?: string;
  important?: boolean;
  input: string;
  content: string;
  created_at: string;
}

export interface ThesisTutorTask {
  id: string;
  type: ThesisTutorPanel;
  status: 'running' | 'success' | 'error';
  progress: number;
  message: string;
  started_at?: string;
  finished_at?: string;
}

export interface ThesisTutorPanelResult {
  panel: ThesisTutorPanel;
  panelLabel: string;
  input: string;
  content: string;
  updated_at: string;
}

export type ThesisTutorChapterStatus = 'not_started' | 'writing' | 'drafted' | 'needs_revision' | 'done';

export interface ThesisTutorChapter {
  id: string;
  title: string;
  status: ThesisTutorChapterStatus;
  goal: string;
  material: string;
  advisorFeedback: string;
  draft: string;
  updated_at: string;
}

export type ThesisTutorReferenceType = 'literature' | 'policy' | 'case' | 'data' | 'quote' | 'other';

export interface ThesisTutorReference {
  id: string;
  type: ThesisTutorReferenceType;
  title: string;
  authors: string;
  year: string;
  source: string;
  citation: string;
  keywords: string;
  summary: string;
  keyPoints: string;
  relatedChapterIds: string[];
  updated_at: string;
}

export type ThesisTutorFeedbackStatus = 'todo' | 'doing' | 'done' | 'deferred';

export type ThesisTutorFeedbackPriority = 'high' | 'medium' | 'low';

export interface ThesisTutorFeedbackItem {
  id: string;
  title: string;
  source: string;
  priority: ThesisTutorFeedbackPriority;
  status: ThesisTutorFeedbackStatus;
  relatedChapterIds: string[];
  originalFeedback: string;
  actionPlan: string;
  revisionNotes: string;
  updated_at: string;
}

export type ThesisTutorCheckCategory = 'format' | 'citation' | 'duplication' | 'ai_tone' | 'logic' | 'other';

export type ThesisTutorCheckStatus = 'unchecked' | 'issue_found' | 'fixed' | 'ignored';

export type ThesisTutorCheckSeverity = 'high' | 'medium' | 'low';

export interface ThesisTutorCheckItem {
  id: string;
  category: ThesisTutorCheckCategory;
  title: string;
  status: ThesisTutorCheckStatus;
  severity: ThesisTutorCheckSeverity;
  location: string;
  issue: string;
  suggestion: string;
  revisionNotes: string;
  updated_at: string;
}

export interface ThesisTutorState {
  profile: ThesisTutorProfile;
  activePanel: ThesisTutorPanel;
  sourceText: string;
  importedSourceFileName: string;
  latestResult: string;
  draft: string;
  chapters: ThesisTutorChapter[];
  activeChapterId: string;
  references: ThesisTutorReference[];
  activeReferenceId: string;
  feedbackItems: ThesisTutorFeedbackItem[];
  activeFeedbackId: string;
  checkItems: ThesisTutorCheckItem[];
  activeCheckId: string;
  profileLocked?: boolean;
  panelResults: Partial<Record<ThesisTutorPanel, ThesisTutorPanelResult>>;
  history: ThesisTutorHistoryItem[];
  task?: ThesisTutorTask;
  updated_at: string;
}

export interface ThesisTutorGeneratePayload {
  panel: ThesisTutorPanel;
  profile: ThesisTutorProfile;
  userInput: string;
  sourceText: string;
  chapters?: ThesisTutorChapter[];
  activeChapterId?: string;
  references?: ThesisTutorReference[];
  activeReferenceId?: string;
  feedbackItems?: ThesisTutorFeedbackItem[];
  activeFeedbackId?: string;
  checkItems?: ThesisTutorCheckItem[];
  activeCheckId?: string;
}

export interface ThesisTutorImportSourceResult {
  success: boolean;
  message?: string;
  fileName?: string;
  parserProvider?: string;
  state: ThesisTutorState;
  markdown: string;
}

export interface ThesisTutorWorkspaceTransferResult {
  success: boolean;
  canceled?: boolean;
  message?: string;
  fileName?: string;
  filePath?: string;
  state: ThesisTutorState;
}
