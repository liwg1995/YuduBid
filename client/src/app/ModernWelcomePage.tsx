import logoUrl from '../../assets/icon_256.png';

interface ModernWelcomePageProps {
  exiting: boolean;
  onStart: () => void;
}

function ModernWelcomePage({ exiting, onStart }: ModernWelcomePageProps) {
  return (
    <main className={`modern-welcome-page${exiting ? ' is-leaving' : ''}`} aria-labelledby="modern-welcome-title">
      <div className="modern-welcome-window-drag" aria-hidden="true" />
      <div className="modern-welcome-ambient" aria-hidden="true"><span /><span /></div>
      <div className="modern-welcome-layout">
        <section className="modern-welcome-copy">
          <div className="modern-welcome-brand"><img src={logoUrl} alt="" /><span>禹都 <b>AI解决方案助手</b></span></div>
          <span className="modern-welcome-kicker">工作空间已准备就绪</span>
          <h1 id="modern-welcome-title">欢迎来到<br /><em>新版工作空间</em></h1>
          <p>从资料整理到成果交付，熟悉的项目和工具，都在这里继续。</p>
          <button className="modern-welcome-start" type="button" onClick={onStart} disabled={exiting} autoFocus>
            <span>开始探索</span><span aria-hidden="true">↗</span>
          </button>
          <small>你的项目、资料与设置已为你保留</small>
        </section>
        <div className="modern-welcome-art" aria-hidden="true">
          <div className="modern-welcome-art-grid" />
          <div className="modern-welcome-art-halo" />
          <div className="modern-welcome-art-board">
            <div className="modern-welcome-art-board-head"><span /><span /><span /><i /></div>
            <div className="modern-welcome-art-board-body">
              <div className="modern-welcome-art-rail"><i /><i /><i /><i /></div>
              <div className="modern-welcome-art-canvas">
                <div className="modern-welcome-art-line is-short" />
                <div className="modern-welcome-art-line is-title" />
                <div className="modern-welcome-art-row"><span /><span /><span /></div>
                <div className="modern-welcome-art-sheet"><i /><i /><i /><b /></div>
              </div>
            </div>
          </div>
          <div className="modern-welcome-art-mark"><span>资料</span><i /><span>思考</span><i /><span>成果</span></div>
        </div>
      </div>
    </main>
  );
}

export default ModernWelcomePage;
