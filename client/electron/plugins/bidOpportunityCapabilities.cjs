'use strict';

const SUMMARY_CAPABILITY_ID = 'bid.opportunity.summary.read';
const FILE_IMPORT_CAPABILITY_ID = 'bid.opportunity.file.import';
const TENDER_IMPORT_CAPABILITY_ID = 'bid.opportunity.tender.import';
const STATUS_UPDATE_CAPABILITY_ID = 'bid.opportunity.status.update';
const ANALYSIS_START_CAPABILITY_ID = 'bid.opportunity.analysis.start';
const HANDOFF_CAPABILITY_ID = 'bid.opportunity.handoff';
const DECISION_READ_CAPABILITY_ID = 'bid.opportunity.decision.read';
const DECISION_UPDATE_CAPABILITY_ID = 'bid.opportunity.decision.update';
const BULK_UPDATE_CAPABILITY_ID = 'bid.opportunity.bulk.update';
const SCAN_START_CAPABILITY_ID = 'bid.opportunity.scan.start';
const STATUSES = new Set(['new', 'review', 'following', 'won', 'abandoned', 'archived']);
const HANDOFF_TARGETS = new Set(['technical-plan', 'rejection-check', 'presales']);
const WORKFLOW_STAGES = new Set(['discovery', 'screening', 'qualification', 'decision', 'bidding', 'closed']);
const DECISION_OUTCOMES = new Set(['undecided', 'bid', 'no_bid']);

function text(value, length) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeOpportunity(item) {
  const taskStatus = ['running', 'success', 'error'].includes(item?.analysisTask?.status) ? item.analysisTask.status : 'idle';
  return {
    id: text(item?.opportunityId, 100),
    title: text(item?.title, 200),
    status: STATUSES.has(item?.status) ? item.status : 'review',
    owner: text(item?.owner, 100),
    buyer: text(item?.buyer, 160),
    region: text(item?.region, 80),
    deadline: text(item?.bidDeadline, 50),
    budget: number(item?.budget),
    valueScore: Math.max(0, Math.min(100, Math.round(number(item?.valueScore) || 0))),
    feasibilityScore: Math.max(0, Math.min(100, Math.round(number(item?.feasibilityScore) || 0))),
    recommendation: text(item?.recommendation, 200),
    tenderImported: Boolean(item?.tenderFile),
    technicalPlanLinked: Boolean(item?.technicalPlanProjectId),
    presalesLinked: Boolean(item?.presalesProjectId),
    analysis: {
      status: taskStatus,
      progress: Math.max(0, Math.min(100, Math.round(number(item?.analysisTask?.progress) || (item?.deepAnalysis ? 100 : 0)))),
      ready: Boolean(item?.deepAnalysis),
    },
  };
}

function safeSourceScan(snapshot) {
  const sources = (Array.isArray(snapshot?.sources) ? snapshot.sources : []).slice(0, 30).map((source) => {
    const scan = snapshot?.scans?.[source.sourceId];
    return {
      id: text(source.sourceId, 100),
      name: text(source.name, 160),
      enabled: Boolean(source.enabled),
      scan: scan ? {
        status: ['running', 'success', 'error'].includes(scan.status) ? scan.status : 'idle',
        progress: Math.max(0, Math.min(100, Math.round(number(scan.progress) || 0))),
        fetchedCount: Math.max(0, Math.round(number(scan.fetchedCount) || 0)),
        matchedCount: Math.max(0, Math.round(number(scan.matchedCount) || 0)),
        createdCount: Math.max(0, Math.round(number(scan.createdCount) || 0)),
        updatedCount: Math.max(0, Math.round(number(scan.updatedCount) || 0)),
      } : null,
    };
  }).filter((source) => source.id && source.name);
  const enabledSources = sources.filter((source) => source.enabled);
  const batch = snapshot?.scanBatch || {};
  const running = batch.status === 'running' || enabledSources.some((source) => source.scan?.status === 'running');
  const completed = Math.max(0, Math.min(enabledSources.length, Math.round(number(batch.completed) || 0)));
  const runningProgress = enabledSources.filter((source) => source.scan?.status === 'running')
    .reduce((sum, source) => sum + source.scan.progress, 0) / Math.max(1, enabledSources.filter((source) => source.scan?.status === 'running').length);
  const progress = running && enabledSources.length
    ? Math.min(99, Math.round(((completed + runningProgress / 100) / enabledSources.length) * 100))
    : batch.total && batch.completed >= batch.total ? 100 : 0;
  return {
    status: running ? 'running' : batch.total && batch.completed >= batch.total ? 'success' : 'idle',
    progress,
    enabledCount: enabledSources.length,
    completedCount: completed,
    createdCount: Math.max(0, Math.round(number(batch.createdCount) || 0)),
    updatedCount: Math.max(0, Math.round(number(batch.updatedCount) || 0)),
    matchedCount: enabledSources.reduce((sum, source) => sum + (source.scan?.matchedCount || 0), 0),
    sources,
  };
}

function createOpportunitySummary(snapshot) {
  const opportunities = (Array.isArray(snapshot?.opportunities) ? snapshot.opportunities : []).slice(0, 100)
    .map(safeOpportunity).filter((item) => item.id && item.title);
  return {
    module: 'bid-opportunity',
    opportunities,
    sourceScan: safeSourceScan(snapshot),
    counts: {
      total: Math.max(0, Math.round(number(snapshot?.counts?.total) || opportunities.length)),
      new: Math.max(0, Math.round(number(snapshot?.counts?.new) || 0)),
      review: Math.max(0, Math.round(number(snapshot?.counts?.review) || 0)),
      following: Math.max(0, Math.round(number(snapshot?.counts?.following) || 0)),
      abandoned: Math.max(0, Math.round(number(snapshot?.counts?.abandoned) || 0)),
    },
  };
}

function requireOpportunity(service, opportunityId) {
  const id = text(opportunityId, 100);
  const opportunity = service.getSnapshot({}).opportunities.find((item) => item.opportunityId === id);
  if (!opportunity) throw new Error('投标机会不存在或已变化');
  return opportunity;
}

function dateTime(value, fieldName) {
  const result = text(value, 50);
  if (result && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(result) || Number.isNaN(Date.parse(result)))) {
    throw new Error(`${fieldName}格式无效`);
  }
  return result;
}

function safeDecision(opportunity) {
  return {
    opportunity: { id: text(opportunity?.opportunityId, 100), title: text(opportunity?.title, 200) },
    workflowStage: WORKFLOW_STAGES.has(opportunity?.workflowStage) ? opportunity.workflowStage : 'discovery',
    decisionOutcome: DECISION_OUTCOMES.has(opportunity?.decisionOutcome) ? opportunity.decisionOutcome : 'undecided',
    decisionReason: text(opportunity?.decisionReason, 2000),
    decisionDueAt: text(opportunity?.decisionDueAt, 50),
    nextAction: text(opportunity?.nextAction, 1000),
    nextActionDueAt: text(opportunity?.nextActionDueAt, 50),
  };
}

function registerBidOpportunityCapabilities(capabilityRegistry, service, { onWorkspaceChanged } = {}) {
  if (!capabilityRegistry || !service) throw new Error('投标机会能力依赖未完整初始化');

  capabilityRegistry.register({ id: SUMMARY_CAPABILITY_ID, name: '投标机会摘要', version: '1.0', permission: SUMMARY_CAPABILITY_ID }, (args) => {
    const status = text(args?.status, 30);
    if (status && !STATUSES.has(status)) throw new Error('投标机会状态筛选无效');
    return createOpportunitySummary(service.getSnapshot({ keyword: text(args?.keyword, 100), ...(status ? { status } : {}) }));
  });

  capabilityRegistry.register({ id: FILE_IMPORT_CAPABILITY_ID, name: '导入投标机会文件', version: '1.0', permission: FILE_IMPORT_CAPABILITY_ID }, async (_args, plugin) => {
    const result = await service.importOpportunityFile();
    if (!result?.success) return { imported: false, canceled: true, message: text(result?.message || '已取消选择', 160) };
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return { imported: true, opportunity: safeOpportunity(result.opportunity), message: text(result.message, 160) };
  });

  capabilityRegistry.register({ id: TENDER_IMPORT_CAPABILITY_ID, name: '导入机会正式招标文件', version: '1.0', permission: TENDER_IMPORT_CAPABILITY_ID }, async (args, plugin) => {
    const opportunity = requireOpportunity(service, args?.opportunityId);
    const result = await service.importTenderFile(opportunity.opportunityId);
    if (!result?.success) return { imported: false, canceled: true, message: text(result?.message || '已取消选择', 160) };
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return { imported: true, opportunity: safeOpportunity(result.opportunity), message: text(result.message, 160) };
  });

  capabilityRegistry.register({ id: STATUS_UPDATE_CAPABILITY_ID, name: '更新投标机会状态', version: '1.0', permission: STATUS_UPDATE_CAPABILITY_ID }, (args, plugin) => {
    const opportunity = requireOpportunity(service, args?.opportunityId);
    if (!STATUSES.has(args?.status)) throw new Error('投标机会状态无效');
    const updated = service.updateStatus({ opportunityId: opportunity.opportunityId, status: args.status });
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return { updated: true, opportunity: safeOpportunity(updated) };
  });

  capabilityRegistry.register({ id: ANALYSIS_START_CAPABILITY_ID, name: '启动投标机会深度分析', version: '1.0', permission: ANALYSIS_START_CAPABILITY_ID }, (args, plugin) => {
    const opportunity = requireOpportunity(service, args?.opportunityId);
    if (opportunity.analysisTask?.status === 'running') throw new Error('该投标机会正在分析');
    const updated = service.startDeepAnalysis(opportunity.opportunityId);
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return { started: true, opportunity: safeOpportunity(updated) };
  });

  capabilityRegistry.register({ id: HANDOFF_CAPABILITY_ID, name: '流转投标机会', version: '1.0', permission: HANDOFF_CAPABILITY_ID }, (args, plugin) => {
    const opportunity = requireOpportunity(service, args?.opportunityId);
    const target = text(args?.target, 40);
    if (!HANDOFF_TARGETS.has(target)) throw new Error('投标机会流转目标无效');
    if (target !== 'presales' && !opportunity.tenderFile) throw new Error('请先导入正式招标文件');
    const result = target === 'technical-plan'
      ? service.sendTenderToTechnicalPlan(opportunity.opportunityId)
      : target === 'rejection-check'
        ? service.sendTenderToRejectionCheck(opportunity.opportunityId)
        : service.createPresalesProject(opportunity.opportunityId);
    onWorkspaceChanged?.('bid-opportunity', plugin);
    onWorkspaceChanged?.(target === 'presales' ? 'presales-workbench' : target, plugin);
    return { completed: true, target, opportunity: safeOpportunity(result.opportunity), projectId: text(result.projectId, 100), existing: Boolean(result.existing) };
  });

  capabilityRegistry.register({ id: DECISION_READ_CAPABILITY_ID, name: '读取投标决策配置', version: '1.0', permission: DECISION_READ_CAPABILITY_ID }, (args) => {
    return safeDecision(requireOpportunity(service, args?.opportunityId));
  });

  capabilityRegistry.register({ id: DECISION_UPDATE_CAPABILITY_ID, name: '更新投标决策流程', version: '1.0', permission: DECISION_UPDATE_CAPABILITY_ID }, (args, plugin) => {
    const opportunity = requireOpportunity(service, args?.opportunityId);
    if (!WORKFLOW_STAGES.has(args?.workflowStage)) throw new Error('投标决策阶段无效');
    if (!DECISION_OUTCOMES.has(args?.decisionOutcome)) throw new Error('投标决策结论无效');
    const decisionReason = text(args?.decisionReason, 2000);
    if (args.decisionOutcome === 'no_bid' && !decisionReason) throw new Error('决定不投时必须填写原因');
    const updated = service.updateDecisionWorkflow({
      opportunityId: opportunity.opportunityId,
      workflowStage: args.workflowStage,
      decisionOutcome: args.decisionOutcome,
      decisionReason,
      decisionDueAt: dateTime(args?.decisionDueAt, '决策期限'),
      nextAction: text(args?.nextAction, 1000),
      nextActionDueAt: dateTime(args?.nextActionDueAt, '行动期限'),
    });
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return {
      updated: true,
      opportunity: { id: text(updated?.opportunityId, 100), title: text(updated?.title, 200) },
      workflowStage: WORKFLOW_STAGES.has(updated?.workflowStage) ? updated.workflowStage : args.workflowStage,
      decisionOutcome: DECISION_OUTCOMES.has(updated?.decisionOutcome) ? updated.decisionOutcome : args.decisionOutcome,
      status: STATUSES.has(updated?.status) ? updated.status : 'review',
      decisionDueAtSet: Boolean(updated?.decisionDueAt),
      nextActionDueAtSet: Boolean(updated?.nextActionDueAt),
    };
  });

  capabilityRegistry.register({ id: BULK_UPDATE_CAPABILITY_ID, name: '批量更新投标机会', version: '1.0', permission: BULK_UPDATE_CAPABILITY_ID }, (args, plugin) => {
    const opportunityIds = [...new Set(Array.isArray(args?.opportunityIds) ? args.opportunityIds : [])]
      .map((id) => text(id, 100)).filter(Boolean).slice(0, 100);
    if (!opportunityIds.length) throw new Error('请至少选择一条投标机会');
    for (const opportunityId of opportunityIds) requireOpportunity(service, opportunityId);
    const status = args?.status ? text(args.status, 30) : '';
    if (status && !STATUSES.has(status)) throw new Error('批量更新状态无效');
    const hasOwner = Object.prototype.hasOwnProperty.call(args || {}, 'owner');
    if (!status && !hasOwner) throw new Error('请选择状态或填写负责人');
    const result = service.bulkUpdate({ opportunityIds, ...(status ? { status } : {}), ...(hasOwner ? { owner: text(args.owner, 100) } : {}) });
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return { updated: true, updatedCount: Math.max(0, Math.round(number(result?.updatedCount) || 0)) };
  });

  capabilityRegistry.register({ id: SCAN_START_CAPABILITY_ID, name: '扫描投标机会来源', version: '1.0', permission: SCAN_START_CAPABILITY_ID }, (_args, plugin) => {
    const before = service.getSnapshot({});
    if (!before.sources?.some((source) => source.enabled)) throw new Error('当前没有已启用的数据来源');
    service.startAllSourceScans();
    onWorkspaceChanged?.('bid-opportunity', plugin);
    return { started: true, sourceScan: safeSourceScan(service.getSnapshot({})) };
  });
}

module.exports = { createOpportunitySummary, registerBidOpportunityCapabilities };
