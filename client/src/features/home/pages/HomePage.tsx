import type { SectionId } from '../../../shared/types/navigation';

interface HomePageProps {
  onNavigate: (section: SectionId) => void;
}

type HomeIconName = 'spark' | 'flow' | 'shield' | 'archive' | 'code' | 'patent' | 'book' | 'document' | 'check';

const overviewStats: Array<{ label: string; value: string; detail: string; tone: string; icon: HomeIconName }> = [
  { label: '核心工作区', value: '4组', detail: '招投标、公文、软著、专利', tone: 'blue', icon: 'flow' },
  { label: 'AI生成链路', value: '8类', detail: '方案、正文、代码、交底书等', tone: 'violet', icon: 'spark' },
  { label: '本地能力', value: '多项', detail: '文件解析、Word导出、SQLite工作区', tone: 'cyan', icon: 'archive' },
  { label: '专利流程', value: '4步', detail: '挖掘、交底、查新、修订', tone: 'green', icon: 'patent' },
];

const featureCards: Array<{ title: string; text: string; action: string; section: SectionId; tone: string; icon: HomeIconName; tags: string[] }> = [
  {
    title: '招投标工作流',
    text: '围绕招标文件解析、目录生成、正文编排、查重和废标项检查形成完整投标辅助链路。',
    action: '进入技术方案',
    section: 'technical-plan',
    tone: 'blue',
    icon: 'flow',
    tags: ['解析', '生成', '检查'],
  },
  {
    title: '公文写作',
    text: '支持公文草稿导入、要素提取、智能起草、格式检查、降 AI 味润色和 Word 导出。',
    action: '进入智能起草',
    section: 'official-document-drafting',
    tone: 'green',
    icon: 'document',
    tags: ['公文', '润色', '导出'],
  },
  {
    title: '软件著作材料',
    text: '从项目代码和说明材料出发，辅助准备软著源码、申请表、手册和交付材料。',
    action: '进入软著生成',
    section: 'software-copyright',
    tone: 'cyan',
    icon: 'code',
    tags: ['代码', '手册', '申报'],
  },
  {
    title: '专利生成',
    text: '从项目资料中挖掘可保护技术点，并生成交底书、查新分析和修订版本留档。',
    action: '进入专利挖掘',
    section: 'patent-mining',
    tone: 'violet',
    icon: 'patent',
    tags: ['挖掘', '交底', '查新'],
  },
];

const workflowItems = [
  '先在设置中确认文本模型、文件解析和导出偏好。',
  '导入项目或招标资料后，按页面步骤生成、检查、编辑和导出。',
  '长任务在 Electron Main 后台执行，页面切换不会中断任务。',
  '关键结果保存在本机工作区，便于继续修订和留档。',
];

const quickSignals = [
  { label: '模型配置', value: '可切换', tone: 'blue' },
  { label: '文件解析', value: '本地优先', tone: 'green' },
  { label: '导出能力', value: 'Word', tone: 'violet' },
];

function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="home-page">
      <section className="home-hero-card">
        <div>
          <span className="section-kicker">首页</span>
          <h2>禹都 AI 解决方案助手</h2>
          <p>一个面向投标资料、公文材料、软著材料、专利交底书和技术文档的本地 AI 工作台，把资料解析、生成、检查、修订和导出收拢到同一套桌面流程里。</p>
          <div className="home-signal-row" aria-label="工作台状态">
            {quickSignals.map((item) => (
              <span className={`home-signal is-${item.tone}`} key={item.label}>
                <HomeIcon name="check" />
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="home-stat-grid" aria-label="软件能力统计">
          {overviewStats.map((item) => (
            <article className={`is-${item.tone}`} key={item.label}>
              <span className="home-stat-icon" aria-hidden="true">
                <HomeIcon name={item.icon} />
              </span>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <div>
            <span className="section-kicker">能力概览</span>
            <h3>常用功能</h3>
          </div>
        </div>
        <div className="home-feature-grid">
          {featureCards.map((item) => (
            <article className={`is-${item.tone}`} key={item.title}>
              <span className="home-feature-icon" aria-hidden="true">
                <HomeIcon name={item.icon} />
              </span>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
              <div className="home-tag-row">
                {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <button type="button" className="secondary-action" onClick={() => onNavigate(item.section)}>
                {item.action}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-workflow-card">
        <div className="home-section-head">
          <div>
            <span className="section-kicker">使用节奏</span>
            <h3>推荐从这里开始</h3>
          </div>
        </div>
        <div className="home-workflow-list">
          {workflowItems.map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomeIcon({ name }: { name: HomeIconName }) {
  switch (name) {
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.4 13.9 9l5.7 1.9-5.7 1.9L12 18.6l-1.9-5.8-5.7-1.9L10.1 9 12 3.4Z" />
          <path d="M18.2 15.2 19 18l2.6.8-2.6.9-.8 2.7-.9-2.7-2.6-.9 2.6-.8.9-2.8Z" />
        </svg>
      );
    case 'flow':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7.2h6.2" />
          <path d="M12.8 7.2H19" />
          <path d="M5 16.8h6.2" />
          <path d="M12.8 16.8H19" />
          <path d="M9.4 4.8 12 7.2 9.4 9.6" />
          <path d="M14.6 14.4 12 16.8l2.6 2.4" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.7 18.6 6v5.2c0 4.2-2.6 7.5-6.6 9.1-4-1.6-6.6-4.9-6.6-9.1V6L12 3.7Z" />
          <path d="m9.3 12.1 1.8 1.8 3.8-4.2" />
        </svg>
      );
    case 'archive':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5.2 8.2h13.6v11H5.2z" />
          <path d="M4 5h16v3.2H4z" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'code':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8.6 8-4 4 4 4" />
          <path d="m15.4 8 4 4-4 4" />
          <path d="m13.4 6.5-2.8 11" />
        </svg>
      );
    case 'patent':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.2 18.5h5.6" />
          <path d="M10 21h4" />
          <path d="M8.4 14.8A5.8 5.8 0 0 1 6 10.1a6 6 0 0 1 12 0 5.8 5.8 0 0 1-2.4 4.7c-.6.5-.8.9-.8 1.6H9.2c0-.7-.2-1.1-.8-1.6Z" />
          <path d="M10.2 10.2 11.5 12l2.5-3.4" />
        </svg>
      );
    case 'book':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4.8h8.2a3.8 3.8 0 0 1 3.8 3.8v10.6H9.8A3.8 3.8 0 0 0 6 15.4z" />
          <path d="M6 15.4a3.8 3.8 0 0 1 3.8-3.8H18" />
          <path d="M9 8h5.2" />
        </svg>
      );
    case 'document':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 3.8h8.1L18.5 7.7v12.5h-12z" />
          <path d="M14.4 4.1v3.8h3.8" />
          <path d="M9 11h6" />
          <path d="M9 14.2h6" />
          <path d="M9 17.4h3.7" />
        </svg>
      );
    case 'check':
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5.8 12.4 3.4 3.4 8.8-9.1" />
        </svg>
      );
  }
}

export default HomePage;
