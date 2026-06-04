export interface DuplicateCheckReport {
  summary: string;
  risks: Array<{
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high';
    detail: string;
  }>;
}
