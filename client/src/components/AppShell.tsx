import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import type { FeatureModuleSettings } from '../shared/types';
import type { SectionId } from '../shared/types/navigation';
import Sidebar from './Sidebar';
import ThemeSwitcher from './ThemeSwitcher';
import TaskMonitor from './TaskMonitor';

interface AppShellProps {
  activeSection: SectionId;
  children: ReactNode;
  developerMode: boolean;
  featureModuleSettings?: FeatureModuleSettings | null;
  onSectionChange: (section: SectionId) => void;
}

function AppShell({ activeSection, children, developerMode, featureModuleSettings, onSectionChange }: AppShellProps) {
  const isMac = window.yibiao?.platform === 'darwin' || window.yibiaoClient?.platform === 'darwin';

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
      <div className={`app-shell${isMac ? ' is-mac' : ''}`}>
        {isMac && <div className="window-drag-region" aria-hidden="true" />}
        <Sidebar activeSection={activeSection} developerMode={developerMode} featureModuleSettings={featureModuleSettings} onSectionChange={onSectionChange} />

        <main className="main-area">
          <ThemeSwitcher />
          <TaskMonitor />
          <section className="content-shell" aria-label="主内容">
            {children}
          </section>
          <div className="app-copyright" aria-label="版权信息">Copyright © 2026 禹都一只猫</div>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

export default AppShell;
