import type { WordExportProgressEvent } from '../../../shared/types/ipc';

export interface ThesisTutorOperationProgress {
  requestId: string;
  phase: WordExportProgressEvent['phase'];
  progress: number;
  message: string;
}

export type { ThesisTutorChartTemplate } from './thesisTutorChartTemplates';
export type { ThesisTutorPanelCopy } from './thesisTutorPanelConfig';
export type {
  ThesisTutorDataPreflight,
  ThesisTutorDraftingPreflight,
  ThesisTutorFinalReviewGate,
} from './thesisTutorPreflightModel';

export { chartTemplates } from './thesisTutorChartTemplates';
export {
  citationOptions,
  defaultProfile,
  degreeOptions,
  degreeTypeOptions,
  panelCopy,
  panelOrder,
  profileUsageByPanel,
  researchTypeOptions,
  stageOptions,
  thesisTutorFlowModules,
  thesisTutorNoticeItems,
  thesisTutorUsageSteps,
  writingScopeOptions,
} from './thesisTutorPanelConfig';
export {
  chapterStatusOptions,
  checkCategoryOptions,
  checkSeverityOptions,
  checkStatusOptions,
  feedbackEnabledPanels,
  feedbackPriorityOptions,
  feedbackStatusOptions,
  referenceEnabledPanels,
  referenceTypeOptions,
  referenceVerificationOptions,
} from './thesisTutorWorkspaceOptions';

export {
  buildDataPreflight,
  buildDraftingPreflight,
  buildFinalReviewGate,
} from './thesisTutorPreflightModel';
export {
  buildChapterExportMarkdown,
  buildCheckExportMarkdown,
  buildFeedbackExportMarkdown,
  buildProfileExportMarkdown,
  buildReferenceExportMarkdown,
} from './thesisTutorExportModel';
export {
  appendMaterial,
  createLocalChapter,
  createLocalCheckItem,
  createLocalFeedback,
  createLocalReference,
  extractResultTitle,
  getNextPanel,
  parseOutlinePlanToChapters,
  splitMaterialBlocks,
  toMarkdownList,
  truncateExportText,
} from './thesisTutorWorkspaceModel';
