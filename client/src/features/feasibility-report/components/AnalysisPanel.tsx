import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { MarkdownEditor, MarkdownRenderer, useAppDialog, useToast } from '../../../shared/ui';
import type { FeasibilityReportState } from '../types';
import TaskProgressCard, { isTaskRunning } from './TaskProgressCard';

export default function AnalysisPanel({ projectId, state, onStateChange }: { projectId: string; state: FeasibilityReportState; onStateChange: (state: FeasibilityReportState) => void }) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const running = isTaskRunning(state.analysisTask);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.analysisMarkdown);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => { if (!editing) setDraft(state.analysisMarkdown); }, [editing, state.analysisMarkdown]);
  const start = async () => {
    try {
      await window.yibiao!.feasibilityReport.startAnalysis({ projectId });
      showToast('项目分析已在后台启动', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const save = async () => {
    if (state.outlineData && !await confirm({ title: '保存分析底稿', description: '修改分析底稿后，已有报告目录、关键参数和正文将被清空。', confirmLabel: '保存并清空下游' })) return;
    try {
      onStateChange(await window.yibiao!.feasibilityReport.saveAnalysis({ projectId, markdown: draft }));
      setEditing(false);
      showToast('分析底稿已保存', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  return <div className="feasibility-stage-content feasibility-analysis-layout">
    <section className="feasibility-step-action-row">
      <div><strong>资料分析</strong><p>综合项目资料提取事实、缺口、合规关注和主要风险。</p></div>
      <button type="button" className="primary-action" disabled={running} onClick={() => void start()}>{running ? '分析中…' : state.analysisMarkdown ? '重新分析' : '开始分析'}</button>
    </section>
    <section className="feasibility-three-pane-workspace feasibility-analysis-workspace">
      <TaskProgressCard task={state.analysisTask} emptyMessage="点击“开始分析”后，这里会持续显示分析阶段和进度。" />
      <article className="feasibility-document-editor-pane">
        <header><div><span className="section-kicker">分析结果</span><strong>资料事实</strong><p>可直接编辑；保存后会清空下游目录、关键参数和正文。</p></div><div className="feasibility-inline-actions"><button type="button" className="secondary-action" disabled={!state.analysisMarkdown || running} onClick={() => setPreviewOpen(true)}>预览</button><button type="button" className="secondary-action" disabled={!state.analysisMarkdown || running} onClick={() => { setDraft(state.analysisMarkdown); setEditing(!editing); }}>{editing ? '取消' : '编辑'}</button>{editing ? <button type="button" className="primary-action" onClick={() => void save()}>保存</button> : null}</div></header>
        <div className="feasibility-editor-body">{editing ? <MarkdownEditor value={draft} onChange={setDraft} placeholder="在此校正资料分析底稿…" /> : state.analysisMarkdown ? <pre>{state.analysisMarkdown}</pre> : <div className="feasibility-pane-empty"><strong>尚未生成分析底稿</strong><p>没有补充资料时也可基于项目基本信息分析。</p></div>}</div>
      </article>
      <article className="feasibility-document-preview-pane">
        <header><strong>渲染预览</strong><button type="button" className="secondary-action" disabled={!state.analysisMarkdown} onClick={() => setPreviewOpen(true)}>全屏</button></header>
        <div className="markdown-viewer">{state.analysisMarkdown ? <MarkdownRenderer allowRawHtml={false}>{editing ? draft : state.analysisMarkdown}</MarkdownRenderer> : <div className="feasibility-pane-empty"><strong>等待分析结果</strong><p>分析完成后将在这里显示结构化预览。</p></div>}</div>
      </article>
    </section>
    <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}><Dialog.Portal><Dialog.Overlay className="detail-help-modal" /><Dialog.Content className="detail-help-card feasibility-full-preview"><header className="detail-help-head"><div><Dialog.Title>资料分析底稿预览</Dialog.Title><Dialog.Description>以最终 Markdown 渲染效果预览分析结果。</Dialog.Description></div><Dialog.Close type="button" className="detail-help-close" aria-label="关闭预览">×</Dialog.Close></header><div className="feasibility-full-preview-body markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{editing ? draft : state.analysisMarkdown}</MarkdownRenderer></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
