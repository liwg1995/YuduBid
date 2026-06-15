import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { PatentCaseInfo, PatentDisclosureDraftFile, PatentGenerationState } from '../types';
import {
  PatentCasePanel,
  PatentDraftPanel,
  PatentHero,
  PatentOutputCard,
  PatentPriorArtPanels,
  PatentResetDialog,
  PatentResultPanel,
  PatentRevisionPanels,
  PatentSelectedPointPanel,
  PatentWorkflowPanel,
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
  patentType: 'unknown',
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
}: PatentComingPageProps) {
  const { showToast } = useToast();
  const [state, setState] = useState<PatentGenerationState | null>(null);
  const [caseInfo, setCaseInfo] = useState<PatentCaseInfo>(emptyCaseInfo);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectingProject, setSelectingProject] = useState(false);
  const [mining, setMining] = useState(false);
  const [selectingPointId, setSelectingPointId] = useState('');
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftFile, setDraftFile] = useState<PatentDisclosureDraftFile | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftViewMode, setDraftViewMode] = useState<'edit' | 'preview'>('edit');
  const [savingDraft, setSavingDraft] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportProgress, setExportProgress] = useState<PatentExportProgressState>(initialExportProgress);
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
      .catch((error) => showToast(error instanceof Error ? error.message : '读取专利案件状态失败', 'error'))
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
    return `${name} · ${topic}`;
  }, [caseInfo.caseName, caseInfo.topic]);

  const isRunning = state?.task?.status === 'running';
  const selectedPatentPoint = useMemo(() => {
    const selectedId = state?.selectedPatentPointId;
    return (state?.miningResult || []).find((point) => point.id === selectedId) || null;
  }, [state?.miningResult, state?.selectedPatentPointId]);

  const effectivePreviewItems = useMemo(() => {
    if (!enableMiningActions || !state?.miningResult?.length) {
      return previewItems;
    }
    return state.miningResult.map((point, index) => ({
      id: point.id,
      title: point.title,
      status: point.id === state.selectedPatentPointId ? '已选' : index === 0 ? '推荐' : '候选',
      detail: point.innovation || point.difference || point.feasibility,
      qualityWarnings: point.qualityWarnings || [],
    }));
  }, [enableMiningActions, previewItems, state?.miningResult, state?.selectedPatentPointId]);

  function updateCaseInfo(partial: PatentCaseInfoPatch) {
    setCaseInfo((prev) => ({
      ...prev,
      ...partial,
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

  async function handleSelectProject() {
    setSelectingProject(true);
    try {
      const result = await window.yibiao?.patentGeneration.selectProject();
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

  async function handleStartMining() {
    if (!state?.project) {
      await handleSelectProject();
      return;
    }
    setMining(true);
    try {
      const nextState = await window.yibiao?.patentGeneration.startMining();
      if (nextState) {
        setState(nextState);
        setCaseInfo(hydrateCaseInfo(nextState));
      }
      showToast('专利点挖掘完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '专利点挖掘失败', 'error');
    } finally {
      setMining(false);
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
      showToast('交底书草稿已保存', 'success');
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
        outline: [{
          id: '1',
          title,
          description: '',
          content: draftContent,
        }],
      });

      if (result?.canceled) {
        setExportMessage('');
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }

      setExportMessage(result?.message || 'Word 已导出，请打开文档核对版式。');
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

  return (
    <div className="demo-coming-page patent-demo">
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
        onPrimaryAction={primaryAction}
        onReimportProject={handleSelectProject}
      />

      <div className="demo-content-grid">
        <PatentCasePanel
          caseInfo={caseInfo}
          loading={loading}
          saving={saving}
          selectingProject={selectingProject}
          mining={mining}
          isRunning={Boolean(isRunning)}
          state={state}
          enableMiningActions={enableMiningActions}
          onCaseInfoChange={updateCaseInfo}
          onSaveCaseInfo={handleSaveCaseInfo}
          onResetCase={() => setResetConfirmOpen(true)}
          onSelectProject={handleSelectProject}
          onStartMining={handleStartMining}
        />

        <PatentWorkflowPanel kicker={kicker} steps={steps} />
        {showSelectedPatentPoint && <PatentSelectedPointPanel selectedPatentPoint={selectedPatentPoint} />}
        <PatentResultPanel
          previewTitle={previewTitle}
          items={effectivePreviewItems}
          enablePatentPointSelection={enablePatentPointSelection}
          selectingPointId={selectingPointId}
          onSelectPatentPoint={handleSelectPatentPoint}
        />
        <PatentOutputCard outputTitle={outputTitle} outputItems={outputItems} outputDescription={outputDescription} />

        {enableDisclosureDraft && (
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
            exportMessage={exportMessage}
            onDraftContentChange={setDraftContent}
            onDraftViewModeChange={setDraftViewMode}
            onSaveDraft={handleSaveDisclosureDraft}
            onExportWord={handleExportDisclosureWord}
            onGenerateDraft={handleGenerateDisclosureDraft}
          />
        )}

        {enablePriorArtAnalysis && (
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
        )}

        {enableRevision && (
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
