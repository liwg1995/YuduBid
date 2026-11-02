import EnterpriseSearchInput from '../../../shared/ui/EnterpriseSearchInput';
import { Dropdown, Select, type InputRef } from 'antd';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useToast } from '../../../shared/ui';
import type { ExportTemplateRecord } from '../../../shared/types/exportFormat';
import { DEFAULT_EXPORT_FORMAT } from '../../../shared/types/exportFormat';
import { buildExportFormatCssVars } from '../../../shared/utils/exportFormatCss';
import { TemplatePreview, withExportFormatDefaults } from './ExportFormatPage';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import './modernTemplates.css';
import './templateLibraryDesign.css';

interface MyTemplatesPageProps {
  onCreateTemplate: () => void;
  onEditTemplate: (templateId: string) => void;
  refreshKey?: number;
}

const templateDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function MyTemplatesPage({ onCreateTemplate, onEditTemplate, refreshKey = 0 }: MyTemplatesPageProps) {
  const { showToast } = useToast();
  const operationRef = useRef(false);
  const searchRef = useRef<InputRef | null>(null);
  const selectionButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastRefreshKey = useRef(refreshKey);
  const restoreEditorFocus = useRef(false);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollPosition = useRef(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const moreButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [templates, setTemplates] = useState<ExportTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  useLayoutEffect(() => { if (!loading && listScrollRef.current) listScrollRef.current.scrollTop = listScrollPosition.current; }, [loading]);
  const [deleteTarget, setDeleteTarget] = useState<ExportTemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteReturnFocus = useRef<HTMLElement | null>(null);
  const deleteNextId = useRef('');
  const createTemplateRef = useRef<HTMLButtonElement>(null);
  const [importing, setImporting] = useState(false);
  const [importingWord, setImportingWord] = useState(false);
  const [exportingId, setExportingId] = useState('');
  const [duplicatingId, setDuplicatingId] = useState('');

  const operationBusy = importing || importingWord || deleting || Boolean(exportingId || duplicatingId);
  const unavailable = operationBusy || loading || Boolean(loadError);
  const matchesTemplate = (template: ExportTemplateRecord) => template.template_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visibleSystemTemplates = kind === 'user' ? [] : templates.filter((template) => template.is_system && matchesTemplate(template));
  const visibleUserTemplates = kind === 'system' ? [] : templates.filter((template) => !template.is_system && matchesTemplate(template));
  const selectedTemplate = templates.find((template) => template.template_id === selectedId) || templates[0] || null;
  const systemTemplates = templates.filter((template) => template.is_system);
  const userTemplates = templates.filter((template) => !template.is_system);
  const previewConfig = useMemo(
    () => withExportFormatDefaults(selectedTemplate?.config || DEFAULT_EXPORT_FORMAT),
    [selectedTemplate],
  );
  const previewStyle = useMemo<CSSProperties>(() => buildExportFormatCssVars(previewConfig), [previewConfig]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const items = await window.yibiao?.bidTemplates.list();
      if (!items) throw new Error('模板服务暂不可用，请重试');
      const nextTemplates = items;
      setTemplates(nextTemplates);
      setSelectedId((prev) => nextTemplates.some((template) => template.template_id === prev) ? prev : nextTemplates[0]?.template_id || '');
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取模板列表失败';
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
      setLoadRevision((value) => value + 1);
    }
  }, [showToast]);

  useEffect(() => {
    if (lastRefreshKey.current !== refreshKey) { restoreEditorFocus.current = true; lastRefreshKey.current = refreshKey; }
    void loadTemplates();
  }, [loadTemplates, refreshKey]);

  useLayoutEffect(() => {
    if (!loading && restoreEditorFocus.current) {
      const target = selectionButtons.current[selectedId];
      if (target?.isConnected) target.focus({ preventScroll: true });
      else searchRef.current?.focus({ preventScroll: true });
      restoreEditorFocus.current = false;
    }
  }, [loading, selectedId, loadRevision]);

  const editTemplate = (templateId: string) => { setSelectedId(templateId); onEditTemplate(templateId); };

  const openDeleteDialog = (template: ExportTemplateRecord) => {
    deleteReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    deleteNextId.current = '';
    setDeleteError('');
    setDeleteTarget(template);
  };

  const restoreDeleteFocus = (event: Event) => {
    event.preventDefault();
    const source = deleteReturnFocus.current;
    if (source?.isConnected && !source.matches(':disabled')) {
      source.focus({ preventScroll: true });
      return;
    }
    const neighbour = selectionButtons.current[deleteNextId.current];
    if (neighbour?.isConnected) neighbour.focus();
    else if (searchRef.current) searchRef.current.focus({ preventScroll: true });
    else createTemplateRef.current?.focus({ preventScroll: true });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || operationRef.current || loading) return;
    operationRef.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await window.yibiao?.bidTemplates.delete(deleteTarget.template_id);
      if (!result?.success) throw new Error(result?.message || '删除模板失败');
      const visibleTemplates = getStoredUiAppearance() === 'modern' ? [...visibleSystemTemplates, ...visibleUserTemplates] : [...systemTemplates, ...userTemplates];
      const deletedIndex = visibleTemplates.findIndex(template => template.template_id === deleteTarget.template_id);
      deleteNextId.current = (visibleTemplates[deletedIndex + 1] || visibleTemplates[deletedIndex - 1])?.template_id || '';
      const nextTemplates = templates.filter((template) => template.template_id !== deleteTarget.template_id);
      setTemplates(nextTemplates);
      setSelectedId((prev) => prev === deleteTarget.template_id ? deleteNextId.current || nextTemplates[0]?.template_id || '' : prev);
      setDeleteTarget(null);
      showToast(result.message || '模板已删除', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除模板失败';
      setDeleteError(message);
      showToast(message, 'error');
    } finally {
      operationRef.current = false;
      setDeleting(false);
    }
  };

  const handleImportTemplate = async () => {
    if (operationRef.current || loading || loadError) return;
    operationRef.current = true;
    setImporting(true);
    try {
      const result = await window.yibiao?.bidTemplates.import();
      if (!result || result.canceled) return;
      if (!result.success || !result.template) throw new Error(result.message || '模板导入失败');
      await loadTemplates();
      setSelectedId(result.template.template_id);
      showToast(result.message || '模板导入成功', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模板导入失败', 'error');
    } finally {
      operationRef.current = false;
      setImporting(false);
    }
  };

  const handleImportWord = async () => {
    if (operationRef.current || loading || loadError) return;
    operationRef.current = true;
    setImportingWord(true);
    try {
      const result = await window.yibiao?.bidTemplates.importWord();
      if (!result || result.canceled) return;
      if (!result.success || !result.template) throw new Error(result.message || 'Word 模板提取失败');
      await loadTemplates();
      setSelectedId(result.template.template_id);
      showToast(result.message || 'Word 模板已提取', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Word 模板提取失败', 'error');
    } finally {
      operationRef.current = false;
      setImportingWord(false);
    }
  };

  const handleExportTemplate = async (template: ExportTemplateRecord) => {
    if (operationRef.current || loading || loadError) return;
    operationRef.current = true;
    setExportingId(template.template_id);
    try {
      const result = await window.yibiao?.bidTemplates.export(template.template_id);
      if (!result || result.canceled) return;
      if (!result.success) throw new Error(result.message || '模板导出失败');
      showToast(result.message || `模板“${template.template_name}”已导出`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模板导出失败', 'error');
    } finally {
      operationRef.current = false;
      setExportingId('');
    }
  };

  const handleDuplicate = async (template: ExportTemplateRecord, openEditor = false) => {
    if (operationRef.current || loading || loadError) return;
    operationRef.current = true;
    setDuplicatingId(template.template_id);
    try {
      const copy = await window.yibiao?.bidTemplates.duplicate(template.template_id);
      if (!copy) throw new Error('复制模板失败');
      await loadTemplates();
      setSelectedId(copy.template_id);
      showToast(`已复制为“${copy.template_name}”`, 'success');
      if (openEditor) onEditTemplate(copy.template_id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制模板失败', 'error');
    } finally {
      operationRef.current = false;
      setDuplicatingId('');
    }
  };

  const renderTemplateCard = (template: ExportTemplateRecord) => {
    const selected = selectedTemplate?.template_id === template.template_id;
    return <article className={`template-library-card${selected ? ' is-active' : ''}`} key={template.template_id}>
      <button ref={element => { selectionButtons.current[template.template_id] = element; }} type="button" className="template-library-card-main" onClick={() => setSelectedId(template.template_id)}>
        <span>{template.template_name}{template.is_system ? <em className="template-library-system-badge">系统预设</em> : null}</span>
        <small>{template.is_system ? '内置模板' : `更新于 ${formatTemplateDate(template.updated_at)}`}</small>
      </button>
      <div className="template-library-card-actions">
        {template.is_system ? <>
          <button type="button" onClick={() => setSelectedId(template.template_id)}>查看</button>
          <button type="button" onClick={() => { void handleDuplicate(template); }} disabled={Boolean(duplicatingId)}>{duplicatingId === template.template_id ? '复制中' : '复制'}</button>
        </> : <>
          <button type="button" onClick={() => editTemplate(template.template_id)}>编辑</button>
          <button type="button" onClick={() => { void handleExportTemplate(template); }} disabled={Boolean(exportingId)}>{exportingId === template.template_id ? '导出中' : '导出'}</button>
          <button type="button" className="is-danger" onClick={() => openDeleteDialog(template)}>删除</button>
        </>}
      </div>
    </article>;
  };

  // 菜单进入弹窗前需取消原 Enter 默认动作并回焦来源，避免按键延续激活新弹窗。
  const deleteDialog = <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}><Dialog.Portal><Dialog.Overlay className="content-regenerate-modal" /><Dialog.Content className="template-delete-dialog" onCloseAutoFocus={restoreDeleteFocus} onEscapeKeyDown={event => { if (deleting) event.preventDefault(); }} onPointerDownOutside={event => { if (deleting) event.preventDefault(); }}><Dialog.Title>删除模板</Dialog.Title><Dialog.Description>确定删除“{deleteTarget?.template_name || '未命名模板'}”吗？删除后无法在我的模板中继续编辑。</Dialog.Description>{deleteError && <p className="template-operation-error" role="alert">{deleteError}</p>}<div className="template-delete-actions"><Dialog.Close className="secondary-action" type="button" disabled={deleting}>取消</Dialog.Close><button type="button" className="danger-action" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? '删除中' : '确认删除'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;

  if (getStoredUiAppearance() === 'modern') return <EnterpriseUiProvider><div className="modern-template-library" onKeyDownCapture={(event) => { if (event.key === 'Escape' && menuId) { event.preventDefault(); event.stopPropagation(); const trigger = moreButtons.current[menuId]; setMenuId(null); trigger?.focus(); } }}>
    <header className="modern-template-head"><div><h1>标书模板</h1><p>挑选、调整和导出你的文档版式。</p></div><div><button type="button" onClick={() => void handleImportTemplate()} disabled={unavailable}>{importing ? '导入中…' : '导入模板'}</button><button type="button" onClick={() => void handleImportWord()} disabled={unavailable} title="从 DOCX 提取部分排版设置和字段候选">{importingWord ? '提取中…' : '从 Word 提取'}</button><button type="button" onClick={onCreateTemplate} disabled={unavailable}>＋ 新建模板</button></div></header>
    <div className="modern-template-layout"><aside className="modern-template-list"><div className="modern-template-list-head"><span>模板目录</span><strong>{templates.length} 份模板</strong></div><div className="template-library-filters"><EnterpriseSearchInput ref={searchRef} aria-label="搜索模板名称" placeholder="搜索模板名称" allowClear value={query} onChange={(event) => setQuery(event.target.value)} /><Select aria-label="筛选模板类型" value={kind} onChange={setKind} options={[{value:'all',label:'全部模板'},{value:'system',label:'系统预设'},{value:'user',label:'我的模板'}]} /><small aria-live="polite">找到 {visibleSystemTemplates.length + visibleUserTemplates.length} 份模板</small></div><div ref={listScrollRef} className="modern-template-list-scroll" onScroll={(event) => { if (!loading) listScrollPosition.current = event.currentTarget.scrollTop; }}>{loading ? <p role="status">正在读取模板…</p> : loadError ? <div className="modern-template-empty" role="alert"><strong>读取模板失败</strong><p>{loadError}</p><button type="button" onClick={() => void loadTemplates()}>重新读取</button></div> : templates.length === 0 ? <div className="modern-template-empty"><strong>还没有模板</strong><button type="button" onClick={onCreateTemplate} disabled={unavailable}>新建第一个模板</button></div> : visibleSystemTemplates.length + visibleUserTemplates.length === 0 ? <div className="modern-template-empty"><strong>没有符合条件的模板</strong><button type="button" onClick={() => { setQuery(''); setKind('all'); }}>清除筛选</button></div> : <>{visibleSystemTemplates.length > 0 && <h2>系统预设</h2>}{visibleSystemTemplates.map((template) => <article key={template.template_id} className={selectedTemplate?.template_id === template.template_id ? 'is-active' : ''}><button ref={(element) => { selectionButtons.current[template.template_id] = element; }} type="button" onClick={() => setSelectedId(template.template_id)} aria-current={selectedTemplate?.template_id === template.template_id ? 'true' : undefined}><strong>{template.template_name}</strong><small>内置模板</small></button><button type="button" onClick={() => void handleDuplicate(template)} disabled={unavailable}>{duplicatingId === template.template_id ? '复制中…' : '复制'}</button></article>)}{kind !== 'system' && <h2>我的模板</h2>}{visibleUserTemplates.length ? visibleUserTemplates.map((template) => <article key={template.template_id} className={selectedTemplate?.template_id === template.template_id ? 'is-active' : ''}><button ref={(element) => { selectionButtons.current[template.template_id] = element; }} type="button" onClick={() => setSelectedId(template.template_id)} aria-current={selectedTemplate?.template_id === template.template_id ? 'true' : undefined}><strong>{template.template_name}</strong><small>更新于 {formatTemplateDate(template.updated_at)}</small></button><Dropdown autoFocus open={menuId === template.template_id} onOpenChange={(open) => setMenuId(open ? template.template_id : null)} trigger={['click']} menu={{items:[{key:'edit',label:'编辑模板'},{key:'export',label:exportingId === template.template_id ? '导出中…' : '导出模板'},{type:'divider'},{key:'delete',label:'删除模板',danger:true}],onClick:({key,domEvent}) => {domEvent.preventDefault(); setMenuId(null); moreButtons.current[template.template_id]?.focus({ preventScroll: true }); if(key==='edit') editTemplate(template.template_id); else if(key==='export') void handleExportTemplate(template); else openDeleteDialog(template);}}}><button ref={(element) => { moreButtons.current[template.template_id] = element; }} type="button" disabled={unavailable} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenuId(template.template_id); } }} aria-label={`${template.template_name}的更多操作`}>更多</button></Dropdown></article>) : kind !== 'system' ? <p>{query ? '没有匹配的自定义模板。' : '复制系统预设后即可调整自己的样式。'}</p> : null}</>}</div></aside>
    <main className="modern-template-preview"><div className="modern-template-preview-head"><div><span>实时预览</span><strong>{selectedTemplate?.template_name || '选择模板'}</strong></div>{selectedTemplate && (selectedTemplate.is_system ? <button type="button" onClick={() => void handleDuplicate(selectedTemplate, true)} disabled={unavailable}>复制并编辑</button> : <button type="button" disabled={unavailable} onClick={() => editTemplate(selectedTemplate.template_id)}>编辑模板</button>)}</div><div className="modern-template-preview-body">{selectedTemplate && ![...visibleSystemTemplates, ...visibleUserTemplates].some((template) => template.template_id === selectedTemplate.template_id) && <p className="template-preview-retained">当前预览已保留，未包含在筛选结果中。</p>}{selectedTemplate ? <><TemplatePreview config={previewConfig} previewStyle={previewStyle} />{selectedTemplate.source_manifest && <div className="modern-template-source"><strong>Word 提取结果</strong><p>来源：{selectedTemplate.source_manifest.source_name} · 标题 {selectedTemplate.source_manifest.chapters.length} 个 · 待填位置 {selectedTemplate.source_manifest.fields.length} 个</p><p>仅提取部分排版设置和字段候选；导出不会完整保留原文件版式，待填位置不会自动填入。</p><details><summary>查看标题与待填位置</summary><div><strong>标题</strong>{selectedTemplate.source_manifest.chapters.map((chapter, index) => <p key={`${chapter.paragraph}-${index}`}>{chapter.title}</p>)}<strong>待填位置</strong>{selectedTemplate.source_manifest.fields.map((field, index) => <p key={`${field.name}-${index}`}>{field.name}（{field.fill_by === 'manual' ? '人工' : '可由 AI 填写'}）</p>)}</div></details></div>}</> : <div className="modern-template-empty">保存模板后可在这里查看效果。</div>}</div></main></div>
    {deleteDialog}
  </div></EnterpriseUiProvider>;

  return (
    <div className="template-library-page">
      <section className="template-library-panel" aria-label="我的模板">
        <div className="template-library-head">
          <div>
            <span className="section-kicker">模板设置</span>
            <h2>我的模板</h2>
            <p>查看、编辑、导入和导出已保存的标书模板。</p>
          </div>
          <div className="template-library-head-actions">
            <button type="button" className="template-library-head-action" onClick={() => { void handleImportTemplate(); }} disabled={importing}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>
              <span>{importing ? '导入中' : '导入模板'}</span>
            </button>
            <button type="button" className="template-library-head-action" onClick={() => { void handleImportWord(); }} disabled={importingWord} title="从 DOCX 提取部分排版设置和字段候选，导出时不会沿用原文件全部版式">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h4M8 13h8m-8 4h6" /></svg>
              <span>{importingWord ? '提取中' : '从 Word 提取'}</span>
            </button>
            <button ref={createTemplateRef} type="button" className="template-library-head-action is-primary" onClick={onCreateTemplate}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span>新建模板</span>
            </button>
          </div>
        </div>

        <div className="template-library-list">{loadError && <div className="template-library-empty" role="alert"><strong>读取模板失败</strong><span>{loadError}</span><button type="button" onClick={() => void loadTemplates()}>重新读取</button></div>}
          {loading ? <div className="template-library-empty"><strong>正在读取模板</strong><span>请稍候...</span></div> : null}
          {!loading && !loadError && templates.length === 0 ? (
            <div className="template-library-empty">
              <strong>还没有保存模板</strong>
              <span>新建模板，或导入其他设备导出的模板文件。</span>
              <button type="button" className="primary-action create-action" onClick={onCreateTemplate}>新建第一个模板</button>
            </div>
          ) : null}
          {!loading && !loadError && <>
            <h3 className="template-library-group-title">系统预设模板</h3>
            <p className="template-library-group-hint">不可编辑和删除，复制一份后即可自由调整。</p>
            {systemTemplates.map(renderTemplateCard)}
            <h3 className="template-library-group-title">我的模板</h3>
            {userTemplates.length ? userTemplates.map(renderTemplateCard) : <div className="template-library-empty"><strong>还没有自定义模板</strong><span>可以复制系统预设，再调整为自己的样式。</span></div>}
          </>}
        </div>
      </section>

      <section className="template-library-preview-shell" aria-label="模板预览">
        {selectedTemplate ? (
          <>
            <div className="template-library-preview-head">
              <div>
                <span className="section-kicker">实时预览</span>
                <h3>{selectedTemplate.template_name}</h3>
              </div>
              {selectedTemplate.is_system
                ? <button type="button" className="secondary-action" onClick={() => { void handleDuplicate(selectedTemplate, true); }} disabled={Boolean(duplicatingId)}>复制并编辑</button>
                : <button type="button" className="secondary-action" onClick={() => editTemplate(selectedTemplate.template_id)}>编辑模板</button>}
            </div>
            <TemplatePreview config={previewConfig} previewStyle={previewStyle} />
            {selectedTemplate.source_manifest ? (
              <div className="template-library-extraction">
                <strong>Word 提取结果</strong>
                <span>来源：{selectedTemplate.source_manifest.source_name}；标题 {selectedTemplate.source_manifest.chapters.length} 个，待填位置 {selectedTemplate.source_manifest.fields.length} 个。当前仅提取部分排版设置和字段候选，导出 Word 时不会沿用原文件的全部版式，待填位置也不会自动填入。导出模板包时会一并携带可用的 DOCX 来源文件。</span>
                <details>
                  <summary>查看标题与待填位置</summary>
                  <div className="template-library-extraction-details">
                    <div><b>标题</b>{selectedTemplate.source_manifest.chapters.length ? <ul>{selectedTemplate.source_manifest.chapters.map((chapter, index) => <li key={`${chapter.paragraph}-${index}`}>{chapter.title}</li>)}</ul> : <span>未识别到</span>}</div>
                    <div><b>待填位置</b>{selectedTemplate.source_manifest.fields.length ? <ul>{selectedTemplate.source_manifest.fields.map((field, index) => <li key={`${field.name}-${index}`}>{field.name}（{field.fill_by === 'manual' ? '人工' : '可由 AI 填写'}）</li>)}</ul> : <span>未识别到</span>}</div>
                  </div>
                </details>
              </div>
            ) : null}
          </>
        ) : (
          <div className="template-library-preview-empty">
            <strong>暂无模板可预览</strong>
            <span>保存模板后，这里会展示模板效果。</span>
          </div>
        )}
      </section>

      {deleteDialog}
    </div>
  );
}

function formatTemplateDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }
  return templateDateFormatter.format(date);
}

export default MyTemplatesPage;
