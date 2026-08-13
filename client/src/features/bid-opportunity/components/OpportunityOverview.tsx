import type { OpportunitySnapshot, OpportunityWorkflowStage } from '../types';

interface OpportunityOverviewProps {
  snapshot: OpportunitySnapshot;
  loading: boolean;
  loadError: string;
  workflowLabels: Record<OpportunityWorkflowStage, string>;
  formatMoney: (value: number | null) => string;
  onScan: () => void;
  onOpenDetails: () => void;
  onOpenOpportunity: (opportunityId: string) => void;
  onOpenSources: () => void;
  onOpenHealth: () => void;
  onRetry: () => void;
}

export function OpportunityOverview({ snapshot, loading, loadError, workflowLabels, formatMoney, onScan, onOpenDetails, onOpenOpportunity, onOpenSources, onOpenHealth, onRetry }: OpportunityOverviewProps) {
  const metrics = snapshot.operatingMetrics;
  const funnelMax = Math.max(1, ...metrics.funnel.map((item) => item.count));
  const latestScanTotals = Object.values(snapshot.scans).reduce((totals, scan) => ({
    fetched: totals.fetched + scan.fetchedCount,
    created: totals.created + scan.createdCount,
    updated: totals.updated + scan.updatedCount,
    matched: totals.matched + scan.matchedCount,
    failed: totals.failed + scan.errors.length,
  }), { fetched: 0, created: 0, updated: 0, matched: 0, failed: 0 });
  const healthySources = snapshot.sources.filter((source) => source.healthStatus === 'healthy').length;
  const recentOpportunities = snapshot.opportunities.slice(0, 6);
  const scanRunning = snapshot.scanBatch.status === 'running';

  if (loading) return <div className="opportunity-overview-loading" role="status" aria-live="polite">
    <div className="opportunity-overview-loading-card">
      <span className="opportunity-overview-loading-mark" aria-hidden="true"><i /></span>
      <div><strong>正在加载投标机会总览</strong><p>读取本地机会库、扫描状态与投标统计，请稍候。</p></div>
      <div className="opportunity-overview-loading-progress" aria-label="加载进行中"><i /></div>
      <small>正在整理商机盘面</small>
    </div>
  </div>;
  if (loadError) return <div className="opportunity-overview-error"><strong>投标机会总览加载失败</strong><span>{loadError}</span><button type="button" className="secondary-action" onClick={onRetry}>重新加载</button></div>;

  return <div className="opportunity-overview-scroll">
    <section className="opportunity-overview-lead">
      <div><h3>今日商机盘面</h3><p>机会规模、投标进展、截止风险和公告来源均来自本地工作区。</p></div>
      <div className="opportunity-overview-primary-actions"><button type="button" className="scan-all-action" onClick={onScan} disabled={scanRunning}>{scanRunning ? `扫描中 ${snapshot.scanBatch.completed}/${snapshot.scanBatch.total}` : '扫描机会'}</button><button type="button" className="secondary-action" onClick={onOpenDetails}>机会详情</button></div>
    </section>

    {scanRunning && <section className="opportunity-radar-stage" aria-live="polite">
      <div className="opportunity-radar-visual" aria-hidden="true"><div className="opportunity-radar-grid"><i className="opportunity-radar-axis horizontal" /><i className="opportunity-radar-axis vertical" /><i className="opportunity-radar-sweep" /><b className="opportunity-radar-blip blip-one" /><b className="opportunity-radar-blip blip-two" /><b className="opportunity-radar-blip blip-three" /><span className="opportunity-radar-core" /></div></div>
      <div className="opportunity-radar-copy"><span>公告雷达运行中</span><strong>正在扫描公开招投标机会</strong><p>依次读取已启用的数据源，识别公告变化并按监控方案匹配机会。</p><div className="opportunity-radar-progress"><i style={{ transform: `scaleX(${snapshot.scanBatch.total ? snapshot.scanBatch.completed / snapshot.scanBatch.total : 0})` }} /></div><small>已完成 {snapshot.scanBatch.completed} / {snapshot.scanBatch.total} 个来源，当前运行 {snapshot.scanBatch.running}</small></div>
      <div className="opportunity-radar-live-numbers"><div><strong>{snapshot.scanBatch.createdCount}</strong><span>新增机会</span></div><div><strong>{snapshot.scanBatch.updatedCount}</strong><span>公告更新</span></div></div>
    </section>}

    <section className="opportunity-overview-kpis" aria-label="机会盘面">
      <button type="button" onClick={onOpenDetails}><span>全部机会</span><strong>{snapshot.counts.total}</strong><small>新发现 {snapshot.counts.new}</small></button>
      <button type="button" onClick={onOpenDetails}><span>活跃商机</span><strong>{metrics.activeCount}</strong><small>预算池 {formatMoney(metrics.pipelineBudget)}</small></button>
      <button type="button" className={metrics.deadlines.urgent ? 'is-warning' : ''} onClick={onOpenDetails}><span>临近截标</span><strong>{metrics.deadlines.urgent}</strong><small>逾期公告 {metrics.deadlines.overdue}</small></button>
      <button type="button" className={metrics.tasks.overdue ? 'is-danger' : ''} onClick={onOpenDetails}><span>待办任务</span><strong>{metrics.tasks.overdue + metrics.tasks.today}</strong><small>其中逾期 {metrics.tasks.overdue}</small></button>
      <button type="button" onClick={onOpenDetails}><span>重点跟进</span><strong>{snapshot.counts.following}</strong><small>待判断 {snapshot.counts.review}</small></button>
    </section>

    <div className="opportunity-overview-main-grid">
      <section className="opportunity-overview-panel opportunity-overview-funnel"><div className="opportunity-overview-panel-head"><div><h4>投标推进</h4><p>当前活跃机会所处阶段</p></div><button type="button" onClick={onOpenDetails}>进入工作台</button></div><div>{metrics.funnel.map((item) => <button type="button" key={item.stage} onClick={onOpenDetails}><span>{workflowLabels[item.stage]}</span><i><b style={{ width: `${Math.max(item.count ? 8 : 0, item.count / funnelMax * 100)}%` }} /></i><strong>{item.count}</strong></button>)}</div></section>
      <section className="opportunity-overview-panel opportunity-overview-decisions"><div className="opportunity-overview-panel-head"><div><h4>决策情况</h4><p>投与不投的当前结论</p></div></div><dl><div><dt>尚未决策</dt><dd>{metrics.decisions.undecided}</dd></div><div><dt>决定投标</dt><dd>{metrics.decisions.bid}</dd></div><div><dt>决定不投</dt><dd>{metrics.decisions.noBid}</dd></div><div><dt>已中标</dt><dd>{metrics.decisions.won}</dd></div></dl></section>
      <section className="opportunity-overview-panel opportunity-overview-scan-result"><div className="opportunity-overview-panel-head"><div><h4>最近扫描</h4><p>{snapshot.sources.length} 个公告来源的最近一次结果</p></div><button type="button" onClick={onOpenSources}>数据源</button></div><div className="opportunity-overview-scan-numbers"><div><strong>{latestScanTotals.fetched}</strong><span>发现公告</span></div><div><strong>{latestScanTotals.created}</strong><span>新增机会</span></div><div><strong>{latestScanTotals.updated}</strong><span>内容更新</span></div><div><strong>{latestScanTotals.matched}</strong><span>命中监控</span></div></div><footer className={latestScanTotals.failed ? 'is-warning' : ''}><span>健康来源 {healthySources} / {snapshot.sources.length}</span><span>解析失败 {latestScanTotals.failed}</span><button type="button" onClick={onOpenHealth}>查看健康状态</button></footer></section>
    </div>

    <div className="opportunity-overview-lower-grid">
      <section className="opportunity-overview-panel opportunity-overview-recent"><div className="opportunity-overview-panel-head"><div><h4>最近机会</h4><p>按最近更新时间排列</p></div><button type="button" onClick={onOpenDetails}>查看全部</button></div>{recentOpportunities.length ? <div>{recentOpportunities.map((item) => <button type="button" key={item.opportunityId} onClick={() => onOpenOpportunity(item.opportunityId)}><span className={`opportunity-grade is-${item.valueScore >= 72 ? 'high' : item.valueScore >= 48 ? 'medium' : 'low'}`}>{item.valueScore}</span><span><strong>{item.title}</strong><small>{item.buyer || '采购人待确认'}　{formatMoney(item.budget)}</small></span><em>{item.bidDeadline ? new Date(item.bidDeadline).toLocaleDateString() : '截止待确认'}</em></button>)}</div> : <div className="opportunity-overview-inline-empty"><strong>暂无投标机会</strong><span>点击“扫描机会”从已启用公告来源获取信息。</span></div>}</section>
      <section className="opportunity-overview-panel opportunity-overview-attention"><div className="opportunity-overview-panel-head"><div><h4>需要关注</h4><p>优先处理风险和待办</p></div></div><div><button type="button" onClick={onOpenDetails}><strong>{snapshot.inboxCounts.tasks}</strong><span>今日待办</span><small>决策或行动期限已到</small></button><button type="button" onClick={onOpenDetails}><strong>{snapshot.inboxCounts.changes}</strong><span>重要变化</span><small>更正、结果或终止公告</small></button><button type="button" onClick={onOpenDetails}><strong>{snapshot.inboxCounts.relation}</strong><span>待确认关联</span><small>可能属于同一采购项目</small></button></div></section>
    </div>
  </div>;
}
