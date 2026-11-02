import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';

export interface SettingsLayoutTab {
  id: string;
  label: string;
}

interface Props {
  activeTab: string;
  tabs: SettingsLayoutTab[];
  description: string;
  onTabChange: (id: string) => void;
  headerAction?: ReactNode;
  navigationDisabled?: boolean;
  children: ReactNode;
}

export default function SettingsLayout({ activeTab, tabs, description, onTabChange, headerAction, navigationDisabled = false, children }: Props) {
  const current = tabs.find((tab) => tab.id === activeTab);
  const boardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (boardRef.current) boardRef.current.scrollTop = 0;
  }, [activeTab]);

  if (getStoredUiAppearance() === 'modern') {
    return (
      <div className="modern-settings-board">
        <aside className="modern-settings-index" aria-label="设置分类">
          <div className="modern-settings-index-title"><strong>设置</strong><p>管理当前设备的配置</p></div>
          <nav aria-label="设置分类">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''}
                disabled={navigationDisabled} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => onTabChange(tab.id)}>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </nav>
        </aside>
        <section className="modern-settings-main" aria-label={`${current?.label || '应用'}设置`}>
          <header key={`heading-${activeTab}`} className="modern-settings-heading"><div><h1>{current?.label}</h1><p>{description}</p></div>{headerAction}</header>
          <div ref={boardRef} key={`body-${activeTab}`} className="modern-settings-body">{children}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-page-scroll" ref={boardRef}>
      <header className="appearance-page-heading"><span>YUDU / PREFERENCES</span><h1>{current?.label}</h1><p>{description}</p></header>
      <div className="settings-tab-shell" role="tablist" aria-label="设置分类">
        {tabs.map((tab) => <button key={tab.id} type="button" className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
          disabled={navigationDisabled} onClick={() => onTabChange(tab.id)} role="tab" aria-selected={activeTab === tab.id}>{tab.label}</button>)}
      </div>
      {children}
    </div>
  );
}
