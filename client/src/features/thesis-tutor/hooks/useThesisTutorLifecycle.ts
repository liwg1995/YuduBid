import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type { ThesisTutorPanel, ThesisTutorProfile, ThesisTutorState } from '../types';
import { defaultProfile, type ThesisTutorOperationProgress } from '../model/thesisTutorPageModel';

interface UseThesisTutorLifecycleOptions {
  initialPanel: ThesisTutorPanel;
  setState: Dispatch<SetStateAction<ThesisTutorState | null>>;
  setProfile: Dispatch<SetStateAction<ThesisTutorProfile>>;
  setActivePanel: Dispatch<SetStateAction<ThesisTutorPanel>>;
  setSourceText: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setUserInput: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  syncWorkspaces: (state: ThesisTutorState) => void;
  resetWorkspaces: () => void;
  showToast: (message: string, type?: ToastType) => number;
}

export function useThesisTutorLifecycle({
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
}: UseThesisTutorLifecycleOptions) {
  const operationProgressTimerRef = useRef<number | null>(null);
  const operationProgressClearTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [missingTextModelFields, setMissingTextModelFields] = useState<string[]>([]);
  const [exportProgress, setExportProgress] = useState<WordExportProgressEvent | null>(null);
  const [operationProgress, setOperationProgress] = useState<ThesisTutorOperationProgress | null>(null);

  function clearOperationProgressTimers() {
    if (operationProgressTimerRef.current !== null) {
      window.clearInterval(operationProgressTimerRef.current);
      operationProgressTimerRef.current = null;
    }
    if (operationProgressClearTimerRef.current !== null) {
      window.clearTimeout(operationProgressClearTimerRef.current);
      operationProgressClearTimerRef.current = null;
    }
  }

  function startOperationProgress(message: string) {
    const requestId = `thesis-local-${Date.now()}`;
    clearOperationProgressTimers();
    setOperationProgress({ requestId, phase: 'running', progress: 8, message });
    operationProgressTimerRef.current = window.setInterval(() => {
      setOperationProgress((current) => {
        if (!current || current.requestId !== requestId || current.phase !== 'running') return current;
        const nextProgress = Math.min(
          92,
          Math.max(current.progress + 1, Math.round(current.progress + (92 - current.progress) * 0.16)),
        );
        return { ...current, progress: nextProgress, message };
      });
    }, 500);
    return requestId;
  }

  function finishOperationProgress(
    requestId: string,
    message: string,
    phase: WordExportProgressEvent['phase'] = 'success',
  ) {
    if (operationProgressTimerRef.current !== null) {
      window.clearInterval(operationProgressTimerRef.current);
      operationProgressTimerRef.current = null;
    }
    setOperationProgress((current) => (
      current?.requestId === requestId
        ? { ...current, phase, progress: phase === 'canceled' ? 0 : 100, message }
        : current
    ));
    operationProgressClearTimerRef.current = window.setTimeout(() => {
      setOperationProgress((current) => (current?.requestId === requestId ? null : current));
      operationProgressClearTimerRef.current = null;
    }, phase === 'success' ? 1200 : 1800);
  }

  useEffect(() => {
    setActivePanel(initialPanel);
  }, [initialPanel, setActivePanel]);

  useEffect(() => {
    let mounted = true;
    const bridge = window.yibiao?.thesisTutor;
    if (!bridge) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    bridge.loadState()
      .then((nextState) => {
        if (!mounted) return;
        setState(nextState);
        setProfile({ ...defaultProfile, ...nextState.profile });
        setSourceText(nextState.sourceText || '');
        setDraft(nextState.draft || nextState.latestResult || '');
        syncWorkspaces(nextState);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取论文导师状态失败', 'error'))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = bridge.onEvent((nextState) => {
      setState(nextState);
      setProfile({ ...defaultProfile, ...nextState.profile });
      setSourceText(nextState.sourceText || '');
      setDraft(nextState.draft || nextState.latestResult || '');
      syncWorkspaces(nextState);
    });
    const unsubscribeExport = window.yibiao?.export.onWordExportProgress((event) => {
      setExportProgress(event);
      if (event.phase === 'success') {
        showToast(event.message || '论文导师结果已导出 Word', 'success');
      } else if (event.phase === 'error') {
        showToast(event.message || '导出 Word 失败', 'error');
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
      unsubscribeExport?.();
      clearOperationProgressTimers();
    };
  }, [showToast]);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.config.load()
      .then((config) => {
        if (!mounted || !config) return;
        setMissingTextModelFields([
          !String(config.api_key || '').trim() ? 'API Key' : '',
          !String(config.base_url || '').trim() ? 'Base URL' : '',
          !String(config.model_name || '').trim() ? '模型名称' : '',
        ].filter(Boolean));
      })
      .catch(() => {
        if (mounted) setMissingTextModelFields([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function clearAll() {
    if (!window.yibiao?.thesisTutor) return;
    try {
      setSaving(true);
      const payload = await window.yibiao.thesisTutor.clear();
      setState(payload.state);
      setProfile({ ...defaultProfile, ...payload.state.profile });
      setSourceText('');
      setDraft('');
      setUserInput('');
      resetWorkspaces();
      showToast('论文导师工作区已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return {
    loading,
    missingTextModelFields,
    exportProgress,
    setExportProgress,
    operationProgress,
    startOperationProgress,
    finishOperationProgress,
    clearAll,
  };
}
