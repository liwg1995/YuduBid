import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import DocumentAnalysisPage from './DocumentAnalysisPage';
import BidAnalysisPage from './BidAnalysisPage';
import OutlineEditPage from './OutlineEditPage';
import GlobalFactsPage from './GlobalFactsPage';
import ContentEditPage from './ContentEditPage';
import { useTechnicalPlanWorkflow } from '../hooks/useTechnicalPlanWorkflow';
import { getBidAnalysisTasks } from '../services/bidAnalysisWorkflow';
import { trackPageView } from '../../../shared/analytics/analytics';
import { FloatingToolbar, ToolbarArrowLeftIcon, ToolbarArrowRightIcon, ToolbarDocumentIcon, useToast } from '../../../shared/ui';
import type { BackgroundTaskState, BidAnalysisTasks, ContentGenerationOptions, GlobalFactGroupState, TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../types';
import type { OutlineData, OutlineItem, WordExportProgressEvent } from '../../../shared/types';
import type { SectionId } from '../../../shared/types/navigation';

const steps: TechnicalPlanStep[] = [
  'document-analysis',
  'bid-analysis',
  'outline-generation',
  'global-facts',
  'content-edit',
  'expand',
];

const stepLabels: Record<TechnicalPlanStep, string> = {
  'document-analysis': '上传招标文件',
  'bid-analysis': '招标文件解析',
  'outline-generation': '目录生成',
  'global-facts': '全局事实设定',
  'content-edit': '生成正文',
  expand: '扩写改写',
};

const resetState = {
  workflowKind: 'technical-plan' as TechnicalPlanWorkflowKind,
  step: 'document-analysis' as TechnicalPlanStep,
  tenderFile: null,
  originalPlanFile: null,
  projectOverview: '',
  techRequirements: '',
  bidAnalysisMode: 'key' as const,
  bidAnalysisTasks: {},
  bidAnalysisProgress: 0,
  outlineMode: 'aligned' as const,
  referenceKnowledgeDocumentIds: [] as string[],
  bidAnalysisTask: undefined,
  outlineGenerationTask: undefined,
  globalFactsTask: undefined,
  globalFacts: [] as GlobalFactGroupState[],
  contentGenerationTask: undefined,
  contentGenerationOptions: undefined,
  contentGenerationSections: {},
  contentGenerationPlans: {},
  contentGenerationRuntime: undefined,
  outlineData: null,
};

function collectLeafItems(items: OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => item.children?.length ? collectLeafItems(item.children) : [item]);
}

function countMermaidDiagrams(content: string) {
  const mermaidBlocks = (String(content || '').match(/```mermaid[\s\S]*?```/gi) || []).length;
  const mermaidInkImages = (String(content || '').match(/https:\/\/mermaid\.ink\/img\//gi) || []).length;
  return mermaidBlocks + mermaidInkImages;
}

function countOutlineMermaidDiagrams(items: OutlineItem[]) {
  return collectLeafItems(items).reduce((sum, item) => sum + countMermaidDiagrams(item.content || ''), 0);
}

interface ExportProgressState {
  open: boolean;
  running: boolean;
  progress: number;
  message: string;
  warnings: string[];
  mermaidCount: number;
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

const MAX_UI_TASK_LOGS = 80;
const requiredBidAnalysisTasks = getBidAnalysisTasks('key');

function hasOwnField<T extends object>(value: T, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function trimTaskLogs(task?: BackgroundTaskState): BackgroundTaskState | undefined {
  if (!task?.logs || task.logs.length <= MAX_UI_TASK_LOGS) {
    return task;
  }

  return { ...task, logs: task.logs.slice(-MAX_UI_TASK_LOGS) };
}

function areRequiredBidAnalysisTasksReady(tasks: BidAnalysisTasks) {
  return requiredBidAnalysisTasks.every((task) => {
    const state = tasks[task.id];
    return state?.status === 'success' && state.content.trim();
  });
}

function clearOutlineContent(items: OutlineItem[]): OutlineItem[] {
  return items.map((item) => {
    const { content: _content, children, ...rest } = item;
    return children?.length ? { ...rest, children: clearOutlineContent(children) } : rest;
  });
}

function updateOutlineItemContent(items: OutlineItem[], itemId: string, content: string): OutlineItem[] {
  return items.map((item) => {
    if (item.id === itemId) {
      return { ...item, content };
    }

    return item.children?.length
      ? { ...item, children: updateOutlineItemContent(item.children, itemId, content) }
      : item;
  });
}

function resetGeneratedContent(outlineData: OutlineData): OutlineData {
  return {
    ...outlineData,
    outline: clearOutlineContent(outlineData.outline),
  };
}

interface TechnicalPlanHomeProps {
  workflowKind?: TechnicalPlanWorkflowKind;
  onSectionChange?: (section: SectionId) => void;
}

function hasWorkflowSpecificProgress(state: TechnicalPlanState) {
  return Boolean(
    state.originalPlanFile
    || state.outlineData
    || state.globalFacts.length
    || Object.keys(state.contentGenerationSections).length
    || ['outline-generation', 'global-facts', 'content-edit', 'expand'].includes(state.step),
  );
}

function workflowSection(kind: TechnicalPlanWorkflowKind): SectionId {
  return kind === 'existing-plan-expansion' ? 'existing-plan-expansion' : 'technical-plan';
}

function workflowLabel(kind: TechnicalPlanWorkflowKind) {
  return kind === 'existing-plan-expansion' ? '已有方案扩写' : '技术方案';
}

function TechnicalPlanHome({ workflowKind = 'technical-plan', onSectionChange }: TechnicalPlanHomeProps) {
  const { hydrated, state, setState } = useTechnicalPlanWorkflow(workflowKind);
  const { showToast } = useToast();
  const [tenderMarkdown, setTenderMarkdown] = useState('');
  const [originalPlanMarkdown, setOriginalPlanMarkdown] = useState('');
  const [exportProgress, setExportProgress] = useState<ExportProgressState>(initialExportProgress);
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);
  const [wordOptimizationEnabled, setWordOptimizationEnabled] = useState(false);
  const activeIndex = steps.indexOf(state.step);
  const bidAnalysisReady = areRequiredBidAnalysisTasksReady(state.bidAnalysisTasks);
  const globalFactsReady = state.globalFacts.length > 0 && state.globalFactsTask?.status === 'success';
  const contentTaskStatus = state.contentGenerationTask?.status;
  const isContentGenerating = contentTaskStatus === 'running' || contentTaskStatus === 'pausing';
  const isContentPaused = contentTaskStatus === 'paused';
  const isExporting = exportProgress.running;
  const requiresOriginalPlan = workflowKind === 'existing-plan-expansion';
  const isNextDisabled = activeIndex >= steps.length - 1
    || (state.step === 'document-analysis' && (!state.tenderFile || (requiresOriginalPlan && !state.originalPlanFile)))
    || (state.step === 'bid-analysis' && !bidAnalysisReady)
    || (state.step === 'outline-generation' && !state.outlineData)
    || (state.step === 'global-facts' && !globalFactsReady);
  const nextTooltip = state.step === 'document-analysis' && !state.tenderFile
    ? '上传完招标文件后才能进入下一步'
    : state.step === 'document-analysis' && requiresOriginalPlan && !state.originalPlanFile
      ? '上传完原方案后才能进入下一步'
      : state.step === 'bid-analysis' && !bidAnalysisReady
      ? '招标文件解析完成后才能进入目录生成'
      : state.step === 'outline-generation' && !state.outlineData
        ? '目录生成完成后才能进入全局事实设定'
        : state.step === 'global-facts' && !globalFactsReady
          ? '全局事实设定完成后才能进入正文生成'
          : activeIndex >= steps.length - 1
            ? '当前已经是最后一步'
            : `进入${stepLabels[steps[activeIndex + 1]]}`;

  useEffect(() => {
    if (!hydrated) return;

    trackPageView(`${workflowKind}/${state.step}`);
  }, [hydrated, state.step, workflowKind]);

  const switchStep = (step: TechnicalPlanStep) => {
    setState((prev) => ({ ...prev, step }));
    window.yibiao?.technicalPlan.updateStep({ workflowKind, step }).catch((error) => {
      showToast(error instanceof Error ? error.message : '保存技术方案步骤失败', 'error');
    });
  };

  const goToOffset = (offset: number) => {
    const nextStep = steps[activeIndex + offset];
    if (nextStep) {
      switchStep(nextStep);
    }
  };

  useEffect(() => {
    if (!window.yibiao?.tasks) {
      return;
    }

    const unsubscribe = window.yibiao.tasks.onTaskEvent<typeof state>((event) => {
      const taskType = (event.task as { type?: string } | undefined)?.type;
      const latestTask = trimTaskLogs(event.task as BackgroundTaskState | undefined);
      const technicalPlan = event.technicalPlanPatch || event.technicalPlan;

      if (!technicalPlan) {
        return;
      }
      const eventWorkflowKind = (technicalPlan as Partial<TechnicalPlanState>).workflowKind
        || ((event.task as { workflow_kind?: TechnicalPlanWorkflowKind } | undefined)?.workflow_kind);
      if (eventWorkflowKind && eventWorkflowKind !== workflowKind) {
        return;
      }

      setState((prev) => {
        if (taskType === 'bid-analysis') {
          const outlineDataReset = hasOwnField(technicalPlan, 'outlineData') && technicalPlan.outlineData === null;
          return {
            ...prev,
            bidAnalysisTask: trimTaskLogs(technicalPlan.bidAnalysisTask) || latestTask,
            bidAnalysisTasks: {
              ...prev.bidAnalysisTasks,
              ...(technicalPlan.bidAnalysisTasks || {}),
              ...(event.bidItem ? { [event.bidItem.id]: event.bidItem } : {}),
            },
            bidAnalysisProgress: technicalPlan.bidAnalysisProgress ?? prev.bidAnalysisProgress,
            projectOverview: technicalPlan.projectOverview ?? prev.projectOverview,
            techRequirements: technicalPlan.techRequirements ?? prev.techRequirements,
            outlineGenerationTask: outlineDataReset ? undefined : prev.outlineGenerationTask,
            globalFactsTask: outlineDataReset ? undefined : prev.globalFactsTask,
            globalFacts: outlineDataReset ? [] : prev.globalFacts,
            contentGenerationTask: outlineDataReset ? undefined : prev.contentGenerationTask,
            contentGenerationOptions: outlineDataReset ? undefined : prev.contentGenerationOptions,
            contentGenerationSections: outlineDataReset ? {} : prev.contentGenerationSections,
            contentGenerationPlans: outlineDataReset ? {} : prev.contentGenerationPlans,
            contentGenerationRuntime: outlineDataReset ? undefined : prev.contentGenerationRuntime,
            outlineData: hasOwnField(technicalPlan, 'outlineData') ? (technicalPlan.outlineData || null) : prev.outlineData,
          };
        }

        if (taskType === 'outline-generation') {
          const hasOutlineData = hasOwnField(technicalPlan, 'outlineData');
          const nextOutlineData = technicalPlan.outlineGenerationTask?.status === 'success' && technicalPlan.outlineData
            ? resetGeneratedContent(technicalPlan.outlineData)
            : hasOutlineData
              ? (technicalPlan.outlineData || null)
              : prev.outlineData;
          const outlineDataChanged = nextOutlineData !== prev.outlineData;

          return {
            ...prev,
            outlineGenerationTask: trimTaskLogs(technicalPlan.outlineGenerationTask) || latestTask,
            outlineMode: technicalPlan.outlineMode ?? prev.outlineMode,
            referenceKnowledgeDocumentIds: Array.isArray(technicalPlan.referenceKnowledgeDocumentIds)
              ? technicalPlan.referenceKnowledgeDocumentIds
              : prev.referenceKnowledgeDocumentIds,
            outlineData: nextOutlineData,
            globalFactsTask: outlineDataChanged ? undefined : prev.globalFactsTask,
            globalFacts: outlineDataChanged ? [] : prev.globalFacts,
            contentGenerationTask: outlineDataChanged ? undefined : prev.contentGenerationTask,
            contentGenerationSections: outlineDataChanged ? {} : prev.contentGenerationSections,
            contentGenerationPlans: outlineDataChanged ? {} : prev.contentGenerationPlans,
            contentGenerationRuntime: outlineDataChanged ? undefined : prev.contentGenerationRuntime,
          };
        }

        if (taskType === 'global-facts-generation') {
          const hasGlobalFacts = hasOwnField(technicalPlan, 'globalFacts');
          const globalFactsChanged = hasGlobalFacts && technicalPlan.globalFacts !== prev.globalFacts;
          return {
            ...prev,
            globalFactsTask: trimTaskLogs(technicalPlan.globalFactsTask) || latestTask,
            globalFacts: hasGlobalFacts ? (technicalPlan.globalFacts || []) : prev.globalFacts,
            contentGenerationTask: globalFactsChanged ? undefined : prev.contentGenerationTask,
            contentGenerationSections: globalFactsChanged ? {} : prev.contentGenerationSections,
            contentGenerationPlans: globalFactsChanged ? {} : prev.contentGenerationPlans,
            contentGenerationRuntime: globalFactsChanged ? undefined : prev.contentGenerationRuntime,
          };
        }

        if (taskType === 'content-generation') {
          const hasPatchOutlineData = hasOwnField(technicalPlan, 'outlineData') || hasOwnField(event, 'outlineData');
          const patchOutlineData = hasOwnField(technicalPlan, 'outlineData') ? technicalPlan.outlineData : event.outlineData;
          const contentSection = event.contentSection;
          const nextSections = hasOwnField(technicalPlan, 'contentGenerationSections')
            ? (technicalPlan.contentGenerationSections || {})
            : contentSection
              ? { ...prev.contentGenerationSections, [contentSection.id]: contentSection }
              : prev.contentGenerationSections;
          const nextOutlineData = hasPatchOutlineData
            ? (patchOutlineData || null)
            : contentSection?.content !== undefined && prev.outlineData
              ? { ...prev.outlineData, outline: updateOutlineItemContent(prev.outlineData.outline, contentSection.id, contentSection.content) }
              : prev.outlineData;
          return {
            ...prev,
            contentGenerationTask: latestTask || trimTaskLogs(technicalPlan.contentGenerationTask),
            outlineMode: technicalPlan.outlineMode ?? prev.outlineMode,
            referenceKnowledgeDocumentIds: Array.isArray(technicalPlan.referenceKnowledgeDocumentIds)
              ? technicalPlan.referenceKnowledgeDocumentIds
              : prev.referenceKnowledgeDocumentIds,
            contentGenerationSections: nextSections,
            contentGenerationPlans: hasOwnField(technicalPlan, 'contentGenerationPlans') ? (technicalPlan.contentGenerationPlans || {}) : prev.contentGenerationPlans,
            contentGenerationRuntime: hasOwnField(technicalPlan, 'contentGenerationRuntime') ? technicalPlan.contentGenerationRuntime : prev.contentGenerationRuntime,
            outlineData: nextOutlineData,
          };
        }

        return prev;
      });
    });
    window.yibiao.tasks.getActiveTasks().catch((error) => {
      console.warn('获取后台任务状态失败', error);
    });

    return unsubscribe;
  }, [setState, workflowKind]);

  useEffect(() => {
    if (state.step !== 'document-analysis') {
      return;
    }
    if (!state.tenderFile) {
      setTenderMarkdown('');
      return;
    }
    let mounted = true;
    window.yibiao?.technicalPlan.readTenderMarkdown(workflowKind).then((markdown) => {
      if (mounted) setTenderMarkdown(markdown || '');
    }).catch((error) => {
      if (mounted) showToast(error instanceof Error ? error.message : '读取招标文件 Markdown 失败', 'error');
    });
    return () => {
      mounted = false;
    };
  }, [showToast, state.step, state.tenderFile, workflowKind]);

  useEffect(() => {
    if (!requiresOriginalPlan) {
      setOriginalPlanMarkdown('');
      return;
    }
    if (!state.originalPlanFile) {
      setOriginalPlanMarkdown('');
      return;
    }
    let mounted = true;
    window.yibiao?.technicalPlan.readOriginalPlanMarkdown(workflowKind).then((markdown) => {
      if (mounted) setOriginalPlanMarkdown(markdown || '');
    }).catch((error) => {
      if (mounted) showToast(error instanceof Error ? error.message : '读取原方案 Markdown 失败', 'error');
    });
    return () => {
      mounted = false;
    };
  }, [requiresOriginalPlan, showToast, state.originalPlanFile, workflowKind]);

  const loadWordOptimizationEnabled = async () => {
    const config = await window.yibiao?.config.load();
    return Boolean(config?.skill_settings?.skills?.['word-optimization']?.enabled);
  };

  const openExportChoice = async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成目录', 'info');
      return;
    }
    try {
      setWordOptimizationEnabled(await loadWordOptimizationEnabled());
      setExportChoiceOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取技能配置失败', 'error');
    }
  };

  const exportWord = async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成目录', 'info');
      return;
    }

    const requestId = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const mermaidCount = countOutlineMermaidDiagrams(state.outlineData.outline);
    let unsubscribe: (() => void) | undefined;

    try {
      setExportProgress({
        open: true,
        running: true,
        progress: 2,
        message: mermaidCount
          ? `检测到 ${mermaidCount} 张 Mermaid 图，导出时会转换为 Word 图片，可能需要稍等。`
          : '正在准备导出 Word。',
        warnings: [],
        mermaidCount,
      });

      unsubscribe = window.yibiao?.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) {
          return;
        }

        setExportProgress((prev) => ({
          ...prev,
          open: true,
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          warnings: event.warnings || prev.warnings,
          error: event.phase === 'error' ? event.message : undefined,
        }));
      });

      const result = await window.yibiao?.export.exportWord({
        requestId,
        project_name: state.outlineData.project_name,
        outline: state.outlineData.outline,
      });
      if (result?.canceled) {
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }
      setExportProgress((prev) => ({
        ...prev,
        open: true,
        running: false,
        progress: 100,
        message: result?.message || 'Word 已导出，请打开文档核对图片、表格和版式。',
        warnings: result?.warnings || prev.warnings,
      }));
      showToast(result?.message || 'Word 已导出', result?.warnings?.length ? 'info' : 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      setExportProgress((prev) => ({
        ...prev,
        open: true,
        running: false,
        progress: 100,
        message,
        error: message,
      }));
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  };

  const exportOptimizedWord = async () => {
    const enabled = await loadWordOptimizationEnabled();
    setWordOptimizationEnabled(enabled);
    if (!enabled) {
      showToast('请先到 设置 > 技能管理 启用 word-optimization', 'info');
      return;
    }
    setExportChoiceOpen(false);
    await exportWord();
  };

  const exportOriginalFormatWord = async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成目录', 'info');
      return;
    }
    if (state.originalPlanFile?.sourceExt !== '.docx' || !state.originalPlanFile?.sourcePath) {
      showToast('原格式导出当前仅支持 DOCX 原方案，请重新导入 DOCX 原方案或使用优化格式导出', 'info');
      return;
    }

    const requestId = `export-original-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;

    try {
      setExportChoiceOpen(false);
      setExportProgress({
        open: true,
        running: true,
        progress: 5,
        message: '正在准备按原方案格式导出 Word。',
        warnings: [],
        mermaidCount: 0,
      });

      unsubscribe = window.yibiao?.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) {
          return;
        }

        setExportProgress((prev) => ({
          ...prev,
          open: true,
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          warnings: event.warnings || prev.warnings,
          error: event.phase === 'error' ? event.message : undefined,
        }));
      });

      const result = await window.yibiao?.export.exportWord({
        requestId,
        exportMode: 'original-template',
        project_name: state.outlineData.project_name,
        outline: state.outlineData.outline,
        originalTemplatePath: state.originalPlanFile.sourcePath,
      });
      if (result?.canceled) {
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }
      setExportProgress((prev) => ({
        ...prev,
        open: true,
        running: false,
        progress: 100,
        message: result?.message || 'Word 已按原方案格式导出。',
        warnings: result?.warnings || prev.warnings,
      }));
      showToast(result?.message || 'Word 已按原方案格式导出', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '原格式导出 Word 失败';
      setExportProgress((prev) => ({
        ...prev,
        open: true,
        running: false,
        progress: 100,
        message,
        error: message,
      }));
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  };

  const saveChapterContent = async (item: OutlineItem, content: string) => {
    if (!state.outlineData?.outline?.length) {
      throw new Error('当前没有可保存的目录');
    }

    const updatedOutlineData = {
      ...state.outlineData,
      outline: updateOutlineItemContent(state.outlineData.outline, item.id, content),
    };
    const updatedSections = {
      ...state.contentGenerationSections,
      [item.id]: {
        id: item.id,
        title: item.title || '未命名章节',
        status: content.trim() ? 'success' as const : 'idle' as const,
        content,
        updated_at: new Date().toISOString(),
      },
    };

    setState((prev) => ({
      ...prev,
      outlineData: updatedOutlineData,
      contentGenerationSections: updatedSections,
    }));
    const saved = await window.yibiao?.technicalPlan.saveChapterContent({ workflowKind, nodeId: item.id, content });
    if (saved) setState((prev) => ({ ...prev, ...saved }));
  };

  const resetTechnicalPlan = async () => {
    if (!window.confirm('会清空整个技术方案编写进度，是否确认？')) {
      return;
    }

    try {
      const result = await window.yibiao?.technicalPlan.clear(workflowKind);
      setState(result?.state || { ...resetState, workflowKind });
      setTenderMarkdown('');
      setOriginalPlanMarkdown('');
      showToast(result?.message || '技术方案已重置', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重置技术方案失败', 'error');
    }
  };

  const saveContentGenerationOptions = async (contentGenerationOptions: ContentGenerationOptions) => {
    const saved = await window.yibiao?.technicalPlan.saveContentGenerationOptions({ workflowKind, contentGenerationOptions });
    setState((prev) => ({ ...prev, ...(saved || {}), contentGenerationOptions }));
  };

  const saveGlobalFacts = async (globalFacts: GlobalFactGroupState[]) => {
    const saved = await window.yibiao?.technicalPlan.saveGlobalFacts({ workflowKind, globalFacts });
    setState((prev) => ({ ...prev, ...(saved || {}), globalFacts }));
  };

  const generatedContentCount = state.outlineData?.outline
    ? collectLeafItems(state.outlineData.outline).filter((item) => item.content?.trim()).length
    : 0;

  const navigationActions = state.step === 'content-edit'
    ? [
      {
        id: 'previous-step',
        label: '上一步',
        icon: <ToolbarArrowLeftIcon />,
        disabled: activeIndex <= 0,
        tooltip: activeIndex <= 0 ? '当前已经是第一步' : `返回${stepLabels[steps[activeIndex - 1]]}`,
        onClick: () => goToOffset(-1),
      },
      {
        id: 'export-word',
        label: isExporting ? '导出中...' : '导出 Word',
        icon: <ToolbarDocumentIcon />,
        variant: 'primary' as const,
        disabled: isContentGenerating || isExporting || !state.outlineData,
        tooltip: isContentGenerating ? '正文生成或暂停处理中，完成暂停后再导出' : isExporting ? 'Word 正在导出，请稍候' : isContentPaused ? '正文生成已暂停，可导出当前已完成内容' : generatedContentCount ? '导出当前技术方案正文' : '可导出空目录文档，建议先生成正文',
        onClick: requiresOriginalPlan ? () => { void openExportChoice(); } : exportWord,
      },
      {
        id: 'continue-expand',
        label: '继续扩写',
        icon: <ToolbarArrowRightIcon />,
        disabled: !state.outlineData,
        tooltip: '进入扩写改写步骤',
        onClick: () => switchStep('expand'),
      },
    ]
    : [
      {
        id: 'previous-step',
        label: '上一步',
        icon: <ToolbarArrowLeftIcon />,
        disabled: activeIndex <= 0,
        tooltip: activeIndex <= 0 ? '当前已经是第一步' : `返回${stepLabels[steps[activeIndex - 1]]}`,
        onClick: () => goToOffset(-1),
      },
      {
        id: 'next-step',
        label: '下一步',
        icon: <ToolbarArrowRightIcon />,
        variant: 'primary' as const,
        disabled: isNextDisabled,
        tooltip: nextTooltip,
        onClick: () => goToOffset(1),
      },
    ];

  const toolbarGroups = [
    {
      id: 'technical-plan-reset',
      actions: [
        {
          id: 'reset',
          label: '重置',
          variant: 'danger' as const,
          tooltip: '清空当前技术方案流程',
          onClick: resetTechnicalPlan,
        },
        {
          id: 'home',
          label: '首页',
          variant: state.step === 'document-analysis' ? 'primary' as const : 'secondary' as const,
          tooltip: '回到上传招标文件',
          onClick: () => switchStep('document-analysis'),
        },
      ],
    },
    {
      id: 'technical-plan-navigation',
      actions: navigationActions,
    },
  ];

  return (
    <div className="page-stack technical-workbench">
      {state.step === 'document-analysis' && (
        <DocumentAnalysisPage
          workflowKind={workflowKind}
          tenderFile={state.tenderFile}
          tenderMarkdown={tenderMarkdown}
          originalPlanFile={state.originalPlanFile}
          originalPlanMarkdown={originalPlanMarkdown}
          onFileImported={(nextState, markdown) => {
            setState((prev) => ({ ...prev, ...nextState }));
            setTenderMarkdown(markdown);
          }}
          onOriginalPlanImported={(nextState, markdown) => {
            setState((prev) => ({ ...prev, ...nextState }));
            setOriginalPlanMarkdown(markdown);
          }}
        />
      )}

      {state.step === 'bid-analysis' && (
        <BidAnalysisPage
          workflowKind={workflowKind}
          hasTenderFile={Boolean(state.tenderFile)}
          mode={state.bidAnalysisMode}
          tasks={state.bidAnalysisTasks}
          task={state.bidAnalysisTask}
          progress={state.bidAnalysisProgress}
          onModeChange={(mode) => setState((prev) => ({ ...prev, bidAnalysisMode: mode }))}
          onTasksChange={(updater) => setState((prev) => ({ ...prev, bidAnalysisTasks: updater(prev.bidAnalysisTasks) }))}
          onProgressChange={(progress) => setState((prev) => ({ ...prev, bidAnalysisProgress: progress }))}
          onRequiredResultChange={(projectOverview, techRequirements) => setState((prev) => ({
            ...prev,
            projectOverview,
            techRequirements,
          }))}
        />
      )}
      {state.step === 'outline-generation' && (
        <OutlineEditPage
          workflowKind={workflowKind}
          projectOverview={state.projectOverview}
          techRequirements={state.techRequirements}
          outlineMode={state.outlineMode}
          referenceKnowledgeDocumentIds={state.referenceKnowledgeDocumentIds}
          outlineData={state.outlineData}
          task={state.outlineGenerationTask}
          onOutlineConfigChange={(outlineMode, referenceKnowledgeDocumentIds) => {
            setState((prev) => ({ ...prev, outlineMode, referenceKnowledgeDocumentIds }));
            window.yibiao?.technicalPlan.saveOutlineConfig({ workflowKind, outlineMode, referenceKnowledgeDocumentIds }).then((saved) => {
              setState((prev) => ({ ...prev, ...saved }));
            }).catch((error) => {
              showToast(error instanceof Error ? error.message : '保存目录配置失败', 'error');
            });
          }}
          onOutlineGenerated={(outlineData) => {
            const nextOutlineData = resetGeneratedContent(outlineData);
            setState((prev) => ({
              ...prev,
              outlineData: nextOutlineData,
              globalFactsTask: undefined,
              globalFacts: [],
              contentGenerationTask: undefined,
              contentGenerationSections: {},
              contentGenerationPlans: {},
              contentGenerationRuntime: undefined,
            }));
            window.yibiao?.technicalPlan.saveOutline({ workflowKind, outlineData: nextOutlineData }).then((saved) => {
              setState((prev) => ({ ...prev, ...saved }));
            }).catch((error) => {
              showToast(error instanceof Error ? error.message : '保存目录失败', 'error');
            });
          }}
        />
      )}
      {state.step === 'global-facts' && (
        <GlobalFactsPage
          workflowKind={workflowKind}
          outlineData={state.outlineData}
          globalFacts={state.globalFacts}
          task={state.globalFactsTask}
          onGlobalFactsSaved={saveGlobalFacts}
        />
      )}
      {state.step === 'content-edit' && (
        <ContentEditPage
          workflowKind={workflowKind}
          originalPlanMarkdown={originalPlanMarkdown}
          outlineData={state.outlineData}
          task={state.contentGenerationTask}
          contentGenerationOptions={state.contentGenerationOptions}
          sections={state.contentGenerationSections}
          onContentGenerationOptionsChange={saveContentGenerationOptions}
          onContentSaved={saveChapterContent}
        />
      )}
      {state.step === 'expand' && (
        <section className="empty-panel compact-placeholder">
          <div className="feature-under-development-overlay" role="status" aria-live="polite">
            <strong>正在开发中，敬请期待</strong>
            <span>此功能尚未完成，请先不要使用。</span>
          </div>
          <span className="section-kicker">STEP 06</span>
          <h3>扩写改写</h3>
          <p>后续接入旧方案导入、章节扩写和人工校准。</p>
        </section>
      )}

      <Dialog.Root open={exportChoiceOpen} onOpenChange={setExportChoiceOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card">
            <div className="content-regenerate-card-head">
              <span className="section-kicker">Word 导出</span>
              <Dialog.Title>选择导出方式</Dialog.Title>
              <Dialog.Description>
                已有方案扩写支持按原方案格式导出或使用 word-optimization 优化版式导出。
              </Dialog.Description>
            </div>
            <div className="content-generation-config-list">
              <div className="content-generation-config-row">
                <span>
                  <strong>原格式导出</strong>
                  <small>{state.originalPlanFile?.sourceExt === '.docx' && state.originalPlanFile?.sourcePath ? '基于原 DOCX 文件追加扩写正文，保留原方案已有版式、样式、页眉页脚和图片。' : '当前仅支持以 DOCX 原方案作为原格式模板，请重新导入 DOCX 原方案。'}</small>
                </span>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => { void exportOriginalFormatWord(); }}
                  disabled={isExporting || state.originalPlanFile?.sourceExt !== '.docx' || !state.originalPlanFile?.sourcePath}
                >
                  原格式导出
                </button>
              </div>
              <div className="content-generation-config-row">
                <span>
                  <strong>优化格式导出</strong>
                  <small>{wordOptimizationEnabled ? '使用已启用的 word-optimization 技能统一正文、标题、表格、图片、页码和编号缩进。' : '请先到 设置 > 技能管理 启用 word-optimization。'}</small>
                </span>
                <button type="button" className="primary-action" onClick={() => { void exportOptimizedWord(); }} disabled={!wordOptimizationEnabled || isExporting}>
                  {wordOptimizationEnabled ? '优化格式导出' : '未启用'}
                </button>
              </div>
            </div>
            <div className="content-regenerate-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={exportProgress.open}
        onOpenChange={(open) => {
          if (!open && !exportProgress.running) {
            setExportProgress(initialExportProgress);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="export-progress-card">
            <div className="content-regenerate-card-head">
              <span className="section-kicker">Word 导出</span>
              <Dialog.Title>{exportProgress.running ? '正在导出 Word' : exportProgress.error ? '导出失败' : '导出完成'}</Dialog.Title>
              <Dialog.Description>
                {exportProgress.mermaidCount > 0
                  ? `本次包含 ${exportProgress.mermaidCount} 张 Mermaid 图，导出时会通过 mermaid.ink 转换成 Word 图片，速度受网络影响。`
                  : '正在将正文、表格和图片写入 Word 文档。'}
              </Dialog.Description>
            </div>
            <div className="export-progress-body">
              <div className="content-generation-progress-track" aria-label={`Word 导出进度 ${exportProgress.progress}%`}>
                <span style={{ width: `${exportProgress.progress}%` }} />
              </div>
              <p>{exportProgress.message || '正在处理导出任务，请稍候。'}</p>
              {exportProgress.warnings.length > 0 && (
                <div className="export-warning-list">
                  <strong>需要核对</strong>
                  {exportProgress.warnings.slice(0, 4).map((warning) => <small key={warning}>{warning}</small>)}
                  {exportProgress.warnings.length > 4 && <small>还有 {exportProgress.warnings.length - 4} 条图片提示，请打开导出的 Word 核对。</small>}
                </div>
              )}
            </div>
            {!exportProgress.running && (
              <div className="content-regenerate-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <FloatingToolbar groups={toolbarGroups} label="技术方案工具条" />
    </div>
  );
}

export default TechnicalPlanHome;
