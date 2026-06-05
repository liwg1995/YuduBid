import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import type { SectionId } from '../shared/types/navigation';
import Sidebar from './Sidebar';
import ThemeSwitcher from './ThemeSwitcher';

interface AppShellProps {
  activeSection: SectionId;
  children: ReactNode;
  developerMode: boolean;
  onSectionChange: (section: SectionId) => void;
}

function AppShell({ activeSection, children, developerMode, onSectionChange }: AppShellProps) {
  const isMac = window.yibiao?.platform === 'darwin' || window.yibiaoClient?.platform === 'darwin';

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
      <div className={`app-shell${isMac ? ' is-mac' : ''}`}>
        {isMac && <div className="window-drag-region" aria-hidden="true" />}
        <Sidebar activeSection={activeSection} developerMode={developerMode} onSectionChange={onSectionChange} />

        <main className="main-area">
          <ThemeSwitcher />
          <section className="content-shell" aria-label="主内容">
            {children}
          </section>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

export default AppShell;
