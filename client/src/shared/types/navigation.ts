export type SectionId =
  | 'home'
  | 'presales-projects'
  | 'presales-workbench'
  | 'technical-plan'
  | 'existing-plan-expansion'
  | 'feasibility-report'
  | 'business-bid'
  | 'project-management'
  | 'project-types'
  | 'project-history'
  | 'official-document-drafting'
  | 'official-document-check'
  | 'official-document-polish'
  | 'official-document-templates'
  | 'grant-projects'
  | 'grant-diagnosis'
  | 'grant-topic-policy'
  | 'grant-proposal'
  | 'grant-review-defense'
  | 'thesis-diagnosis'
  | 'thesis-topic'
  | 'thesis-literature'
  | 'thesis-methodology'
  | 'thesis-data'
  | 'thesis-charts'
  | 'thesis-drafting'
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
