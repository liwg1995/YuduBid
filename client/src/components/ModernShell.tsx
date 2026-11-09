import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAppMenuGroups, getSectionDescriptor } from '../app/menuConfig';
import type { FeatureModuleId, FeatureModuleSettings } from '../shared/types';
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
  moduleReveal: { moduleId: FeatureModuleId; opener?: HTMLButtonElement } | null;
  onModuleRevealHandled: () => void;
  onSectionChange: (section: SectionId) => void;
}

export default function ModernShell({ activeSection, children, developerMode, featureModuleSettings, assistantPluginEnabled = false, moduleReveal, onModuleRevealHandled, onSectionChange }: Props) {
  const groups = getAppMenuGroups(developerMode, featureModuleSettings);
  const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeSection));
  const [selectedGroupId, setSelectedGroupId] = useState(activeGroup?.id || 'workspace');
  const [compactNavigation, setCompactNavigation] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1100);
  const [navigationOpen, setNavigationOpen] = useState(() => activeSection !== 'home' && (typeof window === 'undefined' || (window.innerWidth > 1100 && window.localStorage.getItem('yudubid-modern-navigation-open') !== 'false')));
  const [navigationSearch, setNavigationSearch] = useState('');
  const navigationSearchRef = useRef<HTMLInputElement>(null);
  const navigationOpenerRef = useRef<HTMLElement | null>(null);
  const previousSectionRef = useRef(activeSection);
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
    if (compactNavigation && previousSectionRef.current !== activeSection) setNavigationOpen(false);
    previousSectionRef.current = activeSection;
  }, [activeSection, compactNavigation]);
  useEffect(() => {
    if (!moduleReveal) return;
    navigationOpenerRef.current = moduleReveal.opener ?? null;
    setSelectedGroupId(moduleReveal.moduleId);
    setNavigationSearch('');
    setNavigationOpen(true);
    onModuleRevealHandled();
  }, [moduleReveal, onModuleRevealHandled]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || groups[0];
  const searchTerm = navigationSearch.trim().toLowerCase();
  const navigationItems = searchTerm ? groups.flatMap((group) => group.items).filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(searchTerm)) : selectedGroup.items;
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

  const navigationContent = (<>
        <div className="modern-navigation-heading">{compactNavigation && <Dialog.Close className="modern-navigation-close" aria-label="关闭功能导航">×</Dialog.Close>}<div className="modern-navigation-brand"><span>禹都</span><strong>AI解决方案助手</strong><small>你的智能生产力空间</small></div></div>
        <label className="modern-navigation-search"><span>查找功能</span><input ref={navigationSearchRef} aria-label="查找功能" disabled={navigationHidden} value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)} placeholder="搜索功能名称" />{navigationSearch && <button type="button" tabIndex={navigationHidden ? -1 : 0} aria-label="清除功能搜索" onClick={() => { setNavigationSearch(''); navigationSearchRef.current?.focus(); }}>清除</button>}</label>
        <div className="modern-navigation-label">{searchTerm ? `搜索结果 · ${navigationItems.length}` : selectedGroup.label}</div>
        <nav>
          {navigationItems.map((item) => {
            const Icon = navigationIcons[item.id];
            return (
              <button type="button" key={item.id} tabIndex={navigationHidden ? -1 : 0} className={activeSection === item.id ? 'is-active' : ''}
                aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => {
                  if (item.id === activeSection) {
                    if (compactNavigation) setNavigationOpen(false);
                    return;
                  }
                  onSectionChange(item.id);
                }}>
                <Icon aria-hidden="true" /><span>{item.label}</span><span aria-hidden="true">›</span>
              </button>
            );
          })}
          {searchTerm && !navigationItems.length && <p role="status" className="modern-navigation-empty">未找到功能，请换个关键词。</p>}
        </nav>
        <div className="modern-navigation-bottom"><small>禹都 · 智能工作空间</small></div>
  </>);

  return (
    <Dialog.Root open={compactNavigation && navigationOpen} onOpenChange={(open) => { if (compactNavigation) setNavigationOpen(open); }}>
    <div className="app-shell modern-shell">
      <aside className="modern-rail" aria-label="工作区分类">
        <div className="modern-rail-brand" aria-label="禹都 AI解决方案助手"><img src={logoUrl} alt="" /></div>
        <div className="modern-rail-items">
          {groups.map((group) => {
            const Icon = navigationIcons[group.items[0].id];
            return (
              <button key={group.id} type="button" className={activeSection !== 'settings' && selectedGroup.id === group.id ? 'is-active' : ''}
                title={group.label} aria-label={group.label} aria-pressed={activeSection !== 'settings' && selectedGroup.id === group.id}
                onClick={(event) => {
                  navigationOpenerRef.current = event.currentTarget;
                  setSelectedGroupId(group.id);
                  setNavigationSearch('');
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
      {compactNavigation ? (
        <Dialog.Portal>
          <Dialog.Overlay className="modern-navigation-overlay" />
          <Dialog.Content asChild aria-describedby={undefined}
            onOpenAutoFocus={(event) => { event.preventDefault(); navigationSearchRef.current?.focus(); }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!document.querySelector('[role="dialog"][data-state="open"]')) {
                const opener = navigationOpenerRef.current;
                if (opener?.isConnected) opener.focus();
                else navigationToggleRef.current?.focus();
              }
            }}>
            <aside id="modern-function-navigation" className="modern-navigation modern-navigation-dialog">
              <Dialog.Title className="sr-only">{selectedGroup.label}功能导航</Dialog.Title>
              {navigationContent}
            </aside>
          </Dialog.Content>
        </Dialog.Portal>
      ) : (
        <aside id="modern-function-navigation" className={`modern-navigation${navigationHidden ? ' is-hidden' : ''}`} aria-label="功能导航" aria-hidden={navigationHidden}>
          {navigationContent}
        </aside>
      )}
      <main className="modern-main">
        <header className="modern-topbar">
          {activeSection !== 'settings' && (activeSection !== 'home' || selectedGroup.id !== 'workspace') && <button type="button" ref={navigationToggleRef} className="modern-navigation-toggle" aria-label={navigationOpen ? '收窄功能导航' : '展开功能导航'} aria-controls="modern-function-navigation" aria-expanded={navigationOpen} onClick={(event) => { navigationOpenerRef.current = event.currentTarget; setNavigationOpen((open) => { window.localStorage.setItem('yudubid-modern-navigation-open', String(!open)); return !open; }); }}>{navigationOpen ? '☷' : '☰'}</button>}
          <nav className="modern-breadcrumb" aria-label="当前位置">
            <button type="button" onClick={() => onSectionChange('home')}>工作空间</button><span aria-hidden="true">›</span>
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
    </Dialog.Root>
  );
}
