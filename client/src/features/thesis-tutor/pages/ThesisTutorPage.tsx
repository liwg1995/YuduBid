import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { AgentHostStatus, AgentRunResult } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import { useToast } from '../../../shared/ui/ToastProvider';
import AgentFloatingPanel from '../../../shared/ui/AgentFloatingPanel';
import '../thesisTutor.css';
import { ThesisTutorChapterWorkspace } from '../components/ThesisTutorChapterWorkspace';
import { ThesisTutorCheckWorkspace } from '../components/ThesisTutorCheckWorkspace';
import { ThesisTutorFeedbackWorkspace } from '../components/ThesisTutorFeedbackWorkspace';
import { ThesisTutorGenerationWorkspace } from '../components/ThesisTutorGenerationWorkspace';
import { ThesisTutorGuidance } from '../components/ThesisTutorGuidance';
import { ThesisTutorHeader } from '../components/ThesisTutorHeader';
import { ThesisTutorProfilePanel } from '../components/ThesisTutorProfilePanel';
import { ThesisTutorReferenceWorkspace } from '../components/ThesisTutorReferenceWorkspace';
import { ThesisTutorResultWorkspace } from '../components/ThesisTutorResultWorkspace';
import { ThesisTutorSidebar } from '../components/ThesisTutorSidebar';
import { ThesisTutorProgressCard } from '../components/ThesisTutorStatusCards';
import { useThesisTutorFlow } from '../hooks/useThesisTutorFlow';
import { useThesisTutorHistory } from '../hooks/useThesisTutorHistory';
import { useThesisTutorLifecycle } from '../hooks/useThesisTutorLifecycle';
import { useThesisTutorOperations } from '../hooks/useThesisTutorOperations';
import { useThesisTutorProjectIO } from '../hooks/useThesisTutorProjectIO';
import { useThesisTutorWorkspaces } from '../hooks/useThesisTutorWorkspaces';
import type {
  ThesisTutorCheckItem,
  ThesisTutorCheckStatus,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorState,
} from '../types';

export type ThesisTutorInitialPanel = ThesisTutorPanel;

interface ThesisTutorPageProps {
  initialPanel?: ThesisTutorInitialPanel;
  onNavigate?: (section: SectionId) => void;
}

import {
  buildDataPreflight,
  buildDraftingPreflight,
  buildFinalReviewGate,
  chartTemplates,
  createLocalCheckItem,
  defaultProfile,
  feedbackEnabledPanels,
  getNextPanel,
  panelCopy,
  panelOrder,
  referenceEnabledPanels,
} from '../model/thesisTutorPageModel';

function ThesisTutorPage({ initialPanel = 'diagnosis', onNavigate }: ThesisTutorPageProps) {
  const { showToast } = useToast();
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const supportWorkspaceRef = useRef<HTMLDetailsElement | null>(null);
  const referenceWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ThesisTutorState | null>(null);
  const [profile, setProfile] = useState<ThesisTutorProfile>(defaultProfile);
  const [activePanel, setActivePanel] = useState<ThesisTutorPanel>(initialPanel);
  const [userInput, setUserInput] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentHostStatus | null>(null);
  const [agentRun, setAgentRun] = useState<AgentRunResult | null>(null);
  const [agentPlanning, setAgentPlanning] = useState(false);
  const [agentConfirmOpen, setAgentConfirmOpen] = useState(false);
  const [agentContinuousConfirmOpen, setAgentContinuousConfirmOpen] = useState(false);
  const [agentContinuousStatus, setAgentContinuousStatus] = useState<'idle' | 'running' | 'paused' | 'blocked' | 'completed'>('idle');
  const [agentContinuousMessage, setAgentContinuousMessage] = useState('一次确认后，按论文十阶段连续生成工作稿。');
  const [agentContinuousCycle, setAgentContinuousCycle] = useState(0);
  const agentContinuousLaunchingRef = useRef(false);
  const agentContinuousPersistenceReadyRef = useRef(false);
  const {
    chapters,
    setChapters,
    activeChapterId,
    setActiveChapterId,
    activeChapter,
    references,
    setReferences,
    activeReferenceId,
    setActiveReferenceId,
    activeReference,
    feedbackItems,
    setFeedbackItems,
    activeFeedbackId,
    setActiveFeedbackId,
    activeFeedback,
    checkItems,
    setCheckItems,
    activeCheckId,
    setActiveCheckId,
    activeCheck,
    syncWorkspaces,
    resetWorkspaces,
    updateActiveChapter,
    selectChapter,
    addChapter,
    createChaptersFromOutline,
    saveChapterWorkspace,
    updateActiveReference,
    addReference,
    removeActiveReference,
    fillReferenceFromSource,
    toggleReferenceChapter,
    saveReferenceWorkspace,
    updateActiveFeedback,
    addFeedback,
    removeActiveFeedback,
    fillFeedbackFromSource,
    toggleFeedbackChapter,
    saveFeedbackWorkspace,
    updateActiveCheck,
    addCheckItem,
    removeActiveCheck,
    fillCheckFromSource,
    saveCheckWorkspace,
  } = useThesisTutorWorkspaces({
    activePanel,
    profile,
    sourceText,
    setDraft,
    setState,
    setSaving,
    showToast,
  });
  const {
    loading,
    missingTextModelFields,
    exportProgress,
    setExportProgress,
    operationProgress,
    startOperationProgress,
    finishOperationProgress,
    clearAll,
  } = useThesisTutorLifecycle({
    initialPanel,
    setState,
    setProfile,
    setActivePanel,
    setSourceText,
    setDraft,
    setUserInput,
    setSaving,
    syncWorkspaces,
    resetWorkspaces,
    showToast,
  });
  const [historyPanelFilter, setHistoryPanelFilter] = useState<ThesisTutorPanel | 'all'>('all');
  const [historyImportantOnly, setHistoryImportantOnly] = useState(false);
  const [profilePanelExpanded, setProfilePanelExpanded] = useState(false);
  const [selectedChartTemplateIds, setSelectedChartTemplateIds] = useState<string[]>([]);

  const panel = panelCopy[activePanel];
  const task = state?.task;
  const isRunning = task?.status === 'running';
  const profileLocked = Boolean(state?.profileLocked);
  const taskProgress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
  const result = draft || state?.latestResult || '';
  const panelResults = state?.panelResults || {};
  const completedPanels = panelOrder.filter((item) => Boolean(panelResults[item]?.content));
  const priorResultCount = panelOrder
    .filter((item) => item !== activePanel && Boolean(panelResults[item]?.content))
    .length;
  const showReferenceWorkspace = referenceEnabledPanels.has(activePanel);
  function openReference(id: string) {
    const exists = references.some((reference) => reference.id === id);
    if (exists) setActiveReferenceId(id);
    else showToast('证据链中没有该编号，请补录或修改正文标记', 'info');
    if (supportWorkspaceRef.current) supportWorkspaceRef.current.open = true;
    requestAnimationFrame(() => {
      referenceWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (exists) referenceWorkspaceRef.current?.querySelector<HTMLSelectElement>('.thesis-tutor-reference-toolbar select')?.focus({ preventScroll: true });
    });
  }
  const showFeedbackWorkspace = feedbackEnabledPanels.has(activePanel);
  const showCheckWorkspace = activePanel === 'format';
  const chapterSummary = activePanel === 'drafting' || activePanel === 'writing'
    ? `当前章节：${activeChapter?.title || '未选择'}`
    : '';
  const referenceSummary = showReferenceWorkspace
    ? `证据条目：${references.length || '未添加'}`
    : '';
  const feedbackSummary = showFeedbackWorkspace
    ? `反馈任务：${feedbackItems.filter((item) => item.status !== 'done').length || '无待处理'}`
    : '';
  const checkSummary = showCheckWorkspace
    ? `检查项：${checkItems.filter((item) => item.status !== 'fixed').length || '无待处理'}`
    : '';
  const filteredHistory = useMemo(() => {
    const history = state?.history || [];
    return history.filter((item) => (
      (historyPanelFilter === 'all' || item.panel === historyPanelFilter)
      && (!historyImportantOnly || item.important)
    ));
  }, [state?.history, historyPanelFilter, historyImportantOnly]);
  const profileContextItems = useMemo(() => [
    `学位：${profile.degree}/${profile.degreeType}`,
    `专业：${profile.discipline.trim() || '未填写'}`,
    `方向：${profile.direction.trim() || '未填写'}`,
    `阶段：${profile.stage}`,
    `引用：${profile.citationFormat}`,
    profile.title.trim() ? `题目：${profile.title.trim()}` : '题目：未定题',
    chapterSummary,
    referenceSummary,
    feedbackSummary,
    checkSummary,
  ].filter(Boolean), [profile, chapterSummary, referenceSummary, feedbackSummary, checkSummary]);
  const draftingPreflight = useMemo(() => buildDraftingPreflight({
    profile,
    sourceText,
    chapters,
    references,
    activeChapter,
    feedbackItems,
  }), [profile, sourceText, chapters, references, activeChapter, feedbackItems]);
  const dataPreflight = useMemo(() => buildDataPreflight({
    profile,
    sourceText,
    references,
  }), [profile, sourceText, references]);
  const finalReviewGate = useMemo(() => buildFinalReviewGate({
    profile,
    chapters,
    references,
    feedbackItems,
    checkItems,
    dataPreflight,
  }), [profile, chapters, references, feedbackItems, checkItems, dataPreflight]);
  const profileCompletionItems = [
    profile.degree,
    profile.degreeType,
    profile.discipline,
    profile.direction,
    profile.language,
    profile.stage,
    profile.citationFormat,
    profile.title,
    profile.schoolRequirements,
    profile.advisorPreferences,
    profile.milestones,
    profile.dataSources,
    profile.researchType,
    profile.targetWordCount,
    profile.writingScope,
    profile.dataIntegrityNotes,
    profile.researchQuestions,
    profile.methodologyNotes,
    profile.outlinePlan,
    profile.literatureNotes,
  ];
  const profileCompletion = Math.round((profileCompletionItems.filter((item) => String(item || '').trim()).length / profileCompletionItems.length) * 100);
  const chapterDoneCount = chapters.filter((chapter) => chapter.status === 'done').length;
  const chapterActiveCount = chapters.filter((chapter) => chapter.status === 'writing' || chapter.status === 'drafted' || chapter.status === 'needs_revision').length;
  const openFeedbackCount = feedbackItems.filter((item) => item.status !== 'done' && item.status !== 'deferred').length;
  const highPriorityFeedbackCount = feedbackItems.filter((item) => item.priority === 'high' && item.status !== 'done').length;
  const openCheckCount = checkItems.filter((item) => item.status === 'unchecked' || item.status === 'issue_found').length;
  const severeCheckCount = checkItems.filter((item) => item.severity === 'high' && item.status !== 'fixed').length;
  const overviewHealthLabel = profileCompletion >= 70 && completedPanels.length >= 3
    ? '项目上下文较完整'
    : profileCompletion >= 45 || completedPanels.length >= 2
      ? '项目正在成型'
      : '建议先补档案';
  const isFirstRun = !completedPanels.length
    && !state?.history?.length
    && !sourceText.trim()
    && !draft.trim()
    && !chapters.length
    && !references.length
    && !feedbackItems.length
    && !checkItems.length;

  const {
    saveProfile,
    toggleProfileLock,
    generate,
    saveDraft,
    importSource,
    exportWord,
    copyResult,
  } = useThesisTutorOperations({
    activePanel,
    panel,
    profile,
    profileLocked,
    userInput,
    sourceText,
    draft,
    result,
    panelResults,
    completedPanels,
    draftingPreflight,
    dataPreflight,
    chapters,
    activeChapterId,
    activeChapter,
    references,
    activeReferenceId,
    activeReference,
    feedbackItems,
    activeFeedbackId,
    activeFeedback,
    checkItems,
    activeCheckId,
    activeCheck,
    setState,
    setDraft,
    setSourceText,
    setSaving,
    setExportProgress,
    syncWorkspaces,
    startOperationProgress,
    finishOperationProgress,
    showToast,
  });
  const generateRef = useRef(generate);
  useEffect(() => {
    generateRef.current = generate;
  }, [generate]);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.agent.getStatus().then((status) => mounted && setAgentStatus(status)).catch(() => mounted && setAgentStatus(null));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setAgentRun(null);
    setAgentConfirmOpen(false);
  }, [state?.updated_at]);

  useEffect(() => {
    agentContinuousPersistenceReadyRef.current = false;
    const agentBridge = window.yibiao?.agent;
    if (!agentBridge || !agentStatus?.enabled) return;
    let mounted = true;
    agentBridge.getContinuousRun({ workflowKind: 'thesis-tutor', projectId: 'workspace' }).then((run) => {
      if (!mounted) return;
      if (run) {
        setAgentContinuousStatus(run.status);
        setAgentContinuousMessage(run.status === 'running' ? '正在恢复上次连续执行并检查论文阶段…' : run.message);
      }
      agentContinuousPersistenceReadyRef.current = true;
    }).catch(() => { if (mounted) agentContinuousPersistenceReadyRef.current = true; });
    return () => { mounted = false; };
  }, [agentStatus?.enabled]);

  useEffect(() => {
    const agentBridge = window.yibiao?.agent;
    if (!agentBridge || agentContinuousStatus === 'idle' || !agentContinuousPersistenceReadyRef.current) return;
    agentBridge.saveContinuousRun({ workflowKind: 'thesis-tutor', projectId: 'workspace', status: agentContinuousStatus, message: agentContinuousMessage }).catch(() => undefined);
  }, [agentContinuousMessage, agentContinuousStatus]);

  const thesisAgentLabels: Record<string, string> = {
    'load-workspace': '打开论文导师工作区', 'wait-active-task': '等待当前任务完成', 'complete-profile': '完善论文档案', 'review-and-export': '人工复核并导出',
    ...Object.fromEntries(panelOrder.map((item) => [`generate-${item}`, `生成${panelCopy[item].label}工作稿`])),
  };

  async function planThesisNextStep() {
    setAgentPlanning(true); setAgentRun(null);
    try {
      const nextRun = await window.yibiao?.agent.runShadow({ goal: '检查当前论文工作区并推荐一个安全的下一步', context: { workflowKind: 'thesis-tutor' } });
      if (nextRun) setAgentRun(nextRun);
      showToast('论文导师 Agent 已完成下一步规划', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '论文导师 Agent 规划失败', 'error'); }
    finally { setAgentPlanning(false); }
  }

  function requestThesisAgentExecution() {
    const action = agentRun?.shadowEvaluation?.agentAction || '';
    if (action === 'wait-active-task') { showToast('当前已有论文生成任务运行', 'info'); return; }
    if (action === 'complete-profile') { setProfilePanelExpanded(true); showToast('请先完善并保存论文档案', 'info'); return; }
    if (action === 'review-and-export') { switchPanel('format'); showToast('请核验文献、数据、反馈与检查项后导出', 'info'); return; }
    const nextPanel = panelOrder.find((item) => action === `generate-${item}`);
    if (!nextPanel) return;
    if (nextPanel !== activePanel) switchPanel(nextPanel);
    setAgentConfirmOpen(true);
  }

  async function executeThesisAgentRecommendation() {
    setAgentConfirmOpen(false);
    await generate();
    setAgentRun(null);
  }

  function requestThesisContinuousRun() {
    if (!profile.discipline.trim() || (!profile.direction.trim() && !profile.title.trim())) {
      setProfilePanelExpanded(true);
      showToast('请先填写专业，并补充研究方向或论文题目', 'info');
      return;
    }
    if (!userInput.trim() && !sourceText.trim()) {
      showToast('请先填写本次任务要求或导入论文材料', 'info');
      return;
    }
    if (missingTextModelFields.length) {
      showToast(`请先配置${missingTextModelFields.join('、')}`, 'info');
      return;
    }
    setAgentContinuousConfirmOpen(true);
  }

  function confirmThesisContinuousRun() {
    setAgentContinuousConfirmOpen(false);
    setAgentRun(null);
    setAgentContinuousStatus('running');
    setAgentContinuousMessage('正在检查论文十阶段已有成果…');
  }

  function pauseThesisContinuousRun() {
    setAgentContinuousStatus('paused');
    setAgentContinuousMessage('连续执行已暂停；当前论文任务完成后，不会自动启动下一阶段。');
  }

  useEffect(() => {
    if (agentContinuousStatus !== 'running' || loading || !state || agentContinuousLaunchingRef.current) return;
    if (isRunning || saving) {
      setAgentContinuousMessage('正在等待当前论文生成任务完成…');
      return;
    }
    const nextPanel = panelOrder.find((item) => !panelResults[item]?.content?.trim());
    if (!nextPanel) {
      setAgentContinuousStatus('completed');
      setAgentContinuousMessage('论文十阶段工作稿已完成，请核验文献、数据、引用和检查项后再导出。');
      switchPanel('format');
      showToast('论文导师 Agent 连续执行已完成，请进行学术核验', 'success');
      return;
    }
    if (activePanel !== nextPanel) {
      switchPanel(nextPanel);
      setAgentContinuousCycle((cycle) => cycle + 1);
      return;
    }
    agentContinuousLaunchingRef.current = true;
    setAgentContinuousMessage(`正在执行：${thesisAgentLabels[`generate-${nextPanel}`]}`);
    void generateRef.current().then((success) => {
      if (!success) {
        setAgentContinuousStatus('blocked');
        setAgentContinuousMessage(`${panelCopy[nextPanel].label}生成失败，已停止连续执行。`);
      }
    }).finally(() => {
      agentContinuousLaunchingRef.current = false;
      setAgentContinuousCycle((cycle) => cycle + 1);
    });
  }, [activePanel, agentContinuousCycle, agentContinuousStatus, isRunning, loading, panelResults, saving, state]);

  const { exportWorkspace, exportProjectPackage, importWorkspace } = useThesisTutorProjectIO({
    setState,
    setProfile,
    setActivePanel,
    setSourceText,
    setDraft,
    setUserInput,
    setSaving,
    syncWorkspaces,
    navigateToPanel: (nextPanel) => onNavigate?.(panelCopy[nextPanel].section),
    startOperationProgress,
    finishOperationProgress,
    showToast,
  });

  const { restoreHistoryItem, renameHistoryItem, toggleHistoryImportant, removeHistoryItem } = useThesisTutorHistory({
    state,
    setState,
    setDraft,
    setActivePanel,
    setUserInput,
    navigateToPanel: (nextPanel) => onNavigate?.(panelCopy[nextPanel].section),
    showToast,
  });

  const nextActionLabel = useMemo(() => {
    if (activePanel === 'diagnosis') return '生成诊断简报';
    if (activePanel === 'topic') return '生成选题方案';
    if (activePanel === 'literature') return '生成文献策略';
    if (activePanel === 'methodology') return '生成研究设计';
    if (activePanel === 'data') return '生成数据预检';
    if (activePanel === 'charts') return '生成图表方案';
    if (activePanel === 'drafting') return '生成论文初稿';
    if (activePanel === 'writing') return '生成写作/批注';
    if (activePanel === 'review') return '生成评审方案';
    return '生成检查建议';
  }, [activePanel]);
  const nextPanel = getNextPanel(activePanel);
  const {
    getMaterialExtractLabel,
    extractMaterialToWorkspace,
    carryResultToNextPanel,
    settleTopicToProfile,
    settleResultToReferences,
    settleResultToFeedback,
    settleResultToChecks,
  } = useThesisTutorFlow({
    activePanel,
    nextPanel,
    panel,
    profile,
    profileLocked,
    sourceText,
    result,
    importedSourceFileName: state?.importedSourceFileName,
    chapters,
    activeChapter,
    references,
    feedbackItems,
    checkItems,
    setState,
    setProfile,
    setSourceText,
    setUserInput,
    setSaving,
    setChapters,
    setActiveChapterId,
    setReferences,
    setActiveReferenceId,
    setFeedbackItems,
    setActiveFeedbackId,
    setCheckItems,
    setActiveCheckId,
    switchPanel,
    showToast,
  });

  function updateProfile<K extends keyof ThesisTutorProfile>(key: K, value: ThesisTutorProfile[K]) {
    if (profileLocked) return;
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function createDefaultCheckItems() {
    const defaults: Array<Partial<ThesisTutorCheckItem> & { title: string }> = [
      { category: 'format', title: '标题层级、编号和目录一致性', severity: 'high', suggestion: '核对章节标题、目录编号、图表编号和正文标题是否一致。' },
      { category: 'citation', title: '正文引用与参考文献对应关系', severity: 'high', suggestion: '逐条核对正文引用是否进入参考文献列表，参考文献是否在正文出现。' },
      { category: 'citation', title: '参考文献格式', severity: 'medium', suggestion: `按 ${profile.citationFormat || '学校要求'} 检查作者、年份、题名、期刊、页码、DOI 或链接格式。` },
      { category: 'duplication', title: '重复表达和套话段落', severity: 'medium', suggestion: '标记重复定义、重复背景介绍和泛泛表述，合并或改为具体论证。' },
      { category: 'ai_tone', title: 'AI 味与空泛表达', severity: 'medium', suggestion: '检查“具有重要意义”“显著提升”等泛化表达，替换为材料支撑的具体表述。' },
      { category: 'logic', title: '段落衔接和论证闭环', severity: 'high', suggestion: '检查每节是否有问题提出、证据支撑、分析解释和小结回扣。' },
    ];

    const riskyReferenceCount = references.filter((reference) => reference.verificationStatus !== 'verified').length;
    const openFeedbackCount = feedbackItems.filter((item) => item.status !== 'done' && item.status !== 'deferred').length;
    const draftedChapterCount = chapters.filter((chapter) => chapter.draft.trim() || chapter.status === 'drafted' || chapter.status === 'done').length;
    const dynamicChecks: Array<Partial<ThesisTutorCheckItem> & { title: string }> = [
      references.length === 0
        ? { category: 'citation', title: '缺少文献与证据链', severity: 'high', suggestion: '先在文献与证据链中录入真实文献、政策、案例或数据证据，避免正文无依据。' }
        : riskyReferenceCount > 0
          ? { category: 'citation', title: '待核验或慎用证据处理', severity: 'high', suggestion: `当前仍有 ${riskyReferenceCount} 条证据未标记为已核验。正式正文引用前，请补核验来源和备注。` }
          : { category: 'citation', title: '已核验证据使用一致性', severity: 'medium', suggestion: '检查已核验证据是否在正文中有明确用途，避免参考文献堆砌。' },
      dataPreflight.tone !== 'ready'
        ? { category: 'logic', title: '数据真实性与实证边界', severity: 'high', suggestion: `${dataPreflight.summary} 终稿中不得提前写确定性统计结论。` }
        : { category: 'logic', title: '数据分析结果与文字一致', severity: 'high', suggestion: '检查描述统计、相关/回归/访谈编码等结论是否与真实数据或分析结果一致。' },
      chapters.length === 0 || draftedChapterCount === 0
        ? { category: 'logic', title: '章节草稿完整性', severity: 'high', suggestion: '当前章节草稿不足，建议先自动成稿或逐章写作，再进入终稿审查。' }
        : { category: 'logic', title: '章节内容完整性', severity: 'medium', suggestion: `检查 ${draftedChapterCount}/${chapters.length} 个已有章节是否覆盖研究问题、文献、方法、分析和结论。` },
      openFeedbackCount > 0
        ? { category: 'other', title: '导师反馈关闭情况', severity: 'high', suggestion: `还有 ${openFeedbackCount} 条导师反馈未关闭，提交前请逐项处理或记录暂缓原因。` }
        : { category: 'other', title: '导师反馈回看', severity: 'medium', suggestion: '回看导师反馈闭环，确认已处理意见在正文中有对应修改。' },
      { category: 'format', title: '封面、摘要、关键词、目录和致谢完整性', severity: 'medium', suggestion: '按学校模板检查封面信息、摘要关键词、目录、致谢、声明页等是否齐全。' },
    ].filter(Boolean) as Array<Partial<ThesisTutorCheckItem> & { title: string }>;

    const existingTitles = new Set(checkItems.map((item) => item.title.trim()));
    const nextChecks = [...defaults, ...dynamicChecks]
      .filter((item) => !existingTitles.has(item.title.trim()))
      .map((item) => ({
      ...createLocalCheckItem(item.title),
      ...item,
      status: 'unchecked' as ThesisTutorCheckStatus,
    }));
    if (!nextChecks.length) {
      showToast('终稿审查清单已经比较完整，可继续手动新增单项检查', 'info');
      return;
    }
    const mergedChecks = [...checkItems, ...nextChecks];
    setCheckItems(mergedChecks);
    setActiveCheckId(nextChecks[0]?.id || mergedChecks[0]?.id || '');
    showToast(checkItems.length ? `已补充 ${nextChecks.length} 项终稿审查` : '已生成终稿审查清单', 'success');
  }

  function handleMainWheelCapture(event: WheelEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    const container = mainScrollRef.current;
    if (!container) {
      return;
    }

    const canTextareaScroll = target.scrollHeight > target.clientHeight + 1;
    const scrollingDown = event.deltaY > 0;
    const scrollingUp = event.deltaY < 0;
    const textareaAtTop = target.scrollTop <= 0;
    const textareaAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
    const shouldMoveContainer = !canTextareaScroll
      || (scrollingDown && textareaAtBottom)
      || (scrollingUp && textareaAtTop);

    if (!shouldMoveContainer) {
      return;
    }

    container.scrollTop += event.deltaY;
    event.preventDefault();
  }

  function switchPanel(nextPanel: ThesisTutorPanel) {
    setActivePanel(nextPanel);
    setProfilePanelExpanded(false);
    const nextResult = panelResults[nextPanel];
    if (nextResult?.content) {
      setDraft(nextResult.content);
      setUserInput(nextResult.input || '');
    } else if ((nextPanel === 'drafting' || nextPanel === 'writing') && activeChapter?.draft) {
      setDraft(activeChapter.draft);
      setUserInput('');
    } else {
      setDraft('');
      setUserInput('');
    }
    onNavigate?.(panelCopy[nextPanel].section);
  }

  function startDiagnosisTemplate() {
    setActivePanel('diagnosis');
    setProfilePanelExpanded(false);
    setUserInput('我是（学位/专业），目前处在（没方向/有方向/已定题/写作中）阶段，距离开题或答辩还有（时间），主要卡点是（选题/文献/方法/写作/格式）。请先帮我做启动诊断。');
    onNavigate?.(panelCopy.diagnosis.section);
    showToast('已填入启动诊断模板，请按你的情况改一下再生成', 'success');
  }

  function toggleChartTemplate(templateId: string) {
    setSelectedChartTemplateIds((current) => (
      current.includes(templateId)
        ? current.filter((item) => item !== templateId)
        : [...current, templateId]
    ));
  }

  function applySelectedChartTemplates() {
    const selectedTemplates = chartTemplates.filter((template) => selectedChartTemplateIds.includes(template.id));
    if (!selectedTemplates.length) {
      showToast('请先选择至少一个图形模板', 'info');
      return;
    }
    setActivePanel('charts');
    setProfilePanelExpanded(false);
    setUserInput([
      `请基于论文档案和下方 ${selectedTemplates.length} 个图形模板，生成一组论文图表。`,
      '要求每个图都输出 Mermaid 代码块、图名图注、适用章节、节点解释和可修改项；未核验关系请标注“待核验”。',
      '',
      selectedTemplates.map((template, index) => `${index + 1}. ${template.title}：${template.description}`).join('\n'),
    ].join('\n'));
    setSourceText((current) => {
      const currentText = current.trim();
      const nextText = selectedTemplates.map((template) => `## ${template.title}\n${template.sourceText.trim()}`).join('\n\n---\n\n');
      return currentText ? `${currentText}\n\n---\n\n${nextText}` : nextText;
    });
    setDraft(selectedTemplates.map((template) => template.draft).join('\n\n---\n\n'));
    onNavigate?.(panelCopy.charts.section);
    showToast(`已填入 ${selectedTemplates.length} 个图形模板，可直接编辑 Mermaid 或点击生成优化`, 'success');
  }

  if (loading) {
    return <div className="thesis-tutor-page"><div className="thesis-tutor-panel">正在加载论文导师...</div></div>;
  }

  return (
    <div className="thesis-tutor-page" ref={mainScrollRef} onWheelCapture={handleMainWheelCapture}>
      <ThesisTutorHeader
        panel={panel}
        saving={saving}
        isRunning={isRunning}
        exportProjectPackage={exportProjectPackage}
        exportWorkspace={exportWorkspace}
        importWorkspace={importWorkspace}
        clearAll={clearAll}
      />

      {agentStatus?.enabled && (
        <AgentFloatingPanel label="论文导师 Agent" className="thesis-tutor-agent-panel">
          <div><span className="thesis-tutor-kicker">论文导师 Agent</span><strong>{agentContinuousStatus !== 'idle' ? `连续执行：${agentContinuousStatus === 'running' ? '进行中' : agentContinuousStatus === 'paused' ? '已暂停' : agentContinuousStatus === 'blocked' ? '需要处理' : '已完成'}` : agentRun?.shadowEvaluation?.agentAction ? `建议：${thesisAgentLabels[agentRun.shadowEvaluation.agentAction] || agentRun.shadowEvaluation.agentAction}` : '检查论文十阶段并安排下一步'}</strong><p>{agentContinuousStatus !== 'idle' ? agentContinuousMessage : agentRun?.recommendation || 'Agent 可以规划单步，也可以按现有论文档案和材料连续推进。'}</p></div>
          <div className="thesis-tutor-agent-actions">{agentContinuousStatus === 'running' ? <button type="button" className="secondary-action" onClick={pauseThesisContinuousRun}>暂停连续执行</button> : <button type="button" className="primary-action" onClick={requestThesisContinuousRun} disabled={loading || isRunning}>{agentContinuousStatus === 'paused' || agentContinuousStatus === 'blocked' ? '继续连续执行' : agentContinuousStatus === 'completed' ? '检查未完成项' : '连续执行'}</button>}<button type="button" className="secondary-action" onClick={() => void planThesisNextStep()} disabled={agentPlanning || isRunning}>{agentPlanning ? '规划中...' : agentRun ? '重新规划' : '规划下一步'}</button>{agentRun?.shadowEvaluation?.agentAction && <button type="button" className="primary-action" onClick={requestThesisAgentExecution} disabled={isRunning}>执行建议</button>}</div>
        </AgentFloatingPanel>
      )}

      <ThesisTutorGuidance
        missingTextModelFields={missingTextModelFields}
        isFirstRun={isFirstRun}
        saving={saving}
        isRunning={isRunning}
        navigateToSettings={() => onNavigate?.('settings')}
        startDiagnosisTemplate={startDiagnosisTemplate}
        importSource={importSource}
        generate={generate}
      />

      <ThesisTutorProfilePanel
        activePanel={activePanel}
        profile={profile}
        profileLocked={profileLocked}
        expanded={profilePanelExpanded}
        saving={saving}
        isRunning={isRunning}
        setExpanded={setProfilePanelExpanded}
        updateProfile={updateProfile}
        saveProfile={saveProfile}
        toggleProfileLock={toggleProfileLock}
        returnToDiagnosis={() => switchPanel('diagnosis')}
      />

      <main className="thesis-tutor-layout">
        <section className="thesis-tutor-main">
          <ThesisTutorGenerationWorkspace
            activePanel={activePanel}
            panel={panel}
            selectedChartTemplateIds={selectedChartTemplateIds}
            profileContextItems={profileContextItems}
            priorResultCount={priorResultCount}
            draftingPreflight={draftingPreflight}
            dataPreflight={dataPreflight}
            userInput={userInput}
            sourceText={sourceText}
            importedSourceFileName={state?.importedSourceFileName}
            nextActionLabel={nextActionLabel}
            materialExtractLabel={getMaterialExtractLabel()}
            isRunning={isRunning}
            saving={saving}
            setSelectedChartTemplateIds={setSelectedChartTemplateIds}
            setUserInput={setUserInput}
            setSourceText={setSourceText}
            toggleChartTemplate={toggleChartTemplate}
            applySelectedChartTemplates={applySelectedChartTemplates}
            generate={generate}
            importSource={importSource}
            extractMaterialToWorkspace={extractMaterialToWorkspace}
          />

          {(showCheckWorkspace || showReferenceWorkspace || showFeedbackWorkspace || activePanel === 'drafting' || activePanel === 'writing') && (
            <details ref={supportWorkspaceRef} className="thesis-tutor-panel thesis-tutor-collapsible thesis-tutor-support-workspace" key={activePanel}>
              <summary>辅助工作区 <span>{[
                showReferenceWorkspace ? `证据 ${references.length} 条` : '',
                showFeedbackWorkspace ? `反馈 ${feedbackItems.length} 项` : '',
                showCheckWorkspace ? `检查 ${checkItems.length} 项` : '',
                activePanel === 'drafting' || activePanel === 'writing' ? `章节 ${chapters.length} 个` : '',
              ].filter(Boolean).join(' · ')}</span></summary>
              <div className="thesis-tutor-support-content">
          {showCheckWorkspace && (
            <ThesisTutorCheckWorkspace
              activeCheck={activeCheck}
              checkItems={checkItems}
              finalReviewGate={finalReviewGate}
              isRunning={isRunning}
              saving={saving}
              sourceText={sourceText}
              setActiveCheckId={setActiveCheckId}
              updateActiveCheck={updateActiveCheck}
              createDefaultCheckItems={createDefaultCheckItems}
              addCheckItem={addCheckItem}
              fillCheckFromSource={fillCheckFromSource}
              removeActiveCheck={removeActiveCheck}
              saveCheckWorkspace={saveCheckWorkspace}
              extractMaterialToWorkspace={extractMaterialToWorkspace}
            />
          )}

          {showReferenceWorkspace && (
            <div ref={referenceWorkspaceRef} className="thesis-tutor-reference-target">
            <ThesisTutorReferenceWorkspace
              activeReference={activeReference}
              references={references}
              chapters={chapters}
              isRunning={isRunning}
              saving={saving}
              sourceText={sourceText}
              setActiveReferenceId={setActiveReferenceId}
              updateActiveReference={updateActiveReference}
              addReference={addReference}
              fillReferenceFromSource={fillReferenceFromSource}
              removeActiveReference={removeActiveReference}
              saveReferenceWorkspace={saveReferenceWorkspace}
              toggleReferenceChapter={toggleReferenceChapter}
              extractMaterialToWorkspace={extractMaterialToWorkspace}
              onImportedState={(nextState) => { setState(nextState); syncWorkspaces(nextState); }}
            />
            </div>
          )}

          {showFeedbackWorkspace && (
            <ThesisTutorFeedbackWorkspace
              activeFeedback={activeFeedback}
              feedbackItems={feedbackItems}
              chapters={chapters}
              isRunning={isRunning}
              saving={saving}
              sourceText={sourceText}
              setActiveFeedbackId={setActiveFeedbackId}
              updateActiveFeedback={updateActiveFeedback}
              addFeedback={addFeedback}
              fillFeedbackFromSource={fillFeedbackFromSource}
              removeActiveFeedback={removeActiveFeedback}
              saveFeedbackWorkspace={saveFeedbackWorkspace}
              toggleFeedbackChapter={toggleFeedbackChapter}
              extractMaterialToWorkspace={extractMaterialToWorkspace}
            />
          )}

          {(activePanel === 'drafting' || activePanel === 'writing') && (
            <ThesisTutorChapterWorkspace
              activePanel={activePanel}
              activeChapter={activeChapter}
              chapters={chapters}
              isRunning={isRunning}
              saving={saving}
              sourceText={sourceText}
              selectChapter={selectChapter}
              updateActiveChapter={updateActiveChapter}
              createChaptersFromOutline={createChaptersFromOutline}
              addChapter={addChapter}
              saveChapterWorkspace={saveChapterWorkspace}
              extractMaterialToWorkspace={extractMaterialToWorkspace}
            />
          )}
              </div>
            </details>
          )}

          {task && (
            <ThesisTutorProgressCard
              phase={task.status}
              message={task.message}
              progress={taskProgress}
              runningHint="进度为阶段估算；模型生成长文本时可能会停留片刻，完成后会自动写入下方结果区。"
            />
          )}

          {operationProgress && operationProgress.phase !== 'canceled' && (
            <ThesisTutorProgressCard
              phase={operationProgress.phase}
              message={operationProgress.message}
              progress={operationProgress.progress}
              runningHint="正在处理本地文件或工作区数据，进度会按预计耗时持续推进。"
            />
          )}

          <ThesisTutorResultWorkspace
            activePanel={activePanel}
            panel={panel}
            nextPanel={nextPanel}
            result={result}
            draft={draft}
            references={references}
            nextActionLabel={nextActionLabel}
            exportProgress={exportProgress}
            isRunning={isRunning}
            saving={saving}
            setDraft={setDraft}
            copyResult={copyResult}
            saveDraft={saveDraft}
            exportWord={exportWord}
            openReference={openReference}
            carryResultToNextPanel={carryResultToNextPanel}
            settleTopicToProfile={settleTopicToProfile}
            settleResultToReferences={settleResultToReferences}
            settleResultToFeedback={settleResultToFeedback}
            settleResultToChecks={settleResultToChecks}
            generate={generate}
            importSource={importSource}
            startDiagnosisTemplate={startDiagnosisTemplate}
          />
        </section>

        <ThesisTutorSidebar
          profile={profile}
          profileCompletion={profileCompletion}
          overviewHealthLabel={overviewHealthLabel}
          completedPanels={completedPanels}
          activePanel={activePanel}
          panelResults={panelResults}
          chapters={chapters}
          references={references}
          chapterDoneCount={chapterDoneCount}
          chapterActiveCount={chapterActiveCount}
          openFeedbackCount={openFeedbackCount}
          highPriorityFeedbackCount={highPriorityFeedbackCount}
          openCheckCount={openCheckCount}
          severeCheckCount={severeCheckCount}
          history={state?.history || []}
          filteredHistory={filteredHistory}
          historyPanelFilter={historyPanelFilter}
          historyImportantOnly={historyImportantOnly}
          navigateToDiagnosis={() => onNavigate?.('thesis-diagnosis')}
          switchPanel={switchPanel}
          setHistoryPanelFilter={setHistoryPanelFilter}
          toggleHistoryImportantOnly={() => setHistoryImportantOnly((value) => !value)}
          renameHistoryItem={renameHistoryItem}
          restoreHistoryItem={restoreHistoryItem}
          toggleHistoryImportant={toggleHistoryImportant}
          removeHistoryItem={removeHistoryItem}
        />
      </main>
      <Dialog.Root open={agentConfirmOpen} onOpenChange={setAgentConfirmOpen}><Dialog.Portal><Dialog.Overlay className="content-regenerate-modal" /><Dialog.Content className="thesis-tutor-agent-dialog"><Dialog.Title>确认执行 Agent 建议</Dialog.Title><Dialog.Description>将执行“{thesisAgentLabels[agentRun?.shadowEvaluation?.agentAction || ''] || '下一步'}”，可能产生模型费用并更新论文工作区。请先确认当前阶段输入和材料符合预期。</Dialog.Description><div className="thesis-tutor-agent-actions"><Dialog.Close asChild><button type="button" className="secondary-action">取消</button></Dialog.Close><button type="button" className="primary-action" onClick={() => void executeThesisAgentRecommendation()}>确认执行</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>

      <Dialog.Root open={agentContinuousConfirmOpen} onOpenChange={setAgentContinuousConfirmOpen}><Dialog.Portal><Dialog.Overlay className="content-regenerate-modal" /><Dialog.Content className="thesis-tutor-agent-dialog"><Dialog.Title>确认论文连续执行</Dialog.Title><Dialog.Description>Agent 将基于当前论文档案、任务要求和材料，依次生成尚未完成的十阶段工作稿，可能产生多次模型费用。生成内容仅作为研究辅助；文献、引用、数据和学术结论必须由你核验，最终导出仍需人工确认。</Dialog.Description><div className="thesis-tutor-agent-actions"><Dialog.Close asChild><button type="button" className="secondary-action">取消</button></Dialog.Close><button type="button" className="primary-action" onClick={confirmThesisContinuousRun}>开始连续执行</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}

export default ThesisTutorPage;
