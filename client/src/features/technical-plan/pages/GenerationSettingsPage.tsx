import { useEffect, useState } from 'react';
import { useToast } from '../../../shared/ui';
import type { ContentGenerationOptions, ContentTableRequirement, MissingFactPolicy } from '../types';
import './generationSettings.css';

interface GenerationSettingsPageProps {
  options?: ContentGenerationOptions;
  selectedBidSectionTitle?: string;
  stale: boolean;
  onSave: (options: ContentGenerationOptions) => Promise<void>;
}

const defaults: ContentGenerationOptions = {
  useAiImages: false, aiImageStyle: 'auto', maxAiImages: 6,
  useMermaidImages: true, useTechnicalDiagrams: false,
  tableRequirement: 'heavy', minimumWords: 0, maximumWords: 0, sectionWords: 0, contentConcurrency: 5,
  enableConsistencyAudit: true, enableOriginalPlanCoverageAudit: false,
  missingFactPolicy: 'infer',
};

export default function GenerationSettingsPage({ options, selectedBidSectionTitle, stale, onSave }: GenerationSettingsPageProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<ContentGenerationOptions>({ ...defaults, ...options });
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft({ ...defaults, ...options }), [options]);

  const save = async () => {
    if (draft.maximumWords && draft.minimumWords > draft.maximumWords) {
      showToast('全文参考上限不能低于最低字数', 'info');
      return;
    }
    setBusy(true);
    try { await onSave(draft); }
    catch (error) { showToast(error instanceof Error ? error.message : '保存生成设置失败', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="plan-step-body generation-settings-page">
    <section className="generation-settings-header">
      <span className="section-kicker">STEP 02 · 生成设置</span>
      <h2>先确定本次生成目标</h2>
      <p>这些设置会保存到当前项目。篇幅目标会用于目录规划；之后修改篇幅目标需要重新生成目录。</p>
      <strong>投标范围：{selectedBidSectionTitle || '整份招标文件'}</strong>
      <button type="button" className="primary-action generation-settings-save" disabled={busy} onClick={() => void save()}>{busy ? '保存中...' : '保存生成设置'}</button>
    </section>
    {stale && <p className="generation-settings-warning">当前目录使用较早的篇幅设置；请重新生成目录后再进入正文。</p>}
    <section className="generation-settings-fields" aria-label="正文生成设置">
      <label><span><strong>全文最低字数</strong><small>0 表示不控制；已有正文生成流程会在未达标时扩写补足。</small></span><input type="number" min="0" step="1000" value={draft.minimumWords} onChange={(event) => setDraft((value) => ({ ...value, minimumWords: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></label>
      <label><span><strong>全文参考上限</strong><small>0 表示不设上限；生成时控制篇幅，超出时提示人工复核，不自动删减正文。</small></span><input type="number" min="0" step="1000" value={draft.maximumWords || 0} onChange={(event) => setDraft((value) => ({ ...value, maximumWords: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></label>
      <label><span><strong>每节参考字数</strong><small>0 表示按内容自然分配；可帮助目录规划和正文控制篇幅。</small></span><input type="number" min="0" step="100" value={draft.sectionWords || 0} onChange={(event) => setDraft((value) => ({ ...value, sectionWords: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></label>
      <label><span><strong>表格需求</strong><small>决定正文编排阶段的表格数量倾向。</small></span><select value={draft.tableRequirement} onChange={(event) => setDraft((value) => ({ ...value, tableRequirement: event.target.value as ContentTableRequirement }))}><option value="none">不要</option><option value="light">少量</option><option value="moderate">适中</option><option value="heavy">大量</option></select></label>
      <label><span><strong>资料缺失时的事实处理</strong><small>待填写模式会在正文开始前提醒补齐事实。</small></span><select value={draft.missingFactPolicy || 'infer'} onChange={(event) => setDraft((value) => ({ ...value, missingFactPolicy: event.target.value as MissingFactPolicy }))}><option value="infer">合理推断</option><option value="placeholder">标记待填写</option><option value="generic">笼统承诺</option></select></label>
      <label><span><strong>AI 配图上限</strong><small>设为 0 时不生成 AI 图片；使用前请在设置中配置生图模型。</small></span><input type="number" min="0" step="1" value={draft.useAiImages ? draft.maxAiImages : 0} onChange={(event) => setDraft((value) => ({ ...value, useAiImages: Number(event.target.value) > 0, maxAiImages: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></label>
      <label><span><strong>生成 Mermaid 图</strong><small>简单流程和关系图可在本地预览并导出。</small></span><input type="checkbox" checked={draft.useMermaidImages} onChange={(event) => setDraft((value) => ({ ...value, useMermaidImages: event.target.checked }))} /></label>
      <label><span><strong>全文一致性审计</strong><small>正文完成后检查与全局事实冲突的内容。</small></span><input type="checkbox" checked={draft.enableConsistencyAudit} onChange={(event) => setDraft((value) => ({ ...value, enableConsistencyAudit: event.target.checked }))} /></label>
      <label><span><strong>正文并发数</strong><small>受所配置模型服务的速率限制影响。</small></span><input type="number" min="1" step="1" value={draft.contentConcurrency} onChange={(event) => setDraft((value) => ({ ...value, contentConcurrency: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} /></label>
    </section>
  </div>;
}
