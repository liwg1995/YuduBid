import BusinessTaskProgress from '../../../shared/ui/BusinessTaskProgress';
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BidExportTemplateRecord, BidWordExportMode, OutlineItem, WordExportProgressEvent } from '../../../shared/types';
import { AppDialog, FloatingToolbar, ToolbarArrowLeftIcon, ToolbarArrowRightIcon, ToolbarDocumentIcon, useAppDialog } from '../../../shared/ui';
import DockedActionBar from '../../../shared/ui/DockedActionBar';
import { useToast } from '../../../shared/ui/ToastProvider';
import {
  FEASIBILITY_STEPS,
  type FeasibilityProjectList,
  type FeasibilityProjectRecord,
  type FeasibilityReportState,
  type FeasibilityReportStep,
} from '../types';
import ProjectMaterialsPanel from '../components/ProjectMaterialsPanel';
import SourceFilesPanel from '../components/SourceFilesPanel';
import AnalysisPanel from '../components/AnalysisPanel';
import OutlinePanel from '../components/OutlinePanel';
import ParametersPanel from '../components/ParametersPanel';
import ContentPanel from '../components/ContentPanel';
import BidWordExportDialog from '../../export-format/components/BidWordExportDialog';
import { isTaskRunning } from '../components/TaskProgressCard';
import '../feasibilityReport.css';
import './modernFeasibilityReport.css';
import './feasibilityDesign.css';
import FeasibilityProjectTable from '../components/FeasibilityProjectTable';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import { registerNavigationBlocker } from '../../../shared/navigationBlocker';

const emptyProjectList: FeasibilityProjectList = { projects: [] };

interface ExportProgressState {
  open: boolean;
  running: boolean;
  progress: number;
  message: string;
  warnings: string[];
  mermaidCount: number;
  filePath?: string;
  error?: string;
}

const initialExportProgress: ExportProgressState = {
  open: false,
  running: false,
  progress: 0,
  message: '',
  warnings: [],
  mermaidCount: 0,
};

function collectLeafItems(items: OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => item.children?.length ? collectLeafItems(item.children) : [item]);
}

function countMermaidDiagrams(items: OutlineItem[]) {
  return collectLeafItems(items).reduce((total, item) => total + (String(item.content || '').match(/```mermaid[\s\S]*?```/gi) || []).length, 0);
}

const stageCopy: Record<FeasibilityReportStep, { title: string; description: string }> = {
  materials: { title: '建立项目编制边界', description: '填写项目类型、建设单位、建设地点、建设内容、周期、投资额和资金来源。' },
  sources: { title: '汇集项目支撑资料', description: '批量导入项目建议书、批复、规划、测算和其他支撑文件，并预览解析后的 Markdown。' },
  analysis: { title: '形成资料分析底稿', description: '区分材料事实、合理推导和待确认信息，为目录与正文生成提供可靠依据。' },
  outline: { title: '组织可研报告目录', description: '选择适用大纲和目标字数，生成最多三级目录，并支持手动编辑和 AI 调整。' },
  parameters: { title: '统一全文关键口径', description: '集中校对投资、周期、建设规模、资金来源和效益指标，避免章节之间相互矛盾。' },
  content: { title: '生成并审校报告正文', description: '按目录叶子小节生成正文，支持暂停恢复、缺失补写、手动编辑、自然化审校和 Word 导出。' },
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function getFeasibilityBridge() {
  const bridge = window.yibiao?.feasibilityReport;
  if (!bridge) throw new Error('可研报告本地服务尚未就绪，请重启客户端后重试');
  return bridge;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getStepLabel(step?: FeasibilityReportStep) {
  return FEASIBILITY_STEPS.find((item) => item.id === step)?.label || FEASIBILITY_STEPS[0].label;
}

function FeasibilityWorkbench({ project, onBack }: { project: FeasibilityProjectRecord; onBack: () => void }) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [reportState, setReportState] = useState<FeasibilityReportState | null>(null);
  const [activeStep, setActiveStep] = useState<FeasibilityReportStep>('materials');
  const [loading, setLoading] = useState(true);
  const [savingStep, setSavingStep] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState>(initialExportProgress);
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);
  const [includePreparationNotes, setIncludePreparationNotes] = useState(true);
  const [includeAppendixTables, setIncludeAppendixTables] = useState(true);
  const [materialsDirty, setMaterialsDirty] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [parametersDirty, setParametersDirty] = useState(false);
  const [contentDirty, setContentDirty] = useState(false);
  const exportRequestRef = useRef(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const unsavedChanges = materialsDirty || analysisDirty || outlineDirty || parametersDirty || contentDirty;
  const pendingPanelOperation = materialsSaving || panelBusy || exportProgress.running;
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [actionError, setActionError] = useState('');
  const [resetting, setResetting] = useState(false);
  const stepRequestRef = useRef(false);
  const titleRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => { titleRef.current?.focus(); }, []);

  const confirmUnsavedChanges = useCallback(() => confirm({
    title: contentDirty ? '本节正文尚未保存' : parametersDirty ? '关键参数尚未保存' : outlineDirty ? '目录修改尚未保存' : analysisDirty ? '分析底稿尚未保存' : '项目资料尚未保存',
    description: contentDirty ? '继续后，本节正文的未保存修改会丢失。' : parametersDirty ? '继续后，这次关键参数的修改会丢失。' : outlineDirty ? '继续后，目录草稿、调整要求或未保存配置会丢失。' : analysisDirty ? '继续后，这次分析底稿的修改会丢失。' : '继续后，这次填写的项目资料修改会丢失。',
    confirmLabel: '放弃修改并继续',
  }), [confirm, analysisDirty, outlineDirty, parametersDirty, contentDirty]);

  useEffect(() => {
    if (!unsavedChanges && !pendingPanelOperation) return undefined;
    return registerNavigationBlocker(destination => {
      if (pendingPanelOperation) { showToast('工作区操作尚未完成，请稍候再离开', 'info'); return Promise.resolve(false); }
      return destination === 'feasibility-report' ? Promise.resolve(true) : confirmUnsavedChanges();
    });
  }, [unsavedChanges, pendingPanelOperation, confirmUnsavedChanges, showToast]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    setLoading(true); setLoadError('');
    void (async () => {
      try {
        const bridge = getFeasibilityBridge();
        const state = await bridge.loadState({ projectId: project.id });
        if (disposed) return;
        setReportState(state); setActiveStep(state.step);
        let version = 0;
        unsubscribe = bridge.onTaskEvent(event => {
          if (!disposed && (event.task.project_id === project.id || event.feasibilityReport.projectId === project.id)) { version++; setReportState(event.feasibilityReport); }
        });
        const beforeReplay = version;
        try {
          const result = await bridge.getActiveTasks({ projectId: project.id });
          if (!disposed && beforeReplay === version) setReportState(result.state);
        } catch (error) { if (!disposed) setActionError(`恢复后台任务状态失败：${getErrorMessage(error)}`); }
      } catch (error) {
        if (!disposed) { setLoadError(getErrorMessage(error)); showToast(`读取项目失败：${getErrorMessage(error)}`, 'error'); }
      } finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; unsubscribe?.(); };
  }, [project.id, showToast, loadRevision]);

  const changeStep = async (step: FeasibilityReportStep) => {
    if (step === activeStep || workflowBusy || stepRequestRef.current) return;
    if (reportState) {
      if (step === 'outline' && !reportState.analysisMarkdown.trim()) { showToast('请先完成资料分析', 'info'); return; }
      if (step === 'parameters' && !reportState.outlineData) { showToast('请先生成报告目录', 'info'); return; }
      if (step === 'content' && !reportState.keyParametersMarkdown.trim()) { showToast('请先生成并确认关键参数', 'info'); return; }
    }
    if (unsavedChanges && !await confirmUnsavedChanges()) return;
    const previousStep = activeStep;
    stepRequestRef.current = true; setActionError('');
    setSavingStep(true);
    try {
      const state = await getFeasibilityBridge().updateStep({ projectId: project.id, step });
      setReportState(state); setActiveStep(state.step);
    } catch (error) {
      setActiveStep(previousStep);
      setActionError(getErrorMessage(error));
      showToast(`保存当前步骤失败：${getErrorMessage(error)}`, 'error');
    } finally {
      stepRequestRef.current = false; setSavingStep(false);
    }
  };

  const activeDefinition = FEASIBILITY_STEPS.find((step) => step.id === activeStep) || FEASIBILITY_STEPS[0];
  const copy = stageCopy[activeStep];
  const activeIndex = FEASIBILITY_STEPS.findIndex((step) => step.id === activeStep);
  const previousDefinition = FEASIBILITY_STEPS[activeIndex - 1];
  const nextDefinition = FEASIBILITY_STEPS[activeIndex + 1];
  const workflowBusy = loading || Boolean(loadError) || savingStep || pendingPanelOperation || resetting || !reportState;
  const backgroundTaskRunning = Boolean(reportState && [reportState.analysisTask, reportState.outlineTask, reportState.outlineAdjustmentTask, reportState.parametersTask, reportState.contentTask, reportState.humanWritingTask].some(isTaskRunning));
  const contentLeaves = useMemo(() => collectLeafItems(reportState?.outlineData?.outline || []), [reportState?.outlineData]);
  const completedContentCount = useMemo(() => contentLeaves.filter((item) => String(item.content || '').trim()).length, [contentLeaves]);
  const isNextDisabled = workflowBusy
    || !nextDefinition
    || (activeStep === 'analysis' && !reportState?.analysisMarkdown.trim())
    || (activeStep === 'outline' && !reportState?.outlineData)
    || (activeStep === 'parameters' && !reportState?.keyParametersMarkdown.trim());
  const nextTooltip = loading
    ? '正在读取项目工作区'
    : savingStep
      ? '正在保存当前步骤'
      : activeStep === 'analysis' && !reportState?.analysisMarkdown.trim()
        ? '完成资料分析后才能进入报告目录'
        : activeStep === 'outline' && !reportState?.outlineData
          ? '生成报告目录后才能进入关键参数'
          : activeStep === 'parameters' && !reportState?.keyParametersMarkdown.trim()
            ? '生成并确认关键参数后才能进入正文生成'
            : !nextDefinition
              ? '当前已经是最后一步'
              : `进入${nextDefinition.label}`;
  const resetReport = async () => {
    if (workflowBusy) return;
    if (backgroundTaskRunning) {
      showToast('当前有后台生成任务正在运行，请等待任务完成或暂停正文生成后再重置', 'info');
      return;
    }
    const confirmed = await confirm({
      title: '重置可行性研究报告',
      description: '这会清空当前项目的基础资料、导入文件、分析底稿、报告目录、关键参数、正文和生成进度。项目本身仍会保留，此操作无法撤销。',
      confirmLabel: '确认重置',
      danger: true,
    });
    if (!confirmed) return;
    setResetting(true); setActionError('');
    try {
      const result = await getFeasibilityBridge().clear({ projectId: project.id });
      setReportState(result.state);
      setActiveStep('materials');
      showToast(result.message || '可研报告已重置', 'success');
    } catch (error) { setActionError(getErrorMessage(error)); showToast(`重置可研报告失败：${getErrorMessage(error)}`, 'error'); }
    finally { setResetting(false); }
  };

  const exportWord = async (mode: Exclude<BidWordExportMode, 'original-template'> = 'word-optimization', template?: BidExportTemplateRecord) => {
    if (exportRequestRef.current || pendingPanelOperation || backgroundTaskRunning) return;
    if (contentDirty) { showToast('请先保存或撤销正文修改后再导出', 'info'); return; }
    if (!reportState?.outlineData?.outline.length || !completedContentCount) {
      showToast('当前没有可导出的正文', 'info');
      return;
    }
    if (completedContentCount < contentLeaves.length && !await confirm({
      title: '导出未完成报告',
      description: `当前仍有 ${contentLeaves.length - completedContentCount} 个小节没有正文，Word 中将仅包含已完成内容。`,
      confirmLabel: '继续导出',
    })) return;

    exportRequestRef.current = true;
    const requestId = `feasibility-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const mermaidCount = countMermaidDiagrams(reportState.outlineData.outline);
    let unsubscribe: (() => void) | undefined;
    try {
      setExportProgress({
        open: true,
        running: true,
        progress: 0,
        message: mermaidCount
          ? `检测到 ${mermaidCount} 张 Mermaid 图，导出时会转换为 Word 图片，可能需要稍等。`
          : '正在准备导出可行性研究报告 Word。',
        warnings: [],
        mermaidCount,
      });
      unsubscribe = window.yibiao?.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportProgress((current) => ({
          ...current,
          open: true,
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          warnings: event.warnings || current.warnings,
          error: event.phase === 'error' ? event.message : undefined,
        }));
      });
      const result = await window.yibiao?.export.exportWord({
        requestId,
        documentScope: 'bid',
        exportMode: mode,
        exportFormat: template?.config,
        templateId: template?.templateId,
        documentProfile: 'feasibility-report',
        document_title: '可行性研究报告',
        project_name: reportState.projectInfo.projectName || reportState.projectName,
        construction_unit: reportState.projectInfo.constructionUnit,
        feasibility_options: {
          includePreparationNotes,
          includeAppendixTables,
          project_info: reportState.projectInfo,
        },
        outline: reportState.outlineData.outline,
      });
      if (!result) throw new Error('Word 导出服务尚未就绪，请重启客户端后重试');
      if (result.canceled) {
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }
      if (!result.success) throw new Error(result.message || 'Word 导出未能完成');
      setExportProgress((current) => ({
        ...current,
        open: true,
        running: false,
        progress: 100,
        message: result.message || '可行性研究报告 Word 已导出，请打开文档核对图片、表格和版式。',
        warnings: result.warnings || current.warnings,
        filePath: result.path || result.filePath,
      }));
      showToast(result.message || '可行性研究报告 Word 已导出', result.warnings?.length ? 'info' : 'success');
    } catch (error) {
      const message = getErrorMessage(error);
      setExportProgress((current) => ({ ...current, open: true, running: false, message, error: message }));
      showToast(`导出失败：${message}`, 'error');
    } finally {
      unsubscribe?.(); exportRequestRef.current = false;
    }
  };

  const navigationActions = activeStep === 'content'
    ? [
      {
        id: 'previous-step',
        label: '上一步',
        icon: <ToolbarArrowLeftIcon />,
        disabled: workflowBusy || !previousDefinition,
        tooltip: previousDefinition ? `返回${previousDefinition.label}` : '当前已经是第一步',
        onClick: () => { if (previousDefinition) void changeStep(previousDefinition.id); },
      },
      {
        id: 'export-word',
        label: exportProgress.running ? '导出中...' : '导出 Word',
        icon: <ToolbarDocumentIcon />,
        variant: 'primary' as const,
        disabled: workflowBusy || contentDirty || backgroundTaskRunning || exportProgress.running || !completedContentCount,
        tooltip: backgroundTaskRunning
          ? '正文生成或审校任务运行期间不能导出'
          : exportProgress.running
            ? 'Word 正在导出，请稍候'
            : completedContentCount
              ? '导出当前可行性研究报告正文'
              : '请先生成正文再导出',
        onClick: () => setExportChoiceOpen(true),
      },
    ]
    : [
      {
        id: 'previous-step',
        label: '上一步',
        icon: <ToolbarArrowLeftIcon />,
        disabled: workflowBusy || !previousDefinition,
        tooltip: previousDefinition ? `返回${previousDefinition.label}` : '当前已经是第一步',
        onClick: () => { if (previousDefinition) void changeStep(previousDefinition.id); },
      },
      {
        id: 'next-step',
        label: '下一步',
        icon: <ToolbarArrowRightIcon />,
        variant: 'primary' as const,
        disabled: isNextDisabled,
        tooltip: nextTooltip,
        onClick: () => { if (nextDefinition) void changeStep(nextDefinition.id); },
      },
    ];
  const toolbarGroups = [{
    id: 'feasibility-report-reset',
    actions: [
      {
        id: 'reset',
        label: '重置',
        variant: 'danger' as const,
        disabled: workflowBusy || backgroundTaskRunning,
        tooltip: backgroundTaskRunning ? '后台任务运行期间不能重置' : '清空当前项目的可研报告内容',
        onClick: () => void resetReport(),
      },
      {
        id: 'home',
        label: '首页',
        variant: activeStep === 'materials' ? 'primary' as const : 'secondary' as const,
        disabled: workflowBusy,
        tooltip: '回到项目资料步骤',
        onClick: () => void changeStep('materials'),
      },
    ],
  }, {
    id: 'feasibility-report-navigation',
    actions: navigationActions,
  }];

  return (
    <div className={getStoredUiAppearance() === 'modern' ? 'modern-feasibility-workbench' : 'page-stack technical-workbench feasibility-workbench'}>
      <section className={getStoredUiAppearance() === 'modern' ? 'modern-feasibility-context' : 'technical-project-context feasibility-project-context'}>
        <div>
          <span className="section-kicker">当前项目</span>
          <strong ref={titleRef} tabIndex={-1}>{reportState?.projectName || project.name}</strong>
        </div>
        <button type="button" className="secondary-action" disabled={savingStep || pendingPanelOperation || resetting} onClick={() => { void (async () => { if (unsavedChanges && !await confirmUnsavedChanges()) return; onBack(); })(); }}>返回项目列表</button>
      </section>

      {getStoredUiAppearance() === 'modern' && <aside className="modern-feasibility-steps"><div><strong>编制流程</strong><small>{activeIndex + 1} / {FEASIBILITY_STEPS.length}</small></div><nav aria-label="可研报告步骤">{FEASIBILITY_STEPS.map((step, index) => <button key={step.id} type="button" className={activeStep === step.id ? 'is-active' : ''} aria-current={activeStep === step.id ? 'step' : undefined} onClick={() => void changeStep(step.id)} disabled={workflowBusy}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.label}</strong></button>)}</nav><p>{loading ? '读取中' : loadError ? '读取失败' : savingStep ? '保存中' : actionError ? '操作未完成' : '当前步骤已读取'}</p></aside>}

      <main className={getStoredUiAppearance() === 'modern' ? 'modern-feasibility-stage' : 'plan-step-body feasibility-step-page'}>
        <header className="content-generation-command-bar feasibility-step-command-bar">
          <div>
            <span className="section-kicker">STEP {String(activeIndex + 1).padStart(2, '0')} · {activeDefinition.label}</span>
            <strong>{copy.title}</strong>
            <p>{copy.description}</p>
          </div>
          <div className="feasibility-step-summary" aria-live="polite">
            <span>当前步骤</span>
            <strong>{activeIndex + 1} / {FEASIBILITY_STEPS.length}</strong>
            <small>{loading ? '读取中' : loadError ? '读取失败' : savingStep ? '保存中' : actionError ? '操作未完成' : '当前步骤已读取'}</small>
          </div>
        </header>

        <div className="feasibility-step-content">
          {actionError && <div className="feasibility-operation-error" role="alert"><strong>操作未完成</strong><span>{actionError}</span></div>}
          {loadError ? <div className="feasibility-workspace-load-error" role="alert"><strong>项目工作区读取失败</strong><p>{loadError}</p><button type="button" className="secondary-action" onClick={() => setLoadRevision(value => value + 1)}>重新读取工作区</button></div> : loading ? <div role="status">正在读取项目工作区…</div> : reportState && activeStep === 'materials' ? (
            <ProjectMaterialsPanel projectId={project.id} state={reportState} disabled={savingStep || resetting || backgroundTaskRunning} onStateChange={setReportState} onDirtyChange={setMaterialsDirty} onSavingChange={setMaterialsSaving} />
          ) : reportState && activeStep === 'sources' ? (
            <SourceFilesPanel projectId={project.id} state={reportState} disabled={savingStep || resetting || backgroundTaskRunning} onBusyChange={setPanelBusy} onStateChange={setReportState} />
          ) : reportState && activeStep === 'analysis' ? (
            <AnalysisPanel projectId={project.id} state={reportState} disabled={savingStep || resetting || backgroundTaskRunning} onDirtyChange={setAnalysisDirty} onBusyChange={setPanelBusy} onStateChange={setReportState} />
          ) : reportState && activeStep === 'outline' ? (
            <OutlinePanel projectId={project.id} state={reportState} disabled={savingStep || resetting || backgroundTaskRunning} onDirtyChange={setOutlineDirty} onBusyChange={setPanelBusy} onStateChange={setReportState} />
          ) : reportState && activeStep === 'parameters' ? (
            <ParametersPanel projectId={project.id} state={reportState} disabled={savingStep || resetting || backgroundTaskRunning} onDirtyChange={setParametersDirty} onBusyChange={setPanelBusy} onStateChange={setReportState} />
          ) : reportState && activeStep === 'content' ? (
            <ContentPanel projectId={project.id} state={reportState} disabled={savingStep || resetting || exportProgress.running || Boolean(reportState && [reportState.analysisTask, reportState.outlineTask, reportState.outlineAdjustmentTask, reportState.parametersTask].some(isTaskRunning))} onDirtyChange={setContentDirty} onBusyChange={setPanelBusy} onStateChange={setReportState} />
          ) : (
            <section className="feasibility-step-loading">
              <strong>正在读取{activeDefinition.label}</strong>
              <p>正在从本地项目工作区恢复可研报告编制状态。</p>
            </section>
          )}
        </div>
        {getStoredUiAppearance() === 'modern' && (
          <DockedActionBar label="可研报告步骤操作" leading={toolbarGroups[0].actions} trailing={toolbarGroups[1].actions} status={loadError ? '工作区读取失败' : loading ? '读取工作区中' : materialsSaving ? '项目资料保存中' : materialsDirty ? '项目资料未保存' : panelBusy ? '工作区处理中' : analysisDirty ? '分析底稿未保存' : outlineDirty ? '目录修改未保存' : parametersDirty ? '关键参数未保存' : contentDirty ? '本节正文未保存' : savingStep ? '保存步骤中' : actionError ? '操作未完成' : '项目已读取'} />
        )}
      </main>
      <BidWordExportDialog
        open={exportChoiceOpen}
        onOpenChange={setExportChoiceOpen}
        disabled={exportProgress.running}
        onConfirm={exportWord}
        title="导出可行性研究报告"
        kicker="可研报告 Word 导出"
        description="选择正文排版，并决定是否加入编制信息页和项目基本情况附表。"
        extraOptions={<div className="bid-export-choice-list" aria-label="可研报告附加内容">
          <label className="bid-export-choice"><input type="checkbox" checked={includePreparationNotes} onChange={(event) => setIncludePreparationNotes(event.target.checked)} /><span><strong>编制信息页</strong><small>列出项目名称、建设单位及待填写的编制人员信息。</small></span></label>
          <label className="bid-export-choice"><input type="checkbox" checked={includeAppendixTables} onChange={(event) => setIncludeAppendixTables(event.target.checked)} /><span><strong>项目基本情况附表</strong><small>汇总当前项目资料中的规模、周期、投资和资金来源。</small></span></label>
        </div>}
      />
      <Dialog.Root
        open={exportProgress.open}
        onOpenChange={(open) => {
          if (!open && !exportProgress.running) setExportProgress(initialExportProgress);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="export-progress-card">
            <div className="content-regenerate-card-head">
              <span className="section-kicker">Word 导出</span>
              <Dialog.Title>{exportProgress.running ? '正在导出 Word' : exportProgress.error ? '导出失败' : '导出完成'}</Dialog.Title>
              <Dialog.Description>
                {exportProgress.error ? '导出未完成，请根据下方提示处理后重试。' : !exportProgress.running ? '已生成 Word 文件，可查看保存位置。' : exportProgress.mermaidCount > 0
                  ? `本次包含 ${exportProgress.mermaidCount} 张 Mermaid 图，导出时会在本地转换成 Word 图片，无需联网，图较多时可能需要稍等。`
                  : '正在将可研正文、表格和图片写入 Word 文档。'}
              </Dialog.Description>
            </div>
            <div className="export-progress-body">
              <BusinessTaskProgress label="Word 导出" percent={exportProgress.progress} status={exportProgress.error ? 'exception' : exportProgress.running ? 'active' : 'success'} />
              <p>{exportProgress.message || '正在处理导出任务，请稍候。'}</p>
              {!exportProgress.running && exportProgress.filePath ? (
                <div className="export-file-path">
                  <span>生成路径</span>
                  <button
                    type="button"
                    title="点击打开文件所在文件夹"
                    onClick={async () => {
                      try {
                        await window.yibiao?.export.showExportFile(exportProgress.filePath!);
                      } catch (error) {
                        showToast(`打开生成路径失败：${getErrorMessage(error)}`, 'error');
                      }
                    }}
                  >
                    {exportProgress.filePath}
                  </button>
                </div>
              ) : null}
              {exportProgress.warnings.length ? (
                <div className="export-warning-list">
                  <strong>需要核对</strong>
                  {exportProgress.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{warning}</small>)}
                </div>
              ) : null}
            </div>
            {!exportProgress.running ? (
              <div className="content-regenerate-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {getStoredUiAppearance() !== 'modern' && <FloatingToolbar groups={toolbarGroups} label="可研报告步骤工具条" />}
    </div>
  );
}

function FeasibilityReportHome() {
  const { showToast } = useToast();
  const [projectList, setProjectList] = useState<FeasibilityProjectList>(emptyProjectList);
  const [activeProject, setActiveProject] = useState<FeasibilityProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>('descend');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FeasibilityProjectRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteProject, setPendingDeleteProject] = useState<FeasibilityProjectRecord | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const scrollPosition = useRef(0);
  const returnProjectId = useRef('');
  const loadSequence = useRef(0);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const restoreDialogFocus = (event: Event) => {
    if (dialogReturnFocusRef.current?.isConnected) { event.preventDefault(); dialogReturnFocusRef.current.focus(); }
    else if (!activeProject) { const search = rootRef.current?.querySelector<HTMLInputElement>('input'); if (search) { event.preventDefault(); search.focus(); } }
  };
  const rememberActionFocus = (project: FeasibilityProjectRecord) => {
    dialogReturnFocusRef.current = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-project-menu-id]') || []).find(button => button.dataset.projectMenuId === project.id) || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };

  const loadProjects = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setLoadError('');
    try { const list = await getFeasibilityBridge().listProjects(); if (sequence === loadSequence.current) setProjectList(list); }
    catch (error) { if (sequence === loadSequence.current) { setLoadError(getErrorMessage(error)); showToast(`读取可研项目失败：${getErrorMessage(error)}`, 'error'); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [showToast]);
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useLayoutEffect(() => {
    if (activeProject || loading || busy || !returnProjectId.current || !rootRef.current) return;
    const source = Array.from(rootRef.current.querySelectorAll<HTMLButtonElement>('[data-project-id]')).find(button => button.dataset.projectId === returnProjectId.current);
    if (source) source.focus({ preventScroll: true });
    else rootRef.current.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    returnProjectId.current = '';
    const classicList = rootRef.current.querySelector<HTMLElement>('.feasibility-project-list');
    if (classicList) classicList.scrollTop = scrollPosition.current;
  }, [activeProject, loading, busy, projectList]);

  const filteredProjects = useMemo(() => projectList.projects.filter(project => project.name.toLocaleLowerCase('zh-CN').includes(searchText.trim().toLocaleLowerCase('zh-CN'))), [projectList.projects, searchText]);
  const beginOperation = () => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setDialogError(''); setActionError(''); return true; };
  const finishOperation = () => { busyRef.current = false; setBusy(false); };
  const openCreate = () => { dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDialogError(''); setCreateDialogOpen(true); };
  const openRename = (project: FeasibilityProjectRecord) => { rememberActionFocus(project); setDialogError(''); setRenameTarget(project); setRenameValue(project.name); };
  const openDelete = (project: FeasibilityProjectRecord) => { rememberActionFocus(project); setDialogError(''); setPendingDeleteProject(project); };

  const createProject = async () => {
    if (busyRef.current) return;
    if (!projectName.trim()) { setDialogError('请填写可研项目名称'); nameRef.current?.focus(); return; }
    if (!beginOperation()) return;
    try {
      const result = await getFeasibilityBridge().createProject({ projectName: projectName.trim() });
      setProjectList(result.projects); setProjectName(''); setCreateDialogOpen(false); setPage(1); setSearchText('');
      returnProjectId.current = result.project.id; setActiveProject(result.project);
      showToast('可研项目已创建', 'success');
    } catch (error) { setDialogError(getErrorMessage(error)); showToast(`创建项目失败：${getErrorMessage(error)}`, 'error'); }
    finally { finishOperation(); }
  };
  const enterProject = async (project: FeasibilityProjectRecord) => {
    if (!beginOperation()) return;
    returnProjectId.current = project.id;
    try { await getFeasibilityBridge().switchProject({ projectId: project.id }); setActiveProject(project); }
    catch (error) { setActionError(getErrorMessage(error)); showToast(`进入项目失败：${getErrorMessage(error)}`, 'error'); }
    finally { finishOperation(); }
  };
  const renameProject = async () => {
    if (!renameTarget || busyRef.current) return;
    if (!renameValue.trim()) { setDialogError('项目名称不能为空'); nameRef.current?.focus(); return; }
    if (!beginOperation()) return;
    try {
      setProjectList(await getFeasibilityBridge().renameProject({ projectId: renameTarget.id, name: renameValue.trim() }));
      setRenameTarget(null); showToast('项目名称已更新', 'success');
    } catch (error) { setDialogError(getErrorMessage(error)); showToast(`重命名失败：${getErrorMessage(error)}`, 'error'); }
    finally { finishOperation(); }
  };
  const deleteProject = async () => {
    if (!pendingDeleteProject || !beginOperation()) return;
    try {
      setProjectList(await getFeasibilityBridge().deleteProject({ projectId: pendingDeleteProject.id }));
      setPendingDeleteProject(null); showToast('可研项目已删除', 'success');
    } catch (error) { setDialogError(getErrorMessage(error)); showToast(`删除项目失败：${getErrorMessage(error)}`, 'error'); }
    finally { finishOperation(); }
  };
  const modern = getStoredUiAppearance() === 'modern';
  const dialogNotice = dialogError ? <div className="feasibility-operation-error" role="alert">{dialogError}</div> : null;
  return <>
    <div ref={rootRef} style={activeProject ? { display: 'none' } : undefined} className={modern ? 'modern-feasibility-projects' : 'page-stack feasibility-report-page feasibility-project-page'}>
      <header className="feasibility-projects-heading yb-project-list-header"><div><h1>可研报告</h1><p>项目资料、分析、目录与正文保存在各自的本地工作区。</p></div><div className="yb-project-list-header-actions"><button type="button" className="secondary-action" disabled={busy || loading} onClick={() => void loadProjects()}>刷新</button><button type="button" className="primary-action" disabled={busy || loading} onClick={openCreate}>新建项目</button></div></header>
      {loadError && <div className="feasibility-operation-error" role="alert"><strong>项目列表读取失败</strong><span>{loadError}</span><button type="button" className="secondary-action" onClick={() => void loadProjects()}>重新读取项目</button></div>}
      {actionError && <div className="feasibility-operation-error" role="alert"><strong>操作未完成</strong><span>{actionError}</span></div>}
      {modern ? <FeasibilityProjectTable projects={projectList.projects} query={searchText} page={page} sortOrder={sortOrder} loading={loading} error={loadError} disabled={busy || loading} active={!activeProject} scrollPosition={scrollPosition} onQueryChange={setSearchText} onPageChange={setPage} onSortChange={setSortOrder} onEnter={project => void enterProject(project)} onRename={openRename} onDelete={openDelete} onCreate={openCreate} /> : <>
        <section className="feasibility-project-toolbar"><label><span className="sr-only">搜索可研项目名称</span><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="搜索项目名称" /></label><span>{loadError && !projectList.projects.length ? '项目尚未读取' : loading ? '正在读取项目' : `${filteredProjects.length} 个项目`}</span></section>
        <section className="feasibility-project-list" aria-label="可研项目列表" onScroll={event => { scrollPosition.current = event.currentTarget.scrollTop; }}>
          {!loading && !loadError && !filteredProjects.length && <div className="feasibility-project-empty"><strong>{searchText.trim() ? '没有匹配的可研项目' : '还没有可研项目'}</strong><button type="button" onClick={searchText.trim() ? () => setSearchText('') : openCreate}>{searchText.trim() ? '清除搜索' : '新建可研项目'}</button></div>}
          {filteredProjects.map(project => <article className="feasibility-project-card" key={project.id}><div className="feasibility-project-card-copy"><button type="button" className="feasibility-project-title" data-project-id={project.id} disabled={busy || loading} onClick={() => void enterProject(project)}>{project.name}</button><p>当前步骤：{getStepLabel(project.step)} · 更新于 {formatUpdatedAt(project.updated_at)}</p></div><div className="feasibility-project-actions"><button type="button" className="secondary-action" disabled={busy || loading} onClick={() => openRename(project)}>重命名</button><button type="button" className="danger-action" disabled={busy || loading} onClick={() => openDelete(project)}>删除</button></div></article>)}
        </section>
      </>}
      <AppDialog onCloseAutoFocus={restoreDialogFocus} open={createDialogOpen} onOpenChange={open => { if (!busy) { setCreateDialogOpen(open); if (!open) setProjectName(''); } }} preventClose={busy} title="新建可研项目" description="项目保存在独立的本地工作区。" actions={<><button type="button" className="secondary-action" disabled={busy} onClick={() => { setCreateDialogOpen(false); setProjectName(''); }}>取消</button><button type="submit" form="feasibility-create-form" className="primary-action" disabled={busy}>{busy ? '正在创建…' : '创建并进入'}</button></>}>
        <form id="feasibility-create-form" onSubmit={event => { event.preventDefault(); void createProject(); }}>{dialogNotice}<label className="feasibility-create-field"><span>项目名称</span><input ref={nameRef} value={projectName} disabled={busy} aria-required="true" aria-invalid={Boolean(dialogError && !projectName.trim())} onChange={event => { setProjectName(event.target.value); if (dialogError === '请填写可研项目名称') setDialogError(''); }} placeholder="例如：某某产业园建设项目" autoFocus /></label></form>
      </AppDialog>
      <AppDialog onCloseAutoFocus={restoreDialogFocus} open={Boolean(renameTarget)} onOpenChange={open => { if (!open && !busy) setRenameTarget(null); }} preventClose={busy} title="重命名可研项目" actions={<><button type="button" className="secondary-action" disabled={busy} onClick={() => setRenameTarget(null)}>取消</button><button type="submit" form="feasibility-rename-form" className="primary-action" disabled={busy}>{busy ? '正在保存…' : '保存名称'}</button></>}>
        <form id="feasibility-rename-form" onSubmit={event => { event.preventDefault(); void renameProject(); }}>{dialogNotice}<label className="feasibility-create-field"><span>项目名称</span><input ref={nameRef} value={renameValue} disabled={busy} aria-required="true" onChange={event => { setRenameValue(event.target.value); if (dialogError === '项目名称不能为空') setDialogError(''); }} autoFocus /></label></form>
      </AppDialog>
      <AppDialog onCloseAutoFocus={restoreDialogFocus} open={Boolean(pendingDeleteProject)} onOpenChange={open => { if (!open && !busy) setPendingDeleteProject(null); }} preventClose={busy} title="确认删除可研项目" description={`将永久删除“${pendingDeleteProject?.name || ''}”及其本地资料、目录和正文，删除后无法恢复。`} actions={<><button type="button" className="secondary-action" disabled={busy} onClick={() => setPendingDeleteProject(null)}>取消</button><button type="button" className="danger-action" disabled={busy} onClick={() => void deleteProject()}>{busy ? '正在删除…' : '确认删除'}</button></>}>{dialogNotice}</AppDialog>
    </div>
    {activeProject && <FeasibilityWorkbench project={activeProject} onBack={() => { setActiveProject(null); void loadProjects(); }} />}
  </>;
}

export default FeasibilityReportHome;
