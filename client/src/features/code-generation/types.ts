export interface CodeGenerationProject {
  name: string;
  path: string;
}

export interface CodeGenerationFile {
  path: string;
  extension: string;
  size: number;
  line_count: number;
  category: string;
}

export interface CodeGenerationAnalysis {
  projectRoot: string;
  projectName: string;
  packageName: string;
  packageVersion: string;
  frameworks: string[];
  languages: string[];
  fileCount: number;
  lineCount: number;
  candidates: CodeGenerationFile[];
}

export interface CodeGenerationSummary {
  selectedCount: number;
  selectedLineCount: number;
  estimatedPages: number;
  selectedFiles: CodeGenerationFile[];
}

export interface CodeGenerationState {
  project: CodeGenerationProject | null;
  analysis: CodeGenerationAnalysis | null;
  selectedPaths: string[];
  confirmed: boolean;
  confirmedAt: string;
  updated_at: string;
  summary: CodeGenerationSummary;
}

export interface CodeGenerationSelectResult {
  success: boolean;
  message?: string;
  state: CodeGenerationState;
}
