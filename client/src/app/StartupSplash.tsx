import logoUrl from '../../assets/icon_256.png';

interface StartupSplashProps {
  progress: number;
  message: string;
}

function StartupSplash({ progress, message }: StartupSplashProps) {
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="startup-splash" role="status" aria-live="polite">
      <div className="startup-particle-field" aria-hidden="true">
        <span className="startup-particle is-blue" />
        <span className="startup-particle is-cyan" />
        <span className="startup-particle is-violet" />
        <span className="startup-particle is-pink" />
        <span className="startup-particle is-green" />
        <span className="startup-light is-top" />
        <span className="startup-light is-bottom" />
      </div>
      <div className="startup-card">
        <div className="startup-brand">
          <img className="startup-modern-logo" src={logoUrl} alt="" />
          <span>禹都</span>
          <strong>AI解决方案助手</strong>
        </div>
        <div className="startup-copy">
          <span className="startup-modern-kicker">启象 · 智能工作空间</span>
          <h1>正在打开工作台</h1>
          <p>{message}</p>
        </div>
        <div className="startup-modern-visual" aria-hidden="true">
          <div className="startup-visual-orbit"><i /><i /><i /></div>
          <div className="startup-visual-core"><span>资料输入</span><b>→</b><span>智能处理</span><b>→</b><span>成果交付</span></div>
        </div>
        <div className="startup-progress-head">
          <span>加载进度</span>
          <strong>{normalizedProgress}%</strong>
        </div>
        <div className="startup-progress-track" aria-label={`应用加载进度 ${normalizedProgress}%`}>
          <span style={{ width: `${normalizedProgress}%` }} />
        </div>
      </div>
    </div>
  );
}

export default StartupSplash;
