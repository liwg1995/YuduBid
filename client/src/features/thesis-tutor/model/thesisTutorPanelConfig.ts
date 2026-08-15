import type { SectionId } from '../../../shared/types/navigation';
import type { ThesisTutorPanel, ThesisTutorProfile } from '../types';

export const defaultProfile: ThesisTutorProfile = {
  degree: '本科',
  degreeType: '学术学位',
  discipline: '',
  direction: '',
  language: '中文',
  title: '',
  stage: '没方向',
  citationFormat: 'GB/T 7714',
  schoolRequirements: '',
  advisorPreferences: '',
  milestones: '',
  dataSources: '',
  researchType: '未确定',
  targetWordCount: '',
  writingScope: '章节初稿',
  dataIntegrityNotes: '',
  researchQuestions: '',
  methodologyNotes: '',
  outlinePlan: '',
  literatureNotes: '',
};

export interface ThesisTutorPanelCopy {
  section: SectionId;
  label: string;
  title: string;
  description: string;
  inputTitle: string;
  inputHelp: string;
  materialTitle: string;
  materialHelp: string;
  resultTitle: string;
  resultHelp: string;
  placeholder: string;
  sourcePlaceholder: string;
  resultPlaceholder: string;
}

export const panelCopy: Record<ThesisTutorPanel, ThesisTutorPanelCopy> = {
  diagnosis: {
    section: 'thesis-diagnosis',
    label: '启动诊断',
    title: '先定位论文所处阶段，再给一条能走下去的路线',
    description: '根据学位、专业、语种、时间和卡点生成诊断简报、阶段路径与本周任务。',
    inputTitle: '诊断信息',
    inputHelp: '写清学位、专业、时间节点和当前卡点；越具体，路径越准。',
    materialTitle: '补充约束',
    materialHelp: '可补充导师要求、学院时间表、可获得数据、个人时间安排。',
    resultTitle: '诊断简报',
    resultHelp: '生成后可继续编辑路径、任务和时间安排。',
    placeholder: '例如：我是工商管理硕士，只有一个大方向，还没定题，三个月后要开题。',
    sourcePlaceholder: '粘贴导师要求、培养方案、开题时间节点或个人限制。没有材料也可以先诊断。',
    resultPlaceholder: '诊断简报会显示在这里，也可以先手动记录你的阶段判断和下一步计划。',
  },
  topic: {
    section: 'thesis-topic',
    label: '选题与开题',
    title: '把方向压成可研究、可获取材料、可答辩的题目',
    description: '生成候选题、评估难度与资料充足度，并组织开题报告框架。',
    inputTitle: '选题方向',
    inputHelp: '写清专业方向、感兴趣对象、实践场景和导师偏好。',
    materialTitle: '选题依据',
    materialHelp: '可放政策背景、行业案例、导师意见、已有文献或数据来源。',
    resultTitle: '选题与开题方案',
    resultHelp: '用于比较候选题、锁定题目并继续扩展开题报告。',
    placeholder: '例如：我想写基层数字治理，请帮我给几个适合 MPA 的题目。',
    sourcePlaceholder: '粘贴政策文件摘要、案例背景、导师建议、已有题目或可获得数据说明。',
    resultPlaceholder: '候选题、可行性评估和开题框架会显示在这里。',
  },
  literature: {
    section: 'thesis-literature',
    label: '文献综述',
    title: '从检索式到综述结构，先把文献变成可写的材料',
    description: '生成中英文关键词、数据库检索式、文献分类表和综述大纲。',
    inputTitle: '综述主题',
    inputHelp: '写清研究主题、核心变量、研究对象和希望检索的数据库。',
    materialTitle: '文献材料',
    materialHelp: '可粘贴文献题录、摘要、关键词、已有文献表或综述草稿。',
    resultTitle: '文献综述工作稿',
    resultHelp: '用于整理检索式、主题分类、综述大纲和综述段落。',
    placeholder: '例如：围绕“生成式 AI 对大学生学习投入的影响”设计文献检索策略。',
    sourcePlaceholder: '粘贴文献标题、作者年份、摘要、核心观点，或从 Zotero/知网导出的题录。',
    resultPlaceholder: '检索关键词、检索式、文献分类框架和综述写作建议会显示在这里。',
  },
  methodology: {
    section: 'thesis-methodology',
    label: '研究设计',
    title: '让研究问题、方法、数据和分析路径互相咬合',
    description: '匹配量化、质性、混合方法，细化变量、样本、访谈或案例路线。',
    inputTitle: '研究问题',
    inputHelp: '写清你要回答什么问题、已有题目、研究对象和数据条件。',
    materialTitle: '方法与数据材料',
    materialHelp: '可放变量设想、问卷题项、访谈对象、案例材料或数据表说明。',
    resultTitle: '研究设计方案',
    resultHelp: '用于确认方法路线、样本、变量、数据收集和分析步骤。',
    placeholder: '例如：这个题目适合问卷还是访谈？变量和假设怎么设计？',
    sourcePlaceholder: '粘贴已有变量、假设、问卷草稿、访谈提纲、样本来源或案例资料。',
    resultPlaceholder: '方法匹配、变量假设、样本设计和分析路径会显示在这里。',
  },
  data: {
    section: 'thesis-data',
    label: '数据与实证',
    title: '先判断数据能不能支撑结论，再决定怎么写实证',
    description: '检查数据来源、样本、变量和真实性边界，输出可做分析、风险和写作边界。',
    inputTitle: '数据预检任务',
    inputHelp: '写清数据类型、样本量、变量、想做的分析和你担心的问题。',
    materialTitle: '数据说明/样本材料',
    materialHelp: '可放数据字段说明、问卷结构、访谈样本、公开数据来源、表格摘录或统计结果。',
    resultTitle: '数据与实证预检',
    resultHelp: '用于确认数据是否可用、适合哪些分析、哪些结论不能提前写。',
    placeholder: '例如：我有 260 份问卷，变量包括工作压力、组织支持和离职倾向，想判断能不能做中介/调节分析。',
    sourcePlaceholder: '粘贴数据字段、变量定义、样本量、问卷题项、公开数据来源、已有统计表或分析结果。',
    resultPlaceholder: '数据真实性判断、可做分析、风险和实证写作边界会显示在这里。',
  },
  charts: {
    section: 'thesis-charts',
    label: '图表与模型图',
    title: '把研究框架、技术路线和变量关系画成可编辑图',
    description: '生成 Mermaid 研究框架图、技术路线图、变量关系图、章节结构图和数据分析流程图。',
    inputTitle: '图表需求',
    inputHelp: '写清想画哪类图、放在哪一章、需要体现哪些变量/步骤/关系。',
    materialTitle: '图表依据',
    materialHelp: '可放题目、研究问题、变量假设、技术路线、章节目录、数据分析步骤或导师画图要求。',
    resultTitle: '图表与模型图',
    resultHelp: '结果会优先输出 Mermaid 代码块，可继续编辑、复制或随 Word 导出转换为图片。',
    placeholder: '例如：根据我的题目和研究设计，画一个研究框架图和技术路线图，适合放在第三章。',
    sourcePlaceholder: '粘贴研究问题、变量关系、技术路线、章节目录、数据处理步骤、导师要求或已有图的文字说明。',
    resultPlaceholder: 'Mermaid 图、图名图注、节点解释和可修改项会显示在这里。',
  },
  drafting: {
    section: 'thesis-drafting',
    label: '自动成稿',
    title: '基于档案、材料和证据链生成可编辑论文初稿',
    description: '支持章节初稿、整篇初稿框架、摘要绪论、结论和导师意见改写，缺材料处会显式标注。',
    inputTitle: '成稿任务',
    inputHelp: '写清要生成整篇初稿、某一章、某一节、摘要/结论，还是按导师意见重写。',
    materialTitle: '成稿依据',
    materialHelp: '放真实文献、开题报告、导师意见、数据说明、章节计划或已有草稿；没有依据会生成框架型草稿并标注缺口。',
    resultTitle: '论文初稿',
    resultHelp: '生成后可继续编辑、保存到章节草稿、带入逐章写作或导出 Word。',
    placeholder: '例如：根据论文档案和材料，先生成第一章绪论初稿，约 2500 字，缺文献处标注“需补充”。',
    sourcePlaceholder: '粘贴开题报告、文献摘要、导师要求、已有目录、数据说明或章节草稿。材料越完整，成稿越贴近论文。',
    resultPlaceholder: '论文初稿会显示在这里。建议生成后逐段核对文献、数据和导师要求，再进入逐章写作继续修改。',
  },
  writing: {
    section: 'thesis-writing',
    label: '逐章写作',
    title: '基于真实材料写正文，缺文献的位置明确标出来',
    description: '用于章节初稿、段落批注、导师反馈处理和学术化改写。',
    inputTitle: '写作任务',
    inputHelp: '写清要写哪一章/哪一节、目标字数、写作口吻和导师要求。',
    materialTitle: '正文依据',
    materialHelp: '必须放真实文献、数据、访谈、案例或已有草稿；缺材料会标注需补充。',
    resultTitle: '章节正文/批注稿',
    resultHelp: '用于继续编辑正文、批注问题、保存版本或导出 Word。',
    placeholder: '例如：根据我粘贴的 5 篇文献摘要，写第二章“概念界定与研究现状”。',
    sourcePlaceholder: '粘贴真实文献摘要、引用来源、章节草稿、导师批注意见或数据说明。',
    resultPlaceholder: '章节正文、引用来源对照或逐段批注会显示在这里。',
  },
  review: {
    section: 'thesis-review',
    label: '评审与答辩',
    title: '像预答辩一样审一遍，再拆成可执行修改任务',
    description: '输出多维评分、漏洞扫描、修改清单、PPT 框架和模拟答辩问题。',
    inputTitle: '评审目标',
    inputHelp: '写清要评审全文、某章、导师反馈，还是准备答辩。',
    materialTitle: '待评审材料',
    materialHelp: '可放论文摘要、目录、章节正文、导师意见、答辩 PPT 或自述稿。',
    resultTitle: '评审与答辩清单',
    resultHelp: '用于整理问题优先级、修改 Sprint、答辩问题和自述稿。',
    placeholder: '例如：导师说我论证不够，请帮我拆解问题并给修改优先级。',
    sourcePlaceholder: '粘贴导师反馈、论文摘要、目录、正文片段、PPT 内容或自述稿。',
    resultPlaceholder: '评分、问题清单、修改优先级和答辩准备内容会显示在这里。',
  },
  format: {
    section: 'thesis-format',
    label: '格式与查重',
    title: '处理引用、格式、重复表达和 AI 味，但守住学术诚信边界',
    description: '提供格式检查清单、引用规范、降重思路和自然化改写建议。',
    inputTitle: '检查要求',
    inputHelp: '写清要检查格式、引用、重复表达、AI 味，还是按学校模板核对。',
    materialTitle: '待检查文本',
    materialHelp: '可放正文片段、参考文献列表、格式要求或查重/AI 检测反馈。',
    resultTitle: '格式与表达检查稿',
    resultHelp: '用于逐项修改格式、引用和表达问题，不提供规避检测的方法。',
    placeholder: '例如：帮我检查这段文字哪里像 AI 套话，怎么合规改自然。',
    sourcePlaceholder: '粘贴正文片段、参考文献、学校格式要求、查重报告摘要或 AI 检测反馈。',
    resultPlaceholder: '格式问题、引用问题、重复表达风险和合规改写建议会显示在这里。',
  },
};

export const panelOrder = Object.keys(panelCopy) as ThesisTutorPanel[];
export const degreeOptions = ['本科', '硕士', '博士'];
export const degreeTypeOptions = ['学术学位', '专业学位'];
export const stageOptions = ['没方向', '有方向没定题', '题目已定', '正在写卡住了', '快写完需检查'];
export const citationOptions = ['GB/T 7714', 'APA 7th', 'MLA 9th', 'IEEE', 'Chicago', 'Vancouver'];
export const researchTypeOptions = ['未确定', '理论/综述', '案例研究', '问卷实证', '统计/计量', '实验研究', '设计/系统实现', '混合研究'];
export const writingScopeOptions = ['章节初稿', '整篇初稿框架', '摘要与关键词', '绪论初稿', '文献综述初稿', '研究设计初稿', '结论与展望', '按导师意见重写'];
export const profileUsageByPanel: Record<ThesisTutorPanel, string[]> = {
  diagnosis: ['学位/类型决定阶段要求', '专业方向匹配学科知识', '当前阶段影响路径安排'],
  topic: ['专业方向用于压缩选题范围', '当前阶段影响开题深度', '引用格式影响文献表达'],
  literature: ['专业方向用于生成检索词', '语种影响中英文文献策略', '引用格式影响题录组织'],
  methodology: ['学位/类型影响方法复杂度', '专业方向匹配研究范式', '当前阶段影响数据建议'],
  data: ['研究类型决定预检重点', '数据源控制结论边界', '样本和变量影响分析路线'],
  charts: ['题目决定图示边界', '研究问题影响框架层级', '变量和流程决定图类型'],
  drafting: ['题目和目录决定成稿边界', '材料真实性控制草稿可信度', '目标字数影响展开程度'],
  writing: ['论文题目锁定章节边界', '引用格式影响正文引用', '语种影响写作口吻'],
  review: ['学位/类型影响评审标准', '当前阶段影响修改优先级', '论文题目用于聚焦答辩问题'],
  format: ['引用格式用于规范检查', '语种影响表达修改', '学位/类型影响格式严谨度'],
};

export const thesisTutorUsageSteps = [
  {
    title: '先在启动诊断里建档',
    description: '第一次建议在“启动诊断”集中填写学位、专业、方向、阶段、引用格式、题目和补充要求。后续模块默认只显示档案摘要，不需要每次重复填同一套表单。',
  },
  {
    title: '用诊断确定路线',
    description: '先生成启动诊断，确认当前阶段、卡点、资料缺口和推荐路径。题目、方向、阶段基本确定后，可以锁定档案，避免后续模块误改基础信息。',
  },
  {
    title: '切换模块看摘要就够了',
    description: '进入选题、综述、研究设计、数据实证、图表模型、自动成稿等模块时，页面只展示档案摘要和本模块会重点使用的信息；需要修改时再点“展开编辑档案”。',
  },
  {
    title: '需求写目标，材料放依据',
    description: '“本次需求”写你希望本模块完成什么；“材料区”放导师意见、文献摘要、政策案例、数据说明、访谈记录或正文草稿。材料越具体，输出越贴近论文。',
  },
  {
    title: '把结果沉淀成工作区',
    description: '生成结果可以继续编辑、保存、复制或导出 Word；关键内容可以沉淀到论文档案、文献证据链、章节草稿、导师反馈或终稿检查清单。',
  },
  {
    title: '可以自动成稿，但先看依据',
    description: '自动成稿会生成可编辑初稿，不会把缺失文献、数据或统计结果假装成事实。材料不足时会标注“需补充”或“待核验”，你再补材料继续迭代。',
  },
  {
    title: '最后导出或备份',
    description: '“导出项目包”适合归档和交接，会生成可阅读的 Markdown + workspace.json；“导出备份”适合恢复工作区，也可以用“导入备份/项目包”恢复。',
  },
];
export const thesisTutorFlowModules = [
  '启动诊断：定位阶段、卡点、路径和本周任务',
  '选题与开题：压缩方向、评估题目、组织开题框架',
  '文献综述：生成检索词、分类文献、搭建综述结构',
  '研究设计：匹配方法、变量、样本、数据和分析路径',
  '数据与实证：检查数据来源、样本变量、可做分析和写作边界',
  '图表与模型图：生成研究框架图、技术路线图、变量关系图和流程图',
  '自动成稿：基于档案、材料和证据链生成可编辑论文初稿',
  '逐章写作：基于真实材料写正文、批注和修改段落',
  '评审与答辩：扫描漏洞、拆修改任务、准备答辩问题',
  '格式与查重：检查引用、格式、重复表达和 AI 味',
];

export const thesisTutorNoticeItems = [
  '论文导师可以生成论文草稿，但更适合在“有档案、有材料、有大纲、有证据”的前提下辅助成稿和迭代。',
  '正文写作应基于你提供的真实文献、数据、访谈、案例或草稿；没有材料时，系统会更偏向给结构、思路和待补充清单。',
  '系统不会主动编造文献、作者、DOI、统计结果、访谈对象、实验数据或学校规定。',
  '查重和 AI 检测相关功能只提供合规表达优化、引用规范和自然化建议，不提供规避检测的方法。',
  '最终论文质量仍需要你结合导师意见、学校规范和真实研究过程来确认。',
];
