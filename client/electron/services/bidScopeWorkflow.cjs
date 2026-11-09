function bidScope(options) {
  return ['business', 'complete'].includes(options?.bidGenerationScope) ? options.bidGenerationScope : 'technical';
}
function scopeInstruction(scope) {
  const target = scope === 'business' ? '商务标独立成册：仅编制招标文件明确要求的商务文件、资格证明、规定表单及商务响应；排除技术方案正文，独立报价卷不得混入。'
    : '完整投标文件：按招标文件规定的组成及顺序编制商务、资格、技术及要求纳入本册的报价部分，尊重独立成册要求。';
  return `本次生成范围为${target}\n后续任务中的“技术标”“技术方案”等通用称呼须服从本次范围；不能因旧称呼而排除本次必须编制的商务内容。遵循原文目录和规定表单。禁止虚构投标人、人员、证书、业绩、金额、签署及任何法律承诺；缺少事实用【待填写】明确标注并留给用户核实，不得推断补齐。`;
}
function readGenerationOriginalPlan(plan, workspaceStore) {
  if (bidScope(plan.contentGenerationOptions) === 'business' || !plan.originalPlanFile) return '';
  const markdown = String(workspaceStore.readOriginalPlanMarkdown?.() || '').trim();
  if (!markdown) throw new Error('原方案正文不可用，请回到生成设置重新上传或移除');
  return markdown;
}

function normalizeSectionPurpose(value) {
  return ['technical', 'business', 'pricing', 'general'].includes(value) ? value : undefined;
}

function usesOriginalPlanForChapter(scope, chapter, parents) {
  if (scope === 'technical') return true;
  if (scope !== 'complete') return false;
  const branch = [...parents, chapter];
  const purposes = branch.map((item) => normalizeSectionPurpose(item.section_purpose));
  if (purposes.some((purpose) => purpose === 'business' || purpose === 'pricing')) return false;
  const titles = branch.map((item) => String(item.title || '').trim()
    .replace(/^(?:(?:第[一二三四五六七八九十0-9]+(?:部分|篇|卷|章|册))|(?:[一二三四五六七八九十]+[、.．])|(?:\d+(?:\.\d+)*[、.．]?))[\s：:、.．-]*/, ''));
  if (titles.some((title) => /^(?:商务|资格|资信|报价|价格|投标报价|开标一览)/.test(title))) return false;
  if (purposes.at(-1) === 'general') return false;
  if (purposes.includes('technical')) return true;
  return titles.some((title) => /^(?:(?:投标)?技术(?:部分|文件|方案|响应|标|卷)|施工组织设计|监理大纲)/.test(title));
}

const BIDDER_FACT_GROUP_ID = 'selected_bidder_profile';

function readBidderFacts(options, credentialLibraryService) {
  if (bidScope(options) === 'technical' || !options?.bidderCompanyId) return null;
  let profile;
  try {
    profile = credentialLibraryService?.load(options.bidderCompanyId)?.profile;
  } catch {
    throw new Error('无法读取所选投标企业，请回到生成设置重新选择');
  }
  if (!profile?.companyName?.trim()) throw new Error('所选投标企业资料不可用，请回到生成设置重新选择');
  const fields = [
    ['企业名称', profile.companyName],
    ['统一社会信用代码', profile.unifiedSocialCreditCode],
    ['注册地址', profile.address],
    ['法定代表人姓名', profile.legalRepresentative],
  ];
  return {
    id: BIDDER_FACT_GROUP_ID,
    title: '资信库投标企业资料',
    content: fields.filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([label, value]) => `- ${label}：${value.replace(/\s+/g, ' ').trim()}`).join('\n'),
  };
}

function scopedAi(service, scope, bidderFacts) {
  if (scope === 'technical') return service;
  const wrapped = Object.create(service);
  for (const method of ['chat', 'requestJson', 'collectJsonResponse']) {
    if (typeof service[method] !== 'function') continue;
    wrapped[method] = (request) => service[method]({
      ...request,
      messages: [
        { role: 'system', content: scopeInstruction(scope) },
        ...(request.messages || []),
        ...(bidderFacts ? [{ role: 'user', content: `本项目选定的投标企业资料如下。仅在相关字段使用这些值，企业资料与招标人资料须分别引用。\n${bidderFacts.content}` }] : []),
      ],
    });
  }
  return wrapped;
}
function responseRequirementsPrompt(scope) {
  return `${scopeInstruction(scope)}\n从招标原文提取本次范围的响应文件组成、规定表单、目录顺序、签署和附件要求。按原文顺序输出 Markdown，保留来源位置和独立成册约束；没有明确要求的写“原文未明确”，不得虚构目录或填写投标人事实。`;
}
module.exports = { normalizeSectionPurpose, readGenerationOriginalPlan, usesOriginalPlanForChapter, BIDDER_FACT_GROUP_ID, readBidderFacts, bidScope, scopeInstruction, scopedAi, responseRequirementsPrompt };
