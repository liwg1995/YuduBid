import * as Tooltip from '@radix-ui/react-tooltip';
import { useMemo, type ReactNode } from 'react';
import type { FeatureModuleSettings } from '../shared/types';
import type { SectionId } from '../shared/types/navigation';
import Sidebar from './Sidebar';
import ThemeSwitcher from './ThemeSwitcher';
import TaskMonitor from './TaskMonitor';
import AssistantWidget from '../features/plugin-host/components/AssistantWidget';
import { getAppMenuGroups, getSectionDescriptor } from '../app/menuConfig';

interface AppShellProps {
  activeSection: SectionId;
  children: ReactNode;
  developerMode: boolean;
  featureModuleSettings?: FeatureModuleSettings | null;
  assistantPluginEnabled?: boolean;
  onSectionChange: (section: SectionId) => void;
}

function AppShell({ activeSection, children, developerMode, featureModuleSettings, assistantPluginEnabled = false, onSectionChange }: AppShellProps) {
  const isMac = window.yibiao?.platform === 'darwin' || window.yibiaoClient?.platform === 'darwin';
  const assistantSection = getSectionDescriptor(activeSection, developerMode, featureModuleSettings);
  const assistantNavigationGroups = useMemo(() => [
    ...getAppMenuGroups(developerMode, featureModuleSettings)
      .filter((group) => group.id !== 'developer')
      .map((group) => ({
        ...group,
        ...(group.id === 'workspace' ? { label: '首页' } : {}),
        items: group.items.filter((item) => item.id !== 'bid-template-management'),
      }))
      .filter((group) => group.items.length > 0),
    { id: 'system', label: '系统', items: [{ id: 'settings' as const, label: '设置', description: '应用配置与功能管理' }] },
  ], [developerMode, featureModuleSettings]);

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
          {assistantPluginEnabled && (
            <AssistantWidget
              context={{
                sectionId: assistantSection.id,
                title: assistantSection.label,
                description: assistantSection.description,
              }}
              navigationGroups={assistantNavigationGroups}
            />
          )}
          <div className="app-copyright" aria-label="版权信息">Copyright © 2026 禹都一只猫</div>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

export default AppShell;
