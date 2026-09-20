import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useToast } from '../../../shared/ui';
import type { ExportTemplateRecord } from '../../../shared/types/exportFormat';
import { DEFAULT_EXPORT_FORMAT } from '../../../shared/types/exportFormat';
import { buildExportFormatCssVars } from '../../../shared/utils/exportFormatCss';
import { TemplatePreview, withExportFormatDefaults } from './ExportFormatPage';

interface MyTemplatesPageProps {
  onCreateTemplate: () => void;
  onEditTemplate: (templateId: string) => void;
}

const templateDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function MyTemplatesPage({ onCreateTemplate, onEditTemplate }: MyTemplatesPageProps) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<ExportTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ExportTemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingWord, setImportingWord] = useState(false);
  const [exportingId, setExportingId] = useState('');

  const selectedTemplate = templates.find((template) => template.template_id === selectedId) || templates[0] || null;
  const previewConfig = useMemo(
    () => withExportFormatDefaults(selectedTemplate?.config || DEFAULT_EXPORT_FORMAT),
    [selectedTemplate],
  );
  const previewStyle = useMemo<CSSProperties>(() => buildExportFormatCssVars(previewConfig), [previewConfig]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const items = await window.yibiao?.bidTemplates.list();
      const nextTemplates = items || [];
      setTemplates(nextTemplates);
      setSelectedId((prev) => nextTemplates.some((template) => template.template_id === prev) ? prev : nextTemplates[0]?.template_id || '');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取模板列表失败', 'error');
      setTemplates([]);
      setSelectedId('');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await window.yibiao?.bidTemplates.delete(deleteTarget.template_id);
      const nextTemplates = templates.filter((template) => template.template_id !== deleteTarget.template_id);
      setTemplates(nextTemplates);
      setSelectedId((prev) => prev === deleteTarget.template_id ? nextTemplates[0]?.template_id || '' : prev);
      setDeleteTarget(null);
      showToast(result?.message || '模板已删除', result?.success === false ? 'info' : 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除模板失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleImportTemplate = async () => {
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
      setImporting(false);
    }
  };

  const handleImportWord = async () => {
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
      setImportingWord(false);
    }
  };

  const handleExportTemplate = async (template: ExportTemplateRecord) => {
    setExportingId(template.template_id);
    try {
      const result = await window.yibiao?.bidTemplates.export(template.template_id);
      if (!result || result.canceled) return;
      if (!result.success) throw new Error(result.message || '模板导出失败');
      showToast(result.message || `模板“${template.template_name}”已导出`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模板导出失败', 'error');
    } finally {
      setExportingId('');
    }
  };

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
            <button type="button" className="secondary-action" onClick={() => { void handleImportTemplate(); }} disabled={importing}>{importing ? '导入中' : '导入模板'}</button>
            <button type="button" className="secondary-action" onClick={() => { void handleImportWord(); }} disabled={importingWord} title="从 DOCX 提取部分排版设置和字段候选，导出时不会沿用原文件全部版式">{importingWord ? '提取中' : '从 Word 提取'}</button>
            <button type="button" className="primary-action" onClick={onCreateTemplate}>新建模板</button>
          </div>
        </div>

        <div className="template-library-list">
          {loading ? <div className="template-library-empty"><strong>正在读取模板</strong><span>请稍候...</span></div> : null}
          {!loading && templates.length === 0 ? (
            <div className="template-library-empty">
              <strong>还没有保存模板</strong>
              <span>新建模板，或导入其他设备导出的模板文件。</span>
              <button type="button" className="primary-action" onClick={onCreateTemplate}>新建第一个模板</button>
            </div>
          ) : null}
          {!loading && templates.map((template) => {
            const selected = selectedTemplate?.template_id === template.template_id;
            return (
              <article className={`template-library-card${selected ? ' is-active' : ''}`} key={template.template_id}>
                <button type="button" className="template-library-card-main" onClick={() => setSelectedId(template.template_id)}>
                  <span>{template.template_name}</span>
                  <small>更新于 {formatTemplateDate(template.updated_at)}</small>
                </button>
                <div className="template-library-card-actions">
                  <button type="button" onClick={() => onEditTemplate(template.template_id)}>编辑</button>
                  <button type="button" onClick={() => { void handleExportTemplate(template); }} disabled={Boolean(exportingId)}>{exportingId === template.template_id ? '导出中' : '导出'}</button>
                  <button type="button" className="is-danger" onClick={() => setDeleteTarget(template)}>删除</button>
                </div>
              </article>
            );
          })}
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
              <button type="button" className="secondary-action" onClick={() => onEditTemplate(selectedTemplate.template_id)}>编辑模板</button>
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

      <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="template-delete-dialog">
            <Dialog.Title>删除模板</Dialog.Title>
            <Dialog.Description>
              确定删除“{deleteTarget?.template_name || '未命名模板'}”吗？删除后无法在我的模板中继续编辑。
            </Dialog.Description>
            <div className="template-delete-actions">
              <Dialog.Close className="secondary-action" type="button" disabled={deleting}>取消</Dialog.Close>
              <button type="button" className="danger-action" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? '删除中' : '确认删除'}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
