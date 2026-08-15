import type { Dispatch, SetStateAction } from 'react';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type { ThesisTutorPanel, ThesisTutorProfile, ThesisTutorState } from '../types';
import { defaultProfile } from '../model/thesisTutorPageModel';

interface UseThesisTutorProjectIOOptions {
  setState: Dispatch<SetStateAction<ThesisTutorState | null>>;
  setProfile: Dispatch<SetStateAction<ThesisTutorProfile>>;
  setActivePanel: Dispatch<SetStateAction<ThesisTutorPanel>>;
  setSourceText: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setUserInput: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  syncWorkspaces: (state: ThesisTutorState) => void;
  navigateToPanel: (panel: ThesisTutorPanel) => void;
  startOperationProgress: (message: string) => string;
  finishOperationProgress: (requestId: string, message: string, phase?: WordExportProgressEvent['phase']) => void;
  showToast: (message: string, type?: ToastType) => number;
}

export function useThesisTutorProjectIO({
  setState,
  setProfile,
  setActivePanel,
  setSourceText,
  setDraft,
  setUserInput,
  setSaving,
  syncWorkspaces,
  navigateToPanel,
  startOperationProgress,
  finishOperationProgress,
  showToast,
}: UseThesisTutorProjectIOOptions) {
  function applyWorkspaceState(nextState: ThesisTutorState) {
    const nextPanel = nextState.activePanel || 'diagnosis';
    setState(nextState);
    setProfile({ ...defaultProfile, ...nextState.profile });
    setActivePanel(nextPanel);
    setSourceText(nextState.sourceText || '');
    setDraft(nextState.draft || nextState.latestResult || '');
    setUserInput(nextState.panelResults?.[nextPanel]?.input || '');
    syncWorkspaces(nextState);
    navigateToPanel(nextPanel);
  }

  async function exportWorkspace() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导出论文导师备份');
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.exportWorkspace();
      if (payload.success) {
        finishOperationProgress(requestId, payload.message || '论文导师工作区备份已导出');
        showToast(payload.message || '论文导师工作区备份已导出', 'success');
      } else if (!payload.canceled) {
        finishOperationProgress(requestId, payload.message || '导出论文导师工作区失败', 'error');
        showToast(payload.message || '导出论文导师工作区失败', 'info');
      } else {
        finishOperationProgress(requestId, '已取消导出备份', 'canceled');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出论文导师工作区失败';
      finishOperationProgress(requestId, message, 'error');
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function exportProjectPackage() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导出论文导师项目包');
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.exportProjectPackage();
      if (payload.success) {
        finishOperationProgress(requestId, payload.message || '论文导师项目包已导出');
        showToast(payload.message || '论文导师项目包已导出', 'success');
      } else if (!payload.canceled) {
        finishOperationProgress(requestId, payload.message || '导出论文导师项目包失败', 'error');
        showToast(payload.message || '导出论文导师项目包失败', 'info');
      } else {
        finishOperationProgress(requestId, '已取消导出项目包', 'canceled');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出论文导师项目包失败';
      finishOperationProgress(requestId, message, 'error');
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function importWorkspace() {
    if (!window.yibiao?.thesisTutor) {
      showToast('当前环境未注入论文导师服务', 'error');
      return;
    }
    const requestId = startOperationProgress('正在导入论文导师备份或项目包');
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.importWorkspace();
      if (payload.success) {
        applyWorkspaceState(payload.state);
        finishOperationProgress(requestId, payload.message || '论文导师工作区已导入');
        showToast(payload.message || '论文导师工作区已导入', 'success');
      } else if (!payload.canceled) {
        finishOperationProgress(requestId, payload.message || '导入论文导师工作区失败', 'error');
        showToast(payload.message || '导入论文导师工作区失败', 'error');
      } else {
        finishOperationProgress(requestId, '已取消导入备份', 'canceled');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入论文导师工作区失败';
      finishOperationProgress(requestId, message, 'error');
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return { exportWorkspace, exportProjectPackage, importWorkspace };
}
