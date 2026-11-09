import type { CredentialCompany } from '../../../shared/types/contracts/credentialLibrary';
import EnterpriseSearchInput from '../../../shared/ui/EnterpriseSearchInput';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import { BufferedNumberInput } from '../../../shared/ui/BufferedNumberInput';
import { useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { AppSwitch, MarkdownRenderer, useToast } from '../../../shared/ui';
import type { KnowledgeBaseIndex } from '../../knowledge-base/types';
import type { ImageModelStatus } from '../../../shared/types';
import type { BidExportTemplateRecord } from '../../../shared/types/exportFormat';
import type { ContentGenerationOptions, ContentTableRequirement, MissingFactPolicy, TechnicalPlanOriginalPlanFile } from '../types';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import { handleTabListKeyDown } from '../../../shared/utils/keyboardTabs';
import './generationSettings.css';
import './modernGenerationSettings.css';

type SettingsTab = 'content' | 'original' | 'knowledge' | 'length' | 'illustration' | 'writing' | 'appearance';
type WordCountKey = 'minimumWords' | 'maximumWords' | 'sectionWords';

const wordCountInputsFromOptions = (options?: ContentGenerationOptions): Record<WordCountKey, string> => ({
  minimumWords: String((options?.minimumWords || 0) / 10000),
  maximumWords: String((options?.maximumWords || 0) / 10000),
  sectionWords: String((options?.sectionWords || 0) / 10000),
});

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'content', label: '写什么' },
  { id: 'original', label: '原方案' },
  { id: 'knowledge', label: '知识库' },
  { id: 'length', label: '写多少' },
  { id: 'illustration', label: '插图吗' },
  { id: 'writing', label: '怎么写' },
  { id: 'appearance', label: '导出样式' },
];

const modernTabLabels: Record<SettingsTab, string> = { content: '内容范围', original: '原方案', knowledge: '参考资料', length: '篇幅目标', illustration: '配图设置', writing: '写作策略', appearance: '导出样式' };

export interface GenerationSettingsNavigation {
  previous?: { label: string; open: () => void };
  next?: { label: string; open: () => void };
  busy: boolean;
}

interface GenerationSettingsPageProps {
  options?: ContentGenerationOptions;
  projectName?: string;
  onBackToProjects?: () => void;
  originalPlanFile: TechnicalPlanOriginalPlanFile | null;
  originalPlanMarkdown: string;
  originalPlanBusy: boolean;
  onChangeOriginalPlan: (remove: boolean) => Promise<void>;
  selectedBidSectionTitle?: string;
  referenceKnowledgeDocumentIds: string[];
  stale: boolean;
  generationRunning?: boolean;
  onOpenDocuments: () => void;
  onOpenExportTemplates?: () => void;
  onSave: (options: ContentGenerationOptions, referenceKnowledgeDocumentIds: string[]) => Promise<boolean>;
  onDraftDirtyChange?: (dirty: boolean) => void;
  onNavigationChange?: (navigation: GenerationSettingsNavigation | null) => void;
  onRegisterAutoSave?: (save: (() => Promise<boolean>) | null) => void;
}

const defaults: ContentGenerationOptions = {
  useAiImages: false, aiImageStyle: 'auto', maxAiImages: 6,
  useMermaidImages: true, illustrateEverySection: false, useHtmlImages: true, maxHtmlImages: 10, useTechnicalDiagrams: false,
  tableRequirement: 'heavy', minimumWords: 0, maximumWords: 0, sectionWords: 0, wordCountRepair: false, layoutCheck: false, contentConcurrency: 5,
  enableConsistencyAudit: true, enableOriginalPlanCoverageAudit: false,
  missingFactPolicy: 'infer',
};

export default function GenerationSettingsPage({ options, projectName, onBackToProjects, originalPlanFile, originalPlanMarkdown, originalPlanBusy, onChangeOriginalPlan, selectedBidSectionTitle, referenceKnowledgeDocumentIds, stale, generationRunning = false, onOpenDocuments, onOpenExportTemplates, onSave, onDraftDirtyChange, onNavigationChange, onRegisterAutoSave }: GenerationSettingsPageProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('content');
  const pageRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ContentGenerationOptions>({ ...defaults, ...options, illustrateEverySection: options?.illustrateEverySection ?? Boolean(options) });
  const tabs = settingsTabs.filter((tab) => tab.id !== 'original' || draft.bidGenerationScope !== 'business');
  useEffect(() => {
    if (draft.bidGenerationScope === 'business' && activeTab === 'original') setActiveTab('content');
  }, [activeTab, draft.bidGenerationScope]);
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
  const [saveError, setSaveError] = useState('');
  const lengthError = draft.maximumWords && draft.minimumWords > draft.maximumWords ? '最多字数不能少于最少字数，请调整篇幅目标。' : '';
  const modern = getStoredUiAppearance() === 'modern';
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const savedSignatureRef = useRef('');
  const draftSignature = JSON.stringify({ draft, draftKnowledgeIds });
  const changed = JSON.stringify({ ...defaults, ...options, illustrateEverySection: options?.illustrateEverySection ?? Boolean(options) }) !== JSON.stringify(draft)
    || JSON.stringify(referenceKnowledgeDocumentIds) !== JSON.stringify(draftKnowledgeIds);

  useEffect(() => () => { onDraftDirtyChange?.(false); }, [onDraftDirtyChange]);
  useEffect(() => {
    setDraft({ ...defaults, ...options, illustrateEverySection: options?.illustrateEverySection ?? Boolean(options) });
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

  const save = async (force = false) => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!force && !stale && ((options && !changed) || draftSignature === savedSignatureRef.current)) return true;
    const pending = persistDraft();
    savePromiseRef.current = pending;
    try {
      const saved = await pending;
      if (saved) savedSignatureRef.current = draftSignature;
      return saved;
    }
    finally { savePromiseRef.current = null; }
  };

  const persistDraft = async () => {
    if (exportSettingsError && draft.wordExportMode && draft.wordExportMode !== 'basic') {
      setActiveTab('appearance');
      showToast('导出设置读取失败，请重新读取或改用基础格式', 'info');
      return false;
    }
    if (draft.maximumWords && draft.minimumWords > draft.maximumWords) {
      setActiveTab('length');
      if (!modern) showToast('全文参考上限不能低于最低字数', 'info');
      return false;
    }
    const wordExportMode = draft.wordExportMode || (exportSettingsError || exportSettingsLoading ? 'basic' : wordOptimizationEnabled ? 'word-optimization' : exportTemplates.length ? 'custom-template' : 'basic');
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
    setSaveError('');
    try {
      const saved = await onSave({ ...draft, wordExportMode, wordExportTemplateId }, draftKnowledgeIds);

      if (!saved) setSaveError('设置未保存，请检查提示后重试。');
      return saved;
    }
    catch (error) {
      console.error('[GenerationSettingsPage] 保存生成设置失败', error);
      const message = error instanceof Error ? error.message : '保存生成设置失败';
      setSaveError(message);
      if (message.startsWith('正文正在生成，请先暂停任务，再修改生成设置')) {
        showToast('正文正在生成，请先暂停任务，再修改生成设置。', 'error', {
          title: '修改后需重新编排并生成正文',
          duration: 12000,
        });
      } else {
        showToast(message, 'error');
      }
      return false;
    }
    finally { setBusy(false); }
  };

  useEffect(() => {
    onRegisterAutoSave?.(async () => {
      return save();
    });
    return () => onRegisterAutoSave?.(null);
  });

  const saveOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (changed && event.target.matches('input, select, textarea, button[role="radio"], button[role="switch"]')) {
      void save();
    }
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

  useEffect(() => { onDraftDirtyChange?.(changed); }, [changed, onDraftDirtyChange]);
  const switchSettingsTab = (tab: SettingsTab) => setActiveTab(tab);
  const tabIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const previousTab = tabs[tabIndex - 1]?.id;
  const nextTab = tabs[tabIndex + 1]?.id;
  useEffect(() => {
    const toAction = (id?: SettingsTab) => id ? {
      label: modern ? modernTabLabels[id] : settingsTabs.find((tab) => tab.id === id)!.label,
      open: () => setActiveTab(id),
    } : undefined;
    onNavigationChange?.({ previous: toAction(previousTab), next: toAction(nextTab), busy: busy || originalPlanBusy });
  }, [busy, modern, nextTab, onNavigationChange, originalPlanBusy, previousTab]);
  useEffect(() => () => onNavigationChange?.(null), [onNavigationChange]);
  const tabProgress = `第 ${Math.max(0, tabIndex) + 1} 项，共 ${tabs.length} 项`;


  const scope = draft.bidGenerationScope ?? 'technical';
  const [bidderCompanies, setBidderCompanies] = useState<CredentialCompany[]>([]);
  const [bidderCompaniesStatus, setBidderCompaniesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bidderCompaniesRevision, setBidderCompaniesRevision] = useState(0);
  useEffect(() => {
    if (scope === 'technical') return;
    let active = true;
    setBidderCompaniesStatus('loading');
    const library = window.yibiao?.credentialLibrary;
    if (!library) {
      setBidderCompaniesStatus('error');
      return;
    }
    void library.listCompanies().then((companies) => {
      if (active) {
        setBidderCompanies(companies);
        setBidderCompaniesStatus('ready');
      }
    }).catch(() => { if (active) setBidderCompaniesStatus('error'); });
    return () => { active = false; };
  }, [scope, bidderCompaniesRevision]);
  const savedBidderMissing = Boolean(draft.bidderCompanyId && !bidderCompanies.some((company) => company.companyId === draft.bidderCompanyId));

  const scopeSettings = (
    <>
      <fieldset className="generation-settings-option-grid" disabled={generationRunning} aria-label="生成范围">
        {([
          ['complete', '完整投标文件', '按照招标文件响应要求完整生成。'],
          ['technical', '技术文件独立成册', '一级目录从技术评分大项开始。'],
          ['business', '商务标独立成册', '按照招标文件响应要求仅生成商务部分。'],
        ] as const).map(([value, label, description], index) => (
          <label key={value} className={`generation-settings-option${scope === value ? ' is-selected' : ''}`}>
            <span>0{index + 1}</span>
            <input type="radio" name="bid-generation-scope" checked={scope === value}
              onChange={() => setDraft((current) => ({ ...current, bidGenerationScope: value }))} />
            <strong>{label}</strong>
            <small>{description}</small>
          </label>
        ))}
      </fieldset>
      {scope !== 'technical' && (
        <div className="generation-settings-row generation-settings-bidder">
          <span>
            <strong>投标企业</strong>
            <small>选择后，企业名称、统一社会信用代码、注册地址和法定代表人姓名会提供给当前配置的文本模型，用于编写商务响应。</small>
            {bidderCompaniesStatus === 'ready' && bidderCompanies.length === 0 && <small>资信库暂无企业，可先添加企业资料。</small>}
            {bidderCompaniesStatus === 'error' && <small role="alert">企业列表读取失败。<button type="button" className="secondary-action" onClick={() => setBidderCompaniesRevision((value) => value + 1)}>重试</button></small>}
          </span>
          <select aria-label="投标企业" value={draft.bidderCompanyId || ''} disabled={generationRunning || bidderCompaniesStatus !== 'ready'}
            onChange={(event) => setDraft((current) => ({ ...current, bidderCompanyId: event.target.value || undefined }))}>
            <option value="">{bidderCompaniesStatus === 'loading' ? '正在读取企业…' : '不引用企业资料（待填写）'}</option>
            {savedBidderMissing && <option value={draft.bidderCompanyId} disabled>{bidderCompaniesStatus === 'ready' ? '原企业已不可用，请重新选择' : '已保存企业，等待读取'}</option>}
            {bidderCompanies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName.replace(/易标|yibiao/gi, '投标工具')}</option>)}
          </select>
        </div>
      )}
    </>
  );

  const changeOriginalPlan = async (remove: boolean) => {
    if (changed && !await save()) return;
    await onChangeOriginalPlan(remove);
  };
  const originalPlanStatus = originalPlanBusy ? '处理中…' : originalPlanFile ? '已上传' : '未上传';
  const originalPlanDisabled = busy || generationRunning || originalPlanBusy;
  const originalPlanSettings = <section className="generation-original-plan" aria-label="原方案">
    <div className="generation-original-row">
      <div className="generation-original-intro">
        <h3>基于已有方案扩写</h3>
        <p>可选 · 用于技术目录和正文</p>
      </div>
      <div className="generation-original-file">
        <strong title={originalPlanFile?.fileName}>{originalPlanFile?.fileName || '未上传原方案'}</strong>
        <small>{originalPlanFile
          ? [originalPlanFile.parserLabel, `${originalPlanFile.markdownChars} 字`].filter(Boolean).join(' · ')
          : '上传已有技术方案，结合招标要求保留并扩充相关内容。'}</small>
      </div>
      <div className="generation-original-actions">
        {originalPlanFile && <button type="button" className="secondary-action" disabled={originalPlanDisabled} onClick={() => void changeOriginalPlan(true)}>移除</button>}
        <button type="button" className="primary-action" disabled={originalPlanDisabled} onClick={() => void changeOriginalPlan(false)}>
          {originalPlanBusy ? '处理中…' : originalPlanFile ? '替换原方案' : '上传原方案'}
        </button>
      </div>
    </div>
    {originalPlanMarkdown && <details className="generation-original-preview"><summary>预览原方案</summary><div className="markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{originalPlanMarkdown}</MarkdownRenderer></div></details>}
  </section>;

  if (getStoredUiAppearance() === 'modern') {
    const currentTab = tabs.find((tab) => tab.id === activeTab);
    return <div className="modern-generation-page" onBlurCapture={saveOnBlur}>
      <aside className="modern-generation-index" aria-label="生成设置分类">

        <nav role="tablist" aria-label="生成设置分类" onKeyDown={handleTabListKeyDown}>{tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={`modern-generation-tab-${tab.id}`} aria-controls="modern-generation-panel" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => void switchSettingsTab(tab.id)}><strong>{modernTabLabels[tab.id]}</strong>{tab.id === 'original' && <small className="generation-original-tab-status">{originalPlanStatus}</small>}</button>)}</nav>

      </aside>
      <div className="modern-generation-main">
        <header className="modern-generation-header"><div><h2>生成设置</h2><p>{tabProgress} · {currentTab ? modernTabLabels[currentTab.id] : '本项目配置'}</p></div><div className={`modern-generation-change${changed ? ' is-dirty' : ''}`} role="status" aria-live="polite">{busy ? '正在保存' : saveError ? '保存失败' : changed ? '有未保存的修改' : !options || stale ? '待保存配置' : '当前配置已同步'}</div></header>
        {saveError && <p className="modern-generation-alert" role="alert">{saveError} 修改仍保留在本页，请重新保存。</p>}
        {stale && <p className="modern-generation-alert">篇幅目标尚未同步，保存生成设置后即可继续。</p>}
        <div ref={pageRef} className="modern-generation-content" key={activeTab} role="tabpanel" id="modern-generation-panel" aria-labelledby={`modern-generation-tab-${activeTab}`}>
          {activeTab === 'content' && <div className="modern-generation-stack">
            <div className="generation-settings-content-foot">
              <span>适用标段 · {selectedBidSectionTitle || '整份招标文件'}</span>
              <button type="button" className="secondary-action" disabled={busy} onClick={() => void openRelatedStep(onOpenDocuments)}>查看招标文件与标段</button>
            </div>
            {scopeSettings}
          </div>}
          {activeTab === 'original' && originalPlanSettings}
          {activeTab === 'knowledge' && <div className="modern-generation-stack">
            <div className="modern-generation-summary"><div><span>可用文档</span><strong>{availableDocuments.length}</strong></div><div><span>本次已选</span><strong>{draftKnowledgeIds.length}</strong></div></div>
            {knowledgeLoading ? <p className="modern-generation-empty">正在读取知识库...</p> : !availableDocuments.length ? <p className="modern-generation-empty">暂无处理完成的文档，请先到知识库导入并处理。</p> : <>
              <EnterpriseUiProvider><div className="modern-generation-search"><span>搜索知识库</span><EnterpriseSearchInput aria-label="搜索知识库文档" value={knowledgeSearch} allowClear onChange={event => setKnowledgeSearch(event.target.value)} placeholder="搜索文件夹或文档" /></div></EnterpriseUiProvider>
              <div className="modern-generation-knowledge-grid"><div className="modern-generation-library"><h3>知识库文档</h3>{visibleKnowledgeFolders.length ? visibleKnowledgeFolders.map(({ folder, documents }) => { const expanded = Boolean(keyword) || expandedKnowledgeFolders.includes(folder.id); const ids = documents.map((document) => document.id); return <section key={folder.id} className="modern-generation-folder"><header><button type="button" onClick={() => toggleFolder(folder.id)} aria-expanded={expanded}>{expanded ? '▾' : '▸'} {folder.name}</button><span>{documents.length} 个</span><button type="button" onClick={() => selectFolder(ids)}>全选</button><button type="button" onClick={() => clearFolder(ids)}>取消</button></header>{expanded && <div>{documents.map((document) => <label key={document.id}><input type="checkbox" checked={draftKnowledgeIds.includes(document.id)} onChange={() => toggleKnowledgeDocument(document.id)} /><span title={document.file_name}>{document.file_name}</span><small>{document.item_count || 0} 条</small></label>)}</div>}</section>; }) : <p className="modern-generation-empty">没有匹配的知识库文档</p>}</div>
                <aside className="modern-generation-selected"><header><h3>本次已选</h3><button type="button" onClick={() => setDraftKnowledgeIds([])} disabled={!draftKnowledgeIds.length}>清空</button></header>{selectedKnowledgeDocuments.length ? selectedKnowledgeDocuments.map((document) => <div key={document.id}><span title={document.file_name}>{document.file_name}</span><button type="button" onClick={() => toggleKnowledgeDocument(document.id)}>移除</button></div>) : <p>未选择知识库文档</p>}</aside></div>
            </>}
          </div>}
          {activeTab === 'length' && <div className="modern-generation-stack">
            <div className="modern-generation-length"><section><span>篇幅目标</span><div>{(['minimumWords', 'maximumWords', 'sectionWords'] as const).map((key) => <label key={key}>{key === 'minimumWords' ? '最少字数（万）' : key === 'maximumWords' ? '最多字数（万）' : '每小节建议字数（万）'}<input type="number" min="0" step="0.01" aria-invalid={Boolean(lengthError) && key !== 'sectionWords'} aria-describedby={lengthError && key !== 'sectionWords' ? 'modern-length-error' : 'modern-length-help'} value={wordCountInputs[key]} onChange={(event) => setWordCount(key, event.target.value)} onBlur={() => normalizeWordCount(key)} /></label>)}</div><small id="modern-length-help">填写 2 代表 20000 字；填写 0 表示不控制。</small>{lengthError && <p id="modern-length-error" className="modern-generation-field-error" role="alert">{lengthError}</p>}</section><aside><span>预估页数</span><strong>{lengthError ? '—' : estimatedPages ?? '—'}</strong><small>按每页约 650 字估算</small></aside></div>
            <div className="modern-generation-field"><div><strong>表格需求</strong><small>正文编排时安排表格的倾向。</small></div><select aria-label="表格需求" value={draft.tableRequirement} onChange={(event) => setDraft((current) => ({ ...current, tableRequirement: event.target.value as ContentTableRequirement }))}><option value="none">不要</option><option value="light">少量</option><option value="moderate">适中</option><option value="heavy">大量</option></select></div>
            <div className="modern-generation-field"><div><strong>字数不达标修复</strong><small>正文完成后按全文字数范围扩写或精简。</small></div><AppSwitch checked={Boolean(draft.wordCountRepair)} disabled={generationRunning} onCheckedChange={(checked) => setDraft((current) => ({ ...current, wordCountRepair: checked }))} aria-label="字数不达标修复" /></div>
          </div>}
          {activeTab === 'illustration' && <div className="modern-generation-stack">
            <div className="modern-generation-field"><div><strong>每小节至少配一张图</strong><small>关闭后由模型判断；开启时需启用 Mermaid、技术图谱或 AI 生图。</small></div><AppSwitch checked={Boolean(draft.illustrateEverySection)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, illustrateEverySection: checked }))} aria-label="每小节至少配一张图" /></div>
            <div className="modern-generation-field"><div><strong>使用 AI 生图</strong><small>{imageModelStatus === 'available' ? '已配置可用生图模型。' : '请先在设置中配置并测试生图模型。'}</small></div><AppSwitch checked={draft.useAiImages} disabled={imageModelStatus !== 'available'} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useAiImages: checked }))} aria-label="使用 AI 生图" /></div>
            <div className="modern-generation-field"><div><strong>生成 Mermaid 图</strong><small>适合简单流程、层级和关系图。</small></div><AppSwitch checked={draft.useMermaidImages} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useMermaidImages: checked }))} aria-label="生成 Mermaid 图" /></div>
            <div className="modern-generation-field"><div><strong>生成 HTML 图</strong><small>根据小节内容匹配甘特、WBS、拓扑等图型。</small></div><AppSwitch checked={Boolean(draft.useHtmlImages)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useHtmlImages: checked }))} aria-label="生成 HTML 图" /></div>
            {draft.useHtmlImages && <div className="modern-generation-field"><div><strong>HTML 配图上限</strong><small>没有足够事实的小节不会凑数。</small></div><BufferedNumberInput type="number" min="0" max="30" step="1" aria-label="HTML 配图上限" value={draft.maxHtmlImages ?? 10} onChange={(event) => setDraft((current) => ({ ...current, maxHtmlImages: Math.max(0, Math.min(30, Math.round(Number(event.target.value) || 0))) }))} /></div>}
            <div className="modern-generation-field"><div><strong>生成技术图谱</strong><small>{technicalDiagramAvailable ? '用于架构、拓扑、数据流和复杂流程。' : '请先在技能管理中启用 technical-diagram。'}</small></div><AppSwitch checked={draft.useTechnicalDiagrams} disabled={!technicalDiagramAvailable} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useTechnicalDiagrams: checked }))} aria-label="生成技术图谱" /></div>
            <section className="modern-generation-block"><h3>AI 配图参数</h3><div className="modern-generation-field"><div><strong>AI 配图上限</strong><small>本次生成最多使用的 AI 图片张数。</small></div><BufferedNumberInput type="number" min="0" step="1" aria-label="AI 配图上限" value={draft.maxAiImages} disabled={!draft.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraft((current) => ({ ...current, maxAiImages: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></div><div className="modern-generation-field"><div><strong>AI 配图风格</strong><small>自动模式由生成流程选择。</small></div><select aria-label="AI 配图风格" value={draft.aiImageStyle || 'auto'} disabled={!draft.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraft((current) => ({ ...current, aiImageStyle: event.target.value as ContentGenerationOptions['aiImageStyle'] }))}><option value="auto">自动</option><option value="engineering_diagram">工程示意图</option><option value="realistic_photo">真实照片</option><option value="product_shot">产品展示图</option><option value="architectural_render">建筑场地效果图</option><option value="3d_render">三维模型</option><option value="isometric_illustration">轴测插画</option><option value="cutaway_illustration">剖视插画</option><option value="exploded_view">爆炸分解图</option><option value="line_drawing">技术线稿</option><option value="flat_illustration">扁平插画</option></select></div></section>
          </div>}
          {activeTab === 'writing' && <div className="modern-generation-stack"><section className="modern-generation-block"><h3>资料缺失时怎么写</h3><p>正文会沿用此处选择的事实处理方式。</p><div className="modern-generation-policy" role="radiogroup" aria-label="资料缺失时的事实处理">{([{ value: 'infer', title: '合理推断', description: '根据已有材料与项目上下文推断。' }, { value: 'generic', title: '笼统承诺', description: '不写缺少依据的具体人员、时间或参数。' }, { value: 'placeholder', title: '标记待填写', description: '以【待填写】标出缺失事实，供人工补齐。' }] as const).map((option) => <label key={option.value} className={(draft.missingFactPolicy || 'infer') === option.value ? 'is-selected' : ''}><input type="radio" name="modern-missing-fact-policy" value={option.value} checked={(draft.missingFactPolicy || 'infer') === option.value} onChange={() => setDraft((current) => ({ ...current, missingFactPolicy: option.value }))} /><strong>{option.title}</strong><span>{option.description}</span></label>)}</div></section>
            <details className="modern-generation-advanced"><summary>高级设置<span>一致性审计 · 并发控制</span></summary>
            <div className="modern-generation-field"><div><strong>全文一致性审计</strong><small>正文完成后检查与全局事实冲突的内容。</small></div><AppSwitch checked={draft.enableConsistencyAudit} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enableConsistencyAudit: checked }))} aria-label="全文一致性审计" /></div>
            <div className="modern-generation-field"><div><strong>正文并发数</strong><small>受所配置模型服务的速率限制影响。</small></div><BufferedNumberInput type="number" min="1" step="1" aria-label="正文并发数" value={draft.contentConcurrency} onChange={(event) => setDraft((current) => ({ ...current, contentConcurrency: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} /></div>
            </details>
          </div>}
          {activeTab === 'appearance' && <div className="modern-generation-stack"><section className="modern-generation-block"><h3>Word 导出方式</h3><p>选择当前项目默认排版，正式导出时仍可临时调整。</p>{exportSettingsError && <div className="modern-generation-alert">技能和模板信息读取失败。<button className="secondary-action" type="button" onClick={() => setExportSettingsRevision((value) => value + 1)}>重新读取</button></div>}
            <div className="modern-generation-export-options" role="radiogroup" aria-label="Word 导出方式"><label className={selectedWordExportMode === 'word-optimization' ? 'is-selected' : ''}><input type="radio" name="modern-generation-word-mode" checked={selectedWordExportMode === 'word-optimization'} disabled={!wordOptimizationEnabled || exportSettingsError} onChange={() => setDraft((current) => ({ ...current, wordExportMode: 'word-optimization' }))} /><strong>优化排版</strong><small>{wordOptimizationEnabled ? '内置优化排版' : '请先在技能管理中启用'}</small></label><label className={selectedWordExportMode === 'custom-template' ? 'is-selected' : ''}><input type="radio" name="modern-generation-word-mode" checked={selectedWordExportMode === 'custom-template'} disabled={!exportTemplates.length || exportSettingsError} onChange={() => setDraft((current) => ({ ...current, wordExportMode: 'custom-template', wordExportTemplateId: selectedWordExportTemplateId }))} /><strong>模板管理中的模板</strong><small>{exportTemplates.length ? '按已保存的招投标模板排版' : '暂无可用模板'}</small></label><label className={selectedWordExportMode === 'basic' ? 'is-selected' : ''}><input type="radio" name="modern-generation-word-mode" checked={selectedWordExportMode === 'basic'} onChange={() => setDraft((current) => ({ ...current, wordExportMode: 'basic' }))} /><strong>基础格式</strong><small>使用兼容排版</small></label></div></section>
            <section className="modern-generation-block"><h3>导出模板</h3><p>模板管理中的配置决定纸张、字体、标题、表格与图片样式。</p><div className="modern-generation-template"><select aria-label="选择 Word 导出模板" value={selectedWordExportMode === 'custom-template' ? selectedWordExportTemplateId : ''} disabled={selectedWordExportMode !== 'custom-template' || !exportTemplates.length || exportSettingsError} onChange={(event) => setDraft((current) => ({ ...current, wordExportTemplateId: event.target.value }))}><option value="" disabled>{selectedWordExportTemplateMissing ? '原选模板已删除，请重新选择' : '请选择导出模板'}</option>{exportTemplates.map((template) => <option value={template.templateId} key={template.templateId}>{template.templateName}</option>)}</select><button type="button" disabled={busy || !onOpenExportTemplates} onClick={() => onOpenExportTemplates && void openRelatedStep(onOpenExportTemplates)}>打开模板管理</button></div>{selectedWordExportTemplateMissing && <p>原选模板已删除，请重新选择。</p>}</section>
            <div className="modern-generation-field"><div><strong>格式自检及修复</strong><small>正文完成后试导出 Word，检查分页留白并复查。</small></div><AppSwitch checked={Boolean(draft.layoutCheck)} disabled={generationRunning} onCheckedChange={(checked) => setDraft((current) => ({ ...current, layoutCheck: checked }))} aria-label="格式自检及修复" /></div>
          </div>}
        </div>
        <footer className="modern-generation-footer"><span role="status">{busy ? '正在保存，请稍候' : lengthError ? '请先修正篇幅目标' : saveError ? '保存失败，可重试' : changed ? '离开控件时自动保存，也可手动保存' : !options || stale ? '请保存当前配置后继续' : '当前配置已同步到本项目'}</span><button type="button" disabled={busy || Boolean(lengthError)} onClick={() => void save(true)}>{busy ? '保存中...' : '保存生成设置'}</button></footer>
      </div>
    </div>;
  }

  return <div className="plan-step-body generation-settings-page" onBlurCapture={saveOnBlur}>
    <section className="generation-settings-shell">
      <header className="bid-analysis-command-bar generation-settings-command-bar">
        <div className="generation-settings-header-copy">
          <span className="section-kicker">STEP 02{projectName && <> · {projectName}</>}</span>
          <strong>生成设置</strong>
          <p>{tabProgress} · 可逐项配置，也可使用当前设置继续。</p>
          {stale && <small className="generation-settings-warning">篇幅目标尚未同步，保存生成设置后即可继续。</small>}
        </div>
        <div className="generation-settings-header-actions">
          {onBackToProjects && <button type="button" className="secondary-action" onClick={onBackToProjects}>返回项目列表</button>}
        <button type="button" className="primary-action generation-settings-save" disabled={busy} onClick={() => void save(true)}>{busy ? '保存中...' : '保存生成设置'}</button>
        </div>
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
          onClick={() => void switchSettingsTab(tab.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            void switchSettingsTab(tabs[target].id);
            document.getElementById('generation-settings-tab-' + tabs[target].id)?.focus();
          }}
        ><span>{tab.label}</span>{tab.id === 'original' && <small className="generation-original-tab-status">{originalPlanStatus}</small>}</button>)}
      </div>

      <div ref={pageRef} key={activeTab} className="generation-settings-panel" role="tabpanel" id="generation-settings-panel" aria-labelledby={'generation-settings-tab-' + activeTab}>
        {activeTab === 'content' && <>
          {scopeSettings}
          <div className="generation-settings-content-foot">
            <strong>投标范围：{selectedBidSectionTitle || '整份招标文件'}</strong>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => void openRelatedStep(onOpenDocuments)}>查看招标文件与标段</button>
          </div>
        </>}

        {activeTab === 'original' && originalPlanSettings}
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
            <select aria-label="表格需求" value={draft.tableRequirement} onChange={(event) => setDraft((current) => ({ ...current, tableRequirement: event.target.value as ContentTableRequirement }))}><option value="none">不要</option><option value="light">少量</option><option value="moderate">适中</option><option value="heavy">大量</option></select>
          </div>
          <div className="generation-settings-row"><span><strong>字数不达标修复</strong><small>开启后，正文完成时按全文字数范围扩写或精简；关闭时只统计并提示差额。</small></span><AppSwitch checked={Boolean(draft.wordCountRepair)} disabled={generationRunning} onCheckedChange={(checked) => setDraft((current) => ({ ...current, wordCountRepair: checked }))} aria-label="字数不达标修复" /></div>
          {stale && <p className="generation-settings-inline-note">篇幅目标修改后会在失焦或离开本页时自动保存。</p>}
        </section>}

        {activeTab === 'illustration' && <section className="generation-settings-section generation-settings-illustration">
          <div className="generation-settings-row"><span><strong>每小节至少配一张图</strong><small>关闭后由模型判断；开启时需启用 Mermaid、技术图谱或 AI 生图。</small></span><AppSwitch checked={Boolean(draft.illustrateEverySection)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, illustrateEverySection: checked }))} aria-label="每小节至少配一张图" /></div>
          <div className="generation-settings-row"><span><strong>使用 AI 生图</strong><small>{imageModelStatus === 'available' ? '已配置可用生图模型。' : '请先在设置中配置并测试生图模型。'}</small></span><AppSwitch checked={draft.useAiImages} disabled={imageModelStatus !== 'available'} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useAiImages: checked }))} aria-label="使用 AI 生图" /></div>
          <div className="generation-settings-row"><span><strong>生成 Mermaid 图</strong><small>适合简单流程、层级和关系图；预览与 Word 图片转换在本地完成。</small></span><AppSwitch checked={draft.useMermaidImages} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useMermaidImages: checked }))} aria-label="生成 Mermaid 图" /></div>
          <div className="generation-settings-row"><span><strong>生成 HTML 图</strong><small>小节正文同时具备图型所需的两组线索时，匹配甘特、WBS、拓扑、组织、矩阵等图型；优先选择匹配度高的小节，插在相关段落后。</small></span><AppSwitch checked={Boolean(draft.useHtmlImages)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useHtmlImages: checked }))} aria-label="生成 HTML 图" /></div>
          {draft.useHtmlImages && <div className="generation-settings-row"><span><strong>HTML 配图上限</strong><small>每次生成最多使用的 HTML 图片张数；没有足够事实的小节不会凑数。</small></span><BufferedNumberInput type="number" min="0" max="30" step="1" aria-label="HTML 配图上限" value={draft.maxHtmlImages ?? 10} onChange={(event) => setDraft((current) => ({ ...current, maxHtmlImages: Math.max(0, Math.min(30, Math.round(Number(event.target.value) || 0))) }))} /></div>}
          <div className="generation-settings-row"><span><strong>生成技术图谱</strong><small>{technicalDiagramAvailable ? '适合架构、拓扑、数据流和复杂流程。' : '请先在设置 > 技能管理中启用 technical-diagram。'}</small></span><AppSwitch checked={draft.useTechnicalDiagrams} disabled={!technicalDiagramAvailable} onCheckedChange={(checked) => setDraft((current) => ({ ...current, useTechnicalDiagrams: checked }))} aria-label="生成技术图谱" /></div>
          <div className="generation-settings-subsection">
            <div className="generation-settings-section-head"><strong>本项目配图参数</strong><span>控制 AI 生图数量与表现形式。</span></div>
            <div className="generation-settings-row"><span><strong>AI 配图上限</strong><small>本次生成最多使用的 AI 图片张数。</small></span><BufferedNumberInput type="number" min="0" step="1" aria-label="AI 配图上限" value={draft.maxAiImages} disabled={!draft.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraft((current) => ({ ...current, maxAiImages: Math.max(0, Math.round(Number(event.target.value) || 0)) }))} /></div>
            <div className="generation-settings-row"><span><strong>AI 配图风格</strong><small>自动模式由生成流程选择。</small></span><select aria-label="AI 配图风格" value={draft.aiImageStyle || 'auto'} disabled={!draft.useAiImages || imageModelStatus !== 'available'} onChange={(event) => setDraft((current) => ({ ...current, aiImageStyle: event.target.value as ContentGenerationOptions['aiImageStyle'] }))}><option value="auto">自动</option><option value="engineering_diagram">工程示意图</option><option value="realistic_photo">真实照片</option><option value="product_shot">产品展示图</option><option value="architectural_render">建筑场地效果图</option><option value="3d_render">三维模型</option><option value="isometric_illustration">轴测插画</option><option value="cutaway_illustration">剖视插画</option><option value="exploded_view">爆炸分解图</option><option value="line_drawing">技术线稿</option><option value="flat_illustration">扁平插画</option></select></div>
          </div>
        </section>}

        {activeTab === 'writing' && <section className="generation-settings-section generation-settings-writing">
          <div className="generation-settings-section-head"><strong>资料缺失时怎么写</strong><span>正文会沿用此处选择的事实处理方式。</span></div>
          <div className="generation-settings-writing-options" role="radiogroup" aria-label="资料缺失时的事实处理">
            {([
              { value: 'infer', title: '合理推断', description: '根据已有材料与项目上下文推断。' },
              { value: 'generic', title: '笼统承诺', description: '不写缺少依据的具体人员、时间或参数。' },
              { value: 'placeholder', title: '标记待填写', description: '以【待填写】标出缺失事实，供人工补齐。' },
            ] as const).map((option) => <label key={option.value} className={(draft.missingFactPolicy || 'infer') === option.value ? 'is-selected' : ''}><input type="radio" name="modern-missing-fact-policy" value={option.value} checked={(draft.missingFactPolicy || 'infer') === option.value} onChange={() => setDraft((current) => ({ ...current, missingFactPolicy: option.value }))} /><strong>{option.title}</strong><span>{option.description}</span></label>)}
          </div>
          <div className="generation-settings-subsection">
            <div className="generation-settings-section-head"><strong>本项目正文参数</strong></div>
            <div className="generation-settings-row"><span><strong>全文一致性审计</strong><small>正文完成后检查与全局事实冲突的内容。</small></span><AppSwitch checked={draft.enableConsistencyAudit} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enableConsistencyAudit: checked }))} aria-label="全文一致性审计" /></div>
            <div className="generation-settings-row"><span><strong>正文并发数</strong><small>受所配置模型服务的速率限制影响。</small></span><BufferedNumberInput type="number" min="1" step="1" value={draft.contentConcurrency} onChange={(event) => setDraft((current) => ({ ...current, contentConcurrency: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} /></div>
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
