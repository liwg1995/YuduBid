import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef, useState, type ComponentType, type ReactElement, type SVGProps } from 'react';
import { getAppMenuGroups } from '../app/menuConfig';
import type { SectionId } from '../shared/types/navigation';
import logoUrl from '../../assets/icon_256.png';

interface SidebarProps {
  activeSection: SectionId;
  developerMode: boolean;
  onSectionChange: (section: SectionId) => void;
}

const navigationIcons: Record<SectionId, ComponentType<SVGProps<SVGSVGElement>>> = {
  home: HomeIcon,
  'technical-plan': DocumentIcon,
  'existing-plan-expansion': DocumentIcon,
  'business-bid': BriefcaseIcon,
  'official-document-drafting': OfficialDocumentIcon,
  'official-document-check': OfficialDocumentIcon,
  'official-document-polish': OfficialDocumentIcon,
  'official-document-templates': OfficialDocumentIcon,
  'code-generation': CodeIcon,
  'software-copyright': CertificateIcon,
  'patent-mining': PatentIdeaIcon,
  'patent-disclosure': PatentDocumentIcon,
  'patent-prior-art': SearchDocumentIcon,
  'patent-iteration': IterationIcon,
  'knowledge-base': ArchiveIcon,
  'duplicate-check': CompareIcon,
  'rejection-check': ShieldIcon,
  'bid-opportunity': RadarIcon,
  'developer-test': FlaskIcon,
  settings: GearIcon,
};

const SIDEBAR_COLLAPSED_KEY = 'yudubid-sidebar-collapsed';
const SIDEBAR_GROUPS_COLLAPSED_KEY = 'yudubid-sidebar-groups-collapsed';

function loadInitialCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

function loadInitialCollapsedGroups() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(SIDEBAR_GROUPS_COLLAPSED_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function Sidebar({ activeSection, developerMode, onSectionChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(loadInitialCollapsed);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadInitialCollapsedGroups);
  const navRef = useRef<HTMLElement | null>(null);
  const menuGroups = getAppMenuGroups(developerMode);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_GROUPS_COLLAPSED_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  useEffect(() => {
    const activeGroup = menuGroups.find((group) => group.items.some((item) => item.id === activeSection));
    if (!activeGroup || activeGroup.id === 'workspace') return;
    setCollapsedGroups((prev) => prev[activeGroup.id] ? { ...prev, [activeGroup.id]: false } : prev);
  }, [activeSection, menuGroups]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const activeItem = navRef.current?.querySelector<HTMLElement>(`[data-section-id="${activeSection}"]`);
      activeItem?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSection, collapsedGroups]);

  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} data-collapsed={collapsed}>
      <div className="sidebar-surface" />

      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <img src={logoUrl} alt="" />
        </div>
        <div className="brand-copy">
          <span>禹都</span>
          <strong>AI解决方案助手</strong>
        </div>
      </div>

      <button
        type="button"
        className="collapse-button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开菜单' : '收起菜单'}
      >
        <ChevronIcon className={collapsed ? 'rotate-180' : ''} />
      </button>

      <nav className="sidebar-nav" aria-label="主菜单" ref={navRef}>
        {menuGroups.map((group) => {
          const isWorkspaceGroup = group.id === 'workspace';
          const isGroupCollapsed = isWorkspaceGroup ? false : Boolean(collapsedGroups[group.id]);
          const isActiveGroup = group.items.some((item) => item.id === activeSection);

          return (
            <div className={`nav-group ${isGroupCollapsed ? 'is-folded' : ''}${isActiveGroup ? ' has-active' : ''}`} key={group.id}>
              {!collapsed && !isWorkspaceGroup && (
                <button
                  type="button"
                  className="nav-group-trigger"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isGroupCollapsed}
                  aria-controls={`nav-group-${group.id}`}
                >
                  <span>{group.label}</span>
                  <ChevronIcon className={isGroupCollapsed ? 'rotate-270' : 'rotate-90'} />
                </button>
              )}
              {(!isGroupCollapsed || collapsed) && (
                <div className="nav-group-items" id={`nav-group-${group.id}`}>
                  {group.items.map((item) => {
                    const Icon = navigationIcons[item.id];
                    const isActive = item.id === activeSection;
                    const button = (
                      <button
                        key={item.id}
                        type="button"
                        className={`nav-item ${isActive ? 'is-active' : ''}`}
                        data-section-id={item.id}
                        onClick={() => onSectionChange(item.id)}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          <Icon />
                        </span>
                        <span className="nav-copy">
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                      </button>
                    );

                    return collapsed ? wrapTooltip(item.label, button) : button;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {collapsed ? wrapTooltip('设置', renderSettingsButton(activeSection, onSectionChange)) : renderSettingsButton(activeSection, onSectionChange)}
      </div>
    </aside>
  );
}

function renderSettingsButton(activeSection: SectionId, onSectionChange: (section: SectionId) => void) {
  const isActive = activeSection === 'settings';

  return (
    <button
      type="button"
      className={`settings-trigger ${isActive ? 'is-active' : ''}`}
      onClick={() => onSectionChange('settings')}
      aria-current={isActive ? 'page' : undefined}
      aria-label="设置"
    >
      <span className="nav-icon" aria-hidden="true">
        <GearIcon />
      </span>
      <span className="settings-copy">
        <strong>设置</strong>
        <small>模型与解析配置</small>
      </span>
    </button>
  );
}

function wrapTooltip(label: string, child: ReactElement) {
  return (
    <Tooltip.Root key={label}>
      <Tooltip.Trigger asChild>{child}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="right" align="center" sideOffset={12}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4.5 11.3 12 4.8l7.5 6.5" />
      <path d="M6.8 10.2v9h10.4v-9" />
      <path d="M10 19.2v-5.1h4v5.1" />
    </svg>
  );
}

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 3.75h6.7L18 8.05v12.2H7z" />
      <path d="M13.5 4v4.35h4.25" />
      <path d="M9.5 12.2h5" />
      <path d="M9.5 15.7h4" />
    </svg>
  );
}

function BriefcaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 8h14v11.5H5z" />
      <path d="M9 8V5.5h6V8" />
      <path d="M5 12.5h14" />
      <path d="M10.5 12.5v2h3v-2" />
    </svg>
  );
}

function OfficialDocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6.5 3.8h8.1L18.5 7.7v12.5h-12z" />
      <path d="M14.4 4.1v3.8h3.8" />
      <path d="M9 11h6" />
      <path d="M9 14.2h6" />
      <path d="M9 17.4h3.7" />
      <path d="M5 7.5h-1.2v11.2h1.2" />
      <path d="M20.2 8.8v10h-1.2" />
    </svg>
  );
}

function ArchiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 7.5h14v12H5z" />
      <path d="M4 4.5h16v3H4z" />
      <path d="M9 11.2h6" />
    </svg>
  );
}

function CertificateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6.5 4.5h11v15h-11z" />
      <path d="M9 8h6" />
      <path d="M9 11h6" />
      <path d="M9 14h3.5" />
      <path d="m15.2 16.2 1.1 1.1 2-2.3" />
    </svg>
  );
}

function CodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="m9 8-4 4 4 4" />
      <path d="m15 8 4 4-4 4" />
      <path d="m13 5-2 14" />
    </svg>
  );
}

function PatentIdeaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9.2 18.5h5.6" />
      <path d="M10 21h4" />
      <path d="M8.3 14.8c-1.4-1.05-2.3-2.72-2.3-4.6a6 6 0 0 1 12 0c0 1.88-.9 3.55-2.3 4.6-.66.5-.9.9-.9 1.7H9.2c0-.8-.24-1.2-.9-1.7Z" />
      <path d="M10.2 10.1 11.5 12l2.5-3.5" />
    </svg>
  );
}

function PatentDocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6.5 3.8h7.2L18 8.1v12.1H6.5z" />
      <path d="M13.5 4.1v4.2h4.1" />
      <path d="M9 12h6" />
      <path d="M9 15h6" />
      <path d="M9 18h3.8" />
      <path d="m16 16.8 2.2 2.2 3-4.2" />
    </svg>
  );
}

function SearchDocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6.5 4h8.2L18 7.3v4.2" />
      <path d="M6.5 4v16h6" />
      <path d="M14.5 4.2v3.4h3.2" />
      <path d="M9 11h4" />
      <path d="M9 14h2.8" />
      <path d="M16.2 18.4a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" />
      <path d="m18.5 18.5 2.1 2.1" />
    </svg>
  );
}

function IterationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7.2 7.5h8.1a4.2 4.2 0 0 1 0 8.4H6" />
      <path d="m8.8 4.8-3 2.7 3 2.7" />
      <path d="m15.2 19.2 3-2.7-3-2.7" />
      <path d="M10 12h4" />
    </svg>
  );
}

function CompareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 5.5h7.5" />
      <path d="M7 9h5.5" />
      <path d="M5 15.5h7.5" />
      <path d="M5 19h5.5" />
      <path d="M16.5 13.5l2 2 2-2" />
      <path d="M18.5 15.5V5" />
      <path d="M7.5 8.5l-2-2 2-2" />
      <path d="M5.5 6.5V17" />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3.5 18.5 6v5.4c0 4.25-2.55 7.55-6.5 9.1-3.95-1.55-6.5-4.85-6.5-9.1V6z" />
      <path d="m9 12.2 2 2 4-4.5" />
    </svg>
  );
}

function RadarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z" />
      <path d="M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
      <path d="M12 12 18 6" />
      <path d="M12 12h.01" />
    </svg>
  );
}

function FlaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 3.8h6" />
      <path d="M10.5 3.8v5.4l-4.2 7.4c-.85 1.5.24 3.4 1.96 3.4h7.48c1.72 0 2.81-1.9 1.96-3.4l-4.2-7.4V3.8" />
      <path d="M8.5 15.8h7" />
      <path d="M10 12.5h4" />
    </svg>
  );
}

function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
      <path d="m19.1 13.5.1-1.5-.1-1.5 2-1.5-2-3.4-2.45.95a8.2 8.2 0 0 0-2.55-1.45L13.75 2h-3.5L9.9 5.1a8.2 8.2 0 0 0-2.55 1.45L4.9 5.6l-2 3.4 2 1.5L4.8 12l.1 1.5-2 1.5 2 3.4 2.45-.95A8.2 8.2 0 0 0 9.9 18.9l.35 3.1h3.5l.35-3.1a8.2 8.2 0 0 0 2.55-1.45l2.45.95 2-3.4z" />
    </svg>
  );
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m14 7-5 5 5 5" />
    </svg>
  );
}

export default Sidebar;
