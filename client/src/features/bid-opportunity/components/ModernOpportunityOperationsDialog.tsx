import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { handleTabListKeyDown } from '../../../shared/utils/keyboardTabs';
import type { OpportunityOperatingMetrics, OpportunityWorkflowStage } from '../types';
import './modernOpportunityOperations.css';

interface Props {
  open: boolean;
  metrics: OpportunityOperatingMetrics;
  workflowLabels: Record<OpportunityWorkflowStage, string>;
  formatMoney: (value: number | null) => string;
  onOpenChange: (open: boolean) => void;
  onShowReminder: () => void;
  onSelectOpportunity: (opportunityId: string) => void;
}

type View = 'pipeline' | 'tasks';
type TaskFilter = 'all' | 'overdue' | 'today';

export function ModernOpportunityOperationsDialog({ open, metrics, workflowLabels, formatMoney, onOpenChange, onShowReminder, onSelectOpportunity }: Props) {
  const [view, setView] = useState<View>('pipeline');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const funnelMax = Math.max(1, ...metrics.funnel.map((item) => item.count));
  const now = Date.now();
  const today = new Date(now).toDateString();
  const tasks = metrics.tasks.items.filter((task) => {
    const dueAt = new Date(task.dueAt).getTime();
    if (taskFilter === 'overdue') return dueAt < now;
    if (taskFilter === 'today') return new Date(task.dueAt).toDateString() === today;
    return true;
  });

  function showTasks(filter: TaskFilter) {
    setTaskFilter(filter);
    setView('tasks');
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="modern-opportunity-operations">
    <header className="modern-operations-head"><div><span>OPPORTUNITY / OPERATIONS</span><Dialog.Title>商机经营视图</Dialog.Title><Dialog.Description>本地机会的进展、负责人和近期行动</Dialog.Description></div><div><button type="button" onClick={onShowReminder}>检查提醒</button><Dialog.Close aria-label="关闭经营视图">×</Dialog.Close></div></header>
    <div className="modern-operations-kpis">
      <article><span>活跃商机</span><strong>{metrics.activeCount}</strong><small>预算池 {formatMoney(metrics.pipelineBudget)}</small></article>
      <button type="button" onClick={() => showTasks('overdue')}><span>逾期待办</span><strong>{metrics.tasks.overdue}</strong><small>查看逾期任务 →</small></button>
      <button type="button" onClick={() => showTasks('all')}><span>临近截标</span><strong>{metrics.deadlines.urgent}</strong><small>3 天以内</small></button>
      <article><span>决定投标</span><strong>{metrics.decisions.bid}</strong><small>待决策 {metrics.decisions.undecided}</small></article>
    </div>
    <nav className="modern-operations-tabs" role="tablist" aria-label="经营视图" onKeyDown={handleTabListKeyDown}><button type="button" role="tab" aria-selected={view === 'pipeline'} tabIndex={view === 'pipeline' ? 0 : -1} className={view === 'pipeline' ? 'is-active' : ''} onClick={() => setView('pipeline')}>经营盘面</button><button type="button" role="tab" aria-selected={view === 'tasks'} tabIndex={view === 'tasks' ? 0 : -1} className={view === 'tasks' ? 'is-active' : ''} onClick={() => setView('tasks')}>近期任务 <small>{metrics.tasks.items.length}</small></button></nav>
    <div className="modern-operations-body" role="tabpanel">
      {view === 'pipeline' ? <div className="modern-operations-dashboard">
        <section className="modern-operations-funnel"><header><span>01 / 阶段推进</span><h3>商机漏斗</h3></header><div>{metrics.funnel.map((item) => <div key={item.stage}><span>{workflowLabels[item.stage]}</span><i><b style={{ width: `${Math.max(item.count ? 8 : 0, item.count / funnelMax * 100)}%` }} /></i><strong>{item.count}</strong></div>)}</div></section>
        <section className="modern-operations-decisions"><header><span>02 / 投标取舍</span><h3>决策分布</h3></header><dl><div><dt>暂未决策</dt><dd>{metrics.decisions.undecided}</dd></div><div><dt>决定投标</dt><dd>{metrics.decisions.bid}</dd></div><div><dt>决定不投</dt><dd>{metrics.decisions.noBid}</dd></div><div><dt>已中标</dt><dd>{metrics.decisions.won}</dd></div></dl></section>
        <section className="modern-operations-owners"><header><span>03 / 团队负载</span><h3>负责人</h3></header>{metrics.owners.length ? <div>{metrics.owners.map((owner) => <article key={owner.owner}><strong>{owner.owner}</strong><span>活跃 {owner.total}</span><span>跟进 {owner.following}</span><em className={owner.overdue ? 'is-danger' : ''}>逾期 {owner.overdue}</em></article>)}</div> : <p>尚无活跃商机。</p>}</section>
      </div> : <section className="modern-operations-tasks"><div className="modern-operations-task-head"><div><span>04 / 行动清单</span><h3>近期任务</h3></div><div role="group" aria-label="任务筛选">{([['all', '全部'], ['overdue', '已逾期'], ['today', '今日到期']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={taskFilter === value} className={taskFilter === value ? 'is-active' : ''} onClick={() => setTaskFilter(value)}>{label}</button>)}</div></div><div className="modern-operations-task-list">{tasks.length ? tasks.map((task) => { const isOverdue = new Date(task.dueAt).getTime() < now; return <button type="button" key={`${task.opportunityId}-${task.type}-${task.dueAt}`} onClick={() => onSelectOpportunity(task.opportunityId)}><span>{task.type}</span><strong>{task.title}</strong><small>{task.opportunityTitle}</small><time className={isOverdue ? 'is-danger' : ''}>{isOverdue ? '已逾期 · ' : ''}{new Date(task.dueAt).toLocaleString()} · {task.owner || '未分配'}</time><b aria-hidden="true">›</b></button>; }) : <div className="modern-operations-empty">当前筛选下没有任务</div>}</div></section>}
    </div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
