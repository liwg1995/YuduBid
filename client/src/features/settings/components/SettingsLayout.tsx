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
  children: ReactNode;
}

export default function SettingsLayout({ activeTab, tabs, description, onTabChange, headerAction, children }: Props) {
  const current = tabs.find((tab) => tab.id === activeTab);
  const boardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (boardRef.current) boardRef.current.scrollTop = 0;
  }, [activeTab]);

  if (getStoredUiAppearance() === 'modern') {
    return (
      <div className="modern-settings-board" ref={boardRef}>
        <aside className="modern-settings-index" aria-label="设置分类">
          <div className="modern-settings-index-title"><span>SETTINGS / INDEX</span><strong>设置中心</strong><p>按类别管理工作空间</p></div>
          <nav aria-label="设置分类">
            {tabs.map((tab, index) => (
              <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''}
                aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => onTabChange(tab.id)}>
                <span>{String(index + 1).padStart(2, '0')}</span><strong>{tab.label}</strong><i aria-hidden="true">↗</i>
              </button>
            ))}
          </nav>
        </aside>
        <main className="modern-settings-main">
          <header key={`heading-${activeTab}`} className="modern-settings-heading"><div><span>PREFERENCES / {String(tabs.findIndex((tab) => tab.id === activeTab) + 1).padStart(2, '0')}</span><h1>{current?.label}</h1><p>{description}</p></div>{headerAction || <b>YUDU WORKSPACE</b>}</header>
          <div key={`body-${activeTab}`} className="modern-settings-body">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="settings-page-scroll">
      <header className="appearance-page-heading"><span>YUDU / PREFERENCES</span><h1>{current?.label}</h1><p>{description}</p></header>
      <div className="settings-tab-shell" role="tablist" aria-label="设置分类">
        {tabs.map((tab) => <button key={tab.id} type="button" className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
          onClick={() => onTabChange(tab.id)} role="tab" aria-selected={activeTab === tab.id}>{tab.label}</button>)}
      </div>
      {children}
    </div>
  );
}
