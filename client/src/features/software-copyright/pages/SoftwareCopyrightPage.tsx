import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightCodeManifest, SoftwareCopyrightDraftFile, SoftwareCopyrightDraftValidationResult, SoftwareCopyrightFields, SoftwareCopyrightOptions, SoftwareCopyrightState } from '../types';

const emptyFields: SoftwareCopyrightFields = {
  softwareName: '',
  shortName: '',
  version: 'V1.0',
  category: '应用软件',
  developmentCompletedDate: '',
  developmentMode: '单独开发',
  softwareDescription: '原创',
  publishStatus: '未发表',
  firstPublishDate: '',
  copyrightOwner: '',
  rightsScope: '全部权利',
  rightsAcquisition: '原始取得',
  developmentHardware: '',
  runningHardware: '',
  developmentOs: '',
  developmentTools: '',
  runningPlatform: '',
  runtimeSupport: '',
  programmingLanguage: '',
  sourceLineCount: '',
  developmentPurpose: '',
  industry: '',
  mainFunctions: '',
  technicalFeatures: '',
  pageCount: '',
};

const requiredFields: Array<keyof SoftwareCopyrightFields> = [
  'softwareName',
  'version',
  'developmentCompletedDate',
  'copyrightOwner',
  'developmentHardware',
  'runningHardware',
  'developmentOs',
  'developmentTools',
  'runningPlatform',
  'runtimeSupport',
  'programmingLanguage',
  'developmentPurpose',
  'industry',
];

const basicFieldRows: Array<{ key: keyof SoftwareCopyrightFields; label: string; placeholder?: string }> = [
  { key: 'softwareName', label: '软件全称', placeholder: '例如：禹都AI投标助手软件' },
  { key: 'shortName', label: '软件简称', placeholder: '可选' },
  { key: 'version', label: '版本号', placeholder: 'V1.0' },
  { key: 'category', label: '软件分类', placeholder: '应用软件' },
  { key: 'developmentCompletedDate', label: '开发完成日期', placeholder: 'YYYY-MM-DD' },
  { key: 'developmentMode', label: '开发方式', placeholder: '单独开发' },
  { key: 'softwareDescription', label: '软件说明', placeholder: '原创' },
  { key: 'publishStatus', label: '发表状态', placeholder: '未发表' },
  { key: 'firstPublishDate', label: '首次发表日期', placeholder: '未发表可留空' },
  { key: 'copyrightOwner', label: '著作权人', placeholder: '国家/省市/类型/姓名或单位/证件信息' },
];

const environmentFieldRows: Array<{ key: keyof SoftwareCopyrightFields; label: string; placeholder?: string }> = [
  { key: 'developmentHardware', label: '开发硬件环境', placeholder: '≤50字符，例如 Intel i7/16GB/512GB' },
  { key: 'runningHardware', label: '运行硬件环境', placeholder: '≤50字符，可沿用开发硬件' },
  { key: 'developmentOs', label: '开发操作系统', placeholder: '例如 Windows 11 / macOS 15' },
  { key: 'developmentTools', label: '开发环境 / 工具', placeholder: '开发环境: Windows 11/开发工具: VS Code' },
  { key: 'runningPlatform', label: '运行平台 / 操作系统', placeholder: '例如 Windows 10 及以上' },
  { key: 'runtimeSupport', label: '运行支撑环境', placeholder: '例如 Electron、Node.js、Chromium' },
  { key: 'programmingLanguage', label: '编程语言', placeholder: 'TypeScript、JavaScript' },
  { key: 'sourceLineCount', label: '源程序量', placeholder: '纯数字' },
  { key: 'developmentPurpose', label: '开发目的', placeholder: '≤50字符' },
  { key: 'industry', label: '面向领域 / 行业', placeholder: '≤50字符' },
];

const defaultExportItems: SoftwareCopyrightOptions['exportItems'] = {
  application: true,
  manual: true,
  code: true,
  report: true,
};

const defaultOptions: SoftwareCopyrightOptions = {
  sourceMode: 'project',
  screenshotMode: 'skip',
  useAiImages: false,
  codeExcludedPaths: [],
  codeIncludedPaths: [],
  exportItems: defaultExportItems,
};

const exportItemRows: Array<{ key: keyof SoftwareCopyrightOptions['exportItems']; label: string }> = [
  { key: 'application', label: '申请表 TXT' },
  { key: 'manual', label: '操作手册 DOCX' },
  { key: 'code', label: '代码材料 DOCX' },
  { key: 'report', label: '生成报告' },
];

function summarizeStatItems(items: string[] | undefined, limit = 4) {
  const values = (items || []).filter(Boolean);
  if (!values.length) {
    return { text: '未识别', title: '未识别' };
  }
  const visible = values.slice(0, limit);
  return {
    text: values.length > limit ? `${visible.join('、')} 等 ${values.length} 项` : visible.join('、'),
    title: values.join('、'),
  };
}

function getCodeMaterialRiskTips(manifest: SoftwareCopyrightCodeManifest | null, includedPaths: string[], excludedPaths: string[]) {
  if (!manifest) return [];
  const tips: string[] = [];
  const totalPages = Number(manifest.total_pages || 0);
  const fileCount = manifest.files?.length || 0;
  const categoryCount = Object.keys(manifest.category_summary || {}).length;
  const manifestIncluded = manifest.included_paths || [];
  const manifestExcluded = manifest.excluded_paths || [];
  const hasPendingInclude = includedPaths.some((filePath) => !manifestIncluded.includes(filePath));
  const hasPendingExclude = excludedPaths.some((filePath) => !manifestExcluded.includes(filePath));

  if (totalPages < 60) {
    tips.push('当前不足 60 页，将导出全部代码材料；如当地要求前后各 30 页，可补充更多核心源码后重新抽取。');
  } else if (totalPages > 120) {
    tips.push('当前页数较多，前 30 页和后 30 页之间会跳过较大段源码，建议排除低代表性文件或补充更核心文件后重新抽取。');
  } else if (totalPages > 90) {
    tips.push('当前页数偏多，请重点核对前 30 页和后 30 页是否覆盖主要功能入口、页面和业务服务。');
  }

  if (fileCount > 0 && fileCount < 5) {
    tips.push('当前源码文件数量较少，建议确认是否已经覆盖入口、页面、业务服务和数据处理等关键模块。');
  }
  if (categoryCount > 0 && categoryCount < 3) {
    tips.push('当前文件类别覆盖较窄，可考虑补充页面、服务、状态数据或通用能力文件。');
  }
  if (hasPendingInclude || hasPendingExclude) {
    tips.push('补充或排除列表已有变更，请点击“重新抽取”后再确认草稿。');
  }
  return tips;
}

function SoftwareCopyrightPage() {
  const { showToast } = useToast();
  const [state, setState] = useState<SoftwareCopyrightState | null>(null);
  const [fields, setFields] = useState<SoftwareCopyrightFields>(emptyFields);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeDraftKey, setActiveDraftKey] = useState<string>('');
  const [draftFile, setDraftFile] = useState<SoftwareCopyrightDraftFile | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftViewMode, setDraftViewMode] = useState<'edit' | 'preview'>('edit');
  const [validation, setValidation] = useState<SoftwareCopyrightDraftValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [codeManifest, setCodeManifest] = useState<SoftwareCopyrightCodeManifest | null>(null);
  const [codeManifestLoading, setCodeManifestLoading] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [complianceNoticeOpen, setComplianceNoticeOpen] = useState(false);
  const [codeCandidateKeyword, setCodeCandidateKeyword] = useState('');

  const task = state?.task;
  const isRunning = task?.status === 'running';
  const missingFields = useMemo(
    () => requiredFields.filter((key) => !String(fields[key] || '').trim()),
    [fields],
  );
  const sourceMode = state?.options.sourceMode || 'project';
  const codeExcludedPaths = state?.options.codeExcludedPaths || [];
  const codeIncludedPaths = state?.options.codeIncludedPaths || [];
  const hasSource = sourceMode === 'code-generation' ? Boolean(state?.codeGeneration?.available) : Boolean(state?.project);
  const canGenerateDraft = Boolean(hasSource && fields.softwareName.trim() && fields.version.trim() && !isRunning);
  const hasDrafts = Boolean(state?.drafts && Object.keys(state.drafts).length > 0);
  const canConfirmDraft = Boolean(hasDrafts && !state?.draftConfirmed && !isRunning);
  const exportItems = { ...defaultExportItems, ...(state?.options.exportItems || {}) };
  const hasExportItem = Object.values(exportItems).some(Boolean);
  const canExportFinal = Boolean(hasDrafts && state?.draftConfirmed && hasExportItem && !isRunning);
  const canValidateDraft = Boolean(hasDrafts && !isRunning);
  const canRegenerateCodeMaterial = Boolean(hasDrafts && hasSource && !isRunning && !draftDirty && !regeneratingCode);
  const draftEntries = useMemo(() => Object.entries(state?.drafts || {}), [state?.drafts]);
  const frameworkSummary = useMemo(() => summarizeStatItems(state?.analysis?.frameworks, 4), [state?.analysis?.frameworks]);
  const languageSummary = useMemo(() => summarizeStatItems(state?.analysis?.languages, 5), [state?.analysis?.languages]);
  const codeMaterialReady = Boolean(codeManifest && codeManifest.total_pages >= 60 && codeManifest.mode === 'front30_back30');
  const codeManifestFiles = useMemo(() => codeManifest?.files?.slice(0, 12) || [], [codeManifest?.files]);
  const codeRiskTips = useMemo(() => getCodeMaterialRiskTips(codeManifest, codeIncludedPaths, codeExcludedPaths), [codeExcludedPaths, codeIncludedPaths, codeManifest]);
  const selectedExportLabels = useMemo(
    () => exportItemRows.filter((item) => exportItems[item.key]).map((item) => item.label),
    [exportItems],
  );
  const codeCandidateFiles = useMemo(() => {
    const selectedPaths = new Set([...(codeManifest?.files || []).map((file) => file.path), ...codeIncludedPaths]);
    const keyword = codeCandidateKeyword.trim().toLowerCase();
    return (state?.analysis?.candidates || [])
      .filter((file) => !selectedPaths.has(file.path) && !codeExcludedPaths.includes(file.path))
      .filter((file) => !keyword || file.path.toLowerCase().includes(keyword) || file.category.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [codeCandidateKeyword, codeExcludedPaths, codeIncludedPaths, codeManifest?.files, state?.analysis?.candidates]);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.softwareCopyright.loadState()
      .then((nextState) => {
        if (!mounted) return;
        setState(nextState);
        setFields({ ...emptyFields, ...nextState.fields });
      })
      .catch((error) => showToast(error.message || '读取软著生成状态失败', 'error'))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = window.yibiao?.softwareCopyright.onEvent((nextState) => {
      setState(nextState);
      setFields((prev) => ({ ...prev, ...nextState.fields }));
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [showToast]);

  useEffect(() => {
    if (!draftEntries.length) {
      setActiveDraftKey('');
      setDraftFile(null);
      setDraftContent('');
      setDraftDirty(false);
      return;
    }
    if (!activeDraftKey || !state?.drafts?.[activeDraftKey]) {
      setActiveDraftKey(draftEntries[0][0]);
    }
  }, [activeDraftKey, draftEntries, state?.drafts]);

  useEffect(() => {
    let mounted = true;
    if (!activeDraftKey) return undefined;

    setDraftLoading(true);
    window.yibiao?.softwareCopyright.readDraft(activeDraftKey)
      .then((file) => {
        if (!mounted) return;
        setDraftFile(file);
        setDraftContent(file.content);
        setDraftDirty(false);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : '读取草稿失败', 'error');
      })
      .finally(() => {
        if (mounted) setDraftLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeDraftKey, showToast]);

  useEffect(() => {
    let mounted = true;
    if (!hasDrafts) {
      setCodeManifest(null);
      return undefined;
    }

    setCodeManifestLoading(true);
    window.yibiao?.softwareCopyright.readCodeManifest()
      .then((manifest) => {
        if (mounted) setCodeManifest(manifest);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : '读取代码材料清单失败', 'error');
      })
      .finally(() => {
        if (mounted) setCodeManifestLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [hasDrafts, state?.draftDir, state?.task?.status, showToast]);

  async function handleSelectProject() {
    try {
      const result = await window.yibiao?.softwareCopyright.selectProject();
      if (!result?.success) {
        if (result?.message) showToast(result.message, 'info');
        return;
      }
      setState(result.state);
      setFields({ ...emptyFields, ...result.state.fields });
      showToast('项目分析完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择项目失败', 'error');
    }
  }

  async function handleSaveFields() {
    setSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.saveFields(fields);
      if (nextState) {
        setState(nextState);
      }
      showToast('字段已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存字段失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAiImages(checked: boolean) {
    const options = { ...(state?.options || defaultOptions), useAiImages: checked, screenshotMode: checked ? 'ai' as const : 'skip' as const };
    const nextState = await window.yibiao?.softwareCopyright.saveOptions(options);
    if (nextState) setState(nextState);
  }

  async function handleSourceModeChange(nextSourceMode: 'project' | 'code-generation') {
    const options = { ...(state?.options || defaultOptions), sourceMode: nextSourceMode };
    const nextState = await window.yibiao?.softwareCopyright.saveOptions(options);
    if (nextState) setState(nextState);
  }

  async function handleToggleExportItem(key: keyof SoftwareCopyrightOptions['exportItems'], checked: boolean) {
    const nextExportItems = { ...exportItems, [key]: checked };
    const nextState = await window.yibiao?.softwareCopyright.saveOptions({
      ...(state?.options || defaultOptions),
      exportItems: nextExportItems,
    });
    if (nextState) setState(nextState);
  }

  async function handleGenerateDraft() {
    if (!canGenerateDraft) {
      showToast(sourceMode === 'code-generation' ? '请先在代码生成中确认素材，并确认软件全称和版本号' : '请先选择项目，并至少确认软件全称和版本号', 'info');
      return;
    }
    if (missingFields.length) {
      showToast('仍有登记字段未补全，生成结果会保留“待用户确认”提示', 'info');
    }
    await handleSaveFields();
    try {
      setValidation(null);
      await window.yibiao?.softwareCopyright.startGeneration({ fields, useAiImages: Boolean(state?.options.useAiImages), sourceMode, codeExcludedPaths, codeIncludedPaths });
      showToast('软著草稿生成已开始', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启动草稿生成失败', 'error');
    }
  }

  async function handleConfirmDraft() {
    if (draftDirty) {
      showToast('草稿内容已修改，请先保存后再确认', 'info');
      return;
    }
    const validationResult = await handleValidateDraft(true);
    if (!validationResult?.valid) {
      showToast('草稿检查未通过，请先处理缺失项', 'error');
      return;
    }
    try {
      const nextState = await window.yibiao?.softwareCopyright.confirmDraft();
      if (nextState) setState(nextState);
      showToast('草稿已确认，可以导出正式资料', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '确认草稿失败', 'error');
    }
  }

  async function handleExportFinal() {
    if (!hasExportItem) {
      showToast('请至少选择一种正式资料导出项', 'info');
      return;
    }
    setExportConfirmOpen(true);
  }

  async function handleConfirmExportFinal() {
    try {
      setExportConfirmOpen(false);
      await window.yibiao?.softwareCopyright.exportFinal({ exportItems });
      showToast('正式资料导出已开始', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出正式资料失败', 'error');
    }
  }

  async function handleOpenOutputDir() {
    try {
      await window.yibiao?.softwareCopyright.openOutputDir();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开输出目录失败', 'error');
    }
  }

  async function handleClear() {
    try {
      const result = await window.yibiao?.softwareCopyright.clear();
      if (!result) return;
      setState(result.state);
      setFields({ ...emptyFields, ...result.state.fields });
      setDraftFile(null);
      setDraftContent('');
      setDraftDirty(false);
      setValidation(null);
      setCodeManifest(null);
      showToast('软著生成工作区已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败', 'error');
    }
  }

  function updateField(key: keyof SoftwareCopyrightFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleDraftContentChange(value: string) {
    setDraftContent(value);
    setDraftDirty(value !== (draftFile?.content || ''));
  }

  function handleSelectDraft(nextKey: string) {
    if (nextKey === activeDraftKey) return;
    if (draftDirty) {
      showToast('当前草稿有未保存修改，请先保存后再切换', 'info');
      return;
    }
    setActiveDraftKey(nextKey);
  }

  async function handleSaveDraft() {
    if (!activeDraftKey || !draftDirty) return;
    setDraftSaving(true);
    try {
      const result = await window.yibiao?.softwareCopyright.saveDraft({ key: activeDraftKey, content: draftContent });
      if (result) {
        setDraftFile(result);
        setDraftContent(result.content);
        setDraftDirty(false);
        setState(result.state);
        setValidation(null);
      }
      showToast('草稿已保存，需重新确认后再导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存草稿失败', 'error');
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleToggleCodeExcludedPath(filePath: string, checked: boolean) {
    const nextExcludedPaths = checked
      ? Array.from(new Set([...codeExcludedPaths, filePath]))
      : codeExcludedPaths.filter((item) => item !== filePath);
    const nextIncludedPaths = checked ? codeIncludedPaths.filter((item) => item !== filePath) : codeIncludedPaths;
    try {
      const nextState = await window.yibiao?.softwareCopyright.saveOptions({
        ...(state?.options || defaultOptions),
        codeExcludedPaths: nextExcludedPaths,
        codeIncludedPaths: nextIncludedPaths,
      });
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新排除文件失败', 'error');
    }
  }

  async function handleToggleCodeIncludedPath(filePath: string, checked: boolean) {
    const nextIncludedPaths = checked
      ? Array.from(new Set([...codeIncludedPaths, filePath]))
      : codeIncludedPaths.filter((item) => item !== filePath);
    const nextExcludedPaths = checked ? codeExcludedPaths.filter((item) => item !== filePath) : codeExcludedPaths;
    try {
      const nextState = await window.yibiao?.softwareCopyright.saveOptions({
        ...(state?.options || defaultOptions),
        codeExcludedPaths: nextExcludedPaths,
        codeIncludedPaths: nextIncludedPaths,
      });
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新补充文件失败', 'error');
    }
  }

  async function handleRegenerateCodeMaterial() {
    if (draftDirty) {
      showToast('当前草稿有未保存修改，请先保存后再重新抽取代码材料', 'info');
      return;
    }
    setRegeneratingCode(true);
    try {
      const savedState = await window.yibiao?.softwareCopyright.saveFields(fields);
      if (savedState) setState(savedState);
      const result = await window.yibiao?.softwareCopyright.regenerateCodeMaterial({ fields, sourceMode, codeExcludedPaths, codeIncludedPaths });
      if (result) {
        setState(result.state);
        setFields({ ...emptyFields, ...result.state.fields });
        setCodeManifest(result.manifest);
        setValidation(null);
        if (activeDraftKey && activeDraftKey.startsWith('code')) {
          setActiveDraftKey('codeManifest');
        }
      }
      showToast('代码材料已重新抽取，请重新检查并确认草稿', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重新抽取代码材料失败', 'error');
    } finally {
      setRegeneratingCode(false);
    }
  }

  async function handleValidateDraft(silent = false) {
    if (!canValidateDraft) return null;
    setValidating(true);
    try {
      const result = await window.yibiao?.softwareCopyright.validateDraft();
      if (result) {
        setValidation(result);
        if (!silent) {
          showToast(result.valid ? '草稿检查通过' : `草稿检查发现 ${result.issues.length} 项问题`, result.valid ? 'success' : 'error');
        }
      }
      return result || null;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '草稿检查失败', 'error');
      return null;
    } finally {
      setValidating(false);
    }
  }

  if (loading) {
    return <div className="software-copyright-page"><div className="software-copyright-empty">正在读取软著生成状态...</div></div>;
  }

  return (
    <div className="software-copyright-page">
      <section className="software-copyright-header">
        <div>
          <span className="section-kicker">软著生成</span>
          <h2>生成申请表信息、操作手册和代码鉴别材料</h2>
          <p>文本生成使用设置中的文本模型；示意图可选使用设置中的生图模型。代码材料只从所选项目真实源码中抽取。</p>
          <div className="software-copyright-format-notice">
            导出材料格式需根据当地受理要求人为微调，请勿直接使用！
          </div>
          <button type="button" className="software-copyright-compliance-link" onClick={() => setComplianceNoticeOpen(true)}>
            软著AI合规提醒
          </button>
        </div>
        <div className="software-copyright-header-actions">
          <button type="button" className="secondary-action" onClick={handleSelectProject} disabled={isRunning}>选择项目</button>
          <button type="button" className="secondary-action" onClick={handleOpenOutputDir}>打开输出目录</button>
          <button type="button" className="danger-action" onClick={handleClear} disabled={isRunning}>清空</button>
        </div>
      </section>

      <div className="software-copyright-layout">
        <main className="software-copyright-main">
          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">项目来源</span>
                <h3>{sourceMode === 'code-generation' ? state?.codeGeneration?.project?.name || '尚未确认代码素材' : state?.project?.name || '尚未选择项目'}</h3>
              </div>
              {sourceMode === 'code-generation'
                ? state?.codeGeneration?.project && <span className="demo-soft-pill">{state.codeGeneration.project.path}</span>
                : state?.project && <span className="demo-soft-pill">{state.project.path}</span>}
            </div>
            <div className="software-copyright-source-switch">
              <button
                type="button"
                className={sourceMode === 'project' ? 'is-active' : ''}
                onClick={() => void handleSourceModeChange('project')}
                disabled={isRunning}
              >
                选择项目目录
              </button>
              <button
                type="button"
                className={sourceMode === 'code-generation' ? 'is-active' : ''}
                onClick={() => void handleSourceModeChange('code-generation')}
                disabled={isRunning || !state?.codeGeneration?.available}
              >
                使用代码生成结果
              </button>
            </div>
            {sourceMode === 'project' && state?.analysis ? (
              <div className="software-copyright-stats">
                <article><span>源码文件</span><strong>{state.analysis.fileCount}</strong></article>
                <article><span>源码行数</span><strong>{state.analysis.lineCount}</strong></article>
                <article className="is-text"><span>技术栈</span><strong title={frameworkSummary.title}>{frameworkSummary.text}</strong></article>
                <article className="is-text"><span>语言</span><strong title={languageSummary.title}>{languageSummary.text}</strong></article>
              </div>
            ) : sourceMode === 'code-generation' && state?.codeGeneration?.available ? (
              <div className="software-copyright-stats">
                <article><span>已选文件</span><strong>{state.codeGeneration.summary?.selectedCount || 0}</strong></article>
                <article><span>素材行数</span><strong>{state.codeGeneration.summary?.selectedLineCount || 0}</strong></article>
                <article><span>预计页数</span><strong>{state.codeGeneration.summary?.estimatedPages || 0}</strong></article>
                <article><span>确认时间</span><strong>{state.codeGeneration.confirmedAt ? new Date(state.codeGeneration.confirmedAt).toLocaleString() : '已确认'}</strong></article>
              </div>
            ) : (
              <div className="software-copyright-empty">{sourceMode === 'code-generation' ? '请先到代码生成页面选择项目并确认代码素材。' : '请选择需要申请软著的软件项目目录。'}</div>
            )}
          </section>

          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">代码材料</span>
                <h3>抽取清单预览</h3>
              </div>
              <div className="software-copyright-code-actions">
                {codeManifest && (
                  <em className={`software-copyright-task-status is-${codeMaterialReady ? 'success' : 'running'}`}>
                    {codeMaterialReady ? '满足条件' : '需核对'}
                  </em>
                )}
                <button
                  type="button"
                  className="secondary-action"
                  onClick={handleRegenerateCodeMaterial}
                  disabled={!canRegenerateCodeMaterial}
                >
                  {regeneratingCode ? '抽取中...' : '重新抽取'}
                </button>
              </div>
            </div>
            {codeManifestLoading ? (
              <div className="software-copyright-empty">正在读取代码材料清单...</div>
            ) : codeManifest ? (
              <div className="software-copyright-code-manifest">
                <div className="software-copyright-code-summary">
                  <article>
                    <span>材料页数</span>
                    <strong>{codeManifest.total_pages}</strong>
                  </article>
                  <article>
                    <span>材料行数</span>
                    <strong>{codeManifest.material_line_count}</strong>
                  </article>
                  <article>
                    <span>源码文件</span>
                    <strong>{codeManifest.files?.length || 0}</strong>
                  </article>
                  <article>
                    <span>切页行数</span>
                    <strong>{codeManifest.lines_per_page}</strong>
                  </article>
                </div>
                <div className={`software-copyright-code-status is-${codeMaterialReady ? 'ready' : 'review'}`}>
                  {codeMaterialReady
                    ? '当前已满足前30页+后30页代码材料条件。'
                    : codeManifest.total_pages >= 60
                      ? '当前页数已超过60页，请核对前30页和后30页内容是否具有代表性。'
                      : '当前不足60页，将导出全部代码材料，请根据受理要求人工核对。'}
                </div>
                {codeRiskTips.length > 0 && (
                  <div className="software-copyright-code-risk">
                    <strong>材料提示</strong>
                    <ul>
                      {codeRiskTips.map((tip) => <li key={tip}>{tip}</li>)}
                    </ul>
                  </div>
                )}
                <div className="software-copyright-code-tags">
                  {Object.entries(codeManifest.category_summary || {}).map(([category, count]) => (
                    <span key={category}>{category} {count}</span>
                  ))}
                </div>
                <div className="software-copyright-code-strategy">
                  <strong>选择策略</strong>
                  <span>{codeManifest.selection_strategy ? formatSelectionStrategy(codeManifest.selection_strategy) : '默认源码抽取'}</span>
                </div>
                {codeExcludedPaths.length > 0 && (
                  <div className="software-copyright-code-excluded">
                    <strong>已标记排除</strong>
                    <div>
                      {codeExcludedPaths.map((filePath) => (
                        <button
                          type="button"
                          onClick={() => void handleToggleCodeExcludedPath(filePath, false)}
                          disabled={isRunning || regeneratingCode}
                          title={filePath}
                          key={filePath}
                        >
                          {filePath}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="software-copyright-code-picker">
                  <div className="software-copyright-code-picker-head">
                    <strong>手动补充文件</strong>
                    <input
                      value={codeCandidateKeyword}
                      onChange={(event) => setCodeCandidateKeyword(event.target.value)}
                      placeholder="搜索候选源码"
                      disabled={isRunning || regeneratingCode}
                    />
                  </div>
                  {codeIncludedPaths.length > 0 && (
                    <div className="software-copyright-code-included">
                      {codeIncludedPaths.map((filePath) => (
                        <button
                          type="button"
                          onClick={() => void handleToggleCodeIncludedPath(filePath, false)}
                          disabled={isRunning || regeneratingCode}
                          title={filePath}
                          key={filePath}
                        >
                          {filePath}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="software-copyright-code-candidates">
                    {codeCandidateFiles.length ? codeCandidateFiles.map((file) => (
                      <button
                        type="button"
                        onClick={() => void handleToggleCodeIncludedPath(file.path, true)}
                        disabled={isRunning || regeneratingCode}
                        title={file.path}
                        key={file.path}
                      >
                        <span>{file.path}</span>
                        <em>{file.category} · {file.line_count} 行</em>
                      </button>
                    )) : (
                      <span>暂无可补充候选文件</span>
                    )}
                  </div>
                  <span className="software-copyright-code-more">补充或排除文件后，点击“重新抽取”生效。</span>
                </div>
                <div className="software-copyright-code-table" role="table" aria-label="代码材料文件清单">
                  <div className="software-copyright-code-row is-head" role="row">
                    <span role="columnheader">排除</span>
                    <span role="columnheader">文件</span>
                    <span role="columnheader">类型</span>
                    <span role="columnheader">行数</span>
                  </div>
                  {codeManifestFiles.map((file) => (
                    <div className={`software-copyright-code-row ${codeExcludedPaths.includes(file.path) ? 'is-excluded' : ''}`} role="row" key={file.path}>
                      <label role="cell" className="software-copyright-code-exclude-check" title={codeExcludedPaths.includes(file.path) ? '取消排除' : '排除该文件'}>
                        <input
                          type="checkbox"
                          checked={codeExcludedPaths.includes(file.path)}
                          onChange={(event) => void handleToggleCodeExcludedPath(file.path, event.target.checked)}
                          disabled={isRunning || regeneratingCode}
                        />
                      </label>
                      <span role="cell" title={file.path}>{file.path}</span>
                      <span role="cell">{file.category}</span>
                      <span role="cell">{file.source_line_count}</span>
                    </div>
                  ))}
                </div>
                {(codeManifest.files?.length || 0) > codeManifestFiles.length && (
                  <span className="software-copyright-code-more">另有 {(codeManifest.files?.length || 0) - codeManifestFiles.length} 个文件，可在代码提取清单草稿中查看。勾选排除后，点击“重新抽取”生效。</span>
                )}
              </div>
            ) : (
              <div className="software-copyright-empty">生成草稿后会显示代码材料页数、文件类别和抽取清单；如源码发生变化，可单独重新抽取代码材料。</div>
            )}
          </section>

          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">申请字段</span>
                <h3>基础信息</h3>
              </div>
              <button type="button" className="secondary-action" onClick={handleSaveFields} disabled={saving || isRunning}>{saving ? '保存中' : '保存字段'}</button>
            </div>
            <div className="software-copyright-form-grid">
              {basicFieldRows.map((field) => (
                <label className="software-copyright-field" key={field.key}>
                  <span>{field.label}</span>
                  <input value={fields[field.key]} placeholder={field.placeholder} onChange={(event) => updateField(field.key, event.target.value)} disabled={isRunning} />
                </label>
              ))}
            </div>
          </section>

          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">环境与功能</span>
                <h3>官网填报辅助字段</h3>
              </div>
              {missingFields.length > 0 && <span className="software-copyright-warning">有 {missingFields.length} 项建议补全</span>}
            </div>
            <div className="software-copyright-form-grid">
              {environmentFieldRows.map((field) => (
                <label className="software-copyright-field" key={field.key}>
                  <span>{field.label}</span>
                  <input value={fields[field.key]} placeholder={field.placeholder} onChange={(event) => updateField(field.key, event.target.value)} disabled={isRunning} />
                </label>
              ))}
            </div>
            <label className="software-copyright-field is-wide">
              <span>软件的主要功能</span>
              <textarea value={fields.mainFunctions} placeholder="可留空由文本模型根据项目证据生成，建议提交前人工核对。" onChange={(event) => updateField('mainFunctions', event.target.value)} disabled={isRunning} />
            </label>
            <label className="software-copyright-field is-wide">
              <span>软件的技术特点</span>
              <textarea value={fields.technicalFeatures} placeholder="例如 Electron 桌面应用、AI 文档生成、Markdown/Word 导出等，≤100字符更适合官网字段。" onChange={(event) => updateField('technicalFeatures', event.target.value)} disabled={isRunning} />
            </label>
          </section>
        </main>

        <aside className="software-copyright-side">
          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">模型</span>
                <h3>生成设置</h3>
              </div>
            </div>
            <div className={`software-copyright-model-status is-${state?.imageModel.available ? 'available' : 'unavailable'}`}>
              <strong>生图模型</strong>
              <span>{state?.imageModel.available ? '已可用' : state?.imageModel.message || '未配置可用'}</span>
            </div>
            <label className="software-copyright-toggle">
              <input
                type="checkbox"
                checked={Boolean(state?.options.useAiImages)}
                onChange={(event) => void handleToggleAiImages(event.target.checked)}
                disabled={!state?.imageModel.available || isRunning}
              />
              <span>生成操作手册示意图</span>
            </label>
            <div className="software-copyright-export-options">
              <strong>正式资料导出项</strong>
              <span className="software-copyright-export-note">导出材料格式需根据当地受理要求人为微调，请勿直接使用！</span>
              {exportItemRows.map((item) => (
                <label className="software-copyright-toggle" key={item.key}>
                  <input
                    type="checkbox"
                    checked={Boolean(exportItems[item.key])}
                    onChange={(event) => void handleToggleExportItem(item.key, event.target.checked)}
                    disabled={isRunning}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
              {!hasExportItem && <span className="software-copyright-option-warning">至少选择一项后才能导出。</span>}
            </div>
          </section>

          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">生成</span>
                <h3>任务进度</h3>
              </div>
              {task && <em className={`software-copyright-task-status is-${task.status}`}>{task.status === 'running' ? '运行中' : task.status === 'success' ? '完成' : '失败'}</em>}
            </div>
            <div className="software-copyright-progress" aria-label="生成进度">
              <span style={{ width: `${Math.max(0, Math.min(100, task?.progress || 0))}%` }} />
            </div>
            <div className="software-copyright-step-actions">
              <button type="button" className="primary-action" onClick={handleGenerateDraft} disabled={!canGenerateDraft}>
                {isRunning && task?.type === 'software-copyright-draft-generation' ? '生成草稿中...' : '生成草稿'}
              </button>
              <button type="button" className="secondary-action" onClick={() => void handleValidateDraft()} disabled={!canValidateDraft || validating}>
                {validating ? '检查中...' : '检查草稿'}
              </button>
              <button type="button" className="secondary-action" onClick={handleConfirmDraft} disabled={!canConfirmDraft}>确认草稿</button>
              <button type="button" className="primary-action" onClick={handleExportFinal} disabled={!canExportFinal}>
                {isRunning && task?.type === 'software-copyright-final-export' ? '导出中...' : '导出正式资料'}
              </button>
            </div>
            {validation && (
              <div className={`software-copyright-validation is-${validation.valid ? 'valid' : 'invalid'}`}>
                <strong>{validation.valid ? '草稿检查通过' : `草稿检查未通过（${validation.issues.length} 项）`}</strong>
                {validation.issues.length ? (
                  <ul>
                    {validation.issues.map((issue, index) => (
                      <li key={`${issue.type}-${issue.key || index}-${issue.message}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : (
                  <span>可以确认草稿并导出正式资料。</span>
                )}
              </div>
            )}
            {task?.error && (
              <div className="software-copyright-recovery">
                <strong>{task.recovery?.title || '任务执行失败'}</strong>
                <p>{task.recovery?.message || task.error}</p>
                {task.recovery?.actions?.length ? (
                  <ul>
                    {task.recovery.actions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                ) : null}
              </div>
            )}
            <div className="software-copyright-log">
              {(task?.logs || ['等待生成草稿']).slice(-8).map((log, index) => <span key={`${log}-${index}`}>{log}</span>)}
            </div>
          </section>

          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">草稿</span>
                <h3>待确认资料</h3>
              </div>
              <div className="software-copyright-draft-actions">
                {draftDirty && <span className="software-copyright-warning">未保存</span>}
                {state?.draftConfirmed && <span className="code-generation-confirmed">已确认</span>}
              </div>
            </div>
            {hasDrafts ? (
              <div className="software-copyright-draft-workspace">
                <div className="software-copyright-draft-tabs" aria-label="草稿文件">
                  {draftEntries.map(([key]) => (
                    <button
                      type="button"
                      className={activeDraftKey === key ? 'is-active' : ''}
                      onClick={() => handleSelectDraft(key)}
                      disabled={draftLoading || draftSaving}
                      key={key}
                    >
                      {draftLabel(key)}
                    </button>
                  ))}
                </div>
                <div className="software-copyright-draft-meta">
                  <span>{draftFile?.name || '正在读取草稿'}</span>
                  {draftFile?.updatedAt && <span>{new Date(draftFile.updatedAt).toLocaleString()}</span>}
                </div>
                <div className="software-copyright-draft-mode" aria-label="草稿查看方式">
                  <button type="button" className={draftViewMode === 'edit' ? 'is-active' : ''} onClick={() => setDraftViewMode('edit')}>编辑</button>
                  <button type="button" className={draftViewMode === 'preview' ? 'is-active' : ''} onClick={() => setDraftViewMode('preview')}>预览</button>
                </div>
                {draftLoading ? (
                  <div className="software-copyright-empty">正在读取草稿内容...</div>
                ) : draftViewMode === 'edit' ? (
                  <MarkdownEditor
                    className="software-copyright-draft-editor"
                    value={draftContent}
                    onChange={handleDraftContentChange}
                    placeholder="草稿内容为空"
                    disabled={isRunning || draftSaving}
                  />
                ) : (
                  <div className="markdown-viewer software-copyright-draft-preview">
                    <MarkdownRenderer>{draftContent || '草稿内容为空'}</MarkdownRenderer>
                  </div>
                )}
                <button
                  type="button"
                  className="secondary-action software-copyright-draft-save"
                  onClick={handleSaveDraft}
                  disabled={!draftDirty || draftSaving || isRunning}
                >
                  {draftSaving ? '保存中' : '保存草稿'}
                </button>
                <span className="software-copyright-draft-path">{draftFile?.path}</span>
              </div>
            ) : (
              <div className="software-copyright-empty">生成草稿后会显示业务理解、申请表信息、操作手册、代码提取清单和代码材料 Markdown。</div>
            )}
          </section>

          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">结果</span>
                <h3>正式资料</h3>
              </div>
            </div>
            {state?.outputs?.length ? (
              <div className="software-copyright-output-result">
                {state.outputDir && (
                  <button type="button" className="software-copyright-output-dir" onClick={handleOpenOutputDir}>
                    <strong>输出目录</strong>
                    <span>{state.outputDir}</span>
                  </button>
                )}
                <div className="software-copyright-output-list">
                  {state.outputs.map((output) => (
                    <article key={output.path}>
                      <strong>{output.name}</strong>
                      <span>{output.path}</span>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="software-copyright-empty">确认草稿并导出后，会显示申请表 TXT、操作手册 DOCX、代码材料 DOCX 和生成报告。</div>
            )}
          </section>
        </aside>
      </div>
      <Dialog.Root open={complianceNoticeOpen} onOpenChange={setComplianceNoticeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="software-copyright-compliance-card">
            <div className="software-copyright-export-confirm-head">
              <div>
                <Dialog.Title>软著AI合规提醒</Dialog.Title>
                <Dialog.Description>
                  导出材料只是整理辅助，最终申报前仍需人工判断、人工改写和人工复核。
                </Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭软著AI合规提醒">×</Dialog.Close>
            </div>

            <div className="software-copyright-compliance-body">
              <section>
                <h3>请先确认创作主导关系</h3>
                <p>软著保护的是具有人类智力独创性的成果。若代码主要由 AI 自动生成，且没有实质性架构设计、逻辑改写、调试优化和人工集成，不建议直接申报。</p>
              </section>
              <section>
                <h3>材料不要直接提交</h3>
                <p>申请表信息、功能说明、操作手册和代码材料都需要人工核对。尤其是软件全称、版本号、著作权人、开发完成日期、页眉页脚和源码范围，应与正式申请材料保持一致。</p>
              </section>
              <section>
                <h3>保留开发证据链</h3>
                <ul>
                  <li>保留需求文档、架构图、Git 提交记录、调试记录和人工修改对比。</li>
                  <li>如使用 AI 辅助，留存 prompt、AI 输出、人工改写记录和最终代码差异。</li>
                  <li>对 AI 片段进行结构性重写、注释完善和业务逻辑校验，避免模板化、同质化代码直接进入申报材料。</li>
                </ul>
              </section>
              <section>
                <h3>遇到 AI 占比较高时</h3>
                <p>建议先补充人工设计和改造工作，必要时准备《AI 辅助开发情况说明》及完整证据链。具体受理口径请以版权登记机构最新要求为准。</p>
              </section>
            </div>

            <div className="software-copyright-export-confirm-actions">
              <Dialog.Close className="primary-action" type="button">我已知晓</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="software-copyright-export-confirm-card">
            <div className="software-copyright-export-confirm-head">
              <div>
                <Dialog.Title>导出前最终检查</Dialog.Title>
                <Dialog.Description>
                  请确认申请字段、代码材料和导出项无误后再导出正式资料。
                </Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭导出确认">×</Dialog.Close>
            </div>

            <div className="software-copyright-export-confirm-grid">
              <article>
                <span>软件全称</span>
                <strong>{fields.softwareName || '未填写'}</strong>
              </article>
              <article>
                <span>版本号</span>
                <strong>{fields.version || '未填写'}</strong>
              </article>
              <article>
                <span>草稿状态</span>
                <strong>{state?.draftConfirmed ? '已确认' : '未确认'}</strong>
              </article>
              <article>
                <span>代码页数</span>
                <strong>{codeManifest?.total_pages || fields.pageCount || '未生成'}</strong>
              </article>
            </div>

            <div className="software-copyright-export-confirm-section">
              <strong>导出项目</strong>
              <div className="software-copyright-export-confirm-tags">
                {selectedExportLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
            </div>

            <div className="software-copyright-export-confirm-section">
              <strong>检查摘要</strong>
              <ul>
                {missingFields.length > 0 && <li>仍有 {missingFields.length} 项建议补全字段。</li>}
                {!state?.draftConfirmed && <li>草稿尚未确认，请先返回确认草稿。</li>}
                {codeRiskTips.map((tip) => <li key={tip}>{tip}</li>)}
                {selectedExportLabels.length === 0 && <li>尚未选择任何导出项目。</li>}
                {missingFields.length === 0 && state?.draftConfirmed && codeRiskTips.length === 0 && selectedExportLabels.length > 0 && (
                  <li>当前未发现阻塞导出的检查项，仍建议导出后按当地受理要求人工复核。</li>
                )}
              </ul>
            </div>

            <div className="software-copyright-export-confirm-note">
              导出材料格式需根据当地受理要求人为微调，请勿直接使用！
            </div>

            <div className="software-copyright-export-confirm-actions">
              <Dialog.Close className="secondary-action" type="button">返回修改</Dialog.Close>
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirmExportFinal}
                disabled={!canExportFinal}
              >
                确认导出
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function draftLabel(key: string) {
  const labels: Record<string, string> = {
    business: '业务理解',
    application: '申请表信息',
    manual: '操作手册',
    codeManifest: '代码提取清单',
    manualCheck: '操作手册自检记录',
  };
  if (labels[key]) return labels[key];
  if (key.startsWith('code')) return `代码材料 ${key.replace('code', '')}`;
  return key;
}

function formatSelectionStrategy(strategy: string) {
  const labels: Record<string, string> = {
    'core-category-score-v1': '核心类别覆盖 + 源码权重排序',
  };
  return labels[strategy] || strategy;
}

export default SoftwareCopyrightPage;
