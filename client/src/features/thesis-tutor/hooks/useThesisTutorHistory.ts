import type { Dispatch, SetStateAction } from 'react';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type { ThesisTutorHistoryItem, ThesisTutorPanel, ThesisTutorState } from '../types';

interface UseThesisTutorHistoryOptions {
  state: ThesisTutorState | null;
  setState: Dispatch<SetStateAction<ThesisTutorState | null>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setActivePanel: Dispatch<SetStateAction<ThesisTutorPanel>>;
  setUserInput: Dispatch<SetStateAction<string>>;
  navigateToPanel: (panel: ThesisTutorPanel) => void;
  showToast: (message: string, type?: ToastType) => number;
}

export function useThesisTutorHistory({
  state,
  setState,
  setDraft,
  setActivePanel,
  setUserInput,
  navigateToPanel,
  showToast,
}: UseThesisTutorHistoryOptions) {
  function restoreHistoryItem(item: ThesisTutorHistoryItem) {
    setDraft(item.content);
    setActivePanel(item.panel);
    setUserInput(item.input || '');
    navigateToPanel(item.panel);
    showToast('已恢复历史版本到结果区，可继续编辑或导出', 'success');
  }

  async function saveHistoryList(nextHistory: ThesisTutorHistoryItem[], successMessage?: string) {
    setState((current) => (current ? { ...current, history: nextHistory } : current));
    if (!window.yibiao?.thesisTutor) return;
    try {
      const nextState = await window.yibiao.thesisTutor.saveHistory({ history: nextHistory });
      setState(nextState);
      if (successMessage) showToast(successMessage, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存历史记录失败', 'error');
    }
  }

  function updateHistoryItem(itemId: string, patch: Partial<ThesisTutorHistoryItem>, successMessage?: string) {
    const nextHistory = (state?.history || []).map((item) => (
      item.id === itemId ? { ...item, ...patch } : item
    ));
    void saveHistoryList(nextHistory, successMessage);
  }

  function renameHistoryItem(item: ThesisTutorHistoryItem, title: string) {
    const nextTitle = title.trim();
    const currentTitle = item.customTitle || item.title;
    if (!nextTitle || nextTitle === currentTitle) return;
    updateHistoryItem(item.id, { customTitle: nextTitle }, '历史版本名称已保存');
  }

  function toggleHistoryImportant(item: ThesisTutorHistoryItem) {
    updateHistoryItem(
      item.id,
      { important: !item.important },
      item.important ? '已取消重要标记' : '已标记为重要版本',
    );
  }

  function removeHistoryItem(item: ThesisTutorHistoryItem) {
    const nextHistory = (state?.history || []).filter((historyItem) => historyItem.id !== item.id);
    void saveHistoryList(nextHistory, '历史记录已删除');
  }

  return { restoreHistoryItem, renameHistoryItem, toggleHistoryImportant, removeHistoryItem };
}
