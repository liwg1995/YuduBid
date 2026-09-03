import { useCallback, useEffect, useRef, useState } from 'react';
import AppRouter from './app/AppRouter';
import StartupSplash from './app/StartupSplash';
import { isSectionVisible } from './app/menuConfig';
import AppShell from './components/AppShell';
import type { FeatureModuleSettings } from './shared/types';
import type { SectionId } from './shared/types/navigation';
import type { PluginNavigationTarget } from './shared/types/plugin';

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
  'bid-opportunity',
  'developer-test',
  'settings',
]);

function initialSectionFromUrl(): SectionId {
  const section = new URLSearchParams(window.location.search).get('section') as SectionId | null;
  return section && sectionIds.has(section) ? section : 'home';
}

function App() {
  const [activeSection, setActiveSection] = useState<SectionId>(initialSectionFromUrl);
  const [developerMode, setDeveloperMode] = useState(false);
  const [featureModuleSettings, setFeatureModuleSettings] = useState<FeatureModuleSettings | null>(null);
  const [assistantPluginEnabled, setAssistantPluginEnabled] = useState(false);
  const [sectionRefreshKeys, setSectionRefreshKeys] = useState<Partial<Record<SectionId, number>>>({});
  const [pluginNavigationTarget, setPluginNavigationTarget] = useState<PluginNavigationTarget | null>(null);
  const [startupProgress, setStartupProgress] = useState(6);
  const [startupMessage, setStartupMessage] = useState('正在初始化本地配置...');
  const [startupDone, setStartupDone] = useState(false);
  const sectionVisibilityRef = useRef({ developerMode, featureModuleSettings });

  useEffect(() => {
    sectionVisibilityRef.current = { developerMode, featureModuleSettings };
  }, [developerMode, featureModuleSettings]);

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
          setPluginNavigationTarget({
            requestId: Date.now(),
            sectionId: section,
            ...(event.workflowKind ? { workflowKind: event.workflowKind } : {}),
            ...(event.projectId ? { projectId: event.projectId } : {}),
            ...(event.viewId ? { viewId: event.viewId } : {}),
            ...(event.panelId ? { panelId: event.panelId } : {}),
          });
          setActiveSection(section);
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
    setActiveSection(isSectionVisible(section, developerMode, featureModuleSettings) ? section : 'home');
  }, [developerMode, featureModuleSettings]);

  useEffect(() => {
    if (!isSectionVisible(activeSection, developerMode, featureModuleSettings)) {
      setActiveSection('home');
    }
  }, [activeSection, developerMode, featureModuleSettings]);

  return (
    <>
      {!startupDone && <StartupSplash progress={startupProgress} message={startupMessage} />}
      <AppShell
        activeSection={activeSection}
        developerMode={developerMode}
        featureModuleSettings={featureModuleSettings}
        assistantPluginEnabled={assistantPluginEnabled}
        onSectionChange={changeSection}
      >
        <AppRouter
          key={`${activeSection}:${sectionRefreshKeys[activeSection] || 0}:${pluginNavigationTarget?.requestId || 0}`}
          activeSection={activeSection}
          featureModuleSettings={featureModuleSettings}
          pluginNavigationTarget={pluginNavigationTarget?.sectionId === activeSection ? pluginNavigationTarget : null}
          onSectionChange={changeSection}
          onDeveloperModeChange={setDeveloperMode}
          onFeatureModuleSettingsChange={setFeatureModuleSettings}
        />
      </AppShell>
    </>
  );
}

export default App;
