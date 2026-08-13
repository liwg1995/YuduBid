const cheerio = require('cheerio');
const crypto = require('node:crypto');
const { assertRemoteHttpUrl, fetchWithTimeout, readResponseText } = require('../../utils/secureHttp.cjs');

const allowedHost = 'www.ccgp.gov.cn';
const userAgent = 'Mozilla/5.0 (compatible; OpenBidKit/0.8; user-initiated local opportunity monitor)';
const definitions = {
  'ccgp-central-correction': { noticeType: '更正/补遗', announcementStage: 'correction' },
  'ccgp-central-award': { noticeType: '中标/成交', announcementStage: 'result' },
  'ccgp-central-deal': { noticeType: '中标/成交', announcementStage: 'result' },
  'ccgp-central-termination': { noticeType: '废标/终止', announcementStage: 'terminated' },
  'ccgp-local-correction': { noticeType: '更正/补遗', announcementStage: 'correction' },
  'ccgp-local-award': { noticeType: '中标/成交', announcementStage: 'result' },
  'ccgp-local-termination': { noticeType: '废标/终止', announcementStage: 'terminated' },
};

function clean(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function assertCcgpUrl(value) {
  const url = new URL(assertRemoteHttpUrl(value, '中国政府采购网地址不安全'));
  if (url.hostname !== allowedHost) throw new Error('数据源地址必须属于 www.ccgp.gov.cn');
  return url.toString();
}

async function fetchHtml(url) {
  const response = await fetchWithTimeout(assertCcgpUrl(url), { timeoutMs: 20000, redirect: 'follow', headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`中国政府采购网返回 HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) throw new Error(`数据源返回了非 HTML 内容：${contentType || '未知类型'}`);
  return readResponseText(response, 4 * 1024 * 1024);
}

function parseList(html, baseUrl) {
  const $ = cheerio.load(html);
  const container = $('ul.c_list_bid');
  if (!container.length) throw new Error('未找到公告列表，数据源页面结构可能已变化');
  const items = [];
  container.find('li').each((_index, element) => {
    const link = $(element).find('a').first();
    const href = link.attr('href');
    const title = clean(link.attr('title') || link.text());
    const ems = $(element).find('em').map((_i, node) => clean($(node).text())).get();
    if (!href || !title) return;
    const url = new URL(href, baseUrl).toString();
    const sourceItemId = url.match(/t\d+_([0-9]+)\.htm$/)?.[1] || crypto.createHash('sha1').update(url).digest('hex');
    items.push({ sourceItemId, title, url, publishDate: ems[0] || '', region: ems[1] || '', buyer: ems[2] || '' });
  });
  if (!items.length) throw new Error('公告列表为空，数据源页面结构可能已变化');
  return items;
}

function tableValue($, label) {
  let value = '';
  $('.table td.title').each((_index, cell) => {
    if (value || clean($(cell).text()) !== label) return;
    value = clean($(cell).next('td').text());
  });
  return value;
}

function htmlToMarkdown($, container) {
  const lines = [];
  container.find('h1,h2,h3,h4,h5,p,li,blockquote,tr').each((_index, node) => {
    if ($(node).parents('p,li,blockquote,tr').length) return;
    const tag = node.tagName?.toLowerCase();
    const body = clean($(node).text());
    if (!body) return;
    const prefix = tag === 'h1' ? '# ' : tag === 'h2' ? '## ' : tag === 'h3' ? '### ' : tag === 'h4' ? '#### ' : tag === 'li' ? '- ' : '';
    lines.push(`${prefix}${body}`);
  });
  return lines.join('\n\n');
}

function parseMoney(value) {
  const match = clean(value).match(/([\d,.]+)\s*[（(]?(亿元|万元|元)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return amount * (match[2] === '亿元' ? 100000000 : match[2] === '万元' ? 10000 : 1);
}

function parseChineseDate(value) {
  const match = clean(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})?[点:时]?(\d{1,2})?/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 23), Number(match[5] || 59));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function section(content, headingPattern, nextHeadingPattern) {
  const start = content.search(headingPattern);
  if (start < 0) return '';
  const body = content.slice(start).replace(headingPattern, '').trim();
  const end = body.search(nextHeadingPattern);
  return clean(end < 0 ? body : body.slice(0, end));
}

function parseDetail(html, listItem, definition) {
  const $ = cheerio.load(html);
  const container = $('.vF_detail_content').first();
  if (!container.length) throw new Error('未找到公告正文，详情页结构可能已变化');
  const content = htmlToMarkdown($, container);
  if (content.length < 60) throw new Error('公告正文过短，详情页解析失败');
  const title = clean($('.vF_detail_header h2').first().text()) || listItem.title;
  const buyer = tableValue($, '采购单位') || clean(content.match(/采购人信息[\s\S]{0,120}?名\s*称[：:]\s*([^\n]+)/)?.[1]) || listItem.buyer;
  const region = tableValue($, '行政区域') || listItem.region;
  const projectCode = clean(content.match(/(?:原公告的)?(?:采购)?项目编号[：:]\s*([^\n]+)/)?.[1]).replace(/\s*[（(]招标文件编号[：:].*$/, '');
  const projectName = clean(content.match(/(?:原公告的)?采购项目名称[：:]\s*([^\n]+)/)?.[1] || content.match(/项目名称[：:]\s*([^\n]+)/)?.[1]);
  const namedSuppliers = [...content.matchAll(/(?:中标（成交）|中标成交|中标|成交)?供应商名称[：:]\s*([^\n]+)/g)]
    .map((match) => clean(match[1])).filter(Boolean);
  const rowSuppliers = [...content.matchAll(/[（(]元[）)]\s*([^\n]{2,160}?(?:有限责任公司|股份有限公司|有限公司|研究院|大学|中心|公司|厂))/g)]
    .map((match) => clean(match[1])).filter(Boolean);
  const suppliers = [...new Set([...namedSuppliers, ...rowSuppliers].map((value) => value.replace(/^\d+\s*/, '')))];
  const labelledAmounts = [...content.matchAll(/(?:中标（成交）|中标成交|中标|成交)金额[：:]\s*([^\n]+)/g)]
    .map((match) => parseMoney(match[1])).filter((value) => value !== null);
  const rowAmounts = [...content.matchAll(/(?:总价|报价|成交价|中标价)[：:]?\s*([\d,.]+)\s*[（(]元[）)]/g)]
    .map((match) => Number(match[1].replace(/,/g, ''))).filter(Number.isFinite);
  const awardAmounts = labelledAmounts.length ? labelledAmounts : rowAmounts;
  const awardAmount = awardAmounts.length ? awardAmounts.reduce((sum, value) => sum + value, 0) : null;
  const terminationReason = definition.announcementStage === 'terminated' ? section(content, /二、项目终止的原因/, /三、/) : '';
  const correctionSummary = definition.announcementStage === 'correction' ? section(content, /二、更正信息/, /三、/) : '';
  const deadlineText = clean(content.match(/(?:开标时间|提交投标文件截止时间)[^：:\n]{0,12}(?:变更为)?[：:]\s*([^\n]+)/)?.[1]);
  return {
    ...listItem, title: projectName || title, displayTitle: title, buyer, region, projectCode,
    bidDeadline: parseChineseDate(deadlineText), budget: awardAmount, awardSupplier: suppliers.join('；'), awardAmount,
    terminationReason, changeSummary: correctionSummary, summary: clean(correctionSummary || terminationReason || content).slice(0, 800), content,
    contentHash: crypto.createHash('sha256').update(content).digest('hex'), ...definition,
  };
}

function createAdapter(source) {
  const definition = definitions[source.adapterType];
  if (!definition) throw new Error(`不支持生命周期公告类型：${source.adapterType}`);
  return {
    type: source.adapterType,
    async fetchList() { return parseList(await fetchHtml(source.baseUrl), source.baseUrl); },
    async fetchDetail(item) { return parseDetail(await fetchHtml(item.url), item, definition); },
  };
}

module.exports = { createAdapter, parseList, parseDetail, definitions };
