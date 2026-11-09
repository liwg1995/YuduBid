import { toChineseErrorMessage } from '../../../shared/utils/userFacingError';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isLibreOfficeRequiredMessage, MarkdownRenderer, useAppDialog, useDocumentParseNotice, useToast } from '../../../shared/ui';
import type { FileParserProvider, OutlineItem } from '../../../shared/types';
import type { BackgroundTaskState, TechnicalPlanState, TechnicalPlanTenderFile, TechnicalPlanWorkflowKind } from '../types';
import TaskProgressSummary from '../../../shared/ui/TaskProgressSummary';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import './documentAnalysis.css';
import './modernDocumentAnalysis.css';

const parserLabels: Record<FileParserProvider, string> = {
  local: '本地解析',
  'mineru-accurate-api': 'MinerU 精准解析 API',
  'mineru-agent-api': 'MinerU-Agent 轻量解析 API',
};

function hasGeneratedOutlineContent(items: OutlineItem[] = []): boolean {
  return items.some((item) => String(item.content || '').trim() || hasGeneratedOutlineContent(item.children || []));
}

interface DocumentAnalysisPageProps {
  projectId?: string;
  workflowKind: TechnicalPlanWorkflowKind;
  tenderFile: TechnicalPlanTenderFile | null;
  tenderMarkdown: string;
  bidSections?: TechnicalPlanState['bidSections'];
  selectedBidSectionId?: string;
  bidSectionSource?: TechnicalPlanState['bidSectionSource'];
  bidSectionExtractionTask?: BackgroundTaskState;
  hasDownstreamResults?: boolean;
  onFileImported: (state: TechnicalPlanState, markdown: string) => void;
  onOriginalPlanImported: (state: TechnicalPlanState, markdown: string) => void;
  onSectionSelected: (state: TechnicalPlanState) => void;
}

function DocumentAnalysisPage({
  projectId,
  workflowKind,
  tenderFile,
  tenderMarkdown,
  bidSections = [],
  selectedBidSectionId = '',
  bidSectionSource = 'heading',
  bidSectionExtractionTask,
  hasDownstreamResults = false,
  onFileImported,
  onOriginalPlanImported,
  onSectionSelected,
}: DocumentAnalysisPageProps) {
  const [parserLabel, setParserLabel] = useState(parserLabels.local);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<'tender' | 'generated' | 'sections' | 'selection' | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [showExpansionBidSection, setShowExpansionBidSection] = useState(false);
  const [canImportGeneratedPlan, setCanImportGeneratedPlan] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const { showDocumentParseNotice } = useDocumentParseNotice();
  const isExpansionWorkflow = workflowKind === 'existing-plan-expansion';
  const sectionExtractionRunning = bidSectionExtractionTask?.status === 'running';
  const tenderLines = useMemo(() => tenderMarkdown.split(/\r?\n/), [tenderMarkdown]);

  const extractBidSections = async () => {
    if (hasDownstreamResults && !await confirm({ title: '重新识别投标标段', description: '新的标段范围会清空当前招标解析、目录、全局事实和正文结果，请确认。', danger: true })) return;
    try {
      setBusy(true);
      setBusyAction('sections');
      await window.yibiao?.tasks.startBidSectionExtraction({ workflowKind, projectId, confirmClearDownstream: hasDownstreamResults });
      showToast('多标段识别已在后台启动', 'success');
    } catch (error) {
      showToast(toChineseErrorMessage(error, '启动标段识别失败，请稍后重试'), 'error');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const selectBidSection = async (sectionId: string) => {
    if (sectionId === selectedBidSectionId) return;
    if (hasDownstreamResults && !await confirm({ title: '切换投标范围', description: '切换后将清空当前招标解析、目录、全局事实和正文结果，请确认。', danger: true })) return;
    try {
      setBusy(true);
      setBusyAction('selection');
      const saved = await window.yibiao?.technicalPlan.saveSelectedBidSection({ workflowKind, projectId, sectionId });
      if (saved) onSectionSelected(saved);
      showToast(sectionId ? '已选择本次投标标段' : '已恢复使用整份招标文件', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存投标范围失败', 'error');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadParserConfig = async () => {
      if (!window.yibiao) {
        return;
      }

      try {
        const config = await window.yibiao.config.load();
        if (mounted) {
          setParserLabel(parserLabels[config.file_parser.provider] || parserLabels.local);
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : '读取文件解析配置失败', 'error');
      }
    };

    loadParserConfig();

    return () => {
      mounted = false;
    };
  }, [showToast]);

  useEffect(() => {
    let mounted = true;

    const loadGeneratedPlanAvailability = async () => {
      if (!isExpansionWorkflow || !window.yibiao) {
        if (mounted) setCanImportGeneratedPlan(false);
        return;
      }

      try {
        const technicalPlan = await window.yibiao.technicalPlan.loadState({ workflowKind: 'technical-plan', projectId });
        const available = Boolean(
          technicalPlan.tenderFile
          && hasGeneratedOutlineContent(technicalPlan.outlineData?.outline || []),
        );
        if (mounted) setCanImportGeneratedPlan(available);
      } catch {
        if (mounted) setCanImportGeneratedPlan(false);
      }
    };

    loadGeneratedPlanAvailability();

    return () => {
      mounted = false;
    };
  }, [isExpansionWorkflow]);

  const importDocument = async () => {
    try {
      setBusy(true);
      setBusyAction('tender');
      const result = await window.yibiao?.technicalPlan.importTenderDocument({ workflowKind, projectId });

      if (!result?.success || !result.markdown) {
        const message = result?.message || '未导入文件';
        if (isLibreOfficeRequiredMessage(message)) {
          showDocumentParseNotice(message);
          return;
        }
        showToast(message, message === '已取消选择' ? 'info' : 'error');
        return;
      }

      onFileImported(result.state, result.markdown);
      if (result.state.tenderFile?.parserLabel) {
        setParserLabel(result.state.tenderFile.parserLabel);
      }
      showToast(result.message || '招标文件已导入', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件解析失败';
      if (isLibreOfficeRequiredMessage(message)) {
        showDocumentParseNotice(message);
        return;
      }
      showToast(message, 'error');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const importGeneratedOriginalPlan = async () => {
    try {
      setBusy(true);
      setBusyAction('generated');
      const result = await window.yibiao?.technicalPlan.importGeneratedOriginalPlan({ workflowKind, projectId, sourceProjectId: projectId });

      if (!result?.success || !result.markdown) {
        showToast(result?.message || '方案生成项目暂无可导入的内容', 'info');
        return;
      }

      const importedTenderMarkdown = result.tenderMarkdown || await window.yibiao?.technicalPlan.readTenderMarkdown({ workflowKind: 'existing-plan-expansion', projectId }) || '';
      const importedOriginalMarkdown = result.markdown || await window.yibiao?.technicalPlan.readOriginalPlanMarkdown({ workflowKind: 'existing-plan-expansion', projectId }) || '';
      onFileImported(result.state, importedTenderMarkdown);
      onOriginalPlanImported(result.state, importedOriginalMarkdown);
      showToast(result.message || '已导入方案生成内容', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入技术方案生成内容失败', 'error');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const renderBidSection = () => tenderFile && (!isExpansionWorkflow || bidSections.length > 1 || showExpansionBidSection) ? (
    <section className="analysis-upload-tile bid-section-selection">
          <div className="bid-section-copy"><div className="bid-section-heading"><span className="section-kicker">投标范围</span><strong>选择本次投标标段</strong>{isExpansionWorkflow && bidSections.length < 2 && !sectionExtractionRunning && <button type="button" className="analysis-section-collapse" onClick={() => setShowExpansionBidSection(false)}>收起</button>}</div><p>{bidSectionSource === 'evidence' ? '核对识别证据与原文范围后再选择。未明确归属其他标段的通用条款会保留。' : '多标段项目可识别后选择；不区分标段时，默认使用整份招标文件。'}</p></div>
          <button type="button" className="secondary-action modern-inline-operation is-accent" disabled={busy || sectionExtractionRunning} onClick={() => void extractBidSections()}>{sectionExtractionRunning ? '正在识别标段…' : '按原文证据重新识别'}</button>
          {bidSections.length > 1 && <select aria-label="本次投标标段" value={selectedBidSectionId} disabled={busy || sectionExtractionRunning} onChange={(event) => void selectBidSection(event.target.value)}>
            <option value="">整份招标文件</option>
            {bidSections.map((section) => <option value={section.id} key={section.id}>{section.title}（{section.includeRanges?.length || 1} 处原文）</option>)}
          </select>}
          {sectionExtractionRunning && getStoredUiAppearance() === 'modern' && <TaskProgressSummary label="标段识别" percent={bidSectionExtractionTask?.progress || 0} status="active" />}
          {bidSectionExtractionTask?.status === 'error' && <div className="bid-section-error" role="alert"><strong>标段识别未完成</strong><p>{toChineseErrorMessage(bidSectionExtractionTask.error, '识别失败，请稍后重试')}</p><small>招标文件已保留。可稍后重试；如无需区分标段，可按整份招标文件继续。</small></div>}
          {bidSections.length > 1 && <div className="bid-section-evidence">
            {bidSections.map((section) => <details key={section.id} open={section.id === selectedBidSectionId}>
              <summary>{section.title} · {section.includeRanges?.length || 1} 处原文</summary>
              <div>{(section.includeRanges || [{ startLine: section.startLine, endLine: section.endLine }]).map((range, index) => <div key={`${range.startLine}-${range.endLine}-${index}`}><p>第 {range.startLine}–{range.endLine} 行{range.reason ? `：${range.reason}` : ''}</p><blockquote>{tenderLines.slice(range.startLine - 1, Math.min(range.endLine, range.startLine + 2)).join('\n').slice(0, 300)}</blockquote></div>)}</div>
              {section.evidence?.length ? <small>识别证据：{section.evidence.join('；')}</small> : null}
            </details>)}
          </div>}
        </section>
  ) : null;

  if (getStoredUiAppearance() === 'modern') {
    return <div className="modern-document-workspace">
      <div className="modern-document-controls">
        <header><h2>准备招标文件</h2><p>导入完整招标文件，核对解析内容和投标范围；如有原方案，可在下一步上传。</p></header>
        <section className={`modern-document-source${tenderFile ? ' is-imported' : ''}`} aria-label="招标文件">
          <div className="modern-document-source-top"><span>招标文件</span><strong>{tenderFile ? '已导入' : '待导入'}</strong></div>
          <h3>{tenderFile?.fileName || '选择招标文件'}</h3>
          <p>{tenderFile ? `${tenderFile.parserLabel || parserLabel} · ${tenderFile.markdownChars} 字` : `当前解析方案：${parserLabel}`}</p>
          <div><button type="button" onClick={() => previewRef.current?.focus()} disabled={!tenderFile}>查看内容</button><button type="button" className="is-primary" onClick={importDocument} disabled={busy}>{busyAction === 'tender' ? '正在导入…' : tenderFile ? '替换文件' : '选择文件'}</button></div>
        </section>
        {isExpansionWorkflow && canImportGeneratedPlan && <button type="button" className="modern-document-import-existing" onClick={importGeneratedOriginalPlan} disabled={busy}>{busyAction === 'generated' ? '正在导入…' : '从方案生成项目导入已有内容'}</button>}
        {isExpansionWorkflow && tenderFile && bidSections.length < 2 && !showExpansionBidSection && <button type="button" className="modern-document-bid-trigger" onClick={() => setShowExpansionBidSection(true)}>包含多个标段？识别本次投标范围 <span aria-hidden="true">→</span></button>}
        {hasDownstreamResults && <p className="modern-document-replace-hint">替换文件或切换投标范围会清空后续解析、目录和正文结果。</p>}
        {renderBidSection()}
      </div>
      <section className="modern-document-preview" ref={previewRef} tabIndex={-1} aria-label="招标文件内容预览">
        <header><div><h2>招标文件内容</h2></div><small>{tenderFile ? `${tenderFile.markdownChars} 字` : '等待导入'}</small></header>
        {busy && <p className="modern-document-import-status" role="status">{busyAction === 'selection' ? '正在保存投标范围…' : busyAction === 'sections' ? '正在启动标段识别…' : busyAction === 'tender' ? '正在导入招标文件…' : '正在导入已有内容…'}</p>}
        <div className="modern-document-preview-body">{tenderMarkdown ? <div className="markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{tenderMarkdown}</MarkdownRenderer></div> : <div className="modern-document-empty"><strong>尚未导入招标文件</strong><p>选择招标文件后，解析内容会显示在这里。</p></div>}</div>
      </section>
    </div>;
  }

  return (
    <div className={`plan-step-body document-analysis-page${isExpansionWorkflow ? ' existing-plan-analysis-page' : ''}`}>
      <section className="analysis-import-card">
        <div>
          <span className="section-kicker">STEP 01</span>
          <strong>上传招标文件</strong>
          <p>当前解析方案：{parserLabel}。如有原方案，可在下一步上传。</p>
        </div>
        <div className="analysis-actions">
          {isExpansionWorkflow && canImportGeneratedPlan && (
            <button type="button" className="secondary-action" onClick={importGeneratedOriginalPlan} disabled={busy}>
              {busyAction === 'generated' ? '导入中…' : '导入方案生成项目内容'}
            </button>
          )}
          <button type="button" className="primary-action" onClick={importDocument} disabled={busy}>
            {busyAction === 'tender' ? '解析中…' : tenderFile ? '重新选择文件' : '选择文件'}
          </button>
        </div>
      </section>

      {isExpansionWorkflow && tenderFile && bidSections.length < 2 && !showExpansionBidSection && (
        <button type="button" className="analysis-section-trigger" onClick={() => setShowExpansionBidSection(true)}>
          <span className="analysis-section-trigger-copy">
            <strong>投标范围</strong>
            <span>招标文件包含多个标段？可先识别本次投标范围</span>
          </span>
          <span className="analysis-section-trigger-action">识别并选择<span aria-hidden="true">›</span></span>
        </button>
      )}

      {renderBidSection()}

      <section className="analysis-markdown-card">
        <div className="analysis-result-head">
          <strong>招标文件内容</strong>
          <span>{tenderFile ? `${tenderFile.fileName} · ${tenderFile.markdownChars} 字` : '等待上传'}</span>
        </div>

        {tenderMarkdown ? (
          <div className="markdown-viewer">
            <MarkdownRenderer>
              {tenderMarkdown}
            </MarkdownRenderer>
          </div>
        ) : (
          <div className="markdown-empty-state">
            <strong>尚未导入招标文件</strong>
            <p>招标文件导入后，可在这里核对解析结果。</p>
          </div>
        )}
      </section>

    </div>
  );
}

export default DocumentAnalysisPage;
