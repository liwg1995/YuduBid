import type { AppMenuGroup, AppMenuItem, SectionId } from '../shared/types/navigation';

export const appMenuItems: AppMenuItem[] = [
  {
    id: 'technical-plan',
    label: '技术方案',
    description: '方案生成与正文编排',
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
      id: 'bid',
      label: '招投标',
      items: appMenuItems,
    },
    {
      id: 'copyright',
      label: '软件著作',
      items: softwareCopyrightMenuItems,
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
