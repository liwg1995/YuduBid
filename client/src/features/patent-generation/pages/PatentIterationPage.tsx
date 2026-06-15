import PatentComingPage from '../components/PatentComingPage';

function PatentIterationPage() {
  return (
    <PatentComingPage
      kicker="修订迭代"
      title="在已有交底书上补材料、纠错并保留每一版记录"
      description="计划支持针对已生成交底书追加实施例、修正事实参数、强化保护点，并输出新的时间戳版本。"
      actionLabel="开始修订"
      metrics={[
        { label: '修订类型', value: '2类', detail: '补充合并与事实纠正' },
        { label: '版本规则', value: '时间戳', detail: '每次交付不覆盖旧稿' },
        { label: '留档', value: '记录', detail: '保存修订摘要和交付文件' },
      ]}
      steps={[
        { title: '选择旧稿', text: '读取已有 Markdown 或上次生成的交底书草稿。' },
        { title: '输入修订说明', text: '区分补充材料、纠错、扩展实施例或调整保护点。' },
        { title: '生成新版本', text: '另存时间戳文件，并追加修订记录。' },
      ]}
      previewTitle="修订任务示例"
      previewItems={[
        { title: '补充实施例', status: '合并', detail: '把新增技术材料并入第三章和第六章。' },
        { title: '修正参数', status: '纠错', detail: '联动更新公式、参数表和流程描述。' },
        { title: '强化保护点', status: '扩展', detail: '围绕第五章保护方向做权利要求倾向提示。' },
      ]}
      outputTitle="修订交付物"
      outputItems={['案件名_时间戳.docx', '案件名_时间戳.md', '交底书修订记录.md', '本轮修订摘要']}
      outputDescription="迭代模块会优先保证版本可追踪，适合和代理人多轮沟通时使用。"
      enableRevision
    />
  );
}

export default PatentIterationPage;
