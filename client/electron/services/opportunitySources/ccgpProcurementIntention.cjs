const cheerio = require('cheerio');
const crypto = require('node:crypto');
const { assertRemoteHttpUrl, fetchWithTimeout, readResponseText } = require('../../utils/secureHttp.cjs');

const adapterType = 'ccgp-procurement-intention';
const allowedHost = 'cgyx.ccgp.gov.cn';
const userAgent = 'Mozilla/5.0 (compatible; OpenBidKit/0.8; user-initiated local opportunity monitor)';

function clean(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function assertCgyxUrl(value) {
  const url = new URL(assertRemoteHttpUrl(value, '中国政府采购网采购意向地址不安全'));
  if (url.hostname !== allowedHost) throw new Error('数据源地址必须属于 cgyx.ccgp.gov.cn');
  return url.toString();
}

async function request(url, options = {}) {
  const response = await fetchWithTimeout(assertCgyxUrl(url), {
    timeoutMs: 20000,
    redirect: 'follow',
    ...options,
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/json,text/plain', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`中国政府采购网采购意向平台返回 HTTP ${response.status}`);
  return readResponseText(response, 4 * 1024 * 1024);
}

function dateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseList(value) {
  let data;
  try {
    data = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('采购意向列表不是有效 JSON，数据源接口可能已变化');
  }
  if (!Array.isArray(data?.rows)) throw new Error('采购意向列表缺少 rows，数据源接口可能已变化');
  return data.rows.map((row) => ({
    sourceItemId: clean(row.groupId),
    groupId: clean(row.groupId),
    title: clean(row.groupName),
    url: `http://${allowedHost}/cgyx/pub/details?groupId=${encodeURIComponent(clean(row.groupId))}`,
    buyer: clean(row.releaseUnitName),
    region: clean(row.zoneName),
    publishDate: clean(row.releaseDate),
    projectCount: Number(row.projectCount) || 0,
  })).filter((item) => item.groupId && item.title);
}

function parseGroup(html, group) {
  const $ = cheerio.load(html);
  const items = [];
  $('table tbody tr').each((_index, row) => {
    const cells = $(row).find('td');
    if (cells.length < 7) return;
    const link = cells.eq(2).find('a').first();
    const href = link.attr('href') || '';
    const projectId = href.match(/[?&]projId=([^&]+)/)?.[1];
    const title = clean(link.text() || cells.eq(2).text());
    if (!projectId || !title) return;
    items.push({
      sourceItemId: decodeURIComponent(projectId), projectId: decodeURIComponent(projectId), title,
      url: new URL(href, group.url).toString(), buyer: clean(cells.eq(1).text()) || group.buyer,
      category: clean(cells.eq(3).text()), budget: Number(clean(cells.eq(5).text())) * 10000,
      expectedPurchaseDate: clean(cells.eq(6).text()), region: group.region, publishDate: group.publishDate,
      groupTitle: group.title,
    });
  });
  if (!items.length) throw new Error('采购意向公告中未找到具体项目，页面结构可能已变化');
  return items;
}

function tableRows($) {
  const values = new Map();
  $('.pubtable table tr').each((_index, row) => {
    const cells = $(row).find('td');
    if (cells.length !== 2) return;
    values.set(clean(cells.eq(0).text()).replace(/[：:\s]/g, ''), clean(cells.eq(1).text()));
  });
  return values;
}

function parseBudget(value, fallback) {
  const match = clean(value).match(/([\d,.]+)\s*万元/);
  if (!match) return Number.isFinite(fallback) ? fallback : null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount * 10000 : null;
}

function expectedDate(value) {
  const match = clean(value).match(/(\d{4})[-年](\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-01`;
}

function parseDetail(html, item) {
  const $ = cheerio.load(html);
  const values = tableRows($);
  const title = values.get('采购项目名称') || clean($('.pubtable table tr').first().text()) || item.title;
  const buyer = values.get('采购单位') || item.buyer;
  const budgetText = values.get('预算金额') || '';
  const category = values.get('采购品目') || item.category || '';
  const demand = values.get('采购需求概况') || '';
  const purchaseDateText = values.get('预计采购时间') || item.expectedPurchaseDate || '';
  const remark = values.get('备注') || '';
  if (!title || !demand) throw new Error('采购意向项目关键字段缺失，详情页结构可能已变化');
  const content = [
    `# ${title}`, '', `- 采购单位：${buyer || '未披露'}`, `- 预算金额：${budgetText || '未披露'}`,
    `- 采购品目：${category || '未披露'}`, `- 预计采购时间：${purchaseDateText || '未披露'}`, '',
    '## 采购需求概况', '', demand, ...(remark ? ['', '## 备注', '', remark] : []), '',
    '> 采购意向属于初步安排，具体项目情况以之后发布的采购公告和采购文件为准。',
  ].join('\n');
  return {
    ...item, title, buyer, budget: parseBudget(budgetText, item.budget), expectedPurchaseDate: expectedDate(purchaseDateText),
    summary: demand.slice(0, 600), content, contentHash: crypto.createHash('sha256').update(content).digest('hex'),
    noticeType: '采购意向', announcementStage: 'intention',
  };
}

function createAdapter(source) {
  return {
    type: adapterType,
    async fetchList() {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86400000);
      const maxItems = Math.max(1, Math.min(50, Number(source.config?.maxItems) || 20));
      const items = [];
      for (let pageNo = 1; pageNo <= Math.ceil(maxItems / 10); pageNo += 1) {
        const body = new URLSearchParams({ releaseStar: dateText(start), releaseEnd: dateText(end), type: '0', pageSize: '10', pageNo: String(pageNo) });
        const data = await request(new URL('/cgyx/pub/pubSearchData', source.baseUrl).toString(), {
          method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        });
        const page = parseList(data);
        items.push(...page);
        if (page.length < 10) break;
      }
      if (!items.length) throw new Error('最近 7 天没有返回采购意向公告');
      return items;
    },
    async fetchDetail(group) {
      const projects = parseGroup(await request(group.url), group).slice(0, 20);
      const details = [];
      for (const project of projects) details.push(parseDetail(await request(project.url), project));
      return details;
    },
  };
}

module.exports = { adapterType, createAdapter, parseList, parseGroup, parseDetail };
