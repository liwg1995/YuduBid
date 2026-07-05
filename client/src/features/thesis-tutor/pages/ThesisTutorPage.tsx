import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type {
  ThesisTutorChapter,
  ThesisTutorChapterStatus,
  ThesisTutorCheckCategory,
  ThesisTutorCheckItem,
  ThesisTutorCheckSeverity,
  ThesisTutorCheckStatus,
  ThesisTutorFeedbackItem,
  ThesisTutorFeedbackPriority,
  ThesisTutorFeedbackStatus,
  ThesisTutorHistoryItem,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorReference,
  ThesisTutorReferenceVerificationStatus,
  ThesisTutorReferenceType,
  ThesisTutorState,
} from '../types';

export type ThesisTutorInitialPanel = ThesisTutorPanel;

interface ThesisTutorPageProps {
  initialPanel?: ThesisTutorInitialPanel;
  onNavigate?: (section: SectionId) => void;
}

interface ThesisTutorOperationProgress {
  requestId: string;
  phase: WordExportProgressEvent['phase'];
  progress: number;
  message: string;
}

interface ThesisTutorDraftingPreflightItem {
  label: string;
  status: 'ready' | 'warning' | 'missing';
  detail: string;
}

interface ThesisTutorDraftingPreflight {
  score: number;
  label: string;
  mode: string;
  tone: 'ready' | 'warning' | 'missing';
  summary: string;
  items: ThesisTutorDraftingPreflightItem[];
}

type ThesisTutorDataPreflightItem = ThesisTutorDraftingPreflightItem;

interface ThesisTutorDataPreflight {
  score: number;
  label: string;
  tone: 'ready' | 'warning' | 'missing';
  summary: string;
  recommendation: string;
  items: ThesisTutorDataPreflightItem[];
}

interface ThesisTutorFinalReviewGate {
  score: number;
  label: string;
  tone: 'ready' | 'warning' | 'missing';
  summary: string;
  items: ThesisTutorDraftingPreflightItem[];
}

interface ThesisTutorChartTemplate {
  id: string;
  title: string;
  description: string;
  chartType: string;
  userInput: string;
  sourceText: string;
  draft: string;
}

const defaultProfile: ThesisTutorProfile = {
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

interface ThesisTutorPanelCopy {
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

const panelCopy: Record<ThesisTutorPanel, ThesisTutorPanelCopy> = {
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

const panelOrder = Object.keys(panelCopy) as ThesisTutorPanel[];
const degreeOptions = ['本科', '硕士', '博士'];
const degreeTypeOptions = ['学术学位', '专业学位'];
const stageOptions = ['没方向', '有方向没定题', '题目已定', '正在写卡住了', '快写完需检查'];
const citationOptions = ['GB/T 7714', 'APA 7th', 'MLA 9th', 'IEEE', 'Chicago', 'Vancouver'];
const researchTypeOptions = ['未确定', '理论/综述', '案例研究', '问卷实证', '统计/计量', '实验研究', '设计/系统实现', '混合研究'];
const writingScopeOptions = ['章节初稿', '整篇初稿框架', '摘要与关键词', '绪论初稿', '文献综述初稿', '研究设计初稿', '结论与展望', '按导师意见重写'];
const profileUsageByPanel: Record<ThesisTutorPanel, string[]> = {
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

const thesisTutorUsageSteps = [
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

const thesisTutorFlowModules = [
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

const thesisTutorNoticeItems = [
  '论文导师可以生成论文草稿，但更适合在“有档案、有材料、有大纲、有证据”的前提下辅助成稿和迭代。',
  '正文写作应基于你提供的真实文献、数据、访谈、案例或草稿；没有材料时，系统会更偏向给结构、思路和待补充清单。',
  '系统不会主动编造文献、作者、DOI、统计结果、访谈对象、实验数据或学校规定。',
  '查重和 AI 检测相关功能只提供合规表达优化、引用规范和自然化建议，不提供规避检测的方法。',
  '最终论文质量仍需要你结合导师意见、学校规范和真实研究过程来确认。',
];

const chartTemplates: ThesisTutorChartTemplate[] = [
  {
    id: 'research-framework',
    title: '研究框架图',
    description: '展示研究对象、核心变量、影响路径和结论产出。',
    chartType: 'flowchart',
    userInput: '请基于论文档案和下方模板，生成一张研究框架图。要求输出 Mermaid 代码块、图名图注、节点解释和可修改项；未核验关系请标注“待核验”。',
    sourceText: '图形类型：研究框架图\n适用位置：绪论/研究设计章节\n请把占位内容替换为真实论文信息：研究背景、研究问题、核心变量、研究方法、预期结论。',
    draft: [
      '## 图 1 研究框架图',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[研究背景/现实问题] --> B[研究问题]',
      '  B --> C[理论基础/文献支撑]',
      '  C --> D[核心变量或分析维度]',
      '  D --> E[研究方法]',
      '  E --> F[研究发现/待核验结论]',
      '  F --> G[对策建议]',
      '```',
      '',
      '图注：本图用于说明论文从现实问题到研究问题、理论支撑、方法设计和结论建议的整体逻辑。',
      '',
      '可修改项：节点名称、变量关系、研究方法、图注表述。',
    ].join('\n'),
  },
  {
    id: 'technical-route',
    title: '技术路线图',
    description: '展示论文推进步骤，适合开题报告或研究设计章节。',
    chartType: 'flowchart',
    userInput: '请基于论文档案和下方模板，生成一张论文技术路线图。要求体现研究准备、资料收集、方法设计、分析验证、写作输出的顺序。',
    sourceText: '图形类型：技术路线图\n适用位置：开题报告/研究设计章节\n请补充：研究对象、资料来源、方法工具、分析步骤、阶段产出。',
    draft: [
      '## 图 2 技术路线图',
      '',
      '```mermaid',
      'flowchart TB',
      '  A[确定研究主题与问题] --> B[梳理文献与理论基础]',
      '  B --> C[明确研究对象与资料来源]',
      '  C --> D[设计研究方法与分析框架]',
      '  D --> E[收集数据/案例/访谈材料]',
      '  E --> F[整理与分析材料]',
      '  F --> G[形成研究结论]',
      '  G --> H[提出建议并完成论文写作]',
      '```',
      '',
      '图注：本图展示论文从问题提出到材料分析、结论形成和写作完成的技术路线。',
      '',
      '可修改项：研究步骤、数据来源、分析方法、阶段产出。',
    ].join('\n'),
  },
  {
    id: 'variable-model',
    title: '变量关系模型图',
    description: '适合问卷、实证、计量或变量假设类论文。',
    chartType: 'graph',
    userInput: '请基于论文档案和下方模板，生成变量关系模型图。要求区分自变量、因变量、中介/调节变量，并把未验证关系标注为“待验证”。',
    sourceText: '图形类型：变量关系模型图\n适用位置：研究假设/研究模型章节\n请补充：自变量、因变量、中介变量、调节变量、控制变量、假设编号。',
    draft: [
      '## 图 3 变量关系模型图',
      '',
      '```mermaid',
      'graph LR',
      '  X[自变量：待填写] -->|H1 待验证| Y[因变量：待填写]',
      '  X -->|H2 待验证| M[中介变量：待填写]',
      '  M -->|H3 待验证| Y',
      '  W[调节变量：待填写] -.->|H4 待验证| X',
      '  C[控制变量：待填写] -.-> Y',
      '```',
      '',
      '图注：本图用于展示研究假设中的变量关系，所有关系需通过文献依据或数据分析进一步验证。',
      '',
      '可修改项：变量名称、假设编号、箭头方向、中介/调节关系。',
    ].join('\n'),
  },
  {
    id: 'chapter-structure',
    title: '章节结构图',
    description: '展示论文各章关系，适合开题报告、绪论或答辩说明。',
    chartType: 'mindmap',
    userInput: '请基于论文档案和目录，生成论文章节结构图。要求章节层级清楚，并说明每章承担的论证任务。',
    sourceText: '图形类型：章节结构图\n适用位置：开题报告/绪论/答辩介绍\n请补充：论文目录、各章核心任务、章节之间的递进关系。',
    draft: [
      '## 图 4 论文结构图',
      '',
      '```mermaid',
      'mindmap',
      '  root((论文主题))',
      '    第一章 绪论',
      '      研究背景',
      '      研究意义',
      '      研究思路',
      '    第二章 文献综述',
      '      概念界定',
      '      研究现状',
      '      述评与不足',
      '    第三章 研究设计',
      '      方法选择',
      '      数据来源',
      '      分析框架',
      '    第四章 分析与讨论',
      '      结果呈现',
      '      问题讨论',
      '    第五章 结论与建议',
      '      研究结论',
      '      对策建议',
      '      不足展望',
      '```',
      '',
      '图注：本图用于说明论文各章节之间的逻辑结构和论证任务。',
      '',
      '可修改项：章节名称、二级标题、章节数量和逻辑顺序。',
    ].join('\n'),
  },
  {
    id: 'data-analysis-flow',
    title: '数据分析流程图',
    description: '展示数据来源、清洗、分析、验证和结果解释。',
    chartType: 'flowchart',
    userInput: '请基于论文档案和下方模板，生成数据分析流程图。要求明确数据来源、清洗处理、分析方法、结果验证和写作边界。',
    sourceText: '图形类型：数据分析流程图\n适用位置：数据与实证/研究设计章节\n请补充：数据来源、样本量、变量字段、处理方式、分析工具、检验方法。',
    draft: [
      '## 图 5 数据分析流程图',
      '',
      '```mermaid',
      'flowchart TB',
      '  A[数据来源：待填写] --> B[数据筛选与清洗]',
      '  B --> C[变量定义与编码]',
      '  C --> D[描述性统计/样本说明]',
      '  D --> E[模型分析/案例分析/文本分析]',
      '  E --> F[稳健性或有效性检查：待核验]',
      '  F --> G[结果解释与论文写作边界]',
      '```',
      '',
      '图注：本图展示数据从获取、整理、分析到结果解释的处理流程。',
      '',
      '可修改项：数据来源、变量处理、分析方法、验证步骤和结论边界。',
    ].join('\n'),
  },
];

const chapterStatusOptions: Array<{ value: ThesisTutorChapterStatus; label: string }> = [
  { value: 'not_started', label: '未开始' },
  { value: 'writing', label: '写作中' },
  { value: 'drafted', label: '已有初稿' },
  { value: 'needs_revision', label: '需修改' },
  { value: 'done', label: '已完成' },
];

const referenceTypeOptions: Array<{ value: ThesisTutorReferenceType; label: string }> = [
  { value: 'literature', label: '文献' },
  { value: 'policy', label: '政策/规范' },
  { value: 'case', label: '案例' },
  { value: 'data', label: '数据' },
  { value: 'quote', label: '原文摘录' },
  { value: 'other', label: '其他' },
];

const referenceVerificationOptions: Array<{ value: ThesisTutorReferenceVerificationStatus; label: string }> = [
  { value: 'unverified', label: '待核验' },
  { value: 'verified', label: '已核验' },
  { value: 'partial', label: '信息不完整' },
  { value: 'invalid', label: '不可查/慎用' },
];

const referenceEnabledPanels = new Set<ThesisTutorPanel>(['literature', 'charts', 'drafting', 'writing', 'review', 'format']);
const feedbackEnabledPanels = new Set<ThesisTutorPanel>(['drafting', 'writing', 'review', 'format']);

const feedbackStatusOptions: Array<{ value: ThesisTutorFeedbackStatus; label: string }> = [
  { value: 'todo', label: '待处理' },
  { value: 'doing', label: '处理中' },
  { value: 'done', label: '已完成' },
  { value: 'deferred', label: '暂缓' },
];

const feedbackPriorityOptions: Array<{ value: ThesisTutorFeedbackPriority; label: string }> = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const checkCategoryOptions: Array<{ value: ThesisTutorCheckCategory; label: string }> = [
  { value: 'format', label: '格式' },
  { value: 'citation', label: '引用' },
  { value: 'duplication', label: '重复表达' },
  { value: 'ai_tone', label: 'AI 味' },
  { value: 'logic', label: '逻辑' },
  { value: 'other', label: '其他' },
];

const checkStatusOptions: Array<{ value: ThesisTutorCheckStatus; label: string }> = [
  { value: 'unchecked', label: '未检查' },
  { value: 'issue_found', label: '发现问题' },
  { value: 'fixed', label: '已修正' },
  { value: 'ignored', label: '暂不处理' },
];

const checkSeverityOptions: Array<{ value: ThesisTutorCheckSeverity; label: string }> = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

function getOptionLabel<TValue extends string>(options: Array<{ value: TValue; label: string }>, value: TValue | string) {
  return options.find((item) => item.value === value)?.label || value || '未填写';
}

function truncateExportText(value: string, maxLength = 2500) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n> 后续内容较长，已在导出上下文中截断；完整内容请回到论文导师工作区查看。`;
}

function toMarkdownList(items: string[]) {
  return items.filter(Boolean).map((item) => `- ${item}`).join('\n') || '- 暂无';
}

function buildProfileExportMarkdown(profile: ThesisTutorProfile, panel: ThesisTutorPanel, userInput: string, sourceText: string) {
  const rows = [
    ['学位/类型', `${profile.degree || '未填写'} / ${profile.degreeType || '未填写'}`],
    ['专业方向', `${profile.discipline || '未填写'}${profile.direction ? ` / ${profile.direction}` : ''}`],
    ['语种', profile.language || '未填写'],
    ['当前阶段', profile.stage || '未填写'],
    ['引用格式', profile.citationFormat || '未填写'],
    ['论文题目', profile.title || '未定题'],
    ['学校/学院要求', profile.schoolRequirements || '未填写'],
    ['导师偏好', profile.advisorPreferences || '未填写'],
    ['时间节点', profile.milestones || '未填写'],
    ['可用数据源', profile.dataSources || '未填写'],
    ['研究类型', profile.researchType || '未确定'],
    ['目标字数', profile.targetWordCount || '未填写'],
    ['成稿范围', profile.writingScope || '章节初稿'],
    ['数据/材料真实性说明', profile.dataIntegrityNotes || '未填写'],
    ['已定研究问题', profile.researchQuestions || '未填写'],
    ['方法/变量/样本条件', profile.methodologyNotes || '未填写'],
    ['论文目录或章节计划', profile.outlinePlan || '未填写'],
    ['已有文献线索', profile.literatureNotes || '未填写'],
  ];
  return [
    `本次导出模块：${panelCopy[panel].label}`,
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${String(value).replace(/\n/g, '<br>')} |`),
    '',
    '## 本次需求',
    userInput.trim() || '未填写。',
    '',
    '## 材料摘要',
    sourceText.trim() ? truncateExportText(sourceText, 1800) : '未提供材料。',
  ].join('\n');
}

function buildChapterExportMarkdown(chapters: ThesisTutorChapter[], activeChapterId: string) {
  if (!chapters.length) return '';
  return chapters.map((chapter, index) => [
    `## ${index + 1}. ${chapter.title}${chapter.id === activeChapterId ? '（当前章节）' : ''}`,
    `- 状态：${getOptionLabel(chapterStatusOptions, chapter.status)}`,
    `- 本章目标：${chapter.goal || '未填写'}`,
    `- 导师反馈/修改要求：${chapter.advisorFeedback || '未填写'}`,
    '',
    chapter.material ? `### 本章材料\n${truncateExportText(chapter.material, 1200)}` : '',
    chapter.draft ? `### 已保存草稿\n${truncateExportText(chapter.draft, 1800)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function buildReferenceExportMarkdown(references: ThesisTutorReference[]) {
  if (!references.length) return '';
  return references.map((reference, index) => [
    `## ${index + 1}. ${reference.title}`,
    `- 类型：${getOptionLabel(referenceTypeOptions, reference.type)}`,
    `- 核验状态：${getOptionLabel(referenceVerificationOptions, reference.verificationStatus)}`,
    `- 作者/机构：${reference.authors || '未填写'}`,
    `- 年份：${reference.year || '未填写'}`,
    `- 来源：${reference.source || '未填写'}`,
    `- 关键词：${reference.keywords || '未填写'}`,
    `- 规范引用/出处：${reference.citation || '未填写'}`,
    `- 核验来源：${reference.verificationSource || '未填写'}`,
    `- 核验备注：${reference.verificationNotes || '未填写'}`,
    '',
    reference.summary ? `### 摘要/证据内容\n${truncateExportText(reference.summary, 1400)}` : '',
    reference.keyPoints ? `### 可用观点/写作用途\n${truncateExportText(reference.keyPoints, 1200)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function buildFeedbackExportMarkdown(feedbackItems: ThesisTutorFeedbackItem[]) {
  if (!feedbackItems.length) return '';
  return feedbackItems.map((item, index) => [
    `## ${index + 1}. ${item.title}`,
    `- 来源：${item.source || '未填写'}`,
    `- 优先级：${getOptionLabel(feedbackPriorityOptions, item.priority)}`,
    `- 状态：${getOptionLabel(feedbackStatusOptions, item.status)}`,
    '',
    item.originalFeedback ? `### 原始意见\n${truncateExportText(item.originalFeedback, 1200)}` : '',
    item.actionPlan ? `### 处理方案\n${truncateExportText(item.actionPlan, 1200)}` : '',
    item.revisionNotes ? `### 修改记录\n${truncateExportText(item.revisionNotes, 1200)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function buildCheckExportMarkdown(checkItems: ThesisTutorCheckItem[]) {
  if (!checkItems.length) return '';
  return checkItems.map((item, index) => [
    `## ${index + 1}. ${item.title}`,
    `- 分类：${getOptionLabel(checkCategoryOptions, item.category)}`,
    `- 严重级别：${getOptionLabel(checkSeverityOptions, item.severity)}`,
    `- 状态：${getOptionLabel(checkStatusOptions, item.status)}`,
    `- 位置：${item.location || '未填写'}`,
    '',
    item.issue ? `### 问题描述\n${truncateExportText(item.issue, 1000)}` : '',
    item.suggestion ? `### 修改建议\n${truncateExportText(item.suggestion, 1000)}` : '',
    item.revisionNotes ? `### 修改记录\n${truncateExportText(item.revisionNotes, 1000)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function getNextPanel(currentPanel: ThesisTutorPanel) {
  const currentIndex = panelOrder.indexOf(currentPanel);
  return currentIndex >= 0 && currentIndex < panelOrder.length - 1
    ? panelOrder[currentIndex + 1]
    : null;
}

function extractResultTitle(content: string) {
  const line = String(content || '')
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^#+\s*/, '').replace(/^[-*\d.、\s]+/, ''))
    .find((item) => item && item.length <= 80);
  return line || '';
}

function splitMaterialBlocks(content: string) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const roughBlocks = normalized
    .split(/\n{2,}|(?=\n#{1,4}\s)|(?=\n\s*[-*]\s+)|(?=\n\s*\d+[.、]\s+)/g)
    .map((item) => item.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.、]\s+/, '').trim())
    .filter((item) => item.length >= 12);
  const blocks = roughBlocks.length ? roughBlocks : [normalized];
  return blocks.slice(0, 8);
}

function appendMaterial(current: string, addition: string) {
  const left = String(current || '').trim();
  const right = String(addition || '').trim();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
}

function createLocalChapter(title = '新章节'): ThesisTutorChapter {
  const now = new Date().toISOString();
  return {
    id: `chapter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title,
    status: 'not_started',
    goal: '',
    material: '',
    advisorFeedback: '',
    draft: '',
    updated_at: now,
  };
}

function createLocalReference(title = '新证据条目'): ThesisTutorReference {
  const now = new Date().toISOString();
  return {
    id: `ref-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'literature',
    verificationStatus: 'unverified',
    title,
    authors: '',
    year: '',
    source: '',
    citation: '',
    verificationSource: '',
    verificationNotes: '',
    keywords: '',
    summary: '',
    keyPoints: '',
    relatedChapterIds: [],
    updated_at: now,
  };
}

function createLocalFeedback(title = '导师反馈任务'): ThesisTutorFeedbackItem {
  const now = new Date().toISOString();
  return {
    id: `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title,
    source: '',
    priority: 'medium',
    status: 'todo',
    relatedChapterIds: [],
    originalFeedback: '',
    actionPlan: '',
    revisionNotes: '',
    updated_at: now,
  };
}

function createLocalCheckItem(title = '格式检查项'): ThesisTutorCheckItem {
  const now = new Date().toISOString();
  return {
    id: `check-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    category: 'format',
    title,
    status: 'unchecked',
    severity: 'medium',
    location: '',
    issue: '',
    suggestion: '',
    revisionNotes: '',
    updated_at: now,
  };
}

function parseOutlinePlanToChapters(outlinePlan: string): ThesisTutorChapter[] {
  const lines = outlinePlan
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*+]\s*/, '').replace(/^\d+[.、]\s*/, ''))
    .filter(Boolean)
    .filter((line) => /第.{1,8}[章节篇]|chapter\s*\d+|\d+\.\d*|绪论|结论|文献综述|研究设计|研究方法|实证分析|案例分析/i.test(line));

  return Array.from(new Set(lines)).slice(0, 20).map((title) => createLocalChapter(title));
}

function hasText(value: unknown) {
  return String(value || '').trim().length > 0;
}

function buildDraftingPreflight(params: {
  profile: ThesisTutorProfile;
  sourceText: string;
  chapters: ThesisTutorChapter[];
  references: ThesisTutorReference[];
  activeChapter: ThesisTutorChapter | null;
  feedbackItems: ThesisTutorFeedbackItem[];
}): ThesisTutorDraftingPreflight {
  const { profile, sourceText, chapters, references, activeChapter, feedbackItems } = params;
  const hasTopicBoundary = hasText(profile.title) || hasText(profile.direction) || hasText(profile.researchQuestions);
  const hasOutline = hasText(profile.outlinePlan) || chapters.length > 0;
  const hasMaterial = hasText(sourceText) || hasText(activeChapter?.material) || references.length > 0;
  const hasEvidence = references.length > 0 || hasText(profile.literatureNotes);
  const verifiedReferenceCount = references.filter((reference) => reference.verificationStatus === 'verified').length;
  const riskyReferenceCount = references.filter((reference) => reference.verificationStatus === 'invalid').length;
  const isEmpirical = /问卷|实证|统计|计量|实验|数据|回归|样本/.test(`${profile.researchType} ${profile.methodologyNotes} ${profile.dataSources}`);
  const hasDataBoundary = !isEmpirical || hasText(profile.dataSources) || hasText(profile.dataIntegrityNotes);
  const hasTarget = hasText(profile.writingScope) || hasText(profile.targetWordCount) || hasText(userFriendlyChapterTitle(activeChapter));
  const hasAdvisorContext = hasText(profile.advisorPreferences) || feedbackItems.length > 0 || hasText(profile.schoolRequirements);

  const items: ThesisTutorDraftingPreflightItem[] = [
    {
      label: '题目/方向',
      status: hasTopicBoundary ? 'ready' : 'missing',
      detail: hasTopicBoundary ? '已有题目、方向或研究问题，可控制成稿边界。' : '建议先填写题目、方向或研究问题，否则只能生成通用框架。',
    },
    {
      label: '目录/章节',
      status: hasOutline ? 'ready' : 'warning',
      detail: hasOutline ? `已有 ${chapters.length || '档案'} 个章节线索，可按结构展开。` : '还没有目录，建议先生成论文框架或只写指定小节。',
    },
    {
      label: '材料依据',
      status: hasMaterial ? 'ready' : 'warning',
      detail: hasMaterial ? '已有材料区、章节材料或证据链，初稿会优先引用这些内容。' : '未提供材料，系统会生成框架型草稿并标注需补充依据。',
    },
    {
      label: '文献/证据',
      status: verifiedReferenceCount > 0 ? 'ready' : hasEvidence ? 'warning' : 'warning',
      detail: verifiedReferenceCount > 0
        ? `已有 ${verifiedReferenceCount} 条已核验证据${riskyReferenceCount ? `，${riskyReferenceCount} 条慎用` : ''}。`
        : hasEvidence
          ? '已有文献或线索，但尚未标记为已核验；正文引用会提示待核验。'
          : '缺少可核验文献，正文引用会以“需补充文献”标注。',
    },
    {
      label: '数据真实性',
      status: hasDataBoundary ? 'ready' : 'missing',
      detail: hasDataBoundary ? '当前研究类型的数据边界基本清楚。' : '实证/统计类论文需要先说明数据来源、样本或真实性边界。',
    },
    {
      label: '成稿范围',
      status: hasTarget ? 'ready' : 'warning',
      detail: hasTarget ? `当前范围：${profile.writingScope || activeChapter?.title || '章节初稿'}${profile.targetWordCount ? `，${profile.targetWordCount}` : ''}。` : '建议写清要生成整篇、某章、某节、摘要还是结论。',
    },
    {
      label: '导师/学校要求',
      status: hasAdvisorContext ? 'ready' : 'warning',
      detail: hasAdvisorContext ? '已有导师反馈、学校要求或偏好，可减少返工。' : '建议补充导师要求、学校格式或写作禁区。',
    },
  ];
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const score = Math.round((readyCount / items.length) * 100);
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const warningCount = items.filter((item) => item.status === 'warning').length;
  const tone = missingCount > 0 ? 'missing' : warningCount >= 3 ? 'warning' : 'ready';
  const mode = score >= 75
    ? '适合生成较完整初稿'
    : score >= 45
      ? '建议生成框架型初稿'
      : '建议先补齐档案和材料';
  const label = score >= 75 ? '准备较充分' : score >= 45 ? '可以先起草' : '资料偏少';
  const summary = score >= 75
    ? '当前上下文足够支撑自动成稿，生成后建议再逐段核对引用和数据。'
    : score >= 45
      ? '可以先生成可编辑草稿，但系统会在缺依据处标注“需补充/待核验”。'
      : '建议先补题目、目录、材料或数据边界，再使用自动成稿。';
  return { score, label, mode, tone, summary, items };
}

function userFriendlyChapterTitle(chapter: ThesisTutorChapter | null) {
  return chapter?.title || '';
}

function buildDataPreflight(params: {
  profile: ThesisTutorProfile;
  sourceText: string;
  references: ThesisTutorReference[];
}): ThesisTutorDataPreflight {
  const { profile, sourceText, references } = params;
  const dataText = `${profile.dataSources} ${profile.dataIntegrityNotes} ${profile.methodologyNotes} ${sourceText}`.trim();
  const hasDataSource = hasText(profile.dataSources) || /数据|问卷|访谈|样本|统计|年鉴|公报|平台|日志|案例|表格|csv|excel/i.test(dataText);
  const hasIntegrity = hasText(profile.dataIntegrityNotes) || /真实|来源|官方|公开|自填|回收|模拟|待核验|未核验|原始/.test(dataText);
  const hasSample = /n\s*=\s*\d+|样本量|样本|份问卷|人|家公司|个案例|条数据|年度|年份|\d+\s*(份|人|家|个|条)/i.test(dataText);
  const hasVariables = hasText(profile.methodologyNotes) || /变量|指标|维度|题项|因变量|自变量|中介|调节|解释变量|被解释变量|量表/.test(dataText);
  const hasAnalysisGoal = /回归|相关|描述统计|信度|效度|kmo|cronbach|anova|t检验|卡方|访谈编码|案例分析|扎根|计量|中介|调节/i.test(dataText);
  const dataReferences = references.filter((reference) => reference.type === 'data' || /数据|统计|年鉴|公报|问卷|访谈|样本/.test(`${reference.title} ${reference.source} ${reference.keywords}`));
  const verifiedDataReferences = dataReferences.filter((reference) => reference.verificationStatus === 'verified').length;

  const items: ThesisTutorDataPreflightItem[] = [
    {
      label: '数据来源',
      status: hasDataSource ? 'ready' : 'missing',
      detail: hasDataSource ? '已有数据、问卷、访谈、案例或公开来源线索。' : '请先说明数据来自哪里，否则不能写实证结果。',
    },
    {
      label: '真实性边界',
      status: hasIntegrity ? 'ready' : 'missing',
      detail: hasIntegrity ? '已有真实性或核验边界说明。' : '需要说明真实数据、公开数据、用户自填数据，还是仅作模拟演示。',
    },
    {
      label: '样本规模',
      status: hasSample ? 'ready' : 'warning',
      detail: hasSample ? '已有样本量或数据规模线索，可继续判断适合的分析。' : '缺少样本量，暂时只能给分析计划，不能判断统计稳健性。',
    },
    {
      label: '变量/指标',
      status: hasVariables ? 'ready' : 'warning',
      detail: hasVariables ? '已有变量、指标或题项说明。' : '建议补充变量名、题项、指标口径或案例维度。',
    },
    {
      label: '分析目标',
      status: hasAnalysisGoal ? 'ready' : 'warning',
      detail: hasAnalysisGoal ? '已有想做的统计、计量或质性分析目标。' : '建议写清要做描述统计、相关/回归、问卷检验还是案例分析。',
    },
    {
      label: '数据证据核验',
      status: verifiedDataReferences > 0 ? 'ready' : dataReferences.length > 0 ? 'warning' : 'warning',
      detail: verifiedDataReferences > 0
        ? `已有 ${verifiedDataReferences} 条已核验数据证据。`
        : dataReferences.length > 0
          ? '已有数据证据条目，但尚未标记为已核验。'
          : '还没有数据类证据条目，可在证据链中新增并核验。',
    },
  ];
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const score = Math.round((readyCount / items.length) * 100);
  const tone = missingCount > 0 ? 'missing' : score >= 70 ? 'ready' : 'warning';
  const label = score >= 70 ? '可进入实证设计' : score >= 45 ? '可先做预检' : '数据边界不足';
  const summary = score >= 70
    ? '当前数据说明较完整，可以生成分析路线和写作边界。'
    : score >= 45
      ? '可以先做数据预检，但统计结论需要等真实分析结果确认。'
      : '建议先补数据来源和真实性说明，否则只能生成数据需求清单。';
  const recommendation = score >= 70
    ? '适合输出可做分析、风险和实证写法'
    : score >= 45
      ? '建议输出数据补齐清单和初步分析计划'
      : '建议先补数据来源、样本、变量和核验说明';
  return { score, label, tone, summary, recommendation, items };
}

function buildFinalReviewGate(params: {
  profile: ThesisTutorProfile;
  chapters: ThesisTutorChapter[];
  references: ThesisTutorReference[];
  feedbackItems: ThesisTutorFeedbackItem[];
  checkItems: ThesisTutorCheckItem[];
  dataPreflight: ThesisTutorDataPreflight;
}): ThesisTutorFinalReviewGate {
  const { profile, chapters, references, feedbackItems, checkItems, dataPreflight } = params;
  const draftedChapters = chapters.filter((chapter) => chapter.draft.trim() || chapter.status === 'drafted' || chapter.status === 'done').length;
  const verifiedReferences = references.filter((reference) => reference.verificationStatus === 'verified').length;
  const riskyReferences = references.filter((reference) => reference.verificationStatus === 'invalid' || reference.verificationStatus === 'partial' || reference.verificationStatus === 'unverified').length;
  const openFeedback = feedbackItems.filter((item) => item.status !== 'done' && item.status !== 'deferred').length;
  const openChecks = checkItems.filter((item) => item.status === 'unchecked' || item.status === 'issue_found').length;
  const severeChecks = checkItems.filter((item) => item.severity === 'high' && item.status !== 'fixed' && item.status !== 'ignored').length;
  const hasBasicProfile = hasText(profile.title) && hasText(profile.outlinePlan || chapters.map((chapter) => chapter.title).join('\n'));
  const hasChapterDrafts = chapters.length > 0 && draftedChapters > 0;

  const items: ThesisTutorDraftingPreflightItem[] = [
    {
      label: '题目与目录',
      status: hasBasicProfile ? 'ready' : 'missing',
      detail: hasBasicProfile ? '题目和目录/章节计划已形成，可进入终稿一致性检查。' : '缺题目或目录，终稿审查会失去结构边界。',
    },
    {
      label: '章节草稿',
      status: hasChapterDrafts ? (draftedChapters >= chapters.length ? 'ready' : 'warning') : 'missing',
      detail: hasChapterDrafts ? `已有 ${draftedChapters}/${chapters.length} 个章节含草稿或完成状态。` : '还没有章节草稿，建议先自动成稿或逐章写作。',
    },
    {
      label: '文献核验',
      status: verifiedReferences > 0 && riskyReferences === 0 ? 'ready' : verifiedReferences > 0 ? 'warning' : 'missing',
      detail: verifiedReferences > 0 ? `已核验 ${verifiedReferences} 条证据，仍有 ${riskyReferences} 条需处理。` : '没有已核验证据，参考文献和正文引用需优先核验。',
    },
    {
      label: '数据边界',
      status: dataPreflight.tone === 'ready' ? 'ready' : dataPreflight.tone === 'warning' ? 'warning' : 'missing',
      detail: dataPreflight.summary,
    },
    {
      label: '导师反馈',
      status: openFeedback === 0 ? 'ready' : 'warning',
      detail: openFeedback === 0 ? '暂无未处理导师反馈。' : `还有 ${openFeedback} 条导师反馈未关闭。`,
    },
    {
      label: '检查清单',
      status: checkItems.length && openChecks === 0 ? 'ready' : checkItems.length ? 'warning' : 'missing',
      detail: checkItems.length ? `已有 ${checkItems.length} 项检查，待处理 ${openChecks} 项，高风险 ${severeChecks} 项。` : '还没有终稿检查清单。',
    },
  ];
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const score = Math.round((readyCount / items.length) * 100);
  const tone = missingCount > 0 ? 'missing' : score >= 70 ? 'ready' : 'warning';
  const label = score >= 70 ? '接近可交付' : score >= 45 ? '需要复查' : '不建议交付';
  const summary = score >= 70
    ? '项目上下文较完整，可以按清单逐项复查后导出或提交导师。'
    : score >= 45
      ? '已有部分终稿基础，但仍建议先处理高风险项和未核验依据。'
      : '终稿基础不足，建议先补章节草稿、证据核验或数据边界。';
  return { score, label, tone, summary, items };
}

function ThesisTutorPage({ initialPanel = 'diagnosis', onNavigate }: ThesisTutorPageProps) {
  const { showToast } = useToast();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const operationProgressTimerRef = useRef<number | null>(null);
  const operationProgressClearTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<ThesisTutorState | null>(null);
  const [profile, setProfile] = useState<ThesisTutorProfile>(defaultProfile);
  const [activePanel, setActivePanel] = useState<ThesisTutorPanel>(initialPanel);
  const [userInput, setUserInput] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [draft, setDraft] = useState('');
  const [chapters, setChapters] = useState<ThesisTutorChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState('');
  const [references, setReferences] = useState<ThesisTutorReference[]>([]);
  const [activeReferenceId, setActiveReferenceId] = useState('');
  const [feedbackItems, setFeedbackItems] = useState<ThesisTutorFeedbackItem[]>([]);
  const [activeFeedbackId, setActiveFeedbackId] = useState('');
  const [checkItems, setCheckItems] = useState<ThesisTutorCheckItem[]>([]);
  const [activeCheckId, setActiveCheckId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missingTextModelFields, setMissingTextModelFields] = useState<string[]>([]);
  const [exportProgress, setExportProgress] = useState<WordExportProgressEvent | null>(null);
  const [operationProgress, setOperationProgress] = useState<ThesisTutorOperationProgress | null>(null);
  const [historyPanelFilter, setHistoryPanelFilter] = useState<ThesisTutorPanel | 'all'>('all');
  const [historyImportantOnly, setHistoryImportantOnly] = useState(false);
  const [profilePanelExpanded, setProfilePanelExpanded] = useState(false);
  const [selectedChartTemplateIds, setSelectedChartTemplateIds] = useState<string[]>([]);

  const panel = panelCopy[activePanel];
  const task = state?.task;
  const isRunning = task?.status === 'running';
  const profileLocked = Boolean(state?.profileLocked);
  const taskProgress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
  const result = draft || state?.latestResult || '';
  const panelResults = state?.panelResults || {};
  const completedPanels = panelOrder.filter((item) => Boolean(panelResults[item]?.content));
  const priorResultCount = panelOrder
    .filter((item) => item !== activePanel && Boolean(panelResults[item]?.content))
    .length;
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) || chapters[0] || null;
  const activeReference = references.find((reference) => reference.id === activeReferenceId) || references[0] || null;
  const activeFeedback = feedbackItems.find((item) => item.id === activeFeedbackId) || feedbackItems[0] || null;
  const activeCheck = checkItems.find((item) => item.id === activeCheckId) || checkItems[0] || null;
  const showReferenceWorkspace = referenceEnabledPanels.has(activePanel);
  const showFeedbackWorkspace = feedbackEnabledPanels.has(activePanel);
  const showCheckWorkspace = activePanel === 'format';
  const chapterSummary = activePanel === 'drafting' || activePanel === 'writing'
    ? `当前章节：${activeChapter?.title || '未选择'}`
    : '';
  const referenceSummary = showReferenceWorkspace
    ? `证据条目：${references.length || '未添加'}`
    : '';
  const feedbackSummary = showFeedbackWorkspace
    ? `反馈任务：${feedbackItems.filter((item) => item.status !== 'done').length || '无待处理'}`
    : '';
  const checkSummary = showCheckWorkspace
    ? `检查项：${checkItems.filter((item) => item.status !== 'fixed').length || '无待处理'}`
    : '';
  const filteredHistory = useMemo(() => {
    const history = state?.history || [];
    return history.filter((item) => (
      (historyPanelFilter === 'all' || item.panel === historyPanelFilter)
      && (!historyImportantOnly || item.important)
    ));
  }, [state?.history, historyPanelFilter, historyImportantOnly]);
  const profileContextItems = useMemo(() => [
    `学位：${profile.degree}/${profile.degreeType}`,
    `专业：${profile.discipline.trim() || '未填写'}`,
    `方向：${profile.direction.trim() || '未填写'}`,
    `阶段：${profile.stage}`,
    `引用：${profile.citationFormat}`,
    profile.title.trim() ? `题目：${profile.title.trim()}` : '题目：未定题',
    chapterSummary,
    referenceSummary,
    feedbackSummary,
    checkSummary,
  ].filter(Boolean), [profile, chapterSummary, referenceSummary, feedbackSummary, checkSummary]);
  const draftingPreflight = useMemo(() => buildDraftingPreflight({
    profile,
    sourceText,
    chapters,
    references,
    activeChapter,
    feedbackItems,
  }), [profile, sourceText, chapters, references, activeChapter, feedbackItems]);
  const dataPreflight = useMemo(() => buildDataPreflight({
    profile,
    sourceText,
    references,
  }), [profile, sourceText, references]);
  const finalReviewGate = useMemo(() => buildFinalReviewGate({
    profile,
    chapters,
    references,
    feedbackItems,
    checkItems,
    dataPreflight,
  }), [profile, chapters, references, feedbackItems, checkItems, dataPreflight]);
  const profileCompletionItems = [
    profile.degree,
    profile.degreeType,
    profile.discipline,
    profile.direction,
    profile.language,
    profile.stage,
    profile.citationFormat,
    profile.title,
    profile.schoolRequirements,
    profile.advisorPreferences,
    profile.milestones,
    profile.dataSources,
    profile.researchType,
    profile.targetWordCount,
    profile.writingScope,
    profile.dataIntegrityNotes,
    profile.researchQuestions,
    profile.methodologyNotes,
    profile.outlinePlan,
    profile.literatureNotes,
  ];
  const profileCompletion = Math.round((profileCompletionItems.filter((item) => String(item || '').trim()).length / profileCompletionItems.length) * 100);
  const chapterDoneCount = chapters.filter((chapter) => chapter.status === 'done').length;
  const chapterActiveCount = chapters.filter((chapter) => chapter.status === 'writing' || chapter.status === 'drafted' || chapter.status === 'needs_revision').length;
  const openFeedbackCount = feedbackItems.filter((item) => item.status !== 'done' && item.status !== 'deferred').length;
  const highPriorityFeedbackCount = feedbackItems.filter((item) => item.priority === 'high' && item.status !== 'done').length;
  const openCheckCount = checkItems.filter((item) => item.status === 'unchecked' || item.status === 'issue_found').length;
  const severeCheckCount = checkItems.filter((item) => item.severity === 'high' && item.status !== 'fixed').length;
  const overviewHealthLabel = profileCompletion >= 70 && completedPanels.length >= 3
    ? '项目上下文较完整'
    : profileCompletion >= 45 || completedPanels.length >= 2
      ? '项目正在成型'
      : '建议先补档案';
  const isFirstRun = !completedPanels.length
    && !state?.history?.length
    && !sourceText.trim()
    && !draft.trim()
    && !chapters.length
    && !references.length
    && !feedbackItems.length
    && !checkItems.length;

  function clearOperationProgressTimers() {
    if (operationProgressTimerRef.current !== null) {
      window.clearInterval(operationProgressTimerRef.current);
      operationProgressTimerRef.current = null;
    }
    if (operationProgressClearTimerRef.current !== null) {
      window.clearTimeout(operationProgressClearTimerRef.current);
      operationProgressClearTimerRef.current = null;
    }
  }

  function startOperationProgress(message: string) {
    const requestId = `thesis-local-${Date.now()}`;
    clearOperationProgressTimers();
    setOperationProgress({
      requestId,
      phase: 'running',
      progress: 8,
      message,
    });
    operationProgressTimerRef.current = window.setInterval(() => {
      setOperationProgress((current) => {
        if (!current || current.requestId !== requestId || current.phase !== 'running') {
          return current;
        }
        const nextProgress = Math.min(
          92,
          Math.max(current.progress + 1, Math.round(current.progress + (92 - current.progress) * 0.16)),
        );
        return { ...current, progress: nextProgress, message };
      });
    }, 500);
    return requestId;
  }

  function finishOperationProgress(
    requestId: string,
    message: string,
    phase: WordExportProgressEvent['phase'] = 'success',
  ) {
    if (operationProgressTimerRef.current !== null) {
      window.clearInterval(operationProgressTimerRef.current);
      operationProgressTimerRef.current = null;
    }
    setOperationProgress((current) => (
      current?.requestId === requestId
        ? { ...current, phase, progress: phase === 'canceled' ? 0 : 100, message }
        : current
    ));
    operationProgressClearTimerRef.current = window.setTimeout(() => {
      setOperationProgress((current) => (current?.requestId === requestId ? null : current));
      operationProgressClearTimerRef.current = null;
    }, phase === 'success' ? 1200 : 1800);
  }

  const nextActionLabel = useMemo(() => {
    if (activePanel === 'diagnosis') return '生成诊断简报';
    if (activePanel === 'topic') return '生成选题方案';
    if (activePanel === 'literature') return '生成文献策略';
    if (activePanel === 'methodology') return '生成研究设计';
    if (activePanel === 'data') return '生成数据预检';
    if (activePanel === 'charts') return '生成图表方案';
    if (activePanel === 'drafting') return '生成论文初稿';
    if (activePanel === 'writing') return '生成写作/批注';
    if (activePanel === 'review') return '生成评审方案';
    return '生成检查建议';
  }, [activePanel]);
  const nextPanel = getNextPanel(activePanel);

  const noticeDialog = (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="thesis-tutor-notice-trigger">注意事项</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="thesis-tutor-help-card thesis-tutor-notice-card">
          <div className="thesis-tutor-help-head">
            <div>
              <Dialog.Title>论文导师注意事项</Dialog.Title>
              <Dialog.Description>
                论文导师的定位是辅助研究和写作管理，不是替你完成整篇论文。
              </Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭论文导师注意事项">×</Dialog.Close>
          </div>
          <div className="thesis-tutor-notice-list">
            {thesisTutorNoticeItems.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
          <div className="thesis-tutor-help-tip">
            建议把它当成“论文教练”和“写作检查员”：你提供真实材料和判断，它帮你把路径、结构、问题和表达整理得更清楚。
          </div>
          <div className="thesis-tutor-help-actions">
            <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  const shouldShowFullProfilePanel = activePanel === 'diagnosis' || profilePanelExpanded;
  const profileSummaryItems = [
    ['学位/类型', `${profile.degree || '未填写'} / ${profile.degreeType || '未填写'}`],
    ['专业方向', `${profile.discipline || '未填写'}${profile.direction ? ` / ${profile.direction}` : ''}`],
    ['当前阶段', profile.stage || '未填写'],
    ['引用格式', profile.citationFormat || '未填写'],
    ['论文题目', profile.title || '未定题'],
    ['档案状态', profileLocked ? '已锁定' : '可编辑'],
  ];

  const profilePanel = !shouldShowFullProfilePanel ? (
    <section className="thesis-tutor-panel thesis-tutor-profile-summary-panel">
      <div className="thesis-tutor-profile-summary-main">
        <div>
          <strong>论文档案已作为本模块上下文带入</strong>
          <span>这里不再重复展示完整表单；题目、方向、阶段和引用格式会自动用于本次生成。</span>
        </div>
        <div className="thesis-tutor-profile-summary-chips">
          {profileSummaryItems.map(([label, value]) => (
            <span key={label}><b>{label}</b>{value}</span>
          ))}
        </div>
      </div>
      <div className="thesis-tutor-profile-summary-side">
        <div className="thesis-tutor-context-note">
          <strong>{panel.label}会重点使用</strong>
          <div>
            {profileUsageByPanel[activePanel].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        <div className="thesis-tutor-profile-summary-actions">
          <button type="button" className="secondary-action" onClick={() => setProfilePanelExpanded(true)}>展开编辑档案</button>
          <button type="button" className="secondary-action" onClick={() => switchPanel('diagnosis')}>回到启动诊断</button>
        </div>
      </div>
    </section>
  ) : (
    <section className="thesis-tutor-panel thesis-tutor-profile-panel">
      <div className="thesis-tutor-panel-head thesis-tutor-profile-head">
        <div>
          <strong>论文档案（全流程生成上下文）</strong>
          <span>{activePanel === 'diagnosis' ? '建议先在启动诊断阶段确认一次；后续选题、综述、研究设计、写作和答辩都会沿用这份档案。' : '你正在临时展开编辑档案；保存后会继续作为后续模块上下文。'}</span>
        </div>
        <div className="thesis-tutor-profile-actions">
          {activePanel !== 'diagnosis' && (
            <button type="button" className="secondary-action" onClick={() => setProfilePanelExpanded(false)}>
              收起档案
            </button>
          )}
          <button type="button" className="secondary-action" onClick={toggleProfileLock} disabled={saving || isRunning}>
            {profileLocked ? '解锁档案' : '锁定档案'}
          </button>
          <button type="button" className="secondary-action" onClick={saveProfile} disabled={saving || isRunning || profileLocked}>保存档案</button>
        </div>
      </div>
      <div className="thesis-tutor-profile-guidance">
        <strong>{profileLocked ? '档案已锁定' : profile.title.trim() || profile.discipline.trim() || profile.direction.trim() ? '档案可继续沿用' : '先补全基础档案'}</strong>
        <span>{profileLocked ? '后续模块会继续使用当前档案；如需修改题目、阶段或引用格式，请先解锁。' : '题目、方向、阶段或引用格式发生变化时再回来调整；未变化时，后续模块会自动带入这些信息。'}</span>
      </div>
      <div className="thesis-tutor-context-note">
        <strong>{panel.label}会重点使用</strong>
        <div>
          {profileUsageByPanel[activePanel].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <fieldset className="thesis-tutor-profile-fieldset" disabled={profileLocked || isRunning}>
      <div className="thesis-tutor-form-grid thesis-tutor-profile-grid">
        <label>
          <span>学位</span>
          <select value={profile.degree} onChange={(event) => updateProfile('degree', event.target.value)}>
            {degreeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>类型</span>
          <select value={profile.degreeType} onChange={(event) => updateProfile('degreeType', event.target.value)}>
            {degreeTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>专业</span>
          <input value={profile.discipline} onChange={(event) => updateProfile('discipline', event.target.value)} placeholder="如 管理学、计算机科学" />
        </label>
        <label>
          <span>方向</span>
          <input value={profile.direction} onChange={(event) => updateProfile('direction', event.target.value)} placeholder="如 数字治理、教育技术" />
        </label>
        <label>
          <span>语种</span>
          <input value={profile.language} onChange={(event) => updateProfile('language', event.target.value)} placeholder="中文/英文" />
        </label>
        <label>
          <span>当前阶段</span>
          <select value={profile.stage} onChange={(event) => updateProfile('stage', event.target.value)}>
            {stageOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>引用格式</span>
          <select value={profile.citationFormat} onChange={(event) => updateProfile('citationFormat', event.target.value)}>
            {citationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="is-full">
          <span>论文题目</span>
          <input value={profile.title} onChange={(event) => updateProfile('title', event.target.value)} placeholder="未定题可留空；确定后会作为后续模块边界" />
        </label>
      </div>
      <details className="thesis-tutor-profile-extra">
        <summary>
          <strong>补充档案</strong>
          <span>学校要求、导师偏好、时间节点、数据源和章节计划，填写后会一起进入后续生成上下文。</span>
        </summary>
        <div className="thesis-tutor-profile-extra-grid">
          <label>
            <span>学校/学院要求</span>
            <textarea value={profile.schoolRequirements} onChange={(event) => updateProfile('schoolRequirements', event.target.value)} placeholder="如格式模板、开题要求、字数、查重比例、学院特别要求。" />
          </label>
          <label>
            <span>导师偏好</span>
            <textarea value={profile.advisorPreferences} onChange={(event) => updateProfile('advisorPreferences', event.target.value)} placeholder="如导师偏好的研究方法、写作风格、重点关注问题或不希望采用的方向。" />
          </label>
          <label>
            <span>时间节点</span>
            <textarea value={profile.milestones} onChange={(event) => updateProfile('milestones', event.target.value)} placeholder="如开题、中期、初稿、预答辩、正式答辩的时间安排。" />
          </label>
          <label>
            <span>可用数据源</span>
            <textarea value={profile.dataSources} onChange={(event) => updateProfile('dataSources', event.target.value)} placeholder="如问卷、访谈对象、案例公司、公开数据、项目资料或政策文件。" />
          </label>
          <label>
            <span>研究类型</span>
            <select value={profile.researchType} onChange={(event) => updateProfile('researchType', event.target.value)}>
              {researchTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>成稿范围</span>
            <select value={profile.writingScope} onChange={(event) => updateProfile('writingScope', event.target.value)}>
              {writingScopeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>目标字数</span>
            <textarea value={profile.targetWordCount} onChange={(event) => updateProfile('targetWordCount', event.target.value)} placeholder="如整篇 12000 字、第一章约 2500 字、摘要 300 字。" />
          </label>
          <label>
            <span>数据/材料真实性说明</span>
            <textarea value={profile.dataIntegrityNotes} onChange={(event) => updateProfile('dataIntegrityNotes', event.target.value)} placeholder="说明哪些材料已确认真实，哪些文献/数据还待核验；没有真实数据时请明确写清。" />
          </label>
          <label>
            <span>已定研究问题</span>
            <textarea value={profile.researchQuestions} onChange={(event) => updateProfile('researchQuestions', event.target.value)} placeholder="如核心研究问题、子问题、假设或待验证观点。" />
          </label>
          <label>
            <span>方法/变量/样本条件</span>
            <textarea value={profile.methodologyNotes} onChange={(event) => updateProfile('methodologyNotes', event.target.value)} placeholder="如量化/质性/案例研究、变量设想、样本范围、访谈对象或分析工具。" />
          </label>
          <label>
            <span>论文目录或章节计划</span>
            <textarea value={profile.outlinePlan} onChange={(event) => updateProfile('outlinePlan', event.target.value)} placeholder="如第一章绪论、第二章文献综述、第三章研究设计等已有目录。" />
          </label>
          <label>
            <span>已有文献线索</span>
            <textarea value={profile.literatureNotes} onChange={(event) => updateProfile('literatureNotes', event.target.value)} placeholder="如核心文献、作者年份、关键词、数据库检索式或文献清单摘要。" />
          </label>
        </div>
      </details>
      </fieldset>
    </section>
  );

  useEffect(() => {
    setActivePanel(initialPanel);
  }, [initialPanel]);

  useEffect(() => {
    let mounted = true;
    const bridge = window.yibiao?.thesisTutor;
    if (!bridge) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    bridge.loadState()
      .then((nextState) => {
        if (!mounted) return;
        setState(nextState);
        setProfile({ ...defaultProfile, ...nextState.profile });
        setSourceText(nextState.sourceText || '');
        setDraft(nextState.draft || nextState.latestResult || '');
        setChapters(nextState.chapters || []);
        setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
        setReferences(nextState.references || []);
        setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
        setFeedbackItems(nextState.feedbackItems || []);
        setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
        setCheckItems(nextState.checkItems || []);
        setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取论文导师状态失败', 'error'))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = bridge.onEvent((nextState) => {
      setState(nextState);
      setProfile({ ...defaultProfile, ...nextState.profile });
      setSourceText(nextState.sourceText || '');
      setDraft(nextState.draft || nextState.latestResult || '');
      setChapters(nextState.chapters || []);
      setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
    });

    const unsubscribeExport = window.yibiao?.export.onWordExportProgress((event) => {
      setExportProgress(event);
      if (event.phase === 'success') {
        showToast(event.message || '论文导师结果已导出 Word', 'success');
      } else if (event.phase === 'error') {
        showToast(event.message || '导出 Word 失败', 'error');
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
      unsubscribeExport?.();
      clearOperationProgressTimers();
    };
  }, [showToast]);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.config.load()
      .then((config) => {
        if (!mounted || !config) return;
        setMissingTextModelFields([
          !String(config.api_key || '').trim() ? 'API Key' : '',
          !String(config.base_url || '').trim() ? 'Base URL' : '',
          !String(config.model_name || '').trim() ? '模型名称' : '',
        ].filter(Boolean));
      })
      .catch(() => {
        if (mounted) setMissingTextModelFields([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function applyWorkspaceState(nextState: ThesisTutorState) {
    const nextPanel = nextState.activePanel || 'diagnosis';
    setState(nextState);
    setProfile({ ...defaultProfile, ...nextState.profile });
    setActivePanel(nextPanel);
    setSourceText(nextState.sourceText || '');
    setDraft(nextState.draft || nextState.latestResult || '');
    setUserInput(nextState.panelResults?.[nextPanel]?.input || '');
    setChapters(nextState.chapters || []);
    setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
    setReferences(nextState.references || []);
    setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
    setFeedbackItems(nextState.feedbackItems || []);
    setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
    setCheckItems(nextState.checkItems || []);
    setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
    onNavigate?.(panelCopy[nextPanel].section);
  }

  function updateProfile<K extends keyof ThesisTutorProfile>(key: K, value: ThesisTutorProfile[K]) {
    if (profileLocked) return;
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateActiveChapter(patch: Partial<ThesisTutorChapter>) {
    if (!activeChapter) return;
    setChapters((current) => current.map((chapter) => (
      chapter.id === activeChapter.id
        ? { ...chapter, ...patch, updated_at: new Date().toISOString() }
        : chapter
    )));
  }

  function selectChapter(chapterId: string) {
    const nextChapter = chapters.find((chapter) => chapter.id === chapterId);
    setActiveChapterId(chapterId);
    if ((activePanel === 'drafting' || activePanel === 'writing') && nextChapter?.draft) {
      setDraft(nextChapter.draft);
    }
  }

  function addChapter() {
    const nextChapter = createLocalChapter(`新章节 ${chapters.length + 1}`);
    setChapters((current) => [...current, nextChapter]);
    setActiveChapterId(nextChapter.id);
    setDraft('');
  }

  async function createChaptersFromOutline() {
    const nextChapters = parseOutlinePlanToChapters(profile.outlinePlan);
    if (!nextChapters.length) {
      showToast('请先在论文档案的“论文目录或章节计划”里填写章节目录', 'info');
      return;
    }
    setChapters(nextChapters);
    setActiveChapterId(nextChapters[0].id);
    setDraft(nextChapters[0].draft || '');
    if (!window.yibiao?.thesisTutor) return;
    try {
      const nextState = await window.yibiao.thesisTutor.saveChapters({
        chapters: nextChapters,
        activeChapterId: nextChapters[0].id,
      });
      setState(nextState);
      showToast('已根据目录生成章节工作区', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存章节失败', 'error');
    }
  }

  async function saveChapterWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveChapters({
        chapters,
        activeChapterId: activeChapter?.id || activeChapterId,
      });
      setState(nextState);
      showToast('章节工作区已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存章节工作区失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateActiveReference(patch: Partial<ThesisTutorReference>) {
    if (!activeReference) return;
    setReferences((current) => current.map((reference) => (
      reference.id === activeReference.id
        ? { ...reference, ...patch, updated_at: new Date().toISOString() }
        : reference
    )));
  }

  function addReference() {
    const nextReference = createLocalReference(`证据条目 ${references.length + 1}`);
    setReferences((current) => [...current, nextReference]);
    setActiveReferenceId(nextReference.id);
  }

  function removeActiveReference() {
    if (!activeReference) return;
    const nextReferences = references.filter((reference) => reference.id !== activeReference.id);
    setReferences(nextReferences);
    setActiveReferenceId(nextReferences[0]?.id || '');
  }

  function fillReferenceFromSource() {
    if (!activeReference) {
      const nextReference = {
        ...createLocalReference('来自材料区的证据'),
        summary: sourceText.slice(0, 5000),
      };
      setReferences((current) => [...current, nextReference]);
      setActiveReferenceId(nextReference.id);
      return;
    }
    updateActiveReference({ summary: sourceText.slice(0, 5000) });
  }

  function toggleReferenceChapter(chapterId: string) {
    if (!activeReference) return;
    const exists = activeReference.relatedChapterIds.includes(chapterId);
    updateActiveReference({
      relatedChapterIds: exists
        ? activeReference.relatedChapterIds.filter((id) => id !== chapterId)
        : [...activeReference.relatedChapterIds, chapterId],
    });
  }

  async function saveReferenceWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveReferences({
        references,
        activeReferenceId: activeReference?.id || activeReferenceId,
      });
      setState(nextState);
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
      showToast('文献与证据链已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存证据链失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateActiveFeedback(patch: Partial<ThesisTutorFeedbackItem>) {
    if (!activeFeedback) return;
    setFeedbackItems((current) => current.map((item) => (
      item.id === activeFeedback.id
        ? { ...item, ...patch, updated_at: new Date().toISOString() }
        : item
    )));
  }

  function addFeedback() {
    const nextFeedback = createLocalFeedback(`导师反馈 ${feedbackItems.length + 1}`);
    setFeedbackItems((current) => [...current, nextFeedback]);
    setActiveFeedbackId(nextFeedback.id);
  }

  function removeActiveFeedback() {
    if (!activeFeedback) return;
    const nextFeedbackItems = feedbackItems.filter((item) => item.id !== activeFeedback.id);
    setFeedbackItems(nextFeedbackItems);
    setActiveFeedbackId(nextFeedbackItems[0]?.id || '');
  }

  function fillFeedbackFromSource() {
    if (!sourceText.trim()) return;
    if (!activeFeedback) {
      const nextFeedback = {
        ...createLocalFeedback('来自材料区的导师意见'),
        originalFeedback: sourceText.slice(0, 5000),
      };
      setFeedbackItems((current) => [...current, nextFeedback]);
      setActiveFeedbackId(nextFeedback.id);
      return;
    }
    updateActiveFeedback({ originalFeedback: sourceText.slice(0, 5000) });
  }

  function toggleFeedbackChapter(chapterId: string) {
    if (!activeFeedback) return;
    const exists = activeFeedback.relatedChapterIds.includes(chapterId);
    updateActiveFeedback({
      relatedChapterIds: exists
        ? activeFeedback.relatedChapterIds.filter((id) => id !== chapterId)
        : [...activeFeedback.relatedChapterIds, chapterId],
    });
  }

  async function saveFeedbackWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveFeedback({
        feedbackItems,
        activeFeedbackId: activeFeedback?.id || activeFeedbackId,
      });
      setState(nextState);
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
      showToast('导师反馈任务已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存导师反馈失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateActiveCheck(patch: Partial<ThesisTutorCheckItem>) {
    if (!activeCheck) return;
    setCheckItems((current) => current.map((item) => (
      item.id === activeCheck.id
        ? { ...item, ...patch, updated_at: new Date().toISOString() }
        : item
    )));
  }

  function addCheckItem() {
    const nextCheck = createLocalCheckItem(`检查项 ${checkItems.length + 1}`);
    setCheckItems((current) => [...current, nextCheck]);
    setActiveCheckId(nextCheck.id);
  }

  function removeActiveCheck() {
    if (!activeCheck) return;
    const nextCheckItems = checkItems.filter((item) => item.id !== activeCheck.id);
    setCheckItems(nextCheckItems);
    setActiveCheckId(nextCheckItems[0]?.id || '');
  }

  function createDefaultCheckItems() {
    const defaults: Array<Partial<ThesisTutorCheckItem> & { title: string }> = [
      { category: 'format', title: '标题层级、编号和目录一致性', severity: 'high', suggestion: '核对章节标题、目录编号、图表编号和正文标题是否一致。' },
      { category: 'citation', title: '正文引用与参考文献对应关系', severity: 'high', suggestion: '逐条核对正文引用是否进入参考文献列表，参考文献是否在正文出现。' },
      { category: 'citation', title: '参考文献格式', severity: 'medium', suggestion: `按 ${profile.citationFormat || '学校要求'} 检查作者、年份、题名、期刊、页码、DOI 或链接格式。` },
      { category: 'duplication', title: '重复表达和套话段落', severity: 'medium', suggestion: '标记重复定义、重复背景介绍和泛泛表述，合并或改为具体论证。' },
      { category: 'ai_tone', title: 'AI 味与空泛表达', severity: 'medium', suggestion: '检查“具有重要意义”“显著提升”等泛化表达，替换为材料支撑的具体表述。' },
      { category: 'logic', title: '段落衔接和论证闭环', severity: 'high', suggestion: '检查每节是否有问题提出、证据支撑、分析解释和小结回扣。' },
    ];

    const riskyReferenceCount = references.filter((reference) => reference.verificationStatus !== 'verified').length;
    const openFeedbackCount = feedbackItems.filter((item) => item.status !== 'done' && item.status !== 'deferred').length;
    const draftedChapterCount = chapters.filter((chapter) => chapter.draft.trim() || chapter.status === 'drafted' || chapter.status === 'done').length;
    const dynamicChecks: Array<Partial<ThesisTutorCheckItem> & { title: string }> = [
      references.length === 0
        ? { category: 'citation', title: '缺少文献与证据链', severity: 'high', suggestion: '先在文献与证据链中录入真实文献、政策、案例或数据证据，避免正文无依据。' }
        : riskyReferenceCount > 0
          ? { category: 'citation', title: '待核验或慎用证据处理', severity: 'high', suggestion: `当前仍有 ${riskyReferenceCount} 条证据未标记为已核验。正式正文引用前，请补核验来源和备注。` }
          : { category: 'citation', title: '已核验证据使用一致性', severity: 'medium', suggestion: '检查已核验证据是否在正文中有明确用途，避免参考文献堆砌。' },
      dataPreflight.tone !== 'ready'
        ? { category: 'logic', title: '数据真实性与实证边界', severity: 'high', suggestion: `${dataPreflight.summary} 终稿中不得提前写确定性统计结论。` }
        : { category: 'logic', title: '数据分析结果与文字一致', severity: 'high', suggestion: '检查描述统计、相关/回归/访谈编码等结论是否与真实数据或分析结果一致。' },
      chapters.length === 0 || draftedChapterCount === 0
        ? { category: 'logic', title: '章节草稿完整性', severity: 'high', suggestion: '当前章节草稿不足，建议先自动成稿或逐章写作，再进入终稿审查。' }
        : { category: 'logic', title: '章节内容完整性', severity: 'medium', suggestion: `检查 ${draftedChapterCount}/${chapters.length} 个已有章节是否覆盖研究问题、文献、方法、分析和结论。` },
      openFeedbackCount > 0
        ? { category: 'other', title: '导师反馈关闭情况', severity: 'high', suggestion: `还有 ${openFeedbackCount} 条导师反馈未关闭，提交前请逐项处理或记录暂缓原因。` }
        : { category: 'other', title: '导师反馈回看', severity: 'medium', suggestion: '回看导师反馈闭环，确认已处理意见在正文中有对应修改。' },
      { category: 'format', title: '封面、摘要、关键词、目录和致谢完整性', severity: 'medium', suggestion: '按学校模板检查封面信息、摘要关键词、目录、致谢、声明页等是否齐全。' },
    ].filter(Boolean) as Array<Partial<ThesisTutorCheckItem> & { title: string }>;

    const existingTitles = new Set(checkItems.map((item) => item.title.trim()));
    const nextChecks = [...defaults, ...dynamicChecks]
      .filter((item) => !existingTitles.has(item.title.trim()))
      .map((item) => ({
      ...createLocalCheckItem(item.title),
      ...item,
      status: 'unchecked' as ThesisTutorCheckStatus,
    }));
    if (!nextChecks.length) {
      showToast('终稿审查清单已经比较完整，可继续手动新增单项检查', 'info');
      return;
    }
    const mergedChecks = [...checkItems, ...nextChecks];
    setCheckItems(mergedChecks);
    setActiveCheckId(nextChecks[0]?.id || mergedChecks[0]?.id || '');
    showToast(checkItems.length ? `已补充 ${nextChecks.length} 项终稿审查` : '已生成终稿审查清单', 'success');
  }

  function fillCheckFromSource() {
    if (!sourceText.trim()) return;
    if (!activeCheck) {
      const nextCheck = {
        ...createLocalCheckItem('来自材料区的检查问题'),
        issue: sourceText.slice(0, 5000),
        status: 'issue_found' as ThesisTutorCheckStatus,
      };
      setCheckItems((current) => [...current, nextCheck]);
      setActiveCheckId(nextCheck.id);
      return;
    }
    updateActiveCheck({ issue: sourceText.slice(0, 5000), status: 'issue_found' });
  }

  function getMaterialExtractLabel() {
    if (activePanel === 'literature') return '拆成证据条目';
    if (activePanel === 'drafting' || activePanel === 'writing') return '放入章节材料';
    if (activePanel === 'review') return '拆成反馈任务';
    if (activePanel === 'format') return '拆成检查项';
    if (activePanel === 'methodology') return '沉淀到方法档案';
    return '沉淀到论文档案';
  }

  async function extractMaterialToWorkspace() {
    const material = sourceText.trim();
    if (!material) {
      showToast('请先导入或粘贴材料', 'info');
      return;
    }
    const blocks = splitMaterialBlocks(material);

    try {
      setSaving(true);
      if (activePanel === 'literature') {
        const nextReferences = [
          ...blocks.map((block, index) => ({
            ...createLocalReference(extractResultTitle(block) || `材料证据 ${index + 1}`),
            type: 'literature' as ThesisTutorReferenceType,
            summary: truncateExportText(block, 5000),
            keyPoints: '由材料区结构化提取，可继续补充作者、年份、来源和规范引用。',
          })),
          ...references,
        ];
        setReferences(nextReferences);
        setActiveReferenceId(nextReferences[0]?.id || '');
        const nextState = await window.yibiao?.thesisTutor?.saveReferences({
          references: nextReferences,
          activeReferenceId: nextReferences[0]?.id || '',
        });
        if (nextState) setState(nextState);
        showToast(`已提取 ${blocks.length} 条证据`, 'success');
        return;
      }

      if (activePanel === 'drafting' || activePanel === 'writing') {
        const targetChapter = activeChapter || createLocalChapter('来自材料区的章节材料');
        const existingChapters = chapters.length ? chapters : [targetChapter];
        const nextChapters = existingChapters.map((chapter) => (
          chapter.id === targetChapter.id
            ? { ...chapter, material: appendMaterial(chapter.material, material), status: 'writing' as ThesisTutorChapterStatus, updated_at: new Date().toISOString() }
            : chapter
        ));
        setChapters(nextChapters);
        setActiveChapterId(targetChapter.id);
        const nextState = await window.yibiao?.thesisTutor?.saveChapters({
          chapters: nextChapters,
          activeChapterId: targetChapter.id,
        });
        if (nextState) setState(nextState);
        showToast('已放入当前章节材料', 'success');
        return;
      }

      if (activePanel === 'review') {
        const nextFeedbackItems = [
          ...blocks.map((block, index) => ({
            ...createLocalFeedback(extractResultTitle(block) || `材料反馈 ${index + 1}`),
            source: state?.importedSourceFileName || '材料区',
            priority: 'medium' as ThesisTutorFeedbackPriority,
            status: 'todo' as ThesisTutorFeedbackStatus,
            originalFeedback: truncateExportText(block, 5000),
            actionPlan: '请根据材料内容拆分修改动作。',
          })),
          ...feedbackItems,
        ];
        setFeedbackItems(nextFeedbackItems);
        setActiveFeedbackId(nextFeedbackItems[0]?.id || '');
        const nextState = await window.yibiao?.thesisTutor?.saveFeedback({
          feedbackItems: nextFeedbackItems,
          activeFeedbackId: nextFeedbackItems[0]?.id || '',
        });
        if (nextState) setState(nextState);
        showToast(`已提取 ${blocks.length} 条反馈任务`, 'success');
        return;
      }

      if (activePanel === 'format') {
        const nextCheckItems = [
          ...blocks.map((block, index) => ({
            ...createLocalCheckItem(extractResultTitle(block) || `材料检查项 ${index + 1}`),
            category: 'other' as ThesisTutorCheckCategory,
            severity: 'medium' as ThesisTutorCheckSeverity,
            status: 'issue_found' as ThesisTutorCheckStatus,
            issue: truncateExportText(block, 5000),
            suggestion: '请结合学校格式要求、引用规范和正文语境继续核对。',
          })),
          ...checkItems,
        ];
        setCheckItems(nextCheckItems);
        setActiveCheckId(nextCheckItems[0]?.id || '');
        const nextState = await window.yibiao?.thesisTutor?.saveChecks({
          checkItems: nextCheckItems,
          activeCheckId: nextCheckItems[0]?.id || '',
        });
        if (nextState) setState(nextState);
        showToast(`已提取 ${blocks.length} 个检查项`, 'success');
        return;
      }

      if (profileLocked) {
        showToast('论文档案已锁定，请先解锁再沉淀材料', 'info');
        return;
      }
      const nextProfile = activePanel === 'methodology'
        ? {
          ...profile,
          methodologyNotes: appendMaterial(profile.methodologyNotes, material.slice(0, 3000)),
          dataSources: appendMaterial(profile.dataSources, blocks[0] || '').slice(0, 3000),
        }
        : {
          ...profile,
          schoolRequirements: appendMaterial(profile.schoolRequirements, material.slice(0, 3000)),
        };
      setProfile(nextProfile);
      const nextState = await window.yibiao?.thesisTutor?.saveProfile(nextProfile);
      if (nextState) {
        setState(nextState);
        setProfile({ ...defaultProfile, ...nextState.profile });
      }
      showToast('已沉淀到论文档案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '结构化提取材料失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveCheckWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveChecks({
        checkItems,
        activeCheckId: activeCheck?.id || activeCheckId,
      });
      setState(nextState);
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
      showToast('格式与查重检查清单已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存检查清单失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleMainWheelCapture(event: WheelEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    const container = mainScrollRef.current;
    if (!container) {
      return;
    }

    const canTextareaScroll = target.scrollHeight > target.clientHeight + 1;
    const scrollingDown = event.deltaY > 0;
    const scrollingUp = event.deltaY < 0;
    const textareaAtTop = target.scrollTop <= 0;
    const textareaAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
    const shouldMoveContainer = !canTextareaScroll
      || (scrollingDown && textareaAtBottom)
      || (scrollingUp && textareaAtTop);

    if (!shouldMoveContainer) {
      return;
    }

    container.scrollTop += event.deltaY;
    event.preventDefault();
  }

  function switchPanel(nextPanel: ThesisTutorPanel) {
    setActivePanel(nextPanel);
    setProfilePanelExpanded(false);
    const nextResult = panelResults[nextPanel];
    if (nextResult?.content) {
      setDraft(nextResult.content);
      setUserInput(nextResult.input || '');
    } else if ((nextPanel === 'drafting' || nextPanel === 'writing') && activeChapter?.draft) {
      setDraft(activeChapter.draft);
      setUserInput('');
    } else {
      setDraft('');
      setUserInput('');
    }
    onNavigate?.(panelCopy[nextPanel].section);
  }

  function startDiagnosisTemplate() {
    setActivePanel('diagnosis');
    setProfilePanelExpanded(false);
    setUserInput('我是（学位/专业），目前处在（没方向/有方向/已定题/写作中）阶段，距离开题或答辩还有（时间），主要卡点是（选题/文献/方法/写作/格式）。请先帮我做启动诊断。');
    onNavigate?.(panelCopy.diagnosis.section);
    showToast('已填入启动诊断模板，请按你的情况改一下再生成', 'success');
  }

  function toggleChartTemplate(templateId: string) {
    setSelectedChartTemplateIds((current) => (
      current.includes(templateId)
        ? current.filter((item) => item !== templateId)
        : [...current, templateId]
    ));
  }

  function applySelectedChartTemplates() {
    const selectedTemplates = chartTemplates.filter((template) => selectedChartTemplateIds.includes(template.id));
    if (!selectedTemplates.length) {
      showToast('请先选择至少一个图形模板', 'info');
      return;
    }
    setActivePanel('charts');
    setProfilePanelExpanded(false);
    setUserInput([
      `请基于论文档案和下方 ${selectedTemplates.length} 个图形模板，生成一组论文图表。`,
      '要求每个图都输出 Mermaid 代码块、图名图注、适用章节、节点解释和可修改项；未核验关系请标注“待核验”。',
      '',
      selectedTemplates.map((template, index) => `${index + 1}. ${template.title}：${template.description}`).join('\n'),
    ].join('\n'));
    setSourceText((current) => {
      const currentText = current.trim();
      const nextText = selectedTemplates.map((template) => `## ${template.title}\n${template.sourceText.trim()}`).join('\n\n---\n\n');
      return currentText ? `${currentText}\n\n---\n\n${nextText}` : nextText;
    });
    setDraft(selectedTemplates.map((template) => template.draft).join('\n\n---\n\n'));
    onNavigate?.(panelCopy.charts.section);
    showToast(`已填入 ${selectedTemplates.length} 个图形模板，可直接编辑 Mermaid 或点击生成优化`, 'success');
  }

  function carryResultToNextPanel() {
    if (!result.trim() || !nextPanel) return;
    const nextCopy = panelCopy[nextPanel];
    switchPanel(nextPanel);
    setUserInput(`请基于上一阶段成果继续推进“${nextCopy.label}”。`);
    setSourceText([
      `## 上一阶段：${panel.label}`,
      result,
    ].join('\n\n'));
    showToast(`已带着当前结果进入“${nextCopy.label}”`, 'success');
  }

  async function saveProfile() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveProfile(profile);
      setState(nextState);
      setChapters(nextState.chapters || []);
      setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
      showToast('论文档案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存论文档案失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleProfileLock() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveProfileLock({ locked: !profileLocked });
      setState(nextState);
      showToast(!profileLocked ? '论文档案已锁定' : '论文档案已解锁', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换档案锁定失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleTopicToProfile() {
    if (!result.trim()) {
      showToast('请先生成或填写选题结果', 'info');
      return;
    }
    if (profileLocked) {
      showToast('论文档案已锁定，请先解锁再沉淀选题结果', 'info');
      return;
    }
    const title = extractResultTitle(result);
    const nextProfile = {
      ...profile,
      title: profile.title.trim() || title,
      researchQuestions: profile.researchQuestions.trim()
        ? profile.researchQuestions
        : truncateExportText(result, 1600),
      outlinePlan: profile.outlinePlan.trim()
        ? profile.outlinePlan
        : truncateExportText(result, 1800),
      stage: profile.stage === '没方向' ? '有方向没定题' : profile.stage,
    };
    setProfile(nextProfile);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveProfile(nextProfile);
      setState(nextState);
      setProfile({ ...defaultProfile, ...nextState.profile });
      showToast('已把选题结果沉淀到论文档案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到论文档案失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleResultToReferences() {
    if (!result.trim()) {
      showToast('请先生成或填写文献综述结果', 'info');
      return;
    }
    const nextReference = {
      ...createLocalReference(extractResultTitle(result) || '来自文献综述的证据链'),
      type: 'literature' as ThesisTutorReferenceType,
      summary: truncateExportText(result, 5000),
      keyPoints: '由文献综述结果沉淀，可继续拆分为多条文献或证据。',
    };
    const nextReferences = [nextReference, ...references];
    setReferences(nextReferences);
    setActiveReferenceId(nextReference.id);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveReferences({
        references: nextReferences,
        activeReferenceId: nextReference.id,
      });
      setState(nextState);
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextReference.id);
      showToast('已沉淀到文献与证据链', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到证据链失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleResultToFeedback() {
    if (!result.trim()) {
      showToast('请先生成或填写评审结果', 'info');
      return;
    }
    const nextFeedback = {
      ...createLocalFeedback(extractResultTitle(result) || '来自评审结果的修改任务'),
      source: panel.label,
      priority: 'high' as ThesisTutorFeedbackPriority,
      status: 'todo' as ThesisTutorFeedbackStatus,
      originalFeedback: truncateExportText(result, 5000),
      actionPlan: '请根据评审结果拆分并逐项处理。',
    };
    const nextFeedbackItems = [nextFeedback, ...feedbackItems];
    setFeedbackItems(nextFeedbackItems);
    setActiveFeedbackId(nextFeedback.id);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveFeedback({
        feedbackItems: nextFeedbackItems,
        activeFeedbackId: nextFeedback.id,
      });
      setState(nextState);
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextFeedback.id);
      showToast('已沉淀到导师反馈闭环', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到导师反馈失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleResultToChecks() {
    if (!result.trim()) {
      showToast('请先生成或填写检查结果', 'info');
      return;
    }
    const nextCheck = {
      ...createLocalCheckItem(extractResultTitle(result) || '来自格式与查重结果的检查项'),
      category: 'other' as ThesisTutorCheckCategory,
      severity: 'medium' as ThesisTutorCheckSeverity,
      status: 'issue_found' as ThesisTutorCheckStatus,
      issue: truncateExportText(result, 4000),
      suggestion: '请根据检查结果逐项修改，并在修改记录中说明处理情况。',
    };
    const nextCheckItems = [nextCheck, ...checkItems];
    setCheckItems(nextCheckItems);
    setActiveCheckId(nextCheck.id);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveChecks({
        checkItems: nextCheckItems,
        activeCheckId: nextCheck.id,
      });
      setState(nextState);
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextCheck.id);
      showToast('已沉淀到格式与查重检查清单', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到检查清单失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    if (activePanel === 'drafting' && draftingPreflight.tone !== 'ready') {
      showToast(`${draftingPreflight.mode}：生成结果会标注需补充或待核验内容`, 'info');
    }
    if (activePanel === 'data' && dataPreflight.tone !== 'ready') {
      showToast(`${dataPreflight.recommendation}：暂不生成确定性统计结论`, 'info');
    }
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.generate({
        panel: activePanel,
        profile,
        userInput,
        sourceText,
        chapters,
        activeChapterId: activeChapter?.id || activeChapterId,
        references,
        activeReferenceId: activeReference?.id || activeReferenceId,
        feedbackItems,
        activeFeedbackId: activeFeedback?.id || activeFeedbackId,
        checkItems,
        activeCheckId: activeCheck?.id || activeCheckId,
      });
      setState(nextState);
      setDraft(nextState.draft || nextState.latestResult || '');
      setChapters(nextState.chapters || []);
      setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
      showToast(`${panel.label}已生成`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '论文导师生成失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveDraft({
        panel: activePanel,
        draft,
        sourceText,
        userInput,
        chapters,
        activeChapterId: activeChapter?.id || activeChapterId,
        references,
        activeReferenceId: activeReference?.id || activeReferenceId,
        feedbackItems,
        activeFeedbackId: activeFeedback?.id || activeFeedbackId,
        checkItems,
        activeCheckId: activeCheck?.id || activeCheckId,
      });
      setState(nextState);
      setChapters(nextState.chapters || []);
      setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
      showToast('当前结果已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存结果失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function importSource() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导入并解析论文材料');
    try {
      setSaving(true);
      const result = await window.yibiao.thesisTutor.importSource();
      setState(result.state);
      setSourceText(result.state.sourceText || result.markdown || '');
      if (result.success) {
        finishOperationProgress(requestId, result.message || '论文材料已导入');
        showToast(result.message || '论文材料已导入', 'success');
      } else if (result.message !== '已取消选择') {
        finishOperationProgress(requestId, result.message || '导入论文材料失败', 'error');
        showToast(result.message || '导入论文材料失败', 'info');
      } else {
        finishOperationProgress(requestId, '已取消导入', 'canceled');
      }
    } catch (error) {
      finishOperationProgress(requestId, error instanceof Error ? error.message : '导入论文材料失败', 'error');
      showToast(error instanceof Error ? error.message : '导入论文材料失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function buildWordExportOutline() {
    const outline = [
      {
        id: 'thesis-profile',
        title: '论文档案与本次任务',
        description: '导出时带入的论文基础档案、本次需求和材料摘要。',
        content: buildProfileExportMarkdown(profile, activePanel, userInput, sourceText),
      },
      {
        id: `thesis-result-${activePanel}`,
        title: panel.resultTitle,
        description: panel.resultHelp,
        content: result,
      },
    ];

    const completedResultSummary = completedPanels
      .filter((item) => item !== activePanel)
      .map((item) => {
        const itemResult = panelResults[item];
        return itemResult?.content
          ? `**${panelCopy[item].label}**：${truncateExportText(itemResult.content, 900)}`
          : '';
      })
      .filter(Boolean);
    if (completedResultSummary.length) {
      outline.push({
        id: 'thesis-workflow-results',
        title: '已沉淀阶段成果',
        description: '来自其他论文导师模块的阶段成果摘要。',
        content: toMarkdownList(completedResultSummary),
      });
    }

    const chapterMarkdown = buildChapterExportMarkdown(chapters, activeChapter?.id || activeChapterId);
    if (chapterMarkdown && ['writing', 'review', 'format'].includes(activePanel)) {
      outline.push({
        id: 'thesis-chapter-workspace',
        title: '章节工作区',
        description: '当前论文目录、章节目标、章节材料和已保存草稿。',
        content: chapterMarkdown,
      });
    }

    const referenceMarkdown = buildReferenceExportMarkdown(references);
    if (referenceMarkdown && referenceEnabledPanels.has(activePanel)) {
      outline.push({
        id: 'thesis-reference-workspace',
        title: '文献与证据链',
        description: '导出当前工作区中已整理的真实文献、政策、案例、数据或原文摘录。',
        content: referenceMarkdown,
      });
    }

    const feedbackMarkdown = buildFeedbackExportMarkdown(feedbackItems);
    if (feedbackMarkdown && feedbackEnabledPanels.has(activePanel)) {
      outline.push({
        id: 'thesis-feedback-workspace',
        title: '导师反馈闭环',
        description: '导出导师意见、处理方案、优先级和修改记录。',
        content: feedbackMarkdown,
      });
    }

    const checkMarkdown = buildCheckExportMarkdown(checkItems);
    if (checkMarkdown && activePanel === 'format') {
      outline.push({
        id: 'thesis-check-workspace',
        title: '格式与查重检查清单',
        description: '导出格式、引用、重复表达、AI 味和逻辑检查项。',
        content: checkMarkdown,
      });
    }

    return outline;
  }

  async function exportWord() {
    if (!result.trim()) {
      showToast('请先生成或填写结果内容', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未注入导出服务', 'error');
      return;
    }

    const requestId = `thesis-tutor-${Date.now()}`;
    const title = profile.title ? `${profile.title}-${panel.label}` : `论文导师-${panel.label}`;
    try {
      setExportProgress({
        requestId,
        phase: 'running',
        progress: 1,
        message: '正在准备导出 Word',
      });
      const exportResult = await window.yibiao.export.exportWord({
        requestId,
        project_name: title,
        document_profile: 'official-document',
        outline: buildWordExportOutline(),
      });
      if (exportResult.canceled) {
        setExportProgress({
          requestId,
          phase: 'canceled',
          progress: 0,
          message: '已取消导出',
        });
        return;
      }
      if (exportResult.success) {
        showToast(exportResult.message || '论文导师结果已导出 Word', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出 Word 失败', 'error');
      setExportProgress({
        requestId,
        phase: 'error',
        progress: 100,
        message: error instanceof Error ? error.message : '导出 Word 失败',
      });
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      showToast('论文导师结果已复制', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  }

  async function exportWorkspace() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导出论文导师备份');
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.exportWorkspace();
      if (payload.success) {
        finishOperationProgress(requestId, payload.message || '论文导师工作区备份已导出');
        showToast(payload.message || '论文导师工作区备份已导出', 'success');
      } else if (!payload.canceled) {
        finishOperationProgress(requestId, payload.message || '导出论文导师工作区失败', 'error');
        showToast(payload.message || '导出论文导师工作区失败', 'info');
      } else {
        finishOperationProgress(requestId, '已取消导出备份', 'canceled');
      }
    } catch (error) {
      finishOperationProgress(requestId, error instanceof Error ? error.message : '导出论文导师工作区失败', 'error');
      showToast(error instanceof Error ? error.message : '导出论文导师工作区失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function exportProjectPackage() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导出论文导师项目包');
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.exportProjectPackage();
      if (payload.success) {
        finishOperationProgress(requestId, payload.message || '论文导师项目包已导出');
        showToast(payload.message || '论文导师项目包已导出', 'success');
      } else if (!payload.canceled) {
        finishOperationProgress(requestId, payload.message || '导出论文导师项目包失败', 'error');
        showToast(payload.message || '导出论文导师项目包失败', 'info');
      } else {
        finishOperationProgress(requestId, '已取消导出项目包', 'canceled');
      }
    } catch (error) {
      finishOperationProgress(requestId, error instanceof Error ? error.message : '导出论文导师项目包失败', 'error');
      showToast(error instanceof Error ? error.message : '导出论文导师项目包失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function importWorkspace() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导入论文导师备份或项目包');
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.importWorkspace();
      if (payload.success) {
        applyWorkspaceState(payload.state);
        finishOperationProgress(requestId, payload.message || '论文导师工作区已导入');
        showToast(payload.message || '论文导师工作区已导入', 'success');
      } else if (!payload.canceled) {
        finishOperationProgress(requestId, payload.message || '导入论文导师工作区失败', 'error');
        showToast(payload.message || '导入论文导师工作区失败', 'error');
      } else {
        finishOperationProgress(requestId, '已取消导入备份', 'canceled');
      }
    } catch (error) {
      finishOperationProgress(requestId, error instanceof Error ? error.message : '导入论文导师工作区失败', 'error');
      showToast(error instanceof Error ? error.message : '导入论文导师工作区失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function restoreHistoryItem(item: ThesisTutorHistoryItem) {
    setDraft(item.content);
    setActivePanel(item.panel);
    setUserInput(item.input || '');
    onNavigate?.(panelCopy[item.panel].section);
    showToast('已恢复历史版本到结果区，可继续编辑或导出', 'success');
  }

  async function saveHistoryList(nextHistory: ThesisTutorHistoryItem[], successMessage?: string) {
    setState((current) => (current ? { ...current, history: nextHistory } : current));
    if (!window.yibiao?.thesisTutor) return;
    try {
      const nextState = await window.yibiao.thesisTutor.saveHistory({ history: nextHistory });
      setState(nextState);
      if (successMessage) showToast(successMessage, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存历史记录失败', 'error');
    }
  }

  function updateHistoryItem(itemId: string, patch: Partial<ThesisTutorHistoryItem>, successMessage?: string) {
    const currentHistory = state?.history || [];
    const nextHistory = currentHistory.map((item) => (
      item.id === itemId ? { ...item, ...patch } : item
    ));
    void saveHistoryList(nextHistory, successMessage);
  }

  function renameHistoryItem(item: ThesisTutorHistoryItem, title: string) {
    const nextTitle = title.trim();
    const currentTitle = item.customTitle || item.title;
    if (!nextTitle || nextTitle === currentTitle) return;
    updateHistoryItem(item.id, { customTitle: nextTitle }, '历史版本名称已保存');
  }

  function toggleHistoryImportant(item: ThesisTutorHistoryItem) {
    updateHistoryItem(
      item.id,
      { important: !item.important },
      item.important ? '已取消重要标记' : '已标记为重要版本',
    );
  }

  function removeHistoryItem(item: ThesisTutorHistoryItem) {
    const nextHistory = (state?.history || []).filter((historyItem) => historyItem.id !== item.id);
    void saveHistoryList(nextHistory, '历史记录已删除');
  }

  async function clearAll() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.clear();
      setState(payload.state);
      setProfile({ ...defaultProfile, ...payload.state.profile });
      setSourceText('');
      setDraft('');
      setUserInput('');
      setChapters([]);
      setActiveChapterId('');
      setReferences([]);
      setActiveReferenceId('');
      setFeedbackItems([]);
      setActiveFeedbackId('');
      setCheckItems([]);
      setActiveCheckId('');
      showToast('论文导师工作区已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="thesis-tutor-page"><div className="thesis-tutor-panel">正在加载论文导师...</div></div>;
  }

  return (
    <div className="thesis-tutor-page" ref={mainScrollRef} onWheelCapture={handleMainWheelCapture}>
      <header className="thesis-tutor-header">
        <div>
          <div className="thesis-tutor-title-row">
            <span className="thesis-tutor-kicker">论文导师 · {panel.label}</span>
            {noticeDialog}
          </div>
          <h2>{panel.title}</h2>
          <p>{panel.description}</p>
        </div>
        <div className="thesis-tutor-actions">
          <button type="button" className="secondary-action" onClick={exportProjectPackage} disabled={saving || isRunning}>导出项目包</button>
          <button type="button" className="secondary-action" onClick={exportWorkspace} disabled={saving || isRunning}>导出备份</button>
          <button type="button" className="secondary-action" onClick={importWorkspace} disabled={saving || isRunning}>导入备份/项目包</button>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button type="button" className="secondary-action is-danger" disabled={saving || isRunning}>清空</button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="content-regenerate-modal" />
              <Dialog.Content className="thesis-tutor-help-card thesis-tutor-clear-card">
                <div className="thesis-tutor-help-head">
                  <div>
                    <Dialog.Title>清空论文导师工作区？</Dialog.Title>
                    <Dialog.Description>
                      清空会移除论文档案、阶段成果、章节工作区、文献证据、导师反馈、格式检查清单和历史记录。建议先导出备份，再继续清空。
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="detail-help-close" type="button" aria-label="关闭清空确认">×</Dialog.Close>
                </div>
                <div className="thesis-tutor-help-tip">
                  导出的备份可以在之后通过“导入备份”恢复，用于换电脑、回滚误改或保留不同论文版本。
                </div>
                <div className="thesis-tutor-help-actions">
                  <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
                  <Dialog.Close asChild>
                    <button type="button" className="secondary-action" onClick={exportWorkspace}>先导出备份</button>
                  </Dialog.Close>
                  <Dialog.Close asChild>
                    <button type="button" className="secondary-action is-danger" onClick={clearAll}>仍然清空</button>
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>

      {missingTextModelFields.length > 0 && (
        <section className="thesis-tutor-config-notice">
          <div>
            <strong>文本模型尚未配置完整</strong>
            <span>请先到“设置 - 文本模型”完善{missingTextModelFields.join('、')}，否则无法生成论文导师回复。</span>
          </div>
          <button type="button" className="secondary-action" onClick={() => onNavigate?.('settings')}>去设置</button>
        </section>
      )}

      <section className="thesis-tutor-help-strip">
        <div>
          <strong>第一次使用论文导师？</strong>
          <span>先在启动诊断建立论文档案；后续模块会显示摘要并自动带入上下文。</span>
        </div>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button type="button" className="secondary-action">如何使用？</button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="content-regenerate-modal" />
            <Dialog.Content className="thesis-tutor-help-card">
              <div className="thesis-tutor-help-head">
                <div>
                  <Dialog.Title>论文导师使用方法</Dialog.Title>
                  <Dialog.Description>
                    论文导师是一个论文全过程工作台：先建档和诊断，再按模块推进选题、综述、研究设计、数据实证、图表模型、成稿、修改和检查。
                  </Dialog.Description>
                </div>
                <Dialog.Close className="detail-help-close" type="button" aria-label="关闭论文导师使用方法">×</Dialog.Close>
              </div>
              <div className="thesis-tutor-help-flow">
                <strong>推荐使用顺序</strong>
                <div>
                  {panelOrder.map((item) => (
                    <span key={item}>{panelCopy[item].label}</span>
                  ))}
                </div>
              </div>
              <div className="thesis-tutor-help-steps">
                {thesisTutorUsageSteps.map((item, index) => (
                  <article key={item.title}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="thesis-tutor-help-modules">
                <strong>各模块主要做什么</strong>
                <div>
                  {thesisTutorFlowModules.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="thesis-tutor-help-lock">
                <strong>关于论文档案和锁定</strong>
                <p>论文档案是全流程上下文，不是每个模块都要重复填写的表单。完整档案默认放在启动诊断里维护；其它模块只显示摘要，生成时仍会自动带入。需要修改题目、阶段或引用格式时，再展开编辑或回到启动诊断。</p>
              </div>
              <div className="thesis-tutor-help-tip">
                小建议：如果结果太泛，通常不是模块选错，而是“本次需求”和“材料区”太少。把导师要求、文献摘要、数据说明或真实草稿贴进去；需要长期复用的内容，再沉淀到证据链、章节、反馈或检查清单。
              </div>
              <div className="thesis-tutor-help-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </section>

      {isFirstRun && (
        <section className="thesis-tutor-onboarding">
          <div>
            <strong>从这里开始论文导师</strong>
            <span>先确定阶段和卡点，再把导师要求、培养方案或已有材料导入进来。系统会把后续结果沉淀成论文档案、证据链、章节和检查清单。</span>
          </div>
          <div className="thesis-tutor-empty-actions">
            <button type="button" className="secondary-action" onClick={startDiagnosisTemplate} disabled={saving || isRunning}>填入诊断模板</button>
            <button type="button" className="secondary-action" onClick={importSource} disabled={saving || isRunning}>导入导师要求</button>
            <button type="button" className="primary-action" onClick={generate} disabled={saving || isRunning}>先生成诊断</button>
          </div>
        </section>
      )}

      {profilePanel}

      <nav className="thesis-tutor-tabs" aria-label="论文导师二级模块">
        {panelOrder.map((item) => (
          <button
            type="button"
            key={item}
            className={item === activePanel ? 'is-active' : ''}
            onClick={() => switchPanel(item)}
          >
            {panelCopy[item].label}
          </button>
        ))}
      </nav>

      <main className="thesis-tutor-layout">
        <section className="thesis-tutor-main">
          {showCheckWorkspace && (
            <div className="thesis-tutor-panel thesis-tutor-check-panel">
              <div className="thesis-tutor-panel-head">
                <div>
                  <strong>格式与查重检查清单</strong>
                  <span>把格式、引用、重复表达、AI 味和逻辑问题拆成可勾选事项，生成时会作为检查依据带入。</span>
                </div>
                <div className="thesis-tutor-chapter-actions">
                  <button type="button" className="secondary-action" onClick={createDefaultCheckItems} disabled={saving || isRunning}>生成终稿审查清单</button>
                  <button type="button" className="secondary-action" onClick={addCheckItem} disabled={saving || isRunning}>新增检查项</button>
                  <button type="button" className="secondary-action" onClick={fillCheckFromSource} disabled={saving || isRunning || !sourceText.trim()}>用材料区填问题</button>
                  <button type="button" className="secondary-action is-danger" onClick={removeActiveCheck} disabled={saving || isRunning || !activeCheck}>删除当前</button>
                  <button type="button" className="primary-action" onClick={saveCheckWorkspace} disabled={saving || isRunning || !checkItems.length}>保存清单</button>
                </div>
              </div>
              <div className={`thesis-tutor-drafting-preflight thesis-tutor-final-review-gate is-${finalReviewGate.tone}`}>
                <div className="thesis-tutor-drafting-preflight-head">
                  <div>
                    <strong>终稿质量门</strong>
                    <span>{finalReviewGate.summary}</span>
                  </div>
                  <div className="thesis-tutor-drafting-score">
                    <b>{finalReviewGate.score}%</b>
                    <span>{finalReviewGate.label}</span>
                  </div>
                </div>
                <div className="thesis-tutor-drafting-checks">
                  {finalReviewGate.items.map((item) => (
                    <div key={item.label} className={`is-${item.status}`}>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
              {checkItems.length ? (
                <>
                  <div className="thesis-tutor-feedback-summary thesis-tutor-check-summary">
                    <span>未检查：{checkItems.filter((item) => item.status === 'unchecked').length}</span>
                    <span>发现问题：{checkItems.filter((item) => item.status === 'issue_found').length}</span>
                    <span>已修正：{checkItems.filter((item) => item.status === 'fixed').length}</span>
                  </div>
                  <div className="thesis-tutor-check-toolbar">
                    <label>
                      <span>当前检查项</span>
                      <select value={activeCheck?.id || ''} onChange={(event) => setActiveCheckId(event.target.value)} disabled={isRunning}>
                        {checkItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>分类</span>
                      <select
                        value={activeCheck?.category || 'format'}
                        onChange={(event) => updateActiveCheck({ category: event.target.value as ThesisTutorCheckCategory })}
                        disabled={!activeCheck || isRunning}
                      >
                        {checkCategoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>严重级别</span>
                      <select
                        value={activeCheck?.severity || 'medium'}
                        onChange={(event) => updateActiveCheck({ severity: event.target.value as ThesisTutorCheckSeverity })}
                        disabled={!activeCheck || isRunning}
                      >
                        {checkSeverityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>状态</span>
                      <select
                        value={activeCheck?.status || 'unchecked'}
                        onChange={(event) => updateActiveCheck({ status: event.target.value as ThesisTutorCheckStatus })}
                        disabled={!activeCheck || isRunning}
                      >
                        {checkStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeCheck && (
                    <div className="thesis-tutor-check-grid">
                      <label>
                        <span>检查项标题</span>
                        <input
                          value={activeCheck.title}
                          onChange={(event) => updateActiveCheck({ title: event.target.value })}
                          placeholder="如 参考文献格式不统一"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>位置</span>
                        <input
                          value={activeCheck.location}
                          onChange={(event) => updateActiveCheck({ location: event.target.value })}
                          placeholder="如 第二章 2.1，参考文献列表，第 12 页"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>问题描述</span>
                        <textarea
                          value={activeCheck.issue}
                          onChange={(event) => updateActiveCheck({ issue: event.target.value })}
                          placeholder="记录格式、引用、重复表达、AI 味或逻辑问题。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>修改建议</span>
                        <textarea
                          value={activeCheck.suggestion}
                          onChange={(event) => updateActiveCheck({ suggestion: event.target.value })}
                          placeholder="写清应该如何修改，或生成后由论文导师补充建议。"
                          disabled={isRunning}
                        />
                      </label>
                      <label className="is-wide">
                        <span>修改记录</span>
                        <textarea
                          value={activeCheck.revisionNotes}
                          onChange={(event) => updateActiveCheck({ revisionNotes: event.target.value })}
                          placeholder="记录已修正内容、暂不处理原因、或下一轮复查说明。"
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                  )}
                  <div className="thesis-tutor-chapter-note">
                    这份清单用于辅助检查，不提供规避查重或 AI 检测的方法。建议把“发现问题”的条目处理完，再导出或提交给导师。
                  </div>
                </>
              ) : (
                <div className="thesis-tutor-chapter-empty">
                  <p>还没有检查项。可以先生成终稿审查清单，也可以根据学校模板、查重报告或导师意见新增单项检查。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="secondary-action" onClick={createDefaultCheckItems} disabled={saving || isRunning}>生成终稿审查清单</button>
                    <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>从材料区拆检查项</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showReferenceWorkspace && (
            <div className="thesis-tutor-panel thesis-tutor-reference-panel">
              <div className="thesis-tutor-panel-head">
                <div>
                  <strong>文献与证据链</strong>
                  <span>把真实文献、政策、案例、数据或原文摘录整理成条目；生成时会作为可引用依据带入。</span>
                </div>
                <div className="thesis-tutor-chapter-actions">
                  <button type="button" className="secondary-action" onClick={addReference} disabled={saving || isRunning}>新增证据</button>
                  <button type="button" className="secondary-action" onClick={fillReferenceFromSource} disabled={saving || isRunning || !sourceText.trim()}>用材料区填摘要</button>
                  <button type="button" className="secondary-action is-danger" onClick={removeActiveReference} disabled={saving || isRunning || !activeReference}>删除当前</button>
                  <button type="button" className="primary-action" onClick={saveReferenceWorkspace} disabled={saving || isRunning || !references.length}>保存证据链</button>
                </div>
              </div>
              {references.length ? (
                <>
                  <div className="thesis-tutor-reference-verification-summary">
                    <span>已核验：{references.filter((reference) => reference.verificationStatus === 'verified').length}</span>
                    <span>待核验：{references.filter((reference) => reference.verificationStatus === 'unverified').length}</span>
                    <span>信息不完整：{references.filter((reference) => reference.verificationStatus === 'partial').length}</span>
                    <span>慎用：{references.filter((reference) => reference.verificationStatus === 'invalid').length}</span>
                  </div>
                  <div className="thesis-tutor-reference-toolbar">
                    <label>
                      <span>当前证据</span>
                      <select value={activeReference?.id || ''} onChange={(event) => setActiveReferenceId(event.target.value)} disabled={isRunning}>
                        {references.map((reference) => (
                          <option key={reference.id} value={reference.id}>{reference.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>类型</span>
                      <select
                        value={activeReference?.type || 'literature'}
                        onChange={(event) => updateActiveReference({ type: event.target.value as ThesisTutorReferenceType })}
                        disabled={!activeReference || isRunning}
                      >
                        {referenceTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>核验状态</span>
                      <select
                        value={activeReference?.verificationStatus || 'unverified'}
                        onChange={(event) => updateActiveReference({ verificationStatus: event.target.value as ThesisTutorReferenceVerificationStatus })}
                        disabled={!activeReference || isRunning}
                      >
                        {referenceVerificationOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeReference && (
                    <div className="thesis-tutor-reference-grid">
                      <label className="is-wide">
                        <span>题名/证据名称</span>
                        <input
                          value={activeReference.title}
                          onChange={(event) => updateActiveReference({ title: event.target.value })}
                          placeholder="如论文标题、政策名称、案例名称、数据表名称"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>作者/机构</span>
                        <input
                          value={activeReference.authors}
                          onChange={(event) => updateActiveReference({ authors: event.target.value })}
                          placeholder="如作者、课题组、发布机构"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>年份</span>
                        <input
                          value={activeReference.year}
                          onChange={(event) => updateActiveReference({ year: event.target.value })}
                          placeholder="如 2024"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>来源</span>
                        <input
                          value={activeReference.source}
                          onChange={(event) => updateActiveReference({ source: event.target.value })}
                          placeholder="如期刊、数据库、政府网站、案例公司"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>关键词</span>
                        <input
                          value={activeReference.keywords}
                          onChange={(event) => updateActiveReference({ keywords: event.target.value })}
                          placeholder="用逗号分隔"
                          disabled={isRunning}
                        />
                      </label>
                      <label className="is-wide">
                        <span>规范引用/出处</span>
                        <textarea
                          value={activeReference.citation}
                          onChange={(event) => updateActiveReference({ citation: event.target.value })}
                          placeholder="按学校要求或 GB/T 7714、APA 等格式整理；未整理也可以先贴原始题录。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>核验来源</span>
                        <textarea
                          value={activeReference.verificationSource}
                          onChange={(event) => updateActiveReference({ verificationSource: event.target.value })}
                          placeholder="如知网/万方/期刊官网/政府官网/DOI/原始文件路径。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>核验备注</span>
                        <textarea
                          value={activeReference.verificationNotes}
                          onChange={(event) => updateActiveReference({ verificationNotes: event.target.value })}
                          placeholder="记录缺失字段、核验结果、使用限制或为什么暂时不能作为正式引用。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>摘要/证据内容</span>
                        <textarea
                          value={activeReference.summary}
                          onChange={(event) => updateActiveReference({ summary: event.target.value })}
                          placeholder="粘贴摘要、政策条款、案例事实、数据说明或原文摘录。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>可用观点/写作用途</span>
                        <textarea
                          value={activeReference.keyPoints}
                          onChange={(event) => updateActiveReference({ keyPoints: event.target.value })}
                          placeholder="写清这条证据能支撑哪个观点、适合放在哪一章、使用时要注意什么。"
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                  )}
                  {activeReference && chapters.length > 0 && (
                    <div className="thesis-tutor-reference-chapters">
                      <strong>关联章节</strong>
                      <div>
                        {chapters.map((chapter) => (
                          <button
                            type="button"
                            key={chapter.id}
                            className={activeReference.relatedChapterIds.includes(chapter.id) ? 'is-active' : ''}
                            onClick={() => toggleReferenceChapter(chapter.id)}
                            disabled={isRunning}
                          >
                            {chapter.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="thesis-tutor-chapter-note">
                    提醒：证据链只保存你提供或整理过的真实依据。正文生成会优先使用这些条目，材料不足时会要求补充，不会自动编造引用。
                  </div>
                </>
              ) : (
                <div className="thesis-tutor-chapter-empty">
                  <p>还没有文献或证据条目。可以先新增证据，或把材料粘到下方材料区后结构化提取。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="secondary-action" onClick={addReference} disabled={saving || isRunning}>新增证据</button>
                    <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>从材料区拆证据</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showFeedbackWorkspace && (
            <div className="thesis-tutor-panel thesis-tutor-feedback-panel">
              <div className="thesis-tutor-panel-head">
                <div>
                  <strong>导师反馈闭环</strong>
                  <span>把导师意见拆成可追踪任务，关联章节并记录处理方案，后续写作和检查会自动带入。</span>
                </div>
                <div className="thesis-tutor-chapter-actions">
                  <button type="button" className="secondary-action" onClick={addFeedback} disabled={saving || isRunning}>新增反馈</button>
                  <button type="button" className="secondary-action" onClick={fillFeedbackFromSource} disabled={saving || isRunning || !sourceText.trim()}>用材料区填意见</button>
                  <button type="button" className="secondary-action is-danger" onClick={removeActiveFeedback} disabled={saving || isRunning || !activeFeedback}>删除当前</button>
                  <button type="button" className="primary-action" onClick={saveFeedbackWorkspace} disabled={saving || isRunning || !feedbackItems.length}>保存反馈</button>
                </div>
              </div>
              {feedbackItems.length ? (
                <>
                  <div className="thesis-tutor-feedback-summary">
                    <span>待处理：{feedbackItems.filter((item) => item.status === 'todo').length}</span>
                    <span>处理中：{feedbackItems.filter((item) => item.status === 'doing').length}</span>
                    <span>已完成：{feedbackItems.filter((item) => item.status === 'done').length}</span>
                  </div>
                  <div className="thesis-tutor-feedback-toolbar">
                    <label>
                      <span>当前反馈</span>
                      <select value={activeFeedback?.id || ''} onChange={(event) => setActiveFeedbackId(event.target.value)} disabled={isRunning}>
                        {feedbackItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>优先级</span>
                      <select
                        value={activeFeedback?.priority || 'medium'}
                        onChange={(event) => updateActiveFeedback({ priority: event.target.value as ThesisTutorFeedbackPriority })}
                        disabled={!activeFeedback || isRunning}
                      >
                        {feedbackPriorityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>状态</span>
                      <select
                        value={activeFeedback?.status || 'todo'}
                        onChange={(event) => updateActiveFeedback({ status: event.target.value as ThesisTutorFeedbackStatus })}
                        disabled={!activeFeedback || isRunning}
                      >
                        {feedbackStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeFeedback && (
                    <div className="thesis-tutor-feedback-grid">
                      <label>
                        <span>反馈标题</span>
                        <input
                          value={activeFeedback.title}
                          onChange={(event) => updateActiveFeedback({ title: event.target.value })}
                          placeholder="如 第二章理论框架不清晰"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>来源</span>
                        <input
                          value={activeFeedback.source}
                          onChange={(event) => updateActiveFeedback({ source: event.target.value })}
                          placeholder="如导师一审、预答辩、学院盲审"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>原始意见</span>
                        <textarea
                          value={activeFeedback.originalFeedback}
                          onChange={(event) => updateActiveFeedback({ originalFeedback: event.target.value })}
                          placeholder="粘贴导师原话、批注或评审意见。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>处理方案</span>
                        <textarea
                          value={activeFeedback.actionPlan}
                          onChange={(event) => updateActiveFeedback({ actionPlan: event.target.value })}
                          placeholder="写清准备怎么改：补文献、改结构、重写段落、补数据或调整表达。"
                          disabled={isRunning}
                        />
                      </label>
                      <label className="is-wide">
                        <span>修改记录</span>
                        <textarea
                          value={activeFeedback.revisionNotes}
                          onChange={(event) => updateActiveFeedback({ revisionNotes: event.target.value })}
                          placeholder="记录已完成的修改、仍需补充的材料、下一轮给导师看的说明。"
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                  )}
                  {activeFeedback && chapters.length > 0 && (
                    <div className="thesis-tutor-reference-chapters">
                      <strong>关联章节</strong>
                      <div>
                        {chapters.map((chapter) => (
                          <button
                            type="button"
                            key={chapter.id}
                            className={activeFeedback.relatedChapterIds.includes(chapter.id) ? 'is-active' : ''}
                            onClick={() => toggleFeedbackChapter(chapter.id)}
                            disabled={isRunning}
                          >
                            {chapter.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="thesis-tutor-chapter-note">
                    建议把每条反馈拆到可执行粒度。生成评审方案或逐章写作时，会优先处理“待处理”和“处理中”的高优先级任务。
                  </div>
                </>
              ) : (
                <div className="thesis-tutor-chapter-empty">
                  <p>还没有导师反馈任务。可以先新增反馈，或把导师批注粘到材料区后拆成待处理任务。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="secondary-action" onClick={addFeedback} disabled={saving || isRunning}>新增反馈</button>
                    <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>从材料区拆反馈</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(activePanel === 'drafting' || activePanel === 'writing') && (
            <div className="thesis-tutor-panel thesis-tutor-chapter-panel">
              <div className="thesis-tutor-panel-head">
                <div>
                  <strong>章节工作区</strong>
                  <span>{activePanel === 'drafting' ? '自动成稿会优先使用当前章节目标、材料和导师反馈，结果可回填为章节草稿。' : '逐章写作会优先参考当前章节的目标、材料、导师反馈和已保存草稿。'}</span>
                </div>
                <div className="thesis-tutor-chapter-actions">
                  <button type="button" className="secondary-action" onClick={createChaptersFromOutline} disabled={saving || isRunning}>从目录生成章节</button>
                  <button type="button" className="secondary-action" onClick={addChapter} disabled={saving || isRunning}>新增章节</button>
                  <button type="button" className="primary-action" onClick={saveChapterWorkspace} disabled={saving || isRunning || !chapters.length}>保存章节</button>
                </div>
              </div>
              {chapters.length ? (
                <>
                  <div className="thesis-tutor-chapter-toolbar">
                    <label>
                      <span>当前章节</span>
                      <select value={activeChapter?.id || ''} onChange={(event) => selectChapter(event.target.value)} disabled={isRunning}>
                        {chapters.map((chapter) => (
                          <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>章节状态</span>
                      <select
                        value={activeChapter?.status || 'not_started'}
                        onChange={(event) => updateActiveChapter({ status: event.target.value as ThesisTutorChapterStatus })}
                        disabled={!activeChapter || isRunning}
                      >
                        {chapterStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeChapter && (
                    <div className="thesis-tutor-chapter-grid">
                      <label>
                        <span>章节标题</span>
                        <input
                          value={activeChapter.title}
                          onChange={(event) => updateActiveChapter({ title: event.target.value })}
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>本章目标</span>
                        <textarea
                          value={activeChapter.goal}
                          onChange={(event) => updateActiveChapter({ goal: event.target.value })}
                          placeholder="如本章要解决的问题、目标字数、论证边界和写作口吻。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>本章材料</span>
                        <textarea
                          value={activeChapter.material}
                          onChange={(event) => updateActiveChapter({ material: event.target.value })}
                          placeholder="可放本章专用文献、案例、数据、访谈或已有段落摘要。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>导师反馈/修改要求</span>
                        <textarea
                          value={activeChapter.advisorFeedback}
                          onChange={(event) => updateActiveChapter({ advisorFeedback: event.target.value })}
                          placeholder="如导师批注、必须补充的论点、需要删除或重写的内容。"
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                  )}
                  <div className="thesis-tutor-chapter-note">
                    下方结果区保存后会回填为当前章节草稿；如果只是暂存目标、材料或导师反馈，请点击“保存章节”。
                  </div>
                </>
              ) : (
                <div className="thesis-tutor-chapter-empty">
                  <p>还没有章节。可以先在“论文档案 → 补充档案 → 论文目录或章节计划”填写目录，再从目录生成章节；也可以直接新增章节。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="secondary-action" onClick={createChaptersFromOutline} disabled={saving || isRunning}>从目录生成章节</button>
                    <button type="button" className="secondary-action" onClick={addChapter} disabled={saving || isRunning}>新增章节</button>
                    <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>材料放入章节</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="thesis-tutor-panel">
            <div className="thesis-tutor-panel-head">
              <div>
                <strong>{panel.inputTitle}</strong>
                <span>{panel.inputHelp}</span>
              </div>
              <button type="button" className="primary-action" onClick={generate} disabled={saving || isRunning}>
                {isRunning ? '生成中...' : nextActionLabel}
              </button>
            </div>
            {activePanel === 'charts' && (
              <div className="thesis-tutor-chart-templates">
                <div className="thesis-tutor-chart-templates-head">
                  <div>
                    <strong>内置图形模板</strong>
                    <span>可多选模板后一次性填入 Mermaid 初稿；你可以直接改节点，也可以继续让模型按论文档案优化。</span>
                  </div>
                  <div className="thesis-tutor-chart-template-actions">
                    <span>已选 {selectedChartTemplateIds.length} 个</span>
                    <button type="button" className="secondary-action" onClick={() => setSelectedChartTemplateIds([])} disabled={saving || isRunning || !selectedChartTemplateIds.length}>清空选择</button>
                    <button type="button" className="primary-action" onClick={applySelectedChartTemplates} disabled={saving || isRunning || !selectedChartTemplateIds.length}>应用已选模板</button>
                  </div>
                </div>
                <div className="thesis-tutor-chart-template-grid">
                  {chartTemplates.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      className={selectedChartTemplateIds.includes(template.id) ? 'is-selected' : ''}
                      onClick={() => toggleChartTemplate(template.id)}
                      disabled={saving || isRunning}
                      aria-pressed={selectedChartTemplateIds.includes(template.id)}
                    >
                      <strong>{template.title}</strong>
                      <span>{template.description}</span>
                      <em>{template.chartType}</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="thesis-tutor-generation-context">
              <strong>本次生成会带入上方论文档案</strong>
              <div>
                {profileContextItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
                <span>项目上下文：{priorResultCount ? `已带入 ${priorResultCount} 个阶段成果` : '暂无前序成果'}</span>
              </div>
            </div>
            {activePanel === 'drafting' && (
              <div className={`thesis-tutor-drafting-preflight is-${draftingPreflight.tone}`}>
                <div className="thesis-tutor-drafting-preflight-head">
                  <div>
                    <strong>自动成稿前置检查</strong>
                    <span>{draftingPreflight.summary}</span>
                  </div>
                  <div className="thesis-tutor-drafting-score">
                    <b>{draftingPreflight.score}%</b>
                    <span>{draftingPreflight.label}</span>
                  </div>
                </div>
                <div className="thesis-tutor-drafting-mode">
                  <strong>{draftingPreflight.mode}</strong>
                  <span>生成时会按材料完整度决定输出深度；缺失处会标注“需补充”或“待核验”。</span>
                </div>
                <div className="thesis-tutor-drafting-checks">
                  {draftingPreflight.items.map((item) => (
                    <div key={item.label} className={`is-${item.status}`}>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activePanel === 'data' && (
              <div className={`thesis-tutor-drafting-preflight is-${dataPreflight.tone}`}>
                <div className="thesis-tutor-drafting-preflight-head">
                  <div>
                    <strong>数据与实证预检</strong>
                    <span>{dataPreflight.summary}</span>
                  </div>
                  <div className="thesis-tutor-drafting-score">
                    <b>{dataPreflight.score}%</b>
                    <span>{dataPreflight.label}</span>
                  </div>
                </div>
                <div className="thesis-tutor-drafting-mode">
                  <strong>{dataPreflight.recommendation}</strong>
                  <span>生成时会区分真实数据、待核验数据和缺失数据；不会提前编造统计结论。</span>
                </div>
                <div className="thesis-tutor-drafting-checks">
                  {dataPreflight.items.map((item) => (
                    <div key={item.label} className={`is-${item.status}`}>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <textarea
              className="thesis-tutor-textarea"
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
              placeholder={panel.placeholder}
              disabled={isRunning}
            />
          </div>

          <div className="thesis-tutor-panel">
            <div className="thesis-tutor-panel-head">
              <div>
                <strong>{panel.materialTitle}</strong>
                <span>{panel.materialHelp}</span>
              </div>
              <div className="thesis-tutor-material-actions">
                <button type="button" className="secondary-action" onClick={importSource} disabled={saving || isRunning}>导入文件</button>
                <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>
                  {getMaterialExtractLabel()}
                </button>
              </div>
            </div>
            {state?.importedSourceFileName && (
              <div className="thesis-tutor-source-name">已导入：{state.importedSourceFileName}</div>
            )}
            <textarea
              className="thesis-tutor-source"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder={panel.sourcePlaceholder}
              disabled={isRunning}
            />
          </div>

          {task && (
            <div className={`thesis-tutor-task is-${task.status}`}>
              <div className="thesis-tutor-task-head">
                <span>{task.message}</span>
                <strong>{taskProgress}%</strong>
              </div>
              <div className="thesis-tutor-task-track" aria-hidden="true">
                <i style={{ width: `${taskProgress}%` }} />
              </div>
              {task.status === 'running' && (
                <p>进度为阶段估算；模型生成长文本时可能会停留片刻，完成后会自动写入下方结果区。</p>
              )}
            </div>
          )}

          {operationProgress && operationProgress.phase !== 'canceled' && (
            <div className={`thesis-tutor-task is-${operationProgress.phase}`}>
              <div className="thesis-tutor-task-head">
                <span>{operationProgress.message}</span>
                <strong>{operationProgress.progress}%</strong>
              </div>
              <div className="thesis-tutor-task-track" aria-hidden="true">
                <i style={{ width: `${operationProgress.progress}%` }} />
              </div>
              {operationProgress.phase === 'running' && (
                <p>正在处理本地文件或工作区数据，进度会按预计耗时持续推进。</p>
              )}
            </div>
          )}

          <div className="thesis-tutor-panel thesis-tutor-result-panel">
            <div className="thesis-tutor-panel-head thesis-tutor-result-head">
              <div>
                <strong>{panel.resultTitle}</strong>
                <span>{panel.resultHelp}</span>
              </div>
              <div className="thesis-tutor-actions thesis-tutor-result-actions">
                <button type="button" className="secondary-action" onClick={copyResult} disabled={!result}>复制</button>
                <button type="button" className="secondary-action" onClick={saveDraft} disabled={saving || isRunning}>保存结果</button>
                <button type="button" className="primary-action" onClick={exportWord} disabled={saving || isRunning || !result}>导出 Word</button>
              </div>
            </div>
            {exportProgress && exportProgress.phase !== 'canceled' && (
              <div className={`thesis-tutor-export-status is-${exportProgress.phase}`}>
                <div className="thesis-tutor-task-head">
                  <span>{exportProgress.message}</span>
                  <strong>{exportProgress.progress}%</strong>
                </div>
                <div className="thesis-tutor-task-track" aria-hidden="true">
                  <i style={{ width: `${Math.max(0, Math.min(100, exportProgress.progress))}%` }} />
                </div>
              </div>
            )}
            {result.trim() && (
              <div className="thesis-tutor-flow-actions">
                <div>
                  <strong>下一步流转</strong>
                  <span>把当前结果继续带入后续模块，或沉淀为论文项目上下文。</span>
                </div>
                <div>
                  {nextPanel && (
                    <button type="button" className="secondary-action" onClick={carryResultToNextPanel} disabled={saving || isRunning}>
                      带入{panelCopy[nextPanel].label}
                    </button>
                  )}
                  {activePanel === 'topic' && (
                    <button type="button" className="secondary-action" onClick={settleTopicToProfile} disabled={saving || isRunning}>
                      沉淀到论文档案
                    </button>
                  )}
                  {activePanel === 'literature' && (
                    <button type="button" className="secondary-action" onClick={settleResultToReferences} disabled={saving || isRunning}>
                      沉淀到证据链
                    </button>
                  )}
                  {activePanel === 'drafting' && (
                    <button type="button" className="secondary-action" onClick={saveDraft} disabled={saving || isRunning || !result.trim()}>
                      保存为章节草稿
                    </button>
                  )}
                  {activePanel === 'review' && (
                    <button type="button" className="secondary-action" onClick={settleResultToFeedback} disabled={saving || isRunning}>
                      转为反馈任务
                    </button>
                  )}
                  {activePanel === 'format' && (
                    <button type="button" className="secondary-action" onClick={settleResultToChecks} disabled={saving || isRunning}>
                      加入检查清单
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className={`thesis-tutor-result-body ${result ? 'has-result' : 'is-empty'}`}>
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                placeholder={`${panel.resultPlaceholder}\n\n也可以直接输入或粘贴内容；建议先补充“${panel.inputTitle}”和“${panel.materialTitle}”，再点击“${nextActionLabel}”。`}
                disabled={isRunning}
              />
              {result ? (
                <div className="thesis-tutor-preview">
                  <MarkdownRenderer allowRawHtml={false}>{result}</MarkdownRenderer>
                </div>
              ) : (
                <div className="thesis-tutor-result-hint">
                  <p>当前为空，生成或手动输入后可保存、复制和导出 Word。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="primary-action" onClick={generate} disabled={saving || isRunning}>{nextActionLabel}</button>
                    <button type="button" className="secondary-action" onClick={importSource} disabled={saving || isRunning}>导入材料</button>
                    {activePanel !== 'diagnosis' && (
                      <button type="button" className="secondary-action" onClick={startDiagnosisTemplate} disabled={saving || isRunning}>先做诊断</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="thesis-tutor-side">
          <section className="thesis-tutor-panel thesis-tutor-overview-panel">
            <div className="thesis-tutor-panel-head">
              <div>
                <strong>论文导师项目总览</strong>
                <span>{overviewHealthLabel}，关键上下文会随生成自动带入。</span>
              </div>
            </div>
            <div className="thesis-tutor-overview-score">
              <div>
                <strong>{profileCompletion}%</strong>
                <span>档案完整度</span>
              </div>
              <div>
                <strong>{completedPanels.length}/7</strong>
                <span>阶段成果</span>
              </div>
            </div>
            <div className="thesis-tutor-overview-grid">
              <button type="button" onClick={() => onNavigate?.('thesis-diagnosis')}>
                <strong>{profile.title.trim() ? '已定题' : '未定题'}</strong>
                <span>{profile.title.trim() || profile.direction.trim() || '先补方向和题目'}</span>
              </button>
              <button type="button" onClick={() => switchPanel('writing')}>
                <strong>{chapters.length ? `${chapterDoneCount}/${chapters.length}` : '未建章节'}</strong>
                <span>{chapters.length ? `${chapterActiveCount} 个章节推进中` : '从目录生成章节'}</span>
              </button>
              <button type="button" onClick={() => switchPanel('literature')}>
                <strong>{references.length}</strong>
                <span>文献与证据条目</span>
              </button>
              <button type="button" onClick={() => switchPanel('review')}>
                <strong>{openFeedbackCount}</strong>
                <span>{highPriorityFeedbackCount ? `${highPriorityFeedbackCount} 个高优先级` : '待处理反馈'}</span>
              </button>
              <button type="button" onClick={() => switchPanel('format')}>
                <strong>{openCheckCount}</strong>
                <span>{severeCheckCount ? `${severeCheckCount} 个高严重级别` : '待处理检查项'}</span>
              </button>
              <button type="button" onClick={() => switchPanel('topic')}>
                <strong>{profile.stage}</strong>
                <span>{profile.discipline.trim() || '专业未填写'}</span>
              </button>
            </div>
            <div className="thesis-tutor-overview-next">
              <strong>建议下一步</strong>
              <span>
                {profileCompletion < 60
                  ? '先补全论文档案和补充档案。'
                  : !chapters.length
                    ? '从目录计划生成章节工作区。'
                    : openFeedbackCount
                      ? '优先处理导师反馈闭环中的待办。'
                      : openCheckCount
                        ? '完成格式与查重检查清单。'
                        : '继续沉淀阶段成果并导出需要的 Word。'}
              </span>
            </div>
          </section>

          <section className="thesis-tutor-panel thesis-tutor-workflow-panel">
            <div className="thesis-tutor-panel-head">
              <div>
                <strong>论文项目进度</strong>
                <span>每次生成或保存结果后，会沉淀为后续模块的项目上下文。</span>
              </div>
            </div>
            <div className="thesis-tutor-workflow-summary">
              <strong>{completedPanels.length}/7</strong>
              <span>已沉淀阶段成果</span>
            </div>
            <div className="thesis-tutor-workflow-list">
              {panelOrder.map((item, index) => {
                const itemResult = panelResults[item];
                const isDone = Boolean(itemResult?.content);
                const isCurrent = item === activePanel;
                return (
                  <button
                    type="button"
                    key={item}
                    className={`${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => switchPanel(item)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{panelCopy[item].label}</strong>
                      <em>{isDone ? `已保存 · ${new Date(itemResult?.updated_at || '').toLocaleDateString('zh-CN')}` : isCurrent ? '当前模块' : '待推进'}</em>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="thesis-tutor-panel thesis-tutor-history">
            <div className="thesis-tutor-panel-head">
              <div>
                <strong>历史记录</strong>
                <span>最近 30 次生成会保存在本机，可恢复到结果区继续编辑。</span>
              </div>
            </div>
            {state?.history?.length ? (
              <>
                <div className="thesis-tutor-history-filters">
                  <label>
                    <span>模块</span>
                    <select value={historyPanelFilter} onChange={(event) => setHistoryPanelFilter(event.target.value as ThesisTutorPanel | 'all')}>
                      <option value="all">全部模块</option>
                      {panelOrder.map((item) => (
                        <option key={item} value={item}>{panelCopy[item].label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={historyImportantOnly ? 'is-active' : ''}
                    onClick={() => setHistoryImportantOnly((value) => !value)}
                  >
                    只看重要
                  </button>
                </div>
                {filteredHistory.length ? (
              <div className="thesis-tutor-history-list">
                {filteredHistory.map((item) => (
                  <article key={item.id} className={item.important ? 'is-important' : ''}>
                    <div className="thesis-tutor-history-meta">
                      <span>{item.important ? '重要版本' : item.panelLabel}</span>
                      <em>{new Date(item.created_at).toLocaleDateString('zh-CN')}</em>
                    </div>
                    <input
                      defaultValue={item.customTitle || item.title}
                      onBlur={(event) => renameHistoryItem(item, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                      }}
                      aria-label="历史版本名称"
                    />
                    <p>{item.input || item.panelLabel}</p>
                    <div className="thesis-tutor-history-actions">
                      <button type="button" onClick={() => restoreHistoryItem(item)}>恢复到结果区</button>
                      <button type="button" onClick={() => toggleHistoryImportant(item)}>
                        {item.important ? '取消重要' : '标记重要'}
                      </button>
                      <button type="button" className="is-danger" onClick={() => removeHistoryItem(item)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
                ) : (
                  <p className="thesis-tutor-empty">当前筛选条件下没有历史记录。</p>
                )}
              </>
            ) : (
              <p className="thesis-tutor-empty">还没有生成记录。</p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default ThesisTutorPage;
