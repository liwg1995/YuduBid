import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import {
  buildOfficialDocumentDraftPrompt,
  officialDocumentTemplates,
  officialDocumentTypeNotes,
  officialDocumentTypes,
  type OfficialDocumentTemplate,
  type OfficialDocumentPromptInput,
  type OfficialDocumentType,
} from '../../../shared/prompts/officialDocument';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import {
  OfficialDocumentRevisionList,
  OfficialDocumentTaskStatus,
  OfficialDocumentTemplateGallery,
  OfficialDocumentTemplateShortcutList,
  OfficialDocumentWorkflowSteps,
} from '../components/OfficialDocumentPanels';
import type { OfficialDocumentState } from '../types';

const defaultInput: OfficialDocumentPromptInput = {
  documentType: '通知',
  scenario: '',
  issuer: '',
  recipient: '',
  audienceRelation: '下行',
  facts: '',
  tone: '庄重、平实、克制',
  length: '约 800 字',
  needTitle: true,
  needSignature: true,
  specialRequirements: '',
};

const workflowSteps = [
  { title: '识别场景', text: '先确认发文主体、主送对象、行文关系、用途和篇幅。' },
  { title: '匹配文种', text: '按通知、请示、报告、函、纪要等文种选择结构和结尾。' },
  { title: '抽取事实', text: '把对象、动作、数据、责任、时限和反馈路径落到正文。' },
  { title: '降 AI 味', text: '压缩空泛判断，替换套话，让每段都有明确功能。' },
];

const reviewItems = ['文种与行文关系是否一致', '是否编造法规、会议、数字或批复', '责任主体、时限和反馈路径是否清楚', '抽象判断是否有事实支撑'];
const checkDimensions = ['文种与行文关系', '标题、主送、正文、落款', '事实、数据、时限、责任主体', '套话、空话和 AI 痕迹'];
const checkIssueTypes = ['文种使用不当', '结构层级混乱', '事实支撑不足', '责任时限缺失', '表达过度泛化'];
const polishPrinciples = ['不新增事实', '保留原意和责任边界', '压缩空泛判断', '补足动作、对象和时限', '语言稳妥、克制、可执行'];
const rewriteExamples = ['压缩到 800 字以内', '改成请示口吻', '增强工作要求的可执行性', '降低 AI 味并保留小标题'];
const templateUseTips = ['先选文种和行文关系', '套用后补充真实事实材料', '删除不适用的占位项', '生成前检查责任、时限和反馈路径'];

const initialExportProgress = {
  running: false,
  progress: 0,
  message: '',
  error: '',
};
const SETTINGS_ACTIVE_TAB_KEY = 'yibiao-settings-active-tab';

export type OfficialDocumentInitialPanel = 'drafting' | 'check' | 'polish' | 'templates';

interface OfficialDocumentDraftingPageProps {
  initialPanel?: OfficialDocumentInitialPanel;
  onNavigate?: (section: SectionId) => void;
}

const panelHeroCopy: Record<OfficialDocumentInitialPanel, { kicker: string; title: string; description: string }> = {
  drafting: {
    kicker: '公文写作 · 智能起草',
    title: '把文种规则、事实要素和降 AI 味检查收拢到一张起草台',
    description: '面向通知、请示、报告、函等常见材料场景，辅助完成要素梳理、规范起草、草稿留存和 Word 导出。',
  },
  check: {
    kicker: '公文写作 · 格式检查',
    title: '围绕文种、结构、事实密度和表达痕迹做实务检查',
    description: '可对导入、生成或手工粘贴的草稿进行格式与内容审核，输出可执行的修改建议。',
  },
  polish: {
    kicker: '公文写作 · 润色改写',
    title: '在不新增事实的前提下降低 AI 味并优化公文表达',
    description: '支持降 AI 味润色、定向改写和历史版本留存，便于在同一份草稿上反复修订。',
  },
  templates: {
    kicker: '公文写作 · 模板库',
    title: '用常见公文场景快速填充起草要素',
    description: '内置通知、请示、报告、函和工作方案等模板，套用后仍可继续编辑事实材料。',
  },
};

function OfficialDocumentDraftingPage({ initialPanel = 'drafting', onNavigate }: OfficialDocumentDraftingPageProps) {
  const { showToast } = useToast();
  const [input, setInput] = useState<OfficialDocumentPromptInput>(defaultInput);
  const [state, setState] = useState<OfficialDocumentState | null>(null);
  const [draft, setDraft] = useState('');
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportProgress, setExportProgress] = useState(initialExportProgress);
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [missingTextModelFields, setMissingTextModelFields] = useState<string[]>([]);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [polishViewMode, setPolishViewMode] = useState<'edit' | 'preview'>('edit');
  const [previewTemplate, setPreviewTemplate] = useState<OfficialDocumentTemplate | null>(null);

  const promptPreview = useMemo(() => state?.prompt || buildOfficialDocumentDraftPrompt(input), [input, state?.prompt]);
  const selectedTypeNote = officialDocumentTypeNotes[input.documentType];
  const task = state?.task;
  const isRunning = task?.status === 'running';
  const revisions = state?.revisions || [];
  const heroCopy = panelHeroCopy[initialPanel];

  useEffect(() => {
    let mounted = true;
    const bridge = window.yibiao?.officialDocument;
    if (!bridge) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    bridge.loadState()
      .then((nextState) => {
        if (!mounted) return;
        setState(nextState);
        setInput({ ...defaultInput, ...nextState.input });
        setDraft(nextState.draft || '');
        setReview(nextState.review || '');
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取公文写作状态失败', 'error'))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = bridge.onEvent((nextState) => {
      setState(nextState);
      setInput({ ...defaultInput, ...nextState.input });
      setDraft(nextState.draft || '');
      setReview(nextState.review || '');
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [showToast]);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.config.load()
      .then((config) => {
        if (!mounted || !config) return;
        const missing = [
          !String(config.api_key || '').trim() ? 'API Key' : '',
          !String(config.base_url || '').trim() ? 'Base URL' : '',
          !String(config.model_name || '').trim() ? '模型名称' : '',
        ].filter(Boolean);
        setMissingTextModelFields(missing);
      })
      .catch(() => {
        if (mounted) setMissingTextModelFields([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function updateInput<K extends keyof OfficialDocumentPromptInput>(key: K, value: OfficialDocumentPromptInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setState((current) => current ? { ...current, prompt: '' } : current);
  }

  async function applyTemplate(template: OfficialDocumentTemplate, navigateToDrafting = false) {
    const nextInput: OfficialDocumentPromptInput = {
      ...input,
      ...template.input,
      documentType: template.documentType,
      audienceRelation: template.audienceRelation,
      needTitle: true,
      needSignature: true,
    };

    setInput(nextInput);
    setState((current) => current ? { ...current, prompt: '' } : current);

    if (!window.yibiao?.officialDocument) {
      showToast(`已套用${template.name}模板`, 'success');
      if (navigateToDrafting) onNavigate?.('official-document-drafting');
      return;
    }

    try {
      setSaving(true);
      const nextState = await window.yibiao.officialDocument.saveInput(nextInput);
      setState(nextState);
      setInput({ ...defaultInput, ...nextState.input });
      showToast(`已套用并保存${template.name}模板`, 'success');
      if (navigateToDrafting) onNavigate?.('official-document-drafting');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '套用模板失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptPreview);
      showToast('公文起草提示词已复制', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      showToast('公文草稿已复制', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  }

  async function saveInput() {
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中保存。', 'info');
      return;
    }
    try {
      setSaving(true);
      const nextState = await window.yibiao?.officialDocument.saveInput(input);
      if (nextState) {
        setState(nextState);
        setInput({ ...defaultInput, ...nextState.input });
      }
      showToast('起草要素已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中保存。', 'info');
      return;
    }
    try {
      setSaving(true);
      const nextState = await window.yibiao?.officialDocument.saveDraft(draft);
      if (nextState) setState(nextState);
      setReview(nextState?.review || review);
      showToast('公文草稿已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存草稿失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveRevision() {
    if (!draft.trim()) {
      showToast('请先填写公文草稿。', 'info');
      return;
    }
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中保存版本。', 'info');
      return;
    }
    try {
      setSaving(true);
      const nextState = await window.yibiao.officialDocument.saveRevision({ input, content: draft });
      setState(nextState);
      setDraft(nextState.draft || '');
      setReview(nextState.review || '');
      showToast('当前草稿已保存为历史版本', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存版本失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function importDraft() {
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中导入。', 'info');
      return;
    }
    try {
      const result = await window.yibiao.officialDocument.importDraft();
      if (!result.success) {
        showToast(result.message || '已取消导入', 'info');
        return;
      }
      setState(result.state);
      setInput({ ...defaultInput, ...result.state.input });
      setDraft(result.state.draft || '');
      setReview(result.state.review || '');
      showToast(result.message || '草稿已导入', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入草稿失败', 'error');
    }
  }

  async function extractInputFromDraft() {
    if (!draft.trim()) {
      showToast('请先导入、生成或填写公文草稿。', 'info');
      return;
    }
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中提取。', 'info');
      return;
    }
    try {
      const nextState = await window.yibiao.officialDocument.extractInput({ input, draft });
      setState(nextState);
      setInput({ ...defaultInput, ...nextState.input });
      setDraft(nextState.draft || '');
      setReview(nextState.review || '');
      showToast('已从草稿提取起草要素', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '提取要素失败', 'error');
    }
  }

  async function restoreRevision(content: string) {
    setDraft(content);
    if (!window.yibiao?.officialDocument) {
      showToast('已恢复到编辑区', 'success');
      return;
    }
    try {
      const nextState = await window.yibiao.officialDocument.saveDraft(content);
      setState(nextState);
      setDraft(nextState.draft || content);
      showToast('已恢复该历史版本', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '恢复版本失败', 'error');
    }
  }

  async function generateDraft() {
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中生成。', 'info');
      return;
    }
    if (!input.facts.trim()) {
      showToast('请先补充材料要点，至少写清背景、事项或任务。', 'info');
      return;
    }
    try {
      const nextState = await window.yibiao?.officialDocument.generateDraft({ input });
      if (nextState) {
        setState(nextState);
        setDraft(nextState.draft || '');
        setReview(nextState.review || '');
      }
      showToast('公文草稿已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成失败', 'error');
    }
  }

  async function resetForm() {
    if (!window.yibiao?.officialDocument) {
      setState(null);
      setInput(defaultInput);
      setDraft('');
      setReview('');
      showToast('已恢复默认起草要素', 'info');
      return;
    }
    try {
      const nextState = await window.yibiao?.officialDocument.clear();
      setState(nextState?.state || null);
      setInput(defaultInput);
      setDraft('');
      setReview('');
      showToast('已清空公文写作工作区', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败', 'error');
    }
  }

  async function exportWord() {
    if (!draft.trim()) {
      showToast('请先生成或填写公文草稿。', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前浏览器预览环境未连接客户端导出能力，请在 Electron 客户端中导出。', 'info');
      return;
    }

    const requestId = `official-document-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;
    const title = getOfficialDocumentTitle(draft, input);

    try {
      setExportProgress({
        running: true,
        progress: 2,
        message: '正在准备导出 Word。',
        error: '',
      });

      unsubscribe = window.yibiao.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportProgress({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          error: event.phase === 'error' ? event.message : '',
        });
      });

      const result = await window.yibiao.export.exportWord({
        requestId,
        document_profile: 'official-document',
        project_name: title,
        outline: [{
          id: 'official-document-draft',
          title,
          description: '',
          hideTitle: true,
          content: toOfficialDocumentMarkdown(draft),
        }],
      });

      if (result.canceled) {
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }

      setExportProgress({
        running: false,
        progress: 100,
        message: result.message || 'Word 已导出，请打开文档核对版式。',
        error: '',
      });
      showToast(result.message || 'Word 已导出', result.warnings?.length ? 'info' : 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      setExportProgress({
        running: false,
        progress: 100,
        message,
        error: message,
      });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function checkDraft() {
    if (!draft.trim()) {
      showToast('请先生成或填写公文草稿。', 'info');
      return;
    }
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中检查。', 'info');
      return;
    }

    try {
      const nextState = await window.yibiao.officialDocument.checkDraft({ input, draft });
      setState(nextState);
      setDraft(nextState.draft || '');
      setReview(nextState.review || '');
      showToast('格式检查已完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '格式检查失败', 'error');
    }
  }

  async function polishDraft() {
    if (!draft.trim()) {
      showToast('请先生成或填写公文草稿。', 'info');
      return;
    }
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中润色。', 'info');
      return;
    }

    try {
      const nextState = await window.yibiao.officialDocument.polishDraft({ input, draft });
      setState(nextState);
      setDraft(nextState.draft || '');
      setReview(nextState.review || '');
      showToast('降 AI 味润色已完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '润色失败', 'error');
    }
  }

  async function rewriteDraft() {
    if (!draft.trim()) {
      showToast('请先生成或填写公文草稿。', 'info');
      return;
    }
    if (!rewriteInstruction.trim()) {
      showToast('请先填写改写要求。', 'info');
      return;
    }
    if (!window.yibiao?.officialDocument) {
      showToast('当前浏览器预览环境未连接客户端桥接层，请在 Electron 客户端中改写。', 'info');
      return;
    }

    try {
      const nextState = await window.yibiao.officialDocument.rewriteDraft({
        input,
        draft,
        instruction: rewriteInstruction,
      });
      setState(nextState);
      setDraft(nextState.draft || '');
      setReview(nextState.review || '');
      showToast('定向改写已完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '改写失败', 'error');
    }
  }

  async function copyReview() {
    try {
      await navigator.clipboard.writeText(review);
      showToast('检查结果已复制', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  }

  function openTextModelSettings() {
    window.localStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, 'text-model');
    onNavigate?.('settings');
  }

  function renderNextStepGuide() {
    if (isRunning || task?.status !== 'success') return null;

    if (initialPanel === 'drafting' && task.type === 'draft' && draft.trim()) {
      return (
        <div className="official-document-next-step">
          <div>
            <strong>草稿已生成</strong>
            <span>建议继续进行格式检查，核对文种、结构、事实密度和 AI 味问题。</span>
          </div>
          <button type="button" className="primary-action" onClick={() => onNavigate?.('official-document-check')}>去格式检查</button>
        </div>
      );
    }

    if (initialPanel === 'check' && task.type === 'check' && review.trim()) {
      return (
        <div className="official-document-next-step">
          <div>
            <strong>检查已完成</strong>
            <span>可根据检查意见进入润色改写，进一步压缩空泛表达并优化公文语气。</span>
          </div>
          <button type="button" className="primary-action" onClick={() => onNavigate?.('official-document-polish')}>去润色改写</button>
        </div>
      );
    }

    if (initialPanel === 'polish' && (task.type === 'polish' || task.type === 'rewrite') && draft.trim()) {
      return (
        <div className="official-document-next-step">
          <div>
            <strong>草稿已更新</strong>
            <span>建议保存版本后导出 Word，或继续填写定向改写要求做最后调整。</span>
          </div>
          <button type="button" className="primary-action" onClick={() => void exportWord()} disabled={exportProgress.running}>导出 Word</button>
        </div>
      );
    }

    return null;
  }

  function renderDocumentTypeReference() {
    return (
      <section className="official-document-panel">
        <div className="official-document-panel-head">
          <div>
            <span className="section-kicker">文种提示</span>
            <h3>{input.documentType}</h3>
          </div>
        </div>
        <p className="official-document-note">{selectedTypeNote}</p>
      </section>
    );
  }

  function renderOutlineReference(title = getActiveTemplate(input.documentType)?.name || input.documentType) {
    return (
      <section className="official-document-panel">
        <div className="official-document-panel-head">
          <div>
            <span className="section-kicker">结构参考</span>
            <h3>{title}</h3>
          </div>
        </div>
        <ol className="official-document-outline-list">
          {(getActiveTemplate(input.documentType)?.outline || ['标题', '主送机关', '正文', '落款', '日期']).map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>
    );
  }

  function renderCheckList(title = '输出前必须核对') {
    return (
      <section className="official-document-panel">
        <div className="official-document-panel-head">
          <div>
            <span className="section-kicker">终检清单</span>
            <h3>{title}</h3>
          </div>
        </div>
        <ul className="official-document-check-list">
          {reviewItems.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    );
  }

  function renderSideList(kicker: string, title: string, items: string[]) {
    return (
      <section className="official-document-panel">
        <div className="official-document-panel-head">
          <div>
            <span className="section-kicker">{kicker}</span>
            <h3>{title}</h3>
          </div>
        </div>
        <ul className="official-document-check-list">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    );
  }

  function renderPersistentSideContent() {
    if (initialPanel !== 'drafting') return null;
    return (
      <section className="official-document-panel">
        <div className="official-document-panel-head">
          <div>
            <span className="section-kicker">常用模板</span>
            <h3>一键套用起草要素</h3>
          </div>
        </div>
        <OfficialDocumentTemplateShortcutList
          templates={officialDocumentTemplates}
          disabled={saving || isRunning}
          onApply={(template) => applyTemplate(template)}
        />
      </section>
    );
  }

  function renderReminderContent() {
    if (initialPanel === 'drafting') {
      return (
        <>
          {renderDocumentTypeReference()}
          {renderOutlineReference()}
          <section className="official-document-panel">
            <div className="official-document-panel-head">
              <div>
                <span className="section-kicker">生成流程</span>
                <h3>Skill 工作流映射</h3>
              </div>
            </div>
            <OfficialDocumentWorkflowSteps steps={workflowSteps} />
          </section>
          {renderCheckList()}
        </>
      );
    }

    if (initialPanel === 'check') {
      return (
        <>
          {renderSideList('检查维度', '重点核对这些问题', checkDimensions)}
          {renderSideList('问题类型', '常见风险提示', checkIssueTypes)}
          {renderCheckList('检查完成前再确认')}
        </>
      );
    }

    if (initialPanel === 'polish') {
      return (
        <>
          {renderSideList('润色原则', '改表达，不改事实', polishPrinciples)}
          {renderSideList('改写示例', '可直接填写的要求', rewriteExamples)}
          <section className="official-document-panel">
            <div className="official-document-panel-head">
              <div>
                <span className="section-kicker">历史版本</span>
                <h3>保留关键修改节点</h3>
              </div>
            </div>
            <p className="official-document-note">点击“保存版本”后会保留当前草稿，便于在润色、改写和导出前后对照恢复。</p>
          </section>
        </>
      );
    }

    return (
      <>
        {renderSideList('模板使用', '套用前先确认', templateUseTips)}
        {renderDocumentTypeReference()}
        {renderOutlineReference('当前文种结构')}
      </>
    );
  }

  function getReminderTitle() {
    if (initialPanel === 'drafting') return '智能起草提醒';
    if (initialPanel === 'check') return '格式检查提醒';
    if (initialPanel === 'polish') return '润色改写提醒';
    return '公文写作提醒';
  }

  function getReminderLinkText() {
    if (initialPanel === 'drafting') return '关于智能起草的提醒事项';
    if (initialPanel === 'check') return '关于格式检查的提醒事项';
    if (initialPanel === 'polish') return '关于润色改写的提醒事项';
    return '关于公文写作的提醒事项';
  }

  if (loading) {
    return <div className="official-document-page"><div className="official-document-empty">正在读取公文写作状态...</div></div>;
  }

  return (
    <div className="official-document-page">
      <section className="official-document-header">
        <div>
          <span className="section-kicker">{heroCopy.kicker}</span>
          <h2>{heroCopy.title}</h2>
          <p>{heroCopy.description}</p>
          {initialPanel !== 'templates' && (
            <button type="button" className="official-document-reminder-link" onClick={() => setReminderOpen(true)}>
              {getReminderLinkText()}
            </button>
          )}
        </div>
        <div className="official-document-actions">
          {initialPanel !== 'templates' && (
            <button type="button" className="secondary-action" onClick={() => void importDraft()} disabled={isRunning}>导入草稿</button>
          )}
          {initialPanel === 'drafting' && (
            <>
              <button type="button" className="secondary-action" onClick={() => void saveInput()} disabled={saving || isRunning}>保存要素</button>
              <button type="button" className="primary-action" onClick={() => void copyPrompt()}>复制提示词</button>
            </>
          )}
          {initialPanel === 'check' && (
            <button type="button" className="primary-action" onClick={() => void checkDraft()} disabled={!draft || isRunning}>开始检查</button>
          )}
          {initialPanel === 'polish' && (
            <button type="button" className="primary-action" onClick={() => void polishDraft()} disabled={!draft || isRunning}>降 AI 味润色</button>
          )}
          {initialPanel !== 'templates' && (
            <button type="button" className="secondary-action" onClick={() => void resetForm()} disabled={isRunning}>清空</button>
          )}
        </div>
      </section>

      {missingTextModelFields.length > 0 && (
        <div className="official-document-config-notice">
          <div>
            <strong>文本模型尚未配置完整</strong>
            <span>缺少 {missingTextModelFields.join('、')}，生成、检查、润色和改写前请先完成配置。</span>
          </div>
          <button type="button" className="secondary-action" onClick={openTextModelSettings}>去配置文本模型</button>
        </div>
      )}

      {renderNextStepGuide()}

      <div className={`official-document-layout ${initialPanel === 'templates' ? 'is-templates' : ''} ${initialPanel === 'check' || initialPanel === 'polish' ? 'is-main-only' : ''}`}>
        <main className="official-document-main">
          {initialPanel === 'drafting' && (
            <>
              <section className="official-document-panel">
                <div className="official-document-panel-head">
                  <div>
                    <span className="section-kicker">起草要素</span>
                    <h3>按公文场景补齐必要信息</h3>
                  </div>
                  <span className="official-document-pill">Prompt 预集成</span>
                </div>

                <div className="official-document-form-grid">
                  <label className="official-document-field">
                    <span>文种</span>
                    <select value={input.documentType} onChange={(event) => updateInput('documentType', event.target.value as OfficialDocumentType)}>
                      {officialDocumentTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="official-document-field">
                    <span>行文关系</span>
                    <select value={input.audienceRelation} onChange={(event) => updateInput('audienceRelation', event.target.value)}>
                      <option value="上行">上行</option>
                      <option value="下行">下行</option>
                      <option value="平行">平行</option>
                      <option value="面向公众">面向公众</option>
                    </select>
                  </label>
                  <label className="official-document-field">
                    <span>发文/讲话主体</span>
                    <input value={input.issuer} placeholder="例如：XX市住房和城乡建设局" onChange={(event) => updateInput('issuer', event.target.value)} />
                  </label>
                  <label className="official-document-field">
                    <span>面向对象/主送机关</span>
                    <input value={input.recipient} placeholder="例如：各县区住建局、局属各单位" onChange={(event) => updateInput('recipient', event.target.value)} />
                  </label>
                  <label className="official-document-field">
                    <span>使用场景</span>
                    <input value={input.scenario} placeholder="例如：部署安全生产专项排查" onChange={(event) => updateInput('scenario', event.target.value)} />
                  </label>
                  <label className="official-document-field">
                    <span>篇幅要求</span>
                    <input value={input.length} placeholder="例如：约 800 字 / 1500 字以内" onChange={(event) => updateInput('length', event.target.value)} />
                  </label>
                  <label className="official-document-field is-wide">
                    <span>材料要点</span>
                    <textarea value={input.facts} placeholder="粘贴背景、问题、数据、任务、责任单位、截止时间、政策依据等事实材料。" onChange={(event) => updateInput('facts', event.target.value)} />
                  </label>
                  <label className="official-document-field">
                    <span>希望语气</span>
                    <input value={input.tone} placeholder="例如：庄重、平实、克制" onChange={(event) => updateInput('tone', event.target.value)} />
                  </label>
                  <label className="official-document-field">
                    <span>特殊要求</span>
                    <input value={input.specialRequirements} placeholder="例如：降低 AI 味、保留小标题、附检查意见" onChange={(event) => updateInput('specialRequirements', event.target.value)} />
                  </label>
                </div>

                <OfficialDocumentTaskStatus task={task} />

                <div className="official-document-option-row">
                  <label>
                    <input type="checkbox" checked={input.needTitle} onChange={(event) => updateInput('needTitle', event.target.checked)} />
                    <span>需要标题</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={input.needSignature} onChange={(event) => updateInput('needSignature', event.target.checked)} />
                    <span>需要落款</span>
                  </label>
                </div>

                <div className="official-document-generate-row">
                  <button type="button" className="primary-action" onClick={() => void generateDraft()} disabled={isRunning}>
                    {isRunning && task?.type === 'draft' ? '生成中...' : '生成公文草稿'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => void extractInputFromDraft()} disabled={!draft || isRunning}>
                    从草稿提取要素
                  </button>
                  <span>生成会调用当前文本模型配置，结果保存在本机工作区。</span>
                </div>
              </section>

              <section className="official-document-panel">
                <div className="official-document-panel-head">
                  <div>
                    <span className="section-kicker">提示词预览</span>
                    <h3>已内置文种判定、格式规范和终检清单</h3>
                  </div>
                </div>
                <pre className="official-document-prompt-preview">{promptPreview}</pre>
              </section>
            </>
          )}

          {initialPanel === 'check' && (
            <>
              <section className="official-document-panel">
                <div className="official-document-panel-head">
                  <div>
                    <span className="section-kicker">待检查草稿</span>
                    <h3>导入、粘贴或使用已生成的公文草稿</h3>
                    {state?.importedFileName && <p className="official-document-source-name">来源：{state.importedFileName}</p>}
                  </div>
                  <div className="official-document-draft-actions">
                    <button type="button" className="secondary-action" onClick={() => void copyDraft()} disabled={!draft}>复制正文</button>
                    <button type="button" className="primary-action" onClick={() => void checkDraft()} disabled={!draft || isRunning}>格式检查</button>
                  </div>
                </div>
                <OfficialDocumentTaskStatus task={task} />
                {draft.trim() ? (
                  <div className="markdown-viewer official-document-draft-preview is-readonly">
                    <MarkdownRenderer allowRawHtml={false}>{draft}</MarkdownRenderer>
                  </div>
                ) : (
                  <div className="official-document-review-empty">可通过顶部“导入草稿”，或先在智能起草中生成草稿后再进入格式检查。</div>
                )}
              </section>

              <section className="official-document-panel">
                <div className="official-document-panel-head">
                  <div>
                    <span className="section-kicker">检查结果</span>
                    <h3>文种、结构和降 AI 味问题</h3>
                  </div>
                  <button type="button" className="secondary-action" onClick={() => void copyReview()} disabled={!review}>复制检查结果</button>
                </div>
                {review.trim() ? (
                  <div className="markdown-viewer official-document-draft-preview">
                    <MarkdownRenderer allowRawHtml={false}>{review}</MarkdownRenderer>
                  </div>
                ) : (
                  <div className="official-document-review-empty">点击“格式检查”后，会在这里显示文种匹配、格式问题、事实密度和润色建议。</div>
                )}
              </section>
            </>
          )}

          {initialPanel === 'polish' && (
            <>
              <section className="official-document-panel">
                <div className="official-document-panel-head">
                  <div>
                    <span className="section-kicker">草稿正文</span>
                    <h3>润色、改写和导出</h3>
                    {state?.importedFileName && <p className="official-document-source-name">来源：{state.importedFileName}</p>}
                  </div>
                  <div className="official-document-draft-actions">
                    <button type="button" className="secondary-action" onClick={() => void copyDraft()} disabled={!draft}>复制正文</button>
                    <button type="button" className="secondary-action" onClick={() => void saveDraft()} disabled={saving || isRunning}>保存草稿</button>
                    <button type="button" className="secondary-action" onClick={() => void saveRevision()} disabled={!draft || saving || isRunning}>保存版本</button>
                    <button type="button" className="secondary-action" onClick={() => void polishDraft()} disabled={!draft || isRunning}>降 AI 味润色</button>
                    <button type="button" className="primary-action" onClick={() => void exportWord()} disabled={!draft || isRunning || exportProgress.running}>导出 Word</button>
                  </div>
                </div>
                <OfficialDocumentTaskStatus task={task} />
                {exportProgress.message && (
                  <div className={`official-document-export-status ${exportProgress.error ? 'is-error' : exportProgress.running ? 'is-running' : 'is-success'}`}>
                    <div>
                      <strong>{exportProgress.error ? '导出失败' : exportProgress.running ? '导出中' : '导出完成'}</strong>
                      <span>{exportProgress.message}</span>
                    </div>
                    <em>{exportProgress.progress}%</em>
                  </div>
                )}
                <div className="official-document-rewrite-box">
                  <textarea
                    value={rewriteInstruction}
                    placeholder="输入临时改写要求，例如：压缩到800字；改成请示口吻；补充报送时限和联系人；把语气写得更稳妥。"
                    onChange={(event) => setRewriteInstruction(event.target.value)}
                  />
                  <button type="button" className="secondary-action" onClick={() => void rewriteDraft()} disabled={!draft || !rewriteInstruction.trim() || isRunning}>
                    按要求改写
                  </button>
                </div>
                <div className="official-document-draft-mode" aria-label="草稿查看方式">
                  <button type="button" className={polishViewMode === 'edit' ? 'is-active' : ''} onClick={() => setPolishViewMode('edit')}>编辑</button>
                  <button type="button" className={polishViewMode === 'preview' ? 'is-active' : ''} onClick={() => setPolishViewMode('preview')}>预览</button>
                </div>
                {polishViewMode === 'edit' ? (
                  <MarkdownEditor
                    className="official-document-markdown-editor"
                    value={draft}
                    placeholder="在这里编辑需要润色、改写或导出的公文草稿。"
                    disabled={isRunning}
                    onChange={setDraft}
                  />
                ) : (
                  <div className="markdown-viewer official-document-draft-preview">
                    <MarkdownRenderer allowRawHtml={false}>{draft || '草稿内容为空'}</MarkdownRenderer>
                  </div>
                )}
              </section>

              <section className="official-document-panel">
                <div className="official-document-panel-head">
                  <div>
                    <span className="section-kicker">历史版本</span>
                    <h3>最近 10 个草稿版本</h3>
                  </div>
                </div>
                <OfficialDocumentRevisionList revisions={revisions} onRestore={restoreRevision} />
              </section>
            </>
          )}

          {initialPanel === 'templates' && (
            <section className="official-document-panel">
              <div className="official-document-panel-head">
                <div>
                  <span className="section-kicker">模板库</span>
                  <h3>常用公文场景模板</h3>
                </div>
                <span className="official-document-pill">{officialDocumentTemplates.length} 个模板</span>
              </div>
              <OfficialDocumentTemplateGallery
                templates={officialDocumentTemplates}
                actionLabel="套用并起草"
                disabled={saving || isRunning}
                onPreview={setPreviewTemplate}
                onApply={(template) => applyTemplate(template, true)}
              />
            </section>
          )}
        </main>

        {initialPanel === 'drafting' && (
          <aside className="official-document-side">
            {renderPersistentSideContent()}
          </aside>
        )}
      </div>

      <Dialog.Root open={reminderOpen} onOpenChange={setReminderOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="official-document-reminder-card">
            <div className="official-document-reminder-head">
              <div>
                <span className="section-kicker">按需查看</span>
                <Dialog.Title>{getReminderTitle()}</Dialog.Title>
                <Dialog.Description>这些内容只作为写作和检查时的参考，不会占用主工作区。</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="secondary-action">关闭</button>
              </Dialog.Close>
            </div>
            <div className="official-document-reminder-body">
              {renderReminderContent()}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="official-document-template-preview-card">
            <div className="official-document-reminder-head">
              <div>
                <span className="section-kicker">模板预览</span>
                <Dialog.Title>{previewTemplate?.name || '模板详情'}</Dialog.Title>
                <Dialog.Description>{previewTemplate?.description || '查看模板的起草要素和结构。'}</Dialog.Description>
              </div>
              <div className="official-document-template-preview-actions">
                {previewTemplate && (
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => {
                      applyTemplate(previewTemplate, true);
                      setPreviewTemplate(null);
                    }}
                    disabled={saving || isRunning}
                  >
                    套用并起草
                  </button>
                )}
                <Dialog.Close asChild>
                  <button type="button" className="secondary-action">关闭</button>
                </Dialog.Close>
              </div>
            </div>
            {previewTemplate && (
              <div className="official-document-template-preview-body">
                {renderTemplatePreview(previewTemplate)}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function renderTemplatePreview(template: OfficialDocumentTemplate) {
  const input = template.input;
  const fields = [
    ['文种', template.documentType],
    ['行文关系', template.audienceRelation],
    ['使用场景', input.scenario],
    ['篇幅要求', input.length],
    ['希望语气', input.tone],
    ['特殊要求', input.specialRequirements],
  ].filter(([, value]) => String(value || '').trim());

  return (
    <>
      <section className="official-document-template-preview-section">
        <span className="section-kicker">起草要素</span>
        <div className="official-document-template-preview-grid">
          {fields.map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="official-document-template-preview-section">
        <span className="section-kicker">材料要点</span>
        <pre>{input.facts || '暂无材料要点'}</pre>
      </section>

      <section className="official-document-template-preview-section">
        <span className="section-kicker">结构步骤</span>
        <ol className="official-document-outline-list">
          {template.outline.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>
    </>
  );
}

function getActiveTemplate(documentType: OfficialDocumentType) {
  return officialDocumentTemplates.find((template) => template.documentType === documentType);
}

function getOfficialDocumentTitle(draft: string, input: OfficialDocumentPromptInput) {
  const firstLine = draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.endsWith('：') && !line.endsWith(':'));
  if (firstLine && firstLine.length <= 80) {
    return firstLine.replace(/^#+\s*/, '');
  }
  const matter = input.scenario || input.documentType;
  return `${input.issuer || '公文'}关于${matter}的${input.documentType}`;
}

function toOfficialDocumentMarkdown(draft: string) {
  const lines = draft.replace(/\r\n/g, '\n').split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex < 0) return draft;

  const firstLine = lines[firstContentIndex].trim();
  if (firstLine.startsWith('#')) return draft;
  if (firstLine.endsWith('：') || firstLine.endsWith(':') || firstLine.length > 80) return draft;

  const nextLines = [...lines];
  nextLines[firstContentIndex] = `# ${firstLine}`;
  return nextLines.join('\n');
}

export default OfficialDocumentDraftingPage;
