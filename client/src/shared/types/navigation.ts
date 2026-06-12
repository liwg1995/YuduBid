export type SectionId =
  | 'technical-plan'
  | 'business-bid'
  | 'code-generation'
  | 'software-copyright'
  | 'knowledge-base'
  | 'duplicate-check'
  | 'rejection-check'
  | 'bid-opportunity'
  | 'developer-test'
  | 'settings';

export interface AppMenuItem {
  id: SectionId;
  label: string;
  description: string;
}

export interface AppMenuGroup {
  id: string;
  label: string;
  items: AppMenuItem[];
}
