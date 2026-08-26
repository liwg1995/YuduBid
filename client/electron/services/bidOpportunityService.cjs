const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { getWorkspaceDir } = require('../utils/paths.cjs');
const { createAdapter: createCcgpCentralOpenTenderAdapter } = require('./opportunitySources/ccgpCentralOpenTender.cjs');
const { createAdapter: createCcgpProcurementIntentionAdapter } = require('./opportunitySources/ccgpProcurementIntention.cjs');
const { createAdapter: createCcgpLifecycleNoticeAdapter } = require('./opportunitySources/ccgpLifecycleNotice.cjs');

const statuses = new Set(['new', 'review', 'following', 'won', 'abandoned', 'archived']);
const workflowStages = new Set(['discovery', 'screening', 'qualification', 'decision', 'bidding', 'closed']);
const decisionOutcomes = new Set(['undecided', 'bid', 'no_bid']);
const noticeTypes = ['采购意向', '供应商征集', '资格预审', '招标公告', '竞争性磋商', '竞争性谈判', '询价公告', '单一来源', '更正/补遗', '中标/成交', '废标/终止', '其他'];
const stageOrder = { intention: 10, collection: 20, prequalification: 30, tender: 40, correction: 50, result: 60, terminated: 70, other: 0 };
const enterpriseKeywordAliases = [
  ['云计算', ['云服务', '云资源', '私有云', '混合云', '云中心', '云平台']],
  ['边缘计算', ['边缘云', '边缘节点', '边缘智能']],
  ['云边端', ['云边协同', '云端协同', '端云协同']],
  ['智能体', ['ai智能体', '智能代理', '大模型应用']],
  ['国产', ['国产化', '信创', '自主可控', '麒麟', '统信', '鲲鹏', '飞腾', '龙芯']],
  ['iso质量体系', ['iso9001', '质量管理体系', '质量体系认证']],
];

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function text(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function list(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,，\n]+/);
  return [...new Set(source.map((item) => text(item, 80)).filter(Boolean))];
}

function json(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNoticeType(value, content = '') {
  const requested = text(value, 30);
  if (noticeTypes.includes(requested)) return requested;
  const source = `${requested} ${content}`;
  if (/采购意向|意向公告/.test(source)) return '采购意向';
  if (/供应商征集|征集公告|调研公告/.test(source)) return '供应商征集';
  if (/资格预审/.test(source)) return '资格预审';
  if (/更正|变更|补遗|澄清/.test(source)) return '更正/补遗';
  if (/废标|流标|终止/.test(source)) return '废标/终止';
  if (/中标|成交|结果公告/.test(source)) return '中标/成交';
  if (/竞争性磋商/.test(source)) return '竞争性磋商';
  if (/竞争性谈判/.test(source)) return '竞争性谈判';
  if (/询价/.test(source)) return '询价公告';
  if (/单一来源/.test(source)) return '单一来源';
  if (/招标|采购公告/.test(source)) return '招标公告';
  return '其他';
}

function announcementStage(noticeType) {
  return ({ 采购意向: 'intention', 供应商征集: 'collection', 资格预审: 'prequalification', 招标公告: 'tender', 竞争性磋商: 'tender', 竞争性谈判: 'tender', 询价公告: 'tender', 单一来源: 'tender', '更正/补遗': 'correction', '中标/成交': 'result', '废标/终止': 'terminated' })[noticeType] || 'other';
}

function normalizeProjectTitle(value) {
  return String(value || '').toLowerCase()
    .replace(/[（(][^）)]*(?:公告|第\s*\d+\s*包|包\s*\d+|标段|更正|变更|结果|废标|终止)[^）)]*[）)]/g, '')
    .replace(/(?:公开招标|竞争性磋商|竞争性谈判|询价|单一来源|资格预审|采购意向|采购需求|中标|成交|结果|更正|变更|补遗|澄清|废标|终止)?公告/g, '')
    .replace(/(?:采购)?项目/g, '').replace(/20\d{2}年度?/g, '').replace(/第?[一二三四五六七八九十\d]+包/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function titleBigrams(value) {
  const normalized = normalizeProjectTitle(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) result.add(normalized.slice(index, index + 2));
  return result;
}

function titleSimilarity(left, right) {
  const a = titleBigrams(left); const b = titleBigrams(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return (2 * common) / (a.size + b.size);
}

function compactSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function enterpriseProfileTerms(values) {
  const entries = Array.isArray(values) ? values : [values];
  return [...new Set(entries.flatMap((value) => String(value || '').split(/[,，、;；/|\n]+/)).map((value) => compactSearchText(value)).filter((value) => value.length >= 2))];
}

function enterpriseTermVariants(term) {
  const variants = new Set([term]);
  for (const [trigger, aliases] of enterpriseKeywordAliases) {
    if (!term.includes(trigger)) continue;
    variants.add(trigger);
    for (const alias of aliases) variants.add(alias);
  }
  return [...variants];
}

function matchEnterpriseProfile(opportunity, profile) {
  const searchable = compactSearchText(`${opportunity.title} ${opportunity.summary} ${opportunity.buyer} ${opportunity.region} ${opportunity.industry}`)
    .replace(/(?:[\p{Script=Han}]{0,12}政府采购[\p{Script=Han}]{0,8}|[\p{Script=Han}]{0,4}采)云平台/gu, '');
  const regionText = compactSearchText(`${opportunity.region} ${opportunity.title} ${opportunity.buyer}`);
  const reasons = [];
  let score = 0;

  const addCategory = (label, values, weight, maximum, target = searchable, ignored = new Set()) => {
    let categoryScore = 0;
    for (const term of enterpriseProfileTerms(values)) {
      if (ignored.has(term) || !enterpriseTermVariants(term).some((variant) => target.includes(variant))) continue;
      categoryScore = Math.min(maximum, categoryScore + weight);
      if (reasons.length < 5) reasons.push(`${label}：${term.length > 24 ? `${term.slice(0, 24)}…` : term}`);
    }
    score += categoryScore;
  };

  addCategory('核心能力', profile.capabilities, 30, 60);
  addCategory('目标行业', profile.industries, 18, 30);
  addCategory('服务区域', profile.serviceRegions, 15, 20, regionText, new Set(['全国', '全国范围', '不限地区']));
  addCategory('企业资质', profile.qualifications, 18, 30);
  addCategory('人员证书', profile.personnel, 12, 24);
  addCategory('类似业绩', profile.performances, 14, 28);
  addCategory('竞争优势', profile.advantages, 10, 20);

  const normalizedScore = Math.min(100, score);
  return {
    enterpriseMatchScore: normalizedScore,
    enterpriseMatchLevel: normalizedScore >= 50 ? 'high' : normalizedScore >= 25 ? 'medium' : normalizedScore > 0 ? 'low' : 'none',
    enterpriseMatchReasons: reasons,
  };
}

function rankByEnterpriseProfile(items, profile) {
  const configured = enterpriseProfileTerms([
    ...(profile.industries || []), ...(profile.serviceRegions || []), ...(profile.capabilities || []),
    ...(profile.qualifications || []), ...(profile.personnel || []), ...(profile.performances || []), profile.advantages || '',
  ]).length > 0;
  if (!configured) return items;
  return items.map((item, index) => ({ ...item, ...matchEnterpriseProfile(item, profile), enterpriseSortIndex: index }))
    .sort((left, right) => right.enterpriseMatchScore - left.enterpriseMatchScore || left.enterpriseSortIndex - right.enterpriseSortIndex)
    .map(({ enterpriseSortIndex: _enterpriseSortIndex, ...item }) => item);
}

function extractBudget(content) {
  const match = String(content || '').match(/(?:预算(?:金额)?|最高限价|采购预算)[^\d]{0,18}([\d,.]+)\s*(亿元|万元|元)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  if (match[2] === '亿元') return value * 100000000;
  if (match[2] === '万元') return value * 10000;
  return value;
}

function extractDeadline(content) {
  const match = String(content || '').match(/(?:投标截止|提交投标文件|递交投标文件|响应文件提交|开标时间)[^\d]{0,30}(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})(?:日)?(?:\s*(\d{1,2})[:时](\d{1,2})?)?/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 23), Number(match[5] || 59));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function scoreOpportunity(opportunity, monitors) {
  const content = `${opportunity.title} ${opportunity.summary} ${opportunity.content || ''} ${opportunity.buyer} ${opportunity.region} ${opportunity.industry}`.toLowerCase();
  let best = { score: 0, keywords: [], monitorId: '', reasons: [] };
  for (const monitor of monitors.filter((item) => item.enabled)) {
    const required = monitor.requiredKeywords;
    const optional = monitor.optionalKeywords;
    const excluded = monitor.excludedKeywords;
    const requiredOk = required.every((keyword) => content.includes(keyword.toLowerCase()));
    const excludedHit = excluded.filter((keyword) => content.includes(keyword.toLowerCase()));
    const matched = optional.filter((keyword) => content.includes(keyword.toLowerCase()));
    const regionOk = !monitor.regions.length || monitor.regions.some((region) => content.includes(region.toLowerCase()));
    const typeOk = !monitor.noticeTypes.length || monitor.noticeTypes.includes(opportunity.noticeType);
    const buyerOk = !monitor.buyerKeywords.length || monitor.buyerKeywords.some((buyer) => content.includes(buyer.toLowerCase()));
    const industryOk = !monitor.industry || content.includes(monitor.industry.toLowerCase());
    const budget = opportunity.budget;
    const budgetOk = (monitor.budgetMin === null || (budget !== null && budget >= monitor.budgetMin))
      && (monitor.budgetMax === null || (budget !== null && budget <= monitor.budgetMax));
    let score = 0;
    if (requiredOk) score += required.length ? 30 : 10;
    score += Math.min(matched.length * 12, 36);
    if (regionOk) score += monitor.regions.length ? 12 : 4;
    if (typeOk) score += monitor.noticeTypes.length ? 10 : 4;
    if (buyerOk) score += monitor.buyerKeywords.length ? 8 : 2;
    if (industryOk) score += monitor.industry ? 8 : 2;
    if (budgetOk) score += monitor.budgetMin !== null || monitor.budgetMax !== null ? 8 : 2;
    const filtersOk = requiredOk && !excludedHit.length && regionOk && typeOk && buyerOk && industryOk && budgetOk;
    if (!filtersOk) score = 0;
    const reasons = [];
    if (required.length) reasons.push(`必须关键词：${required.join('、')}`);
    if (matched.length) reasons.push(`命中关键词：${matched.join('、')}`);
    if (monitor.regions.length) reasons.push(`地区：${opportunity.region || monitor.regions.join('、')}`);
    if (monitor.noticeTypes.length) reasons.push(`公告类型：${opportunity.noticeType}`);
    if (monitor.buyerKeywords.length) reasons.push(`采购人：${opportunity.buyer || monitor.buyerKeywords.join('、')}`);
    if (monitor.industry) reasons.push(`行业：${monitor.industry}`);
    if (monitor.budgetMin !== null || monitor.budgetMax !== null) reasons.push(`预算：${opportunity.budget ?? '待确认'} 元`);
    if (!reasons.length) reasons.push('方案未设置限制条件');
    if (score > best.score) best = { score, keywords: [...required.filter((item) => content.includes(item.toLowerCase())), ...matched], monitorId: monitor.monitorId, reasons };
  }

  let informationScore = 20;
  if (opportunity.buyer) informationScore += 15;
  if (opportunity.region) informationScore += 10;
  if (opportunity.publishDate) informationScore += 10;
  if (opportunity.bidDeadline) informationScore += 20;
  if (opportunity.budget !== null) informationScore += 15;
  if (opportunity.summary || opportunity.content) informationScore += 10;
  informationScore = Math.min(100, informationScore);

  const days = opportunity.bidDeadline ? Math.ceil((new Date(opportunity.bidDeadline).getTime() - Date.now()) / 86400000) : null;
  const risks = [];
  if (opportunity.announcementStage === 'result') risks.push('采购结果已公告');
  if (opportunity.announcementStage === 'terminated') risks.push('项目已废标或终止');
  if (days !== null && days < 0) risks.push('投标截止时间已过');
  else if (days !== null && days <= 3) risks.push('距离投标截止不足 3 天');
  if (opportunity.budget === null) risks.push('预算待确认');
  if (!opportunity.buyer) risks.push('采购人待确认');
  const valueScore = Math.min(100, Math.round(best.score * 0.7 + informationScore * 0.3));
  const lifecycleClosed = ['result', 'terminated'].includes(opportunity.announcementStage);
  const feasibilityScore = lifecycleClosed || risks.some((risk) => risk.includes('已过')) ? 0 : days === null ? 45 : Math.max(25, Math.min(90, 50 + days * 2));
  const recommendation = opportunity.announcementStage === 'terminated' ? '项目已终止' : opportunity.announcementStage === 'result' ? '采购已结束' : risks.some((risk) => risk.includes('已过')) ? '公告已过期' : valueScore >= 72 ? '建议重点跟进' : valueScore >= 48 ? '补充信息后判断' : '建议观察';
  return { ...best, informationScore, valueScore, feasibilityScore, risks, recommendation };
}

function createBidOpportunityService({ app, db, fileService, presalesWorkbenchService, aiService, technicalPlanStore, rejectionCheckStore }) {
  const contentDir = path.join(getWorkspaceDir(app), 'bid-opportunities');
  const backupRoot = path.join(getWorkspaceDir(app), 'backups', 'bid-opportunity');
  const subscribers = new Set();
  const activeAnalyses = new Set();
  const activeScans = new Set();
  const lastEmittedScanProgress = new Map();
  let activeScanAll = null;
  let latestScanBatch = null;
  let relationInboxCache = { signature: '', count: 0 };
  fs.mkdirSync(contentDir, { recursive: true });

  function emit(opportunityId) {
    const payload = { opportunity: getOpportunity(opportunityId) };
    for (const webContents of subscribers) {
      if (webContents.isDestroyed()) subscribers.delete(webContents);
      else webContents.send('bid-opportunity:event', payload);
    }
  }

  function subscribe(webContents) {
    if (subscribers.has(webContents)) return;
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
  }

  function profileFromRow(row) {
    return row ? {
      companyName: row.company_name || '', industries: json(row.industries_json), serviceRegions: json(row.service_regions_json),
      capabilities: json(row.capabilities_json), qualifications: json(row.qualifications_json), personnel: json(row.personnel_json),
      performances: json(row.performances_json), advantages: row.advantages || '', limitations: row.limitations || '', updatedAt: row.updated_at,
    } : { companyName: '', industries: [], serviceRegions: [], capabilities: [], qualifications: [], personnel: [], performances: [], advantages: '', limitations: '', updatedAt: '' };
  }

  function getEnterpriseProfile() {
    return profileFromRow(db.prepare('SELECT * FROM opportunity_enterprise_profile WHERE id=1').get());
  }

  function saveEnterpriseProfile(payload = {}) {
    const profile = {
      company_name: text(payload.companyName, 200), industries_json: JSON.stringify(list(payload.industries)),
      service_regions_json: JSON.stringify(list(payload.serviceRegions)), capabilities_json: JSON.stringify(list(payload.capabilities)),
      qualifications_json: JSON.stringify(list(payload.qualifications)), personnel_json: JSON.stringify(list(payload.personnel)),
      performances_json: JSON.stringify(list(payload.performances)), advantages: text(payload.advantages, 10000),
      limitations: text(payload.limitations, 10000), updated_at: now(),
    };
    db.prepare(`INSERT INTO opportunity_enterprise_profile (id,company_name,industries_json,service_regions_json,capabilities_json,
      qualifications_json,personnel_json,performances_json,advantages,limitations,updated_at)
      VALUES (1,@company_name,@industries_json,@service_regions_json,@capabilities_json,@qualifications_json,@personnel_json,
      @performances_json,@advantages,@limitations,@updated_at)
      ON CONFLICT(id) DO UPDATE SET company_name=excluded.company_name,industries_json=excluded.industries_json,
      service_regions_json=excluded.service_regions_json,capabilities_json=excluded.capabilities_json,
      qualifications_json=excluded.qualifications_json,personnel_json=excluded.personnel_json,performances_json=excluded.performances_json,
      advantages=excluded.advantages,limitations=excluded.limitations,updated_at=excluded.updated_at`).run(profile);
    db.prepare('UPDATE bid_opportunities SET analysis_signature=NULL WHERE deep_analysis_json IS NOT NULL').run();
    return getEnterpriseProfile();
  }

  function monitorFromRow(row) {
    return {
      monitorId: row.monitor_id,
      name: row.name,
      enabled: Boolean(row.enabled),
      industry: row.industry || '',
      regions: json(row.regions_json),
      noticeTypes: json(row.notice_types_json),
      requiredKeywords: json(row.required_keywords_json),
      optionalKeywords: json(row.optional_keywords_json),
      excludedKeywords: json(row.excluded_keywords_json),
      buyerKeywords: json(row.buyer_keywords_json),
      budgetMin: numberOrNull(row.budget_min),
      budgetMax: numberOrNull(row.budget_max),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function listMonitors() {
    return db.prepare('SELECT * FROM opportunity_monitors ORDER BY updated_at DESC').all().map(monitorFromRow);
  }

  function sourceFromRow(row) {
    return {
      sourceId: row.source_id, name: row.name, adapterType: row.adapter_type, baseUrl: row.base_url, enabled: Boolean(row.enabled),
      config: json(row.config_json, {}), healthStatus: row.health_status, lastRunAt: row.last_run_at || '', lastSuccessAt: row.last_success_at || '',
      lastError: row.last_error || '', lastResult: json(row.last_result_json, null), createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function listSources() {
    return db.prepare('SELECT * FROM opportunity_sources ORDER BY created_at ASC').all().map(sourceFromRow);
  }

  function scanFromRow(row) {
    if (!row) return null;
    return { runId: row.run_id, sourceId: row.source_id, status: row.status, progress: row.progress, message: row.message,
      fetchedCount: row.fetched_count, matchedCount: row.matched_count, createdCount: row.created_count, updatedCount: row.updated_count,
      skippedCount: row.skipped_count, errors: json(row.errors_json), startedAt: row.started_at, finishedAt: row.finished_at || '', updatedAt: row.updated_at };
  }

  function getLatestScans() {
    const result = {};
    for (const source of listSources()) {
      const row = db.prepare('SELECT * FROM opportunity_scan_runs WHERE source_id=? ORDER BY started_at DESC LIMIT 1').get(source.sourceId);
      if (row) {
        const scan = scanFromRow(row);
        if (scan.status === 'running' && !activeScans.has(source.sourceId)) {
          scan.status = 'error'; scan.progress = 100; scan.message = '上次扫描被中断'; scan.errors = ['上次扫描被中断，请重新执行。']; scan.finishedAt = now(); scan.updatedAt = now();
          db.prepare('UPDATE opportunity_scan_runs SET status=?,progress=?,message=?,errors_json=?,finished_at=?,updated_at=? WHERE run_id=?')
            .run(scan.status, scan.progress, scan.message, JSON.stringify(scan.errors), scan.finishedAt, scan.updatedAt, scan.runId);
        }
        result[source.sourceId] = scan;
      }
    }
    return result;
  }

  function getScanBatch() {
    const enabledSources = listSources().filter((source) => source.enabled);
    if (!activeScanAll && latestScanBatch) return { ...latestScanBatch, running: activeScans.size };
    return {
      status: activeScanAll ? 'running' : 'idle', startedAt: activeScanAll?.startedAt || '', total: activeScanAll?.total || enabledSources.length,
      completed: activeScanAll?.completed || 0, running: activeScans.size,
      createdCount: activeScanAll?.createdCount || 0, updatedCount: activeScanAll?.updatedCount || 0,
    };
  }

  function emitScan(sourceId) {
    const scan = getLatestScans()[sourceId] || null;
    const source = listSources().find((item) => item.sourceId === sourceId) || null;
    if (scan) lastEmittedScanProgress.set(sourceId, scan.progress);
    const payload = { scan, source, scanBatch: getScanBatch() };
    for (const webContents of subscribers) {
      if (webContents.isDestroyed()) subscribers.delete(webContents);
      else webContents.send('bid-opportunity:event', payload);
    }
  }

  function updateScan(runId, sourceId, patch, { emitEvent = true } = {}) {
    const current = scanFromRow(db.prepare('SELECT * FROM opportunity_scan_runs WHERE run_id=?').get(runId));
    const next = { ...current, ...patch, updatedAt: now() };
    db.prepare(`UPDATE opportunity_scan_runs SET status=?,progress=?,message=?,fetched_count=?,matched_count=?,created_count=?,updated_count=?,
      skipped_count=?,errors_json=?,finished_at=?,updated_at=? WHERE run_id=?`).run(next.status, next.progress, next.message, next.fetchedCount,
      next.matchedCount, next.createdCount, next.updatedCount, next.skippedCount, JSON.stringify(next.errors || []), next.finishedAt || null, next.updatedAt, runId);
    const lastProgress = lastEmittedScanProgress.get(sourceId) ?? -Infinity;
    if (emitEvent && (next.status !== 'running' || next.progress - lastProgress >= 8)) emitScan(sourceId);
    return next;
  }

  function getAdapter(source) {
    if (['ccgp-central-open-tender', 'ccgp-local-open-tender'].includes(source.adapterType)) return createCcgpCentralOpenTenderAdapter(source);
    if (source.adapterType === 'ccgp-procurement-intention') return createCcgpProcurementIntentionAdapter(source);
    if (['ccgp-central-correction', 'ccgp-central-award', 'ccgp-central-deal', 'ccgp-central-termination', 'ccgp-local-correction', 'ccgp-local-award', 'ccgp-local-termination'].includes(source.adapterType)) return createCcgpLifecycleNoticeAdapter(source);
    throw new Error(`暂不支持数据源适配器：${source.adapterType}`);
  }

  function saveMonitor(payload = {}) {
    const timestamp = now();
    const monitorId = text(payload.monitorId, 80) || id('om');
    db.prepare(`INSERT INTO opportunity_monitors (
      monitor_id, name, enabled, industry, regions_json, notice_types_json, required_keywords_json,
      optional_keywords_json, excluded_keywords_json, buyer_keywords_json, budget_min, budget_max, created_at, updated_at
    ) VALUES (@monitor_id, @name, @enabled, @industry, @regions_json, @notice_types_json, @required_keywords_json,
      @optional_keywords_json, @excluded_keywords_json, @buyer_keywords_json, @budget_min, @budget_max, @created_at, @updated_at)
    ON CONFLICT(monitor_id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, industry=excluded.industry,
      regions_json=excluded.regions_json, notice_types_json=excluded.notice_types_json, required_keywords_json=excluded.required_keywords_json,
      optional_keywords_json=excluded.optional_keywords_json, excluded_keywords_json=excluded.excluded_keywords_json,
      buyer_keywords_json=excluded.buyer_keywords_json, budget_min=excluded.budget_min, budget_max=excluded.budget_max, updated_at=excluded.updated_at`).run({
      monitor_id: monitorId,
      name: text(payload.name, 160) || '未命名监控',
      enabled: payload.enabled === false ? 0 : 1,
      industry: text(payload.industry, 100),
      regions_json: JSON.stringify(list(payload.regions)),
      notice_types_json: JSON.stringify(list(payload.noticeTypes).filter((item) => noticeTypes.includes(item))),
      required_keywords_json: JSON.stringify(list(payload.requiredKeywords)),
      optional_keywords_json: JSON.stringify(list(payload.optionalKeywords)),
      excluded_keywords_json: JSON.stringify(list(payload.excludedKeywords)),
      buyer_keywords_json: JSON.stringify(list(payload.buyerKeywords)),
      budget_min: numberOrNull(payload.budgetMin),
      budget_max: numberOrNull(payload.budgetMax),
      created_at: timestamp,
      updated_at: timestamp,
    });
    rematchAll();
    return { monitor: listMonitors().find((item) => item.monitorId === monitorId), monitors: listMonitors() };
  }

  function deleteMonitor(monitorId) {
    db.prepare('DELETE FROM opportunity_monitors WHERE monitor_id = ?').run(text(monitorId, 80));
    rematchAll();
    return { success: true, monitors: listMonitors() };
  }

  function contentPath(opportunityId) {
    return path.join(contentDir, `${opportunityId}.md`);
  }

  function opportunityFromRow(row, { includeContent = true } = {}) {
    const filePath = row.content_path ? path.join(getWorkspaceDir(app), row.content_path) : '';
    return {
      opportunityId: row.opportunity_id,
      title: row.title,
      noticeType: row.notice_type,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      projectCode: row.project_code,
      buyer: row.buyer,
      region: row.region,
      industry: row.industry,
      publishDate: row.publish_date || '',
      bidDeadline: row.bid_deadline || '',
      expectedPurchaseDate: row.expected_purchase_date || '',
      awardSupplier: row.award_supplier || '',
      awardAmount: numberOrNull(row.award_amount),
      terminationReason: row.termination_reason || '',
      changeSummary: row.change_summary || '',
      workflowStage: row.workflow_stage || 'discovery',
      decisionOutcome: row.decision_outcome || 'undecided',
      decisionReason: row.decision_reason || '',
      decisionDueAt: row.decision_due_at || '',
      nextAction: row.next_action || '',
      nextActionDueAt: row.next_action_due_at || '',
      tenderFile: row.tender_markdown_path ? { fileName: row.tender_file_name || '正式招标文件', markdownPath: row.tender_markdown_path, contentHash: row.tender_markdown_hash || '', parserLabel: row.tender_parser_label || '', importedAt: row.tender_imported_at || '' } : null,
      technicalPlanProjectId: row.technical_plan_project_id || '',
      budget: numberOrNull(row.budget),
      summary: row.summary,
      content: includeContent && filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '',
      sourceKind: row.source_kind,
      projectClusterId: row.project_cluster_id || '',
      announcementStage: row.announcement_stage || announcementStage(row.notice_type),
      clusterConfidence: numberOrNull(row.cluster_confidence),
      clusterMethod: row.cluster_method || '',
      ruleScore: row.rule_score,
      informationScore: row.information_score,
      qualificationStatus: row.qualification_status,
      valueScore: row.value_score,
      feasibilityScore: row.feasibility_score,
      recommendation: row.recommendation,
      matchedKeywords: json(row.matched_keywords_json),
      riskFlags: json(row.risk_flags_json),
      status: row.status,
      owner: row.owner,
      notes: row.notes,
      presalesProjectId: row.presales_project_id || '',
      deepAnalysis: json(row.deep_analysis_json, null),
      analysisTask: json(row.analysis_task_json, null),
      analysisSignature: row.analysis_signature || '',
      analyzedAt: row.analyzed_at || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function getOpportunity(opportunityId) {
    const row = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id = ?').get(text(opportunityId, 80));
    if (!row) throw new Error('投标机会不存在或已删除');
    const mapped = opportunityFromRow(row);
    if (mapped.analysisTask?.status === 'running' && !activeAnalyses.has(row.opportunity_id)) {
      mapped.analysisTask = { ...mapped.analysisTask, status: 'error', progress: 100, message: '上次分析被中断', error: '上次分析被中断，请重新执行。', updatedAt: now(), finishedAt: now() };
      db.prepare('UPDATE bid_opportunities SET analysis_task_json=? WHERE opportunity_id=?').run(JSON.stringify(mapped.analysisTask), row.opportunity_id);
    }
    const events = db.prepare('SELECT * FROM opportunity_events WHERE opportunity_id = ? ORDER BY created_at DESC').all(row.opportunity_id).map((event) => ({
      eventId: event.event_id, eventType: event.event_type, title: event.title, detail: event.detail, createdAt: event.created_at,
    }));
    const matches = db.prepare(`SELECT m.*, o.* FROM opportunity_monitor_matches m JOIN opportunity_monitors o ON o.monitor_id=m.monitor_id WHERE m.opportunity_id=? ORDER BY m.match_score DESC`).all(row.opportunity_id).map((item) => ({
      monitorId: item.monitor_id, monitorName: item.name, matchedKeywords: json(item.matched_keywords_json), matchScore: item.match_score,
      reasons: scoreOpportunity(mapped, [monitorFromRow(item)]).reasons,
    }));
    const timelineRows = mapped.projectClusterId ? db.prepare(`SELECT * FROM bid_opportunities WHERE project_cluster_id=? ORDER BY COALESCE(publish_date, created_at) ASC`).all(mapped.projectClusterId) : [row];
    const projectTimeline = timelineRows.map((item, index, all) => {
      const previous = index > 0 ? all[index - 1] : null;
      const changes = [];
      if (previous && previous.notice_type !== item.notice_type) changes.push(`由“${previous.notice_type}”推进至“${item.notice_type}”`);
      if (previous && numberOrNull(previous.budget) !== null && numberOrNull(item.budget) !== null && previous.budget !== item.budget) changes.push(`预算由 ${previous.budget} 元调整为 ${item.budget} 元`);
      if (previous && previous.bid_deadline && item.bid_deadline && previous.bid_deadline !== item.bid_deadline) changes.push('投标截止时间发生变化');
      return { opportunityId: item.opportunity_id, title: item.title, noticeType: item.notice_type, announcementStage: item.announcement_stage || announcementStage(item.notice_type), sourceName: item.source_name, sourceUrl: item.source_url, publishDate: item.publish_date || item.created_at, budget: numberOrNull(item.budget), awardSupplier: item.award_supplier || '', awardAmount: numberOrNull(item.award_amount), terminationReason: item.termination_reason || '', isCurrent: item.opportunity_id === row.opportunity_id, changeSummary: item.change_summary || changes.join('；') };
    });
    const relationCandidates = findRelationCandidates(row, 6);
    return { ...mapped, events, monitorMatches: matches, projectTimeline, relationCandidates };
  }

  function findRelationCandidates(row, limit = 6) {
    const normalizedTitle = normalizeProjectTitle(row.title);
    if (!normalizedTitle) return [];
    const clusters = db.prepare(`SELECT c.*, COUNT(o.opportunity_id) notice_count,
      MAX(COALESCE(o.publish_date,o.created_at)) latest_date
      FROM opportunity_project_clusters c LEFT JOIN bid_opportunities o ON o.project_cluster_id=c.cluster_id
      WHERE c.cluster_id<>? GROUP BY c.cluster_id ORDER BY c.updated_at DESC LIMIT 500`).all(row.project_cluster_id || '');
    return clusters.map((candidate) => {
      const similarity = titleSimilarity(normalizedTitle, candidate.normalized_title);
      const buyerMatches = Boolean(row.buyer && candidate.buyer && (row.buyer === candidate.buyer || row.buyer.includes(candidate.buyer) || candidate.buyer.includes(row.buyer)));
      const projectCodeMatches = Boolean(row.project_code && candidate.project_code && row.project_code === candidate.project_code);
      const score = projectCodeMatches ? 1 : Math.min(0.99, similarity + (buyerMatches ? 0.08 : 0));
      return { clusterId: candidate.cluster_id, title: candidate.canonical_title, buyer: candidate.buyer || '', projectCode: candidate.project_code || '', noticeCount: candidate.notice_count || 0, latestDate: candidate.latest_date || '', confidence: score, reason: projectCodeMatches ? '项目编号一致' : buyerMatches ? `采购人一致，名称相似度 ${Math.round(similarity * 100)}%` : `名称相似度 ${Math.round(similarity * 100)}%` };
    }).filter((candidate) => candidate.confidence >= 0.45).sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  }

  function assignProjectCluster(opportunityId) {
    const row = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
    if (!row) return;
    const normalizedTitle = normalizeProjectTitle(row.title);
    const buyer = text(row.buyer, 300);
    const projectCode = text(row.project_code, 160);
    let cluster = projectCode ? db.prepare('SELECT * FROM opportunity_project_clusters WHERE project_code=? LIMIT 1').get(projectCode) : null;
    let confidence = cluster ? 1 : 0;
    let method = cluster ? 'project_code' : '';
    if (!cluster && normalizedTitle) {
      const candidates = db.prepare(`SELECT * FROM opportunity_project_clusters WHERE normalized_title=? OR buyer=? OR buyer='' OR ?='' ORDER BY updated_at DESC LIMIT 300`).all(normalizedTitle, buyer, buyer);
      for (const candidate of candidates) {
        const score = titleSimilarity(normalizedTitle, candidate.normalized_title);
        const buyerMatches = !buyer || !candidate.buyer || buyer === candidate.buyer || buyer.includes(candidate.buyer) || candidate.buyer.includes(buyer);
        const exactLongTitle = normalizedTitle.length >= 12 && normalizedTitle === candidate.normalized_title;
        if ((buyerMatches && score >= 0.78 || exactLongTitle) && score > confidence) { cluster = candidate; confidence = exactLongTitle && !buyerMatches ? 0.94 : score; method = exactLongTitle && !buyerMatches ? 'exact_title' : 'buyer_title'; }
      }
    }
    const timestamp = now();
    if (!cluster) {
      const clusterId = id('opc');
      const initialStage = row.announcement_stage && row.announcement_stage !== 'other' ? row.announcement_stage : announcementStage(row.notice_type);
      db.prepare(`INSERT INTO opportunity_project_clusters (cluster_id,canonical_title,normalized_title,buyer,project_code,current_stage,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(clusterId, row.title, normalizedTitle, buyer, projectCode, initialStage, timestamp, timestamp);
      cluster = { cluster_id: clusterId, current_stage: initialStage };
      confidence = 1; method = 'new_cluster';
    }
    const stage = row.announcement_stage && row.announcement_stage !== 'other' ? row.announcement_stage : announcementStage(row.notice_type);
    const currentStage = stageOrder[stage] >= stageOrder[cluster.current_stage || 'other'] ? stage : cluster.current_stage;
    db.prepare(`UPDATE opportunity_project_clusters SET buyer=CASE WHEN buyer='' THEN ? ELSE buyer END, project_code=CASE WHEN project_code='' THEN ? ELSE project_code END, current_stage=?, updated_at=? WHERE cluster_id=?`)
      .run(buyer, projectCode, currentStage, timestamp, cluster.cluster_id);
    db.prepare('UPDATE bid_opportunities SET project_cluster_id=?,announcement_stage=?,cluster_confidence=?,cluster_method=? WHERE opportunity_id=?')
      .run(cluster.cluster_id, stage, confidence, method, opportunityId);
  }

  function ensureProjectClusters() {
    const rows = db.prepare(`SELECT opportunity_id,notice_type FROM bid_opportunities WHERE project_cluster_id IS NULL OR project_cluster_id=''`).all();
    for (const row of rows) {
      db.prepare('UPDATE bid_opportunities SET announcement_stage=? WHERE opportunity_id=?').run(announcementStage(row.notice_type), row.opportunity_id);
      assignProjectCluster(row.opportunity_id);
    }
  }

  function mergeProjectClusters(payload = {}) {
    const opportunityId = text(payload.opportunityId, 80);
    const targetClusterId = text(payload.targetClusterId, 100);
    const row = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
    const target = db.prepare('SELECT * FROM opportunity_project_clusters WHERE cluster_id=?').get(targetClusterId);
    if (!row || !target) throw new Error('待合并的项目链路不存在');
    if (row.project_cluster_id === targetClusterId) return getOpportunity(opportunityId);
    const sourceClusterId = row.project_cluster_id;
    const timestamp = now();
    const transaction = db.transaction(() => {
      const moved = sourceClusterId ? db.prepare('SELECT opportunity_id FROM bid_opportunities WHERE project_cluster_id=?').all(sourceClusterId) : [{ opportunity_id: opportunityId }];
      db.prepare(`UPDATE bid_opportunities SET project_cluster_id=?,cluster_confidence=1,cluster_method='manual_merge',updated_at=? WHERE project_cluster_id=?`)
        .run(targetClusterId, timestamp, sourceClusterId);
      if (!sourceClusterId) db.prepare(`UPDATE bid_opportunities SET project_cluster_id=?,cluster_confidence=1,cluster_method='manual_merge',updated_at=? WHERE opportunity_id=?`).run(targetClusterId, timestamp, opportunityId);
      for (const item of moved) addEvent(item.opportunity_id, 'cluster_merge', '已人工合并项目链路', target.canonical_title);
      if (sourceClusterId) db.prepare('DELETE FROM opportunity_project_clusters WHERE cluster_id=?').run(sourceClusterId);
      const stages = db.prepare('SELECT announcement_stage FROM bid_opportunities WHERE project_cluster_id=?').all(targetClusterId);
      const currentStage = stages.reduce((best, item) => stageOrder[item.announcement_stage] > stageOrder[best] ? item.announcement_stage : best, target.current_stage || 'other');
      db.prepare('UPDATE opportunity_project_clusters SET current_stage=?,updated_at=? WHERE cluster_id=?').run(currentStage, timestamp, targetClusterId);
    });
    transaction();
    emit(opportunityId);
    return getOpportunity(opportunityId);
  }

  function splitOpportunityCluster(opportunityIdValue) {
    const opportunityId = text(opportunityIdValue, 80);
    const row = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
    if (!row) throw new Error('投标机会不存在');
    const count = row.project_cluster_id ? db.prepare('SELECT COUNT(*) count FROM bid_opportunities WHERE project_cluster_id=?').get(row.project_cluster_id).count : 1;
    if (count <= 1) throw new Error('当前项目链路只有这一条公告，无需拆分');
    const timestamp = now(); const clusterId = id('opc'); const stage = row.announcement_stage || announcementStage(row.notice_type);
    const transaction = db.transaction(() => {
      db.prepare(`INSERT INTO opportunity_project_clusters (cluster_id,canonical_title,normalized_title,buyer,project_code,current_stage,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(clusterId, row.title, normalizeProjectTitle(row.title), row.buyer || '', row.project_code || '', stage, timestamp, timestamp);
      db.prepare(`UPDATE bid_opportunities SET project_cluster_id=?,cluster_confidence=1,cluster_method='manual_split',updated_at=? WHERE opportunity_id=?`).run(clusterId, timestamp, opportunityId);
      addEvent(opportunityId, 'cluster_split', '已从原项目链路拆分', '人工确认该公告属于独立项目');
    });
    transaction(); emit(opportunityId); return getOpportunity(opportunityId);
  }

  function analysisSignature(opportunity, profile) {
    return crypto.createHash('sha256').update(JSON.stringify({
      title: opportunity.title, buyer: opportunity.buyer, content: opportunity.content, summary: opportunity.summary,
      deadline: opportunity.bidDeadline, budget: opportunity.budget, profile,
    })).digest('hex');
  }

  function normalizeEvidence(value, sourceText) {
    const quote = text(value?.quote || value?.evidence, 500);
    return { quote, source: text(value?.source, 100) || '公告正文', verified: Boolean(quote && sourceText.includes(quote)) };
  }

  function normalizeDeepAnalysis(value, sourceText) {
    const requirements = Array.isArray(value?.requirements) ? value.requirements : [];
    const pending = Array.isArray(value?.pending_confirmations) ? value.pending_confirmations : [];
    const risks = Array.isArray(value?.risks) ? value.risks : [];
    const strengths = Array.isArray(value?.strengths) ? value.strengths : [];
    return {
      conclusion: ['recommend', 'conditional', 'not_recommend'].includes(value?.conclusion) ? value.conclusion : 'conditional',
      conclusionReason: text(value?.conclusion_reason, 1200),
      projectSummary: text(value?.project_summary, 3000),
      qualificationStatus: ['met', 'partial', 'unmet', 'unknown'].includes(value?.qualification_status) ? value.qualification_status : 'unknown',
      valueScore: Math.max(0, Math.min(100, Number(value?.value_score) || 0)),
      feasibilityScore: Math.max(0, Math.min(100, Number(value?.feasibility_score) || 0)),
      requirements: requirements.slice(0, 40).map((item) => ({
        category: text(item?.category, 40), requirement: text(item?.requirement, 600),
        matchStatus: ['met', 'partial', 'unmet', 'unknown'].includes(item?.match_status) ? item.match_status : 'unknown',
        profileEvidence: text(item?.profile_evidence, 600), evidence: normalizeEvidence(item?.evidence, sourceText),
      })),
      strengths: strengths.slice(0, 20).map((item) => text(item, 500)).filter(Boolean),
      risks: risks.slice(0, 20).map((item) => ({ title: text(item?.title || item, 200), detail: text(item?.detail, 800), evidence: normalizeEvidence(item?.evidence, sourceText) })),
      pendingConfirmations: pending.slice(0, 20).map((item) => text(item, 500)).filter(Boolean),
      recommendedActions: list(value?.recommended_actions).slice(0, 15),
    };
  }

  function buildAnalysisMessages(opportunity, profile) {
    return [
      { role: 'system', content: '你是严谨的招投标商机分析师。只能依据公告原文和企业画像判断；信息缺失必须标记 unknown，不得猜测。所有公告证据 quote 必须逐字摘自原文，保持连续且不改写。' },
      { role: 'user', content: `【企业能力画像】\n${JSON.stringify(profile, null, 2)}\n\n【公告基础信息】\n${JSON.stringify({ title: opportunity.title, buyer: opportunity.buyer, region: opportunity.region, industry: opportunity.industry, budget: opportunity.budget, bidDeadline: opportunity.bidDeadline }, null, 2)}\n\n【公告原文】\n${opportunity.content || opportunity.summary}\n\n请分析资格门槛、企业匹配、商机价值、投标可行性、风险和待确认事项。返回严格 JSON：\n{"conclusion":"recommend|conditional|not_recommend","conclusion_reason":"","project_summary":"","qualification_status":"met|partial|unmet|unknown","value_score":0,"feasibility_score":0,"requirements":[{"category":"资质|人员|业绩|财务|地域|联合体|时间|其他","requirement":"","match_status":"met|partial|unmet|unknown","profile_evidence":"企业画像中的匹配依据或空字符串","evidence":{"quote":"公告原文逐字摘录","source":"公告正文"}}],"strengths":[""],"risks":[{"title":"","detail":"","evidence":{"quote":"公告原文逐字摘录或空字符串","source":"公告正文"}}],"pending_confirmations":[""],"recommended_actions":[""]}` },
    ];
  }

  function updateAnalysisTask(opportunityId, task, analysis) {
    db.prepare(`UPDATE bid_opportunities SET analysis_task_json=?, deep_analysis_json=COALESCE(?,deep_analysis_json),
      analysis_signature=COALESCE(?,analysis_signature), analyzed_at=CASE WHEN ? IS NULL THEN analyzed_at ELSE ? END,
      qualification_status=COALESCE(?,qualification_status), value_score=COALESCE(?,value_score),
      feasibility_score=COALESCE(?,feasibility_score), recommendation=COALESCE(?,recommendation), updated_at=? WHERE opportunity_id=?`).run(
      JSON.stringify(task), analysis ? JSON.stringify(analysis) : null, analysis?.signature || null, analysis ? 1 : null, now(),
      analysis?.qualificationStatus || null, analysis?.valueScore ?? null, analysis?.feasibilityScore ?? null,
      analysis ? ({ recommend: '建议重点跟进', conditional: '补充信息后判断', not_recommend: '不建议参与' }[analysis.conclusion]) : null,
      now(), opportunityId,
    );
    emit(opportunityId);
  }

  async function runDeepAnalysis(opportunityId, task) {
    try {
      const opportunity = getOpportunity(opportunityId);
      const profile = getEnterpriseProfile();
      const sourceText = opportunity.content || opportunity.summary;
      if (!sourceText.trim()) throw new Error('缺少公告正文或摘要，无法进行深度分析');
      if (!profile.companyName && !profile.capabilities.length && !profile.qualifications.length) throw new Error('请先配置企业能力画像');
      updateAnalysisTask(opportunityId, { ...task, progress: 25, message: '正在提取资格门槛并匹配企业能力', updatedAt: now() });
      const raw = await aiService.collectJsonResponse({
        messages: buildAnalysisMessages(opportunity, profile), temperature: 0.1, response_format: { type: 'json_object' },
        logTitle: `投标机会深度分析-${opportunity.title}`, progressLabel: '投标机会深度分析',
        normalizer: (value) => value, validator: (value) => Boolean(value && typeof value === 'object'),
        failureMessage: '投标机会深度分析失败，AI 未返回有效 JSON',
      });
      updateAnalysisTask(opportunityId, { ...task, progress: 82, message: '正在校验证据和整理结论', updatedAt: now() });
      const analysis = normalizeDeepAnalysis(raw, sourceText);
      analysis.signature = analysisSignature(opportunity, profile);
      const finalTask = { ...task, status: 'success', progress: 100, message: '深度分析已完成', updatedAt: now(), finishedAt: now() };
      updateAnalysisTask(opportunityId, finalTask, analysis);
      addEvent(opportunityId, 'analysis', 'AI 深度分析已完成', analysis.conclusionReason);
    } catch (error) {
      const failed = { ...task, status: 'error', progress: 100, message: '深度分析失败', error: error.message || String(error), updatedAt: now(), finishedAt: now() };
      updateAnalysisTask(opportunityId, failed);
    } finally {
      activeAnalyses.delete(opportunityId);
    }
  }

  function startDeepAnalysis(opportunityId) {
    const opportunity = getOpportunity(opportunityId);
    if (activeAnalyses.has(opportunityId)) return opportunity;
    const task = { taskId: id('oa'), status: 'running', progress: 5, message: '正在准备深度分析', startedAt: now(), updatedAt: now() };
    activeAnalyses.add(opportunityId);
    updateAnalysisTask(opportunityId, task);
    setImmediate(() => void runDeepAnalysis(opportunityId, task));
    return getOpportunity(opportunityId);
  }

  function addEvent(opportunityId, eventType, title, detail = '') {
    db.prepare('INSERT INTO opportunity_events (event_id, opportunity_id, event_type, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id('oe'), opportunityId, eventType, title, text(detail, 2000), now());
  }

  function applyScore(opportunityId) {
    const row = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
    if (!row) return;
    const opportunity = opportunityFromRow(row);
    const monitors = listMonitors();
    const scored = scoreOpportunity(opportunity, monitors);
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE bid_opportunities SET rule_score=?, information_score=?, value_score=?, feasibility_score=?, recommendation=?,
        matched_keywords_json=?, risk_flags_json=?, updated_at=? WHERE opportunity_id=?`).run(
        scored.score, scored.informationScore, scored.valueScore, scored.feasibilityScore, scored.recommendation,
        JSON.stringify(scored.keywords), JSON.stringify(scored.risks), now(), opportunityId,
      );
      db.prepare('DELETE FROM opportunity_monitor_matches WHERE opportunity_id=?').run(opportunityId);
      for (const monitor of monitors) {
        const one = scoreOpportunity(opportunity, [monitor]);
        if (one.score <= 0) continue;
        db.prepare('INSERT INTO opportunity_monitor_matches (opportunity_id, monitor_id, matched_keywords_json, match_score, matched_at) VALUES (?, ?, ?, ?, ?)')
          .run(opportunityId, monitor.monitorId, JSON.stringify(one.keywords), one.score, now());
      }
    });
    transaction();
  }

  function rematchAll() {
    const ids = db.prepare('SELECT opportunity_id FROM bid_opportunities').all();
    for (const item of ids) applyScore(item.opportunity_id);
  }

  function saveOpportunity(payload = {}) {
    const timestamp = now();
    const opportunityId = text(payload.opportunityId, 80) || id('bo');
    const previous = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
    const content = text(payload.content, 1200000);
    const combined = `${payload.title || ''}\n${payload.summary || ''}\n${content}`;
    const budget = numberOrNull(payload.budget) ?? extractBudget(combined);
    const deadline = text(payload.bidDeadline, 50) || extractDeadline(combined);
    const relativeContentPath = path.relative(getWorkspaceDir(app), contentPath(opportunityId)).replace(/\\/g, '/');
    if (content) fs.writeFileSync(contentPath(opportunityId), content, 'utf-8');
    db.prepare(`INSERT INTO bid_opportunities (
      opportunity_id,title,notice_type,source_name,source_url,project_code,buyer,region,industry,publish_date,bid_deadline,budget,
      summary,content_path,source_kind,status,owner,notes,created_at,updated_at
    ) VALUES (@opportunity_id,@title,@notice_type,@source_name,@source_url,@project_code,@buyer,@region,@industry,@publish_date,@bid_deadline,@budget,
      @summary,@content_path,@source_kind,@status,@owner,@notes,@created_at,@updated_at)
    ON CONFLICT(opportunity_id) DO UPDATE SET title=excluded.title,notice_type=excluded.notice_type,source_name=excluded.source_name,
      source_url=excluded.source_url,project_code=excluded.project_code,buyer=excluded.buyer,region=excluded.region,industry=excluded.industry,
      publish_date=excluded.publish_date,bid_deadline=excluded.bid_deadline,budget=excluded.budget,summary=excluded.summary,
      content_path=CASE WHEN excluded.content_path='' THEN bid_opportunities.content_path ELSE excluded.content_path END,
      source_kind=excluded.source_kind,status=excluded.status,owner=excluded.owner,notes=excluded.notes,updated_at=excluded.updated_at`).run({
      opportunity_id: opportunityId,
      title: text(payload.title, 500) || '未命名投标机会',
      notice_type: normalizeNoticeType(payload.noticeType, combined),
      source_name: text(payload.sourceName, 160) || (payload.sourceKind === 'file' ? '本地文件' : '手工录入'),
      source_url: text(payload.sourceUrl, 2000),
      project_code: text(payload.projectCode, 160),
      buyer: text(payload.buyer, 300),
      region: text(payload.region, 100),
      industry: text(payload.industry, 100),
      publish_date: text(payload.publishDate, 50) || null,
      bid_deadline: deadline || null,
      budget,
      summary: text(payload.summary, 10000),
      content_path: content ? relativeContentPath : '',
      source_kind: text(payload.sourceKind, 30) || 'manual',
      status: statuses.has(payload.status) ? payload.status : previous?.status || 'new',
      owner: text(payload.owner, 100),
      notes: text(payload.notes, 10000),
      created_at: previous?.created_at || timestamp,
      updated_at: timestamp,
    });
    if (previous) db.prepare('UPDATE bid_opportunities SET analysis_signature=NULL WHERE opportunity_id=?').run(opportunityId);
    addEvent(opportunityId, previous ? 'updated' : 'created', previous ? '机会信息已更新' : '机会已录入', payload.sourceName || '手工录入');
    assignProjectCluster(opportunityId);
    applyScore(opportunityId);
    return getOpportunity(opportunityId);
  }

  function upsertScannedOpportunity(source, item) {
    const previous = db.prepare('SELECT * FROM bid_opportunities WHERE source_name=? AND source_item_id=?').get(source.name, item.sourceItemId);
    if (previous?.content_hash && previous.content_hash === item.contentHash) {
      db.prepare('UPDATE bid_opportunities SET last_seen_at=?, updated_at=updated_at WHERE opportunity_id=?').run(now(), previous.opportunity_id);
      return { action: 'skipped', opportunityId: previous.opportunity_id };
    }
    const timestamp = now();
    const opportunityId = previous?.opportunity_id || id('bo');
    const relativeContentPath = path.relative(getWorkspaceDir(app), contentPath(opportunityId)).replace(/\\/g, '/');
    fs.writeFileSync(contentPath(opportunityId), item.content, 'utf-8');
    db.prepare(`INSERT INTO bid_opportunities (
      opportunity_id,title,notice_type,source_name,source_url,source_item_id,project_code,buyer,region,industry,publish_date,bid_deadline,expected_purchase_date,budget,announcement_stage,award_supplier,award_amount,termination_reason,change_summary,
      summary,content_path,content_hash,last_seen_at,source_kind,status,owner,notes,created_at,updated_at
    ) VALUES (@opportunity_id,@title,@notice_type,@source_name,@source_url,@source_item_id,@project_code,@buyer,@region,'',@publish_date,@bid_deadline,@expected_purchase_date,@budget,@announcement_stage,@award_supplier,@award_amount,@termination_reason,@change_summary,
      @summary,@content_path,@content_hash,@last_seen_at,'remote',@status,'','',@created_at,@updated_at)
    ON CONFLICT(opportunity_id) DO UPDATE SET title=excluded.title,notice_type=excluded.notice_type,source_url=excluded.source_url,
      project_code=excluded.project_code,buyer=excluded.buyer,region=excluded.region,publish_date=excluded.publish_date,bid_deadline=excluded.bid_deadline,
      expected_purchase_date=excluded.expected_purchase_date,budget=excluded.budget,announcement_stage=excluded.announcement_stage,award_supplier=excluded.award_supplier,award_amount=excluded.award_amount,termination_reason=excluded.termination_reason,change_summary=excluded.change_summary,summary=excluded.summary,content_path=excluded.content_path,content_hash=excluded.content_hash,last_seen_at=excluded.last_seen_at,
      analysis_signature=NULL,updated_at=excluded.updated_at`).run({
      opportunity_id: opportunityId, title: text(item.title, 500), notice_type: item.noticeType, source_name: source.name,
      source_url: item.url, source_item_id: item.sourceItemId, project_code: text(item.projectCode, 160), buyer: text(item.buyer, 300),
      region: text(item.region, 100), publish_date: item.publishDate || null, bid_deadline: item.bidDeadline || null, budget: item.budget,
      expected_purchase_date: item.expectedPurchaseDate || null, announcement_stage: item.announcementStage || announcementStage(item.noticeType),
      award_supplier: text(item.awardSupplier, 1000), award_amount: numberOrNull(item.awardAmount), termination_reason: text(item.terminationReason, 5000), change_summary: text(item.changeSummary, 5000),
      summary: text(item.summary, 10000), content_path: relativeContentPath, content_hash: item.contentHash, last_seen_at: timestamp,
      status: previous?.status || 'new', created_at: previous?.created_at || timestamp, updated_at: timestamp,
    });
    addEvent(opportunityId, previous ? 'source_updated' : 'source_created', previous ? '数据源公告内容已更新' : '数据源发现新公告', source.name);
    assignProjectCluster(opportunityId);
    applyScore(opportunityId);
    return { action: previous ? 'updated' : 'created', opportunityId };
  }

  async function runSourceScan(sourceId, runId) {
    const source = listSources().find((item) => item.sourceId === sourceId);
    try {
      if (!source) throw new Error('数据源不存在');
      const adapter = getAdapter(source);
      updateScan(runId, sourceId, { progress: 8, message: '正在读取公告列表' });
      const listItems = await adapter.fetchList();
      const maxItems = Math.max(1, Math.min(50, Number(source.config?.maxItems) || 20));
      const candidates = listItems.slice(0, maxItems);
      let createdCount = 0; let updatedCount = 0; let skippedCount = 0; let matchedCount = 0;
      const errors = [];
      updateScan(runId, sourceId, { fetchedCount: listItems.length, progress: 15, message: `已读取 ${listItems.length} 条公告，准备解析前 ${candidates.length} 条` });
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        try {
          const previous = source.adapterType === 'ccgp-procurement-intention' ? null : db.prepare('SELECT content_hash FROM bid_opportunities WHERE source_name=? AND source_item_id=?').get(source.name, candidate.sourceItemId);
          if (previous?.content_hash && index >= 5) {
            db.prepare('UPDATE bid_opportunities SET last_seen_at=? WHERE source_name=? AND source_item_id=?').run(now(), source.name, candidate.sourceItemId);
            skippedCount += 1;
          } else {
            const details = await adapter.fetchDetail(candidate);
            for (const detail of Array.isArray(details) ? details : [details]) {
              const result = upsertScannedOpportunity(source, detail);
              if (result.action === 'created') createdCount += 1;
              else if (result.action === 'updated') updatedCount += 1;
              else skippedCount += 1;
              if (db.prepare('SELECT 1 FROM opportunity_monitor_matches WHERE opportunity_id=? LIMIT 1').get(result.opportunityId)) matchedCount += 1;
            }
          }
        } catch (error) {
          errors.push(`${candidate.title}：${error.message || String(error)}`);
        }
        updateScan(runId, sourceId, { progress: 15 + Math.round(((index + 1) / candidates.length) * 80), message: `正在处理公告 ${index + 1}/${candidates.length}`, createdCount, updatedCount, skippedCount, matchedCount, errors });
      }
      const status = errors.length === candidates.length ? 'error' : 'success';
      const finishedAt = now();
      const final = updateScan(runId, sourceId, { status, progress: 100, message: status === 'success' ? `扫描完成，新增 ${createdCount} 条` : '扫描失败，未成功解析公告', createdCount, updatedCount, skippedCount, matchedCount, errors, finishedAt }, { emitEvent: false });
      db.prepare(`UPDATE opportunity_sources SET health_status=?,last_run_at=?,last_success_at=?,last_error=?,last_result_json=?,updated_at=? WHERE source_id=?`)
        .run(status === 'success' ? (errors.length ? 'warning' : 'healthy') : 'error', finishedAt, status === 'success' ? finishedAt : source.lastSuccessAt || null,
          errors.slice(0, 5).join('\n'), JSON.stringify(final), finishedAt, sourceId);
      emitScan(sourceId);
    } catch (error) {
      const finishedAt = now();
      const message = error.message || String(error);
      const final = updateScan(runId, sourceId, { status: 'error', progress: 100, message: '数据源扫描失败', errors: [message], finishedAt }, { emitEvent: false });
      db.prepare('UPDATE opportunity_sources SET health_status=?,last_run_at=?,last_error=?,last_result_json=?,updated_at=? WHERE source_id=?')
        .run('error', finishedAt, message, JSON.stringify(final), finishedAt, sourceId);
      emitScan(sourceId);
    } finally {
      activeScans.delete(sourceId);
      lastEmittedScanProgress.delete(sourceId);
    }
  }

  function startSourceScan(sourceId) {
    const source = listSources().find((item) => item.sourceId === sourceId);
    if (!source) throw new Error('数据源不存在');
    if (!source.enabled) throw new Error('数据源已停用');
    if (activeScans.has(sourceId)) return getLatestScans()[sourceId];
    const timestamp = now();
    const runId = id('os');
    db.prepare(`INSERT INTO opportunity_scan_runs (run_id,source_id,status,progress,message,started_at,updated_at) VALUES (?,?,'running',1,'正在准备扫描',?,?)`)
      .run(runId, sourceId, timestamp, timestamp);
    activeScans.add(sourceId);
    emitScan(sourceId);
    setImmediate(() => void runSourceScan(sourceId, runId));
    return getLatestScans()[sourceId];
  }

  function startAllSourceScans() {
    if (activeScanAll) return getScanBatch();
    if (activeScans.size) throw new Error('已有数据源正在扫描，请完成后再扫描全部来源');
    const sources = listSources().filter((source) => source.enabled);
    if (!sources.length) throw new Error('没有已启用的数据源');
    activeScanAll = { startedAt: now(), total: sources.length, completed: 0, createdCount: 0, updatedCount: 0 };
    latestScanBatch = null;
    setImmediate(async () => {
      try {
        for (const source of sources) {
          if (activeScans.has(source.sourceId)) continue;
          const timestamp = now(); const runId = id('os');
          db.prepare(`INSERT INTO opportunity_scan_runs (run_id,source_id,status,progress,message,started_at,updated_at) VALUES (?,?,'running',1,'批量扫描正在准备',?,?)`).run(runId, source.sourceId, timestamp, timestamp);
          activeScans.add(source.sourceId); emitScan(source.sourceId);
          await runSourceScan(source.sourceId, runId);
          const scan = getLatestScans()[source.sourceId];
          activeScanAll.completed += 1;
          activeScanAll.createdCount += scan?.createdCount || 0;
          activeScanAll.updatedCount += scan?.updatedCount || 0;
          emitScan(source.sourceId);
        }
      } finally {
        latestScanBatch = { status: 'idle', startedAt: activeScanAll?.startedAt || '', total: activeScanAll?.total || sources.length, completed: activeScanAll?.completed || 0, running: 0, createdCount: activeScanAll?.createdCount || 0, updatedCount: activeScanAll?.updatedCount || 0 };
        activeScanAll = null;
        const first = sources[0]; if (first) emitScan(first.sourceId);
      }
    });
    return getScanBatch();
  }

  function updateSource(payload = {}) {
    const sourceId = text(payload.sourceId, 100);
    const source = listSources().find((item) => item.sourceId === sourceId);
    if (!source) throw new Error('数据源不存在');
    const maxItems = Math.max(1, Math.min(50, Number(payload.maxItems ?? source.config?.maxItems) || 20));
    db.prepare('UPDATE opportunity_sources SET enabled=?,config_json=?,updated_at=? WHERE source_id=?')
      .run(payload.enabled === false ? 0 : 1, JSON.stringify({ ...source.config, maxItems }), now(), sourceId);
    return listSources().find((item) => item.sourceId === sourceId);
  }

  async function importOpportunityFile() {
    const result = await fileService.importDocument({ title: '选择招标公告或招标文件', filterName: '招投标文件', assetScope: 'bid-opportunity' });
    if (!result.success) return result;
    const content = result.file_content || '';
    const title = text(content.match(/^#\s+(.+)$/m)?.[1], 500) || path.basename(result.file_name || '', path.extname(result.file_name || '')) || '导入的投标机会';
    const opportunity = saveOpportunity({ title, content, summary: text(content.replace(/[#>*_`]/g, ' '), 600), sourceName: result.file_name, sourceKind: 'file' });
    return { success: true, message: '文件已解析并创建投标机会', opportunity };
  }

  function filterOpportunities(items, filters = {}) {
    const keyword = text(filters.keyword, 200).toLowerCase();
    const monitorId = text(filters.monitorId, 80);
    const status = text(filters.status, 30);
    const inbox = text(filters.inbox, 30);
    const monitorOpportunityIds = monitorId
      ? new Set(db.prepare('SELECT opportunity_id FROM opportunity_monitor_matches WHERE monitor_id=?').all(monitorId).map((row) => row.opportunity_id))
      : null;
    return items.filter((item) => {
      if (status && item.status !== status) return false;
      if (inbox && !matchesInbox(item, inbox)) return false;
      if (keyword && !`${item.title} ${item.buyer} ${item.region} ${item.summary} ${item.matchedKeywords.join(' ')}`.toLowerCase().includes(keyword)) return false;
      if (monitorOpportunityIds && !monitorOpportunityIds.has(item.opportunityId)) return false;
      return true;
    });
  }

  function matchesInbox(item, inbox) {
    const age = Date.now() - new Date(item.createdAt).getTime();
    const deadlineTime = item.bidDeadline ? new Date(item.bidDeadline).getTime() : 0;
    if (inbox === 'new') return item.status === 'new' && age >= 0 && age <= 86400000;
    if (inbox === 'changes') return ['correction', 'result', 'terminated'].includes(item.announcementStage) && Date.now() - new Date(item.publishDate || item.createdAt).getTime() <= 14 * 86400000;
    if (inbox === 'due') return ['tender', 'correction'].includes(item.announcementStage) && deadlineTime >= Date.now() && deadlineTime <= Date.now() + 10 * 86400000;
    if (inbox === 'tasks') {
      const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
      const actionDue = item.nextAction && item.nextActionDueAt ? new Date(item.nextActionDueAt).getTime() : 0;
      const decisionDue = item.decisionOutcome === 'undecided' && item.decisionDueAt ? new Date(item.decisionDueAt).getTime() : 0;
      return !['won', 'abandoned', 'archived'].includes(item.status) && ((actionDue > 0 && actionDue <= endOfToday.getTime()) || (decisionDue > 0 && decisionDue <= endOfToday.getTime()));
    }
    if (inbox === 'relation') {
      if (item.clusterMethod === 'buyer_title' && item.clusterConfidence !== null && item.clusterConfidence < 0.9) return true;
      const row = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(item.opportunityId);
      const count = db.prepare('SELECT COUNT(*) count FROM bid_opportunities WHERE project_cluster_id=?').get(item.projectClusterId).count;
      return count === 1 && findRelationCandidates(row, 1)[0]?.confidence >= 0.6;
    }
    return true;
  }

  function countRelationInbox(items) {
    const clusters = db.prepare(`SELECT c.*, COUNT(o.opportunity_id) notice_count
      FROM opportunity_project_clusters c
      LEFT JOIN bid_opportunities o ON o.project_cluster_id=c.cluster_id
      GROUP BY c.cluster_id
      ORDER BY c.updated_at DESC`).all();
    const clustersById = new Map(clusters.map((cluster) => [cluster.cluster_id, cluster]));
    let count = 0;
    for (const item of items) {
      if (item.clusterMethod === 'buyer_title' && item.clusterConfidence !== null && item.clusterConfidence < 0.9) {
        count += 1;
        continue;
      }
      if ((clustersById.get(item.projectClusterId)?.notice_count || 1) !== 1) continue;
      const normalizedTitle = normalizeProjectTitle(item.title);
      if (!normalizedTitle) continue;
      let checkedCandidates = 0;
      const hasCandidate = clusters.some((candidate) => {
        if (candidate.cluster_id === item.projectClusterId) return false;
        checkedCandidates += 1;
        if (checkedCandidates > 500) return false;
        if (item.projectCode && candidate.project_code && item.projectCode === candidate.project_code) return true;
        const similarity = titleSimilarity(normalizedTitle, candidate.normalized_title);
        const buyerMatches = Boolean(item.buyer && candidate.buyer && (item.buyer === candidate.buyer || item.buyer.includes(candidate.buyer) || candidate.buyer.includes(item.buyer)));
        return Math.min(0.99, similarity + (buyerMatches ? 0.08 : 0)) >= 0.6;
      });
      if (hasCandidate) count += 1;
    }
    return count;
  }

  function getRelationInboxCount(items) {
    const state = db.prepare(`SELECT COUNT(*) item_count, MAX(updated_at) latest_item_update FROM bid_opportunities`).get();
    const clusterState = db.prepare(`SELECT COUNT(*) cluster_count, MAX(updated_at) latest_cluster_update FROM opportunity_project_clusters`).get();
    const signature = `${state.item_count}:${state.latest_item_update || ''}:${clusterState.cluster_count}:${clusterState.latest_cluster_update || ''}`;
    if (relationInboxCache.signature === signature) return relationInboxCache.count;
    relationInboxCache = { signature, count: countRelationInbox(items) };
    return relationInboxCache.count;
  }

  function updateStatus(payload = {}) {
    const opportunityId = text(payload.opportunityId, 80);
    const status = statuses.has(payload.status) ? payload.status : 'review';
    db.prepare('UPDATE bid_opportunities SET status=?, notes=COALESCE(NULLIF(?, \'\'), notes), updated_at=? WHERE opportunity_id=?')
      .run(status, text(payload.notes, 10000), now(), opportunityId);
    addEvent(opportunityId, 'status', `状态更新为 ${status}`, payload.notes || '');
    return getOpportunity(opportunityId);
  }

  function bulkUpdate(payload = {}) {
    const opportunityIds = list(payload.opportunityIds).slice(0, 500);
    if (!opportunityIds.length) throw new Error('请先选择需要批量处理的机会');
    const nextStatus = payload.status && statuses.has(payload.status) ? payload.status : null;
    const hasOwner = Object.prototype.hasOwnProperty.call(payload, 'owner');
    const owner = text(payload.owner, 100);
    if (!nextStatus && !hasOwner) throw new Error('请选择批量状态或填写负责人');
    const timestamp = now();
    let updatedCount = 0;
    const transaction = db.transaction(() => {
      for (const opportunityId of opportunityIds) {
        const current = db.prepare('SELECT opportunity_id FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
        if (!current) continue;
        if (nextStatus && hasOwner) db.prepare('UPDATE bid_opportunities SET status=?,owner=?,updated_at=? WHERE opportunity_id=?').run(nextStatus, owner, timestamp, opportunityId);
        else if (nextStatus) db.prepare('UPDATE bid_opportunities SET status=?,updated_at=? WHERE opportunity_id=?').run(nextStatus, timestamp, opportunityId);
        else db.prepare('UPDATE bid_opportunities SET owner=?,updated_at=? WHERE opportunity_id=?').run(owner, timestamp, opportunityId);
        addEvent(opportunityId, 'bulk_update', '批量更新机会', [nextStatus ? `状态：${nextStatus}` : '', hasOwner ? `负责人：${owner || '未分配'}` : ''].filter(Boolean).join('；'));
        updatedCount += 1;
      }
    });
    transaction();
    return { success: true, updatedCount };
  }

  function updateDecisionWorkflow(payload = {}) {
    const opportunityId = text(payload.opportunityId, 80);
    const previous = db.prepare('SELECT * FROM bid_opportunities WHERE opportunity_id=?').get(opportunityId);
    if (!previous) throw new Error('投标机会不存在');
    const stage = workflowStages.has(payload.workflowStage) ? payload.workflowStage : previous.workflow_stage || 'discovery';
    const outcome = decisionOutcomes.has(payload.decisionOutcome) ? payload.decisionOutcome : previous.decision_outcome || 'undecided';
    const reason = text(payload.decisionReason, 5000);
    if (outcome === 'no_bid' && !reason) throw new Error('请选择不投标时，请填写决策原因');
    const status = outcome === 'no_bid' ? 'abandoned' : outcome === 'bid' || stage === 'bidding' ? 'following' : previous.status;
    db.prepare(`UPDATE bid_opportunities SET workflow_stage=?,decision_outcome=?,decision_reason=?,decision_due_at=?,next_action=?,next_action_due_at=?,status=?,updated_at=? WHERE opportunity_id=?`)
      .run(stage, outcome, reason, text(payload.decisionDueAt, 50) || null, text(payload.nextAction, 1000), text(payload.nextActionDueAt, 50) || null, status, now(), opportunityId);
    const stageLabel = { discovery: '新发现', screening: '初筛', qualification: '资格核验', decision: '决策评审', bidding: '立项投标', closed: '已结束' }[stage];
    const outcomeLabel = { undecided: '尚未决策', bid: '决定投标', no_bid: '决定不投' }[outcome];
    addEvent(opportunityId, 'decision_workflow', `决策流程更新为“${stageLabel}”`, `${outcomeLabel}${reason ? `；${reason}` : ''}${payload.nextAction ? `；下一步：${payload.nextAction}` : ''}`);
    return getOpportunity(opportunityId);
  }

  async function importTenderFile(opportunityIdValue) {
    const opportunityId = text(opportunityIdValue, 80);
    const opportunity = getOpportunity(opportunityId);
    const result = await fileService.importDocument({ title: `导入正式招标文件 · ${opportunity.title}`, filterName: '正式招标文件', assetScope: `bid-opportunity/${opportunityId}/tender` });
    if (!result?.success || !result.file_content) return { success: false, message: result?.message || '已取消导入', opportunity };
    const markdown = String(result.file_content).trim();
    const filePath = path.join(contentDir, `${opportunityId}-tender.md`);
    fs.writeFileSync(filePath, `${markdown}\n`, 'utf-8');
    const relativePath = path.relative(getWorkspaceDir(app), filePath).replace(/\\/g, '/');
    db.prepare(`UPDATE bid_opportunities SET tender_file_name=?,tender_markdown_path=?,tender_markdown_hash=?,tender_parser_label=?,tender_imported_at=?,workflow_stage=CASE WHEN workflow_stage IN ('discovery','screening') THEN 'qualification' ELSE workflow_stage END,analysis_signature=NULL,updated_at=? WHERE opportunity_id=?`)
      .run(result.file_name || '正式招标文件', relativePath, crypto.createHash('sha256').update(markdown).digest('hex'), result.parser_label || '', now(), now(), opportunityId);
    addEvent(opportunityId, 'tender_imported', '正式招标文件已导入', `${result.file_name || '正式招标文件'} · ${markdown.length} 字符`);
    return { success: true, message: '正式招标文件已解析并关联', opportunity: getOpportunity(opportunityId) };
  }

  function readTenderMarkdown(opportunityId) {
    const row = db.prepare('SELECT tender_markdown_path FROM bid_opportunities WHERE opportunity_id=?').get(text(opportunityId, 80));
    if (!row?.tender_markdown_path) throw new Error('请先导入正式招标文件');
    const filePath = path.join(getWorkspaceDir(app), row.tender_markdown_path);
    if (!fs.existsSync(filePath)) throw new Error('正式招标文件缓存不存在，请重新导入');
    return fs.readFileSync(filePath, 'utf-8');
  }

  function sendTenderToTechnicalPlan(opportunityIdValue) {
    const opportunityId = text(opportunityIdValue, 80); const opportunity = getOpportunity(opportunityId); const markdown = readTenderMarkdown(opportunityId);
    if (!technicalPlanStore?.createProject || !technicalPlanStore?.forWorkflow) throw new Error('技术方案模块尚未初始化');
    let projectId = opportunity.technicalPlanProjectId;
    if (!projectId) {
      const created = technicalPlanStore.createProject({ workflowKind: 'technical-plan', projectName: opportunity.title });
      projectId = created.project.id;
      db.prepare('UPDATE bid_opportunities SET technical_plan_project_id=?,updated_at=? WHERE opportunity_id=?').run(projectId, now(), opportunityId);
    }
    technicalPlanStore.forWorkflow('technical-plan', projectId).importTenderMarkdown({ fileName: opportunity.tenderFile?.fileName || `${opportunity.title}-招标文件`, markdown, parserLabel: '投标机会模块' });
    technicalPlanStore.switchProject({ workflowKind: 'technical-plan', projectId });
    addEvent(opportunityId, 'handoff', '已流转至技术方案', projectId);
    return { success: true, message: '已创建或更新技术方案项目', projectId, opportunity: getOpportunity(opportunityId) };
  }

  function sendTenderToRejectionCheck(opportunityIdValue) {
    const opportunityId = text(opportunityIdValue, 80); const opportunity = getOpportunity(opportunityId); const markdown = readTenderMarkdown(opportunityId);
    if (!rejectionCheckStore?.importTenderMarkdown) throw new Error('废标项检查模块尚未初始化');
    const result = rejectionCheckStore.importTenderMarkdown({ fileName: opportunity.tenderFile?.fileName || `${opportunity.title}-招标文件`, markdown, parserLabel: '投标机会模块', sourceProjectId: opportunity.technicalPlanProjectId });
    addEvent(opportunityId, 'handoff', '已流转至废标项检查', opportunity.tenderFile?.fileName || '正式招标文件');
    return { ...result, opportunity: getOpportunity(opportunityId) };
  }

  function createPresalesProject(opportunityId) {
    const opportunity = getOpportunity(opportunityId);
    if (opportunity.presalesProjectId) {
      presalesWorkbenchService.switchProject(opportunity.presalesProjectId);
      return { opportunity, existing: true, projectId: opportunity.presalesProjectId };
    }
    const result = presalesWorkbenchService.createProject({
      projectName: opportunity.title,
      profile: {
        projectName: opportunity.title,
        customerName: opportunity.buyer,
        industry: opportunity.industry,
        currentStage: '线索识别',
        opportunitySource: `${opportunity.sourceName}${opportunity.sourceUrl ? ` · ${opportunity.sourceUrl}` : ''}`,
        expectedValue: opportunity.budget === null ? '' : String(opportunity.budget),
        decisionDate: opportunity.bidDeadline ? opportunity.bidDeadline.slice(0, 10) : '',
        owner: opportunity.owner,
        keyBackground: [opportunity.summary, opportunity.notes, opportunity.riskFlags.length ? `风险：${opportunity.riskFlags.join('；')}` : ''].filter(Boolean).join('\n\n'),
      },
    });
    db.prepare('UPDATE bid_opportunities SET presales_project_id=?, status=?, updated_at=? WHERE opportunity_id=?')
      .run(result.state.projectId, 'following', now(), opportunityId);
    addEvent(opportunityId, 'presales', '已创建售前项目', result.state.profile.projectName);
    return { opportunity: getOpportunity(opportunityId), projectId: result.state.projectId, projects: result.projects };
  }

  function getSnapshot(filters = {}) {
    ensureProjectClusters();
    recoverInterruptedAnalyses();
    const allItems = db.prepare('SELECT * FROM bid_opportunities ORDER BY updated_at DESC').all().map((row) => opportunityFromRow(row, { includeContent: false }));
    const enterpriseProfile = getEnterpriseProfile();
    const opportunities = rankByEnterpriseProfile(filterOpportunities(allItems, filters), enterpriseProfile);
    const counts = db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) new_count,
      SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) review_count,
      SUM(CASE WHEN status='following' THEN 1 ELSE 0 END) following_count,
      SUM(CASE WHEN status='abandoned' THEN 1 ELSE 0 END) abandoned_count
      FROM bid_opportunities`).get();
    const inboxCounts = { new: 0, changes: 0, due: 0, tasks: 0, relation: 0 };
    for (const item of allItems) {
      for (const key of ['new', 'changes', 'due', 'tasks']) if (matchesInbox(item, key)) inboxCounts[key] += 1;
    }
    inboxCounts.relation = getRelationInboxCount(allItems);
    const operatingMetrics = buildOperatingMetrics(allItems);
    const sources = listSources();
    const scans = getLatestScans();
    return { opportunities, monitors: listMonitors(), enterpriseProfile, sources, scans, scanBatch: getScanBatch(), diagnostics: buildDiagnostics(sources, scans), backup: getBackupStatus(), inboxCounts, operatingMetrics, counts: { total: counts.total || 0, new: counts.new_count || 0, review: counts.review_count || 0, following: counts.following_count || 0, abandoned: counts.abandoned_count || 0 } };
  }

  function recoverInterruptedAnalyses() {
    const rows = db.prepare('SELECT opportunity_id,analysis_task_json FROM bid_opportunities WHERE analysis_task_json IS NOT NULL').all();
    for (const row of rows) {
      const task = json(row.analysis_task_json, null);
      if (task?.status !== 'running' || activeAnalyses.has(row.opportunity_id)) continue;
      const recovered = { ...task, status: 'error', progress: 100, message: '上次分析被中断', error: '上次分析被中断，请重新执行。', updatedAt: now(), finishedAt: now() };
      db.prepare('UPDATE bid_opportunities SET analysis_task_json=? WHERE opportunity_id=?').run(JSON.stringify(recovered), row.opportunity_id);
    }
  }

  function buildDiagnostics(sources, scans) {
    const analysisRows = db.prepare("SELECT opportunity_id,title,analysis_task_json FROM bid_opportunities WHERE analysis_task_json LIKE '%上次分析被中断%'").all().filter((row) => json(row.analysis_task_json, null)?.status === 'error');
    const interruptedAnalyses = analysisRows.length;
    const interruptedScans = Object.values(scans).filter((scan) => scan.status === 'error' && scan.message === '上次扫描被中断').length;
    const errorSources = sources.filter((source) => source.healthStatus === 'error').length;
    const warningSources = sources.filter((source) => source.healthStatus === 'warning').length;
    const untestedSources = sources.filter((source) => source.enabled && source.healthStatus === 'untested').length;
    const failedNotices = Object.values(scans).reduce((sum, scan) => sum + (scan.errors?.length || 0), 0);
    const issues = [];
    for (const source of sources) {
      const scan = scans[source.sourceId];
      const errors = scan?.errors?.length ? scan.errors : source.lastError ? source.lastError.split('\n').filter(Boolean) : [];
      const interrupted = scan?.status === 'error' && scan.message === '上次扫描被中断';
      if (!interrupted && source.healthStatus !== 'error' && source.healthStatus !== 'warning' && !errors.length) continue;
      const severity = interrupted || source.healthStatus === 'error' || scan?.status === 'error' ? 'error' : 'warning';
      issues.push({
        issueId: `source-${source.sourceId}`,
        kind: 'source',
        severity,
        sourceId: source.sourceId,
        opportunityId: '',
        objectName: source.name,
        title: interrupted ? '数据源扫描被中断' : severity === 'error' ? '数据源扫描异常' : '部分公告解析失败',
        detail: errors[0] || scan?.message || source.lastError || '数据源返回结果不完整，请查看最近扫描记录。',
        affectedCount: errors.length,
        occurredAt: scan?.finishedAt || scan?.updatedAt || source.lastRunAt || source.updatedAt,
      });
    }
    for (const row of analysisRows) {
      const task = json(row.analysis_task_json, null);
      issues.push({ issueId: `analysis-${row.opportunity_id}`, kind: 'analysis', severity: 'error', sourceId: '', opportunityId: row.opportunity_id, objectName: row.title, title: '机会深度分析被中断', detail: task?.error || task?.message || '上次分析未完成，请重新执行。', affectedCount: 1, occurredAt: task?.finishedAt || task?.updatedAt || '' });
    }
    issues.sort((left, right) => (left.severity === right.severity ? String(right.occurredAt).localeCompare(String(left.occurredAt)) : left.severity === 'error' ? -1 : 1));
    return { interruptedAnalyses, interruptedScans, errorSources, warningSources, untestedSources, failedNotices, issues };
  }

  function listBackupDirectories() {
    if (!fs.existsSync(backupRoot)) return [];
    return fs.readdirSync(backupRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  }

  function getBackupStatus() {
    const latestId = listBackupDirectories()[0] || '';
    if (!latestId) return { latestId: '', createdAt: '', verified: false, message: '尚未创建投标机会工作区备份' };
    const manifestPath = path.join(backupRoot, latestId, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? json(fs.readFileSync(manifestPath, 'utf-8'), {}) : {};
    return { latestId, createdAt: manifest.createdAt || '', verified: Boolean(manifest.verifiedAt), verifiedAt: manifest.verifiedAt || '', message: manifest.verifiedAt ? '最近备份已通过完整性验证' : '最近备份尚未验证' };
  }

  async function createWorkspaceBackup() {
    fs.mkdirSync(backupRoot, { recursive: true });
    const createdAt = now();
    const backupId = `${createdAt.replace(/[-:.TZ]/g, '')}-${crypto.randomBytes(2).toString('hex')}`;
    const targetDir = path.join(backupRoot, backupId);
    fs.mkdirSync(targetDir, { recursive: false });
    const databasePath = path.join(targetDir, 'yibiao.sqlite');
    await db.backup(databasePath);
    if (fs.existsSync(contentDir)) fs.cpSync(contentDir, path.join(targetDir, 'bid-opportunities'), { recursive: true });
    const manifest = { backupId, createdAt, schemaVersion: Number(db.pragma('user_version', { simple: true })), opportunities: db.prepare('SELECT COUNT(*) count FROM bid_opportunities').get().count, monitors: db.prepare('SELECT COUNT(*) count FROM opportunity_monitors').get().count, verifiedAt: '' };
    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    for (const expiredId of listBackupDirectories().slice(5)) fs.rmSync(path.join(backupRoot, expiredId), { recursive: true, force: true });
    return { success: true, ...getBackupStatus(), path: targetDir };
  }

  function verifyLatestBackup() {
    const backupId = listBackupDirectories()[0];
    if (!backupId) throw new Error('尚未创建可验证的工作区备份');
    const targetDir = path.join(backupRoot, backupId);
    const databasePath = path.join(targetDir, 'yibiao.sqlite');
    if (!fs.existsSync(databasePath)) throw new Error('备份数据库文件缺失，请重新创建备份');
    const drillDir = fs.mkdtempSync(path.join(backupRoot, '.restore-drill-'));
    const drillDatabasePath = path.join(drillDir, 'yibiao.sqlite');
    fs.copyFileSync(databasePath, drillDatabasePath);
    if (fs.existsSync(path.join(targetDir, 'bid-opportunities'))) fs.cpSync(path.join(targetDir, 'bid-opportunities'), path.join(drillDir, 'bid-opportunities'), { recursive: true });
    const backupDb = new Database(drillDatabasePath, { readonly: true, fileMustExist: true });
    try {
      const integrity = backupDb.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') throw new Error(`备份数据库完整性检查失败：${integrity}`);
      backupDb.prepare('SELECT COUNT(*) count FROM bid_opportunities').get();
      backupDb.prepare('SELECT COUNT(*) count FROM opportunity_monitors').get();
    } finally {
      backupDb.close();
      fs.rmSync(drillDir, { recursive: true, force: true });
    }
    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? json(fs.readFileSync(manifestPath, 'utf-8'), {}) : { backupId };
    manifest.verifiedAt = now();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return { success: true, ...getBackupStatus(), path: targetDir };
  }

  function buildOperatingMetrics(items) {
    const timestamp = Date.now();
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const endOfThreeDays = endOfToday.getTime() + 3 * 86400000;
    const active = items.filter((item) => !['won', 'abandoned', 'archived'].includes(item.status));
    const taskItems = active.map((item) => {
      const candidates = [];
      if (item.nextAction && item.nextActionDueAt) candidates.push({ type: '行动', title: item.nextAction, dueAt: item.nextActionDueAt });
      if (item.decisionOutcome === 'undecided' && item.decisionDueAt) candidates.push({ type: '决策', title: '完成投标决策', dueAt: item.decisionDueAt });
      candidates.sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
      return candidates[0] ? { opportunityId: item.opportunityId, opportunityTitle: item.title, owner: item.owner, ...candidates[0] } : null;
    }).filter(Boolean);
    const deadlines = active.filter((item) => ['tender', 'correction'].includes(item.announcementStage) && item.bidDeadline);
    const ownerMap = new Map();
    for (const item of active) {
      const owner = item.owner || '未分配';
      const current = ownerMap.get(owner) || { owner, total: 0, following: 0, overdue: 0 };
      current.total += 1;
      if (item.status === 'following') current.following += 1;
      const dueTimes = [item.nextActionDueAt, item.decisionOutcome === 'undecided' ? item.decisionDueAt : ''].filter(Boolean).map((value) => new Date(value).getTime());
      if (dueTimes.some((value) => value < timestamp)) current.overdue += 1;
      ownerMap.set(owner, current);
    }
    const funnel = [...workflowStages].map((stage) => ({ stage, count: active.filter((item) => item.workflowStage === stage).length }));
    return {
      activeCount: active.length,
      pipelineBudget: active.reduce((sum, item) => sum + (item.budget || 0), 0),
      tasks: { overdue: taskItems.filter((item) => new Date(item.dueAt).getTime() < timestamp).length, today: taskItems.filter((item) => { const due = new Date(item.dueAt).getTime(); return due >= timestamp && due <= endOfToday.getTime(); }).length, upcoming: taskItems.filter((item) => { const due = new Date(item.dueAt).getTime(); return due > endOfToday.getTime() && due <= endOfThreeDays; }).length, items: taskItems.sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()).slice(0, 20) },
      deadlines: { overdue: deadlines.filter((item) => new Date(item.bidDeadline).getTime() < timestamp).length, urgent: deadlines.filter((item) => { const due = new Date(item.bidDeadline).getTime(); return due >= timestamp && due <= endOfThreeDays; }).length },
      funnel,
      decisions: { undecided: active.filter((item) => item.decisionOutcome === 'undecided').length, bid: items.filter((item) => item.decisionOutcome === 'bid').length, noBid: items.filter((item) => item.decisionOutcome === 'no_bid').length, won: items.filter((item) => item.status === 'won').length },
      owners: [...ownerMap.values()].sort((left, right) => right.overdue - left.overdue || right.total - left.total),
    };
  }

  function getReminderSummary() {
    const allItems = db.prepare('SELECT * FROM bid_opportunities ORDER BY updated_at DESC').all().map((row) => opportunityFromRow(row, { includeContent: false }));
    const metrics = buildOperatingMetrics(allItems);
    return { overdue: metrics.tasks.overdue, today: metrics.tasks.today, urgentDeadlines: metrics.deadlines.urgent, items: metrics.tasks.items.filter((item) => new Date(item.dueAt).getTime() <= new Date().setHours(23, 59, 59, 999)).slice(0, 5) };
  }

  return { subscribe, getSnapshot, getReminderSummary, getOpportunity, saveOpportunity, importOpportunityFile, importTenderFile, updateStatus, bulkUpdate, updateDecisionWorkflow, saveMonitor, deleteMonitor, createPresalesProject, sendTenderToTechnicalPlan, sendTenderToRejectionCheck, getEnterpriseProfile, saveEnterpriseProfile, startDeepAnalysis, startSourceScan, startAllSourceScans, updateSource, mergeProjectClusters, splitOpportunityCluster, createWorkspaceBackup, verifyLatestBackup };
}

module.exports = { createBidOpportunityService };
