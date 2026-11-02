import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BidExportTemplateRecord, BidWordExportMode } from '../../../shared/types/exportFormat';
import { useToast } from '../../../shared/ui';
import './bidWordExportDialog.css';

interface BidWordExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowOriginal?: boolean;
  originalAvailable?: boolean;
  preferredMode?: BidWordExportMode;
  preferredTemplateId?: string;
  disabled?: boolean;
  onConfirm: (mode: Exclude<BidWordExportMode, 'original-template'>, template?: BidExportTemplateRecord) => Promise<void>;
  onOriginal?: () => Promise<void>;
  extraOptions?: ReactNode;
  title?: string;
  description?: string;
  kicker?: string;
}

function BidWordExportDialog({ open, onOpenChange, allowOriginal = false, originalAvailable = false, preferredMode, preferredTemplateId, disabled = false, onConfirm, onOriginal, extraOptions, title = '选择导出排版', description = '本次选择只影响当前导出的招投标文档，不影响其他业务模块。', kicker = '招投标 Word 导出' }: BidWordExportDialogProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<BidWordExportMode>('word-optimization');
  const [wordOptimizationEnabled, setWordOptimizationEnabled] = useState(false);
  const [templates, setTemplates] = useState<BidExportTemplateRecord[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [preferredTemplateMissing, setPreferredTemplateMissing] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selectedTemplate = templates.find((item) => item.templateId === templateId);
  const unavailable = disabled || loading || !loaded || Boolean(loadError) || submitting;

  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLocaleLowerCase('zh-CN');
    if (!query) return templates;
    return templates.filter((template) => template.templateName.toLocaleLowerCase('zh-CN').includes(query));
  }, [templateQuery, templates]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    setLoadError('');
    Promise.all([window.yibiao?.config.load(), window.yibiao?.bidTemplates.list()])
      .then(([config, items]) => {
        if (cancelled) return;
        const enabled = Boolean(config?.skill_settings?.skills?.['word-optimization']?.enabled);
        const nextTemplates = items || [];
        setLoaded(true);
        setWordOptimizationEnabled(enabled);
        setTemplates(nextTemplates);
        setTemplateQuery('');
        const missingTemplate = preferredMode === 'custom-template' && Boolean(preferredTemplateId) && !nextTemplates.some((item) => item.templateId === preferredTemplateId);
        setPreferredTemplateMissing(missingTemplate);
        setTemplateId(missingTemplate ? '' : nextTemplates.some((item) => item.templateId === preferredTemplateId) ? preferredTemplateId || '' : nextTemplates[0]?.templateId || '');
        setMode(preferredMode === 'original-template' && allowOriginal && originalAvailable
          ? 'original-template'
          : preferredMode === 'custom-template' && nextTemplates.length
            ? 'custom-template'
            : preferredMode === 'word-optimization' && enabled
              ? 'word-optimization'
              : preferredMode === 'basic'
                ? 'basic'
                : enabled ? 'word-optimization' : nextTemplates.length ? 'custom-template' : 'basic');
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '读取导出配置失败';
        setLoadError(message);
        showToast(message, 'error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowOriginal, open, originalAvailable, preferredMode, preferredTemplateId, revision, showToast]);

  const confirm = async () => {
    if (unavailable || submittingRef.current) return;
    if (mode === 'word-optimization' && !wordOptimizationEnabled) {
      showToast('请先到 设置 > 技能管理 启用 word-optimization', 'info');
      return;
    }
    if (mode === 'custom-template' && !selectedTemplate) {
      showToast('请先选择导出模板', 'info');
      return;
    }
    if (mode === 'original-template' && (!originalAvailable || !onOriginal)) {
      showToast('当前没有可用的原方案 DOCX', 'info');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      onOpenChange(false);
      if (mode === 'original-template') await onOriginal?.();
      else await onConfirm(mode, mode === 'custom-template' ? selectedTemplate : undefined);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败，请重试', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !disabled && !submitting && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal bid-export-choice-overlay" />
        <Dialog.Content className="bid-export-choice-card" onEscapeKeyDown={disabled || submitting ? (event) => event.preventDefault() : undefined} onPointerDownOutside={disabled || submitting ? (event) => event.preventDefault() : undefined}>
          <div className="content-regenerate-card-head">
            <span className="section-kicker">{kicker}</span>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </div>
          <div className="bid-export-choice-body">
          {loading && <p className="bid-export-load-status" role="status">正在读取排版方式和模板…</p>}
          {loadError && <div className="bid-export-load-error" role="alert"><p>{loadError}</p><button type="button" className="secondary-action" onClick={() => setRevision((value) => value + 1)}>重新读取配置</button></div>}
          {loaded && <fieldset className="bid-export-choice-list" aria-label="导出方式" disabled={unavailable}>
            {allowOriginal ? <label className={`bid-export-choice${!originalAvailable ? ' is-disabled' : ''}`}><input type="radio" name="bid-export-mode" checked={mode === 'original-template'} disabled={!originalAvailable} onChange={() => setMode('original-template')} /><span><strong>原方案格式</strong><small>保留导入 DOCX 的样式、页眉页脚和已有图片。</small></span></label> : null}
            <label className={`bid-export-choice${!wordOptimizationEnabled ? ' is-disabled' : ''}`}><input type="radio" name="bid-export-mode" checked={mode === 'word-optimization'} disabled={!wordOptimizationEnabled} onChange={() => setMode('word-optimization')} /><span><strong>优化排版</strong><small>{wordOptimizationEnabled ? '使用技能管理中的内置优化排版。' : '技能未启用，请先到设置中启用。'}</small></span></label>
            <label className={`bid-export-choice${!templates.length ? ' is-disabled' : ''}`}><input type="radio" name="bid-export-mode" checked={mode === 'custom-template'} disabled={!templates.length} onChange={() => setMode('custom-template')} /><span><strong>模板管理中的模板</strong><small>{templates.length ? '使用“模板管理”中保存的招投标排版配置。' : '暂无模板，请先从左侧“模板管理”新建模板。'}</small></span></label>
            {mode === 'custom-template' && templates.length ? (
              <div className="bid-export-template-picker">
                {preferredTemplateMissing && <div className="bid-export-template-empty">原选模板已被删除，请重新选择。</div>}
                <div className="bid-export-template-search-row">
                  <label className="bid-export-template-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      value={templateQuery}
                      placeholder="检索模板名称"
                      aria-label="检索导出模板"
                      autoComplete="off"
                      onChange={(event) => setTemplateQuery(event.target.value)}
                    />
                  </label>
                  <small role="status">{filteredTemplates.length} / {templates.length}</small>
                </div>
                {selectedTemplate && <p className="bid-export-template-current">当前选择：<strong>{selectedTemplate.templateName}</strong></p>}
                {filteredTemplates.length ? (
                  <select aria-label="选择导出模板" className="bid-export-template-select" value={filteredTemplates.some((item) => item.templateId === templateId) ? templateId : ''} onChange={(event) => { setTemplateId(event.target.value); setPreferredTemplateMissing(false); }}>
                    {!filteredTemplates.some((item) => item.templateId === templateId) && <option value="" disabled>{selectedTemplate ? '选择其他模板（当前选择保留）' : '请选择模板'}</option>}
                    {filteredTemplates.map((template) => <option value={template.templateId} key={template.templateId}>{template.templateName}</option>)}
                  </select>
                ) : (
                  <div className="bid-export-template-empty">没有找到包含“{templateQuery.trim()}”的模板</div>
                )}
              </div>
            ) : null}
            <label className="bid-export-choice"><input type="radio" name="bid-export-mode" checked={mode === 'basic'} onChange={() => setMode('basic')} /><span><strong>基础格式</strong><small>不应用技能或自定义模板，保留兼容导出格式。</small></span></label>
          </fieldset>}
          {extraOptions}
          </div>
          <div className="content-regenerate-actions">
            <Dialog.Close className="secondary-action" type="button" disabled={disabled || submitting}>取消</Dialog.Close>
            <button type="button" className="primary-action" disabled={unavailable || (mode === 'custom-template' && !selectedTemplate)} onClick={() => void confirm()}>{loading || !loaded && !loadError ? '读取配置中…' : submitting ? '正在启动…' : '继续导出'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BidWordExportDialog;
