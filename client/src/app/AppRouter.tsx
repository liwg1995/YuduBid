import type { SectionId } from '../shared/types/navigation';
import BidOpportunityPage from '../features/bid-opportunity/pages/BidOpportunityPage';
import BusinessBidPage from '../features/business-bid/pages/BusinessBidPage';
import CodeGenerationPage from '../features/code-generation/pages/CodeGenerationPage';
import DeveloperTestPage from '../features/developer/pages/DeveloperTestPage';
import DuplicateCheckPage from '../features/duplicate-check/pages/DuplicateCheckPage';
import HomePage from '../features/home/pages/HomePage';
import KnowledgeBasePage from '../features/knowledge-base/pages/KnowledgeBasePage';
import OfficialDocumentDraftingPage from '../features/official-document/pages/OfficialDocumentDraftingPage';
import PatentDisclosurePage from '../features/patent-generation/pages/PatentDisclosurePage';
import PatentIterationPage from '../features/patent-generation/pages/PatentIterationPage';
import PatentMiningPage from '../features/patent-generation/pages/PatentMiningPage';
import PatentPriorArtPage from '../features/patent-generation/pages/PatentPriorArtPage';
import RejectionCheckPage from '../features/rejection-check/pages/RejectionCheckPage';
import SettingsPage from '../features/settings/pages/SettingsPage';
import SoftwareCopyrightPage from '../features/software-copyright/pages/SoftwareCopyrightPage';
import TechnicalPlanHome from '../features/technical-plan/pages/TechnicalPlanHome';

interface AppRouterProps {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
  onDeveloperModeChange: (developerMode: boolean) => void;
}

function AppRouter({ activeSection, onSectionChange, onDeveloperModeChange }: AppRouterProps) {
  switch (activeSection) {
    case 'home':
      return <HomePage onNavigate={onSectionChange} />;
    case 'technical-plan':
      return <TechnicalPlanHome />;
    case 'business-bid':
      return <BusinessBidPage />;
    case 'official-document-drafting':
      return <OfficialDocumentDraftingPage initialPanel="drafting" onNavigate={onSectionChange} />;
    case 'official-document-check':
      return <OfficialDocumentDraftingPage initialPanel="check" onNavigate={onSectionChange} />;
    case 'official-document-polish':
      return <OfficialDocumentDraftingPage initialPanel="polish" onNavigate={onSectionChange} />;
    case 'official-document-templates':
      return <OfficialDocumentDraftingPage initialPanel="templates" onNavigate={onSectionChange} />;
    case 'code-generation':
      return <CodeGenerationPage />;
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
      return <BidOpportunityPage />;
    case 'developer-test':
      return <DeveloperTestPage />;
    case 'settings':
      return <SettingsPage onDeveloperModeChange={onDeveloperModeChange} />;
    default:
      return null;
  }
}

export default AppRouter;
