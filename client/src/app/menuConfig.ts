import type { AppMenuGroup, AppMenuItem, SectionId } from '../shared/types/navigation';
import type { FeatureModuleId, FeatureModuleSettings } from '../shared/types';

export const configurableFeatureModules: Array<{ id: FeatureModuleId; label: string; description: string }> = [
  { id: 'presales', label: '售前工作台', description: '客户材料分析、调研准备、方案架构、图表和汇报材料' },
  { id: 'bid', label: '招投标', description: '技术方案、商务标、知识库、查重、废标项检查和投标机会' },
  { id: 'official-document', label: '公文写作', description: '智能起草、格式检查、润色改写和模板库' },
  { id: 'grant-application', label: '课题申报', description: '启动诊断、选题政策、申报书撰写、评审优化和答辩' },
  { id: 'project-management', label: '项目协作', description: '项目类型、项目管理和项目历史' },
  { id: 'thesis-tutor', label: '论文导师', description: '诊断、选题、综述、研究设计、图表、成稿和评审' },
  { id: 'copyright', label: '软件著作', description: '软著项目管理、源码准备和申请材料生成' },
  { id: 'patent', label: '专利生成', description: '专利挖掘、交底书生成、查新分析和修订迭代' },
];

export const appMenuItems: AppMenuItem[] = [
  {
    id: 'technical-plan',
    label: '技术方案',
    description: '方案生成与正文编排',
  },
  {
    id: 'existing-plan-expansion',
    label: '已有方案扩写',
    description: '基于已有方案优化扩充',
  },
  {
    id: 'business-bid',
    label: '商务标',
    description: '商务响应与报价材料',
  },
  {
    id: 'knowledge-base',
    label: '知识库',
    description: '素材、模板和案例资产',
  },
  {
    id: 'duplicate-check',
    label: '标书查重',
    description: '相似度与重复表达检测',
  },
  {
    id: 'rejection-check',
    label: '废标项检查',
    description: '硬性条款与响应完整性',
  },
  {
    id: 'bid-opportunity',
    label: '投标机会',
    description: '机会发现与线索跟踪',
  },
];

const presalesMenuItems: AppMenuItem[] = [
  {
    id: 'presales-projects',
    label: '售前项目',
    description: '创建、检索和管理售前项目',
  },
  {
    id: 'presales-workbench',
    label: '售前工作台',
    description: '进入项目后的分析与交付',
  },
];

const projectManagementMenuItems: AppMenuItem[] = [
  {
    id: 'project-types',
    label: '项目类型',
    description: '类型与分组字典管理',
  },
  {
    id: 'project-management',
    label: '项目管理',
    description: '计划、执行、汇报、复盘和合规',
  },
  {
    id: 'project-history',
    label: '项目历史',
    description: '项目列表、阶段产出和预览',
  },
];

const softwareCopyrightMenuItems: AppMenuItem[] = [
  {
    id: 'software-copyright',
    label: '软著项目',
    description: '创建、检索和管理软著项目',
  },
  {
    id: 'code-generation',
    label: '源码准备',
    description: '当前软著项目的源码材料准备',
  },
];

const officialDocumentMenuItems: AppMenuItem[] = [
  {
    id: 'official-document-drafting',
    label: '智能起草',
    description: '通知、请示、报告等公文材料',
  },
  {
    id: 'official-document-check',
    label: '格式检查',
    description: '文种、结构和降 AI 味检查',
  },
  {
    id: 'official-document-polish',
    label: '润色改写',
    description: '公文草稿优化与定向改写',
  },
  {
    id: 'official-document-templates',
    label: '模板库',
    description: '常用公文场景模板',
  },
];

const grantApplicationMenuItems: AppMenuItem[] = [
  {
    id: 'grant-projects',
    label: '课题项目',
    description: '创建、检索和管理课题申报项目',
  },
  {
    id: 'grant-diagnosis',
    label: '启动诊断',
    description: '级别、学科、材料和流程判断',
  },
  {
    id: 'grant-topic-policy',
    label: '选题与政策',
    description: '政策情报、选题评估和文献空白',
  },
  {
    id: 'grant-proposal',
    label: '申报书撰写',
    description: '框架、正文、前期基础和导出',
  },
  {
    id: 'grant-review-defense',
    label: '评审优化与答辩',
    description: '八维检测、成果汇编和答辩演练',
  },
];

const thesisTutorMenuItems: AppMenuItem[] = [
  {
    id: 'thesis-diagnosis',
    label: '启动诊断',
    description: '定位阶段与路径安排',
  },
  {
    id: 'thesis-topic',
    label: '选题与开题',
    description: '选题评估与开题框架',
  },
  {
    id: 'thesis-literature',
    label: '文献综述',
    description: '检索策略与综述组织',
  },
  {
    id: 'thesis-methodology',
    label: '研究设计',
    description: '方法、数据与技术路线',
  },
  {
    id: 'thesis-data',
    label: '数据与实证',
    description: '数据预检与分析路线',
  },
  {
    id: 'thesis-charts',
    label: '图表与模型图',
    description: '研究框架与技术路线图',
  },
  {
    id: 'thesis-drafting',
    label: '自动成稿',
    description: '基于材料生成论文初稿',
  },
  {
    id: 'thesis-writing',
    label: '逐章写作',
    description: '文献驱动正文与批注',
  },
  {
    id: 'thesis-review',
    label: '评审与答辩',
    description: '修改清单与答辩准备',
  },
  {
    id: 'thesis-format',
    label: '格式与查重',
    description: '引用、排版和降 AI 味',
  },
];

const patentMenuItems: AppMenuItem[] = [
  {
    id: 'patent-mining',
    label: '专利挖掘',
    description: '项目扫描与专利点分析',
  },
  {
    id: 'patent-disclosure',
    label: '交底书生成',
    description: '技术交底书撰写与导出',
  },
  {
    id: 'patent-prior-art',
    label: '查新分析',
    description: '现有技术检索与差异分析',
  },
  {
    id: 'patent-iteration',
    label: '修订迭代',
    description: '补充材料、纠错和版本留档',
  },
];

const developerMenuItems: AppMenuItem[] = [
  {
    id: 'developer-test',
    label: '测试页',
    description: '开发者问题复现入口',
  },
];

function isFeatureModuleEnabled(moduleSettings: FeatureModuleSettings | null | undefined, moduleId: FeatureModuleId) {
  return moduleSettings?.modules?.[moduleId]?.enabled !== false;
}

export function getSectionModuleId(sectionId: SectionId): FeatureModuleId | null {
  const moduleGroups = getFeatureModuleMenuGroups();
  return moduleGroups.find((group) => group.items.some((item) => item.id === sectionId))?.id as FeatureModuleId | null;
}

function getFeatureModuleMenuGroups(): Array<AppMenuGroup & { id: FeatureModuleId }> {
  return [
    {
      id: 'presales',
      label: '售前工作台',
      items: presalesMenuItems,
    },
    {
      id: 'bid',
      label: '招投标',
      items: appMenuItems,
    },
    {
      id: 'official-document',
      label: '公文写作',
      items: officialDocumentMenuItems,
    },
    {
      id: 'grant-application',
      label: '课题申报',
      items: grantApplicationMenuItems,
    },
    {
      id: 'project-management',
      label: '项目协作',
      items: projectManagementMenuItems,
    },
    {
      id: 'thesis-tutor',
      label: '论文导师',
      items: thesisTutorMenuItems,
    },
    {
      id: 'copyright',
      label: '软件著作',
      items: softwareCopyrightMenuItems,
    },
    {
      id: 'patent',
      label: '专利生成',
      items: patentMenuItems,
    },
  ];
}

export function getAppMenuGroups(developerMode: boolean, moduleSettings?: FeatureModuleSettings | null): AppMenuGroup[] {
  const groups: AppMenuGroup[] = [
    {
      id: 'workspace',
      label: '工作台',
      items: [{
        id: 'home',
        label: '首页',
        description: '产品概览与能力统计',
      }],
    },
    ...getFeatureModuleMenuGroups().filter((group) => isFeatureModuleEnabled(moduleSettings, group.id)),
  ];

  if (!developerMode) {
    return groups;
  }

  return [
    ...groups,
    {
      id: 'developer',
      label: '开发调试',
      items: developerMenuItems,
    },
  ];
}

export function getAppMenuItems(developerMode: boolean, moduleSettings?: FeatureModuleSettings | null): AppMenuItem[] {
  return getAppMenuGroups(developerMode, moduleSettings).flatMap((group) => group.items);
}

export function getSectionOrder(developerMode: boolean, moduleSettings?: FeatureModuleSettings | null): SectionId[] {
  return getAppMenuItems(developerMode, moduleSettings).map((item) => item.id);
}

export function isSectionVisible(sectionId: SectionId, developerMode: boolean, moduleSettings?: FeatureModuleSettings | null) {
  if (sectionId === 'settings' || sectionId === 'home') {
    return true;
  }
  if (sectionId === 'developer-test') {
    return developerMode;
  }
  const moduleId = getSectionModuleId(sectionId);
  return moduleId ? isFeatureModuleEnabled(moduleSettings, moduleId) : true;
}
