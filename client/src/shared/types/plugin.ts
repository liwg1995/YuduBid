export type PluginRuntimeStatus = 'stopped' | 'running' | 'error';

export interface InstalledPluginRecord {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  publisher: { id: string; name: string };
  license: string;
  permissions: string[];
  contributes?: {
    menu?: {
      id: string;
      label: string;
      description: string;
    };
  };
  enabled: boolean;
  status: PluginRuntimeStatus;
  lastError: string;
  installedAt?: string;
  updatedAt?: string;
}

export interface PluginMutationResult {
  success: boolean;
  canceled?: boolean;
  plugin?: InstalledPluginRecord | null;
  plugins: InstalledPluginRecord[];
}

export interface PluginEvent {
  type: 'installed' | 'enabled' | 'disabled' | 'uninstalled' | 'status-changed' | 'error' | 'navigation-requested' | 'workspace-changed';
  pluginId: string;
  plugin: InstalledPluginRecord | null;
  sectionId?: string;
  workflowKind?: 'technical-plan' | 'existing-plan-expansion';
  projectId?: string;
  viewId?: 'document-analysis' | 'bid-analysis' | 'outline-generation' | 'global-facts' | 'content-edit' | 'expand';
  panelId?: 'outline-generation-config';
}

export interface PluginNavigationTarget {
  requestId: number;
  sectionId: string;
  workflowKind?: 'technical-plan' | 'existing-plan-expansion';
  projectId?: string;
  viewId?: 'document-analysis' | 'bid-analysis' | 'outline-generation' | 'global-facts' | 'content-edit' | 'expand';
  panelId?: 'outline-generation-config';
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
  presentation?: AssistantMessagePresentation;
}

export interface AssistantProgressItem {
  label: string;
  detail: string;
  status: 'idle' | 'pending' | 'running' | 'paused' | 'success' | 'error';
  value?: number;
}

export interface AssistantProgressPresentation {
  kind: 'progress';
  title: string;
  items: AssistantProgressItem[];
}

export interface AssistantProjectOption {
  id: string;
  name: string;
  isActive?: boolean;
  workflowKind?: 'technical-plan' | 'existing-plan-expansion';
}

export interface AssistantProjectSelectionPresentation {
  kind: 'project-selection';
  title: string;
  workflowKind: 'technical-plan' | 'existing-plan-expansion';
  projects: AssistantProjectOption[];
}

export interface AssistantProjectDeleteConfirmationPresentation {
  kind: 'project-delete-confirmation';
  title: string;
  workflowKind: 'technical-plan' | 'existing-plan-expansion';
  project: AssistantProjectOption;
}

export interface AssistantOpportunityOption {
  id: string;
  title: string;
  status: 'new' | 'review' | 'following' | 'won' | 'abandoned' | 'archived';
  owner?: string;
  deadline?: string;
  selected?: boolean;
}

export interface AssistantOpportunitySelectionPresentation {
  kind: 'opportunity-selection';
  title: string;
  opportunities: AssistantOpportunityOption[];
}

export interface AssistantOpportunityActionConfirmationPresentation {
  kind: 'opportunity-action-confirmation';
  title: string;
  description: string;
  action: 'file-import' | 'tender-import' | 'status-update' | 'analysis-start' | 'handoff' | 'source-scan';
  opportunity?: Pick<AssistantOpportunityOption, 'id' | 'title'> | null;
  value?: string;
  confirmLabel: string;
}

export type AssistantOpportunityWorkflowStage = 'discovery' | 'screening' | 'qualification' | 'decision' | 'bidding' | 'closed';
export type AssistantOpportunityDecisionOutcome = 'undecided' | 'bid' | 'no_bid';

export interface AssistantOpportunityDecisionConfigurationPresentation {
  kind: 'opportunity-decision-configuration';
  title: string;
  opportunity: Pick<AssistantOpportunityOption, 'id' | 'title'>;
  workflowStage: AssistantOpportunityWorkflowStage;
  decisionOutcome: AssistantOpportunityDecisionOutcome;
  decisionReason: string;
  decisionDueAt: string;
  nextAction: string;
  nextActionDueAt: string;
}

export interface AssistantOpportunityBulkConfigurationPresentation {
  kind: 'opportunity-bulk-configuration';
  title: string;
  opportunities: Array<Pick<AssistantOpportunityOption, 'id' | 'title' | 'status' | 'owner'>>;
  selectedIds: string[];
  status: string;
  owner: string;
}

export interface AssistantActionPresentation {
  kind: 'file-request' | 'action-confirmation';
  title: string;
  description: string;
  actionId: 'technical-plan.import-tender' | 'technical-plan.analysis.start' | 'technical-plan.global-facts.start'
    | 'duplicate-check.import-tender' | 'duplicate-check.import-bids' | 'duplicate-check.analysis.start'
    | 'rejection-check.import-tender' | 'rejection-check.import-bids' | 'rejection-check.extraction.start';
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'primary' | 'danger';
}

export interface AssistantRejectionCheckConfigurationPresentation {
  kind: 'rejection-check-configuration';
  title: string;
  checks: {
    rejection: boolean;
    typo: boolean;
    logic: boolean;
  };
}

export interface AssistantKnowledgeUploadConfigurationPresentation {
  kind: 'knowledge-upload-configuration';
  title: string;
  selectedFolderId: string;
  folders: Array<{ id: string; name: string; documentCount: number }>;
}

export interface AssistantKnowledgeTargetConfirmationPresentation {
  kind: 'knowledge-target-confirmation';
  title: string;
  action: 'folder-delete' | 'document-delete' | 'document-match';
  target: { id: string; name: string; documentCount: number };
}

export type AssistantOutlineMode = 'free' | 'aligned' | 'response-file';

export interface AssistantOutlineKnowledgeDocument {
  id: string;
  name: string;
  folderName: string;
  itemCount: number;
}

export interface AssistantOutlineConfigurationPresentation {
  kind: 'outline-configuration';
  title: string;
  project: AssistantProjectOption;
  selectedMode: AssistantOutlineMode;
  selectedDocumentIds: string[];
  documents: AssistantOutlineKnowledgeDocument[];
}

export type AssistantMessagePresentation = AssistantProgressPresentation | AssistantProjectSelectionPresentation | AssistantProjectDeleteConfirmationPresentation | AssistantOpportunitySelectionPresentation | AssistantOpportunityActionConfirmationPresentation | AssistantOpportunityDecisionConfigurationPresentation | AssistantOpportunityBulkConfigurationPresentation | AssistantActionPresentation | AssistantOutlineConfigurationPresentation | AssistantRejectionCheckConfigurationPresentation | AssistantKnowledgeUploadConfigurationPresentation | AssistantKnowledgeTargetConfirmationPresentation;

export interface AssistantNavigationContext {
  sectionId: string;
  title: string;
  description: string;
}

export interface AssistantChatResult {
  selectedProject?: AssistantProjectOption;
  selectedOpportunity?: Pick<AssistantOpportunityOption, 'id' | 'title'> | null;
  message: {
    role: 'assistant';
    content: string;
    presentation?: AssistantMessagePresentation;
  };
}

export interface AssistantHistoryResult {
  messages: AssistantChatMessage[];
  selectedProject?: AssistantProjectOption | null;
  selectedOpportunity?: Pick<AssistantOpportunityOption, 'id' | 'title'> | null;
}

export interface AssistantProjectSelectionResult {
  messages: AssistantChatMessage[];
  selectedProject: AssistantProjectOption;
}

export interface AssistantProjectDeleteResult {
  messages: AssistantChatMessage[];
  selectedProject?: AssistantProjectOption | null;
  deletedProject?: AssistantProjectOption;
}

export interface AssistantActionResult {
  messages: AssistantChatMessage[];
  selectedProject?: AssistantProjectOption | null;
  selectedOpportunity?: Pick<AssistantOpportunityOption, 'id' | 'title'> | null;
}

export interface AssistantOpportunitySelectionResult {
  messages: AssistantChatMessage[];
  selectedOpportunity: Pick<AssistantOpportunityOption, 'id' | 'title'>;
}
