import PatentComingPage from '../components/PatentComingPage';

function PatentPriorArtPage() {
  return (
    <PatentComingPage
      kicker="查新分析"
      title="把现有技术、公开专利和本案区别点整理清楚"
      description="计划先支持手动导入检索资料并由 AI 辅助归纳，后续再评估国知局公布公告站自动查新能力。"
      actionLabel="整理查新资料"
      metrics={[
        { label: '资料录入', value: '手动', detail: '第一版降低联网抓取风险' },
        { label: '对比维度', value: '3项', detail: '方案、场景、局限性' },
        { label: '回写', value: '1.1', detail: '同步到交底书现有技术' },
      ]}
      steps={[
        { title: '录入公开资料', text: '粘贴专利、论文、网页或代理人检索结果。' },
        { title: '结构化对比', text: '抽取技术方案、应用场景、局限性和公开来源。' },
        { title: '形成区别点', text: '归纳本案改进点，并回写交底书第一章。' },
      ]}
      previewTitle="查新条目示例"
      previewItems={[
        { title: '相近公开专利 A', status: '待核验', detail: '用于比对核心流程是否已经公开。' },
        { title: '行业方案 B', status: '待整理', detail: '用于说明现有方案在数据闭环上的不足。' },
        { title: '本案区别点', status: '待生成', detail: '输出可直接进入交底书的差异化论述。' },
      ]}
      outputTitle="查新分析材料"
      outputItems={['查新分析.md', '现有技术对比表', '本案区别点摘要', '交底书 1.1 回写内容']}
      outputDescription="国知局自动检索会作为增强版单独评估，避免第一版被 Playwright 打包和站点稳定性拖住。"
      enablePriorArtAnalysis
    />
  );
}

export default PatentPriorArtPage;
