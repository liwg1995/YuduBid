import { useState, type Dispatch, type SetStateAction } from 'react';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type {
  ThesisTutorChapter,
  ThesisTutorCheckItem,
  ThesisTutorCheckStatus,
  ThesisTutorFeedbackItem,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorReference,
  ThesisTutorState,
} from '../types';
import {
  createLocalChapter,
  createLocalCheckItem,
  createLocalFeedback,
  createLocalReference,
  parseOutlinePlanToChapters,
} from '../model/thesisTutorPageModel';

interface UseThesisTutorWorkspacesOptions {
  activePanel: ThesisTutorPanel;
  profile: ThesisTutorProfile;
  sourceText: string;
  setDraft: (value: string) => void;
  setState: Dispatch<SetStateAction<ThesisTutorState | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string, type?: ToastType) => number;
}

export function useThesisTutorWorkspaces({
  activePanel,
  profile,
  sourceText,
  setDraft,
  setState,
  setSaving,
  showToast,
}: UseThesisTutorWorkspacesOptions) {
  const [chapters, setChapters] = useState<ThesisTutorChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState('');
  const [references, setReferences] = useState<ThesisTutorReference[]>([]);
  const [activeReferenceId, setActiveReferenceId] = useState('');
  const [feedbackItems, setFeedbackItems] = useState<ThesisTutorFeedbackItem[]>([]);
  const [activeFeedbackId, setActiveFeedbackId] = useState('');
  const [checkItems, setCheckItems] = useState<ThesisTutorCheckItem[]>([]);
  const [activeCheckId, setActiveCheckId] = useState('');

  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) || chapters[0] || null;
  const activeReference = references.find((reference) => reference.id === activeReferenceId) || references[0] || null;
  const activeFeedback = feedbackItems.find((item) => item.id === activeFeedbackId) || feedbackItems[0] || null;
  const activeCheck = checkItems.find((item) => item.id === activeCheckId) || checkItems[0] || null;

  function syncWorkspaces(nextState: ThesisTutorState) {
    setChapters(nextState.chapters || []);
    setActiveChapterId(nextState.activeChapterId || nextState.chapters?.[0]?.id || '');
    setReferences(nextState.references || []);
    setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
    setFeedbackItems(nextState.feedbackItems || []);
    setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
    setCheckItems(nextState.checkItems || []);
    setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
  }

  function resetWorkspaces() {
    setChapters([]);
    setActiveChapterId('');
    setReferences([]);
    setActiveReferenceId('');
    setFeedbackItems([]);
    setActiveFeedbackId('');
    setCheckItems([]);
    setActiveCheckId('');
  }

  function updateActiveChapter(patch: Partial<ThesisTutorChapter>) {
    if (!activeChapter) return;
    setChapters((current) => current.map((chapter) => (
      chapter.id === activeChapter.id
        ? { ...chapter, ...patch, updated_at: new Date().toISOString() }
        : chapter
    )));
  }

  function selectChapter(chapterId: string) {
    const nextChapter = chapters.find((chapter) => chapter.id === chapterId);
    setActiveChapterId(chapterId);
    if ((activePanel === 'drafting' || activePanel === 'writing') && nextChapter?.draft) {
      setDraft(nextChapter.draft);
    }
  }

  function addChapter() {
    const nextChapter = createLocalChapter(`新章节 ${chapters.length + 1}`);
    setChapters((current) => [...current, nextChapter]);
    setActiveChapterId(nextChapter.id);
    setDraft('');
  }

  async function createChaptersFromOutline() {
    const nextChapters = parseOutlinePlanToChapters(profile.outlinePlan);
    if (!nextChapters.length) {
      showToast('请先在论文档案的“论文目录或章节计划”里填写章节目录', 'info');
      return;
    }
    setChapters(nextChapters);
    setActiveChapterId(nextChapters[0].id);
    setDraft(nextChapters[0].draft || '');
    if (!window.yibiao?.thesisTutor) return;
    try {
      const nextState = await window.yibiao.thesisTutor.saveChapters({
        chapters: nextChapters,
        activeChapterId: nextChapters[0].id,
      });
      setState(nextState);
      showToast('已根据目录生成章节工作区', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存章节失败', 'error');
    }
  }

  async function saveChapterWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveChapters({
        chapters,
        activeChapterId: activeChapter?.id || activeChapterId,
      });
      setState(nextState);
      showToast('章节工作区已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存章节工作区失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateActiveReference(patch: Partial<ThesisTutorReference>) {
    if (!activeReference) return;
    setReferences((current) => current.map((reference) => (
      reference.id === activeReference.id
        ? { ...reference, ...patch, updated_at: new Date().toISOString() }
        : reference
    )));
  }

  function addReference() {
    const nextReference = createLocalReference(`证据条目 ${references.length + 1}`);
    setReferences((current) => [...current, nextReference]);
    setActiveReferenceId(nextReference.id);
  }

  function removeActiveReference() {
    if (!activeReference) return;
    const nextReferences = references.filter((reference) => reference.id !== activeReference.id);
    setReferences(nextReferences);
    setActiveReferenceId(nextReferences[0]?.id || '');
  }

  function fillReferenceFromSource() {
    if (!activeReference) {
      const nextReference = {
        ...createLocalReference('来自材料区的证据'),
        summary: sourceText.slice(0, 5000),
      };
      setReferences((current) => [...current, nextReference]);
      setActiveReferenceId(nextReference.id);
      return;
    }
    updateActiveReference({ summary: sourceText.slice(0, 5000) });
  }

  function toggleReferenceChapter(chapterId: string) {
    if (!activeReference) return;
    const exists = activeReference.relatedChapterIds.includes(chapterId);
    updateActiveReference({
      relatedChapterIds: exists
        ? activeReference.relatedChapterIds.filter((id) => id !== chapterId)
        : [...activeReference.relatedChapterIds, chapterId],
    });
  }

  async function saveReferenceWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveReferences({
        references,
        activeReferenceId: activeReference?.id || activeReferenceId,
      });
      setState(nextState);
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextState.references?.[0]?.id || '');
      showToast('文献与证据链已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存证据链失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateActiveFeedback(patch: Partial<ThesisTutorFeedbackItem>) {
    if (!activeFeedback) return;
    setFeedbackItems((current) => current.map((item) => (
      item.id === activeFeedback.id
        ? { ...item, ...patch, updated_at: new Date().toISOString() }
        : item
    )));
  }

  function addFeedback() {
    const nextFeedback = createLocalFeedback(`导师反馈 ${feedbackItems.length + 1}`);
    setFeedbackItems((current) => [...current, nextFeedback]);
    setActiveFeedbackId(nextFeedback.id);
  }

  function removeActiveFeedback() {
    if (!activeFeedback) return;
    const nextFeedbackItems = feedbackItems.filter((item) => item.id !== activeFeedback.id);
    setFeedbackItems(nextFeedbackItems);
    setActiveFeedbackId(nextFeedbackItems[0]?.id || '');
  }

  function fillFeedbackFromSource() {
    if (!sourceText.trim()) return;
    if (!activeFeedback) {
      const nextFeedback = {
        ...createLocalFeedback('来自材料区的导师意见'),
        originalFeedback: sourceText.slice(0, 5000),
      };
      setFeedbackItems((current) => [...current, nextFeedback]);
      setActiveFeedbackId(nextFeedback.id);
      return;
    }
    updateActiveFeedback({ originalFeedback: sourceText.slice(0, 5000) });
  }

  function toggleFeedbackChapter(chapterId: string) {
    if (!activeFeedback) return;
    const exists = activeFeedback.relatedChapterIds.includes(chapterId);
    updateActiveFeedback({
      relatedChapterIds: exists
        ? activeFeedback.relatedChapterIds.filter((id) => id !== chapterId)
        : [...activeFeedback.relatedChapterIds, chapterId],
    });
  }

  async function saveFeedbackWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveFeedback({
        feedbackItems,
        activeFeedbackId: activeFeedback?.id || activeFeedbackId,
      });
      setState(nextState);
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextState.feedbackItems?.[0]?.id || '');
      showToast('导师反馈任务已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存导师反馈失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateActiveCheck(patch: Partial<ThesisTutorCheckItem>) {
    if (!activeCheck) return;
    setCheckItems((current) => current.map((item) => (
      item.id === activeCheck.id
        ? { ...item, ...patch, updated_at: new Date().toISOString() }
        : item
    )));
  }

  function addCheckItem() {
    const nextCheck = createLocalCheckItem(`检查项 ${checkItems.length + 1}`);
    setCheckItems((current) => [...current, nextCheck]);
    setActiveCheckId(nextCheck.id);
  }

  function removeActiveCheck() {
    if (!activeCheck) return;
    const nextCheckItems = checkItems.filter((item) => item.id !== activeCheck.id);
    setCheckItems(nextCheckItems);
    setActiveCheckId(nextCheckItems[0]?.id || '');
  }

  function fillCheckFromSource() {
    if (!sourceText.trim()) return;
    if (!activeCheck) {
      const nextCheck = {
        ...createLocalCheckItem('来自材料区的检查问题'),
        issue: sourceText.slice(0, 5000),
        status: 'issue_found' as ThesisTutorCheckStatus,
      };
      setCheckItems((current) => [...current, nextCheck]);
      setActiveCheckId(nextCheck.id);
      return;
    }
    updateActiveCheck({ issue: sourceText.slice(0, 5000), status: 'issue_found' });
  }

  async function saveCheckWorkspace() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveChecks({
        checkItems,
        activeCheckId: activeCheck?.id || activeCheckId,
      });
      setState(nextState);
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextState.checkItems?.[0]?.id || '');
      showToast('格式与查重检查清单已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存检查清单失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return {
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
  };
}
