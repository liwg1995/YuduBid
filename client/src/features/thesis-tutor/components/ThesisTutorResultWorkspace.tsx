import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import type { ThesisTutorPanel } from '../types';
import { panelCopy, type ThesisTutorPanelCopy } from '../model/thesisTutorPageModel';

interface ThesisTutorResultWorkspaceProps {
  activePanel: ThesisTutorPanel;
  panel: ThesisTutorPanelCopy;
  nextPanel: ThesisTutorPanel | null;
  result: string;
  draft: string;
  nextActionLabel: string;
  exportProgress: WordExportProgressEvent | null;
  isRunning: boolean;
  saving: boolean;
  setDraft: (value: string) => void;
  copyResult: () => void;
  saveDraft: () => void;
  exportWord: () => void;
  carryResultToNextPanel: () => void;
  settleTopicToProfile: () => void;
  settleResultToReferences: () => void;
  settleResultToFeedback: () => void;
  settleResultToChecks: () => void;
  generate: () => void;
  importSource: () => void;
  startDiagnosisTemplate: () => void;
}

export function ThesisTutorResultWorkspace({
  activePanel,
  panel,
  nextPanel,
  result,
  draft,
  nextActionLabel,
  exportProgress,
  isRunning,
  saving,
  setDraft,
  copyResult,
  saveDraft,
  exportWord,
  carryResultToNextPanel,
  settleTopicToProfile,
  settleResultToReferences,
  settleResultToFeedback,
  settleResultToChecks,
  generate,
  importSource,
  startDiagnosisTemplate,
}: ThesisTutorResultWorkspaceProps) {
  return (
    <div className="thesis-tutor-panel thesis-tutor-result-panel">
      <div className="thesis-tutor-panel-head thesis-tutor-result-head">
        <div>
          <strong>{panel.resultTitle}</strong>
          <span>{panel.resultHelp}</span>
        </div>
        <div className="thesis-tutor-actions thesis-tutor-result-actions">
          <button type="button" className="secondary-action" onClick={copyResult} disabled={!result}>复制</button>
          <button type="button" className="secondary-action" onClick={saveDraft} disabled={saving || isRunning}>保存结果</button>
          <button type="button" className="primary-action" onClick={exportWord} disabled={saving || isRunning || !result}>导出 Word</button>
        </div>
      </div>
      {exportProgress && exportProgress.phase !== 'canceled' && (
        <div className={`thesis-tutor-export-status is-${exportProgress.phase}`}>
          <div className="thesis-tutor-task-head">
            <span>{exportProgress.message}</span>
            <strong>{exportProgress.progress}%</strong>
          </div>
          <div className="thesis-tutor-task-track" aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, exportProgress.progress))}%` }} />
          </div>
        </div>
      )}
      {result.trim() && (
        <div className="thesis-tutor-flow-actions">
          <div>
            <strong>下一步流转</strong>
            <span>把当前结果继续带入后续模块，或沉淀为论文项目上下文。</span>
          </div>
          <div>
            {nextPanel && (
              <button type="button" className="secondary-action" onClick={carryResultToNextPanel} disabled={saving || isRunning}>
                带入{panelCopy[nextPanel].label}
              </button>
            )}
            {activePanel === 'topic' && (
              <button type="button" className="secondary-action" onClick={settleTopicToProfile} disabled={saving || isRunning}>
                沉淀到论文档案
              </button>
            )}
            {activePanel === 'literature' && (
              <button type="button" className="secondary-action" onClick={settleResultToReferences} disabled={saving || isRunning}>
                沉淀到证据链
              </button>
            )}
            {activePanel === 'drafting' && (
              <button type="button" className="secondary-action" onClick={saveDraft} disabled={saving || isRunning || !result.trim()}>
                保存为章节草稿
              </button>
            )}
            {activePanel === 'review' && (
              <button type="button" className="secondary-action" onClick={settleResultToFeedback} disabled={saving || isRunning}>
                转为反馈任务
              </button>
            )}
            {activePanel === 'format' && (
              <button type="button" className="secondary-action" onClick={settleResultToChecks} disabled={saving || isRunning}>
                加入检查清单
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`thesis-tutor-result-body ${result ? 'has-result' : 'is-empty'}`}>
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          placeholder={`${panel.resultPlaceholder}\n\n也可以直接输入或粘贴内容；建议先补充“${panel.inputTitle}”和“${panel.materialTitle}”，再点击“${nextActionLabel}”。`}
          disabled={isRunning}
        />
        {result ? (
          <div className="thesis-tutor-preview">
            <MarkdownRenderer allowRawHtml={false}>{result}</MarkdownRenderer>
          </div>
        ) : (
          <div className="thesis-tutor-result-hint">
            <p>当前为空，生成或手动输入后可保存、复制和导出 Word。</p>
            <div className="thesis-tutor-empty-actions">
              <button type="button" className="primary-action" onClick={generate} disabled={saving || isRunning}>{nextActionLabel}</button>
              <button type="button" className="secondary-action" onClick={importSource} disabled={saving || isRunning}>导入材料</button>
              {activePanel !== 'diagnosis' && (
                <button type="button" className="secondary-action" onClick={startDiagnosisTemplate} disabled={saving || isRunning}>先做诊断</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
