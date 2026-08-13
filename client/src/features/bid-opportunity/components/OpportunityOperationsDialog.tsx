import * as Dialog from '@radix-ui/react-dialog';
import type { OpportunityOperatingMetrics, OpportunityWorkflowStage } from '../types';

interface OpportunityOperationsDialogProps {
  open: boolean;
  metrics: OpportunityOperatingMetrics;
  workflowLabels: Record<OpportunityWorkflowStage, string>;
  formatMoney: (value: number | null) => string;
  onOpenChange: (open: boolean) => void;
  onShowReminder: () => void;
  onSelectOpportunity: (opportunityId: string) => void;
}

export function OpportunityOperationsDialog({ open, metrics, workflowLabels, formatMoney, onOpenChange, onShowReminder, onSelectOpportunity }: OpportunityOperationsDialogProps) {
  const funnelMax = Math.max(1, ...metrics.funnel.map((item) => item.count));
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-dialog operations-dialog"><div className="opportunity-dialog-head"><div><Dialog.Title>商机经营视图</Dialog.Title><Dialog.Description>基于本地机会、负责人、投标决策和期限实时计算，不产生额外统计上报。</Dialog.Description></div><div className="opportunity-operations-head-actions"><button type="button" onClick={onShowReminder}>检查提醒</button><Dialog.Close className="dialog-close">×</Dialog.Close></div></div>
    <div className="opportunity-operations-kpis"><article><span>活跃商机</span><strong>{metrics.activeCount}</strong><small>预算池 {formatMoney(metrics.pipelineBudget)}</small></article><article className={metrics.tasks.overdue ? 'is-danger' : ''}><span>逾期待办</span><strong>{metrics.tasks.overdue}</strong><small>今日到期 {metrics.tasks.today}</small></article><article className={metrics.deadlines.urgent ? 'is-warning' : ''}><span>临近截标</span><strong>{metrics.deadlines.urgent}</strong><small>3 天以内</small></article><article><span>决定投标</span><strong>{metrics.decisions.bid}</strong><small>待决策 {metrics.decisions.undecided}</small></article></div>
    <div className="opportunity-operations-grid"><section><h3>商机漏斗</h3><div className="opportunity-funnel">{metrics.funnel.map((item) => <div key={item.stage}><span>{workflowLabels[item.stage]}</span><i><b style={{ width: `${Math.max(item.count ? 8 : 0, item.count / funnelMax * 100)}%` }} /></i><strong>{item.count}</strong></div>)}</div></section><section><h3>投标决策</h3><dl className="opportunity-decision-metrics"><div><dt>暂未决策</dt><dd>{metrics.decisions.undecided}</dd></div><div><dt>决定投标</dt><dd>{metrics.decisions.bid}</dd></div><div><dt>决定不投</dt><dd>{metrics.decisions.noBid}</dd></div><div><dt>已中标</dt><dd>{metrics.decisions.won}</dd></div></dl></section></div>
    <div className="opportunity-operations-grid lower"><section><h3>负责人负载</h3><div className="opportunity-owner-load">{metrics.owners.length ? metrics.owners.slice(0, 8).map((owner) => <article key={owner.owner}><strong>{owner.owner}</strong><span>活跃 {owner.total}</span><span>跟进 {owner.following}</span><em className={owner.overdue ? 'is-danger' : ''}>逾期 {owner.overdue}</em></article>) : <p>尚无活跃商机。</p>}</div></section><section><h3>近期任务</h3><div className="opportunity-task-list">{metrics.tasks.items.length ? metrics.tasks.items.slice(0, 8).map((task) => { const isOverdue = new Date(task.dueAt).getTime() < Date.now(); return <button type="button" key={`${task.opportunityId}-${task.type}`} onClick={() => onSelectOpportunity(task.opportunityId)}><span><b>{task.type}</b>{task.title}</span><strong>{task.opportunityTitle}</strong><small className={isOverdue ? 'is-danger' : ''}>{isOverdue ? '已逾期 · ' : ''}{new Date(task.dueAt).toLocaleString()} · {task.owner || '未分配'}</small></button>; }) : <p>暂无设置期限的决策或行动。</p>}</div></section></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
