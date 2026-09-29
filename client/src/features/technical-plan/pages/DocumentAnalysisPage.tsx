import { useEffect, useMemo, useState } from 'react';
import { isLibreOfficeRequiredMessage, MarkdownRenderer, useAppDialog, useDocumentParseNotice, useToast } from '../../../shared/ui';
import type { FileParserProvider, OutlineItem } from '../../../shared/types';
import type { BackgroundTaskState, TechnicalPlanOriginalPlanFile, TechnicalPlanState, TechnicalPlanTenderFile, TechnicalPlanWorkflowKind } from '../types';
import './documentAnalysis.css';

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
  originalPlanFile: TechnicalPlanOriginalPlanFile | null;
  originalPlanMarkdown: string;
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
  originalPlanFile,
  originalPlanMarkdown,
  onFileImported,
  onOriginalPlanImported,
  onSectionSelected,
}: DocumentAnalysisPageProps) {
  const [parserLabel, setParserLabel] = useState(parserLabels.local);
  const [busy, setBusy] = useState(false);
  const [activeDocument, setActiveDocument] = useState<'tender' | 'original'>('tender');
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
      await window.yibiao?.tasks.startBidSectionExtraction({ workflowKind, projectId, confirmClearDownstream: hasDownstreamResults });
      showToast('多标段识别已在后台启动', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启动多标段识别失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectBidSection = async (sectionId: string) => {
    if (sectionId === selectedBidSectionId) return;
    if (hasDownstreamResults && !await confirm({ title: '切换投标范围', description: '切换后将清空当前招标解析、目录、全局事实和正文结果，请确认。', danger: true })) return;
    try {
      setBusy(true);
      const saved = await window.yibiao?.technicalPlan.saveSelectedBidSection({ workflowKind, projectId, sectionId });
      if (saved) onSectionSelected(saved);
      showToast(sectionId ? '已选择本次投标标段' : '已恢复使用整份招标文件', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存投标范围失败', 'error');
    } finally {
      setBusy(false);
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
    }
  };

  const importOriginalPlan = async () => {
    try {
      setBusy(true);
      const result = await window.yibiao?.technicalPlan.importOriginalPlanDocument({ workflowKind, projectId });

      if (!result?.success || !result.markdown) {
        const message = result?.message || '未导入文件';
        if (isLibreOfficeRequiredMessage(message)) {
          showDocumentParseNotice(message);
          return;
        }
        showToast(message, message === '已取消选择' ? 'info' : 'error');
        return;
      }

      onOriginalPlanImported(result.state, result.markdown);
      setActiveDocument('original');
      showToast(result.message || '原方案已导入', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件解析失败';
      if (isLibreOfficeRequiredMessage(message)) {
        showDocumentParseNotice(message);
        return;
      }
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const importGeneratedOriginalPlan = async () => {
    try {
      setBusy(true);
      const result = await window.yibiao?.technicalPlan.importGeneratedOriginalPlan({ workflowKind, projectId, sourceProjectId: projectId });

      if (!result?.success || !result.markdown) {
        showToast(result?.message || '技术方案模块暂无可导入的内容', 'info');
        return;
      }

      const importedTenderMarkdown = result.tenderMarkdown || await window.yibiao?.technicalPlan.readTenderMarkdown({ workflowKind: 'existing-plan-expansion', projectId }) || '';
      const importedOriginalMarkdown = result.markdown || await window.yibiao?.technicalPlan.readOriginalPlanMarkdown({ workflowKind: 'existing-plan-expansion', projectId }) || '';
      onFileImported(result.state, importedTenderMarkdown);
      onOriginalPlanImported(result.state, importedOriginalMarkdown);
      setActiveDocument(importedTenderMarkdown ? 'tender' : 'original');
      showToast(result.message || '已导入技术方案生成内容', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入技术方案生成内容失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const activeFile = activeDocument === 'original' ? originalPlanFile : tenderFile;
  const activeMarkdown = activeDocument === 'original' ? originalPlanMarkdown : tenderMarkdown;
  const activeLabel = activeDocument === 'original' ? '原方案' : '招标文件';
  const renderUploadTile = (
    kind: 'tender' | 'original',
    title: string,
    description: string,
    file: TechnicalPlanTenderFile | TechnicalPlanOriginalPlanFile | null,
    onImport: () => void,
  ) => (
    <section className={`analysis-upload-tile${activeDocument === kind ? ' is-active' : ''}`}>
      <div>
        <span className="section-kicker">{kind === 'tender' ? '招标文件技术部分' : '已有技术方案'}</span>
        <strong>{file ? file.fileName : title}</strong>
        <p>{file ? `${file.parserLabel || parserLabel} · ${file.markdownChars} 字` : description}</p>
      </div>
      <div className="analysis-upload-actions">
        <button type="button" className="secondary-action" onClick={() => setActiveDocument(kind)} disabled={!file}>
          查看内容
        </button>
        <button type="button" className="primary-action" onClick={onImport} disabled={busy}>
          {busy ? '解析中...' : file ? (kind === 'tender' ? '替换招标文件' : '替换原方案') : (kind === 'tender' ? '上传招标文件' : '上传原方案')}
        </button>
      </div>
    </section>
  );

  return (
    <div className={`plan-step-body document-analysis-page${isExpansionWorkflow ? ' existing-plan-analysis-page' : ''}`}>
      <section className="analysis-import-card">
        <div>
          <span className="section-kicker">STEP 01</span>
          <strong>{isExpansionWorkflow ? '上传招标文件与原方案' : '上传招标文件'}</strong>
          <p>{isExpansionWorkflow ? '原方案会作为扩写核心草稿，招标文件用于约束目录、评分点和响应要求。' : `当前解析方案：${parserLabel}`}</p>
        </div>
        {isExpansionWorkflow ? (
          <div className="analysis-actions">
            {canImportGeneratedPlan && (
              <button type="button" className="secondary-action" onClick={importGeneratedOriginalPlan} disabled={busy}>
                {busy ? '导入中...' : '导入技术方案模块内容'}
              </button>
            )}
          </div>
        ) : (
          <div className="analysis-actions">
            <button type="button" className="primary-action" onClick={importDocument} disabled={busy}>
              {busy ? '解析中...' : tenderFile ? '重新选择文件' : '选择文件'}
            </button>
          </div>
        )}
      </section>

      {isExpansionWorkflow && (
        <div className="analysis-upload-grid">
          {renderUploadTile('tender', '上传招标文件技术部分', `当前解析方案：${parserLabel}`, tenderFile, importDocument)}
          {renderUploadTile('original', '上传已有技术方案', `当前解析方案：${parserLabel}`, originalPlanFile, importOriginalPlan)}
        </div>
      )}

      {isExpansionWorkflow && tenderFile && bidSections.length < 2 && !showExpansionBidSection && (
        <button type="button" className="analysis-section-trigger" onClick={() => setShowExpansionBidSection(true)}>
          <span className="analysis-section-trigger-copy">
            <strong>投标范围</strong>
            <span>招标文件包含多个标段？可先识别本次投标范围</span>
          </span>
          <span className="analysis-section-trigger-action">识别并选择<span aria-hidden="true">›</span></span>
        </button>
      )}

      {tenderFile && (!isExpansionWorkflow || bidSections.length > 1 || showExpansionBidSection) && (
        <section className="analysis-upload-tile bid-section-selection">
          <div className="bid-section-copy"><div className="bid-section-heading"><span className="section-kicker">投标范围</span><strong>选择本次投标标段</strong>{isExpansionWorkflow && bidSections.length < 2 && !sectionExtractionRunning && <button type="button" className="analysis-section-collapse" onClick={() => setShowExpansionBidSection(false)}>收起</button>}</div><p>{bidSectionSource === 'evidence' ? '核对识别证据与原文范围后再选择。未明确归属其他标段的通用条款会保留。' : '当前为标题粗识别，连续范围可能包含通用条款或漏掉跨章节要求；建议先按原文证据重新识别。'}</p></div>
          <button type="button" className="secondary-action" disabled={busy || sectionExtractionRunning} onClick={() => void extractBidSections()}>{sectionExtractionRunning ? `识别中 ${bidSectionExtractionTask?.progress || 0}%` : '按原文证据重新识别'}</button>
          {bidSections.length > 1 && <select aria-label="本次投标标段" value={selectedBidSectionId} disabled={busy || sectionExtractionRunning} onChange={(event) => void selectBidSection(event.target.value)}>
            <option value="">整份招标文件</option>
            {bidSections.map((section) => <option value={section.id} key={section.id}>{section.title}（{section.includeRanges?.length || 1} 处原文）</option>)}
          </select>}
          {bidSectionExtractionTask?.status === 'error' && <p className="bid-section-error">{bidSectionExtractionTask.error || '标段识别失败，可使用标题识别结果'}</p>}
          {bidSections.length > 1 && <div className="bid-section-evidence">
            {bidSections.map((section) => <details key={section.id} open={section.id === selectedBidSectionId}>
              <summary>{section.title} · {section.includeRanges?.length || 1} 处原文</summary>
              <div>{(section.includeRanges || [{ startLine: section.startLine, endLine: section.endLine }]).map((range, index) => <div key={`${range.startLine}-${range.endLine}-${index}`}><p>第 {range.startLine}–{range.endLine} 行{range.reason ? `：${range.reason}` : ''}</p><blockquote>{tenderLines.slice(range.startLine - 1, Math.min(range.endLine, range.startLine + 2)).join('\n').slice(0, 300)}</blockquote></div>)}</div>
              {section.evidence?.length ? <small>识别证据：{section.evidence.join('；')}</small> : null}
            </details>)}
          </div>}
        </section>
      )}

      <section className="analysis-markdown-card">
        <div className="analysis-result-head">
          <strong>{activeLabel}内容</strong>
          <span>{activeFile ? `${activeFile.fileName} · ${activeFile.markdownChars} 字` : '等待上传'}</span>
        </div>

        {activeMarkdown ? (
          <div className="markdown-viewer">
            <MarkdownRenderer>
              {activeMarkdown}
            </MarkdownRenderer>
          </div>
        ) : (
          <div className="markdown-empty-state">
            <strong>尚未导入{activeLabel}</strong>
            <p>{activeDocument === 'original' ? '请上传已经写好的技术方案，后续正文生成会在此基础上保留、优化和扩充。' : '当前步骤只负责把招标文件解析成 Markdown。下一步再基于这里的 Markdown 内容进行 AI 标书理解。'}</p>
          </div>
        )}
      </section>

    </div>
  );
}

export default DocumentAnalysisPage;
