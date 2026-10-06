import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BidExportTemplateRecord, BidWordExportMode } from '../../../shared/types/exportFormat';
import { useToast } from '../../../shared/ui';

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

  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLocaleLowerCase('zh-CN');
    if (!query) return templates;
    return templates.filter((template) => template.templateName.toLocaleLowerCase('zh-CN').includes(query));
  }, [templateQuery, templates]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([window.yibiao?.config.load(), window.yibiao?.bidTemplates.list()])
      .then(([config, items]) => {
        if (cancelled) return;
        const enabled = Boolean(config?.skill_settings?.skills?.['word-optimization']?.enabled);
        const nextTemplates = items || [];
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
      .catch((error) => showToast(error instanceof Error ? error.message : '读取导出配置失败', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowOriginal, open, originalAvailable, preferredMode, preferredTemplateId, showToast]);

  const updateTemplateQuery = (value: string) => {
    setTemplateQuery(value);
    const query = value.trim().toLocaleLowerCase('zh-CN');
    const matches = query
      ? templates.filter((template) => template.templateName.toLocaleLowerCase('zh-CN').includes(query))
      : templates;
    if (matches.length && templateId && !matches.some((template) => template.templateId === templateId)) {
      setTemplateId(matches[0].templateId);
      setPreferredTemplateMissing(false);
    }
  };

  const confirm = async () => {
    if (mode === 'word-optimization' && !wordOptimizationEnabled) {
      showToast('请先到 设置 > 技能管理 启用 word-optimization', 'info');
      return;
    }
    if (mode === 'custom-template') {
      if (!filteredTemplates.length) {
        showToast('没有找到匹配的模板，请修改检索关键词', 'info');
        return;
      }
      const template = templates.find((item) => item.templateId === templateId);
      if (!template) {
        showToast('请先从左侧“模板管理”新建并保存模板', 'info');
        return;
      }
      onOpenChange(false);
      await onConfirm(mode, template);
      return;
    }
    if (mode === 'original-template') {
      if (!originalAvailable || !onOriginal) {
        showToast('当前没有可用的原方案 DOCX', 'info');
        return;
      }
      onOpenChange(false);
      await onOriginal();
      return;
    }
    onOpenChange(false);
    await onConfirm(mode);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !disabled && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal bid-export-choice-overlay" />
        <Dialog.Content className="bid-export-choice-card">
          <div className="content-regenerate-card-head">
            <span className="section-kicker">{kicker}</span>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </div>
          <div className="bid-export-choice-list">
            {allowOriginal ? <label className={`bid-export-choice${!originalAvailable ? ' is-disabled' : ''}`}><input type="radio" name="bid-export-mode" checked={mode === 'original-template'} disabled={!originalAvailable} onChange={() => setMode('original-template')} /><span><strong>原方案格式</strong><small>保留导入 DOCX 的样式、页眉页脚和已有图片。</small></span></label> : null}
            <label className={`bid-export-choice${!wordOptimizationEnabled ? ' is-disabled' : ''}`}><input type="radio" name="bid-export-mode" checked={mode === 'word-optimization'} disabled={!wordOptimizationEnabled} onChange={() => setMode('word-optimization')} /><span><strong>word-optimization</strong><small>{wordOptimizationEnabled ? '使用技能管理中的内置优化排版。' : '技能未启用，请先到设置中启用。'}</small></span></label>
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
                      onChange={(event) => updateTemplateQuery(event.target.value)}
                    />
                  </label>
                  <small>{filteredTemplates.length}/{templates.length}</small>
                </div>
                {filteredTemplates.length ? (
                  <select className="bid-export-template-select" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setPreferredTemplateMissing(false); }}>
                    {!templateId && <option value="" disabled>请选择模板</option>}
                    {filteredTemplates.map((template) => <option value={template.templateId} key={template.templateId}>{template.templateName}</option>)}
                  </select>
                ) : (
                  <div className="bid-export-template-empty">没有找到包含“{templateQuery.trim()}”的模板</div>
                )}
              </div>
            ) : null}
            <label className="bid-export-choice"><input type="radio" name="bid-export-mode" checked={mode === 'basic'} onChange={() => setMode('basic')} /><span><strong>基础格式</strong><small>不应用技能或自定义模板，保留兼容导出格式。</small></span></label>
          </div>
          {extraOptions}
          <div className="content-regenerate-actions">
            <Dialog.Close className="secondary-action" type="button" disabled={disabled}>取消</Dialog.Close>
            <button type="button" className="primary-action" disabled={disabled || loading || (mode === 'custom-template' && !filteredTemplates.length)} onClick={() => void confirm()}>{loading ? '读取配置中…' : '继续导出'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BidWordExportDialog;
