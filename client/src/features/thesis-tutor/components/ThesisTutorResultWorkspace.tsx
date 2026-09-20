import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import type { ThesisTutorPanel, ThesisTutorReference } from '../types';
import { panelCopy, type ThesisTutorPanelCopy } from '../model/thesisTutorPageModel';
import { auditThesisEvidence } from '../model/thesisTutorEvidenceAudit';

interface ThesisTutorResultWorkspaceProps {
  activePanel: ThesisTutorPanel;
  panel: ThesisTutorPanelCopy;
  nextPanel: ThesisTutorPanel | null;
  result: string;
  draft: string;
  references: ThesisTutorReference[];
  nextActionLabel: string;
  exportProgress: WordExportProgressEvent | null;
  isRunning: boolean;
  saving: boolean;
  setDraft: (value: string) => void;
  copyResult: () => void;
  saveDraft: () => void;
  exportWord: () => void;
  openReference: (id: string) => void;
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
  references,
  nextActionLabel,
  exportProgress,
  isRunning,
  saving,
  setDraft,
  copyResult,
  saveDraft,
  exportWord,
  openReference,
  carryResultToNextPanel,
  settleTopicToProfile,
  settleResultToReferences,
  settleResultToFeedback,
  settleResultToChecks,
  generate,
  importSource,
  startDiagnosisTemplate,
}: ThesisTutorResultWorkspaceProps) {
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const evidenceAudit = auditThesisEvidence(result, references);
  const showEvidenceAudit = ['literature', 'drafting', 'writing', 'review', 'format'].includes(activePanel) && Boolean(result.trim());
  const needsExportReminder = showEvidenceAudit && (evidenceAudit.items.length > 0 || (['drafting', 'writing'].includes(activePanel) && evidenceAudit.markerCount === 0));

  function requestExportWord() {
    if (needsExportReminder) setExportConfirmOpen(true);
    else exportWord();
  }

  return (
    <div className="thesis-tutor-panel thesis-tutor-result-panel">
      <div className="thesis-tutor-panel-head thesis-tutor-result-head">
        <div>
          <strong>{panel.resultTitle}</strong>
          <span>{panel.resultHelp}</span>
        </div>
        <div className="thesis-tutor-actions thesis-tutor-result-actions">
          <button type="button" className="primary-action" onClick={saveDraft} disabled={saving || isRunning}>保存结果</button>
          <details className="thesis-tutor-action-menu">
            <summary>更多操作</summary>
            <div>
              <button type="button" onClick={copyResult} disabled={!result}>复制结果</button>
              <button type="button" onClick={requestExportWord} disabled={saving || isRunning || !result}>导出 Word</button>
            </div>
          </details>
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
        <details className="thesis-tutor-flow-actions thesis-tutor-flow-details">
          <summary>保存到项目或继续下一步</summary>
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
        </details>
      )}
      {showEvidenceAudit && (
        <details className="thesis-tutor-evidence-audit">
          <summary>证据核对 · {evidenceAudit.markerCount === 0 ? '未标注编号' : evidenceAudit.items.length ? `${evidenceAudit.items.length} 项待处理` : `${evidenceAudit.referencedCount} 条编号可对应`}</summary>
          <div>
            <p>仅检查正文中的 [证据:编号] 标记与当前证据链；不能判断未标注的观点是否真实，也不能代替原文核验。</p>
            {evidenceAudit.markerCount === 0 ? (
              <p>当前结果没有证据编号。涉及事实和数据的句子，请先关联已核验条目并标出原文位置。</p>
            ) : evidenceAudit.items.length ? (
              <ul>{evidenceAudit.items.map((item) => (
                <li key={item.id}><button type="button" onClick={() => openReference(item.id)}><strong>{item.id}</strong> · {item.title}：{item.issue === 'missing' ? '找不到证据条目，前往证据链补录' : item.issue === 'unverified' ? '尚未核验，前往证据条目' : '缺少原文位置，前往证据条目'}</button></li>
              ))}</ul>
            ) : <p>已标注的编号都能对应已核验证据和原文位置。请继续逐项核对正文观点与原文是否一致。</p>}
          </div>
        </details>
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
          </div>
        )}
      </div>
      <Dialog.Root open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="thesis-tutor-help-card thesis-tutor-evidence-export-dialog">
            <Dialog.Title>导出前核对证据</Dialog.Title>
            <Dialog.Description>
              {evidenceAudit.items.length
                ? `当前结果有 ${evidenceAudit.items.length} 个证据编号需要处理，可能缺少条目、尚未核验或没有原文位置。`
                : '当前正文未标注证据编号，无法逐项核对事实和数据的出处。'}
              导出内容仍需按原文和学校要求人工核验。
            </Dialog.Description>
            <div className="thesis-tutor-evidence-export-actions">
              <Dialog.Close asChild><button type="button" className="secondary-action">返回核对</button></Dialog.Close>
              <button type="button" className="primary-action" onClick={() => { setExportConfirmOpen(false); exportWord(); }}>仍要导出</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
