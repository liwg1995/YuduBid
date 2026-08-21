const OUTLINE_TEMPLATES = {
  government: ['总论', '项目建设背景和必要性', '需求分析与产出方案', '项目选址与要素保障', '建设方案', '运营方案', '投融资与财务方案', '项目影响效果分析', '项目风险管控方案', '研究结论及建议'],
  enterprise: ['总论', '项目建设背景和必要性', '市场分析', '建设方案', '运营方案', '投融资与财务方案', '项目影响效果分析', '风险分析', '研究结论及建议'],
  industrial: ['总论', '市场预测与建设规模', '厂址与建设条件', '技术方案、设备方案和工程方案', '原材料与能源供应', '节能与环境影响', '组织机构与实施进度', '投资估算与财务评价', '风险分析', '结论与建议'],
  hi_tech: ['总论', '技术与产品分析', '市场与竞争分析', '研发及产业化方案', '知识产权与团队', '建设与运营方案', '投融资与经济评价', '社会效益与风险', '结论与建议'],
  infrastructure: ['总论', '需求与建设必要性', '建设条件与选址', '工程建设方案', '运营维护方案', '资源节约与环境影响', '投资估算与资金筹措', '经济社会评价', '风险与应急管理', '结论与建议'],
  eco_environmental: ['总论', '现状调查与问题识别', '建设必要性', '治理目标与规模', '工程与技术方案', '环境影响与生态效益', '运营维护方案', '投资估算与资金筹措', '风险分析', '结论与建议'],
  commercial_realestate: ['总论', '市场与区位分析', '项目定位与建设规模', '规划与建筑方案', '开发建设计划', '营销与运营方案', '投资估算与资金筹措', '财务评价', '风险分析', '结论与建议'],
};

function commonContext({ projectInfo, sourceMarkdown }) {
  return `项目基本信息：\n${JSON.stringify(projectInfo, null, 2)}\n\n项目资料：\n${sourceMarkdown || '未导入补充资料，请仅依据项目基本信息分析，并明确待确认项。'}`;
}

function analysisMessages(payload) {
  return [{ role: 'system', content: '你是严谨的中国建设项目可行性研究顾问。区分材料事实、合理推导和待确认信息，禁止编造政策文号、数据和结论。只返回 JSON。' }, { role: 'user', content: `${commonContext(payload)}\n\n请输出：summary（项目概况）、facts（事实数组）、inferences（合理推导数组）、missing_information（缺失信息数组）、conflicts（冲突数组）、policy_and_compliance（政策合规关注数组）、risks（风险数组）、recommendations（建议数组）。` }];
}

function outlineMessages({ projectInfo, analysisMarkdown, outlineTemplate, targetWords, references }) {
  const chapters = OUTLINE_TEMPLATES[outlineTemplate] || OUTLINE_TEMPLATES.government;
  return [{ role: 'system', content: '你是可行性研究报告目录专家。目录最多三级，结构完整、标题专业；不得生成正文。只返回 JSON。' }, { role: 'user', content: `项目：${JSON.stringify(projectInfo, null, 2)}\n分析底稿：${analysisMarkdown}\n模板一级章节：${JSON.stringify(chapters)}\n目标全文字数：${targetWords}\n可用知识条目：${JSON.stringify(references || [])}\n\n返回 {project_name, project_overview, outline}。outline 节点字段为 id、title、description、knowledge_item_ids、children；id 唯一，knowledge_item_ids 只能使用可用知识条目的 id。一级章节原则上遵循模板，并细化到适合写作的二、三级目录。` }];
}

function adjustmentMessages({ outlineData, instruction }) {
  return [{ role: 'system', content: '你是可行性研究报告目录编辑。按要求调整目录，保持最多三级、节点 id 唯一，不生成正文。只返回 JSON。' }, { role: 'user', content: `当前目录：${JSON.stringify(outlineData)}\n调整要求：${instruction}\n返回完整 {project_name, project_overview, outline}。` }];
}

function parametersMessages({ projectInfo, analysisMarkdown, outlineData, references }) {
  return [{ role: 'system', content: '你是可研报告技术负责人。提炼供全文统一引用的关键参数；未确认数据必须标注“待确认”，禁止臆造。输出 Markdown。' }, { role: 'user', content: `项目：${JSON.stringify(projectInfo, null, 2)}\n分析底稿：${analysisMarkdown}\n目录：${JSON.stringify(outlineData)}\n知识条目：${JSON.stringify(references || [])}\n\n按“建设规模与内容、建设周期、投资与资金来源、技术经济指标、运营与效益口径、待确认事项”形成参数表和说明。` }];
}

function contentMessages({ projectInfo, analysisMarkdown, keyParametersMarkdown, sectionPath, section, targetWords, knowledge }) {
  return [{ role: 'system', content: '你是中国建设项目可行性研究报告编制专家。严格遵守已确认参数；资料不足时明确写待确认，不得编造政策文号、批复、指标或数据。直接输出该小节的 Markdown 正文，不输出代码围栏，不得重复输出当前小节标题。正文如需使用 Markdown 子标题，标题不得带“一、二、三、”“（一）（二）（三）”或“(一) (二) (三)”等人工序号。' }, { role: 'user', content: `项目基本信息：${JSON.stringify(projectInfo, null, 2)}\n资料分析底稿：${analysisMarkdown}\n全文关键参数：${keyParametersMarkdown}\n本节路径：${sectionPath.join(' > ')}\n本节写作说明：${section.description || '围绕本节标题展开专业论述'}\n建议篇幅：约 ${targetWords} 字\n关联知识条目：${JSON.stringify(knowledge || [])}\n\n要求：内容具体、逻辑连续、适合直接纳入可研报告；可使用必要的 Markdown 表格和列表，但不要重复其他章节内容。若使用 Markdown 子标题，只写标题名称，不添加中文数字序号或括号序号。` }];
}

function illustrationPlanMessages({ projectInfo, sectionPath, section, content, useAiImages, useMermaidImages, useTechnicalDiagrams }) {
  return [{
    role: 'system',
    content: '你是可行性研究报告配图编排专家。判断必须克制，只在图形能显著提升理解时配图。只返回 JSON，不输出 Markdown 代码围栏。',
  }, {
    role: 'user',
    content: `项目基本信息：${JSON.stringify(projectInfo, null, 2)}
章节路径：${sectionPath.join(' > ')}
章节说明：${section.description || ''}
章节正文：${content}

可用配图方式：
- AI 生图：${useAiImages ? '已启用，适合项目场景、设施设备、建设空间和实物示意' : '未启用，needed 必须为 false'}
- Mermaid：${useMermaidImages ? '已启用，适合流程、层级、时间线和关系图' : '未启用，needed 必须为 false'}
- 技术图谱：${useTechnicalDiagrams ? '已启用，适合架构、拓扑、数据流、模块和复杂工程步骤' : '未启用，needed 必须为 false'}

三种方式可以同时需要，但避免内容重复。返回：
{
  "image": {"needed": false, "style": "engineering_diagram 或 realistic_photo", "title": "", "prompt": ""},
  "mermaid": {"needed": false, "title": "", "code": "完整合法 Mermaid 代码，不含代码围栏"},
  "diagram": {
    "needed": false,
    "type": "architecture/data-flow/flowchart/deployment/process/topology",
    "style": "document/blueprint/clean",
    "title": "",
    "subtitle": "",
    "nodes": [{"id": "node1", "label": "", "sublabel": "", "group": "", "kind": "service/database/decision/actor/gateway"}],
    "arrows": [{"from": "node1", "to": "node2", "label": "", "flow": "primary/data/control/write/read/async/feedback"}]
  }
}
若某方式不需要，保留对象并令 needed 为 false。图中只能使用正文已有事实，不得补造数据。`,
  }];
}

function humanWritingMessages({ projectInfo, keyParametersMarkdown, sectionPath, content }) {
  return [{ role: 'system', content: '你是可行性研究报告高级审校专家。提升专业性、自然度、连贯性和可读性，不以规避检测为目的。必须保持事实、数字、结论、Markdown 表格、图片链接和 Mermaid 代码块不变；不得新增未经确认的信息。直接返回完整的审校后 Markdown 正文，不重复输出当前小节标题，不输出代码围栏。Markdown 子标题不得带“一、二、三、”“（一）（二）（三）”或“(一) (二) (三)”等人工序号。' }, { role: 'user', content: `项目基本信息：${JSON.stringify(projectInfo, null, 2)}\n全文关键参数：${keyParametersMarkdown}\n章节路径：${sectionPath.join(' > ')}\n\n待审校正文：\n${content}\n\n重点处理机械重复、空泛套话、句式僵硬、衔接突兀和不符合可研文体的表达。` }];
}

module.exports = { OUTLINE_TEMPLATES, analysisMessages, outlineMessages, adjustmentMessages, parametersMessages, contentMessages, illustrationPlanMessages, humanWritingMessages };
