import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import DocumentAnalysisPage from './DocumentAnalysisPage';
import BidAnalysisPage from './BidAnalysisPage';
import OutlineEditPage from './OutlineEditPage';
import GlobalFactsPage from './GlobalFactsPage';
import ContentEditPage from './ContentEditPage';
import { useTechnicalPlanWorkflow } from '../hooks/useTechnicalPlanWorkflow';
import { getBidAnalysisTasks } from '../services/bidAnalysisWorkflow';
import { FloatingToolbar, MarkdownRenderer, ToolbarArrowLeftIcon, ToolbarArrowRightIcon, ToolbarDocumentIcon, useAppDialog, useToast } from '../../../shared/ui';
import { countReadableWords } from '../../../shared/utils/wordCount';
import type { BackgroundTaskState, BidAnalysisTasks, ContentGenerationOptions, ContentTableRequirement, GlobalFactGroupState, TechnicalPlanProject, TechnicalPlanProjectList, TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../types';
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
  responseFileRequirements: '',
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

function findOutlineItem(items: OutlineItem[], itemId: string): OutlineItem | null {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    if (item.children?.length) {
      const found = findOutlineItem(item.children, itemId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function countMermaidDiagrams(content: string) {
  const mermaidBlocks = (String(content || '').match(/```mermaid[\s\S]*?```/gi) || []).length;
  const mermaidInkImages = (String(content || '').match(/https:\/\/mermaid\.ink\/img\//gi) || []).length;
  return mermaidBlocks + mermaidInkImages;
}

function countOutlineMermaidDiagrams(items: OutlineItem[]) {
  return collectLeafItems(items).reduce((sum, item) => sum + countMermaidDiagrams(item.content || ''), 0);
}

function getLeafContent(item: OutlineItem, sections: TechnicalPlanState['contentGenerationSections']) {
  return sections[item.id]?.content || item.content || '';
}

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

interface TechnicalPlanWorkbenchProps extends TechnicalPlanHomeProps {
  projectId?: string;
  projectName?: string;
  onBackToProjects?: () => void;
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

const taskStatusLabels: Record<string, string> = {
  running: '运行中',
  pausing: '暂停中',
  stopping: '停止中',
  stopped: '已停止',
  paused: '已暂停',
  success: '已完成',
  error: '失败',
};

const expandTableOptions: Array<{ value: ContentTableRequirement; label: string; description: string }> = [
  { value: 'none', label: '不要', description: '只扩写文字，不新增表格。' },
  { value: 'light', label: '少量', description: '仅在验收、风险、分工等适合时补少量表格。' },
  { value: 'moderate', label: '适中', description: '允许为所选章节适度补充表格。' },
  { value: 'heavy', label: '较多', description: '更积极地补充表格，但仍避免硬插。' },
];

function TechnicalPlanWorkbench({ workflowKind = 'technical-plan', projectId, projectName, onBackToProjects, onSectionChange }: TechnicalPlanWorkbenchProps) {
  const { hydrated, state, setState } = useTechnicalPlanWorkflow(workflowKind, projectId);
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [tenderMarkdown, setTenderMarkdown] = useState('');
  const [originalPlanMarkdown, setOriginalPlanMarkdown] = useState('');
  const [exportProgress, setExportProgress] = useState<ExportProgressState>(initialExportProgress);
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);
  const [wordOptimizationEnabled, setWordOptimizationEnabled] = useState(false);
  const [contentEditSelectedItemId, setContentEditSelectedItemId] = useState('');
  const [expandSelectedItemIds, setExpandSelectedItemIds] = useState<Set<string>>(new Set());
  const [previewExpandItemId, setPreviewExpandItemId] = useState('');
  const [expandTargetWords, setExpandTargetWords] = useState(0);
  const [expandConcurrency, setExpandConcurrency] = useState(3);
  const [expandConsistencyAudit, setExpandConsistencyAudit] = useState(true);
  const [expandTableRequirement, setExpandTableRequirement] = useState<ContentTableRequirement>('none');
  const [expandUseMermaidImages, setExpandUseMermaidImages] = useState(false);
  const [expandUseTechnicalDiagrams, setExpandUseTechnicalDiagrams] = useState(false);
  const [expandUseAiImages, setExpandUseAiImages] = useState(false);
  const [expandMaxAiImages, setExpandMaxAiImages] = useState(2);
  const [expandImageModelAvailable, setExpandImageModelAvailable] = useState(false);
  const [expandTechnicalDiagramAvailable, setExpandTechnicalDiagramAvailable] = useState(false);
  const activeIndex = steps.indexOf(state.step);
  const bidAnalysisReady = areRequiredBidAnalysisTasksReady(state.bidAnalysisTasks);
  const globalFactsReady = state.globalFacts.length > 0 && state.globalFactsTask?.status === 'success';
  const contentTaskStatus = state.contentGenerationTask?.status;
  const isContentGenerating = contentTaskStatus === 'running' || contentTaskStatus === 'pausing';
  const isContentPaused = contentTaskStatus === 'paused';
  const isExporting = exportProgress.running;
  const requiresOriginalPlan = workflowKind === 'existing-plan-expansion';
  const outlineLeaves = useMemo(() => state.outlineData?.outline ? collectLeafItems(state.outlineData.outline) : [], [state.outlineData]);
  const generatedLeaves = useMemo(
    () => outlineLeaves.filter((item) => getLeafContent(item, state.contentGenerationSections).trim()),
    [outlineLeaves, state.contentGenerationSections],
  );
  const generatedLeafIdSet = useMemo(() => new Set(generatedLeaves.map((item) => item.id)), [generatedLeaves]);
  const totalContentWords = useMemo(
    () => outlineLeaves.reduce((sum, item) => sum + countReadableWords(getLeafContent(item, state.contentGenerationSections)), 0),
    [outlineLeaves, state.contentGenerationSections],
  );
  const selectedExpandLeaves = useMemo(
    () => generatedLeaves.filter((item) => expandSelectedItemIds.has(item.id)),
    [expandSelectedItemIds, generatedLeaves],
  );
  const selectedExpandWords = useMemo(
    () => selectedExpandLeaves.reduce((sum, item) => sum + countReadableWords(getLeafContent(item, state.contentGenerationSections)), 0),
    [selectedExpandLeaves, state.contentGenerationSections],
  );
  const previewExpandItem = state.outlineData?.outline && previewExpandItemId ? findOutlineItem(state.outlineData.outline, previewExpandItemId) : null;
  const previewExpandContent = previewExpandItem ? getLeafContent(previewExpandItem, state.contentGenerationSections) : '';
  const expandTaskStatus = state.contentGenerationTask?.status || 'idle';
  const expandContentStats = state.contentGenerationTask?.stats?.content;
  const expandPhase = expandContentStats?.phase || state.contentGenerationRuntime?.phase || '';
  const expandRunning = expandTaskStatus === 'running' || expandTaskStatus === 'pausing' || expandTaskStatus === 'stopping';
  const expandStopping = expandTaskStatus === 'stopping';
  const expandPaused = expandTaskStatus === 'paused';
  const expandDone = expandTaskStatus === 'success';
  const expandFailed = expandTaskStatus === 'error';
  const expandTotal = expandContentStats?.expansion_total || selectedExpandLeaves.length || 0;
  const expandCompleted = expandContentStats?.expansion_completed || 0;
  const auditGroupTotal = expandContentStats?.audit_group_total || 0;
  const auditGroupCompleted = expandContentStats?.audit_group_completed || 0;
  const auditFixTotal = expandContentStats?.audit_fix_total || 0;
  const auditFixCompleted = expandContentStats?.audit_fix_completed || 0;
  const planningTotal = expandContentStats?.planning_total || 0;
  const planningCompleted = expandContentStats?.planning_completed || 0;
  const illustrationTotal = expandContentStats?.illustration_total || 0;
  const illustrationCompleted = expandContentStats?.illustration_completed || 0;
  const expandProgress = expandDone
    ? 100
    : expandPhase === 'planning'
      ? planningTotal ? Math.round((planningCompleted / planningTotal) * 100) : 0
      : expandPhase === 'illustrating'
        ? illustrationTotal ? Math.round((illustrationCompleted / illustrationTotal) * 100) : 0
        : expandPhase === 'auditing'
      ? auditFixTotal
        ? Math.round((auditFixCompleted / auditFixTotal) * 100)
        : auditGroupTotal
          ? Math.round((auditGroupCompleted / auditGroupTotal) * 100)
          : 0
      : expandTotal
        ? Math.round((expandCompleted / expandTotal) * 100)
        : 0;
  const expandProgressText = expandDone
    ? '所选小节已扩写完成'
      : expandFailed
      ? state.contentGenerationTask?.error || '扩写失败'
      : expandTaskStatus === 'stopped'
        ? '扩写已停止'
      : expandPhase === 'planning'
        ? `配图编排 ${planningCompleted}/${planningTotal || 1}`
        : expandPhase === 'illustrating'
          ? `配图生成 ${illustrationCompleted}/${illustrationTotal || 1}`
          : expandPhase === 'auditing'
        ? auditFixTotal
          ? `一致性修复 ${auditFixCompleted}/${auditFixTotal}`
          : `一致性审计 ${auditGroupCompleted}/${auditGroupTotal || 1}`
        : expandRunning
          ? `扩写进度 ${expandCompleted}/${expandTotal || selectedExpandLeaves.length || 1}`
          : '尚未开始';
  const expandLatestLog = state.contentGenerationTask?.logs?.slice(-1)[0] || '';
  const expandStatusDescription = expandDone
    ? '可返回上一步查看扩写后的正文。'
    : expandLatestLog || (expandTaskStatus === 'stopped' ? '扩写已停止，已保留当前已完成内容，可重新开始。' : '选择小节并设置扩写参数后即可开始。');
  const expandStatusClass = ['running', 'pausing', 'stopping', 'stopped', 'paused', 'success', 'error'].includes(expandTaskStatus) ? expandTaskStatus : 'idle';
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
    if (state.step !== 'expand') {
      return;
    }
    const savedOptions = state.contentGenerationOptions;
    setExpandConcurrency(Math.max(1, Math.round(Number(savedOptions?.contentConcurrency || 3))));
    setExpandConsistencyAudit(savedOptions?.enableConsistencyAudit ?? true);
    setExpandTableRequirement(savedOptions?.tableRequirement || 'none');
    setExpandUseMermaidImages(Boolean(savedOptions?.useMermaidImages ?? false));
    setExpandUseTechnicalDiagrams(Boolean(savedOptions?.useTechnicalDiagrams ?? false));
    setExpandUseAiImages(Boolean(savedOptions?.useAiImages ?? false));
    setExpandMaxAiImages(Math.max(0, Math.round(Number(savedOptions?.maxAiImages || 2))));
    setExpandTargetWords((prev) => {
      if (prev > totalContentWords) {
        return prev;
      }
      return totalContentWords > 0 ? totalContentWords + 3000 : 0;
    });
  }, [state.contentGenerationOptions, state.step, totalContentWords]);

  useEffect(() => {
    if (state.step !== 'expand') {
      return;
    }
    window.yibiao?.config.load()
      .then((config) => {
        const available = config?.image_model?.status === 'available';
        const technicalDiagramAvailable = Boolean(config?.skill_settings?.skills?.['technical-diagram']?.enabled);
        setExpandImageModelAvailable(available);
        setExpandTechnicalDiagramAvailable(technicalDiagramAvailable);
        if (!available) {
          setExpandUseAiImages(false);
        }
        if (!technicalDiagramAvailable) {
          setExpandUseTechnicalDiagrams(false);
        } else if (state.contentGenerationOptions?.useTechnicalDiagrams !== false) {
          setExpandUseTechnicalDiagrams(true);
        }
      })
      .catch(() => {
        setExpandImageModelAvailable(false);
        setExpandTechnicalDiagramAvailable(false);
        setExpandUseAiImages(false);
        setExpandUseTechnicalDiagrams(false);
      });
  }, [state.contentGenerationOptions?.useTechnicalDiagrams, state.step]);

  useEffect(() => {
    if (state.step !== 'expand' || !state.outlineData?.outline?.length) {
      return;
    }
    setExpandSelectedItemIds((prev) => {
      const retained = new Set(Array.from(prev).filter((itemId) => generatedLeafIdSet.has(itemId)));
      if (retained.size) {
        return retained;
      }
      const selectedItem = contentEditSelectedItemId ? findOutlineItem(state.outlineData?.outline || [], contentEditSelectedItemId) : null;
      const selectedLeafIds = selectedItem
        ? collectLeafItems([selectedItem]).map((item) => item.id).filter((itemId) => generatedLeafIdSet.has(itemId))
        : [];
      return new Set(selectedLeafIds.length ? selectedLeafIds : generatedLeaves.slice(0, 1).map((item) => item.id));
    });
  }, [contentEditSelectedItemId, generatedLeafIdSet, generatedLeaves, state.outlineData, state.step]);

  const switchStep = (step: TechnicalPlanStep) => {
    setState((prev) => ({ ...prev, step }));
    window.yibiao?.technicalPlan.updateStep({ workflowKind, projectId, step }).catch((error) => {
      showToast(error instanceof Error ? error.message : '保存技术方案步骤失败', 'error');
    });
  };

  const goToOffset = (offset: number) => {
    const nextStep = steps[activeIndex + offset];
    if (nextStep) {
      switchStep(nextStep);
    }
  };

  const startExpandOnly = async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成目录', 'info');
      return;
    }
    if (!globalFactsReady) {
      showToast('请先完成全局事实设定', 'info');
      return;
    }
    if (!generatedLeaves.length) {
      showToast('请先生成正文，再继续扩写', 'info');
      return;
    }
    if (!selectedExpandLeaves.length) {
      showToast('请先选择要扩写的小节', 'info');
      return;
    }
    if (isContentGenerating) {
      showToast('正文任务正在运行，请等待完成或暂停后再继续扩写', 'info');
      return;
    }
    if (isContentPaused) {
      showToast('正文生成已暂停，请先继续或重置当前任务', 'info');
      return;
    }

    const normalizedTargetWords = Math.max(0, Math.round(Number(expandTargetWords) || 0));
    const normalizedConcurrency = Math.max(1, Math.round(Number(expandConcurrency) || 1));
    const savedOptions: ContentGenerationOptions = {
      useAiImages: expandUseAiImages && expandImageModelAvailable,
      maxAiImages: expandUseAiImages ? Math.max(0, Math.min(Math.round(Number(expandMaxAiImages) || 0), selectedExpandLeaves.length)) : 0,
      useMermaidImages: expandUseMermaidImages,
      useTechnicalDiagrams: expandUseTechnicalDiagrams && expandTechnicalDiagramAvailable,
      tableRequirement: expandTableRequirement,
      minimumWords: normalizedTargetWords,
      contentConcurrency: normalizedConcurrency,
      enableConsistencyAudit: expandConsistencyAudit,
      enableOriginalPlanCoverageAudit: state.contentGenerationOptions?.enableOriginalPlanCoverageAudit || false,
    };

    try {
      await window.yibiao?.tasks.startContentGeneration({
        workflowKind,
        projectId,
        expandOnly: true,
        targetItemIds: selectedExpandLeaves.map((item) => item.id),
        generationOptions: savedOptions,
      });
      showToast('继续扩写任务已在后台启动', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启动继续扩写失败', 'error');
    }
  };

  const stopExpand = async () => {
    if (!expandRunning) return;
    try {
      await window.yibiao?.tasks.stopContentGeneration({ workflowKind, projectId });
      showToast('正在停止扩写，当前 AI 请求完成后会停止调度新任务', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '停止扩写失败', 'error');
    }
  };

  const pauseExpand = async () => {
    if (!expandRunning || expandStopping) return;
    try {
      await window.yibiao?.tasks.pauseContentGeneration({ workflowKind, projectId });
      showToast('正在暂停扩写，当前 AI 请求完成后会停止调度新任务', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '暂停扩写失败', 'error');
    }
  };

  const resumeExpand = async () => {
    if (!expandPaused) return;
    try {
      await window.yibiao?.tasks.startContentGeneration({ workflowKind, projectId, resume: true });
      showToast('已继续扩写任务', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '继续扩写失败', 'error');
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
      const eventProjectId = (technicalPlan as Partial<TechnicalPlanState>).projectId
        || ((event.task as { project_id?: string } | undefined)?.project_id);
      if (projectId && eventProjectId && eventProjectId !== projectId) {
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
    window.yibiao?.technicalPlan.readTenderMarkdown({ workflowKind, projectId }).then((markdown) => {
      if (mounted) setTenderMarkdown(markdown || '');
    }).catch((error) => {
      if (mounted) showToast(error instanceof Error ? error.message : '读取招标文件 Markdown 失败', 'error');
    });
    return () => {
      mounted = false;
    };
  }, [projectId, showToast, state.step, state.tenderFile, workflowKind]);

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
    window.yibiao?.technicalPlan.readOriginalPlanMarkdown({ workflowKind, projectId }).then((markdown) => {
      if (mounted) setOriginalPlanMarkdown(markdown || '');
    }).catch((error) => {
      if (mounted) showToast(error instanceof Error ? error.message : '读取原方案 Markdown 失败', 'error');
    });
    return () => {
      mounted = false;
    };
  }, [projectId, requiresOriginalPlan, showToast, state.originalPlanFile, workflowKind]);

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
        workflowKind,
        projectId,
        project_name: state.outlineData.project_name || projectName || state.projectName,
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
        filePath: result?.path || result?.filePath,
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
        workflowKind,
        projectId,
        exportMode: 'original-template',
        project_name: state.outlineData.project_name || projectName || state.projectName,
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
        filePath: result?.path || result?.filePath,
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
    const saved = await window.yibiao?.technicalPlan.saveChapterContent({ workflowKind, projectId, nodeId: item.id, content });
    if (saved) setState((prev) => ({ ...prev, ...saved }));
  };

  const resetTechnicalPlan = async () => {
    const confirmed = await confirm({
      title: '重置技术方案',
      description: '这会清空当前项目的招标文件、分析结果、目录和正文生成进度，此操作无法撤销。',
      confirmLabel: '确认重置',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const result = await window.yibiao?.technicalPlan.clear({ workflowKind, projectId });
      setState(result?.state || { ...resetState, workflowKind, projectId, projectName });
      setTenderMarkdown('');
      setOriginalPlanMarkdown('');
      showToast(result?.message || '技术方案已重置', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重置技术方案失败', 'error');
    }
  };

  const saveContentGenerationOptions = async (contentGenerationOptions: ContentGenerationOptions) => {
    const saved = await window.yibiao?.technicalPlan.saveContentGenerationOptions({ workflowKind, projectId, contentGenerationOptions });
    setState((prev) => ({ ...prev, ...(saved || {}), contentGenerationOptions }));
  };

  const saveGlobalFacts = async (globalFacts: GlobalFactGroupState[]) => {
    const saved = await window.yibiao?.technicalPlan.saveGlobalFacts({ workflowKind, projectId, globalFacts });
    setState((prev) => ({ ...prev, ...(saved || {}), globalFacts }));
  };

  const selectAllExpandItems = () => {
    setExpandSelectedItemIds(new Set(generatedLeaves.map((item) => item.id)));
  };

  const clearExpandSelection = () => {
    setExpandSelectedItemIds(new Set());
  };

  const toggleExpandSelection = (item: OutlineItem) => {
    const itemLeafIds = collectLeafItems([item])
      .map((leaf) => leaf.id)
      .filter((itemId) => generatedLeafIdSet.has(itemId));
    if (!itemLeafIds.length) {
      showToast('该目录下暂无已生成正文，不能扩写', 'info');
      return;
    }

    setExpandSelectedItemIds((prev) => {
      const next = new Set(prev);
      const allSelected = itemLeafIds.every((itemId) => next.has(itemId));
      for (const itemId of itemLeafIds) {
        if (allSelected) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
      }
      return next;
    });
  };

  const renderExpandTree = (items: OutlineItem[], level = 0): ReactNode => items.map((item) => {
    const leafItems = collectLeafItems([item]);
    const selectableLeafIds = leafItems.map((leaf) => leaf.id).filter((itemId) => generatedLeafIdSet.has(itemId));
    const selectedCount = selectableLeafIds.filter((itemId) => expandSelectedItemIds.has(itemId)).length;
    const isSelected = selectableLeafIds.length > 0 && selectedCount === selectableLeafIds.length;
    const isPartial = selectedCount > 0 && selectedCount < selectableLeafIds.length;
    const itemWords = leafItems.reduce((sum, leaf) => sum + countReadableWords(getLeafContent(leaf, state.contentGenerationSections)), 0);
    const isLeaf = !item.children?.length;
    const canPreview = isLeaf && Boolean(getLeafContent(item, state.contentGenerationSections).trim());

    return (
      <div className="content-outline-node" key={item.id} style={{ '--content-level': level } as CSSProperties}>
        <div className={`content-outline-item content-expand-select-item${isSelected ? ' is-selected' : ''}${isPartial ? ' is-partial' : ''}`}>
          <button
            type="button"
            className="content-expand-select-main"
            onClick={() => toggleExpandSelection(item)}
            disabled={!selectableLeafIds.length || isContentGenerating || isContentPaused}
          >
            <span className="content-expand-select-box" aria-hidden="true" />
            <span className="content-outline-text">
              <strong title={item.id}>{item.title || item.id || '未命名小节'}</strong>
              <small>{item.children?.length ? `${selectedCount}/${selectableLeafIds.length} 已选 · ${itemWords} 字` : `${selectableLeafIds.length ? '可扩写' : '未生成'} · ${itemWords} 字`}</small>
            </span>
            <em>{selectableLeafIds.length ? `${selectedCount}/${selectableLeafIds.length}` : '不可选'}</em>
          </button>
          {canPreview && (
            <button
              type="button"
              className="content-expand-preview-action"
              onClick={() => setPreviewExpandItemId(item.id)}
            >
              预览
            </button>
          )}
        </div>
        {item.children?.length ? renderExpandTree(item.children, level + 1) : null}
      </div>
    );
  });

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
      {projectId && (
        <section className="technical-project-context">
          <div>
            <span className="section-kicker">当前项目</span>
            <strong>{projectName || state.projectName || '技术方案项目'}</strong>
          </div>
          {onBackToProjects && (
            <button type="button" className="secondary-action" onClick={onBackToProjects}>
              返回项目列表
            </button>
          )}
        </section>
      )}
      {state.step === 'document-analysis' && (
        <DocumentAnalysisPage
          projectId={projectId}
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
          projectId={projectId}
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
          projectId={projectId}
          workflowKind={workflowKind}
          projectOverview={state.projectOverview}
          techRequirements={state.techRequirements}
          responseFileRequirements={state.responseFileRequirements}
          outlineMode={state.outlineMode}
          referenceKnowledgeDocumentIds={state.referenceKnowledgeDocumentIds}
          outlineData={state.outlineData}
          task={state.outlineGenerationTask}
          onOutlineConfigChange={(outlineMode, referenceKnowledgeDocumentIds) => {
            setState((prev) => ({ ...prev, outlineMode, referenceKnowledgeDocumentIds }));
            window.yibiao?.technicalPlan.saveOutlineConfig({ workflowKind, projectId, outlineMode, referenceKnowledgeDocumentIds }).then((saved) => {
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
            window.yibiao?.technicalPlan.saveOutline({ workflowKind, projectId, outlineData: nextOutlineData }).then((saved) => {
              setState((prev) => ({ ...prev, ...saved }));
            }).catch((error) => {
              showToast(error instanceof Error ? error.message : '保存目录失败', 'error');
            });
          }}
        />
      )}
      {state.step === 'global-facts' && (
        <GlobalFactsPage
          projectId={projectId}
          workflowKind={workflowKind}
          outlineData={state.outlineData}
          globalFacts={state.globalFacts}
          task={state.globalFactsTask}
          onGlobalFactsSaved={saveGlobalFacts}
        />
      )}
      {state.step === 'content-edit' && (
        <ContentEditPage
          projectId={projectId}
          workflowKind={workflowKind}
          originalPlanMarkdown={originalPlanMarkdown}
          outlineData={state.outlineData}
          task={state.contentGenerationTask}
          contentGenerationOptions={state.contentGenerationOptions}
          sections={state.contentGenerationSections}
          onSelectedItemChange={setContentEditSelectedItemId}
          onContentGenerationOptionsChange={saveContentGenerationOptions}
          onContentSaved={saveChapterContent}
        />
      )}
      {state.step === 'expand' && (
        <section className="plan-step-body content-expand-page">
          <div className="content-generation-command-bar">
            <div>
              <span className="section-kicker">STEP 06</span>
              <strong>扩写改写</strong>
              <p>对已生成正文做段落级加厚，优先补充机理、步骤、风险、验收和交付物。</p>
            </div>
            <div className="content-generation-stats" aria-label="继续扩写统计">
              <span><strong>{outlineLeaves.length}</strong> 个小节</span>
              <span><strong>{selectedExpandLeaves.length}</strong> 已选</span>
              <span><strong>{selectedExpandWords}</strong> 字</span>
            </div>
          </div>

          <div className="content-expand-workspace">
            <article className="analysis-result-card content-expand-main">
              <div className="analysis-result-head">
                <div className="content-expand-title-block">
                  <strong>继续扩写</strong>
                  <span>{requiresOriginalPlan ? '保留原方案事实和表达重点，只补深度。' : '保留当前章节结构，只补正文论证厚度。'}</span>
                </div>
                <div className="content-expand-task-actions">
                  {expandRunning && !expandStopping && (
                    <>
                      <button type="button" className="secondary-action" onClick={pauseExpand}>暂停</button>
                      <button type="button" className="secondary-action is-danger" onClick={stopExpand}>停止</button>
                    </>
                  )}
                  {expandPaused && <button type="button" className="primary-action" onClick={resumeExpand}>继续</button>}
                  {!expandRunning && !expandPaused && (
                    <button type="button" className="primary-action" onClick={startExpandOnly} disabled={!selectedExpandLeaves.length}>
                      {expandStopping ? '停止中...' : '开始继续扩写'}
                    </button>
                  )}
                  {expandStopping && <button type="button" className="secondary-action" disabled>停止中...</button>}
                </div>
              </div>

              <div className="content-expand-meta">
                <p className="content-generation-config-note content-expand-note">
                  扩写会跳过占位、纯表格、图片、Mermaid 和标注“定稿勿动”的内容；不会新增目录、不会重新生成整篇正文，也不会编造未提供的业绩、参数或承诺。
                </p>

                <div className="content-expand-status-strip">
                  <span className={`content-expand-status-badge is-${expandStatusClass}`}>
                    {taskStatusLabels[expandTaskStatus] || '未开始'}
                  </span>
                  <div className="content-expand-progress-summary">
                    <strong>{expandProgressText}</strong>
                    <span>{expandStatusDescription}</span>
                  </div>
                  <div className={`content-generation-progress-track is-expanding${expandRunning ? ' is-active' : ''}`} aria-label={`扩写进度 ${expandProgress}%`}>
                    <span style={{ width: `${Math.max(0, Math.min(100, expandProgress))}%` }} />
                  </div>
                  {expandDone && (
                    <button type="button" className="secondary-action" onClick={() => switchStep('content-edit')}>
                      返回上一步查看
                    </button>
                  )}
                </div>
              </div>

              <div className="content-expand-body">
                <section className="content-expand-selection-panel" aria-label="选择扩写小节">
                  <div className="content-expand-section-head">
                    <div className="content-expand-title-block">
                      <strong>选择扩写范围</strong>
                      <span>可从 STEP 05 当前小节进入，也可以在这里多选、全选目录小节。</span>
                    </div>
                    <div className="content-expand-selection-actions">
                      <button type="button" className="secondary-action" onClick={selectAllExpandItems} disabled={isContentGenerating || isContentPaused || !generatedLeaves.length}>全选</button>
                      <button type="button" className="secondary-action" onClick={clearExpandSelection} disabled={isContentGenerating || isContentPaused || !expandSelectedItemIds.size}>清空</button>
                    </div>
                  </div>
                  <div className="content-expand-tree">
                    {state.outlineData?.outline?.length ? renderExpandTree(state.outlineData.outline) : (
                      <p className="content-generation-config-note">暂无目录，请先完成目录生成。</p>
                    )}
                  </div>
                </section>

                <div className="content-generation-config-list content-expand-options">
                  <label className="content-generation-config-row">
                    <span>
                      <strong>目标总字数</strong>
                      <small>设为 0 时不追求总字数，只对所选章节跑一轮段落加厚。</small>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={expandTargetWords}
                      disabled={isContentGenerating || isContentPaused}
                      onChange={(event) => setExpandTargetWords(Math.max(0, Math.round(Number(event.target.value) || 0)))}
                    />
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>补充表格</strong>
                      <small>{expandTableOptions.find((option) => option.value === expandTableRequirement)?.description}</small>
                    </span>
                    <select
                      value={expandTableRequirement}
                      disabled={isContentGenerating || isContentPaused}
                      onChange={(event) => setExpandTableRequirement(event.target.value as ContentTableRequirement)}
                    >
                      {expandTableOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>扩写并发速度</strong>
                      <small>接口限流较严格时建议设为 1-3。</small>
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={expandConcurrency}
                      disabled={isContentGenerating || isContentPaused}
                      onChange={(event) => setExpandConcurrency(Math.max(1, Math.round(Number(event.target.value) || 1)))}
                    />
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>生成 Mermaid 图</strong>
                      <small>扩写完成后，为适合流程、结构、关系表达的小节补充 Mermaid 图。</small>
                    </span>
                    <input
                      type="checkbox"
                      className="content-expand-checkbox"
                      checked={expandUseMermaidImages}
                      disabled={isContentGenerating || isContentPaused}
                      onChange={(event) => setExpandUseMermaidImages(event.target.checked)}
                      aria-label="是否在扩写后生成 Mermaid 图"
                    />
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>生成技术图谱</strong>
                      <small>{expandTechnicalDiagramAvailable ? '扩写完成后，为适合架构、拓扑、数据流和复杂流程的小节补充技术图谱。' : '请先到 设置 > 技能管理 启用 technical-diagram。'}</small>
                    </span>
                    <input
                      type="checkbox"
                      className="content-expand-checkbox"
                      checked={expandUseTechnicalDiagrams && expandTechnicalDiagramAvailable}
                      disabled={isContentGenerating || isContentPaused || !expandTechnicalDiagramAvailable}
                      onChange={(event) => setExpandUseTechnicalDiagrams(event.target.checked)}
                      aria-label="是否在扩写后生成技术图谱"
                    />
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>使用 AI 生图</strong>
                      <small>{expandImageModelAvailable ? '扩写完成后择优生成少量图示。' : '生图模型不可用，请先到设置页配置。'}</small>
                    </span>
                    <input
                      type="checkbox"
                      className="content-expand-checkbox"
                      checked={expandUseAiImages && expandImageModelAvailable}
                      disabled={isContentGenerating || isContentPaused || !expandImageModelAvailable}
                      onChange={(event) => setExpandUseAiImages(event.target.checked)}
                      aria-label="是否在扩写后使用 AI 生图"
                    />
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>AI 图最大数量</strong>
                      <small>只在开启 AI 生图时生效，按所选章节择优分配。</small>
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={Math.max(1, selectedExpandLeaves.length)}
                      value={expandMaxAiImages}
                      disabled={isContentGenerating || isContentPaused || !expandUseAiImages || !expandImageModelAvailable}
                      onChange={(event) => setExpandMaxAiImages(Math.max(0, Math.min(Math.round(Number(event.target.value) || 0), Math.max(1, selectedExpandLeaves.length))))}
                    />
                  </label>
                  <label className="content-generation-config-row">
                    <span>
                      <strong>扩写后一致性审计</strong>
                      <small>检查新增内容是否与全局事实冲突。</small>
                    </span>
                    <input
                      type="checkbox"
                      className="content-expand-checkbox"
                      checked={expandConsistencyAudit}
                      disabled={isContentGenerating || isContentPaused}
                      onChange={(event) => setExpandConsistencyAudit(event.target.checked)}
                      aria-label="是否启用扩写后一致性审计"
                    />
                  </label>
                </div>
              </div>
            </article>
          </div>
        </section>
      )}

      <Dialog.Root
        open={Boolean(previewExpandItem)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewExpandItemId('');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-expand-preview-overlay" />
          <Dialog.Content className="content-expand-preview-card">
            <div className="content-regenerate-card-head">
              <span className="section-kicker">章节内容预览</span>
              <Dialog.Title>{previewExpandItem?.title || '未命名小节'}</Dialog.Title>
              <Dialog.Description>
                当前预览的是扩写前/扩写后的最新正文内容。
              </Dialog.Description>
            </div>
            <div className="markdown-viewer content-expand-preview-body">
              {previewExpandContent.trim() ? (
                <MarkdownRenderer>{previewExpandContent}</MarkdownRenderer>
              ) : (
                <p className="content-editor-empty">当前小节暂无正文内容。</p>
              )}
            </div>
            <div className="content-regenerate-actions">
              <Dialog.Close className="primary-action" type="button">关闭</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
                  ? `本次包含 ${exportProgress.mermaidCount} 张 Mermaid 图，导出时会在本地转换成 Word 图片，无需联网，图较多时可能需要稍等。`
                  : '正在将正文、表格和图片写入 Word 文档。'}
              </Dialog.Description>
            </div>
            <div className="export-progress-body">
              <div className="content-generation-progress-track" aria-label={`Word 导出进度 ${exportProgress.progress}%`}>
                <span style={{ width: `${exportProgress.progress}%` }} />
              </div>
              <p>{exportProgress.message || '正在处理导出任务，请稍候。'}</p>
              {!exportProgress.running && exportProgress.filePath && (
                <div className="export-file-path">
                  <span>生成路径</span>
                  <button
                    type="button"
                    title="点击打开文件所在文件夹"
                    onClick={async () => {
                      try {
                        await window.yibiao?.export.showExportFile(exportProgress.filePath!);
                      } catch (error) {
                        showToast(error instanceof Error ? error.message : '打开生成路径失败', 'error');
                      }
                    }}
                  >
                    {exportProgress.filePath}
                  </button>
                </div>
              )}
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

function TechnicalPlanHome({ workflowKind = 'technical-plan', onSectionChange }: TechnicalPlanHomeProps) {
  const { showToast } = useToast();
  const [projectList, setProjectList] = useState<TechnicalPlanProjectList | null>(null);
  const [activeProject, setActiveProject] = useState<TechnicalPlanProject | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [editingProjectName, setEditingProjectName] = useState('');
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState('');
  const [projectKeyword, setProjectKeyword] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const workflowTitle = workflowLabel(workflowKind);
  const projects = projectList?.projects || [];
  const normalizedProjectKeyword = projectKeyword.trim().toLowerCase();
  const filteredProjects = useMemo(() => {
    if (!normalizedProjectKeyword) return projects;
    return projects.filter((project) => {
      const searchText = [
        project.name,
        project.id,
        project.id === 'default' ? '历史项目 旧数据' : '',
        project.created_at ? new Date(project.created_at).toLocaleString('zh-CN', { hour12: false }) : '',
      ].join(' ').toLowerCase();
      return searchText.includes(normalizedProjectKeyword);
    });
  }, [normalizedProjectKeyword, projects]);
  const showProjectGuide = !loadingProjects;

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const nextList = await window.yibiao?.technicalPlan.listProjects(workflowKind);
      setProjectList(nextList || null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取技术方案项目失败', 'error');
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    setActiveProject(null);
    void loadProjects();
  }, [workflowKind]);

  const createProject = async () => {
    const projectName = newProjectName.trim();
    if (!projectName) {
      showToast('请先填写项目名称', 'info');
      return;
    }
    try {
      const result = await window.yibiao?.technicalPlan.createProject({ workflowKind, projectName });
      if (result?.projects) setProjectList(result.projects);
      if (result?.project) setActiveProject(result.project);
      setNewProjectName('');
      setCreateDialogOpen(false);
      showToast('项目已创建', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建项目失败', 'error');
    }
  };

  const enterProject = async (project: TechnicalPlanProject) => {
    try {
      await window.yibiao?.technicalPlan.switchProject({ workflowKind, projectId: project.id });
      setActiveProject(project);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '进入项目失败', 'error');
    }
  };

  const startRenameProject = (project: TechnicalPlanProject) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  const renameProject = async (project: TechnicalPlanProject) => {
    const name = editingProjectName.trim();
    if (!name || name === project.name) {
      setEditingProjectId('');
      setEditingProjectName('');
      return;
    }
    try {
      const nextList = await window.yibiao?.technicalPlan.renameProject({ workflowKind, projectId: project.id, name: name.trim() });
      if (nextList) setProjectList(nextList);
      if (activeProject?.id === project.id) setActiveProject({ ...project, name: name.trim() });
      setEditingProjectId('');
      setEditingProjectName('');
      showToast('项目名称已更新', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重命名项目失败', 'error');
    }
  };

  const deleteProject = async (project: TechnicalPlanProject) => {
    if (pendingDeleteProjectId !== project.id) {
      setPendingDeleteProjectId(project.id);
      return;
    }
    try {
      const nextList = await window.yibiao?.technicalPlan.deleteProject({ workflowKind, projectId: project.id });
      if (nextList) setProjectList(nextList);
      if (activeProject?.id === project.id) setActiveProject(null);
      setPendingDeleteProjectId('');
      showToast('项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error');
    }
  };

  if (activeProject) {
    return (
      <TechnicalPlanWorkbench
        workflowKind={workflowKind}
        projectId={activeProject.id}
        projectName={activeProject.name}
        onBackToProjects={() => {
          setActiveProject(null);
          void loadProjects();
        }}
        onSectionChange={onSectionChange}
      />
    );
  }

  return (
    <div className="page-stack technical-project-page">
      <section className="technical-project-hero">
        <div>
          <span className="section-kicker">{workflowTitle}</span>
          <strong>项目管理</strong>
          <p>为不同招投标项目分别保存上传文件、解析结果、目录、事实设定和正文内容。</p>
        </div>
      </section>

      {showProjectGuide && (
        <section className="technical-project-guide">
          <div className="technical-project-guide-main">
            <span className="section-kicker">项目工作区</span>
            <strong>{projects.length ? `当前已有 ${projects.length} 个项目` : '还没有可用项目'}</strong>
            <p>
              {projects.length
                ? '每个项目都是独立工作区。旧版单项目数据会自动识别成一个历史项目并保留名称，新项目建议按真实招投标项目命名。'
                : '创建项目后，会进入独立的技术方案工作流，项目数据会单独保存。'}
            </p>
            <div className="technical-project-guide-actions">
              <button type="button" className="primary-action" onClick={() => setCreateDialogOpen(true)}>
                创建新项目
              </button>
            </div>
          </div>
          <div className="technical-project-guide-grid">
            <article>
              <strong>项目隔离</strong>
              <span>每个项目独立保存招标文件、原方案、解析结果和正文。</span>
            </article>
            <article>
              <strong>旧数据保留</strong>
              <span>升级前的单项目数据会自动形成历史项目，可继续编辑和导出。</span>
            </article>
            <article>
              <strong>建议用法</strong>
              <span>一个招投标项目对应一个项目工作区，后续查找更清楚。</span>
            </article>
          </div>
        </section>
      )}

      {!loadingProjects && projects.length > 0 && (
        <section className="technical-project-toolbar" aria-label="项目检索">
          <input
            className="technical-project-search"
            value={projectKeyword}
            onChange={(event) => setProjectKeyword(event.target.value)}
            placeholder="搜索项目名称、历史项目或创建时间"
            aria-label="搜索项目"
          />
          <span>
            共 {projects.length} 个项目
            {normalizedProjectKeyword ? `，匹配 ${filteredProjects.length} 个` : ''}
          </span>
        </section>
      )}

      <section className="technical-project-list">
        {loadingProjects && <div className="markdown-empty-state">正在读取项目...</div>}
        {!loadingProjects && !projects.length && <div className="markdown-empty-state">暂无项目，先创建一个项目。</div>}
        {!loadingProjects && projects.length > 0 && !filteredProjects.length && <div className="markdown-empty-state">没有匹配的项目，换个关键词试试。</div>}
        {filteredProjects.map((project) => (
          <article className="technical-project-card" key={project.id}>
            <div>
              {editingProjectId === project.id ? (
                <input
                  className="technical-project-name-input"
                  value={editingProjectName}
                  onChange={(event) => setEditingProjectName(event.target.value)}
                  aria-label="编辑项目名称"
                />
              ) : (
                <strong>{project.name}</strong>
              )}
              <p>{project.id === 'default' ? '历史项目，承接旧版单项目数据' : `创建时间：${new Date(project.created_at).toLocaleString('zh-CN', { hour12: false })}`}</p>
            </div>
            <div className="technical-project-actions">
              {editingProjectId === project.id ? (
                <>
                  <button type="button" className="secondary-action" onClick={() => renameProject(project)}>
                    保存
                  </button>
                  <button type="button" className="secondary-action" onClick={() => setEditingProjectId('')}>
                    取消
                  </button>
                </>
              ) : (
                <button type="button" className="secondary-action" onClick={() => startRenameProject(project)}>
                  重命名
                </button>
              )}
              {project.id !== 'default' && (
                <button type="button" className="secondary-action danger-action" onClick={() => deleteProject(project)}>
                  {pendingDeleteProjectId === project.id ? '确认删除' : '删除'}
                </button>
              )}
              <button type="button" className="primary-action" onClick={() => enterProject(project)}>
                进入项目
              </button>
            </div>
          </article>
        ))}
      </section>

      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="technical-project-create-card">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createProject();
              }}
            >
              <div className="content-regenerate-card-head">
                <span className="section-kicker">{workflowTitle}</span>
                <Dialog.Title>创建项目</Dialog.Title>
                <Dialog.Description>
                  填写项目名称后进入技术方案工作流，后续上传文件、解析结果、目录和正文都会保存在该项目中。
                </Dialog.Description>
              </div>
              <label className="technical-project-create-field">
                <span>项目名称</span>
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="例如：某某系统建设项目"
                  autoFocus
                />
              </label>
              <div className="content-regenerate-actions">
                <Dialog.Close className="secondary-action" type="button" onClick={() => setNewProjectName('')}>
                  取消
                </Dialog.Close>
                <button type="submit" className="primary-action">
                  确认创建
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default TechnicalPlanHome;
