export type GrantApplicationPanel = 'diagnosis' | 'topic-policy' | 'proposal' | 'review-defense';

export type GrantProposalModuleKey =
  | 'project_name'
  | 'background'
  | 'goals'
  | 'content'
  | 'methods'
  | 'innovation'
  | 'plan'
  | 'outcomes'
  | 'foundation'
  | 'guarantee';

export interface GrantApplicationProfile {
  level: string;
  discipline: string;
  direction: string;
  stage: string;
  deadline: string;
  sourceNotes: string;
}

export interface GrantApplicationPanelInput {
  taskText: string;
  materialText: string;
}

export interface GrantProposalVisualSettings {
  useAiImage: boolean;
  useTechnicalDiagram: boolean;
  useMermaid: boolean;
}

export interface GrantProposalModuleQuality {
  status: 'unchecked' | 'pass' | 'warning' | 'risk';
  score: number;
  summary: string;
  report: string;
  checked_at?: string;
}

export interface GrantProposalFinalReview {
  status: 'unchecked' | 'pass' | 'warning' | 'risk';
  score: number;
  summary: string;
  report: string;
  checked_at?: string;
}

export interface GrantFormFieldItem {
  key: string;
  label: string;
  content: string;
  status: 'ready' | 'missing' | 'verify' | 'too_long';
  note: string;
  length: number;
}

export interface GrantFormFieldMapping {
  profile: {
    level: string;
    discipline: string;
    direction: string;
    stage: string;
    deadline: string;
  };
  fields: GrantFormFieldItem[];
  summary: {
    total: number;
    ready: number;
    missing: number;
    verify: number;
    too_long: number;
  };
  updated_at: string;
}

export interface GrantTemplateSection {
  id: string;
  title: string;
  instruction: string;
  matchedFieldKey: string;
  matchedFieldLabel: string;
  status: 'matched' | 'missing' | 'unmatched' | 'verify' | 'too_long';
  content: string;
  note: string;
  length: number;
}

export interface GrantProposalTemplateMapping {
  fileName: string;
  sourceFilePath?: string;
  imported_at: string;
  sections: GrantTemplateSection[];
  summary: {
    total: number;
    matched: number;
    missing: number;
    unmatched: number;
    verify: number;
    too_long: number;
  };
  rawMarkdown?: string;
}

export interface GrantTemplateFillReport {
  filePath: string;
  generated_at: string;
  total: number;
  filled: number;
  skipped: number;
  items: Array<{
    title: string;
    status: 'filled' | 'skipped';
    message: string;
  }>;
}


export interface GrantApplicationTaskState {
  id: string;
  type: GrantApplicationPanel;
  status: 'running' | 'success' | 'error';
  progress: number;
  message: string;
  started_at?: string;
  finished_at?: string;
  stats?: Record<string, unknown>;
}

export interface GrantApplicationProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  isActive?: boolean;
  isLegacy?: boolean;
}

export interface GrantApplicationProjectList {
  activeProjectId: string;
  projects: GrantApplicationProject[];
}

export interface GrantApplicationState {
  projectId?: string;
  projectName?: string;
  profile: GrantApplicationProfile;
  activePanel: GrantApplicationPanel;
  inputs: Record<GrantApplicationPanel, GrantApplicationPanelInput>;
  outputs: Record<GrantApplicationPanel, string>;
  proposalModules: Record<GrantProposalModuleKey, string>;
  proposalVisualSettings: GrantProposalVisualSettings;
  proposalModuleQualityChecks: Record<GrantProposalModuleKey, GrantProposalModuleQuality>;
  proposalFinalReview: GrantProposalFinalReview;
  reviewDefenseReport?: string;
  proposalTemplateMapping?: GrantProposalTemplateMapping;
  proposalTemplateFillReport?: GrantTemplateFillReport;
  task?: GrantApplicationTaskState;
  updated_at?: string;
}
