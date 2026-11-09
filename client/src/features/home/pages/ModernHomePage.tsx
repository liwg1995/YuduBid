import { getSectionModuleId } from '../../../app/menuConfig';
import type { FeatureModuleId, FeatureModuleSettings } from '../../../shared/types';
import type { SectionId } from '../../../shared/types/navigation';
import { featureCards } from './HomePage';
import { navigationIcons } from '../../../components/Sidebar';

interface Props {
  featureModuleSettings?: FeatureModuleSettings | null;
  onRevealModule: (moduleId: FeatureModuleId, opener: HTMLButtonElement) => void;
}

const cardDescriptions: Partial<Record<SectionId, string>> = {
  'presales-projects': '客户需求分析、售前方案与架构草稿',
  'technical-plan': '方案生成、可研报告、查重与废标检查',
  'thesis-diagnosis': '选题开题、研究设计与论文写作',
  'official-document-drafting': '智能起草、格式检查与润色改写',
  'grant-diagnosis': '选题政策、申报书与评审优化',
  'project-management': '项目规划、推进与成果交付',
  'software-copyright': '代码材料、申请文件与手册',
  'patent-projects': '技术挖掘、交底书、查新与修订',
};

export default function ModernHomePage({ featureModuleSettings, onRevealModule }: Props) {
  const cards = featureCards.flatMap((item) => {
    const moduleId = getSectionModuleId(item.section);
    return moduleId && featureModuleSettings?.modules?.[moduleId]?.enabled !== false
      ? [{ ...item, moduleId }]
      : [];
  });

  return (
    <div className="modern-home">
      <section className="modern-hero">
        <div className="modern-hero-copy">
          <span className="modern-eyebrow">工作台首页 <span aria-hidden="true">/</span> {cards.length} 个业务空间</span>
          <h1>从这里开始，<br /><em>继续手头的工作。</em></h1>
          <p>选择业务空间，在左侧功能导航中继续操作。</p>
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
              <button className={`modern-workspace-card is-${item.tone} module-${item.section}`} type="button" key={item.title} onClick={(event) => onRevealModule(item.moduleId, event.currentTarget)}>
                <span className="modern-card-background" aria-hidden="true"><Icon /></span>
                <span className="modern-card-icon" aria-hidden="true"><Icon /></span>
                <span className="modern-card-arrow" aria-hidden="true">☷</span>
                <strong>{item.title}</strong>
                <small>{cardDescriptions[item.section] || item.text}</small>
                <span className="modern-card-footer">查看功能<span aria-hidden="true">‹</span></span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
