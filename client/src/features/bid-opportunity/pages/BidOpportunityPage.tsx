import * as Dialog from '@radix-ui/react-dialog';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SectionId } from '../../../shared/types/navigation';
import type { BidOpportunity, OpportunityDecisionOutcome, OpportunityDraft, OpportunityEnterpriseProfile, OpportunityMonitorDraft, OpportunitySnapshot, OpportunityStatus, OpportunityWorkflowStage } from '../types';
import { OpportunityConfirmDialog } from '../components/OpportunityConfirmDialog';
import { OpportunityOverview } from '../components/OpportunityOverview';
import { OpportunityOperationsDialog } from '../components/OpportunityOperationsDialog';
import '../bidOpportunity.css';

const emptyProfile: OpportunityEnterpriseProfile = { companyName: '', industries: [], serviceRegions: [], capabilities: [], qualifications: [], personnel: [], performances: [], advantages: '', limitations: '', updatedAt: '' };
const emptySnapshot: OpportunitySnapshot = { opportunities: [], monitors: [], enterpriseProfile: emptyProfile, sources: [], scans: {}, scanBatch: { status: 'idle', startedAt: '', total: 0, completed: 0, running: 0, createdCount: 0, updatedCount: 0 }, diagnostics: { interruptedAnalyses: 0, interruptedScans: 0, errorSources: 0, warningSources: 0, untestedSources: 0, failedNotices: 0, issues: [] }, backup: { latestId: '', createdAt: '', verified: false, message: '尚未创建投标机会工作区备份' }, inboxCounts: { new: 0, changes: 0, due: 0, tasks: 0, relation: 0 }, operatingMetrics: { activeCount: 0, pipelineBudget: 0, tasks: { overdue: 0, today: 0, upcoming: 0, items: [] }, deadlines: { overdue: 0, urgent: 0 }, funnel: [], decisions: { undecided: 0, bid: 0, noBid: 0, won: 0 }, owners: [] }, counts: { total: 0, new: 0, review: 0, following: 0, abandoned: 0 } };
const noticeTypes = ['采购意向', '供应商征集', '资格预审', '招标公告', '竞争性磋商', '竞争性谈判', '询价公告', '单一来源', '更正/补遗', '中标/成交', '废标/终止', '其他'];
const statusLabels: Record<OpportunityStatus, string> = { new: '新机会', review: '待判断', following: '跟进中', won: '已中标', abandoned: '已放弃', archived: '已归档' };
const workflowLabels: Record<OpportunityWorkflowStage, string> = { discovery: '新发现', screening: '初筛', qualification: '资格核验', decision: '决策评审', bidding: '立项投标', closed: '已结束' };

const emptyDraft: OpportunityDraft = {
  title: '', noticeType: '招标公告', sourceName: '手工录入', sourceUrl: '', projectCode: '', buyer: '', region: '', industry: '',
  publishDate: '', bidDeadline: '', budget: '', summary: '', content: '', owner: '', notes: '', sourceKind: 'manual',
};
const emptyMonitor: OpportunityMonitorDraft = {
  name: '', enabled: true, industry: '', regions: '', noticeTypes: [], requiredKeywords: '', optionalKeywords: '', excludedKeywords: '', buyerKeywords: '', budgetMin: '', budgetMax: '',
};

interface BidOpportunityPageProps { onNavigate?: (section: SectionId) => void }

function bridge() {
  if (!window.yibiao?.bidOpportunity) throw new Error('投标机会本地服务未就绪，请重启客户端后重试。');
  return window.yibiao.bidOpportunity;
}

function money(value: number | null) {
  if (value === null) return '预算待确认';
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)} 亿元`;
  if (value >= 10000) return `${(value / 10000).toFixed(value % 10000 ? 1 : 0)} 万元`;
  return `${value.toLocaleString()} 元`;
}

function deadline(value: string) {
  if (!value) return { text: '截止时间待确认', level: 'unknown' };
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: '已截止', level: 'expired' };
  if (days === 0) return { text: '今日截止', level: 'urgent' };
  return { text: `剩余 ${days} 天`, level: days <= 3 ? 'urgent' : days <= 10 ? 'soon' : 'normal' };
}

function toDraft(item: BidOpportunity): OpportunityDraft {
  return { ...item, budget: item.budget === null ? '' : String(item.budget), publishDate: item.publishDate?.slice(0, 10) || '', bidDeadline: item.bidDeadline ? item.bidDeadline.slice(0, 16) : '' };
}

function toMonitorDraft(monitor: OpportunitySnapshot['monitors'][number], copy = false): OpportunityMonitorDraft {
  return { monitorId: copy ? undefined : monitor.monitorId, name: copy ? `${monitor.name}（副本）` : monitor.name, enabled: monitor.enabled, industry: monitor.industry, regions: monitor.regions.join('，'), noticeTypes: [...monitor.noticeTypes], requiredKeywords: monitor.requiredKeywords.join('，'), optionalKeywords: monitor.optionalKeywords.join('，'), excludedKeywords: monitor.excludedKeywords.join('，'), buyerKeywords: monitor.buyerKeywords.join('，'), budgetMin: monitor.budgetMin === null ? '' : String(monitor.budgetMin), budgetMax: monitor.budgetMax === null ? '' : String(monitor.budgetMax) };
}

function BidOpportunityPage({ onNavigate }: BidOpportunityPageProps) {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<BidOpportunity | null>(null);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [inbox, setInbox] = useState('');
  const [monitorId, setMonitorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'overview' | 'details'>('overview');
  const [draft, setDraft] = useState<OpportunityDraft>(emptyDraft);
  const [monitorDraft, setMonitorDraft] = useState<OpportunityMonitorDraft>(emptyMonitor);
  const [profileDraft, setProfileDraft] = useState<OpportunityEnterpriseProfile>(emptyProfile);
  const [decisionDraft, setDecisionDraft] = useState({ workflowStage: 'discovery' as OpportunityWorkflowStage, decisionOutcome: 'undecided' as OpportunityDecisionOutcome, decisionReason: '', decisionDueAt: '', nextAction: '', nextActionDueAt: '' });
  const [detailTab, setDetailTab] = useState<'summary' | 'decision' | 'timeline' | 'content' | 'events'>('summary');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [batchOwner, setBatchOwner] = useState('');
  const [confirmAction, setConfirmAction] = useState<'bulk' | 'delete-monitor' | null>(null);
  const [loadError, setLoadError] = useState('');
  const deferredKeyword = useDeferredValue(keyword);

  const activeItems = snapshot.opportunities;
  const selectedDeadline = selected ? deadline(selected.bidDeadline) : null;
  const monitorRuleText = useMemo(() => {
    const parts = [];
    if (monitorDraft.regions.trim()) parts.push(`地区包含 ${monitorDraft.regions}`);
    if (monitorDraft.industry.trim()) parts.push(`行业包含 ${monitorDraft.industry}`);
    if (monitorDraft.noticeTypes.length) parts.push(`公告类型为 ${monitorDraft.noticeTypes.join('、')}`);
    if (monitorDraft.buyerKeywords.trim()) parts.push(`采购人包含 ${monitorDraft.buyerKeywords}`);
    if (monitorDraft.requiredKeywords.trim()) parts.push(`必须包含 ${monitorDraft.requiredKeywords}`);
    if (monitorDraft.optionalKeywords.trim()) parts.push(`匹配 ${monitorDraft.optionalKeywords}`);
    if (monitorDraft.excludedKeywords.trim()) parts.push(`排除 ${monitorDraft.excludedKeywords}`);
    if (monitorDraft.budgetMin) parts.push(`预算不低于 ${monitorDraft.budgetMin} 元`);
    if (monitorDraft.budgetMax) parts.push(`预算不高于 ${monitorDraft.budgetMax} 元`);
    return parts.length ? parts.join('；') : '当前方案将匹配所有录入机会，请补充条件。';
  }, [monitorDraft]);

  useEffect(() => {
    if (!selected) return;
    setDecisionDraft({ workflowStage: selected.workflowStage, decisionOutcome: selected.decisionOutcome, decisionReason: selected.decisionReason, decisionDueAt: selected.decisionDueAt?.slice(0, 16) || '', nextAction: selected.nextAction, nextActionDueAt: selected.nextActionDueAt?.slice(0, 16) || '' });
  }, [selected?.opportunityId, selected?.updatedAt]);

  useEffect(() => {
    setLoading(true); setLoadError('');
    load().catch((error) => { const message = error instanceof Error ? error.message : '加载投标机会失败'; setLoadError(message); showToast(message, 'error'); }).finally(() => setLoading(false));
  }, [deferredKeyword, status, monitorId, inbox]);

  useEffect(() => {
    const unsubscribe = window.yibiao?.bidOpportunity?.onEvent(({ opportunity, scan, source, scanBatch }) => {
      if (opportunity) {
        if (opportunity.opportunityId === selectedId) setSelected(opportunity);
        setSnapshot((current) => ({ ...current, opportunities: current.opportunities.map((item) => item.opportunityId === opportunity.opportunityId ? opportunity : item) }));
      }
      if (scan || source || scanBatch) setSnapshot((current) => ({ ...current, scans: scan ? { ...current.scans, [scan.sourceId]: scan } : current.scans, sources: source ? current.sources.map((item) => item.sourceId === source.sourceId ? source : item) : current.sources, scanBatch: scanBatch || current.scanBatch }));
      if (scan && scan.status !== 'running') {
        void bridge().getSnapshot({ keyword: deferredKeyword, status, monitorId, inbox }).then((next) => setSnapshot(next));
      }
    });
    return () => unsubscribe?.();
  }, [deferredKeyword, inbox, monitorId, selectedId, status]);

  async function load(preferredId?: string) {
    const data = await bridge().getSnapshot({ keyword: deferredKeyword, status, monitorId, inbox });
    setSnapshot(data);
    const nextId = preferredId || (data.opportunities.some((item) => item.opportunityId === selectedId) ? selectedId : data.opportunities[0]?.opportunityId || '');
    setSelectedId(nextId);
    if (!nextId) {
      setSelected(null);
      return;
    }

    // 总览只依赖快照，不应等待第一条机会的正文、事件和项目关联计算。
    // 详情在后台预取，进入工作台时通常已经可直接使用。
    if (viewMode === 'overview') {
      void bridge().get(nextId).then((detail) => setSelected((current) => current && current.opportunityId !== nextId ? current : detail)).catch(() => undefined);
      return;
    }
    setSelected(await bridge().get(nextId));
  }

  async function selectOpportunity(opportunityId: string) {
    setSelectedId(opportunityId);
    setSelected(await bridge().get(opportunityId));
    setDetailTab('summary');
  }

  async function openOpportunityFromOverview(opportunityId: string) {
    setViewMode('details');
    await selectOpportunity(opportunityId);
  }

  async function openDetails() {
    setViewMode('details');
    const nextId = selectedId || snapshot.opportunities[0]?.opportunityId || '';
    if (nextId && selected?.opportunityId !== nextId) await selectOpportunity(nextId);
  }

  async function showOverview() {
    setViewMode('overview');
    setKeyword(''); setStatus(''); setInbox(''); setMonitorId('');
    try {
      const data = await bridge().getSnapshot({});
      setSnapshot(data);
    } catch (error) { showToast(error instanceof Error ? error.message : '总览刷新失败', 'error'); }
  }

  async function createWorkspaceBackup() {
    setSaving(true);
    try {
      const result = await bridge().createWorkspaceBackup();
      setSnapshot((current) => ({ ...current, backup: result }));
      showToast('投标机会工作区备份已创建', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '创建工作区备份失败', 'error'); }
    finally { setSaving(false); }
  }

  async function verifyLatestBackup() {
    setSaving(true);
    try {
      const result = await bridge().verifyLatestBackup();
      setSnapshot((current) => ({ ...current, backup: result }));
      showToast('最近备份完整性验证通过', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '备份完整性验证失败', 'error'); }
    finally { setSaving(false); }
  }

  function openCreate() {
    setDraft(emptyDraft);
    setOpportunityOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setDraft(toDraft(selected));
    setOpportunityOpen(true);
  }

  async function saveOpportunity() {
    if (!draft.title.trim()) return showToast('请填写机会名称', 'info');
    setSaving(true);
    try {
      const saved = await bridge().save(draft);
      setOpportunityOpen(false);
      await load(saved.opportunityId);
      showToast(draft.opportunityId ? '机会信息已更新' : '投标机会已创建', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally { setSaving(false); }
  }

  async function importFile() {
    setSaving(true);
    try {
      const result = await bridge().importFile();
      if (!result.success) return showToast(result.message || '已取消导入', 'info');
      await load(result.opportunity?.opportunityId);
      showToast(result.message || '文件已导入', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '文件导入失败', 'error'); }
    finally { setSaving(false); }
  }

  async function changeStatus(next: OpportunityStatus) {
    if (!selected) return;
    const item = await bridge().updateStatus({ opportunityId: selected.opportunityId, status: next });
    setSelected(item);
    await load(item.opportunityId);
    showToast(`已更新为“${statusLabels[next]}”`, 'success');
  }

  async function saveMonitor() {
    if (!monitorDraft.name.trim()) return showToast('请填写监控方案名称', 'info');
    setSaving(true);
    try {
      await bridge().saveMonitor(monitorDraft);
      setMonitorOpen(false);
      setMonitorDraft(emptyMonitor);
      await load();
      showToast('监控方案已保存，现有机会已重新匹配', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '保存监控方案失败', 'error'); }
    finally { setSaving(false); }
  }

  function openMonitor(monitor?: OpportunitySnapshot['monitors'][number], copy = false) {
    setMonitorDraft(monitor ? toMonitorDraft(monitor, copy) : emptyMonitor);
    setMonitorOpen(true);
  }

  async function runBulkUpdate() {
    if (!selectedIds.length) return showToast('请先勾选需要处理的机会', 'info');
    if (!batchStatus && !batchOwner.trim()) return showToast('请选择目标状态或填写负责人', 'info');
    setSaving(true);
    try {
      const result = await bridge().bulkUpdate({ opportunityIds: selectedIds, ...(batchStatus ? { status: batchStatus as OpportunityStatus } : {}), ...(batchOwner.trim() ? { owner: batchOwner.trim() } : {}) });
      setSelectedIds([]); setBatchStatus(''); setBatchOwner(''); setConfirmAction(null); await load(selectedId);
      showToast(`已批量更新 ${result.updatedCount} 条机会`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '批量更新失败', 'error'); }
    finally { setSaving(false); }
  }

  async function deleteCurrentMonitor() {
    if (!monitorDraft.monitorId) return;
    setSaving(true);
    try {
      await bridge().deleteMonitor(monitorDraft.monitorId);
      if (monitorId === monitorDraft.monitorId) setMonitorId('');
      setConfirmAction(null); setMonitorOpen(false); setMonitorDraft(emptyMonitor); await load();
      showToast('监控方案已删除，现有机会已重新匹配', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '删除监控方案失败', 'error'); }
    finally { setSaving(false); }
  }

  async function createPresales() {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await bridge().createPresalesProject(selected.opportunityId);
      await load(selected.opportunityId);
      showToast(result.existing ? '该机会已关联售前项目' : '售前项目已创建并关联', 'success');
      if (onNavigate) onNavigate('presales-workbench');
    } catch (error) { showToast(error instanceof Error ? error.message : '创建售前项目失败', 'error'); }
    finally { setSaving(false); }
  }

  function openProfile() {
    setProfileDraft(snapshot.enterpriseProfile || emptyProfile);
    setProfileOpen(true);
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const saved = await bridge().saveEnterpriseProfile(profileDraft);
      setSnapshot((current) => ({ ...current, enterpriseProfile: saved }));
      setProfileOpen(false);
      showToast('企业能力画像已保存', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '保存企业画像失败', 'error'); }
    finally { setSaving(false); }
  }

  async function startDeepAnalysis() {
    if (!selected) return;
    if (!snapshot.enterpriseProfile.companyName && !snapshot.enterpriseProfile.capabilities.length && !snapshot.enterpriseProfile.qualifications.length) {
      openProfile();
      return showToast('请先配置企业能力画像，再进行深度分析', 'info');
    }
    try {
      const opportunity = await bridge().startDeepAnalysis(selected.opportunityId);
      setSelected(opportunity);
      showToast('深度分析已在后台启动', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '启动深度分析失败', 'error'); }
  }

  async function startSourceScan(sourceId: string) {
    try {
      const scan = await bridge().startSourceScan(sourceId);
      setSnapshot((current) => ({ ...current, scans: { ...current.scans, [sourceId]: scan } }));
      showToast('数据源扫描已在后台启动', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '启动数据源扫描失败', 'error'); }
  }

  async function startAllScans() {
    try {
      const scanBatch = await bridge().startAllSourceScans();
      setSnapshot((current) => ({ ...current, scanBatch }));
      showToast('已开始依次扫描全部启用来源', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '启动全部扫描失败', 'error'); }
  }

  async function showDesktopReminder() {
    try { const result = await bridge().showReminder(); showToast(result.message, result.shown ? 'success' : 'info'); }
    catch (error) { showToast(error instanceof Error ? error.message : '桌面提醒失败', 'error'); }
  }

  async function mergeRelation(targetClusterId: string) {
    if (!selected) return;
    try { const item = await bridge().mergeProjectClusters({ opportunityId: selected.opportunityId, targetClusterId }); await load(item.opportunityId); showToast('项目链路已人工合并', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '合并项目链路失败', 'error'); }
  }

  async function splitRelation() {
    if (!selected) return;
    try { const item = await bridge().splitProjectCluster(selected.opportunityId); await load(item.opportunityId); showToast('该公告已拆分为独立项目', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '拆分项目链路失败', 'error'); }
  }

  async function saveDecisionWorkflow() {
    if (!selected) return;
    if (decisionDraft.decisionOutcome === 'no_bid' && !decisionDraft.decisionReason.trim()) return showToast('决定不投标时需要填写原因', 'info');
    setSaving(true);
    try { const item = await bridge().updateDecisionWorkflow({ opportunityId: selected.opportunityId, ...decisionDraft }); setSelected(item); await load(item.opportunityId); showToast('投标决策流程已保存', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '保存决策流程失败', 'error'); }
    finally { setSaving(false); }
  }

  async function importTenderFile() {
    if (!selected) return;
    setSaving(true);
    try { const result = await bridge().importTenderFile(selected.opportunityId); if (!result.success) return showToast(result.message || '已取消导入', 'info'); setSelected(result.opportunity); await load(result.opportunity.opportunityId); showToast(result.message || '正式招标文件已导入', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '导入正式招标文件失败', 'error'); }
    finally { setSaving(false); }
  }

  async function sendTender(target: 'technical-plan' | 'rejection-check') {
    if (!selected) return;
    setSaving(true);
    try {
      const result = target === 'technical-plan' ? await bridge().sendTenderToTechnicalPlan(selected.opportunityId) : await bridge().sendTenderToRejectionCheck(selected.opportunityId);
      setSelected(result.opportunity); showToast(result.message, 'success'); if (onNavigate) onNavigate(target);
    } catch (error) { showToast(error instanceof Error ? error.message : '招标文件流转失败', 'error'); }
    finally { setSaving(false); }
  }

  async function updateSource(sourceId: string, enabled: boolean, maxItems: number) {
    try {
      const source = await bridge().updateSource({ sourceId, enabled, maxItems });
      setSnapshot((current) => ({ ...current, sources: current.sources.map((item) => item.sourceId === sourceId ? source : item) }));
    } catch (error) { showToast(error instanceof Error ? error.message : '更新数据源失败', 'error'); }
  }

  async function handleDiagnosticIssue(issue: OpportunitySnapshot['diagnostics']['issues'][number]) {
    if (issue.kind === 'source') {
      await startSourceScan(issue.sourceId);
      return;
    }
    setMaintenanceOpen(false);
    setViewMode('details');
    await selectOpportunity(issue.opportunityId);
  }

  return (
    <div className={`bid-opportunity-page is-${viewMode}`}>
      <header className="opportunity-command-bar">
        <div><span className="section-kicker">招投标情报</span><h2>{viewMode === 'overview' ? '投标机会总览' : '机会详情'}</h2><p>{viewMode === 'overview' ? '集中查看商机盘面、扫描结果和投标推进情况。' : '筛选、研判并推进具体投标机会。'}</p></div>
        <div className="opportunity-command-actions">
          {viewMode === 'details' && <button type="button" className="opportunity-back-overview" onClick={showOverview}>返回总览</button>}
          {viewMode === 'details' && <button type="button" className="scan-all-action" onClick={startAllScans} disabled={snapshot.scanBatch.status === 'running'}>{snapshot.scanBatch.status === 'running' ? `扫描中 ${snapshot.scanBatch.completed}/${snapshot.scanBatch.total}` : '扫描机会'}</button>}
          {viewMode === 'details' && <button type="button" className="secondary-action" onClick={importFile} disabled={saving}>导入公告文件</button>}
          {viewMode === 'details' && <button type="button" className="secondary-action" onClick={openProfile}>企业画像</button>}
          {viewMode === 'details' && <button type="button" className="secondary-action" onClick={() => setSourcesOpen(true)}>数据源</button>}
          {viewMode === 'details' && <button type="button" className="secondary-action" onClick={() => setOperationsOpen(true)}>经营视图</button>}
          {viewMode === 'details' && <button type="button" className="secondary-action" onClick={() => setMaintenanceOpen(true)}>健康与备份</button>}
          {viewMode === 'details' && <button type="button" className="secondary-action" onClick={() => openMonitor()}>新建监控</button>}
          {viewMode === 'details' && <button type="button" className="primary-action" onClick={openCreate}>录入机会</button>}
        </div>
      </header>

      {viewMode === 'details' && (snapshot.scanBatch.status === 'running' || snapshot.diagnostics.interruptedAnalyses > 0 || snapshot.diagnostics.interruptedScans > 0 || snapshot.diagnostics.errorSources > 0 || snapshot.diagnostics.warningSources > 0) && <div className={`opportunity-health-strip ${snapshot.diagnostics.errorSources || snapshot.diagnostics.interruptedScans ? 'is-warning' : ''}`}>
        <strong>{snapshot.scanBatch.status === 'running' ? `正在扫描 ${snapshot.scanBatch.completed}/${snapshot.scanBatch.total}` : '运行状态需要关注'}</strong>
        <span>{snapshot.scanBatch.status === 'running' ? `已新增 ${snapshot.scanBatch.createdCount} 条，更新 ${snapshot.scanBatch.updatedCount} 条` : `异常数据源 ${snapshot.diagnostics.errorSources} 个，警告 ${snapshot.diagnostics.warningSources} 个，中断任务 ${snapshot.diagnostics.interruptedAnalyses + snapshot.diagnostics.interruptedScans} 个`}</span>
        <button type="button" onClick={() => setMaintenanceOpen(true)}>查看诊断</button>
      </div>}

      {viewMode === 'overview' ? <OpportunityOverview snapshot={snapshot} loading={loading} loadError={loadError} workflowLabels={workflowLabels} formatMoney={money} onScan={startAllScans} onOpenDetails={() => void openDetails()} onOpenOpportunity={openOpportunityFromOverview} onOpenSources={() => setSourcesOpen(true)} onOpenHealth={() => setMaintenanceOpen(true)} onRetry={() => { setLoading(true); setLoadError(''); load().catch((error) => setLoadError(error instanceof Error ? error.message : '重新加载失败')).finally(() => setLoading(false)); }} /> : <div className="opportunity-workbench">
        <aside className="opportunity-nav-panel">
          <div className="opportunity-search"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目、采购人、地区" /></div>
          <div className="opportunity-inbox-section"><div className="opportunity-sidebar-title"><h3>商机收件箱</h3></div>{[
            ['new', '新发现', snapshot.inboxCounts.new], ['tasks', '今日待办', snapshot.inboxCounts.tasks], ['changes', '重要变化', snapshot.inboxCounts.changes], ['due', '即将截止', snapshot.inboxCounts.due], ['relation', '待确认关联', snapshot.inboxCounts.relation],
          ].map(([value, label, count]) => <button key={String(value)} type="button" className={inbox === value ? 'is-active' : ''} onClick={() => { setInbox(inbox === value ? '' : String(value)); setStatus(''); }}><span>{label}</span><b>{count}</b></button>)}</div>
          <nav className="opportunity-views" aria-label="机会视图">
            {[
              ['', '全部机会', snapshot.counts.total], ['new', '今日待看', snapshot.counts.new], ['review', '待人工判断', snapshot.counts.review],
              ['following', '重点跟进', snapshot.counts.following], ['abandoned', '已放弃', snapshot.counts.abandoned],
            ].map(([value, label, count]) => <button key={String(label)} type="button" className={!inbox && status === value ? 'is-active' : ''} onClick={() => { setStatus(String(value)); setInbox(''); }}><span>{label}</span><b>{count}</b></button>)}
          </nav>
          <div className="opportunity-sidebar-section"><div className="opportunity-sidebar-title"><h3>监控方案</h3><button type="button" onClick={() => openMonitor()}>＋</button></div>
            <button type="button" className={`opportunity-monitor-link ${!monitorId ? 'is-active' : ''}`} onClick={() => setMonitorId('')}><span>全部方案</span></button>
            {snapshot.monitors.map((monitor) => { const ruleSummary = monitor.optionalKeywords.slice(0, 2).join(' · ') || '自定义规则'; return <div key={monitor.monitorId} className={`opportunity-monitor-entry ${monitorId === monitor.monitorId ? 'is-active' : ''}`}><button type="button" className="opportunity-monitor-link" title={`${monitor.name}\n${ruleSummary}`} onClick={() => setMonitorId(monitor.monitorId)}><span>{monitor.name}</span><small>{ruleSummary}</small></button><div><button type="button" onClick={() => openMonitor(monitor)}>编辑</button><button type="button" onClick={() => openMonitor(monitor, true)}>复制</button></div></div>; })}
          </div>
          <div className="opportunity-source-note"><strong>数据源状态</strong>{snapshot.sources.map((source) => <button type="button" key={source.sourceId} title={source.name} onClick={() => setSourcesOpen(true)}><i className={`is-${source.healthStatus}`} /><span>{source.name}</span><small>{{ untested: '待测试', healthy: '运行正常', warning: '部分公告失败', error: '扫描异常' }[source.healthStatus]}</small></button>)}</div>
        </aside>

        <main className="opportunity-list-panel">
          <div className="opportunity-list-head"><div><strong>{inbox ? ({ new: '新发现', tasks: '今日待办', changes: '重要变化', due: '即将截止', relation: '待确认关联' }[inbox]) : status ? statusLabels[status as OpportunityStatus] : monitorId ? '方案匹配结果' : '全部机会'}</strong><span>共 {activeItems.length} 条</span></div><div className="opportunity-list-tools"><button type="button" className={batchMode ? 'is-active' : ''} onClick={() => { setBatchMode(!batchMode); setSelectedIds([]); }}>{batchMode ? '退出批量' : '批量处理'}</button><select aria-label="状态筛选" value={status} onChange={(event) => { setStatus(event.target.value); setInbox(''); }}><option value="">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
          {batchMode && <div className="opportunity-batch-bar"><label><input type="checkbox" checked={activeItems.length > 0 && selectedIds.length === activeItems.length} onChange={(event) => setSelectedIds(event.target.checked ? activeItems.map((item) => item.opportunityId) : [])} />全选</label><span>已选 {selectedIds.length} 条</span><select aria-label="批量状态" value={batchStatus} onChange={(event) => setBatchStatus(event.target.value)}><option value="">状态不变</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="批量负责人" value={batchOwner} onChange={(event) => setBatchOwner(event.target.value)} placeholder="分配负责人" /><button type="button" onClick={() => { if (!selectedIds.length) return showToast('请先勾选需要处理的机会', 'info'); if (!batchStatus && !batchOwner.trim()) return showToast('请选择目标状态或填写负责人', 'info'); setConfirmAction('bulk'); }} disabled={saving || !selectedIds.length}>应用</button></div>}
          <div className="opportunity-list-scroll">
            {loading ? <div className="opportunity-list-skeleton" aria-label="正在加载本地机会库">{[0, 1, 2, 3].map((item) => <div key={item}><i /><span /><span /><small /></div>)}</div> : loadError ? <div className="opportunity-empty is-error"><strong>机会库加载失败</strong><span>{loadError}</span><button type="button" className="secondary-action" onClick={() => { setLoading(true); setLoadError(''); load().catch((error) => setLoadError(error instanceof Error ? error.message : '重新加载失败')).finally(() => setLoading(false)); }}>重新加载</button></div> : activeItems.length ? activeItems.map((item) => {
              const due = deadline(item.bidDeadline);
              return <div key={item.opportunityId} className={`opportunity-list-row ${batchMode ? 'is-batch' : ''}`}>{batchMode && <label className="opportunity-row-check"><input type="checkbox" checked={selectedIds.includes(item.opportunityId)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, item.opportunityId] : selectedIds.filter((id) => id !== item.opportunityId))} /><span className="sr-only">选择 {item.title}</span></label>}<button type="button" className={`opportunity-list-item ${selectedId === item.opportunityId ? 'is-selected' : ''}`} onClick={() => selectOpportunity(item.opportunityId)}>
                <div className="opportunity-item-top"><span className={`opportunity-grade is-${item.valueScore >= 72 ? 'high' : item.valueScore >= 48 ? 'medium' : 'low'}`}>{item.valueScore}</span><div><strong title={item.title}>{item.title}</strong><span title={`${item.noticeType} · ${item.buyer || '采购人待确认'} · ${item.region || '地区待确认'}`}>{item.noticeType} · {item.buyer || '采购人待确认'} · {item.region || '地区待确认'}</span>{item.projectClusterId && <small>项目链路 · {item.announcementStage === 'intention' ? '意向阶段' : item.announcementStage === 'tender' ? '采购公告阶段' : item.noticeType}</small>}</div></div>
                <div className="opportunity-item-meta"><span>{money(item.budget)}</span><span className={`is-${due.level}`}>{due.text}</span><em>{statusLabels[item.status]}</em></div>
                <div className="opportunity-item-tags">{item.matchedKeywords.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{item.riskFlags.slice(0, 1).map((risk) => <span key={risk} className="is-risk">{risk}</span>)}</div>
              </button></div>;
            }) : <div className="opportunity-empty"><strong>当前视图暂无机会</strong><span>可以录入公告、导入本地文件，或调整筛选条件。</span><button type="button" className="primary-action" onClick={openCreate}>录入第一条机会</button></div>}
          </div>
        </main>

        <aside className="opportunity-detail-panel">
          {selected ? <>
            <div className="opportunity-detail-head"><div><span className={`opportunity-recommendation ${selected.recommendation.includes('过期') ? 'is-danger' : ''}`}>{selected.recommendation}</span><h3 title={selected.title}>{selected.title}</h3><p title={`${selected.sourceName} · ${selected.noticeType} · ${workflowLabels[selected.workflowStage]}`}>{selected.sourceName} · {selected.noticeType} · {workflowLabels[selected.workflowStage]}</p></div><button type="button" className="detail-edit-button" onClick={openEdit}>编辑</button></div>
            <div className="opportunity-decision-strip"><article><span>资格门槛</span><strong>{selected.qualificationStatus === 'unknown' ? '待核验' : selected.qualificationStatus}</strong></article><article><span>商机价值</span><strong>{selected.valueScore}</strong></article><article><span>投标准备</span><strong>{selected.feasibilityScore}</strong></article><article><span>截止时间</span><strong className={`is-${selectedDeadline?.level}`}>{selectedDeadline?.text}</strong></article></div>
            <div className="opportunity-detail-actions"><button type="button" className="primary-action" onClick={() => changeStatus('following')}>跟进</button><button type="button" className="secondary-action" onClick={() => changeStatus('review')}>待判断</button><button type="button" className="secondary-action" onClick={() => changeStatus('abandoned')}>放弃</button></div>
            <nav className="opportunity-detail-tabs">{[['summary', '决策概要'], ['decision', '投标决策'], ['timeline', `项目时间线${(selected.projectTimeline?.length || 0) > 1 ? ` ${selected.projectTimeline?.length}` : ''}`], ['content', '公告原文'], ['events', '跟进记录']].map(([value, label]) => <button key={value} type="button" className={detailTab === value ? 'is-active' : ''} onClick={() => setDetailTab(value as typeof detailTab)}>{label}</button>)}</nav>
            <div className="opportunity-detail-scroll">
              {detailTab === 'summary' && <div className="opportunity-detail-stack">
                <section><h4>关键信息</h4><dl><div><dt>采购人</dt><dd>{selected.buyer || '待确认'}</dd></div><div><dt>预算</dt><dd>{money(selected.budget)}</dd></div><div><dt>项目编号</dt><dd>{selected.projectCode || '待确认'}</dd></div><div><dt>负责人</dt><dd>{selected.owner || '未分配'}</dd></div></dl></section>
                {(selected.awardSupplier || selected.terminationReason || selected.changeSummary) && <section className={`opportunity-lifecycle-result is-${selected.announcementStage}`}><h4>{selected.announcementStage === 'result' ? '采购结果' : selected.announcementStage === 'terminated' ? '终止结论' : '公告变化'}</h4>{selected.awardSupplier && <dl><div><dt>中标供应商</dt><dd>{selected.awardSupplier}</dd></div><div><dt>成交金额</dt><dd>{money(selected.awardAmount)}</dd></div></dl>}<p>{selected.terminationReason || selected.changeSummary}</p></section>}
                <section><div className="opportunity-analysis-heading"><h4>投标深度分析</h4><button type="button" className="secondary-action" onClick={startDeepAnalysis} disabled={selected.analysisTask?.status === 'running'}>{selected.analysisTask?.status === 'running' ? '分析中…' : selected.deepAnalysis ? '重新分析' : '开始分析'}</button></div>
                  {selected.analysisTask?.status === 'running' && <div className="opportunity-analysis-progress"><span style={{ width: `${selected.analysisTask.progress}%` }} /><p>{selected.analysisTask.message} · {selected.analysisTask.progress}%</p></div>}
                  {selected.analysisTask?.status === 'error' && <p className="opportunity-analysis-error">{selected.analysisTask.error || '深度分析失败，请检查模型配置后重试。'}</p>}
                  {selected.deepAnalysis && !selected.analysisSignature && <p className="opportunity-analysis-stale">公告内容或企业画像已变化，当前分析仅供历史参考，请重新分析。</p>}
                  {selected.deepAnalysis ? <div className="opportunity-deep-result"><p>{selected.deepAnalysis.conclusionReason || selected.deepAnalysis.projectSummary}</p><div className="opportunity-score-note"><span>AI 商机价值 {selected.deepAnalysis.valueScore}</span><span>AI 投标可行性 {selected.deepAnalysis.feasibilityScore}</span><small>AI 结论需结合已验证证据和人工复核使用。</small></div></div> : <p>结合企业画像提取资格门槛、原文证据、能力缺口和推荐行动。</p>}
                </section>
                <section><h4>规则初筛</h4><p>{selected.summary || '尚未填写项目摘要。'}</p><div className="opportunity-score-note"><span>规则匹配 {selected.ruleScore}</span><span>信息完整 {selected.informationScore}</span><small>这是本地快速规则结果，与 AI 深度分析分开保存。</small></div></section>
                {selected.deepAnalysis && <section><h4>资格门槛与证据</h4><div className="opportunity-requirement-list">{selected.deepAnalysis.requirements.map((item, index) => <article key={`${item.category}-${index}`} className={`is-${item.matchStatus}`}><div><span>{item.category || '其他'}</span><b>{{ met: '已匹配', partial: '部分匹配', unmet: '不满足', unknown: '待确认' }[item.matchStatus]}</b></div><strong>{item.requirement}</strong>{item.profileEvidence && <p>企业依据：{item.profileEvidence}</p>}{item.evidence.quote && <blockquote className={item.evidence.verified ? 'is-verified' : 'is-unverified'}>“{item.evidence.quote}”<small>{item.evidence.verified ? '已在公告原文中验证' : '未能逐字验证，请人工核对'}</small></blockquote>}</article>)}</div></section>}
                {selected.deepAnalysis && <section><h4>AI 风险与待确认</h4>{selected.deepAnalysis.risks.map((risk, index) => <div className="opportunity-ai-risk" key={`${risk.title}-${index}`}><strong>{risk.title}</strong><p>{risk.detail}</p>{risk.evidence.quote && <small>{risk.evidence.verified ? '证据已验证' : '证据待人工核验'}：{risk.evidence.quote}</small>}</div>)}{selected.deepAnalysis.pendingConfirmations.length > 0 && <ul>{selected.deepAnalysis.pendingConfirmations.map((item) => <li key={item}>{item}</li>)}</ul>}</section>}
                <section><h4>风险与待确认</h4>{selected.riskFlags.length ? <ul>{selected.riskFlags.map((risk) => <li key={risk}>{risk}</li>)}</ul> : <p>当前规则未发现明显时效或信息缺口，正式投标前仍需核验招标文件。</p>}</section>
                <section><h4>命中监控</h4>{selected.monitorMatches?.length ? selected.monitorMatches.map((match) => <div className="opportunity-match-row" key={match.monitorId}><span>{match.monitorName}</span><b>{match.matchScore}</b><small>{match.reasons?.join('；') || match.matchedKeywords.join(' · ') || '基础条件匹配'}</small></div>) : <p>尚未命中监控方案。</p>}</section>
                <section className="opportunity-presales-card"><div><h4>{selected.presalesProjectId ? '已关联售前项目' : '进入售前跟进'}</h4><p>将项目、客户、预算、截止日期和风险摘要带入售前工作台。</p></div><button type="button" className="primary-action" onClick={createPresales} disabled={saving}>{selected.presalesProjectId ? '打开售前项目' : '创建售前项目'}</button></section>
              </div>}
              {detailTab === 'decision' && <div className="opportunity-decision-workspace">
                <section><div className="opportunity-decision-section-head"><div><h4>投标决策流程</h4><p>从线索初筛推进到资格核验、决策评审和正式立项。</p></div><span>{workflowLabels[decisionDraft.workflowStage]}</span></div>
                  <div className="opportunity-stage-track">{(Object.entries(workflowLabels) as Array<[OpportunityWorkflowStage, string]>).map(([value, label]) => <button type="button" key={value} className={decisionDraft.workflowStage === value ? 'is-active' : ''} onClick={() => setDecisionDraft({ ...decisionDraft, workflowStage: value })}><i />{label}</button>)}</div>
                </section>
                <section><h4>决策结论</h4><div className="opportunity-decision-choices">{([['undecided', '暂未决策'], ['bid', '决定投标'], ['no_bid', '决定不投']] as Array<[OpportunityDecisionOutcome, string]>).map(([value, label]) => <button type="button" className={decisionDraft.decisionOutcome === value ? `is-active is-${value}` : ''} key={value} onClick={() => setDecisionDraft({ ...decisionDraft, decisionOutcome: value })}>{label}</button>)}</div><div className="opportunity-decision-fields"><label><span>决策完成期限</span><input type="datetime-local" value={decisionDraft.decisionDueAt} onChange={(event) => setDecisionDraft({ ...decisionDraft, decisionDueAt: event.target.value })} /></label><label className="is-wide"><span>{decisionDraft.decisionOutcome === 'no_bid' ? '不投标原因 *' : '决策依据与备注'}</span><textarea rows={3} value={decisionDraft.decisionReason} onChange={(event) => setDecisionDraft({ ...decisionDraft, decisionReason: event.target.value })} /></label></div></section>
                <section><h4>下一步行动</h4><div className="opportunity-decision-fields"><label className="is-wide"><span>行动内容</span><input value={decisionDraft.nextAction} onChange={(event) => setDecisionDraft({ ...decisionDraft, nextAction: event.target.value })} placeholder="例如：核验信息安全资质有效期" /></label><label><span>行动期限</span><input type="datetime-local" value={decisionDraft.nextActionDueAt} onChange={(event) => setDecisionDraft({ ...decisionDraft, nextActionDueAt: event.target.value })} /></label></div></section>
                <section className="opportunity-tender-handoff"><div><h4>正式招标文件</h4>{selected.tenderFile ? <p><strong>{selected.tenderFile.fileName}</strong><span>{selected.tenderFile.parserLabel || '本地解析'} · {new Date(selected.tenderFile.importedAt).toLocaleString()}</span></p> : <p>导入正式招标文件后，可直接流转到资格分析和投标内容生产环节。</p>}</div><button type="button" className="secondary-action" onClick={importTenderFile} disabled={saving}>{selected.tenderFile ? '重新导入' : '导入文件'}</button></section>
                {selected.tenderFile && <section className="opportunity-handoff-actions"><h4>进入投标生产</h4><p>同一份本地招标文件会写入目标模块，不重复解析。</p><div><button type="button" onClick={() => sendTender('technical-plan')} disabled={saving}>技术方案</button><button type="button" onClick={() => sendTender('rejection-check')} disabled={saving}>废标项检查</button><button type="button" onClick={createPresales} disabled={saving}>售前工作台</button></div></section>}
                <button type="button" className="primary-action opportunity-save-decision" onClick={saveDecisionWorkflow} disabled={saving}>{saving ? '保存中…' : '保存决策流程'}</button>
              </div>}
              {detailTab === 'timeline' && <div className="opportunity-project-timeline">
                <div className="opportunity-timeline-intro"><div><strong>同一项目公告演进</strong><p>关联方式：{{ project_code: '项目编号自动关联', buyer_title: '采购人和名称自动关联', exact_title: '项目名称自动关联', manual_merge: '人工合并确认', manual_split: '人工拆分确认', new_cluster: '独立项目链路' }[selected.clusterMethod] || '待确认'}{selected.clusterConfidence !== null ? ` · 置信度 ${Math.round(selected.clusterConfidence * 100)}%` : ''}</p></div>{(selected.projectTimeline?.length || 0) > 1 && <button type="button" onClick={splitRelation}>拆分当前公告</button>}</div>
                {(selected.projectTimeline || []).map((item) => <article key={item.opportunityId} className={item.isCurrent ? 'is-current' : ''}>
                  <i /><div><div className="opportunity-timeline-head"><span>{item.noticeType}</span><time>{item.publishDate ? new Date(item.publishDate).toLocaleString() : '时间待确认'}</time></div><strong>{item.title}</strong><p>{item.sourceName} · {money(item.awardAmount ?? item.budget)}</p>{item.awardSupplier && <em className="is-result">中标供应商：{item.awardSupplier}</em>}{item.terminationReason && <em className="is-terminated">终止原因：{item.terminationReason}</em>}{item.changeSummary && <em>{item.changeSummary}</em>}{!item.isCurrent && <button type="button" onClick={() => selectOpportunity(item.opportunityId)}>查看此阶段</button>}</div>
                </article>)}
                {!!selected.relationCandidates?.length && <div className="opportunity-relation-candidates"><h4>可能属于同一项目</h4>{selected.relationCandidates.map((candidate) => <article key={candidate.clusterId}><div><strong>{candidate.title}</strong><span>{candidate.buyer || '采购人待确认'} · 已有 {candidate.noticeCount} 条公告</span><small>{candidate.reason} · 置信度 {Math.round(candidate.confidence * 100)}%</small></div><button type="button" onClick={() => mergeRelation(candidate.clusterId)}>合并链路</button></article>)}</div>}
              </div>}
              {detailTab === 'content' && <div className="opportunity-content-view">{selected.content ? <MarkdownRenderer allowRawHtml={false}>{selected.content}</MarkdownRenderer> : <div className="opportunity-empty"><strong>暂无公告正文</strong><span>编辑机会后粘贴公告内容，或重新导入公告文件。</span></div>}{selected.sourceUrl && <button type="button" className="secondary-action" onClick={() => window.yibiao?.openExternal(selected.sourceUrl)}>打开公告原文</button>}</div>}
              {detailTab === 'events' && <div className="opportunity-event-list">{selected.events?.map((event) => <article key={event.eventId}><i /><div><strong>{event.title}</strong><span>{new Date(event.createdAt).toLocaleString()}</span>{event.detail && <p>{event.detail}</p>}</div></article>)}</div>}
            </div>
          </> : <div className="opportunity-empty detail"><strong>选择一条机会查看决策详情</strong><span>详情区会展示规则匹配、截止风险和售前衔接入口。</span></div>}
        </aside>
      </div>}

      <Dialog.Root open={opportunityOpen} onOpenChange={setOpportunityOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-dialog"><div className="opportunity-dialog-head"><div><Dialog.Title>{draft.opportunityId ? '编辑投标机会' : '录入投标机会'}</Dialog.Title><Dialog.Description>录入公告关键信息；正文中的预算与投标截止时间会辅助自动提取。</Dialog.Description></div><Dialog.Close className="dialog-close">×</Dialog.Close></div>
        <div className="opportunity-form-grid"><label className="is-wide"><span>机会名称 *</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label><span>公告类型</span><select value={draft.noticeType} onChange={(e) => setDraft({ ...draft, noticeType: e.target.value })}>{noticeTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>项目编号</span><input value={draft.projectCode} onChange={(e) => setDraft({ ...draft, projectCode: e.target.value })} /></label><label><span>采购人</span><input value={draft.buyer} onChange={(e) => setDraft({ ...draft, buyer: e.target.value })} /></label><label><span>地区</span><input value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></label><label><span>行业</span><input value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} /></label><label><span>预算（元）</span><input type="number" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} /></label><label><span>发布时间</span><input type="date" value={draft.publishDate} onChange={(e) => setDraft({ ...draft, publishDate: e.target.value })} /></label><label><span>投标截止</span><input type="datetime-local" value={draft.bidDeadline} onChange={(e) => setDraft({ ...draft, bidDeadline: e.target.value })} /></label><label><span>负责人</span><input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></label><label className="is-wide"><span>公告来源 URL</span><input value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} /></label><label className="is-wide"><span>项目摘要</span><textarea rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></label><label className="is-wide"><span>公告正文</span><textarea rows={10} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label><label className="is-wide"><span>跟进备注</span><textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label></div>
        <div className="opportunity-dialog-actions"><Dialog.Close className="secondary-action">取消</Dialog.Close><button type="button" className="primary-action" onClick={saveOpportunity} disabled={saving}>{saving ? '保存中…' : '保存机会'}</button></div>
      </Dialog.Content></Dialog.Portal></Dialog.Root>

      <Dialog.Root open={monitorOpen} onOpenChange={setMonitorOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-dialog monitor-dialog"><div className="opportunity-dialog-head"><div><Dialog.Title>{monitorDraft.monitorId ? '编辑监控方案' : '新建监控方案'}</Dialog.Title><Dialog.Description>监控方案会对本地机会和主动扫描发现的公告执行组合匹配。</Dialog.Description></div><Dialog.Close className="dialog-close">×</Dialog.Close></div>
        <div className="opportunity-form-grid"><label className="is-wide"><span>方案名称 *</span><input value={monitorDraft.name} onChange={(e) => setMonitorDraft({ ...monitorDraft, name: e.target.value })} placeholder="例如：华东智慧城市项目" /></label><label><span>目标地区</span><input value={monitorDraft.regions} onChange={(e) => setMonitorDraft({ ...monitorDraft, regions: e.target.value })} placeholder="上海，江苏，浙江" /></label><label><span>行业</span><input value={monitorDraft.industry} onChange={(e) => setMonitorDraft({ ...monitorDraft, industry: e.target.value })} /></label><label className="is-wide"><span>重点采购人</span><input value={monitorDraft.buyerKeywords} onChange={(e) => setMonitorDraft({ ...monitorDraft, buyerKeywords: e.target.value })} placeholder="支持多个采购人关键词，用逗号分隔" /></label><fieldset className="is-wide opportunity-notice-type-picker"><legend>公告类型</legend>{noticeTypes.filter((item) => item !== '其他').map((item) => <label key={item}><input type="checkbox" checked={monitorDraft.noticeTypes.includes(item)} onChange={(event) => setMonitorDraft({ ...monitorDraft, noticeTypes: event.target.checked ? [...monitorDraft.noticeTypes, item] : monitorDraft.noticeTypes.filter((value) => value !== item) })} /><span>{item}</span></label>)}</fieldset><label className="is-wide"><span>必须包含关键词</span><input value={monitorDraft.requiredKeywords} onChange={(e) => setMonitorDraft({ ...monitorDraft, requiredKeywords: e.target.value })} /></label><label className="is-wide"><span>任一包含关键词</span><input value={monitorDraft.optionalKeywords} onChange={(e) => setMonitorDraft({ ...monitorDraft, optionalKeywords: e.target.value })} /></label><label className="is-wide"><span>排除关键词</span><input value={monitorDraft.excludedKeywords} onChange={(e) => setMonitorDraft({ ...monitorDraft, excludedKeywords: e.target.value })} /></label><label><span>最低预算（元）</span><input type="number" value={monitorDraft.budgetMin} onChange={(e) => setMonitorDraft({ ...monitorDraft, budgetMin: e.target.value })} /></label><label><span>最高预算（元）</span><input type="number" value={monitorDraft.budgetMax} onChange={(e) => setMonitorDraft({ ...monitorDraft, budgetMax: e.target.value })} /></label></div>
        <div className="opportunity-rule-preview"><strong>规则预览</strong><p>{monitorRuleText}</p></div><div className="opportunity-dialog-actions">{monitorDraft.monitorId && <button type="button" className="danger-ghost-action" onClick={() => setConfirmAction('delete-monitor')} disabled={saving}>删除方案</button>}<Dialog.Close className="secondary-action">取消</Dialog.Close><button type="button" className="primary-action" onClick={saveMonitor} disabled={saving}>{saving ? '保存中…' : '保存监控'}</button></div>
      </Dialog.Content></Dialog.Portal></Dialog.Root>

      <Dialog.Root open={profileOpen} onOpenChange={setProfileOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-dialog"><div className="opportunity-dialog-head"><div><Dialog.Title>企业能力画像</Dialog.Title><Dialog.Description>用于资格与能力匹配，资料仅保存在本地工作区。多个条目请换行填写。</Dialog.Description></div><Dialog.Close className="dialog-close">×</Dialog.Close></div>
        <div className="opportunity-form-grid"><label className="is-wide"><span>企业名称</span><input value={profileDraft.companyName} onChange={(e) => setProfileDraft({ ...profileDraft, companyName: e.target.value })} /></label><label><span>重点行业</span><textarea rows={4} value={profileDraft.industries.join('\n')} onChange={(e) => setProfileDraft({ ...profileDraft, industries: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><label><span>服务区域</span><textarea rows={4} value={profileDraft.serviceRegions.join('\n')} onChange={(e) => setProfileDraft({ ...profileDraft, serviceRegions: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><label><span>核心能力</span><textarea rows={6} value={profileDraft.capabilities.join('\n')} onChange={(e) => setProfileDraft({ ...profileDraft, capabilities: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><label><span>企业资质</span><textarea rows={6} value={profileDraft.qualifications.join('\n')} onChange={(e) => setProfileDraft({ ...profileDraft, qualifications: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><label><span>人员与证书</span><textarea rows={6} value={profileDraft.personnel.join('\n')} onChange={(e) => setProfileDraft({ ...profileDraft, personnel: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><label><span>类似业绩</span><textarea rows={6} value={profileDraft.performances.join('\n')} onChange={(e) => setProfileDraft({ ...profileDraft, performances: e.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><label className="is-wide"><span>竞争优势</span><textarea rows={3} value={profileDraft.advantages} onChange={(e) => setProfileDraft({ ...profileDraft, advantages: e.target.value })} /></label><label className="is-wide"><span>已知限制</span><textarea rows={3} value={profileDraft.limitations} onChange={(e) => setProfileDraft({ ...profileDraft, limitations: e.target.value })} /></label></div>
        <div className="opportunity-dialog-actions"><Dialog.Close className="secondary-action">取消</Dialog.Close><button type="button" className="primary-action" onClick={saveProfile} disabled={saving}>{saving ? '保存中…' : '保存画像'}</button></div>
      </Dialog.Content></Dialog.Portal></Dialog.Root>

      <OpportunityOperationsDialog open={operationsOpen} metrics={snapshot.operatingMetrics} workflowLabels={workflowLabels} formatMoney={money} onOpenChange={setOperationsOpen} onShowReminder={showDesktopReminder} onSelectOpportunity={(opportunityId) => { setOperationsOpen(false); void selectOpportunity(opportunityId); }} />

      <Dialog.Root open={maintenanceOpen} onOpenChange={setMaintenanceOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-dialog maintenance-dialog"><div className="opportunity-dialog-head"><div><Dialog.Title>运行健康与本地备份</Dialog.Title><Dialog.Description>检查数据源与中断任务，并为投标机会数据创建可验证的本地快照。</Dialog.Description></div><Dialog.Close className="dialog-close">×</Dialog.Close></div>
        <div className="opportunity-maintenance-grid"><section><h4>运行诊断</h4><dl><div><dt>异常数据源</dt><dd className={snapshot.diagnostics.errorSources ? 'is-danger' : ''}>{snapshot.diagnostics.errorSources}</dd></div><div><dt>警告数据源</dt><dd>{snapshot.diagnostics.warningSources}</dd></div><div><dt>尚未测试</dt><dd>{snapshot.diagnostics.untestedSources}</dd></div><div><dt>公告解析失败</dt><dd>{snapshot.diagnostics.failedNotices}</dd></div><div><dt>中断的扫描/分析</dt><dd className={snapshot.diagnostics.interruptedScans + snapshot.diagnostics.interruptedAnalyses ? 'is-danger' : ''}>{snapshot.diagnostics.interruptedScans + snapshot.diagnostics.interruptedAnalyses}</dd></div></dl><div className="opportunity-diagnostic-actions"><button type="button" onClick={() => { setMaintenanceOpen(false); setSourcesOpen(true); }}>查看全部数据源</button></div><p>中断任务会自动标记为失败，并保留重新执行入口，不会静默变为空闲状态。</p></section>
        <section><h4>工作区备份</h4><div className={`opportunity-backup-state ${snapshot.backup.verified ? 'is-verified' : ''}`}><strong>{snapshot.backup.message}</strong><span>{snapshot.backup.createdAt ? `创建于 ${new Date(snapshot.backup.createdAt).toLocaleString()}` : '备份包含 SQLite 数据库与投标机会公告正文，最多保留最近 5 份。'}</span></div><div className="opportunity-maintenance-actions"><button type="button" className="primary-action" disabled={saving || snapshot.scanBatch.status === 'running'} onClick={createWorkspaceBackup}>{saving ? '处理中…' : '创建备份'}</button><button type="button" className="secondary-action" disabled={saving || !snapshot.backup.latestId} onClick={verifyLatestBackup}>验证最近备份</button></div><p>恢复操作未放在运行中的客户端内执行，避免覆盖正在使用的数据库；验证通过的备份可用于人工灾难恢复。</p></section></div>
        <section className="opportunity-diagnostic-issues"><div className="opportunity-diagnostic-issues-head"><div><h4>具体问题</h4><p>按严重程度和发生时间排序</p></div><strong>{snapshot.diagnostics.issues.length} 项</strong></div>{snapshot.diagnostics.issues.length ? <div>{snapshot.diagnostics.issues.map((issue) => <article key={issue.issueId} className={`is-${issue.severity}`}><span className="opportunity-diagnostic-severity">{issue.severity === 'error' ? '异常' : '警告'}</span><div><strong>{issue.objectName}</strong><b>{issue.title}</b><p>{issue.detail}</p><small>{issue.occurredAt ? new Date(issue.occurredAt).toLocaleString() : '发生时间待确认'}{issue.affectedCount > 0 ? `　影响记录 ${issue.affectedCount} 条` : ''}</small></div><button type="button" disabled={issue.kind === 'source' && snapshot.scans[issue.sourceId]?.status === 'running'} onClick={() => handleDiagnosticIssue(issue)}>{issue.kind === 'source' ? snapshot.scans[issue.sourceId]?.status === 'running' ? '扫描中' : '重新扫描' : '查看机会'}</button></article>)}</div> : <div className="opportunity-diagnostic-empty"><strong>当前没有需要处理的异常</strong><span>数据源扫描和机会分析运行正常。</span></div>}</section>
      </Dialog.Content></Dialog.Portal></Dialog.Root>

      <OpportunityConfirmDialog open={confirmAction === 'bulk'} title="确认批量更新" description={`将更新 ${selectedIds.length} 条机会${batchStatus ? `，状态改为“${statusLabels[batchStatus as OpportunityStatus]}”` : ''}${batchOwner.trim() ? `，负责人设为“${batchOwner.trim()}”` : ''}。每条机会都会保留操作记录。`} confirmLabel="确认更新" busy={saving} onOpenChange={(open) => !open && setConfirmAction(null)} onConfirm={runBulkUpdate} />
      <OpportunityConfirmDialog open={confirmAction === 'delete-monitor'} title="删除监控方案" description={`确定删除“${monitorDraft.name}”吗？对应的机会命中关系会同步清理并按剩余方案重新匹配。`} confirmLabel="确认删除" danger busy={saving} onOpenChange={(open) => !open && setConfirmAction(null)} onConfirm={deleteCurrentMonitor} />

      <Dialog.Root open={sourcesOpen} onOpenChange={setSourcesOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="opportunity-dialog source-dialog"><div className="opportunity-dialog-head"><div><Dialog.Title>公告数据源</Dialog.Title><Dialog.Description>扫描只在用户主动触发时执行。不会绕过登录、验证码或访问限制，也不会在失败时填充演示数据。</Dialog.Description></div><Dialog.Close className="dialog-close">×</Dialog.Close></div>
        <div className="opportunity-source-list">{snapshot.sources.map((source) => { const scan = snapshot.scans[source.sourceId]; return <article key={source.sourceId}>
          <div className="opportunity-source-card-head"><div><i className={`is-${source.healthStatus}`} /><div><strong>{source.name}</strong><a href={source.baseUrl} onClick={(event) => { event.preventDefault(); void window.yibiao?.openExternal(source.baseUrl); }}>{source.baseUrl}</a></div></div><label><input type="checkbox" checked={source.enabled} onChange={(event) => updateSource(source.sourceId, event.target.checked, Number(source.config.maxItems || 20))} />启用</label></div>
          <div className="opportunity-source-config"><label><span>单次处理上限</span><select value={source.config.maxItems || 20} onChange={(event) => updateSource(source.sourceId, source.enabled, Number(event.target.value))}><option value="10">10 条</option><option value="20">20 条</option><option value="30">30 条</option><option value="50">50 条</option></select></label><div><span>最近成功</span><strong>{source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString() : '尚未成功扫描'}</strong></div></div>
          {scan?.status === 'running' && <div className="opportunity-analysis-progress source-progress"><span style={{ width: `${scan.progress}%` }} /><p>{scan.message} · {scan.progress}%</p></div>}
          {scan && scan.status !== 'running' && <div className="opportunity-scan-summary"><span>发现 {scan.fetchedCount}</span><span>新增 {scan.createdCount}</span><span>更新 {scan.updatedCount}</span><span>已见 {scan.skippedCount}</span><span>命中监控 {scan.matchedCount}</span></div>}
          {(scan?.errors?.length || source.lastError) && <details className="opportunity-source-errors"><summary>查看失败诊断</summary><ul>{(scan?.errors?.length ? scan.errors : source.lastError.split('\n')).slice(0, 10).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></details>}
          <div className="opportunity-source-actions"><p>{source.adapterType === 'ccgp-procurement-intention' ? '读取最近 7 天采购意向，并按公告内的具体采购项目拆分为机会。' : source.adapterType.includes('correction') ? '读取更正事项、新截止时间，并回接原采购项目。' : source.adapterType.includes('award') || source.adapterType.includes('deal') ? '读取中标供应商与成交金额，并回接原采购项目。' : source.adapterType.includes('termination') ? '读取废标或终止原因，并回接原采购项目。' : `读取${source.adapterType.includes('local') ? '地方' : '中央'}公开招标公告及关键字段。`}</p><button type="button" className="primary-action" disabled={!source.enabled || scan?.status === 'running'} onClick={() => startSourceScan(source.sourceId)}>{scan?.status === 'running' ? '扫描中…' : '立即扫描'}</button></div>
        </article>; })}</div>
      </Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}

export default BidOpportunityPage;
