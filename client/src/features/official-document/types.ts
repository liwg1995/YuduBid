import type { OfficialDocumentPromptInput } from '../../shared/prompts/officialDocument';

export interface OfficialDocumentTaskState {
  id: string;
  type?: 'draft' | 'check' | 'polish' | 'rewrite' | 'extract';
  status: 'running' | 'success' | 'error';
  progress: number;
  message: string;
  started_at?: string;
  finished_at?: string;
}

export interface OfficialDocumentRevision {
  id: string;
  type: 'draft' | 'polish' | 'rewrite' | 'manual';
  title: string;
  summary: string;
  content: string;
  created_at: string;
}

export interface OfficialDocumentState {
  input: OfficialDocumentPromptInput;
  draft: string;
  review: string;
  prompt: string;
  revisions: OfficialDocumentRevision[];
  importedFileName: string;
  task?: OfficialDocumentTaskState;
  updated_at: string;
}

export interface OfficialDocumentImportResult {
  success: boolean;
  message?: string;
  fileName?: string;
  parserProvider?: string;
  state: OfficialDocumentState;
}
