import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type {
  ProjectManagementCommercialInput,
  ProjectManagementComplianceInput,
  ProjectManagementDeliveryInput,
  ProjectManagementDiscoveryInput,
  ProjectManagementExecutionInput,
  ProjectManagementPlanningInput,
  ProjectManagementProfile,
  ProjectManagementProjectRecord,
  ProjectManagementReportingInput,
  ProjectManagementRetrospectiveInput,
  ProjectManagementRiskInput,
  ProjectManagementStakeholderInput,
} from '../types';

export interface ProjectManagementModule {
  id: string;
  label: string;
  title: string;
  description: string;
  source: string;
  deliverables: string[];
  methods: string[];
  scenarios: string[];
  diagrams: string[];
  promptHint: string;
}

export type ProjectManagementExportProgress = WordExportProgressEvent & { moduleId: string };

export const projectManagementOpenWorkbenchKey = 'project-management-open-workbench';

export const moduleDocumentTitles: Record<string, string> = {
  planning: '项目启动与规划方案',
  discovery: '需求分析与 PRD 框架',
  execution: '排期与推进计划',
  risk: '风险与问题应对方案',
  stakeholder: '沟通与变更管理方案',
  delivery: '交付上线与验收方案',
  reporting: '项目汇报材料',
  commercial: '商务回款与续约跟进方案',
  retrospective: '项目复盘与沉淀报告',
  compliance: '合规本土化与上线准入方案',
};

export const builtInProjectTypes = [
  'IT服务项目',
  '小程序建设',
  '系统集成',
  'SaaS 实施',
  '数据看板',
  '企业微信集成',
  '支付/会员系统',
  '运维续约项目',
  '合规上线项目',
];

export const defaultProfile: ProjectManagementProfile = {
  projectName: '',
  clientName: '',
  vendorName: '',
  projectType: 'IT服务项目',
  projectGroup: '',
  currentStage: '项目启动',
  startDate: '',
  endDate: '',
  contractAmount: '',
  paymentTerms: '',
  teamRoles: '',
  keyConstraints: '',
};

export const defaultPlanningInput: ProjectManagementPlanningInput = {
  background: '',
  objectives: '',
  scope: '',
  knownRisks: '',
  extraRequirements: '',
};

export const defaultDiscoveryInput: ProjectManagementDiscoveryInput = {
  interviewNotes: '',
  userRoles: '',
  businessProcesses: '',
  featureRequests: '',
  acceptanceNotes: '',
  extraRequirements: '',
};

export const defaultExecutionInput: ProjectManagementExecutionInput = {
  workstreams: '',
  milestones: '',
  resources: '',
  dependencies: '',
  blockers: '',
  cadence: '',
  extraRequirements: '',
};

export const defaultRiskInput: ProjectManagementRiskInput = {
  riskSignals: '',
  currentIssues: '',
  stakeholderPressure: '',
  scheduleBudgetImpact: '',
  mitigationActions: '',
  escalationNeeds: '',
  extraRequirements: '',
};

export const defaultStakeholderInput: ProjectManagementStakeholderInput = {
  stakeholders: '',
  conflicts: '',
  changeRequests: '',
  meetingNotes: '',
  communicationHistory: '',
  decisionsNeeded: '',
  extraRequirements: '',
};

export const defaultDeliveryInput: ProjectManagementDeliveryInput = {
  testStatus: '',
  uatScope: '',
  releaseChecklist: '',
  acceptanceCriteria: '',
  trainingHandover: '',
  rollbackPlan: '',
  extraRequirements: '',
};

export const defaultReportingInput: ProjectManagementReportingInput = {
  reportPeriod: '',
  audience: '',
  completedWork: '',
  progressMetrics: '',
  risksIssues: '',
  nextPlan: '',
  extraRequirements: '',
};

export const defaultCommercialInput: ProjectManagementCommercialInput = {
  contractTerms: '',
  paymentMilestones: '',
  acceptanceTriggers: '',
  invoiceCollectionStatus: '',
  blockers: '',
  renewalUpsellOpportunities: '',
  extraRequirements: '',
};

export const defaultRetrospectiveInput: ProjectManagementRetrospectiveInput = {
  projectOutcome: '',
  goalsReview: '',
  keyEvents: '',
  problemsLessons: '',
  teamClientFeedback: '',
  reusableAssets: '',
  extraRequirements: '',
};

export const defaultComplianceInput: ProjectManagementComplianceInput = {
  systemScope: '',
  dataTypes: '',
  integrations: '',
  deploymentEnvironment: '',
  complianceStatus: '',
  securityRisks: '',
  extraRequirements: '',
};

export const modules: ProjectManagementModule[] = [
  {
    id: 'planning',
    label: '启动与规划',
    title: '从项目目标、范围和里程碑建立交付基线',
    description: '适合项目刚启动、合同刚签、需要把目标、范围、WBS、回款节点和关键里程碑统一成一张可执行计划时使用。',
    source: '高级 PM 的 WBS/OKR/RACI 方法 + 中国 IT 服务乙方 PM 主规划模块。',
    deliverables: ['项目章程', '目标设定表', 'WBS 分解', '范围说明', '里程碑计划', '回款节点表'],
    methods: ['OKR 目标拆解', 'WBS 3 级分解', 'RACI 职责矩阵', '关键路径识别', '阶段门控'],
    scenarios: ['新项目启动', '客户启动会前准备', '内部资源协调', '回款节点倒排'],
    diagrams: ['WBS 分解图', '项目甘特图', '里程碑时间线'],
    promptHint: '请基于项目背景、合同约束、交付周期和团队配置，生成项目启动与规划方案。',
  },
  {
    id: 'discovery',
    label: '需求与 PRD',
    title: '把访谈、需求和验收标准整理成可评审材料',
    description: '适合从客户口头需求、访谈纪要、旧系统材料中提炼需求边界，并生成 PRD、用户故事和验收标准。',
    source: '访谈、PRD、用户故事、接口规约与本土化需求确认模板。',
    deliverables: ['访谈提纲', '访谈纪要', '需求确认书', 'PRD', '用户故事', '验收标准'],
    methods: ['MoSCoW 优先级', 'RICE 排序', 'Given/When/Then', 'Definition of Ready', '需求冻结'],
    scenarios: ['需求调研', 'PRD 初稿', '客户需求确认', '开发前评审'],
    diagrams: ['业务流程图', '需求优先级矩阵', '用户旅程图'],
    promptHint: '请根据访谈材料和项目背景，整理需求清单、优先级、PRD 框架和待确认问题。',
  },
  {
    id: 'execution',
    label: '排期与推进',
    title: '把计划拆成节奏、责任人和可追踪的行动项',
    description: '适合项目进入执行期后，设计 Sprint、周计划、任务分配、阻塞处理和跨部门推进机制。',
    source: 'Scrum/Kanban、混合型项目计划、Sprint 模板和执行推进策略。',
    deliverables: ['Sprint 计划', '周级计划', '任务看板', '资源计划', '行动项清单', '推进策略'],
    methods: ['Scrum Sprint', 'Kanban WIP', '三点估算', '燃尽图', '每日站会'],
    scenarios: ['开发排期', '资源冲突', '进度落后', '跨部门推进'],
    diagrams: ['执行甘特图', '任务依赖图', 'Sprint 燃尽图'],
    promptHint: '请把当前项目目标拆成可执行任务、责任人、时间线、依赖关系和推进节奏。',
  },
  {
    id: 'risk',
    label: '风险问题',
    title: '提前识别风险，并在危机出现时给出止损路径',
    description: '适合延期、预算压缩、成员离职、需求蔓延、客户升级投诉等高风险场景。',
    source: '风险矩阵、危机应对、实战判断力和异常处理流程。',
    deliverables: ['风险登记册', 'Pre-mortem 报告', '问题升级单', '危机处理方案', '止损建议'],
    methods: ['概率-影响矩阵', 'P1-P4 分级', '三选一方案', '5Why 根因分析', '应急储备'],
    scenarios: ['项目延期', '客户威胁终止', '核心成员离职', '预算被砍', '上线故障'],
    diagrams: ['风险矩阵', '鱼骨分析图', '问题升级路径图'],
    promptHint: '请评估当前项目风险等级，列出风险矩阵、触发信号、应对措施和升级建议。',
  },
  {
    id: 'stakeholder',
    label: '沟通变更',
    title: '管理干系人预期，减少反复和隐性冲突',
    description: '适合客户、老板、商务、研发、测试、运维多方目标不一致，或需求变更频繁时使用。',
    source: '干系人心理学、向上管理、变更控制、会议纪要和沟通框架。',
    deliverables: ['干系人地图', '沟通计划', '会议纪要', '变更请求单', '决策留痕邮件'],
    methods: ['权力-影响力矩阵', 'SCQA 汇报', 'SBI 反馈', '冲突处理模型', '变更分级审批'],
    scenarios: ['客户意见不统一', '高层临时介入', '需求变更', '跨部门不配合'],
    diagrams: ['干系人矩阵', '变更流程图', '沟通升级路径图'],
    promptHint: '请基于干系人列表和当前冲突，设计沟通策略、会议议程、变更流程和留痕话术。',
  },
  {
    id: 'delivery',
    label: '交付上线',
    title: '围绕测试、验收、上线和交接完成最后一公里',
    description: '适合测试验证、UAT、上线准备、培训交接、验收报告和上线后稳定性跟踪。',
    source: '上线检查清单、里程碑报告、验收交付和运维交接模板。',
    deliverables: ['测试报告', 'UAT 清单', '上线检查表', '验收报告', '培训材料', '运维交接文档'],
    methods: ['Gate 检查点', '灰度发布', '回滚预案', 'SLA 响应', '交付物验收标准'],
    scenarios: ['上线前检查', '客户验收', '系统交接', '上线故障恢复'],
    diagrams: ['上线流程图', '验收路径图', '回滚流程图'],
    promptHint: '请根据当前交付状态，生成上线检查清单、验收条件、回滚预案和交接安排。',
  },
  {
    id: 'reporting',
    label: '汇报周月报',
    title: '面向不同对象输出项目状态、风险和下一步',
    description: '适合生成项目周报、月报、里程碑汇报、管理层简报和客户进度报告。',
    source: 'SCQA 汇报结构、多视角周报/月报和里程碑报告模板。',
    deliverables: ['项目周报', '项目月报', '里程碑报告', '管理层简报', '客户汇报材料'],
    methods: ['SCQA', '红黄绿状态', 'EVM/SPI/CPI', '风险预警', '下一步行动项'],
    scenarios: ['每周例会', '客户汇报', '老板追问', '阶段验收前汇报'],
    diagrams: ['红黄绿状态图', '进度趋势图', '下阶段路线图'],
    promptHint: '请根据进度、风险、完成事项和下周计划，生成面向客户/管理层的项目汇报。',
  },
  {
    id: 'commercial',
    label: '商务回款',
    title: '把交付目标、合同条款和回款节点联动起来',
    description: '适合乙方 IT 服务项目管理，跟踪报价、合同、付款条件、验收触发和续约机会。',
    source: '报价、合同、回款追踪、续约策略和中国 IT 服务场景模板。',
    deliverables: ['报价测算表', '合同要点清单', '回款追踪表', '续约计划', '增值方案'],
    methods: ['成本拆分', '付款节点倒排', '验收触发条件', '满意度调研', '续约提前量'],
    scenarios: ['报价评估', '合同评审', '回款延迟', '续约复购'],
    diagrams: ['回款时间线', '合同-交付-回款联动图', '逾期升级流程图'],
    promptHint: '请根据合同条款和交付进度，整理回款节点、风险预警、跟进动作和续约机会。',
  },
  {
    id: 'retrospective',
    label: '复盘沉淀',
    title: '把项目经验沉淀为可复用的案例、SOP 和知识库',
    description: '适合阶段结束、项目结项、危机处理后，把得失、流程改进和经验教训整理成组织资产。',
    source: '4L 复盘、项目总结模板、案例库、SOP 和文档版本管理流程。',
    deliverables: ['复盘报告', '项目总结', '经验教训库', '案例库', 'SOP', '文档归档清单'],
    methods: ['4L 复盘', 'Keep/Problem/Try', '5Why', '案例沉淀', '版本管理'],
    scenarios: ['阶段复盘', '项目结项', '危机后复盘', '团队方法沉淀'],
    diagrams: ['复盘鱼骨图', '4L 复盘结构图', 'SOP 改进流程图'],
    promptHint: '请基于项目过程、结果和问题，输出复盘报告、经验教训、SOP 改进和后续行动。',
  },
  {
    id: 'compliance',
    label: '合规本土化',
    title: '覆盖中国 IT 项目的备案、安全和生态集成约束',
    description: '适合小程序、企业微信、支付宝、数据安全、ICP备案、公安备案和等保相关项目。',
    source: '中国数据源、安全合规、企业微信集成和实战案例模块。',
    deliverables: ['合规检查清单', 'ICP备案清单', '数据安全清单', '等保准备清单', '企业微信集成清单'],
    methods: ['合规前置检查', '权限边界', '审计追溯', '数据流梳理', '上线准入'],
    scenarios: ['小程序上线', '企业微信集成', '数据安全评审', '等保准备'],
    diagrams: ['数据流图', '合规检查路径图', '上线准入流程图'],
    promptHint: '请根据系统形态和数据流，输出中国本土化合规检查清单和上线前风险项。',
  },
];

export const profileFields: Array<{ key: keyof ProjectManagementProfile; label: string; placeholder: string; wide?: boolean; multiline?: boolean }> = [
  { key: 'projectName', label: '项目名称', placeholder: '例如：XX品牌小程序建设项目' },
  { key: 'clientName', label: '甲方/客户', placeholder: '例如：XX集团' },
  { key: 'vendorName', label: '乙方/交付方', placeholder: '例如：禹都科技' },
  { key: 'projectType', label: '项目类型', placeholder: '例如：IT服务项目/系统集成/小程序' },
  { key: 'projectGroup', label: '项目分组', placeholder: '例如：华东区域/重点客户/金融行业' },
  { key: 'currentStage', label: '当前阶段', placeholder: '例如：项目启动/需求调研/开发实施' },
  { key: 'contractAmount', label: '合同金额', placeholder: '例如：80万元，或待确认' },
  { key: 'startDate', label: '开始日期', placeholder: 'YYYY-MM-DD' },
  { key: 'endDate', label: '结束日期', placeholder: 'YYYY-MM-DD' },
  { key: 'paymentTerms', label: '付款/回款条款', placeholder: '例如：30%首款，40%需求确认后，30%验收后', wide: true, multiline: true },
  { key: 'teamRoles', label: '团队角色', placeholder: '例如：PM张三、前端2人、后端2人、测试1人、客户接口人李四', wide: true, multiline: true },
  { key: 'keyConstraints', label: '关键约束', placeholder: '例如：必须在双11前上线、客户审批周期长、需企业微信/微信支付对接', wide: true, multiline: true },
];

export const planningInputFields: Array<{ key: keyof ProjectManagementPlanningInput; label: string; placeholder: string }> = [
  { key: 'background', label: '项目背景', placeholder: '写清业务背景、客户目标、现状问题、为什么现在要做。' },
  { key: 'objectives', label: '项目目标', placeholder: '写清短期目标、长期愿景、成功标准和必须达成的指标。' },
  { key: 'scope', label: '范围边界', placeholder: '写清包含什么、不包含什么、关键交付物和验收口径。' },
  { key: 'knownRisks', label: '已知风险', placeholder: '写清已暴露的风险、资源限制、客户反馈慢、技术难点等。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：偏乙方视角、重点关注回款、输出适合客户启动会展示。' },
];

export const discoveryInputFields: Array<{ key: keyof ProjectManagementDiscoveryInput; label: string; placeholder: string }> = [
  { key: 'interviewNotes', label: '访谈/会议纪要', placeholder: '粘贴客户访谈、会议纪要、聊天记录整理或口头需求摘要。' },
  { key: 'userRoles', label: '用户角色/干系人', placeholder: '例如：门店导购、会员、运营、财务、总部管理员、客户 IT。' },
  { key: 'businessProcesses', label: '业务流程/现状问题', placeholder: '写清当前业务怎么跑、哪里低效、系统之间怎么流转。' },
  { key: 'featureRequests', label: '功能诉求', placeholder: '列出客户提出的功能点、想法、页面、报表、接口、权限等。' },
  { key: 'acceptanceNotes', label: '验收/测试关注点', placeholder: '写清客户关心的验收条件、测试场景、边界条件和上线限制。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出偏 PRD、重点列待确认问题、按 P0/P1/P2 排优先级。' },
];

export const executionInputFields: Array<{ key: keyof ProjectManagementExecutionInput; label: string; placeholder: string }> = [
  { key: 'workstreams', label: '工作流/模块拆分', placeholder: '例如：需求确认、UI设计、前端、后端、接口联调、测试、上线准备。' },
  { key: 'milestones', label: '已知里程碑', placeholder: '例如：7/10需求冻结、7/20开发完成、7/25联调、8/1上线。' },
  { key: 'resources', label: '资源与人员', placeholder: '例如：PM 1人、前端2人、后端2人、测试1人、客户接口人。' },
  { key: 'dependencies', label: '依赖关系', placeholder: '写清接口、素材、审批、第三方平台、客户确认、采购等依赖。' },
  { key: 'blockers', label: '当前阻塞/推进难点', placeholder: '写清延期点、资源冲突、需求未定、环境未给、客户反馈慢等。' },
  { key: 'cadence', label: '推进节奏/会议机制', placeholder: '例如：每日站会、每周客户例会、双周 Sprint、周五风险同步。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：偏乙方推进视角、输出未来两周行动清单、重点控制延期风险。' },
];

export const riskInputFields: Array<{ key: keyof ProjectManagementRiskInput; label: string; placeholder: string }> = [
  { key: 'riskSignals', label: '风险信号', placeholder: '例如：客户反馈变慢、需求反复、关键接口未定、资源被抽调、验收口径不清。' },
  { key: 'currentIssues', label: '当前问题', placeholder: '写清已经发生的问题、影响范围、出现时间、当前状态。' },
  { key: 'stakeholderPressure', label: '干系人压力/客户反馈', placeholder: '例如：客户投诉、高层关注、商务催回款、研发反馈工期不足。' },
  { key: 'scheduleBudgetImpact', label: '排期/预算/回款影响', placeholder: '写清可能延期多久、是否超预算、是否影响验收或付款节点。' },
  { key: 'mitigationActions', label: '已采取措施', placeholder: '写清已经沟通过什么、谁在处理、哪些动作有效或无效。' },
  { key: 'escalationNeeds', label: '需要升级或决策', placeholder: '例如：需要客户确认范围、需要老板协调资源、需要商务介入回款。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出风险登记册、给三种止损方案、偏客户沟通话术。' },
];

export const stakeholderInputFields: Array<{ key: keyof ProjectManagementStakeholderInput; label: string; placeholder: string }> = [
  { key: 'stakeholders', label: '干系人列表', placeholder: '例如：客户项目负责人、业务部门、高层、商务、研发、测试、运维，以及各自诉求。' },
  { key: 'conflicts', label: '当前分歧/冲突', placeholder: '写清谁和谁意见不一致、分歧点、背后诉求和影响范围。' },
  { key: 'changeRequests', label: '变更诉求', placeholder: '列出新增/调整/删除的需求、提出方、提出时间、期望结果。' },
  { key: 'meetingNotes', label: '会议纪要/讨论记录', placeholder: '粘贴会议纪要、聊天记录摘要、客户反馈或内部同步记录。' },
  { key: 'communicationHistory', label: '历史沟通与承诺', placeholder: '写清之前承诺过什么、谁确认过、是否已有邮件/会议纪要留痕。' },
  { key: 'decisionsNeeded', label: '需要决策或确认', placeholder: '例如：是否接受变更、是否调整排期、是否追加费用、是否升级到高层。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出会议议程、邮件话术、变更单模板、偏乙方留痕视角。' },
];

export const deliveryInputFields: Array<{ key: keyof ProjectManagementDeliveryInput; label: string; placeholder: string }> = [
  { key: 'testStatus', label: '测试状态/缺陷情况', placeholder: '例如：系统测试完成80%，剩余P1缺陷2个、P2缺陷5个，阻塞点待确认。' },
  { key: 'uatScope', label: 'UAT 范围/参与方', placeholder: '写清客户 UAT 范围、参与角色、测试场景、时间窗口和确认方式。' },
  { key: 'releaseChecklist', label: '上线检查/发布准备', placeholder: '列出环境、配置、数据、账号权限、接口、备份、监控、通知等准备情况。' },
  { key: 'acceptanceCriteria', label: '验收标准/签字条件', placeholder: '写清客户验收口径、交付物、证据材料、签字流程和回款触发条件。' },
  { key: 'trainingHandover', label: '培训与交接', placeholder: '例如：管理员培训、用户手册、运维账号、应急联系人、交接清单。' },
  { key: 'rollbackPlan', label: '回滚预案/应急处理', placeholder: '写清失败判定、回滚步骤、数据备份、责任人、沟通窗口和恢复时间目标。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出上线检查表、客户验收清单、运维交接清单、上线后一周观察计划。' },
];

export const reportingInputFields: Array<{ key: keyof ProjectManagementReportingInput; label: string; placeholder: string }> = [
  { key: 'reportPeriod', label: '汇报周期', placeholder: '例如：2026年第27周、6月项目月报、里程碑验收前汇报。' },
  { key: 'audience', label: '汇报对象', placeholder: '例如：客户项目组、客户高层、公司管理层、内部交付团队。' },
  { key: 'completedWork', label: '已完成工作', placeholder: '列出本周期完成事项、交付物、会议、客户确认和关键成果。' },
  { key: 'progressMetrics', label: '进度/质量/成本指标', placeholder: '例如：整体进度70%、缺陷关闭率85%、预算使用、回款节点状态。' },
  { key: 'risksIssues', label: '风险与问题', placeholder: '写清红黄绿状态、风险、阻塞、需客户或内部协调事项。' },
  { key: 'nextPlan', label: '下阶段计划', placeholder: '列出下周/月计划、责任人、关键里程碑和需要确认的输入。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：偏客户汇报、偏老板汇报、输出精简周报和会议口径。' },
];

export const commercialInputFields: Array<{ key: keyof ProjectManagementCommercialInput; label: string; placeholder: string }> = [
  { key: 'contractTerms', label: '合同/付款条款', placeholder: '例如：合同金额、付款比例、验收后付款、发票类型、付款周期等。' },
  { key: 'paymentMilestones', label: '回款节点', placeholder: '例如：首款30%、需求确认40%、验收30%，对应日期、交付物和状态。' },
  { key: 'acceptanceTriggers', label: '验收触发条件', placeholder: '写清哪些交付物、签字、测试通过或上线条件会触发付款。' },
  { key: 'invoiceCollectionStatus', label: '开票/回款状态', placeholder: '例如：已开票金额、待开票金额、已回款金额、逾期天数、客户财务流程。' },
  { key: 'blockers', label: '当前阻塞', placeholder: '写清客户未验收、流程卡点、缺材料、缺签字、预算调整、商务争议等。' },
  { key: 'renewalUpsellOpportunities', label: '续约/增购机会', placeholder: '例如：二期需求、运维服务、功能扩展、培训服务、数据服务等。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出回款跟进话术、逾期升级策略、续约机会清单。' },
];

export const retrospectiveInputFields: Array<{ key: keyof ProjectManagementRetrospectiveInput; label: string; placeholder: string }> = [
  { key: 'projectOutcome', label: '项目结果', placeholder: '例如：是否上线/验收/回款，交付物完成情况，客户满意度和实际收益。' },
  { key: 'goalsReview', label: '目标达成回顾', placeholder: '对照启动目标、成功标准、范围、排期、质量、成本和回款做复盘。' },
  { key: 'keyEvents', label: '关键事件/决策', placeholder: '记录关键会议、变更、延期、上线、风险处理、客户确认等事件。' },
  { key: 'problemsLessons', label: '问题与经验教训', placeholder: '写清做得不好的地方、根因、影响、教训和后续避免方式。' },
  { key: 'teamClientFeedback', label: '团队/客户反馈', placeholder: '整理客户评价、团队反馈、跨部门协作评价和管理层意见。' },
  { key: 'reusableAssets', label: '可复用资产', placeholder: '例如：模板、SOP、脚本、清单、案例、话术、风险库、知识库条目。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出项目总结、案例库条目、SOP 改进清单、知识库沉淀格式。' },
];

export const complianceInputFields: Array<{ key: keyof ProjectManagementComplianceInput; label: string; placeholder: string }> = [
  { key: 'systemScope', label: '系统范围/业务形态', placeholder: '例如：微信小程序、企业微信应用、后台管理系统、SaaS 平台、数据看板等。' },
  { key: 'dataTypes', label: '数据类型/数据流', placeholder: '写清是否涉及手机号、身份信息、交易数据、定位、员工数据、客户数据，以及数据流向。' },
  { key: 'integrations', label: '第三方平台/本土生态集成', placeholder: '例如：企业微信、微信支付、支付宝、短信、地图、OSS、CRM、ERP、单点登录。' },
  { key: 'deploymentEnvironment', label: '部署环境/上线渠道', placeholder: '例如：客户私有化部署、阿里云/腾讯云、公有云、小程序发布、App Store、内网环境。' },
  { key: 'complianceStatus', label: '当前备案/等保/合规状态', placeholder: '例如：ICP备案待办、公安备案待办、等保二级准备中、客户法务未确认。' },
  { key: 'securityRisks', label: '安全风险/客户顾虑', placeholder: '写清权限、日志、加密、备份、审计、接口暴露、数据出境、第三方授权等风险。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出上线准入清单、整改清单、客户确认事项、非法律意见说明。' },
];

export function formatProjectManagementTime(value?: string) {
  if (!value) return '待记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function projectSearchText(project: ProjectManagementProjectRecord) {
  return [
    project.name,
    project.clientName,
    project.vendorName,
    project.projectType,
    project.projectGroup,
    project.currentStage,
    project.updated_at,
  ].join(' ').toLowerCase();
}
