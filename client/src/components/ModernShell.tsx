import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAppMenuGroups, getSectionDescriptor } from '../app/menuConfig';
import type { FeatureModuleSettings } from '../shared/types';
import type { SectionId } from '../shared/types/navigation';
import TaskMonitor from './TaskMonitor';
import AssistantWidget from '../features/plugin-host/components/AssistantWidget';
import { navigationIcons } from './Sidebar';
import logoUrl from '../../assets/icon_256.png';

interface Props {
  activeSection: SectionId;
  children: ReactNode;
  developerMode: boolean;
  featureModuleSettings?: FeatureModuleSettings | null;
  assistantPluginEnabled?: boolean;
  onSectionChange: (section: SectionId) => void;
}

export default function ModernShell({ activeSection, children, developerMode, featureModuleSettings, assistantPluginEnabled = false, onSectionChange }: Props) {
  const groups = getAppMenuGroups(developerMode, featureModuleSettings);
  const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeSection));
  const [selectedGroupId, setSelectedGroupId] = useState(activeGroup?.id || 'workspace');
  const [compactNavigation, setCompactNavigation] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1100);
  const [navigationOpen, setNavigationOpen] = useState(() => activeSection !== 'home' && (typeof window === 'undefined' || window.innerWidth > 1100));
  const navigationRef = useRef<HTMLElement>(null);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (activeGroup) setSelectedGroupId(activeGroup.id); }, [activeGroup?.id]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const onChange = () => { setCompactNavigation(media.matches); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (activeSection === 'home' || activeSection === 'settings') setNavigationOpen(false);
  }, [activeSection]);
  useEffect(() => {
    if (compactNavigation) setNavigationOpen(false);
  }, [compactNavigation]);
  useEffect(() => {
    if (!compactNavigation || !navigationOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavigationOpen(false);
        navigationToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compactNavigation, navigationOpen]);
  useEffect(() => {
    if (compactNavigation && navigationOpen) navigationRef.current?.querySelector<HTMLButtonElement>('nav button')?.focus();
  }, [compactNavigation, navigationOpen, selectedGroupId]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || groups[0];
  const navigationHidden = !navigationOpen;
  const showCompactNavigation = navigationHidden && !compactNavigation && activeSection !== 'settings' && !(activeSection === 'home' && selectedGroup.id === 'workspace');
  const descriptor = getSectionDescriptor(activeSection, developerMode, featureModuleSettings);
  const SettingsIcon = navigationIcons.settings;
  const assistantNavigationGroups = [
    ...groups.filter((group) => group.id !== 'developer').map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== 'bid-template-management'),
    })).filter((group) => group.items.length > 0),
    { id: 'system', label: '系统', items: [{ id: 'settings' as const, label: '设置', description: '应用配置与功能管理' }] },
  ];

  return (
    <div className="app-shell modern-shell">
      <aside className="modern-rail" aria-label="工作区分类">
        <div className="modern-rail-brand" aria-label="禹都 AI解决方案助手"><img src={logoUrl} alt="" /></div>
        <div className="modern-rail-items">
          {groups.map((group) => {
            const Icon = navigationIcons[group.items[0].id];
            return (
              <button key={group.id} type="button" className={activeSection !== 'settings' && selectedGroup.id === group.id ? 'is-active' : ''}
                title={group.label} aria-label={group.label} aria-pressed={activeSection !== 'settings' && selectedGroup.id === group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  if (group.id === 'workspace') {
                    setNavigationOpen(false);
                    onSectionChange('home');
                  } else {
                    setNavigationOpen(true);
                  }
                }}>
                <Icon aria-hidden="true" /><span>{group.label}</span>
              </button>
            );
          })}
        </div>
        <button className={`modern-rail-settings${activeSection === 'settings' ? ' is-active' : ''}`} type="button" aria-label="设置" title="设置" aria-current={activeSection === 'settings' ? 'page' : undefined} onClick={() => onSectionChange('settings')}><SettingsIcon aria-hidden="true" /><span>设置</span></button>
      </aside>
      {compactNavigation && navigationOpen && <button type="button" className="modern-navigation-backdrop" aria-label="关闭功能导航" onClick={() => { setNavigationOpen(false); navigationToggleRef.current?.focus(); }} />}
      <aside ref={navigationRef} id="modern-function-navigation" className={`modern-navigation${navigationHidden ? ' is-hidden' : ''}`} aria-label="功能导航" aria-hidden={navigationHidden}>
        <div className="modern-navigation-brand"><span>禹都</span><strong>AI解决方案助手</strong><small>你的智能生产力空间</small></div>
        <div className="modern-navigation-label">{selectedGroup.label}</div>
        <nav>
          {selectedGroup.items.map((item) => {
            const Icon = navigationIcons[item.id];
            return (
              <button type="button" key={item.id} tabIndex={navigationHidden ? -1 : 0} className={activeSection === item.id ? 'is-active' : ''}
                aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => { onSectionChange(item.id); if (item.id === 'home' || compactNavigation) { setNavigationOpen(false); navigationToggleRef.current?.focus(); } }}>
                <Icon aria-hidden="true" /><span>{item.label}</span><span aria-hidden="true">›</span>
              </button>
            );
          })}
        </nav>
        <div className="modern-navigation-bottom"><span><i />本地工作区已就绪</span><small>禹都 · 智能工作空间</small></div>
      </aside>
      <main className="modern-main">
        <header className="modern-topbar">
          {activeSection !== 'settings' && (activeSection !== 'home' || selectedGroup.id !== 'workspace') && <button type="button" ref={navigationToggleRef} className="modern-navigation-toggle" aria-label={navigationOpen ? '收窄功能导航' : '展开功能导航'} aria-controls="modern-function-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen((open) => !open)}>{navigationOpen ? '☷' : '☰'}</button>}
          <nav className="modern-breadcrumb" aria-label="当前位置">
            <span>工作空间</span><span aria-hidden="true">›</span>
            {activeGroup && activeGroup.id !== 'workspace' && <><span>{activeGroup.label}</span><span aria-hidden="true">›</span></>}
            <strong aria-current="page">{descriptor.label}</strong>
          </nav>
          <TaskMonitor />
        </header>
        {showCompactNavigation && (
          <nav className="modern-compact-navigation" aria-label={`${selectedGroup.label}功能导航`}>
            <span>{selectedGroup.label}</span>
            <div>
              {selectedGroup.items.map((item) => (
                <button type="button" key={item.id} className={activeSection === item.id ? 'is-active' : ''}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                  onClick={() => { onSectionChange(item.id); if (item.id === 'home') setNavigationOpen(false); }}>
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        )}
        <section className="modern-content" aria-label="主内容">{children}</section>
        <div className="modern-copyright" aria-label="版权信息">Copyright © {new Date().getFullYear()} 禹都一只猫</div>
        {assistantPluginEnabled && (
          <AssistantWidget
            context={{ sectionId: descriptor.id, title: descriptor.label, description: descriptor.description }}
            navigationGroups={assistantNavigationGroups}
          />
        )}
      </main>
    </div>
  );
}
