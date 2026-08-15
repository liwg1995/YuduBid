export interface PresalesProjectProfile {
  projectName: string;
  customerName: string;
  industry: string;
  currentStage: string;
  opportunitySource: string;
  expectedValue: string;
  decisionDate: string;
  owner: string;
  keyBackground: string;
}

export interface PresalesMaterialItem {
  id: string;
  name: string;
  type: string;
  sourcePath?: string;
  summary?: string;
  importedAt: string;
}

export interface PresalesManualMaterialInput {
  title: string;
  customerBackground: string;
  meetingNotes: string;
  currentSituation: string;
  openQuestions: string;
}

export interface PresalesAnalysisInput {
  rawNotes: string;
  knownSystems: string;
  businessPainPoints: string;
  stakeholders: string;
  constraints: string;
}

export interface PresalesAnalysisResult {
  markdown: string;
  updatedAt: string;
}

export interface PresalesResearchInput {
  meetingGoal: string;
  attendeeInfo: string;
  knownQuestions: string;
  timeBox: string;
}

export interface PresalesResearchResult {
  markdown: string;
  updatedAt: string;
}

export interface PresalesArchitectureInput {
  solutionScope: string;
  architecturePreferences: string;
  integrationNotes: string;
  nonFunctionalRequirements: string;
  deliveryConstraints: string;
}

export interface PresalesArchitectureResult {
  markdown: string;
  updatedAt: string;
}

export interface PresalesDiagramInput {
  selectedDiagramTypes: string[];
  diagramFocus: string;
  styleRequirements: string;
}

export interface PresalesDiagramResult {
  markdown: string;
  updatedAt: string;
}

export interface PresalesPresentationInput {
  presentationType: string;
  pptStyle: string;
  deliveryMode: string;
  audience: string;
  pageCount: string;
  presentationGoal: string;
  emphasis: string;
}

export interface PresalesPresentationResult {
  markdown: string;
  updatedAt: string;
}

export interface PresalesExportRecord {
  id: string;
  type: 'pptx' | 'html' | 'word' | 'outline';
  fileName: string;
  filePath: string;
  exportedAt: string;
  pptStyle: string;
  deliveryMode: string;
  useAiVisuals: boolean;
  pageCount: number;
}

export interface PresalesTaskState {
  id: string;
  type: 'analysis' | 'research' | 'architecture' | 'diagrams' | 'presentation';
  status: 'running' | 'success' | 'error';
  progress: number;
  message: string;
  started_at?: string;
  finished_at?: string;
}

export interface PresalesProjectState {
  projectId: string;
  created_at: string;
  updated_at: string;
  profile: PresalesProjectProfile;
  materials: PresalesMaterialItem[];
  analysisInput: PresalesAnalysisInput;
  analysisResult: PresalesAnalysisResult;
  researchInput: PresalesResearchInput;
  researchResult: PresalesResearchResult;
  architectureInput: PresalesArchitectureInput;
  architectureResult: PresalesArchitectureResult;
  diagramInput: PresalesDiagramInput;
  diagramResult: PresalesDiagramResult;
  presentationInput: PresalesPresentationInput;
  presentationResult: PresalesPresentationResult;
  exportRecords: PresalesExportRecord[];
  latestPrompt: string;
  task?: PresalesTaskState;
}

export interface PresalesProjectListItem {
  id: string;
  name: string;
  customerName: string;
  industry: string;
  currentStage: string;
  owner: string;
  expectedValue: string;
  decisionDate: string;
  materialCount: number;
  generatedCount: number;
  created_at: string;
  updated_at: string;
}

export interface PresalesProjectList {
  activeProjectId: string;
  projects: PresalesProjectListItem[];
}
