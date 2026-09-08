import { useEffect, useMemo, useState } from 'react';
import '../patentGeneration.css';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import type { PatentCaseInfo, PatentDisclosureDraftFile, PatentGenerationState, PatentPoint } from '../types';
import { getConfirmedFactSupplements, getUnresolvedMissingFacts } from '../factSupplements';
import {
  PatentCasePanel,
  PatentDraftPanel,
  PatentHero,
  PatentPriorArtPanels,
  PatentResetDialog,
  PatentResultPanel,
  PatentRevisionPanels,
  PatentSelectedPointPanel,
  type PatentCaseInfoPatch,
  type PatentMetric,
  type PatentPreviewItem,
  type PatentStep,
} from './PatentPageSections';

interface PatentComingPageProps {
  kicker: string;
  title: string;
  description: string;
  actionLabel: string;
  metrics: PatentMetric[];
  steps: PatentStep[];
  previewTitle: string;
  previewItems: PatentPreviewItem[];
  outputTitle: string;
  outputItems: string[];
  outputDescription: string;
  enableMiningActions?: boolean;
  enablePatentPointSelection?: boolean;
  showSelectedPatentPoint?: boolean;
  enableDisclosureDraft?: boolean;
  enablePriorArtAnalysis?: boolean;
  enableRevision?: boolean;
  onNavigate?: (section: SectionId) => void;
}

interface PatentExportProgressState {
  running: boolean;
  progress: number;
  message: string;
  warnings: string[];
  error?: string;
}

const emptyCaseInfo: PatentCaseInfo = {
  caseName: '',
  topic: '',
  applicationType: 'invention',
  claimForms: ['method', 'system'],
  contact: {
    name: '',
    phone: '',
    email: '',
  },
};

const initialExportProgress: PatentExportProgressState = {
  running: false,
  progress: 0,
  message: '',
  warnings: [],
};

function hydrateCaseInfo(state: PatentGenerationState): PatentCaseInfo {
  return {
    ...emptyCaseInfo,
    ...state.caseInfo,
    contact: {
      ...emptyCaseInfo.contact,
      ...state.caseInfo.contact,
    },
  };
}

function PatentComingPage({
  kicker,
  title,
  description,
  actionLabel,
  metrics,
  steps,
  previewTitle,
  previewItems,
  outputTitle,
  outputItems,
  outputDescription,
  enableMiningActions = false,
  enablePatentPointSelection = false,
  showSelectedPatentPoint = false,
  enableDisclosureDraft = false,
  enablePriorArtAnalysis = false,
  enableRevision = false,
  onNavigate,
}: PatentComingPageProps) {
  const { showToast } = useToast();
  const [state, setState] = useState<PatentGenerationState | null>(null);
  const [caseInfo, setCaseInfo] = useState<PatentCaseInfo>(emptyCaseInfo);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingTopic, setGeneratingTopic] = useState(false);
  const [selectingProject, setSelectingProject] = useState(false);
  const [mining, setMining] = useState(false);
  const [selectingPointId, setSelectingPointId] = useState('');
  const [generatingFactPointId, setGeneratingFactPointId] = useState('');
  const [savingFactPointId, setSavingFactPointId] = useState('');
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftFile, setDraftFile] = useState<PatentDisclosureDraftFile | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftViewMode, setDraftViewMode] = useState<'edit' | 'preview'>('edit');
  const [savingDraft, setSavingDraft] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportProgress, setExportProgress] = useState<PatentExportProgressState>(initialExportProgress);
  const [exportFilePath, setExportFilePath] = useState('');
  const [priorArtSourceText, setPriorArtSourceText] = useState('');
  const [priorArtMarkdown, setPriorArtMarkdown] = useState('');
  const [priorArtViewMode, setPriorArtViewMode] = useState<'edit' | 'preview'>('edit');
  const [generatingPriorArt, setGeneratingPriorArt] = useState(false);
  const [savingPriorArt, setSavingPriorArt] = useState(false);
  const [revisionKind, setRevisionKind] = useState<'merge' | 'correct'>('merge');
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [generatingRevision, setGeneratingRevision] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let mounted = true;

    window.yibiao?.patentGeneration.loadState()
      .then((nextState) => {
        if (!mounted) return;
        setState(nextState);
        setPriorArtMarkdown(nextState.priorArtMarkdown || '');
        setCaseInfo(hydrateCaseInfo(nextState));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '读取专利案件状态失败';
        if (message.includes('创建或进入一个专利项目')) {
          onNavigate?.('patent-projects');
          return;
        }
        showToast(message, 'error');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = window.yibiao?.patentGeneration.onEvent((nextState) => {
      setState(nextState);
      setPriorArtMarkdown(nextState.priorArtMarkdown || '');
      setCaseInfo(hydrateCaseInfo(nextState));
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [showToast]);

  useEffect(() => {
    let mounted = true;
    if (!enableDisclosureDraft || !state?.activeDraftId) {
      if (enableDisclosureDraft) {
        setDraftFile(null);
        setDraftContent('');
      }
      return undefined;
    }

    window.yibiao?.patentGeneration.readDisclosureDraft(state.activeDraftId)
      .then((file) => {
        if (!mounted) return;
        setDraftFile(file);
        setDraftContent(file.content);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : '读取交底书草稿失败', 'error');
      });

    return () => {
      mounted = false;
    };
  }, [enableDisclosureDraft, showToast, state?.activeDraftId]);

  const caseSummary = useMemo(() => {
    const name = caseInfo.caseName.trim() || '未命名案件';
    const topic = caseInfo.topic.trim() || '待填写技术主题';
    const typeLabel = ({ invention: '发明', 'utility-model': '实用新型', design: '外观设计', unknown: '待确认类型' } as const)[caseInfo.applicationType];
    return `${name} · ${typeLabel} · ${topic}`;
  }, [caseInfo.applicationType, caseInfo.caseName, caseInfo.topic]);

  const miningTaskStatus = state?.task?.type === 'patent-mining' ? state.task.status : 'idle';
  const isRunning = ['running', 'pausing', 'stopping'].includes(state?.task?.status || '');
  const miningTaskBlocked = ['running', 'pausing', 'paused', 'stopping'].includes(miningTaskStatus);
  const selectedPatentPoint = useMemo(() => {
    const selectedId = state?.selectedPatentPointId;
    return (state?.miningResult || []).find((point) => point.id === selectedId) || null;
  }, [state?.miningResult, state?.selectedPatentPointId]);

  const effectivePreviewItems = useMemo(() => {
    if (!enableMiningActions || !state?.miningResult?.length) {
      return previewItems;
    }
    return state.miningResult.map((point, index) => {
      const unresolvedMissingFacts = getUnresolvedMissingFacts(point);
      const confirmedFactSupplements = getConfirmedFactSupplements(point);
      return {
        id: point.id,
        title: point.title,
        status: point.id === state.selectedPatentPointId ? '已选' : index === 0 ? '推荐' : '候选',
        detail: point.innovation || point.difference || point.feasibility,
        qualityWarnings: point.qualityWarnings || [],
        evidenceCount: point.evidence?.length || 0,
        missingFactCount: unresolvedMissingFacts.length,
        confirmedFactCount: confirmedFactSupplements.length,
        missingFacts: unresolvedMissingFacts,
        factSupplements: point.factSupplements || [],
      };
    });
  }, [enableMiningActions, previewItems, state?.miningResult, state?.selectedPatentPointId]);
  const pageVariant = enableDisclosureDraft
    ? 'disclosure'
    : enablePriorArtAnalysis
      ? 'prior-art'
      : enableRevision
        ? 'revision'
        : enableMiningActions
          ? 'mining'
          : 'default';

  function updateCaseInfo(partial: PatentCaseInfoPatch) {
    setCaseInfo((prev) => ({
      ...prev,
      ...partial,
      claimForms: partial.applicationType === 'utility-model'
        ? ['device']
        : partial.applicationType === 'design'
          ? []
          : partial.applicationType === 'invention' && !prev.claimForms.length
            ? ['method', 'system']
            : partial.claimForms ?? prev.claimForms,
      contact: {
        ...prev.contact,
        ...(partial.contact || {}),
      },
    }));
  }

  async function handleSaveCaseInfo() {
    setSaving(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.saveCaseInfo(caseInfo);
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      showToast('专利案件信息已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存专利案件信息失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUseSelectedPatentName() {
    if (!selectedPatentPoint) return;
    const nextCaseInfo = { ...caseInfo, caseName: selectedPatentPoint.title };
    setCaseInfo(nextCaseInfo);
    setSaving(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.saveCaseInfo(nextCaseInfo);
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      showToast('已采用主专利点名称并保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存专利名称失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateTechnicalTopic() {
    setGeneratingTopic(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.generateTechnicalTopic();
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      showToast('技术主题已生成并保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成技术主题失败', 'error');
    } finally {
      setGeneratingTopic(false);
    }
  }

  async function handleSelectProject() {
    setSelectingProject(true);
    try {
      const api = window.yibiao?.patentGeneration;
      if (!api?.selectProject) throw new Error('专利项目服务尚未加载，请完全退出开发窗口后重新运行 npm run dev');
      const result = await api.selectProject();
      if (result?.state) {
        setState(result.state);
        setCaseInfo(hydrateCaseInfo(result.state));
      }
      if (result?.success) {
        showToast('项目资料已扫描，可开始专利挖掘', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择项目目录失败', 'error');
    } finally {
      setSelectingProject(false);
    }
  }

  async function handleStartMining(options: { resume?: boolean } = {}) {
    if (!state?.project) {
      await handleSelectProject();
      return;
    }
    setMining(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.startMining(options);
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      if (nextState?.task?.status === 'paused') {
        showToast('专利挖掘已暂停', 'info');
      } else if (nextState?.task?.status === 'stopped') {
        showToast('专利挖掘已停止', 'info');
      } else {
        showToast('专利点挖掘完成', 'success');
        if (nextState && !nextState.caseInfo.topic.trim()) {
          setGeneratingTopic(true);
          try {
            const topicState = await window.yibiao?.patentGeneration.generateTechnicalTopic();
            if (topicState) {
              setState(topicState);
              setCaseInfo(hydrateCaseInfo(topicState));
              showToast('已根据主专利点自动生成技术主题', 'success');
            }
          } catch (topicError) {
            showToast(topicError instanceof Error ? topicError.message : '技术主题自动生成失败，可稍后手动生成', 'info');
          } finally {
            setGeneratingTopic(false);
          }
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '专利点挖掘失败', 'error');
    } finally {
      setMining(false);
    }
  }

  async function handlePauseMining() {
    try {
      const nextState = await window.yibiao?.patentGeneration.pauseMining();
      if (nextState) setState(nextState);
      showToast('正在暂停，当前模型请求会立即中断', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '暂停专利挖掘失败', 'error');
    }
  }

  async function handleResumeMining() {
    await handleStartMining({ resume: true });
  }

  async function handleStopMining() {
    try {
      const nextState = await window.yibiao?.patentGeneration.stopMining();
      if (nextState) setState(nextState);
      showToast('正在停止专利挖掘', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '停止专利挖掘失败', 'error');
    }
  }

  async function handleSelectPatentPoint(pointId: string) {
    setSelectingPointId(pointId);
    try {
      const nextState = await window.yibiao?.patentGeneration.selectPatentPoint(pointId);
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      showToast('已设为主专利点，可进入交底书生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择主专利点失败', 'error');
    } finally {
      setSelectingPointId('');
    }
  }

  async function handleGenerateFactSupplements(pointId: string) {
    setGeneratingFactPointId(pointId);
    try {
      const nextState = await window.yibiao?.patentGeneration.generateFactSupplements(pointId);
      if (nextState) setState(nextState);
      showToast('AI 已生成建议，请核对并修改后保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 生成待补事实建议失败', 'error');
    } finally {
      setGeneratingFactPointId('');
    }
  }

  async function handleSaveFactSupplements(pointId: string, supplements: NonNullable<PatentPoint['factSupplements']>) {
    setSavingFactPointId(pointId);
    try {
      const nextState = await window.yibiao?.patentGeneration.saveFactSupplements({ pointId, supplements });
      if (nextState) setState(nextState);
      showToast('待补事实内容已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存待补事实内容失败', 'error');
    } finally {
      setSavingFactPointId('');
    }
  }

  async function handleGenerateDisclosureDraft() {
    setGeneratingDraft(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.generateDisclosureDraft();
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      showToast('技术交底书草稿已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成交底书草稿失败', 'error');
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleSaveDisclosureDraft() {
    if (!draftFile) {
      showToast('暂无可保存的交底书草稿', 'info');
      return;
    }
    setSavingDraft(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.saveDisclosureDraft({ id: draftFile.id, content: draftContent });
      if (nextState) setState(nextState);
      const savedFile = await window.yibiao?.patentGeneration.readDisclosureDraft(draftFile.id);
      if (savedFile) {
        setDraftFile(savedFile);
        setDraftContent(savedFile.content);
      }
      showToast('交底书草稿已保存，质量检查已更新', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存交底书草稿失败', 'error');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleExportDisclosureWord() {
    if (!draftFile || !draftContent.trim()) {
      showToast('请先生成交底书草稿', 'info');
      return;
    }

    const requestId = crypto.randomUUID();
    let unsubscribe: (() => void) | undefined;
    setExportingWord(true);
    setExportFilePath('');
    setExportMessage('正在准备导出 Word...');
    setExportProgress({
      running: true,
      progress: 2,
      message: '正在准备导出 Word...',
      warnings: [],
    });

    try {
      unsubscribe = window.yibiao?.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportMessage(event.message);
        setExportProgress((prev) => ({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          warnings: event.warnings || prev.warnings,
          error: event.phase === 'error' ? event.message : undefined,
        }));
      });

      const title = draftFile.title || caseInfo.caseName || selectedPatentPoint?.title || '技术交底书';
      const result = await window.yibiao?.export.exportWord({
        requestId,
        project_name: title,
        document_title: '专利技术交底书',
        document_profile: 'patent-disclosure',
        documentScope: 'patent',
        exportMode: 'basic',
        outline: [{
          id: '1',
          title,
          hideTitle: true,
          description: '',
          content: draftContent,
        }],
      });

      if (result?.canceled) {
        setExportMessage('');
        setExportFilePath('');
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }

      setExportMessage(result?.message || 'Word 已导出，请打开文档核对版式。');
      setExportFilePath(result?.filePath || result?.path || '');
      setExportProgress((prev) => ({
        running: false,
        progress: 100,
        message: result?.message || 'Word 已导出，请打开文档核对版式。',
        warnings: result?.warnings || prev.warnings,
      }));
      showToast(result?.message || 'Word 已导出', result?.warnings?.length ? 'info' : 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      setExportMessage(message);
      setExportFilePath('');
      setExportProgress((prev) => ({
        ...prev,
        running: false,
        progress: 100,
        message,
        error: message,
      }));
      showToast(message, 'error');
    } finally {
      setExportingWord(false);
      unsubscribe?.();
    }
  }

  async function handleOpenExportLocation() {
    if (!exportFilePath) return;
    try {
      await window.yibiao?.export.showExportFile(exportFilePath);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法打开导出位置', 'error');
    }
  }

  async function handleGeneratePriorArtAnalysis() {
    setGeneratingPriorArt(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.generatePriorArtAnalysis({ sourceText: priorArtSourceText });
      if (nextState) {
        setState(nextState);
        setPriorArtMarkdown(nextState.priorArtMarkdown || '');
      }
      showToast('查新分析已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成查新分析失败', 'error');
    } finally {
      setGeneratingPriorArt(false);
    }
  }

  async function handleSavePriorArtMarkdown() {
    setSavingPriorArt(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.savePriorArtMarkdown(priorArtMarkdown);
      if (nextState) setState(nextState);
      showToast('查新分析已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存查新分析失败', 'error');
    } finally {
      setSavingPriorArt(false);
    }
  }

  async function handleGenerateRevision() {
    setGeneratingRevision(true);
    try {
      const result = await window.yibiao?.patentGeneration.generateRevision({
        kind: revisionKind,
        instruction: revisionInstruction,
      });
      if (result?.state) {
        setState(result.state);
        setDraftFile(result.draft);
        setDraftContent(result.draft.content);
      }
      showToast('修订版本已生成，可到交底书生成页查看', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成修订版本失败', 'error');
    } finally {
      setGeneratingRevision(false);
    }
  }

  async function handleResetCase() {
    setResetting(true);
    try {
      const result = await window.yibiao?.patentGeneration.clear();
      if (result?.state) {
        setState(result.state);
        setCaseInfo(hydrateCaseInfo(result.state));
        setDraftFile(null);
        setDraftContent('');
        setPriorArtMarkdown('');
        setPriorArtSourceText('');
        setRevisionInstruction('');
        setExportMessage('');
        setExportFilePath('');
        setExportProgress(initialExportProgress);
      }
      setResetConfirmOpen(false);
      showToast('专利案件已重置', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重置专利案件失败', 'error');
    } finally {
      setResetting(false);
    }
  }

  const processing = selectingProject || mining || Boolean(isRunning);
  const primaryAction = enableMiningActions
    ? handleStartMining
    : enableDisclosureDraft
      ? handleGenerateDisclosureDraft
      : undefined;

  const casePanel = (
    <PatentCasePanel
      caseInfo={caseInfo}
      selectedPatentPoint={selectedPatentPoint}
      loading={loading}
      saving={saving}
      generatingTopic={generatingTopic}
      selectingProject={selectingProject}
      mining={mining}
      isRunning={Boolean(isRunning || miningTaskBlocked)}
      state={state}
      enableMiningActions={enableMiningActions}
      onCaseInfoChange={updateCaseInfo}
      onSaveCaseInfo={handleSaveCaseInfo}
      onGenerateTopic={() => void handleGenerateTechnicalTopic()}
      onUseSelectedPatentName={() => void handleUseSelectedPatentName()}
      onResetCase={() => setResetConfirmOpen(true)}
      onSelectProject={handleSelectProject}
      onStartMining={() => void handleStartMining()}
    />
  );

  const selectedPointPanel = showSelectedPatentPoint ? <PatentSelectedPointPanel selectedPatentPoint={selectedPatentPoint} /> : null;
  const resultPanel = (
    <PatentResultPanel
      previewTitle={previewTitle}
      items={effectivePreviewItems}
      enablePatentPointSelection={enablePatentPointSelection}
      selectingPointId={selectingPointId}
      generatingFactPointId={generatingFactPointId}
      savingFactPointId={savingFactPointId}
      onSelectPatentPoint={handleSelectPatentPoint}
      onGenerateFactSupplements={handleGenerateFactSupplements}
      onSaveFactSupplements={handleSaveFactSupplements}
    />
  );
  const draftPanel = enableDisclosureDraft ? (
    <PatentDraftPanel
      draftFile={draftFile}
      draftContent={draftContent}
      draftViewMode={draftViewMode}
      task={state?.task}
      savingDraft={savingDraft}
      exportingWord={exportingWord}
      exportProgress={exportProgress}
      generatingDraft={generatingDraft}
      isRunning={Boolean(isRunning)}
      selectedPatentPoint={selectedPatentPoint}
      priorArtReady={Boolean(state?.priorArtMarkdown?.trim())}
      exportMessage={exportMessage}
      exportFilePath={exportFilePath}
      onDraftContentChange={setDraftContent}
      onDraftViewModeChange={setDraftViewMode}
      onSaveDraft={handleSaveDisclosureDraft}
      onExportWord={handleExportDisclosureWord}
      onOpenExportLocation={() => void handleOpenExportLocation()}
      onGenerateDraft={handleGenerateDisclosureDraft}
    />
  ) : null;
  const priorArtPanels = enablePriorArtAnalysis ? (
    <PatentPriorArtPanels
      sourceText={priorArtSourceText}
      markdown={priorArtMarkdown}
      viewMode={priorArtViewMode}
      generating={generatingPriorArt}
      saving={savingPriorArt}
      isRunning={Boolean(isRunning)}
      onSourceTextChange={setPriorArtSourceText}
      onMarkdownChange={setPriorArtMarkdown}
      onViewModeChange={setPriorArtViewMode}
      onGenerate={handleGeneratePriorArtAnalysis}
      onSave={handleSavePriorArtMarkdown}
    />
  ) : null;
  const revisionPanels = enableRevision ? (
    <PatentRevisionPanels
      state={state}
      revisionKind={revisionKind}
      revisionInstruction={revisionInstruction}
      generatingRevision={generatingRevision}
      isRunning={Boolean(isRunning)}
      onRevisionKindChange={setRevisionKind}
      onRevisionInstructionChange={setRevisionInstruction}
      onGenerateRevision={handleGenerateRevision}
    />
  ) : null;

  return (
    <div className="demo-coming-page patent-demo">
      <button type="button" className="patent-projects-back" onClick={() => onNavigate?.('patent-projects')}>← 返回专利项目</button>
      <PatentHero
        kicker={kicker}
        title={title}
        description={description}
        actionLabel={actionLabel}
        caseSummary={caseSummary}
        loading={loading}
        updatedAt={state?.updated_at || ''}
        metrics={metrics}
        task={state?.task}
        projectSelected={Boolean(state?.project)}
        processing={processing}
        mining={mining}
        generatingDraft={generatingDraft}
        enableMiningActions={enableMiningActions}
        enableDisclosureDraft={enableDisclosureDraft}
        showUsageHelp={enableMiningActions}
        workflowSteps={steps}
        onPrimaryAction={primaryAction}
        onReimportProject={handleSelectProject}
        onPauseMining={() => void handlePauseMining()}
        onResumeMining={() => void handleResumeMining()}
        onStopMining={() => void handleStopMining()}
      />

      <nav className="patent-workflow-strip" aria-label="专利生成步骤">
        {([
          { section: 'patent-mining', label: '挖掘并选择专利点', ready: Boolean(state?.selectedPatentPointId), optional: false },
          { section: 'patent-disclosure', label: '生成并检查交底书', ready: Boolean(state?.activeDraftId), optional: false },
          { section: 'patent-prior-art', label: '查新增强', ready: Boolean(state?.priorArtMarkdown?.trim()), optional: true },
          { section: 'patent-iteration', label: '修订新版本', ready: Boolean(state?.revisionLogs?.length), optional: true },
        ] as Array<{ section: SectionId; label: string; ready: boolean; optional: boolean }>).map((item, index) => {
          const active = item.section === `patent-${pageVariant}` || (pageVariant === 'prior-art' && item.section === 'patent-prior-art');
          return (
            <button key={item.section} type="button" className={active ? 'is-active' : item.ready ? 'is-complete' : ''} onClick={() => onNavigate?.(item.section)}>
              <span>{item.ready ? '✓' : item.optional ? '选' : index + 1}</span>
              <strong>{item.label}{item.optional && <small>可选</small>}</strong>
            </button>
          );
        })}
      </nav>

      <div className="patent-current-action" role="status">
        <strong>当前操作</strong>
        <span>{pageVariant === 'mining'
          ? state?.selectedPatentPointId ? '已选定主专利点，可以直接生成交底书，也可以先做查新增强。' : state?.project ? '项目已导入，请开始挖掘并选择一个主专利点。' : '先填写案件信息并选择项目目录。'
          : pageVariant === 'prior-art'
            ? state?.selectedPatentPointId ? '可选步骤：补充公开资料，增强现有技术与区别点分析。' : '尚未选择主专利点，请先返回专利挖掘。'
            : pageVariant === 'disclosure'
              ? state?.selectedPatentPointId ? '生成草稿，处理质量提示后再导出 Word。' : '尚未选择主专利点，请先返回专利挖掘。'
              : state?.activeDraftId ? '可选步骤：需要补充或纠错时生成新版本，旧稿会保留。' : '尚无交底书草稿，请先完成交底书生成。'}</span>
      </div>

      <div className={`demo-content-grid patent-content-grid is-${pageVariant}`}>
        {pageVariant === 'disclosure' && (
          <>
            {draftPanel}
            {selectedPointPanel}
          </>
        )}
        {pageVariant === 'prior-art' && (
          <>
            {priorArtPanels}
          </>
        )}
        {pageVariant === 'revision' && (
          <>
            {revisionPanels}
          </>
        )}
        {pageVariant === 'mining' && (
          <>
            {casePanel}
            {resultPanel}
          </>
        )}
        {pageVariant === 'default' && (
          <>
            {casePanel}
            {selectedPointPanel}
            {resultPanel}
          </>
        )}
      </div>

      <PatentResetDialog
        open={resetConfirmOpen}
        resetting={resetting}
        onOpenChange={setResetConfirmOpen}
        onConfirm={handleResetCase}
      />
    </div>
  );
}

export default PatentComingPage;
