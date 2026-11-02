import { useEffect, useRef, useState } from 'react';
import { isLibreOfficeRequiredMessage, MarkdownRenderer, useAppDialog, useDocumentParseNotice, useToast } from '../../../shared/ui';
import type { FeasibilityReportState } from '../types';

interface SourceFilesPanelProps {
  projectId: string;
  state: FeasibilityReportState;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onStateChange: (state: FeasibilityReportState) => void;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '操作失败');
}

export default function SourceFilesPanel({ projectId, state, disabled = false, onBusyChange, onStateChange }: SourceFilesPanelProps) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const { showDocumentParseNotice } = useDocumentParseNotice();
  const [selectedSourceId, setSelectedSourceId] = useState(state.sourceFiles[0]?.id || '');
  const [preview, setPreview] = useState({ sourceId: '', markdown: '', error: '', loading: false });
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [operationError, setOperationError] = useState('');
  const busyRef = useRef(false);
  const retryFocusRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = importing || Boolean(removingId);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);

  useEffect(() => {
    if (selectedSourceId && state.sourceFiles.some(source => source.id === selectedSourceId)) return;
    setSelectedSourceId(state.sourceFiles[0]?.id || '');
  }, [selectedSourceId, state.sourceFiles]);

  useEffect(() => {
    if (!preview.loading && preview.sourceId === selectedSourceId && retryFocusRef.current) { retryFocusRef.current = false; rootRef.current?.querySelector<HTMLElement>('[data-source-preview-title]')?.focus(); }
  }, [preview, selectedSourceId]);
  const selectedSource = state.sourceFiles.find(source => source.id === selectedSourceId);
  const contentHash = selectedSource?.contentHash;
  useEffect(() => {
    let disposed = false;
    if (!selectedSourceId) { setPreview({ sourceId: '', markdown: '', error: '', loading: false }); return; }
    setPreview({ sourceId: selectedSourceId, markdown: '', error: '', loading: true });
    void (async () => {
      try {
        const bridge = window.yibiao?.feasibilityReport;
        if (!bridge) throw new Error('可研报告本地服务尚未就绪');
        const markdown = await bridge.readSourceMarkdown({ projectId, sourceId: selectedSourceId });
        if (!disposed) setPreview({ sourceId: selectedSourceId, markdown, error: '', loading: false });
      } catch (error) {
        if (!disposed) setPreview({ sourceId: selectedSourceId, markdown: '', error: getErrorMessage(error), loading: false });
      }
    })();
    return () => { disposed = true; };
  }, [projectId, selectedSourceId, contentHash, revision]);

  const importSources = async () => {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setImporting(true); setOperationError('');
    try {
      if ((state.analysisMarkdown || state.outlineData || state.keyParametersMarkdown) && !await confirm({
        title: '导入新的项目资料', description: '成功导入新资料后，已有资料分析、报告目录、关键参数和正文将被清空。', confirmLabel: '选择资料文件',
      })) return;
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const result = await bridge.importSources({ projectId });
      if (!result.success) {
        if (result.message === '已取消选择') return;
        throw new Error(`${result.message || '未导入项目资料'}\n本批次未导入新资料，原有资料和已有成果保留。`);
      }
      onStateChange(result.state); setQuery('');
      setSelectedSourceId(result.importedSourceIds?.[0] || result.state.sourceFiles[0]?.id || '');
      setRevision(value => value + 1);
      showToast(result.message || '项目资料已导入', 'success');
    } catch (error) {
      const message = getErrorMessage(error); setOperationError(`导入项目资料失败：${message}`);
      if (isLibreOfficeRequiredMessage(message)) showDocumentParseNotice(message);
      else showToast(`导入项目资料失败：${message}`, 'error');
    } finally { busyRef.current = false; setImporting(false); }
  };

  const removeSource = async (sourceId: string, fileName: string) => {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setRemovingId(sourceId); setOperationError('');
    try {
      if (!await confirm({ title: '确认移除项目资料', description: `移除“${fileName}”后，相关解析内容和图片将被删除，已有资料分析、报告目录、关键参数和正文也会被清空。`, confirmLabel: '确认移除', danger: true })) return;
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const nextState = await bridge.removeSource({ projectId, sourceId });
      const nextId = selectedSourceId === sourceId ? nextState.sourceFiles[0]?.id || '' : selectedSourceId;
      setSelectedSourceId(nextId); onStateChange(nextState); setQuery('');
      showToast('项目资料已移除', 'success');
      requestAnimationFrame(() => {
        const chooser = rootRef.current?.querySelector<HTMLSelectElement>('.feasibility-source-chooser select');
        if (nextId && chooser?.getClientRects().length) chooser.focus();
        else rootRef.current?.querySelector<HTMLButtonElement>(nextId ? `[data-source-id="${CSS.escape(nextId)}"]` : '[data-source-import]')?.focus();
      });
    } catch (error) {
      const message = `移除项目资料失败：${getErrorMessage(error)}`; setOperationError(message); showToast(message, 'error');
    } finally { busyRef.current = false; setRemovingId(''); }
  };
  const visibleSources = state.sourceFiles.filter(source => source.fileName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const currentPreview = preview.sourceId === selectedSourceId;
  return <div className="feasibility-sources-panel" ref={rootRef}>
    <section className="feasibility-panel-head">
      <div><h3>项目支撑资料</h3><p>导入 Word、PDF、WPS、Markdown 等资料，核对解析内容。</p></div>
      <button data-source-import type="button" className="primary-action" disabled={busy || disabled} onClick={() => void importSources()}>{importing ? '正在选择或解析…' : '导入项目资料'}</button>
    </section>
    {operationError && <div className="feasibility-operation-error" role="alert">{operationError}</div>}
    {importing && <p className="feasibility-source-note" role="status">正在选择或解析资料，请稍候。解析完成后，文件会显示在下方列表。</p>}
    {disabled && <p className="feasibility-source-note">当前工作区正在处理任务，完成后可导入或移除资料。</p>}
    {!state.sourceFiles.length ? <section className="feasibility-source-empty"><strong>尚未导入项目资料</strong><p>可导入立项批复、规划材料、投资测算等支撑文件；也可直接进入分析，使用已保存的项目基本信息。</p></section> : <div className="feasibility-source-workspace">
      <label className="feasibility-source-chooser"><span>选择资料 · {state.sourceFiles.length} 份</span><select aria-label="选择预览资料" value={selectedSourceId} disabled={busy} onChange={event => setSelectedSourceId(event.target.value)}>{state.sourceFiles.map(source => <option key={source.id} value={source.id}>{source.fileName}</option>)}</select></label>
      <aside className="feasibility-source-sidebar" aria-label="项目资料列表">
        <div className="feasibility-source-filter"><label htmlFor="feasibility-source-query">资料文件 · {state.sourceFiles.length}</label><input id="feasibility-source-query" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索文件名称" /></div>
        <div className="feasibility-source-list">
          {visibleSources.map(source => <article className={source.id === selectedSourceId ? 'is-active' : ''} key={source.id}>
            <button type="button" data-source-id={source.id} disabled={busy} aria-current={source.id === selectedSourceId ? 'true' : undefined} className="feasibility-source-select" onClick={() => setSelectedSourceId(source.id)}><strong title={source.fileName}>{source.fileName}</strong><span>{source.parserLabel || '文档解析'} · {source.markdownChars.toLocaleString('zh-CN')} 字</span></button>

          </article>)}
          {!visibleSources.length && <div className="feasibility-reader-feedback"><p>没有匹配的资料文件</p><button type="button" className="secondary-action" onClick={() => setQuery('')}>清空搜索</button></div>}
        </div>
      </aside>
      <section className="feasibility-source-reader" aria-label="资料预览" aria-busy={!currentPreview || preview.loading}>
        <header><div><strong data-source-preview-title tabIndex={-1} title={selectedSource?.fileName}>{selectedSource?.fileName || '资料预览'}</strong><span>解析内容 · 只读</span></div>{selectedSource && <button type="button" className="feasibility-source-remove" aria-label={`移除 ${selectedSource.fileName}`} disabled={busy || disabled} onClick={() => void removeSource(selectedSource.id, selectedSource.fileName)}>{removingId === selectedSource.id ? '处理中' : '移除资料'}</button>}</header>
        <div className="feasibility-source-reader-body">
          {!currentPreview || preview.loading ? <p className="feasibility-reader-status" role="status">正在读取资料内容…</p> : preview.error ? <div className="feasibility-reader-feedback" role="alert"><strong>资料内容读取失败</strong><p>{preview.error}</p><button type="button" className="secondary-action" onClick={() => { retryFocusRef.current = true; setRevision(value => value + 1); }}>重新读取资料</button></div> : preview.markdown ? <MarkdownRenderer allowRawHtml={false}>{preview.markdown}</MarkdownRenderer> : <p className="feasibility-reader-status">当前资料没有可预览内容，请核对原文件或重新导入。</p>}
        </div>
      </section>
    </div>}
    <p className="feasibility-source-note">新增或移除资料会清空资料分析及后续产物，基础信息和其他资料保留。</p>
  </div>;
}
