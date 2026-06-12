function buildAnalysisEvidence(analysis) {
  const candidateLines = (analysis.candidates || [])
    .slice(0, 45)
    .map((item) => `- ${item.path}（${item.category}，${item.line_count} 行）`)
    .join('\n');
  const groupedCandidates = ['入口', '路由', '页面', '业务服务', '组件', '状态数据', '通用能力']
    .map((category) => {
      const files = (analysis.candidates || [])
        .filter((item) => item.category === category)
        .slice(0, 12)
        .map((item) => item.path)
        .join('、');
      return files ? `${category}：${files}` : '';
    })
    .filter(Boolean)
    .join('\n');
  return [
    `项目名称：${analysis.projectName}`,
    `包名：${analysis.packageName || '无'}`,
    `版本：${analysis.packageVersion || '无'}`,
    `技术栈：${analysis.frameworks.join('、') || '未识别'}`,
    `编程语言：${analysis.languages.join('、') || '未识别'}`,
    `源码文件数：${analysis.fileCount}`,
    `源码总行数：${analysis.lineCount}`,
    analysis.readmeExcerpt ? `README 摘要：\n${analysis.readmeExcerpt}` : '',
    groupedCandidates ? `按类型归纳的源码证据：\n${groupedCandidates}` : '',
    `主要源码证据：\n${candidateLines}`,
  ].filter(Boolean).join('\n\n');
}

function buildBusinessContextMessages({ analysis, fields }) {
  return [
    {
      role: 'system',
      content: '你是中文软件著作权材料助手。只根据项目证据生成真实、克制、可核对的业务理解 JSON，不编造项目不存在的功能。',
    },
    {
      role: 'user',
      content: [
        '请根据以下项目证据生成软件著作权申请材料用的业务理解 JSON。',
        '字段包括 product_positioning、industry、target_users、core_value、business_features、operation_flow、main_functions、technical_characteristics、manual_modules。',
        'manual_modules 每项包含 title、purpose、entry、visible_elements、operation_steps、validation_rules、feedback、screenshot、source_files。',
        '要求：',
        '1. 只写源码证据或用户已确认字段能支撑的软件功能，不编造登录、支付、消息推送、权限审批等证据中不存在的模块。',
        '2. business_features 使用用户可感知的业务功能名称，避免“React 组件”“IPC 服务”等技术实现名称。',
        '3. manual_modules 优先来自页面、路由、入口和业务服务文件；每项 source_files 写 1-3 个对应源码路径。',
        '4. operation_flow 写普通用户视角的操作流程，不写代码流程、接口调用或数据库细节。',
        '5. technical_characteristics 保持软著登记口径，按项目证据描述软件形态、数据处理和导出等能力，不展开源码实现。',
        '6. 不要把单一能力泛化成更宽能力：例如证据只支持 PDF 导出时，只写 PDF 导出，不写“多格式导出”；只有源码或用户字段明确支持多个格式时才写“多格式”。',
        `用户已确认/填写字段：${JSON.stringify(fields)}`,
        buildAnalysisEvidence(analysis),
      ].join('\n\n'),
    },
  ];
}

function buildManualMarkdownMessages({ fields, business, modules }) {
  return [
    {
      role: 'system',
      content: '你是中文软件著作权操作手册撰写助手。输出 Markdown。语言面向普通用户，不写代码实现，不写技术框架，不使用营销套话。',
    },
    {
      role: 'user',
      content: [
        `请为“${fields.softwareName} ${fields.version}”生成软著操作手册草稿。`,
        '总要求：一级章节使用“一、二、三”中文序号；包含相关文档、说明、功能特点、系统要求、核心功能操作、常见问题解答、术语表；每个核心模块保留可见截图预留位。',
        '写作要求：',
        '1. 面向普通软件用户写操作手册，不出现源码、函数名、类名、IPC、数据库表、依赖包等实现细节。',
        '2. 核心功能章节必须来自“核心模块”，每个模块写入口、页面可见内容、操作步骤、校验提示、完成反馈。',
        '3. 操作步骤用连贯自然语言，避免空泛的“进行相关操作”“完成业务处理”。',
        '4. 不编造证据中不存在的功能；信息不足时使用“页面提示”“对应菜单”这类稳妥表述。',
        '5. 截图预留位统一写成“【截图预留：xxx】”，不要生成图片链接。',
        '6. 不要扩大功能范围：例如业务理解或用户字段只写 PDF 导出时，手册也只能写 PDF 导出，不写“多格式导出”。',
        '7. 文风应像正式软件著作权操作手册，克制、具体、可核对，不写营销口号。',
        `业务理解：${JSON.stringify(business)}`,
        `核心模块：${JSON.stringify(modules)}`,
      ].join('\n\n'),
    },
  ];
}

function buildManualIllustrationPrompt(fields) {
  return `为中文软件著作权操作手册生成一张干净的产品流程示意图，软件名称：${fields.softwareName}。画面包含软件界面、资料输入、处理进度、结果导出，不出现真实品牌标识，不包含敏感信息。`;
}

module.exports = {
  buildBusinessContextMessages,
  buildManualIllustrationPrompt,
  buildManualMarkdownMessages,
};
