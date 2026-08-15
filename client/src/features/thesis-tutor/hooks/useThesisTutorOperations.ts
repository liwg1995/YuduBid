import type { Dispatch, SetStateAction } from 'react';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type {
  ThesisTutorChapter,
  ThesisTutorCheckItem,
  ThesisTutorFeedbackItem,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorReference,
  ThesisTutorState,
} from '../types';
import {
  buildChapterExportMarkdown,
  buildCheckExportMarkdown,
  buildFeedbackExportMarkdown,
  buildProfileExportMarkdown,
  buildReferenceExportMarkdown,
  feedbackEnabledPanels,
  panelCopy,
  referenceEnabledPanels,
  toMarkdownList,
  truncateExportText,
  type ThesisTutorDataPreflight,
  type ThesisTutorDraftingPreflight,
  type ThesisTutorPanelCopy,
} from '../model/thesisTutorPageModel';

interface UseThesisTutorOperationsOptions {
  activePanel: ThesisTutorPanel;
  panel: ThesisTutorPanelCopy;
  profile: ThesisTutorProfile;
  profileLocked: boolean;
  userInput: string;
  sourceText: string;
  draft: string;
  result: string;
  panelResults: ThesisTutorState['panelResults'];
  completedPanels: ThesisTutorPanel[];
  draftingPreflight: ThesisTutorDraftingPreflight;
  dataPreflight: ThesisTutorDataPreflight;
  chapters: ThesisTutorChapter[];
  activeChapterId: string;
  activeChapter: ThesisTutorChapter | null;
  references: ThesisTutorReference[];
  activeReferenceId: string;
  activeReference: ThesisTutorReference | null;
  feedbackItems: ThesisTutorFeedbackItem[];
  activeFeedbackId: string;
  activeFeedback: ThesisTutorFeedbackItem | null;
  checkItems: ThesisTutorCheckItem[];
  activeCheckId: string;
  activeCheck: ThesisTutorCheckItem | null;
  setState: Dispatch<SetStateAction<ThesisTutorState | null>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setSourceText: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setExportProgress: Dispatch<SetStateAction<WordExportProgressEvent | null>>;
  syncWorkspaces: (state: ThesisTutorState) => void;
  startOperationProgress: (message: string) => string;
  finishOperationProgress: (requestId: string, message: string, phase?: WordExportProgressEvent['phase']) => void;
  showToast: (message: string, type?: ToastType) => number;
}

export function useThesisTutorOperations({
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
}: UseThesisTutorOperationsOptions) {
  async function saveProfile() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveProfile(profile);
      setState(nextState);
      syncWorkspaces(nextState);
      showToast('论文档案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存论文档案失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleProfileLock() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveProfileLock({ locked: !profileLocked });
      setState(nextState);
      showToast(!profileLocked ? '论文档案已锁定' : '论文档案已解锁', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换档案锁定失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    if (activePanel === 'drafting' && draftingPreflight.tone !== 'ready') {
      showToast(`${draftingPreflight.mode}：生成结果会标注需补充或待核验内容`, 'info');
    }
    if (activePanel === 'data' && dataPreflight.tone !== 'ready') {
      showToast(`${dataPreflight.recommendation}：暂不生成确定性统计结论`, 'info');
    }
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.generate({
        panel: activePanel,
        profile,
        userInput,
        sourceText,
        chapters,
        activeChapterId: activeChapter?.id || activeChapterId,
        references,
        activeReferenceId: activeReference?.id || activeReferenceId,
        feedbackItems,
        activeFeedbackId: activeFeedback?.id || activeFeedbackId,
        checkItems,
        activeCheckId: activeCheck?.id || activeCheckId,
      });
      setState(nextState);
      setDraft(nextState.draft || nextState.latestResult || '');
      syncWorkspaces(nextState);
      showToast(`${panel.label}已生成`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '论文导师生成失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveDraft({
        panel: activePanel,
        draft,
        sourceText,
        userInput,
        chapters,
        activeChapterId: activeChapter?.id || activeChapterId,
        references,
        activeReferenceId: activeReference?.id || activeReferenceId,
        feedbackItems,
        activeFeedbackId: activeFeedback?.id || activeFeedbackId,
        checkItems,
        activeCheckId: activeCheck?.id || activeCheckId,
      });
      setState(nextState);
      syncWorkspaces(nextState);
      showToast('当前结果已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存结果失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function importSource() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导入并解析论文材料');
    try {
      setSaving(true);
      const importResult = await window.yibiao.thesisTutor.importSource();
      setState(importResult.state);
      setSourceText(importResult.state.sourceText || importResult.markdown || '');
      if (importResult.success) {
        finishOperationProgress(requestId, importResult.message || '论文材料已导入');
        showToast(importResult.message || '论文材料已导入', 'success');
      } else if (importResult.message !== '已取消选择') {
        finishOperationProgress(requestId, importResult.message || '导入论文材料失败', 'error');
        showToast(importResult.message || '导入论文材料失败', 'info');
      } else {
        finishOperationProgress(requestId, '已取消导入', 'canceled');
      }
    } catch (error) {
      finishOperationProgress(requestId, error instanceof Error ? error.message : '导入论文材料失败', 'error');
      showToast(error instanceof Error ? error.message : '导入论文材料失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function buildWordExportOutline() {
    const outline = [
      {
        id: 'thesis-profile',
        title: '论文档案与本次任务',
        description: '导出时带入的论文基础档案、本次需求和材料摘要。',
        content: buildProfileExportMarkdown(profile, activePanel, userInput, sourceText),
      },
      {
        id: `thesis-result-${activePanel}`,
        title: panel.resultTitle,
        description: panel.resultHelp,
        content: result,
      },
    ];

    const completedResultSummary = completedPanels
      .filter((item) => item !== activePanel)
      .map((item) => {
        const itemResult = panelResults[item];
        return itemResult?.content
          ? `**${panelCopy[item].label}**：${truncateExportText(itemResult.content, 900)}`
          : '';
      })
      .filter(Boolean);
    if (completedResultSummary.length) {
      outline.push({
        id: 'thesis-workflow-results',
        title: '已沉淀阶段成果',
        description: '来自其他论文导师模块的阶段成果摘要。',
        content: toMarkdownList(completedResultSummary),
      });
    }

    const chapterMarkdown = buildChapterExportMarkdown(chapters, activeChapter?.id || activeChapterId);
    if (chapterMarkdown && ['writing', 'review', 'format'].includes(activePanel)) {
      outline.push({ id: 'thesis-chapter-workspace', title: '章节工作区', description: '当前论文目录、章节目标、章节材料和已保存草稿。', content: chapterMarkdown });
    }
    const referenceMarkdown = buildReferenceExportMarkdown(references);
    if (referenceMarkdown && referenceEnabledPanels.has(activePanel)) {
      outline.push({ id: 'thesis-reference-workspace', title: '文献与证据链', description: '导出当前工作区中已整理的真实文献、政策、案例、数据或原文摘录。', content: referenceMarkdown });
    }
    const feedbackMarkdown = buildFeedbackExportMarkdown(feedbackItems);
    if (feedbackMarkdown && feedbackEnabledPanels.has(activePanel)) {
      outline.push({ id: 'thesis-feedback-workspace', title: '导师反馈闭环', description: '导出导师意见、处理方案、优先级和修改记录。', content: feedbackMarkdown });
    }
    const checkMarkdown = buildCheckExportMarkdown(checkItems);
    if (checkMarkdown && activePanel === 'format') {
      outline.push({ id: 'thesis-check-workspace', title: '格式与查重检查清单', description: '导出格式、引用、重复表达、AI 味和逻辑检查项。', content: checkMarkdown });
    }
    return outline;
  }

  async function exportWord() {
    if (!result.trim()) {
      showToast('请先生成或填写结果内容', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未注入导出服务', 'error');
      return;
    }
    const requestId = `thesis-tutor-${Date.now()}`;
    const title = profile.title ? `${profile.title}-${panel.label}` : `论文导师-${panel.label}`;
    try {
      setExportProgress({ requestId, phase: 'running', progress: 1, message: '正在准备导出 Word' });
      const exportResult = await window.yibiao.export.exportWord({
        requestId,
        project_name: title,
        document_profile: 'official-document',
        outline: buildWordExportOutline(),
      });
      if (exportResult.canceled) {
        setExportProgress({ requestId, phase: 'canceled', progress: 0, message: '已取消导出' });
        return;
      }
      if (exportResult.success) showToast(exportResult.message || '论文导师结果已导出 Word', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      showToast(message, 'error');
      setExportProgress({ requestId, phase: 'error', progress: 100, message });
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      showToast('论文导师结果已复制', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  }

  return {
    saveProfile,
    toggleProfileLock,
    generate,
    saveDraft,
    importSource,
    exportWord,
    copyResult,
  };
}
