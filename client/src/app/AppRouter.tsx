import type { SectionId } from '../shared/types/navigation';
import BidOpportunityPage from '../features/bid-opportunity/pages/BidOpportunityPage';
import BusinessBidPage from '../features/business-bid/pages/BusinessBidPage';
import CodeGenerationPage from '../features/code-generation/pages/CodeGenerationPage';
import DeveloperTestPage from '../features/developer/pages/DeveloperTestPage';
import DuplicateCheckPage from '../features/duplicate-check/pages/DuplicateCheckPage';
import KnowledgeBasePage from '../features/knowledge-base/pages/KnowledgeBasePage';
import RejectionCheckPage from '../features/rejection-check/pages/RejectionCheckPage';
import SettingsPage from '../features/settings/pages/SettingsPage';
import SoftwareCopyrightPage from '../features/software-copyright/pages/SoftwareCopyrightPage';
import TechnicalPlanHome from '../features/technical-plan/pages/TechnicalPlanHome';

interface AppRouterProps {
  activeSection: SectionId;
  onDeveloperModeChange: (developerMode: boolean) => void;
}

function AppRouter({ activeSection, onDeveloperModeChange }: AppRouterProps) {
  switch (activeSection) {
    case 'technical-plan':
      return <TechnicalPlanHome />;
    case 'business-bid':
      return <BusinessBidPage />;
    case 'code-generation':
      return <CodeGenerationPage />;
    case 'software-copyright':
      return <SoftwareCopyrightPage />;
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
