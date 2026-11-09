export interface OutlineItem {
  id: string;
  title: string;
  description: string;
  section_purpose?: 'technical' | 'business' | 'pricing' | 'general';
  source_requirement_id?: string;
  source_requirement_title?: string;
  knowledge_item_ids?: string[];
  children?: OutlineItem[];
  content?: string;
}

export type OutlineMode = 'free' | 'aligned' | 'response-file';

export interface OutlineData {
  outline: OutlineItem[];
  project_name?: string;
  project_overview?: string;
}

export interface TechnicalRequirementGroup {
  requirement_id: string;
  title: string;
  description: string;
  detail_points: string[];
}
