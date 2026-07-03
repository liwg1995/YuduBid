import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { ProjectManagementCommercialInput, ProjectManagementComplianceInput, ProjectManagementDeliveryInput, ProjectManagementDictionaries, ProjectManagementDiscoveryInput, ProjectManagementExecutionInput, ProjectManagementPlanningInput, ProjectManagementProfile, ProjectManagementProjectRecord, ProjectManagementReportingInput, ProjectManagementRetrospectiveInput, ProjectManagementRiskInput, ProjectManagementStakeholderInput, ProjectManagementState, ProjectManagementTask } from '../types';

interface ProjectManagementModule {
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

type ProjectManagementExportProgress = WordExportProgressEvent & { moduleId: string };

const projectManagementOpenWorkbenchKey = 'project-management-open-workbench';

const moduleDocumentTitles: Record<string, string> = {
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

const builtInProjectTypes = [
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

const defaultProfile: ProjectManagementProfile = {
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

const defaultPlanningInput: ProjectManagementPlanningInput = {
  background: '',
  objectives: '',
  scope: '',
  knownRisks: '',
  extraRequirements: '',
};

const defaultDiscoveryInput: ProjectManagementDiscoveryInput = {
  interviewNotes: '',
  userRoles: '',
  businessProcesses: '',
  featureRequests: '',
  acceptanceNotes: '',
  extraRequirements: '',
};

const defaultExecutionInput: ProjectManagementExecutionInput = {
  workstreams: '',
  milestones: '',
  resources: '',
  dependencies: '',
  blockers: '',
  cadence: '',
  extraRequirements: '',
};

const defaultRiskInput: ProjectManagementRiskInput = {
  riskSignals: '',
  currentIssues: '',
  stakeholderPressure: '',
  scheduleBudgetImpact: '',
  mitigationActions: '',
  escalationNeeds: '',
  extraRequirements: '',
};

const defaultStakeholderInput: ProjectManagementStakeholderInput = {
  stakeholders: '',
  conflicts: '',
  changeRequests: '',
  meetingNotes: '',
  communicationHistory: '',
  decisionsNeeded: '',
  extraRequirements: '',
};

const defaultDeliveryInput: ProjectManagementDeliveryInput = {
  testStatus: '',
  uatScope: '',
  releaseChecklist: '',
  acceptanceCriteria: '',
  trainingHandover: '',
  rollbackPlan: '',
  extraRequirements: '',
};

const defaultReportingInput: ProjectManagementReportingInput = {
  reportPeriod: '',
  audience: '',
  completedWork: '',
  progressMetrics: '',
  risksIssues: '',
  nextPlan: '',
  extraRequirements: '',
};

const defaultCommercialInput: ProjectManagementCommercialInput = {
  contractTerms: '',
  paymentMilestones: '',
  acceptanceTriggers: '',
  invoiceCollectionStatus: '',
  blockers: '',
  renewalUpsellOpportunities: '',
  extraRequirements: '',
};

const defaultRetrospectiveInput: ProjectManagementRetrospectiveInput = {
  projectOutcome: '',
  goalsReview: '',
  keyEvents: '',
  problemsLessons: '',
  teamClientFeedback: '',
  reusableAssets: '',
  extraRequirements: '',
};

const defaultComplianceInput: ProjectManagementComplianceInput = {
  systemScope: '',
  dataTypes: '',
  integrations: '',
  deploymentEnvironment: '',
  complianceStatus: '',
  securityRisks: '',
  extraRequirements: '',
};

const modules: ProjectManagementModule[] = [
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

const profileFields: Array<{ key: keyof ProjectManagementProfile; label: string; placeholder: string; wide?: boolean; multiline?: boolean }> = [
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

const planningInputFields: Array<{ key: keyof ProjectManagementPlanningInput; label: string; placeholder: string }> = [
  { key: 'background', label: '项目背景', placeholder: '写清业务背景、客户目标、现状问题、为什么现在要做。' },
  { key: 'objectives', label: '项目目标', placeholder: '写清短期目标、长期愿景、成功标准和必须达成的指标。' },
  { key: 'scope', label: '范围边界', placeholder: '写清包含什么、不包含什么、关键交付物和验收口径。' },
  { key: 'knownRisks', label: '已知风险', placeholder: '写清已暴露的风险、资源限制、客户反馈慢、技术难点等。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：偏乙方视角、重点关注回款、输出适合客户启动会展示。' },
];

const discoveryInputFields: Array<{ key: keyof ProjectManagementDiscoveryInput; label: string; placeholder: string }> = [
  { key: 'interviewNotes', label: '访谈/会议纪要', placeholder: '粘贴客户访谈、会议纪要、聊天记录整理或口头需求摘要。' },
  { key: 'userRoles', label: '用户角色/干系人', placeholder: '例如：门店导购、会员、运营、财务、总部管理员、客户 IT。' },
  { key: 'businessProcesses', label: '业务流程/现状问题', placeholder: '写清当前业务怎么跑、哪里低效、系统之间怎么流转。' },
  { key: 'featureRequests', label: '功能诉求', placeholder: '列出客户提出的功能点、想法、页面、报表、接口、权限等。' },
  { key: 'acceptanceNotes', label: '验收/测试关注点', placeholder: '写清客户关心的验收条件、测试场景、边界条件和上线限制。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出偏 PRD、重点列待确认问题、按 P0/P1/P2 排优先级。' },
];

const executionInputFields: Array<{ key: keyof ProjectManagementExecutionInput; label: string; placeholder: string }> = [
  { key: 'workstreams', label: '工作流/模块拆分', placeholder: '例如：需求确认、UI设计、前端、后端、接口联调、测试、上线准备。' },
  { key: 'milestones', label: '已知里程碑', placeholder: '例如：7/10需求冻结、7/20开发完成、7/25联调、8/1上线。' },
  { key: 'resources', label: '资源与人员', placeholder: '例如：PM 1人、前端2人、后端2人、测试1人、客户接口人。' },
  { key: 'dependencies', label: '依赖关系', placeholder: '写清接口、素材、审批、第三方平台、客户确认、采购等依赖。' },
  { key: 'blockers', label: '当前阻塞/推进难点', placeholder: '写清延期点、资源冲突、需求未定、环境未给、客户反馈慢等。' },
  { key: 'cadence', label: '推进节奏/会议机制', placeholder: '例如：每日站会、每周客户例会、双周 Sprint、周五风险同步。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：偏乙方推进视角、输出未来两周行动清单、重点控制延期风险。' },
];

const riskInputFields: Array<{ key: keyof ProjectManagementRiskInput; label: string; placeholder: string }> = [
  { key: 'riskSignals', label: '风险信号', placeholder: '例如：客户反馈变慢、需求反复、关键接口未定、资源被抽调、验收口径不清。' },
  { key: 'currentIssues', label: '当前问题', placeholder: '写清已经发生的问题、影响范围、出现时间、当前状态。' },
  { key: 'stakeholderPressure', label: '干系人压力/客户反馈', placeholder: '例如：客户投诉、高层关注、商务催回款、研发反馈工期不足。' },
  { key: 'scheduleBudgetImpact', label: '排期/预算/回款影响', placeholder: '写清可能延期多久、是否超预算、是否影响验收或付款节点。' },
  { key: 'mitigationActions', label: '已采取措施', placeholder: '写清已经沟通过什么、谁在处理、哪些动作有效或无效。' },
  { key: 'escalationNeeds', label: '需要升级或决策', placeholder: '例如：需要客户确认范围、需要老板协调资源、需要商务介入回款。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出风险登记册、给三种止损方案、偏客户沟通话术。' },
];

const stakeholderInputFields: Array<{ key: keyof ProjectManagementStakeholderInput; label: string; placeholder: string }> = [
  { key: 'stakeholders', label: '干系人列表', placeholder: '例如：客户项目负责人、业务部门、高层、商务、研发、测试、运维，以及各自诉求。' },
  { key: 'conflicts', label: '当前分歧/冲突', placeholder: '写清谁和谁意见不一致、分歧点、背后诉求和影响范围。' },
  { key: 'changeRequests', label: '变更诉求', placeholder: '列出新增/调整/删除的需求、提出方、提出时间、期望结果。' },
  { key: 'meetingNotes', label: '会议纪要/讨论记录', placeholder: '粘贴会议纪要、聊天记录摘要、客户反馈或内部同步记录。' },
  { key: 'communicationHistory', label: '历史沟通与承诺', placeholder: '写清之前承诺过什么、谁确认过、是否已有邮件/会议纪要留痕。' },
  { key: 'decisionsNeeded', label: '需要决策或确认', placeholder: '例如：是否接受变更、是否调整排期、是否追加费用、是否升级到高层。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出会议议程、邮件话术、变更单模板、偏乙方留痕视角。' },
];

const deliveryInputFields: Array<{ key: keyof ProjectManagementDeliveryInput; label: string; placeholder: string }> = [
  { key: 'testStatus', label: '测试状态/缺陷情况', placeholder: '例如：系统测试完成80%，剩余P1缺陷2个、P2缺陷5个，阻塞点待确认。' },
  { key: 'uatScope', label: 'UAT 范围/参与方', placeholder: '写清客户 UAT 范围、参与角色、测试场景、时间窗口和确认方式。' },
  { key: 'releaseChecklist', label: '上线检查/发布准备', placeholder: '列出环境、配置、数据、账号权限、接口、备份、监控、通知等准备情况。' },
  { key: 'acceptanceCriteria', label: '验收标准/签字条件', placeholder: '写清客户验收口径、交付物、证据材料、签字流程和回款触发条件。' },
  { key: 'trainingHandover', label: '培训与交接', placeholder: '例如：管理员培训、用户手册、运维账号、应急联系人、交接清单。' },
  { key: 'rollbackPlan', label: '回滚预案/应急处理', placeholder: '写清失败判定、回滚步骤、数据备份、责任人、沟通窗口和恢复时间目标。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出上线检查表、客户验收清单、运维交接清单、上线后一周观察计划。' },
];

const reportingInputFields: Array<{ key: keyof ProjectManagementReportingInput; label: string; placeholder: string }> = [
  { key: 'reportPeriod', label: '汇报周期', placeholder: '例如：2026年第27周、6月项目月报、里程碑验收前汇报。' },
  { key: 'audience', label: '汇报对象', placeholder: '例如：客户项目组、客户高层、公司管理层、内部交付团队。' },
  { key: 'completedWork', label: '已完成工作', placeholder: '列出本周期完成事项、交付物、会议、客户确认和关键成果。' },
  { key: 'progressMetrics', label: '进度/质量/成本指标', placeholder: '例如：整体进度70%、缺陷关闭率85%、预算使用、回款节点状态。' },
  { key: 'risksIssues', label: '风险与问题', placeholder: '写清红黄绿状态、风险、阻塞、需客户或内部协调事项。' },
  { key: 'nextPlan', label: '下阶段计划', placeholder: '列出下周/月计划、责任人、关键里程碑和需要确认的输入。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：偏客户汇报、偏老板汇报、输出精简周报和会议口径。' },
];

const commercialInputFields: Array<{ key: keyof ProjectManagementCommercialInput; label: string; placeholder: string }> = [
  { key: 'contractTerms', label: '合同/付款条款', placeholder: '例如：合同金额、付款比例、验收后付款、发票类型、付款周期等。' },
  { key: 'paymentMilestones', label: '回款节点', placeholder: '例如：首款30%、需求确认40%、验收30%，对应日期、交付物和状态。' },
  { key: 'acceptanceTriggers', label: '验收触发条件', placeholder: '写清哪些交付物、签字、测试通过或上线条件会触发付款。' },
  { key: 'invoiceCollectionStatus', label: '开票/回款状态', placeholder: '例如：已开票金额、待开票金额、已回款金额、逾期天数、客户财务流程。' },
  { key: 'blockers', label: '当前阻塞', placeholder: '写清客户未验收、流程卡点、缺材料、缺签字、预算调整、商务争议等。' },
  { key: 'renewalUpsellOpportunities', label: '续约/增购机会', placeholder: '例如：二期需求、运维服务、功能扩展、培训服务、数据服务等。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出回款跟进话术、逾期升级策略、续约机会清单。' },
];

const retrospectiveInputFields: Array<{ key: keyof ProjectManagementRetrospectiveInput; label: string; placeholder: string }> = [
  { key: 'projectOutcome', label: '项目结果', placeholder: '例如：是否上线/验收/回款，交付物完成情况，客户满意度和实际收益。' },
  { key: 'goalsReview', label: '目标达成回顾', placeholder: '对照启动目标、成功标准、范围、排期、质量、成本和回款做复盘。' },
  { key: 'keyEvents', label: '关键事件/决策', placeholder: '记录关键会议、变更、延期、上线、风险处理、客户确认等事件。' },
  { key: 'problemsLessons', label: '问题与经验教训', placeholder: '写清做得不好的地方、根因、影响、教训和后续避免方式。' },
  { key: 'teamClientFeedback', label: '团队/客户反馈', placeholder: '整理客户评价、团队反馈、跨部门协作评价和管理层意见。' },
  { key: 'reusableAssets', label: '可复用资产', placeholder: '例如：模板、SOP、脚本、清单、案例、话术、风险库、知识库条目。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出项目总结、案例库条目、SOP 改进清单、知识库沉淀格式。' },
];

const complianceInputFields: Array<{ key: keyof ProjectManagementComplianceInput; label: string; placeholder: string }> = [
  { key: 'systemScope', label: '系统范围/业务形态', placeholder: '例如：微信小程序、企业微信应用、后台管理系统、SaaS 平台、数据看板等。' },
  { key: 'dataTypes', label: '数据类型/数据流', placeholder: '写清是否涉及手机号、身份信息、交易数据、定位、员工数据、客户数据，以及数据流向。' },
  { key: 'integrations', label: '第三方平台/本土生态集成', placeholder: '例如：企业微信、微信支付、支付宝、短信、地图、OSS、CRM、ERP、单点登录。' },
  { key: 'deploymentEnvironment', label: '部署环境/上线渠道', placeholder: '例如：客户私有化部署、阿里云/腾讯云、公有云、小程序发布、App Store、内网环境。' },
  { key: 'complianceStatus', label: '当前备案/等保/合规状态', placeholder: '例如：ICP备案待办、公安备案待办、等保二级准备中、客户法务未确认。' },
  { key: 'securityRisks', label: '安全风险/客户顾虑', placeholder: '写清权限、日志、加密、备份、审计、接口暴露、数据出境、第三方授权等风险。' },
  { key: 'extraRequirements', label: '额外要求', placeholder: '例如：输出上线准入清单、整改清单、客户确认事项、非法律意见说明。' },
];

function formatProjectManagementTime(value?: string) {
  if (!value) return '待记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function projectSearchText(project: ProjectManagementProjectRecord) {
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

function ProjectManagementPage() {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'list' | 'workbench'>('list');
  const [projectSearchKeyword, setProjectSearchKeyword] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [dictionaries, setDictionaries] = useState<ProjectManagementDictionaries>({ projectTypes: [], projectGroups: [] });
  const [activeModuleId, setActiveModuleId] = useState(modules[0].id);
  const [state, setState] = useState<ProjectManagementState | null>(null);
  const [profile, setProfile] = useState<ProjectManagementProfile>(defaultProfile);
  const [planningInput, setPlanningInput] = useState<ProjectManagementPlanningInput>(defaultPlanningInput);
  const [planningResult, setPlanningResult] = useState('');
  const [discoveryInput, setDiscoveryInput] = useState<ProjectManagementDiscoveryInput>(defaultDiscoveryInput);
  const [discoveryResult, setDiscoveryResult] = useState('');
  const [executionInput, setExecutionInput] = useState<ProjectManagementExecutionInput>(defaultExecutionInput);
  const [executionResult, setExecutionResult] = useState('');
  const [riskInput, setRiskInput] = useState<ProjectManagementRiskInput>(defaultRiskInput);
  const [riskResult, setRiskResult] = useState('');
  const [stakeholderInput, setStakeholderInput] = useState<ProjectManagementStakeholderInput>(defaultStakeholderInput);
  const [stakeholderResult, setStakeholderResult] = useState('');
  const [deliveryInput, setDeliveryInput] = useState<ProjectManagementDeliveryInput>(defaultDeliveryInput);
  const [deliveryResult, setDeliveryResult] = useState('');
  const [reportingInput, setReportingInput] = useState<ProjectManagementReportingInput>(defaultReportingInput);
  const [reportingResult, setReportingResult] = useState('');
  const [commercialInput, setCommercialInput] = useState<ProjectManagementCommercialInput>(defaultCommercialInput);
  const [commercialResult, setCommercialResult] = useState('');
  const [retrospectiveInput, setRetrospectiveInput] = useState<ProjectManagementRetrospectiveInput>(defaultRetrospectiveInput);
  const [retrospectiveResult, setRetrospectiveResult] = useState('');
  const [complianceInput, setComplianceInput] = useState<ProjectManagementComplianceInput>(defaultComplianceInput);
  const [complianceResult, setComplianceResult] = useState('');
  const [resultModes, setResultModes] = useState<Record<string, 'edit' | 'preview'>>({ planning: 'edit', discovery: 'edit', execution: 'edit', risk: 'edit', stakeholder: 'edit', delivery: 'edit', reporting: 'edit', commercial: 'edit', retrospective: 'edit', compliance: 'edit' });
  const [exportProgress, setExportProgress] = useState<ProjectManagementExportProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectList, setProjectList] = useState<ProjectManagementProjectRecord[]>([]);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [newProjectProfile, setNewProjectProfile] = useState<Partial<ProjectManagementProfile>>({
    projectName: '',
    clientName: '',
    vendorName: '',
    projectType: 'IT服务项目',
    projectGroup: '',
  });

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) || modules[0],
    [activeModuleId],
  );
  const moduleResults = useMemo<Record<string, string>>(() => ({
    planning: planningResult,
    discovery: discoveryResult,
    execution: executionResult,
    risk: riskResult,
    stakeholder: stakeholderResult,
    delivery: deliveryResult,
    reporting: reportingResult,
    commercial: commercialResult,
    retrospective: retrospectiveResult,
    compliance: complianceResult,
  }), [planningResult, discoveryResult, executionResult, riskResult, stakeholderResult, deliveryResult, reportingResult, commercialResult, retrospectiveResult, complianceResult]);
  const completedModuleIds = useMemo(() => new Set(
    modules.filter((module) => moduleResults[module.id]?.trim()).map((module) => module.id),
  ), [moduleResults]);
  const completedCount = completedModuleIds.size;
  const nextIncompleteModule = modules.find((module) => !completedModuleIds.has(module.id));
  const activeIndex = modules.findIndex((module) => module.id === activeModule.id);
  const nextModule = modules[activeIndex + 1];
  const isRunning = state?.task?.status === 'running';
  const exporting = exportProgress?.phase === 'running';
  const isPlanningModule = activeModule.id === 'planning';
  const isDiscoveryModule = activeModule.id === 'discovery';
  const isExecutionModule = activeModule.id === 'execution';
  const isRiskModule = activeModule.id === 'risk';
  const isStakeholderModule = activeModule.id === 'stakeholder';
  const isDeliveryModule = activeModule.id === 'delivery';
  const isReportingModule = activeModule.id === 'reporting';
  const isCommercialModule = activeModule.id === 'commercial';
  const isRetrospectiveModule = activeModule.id === 'retrospective';
  const isComplianceModule = activeModule.id === 'compliance';
  const visibleTask = state?.task && (state.task.status === 'running' || state.task.type === activeModule.id) ? state.task : undefined;
  const currentModuleDone = completedModuleIds.has(activeModule.id);
  const suggestedModule = currentModuleDone ? nextModule || nextIncompleteModule : activeModule;
  const activeExportProgress = exportProgress?.moduleId === activeModule.id ? exportProgress : null;
  const allExportProgress = exportProgress?.moduleId === 'all' ? exportProgress : null;
  const projectTypeOptions = useMemo(
    () => Array.from(new Set([...builtInProjectTypes, ...dictionaries.projectTypes])),
    [dictionaries.projectTypes],
  );
  const projectGroupOptions = useMemo(
    () => Array.from(new Set(dictionaries.projectGroups)),
    [dictionaries.projectGroups],
  );
  const filteredProjectList = useMemo(() => {
    const keyword = projectSearchKeyword.trim().toLowerCase();
    const visibleProjects = projectList.filter((project) => project.name !== '未命名项目' || project.completedCount > 0 || project.clientName || project.vendorName || project.isActive);
    if (!keyword) return visibleProjects;
    return visibleProjects.filter((project) => projectSearchText(project).includes(keyword));
  }, [projectList, projectSearchKeyword]);

  useEffect(() => {
    let alive = true;
    const unsubscribe = window.yibiao?.projectManagement.onEvent((nextState) => {
      if (!alive) return;
      applyState(nextState);
    });

    Promise.all([
      window.yibiao?.projectManagement.loadState(),
      window.yibiao?.projectManagement.listProjects(),
      window.yibiao?.projectManagement.readDictionaries(),
    ])
      .then(([nextState, projects, nextDictionaries]) => {
        if (alive && nextState) applyState(nextState);
        if (alive && projects?.projects) setProjectList(projects.projects);
        if (alive && nextDictionaries) setDictionaries(nextDictionaries);
        if (alive && window.sessionStorage.getItem(projectManagementOpenWorkbenchKey) === '1') {
          window.sessionStorage.removeItem(projectManagementOpenWorkbenchKey);
          setViewMode('workbench');
        }
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取项目管理工作区失败', 'error'))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [showToast]);

  useEffect(() => {
    const visibleIds = new Set(filteredProjectList.map((project) => project.id));
    setSelectedProjectIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredProjectList]);

  function applyState(nextState: ProjectManagementState) {
    setState(nextState);
    setProfile(nextState.profile || defaultProfile);
    setPlanningInput(nextState.planningInput || defaultPlanningInput);
    setPlanningResult(nextState.planningResult || '');
    setDiscoveryInput(nextState.discoveryInput || defaultDiscoveryInput);
    setDiscoveryResult(nextState.discoveryResult || '');
    setExecutionInput(nextState.executionInput || defaultExecutionInput);
    setExecutionResult(nextState.executionResult || '');
    setRiskInput(nextState.riskInput || defaultRiskInput);
    setRiskResult(nextState.riskResult || '');
    setStakeholderInput(nextState.stakeholderInput || defaultStakeholderInput);
    setStakeholderResult(nextState.stakeholderResult || '');
    setDeliveryInput(nextState.deliveryInput || defaultDeliveryInput);
    setDeliveryResult(nextState.deliveryResult || '');
    setReportingInput(nextState.reportingInput || defaultReportingInput);
    setReportingResult(nextState.reportingResult || '');
    setCommercialInput(nextState.commercialInput || defaultCommercialInput);
    setCommercialResult(nextState.commercialResult || '');
    setRetrospectiveInput(nextState.retrospectiveInput || defaultRetrospectiveInput);
    setRetrospectiveResult(nextState.retrospectiveResult || '');
    setComplianceInput(nextState.complianceInput || defaultComplianceInput);
    setComplianceResult(nextState.complianceResult || '');
  }

  async function refreshProjectList() {
    const projects = await window.yibiao?.projectManagement.listProjects();
    if (projects?.projects) setProjectList(projects.projects);
  }

  async function refreshDictionaries() {
    const nextDictionaries = await window.yibiao?.projectManagement.readDictionaries();
    if (nextDictionaries) setDictionaries(nextDictionaries);
  }

  async function switchProject(projectId: string) {
    if (!projectId || projectId === state?.projectId) return;
    try {
      const nextState = await window.yibiao?.projectManagement.switchProject(projectId);
      if (nextState) applyState(nextState);
      await refreshProjectList();
      setActiveModuleId(modules[0].id);
      showToast('已进入所选项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换项目失败', 'error');
    }
  }

  async function enterProject(projectId: string) {
    if (!projectId) return;
    if (projectId !== state?.projectId) {
      await switchProject(projectId);
    }
    setViewMode('workbench');
  }

  async function createProject() {
    const profileDraft = {
      ...newProjectProfile,
      projectName: String(newProjectProfile.projectName || '').trim(),
      clientName: String(newProjectProfile.clientName || '').trim(),
      vendorName: String(newProjectProfile.vendorName || '').trim(),
      projectType: String(newProjectProfile.projectType || 'IT服务项目').trim() || 'IT服务项目',
      projectGroup: String(newProjectProfile.projectGroup || '').trim(),
      currentStage: '项目启动',
    };
    if (!profileDraft.projectName) {
      showToast('请先填写项目名称', 'error');
      return;
    }
    try {
      const result = await window.yibiao?.projectManagement.createProject({ profile: profileDraft });
      if (result?.state) applyState(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setCreateProjectOpen(false);
      await refreshDictionaries();
      setNewProjectProfile({ projectName: '', clientName: '', vendorName: '', projectType: 'IT服务项目', projectGroup: '' });
      setActiveModuleId(modules[0].id);
      setViewMode('workbench');
      showToast('新项目已创建，可以开始填写项目档案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '新建项目失败', 'error');
    }
  }

  async function deleteCurrentProject() {
    if (!state?.projectId) return;
    try {
      const result = await window.yibiao?.projectManagement.deleteProject(state.projectId);
      if (result?.state) applyState(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setDeleteProjectOpen(false);
      setActiveModuleId(modules[0].id);
      showToast('项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error');
    }
  }

  function toggleProjectSelection(projectId: string) {
    setSelectedProjectIds((current) => current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId]);
  }

  function toggleAllVisibleProjects(checked: boolean) {
    setSelectedProjectIds(checked ? filteredProjectList.map((project) => project.id) : []);
  }

  async function deleteSelectedProjects() {
    if (!selectedProjectIds.length) {
      showToast('请先选择要删除的项目', 'info');
      return;
    }
    try {
      const result = await window.yibiao?.projectManagement.deleteProjects(selectedProjectIds);
      if (result?.state) applyState(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setSelectedProjectIds([]);
      setViewMode('list');
      showToast('已删除所选项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量删除项目失败', 'error');
    }
  }

  async function deleteProjectFromList(projectId: string) {
    try {
      const result = await window.yibiao?.projectManagement.deleteProjects([projectId]);
      if (result?.state) applyState(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setSelectedProjectIds((current) => current.filter((id) => id !== projectId));
      showToast('项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error');
    }
  }

  function updateProfileField(key: keyof ProjectManagementProfile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updatePlanningInputField(key: keyof ProjectManagementPlanningInput, value: string) {
    setPlanningInput((current) => ({ ...current, [key]: value }));
  }

  function updateDiscoveryInputField(key: keyof ProjectManagementDiscoveryInput, value: string) {
    setDiscoveryInput((current) => ({ ...current, [key]: value }));
  }

  function updateExecutionInputField(key: keyof ProjectManagementExecutionInput, value: string) {
    setExecutionInput((current) => ({ ...current, [key]: value }));
  }

  function updateRiskInputField(key: keyof ProjectManagementRiskInput, value: string) {
    setRiskInput((current) => ({ ...current, [key]: value }));
  }

  function updateStakeholderInputField(key: keyof ProjectManagementStakeholderInput, value: string) {
    setStakeholderInput((current) => ({ ...current, [key]: value }));
  }

  function updateDeliveryInputField(key: keyof ProjectManagementDeliveryInput, value: string) {
    setDeliveryInput((current) => ({ ...current, [key]: value }));
  }

  function updateReportingInputField(key: keyof ProjectManagementReportingInput, value: string) {
    setReportingInput((current) => ({ ...current, [key]: value }));
  }

  function updateCommercialInputField(key: keyof ProjectManagementCommercialInput, value: string) {
    setCommercialInput((current) => ({ ...current, [key]: value }));
  }

  function updateRetrospectiveInputField(key: keyof ProjectManagementRetrospectiveInput, value: string) {
    setRetrospectiveInput((current) => ({ ...current, [key]: value }));
  }

  function updateComplianceInputField(key: keyof ProjectManagementComplianceInput, value: string) {
    setComplianceInput((current) => ({ ...current, [key]: value }));
  }

  function toggleResultMode(key: string) {
    setResultModes((current) => ({ ...current, [key]: current[key] === 'edit' ? 'preview' : 'edit' }));
  }

  async function saveProfile() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveProfile(profile);
      if (nextState) applyState(nextState);
      await refreshProjectList();
      await refreshDictionaries();
      showToast('项目档案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存项目档案失败', 'error');
    }
  }

  async function savePlanningInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.savePlanningInput(planningInput);
      if (nextState) applyState(nextState);
      showToast('启动材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存启动材料失败', 'error');
    }
  }

  async function generatePlanning() {
    try {
      const nextState = await window.yibiao?.projectManagement.generatePlanning({ profile, planningInput });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, planning: 'edit' }));
      showToast('项目启动与规划方案已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成项目启动与规划方案失败', 'error');
    }
  }

  async function savePlanningResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.savePlanningResult({ planningResult });
      if (nextState) applyState(nextState);
      showToast('规划方案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存规划方案失败', 'error');
    }
  }

  async function saveDiscoveryInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveDiscoveryInput(discoveryInput);
      if (nextState) applyState(nextState);
      showToast('需求材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存需求材料失败', 'error');
    }
  }

  async function generateDiscovery() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateDiscovery({ profile, discoveryInput, planningResult });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, discovery: 'edit' }));
      showToast('需求分析与 PRD 框架已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成需求分析与 PRD 框架失败', 'error');
    }
  }

  async function saveDiscoveryResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveDiscoveryResult({ discoveryResult });
      if (nextState) applyState(nextState);
      showToast('需求与 PRD 结果已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存需求与 PRD 结果失败', 'error');
    }
  }

  async function saveExecutionInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveExecutionInput(executionInput);
      if (nextState) applyState(nextState);
      showToast('排期材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存排期材料失败', 'error');
    }
  }

  async function generateExecution() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateExecution({
        profile,
        executionInput,
        planningResult,
        discoveryResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, execution: 'edit' }));
      showToast('排期与推进计划已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成排期与推进计划失败', 'error');
    }
  }

  async function saveExecutionResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveExecutionResult({ executionResult });
      if (nextState) applyState(nextState);
      showToast('排期与推进计划已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存排期与推进计划失败', 'error');
    }
  }

  async function saveRiskInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveRiskInput(riskInput);
      if (nextState) applyState(nextState);
      showToast('风险材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存风险材料失败', 'error');
    }
  }

  async function generateRisk() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateRisk({
        profile,
        riskInput,
        planningResult,
        discoveryResult,
        executionResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, risk: 'edit' }));
      showToast('风险问题方案已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成风险问题方案失败', 'error');
    }
  }

  async function saveRiskResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveRiskResult({ riskResult });
      if (nextState) applyState(nextState);
      showToast('风险问题方案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存风险问题方案失败', 'error');
    }
  }

  async function saveStakeholderInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveStakeholderInput(stakeholderInput);
      if (nextState) applyState(nextState);
      showToast('沟通变更材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存沟通变更材料失败', 'error');
    }
  }

  async function generateStakeholder() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateStakeholder({
        profile,
        stakeholderInput,
        planningResult,
        discoveryResult,
        executionResult,
        riskResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, stakeholder: 'edit' }));
      showToast('沟通变更方案已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成沟通变更方案失败', 'error');
    }
  }

  async function saveStakeholderResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveStakeholderResult({ stakeholderResult });
      if (nextState) applyState(nextState);
      showToast('沟通变更方案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存沟通变更方案失败', 'error');
    }
  }

  async function saveDeliveryInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveDeliveryInput(deliveryInput);
      if (nextState) applyState(nextState);
      showToast('交付上线材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存交付上线材料失败', 'error');
    }
  }

  async function generateDelivery() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateDelivery({
        profile,
        deliveryInput,
        planningResult,
        discoveryResult,
        executionResult,
        riskResult,
        stakeholderResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, delivery: 'edit' }));
      showToast('交付上线方案已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成交付上线方案失败', 'error');
    }
  }

  async function saveDeliveryResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveDeliveryResult({ deliveryResult });
      if (nextState) applyState(nextState);
      showToast('交付上线方案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存交付上线方案失败', 'error');
    }
  }

  async function saveReportingInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveReportingInput(reportingInput);
      if (nextState) applyState(nextState);
      showToast('汇报材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存汇报材料失败', 'error');
    }
  }

  async function generateReporting() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateReporting({
        profile,
        reportingInput,
        planningResult,
        discoveryResult,
        executionResult,
        riskResult,
        stakeholderResult,
        deliveryResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, reporting: 'edit' }));
      showToast('汇报材料已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成汇报材料失败', 'error');
    }
  }

  async function saveReportingResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveReportingResult({ reportingResult });
      if (nextState) applyState(nextState);
      showToast('汇报材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存汇报材料失败', 'error');
    }
  }

  async function saveCommercialInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveCommercialInput(commercialInput);
      if (nextState) applyState(nextState);
      showToast('商务回款材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存商务回款材料失败', 'error');
    }
  }

  async function generateCommercial() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateCommercial({
        profile,
        commercialInput,
        planningResult,
        discoveryResult,
        executionResult,
        riskResult,
        stakeholderResult,
        deliveryResult,
        reportingResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, commercial: 'edit' }));
      showToast('商务回款方案已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成商务回款方案失败', 'error');
    }
  }

  async function saveCommercialResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveCommercialResult({ commercialResult });
      if (nextState) applyState(nextState);
      showToast('商务回款方案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存商务回款方案失败', 'error');
    }
  }

  async function saveRetrospectiveInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveRetrospectiveInput(retrospectiveInput);
      if (nextState) applyState(nextState);
      showToast('复盘材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存复盘材料失败', 'error');
    }
  }

  async function generateRetrospective() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateRetrospective({
        profile,
        retrospectiveInput,
        planningResult,
        discoveryResult,
        executionResult,
        riskResult,
        stakeholderResult,
        deliveryResult,
        reportingResult,
        commercialResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, retrospective: 'edit' }));
      showToast('复盘沉淀报告已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成复盘沉淀报告失败', 'error');
    }
  }

  async function saveRetrospectiveResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveRetrospectiveResult({ retrospectiveResult });
      if (nextState) applyState(nextState);
      showToast('复盘沉淀报告已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存复盘沉淀报告失败', 'error');
    }
  }

  async function saveComplianceInput() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveComplianceInput(complianceInput);
      if (nextState) applyState(nextState);
      showToast('合规材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存合规材料失败', 'error');
    }
  }

  async function generateCompliance() {
    try {
      const nextState = await window.yibiao?.projectManagement.generateCompliance({
        profile,
        complianceInput,
        planningResult,
        discoveryResult,
        executionResult,
        riskResult,
        stakeholderResult,
        deliveryResult,
        reportingResult,
        commercialResult,
        retrospectiveResult,
      });
      if (nextState) applyState(nextState);
      setResultModes((current) => ({ ...current, compliance: 'edit' }));
      showToast('合规本土化方案已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成合规本土化方案失败', 'error');
    }
  }

  async function saveComplianceResult() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveComplianceResult({ complianceResult });
      if (nextState) applyState(nextState);
      showToast('合规本土化方案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存合规本土化方案失败', 'error');
    }
  }

  function normalizeProjectManagementMetaLine(line: string) {
    const metaLabelPattern = '项目名称|文档版本|版本号|版本|编制日期|日期|编制人|所属公司|所属单位|适用对象|适用周期|汇报周期|汇报人|甲方\\/客户|乙方\\/交付方';
    const labelPatterns: Array<[RegExp, string]> = [
      [/项\s*目\s*名\s*称/g, '项目名称'],
      [/文\s*档\s*版\s*本/g, '文档版本'],
      [/版\s*本\s*号/g, '版本号'],
      [/编\s*制\s*日\s*期/g, '编制日期'],
      [/编\s*制\s*人/g, '编制人'],
      [/所\s*属\s*公\s*司/g, '所属公司'],
      [/所\s*属\s*单\s*位/g, '所属单位'],
      [/甲\s*方\s*\/\s*客\s*户/g, '甲方/客户'],
      [/乙\s*方\s*\/\s*交\s*付\s*方/g, '乙方/交付方'],
      [/适\s*用\s*对\s*象/g, '适用对象'],
      [/适\s*用\s*周\s*期/g, '适用周期'],
      [/汇\s*报\s*周\s*期/g, '汇报周期'],
      [/汇\s*报\s*人/g, '汇报人'],
      [/日\s*期/g, '日期'],
      [/版\s*本/g, '版本'],
    ];
    const withoutMarkdown = String(line || '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1');
    const normalized = labelPatterns.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), withoutMarkdown);
    if (new RegExp(`(${metaLabelPattern})\\s*[:：]`).test(normalized)) {
      return normalized
        .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
        .replace(/\s*([:：])\s*/g, '$1 ');
    }
    return normalized;
  }

  function normalizeProjectManagementExportContent(content: string, documentTitle: string) {
    const normalizeHeadingText = (value: string) => String(value || '')
      .replace(/^[\d.、\s]+/, '')
      .replace(/^《(.+)》$/, '$1')
      .trim();
    const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
    const nextLines = [...lines];
    const normalizeMetaText = (value: string) => value
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/[ \t　]+/g, '')
      .trim();
    const isCoverMetaBlock = (value: string) => {
      const normalized = normalizeMetaText(value);
      const matches = normalized.match(/项目名称|文档版本|编制日期|编制人|所属公司|所属单位|适用对象|客户|甲方|乙方|交付方/g);
      return (matches?.length || 0) >= 2;
    };

    while (nextLines.length && !nextLines[0].trim()) {
      nextLines.shift();
    }

    if (!nextLines.length) return '';

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(nextLines[0].trim());
    if (headingMatch && normalizeHeadingText(headingMatch[2]) === documentTitle) {
      nextLines[0] = `# ${documentTitle}`;
    } else {
      nextLines.unshift(`# ${documentTitle}`, '');
    }

    for (let index = 0; index < nextLines.length; index += 1) {
      const line = nextLines[index];
      const currentHeading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (currentHeading && normalizeHeadingText(currentHeading[2]) === documentTitle) {
        nextLines[index] = `${currentHeading[1]} ${documentTitle}`;
      } else {
        nextLines[index] = normalizeProjectManagementMetaLine(line);
      }
    }

    const firstHeadingIndex = nextLines.findIndex((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^#{1,6}\s+/.test(trimmed)) return true;
      if (/^\d+(?:\.\d+)*[.、]\s*\S+/.test(trimmed)) return true;
      return index > 0 && /^[-*]\s+\S+/.test(trimmed);
    });
    const preamble = firstHeadingIndex > 0 ? nextLines.slice(0, firstHeadingIndex).join('\n') : '';
    if (firstHeadingIndex > 0 && isCoverMetaBlock(preamble)) {
      return nextLines.slice(firstHeadingIndex).join('\n').trim();
    }

    const metaLabelPattern = '(?:项目名称|文档版本|版本号|版本|编制日期|日期|编制人|所属公司|所属单位|适用对象|适用周期|汇报周期|汇报人|甲方\\/客户|乙方\\/交付方)';
    return nextLines
      .join('\n')
      .replace(new RegExp(`\\s+(?=${metaLabelPattern}\\s*[:：])`, 'g'), '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function demoteMarkdownHeadings(content: string) {
    return String(content || '').replace(/^(#{1,5})(\s+)/gm, '#$1$2');
  }

  async function exportProjectManagementWord(params: {
    title: string;
    documentTitle: string;
    moduleId: string;
    outline: Array<{ id: string; title: string; description: string; hideTitle: boolean; content: string }>;
    emptyMessage?: string;
  }) {
    const exportableOutline = params.outline.filter((item) => item.content.trim());
    if (!exportableOutline.length) {
      showToast(params.emptyMessage || '请先生成或填写可导出的内容', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未注入导出服务', 'error');
      return;
    }

    const requestId = `project-management-${Date.now()}`;
    let unsubscribe: (() => void) | undefined;
    try {
      setExportProgress({
        requestId,
        moduleId: params.moduleId,
        phase: 'running',
        progress: 1,
        message: '正在准备导出 Word',
      });
      unsubscribe = window.yibiao.export.onWordExportProgress((event) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportProgress({ ...event, moduleId: params.moduleId });
      });
      const result = await window.yibiao.export.exportWord({
        requestId,
        project_name: params.title,
        document_title: params.documentTitle,
        document_profile: 'project-management',
        project_profile: profile,
        outline: exportableOutline,
      });
      if (result.canceled) {
        setExportProgress({
          requestId,
          moduleId: params.moduleId,
          phase: 'canceled',
          progress: 0,
          message: '已取消导出',
        });
        showToast('已取消导出', 'info');
        return;
      }
      if (result.success) {
        setExportProgress({
          requestId,
          moduleId: params.moduleId,
          phase: 'success',
          progress: 100,
          message: result.message || 'Word 已导出，请打开文档核对图片、表格和版式。',
        });
        showToast(result.message || '项目管理文档已导出 Word', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      setExportProgress({
        requestId,
        moduleId: params.moduleId,
        phase: 'error',
        progress: 100,
        message,
      });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function exportMarkdownWord(content: string, title: string, nodeId: string, documentTitle: string, moduleId: string) {
    const trimmedContent = normalizeProjectManagementExportContent(content, documentTitle);
    if (!trimmedContent) {
      showToast('请先生成或填写可导出的内容', 'info');
      return;
    }

    return exportProjectManagementWord({
      title,
      documentTitle,
      moduleId,
      outline: [{
        id: nodeId,
        title: documentTitle,
        description: '',
        hideTitle: false,
        content: demoteMarkdownHeadings(trimmedContent),
      }],
    });
  }

  async function exportAllProjectManagementWord() {
    const outline = modules
      .map((module) => {
        const documentTitle = moduleDocumentTitles[module.id] || module.title;
        const content = normalizeProjectManagementExportContent(moduleResults[module.id] || '', documentTitle);
        return {
          id: `project-management-${module.id}`,
          title: documentTitle,
          description: '',
          hideTitle: false,
          content: demoteMarkdownHeadings(content),
        };
      })
      .filter((item) => item.content.trim());

    const skippedCount = modules.length - outline.length;
    if (skippedCount > 0 && outline.length > 0) {
      showToast(`将导出 ${outline.length} 个已生成模块，跳过 ${skippedCount} 个空模块。`, 'info');
    }

    const documentTitle = '项目管理全套文档';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportProjectManagementWord({
      title,
      documentTitle,
      moduleId: 'all',
      outline,
      emptyMessage: '请先至少生成一个项目管理模块，再导出全套 Word',
    });
  }

  function exportPlanningWord() {
    const documentTitle = '项目启动与规划方案';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(planningResult, title, 'project-management-planning', documentTitle, 'planning');
  }

  function exportDiscoveryWord() {
    const documentTitle = '需求分析与 PRD 框架';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(discoveryResult, title, 'project-management-discovery', documentTitle, 'discovery');
  }

  function exportExecutionWord() {
    const documentTitle = '排期与推进计划';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(executionResult, title, 'project-management-execution', documentTitle, 'execution');
  }

  function exportRiskWord() {
    const documentTitle = '风险与问题应对方案';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(riskResult, title, 'project-management-risk', documentTitle, 'risk');
  }

  function exportStakeholderWord() {
    const documentTitle = '沟通与变更管理方案';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(stakeholderResult, title, 'project-management-stakeholder', documentTitle, 'stakeholder');
  }

  function exportDeliveryWord() {
    const documentTitle = '交付上线与验收方案';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(deliveryResult, title, 'project-management-delivery', documentTitle, 'delivery');
  }

  function exportReportingWord() {
    const documentTitle = '项目汇报材料';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(reportingResult, title, 'project-management-reporting', documentTitle, 'reporting');
  }

  function exportCommercialWord() {
    const documentTitle = '商务回款与续约跟进方案';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(commercialResult, title, 'project-management-commercial', documentTitle, 'commercial');
  }

  function exportRetrospectiveWord() {
    const documentTitle = '项目复盘与沉淀报告';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(retrospectiveResult, title, 'project-management-retrospective', documentTitle, 'retrospective');
  }

  function exportComplianceWord() {
    const documentTitle = '合规本土化与上线准入方案';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportMarkdownWord(complianceResult, title, 'project-management-compliance', documentTitle, 'compliance');
  }

  async function clearWorkspace() {
    try {
      const result = await window.yibiao?.projectManagement.clear();
      if (result?.state) applyState(result.state);
      showToast('项目管理工作区已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空项目管理工作区失败', 'error');
    }
  }

  if (loading) {
    return <div className="project-management-page"><div className="project-management-detail">正在读取项目管理工作区...</div></div>;
  }

  return (
    <div className="project-management-page">
      <section className="project-management-hero">
        <div>
          <div className="project-management-hero-kicker">
            <span className="section-kicker">项目管理</span>
            <ProjectManagementHelpDialog modules={modules} triggerMode="label" />
          </div>
          <h2>把项目从计划、推进、交付、复盘到合规收拢成一个工作台</h2>
          <p>
            先建立项目档案，再按启动、需求、排期、风险、沟通、交付、汇报、回款、复盘、合规的顺序推进。每个模块都会沿用同一份项目上下文。
          </p>
        </div>
      </section>

      {viewMode === 'list' ? (
        <section className="project-management-list-panel">
          <div className="project-management-list-head">
            <div>
              <span className="section-kicker">项目列表</span>
              <h3>选择一个项目继续推进，或创建新的项目</h3>
              <p>项目管理负责创建、进入、删除和继续编辑；项目历史只做归档查看和阶段预览。</p>
            </div>
            <button type="button" className="primary-action" onClick={() => setCreateProjectOpen(true)} disabled={isRunning}>创建项目</button>
          </div>
          <div className="project-management-searchbar">
            <label>
              <span>检索项目</span>
              <input
                value={projectSearchKeyword}
                onChange={(event) => setProjectSearchKeyword(event.target.value)}
                placeholder="搜索项目名称、客户、交付方、阶段、项目类型或分组"
              />
            </label>
            <small>共 {filteredProjectList.length}/{projectList.length} 个项目</small>
          </div>
          <div className="project-management-bulkbar">
            <label>
              <input
                type="checkbox"
                checked={filteredProjectList.length > 0 && selectedProjectIds.length === filteredProjectList.length}
                onChange={(event) => toggleAllVisibleProjects(event.target.checked)}
              />
              全选当前列表
            </label>
            <span>已选择 {selectedProjectIds.length} 个项目</span>
            <button type="button" className="secondary-action danger-action" onClick={() => void deleteSelectedProjects()} disabled={!selectedProjectIds.length || isRunning}>删除所选</button>
          </div>
          {!filteredProjectList.length ? (
            <div className="project-management-list-empty">
              <strong>{projectSearchKeyword.trim() ? '没有找到匹配项目' : '暂无可管理项目'}</strong>
              <p>{projectSearchKeyword.trim() ? '换个关键词试试，或清空检索条件查看全部项目。' : '点击创建项目后，即可进入 10 个阶段的项目管理工作台。'}</p>
              {projectSearchKeyword.trim() ? (
                <button type="button" className="secondary-action" onClick={() => setProjectSearchKeyword('')}>清空检索</button>
              ) : (
                <button type="button" className="secondary-action" onClick={() => setCreateProjectOpen(true)}>创建项目</button>
              )}
            </div>
          ) : (
            <div className="project-management-project-grid">
              {filteredProjectList.map((project) => (
                <article key={project.id} className={`project-management-project-card${project.isActive ? ' is-active' : ''}`}>
                  <div className="project-management-project-select">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onChange={() => toggleProjectSelection(project.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      选择
                    </label>
                    <button type="button" className="secondary-action danger-action" onClick={() => void deleteProjectFromList(project.id)} disabled={isRunning}>删除</button>
                  </div>
                  <button type="button" className="project-management-project-card-main" onClick={() => void enterProject(project.id)}>
                    <span className="section-kicker">{project.isActive ? '当前项目' : '本地项目'}</span>
                    <h3>{project.name}</h3>
                    <p>{project.clientName || '客户待确认'} · {project.projectType || '项目类型待确认'}</p>
                    <div className="project-management-project-tags">
                      <span>当前阶段：{project.currentStage || '待确认'}</span>
                      <span>类型：{project.projectType || '项目类型待确认'}</span>
                      <span>分组：{project.projectGroup || '未分组'}</span>
                      <span>交付方：{project.vendorName || '待确认'}</span>
                      <span>更新：{formatProjectManagementTime(project.updated_at)}</span>
                    </div>
                  </button>
                  <div className="project-management-project-card-foot">
                    <div>
                      <strong>{project.completedCount}/10</strong>
                      <span>阶段完成</span>
                    </div>
                    <button type="button" className="secondary-action" onClick={() => void enterProject(project.id)}>进入项目</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
      <>
      <section className="project-management-projectbar">
        <button type="button" className="secondary-action" onClick={() => setViewMode('list')} disabled={isRunning}>返回项目列表</button>
        <div>
          <span className="section-kicker">当前项目</span>
          <strong>{profile.projectName || '未命名项目'}</strong>
          <small>{profile.clientName || '客户待确认'} · {profile.projectType || '项目类型待确认'}</small>
        </div>
        <div className="project-management-projectbar-actions">
          <button type="button" className="secondary-action danger-action" onClick={() => setDeleteProjectOpen(true)} disabled={isRunning || !state?.projectId}>删除项目</button>
        </div>
      </section>

      <section className="project-management-workspace">
        <div className="project-management-flow-head">
          <div>
            <span className="section-kicker">项目流程</span>
            <strong>已完成 {completedCount}/{modules.length} 个模块</strong>
            <small>
              {suggestedModule
                ? currentModuleDone
                  ? `建议下一步：${suggestedModule.label}`
                  : `当前建议：先完成${suggestedModule.label}`
                : '10 个模块已全部生成，可进入复盘、导出和归档。'}
            </small>
          </div>
          <div className="project-management-flow-actions">
            <button type="button" className="secondary-action" onClick={() => void exportAllProjectManagementWord()} disabled={isRunning || exporting || completedCount === 0}>
              {exporting && exportProgress?.moduleId === 'all' ? '导出中...' : '导出全套 Word'}
            </button>
          </div>
        </div>
        {allExportProgress && (
          <div className={`project-management-export is-${allExportProgress.phase}`}>
            <span>{allExportProgress.message}</span>
            <strong>{allExportProgress.progress}%</strong>
          </div>
        )}

        <nav className="project-management-tabs" aria-label="项目管理二级模块">
          {modules.map((module, index) => {
            const isDone = completedModuleIds.has(module.id);
            const isSuggested = suggestedModule?.id === module.id;
            return (
              <button
                key={module.id}
                type="button"
                className={`${module.id === activeModule.id ? 'is-active' : ''}${isDone ? ' is-done' : ''}${isSuggested ? ' is-suggested' : ''}`}
                onClick={() => setActiveModuleId(module.id)}
                title={module.title}
              >
                <span>{module.label}</span>
                <small>{isDone ? '已生成' : isSuggested ? '下一步' : `${index + 1}`}</small>
              </button>
            );
          })}
        </nav>

        <div className="project-management-layout">
          <article className="project-management-detail">
            <ModuleIntro module={activeModule} />
            {isPlanningModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">项目档案</span>
                      <h4>先把项目基本盘写清楚</h4>
                    </div>
                    <button type="button" className="secondary-action" onClick={() => void saveProfile()} disabled={isRunning}>保存档案</button>
                  </div>
                  <div className="project-management-form-grid">
                    {profileFields.map((field) => (
                      <label className={field.wide ? 'is-wide' : ''} key={field.key}>
                        <span>{field.label}</span>
                        {field.multiline ? (
                          <textarea value={profile[field.key]} onChange={(event) => updateProfileField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                        ) : field.key === 'projectType' ? (
                          <ProjectDictionarySelect
                            value={profile.projectType}
                            options={projectTypeOptions}
                            placeholder="选择项目类型"
                            addLabel="新增类型"
                            onChange={(value) => updateProfileField('projectType', value)}
                            disabled={isRunning}
                          />
                        ) : field.key === 'projectGroup' ? (
                          <ProjectDictionarySelect
                            value={profile.projectGroup}
                            options={projectGroupOptions}
                            placeholder="选择或新增项目分组"
                            addLabel="新增分组"
                            onChange={(value) => updateProfileField('projectGroup', value)}
                            disabled={isRunning}
                          />
                        ) : (
                          <input type={field.key === 'startDate' || field.key === 'endDate' ? 'date' : 'text'} value={profile[field.key]} onChange={(event) => updateProfileField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                        )}
                      </label>
                    ))}
                  </div>
                </section>

                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">启动材料</span>
                      <h4>生成启动与规划方案</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void savePlanningInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generatePlanning()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成启动规划'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {planningInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={planningInput[field.key]} onChange={(event) => updatePlanningInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">规划方案</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('planning')}>
                        {resultModes.planning === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void savePlanningResult()} disabled={isRunning}>保存方案</button>
                      <button type="button" className="primary-action" onClick={() => void exportPlanningWord()} disabled={isRunning || exporting || !planningResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.planning === 'edit' ? (
                    <MarkdownEditor value={planningResult} onChange={setPlanningResult} placeholder="生成的项目启动与规划方案会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {planningResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{planningResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isDiscoveryModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">需求材料</span>
                      <h4>从访谈和诉求整理 PRD 框架</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveDiscoveryInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateDiscovery()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成需求 PRD'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {discoveryInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={discoveryInput[field.key]} onChange={(event) => updateDiscoveryInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">需求与 PRD</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('discovery')}>
                        {resultModes.discovery === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveDiscoveryResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportDiscoveryWord()} disabled={isRunning || exporting || !discoveryResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.discovery === 'edit' ? (
                    <MarkdownEditor value={discoveryResult} onChange={setDiscoveryResult} placeholder="生成的需求分析与 PRD 框架会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {discoveryResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{discoveryResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isExecutionModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">排期材料</span>
                      <h4>把任务、资源和节奏拆成推进计划</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveExecutionInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateExecution()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成排期计划'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {executionInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={executionInput[field.key]} onChange={(event) => updateExecutionInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">排期与推进</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('execution')}>
                        {resultModes.execution === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveExecutionResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportExecutionWord()} disabled={isRunning || exporting || !executionResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.execution === 'edit' ? (
                    <MarkdownEditor value={executionResult} onChange={setExecutionResult} placeholder="生成的排期与推进计划会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {executionResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{executionResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isRiskModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">风险材料</span>
                      <h4>识别风险、问题和升级路径</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveRiskInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateRisk()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成风险方案'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {riskInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={riskInput[field.key]} onChange={(event) => updateRiskInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">风险问题</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('risk')}>
                        {resultModes.risk === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveRiskResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportRiskWord()} disabled={isRunning || exporting || !riskResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.risk === 'edit' ? (
                    <MarkdownEditor value={riskResult} onChange={setRiskResult} placeholder="生成的风险与问题应对方案会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {riskResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{riskResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isStakeholderModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">沟通变更材料</span>
                      <h4>管理干系人、分歧和变更留痕</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveStakeholderInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateStakeholder()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成沟通方案'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {stakeholderInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={stakeholderInput[field.key]} onChange={(event) => updateStakeholderInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">沟通变更</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('stakeholder')}>
                        {resultModes.stakeholder === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveStakeholderResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportStakeholderWord()} disabled={isRunning || exporting || !stakeholderResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.stakeholder === 'edit' ? (
                    <MarkdownEditor value={stakeholderResult} onChange={setStakeholderResult} placeholder="生成的沟通与变更管理方案会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {stakeholderResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{stakeholderResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isDeliveryModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">交付上线材料</span>
                      <h4>准备测试、验收、上线和交接</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveDeliveryInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateDelivery()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成交付方案'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {deliveryInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={deliveryInput[field.key]} onChange={(event) => updateDeliveryInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">交付上线</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('delivery')}>
                        {resultModes.delivery === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveDeliveryResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportDeliveryWord()} disabled={isRunning || exporting || !deliveryResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.delivery === 'edit' ? (
                    <MarkdownEditor value={deliveryResult} onChange={setDeliveryResult} placeholder="生成的交付上线与验收方案会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {deliveryResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{deliveryResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isReportingModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">汇报材料</span>
                      <h4>整理周报、月报和管理层汇报</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveReportingInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateReporting()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成汇报材料'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {reportingInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={reportingInput[field.key]} onChange={(event) => updateReportingInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">汇报周月报</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('reporting')}>
                        {resultModes.reporting === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveReportingResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportReportingWord()} disabled={isRunning || exporting || !reportingResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.reporting === 'edit' ? (
                    <MarkdownEditor value={reportingResult} onChange={setReportingResult} placeholder="生成的项目汇报材料会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {reportingResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{reportingResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isCommercialModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">商务回款材料</span>
                      <h4>跟踪合同、验收、开票和回款</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveCommercialInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateCommercial()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成回款方案'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {commercialInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={commercialInput[field.key]} onChange={(event) => updateCommercialInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">商务回款</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('commercial')}>
                        {resultModes.commercial === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveCommercialResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportCommercialWord()} disabled={isRunning || exporting || !commercialResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.commercial === 'edit' ? (
                    <MarkdownEditor value={commercialResult} onChange={setCommercialResult} placeholder="生成的商务回款与续约跟进方案会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {commercialResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{commercialResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isRetrospectiveModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">复盘材料</span>
                      <h4>沉淀项目经验、案例和 SOP</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveRetrospectiveInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateRetrospective()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成复盘报告'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {retrospectiveInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={retrospectiveInput[field.key]} onChange={(event) => updateRetrospectiveInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">复盘沉淀</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('retrospective')}>
                        {resultModes.retrospective === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveRetrospectiveResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportRetrospectiveWord()} disabled={isRunning || exporting || !retrospectiveResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.retrospective === 'edit' ? (
                    <MarkdownEditor value={retrospectiveResult} onChange={setRetrospectiveResult} placeholder="生成的项目复盘与沉淀报告会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {retrospectiveResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{retrospectiveResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : isComplianceModule ? (
              <div className="project-management-mvp">
                <section className="project-management-form-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">合规本土化材料</span>
                      <h4>梳理备案、安全、数据和上线准入</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => void saveComplianceInput()} disabled={isRunning}>保存材料</button>
                      <button type="button" className="primary-action" onClick={() => void generateCompliance()} disabled={isRunning}>
                        {isRunning ? '生成中...' : '生成合规方案'}
                      </button>
                    </div>
                  </div>
                  <div className="project-management-input-grid">
                    {complianceInputFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea value={complianceInput[field.key]} onChange={(event) => updateComplianceInputField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                      </label>
                    ))}
                  </div>
                </section>
                <ProjectManagementTaskStatus task={visibleTask} />

                <section className="project-management-result-panel">
                  <div className="project-management-panel-head">
                    <div>
                      <span className="section-kicker">合规本土化</span>
                      <h4>生成后可继续编辑保存</h4>
                    </div>
                    <div className="project-management-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleResultMode('compliance')}>
                        {resultModes.compliance === 'edit' ? '预览' : '编辑'}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void saveComplianceResult()} disabled={isRunning}>保存结果</button>
                      <button type="button" className="primary-action" onClick={() => void exportComplianceWord()} disabled={isRunning || exporting || !complianceResult.trim()}>
                        {exporting ? '导出中...' : '导出 Word'}
                      </button>
                    </div>
                  </div>
                  {activeExportProgress && (
                    <div className={`project-management-export is-${activeExportProgress.phase}`}>
                      <span>{activeExportProgress.message}</span>
                      <strong>{activeExportProgress.progress}%</strong>
                    </div>
                  )}
                  {resultModes.compliance === 'edit' ? (
                    <MarkdownEditor value={complianceResult} onChange={setComplianceResult} placeholder="生成的合规本土化与上线准入方案会显示在这里，也可以先手动编写。" disabled={isRunning} />
                  ) : (
                    <div className="project-management-preview">
                      {complianceResult.trim() ? <MarkdownRenderer allowRawHtml={false}>{complianceResult}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <ModulePlaceholder module={activeModule} />
            )}
          </article>

          <aside className="project-management-side">
            <span className="section-kicker">工作区状态</span>
            <h3>{profile.projectName || '未命名项目'}</h3>
            <p>10 个模块共用同一份项目上下文，前面模块生成的结果会作为后续模块的参考材料。</p>
            {suggestedModule && (
              <div className="project-management-next-card">
                <span>{currentModuleDone ? '建议下一步' : '当前重点'}</span>
                <strong>{suggestedModule.label}</strong>
                <p>{suggestedModule.promptHint}</p>
                {suggestedModule.id !== activeModule.id && (
                  <button type="button" className="secondary-action" onClick={() => setActiveModuleId(suggestedModule.id)}>
                    前往{suggestedModule.label}
                  </button>
                )}
              </div>
            )}
            <div className="project-management-roadmap">
              <span>模块进度：{completedCount}/{modules.length}</span>
              <span>当前阶段：{profile.currentStage || '待确认'}</span>
              <span>客户：{profile.clientName || '待确认'}</span>
              <span>交付方：{profile.vendorName || '待确认'}</span>
              <span>更新时间：{state?.updated_at ? new Date(state.updated_at).toLocaleString() : '暂无'}</span>
            </div>
            <button type="button" className="secondary-action project-management-clear" onClick={() => void clearWorkspace()} disabled={isRunning}>清空工作区</button>
          </aside>
        </div>
      </section>
      </>
      )}

      <Dialog.Root open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-management-project-dialog">
            <div className="project-management-help-head">
              <div>
                <Dialog.Title>新建项目</Dialog.Title>
                <Dialog.Description>创建后会立即进入新的项目管理流程，原项目会保留在项目列表和项目历史中。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭新建项目">×</Dialog.Close>
            </div>
            <div className="project-management-form-grid">
              <label>
                项目名称
                <input value={newProjectProfile.projectName || ''} onChange={(event) => setNewProjectProfile((current) => ({ ...current, projectName: event.target.value }))} placeholder="例如：商户小程序会员系统" />
              </label>
              <label>
                甲方/客户
                <input value={newProjectProfile.clientName || ''} onChange={(event) => setNewProjectProfile((current) => ({ ...current, clientName: event.target.value }))} placeholder="例如：清河万象汇" />
              </label>
              <label>
                乙方/交付方
                <input value={newProjectProfile.vendorName || ''} onChange={(event) => setNewProjectProfile((current) => ({ ...current, vendorName: event.target.value }))} placeholder="例如：禹都科技" />
              </label>
              <label>
                项目类型
                <ProjectDictionarySelect
                  value={newProjectProfile.projectType || ''}
                  options={projectTypeOptions}
                  placeholder="选择项目类型"
                  addLabel="新增类型"
                  onChange={(value) => setNewProjectProfile((current) => ({ ...current, projectType: value }))}
                />
              </label>
              <label>
                项目分组
                <ProjectDictionarySelect
                  value={newProjectProfile.projectGroup || ''}
                  options={projectGroupOptions}
                  placeholder="选择或新增项目分组"
                  addLabel="新增分组"
                  onChange={(value) => setNewProjectProfile((current) => ({ ...current, projectGroup: value }))}
                />
              </label>
            </div>
            <div className="project-management-help-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={() => void createProject()}>创建并进入</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-management-project-dialog is-danger">
            <div className="project-management-help-head">
              <div>
                <Dialog.Title>删除当前项目？</Dialog.Title>
                <Dialog.Description>将删除“{profile.projectName || '未命名项目'}”的 10 个阶段内容和项目档案。删除后会自动切换到其他项目或新建空项目。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭删除项目">×</Dialog.Close>
            </div>
            <div className="project-management-help-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="primary-action danger-action-solid" onClick={() => void deleteCurrentProject()}>确认删除</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

interface ProjectDictionarySelectProps {
  value: string;
  options: string[];
  placeholder: string;
  addLabel: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function ProjectDictionarySelect({ value, options, placeholder, addLabel, onChange, disabled }: ProjectDictionarySelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const normalizedOptions = useMemo(() => Array.from(new Set([...options, value].map((item) => item.trim()).filter(Boolean))), [options, value]);
  const visibleOptions = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return normalizedOptions;
    return normalizedOptions.filter((item) => item.toLowerCase().includes(query));
  }, [keyword, normalizedOptions]);
  const needsSearch = normalizedOptions.length > 8;

  useEffect(() => {
    if (!open) return undefined;
    function closeSelect() {
      setOpen(false);
      setCustomMode(false);
      setKeyword('');
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      closeSelect();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSelect();
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  function commitCustom() {
    const nextValue = draft.trim();
    if (!nextValue) return;
    onChange(nextValue);
    setDraft('');
    setKeyword('');
    setCustomMode(false);
    setOpen(false);
  }

  return (
    <div className="project-management-select" ref={rootRef}>
      <button
        type="button"
        className={`project-management-select-trigger${value ? '' : ' is-placeholder'}`}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setCustomMode(false);
        }}
        disabled={disabled}
      >
        <span>{value || placeholder}</span>
        <b>⌄</b>
      </button>
      {open ? (
        <div className="project-management-select-menu">
          {needsSearch ? (
            <input
              className="project-management-select-search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索选项"
              autoFocus
            />
          ) : null}
          <div className="project-management-select-options">
            {visibleOptions.length ? visibleOptions.map((item) => (
              <button
                type="button"
                className={item === value ? 'is-active' : ''}
                key={item}
                onClick={() => {
                  onChange(item);
                  setKeyword('');
                  setOpen(false);
                }}
              >
                {item}
              </button>
            )) : <p>没有匹配项，可在下方新增。</p>}
          </div>
          {customMode ? (
            <div className="project-management-select-custom">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={addLabel.replace('新增', '输入新')} autoFocus />
              <div className="project-management-select-custom-actions">
                <button type="button" onClick={() => { setCustomMode(false); setDraft(''); }}>取消</button>
                <button type="button" onClick={commitCustom}>确定</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="project-management-select-add"
              onClick={() => {
                setDraft(keyword.trim());
                setCustomMode(true);
              }}
            >
              + {addLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModuleIntro({ module }: { module: ProjectManagementModule }) {
  return (
    <>
      <div className="project-management-detail-head">
        <div>
          <span className="section-kicker">{module.label}</span>
          <h3>{module.title}</h3>
          <p>{module.description}</p>
        </div>
        <span className="project-management-source">{module.source}</span>
      </div>
      <div className="project-management-section-grid">
        <InfoBlock title="核心交付物" items={module.deliverables} />
        <InfoBlock title="方法框架" items={module.methods} />
        <InfoBlock title="适用场景" items={module.scenarios} />
        <InfoBlock title="推荐图表" items={module.diagrams} />
      </div>
    </>
  );
}

function ProjectManagementTaskStatus({ task }: { task?: ProjectManagementTask }) {
  if (!task) return null;

  const running = task.status === 'running';
  const progress = running
    ? Math.max(12, Math.min(92, task.progress || 12))
    : Math.max(0, Math.min(100, task.progress || 0));

  return (
    <section className={`project-management-task is-${task.status}${running ? ' is-running' : ''}`}>
      <div>
        <strong>{task.message}</strong>
        <span>{running ? '持续生成中' : `${progress}%`}</span>
      </div>
      <i><b style={{ width: `${progress}%` }} /></i>
      {running && <p>模型正在处理完整文档，期间进度条会持续活动；完成后会一次性写入结果。</p>}
    </section>
  );
}

function ProjectManagementHelpDialog({ modules, triggerMode = 'button' }: { modules: ProjectManagementModule[]; triggerMode?: 'button' | 'label' }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={triggerMode === 'label' ? 'project-management-help-label' : 'secondary-action project-management-help-trigger'}
        >
          如何使用？
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="project-management-help-card">
          <div className="project-management-help-head">
            <div>
              <Dialog.Title>项目管理使用方法</Dialog.Title>
              <Dialog.Description>
                按项目从启动到收尾的顺序推进，每一步生成的结果会自动成为后续步骤的上下文。
              </Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭项目管理使用方法">×</Dialog.Close>
          </div>
          <div className="project-management-help-body">
            <section>
              <h4>推荐流程</h4>
              <ol>
                <li>先在“启动与规划”填写项目档案、项目背景、目标、范围和已知风险，生成项目基线。</li>
                <li>继续进入“需求与 PRD”，把客户访谈和功能诉求整理成需求边界、优先级和验收标准。</li>
                <li>按“排期与推进、风险问题、沟通变更、交付上线”的顺序，把计划落到执行动作。</li>
                <li>项目过程中可随时生成“汇报周月报”和“商务回款”，结项后再做“复盘沉淀”和“合规本土化”。</li>
              </ol>
            </section>
            <section>
              <h4>模块顺序</h4>
              <div className="project-management-help-modules">
                {modules.map((module, index) => (
                  <span key={module.id}>{index + 1}. {module.label}</span>
                ))}
              </div>
            </section>
            <section>
              <h4>使用提示</h4>
              <p>不必一次填满所有字段。先填关键事实生成初稿，再在结果区编辑、保存或导出 Word；后续模块会优先读取已保存和已生成的内容。每个模块会同步生成 Mermaid 阶段图表，预览时可查看，导出 Word 时会转成图片。</p>
            </section>
          </div>
          <div className="project-management-help-actions">
            <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModulePlaceholder({ module }: { module: ProjectManagementModule }) {
  return (
    <div className="project-management-prompt">
      <span>模块说明</span>
      <p>{module.promptHint}</p>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h4>{title}</h4>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

export default ProjectManagementPage;
