import { useEffect, useState } from 'react';
import AppRouter from './app/AppRouter';
import StartupSplash from './app/StartupSplash';
import UpdateNotifier from './app/UpdateNotifier';
import AppShell from './components/AppShell';
import { trackAppOpen, trackConfigUsage, trackPageView } from './shared/analytics/analytics';
import type { SectionId } from './shared/types/navigation';

function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [developerMode, setDeveloperMode] = useState(false);
  const [startupProgress, setStartupProgress] = useState(6);
  const [startupMessage, setStartupMessage] = useState('正在初始化本地配置...');
  const [startupDone, setStartupDone] = useState(false);

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

    trackAppOpen();

    const configPromise = window.yibiao?.config.load?.() ?? Promise.resolve(null);

    void configPromise
      .then((config) => {
        if (!alive) return;
        setDeveloperMode(Boolean(config?.developer_mode));
        trackConfigUsage({}, config);
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
    trackPageView(activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (!developerMode && activeSection === 'developer-test') {
      setActiveSection('technical-plan');
    }
  }, [activeSection, developerMode]);

  return (
    <>
      <UpdateNotifier />
      {!startupDone && <StartupSplash progress={startupProgress} message={startupMessage} />}
      <AppShell
        activeSection={activeSection}
        developerMode={developerMode}
        onSectionChange={setActiveSection}
      >
        <AppRouter activeSection={activeSection} onSectionChange={setActiveSection} onDeveloperModeChange={setDeveloperMode} />
      </AppShell>
    </>
  );
}

export default App;
