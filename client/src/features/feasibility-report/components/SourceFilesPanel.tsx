import { useEffect, useState } from 'react';
import { isLibreOfficeRequiredMessage, MarkdownRenderer, useAppDialog, useDocumentParseNotice, useToast } from '../../../shared/ui';
import type { FeasibilityReportState } from '../types';

interface SourceFilesPanelProps {
  projectId: string;
  state: FeasibilityReportState;
  onStateChange: (state: FeasibilityReportState) => void;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '操作失败');
}

export default function SourceFilesPanel({ projectId, state, onStateChange }: SourceFilesPanelProps) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const { showDocumentParseNotice } = useDocumentParseNotice();
  const [selectedSourceId, setSelectedSourceId] = useState(state.sourceFiles[0]?.id || '');
  const [markdown, setMarkdown] = useState('');
  const [loadingMarkdown, setLoadingMarkdown] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState('');

  useEffect(() => {
    if (selectedSourceId && state.sourceFiles.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(state.sourceFiles[0]?.id || '');
  }, [selectedSourceId, state.sourceFiles]);

  useEffect(() => {
    let disposed = false;
    if (!selectedSourceId) {
      setMarkdown('');
      return () => { disposed = true; };
    }
    const bridge = window.yibiao?.feasibilityReport;
    if (!bridge) {
      setMarkdown('');
      return () => { disposed = true; };
    }
    setLoadingMarkdown(true);
    void bridge.readSourceMarkdown({ projectId, sourceId: selectedSourceId })
      .then((content) => { if (!disposed) setMarkdown(content); })
      .catch((error) => { if (!disposed) showToast(`读取资料失败：${getErrorMessage(error)}`, 'error'); })
      .finally(() => { if (!disposed) setLoadingMarkdown(false); });
    return () => { disposed = true; };
  }, [projectId, selectedSourceId, showToast]);

  const importSources = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const result = await bridge.importSources({ projectId });
      if (!result.success) {
        if (isLibreOfficeRequiredMessage(result.message)) {
          showDocumentParseNotice(result.message || '文档解析需要 LibreOffice');
          return;
        }
        showToast(result.message || '未导入项目资料', result.message === '已取消选择' ? 'info' : 'error');
        return;
      }
      onStateChange(result.state);
      setSelectedSourceId(result.importedSourceIds?.[0] || result.state.sourceFiles[0]?.id || '');
      showToast(result.message || '项目资料已导入', 'success');
    } catch (error) {
      const message = getErrorMessage(error);
      if (isLibreOfficeRequiredMessage(message)) {
        showDocumentParseNotice(message);
      } else {
        showToast(`导入项目资料失败：${message}`, 'error');
      }
    } finally {
      setImporting(false);
    }
  };

  const removeSource = async (sourceId: string, fileName: string) => {
    const accepted = await confirm({
      title: '确认移除项目资料',
      description: `移除“${fileName}”后，相关解析内容和图片将被删除，已有资料分析、报告目录、关键参数和正文也会被清空。`,
      confirmLabel: '确认移除',
      danger: true,
    });
    if (!accepted) return;
    setRemovingId(sourceId);
    try {
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const nextState = await bridge.removeSource({ projectId, sourceId });
      if (selectedSourceId === sourceId) setSelectedSourceId(nextState.sourceFiles[0]?.id || '');
      onStateChange(nextState);
      showToast('项目资料已移除', 'success');
    } catch (error) {
      showToast(`移除项目资料失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setRemovingId('');
    }
  };

  const selectedSource = state.sourceFiles.find((source) => source.id === selectedSourceId);

  return (
    <div className="feasibility-sources-panel">
      <section className="feasibility-panel-head">
        <div>
          <h3>项目支撑资料</h3>
          <p>支持批量导入 Word、PDF、WPS、Markdown 和当前解析方式允许的其他格式。</p>
        </div>
        <button type="button" className="primary-action" disabled={importing || Boolean(removingId)} onClick={() => void importSources()}>{importing ? '正在解析...' : '导入项目资料'}</button>
      </section>

      {!state.sourceFiles.length ? (
        <section className="feasibility-source-empty">
          <strong>尚未导入项目资料</strong>
          <p>建议导入项目建议书、立项批复、规划材料、投资测算和其他支撑文件。</p>
          <button type="button" className="secondary-action" disabled={importing} onClick={() => void importSources()}>选择资料文件</button>
        </section>
      ) : (
        <div className="feasibility-source-workspace">
          <aside className="feasibility-source-list" aria-label="项目资料列表">
            {state.sourceFiles.map((source) => (
              <article className={source.id === selectedSourceId ? 'is-active' : ''} key={source.id}>
                <button type="button" className="feasibility-source-select" onClick={() => setSelectedSourceId(source.id)}>
                  <strong>{source.fileName}</strong>
                  <span>{source.parserLabel || '文档解析'}，{source.markdownChars.toLocaleString('zh-CN')} 字</span>
                </button>
                <button type="button" className="feasibility-source-remove" disabled={Boolean(removingId)} onClick={() => void removeSource(source.id, source.fileName)}>{removingId === source.id ? '移除中' : '移除'}</button>
              </article>
            ))}
          </aside>
          <section className="feasibility-source-reader">
            <header>
              <div><strong>{selectedSource?.fileName || '资料预览'}</strong><span>解析后的 Markdown 只读预览</span></div>
              <span>{selectedSource ? `${selectedSource.markdownChars.toLocaleString('zh-CN')} 字` : ''}</span>
            </header>
            <div className="feasibility-source-reader-body">
              {loadingMarkdown ? <p className="feasibility-reader-status">正在读取资料内容...</p> : markdown ? <MarkdownRenderer allowRawHtml={false}>{markdown}</MarkdownRenderer> : <p className="feasibility-reader-status">当前资料没有可预览内容。</p>}
            </div>
          </section>
        </div>
      )}

      <p className="feasibility-source-note">新增或移除资料会清空资料分析及后续产物，项目基础信息和其他已导入资料不会受影响。</p>
    </div>
  );
}
