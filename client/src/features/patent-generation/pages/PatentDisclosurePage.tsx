import PatentComingPage from '../components/PatentComingPage';

function PatentDisclosurePage() {
  return (
    <PatentComingPage
      kicker="交底书生成"
      title="把选定专利点组织成代理人可继续修改的技术交底书"
      description="计划基于案件信息、技术联系人、专利类型和选定专利点，生成 Markdown 草稿并导出 Word 材料。"
      actionLabel="生成交底书"
      metrics={[
        { label: '章节结构', value: '6章', detail: '背景、方案、效果、保护点' },
        { label: '图示', value: '2类', detail: '系统框图与流程图' },
        { label: '导出', value: 'DOCX', detail: '交付代理人继续修订' },
      ]}
      steps={[
        { title: '补全案件信息', text: '维护案件名称、联系人、专利类型和技术主题。' },
        { title: '生成草稿', text: '围绕现有技术缺点、技术问题、详细方案和保护点成文。' },
        { title: '预览导出', text: '在 Markdown 里编辑确认，再导出 Word 和生成记录。' },
      ]}
      previewTitle="交底书章节示例"
      previewItems={[
        { title: '一、现有技术与缺点', status: '草稿', detail: '整理相近方案、公开资料和本案差异化切入点。' },
        { title: '三、技术方案详细阐述', status: '草稿', detail: '包含系统框图、流程说明、模块功能和关键参数。' },
        { title: '五、技术关键点和欲保护点', status: '草稿', detail: '把可写入权利要求的保护方向前置梳理。' },
      ]}
      outputTitle="交底书材料"
      outputItems={['技术交底书_时间戳.docx', '技术交底书_时间戳.md', 'Mermaid 图示资源', '生成报告']}
      outputDescription="首版会优先复用现有 Markdown 预览和 Word 导出能力，后续再增强版式模板。"
      showSelectedPatentPoint
      enableDisclosureDraft
    />
  );
}

export default PatentDisclosurePage;
