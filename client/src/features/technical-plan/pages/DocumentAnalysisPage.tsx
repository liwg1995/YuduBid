import { useEffect, useState } from 'react';
import { isLibreOfficeRequiredMessage, MarkdownRenderer, useDocumentParseNotice, useToast } from '../../../shared/ui';
import type { FileParserProvider } from '../../../shared/types';
import type { TechnicalPlanOriginalPlanFile, TechnicalPlanState, TechnicalPlanTenderFile, TechnicalPlanWorkflowKind } from '../types';

const parserLabels: Record<FileParserProvider, string> = {
  local: '本地解析',
  'mineru-accurate-api': 'MinerU 精准解析 API',
  'mineru-agent-api': 'MinerU-Agent 轻量解析 API',
};

interface DocumentAnalysisPageProps {
  workflowKind: TechnicalPlanWorkflowKind;
  tenderFile: TechnicalPlanTenderFile | null;
  tenderMarkdown: string;
  originalPlanFile: TechnicalPlanOriginalPlanFile | null;
  originalPlanMarkdown: string;
  onFileImported: (state: TechnicalPlanState, markdown: string) => void;
  onOriginalPlanImported: (state: TechnicalPlanState, markdown: string) => void;
}

function DocumentAnalysisPage({
  workflowKind,
  tenderFile,
  tenderMarkdown,
  originalPlanFile,
  originalPlanMarkdown,
  onFileImported,
  onOriginalPlanImported,
}: DocumentAnalysisPageProps) {
  const [parserLabel, setParserLabel] = useState(parserLabels.local);
  const [busy, setBusy] = useState(false);
  const [activeDocument, setActiveDocument] = useState<'tender' | 'original'>('tender');
  const { showToast } = useToast();
  const { showDocumentParseNotice } = useDocumentParseNotice();
  const isExpansionWorkflow = workflowKind === 'existing-plan-expansion';

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

  const importDocument = async () => {
    try {
      setBusy(true);
      const result = await window.yibiao?.technicalPlan.importTenderDocument(workflowKind);

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
      const result = await window.yibiao?.technicalPlan.importOriginalPlanDocument(workflowKind);

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
        {!isExpansionWorkflow && (
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

      {isExpansionWorkflow && (
        <div className="analysis-preview-tabs" role="tablist" aria-label="文件内容预览">
          <button type="button" className={activeDocument === 'tender' ? 'primary-action' : 'secondary-action'} onClick={() => setActiveDocument('tender')}>招标文件</button>
          <button type="button" className={activeDocument === 'original' ? 'primary-action' : 'secondary-action'} onClick={() => setActiveDocument('original')}>原方案</button>
        </div>
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
