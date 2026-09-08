import PatentComingPage from '../components/PatentComingPage';
import type { SectionId } from '../../../shared/types/navigation';

function PatentMiningPage({ onNavigate }: { onNavigate?: (section: SectionId) => void }) {
  return (
    <PatentComingPage
      kicker="专利挖掘"
      title="导入项目，选择主专利点"
      description="扫描设计文档、方案材料和核心代码，按创新性、证据完整度和可实施性生成候选专利点。"
      actionLabel="导入项目资料"
      metrics={[
        { label: '候选专利点', value: '3-5', detail: '按创新性和可实施性排序' },
        { label: '材料来源', value: '多类', detail: '文档、代码、技术方案' },
        { label: '推荐方向', value: '1篇', detail: '优先生成最有价值交底书' },
      ]}
      steps={[
        { title: '导入资料', text: '选择项目目录、设计文档或技术说明，形成案件素材池。' },
        { title: '扫描分析', text: '识别算法、流程、数据处理、系统协同等可保护内容。' },
        { title: '候选评估', text: '输出候选专利点、区别点、可实施性和推荐保护类型。' },
      ]}
      previewTitle="候选专利点"
      previewItems={[
        { title: '多源材料一致性校验方法', status: '推荐', detail: '围绕招投标文档解析后的结构化校验闭环展开。' },
        { title: '基于知识库的响应内容生成方法', status: '备选', detail: '突出知识条目匹配、上下文约束和正文生成协同。' },
        { title: '投标文件风险项自动检查方法', status: '备选', detail: '聚焦硬性条款、废标项和响应完整性的检测流程。' },
      ]}
      outputTitle="挖掘分析包"
      outputItems={['专利点分析.md', '候选专利点评分表', '推荐保护方向', '后续交底书输入材料']}
      outputDescription="上线后会保存每次挖掘结果，供交底书生成、查新分析和后续迭代复用。"
      enableMiningActions
      enablePatentPointSelection
      onNavigate={onNavigate}
    />
  );
}

export default PatentMiningPage;
