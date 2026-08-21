import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { MarkdownEditor, MarkdownRenderer, useToast } from '../../../shared/ui';
import type { FeasibilityReportState } from '../types';
import TaskProgressCard, { isTaskRunning } from './TaskProgressCard';

export default function ParametersPanel({ projectId, state, onStateChange }: { projectId: string; state: FeasibilityReportState; onStateChange: (state: FeasibilityReportState) => void }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(state.keyParametersMarkdown);
  const [editing, setEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => { if (!editing) setDraft(state.keyParametersMarkdown); }, [editing, state.keyParametersMarkdown]);
  const running = isTaskRunning(state.parametersTask);
  const generate = async () => {
    try { await window.yibiao!.feasibilityReport.startParameters({ projectId }); showToast('关键参数生成已在后台启动', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const save = async () => {
    try { onStateChange(await window.yibiao!.feasibilityReport.saveKeyParameters({ projectId, markdown: draft })); setEditing(false); showToast('关键参数已保存，后续正文将使用新口径', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  return <div className="feasibility-stage-content feasibility-parameters-layout">
    <section className="feasibility-step-action-row"><div><strong>关键参数</strong><p>提取建设规模、投资、周期、效益指标和全文统一编制口径。</p></div><button type="button" className="primary-action" disabled={running || !state.outlineData} onClick={() => void generate()}>{running ? '生成中…' : state.keyParametersMarkdown ? '重新生成' : '生成关键参数'}</button></section>
    <section className="feasibility-three-pane-workspace feasibility-parameters-workspace">
      <TaskProgressCard task={state.parametersTask} emptyMessage="点击“生成关键参数”后，后台会整理全文统一口径。" />
      <article className="feasibility-document-editor-pane"><header><div><span className="section-kicker">编制口径</span><strong>关键参数</strong><p>重点核对“待补充”和“待确认”内容。</p></div><div className="feasibility-inline-actions"><button type="button" className="secondary-action" disabled={!state.keyParametersMarkdown} onClick={() => setPreviewOpen(true)}>预览</button><button type="button" className="secondary-action" disabled={!state.keyParametersMarkdown || running} onClick={() => setEditing(!editing)}>{editing ? '取消' : '编辑'}</button>{editing ? <button type="button" className="primary-action" onClick={() => void save()}>保存</button> : null}</div></header><div className="feasibility-editor-body">{editing ? <MarkdownEditor value={draft} onChange={setDraft} placeholder="在此补充或校正关键参数…" /> : state.keyParametersMarkdown ? <pre>{state.keyParametersMarkdown}</pre> : <div className="feasibility-pane-empty"><strong>等待关键参数</strong><p>请先完成项目分析和报告目录。</p></div>}</div></article>
      <article className="feasibility-document-preview-pane"><header><strong>渲染预览</strong><button type="button" className="secondary-action" disabled={!state.keyParametersMarkdown} onClick={() => setPreviewOpen(true)}>全屏</button></header><div className="markdown-viewer">{state.keyParametersMarkdown ? <MarkdownRenderer allowRawHtml={false}>{editing ? draft : state.keyParametersMarkdown}</MarkdownRenderer> : <div className="feasibility-pane-empty"><strong>等待关键参数</strong><p>生成完成后将在这里显示结构化预览。</p></div>}</div></article>
    </section>
    <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}><Dialog.Portal><Dialog.Overlay className="detail-help-modal" /><Dialog.Content className="detail-help-card feasibility-full-preview"><header className="detail-help-head"><div><Dialog.Title>关键参数预览</Dialog.Title><Dialog.Description>核对全文统一参数和编制口径。</Dialog.Description></div><Dialog.Close type="button" className="detail-help-close" aria-label="关闭预览">×</Dialog.Close></header><div className="feasibility-full-preview-body markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{editing ? draft : state.keyParametersMarkdown}</MarkdownRenderer></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
