import { lazy, Suspense } from 'react';
import type { SectionId } from '../shared/types/navigation';
import type { FeatureModuleSettings } from '../shared/types';
import type { GrantApplicationInitialPanel } from '../features/grant-application/pages/GrantApplicationPage';
import type { ThesisTutorInitialPanel } from '../features/thesis-tutor/pages/ThesisTutorPage';
import HomePage from '../features/home/pages/HomePage';

const BidOpportunityPage = lazy(() => import('../features/bid-opportunity/pages/BidOpportunityPage'));
const BusinessBidPage = lazy(() => import('../features/business-bid/pages/BusinessBidPage'));
const CodeGenerationPage = lazy(() => import('../features/code-generation/pages/CodeGenerationPage'));
const DeveloperTestPage = lazy(() => import('../features/developer/pages/DeveloperTestPage'));
const DuplicateCheckPage = lazy(() => import('../features/duplicate-check/pages/DuplicateCheckPage'));
const FeasibilityReportHome = lazy(() => import('../features/feasibility-report/pages/FeasibilityReportHome'));
const GrantApplicationPage = lazy(() => import('../features/grant-application/pages/GrantApplicationPage'));
const GrantApplicationProjectsPage = lazy(() => import('../features/grant-application/pages/GrantApplicationProjectsPage'));
const KnowledgeBasePage = lazy(() => import('../features/knowledge-base/pages/KnowledgeBasePage'));
const OfficialDocumentDraftingPage = lazy(() => import('../features/official-document/pages/OfficialDocumentDraftingPage'));
const PatentDisclosurePage = lazy(() => import('../features/patent-generation/pages/PatentDisclosurePage'));
const PatentIterationPage = lazy(() => import('../features/patent-generation/pages/PatentIterationPage'));
const PatentMiningPage = lazy(() => import('../features/patent-generation/pages/PatentMiningPage'));
const PatentPriorArtPage = lazy(() => import('../features/patent-generation/pages/PatentPriorArtPage'));
const PresalesProjectsPage = lazy(() => import('../features/presales-workbench/pages/PresalesProjectsPage'));
const PresalesWorkbenchPage = lazy(() => import('../features/presales-workbench/pages/PresalesWorkbenchPage'));
const ProjectHistoryPage = lazy(() => import('../features/project-management/pages/ProjectHistoryPage'));
const ProjectManagementPage = lazy(() => import('../features/project-management/pages/ProjectManagementPage'));
const ProjectTypesPage = lazy(() => import('../features/project-management/pages/ProjectTypesPage'));
const RejectionCheckPage = lazy(() => import('../features/rejection-check/pages/RejectionCheckPage'));
const SettingsPage = lazy(() => import('../features/settings/pages/SettingsPage'));
const SoftwareCopyrightPage = lazy(() => import('../features/software-copyright/pages/SoftwareCopyrightPage'));
const TechnicalPlanHome = lazy(() => import('../features/technical-plan/pages/TechnicalPlanHome'));
const ThesisTutorPage = lazy(() => import('../features/thesis-tutor/pages/ThesisTutorPage'));

interface AppRouterProps {
  activeSection: SectionId;
  featureModuleSettings?: FeatureModuleSettings | null;
  onSectionChange: (section: SectionId) => void;
  onDeveloperModeChange: (developerMode: boolean) => void;
  onFeatureModuleSettingsChange: (settings: FeatureModuleSettings) => void;
}

function AppRouteContent({ activeSection, featureModuleSettings, onSectionChange, onDeveloperModeChange, onFeatureModuleSettingsChange }: AppRouterProps) {
  switch (activeSection) {
    case 'home':
      return <HomePage featureModuleSettings={featureModuleSettings} onNavigate={onSectionChange} />;
    case 'presales-projects':
      return <PresalesProjectsPage onNavigate={onSectionChange} />;
    case 'presales-workbench':
      return <PresalesWorkbenchPage onNavigate={onSectionChange} />;
    case 'technical-plan':
      return <TechnicalPlanHome workflowKind="technical-plan" onSectionChange={onSectionChange} />;
    case 'existing-plan-expansion':
      return <TechnicalPlanHome workflowKind="existing-plan-expansion" onSectionChange={onSectionChange} />;
    case 'feasibility-report':
      return <FeasibilityReportHome />;
    case 'business-bid':
      return <BusinessBidPage />;
    case 'project-management':
      return <ProjectManagementPage />;
    case 'project-types':
      return <ProjectTypesPage />;
    case 'project-history':
      return <ProjectHistoryPage onNavigate={onSectionChange} />;
    case 'official-document-drafting':
      return <OfficialDocumentDraftingPage initialPanel="drafting" onNavigate={onSectionChange} />;
    case 'official-document-check':
      return <OfficialDocumentDraftingPage initialPanel="check" onNavigate={onSectionChange} />;
    case 'official-document-polish':
      return <OfficialDocumentDraftingPage initialPanel="polish" onNavigate={onSectionChange} />;
    case 'official-document-templates':
      return <OfficialDocumentDraftingPage initialPanel="templates" onNavigate={onSectionChange} />;
    case 'grant-projects':
      return <GrantApplicationProjectsPage onNavigate={onSectionChange} />;
    case 'grant-diagnosis':
    case 'grant-topic-policy':
    case 'grant-proposal':
    case 'grant-review-defense':
      return <GrantApplicationPage initialPanel={activeSection.replace('grant-', '') as GrantApplicationInitialPanel} onNavigate={onSectionChange} />;
    case 'thesis-diagnosis':
    case 'thesis-topic':
    case 'thesis-literature':
    case 'thesis-methodology':
    case 'thesis-data':
    case 'thesis-charts':
    case 'thesis-drafting':
    case 'thesis-writing':
    case 'thesis-review':
    case 'thesis-format':
      return <ThesisTutorPage initialPanel={activeSection.replace('thesis-', '') as ThesisTutorInitialPanel} onNavigate={onSectionChange} />;
    case 'code-generation':
      return <CodeGenerationPage onNavigate={onSectionChange} />;
    case 'software-copyright':
      return <SoftwareCopyrightPage />;
    case 'patent-mining':
      return <PatentMiningPage />;
    case 'patent-disclosure':
      return <PatentDisclosurePage />;
    case 'patent-prior-art':
      return <PatentPriorArtPage />;
    case 'patent-iteration':
      return <PatentIterationPage />;
    case 'knowledge-base':
      return <KnowledgeBasePage />;
    case 'duplicate-check':
      return <DuplicateCheckPage />;
    case 'rejection-check':
      return <RejectionCheckPage />;
    case 'bid-opportunity':
      return <BidOpportunityPage onNavigate={onSectionChange} />;
    case 'developer-test':
      return <DeveloperTestPage />;
    case 'settings':
      return <SettingsPage onDeveloperModeChange={onDeveloperModeChange} onFeatureModuleSettingsChange={onFeatureModuleSettingsChange} />;
    default:
      return null;
  }
}

function AppRouter(props: AppRouterProps) {
  return (
    <Suspense fallback={(
      <div className="section-loading-state" role="status" aria-live="polite">
        <span className="section-loading-indicator" aria-hidden="true" />
        <strong>正在加载功能模块</strong>
        <small>正在恢复当前模块的本地工作区…</small>
      </div>
    )}>
      <AppRouteContent {...props} />
    </Suspense>
  );
}

export default AppRouter;
