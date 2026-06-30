export type SectionId =
  | 'home'
  | 'technical-plan'
  | 'existing-plan-expansion'
  | 'business-bid'
  | 'official-document-drafting'
  | 'official-document-check'
  | 'official-document-polish'
  | 'official-document-templates'
  | 'thesis-diagnosis'
  | 'thesis-topic'
  | 'thesis-literature'
  | 'thesis-methodology'
  | 'thesis-writing'
  | 'thesis-review'
  | 'thesis-format'
  | 'code-generation'
  | 'software-copyright'
  | 'patent-mining'
  | 'patent-disclosure'
  | 'patent-prior-art'
  | 'patent-iteration'
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
