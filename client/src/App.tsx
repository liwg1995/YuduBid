import { useCallback, useEffect, useRef, useState } from 'react';
import AppRouter from './app/AppRouter';
import StartupSplash from './app/StartupSplash';
import ModernWelcomePage from './app/ModernWelcomePage';
import { isSectionVisible } from './app/menuConfig';
import AppShell from './components/AppShell';
import type { FeatureModuleSettings } from './shared/types';
import type { LatestReleaseInfo, UpdateSource } from './shared/types';
import type { SectionId } from './shared/types/navigation';
import type { PluginNavigationTarget } from './shared/types/plugin';
import { canNavigateToSection } from './shared/navigationBlocker';
import { shouldReduceMotion } from './shared/motionPreference';
import { getStoredUiAppearance, UI_APPEARANCE_CHANGE_EVENT, type UiAppearance } from './shared/uiAppearance';
import { compareReleaseVersions } from './shared/utils/releaseVersion';
import './styles/startupUpdateNotice.css';

const MODERN_WELCOME_STORAGE_KEY = 'yudubid-modern-welcome-v2';

const sectionIds = new Set<SectionId>([
  'home',
  'presales-projects',
  'presales-workbench',
  'technical-plan',
  'existing-plan-expansion',
  'feasibility-report',
  'bid-template-management',
  'business-bid',
  'project-types',
  'project-management',
  'project-history',
  'official-document-drafting',
  'official-document-check',
  'official-document-polish',
  'official-document-templates',
  'grant-diagnosis',
  'grant-topic-policy',
  'grant-proposal',
  'grant-review-defense',
  'thesis-diagnosis',
  'thesis-topic',
  'thesis-literature',
  'thesis-methodology',
  'thesis-data',
  'thesis-charts',
  'thesis-drafting',
  'thesis-writing',
  'thesis-review',
  'thesis-format',
  'code-generation',
  'software-copyright',
  'patent-mining',
  'patent-disclosure',
  'patent-prior-art',
  'patent-iteration',
  'knowledge-base',
  'duplicate-check',
  'rejection-check',
  'blind-check',
  'bid-opportunity',
  'developer-test',
  'settings',
]);

function initialSectionFromUrl(): SectionId {
  const section = new URLSearchParams(window.location.search).get('section') as SectionId | null;
  return section && sectionIds.has(section) ? section : 'home';
}

function App() {
  const [uiAppearance, setUiAppearance] = useState<UiAppearance>(getStoredUiAppearance);
  const [modernWelcomeOpen, setModernWelcomeOpen] = useState(() => window.localStorage.getItem(MODERN_WELCOME_STORAGE_KEY) !== 'seen');
  const [modernWelcomeExiting, setModernWelcomeExiting] = useState(false);
  const welcomeExitTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const syncAppearance = (event: Event) => setUiAppearance((event as CustomEvent<UiAppearance>).detail);
    window.addEventListener(UI_APPEARANCE_CHANGE_EVENT, syncAppearance);
    return () => window.removeEventListener(UI_APPEARANCE_CHANGE_EVENT, syncAppearance);
  }, []);
  const [activeSection, setActiveSection] = useState<SectionId>(initialSectionFromUrl);
  const [developerMode, setDeveloperMode] = useState(false);
  const [featureModuleSettings, setFeatureModuleSettings] = useState<FeatureModuleSettings | null>(null);
  const [assistantPluginEnabled, setAssistantPluginEnabled] = useState(false);
  const [sectionRefreshKeys, setSectionRefreshKeys] = useState<Partial<Record<SectionId, number>>>({});
  const [pluginNavigationTarget, setPluginNavigationTarget] = useState<PluginNavigationTarget | null>(null);
  const [startupProgress, setStartupProgress] = useState(6);
  const [startupMessage, setStartupMessage] = useState('正在初始化本地配置...');
  const [startupDone, setStartupDone] = useState(false);
  const [updateReminder, setUpdateReminder] = useState<LatestReleaseInfo | null>(null);
  const [updateDialogRequest, setUpdateDialogRequest] = useState<{ id: number; release: LatestReleaseInfo } | null>(null);
  const sectionVisibilityRef = useRef({ developerMode, featureModuleSettings });

  useEffect(() => {
    sectionVisibilityRef.current = { developerMode, featureModuleSettings };
  }, [developerMode, featureModuleSettings]);

  useEffect(() => {
    if (!startupDone || !window.yibiao) return;
    let canceled = false;
    const storedSource = window.localStorage.getItem('yibiao-update-source');
    const source: UpdateSource = storedSource === 'github' || storedSource === 'gitcode' ? storedSource : 'auto';
    void Promise.all([window.yibiao.getVersion(), window.yibiao.getLatestVersion(source)])
      .then(([currentVersion, release]) => {
        if (!canceled && release?.version && !release.syncPending && compareReleaseVersions(release.version, currentVersion) > 0) {
          setUpdateReminder(release);
        }
      })
      .catch(() => undefined);
    return () => { canceled = true; };
  }, [startupDone]);

  useEffect(() => {
    let alive = true;
    let configReady = false;
    let minimumReady = false;
    let finishTimer: number | undefined;
    let progressTimer: number | undefined;
    let messageTimer: number | undefined;
    const startedAt = Date.now();
    const stages = [
      { at: 18, message: '正在加载模型与解析配置...' },
      { at: 36, message: '正在准备本地工作区...' },
      { at: 58, message: '正在恢复页面状态...' },
      { at: 78, message: '正在装载功能模块...' },
      { at: 92, message: '即将进入应用界面...' },
    ];

    progressTimer = window.setInterval(() => {
      if (!alive) return;
      setStartupProgress((current) => {
        if (configReady && minimumReady) {
          return Math.min(100, current + Math.max(2, Math.round((100 - current) * 0.32)));
        }
        const elapsed = Date.now() - startedAt;
        const target = Math.min(92, 8 + Math.floor(elapsed / 65));
        return current < target ? current + 1 : current;
      });
    }, 45);

    messageTimer = window.setInterval(() => {
      if (!alive) return;
      setStartupProgress((current) => {
        let stage: { at: number; message: string } | undefined;
        for (let index = stages.length - 1; index >= 0; index -= 1) {
          if (current >= stages[index].at) {
            stage = stages[index];
            break;
          }
        }
        if (stage) setStartupMessage(stage.message);
        return current;
      });
    }, 120);

    const tryFinish = () => {
      if (!alive || !configReady || !minimumReady) return;
      if (progressTimer) window.clearInterval(progressTimer);
      if (messageTimer) window.clearInterval(messageTimer);
      setStartupMessage('加载完成，正在进入应用界面...');
      setStartupProgress(100);
      finishTimer = window.setTimeout(() => {
        if (alive) setStartupDone(true);
      }, 260);
    };

    const configPromise = window.yibiao?.config.load?.() ?? Promise.resolve(null);

    void configPromise
      .then((config) => {
        if (!alive) return;
        setDeveloperMode(Boolean(config?.developer_mode));
        setFeatureModuleSettings(config?.feature_module_settings || null);
      })
      .catch((error) => console.warn('读取启动配置失败', error))
      .finally(() => {
        configReady = true;
        tryFinish();
      });

    const minimumTimer = window.setTimeout(() => {
      minimumReady = true;
      tryFinish();
    }, 1250);

    return () => {
      alive = false;
      if (progressTimer) window.clearInterval(progressTimer);
      if (messageTimer) window.clearInterval(messageTimer);
      window.clearTimeout(minimumTimer);
      if (finishTimer) window.clearTimeout(finishTimer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refreshPluginState = async () => {
      try {
        const plugins = await window.yibiao?.plugins.list() || [];
        if (alive) setAssistantPluginEnabled(Boolean(plugins.find((plugin) => plugin.id === 'com.yudu.assistant' && plugin.enabled)));
      } catch (error) {
        console.warn('读取 Assistant 插件状态失败', error);
        if (alive) setAssistantPluginEnabled(false);
      }
    };
    void refreshPluginState();
    const unsubscribe = window.yibiao?.plugins.onEvent((event) => {
      if (event.type === 'navigation-requested' && event.sectionId) {
        const section = event.sectionId as SectionId;
        const visibility = sectionVisibilityRef.current;
        if (sectionIds.has(section) && isSectionVisible(section, visibility.developerMode, visibility.featureModuleSettings)) {
          void canNavigateToSection(section).then((allowed) => {
            if (!alive || !allowed) return;
            setPluginNavigationTarget({
              requestId: Date.now(),
              sectionId: section,
              ...(event.workflowKind ? { workflowKind: event.workflowKind } : {}),
              ...(event.projectId ? { projectId: event.projectId } : {}),
              ...(event.viewId ? { viewId: event.viewId } : {}),
              ...(event.panelId ? { panelId: event.panelId } : {}),
            });
            setActiveSection(section);
          });
        }
        return;
      }
      if (event.type === 'workspace-changed' && event.sectionId) {
        const section = event.sectionId as SectionId;
        if (sectionIds.has(section)) {
          setSectionRefreshKeys((current) => ({ ...current, [section]: (current[section] || 0) + 1 }));
        }
        return;
      }
      void refreshPluginState();
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const changeSection = useCallback((section: SectionId) => {
    const destination = isSectionVisible(section, developerMode, featureModuleSettings) ? section : 'home';
    void canNavigateToSection(destination).then((allowed) => {
      if (allowed) setActiveSection(destination);
    });
  }, [developerMode, featureModuleSettings]);

  const openUpdateDialog = useCallback(() => {
    if (!updateReminder) return;
    void canNavigateToSection('settings').then((allowed) => {
      if (!allowed) return;
      setUpdateDialogRequest({ id: Date.now(), release: updateReminder });
      setActiveSection('settings');
      setUpdateReminder(null);
    });
  }, [updateReminder]);

  const startExploring = () => {
    if (modernWelcomeExiting) return;
    window.localStorage.setItem(MODERN_WELCOME_STORAGE_KEY, 'seen');
    setPluginNavigationTarget(null);
    setActiveSection('home');
    if (shouldReduceMotion()) {
      setModernWelcomeOpen(false);
      return;
    }
    setModernWelcomeExiting(true);
    welcomeExitTimerRef.current = window.setTimeout(() => {
      setModernWelcomeOpen(false);
      setModernWelcomeExiting(false);
      welcomeExitTimerRef.current = null;
    }, 560);
  };

  useEffect(() => () => {
    if (welcomeExitTimerRef.current !== null) window.clearTimeout(welcomeExitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isSectionVisible(activeSection, developerMode, featureModuleSettings)) {
      setActiveSection('home');
    }
  }, [activeSection, developerMode, featureModuleSettings]);

  if (!startupDone) return <StartupSplash progress={startupProgress} message={startupMessage} />;
  const showModernWelcome = uiAppearance === 'modern' && modernWelcomeOpen;

  return (
    <>
      {(!showModernWelcome || modernWelcomeExiting) && (
        <AppShell
          appearance={uiAppearance}
          activeSection={activeSection}
          developerMode={developerMode}
          featureModuleSettings={featureModuleSettings}
          assistantPluginEnabled={assistantPluginEnabled}
          onSectionChange={changeSection}
        >
          <AppRouter
            key={`${uiAppearance}:${activeSection}:${sectionRefreshKeys[activeSection] || 0}:${pluginNavigationTarget?.requestId || 0}`}
            activeSection={activeSection}
            developerMode={developerMode}
            featureModuleSettings={featureModuleSettings}
            pluginNavigationTarget={pluginNavigationTarget?.sectionId === activeSection ? pluginNavigationTarget : null}
            onSectionChange={changeSection}
            onDeveloperModeChange={setDeveloperMode}
            onFeatureModuleSettingsChange={setFeatureModuleSettings}
            updateDialogRequest={updateDialogRequest}
            onUpdateDialogRequestConsumed={() => setUpdateDialogRequest(null)}
          />
        </AppShell>
      )}
      {updateReminder && !showModernWelcome && (
        <aside className={`startup-update-notice is-${uiAppearance}`} role="status" aria-label="发现新版本">
          <div className="startup-update-notice-copy">
            <span>版本更新</span>
            <strong>发现新版本 {updateReminder.version}</strong>
            <p>可前往更新详情，确认后手动下载并安装。</p>
          </div>
          <div className="startup-update-notice-actions">
            <button type="button" className="is-later" onClick={() => setUpdateReminder(null)}>稍后更新</button>
            <button type="button" className="is-now" onClick={openUpdateDialog}>立刻更新</button>
          </div>
        </aside>
      )}
      {showModernWelcome && <ModernWelcomePage exiting={modernWelcomeExiting} onStart={startExploring} />}
    </>
  );
}

export default App;
