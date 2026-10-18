import { getSectionModuleId } from '../../../app/menuConfig';
import type { FeatureModuleSettings } from '../../../shared/types';
import type { SectionId } from '../../../shared/types/navigation';
import { featureCards } from './HomePage';
import { navigationIcons } from '../../../components/Sidebar';

interface Props {
  featureModuleSettings?: FeatureModuleSettings | null;
  onNavigate: (section: SectionId) => void;
}

const cardDescriptions: Partial<Record<SectionId, string>> = {
  'presales-projects': '客户需求分析、售前方案与架构草稿',
  'technical-plan': '技术方案、可研报告、查重与废标检查',
  'thesis-diagnosis': '选题开题、研究设计与论文写作',
  'official-document-drafting': '智能起草、格式检查与润色改写',
  'grant-diagnosis': '选题政策、申报书与评审优化',
  'project-management': '项目规划、推进与成果交付',
  'software-copyright': '代码材料、申请文件与手册',
  'patent-projects': '技术挖掘、交底书、查新与修订',
};

export default function ModernHomePage({ featureModuleSettings, onNavigate }: Props) {
  const cards = featureCards.filter((item) => {
    const moduleId = getSectionModuleId(item.section);
    return !moduleId || featureModuleSettings?.modules?.[moduleId]?.enabled !== false;
  });
  const quickEntries = cards.filter((item) =>
    ['presales-projects', 'technical-plan', 'official-document-drafting'].includes(item.section)
  );

  return (
    <div className="modern-home">
      <section className="modern-hero">
        <div className="modern-hero-copy">
          <span className="modern-eyebrow">工作台首页 <span aria-hidden="true">/</span> {cards.length} 个业务空间</span>
          <h1>从这里开始，<br /><em>继续手头的工作。</em></h1>
          <p>选择对应的业务入口，进入项目、处理资料或继续编写内容。</p>
          {quickEntries.length > 0 && (
            <div className="modern-hero-quick-entries" aria-label="常用入口">
              <span>常用入口</span>
              {quickEntries.map((item) => (
                <button key={item.section} type="button" onClick={() => onNavigate(item.section)}>
                  {item.title}<span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modern-hero-art" aria-hidden="true">
          <div className="modern-hero-flow">
            <div className="modern-hero-flow-step"><span>01</span><strong>资料输入</strong><small>整理与解析</small><i /></div>
            <div className="modern-hero-flow-step"><span>02</span><strong>智能处理</strong><small>生成与检查</small><i /></div>
            <div className="modern-hero-flow-step"><span>03</span><strong>成果交付</strong><small>编辑与导出</small><i /></div>
          </div>
        </div>
      </section>
      <section className="modern-workspaces" aria-labelledby="modern-workspaces-heading">
        <div className="modern-section-heading">
          <div><span>选择入口</span><h2 id="modern-workspaces-heading">业务工作空间</h2></div>
          <p>按工作内容选择对应模块</p>
        </div>
        <div className="modern-card-grid">
          {cards.map((item) => {
            const Icon = navigationIcons[item.section];
            return (
              <button className={`modern-workspace-card is-${item.tone} module-${item.section}`} type="button" key={item.title} onClick={() => onNavigate(item.section)}>
                <span className="modern-card-background" aria-hidden="true"><Icon /></span>
                <span className="modern-card-icon" aria-hidden="true"><Icon /></span>
                <span className="modern-card-arrow" aria-hidden="true">↗</span>
                <strong>{item.title}</strong>
                <small>{cardDescriptions[item.section] || item.text}</small>
                <span className="modern-card-footer">{item.action}<span aria-hidden="true">→</span></span>
              </button>
            );
          })}
        </div>
      </section>
      <div className="modern-status-strip"><span><b />本地工作区已就绪</span></div>
    </div>
  );
}
