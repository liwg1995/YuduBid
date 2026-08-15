import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightCodeManifest, SoftwareCopyrightCodeMaterialReviewChecks, SoftwareCopyrightConsistencyCheck, SoftwareCopyrightDraftFile, SoftwareCopyrightDraftValidationIssue, SoftwareCopyrightDraftValidationResult, SoftwareCopyrightFields, SoftwareCopyrightManualAssetReviewChecks, SoftwareCopyrightOptions, SoftwareCopyrightState } from '../types';
import { CodeMaterialReview } from '../components/CodeMaterialReview';
import { AiIllustrationManager } from '../components/AiIllustrationManager';
import { ManualScreenshotManager } from '../components/ManualScreenshotManager';
import { ManualStructureEditor, parseManualStructure } from '../components/ManualStructureEditor';
import { SubmissionReadinessPanel, type SubmissionReadinessItem, type SubmissionReadinessTarget } from '../components/SubmissionReadinessPanel';
import { MaterialConsistencyReview } from '../components/MaterialConsistencyReview';
import { DraftVersionHistory } from '../components/DraftVersionHistory';
import { ExportBatchHistory } from '../components/ExportBatchHistory';
import { SubmissionAssistant } from '../components/SubmissionAssistant';
import { SoftwareCopyrightJourneyGuide, type SoftwareCopyrightJourneyStep } from '../components/SoftwareCopyrightJourneyGuide';
import { ManualAssetReviewPanel } from '../components/ManualAssetReviewPanel';
import SoftwareCopyrightProjectsPage from './SoftwareCopyrightProjectsPage';
import '../softwareCopyright.css';

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

const basicFieldRows: Array<{ key: keyof SoftwareCopyrightFields; label: string; placeholder?: string; inputType?: 'text' | 'date' }> = [
  { key: 'softwareName', label: '软件全称', placeholder: '例如：禹都AI解决方案助手软件' },
  { key: 'shortName', label: '软件简称', placeholder: '可选' },
  { key: 'version', label: '版本号', placeholder: 'V1.0' },
  { key: 'category', label: '软件分类', placeholder: '应用软件' },
  { key: 'developmentCompletedDate', label: '开发完成日期', inputType: 'date' },
  { key: 'developmentMode', label: '开发方式', placeholder: '单独开发' },
  { key: 'softwareDescription', label: '软件说明', placeholder: '原创' },
  { key: 'publishStatus', label: '发表状态', placeholder: '未发表' },
  { key: 'firstPublishDate', label: '首次发表日期', inputType: 'date' },
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
  codeClean: {
    removeComments: true,
    removeBlankLines: true,
    maskSensitive: true,
    wrapLongLines: true,
    maxLineWidth: 78,
    tabWidth: 4,
  },
  exportItems: defaultExportItems,
};

const exportItemRows: Array<{ key: keyof SoftwareCopyrightOptions['exportItems']; label: string }> = [
  { key: 'application', label: '申请表 TXT' },
  { key: 'manual', label: '操作手册 DOCX' },
  { key: 'code', label: '代码材料 DOCX + TXT' },
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
    tips.push('当前源码不足 60 页，将导出全部有效代码，请重点核对末页行数。');
  } else if (manifest.truncated) {
    tips.push('源码超过 3000 行，已截取前 1500 行和后 1500 行，请核对前后段是否覆盖核心功能。');
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

interface SoftwareCopyrightWorkbenchProps {
  onBackToProjects: () => void;
}

type SoftwareCopyrightWorkflowSection = 'task' | 'source' | 'fields' | 'drafts' | 'result';

function SoftwareCopyrightWorkbench({ onBackToProjects }: SoftwareCopyrightWorkbenchProps) {
  const { showToast } = useToast();
  const [state, setState] = useState<SoftwareCopyrightState | null>(null);
  const [fields, setFields] = useState<SoftwareCopyrightFields>(emptyFields);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingTechnicalFeatures, setGeneratingTechnicalFeatures] = useState(false);
  const [activeDraftKey, setActiveDraftKey] = useState<string>('');
  const [draftFile, setDraftFile] = useState<SoftwareCopyrightDraftFile | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftViewMode, setDraftViewMode] = useState<'structure' | 'edit' | 'preview' | 'history'>('edit');
  const [validation, setValidation] = useState<SoftwareCopyrightDraftValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [codeManifest, setCodeManifest] = useState<SoftwareCopyrightCodeManifest | null>(null);
  const [codeManifestLoading, setCodeManifestLoading] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [codeReviewSaving, setCodeReviewSaving] = useState(false);
  const [codeReviewChecks, setCodeReviewChecks] = useState<SoftwareCopyrightCodeMaterialReviewChecks>({ pageRange: false, sourceScope: false, readability: false });
  const [codeReviewNotes, setCodeReviewNotes] = useState('');
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [complianceNoticeOpen, setComplianceNoticeOpen] = useState(false);
  const [codeCandidateKeyword, setCodeCandidateKeyword] = useState('');
  const [screenshotSaving, setScreenshotSaving] = useState(false);
  const [aiIllustrationSaving, setAiIllustrationSaving] = useState(false);
  const [aiIllustrationGenerating, setAiIllustrationGenerating] = useState(false);
  const [aiIllustrationPromptGenerating, setAiIllustrationPromptGenerating] = useState(false);
  const [aiIllustrationRegeneratingId, setAiIllustrationRegeneratingId] = useState('');
  const [manualAssetReviewSaving, setManualAssetReviewSaving] = useState(false);
  const [workflowHost, setWorkflowHost] = useState<HTMLDivElement | null>(null);
  const [finalStageHost, setFinalStageHost] = useState<HTMLDivElement | null>(null);
  const [submissionPrecheckReady, setSubmissionPrecheckReady] = useState(false);
  const [activeWorkflowSection, setActiveWorkflowSection] = useState<SoftwareCopyrightWorkflowSection>('task');
  const [manualTitleFocusRequest, setManualTitleFocusRequest] = useState(0);
  const sourceSectionRef = useRef<HTMLElement>(null);
  const manualSectionRef = useRef<HTMLElement>(null);
  const codeSectionRef = useRef<HTMLElement>(null);
  const fieldsSectionRef = useRef<HTMLElement>(null);
  const settingsSectionRef = useRef<HTMLElement>(null);
  const taskSectionRef = useRef<HTMLElement>(null);
  const draftsSectionRef = useRef<HTMLElement>(null);
  const resultSectionRef = useRef<HTMLElement>(null);
  const finalExportSectionRef = useRef<HTMLElement>(null);
  const submissionSectionRef = useRef<HTMLElement>(null);
  const readinessSectionRef = useRef<HTMLDivElement>(null);

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
  const codeMaterialReviewed = Boolean(state?.codeMaterialReview?.confirmedAt && state.codeMaterialReview.manifestHash);
  const manualReviewCurrent = Boolean(state?.confirmedSnapshot?.id && state?.manualReview?.confirmedAt && state.manualReview.snapshotId === state.confirmedSnapshot.id);
  const canConfirmDraft = Boolean(hasDrafts && codeMaterialReviewed && !state?.draftConfirmed && !isRunning);
  const exportItems = { ...defaultExportItems, ...(state?.options.exportItems || {}) };
  const hasExportItem = Object.values(exportItems).some(Boolean);
  const screenshotMode = state?.options.screenshotMode || 'skip';
  const manualAssetReady = screenshotMode === 'skip' || Boolean(
    state?.manualAssetReview?.confirmedAt
    && state.manualAssetReview.mode === screenshotMode
    && (screenshotMode === 'manual' ? state.manualScreenshots?.length : state?.aiIllustrations?.length),
  );
  const preExportReady = Boolean(hasSource && !missingFields.length && hasDrafts && state?.draftConfirmed && codeMaterialReviewed && manualAssetReady && manualReviewCurrent && submissionPrecheckReady && hasExportItem);
  const canExportFinal = Boolean(preExportReady && !isRunning);
  const canValidateDraft = Boolean(hasDrafts && !isRunning);
  const canRegenerateCodeMaterial = Boolean(hasDrafts && hasSource && !isRunning && !draftDirty && !regeneratingCode);
  const draftEntries = useMemo(() => Object.entries(state?.drafts || {}), [state?.drafts]);
  const frameworkSummary = useMemo(() => summarizeStatItems(state?.analysis?.frameworks, 4), [state?.analysis?.frameworks]);
  const languageSummary = useMemo(() => summarizeStatItems(state?.analysis?.languages, 5), [state?.analysis?.languages]);
  const codeMaterialReady = Boolean(codeManifest?.audit?.length && codeManifest.pages?.length && !codeManifest.audit.some((item) => item.status === 'fail'));
  const codeManifestFiles = useMemo(() => codeManifest?.files?.slice(0, 12) || [], [codeManifest?.files]);
  const codeRiskTips = useMemo(() => getCodeMaterialRiskTips(codeManifest, codeIncludedPaths, codeExcludedPaths), [codeExcludedPaths, codeIncludedPaths, codeManifest]);
  const selectedExportLabels = useMemo(
    () => exportItemRows.filter((item) => exportItems[item.key]).map((item) => item.label),
    [exportItems],
  );
  const aiIllustrationPrompt = state?.aiIllustrationSettings?.prompt || `为中文软件著作权操作手册生成一张干净、专业的软件功能示意图。软件名称：${fields.softwareName || '当前软件'}。画面表现资料输入、处理进度、核心功能和结果导出之间的关系，不出现真实品牌标识、水印、敏感信息和大段文字。`;
  const manualStructure = useMemo(() => parseManualStructure(activeDraftKey === 'manual' ? draftContent : ''), [activeDraftKey, draftContent]);
  const availableManualPlaceholders = activeDraftKey === 'manual' ? manualStructure.placeholders : state?.manualPlaceholders || [];
  const activeManualAssets = state?.options.screenshotMode === 'manual' ? state.manualScreenshots || [] : state?.options.screenshotMode === 'ai' ? state.aiIllustrations || [] : [];
  const validManualPlacementCount = useMemo(() => {
    const placeholders = new Set(state?.manualPlaceholders || []);
    return activeManualAssets.filter((asset) => asset.placement && placeholders.has(asset.placement)).length;
  }, [activeManualAssets, state?.manualPlaceholders]);
  const manualAssetReviewed = Boolean(
    state?.manualAssetReview?.confirmedAt
    && state.manualAssetReview.mode === state?.options.screenshotMode,
  );
  const readinessItems = useMemo<SubmissionReadinessItem[]>(() => {
    const screenshotMode = state?.options.screenshotMode || 'skip';
    const placeholderCount = state?.manualPlaceholders?.length || 0;
    const codeHasFailure = Boolean(codeManifest?.audit?.some((item) => item.status === 'fail'));
    const validationHasErrors = Boolean(validation?.issues.some((issue) => issue.severity === 'error'));
    const validationHasWarnings = Boolean(validation?.issues.some((issue) => issue.severity === 'warning'));
    const consistencyFailed = Boolean(validation?.consistencyChecks.some((check) => check.status === 'fail'));
    const consistencyPending = Boolean(validation?.consistencyChecks.some((check) => check.status === 'pending'));

    let manualItem: SubmissionReadinessItem;
    if (screenshotMode === 'skip') {
      manualItem = { id: 'manual', label: '操作手册图片', summary: '已选择纯文字手册', status: 'ready', target: 'settings' };
    } else if (!hasDrafts) {
      manualItem = { id: 'manual', label: '操作手册图片', summary: '生成草稿后关联截图位置', status: 'pending', target: 'manual' };
    } else if (!activeManualAssets.length) {
      manualItem = { id: 'manual', label: '操作手册图片', summary: screenshotMode === 'manual' ? '尚未导入界面截图' : '尚未生成 AI 示意图', status: 'warning', target: 'manual' };
    } else if (!manualAssetReviewed) {
      const placementSummary = placeholderCount ? `，${validManualPlacementCount}/${placeholderCount} 个预留位已关联` : '';
      manualItem = { id: 'manual', label: '操作手册图片', summary: `${activeManualAssets.length} 张图片等待人工核对${placementSummary}`, status: 'warning', target: 'manual' };
    } else {
      manualItem = { id: 'manual', label: '操作手册图片', summary: `${activeManualAssets.length} 张图片已完成人工核对`, status: 'ready', target: 'manual' };
    }

    return [
      {
        id: 'source',
        label: '项目与源码',
        summary: hasSource ? (sourceMode === 'project' ? `${state?.analysis?.fileCount || 0} 个源码文件` : '代码素材已确认') : '尚未选择有效项目来源',
        status: hasSource ? 'ready' : 'blocked',
        target: 'source',
      },
      {
        id: 'fields',
        label: '申请字段',
        summary: missingFields.length ? `还有 ${missingFields.length} 项需要补全` : '必填字段已补全',
        status: missingFields.length ? 'blocked' : 'ready',
        target: 'fields',
      },
      manualItem,
      {
        id: 'code',
        label: '代码鉴别材料',
        summary: !hasDrafts ? '生成草稿后建立代码材料' : codeHasFailure ? '代码审查存在退回风险' : codeMaterialReviewed ? `已人工核对 · ${codeManifest?.total_pages || 0} 页` : codeManifest ? `${codeManifest.total_pages} 页，等待人工核对` : '尚未读取代码材料清单',
        status: !hasDrafts || !codeManifest ? 'pending' : codeHasFailure ? 'blocked' : codeMaterialReviewed ? 'ready' : 'warning',
        target: 'code',
      },
      {
        id: 'validation',
        label: '草稿完整性',
        summary: !hasDrafts ? '尚未生成草稿' : state?.draftConfirmed ? '确认快照已通过完整检查' : !validation ? '尚未运行完整检查' : validation.issues.length ? `检查发现 ${validation.issues.length} 项问题` : '完整检查已通过',
        status: !hasDrafts ? 'pending' : state?.draftConfirmed ? 'ready' : !validation ? 'pending' : validationHasErrors ? 'blocked' : validationHasWarnings ? 'warning' : 'ready',
        target: validation?.issues[0]?.type === 'code' ? 'code' : 'task',
      },
      {
        id: 'consistency',
        label: '跨材料一致性',
        summary: state?.draftConfirmed ? '确认快照已通过一致性检查' : !validation ? '运行完整检查后核对' : consistencyFailed ? '发现材料信息不一致' : consistencyPending ? '部分项目等待材料生成' : `${validation.consistencyChecks.length} 项均一致`,
        status: state?.draftConfirmed ? 'ready' : !validation || consistencyPending ? 'pending' : consistencyFailed ? 'blocked' : 'ready',
        target: consistencyFailed ? 'task' : 'drafts',
      },
      {
        id: 'confirmation',
        label: '草稿确认',
        summary: state?.draftConfirmed ? '草稿已人工确认' : hasDrafts ? '检查后确认草稿' : '等待草稿生成',
        status: state?.draftConfirmed ? 'ready' : 'pending',
        target: hasDrafts ? 'task' : 'drafts',
      },
      {
        id: 'submission-review',
        label: '申报人工复核',
        summary: submissionPrecheckReady ? '提交前检查已全部通过' : manualReviewCurrent ? '申报辅助仍有待处理或需复核项' : state?.draftConfirmed ? '请核对权属、证件、日期和证据链' : '确认草稿后进行',
        status: submissionPrecheckReady ? 'ready' : state?.draftConfirmed ? 'warning' : 'pending',
        target: 'submission',
      },
      {
        id: 'exports',
        label: '导出范围',
        summary: selectedExportLabels.length ? `已选择 ${selectedExportLabels.length} 项正式资料` : '至少选择一项正式资料',
        status: selectedExportLabels.length ? 'ready' : 'blocked',
        target: 'settings',
      },
    ];
  }, [activeManualAssets.length, codeManifest, codeMaterialReviewed, hasDrafts, hasSource, manualAssetReviewed, manualReviewCurrent, missingFields.length, selectedExportLabels.length, sourceMode, state?.analysis?.fileCount, state?.draftConfirmed, state?.manualPlaceholders?.length, state?.options.screenshotMode, submissionPrecheckReady, validManualPlacementCount, validation]);
  const codeCandidateFiles = useMemo(() => {
    const selectedPaths = new Set([...(codeManifest?.files || []).map((file) => file.path), ...codeIncludedPaths]);
    const keyword = codeCandidateKeyword.trim().toLowerCase();
    return (state?.analysis?.candidates || [])
      .filter((file) => !selectedPaths.has(file.path) && !codeExcludedPaths.includes(file.path))
      .filter((file) => !keyword || file.path.toLowerCase().includes(keyword) || file.category.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [codeCandidateKeyword, codeExcludedPaths, codeIncludedPaths, codeManifest?.files, state?.analysis?.candidates]);

  const sourceAndFieldsReady = Boolean(hasSource && missingFields.length === 0);
  const materialsChecked = Boolean(state?.draftConfirmed || (codeMaterialReviewed && validation?.valid));
  const journeyDone = [sourceAndFieldsReady, hasDrafts, materialsChecked, Boolean(state?.draftConfirmed), manualReviewCurrent, Boolean(state?.outputs?.length)];
  const currentJourneyIndex = Math.max(0, journeyDone.findIndex((done) => !done));
  const journeySteps: SoftwareCopyrightJourneyStep[] = [
    {
      id: 'source-fields', number: 1, label: '准备源码与登记信息',
      description: hasSource ? `补全剩余 ${missingFields.length} 项必填字段并保存` : '选择源码目录，确认识别结果并补全登记字段',
      status: sourceAndFieldsReady ? 'done' : currentJourneyIndex === 0 ? 'current' : 'upcoming',
      actionLabel: hasSource ? '填写登记信息' : '选择源码目录',
      onAction: hasSource ? () => handleWorkflowNavigate('fields', fieldsSectionRef.current) : () => void handleSelectProject(),
    },
    {
      id: 'generate', number: 2, label: '生成并审阅草稿',
      description: '生成申请表、操作手册和代码材料，逐份查看内容',
      status: hasDrafts ? 'done' : currentJourneyIndex === 1 ? 'current' : 'upcoming',
      actionLabel: '前往生成草稿', onAction: () => handleWorkflowNavigate('task', taskSectionRef.current),
    },
    {
      id: 'material-review', number: 3, label: '核对材料并完整检查',
      description: codeMaterialReviewed ? '运行完整检查，处理字段、手册和跨材料一致性问题' : '核对代码页数、源码范围和可读性，并确认代码鉴别材料',
      status: materialsChecked ? 'done' : currentJourneyIndex === 2 ? 'current' : 'upcoming',
      actionLabel: codeMaterialReviewed ? '运行完整检查' : '核对代码材料',
      onAction: codeMaterialReviewed ? () => void handleValidateDraft() : () => scrollToElement(codeSectionRef.current),
    },
    {
      id: 'confirm', number: 4, label: '确认草稿快照',
      description: '确认后锁定本次草稿版本，后续复核将绑定该快照',
      status: state?.draftConfirmed ? 'done' : currentJourneyIndex === 3 ? 'current' : 'upcoming',
      actionLabel: '确认草稿', onAction: () => void handleConfirmDraft(), disabled: !canConfirmDraft,
    },
    {
      id: 'submission-review', number: 5, label: '完成申报辅助复核',
      description: '核对官网字段，并完成人工复核与证据链确认',
      status: manualReviewCurrent ? 'done' : currentJourneyIndex === 4 ? 'current' : 'upcoming',
      actionLabel: '前往申报辅助', onAction: () => scrollToElement(submissionSectionRef.current),
    },
    {
      id: 'export-final', number: 6, label: '提交前总检并导出',
      description: state?.outputs?.length ? '正式资料已导出，可查看交付包完整性校验结果' : preExportReady ? '提交前检查已完成，现在可以导出正式资料' : '先处理材料就绪清单，全部通过后再导出正式资料',
      status: state?.outputs?.length ? 'done' : currentJourneyIndex === 5 ? 'current' : 'upcoming',
      actionLabel: state?.outputs?.length ? '查看最终检查' : '导出正式资料',
      onAction: state?.outputs?.length ? () => scrollToElement(resultSectionRef.current) : preExportReady ? () => void handleExportFinal() : () => scrollToElement(readinessSectionRef.current),
    },
  ];

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
    const review = state?.codeMaterialReview;
    setCodeReviewChecks({
      pageRange: Boolean(review?.checks?.pageRange),
      sourceScope: Boolean(review?.checks?.sourceScope),
      readability: Boolean(review?.checks?.readability),
    });
    setCodeReviewNotes(review?.notes || '');
  }, [state?.codeMaterialReview]);

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
    if (activeDraftKey !== 'manual' && draftViewMode === 'structure') setDraftViewMode('edit');
  }, [activeDraftKey, draftViewMode]);

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

  async function handleGenerateTechnicalFeatures() {
    setGeneratingTechnicalFeatures(true);
    try {
      const result = await window.yibiao?.softwareCopyright.generateTechnicalFeatures({ fields });
      if (result) {
        setState(result.state);
        setFields({ ...emptyFields, ...result.state.fields });
        setValidation(null);
      }
      showToast('技术特点已由文本模型生成，请核对后保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI生成技术特点失败', 'error');
    } finally {
      setGeneratingTechnicalFeatures(false);
    }
  }

  async function handleScreenshotModeChange(screenshotMode: SoftwareCopyrightOptions['screenshotMode']) {
    try {
      const options = { ...(state?.options || defaultOptions), screenshotMode, useAiImages: screenshotMode === 'ai' };
      const nextState = await window.yibiao?.softwareCopyright.saveOptions(options);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新截图模式失败', 'error');
    }
  }

  async function handleImportManualScreenshots() {
    setScreenshotSaving(true);
    try {
      const result = await window.yibiao?.softwareCopyright.importManualScreenshots();
      if (result?.state) setState(result.state);
      if (result?.message) showToast(result.message, result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入截图失败', 'error');
    } finally {
      setScreenshotSaving(false);
    }
  }

  async function handleUpdateManualScreenshot(id: string, caption: string, placement?: string) {
    setScreenshotSaving(true);
    try {
      const current = state?.manualScreenshots?.find((item) => item.id === id);
      const nextState = await window.yibiao?.softwareCopyright.updateManualScreenshot({ id, caption, placement: placement ?? current?.placement ?? '' });
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存图片说明失败', 'error');
    } finally {
      setScreenshotSaving(false);
    }
  }

  async function handleReorderManualScreenshots(ids: string[]) {
    setScreenshotSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.reorderManualScreenshots(ids);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '调整截图顺序失败', 'error');
    } finally {
      setScreenshotSaving(false);
    }
  }

  async function handleRemoveManualScreenshot(id: string) {
    setScreenshotSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.removeManualScreenshot(id);
      if (nextState) setState(nextState);
      showToast('截图副本已移除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移除截图失败', 'error');
    } finally {
      setScreenshotSaving(false);
    }
  }

  async function handleConfirmManualAssetReview(checks: SoftwareCopyrightManualAssetReviewChecks, notes: string) {
    setManualAssetReviewSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.saveManualAssetReview({ checks, notes });
      if (nextState) setState(nextState);
      showToast('操作手册图片已完成人工核对', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存手册图片核对结果失败', 'error');
    } finally {
      setManualAssetReviewSaving(false);
    }
  }

  async function handleSaveAiIllustrationSettings(settings: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) {
    setAiIllustrationSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.saveAiIllustrationSettings(settings);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存 AI 插图设置失败', 'error');
    } finally {
      setAiIllustrationSaving(false);
    }
  }

  async function handleGenerateAiIllustration(settings: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) {
    setAiIllustrationGenerating(true);
    try {
      const result = await window.yibiao?.softwareCopyright.generateAiIllustration(settings);
      if (result?.state) setState(result.state);
      showToast(result?.message || 'AI 示意图已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 示意图生成失败', 'error');
    } finally {
      setAiIllustrationGenerating(false);
    }
  }

  async function handleGenerateAiIllustrationPrompt(style: 'engineering_diagram' | 'realistic_photo') {
    setAiIllustrationPromptGenerating(true);
    try {
      const result = await window.yibiao?.softwareCopyright.generateAiIllustrationPrompt({ style });
      if (result?.state) setState(result.state);
      showToast('已根据源码功能生成一条新的生图提示词', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成生图提示词失败', 'error');
    } finally {
      setAiIllustrationPromptGenerating(false);
    }
  }

  async function handleRegenerateAiIllustration(id: string, settings: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) {
    setAiIllustrationRegeneratingId(id);
    try {
      const result = await window.yibiao?.softwareCopyright.regenerateAiIllustration({ id, ...settings });
      if (result?.state) setState(result.state);
      showToast(result?.message || '当前示意图已重新生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重新生成示意图失败', 'error');
    } finally {
      setAiIllustrationRegeneratingId('');
    }
  }

  async function handleUpdateAiIllustration(id: string, caption: string, placement?: string) {
    setAiIllustrationSaving(true);
    try {
      const current = state?.aiIllustrations?.find((item) => item.id === id);
      const nextState = await window.yibiao?.softwareCopyright.updateAiIllustration({ id, caption, placement: placement ?? current?.placement ?? '' });
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存 AI 插图说明失败', 'error');
    } finally {
      setAiIllustrationSaving(false);
    }
  }

  async function handleReorderAiIllustrations(ids: string[]) {
    setAiIllustrationSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.reorderAiIllustrations(ids);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '调整 AI 插图顺序失败', 'error');
    } finally {
      setAiIllustrationSaving(false);
    }
  }

  async function handleRemoveAiIllustration(id: string) {
    setAiIllustrationSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.removeAiIllustration(id);
      if (nextState) setState(nextState);
      showToast('AI 示意图已移除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移除 AI 插图失败', 'error');
    } finally {
      setAiIllustrationSaving(false);
    }
  }

  async function handleToggleCodeClean(key: keyof SoftwareCopyrightOptions['codeClean'], checked: boolean) {
    const current = state?.options || defaultOptions;
    const nextState = await window.yibiao?.softwareCopyright.saveOptions({
      ...current,
      codeClean: { ...defaultOptions.codeClean, ...(current.codeClean || {}), [key]: checked },
    });
    if (nextState) {
      setState(nextState);
      setValidation(null);
    }
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
      showToast(sourceMode === 'code-generation' ? '请先在源码准备中确认素材，并确认软件全称和版本号' : '请先选择源码目录，并至少确认软件全称和版本号', 'info');
      return;
    }
    if (missingFields.length) {
      showToast('仍有登记字段未补全，生成结果会保留“待用户确认”提示', 'info');
    }
    await handleSaveFields();
    try {
      setValidation(null);
      await window.yibiao?.softwareCopyright.startGeneration({ fields, useAiImages: Boolean(state?.options.useAiImages), sourceMode, codeExcludedPaths, codeIncludedPaths, codeClean: state?.options.codeClean || defaultOptions.codeClean });
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
    if (!codeMaterialReviewed) {
      showToast('请先在代码材料区域完成代码鉴别材料核对', 'info');
      scrollToElement(codeSectionRef.current);
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
      showToast('草稿已确认，下一步请在申报辅助中完成人工复核', 'success');
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

  function handleDraftRestored(result: SoftwareCopyrightDraftFile & { state: SoftwareCopyrightState }) {
    setDraftFile(result);
    setDraftContent(result.content);
    setDraftDirty(false);
    setState(result.state);
    setValidation(null);
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
      const result = await window.yibiao?.softwareCopyright.regenerateCodeMaterial({ fields, sourceMode, codeExcludedPaths, codeIncludedPaths, codeClean: state?.options.codeClean || defaultOptions.codeClean });
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

  async function handleConfirmCodeMaterialReview() {
    setCodeReviewSaving(true);
    try {
      const nextState = await window.yibiao?.softwareCopyright.saveCodeMaterialReview({ checks: codeReviewChecks, notes: codeReviewNotes });
      if (nextState) setState(nextState);
      setValidation(null);
      showToast('代码鉴别材料已核对，可以继续运行完整检查并确认草稿', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存代码材料核对结果失败', 'error');
    } finally {
      setCodeReviewSaving(false);
    }
  }

  async function refreshWorkbenchState() {
    const nextState = await window.yibiao?.softwareCopyright.loadState();
    if (nextState) {
      setState(nextState);
      setFields((current) => ({ ...current, ...nextState.fields }));
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

  function scrollToElement(element: HTMLElement | null) {
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    element.classList.remove('is-readiness-target');
    window.requestAnimationFrame(() => element.classList.add('is-readiness-target'));
    window.setTimeout(() => element.classList.remove('is-readiness-target'), 1600);
  }

  function handleWorkflowNavigate(section: SoftwareCopyrightWorkflowSection, element: HTMLElement | null) {
    if (!element) return;
    setActiveWorkflowSection(section);
    scrollToElement(element);
  }

  function focusRegistrationField(key: string) {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-software-copyright-field="${key}"] input, [data-software-copyright-field="${key}"] textarea`);
    const field = input?.closest<HTMLElement>('[data-software-copyright-field]') || null;
    scrollToElement(field || fieldsSectionRef.current);
    window.setTimeout(() => input?.focus({ preventScroll: true }), 260);
  }

  function handleReadinessNavigate(target: SubmissionReadinessTarget) {
    const targets: Record<SubmissionReadinessTarget, HTMLElement | null> = {
      source: sourceSectionRef.current,
      fields: fieldsSectionRef.current,
      manual: manualSectionRef.current || draftsSectionRef.current || settingsSectionRef.current,
      code: codeSectionRef.current,
      settings: settingsSectionRef.current,
      task: taskSectionRef.current,
      drafts: draftsSectionRef.current,
      submission: submissionSectionRef.current,
    };
    scrollToElement(targets[target]);
    if (target === 'fields' && missingFields[0]) focusRegistrationField(missingFields[0]);
  }

  function navigateToManualTitle() {
    if (draftDirty && activeDraftKey !== 'manual') {
      showToast('当前草稿有未保存修改，请先保存后再核对操作手册标题', 'info');
      return;
    }
    if (state?.drafts?.manual) handleSelectDraft('manual');
    setDraftViewMode('structure');
    setActiveWorkflowSection('drafts');
    setManualTitleFocusRequest((current) => current + 1);
    scrollToElement(draftsSectionRef.current);
  }

  function handleValidationIssueNavigate(issue: SoftwareCopyrightDraftValidationIssue) {
    if (issue.type === 'field') {
      if (issue.key) focusRegistrationField(issue.key);
      else scrollToElement(fieldsSectionRef.current);
      return;
    }
    if (issue.type === 'code' || (issue.type === 'consistency' && issue.key === 'codeManifest')) {
      scrollToElement(codeSectionRef.current);
      return;
    }
    if (issue.type === 'consistency' && issue.key === 'manual') {
      navigateToManualTitle();
      return;
    }
    if (issue.key === 'manual' || issue.key === 'ai' || issue.key === 'image-placement') {
      if (issue.key === 'manual' && state?.drafts?.manual && !draftDirty) {
        handleSelectDraft('manual');
        setDraftViewMode('structure');
      }
      scrollToElement(manualSectionRef.current || draftsSectionRef.current);
      return;
    }
    if (issue.key && state?.drafts?.[issue.key] && !draftDirty) handleSelectDraft(issue.key);
    scrollToElement(draftsSectionRef.current);
  }

  function handleConsistencyNavigate(check: SoftwareCopyrightConsistencyCheck) {
    if (check.target === 'fields') {
      focusRegistrationField(check.id === 'source-line-count' ? 'sourceLineCount' : missingFields[0] || 'softwareName');
      return;
    }
    if (check.target === 'code') {
      scrollToElement(codeSectionRef.current);
      return;
    }
    if (check.target === 'manual') {
      navigateToManualTitle();
      return;
    }
    const draftKey = check.target === 'application' ? 'application' : 'manual';
    if (state?.drafts?.[draftKey] && !draftDirty) {
      handleSelectDraft(draftKey);
      if (draftKey === 'manual') setDraftViewMode('structure');
    }
    scrollToElement(draftsSectionRef.current);
  }

  if (loading) {
    return <div className="software-copyright-page"><div className="software-copyright-empty">正在读取软著生成状态...</div></div>;
  }

  return (
    <div className="software-copyright-page">
      <section className="software-copyright-header">
        <div>
          <span className="section-kicker">材料生成</span>
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
          <button type="button" className="secondary-action" onClick={onBackToProjects} disabled={Boolean(isRunning || draftDirty)}>返回项目列表</button>
          <button type="button" className="secondary-action" onClick={handleSelectProject} disabled={isRunning}>选择源码目录</button>
          <button type="button" className="secondary-action" onClick={handleOpenOutputDir}>打开输出目录</button>
          <button type="button" className="danger-action" onClick={handleClear} disabled={isRunning}>清空</button>
        </div>
      </section>

      <nav className="software-copyright-workflow-nav" aria-label="软著材料工作阶段">
        <button
          type="button"
          className={activeWorkflowSection === 'source' ? 'is-active' : ''}
          aria-current={activeWorkflowSection === 'source' ? 'step' : undefined}
          onClick={() => handleWorkflowNavigate('source', sourceSectionRef.current)}
        >
          <span>项目源码</span><small>目录、素材与代码范围</small>
        </button>
        <button
          type="button"
          className={activeWorkflowSection === 'fields' ? 'is-active' : ''}
          aria-current={activeWorkflowSection === 'fields' ? 'step' : undefined}
          onClick={() => handleWorkflowNavigate('fields', fieldsSectionRef.current)}
        >
          <span>登记信息</span><small>申请字段与功能说明</small>
        </button>
        <button
          type="button"
          className={activeWorkflowSection === 'task' ? 'is-active' : ''}
          aria-current={activeWorkflowSection === 'task' ? 'step' : undefined}
          onClick={() => handleWorkflowNavigate('task', taskSectionRef.current)}
        >
          <span>生成控制</span><small>生成、检查与确认</small>
        </button>
        <button
          type="button"
          className={activeWorkflowSection === 'drafts' ? 'is-active' : ''}
          aria-current={activeWorkflowSection === 'drafts' ? 'step' : undefined}
          onClick={() => handleWorkflowNavigate('drafts', draftsSectionRef.current)}
          disabled={!hasDrafts}
        >
          <span>草稿审阅</span><small>{hasDrafts ? `${draftEntries.length} 份材料待核对` : '生成后可审阅'}</small>
        </button>
        <button
          type="button"
          className={activeWorkflowSection === 'result' ? 'is-active' : ''}
          aria-current={activeWorkflowSection === 'result' ? 'step' : undefined}
          onClick={() => handleWorkflowNavigate('result', finalExportSectionRef.current)}
        >
          <span>总检与导出</span><small>{state?.outputs?.length ? `${state.outputs.length} 项输出` : preExportReady ? '可正式导出' : '总检通过后导出'}</small>
        </button>
      </nav>

      <SoftwareCopyrightJourneyGuide steps={journeySteps} />

      <div className="software-copyright-layout">
        <main className="software-copyright-main">
          <section className="software-copyright-panel software-copyright-stage-source" ref={sourceSectionRef}>
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
                选择源码目录
              </button>
              <button
                type="button"
                className={sourceMode === 'code-generation' ? 'is-active' : ''}
                onClick={() => void handleSourceModeChange('code-generation')}
                disabled={isRunning || !state?.codeGeneration?.available}
              >
                使用源码准备结果
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
              <div className="software-copyright-empty">{sourceMode === 'code-generation' ? '请先到源码准备页面选择当前项目的源码目录并确认素材。' : '请选择当前软著项目对应的源码目录。'}</div>
            )}
          </section>

          {state?.options.screenshotMode === 'manual' && (
            <section className="software-copyright-panel software-copyright-stage-manual" ref={manualSectionRef}>
              <div className="software-copyright-panel-head">
                <div>
                  <span className="section-kicker">手册素材</span>
                  <h3>界面截图与图注</h3>
                </div>
                <span className="software-copyright-screenshot-count">{state.manualScreenshots?.length || 0} / 30</span>
              </div>
              <ManualScreenshotManager
                screenshots={state.manualScreenshots || []}
                placeholders={availableManualPlaceholders}
                disabled={Boolean(isRunning || screenshotSaving)}
                onImport={() => void handleImportManualScreenshots()}
                onCaptionChange={(id, caption) => void handleUpdateManualScreenshot(id, caption)}
                onPlacementChange={(id, placement) => void handleUpdateManualScreenshot(id, state.manualScreenshots.find((item) => item.id === id)?.caption || '', placement)}
                onReorder={(ids) => void handleReorderManualScreenshots(ids)}
                onRemove={(id) => void handleRemoveManualScreenshot(id)}
              />
              <ManualAssetReviewPanel
                assetCount={state.manualScreenshots?.length || 0}
                review={state.manualAssetReview}
                saving={manualAssetReviewSaving}
                disabled={Boolean(isRunning || screenshotSaving)}
                onConfirm={(checks, notes) => void handleConfirmManualAssetReview(checks, notes)}
              />
            </section>
          )}

          {state?.options.screenshotMode === 'ai' && (
            <section className="software-copyright-panel software-copyright-stage-manual" ref={manualSectionRef}>
              <div className="software-copyright-panel-head">
                <div>
                  <span className="section-kicker">手册素材</span>
                  <h3>AI 功能示意图</h3>
                </div>
                <span className="software-copyright-screenshot-count">{state.aiIllustrations?.length || 0} / 6</span>
              </div>
              <AiIllustrationManager
                illustrations={state.aiIllustrations || []}
                placeholders={availableManualPlaceholders}
                prompt={aiIllustrationPrompt}
                style={state.aiIllustrationSettings?.style || 'engineering_diagram'}
                modelAvailable={Boolean(state.imageModel.available)}
                modelMessage={state.imageModel.message}
                disabled={Boolean(isRunning || aiIllustrationSaving)}
                generating={aiIllustrationGenerating}
                generatingPrompt={aiIllustrationPromptGenerating}
                regeneratingId={aiIllustrationRegeneratingId}
                onSettingsChange={(settings) => void handleSaveAiIllustrationSettings(settings)}
                onGeneratePrompt={(style) => void handleGenerateAiIllustrationPrompt(style)}
                onRegenerate={(id, settings) => void handleRegenerateAiIllustration(id, settings)}
                onGenerate={(settings) => void handleGenerateAiIllustration(settings)}
                onCaptionChange={(id, caption) => void handleUpdateAiIllustration(id, caption)}
                onPlacementChange={(id, placement) => void handleUpdateAiIllustration(id, state.aiIllustrations.find((item) => item.id === id)?.caption || '', placement)}
                onReorder={(ids) => void handleReorderAiIllustrations(ids)}
                onRemove={(id) => void handleRemoveAiIllustration(id)}
              />
              <ManualAssetReviewPanel
                assetCount={state.aiIllustrations?.length || 0}
                review={state.manualAssetReview}
                saving={manualAssetReviewSaving}
                disabled={Boolean(isRunning || aiIllustrationSaving || aiIllustrationGenerating || aiIllustrationRegeneratingId)}
                onConfirm={(checks, notes) => void handleConfirmManualAssetReview(checks, notes)}
              />
            </section>
          )}

          <section className="software-copyright-panel software-copyright-stage-code" ref={codeSectionRef}>
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">代码材料</span>
                <h3>抽取清单预览</h3>
              </div>
              <div className="software-copyright-code-actions">
                {codeManifest && (
                  <em className={`software-copyright-task-status is-${codeMaterialReviewed ? 'success' : 'running'}`}>
                    {codeMaterialReviewed ? '已核对' : '需核对'}
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
                  {codeMaterialReviewed
                    ? `已于 ${new Date(state?.codeMaterialReview?.confirmedAt || '').toLocaleString()} 完成人工核对。重新抽取后需再次确认。`
                    : codeMaterialReady
                    ? codeManifest.total_pages >= 60
                      ? '材料已按每页50行整理为前30页和后30页，请继续核对并确认。'
                      : '源码不足60页，已纳入全部有效代码，请继续核对并确认。'
                    : '代码材料存在退回风险，请先处理审查问题。'}
                </div>
                <CodeMaterialReview
                  manifest={codeManifest}
                  excludedPaths={codeExcludedPaths}
                  disabled={Boolean(isRunning || regeneratingCode)}
                  onExcludeFile={(filePath) => void handleToggleCodeExcludedPath(filePath, true)}
                />
                <div className={`software-copyright-code-confirm ${codeMaterialReviewed ? 'is-confirmed' : ''}`}>
                  <div className="software-copyright-code-confirm-head">
                    <div>
                      <strong>{codeMaterialReviewed ? '代码鉴别材料已确认' : '完成代码材料核对'}</strong>
                      <span>请查看上方分页预览和抽取清单后逐项确认；修改抽取范围会使本次确认失效。</span>
                    </div>
                    {codeMaterialReviewed && <em>已核对</em>}
                  </div>
                  <div className="software-copyright-code-confirm-checks">
                    {([
                      ['pageRange', '页数与分页', '已检查前后页范围、每页行数和末页内容。'],
                      ['sourceScope', '源码范围', '已确认入口、页面、业务服务和数据处理等核心代码已覆盖。'],
                      ['readability', '可读性与脱敏', '已抽查代码连续性、长行折断效果及敏感信息脱敏结果。'],
                    ] as Array<[keyof SoftwareCopyrightCodeMaterialReviewChecks, string, string]>).map(([key, label, description]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={codeReviewChecks[key]}
                          onChange={(event) => setCodeReviewChecks((current) => ({ ...current, [key]: event.target.checked }))}
                          disabled={Boolean(isRunning || regeneratingCode || codeReviewSaving)}
                        />
                        <span><strong>{label}</strong><small>{description}</small></span>
                      </label>
                    ))}
                  </div>
                  <label className="software-copyright-code-confirm-notes">
                    <span>核对备注（选填）</span>
                    <textarea
                      value={codeReviewNotes}
                      onChange={(event) => setCodeReviewNotes(event.target.value)}
                      placeholder="例如：已重点抽查登录、项目管理和材料导出相关代码。"
                      maxLength={500}
                      disabled={Boolean(isRunning || regeneratingCode || codeReviewSaving)}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void handleConfirmCodeMaterialReview()}
                    disabled={!codeMaterialReady || !Object.values(codeReviewChecks).every(Boolean) || codeReviewSaving || isRunning || regeneratingCode}
                  >
                    {codeReviewSaving ? '保存中...' : codeMaterialReviewed ? '更新核对记录' : '确认代码鉴别材料'}
                  </button>
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

          <section className="software-copyright-panel software-copyright-stage-fields" ref={fieldsSectionRef}>
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">申请字段</span>
                <h3>基础信息</h3>
              </div>
              <button type="button" className="secondary-action" onClick={handleSaveFields} disabled={saving || isRunning}>{saving ? '保存中' : '保存字段'}</button>
            </div>
            <div className="software-copyright-form-grid">
              {basicFieldRows.map((field) => (
                <label className="software-copyright-field" data-software-copyright-field={field.key} key={field.key}>
                  <span>{field.label}</span>
                  <input type={field.inputType || 'text'} value={fields[field.key]} placeholder={field.placeholder} onChange={(event) => updateField(field.key, event.target.value)} disabled={isRunning} />
                </label>
              ))}
            </div>
          </section>

          <section className="software-copyright-panel software-copyright-stage-environment">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">环境与功能</span>
                <h3>官网填报辅助字段</h3>
              </div>
              <div className="software-copyright-panel-head-actions">
                {missingFields.length > 0 && <span className="software-copyright-warning">有 {missingFields.length} 项建议补全</span>}
                <button type="button" className="secondary-action" onClick={handleSaveFields} disabled={saving || isRunning}>
                  {saving ? '保存中' : '保存字段'}
                </button>
              </div>
            </div>
            <div className="software-copyright-form-grid">
              {environmentFieldRows.map((field) => (
                <label className="software-copyright-field" data-software-copyright-field={field.key} key={field.key}>
                  <span>{field.label}</span>
                  <input value={fields[field.key]} placeholder={field.placeholder} onChange={(event) => updateField(field.key, event.target.value)} disabled={isRunning} />
                </label>
              ))}
            </div>
            <label className="software-copyright-field is-wide" data-software-copyright-field="mainFunctions">
              <span>软件的主要功能</span>
              <textarea value={fields.mainFunctions} placeholder="可留空由文本模型根据项目证据生成，建议提交前人工核对。" onChange={(event) => updateField('mainFunctions', event.target.value)} disabled={isRunning} />
            </label>
            <div className="software-copyright-field is-wide" data-software-copyright-field="technicalFeatures">
              <div className="software-copyright-field-head">
                <span>软件的技术特点</span>
                <button
                  type="button"
                  className="secondary-action software-copyright-ai-field-action"
                  onClick={() => void handleGenerateTechnicalFeatures()}
                  disabled={!hasSource || isRunning || generatingTechnicalFeatures}
                >
                  {generatingTechnicalFeatures ? 'AI生成中...' : 'AI生成技术特点'}
                </button>
              </div>
              <textarea value={fields.technicalFeatures} placeholder="例如 Electron 桌面应用、AI 文档生成、Markdown/Word 导出等，≤100字符更适合官网字段。" onChange={(event) => updateField('technicalFeatures', event.target.value)} disabled={isRunning} />
              <small className="software-copyright-field-helper">根据当前源码技术栈、编程语言、主要功能和项目说明生成，结果仍需人工核对。</small>
            </div>
          </section>

          <div className="software-copyright-workflow-host" ref={setWorkflowHost} />

          <section className="software-copyright-panel software-copyright-submission-panel" ref={submissionSectionRef}>
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">申报辅助</span>
                <h3>官网字段映射与提交前检查</h3>
              </div>
            </div>
            <SubmissionAssistant
              revision={state?.updated_at}
              onReviewSaved={() => void refreshWorkbenchState()}
              onReviewChanged={setSubmissionPrecheckReady}
            />
          </section>

          <div className="software-copyright-readiness-host" ref={readinessSectionRef}>
            <SubmissionReadinessPanel
              items={readinessItems}
              checking={validating}
              canCheck={canValidateDraft}
              onCheck={() => void handleValidateDraft()}
              onNavigate={handleReadinessNavigate}
            />
          </div>

          <div className="software-copyright-final-host" ref={setFinalStageHost} />
        </main>

        <aside className="software-copyright-side">
          <section className="software-copyright-panel software-copyright-stage-settings" ref={settingsSectionRef}>
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
            <div className="software-copyright-screenshot-mode" role="radiogroup" aria-label="操作手册图片来源">
              <strong>操作手册图片</strong>
              {([
                ['skip', '不使用', '仅导出文字内容'],
                ['manual', '手动截图', '导入真实界面图片'],
                ['ai', 'AI示意图', '生成并审核功能插图'],
              ] as Array<[SoftwareCopyrightOptions['screenshotMode'], string, string]>).map(([value, label, description]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={(state?.options.screenshotMode || 'skip') === value}
                  className={(state?.options.screenshotMode || 'skip') === value ? 'is-active' : ''}
                  disabled={isRunning || (value === 'ai' && !state?.imageModel.available)}
                  onClick={() => void handleScreenshotModeChange(value)}
                  key={value}
                >
                  <strong>{label}</strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
            <div className="software-copyright-clean-options">
              <strong>源码整理规则</strong>
              {([
                ['removeComments', '删除源码注释'],
                ['removeBlankLines', '删除空行'],
                ['maskSensitive', '脱敏密钥和个人信息'],
                ['wrapLongLines', '按78列折断超长行'],
              ] as Array<[keyof SoftwareCopyrightOptions['codeClean'], string]>).map(([key, label]) => (
                <label className="software-copyright-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean((state?.options.codeClean || defaultOptions.codeClean)[key])}
                    onChange={(event) => void handleToggleCodeClean(key, event.target.checked)}
                    disabled={isRunning || regeneratingCode}
                  />
                  <span>{label}</span>
                </label>
              ))}
              <span>规则变更后点击“重新抽取”生效。</span>
            </div>
          </section>

          {workflowHost && createPortal(
            <>
          <section className="software-copyright-panel software-copyright-workflow-panel is-task" ref={taskSectionRef}>
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
            </div>
            {validation && (
              <div className={`software-copyright-validation is-${validation.valid ? 'valid' : 'invalid'}`}>
                <strong>{validation.valid ? '草稿检查通过' : `草稿检查未通过（${validation.issues.length} 项）`}</strong>
                {validation.issues.length ? (
                  <ul>
                    {validation.issues.map((issue, index) => (
                      <li key={`${issue.type}-${issue.key || index}-${issue.message}`}>
                        <button type="button" onClick={() => handleValidationIssueNavigate(issue)}>
                          <span>{issue.message}</span>
                          <em>去处理</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span>草稿检查已通过，可以继续确认草稿和完成提交前复核。</span>
                )}
              </div>
            )}
            {validation?.consistencyChecks?.length ? (
              <MaterialConsistencyReview checks={validation.consistencyChecks} onNavigate={handleConsistencyNavigate} />
            ) : null}
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

          <section className="software-copyright-panel software-copyright-workflow-panel is-drafts" ref={draftsSectionRef}>
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">草稿</span>
                <h3>待确认资料</h3>
              </div>
              <div className="software-copyright-draft-actions">
                {draftDirty && <span className="software-copyright-warning">未保存</span>}
                {state?.draftConfirmed && <span className="software-copyright-confirmed">已确认</span>}
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
                  {activeDraftKey === 'manual' && <button type="button" className={draftViewMode === 'structure' ? 'is-active' : ''} onClick={() => setDraftViewMode('structure')}>章节</button>}
                  <button type="button" className={draftViewMode === 'edit' ? 'is-active' : ''} onClick={() => setDraftViewMode('edit')}>编辑</button>
                  <button type="button" className={draftViewMode === 'preview' ? 'is-active' : ''} onClick={() => setDraftViewMode('preview')}>预览</button>
                  <button type="button" className={draftViewMode === 'history' ? 'is-active' : ''} disabled={draftDirty} onClick={() => setDraftViewMode('history')}>版本</button>
                </div>
                {draftLoading ? (
                  <div className="software-copyright-empty">正在读取草稿内容...</div>
                ) : draftViewMode === 'history' ? (
                  <DraftVersionHistory
                    draftKey={activeDraftKey}
                    revision={draftFile?.updatedAt}
                    disabled={Boolean(isRunning || draftSaving || draftDirty)}
                    onRestored={handleDraftRestored}
                  />
                ) : draftViewMode === 'structure' && activeDraftKey === 'manual' ? (
                  <ManualStructureEditor
                    markdown={draftContent}
                    assets={activeManualAssets}
                    expectedDocumentTitle={`${fields.softwareName.trim()} 操作手册`.trim()}
                    focusDocumentTitleRequest={manualTitleFocusRequest}
                    disabled={Boolean(isRunning || draftSaving)}
                    onChange={handleDraftContentChange}
                  />
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
                {draftViewMode !== 'history' && (
                  <button
                    type="button"
                    className="secondary-action software-copyright-draft-save"
                    onClick={handleSaveDraft}
                    disabled={!draftDirty || draftSaving || isRunning}
                  >
                    {draftSaving ? '保存中' : '保存草稿'}
                  </button>
                )}
                <span className="software-copyright-draft-path">{draftFile?.path}</span>
              </div>
            ) : (
              <div className="software-copyright-empty">生成草稿后会显示业务理解、申请表信息、操作手册、代码提取清单和代码材料 Markdown。</div>
            )}
          </section>

            </>,
            workflowHost,
          )}

          {finalStageHost && createPortal(
            <>
          <section ref={finalExportSectionRef} className={`software-copyright-panel software-copyright-final-export is-${preExportReady ? 'ready' : 'locked'}`}>
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">最后一步</span>
                <h3>导出正式资料</h3>
                <p>{preExportReady ? '提交前总检已通过，请选择交付内容并导出。' : '请先完成上方提交前总检，全部项目就绪后才能导出。'}</p>
              </div>
              <span className={`software-copyright-final-export-state is-${preExportReady ? 'ready' : 'locked'}`}>
                {preExportReady ? '总检通过' : '等待总检'}
              </span>
            </div>
            <div className="software-copyright-final-export-body">
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
              <button type="button" className="primary-action software-copyright-final-export-button" onClick={handleExportFinal} disabled={!canExportFinal}>
                {isRunning && task?.type === 'software-copyright-final-export' ? '正在导出正式资料...' : '导出正式资料'}
              </button>
            </div>
          </section>

          <section className="software-copyright-panel software-copyright-result-panel" ref={resultSectionRef}>
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
            <div className="software-copyright-batch-history-head">
              <strong>历史交付批次</strong>
              <span>每次导出均绑定确认快照并校验文件摘要</span>
            </div>
            <ExportBatchHistory revision={state?.updated_at} />
          </section>
            </>,
            finalStageHost,
          )}
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
                <Dialog.Title>确认导出正式资料</Dialog.Title>
                <Dialog.Description>
                  提交前总检已经通过，请最后确认软件信息和导出项目。
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

function SoftwareCopyrightPage() {
  const [view, setView] = useState<'projects' | 'workbench'>(() => {
    const shouldOpenWorkbench = window.localStorage.getItem('software-copyright-open-workbench') === 'true';
    if (shouldOpenWorkbench) window.localStorage.removeItem('software-copyright-open-workbench');
    return shouldOpenWorkbench ? 'workbench' : 'projects';
  });

  if (view === 'projects') {
    return <SoftwareCopyrightProjectsPage onEnterProject={() => setView('workbench')} />;
  }

  return <SoftwareCopyrightWorkbench onBackToProjects={() => setView('projects')} />;
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
