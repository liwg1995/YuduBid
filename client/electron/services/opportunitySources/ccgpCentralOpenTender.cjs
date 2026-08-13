const cheerio = require('cheerio');
const crypto = require('node:crypto');
const { assertRemoteHttpUrl, fetchWithTimeout, readResponseText } = require('../../utils/secureHttp.cjs');

const adapterType = 'ccgp-central-open-tender';
const allowedHost = 'www.ccgp.gov.cn';
const userAgent = 'Mozilla/5.0 (compatible; OpenBidKit/0.8; user-initiated local opportunity monitor)';

function clean(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function assertCcgpUrl(value) {
  const url = new URL(assertRemoteHttpUrl(value, '中国政府采购网地址不安全'));
  if (url.hostname !== allowedHost) throw new Error('数据源地址必须属于 www.ccgp.gov.cn');
  return url.toString();
}

async function fetchHtml(url) {
  const response = await fetchWithTimeout(assertCcgpUrl(url), {
    timeoutMs: 20000,
    redirect: 'follow',
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
  });
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
    const sourceItemId = url.match(/t(\d+)_([0-9]+)\.htm$/)?.[2] || crypto.createHash('sha1').update(url).digest('hex');
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
  container.find('h1,h2,h3,h4,h5,p,li,blockquote').each((_index, node) => {
    if ($(node).parents('p,li,blockquote').length) return;
    const tag = node.tagName?.toLowerCase();
    const body = clean($(node).text());
    if (!body) return;
    const prefix = tag === 'h1' ? '# ' : tag === 'h2' ? '## ' : tag === 'h3' ? '### ' : tag === 'h4' ? '#### ' : tag === 'li' ? '- ' : '';
    lines.push(`${prefix}${body}`);
  });
  return lines.join('\n\n');
}

function parseMoney(value) {
  const match = clean(value).match(/([\d,.]+)\s*(亿元|万元|元)/);
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

function parseDetail(html, listItem) {
  const $ = cheerio.load(html);
  const container = $('.vF_detail_content').first();
  if (!container.length) throw new Error('未找到公告正文，详情页结构可能已变化');
  const content = htmlToMarkdown($, container);
  if (content.length < 80) throw new Error('公告正文过短，详情页解析失败');
  const title = clean($('.vF_detail_header h2').first().text()) || listItem.title;
  const budgetText = tableValue($, '预算金额');
  const buyer = tableValue($, '采购单位') || listItem.buyer;
  const region = tableValue($, '行政区域') || listItem.region;
  const projectCode = clean(content.match(/项目编号[：:]\s*([^\n]+)/)?.[1]);
  const deadlineText = clean(content.match(/(?:提交投标文件截止时间|开标时间)[：:]\s*([^\n]+)/)?.[1]) || tableValue($, '开标时间');
  return {
    ...listItem, title, buyer, region, projectCode, budget: parseMoney(budgetText || content),
    bidDeadline: parseChineseDate(deadlineText), summary: clean(content).slice(0, 600), content,
    contentHash: crypto.createHash('sha256').update(content).digest('hex'), noticeType: '招标公告', announcementStage: 'tender',
  };
}

function createAdapter(source) {
  return {
    type: adapterType,
    async fetchList() {
      const html = await fetchHtml(source.baseUrl);
      return parseList(html, source.baseUrl);
    },
    async fetchDetail(item) {
      return parseDetail(await fetchHtml(item.url), item);
    },
  };
}

module.exports = { adapterType, createAdapter, parseList, parseDetail };
