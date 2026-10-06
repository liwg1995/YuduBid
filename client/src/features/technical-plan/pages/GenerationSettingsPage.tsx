import { useEffect, useRef, useState } from 'react';
import { AppSwitch, useToast } from '../../../shared/ui';
import type { KnowledgeBaseIndex } from '../../knowledge-base/types';
import type { ImageModelStatus } from '../../../shared/types';
import type { BidExportTemplateRecord } from '../../../shared/types/exportFormat';
import type { ContentGenerationOptions, ContentTableRequirement, MissingFactPolicy, TechnicalPlanWorkflowKind } from '../types';
import './generationSettings.css';

type SettingsTab = 'content' | 'knowledge' | 'length' | 'illustration' | 'writing' | 'appearance';
type WordCountKey = 'minimumWords' | 'maximumWords' | 'sectionWords';

const wordCountInputsFromOptions = (options?: ContentGenerationOptions): Record<WordCountKey, string> => ({
  minimumWords: String((options?.minimumWords || 0) / 10000),
  maximumWords: String((options?.maximumWords || 0) / 10000),
  sectionWords: String((options?.sectionWords || 0) / 10000),
});

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'content', label: '写什么' },
  { id: 'knowledge', label: '知识库' },
  { id: 'length', label: '写多少' },
  { id: 'illustration', label: '插图吗' },
  { id: 'writing', label: '怎么写' },
  { id: 'appearance', label: '导出样式' },
];

interface GenerationSettingsPageProps {
  options?: ContentGenerationOptions;
  workflowKind: TechnicalPlanWorkflowKind;
  selectedBidSectionTitle?: string;
  referenceKnowledgeDocumentIds: string[];
  stale: boolean;
  generationRunning?: boolean;
  onOpenDocuments: () => void;
  onOpenExportTemplates?: () => void;
  onSave: (options: ContentGenerationOptions, referenceKnowledgeDocumentIds: string[]) => Promise<boolean>;
}

const defaults: ContentGenerationOptions = {
  useAiImages: false, aiImageStyle: 'auto', maxAiImages: 6,
  useMermaidImages: true, useTechnicalDiagrams: false,
  tableRequirement: 'heavy', minimumWords: 0, maximumWords: 0, sectionWords: 0, wordCountRepair: false, layoutCheck: false, contentConcurrency: 5,
  enableConsistencyAudit: true, enableOriginalPlanCoverageAudit: false,
  missingFactPolicy: 'infer',
};

export default function GenerationSettingsPage({ options, workflowKind, selectedBidSectionTitle, referenceKnowledgeDocumentIds, stale, generationRunning = false, onOpenDocuments, onOpenExportTemplates, onSave }: GenerationSettingsPageProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('content');
  const pageRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ContentGenerationOptions>({ ...defaults, ...options });
  const [wordCountInputs, setWordCountInputs] = useState(() => wordCountInputsFromOptions(options));
  const [draftKnowledgeIds, setDraftKnowledgeIds] = useState<string[]>(referenceKnowledgeDocumentIds);
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeBaseIndex | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [expandedKnowledgeFolders, setExpandedKnowledgeFolders] = useState<string[]>([]);
  const [imageModelStatus, setImageModelStatus] = useState<ImageModelStatus>('untested');
  const [technicalDiagramAvailable, setTechnicalDiagramAvailable] = useState(false);
  const [wordOptimizationEnabled, setWordOptimizationEnabled] = useState(false);
  const [exportTemplates, setExportTemplates] = useState<BidExportTemplateRecord[]>([]);
  const [exportSettingsLoading, setExportSettingsLoading] = useState(true);
  const [exportSettingsError, setExportSettingsError] = useState(false);
  const [exportSettingsRevision, setExportSettingsRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft({ ...defaults, ...options });
    setWordCountInputs(wordCountInputsFromOptions(options));
  }, [options]);
  useEffect(() => setDraftKnowledgeIds(referenceKnowledgeDocumentIds), [referenceKnowledgeDocumentIds]);
  useEffect(() => { pageRef.current?.scrollTo({ top: 0 }); }, [activeTab]);
  useEffect(() => {
    let active = true;
    setExportSettingsLoading(true);
    setExportSettingsError(false);
    Promise.all([window.yibiao?.config.load(), window.yibiao?.bidTemplates.list()]).then(([config, templates]) => {
      if (!active) return;
      setImageModelStatus(config?.image_model?.status || 'untested');
      setTechnicalDiagramAvailable(Boolean(config?.skill_settings?.skills?.['technical-diagram']?.enabled));
      setWordOptimizationEnabled(Boolean(config?.skill_settings?.skills?.['word-optimization']?.enabled));
      setExportTemplates(templates || []);
    }).catch((error) => {
      if (!active) return;
      setExportSettingsError(true);
      showToast(error instanceof Error ? error.message : '读取技能或导出模板失败', 'error');
    }).finally(() => { if (active) setExportSettingsLoading(false); });
    return () => { active = false; };
  }, [exportSettingsRevision]);
  useEffect(() => {
    if (activeTab !== 'knowledge') return;
    let active = true;
    setKnowledgeLoading(true);
    window.yibiao?.knowledgeBase.list().then((index) => {
      if (active) {
        setKnowledgeIndex(index);
        setExpandedKnowledgeFolders((current) => current.length ? current : index.folders.slice(0, 1).map((folder) => folder.id));
      }
    }).catch((error) => {
      if (active) showToast(error instanceof Error ? error.message : '读取知识库失败', 'error');
    }).finally(() => { if (active) setKnowledgeLoading(false); });
    return () => { active = false; };
  }, [activeTab]);

  const save = async () => {
    if (exportSettingsLoading) {
      showToast('正在读取导出模板，请稍后保存', 'info');
      return false;
    }
    if (exportSettingsError) {
      setActiveTab('appearance');
      showToast('导出设置读取失败，请重试后保存', 'info');
      return false;
    }
    if (draft.maximumWords && draft.minimumWords > draft.maximumWords) {
      setActiveTab('length');
      showToast('全文参考上限不能低于最低字数', 'info');
      return false;
    }
    const wordExportMode = draft.wordExportMode || (wordOptimizationEnabled ? 'word-optimization' : exportTemplates.length ? 'custom-template' : 'basic');
    const wordExportTemplateId = wordExportMode === 'custom-template' ? draft.wordExportTemplateId || exportTemplates[0]?.templateId : '';
    if (wordExportMode === 'word-optimization' && !wordOptimizationEnabled) {
      setActiveTab('appearance');
      showToast('请先在技能管理中启用 word-optimization，或选择其他导出方式', 'info');
      return false;
    }
    if (wordExportMode === 'custom-template' && !exportTemplates.some((template) => template.templateId === wordExportTemplateId)) {
      setActiveTab('appearance');
      showToast('请选择模板管理中仍然可用的 Word 模板', 'info');
      return false;
    }
    setBusy(true);
    try { return await onSave({ ...draft, wordExportMode, wordExportTemplateId }, draftKnowledgeIds); }
    catch (error) { showToast(error instanceof Error ? error.message : '保存生成设置失败', 'error'); return false; }
    finally { setBusy(false); }
  };

  const openRelatedStep = async (open: () => void) => {
    if (busy) return;
    if (await save()) open();
  };

  const availableDocuments = knowledgeIndex?.documents.filter((document) => document.status === 'success') || [];
  const keyword = knowledgeSearch.trim().toLocaleLowerCase();
  const toggleKnowledgeDocument = (id: string) => setDraftKnowledgeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectedWordExportMode = draft.wordExportMode || (wordOptimizationEnabled ? 'word-optimization' : exportTemplates.length ? 'custom-template' : 'basic');
  const selectedWordExportTemplateMissing = selectedWordExportMode === 'custom-template' && Boolean(draft.wordExportTemplateId) && !exportTemplates.some((template) => template.templateId === draft.wordExportTemplateId);
  const selectedWordExportTemplateId = selectedWordExportTemplateMissing ? '' : draft.wordExportTemplateId || exportTemplates[0]?.templateId || '';

  const selectedKnowledgeDocuments = availableDocuments.filter((document) => draftKnowledgeIds.includes(document.id));
  const visibleKnowledgeFolders = (knowledgeIndex?.folders || []).map((folder) => ({
    folder,
    documents: availableDocuments.filter((document) => document.folder_id === folder.id && (
      !keyword || folder.name.toLocaleLowerCase().includes(keyword) || document.file_name.toLocaleLowerCase().includes(keyword)
    )),
  })).filter((group) => group.documents.length);
  const estimatedWords = draft.minimumWords && draft.maximumWords
    ? (draft.minimumWords + draft.maximumWords) / 2
    : draft.minimumWords || draft.maximumWords || 0;
  const estimatedPages = estimatedWords ? Math.ceil(estimatedWords / 650) : null;
  const setWordCount = (key: WordCountKey, value: string) => {
    setWordCountInputs((current) => ({ ...current, [key]: value }));
    const parsed = Number(value);
    const words = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 10000)) : 0;
    setDraft((current) => ({ ...current, [key]: words }));
  };
  const normalizeWordCount = (key: WordCountKey) => {
    setWordCountInputs((current) => ({ ...current, [key]: String((draft[key] || 0) / 10000) }));
  };
  const toggleFolder = (folderId: string) => setExpandedKnowledgeFolders((current) =>
    current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
  const selectFolder = (documentIds: string[]) => setDraftKnowledgeIds((current) => [...new Set([...current, ...documentIds])]);
  const clearFolder = (documentIds: string[]) => setDraftKnowledgeIds((current) => current.filter((id) => !documentIds.includes(id)));

  return <div className="plan-step-body generation-settings-page">
    <section className="generation-settings-shell">
      <header className="bid-analysis-command-bar generation-settings-command-bar">
        <div className="generation-settings-header-copy">
          <span className="section-kicker">STEP 02 · 生成设置</span>
          <strong>确定本次生成目标</strong>
          <p>确认生成范围、参考资料与正文要求，保存后用于当前项目。</p>
          {stale && <small className="generation-settings-warning">篇幅目标已变化，需要重新生成目录后再生成正文。</small>}
        </div>
        <button type="button" className="primary-action generation-settings-save" disabled={busy || exportSettingsLoading || exportSettingsError} onClick={() => void save()}>{busy ? '保存中...' : '保存生成设置'}</button>
      </header>

      <div className="generation-settings-tabs" role="tablist" aria-label="生成设置分类">
        {tabs.map((tab, index) => <button
          key={tab.id}
          type="button"
          role="tab"
          id={'generation-settings-tab-' + tab.id}
          aria-controls="generation-settings-panel"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={activeTab === tab.id ? 'is-active' : ''}
          onClick={() => setActiveTab(tab.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            setActiveTab(tabs[target].id);
            document.getElementById('generation-settings-tab-' + tabs[target].id)?.focus();
          }}
        >{tab.label}</button>)}
      </div>

      <div ref={pageRef} className="generation-settings-panel" role="tabpanel" id="generation-settings-panel" aria-labelledby={'generation-settings-tab-' + activeTab}>
        {activeTab === 'content' && <>
          <div className="generation-settings-option-grid">
            <div className="generation-settings-option is-selected">
              <span>01</span>
              <strong>{workflowKind === 'existing-plan-expansion' ? '已有方案扩写' : '技术方案'}</strong>
              <small>{workflowKind === 'existing-plan-expansion' ? '基于已上传方案保留内容并扩写' : '围绕招标要求生成技术方案正文'}</small>
              <em>当前项目</em>
            </div>
            <div className="generation-settings-option is-locked"><span>02</span><strong>完整投标文件</strong><small>覆盖完整商务与技术响应</small><em>尚未支持</em></div>
            <div className="generation-settings-option is-locked"><span>03</span><strong>商务标独立成册</strong><small>仅生成商务部分</small><em>尚未支持</em></div>
          </div>
          <div className="generation-settings-content-foot">
            <strong>投标范围：{selectedBidSectionTitle || '整份招标文件'}</strong>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => void openRelatedStep(onOpenDocuments)}>查看招标文件与标段</button>
          </div>
        </>}

        {activeTab === 'knowledge' && <section className="generation-settings-section generation-settings-knowledge">
          <div className="generation-settings-section-head"><strong>参考知识库</strong><span>已选择 {draftKnowledgeIds.length} 个文档</span></div>
          {knowledgeLoading ? <div className="outline-knowledge-empty">正在读取知识库...</div> : !availableDocuments.length ? <div className="outline-knowledge-empty">暂无已处理完成的文档，请先到知识库导入并处理。</div> : <>
            <div className="generation-settings-search-row">
              <input type="search" value={knowledgeSearch} onChange={(event) => setKnowledgeSearch(event.target.value)} placeholder="搜索文件夹或文档" aria-label="搜索知识库文档" />
              <span>共 {availableDocuments.length} 个可用文档</span>
            </div>
            <div className="generation-settings-knowledge-grid">
              <div className="generation-settings-knowledge-pane">
                <div className="generation-settings-pane-head"><strong>知识库</strong><span>{visibleKnowledgeFolders.length} 个文件夹</span></div>
                <div className="generation-settings-folder-list">
                  {visibleKnowledgeFolders.length ? visibleKnowledgeFolders.map(({ folder, documents }) => {
                    const expanded = Boolean(keyword) || expandedKnowledgeFolders.includes(folder.id);
                    const ids = documents.map((document) => document.id);
                    return <section className="generation-settings-folder" key={folder.id}>
                      <div className="generation-settings-folder-head">
                        <button type="button" onClick={() => toggleFolder(folder.id)} aria-expanded={expanded}><span>{expanded ? '▾' : '▸'}</span><strong>{folder.name}</strong></button>
                        <small>{documents.length} 个 / 已选 {ids.filter((id) => draftKnowledgeIds.includes(id)).length}</small>
                        <button type="button" onClick={() => selectFolder(ids)}>全选</button>
                        <button type="button" onClick={() => clearFolder(ids)}>取消</button>
                      </div>
                      {expanded && <div className="generation-settings-document-list">{documents.map((document) => <label key={document.id} className={draftKnowledgeIds.includes(document.id) ? 'is-selected' : ''}>
                        <input type="checkbox" checked={draftKnowledgeIds.includes(document.id)} onChange={() => toggleKnowledgeDocument(document.id)} />
                        <strong title={document.file_name}>{document.file_name}</strong>
                        <small>{document.item_count || 0} 条</small>
                      </label>)}</div>}
                    </section>;
                  }) : <div className="outline-knowledge-empty">没有匹配的知识库文档</div>}
                </div>
              </div>
              <aside className="generation-settings-knowledge-pane">
                <div className="generation-settings-pane-head"><strong>本次已选</strong><button type="button" onClick={() => setDraftKnowledgeIds([])} disabled={!draftKnowledgeIds.length}>清空</button></div>
                <div className="generation-settings-selected-list">
                  {selectedKnowledgeDocuments.length ? selectedKnowledgeDocuments.map((document) => <div key={document.id}><strong title={document.file_name}>{document.file_name}</strong><button type="button" onClick={() => toggleKnowledgeDocument(document.id)}>移除</button></div>) : <div className="outline-knowledge-empty">未选择知识库文档</div>}
                </div>
              </aside>
            </div>
          </>}
        </section>}

        {activeTab === 'length' && <section className="generation-settings-section generation-settings-length">
          <div className="generation-settings-section-head"><strong>全文字数／页数预设</strong><span>目录生成阶段据此规划篇幅，0 表示不控制。</span></div>
          <div className="generation-settings-word-layout">
            <div className="generation-settings-word-controls">
              <div className="generation-settings-word-grid">
                <label><span>最少字数（万）</span><input type="number" min="0" step="0.01" value={wordCountInputs.minimumWords} onChange={(event) => setWordCount('minimumWords', event.target.value)} onBlur={() => normalizeWordCount('minimumWords')} /></label>
                <label><span>最多字数（万）</span><input type="number" min="0" step="0.01" value={wordCountInputs.maximumWords} onChange={(event) => setWordCount('maximumWords', event.target.value)} onBlur={() => normalizeWordCount('maximumWords')} /></label>
                <label><span>每小节建议字数（万）</span><input type="number" min="0" step="0.01" value={wordCountInputs.sectionWords} onChange={(event) => setWordCount('sectionWords', event.target.value)} onBlur={() => normalizeWordCount('sectionWords')} /></label>
              </div>
              <small>填 2 代表 20000 字，填 0.15 代表 1500 字；实际篇幅受目录和模型输出影响。</small>
            </div>
            <div className="generation-settings-page-estimate"><span>预估页数</span><strong>{estimatedPages ?? '--'}{estimatedPages && <small> 页</small>}</strong><small>按每页约 650 字估算</small></div>
          </div>
          <div className="generation-settings-row">
            <span><strong>表格需求</strong><small>设置正文编排时安排表格的数量倾向。</small></span>
            <select value={draft.tableRequirement} onChange={(event) => setDraft((current) => ({ ...current, tableRequirement: event.target.value as ContentTableRequirement }))}><option value="none">不要</option><option value="light">少量</option><option value="moderate">适中</option><option value="heavy">大量</option></select>
          </div>
          <div className="generation-settings-row"><span><strong>字数不达标修复</strong><small>开启后，正文完成时按全文字数范围扩写或精简；关闭时只统计并提示差额。</small></span><AppSwitch checked={Boolean(draft.wordCountRepair)} disabled={generationRunning} onCheckedChange={(checked) => setDraft((current) => ({ ...current, wordCountRepair: checked }))} aria-label="字数不达标修复" /></div>
          {stale && <p className="generation-settings-inline-note">修改篇幅目标后请重新生成目录。</p>}
        </section>}

        {activeTab === 'illustration' && <section className="generation-settings-section generation-settings-illustration">
          <div className="generation-settings-row"><span><strong>使用 AI 生图</strong><small>{imageModelStatus === 'available' ? '已配置可用生图模型。' : '请先在设置中配置并测试生图模型。'}</small></span><AppSwitch checked={draft.useAiImages} disabled={imageModelStatus !== 'available'} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useAiImages: checked }))} aria-label="使用 AI 生图" /></div>
          <div className="generation-settings-row"><span><strong>生成 Mermaid 图</strong><small>适合简单流程、层级和关系图；预览与 Word 图片转换在本地完成。</small></span><AppSwitch checked={draft.useMermaidImages} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useMermaidImages: checked }))} aria-label="生成 Mermaid 图" /></div>
          <div className="generation-settings-row"><span><strong>生成技术图谱</strong><small>{technicalDiagramAvailable ? '适合架构、拓扑、数据流和复杂流程。' : '请先在设置 > 技能管理中启用 technical-diagram。'}</small></span><AppSwitch checked={draft.useTechnicalDiagrams} disabled={!technicalDiagramAvailable} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useTechnicalDiagrams: checked }))} aria-label="生成技术图谱" /></div>
          <div className="generation-settings-subsection">
            <div className="generation-settings-section-head"><strong>本项目配图参数</strong><span>控制 AI 生图数量与表现形式。</span></div>
            <div className="generation-settings-row"><span><strong>AI 配图上限</strong><small>本次生成最多使用的 AI 图片张数。</small></span><input type="number" min="0" step="1" value={draft.maxAiImages} disabled={!draft.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraft((current) => ({ ...current, maxAiImages: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></div>
            <div className="generation-settings-row"><span><strong>AI 配图风格</strong><small>自动模式由生成流程选择。</small></span><select value={draft.aiImageStyle || 'auto'} disabled={!draft.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraft((current) => ({ ...current, aiImageStyle: event.target.value as ContentGenerationOptions['aiImageStyle'] }))}><option value="auto">自动</option><option value="engineering_diagram">工程示意图</option><option value="realistic_photo">真实照片</option><option value="product_shot">产品展示图</option><option value="architectural_render">建筑场地效果图</option><option value="3d_render">三维模型</option><option value="isometric_illustration">轴测插画</option><option value="cutaway_illustration">剖视插画</option><option value="exploded_view">爆炸分解图</option><option value="line_drawing">技术线稿</option><option value="flat_illustration">扁平插画</option></select></div>
          </div>
        </section>}

        {activeTab === 'writing' && <section className="generation-settings-section generation-settings-writing">
          <div className="generation-settings-section-head"><strong>资料缺失时怎么写</strong><span>正文会沿用此处选择的事实处理方式。</span></div>
          <div className="generation-settings-writing-options" role="radiogroup" aria-label="资料缺失时的事实处理">
            {([
              { value: 'infer', title: '合理推断', description: '根据已有材料与项目上下文推断。' },
              { value: 'generic', title: '笼统承诺', description: '不写缺少依据的具体人员、时间或参数。' },
              { value: 'placeholder', title: '标记待填写', description: '以【待填写】标出缺失事实，供人工补齐。' },
            ] as const).map((option) => <button key={option.value} type="button" role="radio" aria-checked={(draft.missingFactPolicy || 'infer') === option.value} className={(draft.missingFactPolicy || 'infer') === option.value ? 'is-selected' : ''} onClick={() => setDraft((current) => ({ ...current, missingFactPolicy: option.value }))}><strong>{option.title}</strong><span>{option.description}</span></button>)}
          </div>
          <div className="generation-settings-subsection">
            <div className="generation-settings-section-head"><strong>本项目正文参数</strong></div>
            <div className="generation-settings-row"><span><strong>全文一致性审计</strong><small>正文完成后检查与全局事实冲突的内容。</small></span><AppSwitch checked={draft.enableConsistencyAudit} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enableConsistencyAudit: checked }))} aria-label="全文一致性审计" /></div>
            <div className="generation-settings-row"><span><strong>正文并发数</strong><small>受所配置模型服务的速率限制影响。</small></span><input type="number" min="1" step="1" value={draft.contentConcurrency} onChange={(event) => setDraft((current) => ({ ...current, contentConcurrency: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} /></div>
          </div>
        </section>}

        {activeTab === 'appearance' && <section className="generation-settings-section generation-settings-appearance">
          <div className="generation-settings-section-head"><strong>Word 导出方式</strong><span>选择当前项目默认排版，正式导出时仍可临时调整。</span></div>
          {exportSettingsError && <div className="generation-settings-load-error"><span>技能和模板信息读取失败，当前不能保存设置。</span><button type="button" className="secondary-action" onClick={() => setExportSettingsRevision((value) => value + 1)}>重新读取</button></div>}
          <div className="generation-settings-mode-grid" role="radiogroup" aria-label="Word 导出方式">
            <label className={selectedWordExportMode === 'word-optimization' ? 'is-selected' : ''}><input type="radio" name="generation-word-export-mode" checked={selectedWordExportMode === 'word-optimization'} disabled={!wordOptimizationEnabled || exportSettingsError} onChange={() => setDraft((current) => ({ ...current, wordExportMode: 'word-optimization' }))} /><strong>word-optimization</strong><small>{wordOptimizationEnabled ? '技能管理中的内置优化排版' : '请先在技能管理中启用'}</small></label>
            <label className={selectedWordExportMode === 'custom-template' ? 'is-selected' : ''}><input type="radio" name="generation-word-export-mode" checked={selectedWordExportMode === 'custom-template'} disabled={!exportTemplates.length || exportSettingsError} onChange={() => setDraft((current) => ({ ...current, wordExportMode: 'custom-template', wordExportTemplateId: selectedWordExportTemplateId }))} /><strong>模板管理中的模板</strong><small>{exportTemplates.length ? '按已保存的招投标模板排版' : '暂无可用模板'}</small></label>
            <label className={selectedWordExportMode === 'basic' ? 'is-selected' : ''}><input type="radio" name="generation-word-export-mode" checked={selectedWordExportMode === 'basic'} disabled={exportSettingsError} onChange={() => setDraft((current) => ({ ...current, wordExportMode: 'basic' }))} /><strong>基础格式</strong><small>使用兼容排版</small></label>
          </div>
          <div className="generation-settings-subsection">
            <div className="generation-settings-section-head"><strong>导出模板选择</strong><span>模板管理中的配置决定纸张、字体、标题、表格与图片样式。</span></div>
            <div className="generation-settings-template-control">
              <select aria-label="选择 Word 导出模板" value={selectedWordExportMode === 'custom-template' ? selectedWordExportTemplateId : ''} disabled={selectedWordExportMode !== 'custom-template' || !exportTemplates.length || exportSettingsError} onChange={(event) => setDraft((current) => ({ ...current, wordExportTemplateId: event.target.value }))}>
                <option value="" disabled>{selectedWordExportTemplateMissing ? '原选模板已删除，请重新选择' : '请选择导出模板'}</option>
                {exportTemplates.map((template) => <option value={template.templateId} key={template.templateId}>{template.templateName}</option>)}
              </select>
              <button type="button" className="secondary-action" disabled={busy || !onOpenExportTemplates} onClick={() => onOpenExportTemplates && void openRelatedStep(onOpenExportTemplates)}>打开模板管理</button>
            </div>
            {selectedWordExportTemplateMissing && <p className="generation-settings-inline-note">原选模板已删除，请重新选择。</p>}
          </div>
          <div className="generation-settings-subsection"><div className="generation-settings-row"><span><strong>格式自检及修复</strong><small>正文完成后按所选样式试导出 Word，检查分页留白，并对可定位的小节补写后复查。</small></span><AppSwitch checked={Boolean(draft.layoutCheck)} disabled={generationRunning} onCheckedChange={(checked) => setDraft((current) => ({ ...current, layoutCheck: checked }))} aria-label="格式自检及修复" /></div></div>
        </section>}
      </div>
    </section>
  </div>;
}
