import type { AppMenuGroup, AppMenuItem, SectionId } from '../shared/types/navigation';

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

const softwareCopyrightMenuItems: AppMenuItem[] = [
  {
    id: 'code-generation',
    label: '代码生成',
    description: '软著源码材料准备',
  },
  {
    id: 'software-copyright',
    label: '软著生成',
    description: '申请表、手册与代码材料',
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

export function getAppMenuGroups(developerMode: boolean): AppMenuGroup[] {
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

export function getAppMenuItems(developerMode: boolean): AppMenuItem[] {
  return getAppMenuGroups(developerMode).flatMap((group) => group.items);
}

export function getSectionOrder(developerMode: boolean): SectionId[] {
  return getAppMenuItems(developerMode).map((item) => item.id);
}
