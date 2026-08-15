import type { Dispatch, SetStateAction } from 'react';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type {
  ThesisTutorChapter,
  ThesisTutorChapterStatus,
  ThesisTutorCheckCategory,
  ThesisTutorCheckItem,
  ThesisTutorCheckSeverity,
  ThesisTutorCheckStatus,
  ThesisTutorFeedbackItem,
  ThesisTutorFeedbackPriority,
  ThesisTutorFeedbackStatus,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorReference,
  ThesisTutorReferenceType,
  ThesisTutorState,
} from '../types';
import {
  appendMaterial,
  createLocalChapter,
  createLocalCheckItem,
  createLocalFeedback,
  createLocalReference,
  defaultProfile,
  extractResultTitle,
  panelCopy,
  splitMaterialBlocks,
  truncateExportText,
  type ThesisTutorPanelCopy,
} from '../model/thesisTutorPageModel';

interface UseThesisTutorFlowOptions {
  activePanel: ThesisTutorPanel;
  nextPanel: ThesisTutorPanel | null;
  panel: ThesisTutorPanelCopy;
  profile: ThesisTutorProfile;
  profileLocked: boolean;
  sourceText: string;
  result: string;
  importedSourceFileName?: string;
  chapters: ThesisTutorChapter[];
  activeChapter: ThesisTutorChapter | null;
  references: ThesisTutorReference[];
  feedbackItems: ThesisTutorFeedbackItem[];
  checkItems: ThesisTutorCheckItem[];
  setState: Dispatch<SetStateAction<ThesisTutorState | null>>;
  setProfile: Dispatch<SetStateAction<ThesisTutorProfile>>;
  setSourceText: Dispatch<SetStateAction<string>>;
  setUserInput: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setChapters: Dispatch<SetStateAction<ThesisTutorChapter[]>>;
  setActiveChapterId: Dispatch<SetStateAction<string>>;
  setReferences: Dispatch<SetStateAction<ThesisTutorReference[]>>;
  setActiveReferenceId: Dispatch<SetStateAction<string>>;
  setFeedbackItems: Dispatch<SetStateAction<ThesisTutorFeedbackItem[]>>;
  setActiveFeedbackId: Dispatch<SetStateAction<string>>;
  setCheckItems: Dispatch<SetStateAction<ThesisTutorCheckItem[]>>;
  setActiveCheckId: Dispatch<SetStateAction<string>>;
  switchPanel: (panel: ThesisTutorPanel) => void;
  showToast: (message: string, type?: ToastType) => number;
}

export function useThesisTutorFlow({
  activePanel,
  nextPanel,
  panel,
  profile,
  profileLocked,
  sourceText,
  result,
  importedSourceFileName,
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
}: UseThesisTutorFlowOptions) {
  function getMaterialExtractLabel() {
    if (activePanel === 'literature') return '拆成证据条目';
    if (activePanel === 'drafting' || activePanel === 'writing') return '放入章节材料';
    if (activePanel === 'review') return '拆成反馈任务';
    if (activePanel === 'format') return '拆成检查项';
    if (activePanel === 'methodology') return '沉淀到方法档案';
    return '沉淀到论文档案';
  }

  async function extractMaterialToWorkspace() {
    const material = sourceText.trim();
    if (!material) {
      showToast('请先导入或粘贴材料', 'info');
      return;
    }
    const blocks = splitMaterialBlocks(material);
    try {
      setSaving(true);
      if (activePanel === 'literature') {
        const nextReferences = [
          ...blocks.map((block, index) => ({
            ...createLocalReference(extractResultTitle(block) || `材料证据 ${index + 1}`),
            type: 'literature' as ThesisTutorReferenceType,
            summary: truncateExportText(block, 5000),
            keyPoints: '由材料区结构化提取，可继续补充作者、年份、来源和规范引用。',
          })),
          ...references,
        ];
        setReferences(nextReferences);
        setActiveReferenceId(nextReferences[0]?.id || '');
        const nextState = await window.yibiao?.thesisTutor?.saveReferences({ references: nextReferences, activeReferenceId: nextReferences[0]?.id || '' });
        if (nextState) setState(nextState);
        showToast(`已提取 ${blocks.length} 条证据`, 'success');
        return;
      }
      if (activePanel === 'drafting' || activePanel === 'writing') {
        const targetChapter = activeChapter || createLocalChapter('来自材料区的章节材料');
        const nextChapters = (chapters.length ? chapters : [targetChapter]).map((chapter) => (
          chapter.id === targetChapter.id
            ? { ...chapter, material: appendMaterial(chapter.material, material), status: 'writing' as ThesisTutorChapterStatus, updated_at: new Date().toISOString() }
            : chapter
        ));
        setChapters(nextChapters);
        setActiveChapterId(targetChapter.id);
        const nextState = await window.yibiao?.thesisTutor?.saveChapters({ chapters: nextChapters, activeChapterId: targetChapter.id });
        if (nextState) setState(nextState);
        showToast('已放入当前章节材料', 'success');
        return;
      }
      if (activePanel === 'review') {
        const nextFeedbackItems = [
          ...blocks.map((block, index) => ({
            ...createLocalFeedback(extractResultTitle(block) || `材料反馈 ${index + 1}`),
            source: importedSourceFileName || '材料区',
            priority: 'medium' as ThesisTutorFeedbackPriority,
            status: 'todo' as ThesisTutorFeedbackStatus,
            originalFeedback: truncateExportText(block, 5000),
            actionPlan: '请根据材料内容拆分修改动作。',
          })),
          ...feedbackItems,
        ];
        setFeedbackItems(nextFeedbackItems);
        setActiveFeedbackId(nextFeedbackItems[0]?.id || '');
        const nextState = await window.yibiao?.thesisTutor?.saveFeedback({ feedbackItems: nextFeedbackItems, activeFeedbackId: nextFeedbackItems[0]?.id || '' });
        if (nextState) setState(nextState);
        showToast(`已提取 ${blocks.length} 条反馈任务`, 'success');
        return;
      }
      if (activePanel === 'format') {
        const nextCheckItems = [
          ...blocks.map((block, index) => ({
            ...createLocalCheckItem(extractResultTitle(block) || `材料检查项 ${index + 1}`),
            category: 'other' as ThesisTutorCheckCategory,
            severity: 'medium' as ThesisTutorCheckSeverity,
            status: 'issue_found' as ThesisTutorCheckStatus,
            issue: truncateExportText(block, 5000),
            suggestion: '请结合学校格式要求、引用规范和正文语境继续核对。',
          })),
          ...checkItems,
        ];
        setCheckItems(nextCheckItems);
        setActiveCheckId(nextCheckItems[0]?.id || '');
        const nextState = await window.yibiao?.thesisTutor?.saveChecks({ checkItems: nextCheckItems, activeCheckId: nextCheckItems[0]?.id || '' });
        if (nextState) setState(nextState);
        showToast(`已提取 ${blocks.length} 个检查项`, 'success');
        return;
      }
      if (profileLocked) {
        showToast('论文档案已锁定，请先解锁再沉淀材料', 'info');
        return;
      }
      const nextProfile = activePanel === 'methodology'
        ? {
          ...profile,
          methodologyNotes: appendMaterial(profile.methodologyNotes, material.slice(0, 3000)),
          dataSources: appendMaterial(profile.dataSources, blocks[0] || '').slice(0, 3000),
        }
        : { ...profile, schoolRequirements: appendMaterial(profile.schoolRequirements, material.slice(0, 3000)) };
      setProfile(nextProfile);
      const nextState = await window.yibiao?.thesisTutor?.saveProfile(nextProfile);
      if (nextState) {
        setState(nextState);
        setProfile({ ...defaultProfile, ...nextState.profile });
      }
      showToast('已沉淀到论文档案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '结构化提取材料失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function carryResultToNextPanel() {
    if (!result.trim() || !nextPanel) return;
    const nextCopy = panelCopy[nextPanel];
    switchPanel(nextPanel);
    setUserInput(`请基于上一阶段成果继续推进“${nextCopy.label}”。`);
    setSourceText([`## 上一阶段：${panel.label}`, result].join('\n\n'));
    showToast(`已带着当前结果进入“${nextCopy.label}”`, 'success');
  }

  async function settleTopicToProfile() {
    if (!result.trim()) return void showToast('请先生成或填写选题结果', 'info');
    if (profileLocked) return void showToast('论文档案已锁定，请先解锁再沉淀选题结果', 'info');
    const nextProfile = {
      ...profile,
      title: profile.title.trim() || extractResultTitle(result),
      researchQuestions: profile.researchQuestions.trim() ? profile.researchQuestions : truncateExportText(result, 1600),
      outlinePlan: profile.outlinePlan.trim() ? profile.outlinePlan : truncateExportText(result, 1800),
      stage: profile.stage === '没方向' ? '有方向没定题' : profile.stage,
    };
    setProfile(nextProfile);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveProfile(nextProfile);
      setState(nextState);
      setProfile({ ...defaultProfile, ...nextState.profile });
      showToast('已把选题结果沉淀到论文档案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到论文档案失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleResultToReferences() {
    if (!result.trim()) return void showToast('请先生成或填写文献综述结果', 'info');
    const nextReference = {
      ...createLocalReference(extractResultTitle(result) || '来自文献综述的证据链'),
      type: 'literature' as ThesisTutorReferenceType,
      summary: truncateExportText(result, 5000),
      keyPoints: '由文献综述结果沉淀，可继续拆分为多条文献或证据。',
    };
    const nextReferences = [nextReference, ...references];
    setReferences(nextReferences);
    setActiveReferenceId(nextReference.id);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveReferences({ references: nextReferences, activeReferenceId: nextReference.id });
      setState(nextState);
      setReferences(nextState.references || []);
      setActiveReferenceId(nextState.activeReferenceId || nextReference.id);
      showToast('已沉淀到文献与证据链', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到证据链失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleResultToFeedback() {
    if (!result.trim()) return void showToast('请先生成或填写评审结果', 'info');
    const nextFeedback = {
      ...createLocalFeedback(extractResultTitle(result) || '来自评审结果的修改任务'),
      source: panel.label,
      priority: 'high' as ThesisTutorFeedbackPriority,
      status: 'todo' as ThesisTutorFeedbackStatus,
      originalFeedback: truncateExportText(result, 5000),
      actionPlan: '请根据评审结果拆分并逐项处理。',
    };
    const nextFeedbackItems = [nextFeedback, ...feedbackItems];
    setFeedbackItems(nextFeedbackItems);
    setActiveFeedbackId(nextFeedback.id);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveFeedback({ feedbackItems: nextFeedbackItems, activeFeedbackId: nextFeedback.id });
      setState(nextState);
      setFeedbackItems(nextState.feedbackItems || []);
      setActiveFeedbackId(nextState.activeFeedbackId || nextFeedback.id);
      showToast('已沉淀到导师反馈闭环', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到导师反馈失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function settleResultToChecks() {
    if (!result.trim()) return void showToast('请先生成或填写检查结果', 'info');
    const nextCheck = {
      ...createLocalCheckItem(extractResultTitle(result) || '来自格式与查重结果的检查项'),
      category: 'other' as ThesisTutorCheckCategory,
      severity: 'medium' as ThesisTutorCheckSeverity,
      status: 'issue_found' as ThesisTutorCheckStatus,
      issue: truncateExportText(result, 4000),
      suggestion: '请根据检查结果逐项修改，并在修改记录中说明处理情况。',
    };
    const nextCheckItems = [nextCheck, ...checkItems];
    setCheckItems(nextCheckItems);
    setActiveCheckId(nextCheck.id);
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const nextState = await window.yibiao.thesisTutor.saveChecks({ checkItems: nextCheckItems, activeCheckId: nextCheck.id });
      setState(nextState);
      setCheckItems(nextState.checkItems || []);
      setActiveCheckId(nextState.activeCheckId || nextCheck.id);
      showToast('已沉淀到格式与查重检查清单', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '沉淀到检查清单失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return {
    getMaterialExtractLabel,
    extractMaterialToWorkspace,
    carryResultToNextPanel,
    settleTopicToProfile,
    settleResultToReferences,
    settleResultToFeedback,
    settleResultToChecks,
  };
}
