export type OfficialDocumentType =
  | '通知'
  | '请示'
  | '报告'
  | '函'
  | '纪要'
  | '工作方案'
  | '工作总结'
  | '讲话稿'
  | '调研报告'
  | '宣传稿';

export interface OfficialDocumentPromptInput {
  documentType: OfficialDocumentType;
  scenario: string;
  issuer: string;
  recipient: string;
  audienceRelation: string;
  facts: string;
  tone: string;
  length: string;
  needTitle: boolean;
  needSignature: boolean;
  specialRequirements: string;
}

export interface OfficialDocumentTemplate {
  id: string;
  name: string;
  description: string;
  documentType: OfficialDocumentType;
  audienceRelation: string;
  input: Partial<OfficialDocumentPromptInput>;
  outline: string[];
}

export const officialDocumentTypes: OfficialDocumentType[] = [
  '通知',
  '请示',
  '报告',
  '函',
  '纪要',
  '工作方案',
  '工作总结',
  '讲话稿',
  '调研报告',
  '宣传稿',
];

export const officialDocumentTemplates: OfficialDocumentTemplate[] = [
  {
    id: 'notice-deployment',
    name: '工作部署通知',
    description: '适合布置专项排查、材料报送、会议安排、工作落实等事项。',
    documentType: '通知',
    audienceRelation: '下行',
    input: {
      documentType: '通知',
      audienceRelation: '下行',
      scenario: '部署〔专项工作/排查整改/材料报送〕',
      facts: [
        '背景依据：根据〔文件/会议/工作安排〕要求，为〔直接目的〕。',
        '工作事项：请〔对象〕围绕〔事项〕开展〔具体动作〕。',
        '责任分工：〔牵头单位/责任科室〕负责〔任务〕，〔配合单位〕做好〔任务〕。',
        '时间节点：请于〔日期〕前完成〔成果/材料〕并报送〔单位/联系人〕。',
        '工作要求：材料应包括〔范围、标准、数据、问题清单、整改措施〕。',
      ].join('\n'),
      tone: '明确、平实、可执行',
      length: '约 800 字',
      specialRequirements: '减少意义铺陈，重点写清事项、责任、时限和反馈路径。',
    },
    outline: ['依据/背景', '工作事项', '具体要求', '报送时限', '联系方式或反馈路径'],
  },
  {
    id: 'request-approval',
    name: '事项审批请示',
    description: '适合向上级请求批准、支持、协调或明确办理意见。',
    documentType: '请示',
    audienceRelation: '上行',
    input: {
      documentType: '请示',
      audienceRelation: '上行',
      scenario: '请求批准〔事项〕',
      facts: [
        '请示事项：拟申请〔批准/支持/协调〕〔具体事项〕。',
        '缘由依据：因〔背景/政策/工作需要〕，目前存在〔困难/问题〕。',
        '必要性：该事项关系到〔工作目标/群众需求/项目推进〕。',
        '请求内容：请批准〔事项一〕；请支持〔事项二〕；请明确〔事项三〕。',
        '补充说明：涉及经费、人员、时间、风险等情况为〔具体信息〕。',
      ].join('\n'),
      tone: '审慎、简明、尊重程序',
      length: '约 700 字',
      specialRequirements: '坚持一文一事，结尾使用“妥否，请批示。”，不得写成工作总结。',
    },
    outline: ['请示缘由', '依据或困难', '请求事项', '结尾请批示'],
  },
  {
    id: 'report-progress',
    name: '工作进展报告',
    description: '适合向上级汇报阶段工作、反映问题、说明下一步安排。',
    documentType: '报告',
    audienceRelation: '上行',
    input: {
      documentType: '报告',
      audienceRelation: '上行',
      scenario: '汇报〔阶段/专项〕工作进展',
      facts: [
        '总体情况：截至〔日期〕，已完成〔工作量/节点/覆盖范围〕。',
        '主要做法：围绕〔任务〕，采取〔机制/流程/措施〕。',
        '阶段成效：形成〔成果/台账/机制〕，解决〔问题〕，数据为〔数字〕。',
        '存在问题：目前仍有〔问题表现〕，原因包括〔原因〕。',
        '下一步安排：将于〔时间〕前推进〔任务〕，由〔责任主体〕负责。',
      ].join('\n'),
      tone: '客观、完整、问题导向',
      length: '约 1200 字',
      specialRequirements: '不得夹带“请予批准”等请示事项；成绩、问题和下一步安排都要具体。',
    },
    outline: ['总体情况', '主要做法', '阶段成效', '问题不足', '下一步安排'],
  },
  {
    id: 'letter-consultation',
    name: '商洽函',
    description: '适合不相隶属单位之间沟通协作、征询意见、请求协助。',
    documentType: '函',
    audienceRelation: '平行',
    input: {
      documentType: '函',
      audienceRelation: '平行',
      scenario: '商洽〔协作/征询/办理〕事项',
      facts: [
        '来由：为推进〔事项〕，需与贵单位商洽〔内容〕。',
        '商洽事项：拟请贵单位协助〔事项一〕、提供〔材料/意见〕、明确〔口径〕。',
        '时间要求：请于〔日期〕前反馈〔意见/材料〕。',
        '对接方式：联系人为〔姓名/部门/电话〕。',
      ].join('\n'),
      tone: '平等、礼貌、具体',
      length: '约 600 字',
      specialRequirements: '避免命令口吻，结尾可用“专此函达，盼复。”',
    },
    outline: ['来由', '商洽事项', '反馈要求', '结尾盼复'],
  },
  {
    id: 'plan-implementation',
    name: '专项工作方案',
    description: '适合安排治理、活动、整改、专项行动等组织实施路径。',
    documentType: '工作方案',
    audienceRelation: '下行',
    input: {
      documentType: '工作方案',
      audienceRelation: '下行',
      scenario: '制定〔专项工作〕实施方案',
      facts: [
        '目标任务：围绕〔目标〕，完成〔工作成果/指标〕。',
        '重点任务：一是〔任务〕；二是〔任务〕；三是〔任务〕。',
        '实施步骤：准备阶段〔时间〕，推进阶段〔时间〕，总结阶段〔时间〕。',
        '责任分工：〔单位/科室〕牵头，〔单位/科室〕配合。',
        '保障措施：建立〔调度/督查/反馈〕机制，定期通报进展。',
      ].join('\n'),
      tone: '具体、可执行、责任清晰',
      length: '约 1500 字',
      specialRequirements: '措施要对应问题，避免只写原则和口号。',
    },
    outline: ['目标要求', '重点任务', '实施步骤', '责任分工', '保障措施'],
  },
];

export const officialDocumentTypeNotes: Record<OfficialDocumentType, string> = {
  通知: '用于下行或平行告知办理、执行、周知事项，重点写清对象、事项、责任、时限。',
  请示: '用于向上级请求指示、批准或支持，坚持一文一事，一般只送一个主送机关。',
  报告: '用于向上级汇报工作、反映情况或答复询问，不夹带请示事项。',
  函: '用于不相隶属机关之间商洽、询问、答复或请求批准，语气平等礼貌。',
  纪要: '用于记载会议主要情况和议定事项，写清会议认为、议定、要求和落实责任。',
  工作方案: '用于专项任务组织实施，重点写目标、任务、步骤、分工和保障。',
  工作总结: '用于阶段工作回顾，写总体情况、做法成效、问题不足和下步安排。',
  讲话稿: '用于会议、活动、座谈发言，可有判断和动员，但必须落到具体工作。',
  调研报告: '用于反映调研结果，结构为背景、现状、问题原因、对策建议。',
  宣传稿: '用于面向公众展示政策、活动或典型，表达可更生动但避免过度拔高。',
};

const officialDocumentSystemRules = [
  '你是党政机关公文和事务文书写作助手，输出中文，文风稳妥、克制、具体、可交付。',
  '先判断文种、行文关系和用途是否匹配；如用户指定文种明显不合适，应在不编造事实的前提下修正结构或简要提示。',
  '不得编造法律法规、文件名称、会议、领导、人名、数字、部门、预算、日期、成果或批复。',
  '正式公文默认包含标题、主送机关、正文、落款和日期；发文字号、附件、抄送、版记仅在用户提供或明确要求时写。',
  '正文优先写事实、任务、责任、时限、反馈路径，再写必要判断。避免空泛套话、机械排比和万能结尾。',
  '请示坚持一文一事，结尾使用“妥否，请批示。”或同类请求语；报告不得夹带“请予批准”。',
  '层次序数按“一、（一）1.（1）”顺序使用，不跳层、不乱序。',
  '输出前自检：文种是否匹配、事实是否具体、判断是否有依据、每段是否有功能、抽象词是否有落点。',
];

export function buildOfficialDocumentDraftPrompt(input: OfficialDocumentPromptInput) {
  const titleRule = input.needTitle ? '需要标题。' : '如不影响使用，可省略标题。';
  const signatureRule = input.needSignature ? '需要落款和成文日期，日期未知时使用〔日期〕占位。' : '如不影响使用，可省略落款。';

  return [
    officialDocumentSystemRules.join('\n'),
    '',
    '请根据以下信息起草一份可直接修改使用的公文或机关材料：',
    `文种：${input.documentType}`,
    `使用场景：${input.scenario || '〔请根据材料合理推断〕'}`,
    `发文/讲话主体：${input.issuer || '〔发文机关〕'}`,
    `面向对象/主送机关：${input.recipient || '〔主送机关〕'}`,
    `行文关系：${input.audienceRelation || '〔上行/下行/平行/面向公众〕'}`,
    `材料要点：${input.facts || '〔请补充具体事实、动作、数据、时限、责任主体〕'}`,
    `希望语气：${input.tone || '庄重、平实、克制'}`,
    `篇幅要求：${input.length || '不限，优先完整可用'}`,
    `格式要求：${titleRule}${signatureRule}`,
    `特殊要求：${input.specialRequirements || '无'}`,
    '',
    '输出要求：',
    '1. 先输出完整正文，不要只给提纲。',
    '2. 信息缺失但不影响起草时，用少量方括号占位，例如〔数量〕、〔日期〕。',
    '3. 如关键事实缺失导致文稿不可用，在正文后用“需补充信息”列出最多 5 项。',
    '4. 不输出写作过程和评分表。',
  ].join('\n');
}
