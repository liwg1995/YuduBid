import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { GrantApplicationPanel, GrantApplicationPanelInput, GrantApplicationProfile, GrantApplicationProjectList, GrantApplicationTaskState, GrantFormFieldMapping, GrantProposalFinalReview, GrantProposalModuleKey, GrantProposalModuleQuality, GrantProposalTemplateMapping, GrantProposalVisualSettings, GrantTemplateFillReport } from '../types';
import '../grantApplication.css';

export type GrantApplicationInitialPanel = GrantApplicationPanel;

interface GrantApplicationPageProps {
  initialPanel?: GrantApplicationInitialPanel;
  onNavigate?: (section: SectionId) => void;
}

interface GrantApplicationPanelCopy {
  section: SectionId;
  label: string;
  title: string;
  description: string;
  inputTitle: string;
  inputHelp: string;
  materialTitle: string;
  materialHelp: string;
  outputTitle: string;
  outputHelp: string;
  placeholder: string;
  materialPlaceholder: string;
  outputPlaceholder: string;
  steps: string[];
  checks: string[];
}

const defaultProfile: GrantApplicationProfile = {
  level: '市级',
  discipline: '教育学',
  direction: '',
  stage: '准备申报',
  deadline: '',
  sourceNotes: '',
};

const defaultProposalVisualSettings: GrantProposalVisualSettings = {
  useAiImage: false,
  useTechnicalDiagram: true,
  useMermaid: true,
};

const defaultProposalModuleQuality: GrantProposalModuleQuality = {
  status: 'unchecked',
  score: 0,
  summary: '',
  report: '',
  checked_at: '',
};

const defaultProposalFinalReview: GrantProposalFinalReview = {
  status: 'unchecked',
  score: 0,
  summary: '',
  report: '',
  checked_at: '',
};

const defaultFormFieldMapping: GrantFormFieldMapping = {
  profile: { level: '', discipline: '', direction: '', stage: '', deadline: '' },
  fields: [],
  summary: { total: 0, ready: 0, missing: 0, verify: 0, too_long: 0 },
  updated_at: '',
};

const defaultProposalTemplateMapping: GrantProposalTemplateMapping = {
  fileName: '',
  imported_at: '',
  sections: [],
  summary: { total: 0, matched: 0, missing: 0, unmatched: 0, verify: 0, too_long: 0 },
  rawMarkdown: '',
};

const defaultProposalTemplateFillReport: GrantTemplateFillReport = {
  filePath: '',
  generated_at: '',
  total: 0,
  filled: 0,
  skipped: 0,
  items: [],
};

interface GrantApplicationAiProgress {
  running: boolean;
  title: string;
  message: string;
  progress: number;
  panel?: GrantApplicationPanel;
  moduleKey?: GrantProposalModuleKey;
  moduleAction?: 'generate' | 'check' | 'polish';
}

const panelCopy: Record<GrantApplicationPanel, GrantApplicationPanelCopy> = {
  diagnosis: {
    section: 'grant-diagnosis',
    label: '启动诊断',
    title: '先判断课题处在哪个阶段，再给出申报路线',
    description: '承接新手引导、快捷模式和智能诊断，收集级别、学科、方向、材料与时间约束。',
    inputTitle: '诊断信息',
    inputHelp: '写清课题级别、申报渠道、学科方向、已有材料和卡点。',
    materialTitle: '已有材料',
    materialHelp: '可粘贴通知文件、申报指南、已有申报书、导师或单位要求。',
    outputTitle: '诊断结论',
    outputHelp: '用于确认后续走选题、撰写、检测还是答辩准备。',
    placeholder: '例如：准备申报县级教育科研课题，方向是小学数学项目化学习，还没有题目，月底截止。',
    materialPlaceholder: '粘贴申报通知、指南要求、已有题目、研究基础或单位限制。',
    outputPlaceholder: '诊断后应形成：级别判断、学科策略、材料缺口、推荐流程和本周任务。',
    steps: ['识别申报级别与学科', '判断当前阶段和材料完整度', '推荐最短可执行流程'],
    checks: ['级别是否明确', '截止时间是否可控', '已有材料是否足够进入撰写'],
  },
  'topic-policy': {
    section: 'grant-topic-policy',
    label: '选题与政策',
    title: '把方向压成政策契合、材料可撑、评审能看懂的题目',
    description: '用于政策情报、选题可行性、文献检索与研究空白分析。',
    inputTitle: '选题方向',
    inputHelp: '写清研究对象、实践场景、想解决的问题和申报级别。',
    materialTitle: '政策与文献依据',
    materialHelp: '可放申报指南、政策摘录、文献题录、校内实践材料或数据来源。',
    outputTitle: '选题方案',
    outputHelp: '建议输出候选题、政策对接点、研究空白和推荐题目。',
    placeholder: '例如：围绕“双减背景下初中英语分层作业设计”做市级课题选题评估。',
    materialPlaceholder: '粘贴政策条款、文献摘要、学校实践案例、已有课题名称或申报指南。',
    outputPlaceholder: '选题方案会包含候选题、政策契合度、创新点、风险点和文献检索建议。',
    steps: ['抓取申报指南里的关键词', '比对学科政策热点', '形成题目与研究空白'],
    checks: ['题目是否过大', '政策窗口是否匹配', '研究对象和样本是否可获得'],
  },
  proposal: {
    section: 'grant-proposal',
    label: '申报书撰写',
    title: '按级别生成能进入评审语境的申报书草稿',
    description: '用于申报书结构、前期基础、研究设计、实施计划和 Word 输出。',
    inputTitle: '撰写任务',
    inputHelp: '说明要生成整份申报书、某个模块，还是根据已有草稿重写。',
    materialTitle: '撰写依据',
    materialHelp: '建议提供申报模板、选题方案、前期成果、团队基础和评审要求。',
    outputTitle: '申报书草稿',
    outputHelp: '正文以可编辑 Markdown 承载，后续可接入标准 Word 导出。',
    placeholder: '例如：根据前面的选题，生成一份市级课题申报书，突出研究基础和实施路径。',
    materialPlaceholder: '粘贴申报书模板、已有研究基础、团队分工、预期成果和时间安排。',
    outputPlaceholder: '申报书草稿应包含研究背景、目标内容、方法路径、创新点、计划、成果和保障。',
    steps: ['匹配校/县/市/省/国家级模板', '组织研究内容和技术路线', '补齐前期基础与成果承诺'],
    checks: ['八要素是否完整', '前期基础是否可信', '研究计划是否能落地'],
  },
  'review-defense': {
    section: 'grant-review-defense',
    label: '评审优化与答辩',
    title: '像评审一样检查申报书，再准备成果和答辩',
    description: '覆盖八维检测、政策匹配、成果汇编、答辩演练与实施管理。',
    inputTitle: '优化任务',
    inputHelp: '说明要快速检查、深度评审、降 AI 味、准备答辩还是整理成果。',
    materialTitle: '待评审材料',
    materialHelp: '可粘贴申报书正文、结题报告、成果清单、评审意见或答辩问题。',
    outputTitle: '优化与答辩稿',
    outputHelp: '输出问题清单、修改优先级、答辩问题和实施管理建议。',
    placeholder: '例如：帮我深度检查这份省级申报书，重点看政策匹配、AI 痕迹和可行性。',
    materialPlaceholder: '粘贴申报书、评审反馈、成果材料、答辩稿或实施计划。',
    outputPlaceholder: '检测报告会包含严重问题、需关注问题、通过项、修改优先级和答辩问答。',
    steps: ['执行八维质量检测', '给出修改优先级和改写方向', '生成答辩问答与实施路线'],
    checks: ['政策引用是否准确', '成果承诺是否过满', '答辩风险是否提前准备'],
  },
};

const panelOrder: GrantApplicationPanel[] = ['diagnosis', 'topic-policy', 'proposal', 'review-defense'];

const proposalModuleDefinitions: Array<{ key: GrantProposalModuleKey; label: string; hint: string }> = [
  { key: 'project_name', label: '课题名称', hint: '候选题与推荐题' },
  { key: 'background', label: '研究背景', hint: '政策、问题与价值' },
  { key: 'goals', label: '研究目标', hint: '总体目标与具体目标' },
  { key: 'content', label: '研究内容', hint: '研究任务与产出' },
  { key: 'methods', label: '研究方法', hint: '方法与技术路线' },
  { key: 'innovation', label: '创新点', hint: '特色与创新表达' },
  { key: 'plan', label: '实施计划', hint: '阶段、任务与风险' },
  { key: 'outcomes', label: '预期成果', hint: '成果形式与交付' },
  { key: 'foundation', label: '研究基础', hint: '前期基础与团队' },
  { key: 'guarantee', label: '保障条件', hint: '组织与资源保障' },
];

function createDefaultInputs(): Record<GrantApplicationPanel, GrantApplicationPanelInput> {
  return {
    diagnosis: { taskText: '', materialText: '' },
    'topic-policy': { taskText: '', materialText: '' },
    proposal: { taskText: '', materialText: '' },
    'review-defense': { taskText: '', materialText: '' },
  };
}

function createDefaultOutputs(): Record<GrantApplicationPanel, string> {
  return {
    diagnosis: '',
    'topic-policy': '',
    proposal: '',
    'review-defense': '',
  };
}

function createDefaultProposalModules(): Record<GrantProposalModuleKey, string> {
  return proposalModuleDefinitions.reduce((modules, module) => ({
    ...modules,
    [module.key]: '',
  }), {} as Record<GrantProposalModuleKey, string>);
}

function createDefaultProposalModuleQualityChecks(): Record<GrantProposalModuleKey, GrantProposalModuleQuality> {
  return proposalModuleDefinitions.reduce((checks, module) => ({
    ...checks,
    [module.key]: defaultProposalModuleQuality,
  }), {} as Record<GrantProposalModuleKey, GrantProposalModuleQuality>);
}

function GrantApplicationPage({ initialPanel = 'diagnosis', onNavigate }: GrantApplicationPageProps) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<GrantApplicationProfile>(defaultProfile);
  const [inputs, setInputs] = useState<Record<GrantApplicationPanel, GrantApplicationPanelInput>>(createDefaultInputs);
  const [outputs, setOutputs] = useState<Record<GrantApplicationPanel, string>>(createDefaultOutputs);
  const [proposalModules, setProposalModules] = useState<Record<GrantProposalModuleKey, string>>(createDefaultProposalModules);
  const [proposalVisualSettings, setProposalVisualSettings] = useState<GrantProposalVisualSettings>(defaultProposalVisualSettings);
  const [proposalModuleQualityChecks, setProposalModuleQualityChecks] = useState<Record<GrantProposalModuleKey, GrantProposalModuleQuality>>(createDefaultProposalModuleQualityChecks);
  const [proposalFinalReview, setProposalFinalReview] = useState<GrantProposalFinalReview>(defaultProposalFinalReview);
  const [reviewDefenseReport, setReviewDefenseReport] = useState('');
  const [formFieldMapping, setFormFieldMapping] = useState<GrantFormFieldMapping>(defaultFormFieldMapping);
  const [proposalTemplateMapping, setProposalTemplateMapping] = useState<GrantProposalTemplateMapping>(defaultProposalTemplateMapping);
  const [proposalTemplateFillReport, setProposalTemplateFillReport] = useState<GrantTemplateFillReport>(defaultProposalTemplateFillReport);
  const [selectedProposalModule, setSelectedProposalModule] = useState<GrantProposalModuleKey>('background');
  const [task, setTask] = useState<GrantApplicationTaskState | undefined>();
  const [projectList, setProjectList] = useState<GrantApplicationProjectList>({ activeProjectId: 'default', projects: [] });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingProposalModule, setGeneratingProposalModule] = useState(false);
  const [generatingMissingProposalModules, setGeneratingMissingProposalModules] = useState(false);
  const [checkingProposalModules, setCheckingProposalModules] = useState(false);
  const [polishingProposalModules, setPolishingProposalModules] = useState(false);
  const [skippedProposalCheckModules, setSkippedProposalCheckModules] = useState<GrantProposalModuleKey[]>([]);
  const [checkingProposalModule, setCheckingProposalModule] = useState(false);
  const [checkingProposalFinalReview, setCheckingProposalFinalReview] = useState(false);
  const [polishingProposalModule, setPolishingProposalModule] = useState(false);
  const [savingProposalModule, setSavingProposalModule] = useState(false);
  const [generatingQualityReview, setGeneratingQualityReview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingOutput, setSavingOutput] = useState(false);
  const [outputMode, setOutputMode] = useState<'preview' | 'edit'>('preview');
  const [exportProgress, setExportProgress] = useState({ running: false, progress: 0, message: '', error: '' });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aiProgress, setAiProgress] = useState<GrantApplicationAiProgress>({ running: false, title: '', message: '', progress: 0 });
  const [exportingArtifact, setExportingArtifact] = useState<'json' | 'fields' | ''>('');
  const [loadingFormFields, setLoadingFormFields] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [fillingTemplate, setFillingTemplate] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [renameProjectOpen, setRenameProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [sideGuideOpen, setSideGuideOpen] = useState<'flow' | 'check' | ''>('');
  const [qualityReportDialog, setQualityReportDialog] = useState<{ title: string; content: string } | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [createProjectProfileDraft, setCreateProjectProfileDraft] = useState<GrantApplicationProfile>(defaultProfile);
  const [profileEditDraft, setProfileEditDraft] = useState<GrantApplicationProfile>(defaultProfile);
  const [projectBusy, setProjectBusy] = useState(false);
  const loadedRef = useRef(false);
  const copy = panelCopy[initialPanel] || panelCopy.diagnosis;
  const currentInput = inputs[initialPanel] || { taskText: '', materialText: '' };
  const outputText = outputs[initialPanel] || '';
  const generateDraftLabel = initialPanel === 'diagnosis' ? 'AI 诊断生成工作稿' : 'AI 生成工作稿';
  const legacyReviewReportInOutput = initialPanel === 'review-defense' && !reviewDefenseReport.trim() && isReviewQualityReportText(outputText);
  const visibleOutputText = legacyReviewReportInOutput ? '' : outputText;
  const visibleReviewDefenseReport = initialPanel === 'review-defense'
    ? (reviewDefenseReport.trim() || (legacyReviewReportInOutput ? outputText.trim() : ''))
    : reviewDefenseReport.trim();
  const isReviewReportProgress = initialPanel === 'review-defense' && aiProgress.panel === 'review-defense' && aiProgress.title === '八维检测报告';
  const isCurrentTaskRunning = task?.status === 'running' && task.type === initialPanel;
  const currentPanelIndex = panelOrder.indexOf(initialPanel);
  const nextPanel = currentPanelIndex >= 0 ? panelOrder[currentPanelIndex + 1] : undefined;
  const completedOutputCount = useMemo(() => panelOrder.filter((panel) => outputs[panel]?.trim()).length, [outputs]);
  const selectedProposalModuleDefinition = proposalModuleDefinitions.find((module) => module.key === selectedProposalModule) || proposalModuleDefinitions[0];
  const selectedProposalQuality = proposalModuleQualityChecks[selectedProposalModule] || defaultProposalModuleQuality;
  const completedProposalModuleCount = useMemo(
    () => proposalModuleDefinitions.filter((module) => proposalModules[module.key]?.trim()).length,
    [proposalModules],
  );
  const activeProjectName = useMemo(() => (
    projectList.projects.find((project) => project.id === projectList.activeProjectId)?.name
    || profile.direction
    || '课题申报'
  ), [profile.direction, projectList.activeProjectId, projectList.projects]);

  const profileSummary = useMemo(() => {
    const parts = [profile.level, profile.discipline, profile.stage].filter(Boolean);
    if (profile.direction.trim()) parts.push(profile.direction.trim());
    return parts.join(' · ') || '待补充课题档案';
  }, [profile]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      window.yibiao?.grantApplication.loadState(),
      window.yibiao?.grantApplication.listProjects(),
    ])
      .then(([state, projects]) => {
        if (!mounted) return;
        if (state) applyState(state);
        if (projects) setProjectList(projects);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取课题申报工作区失败', 'error'))
      .finally(() => {
        if (!mounted) return;
        loadedRef.current = true;
        setLoading(false);
      });

    const unsubscribe = window.yibiao?.grantApplication.onEvent((state) => {
      applyState(state);
      if (state.task?.status !== 'running') {
        setGenerating(false);
        setGeneratingQualityReview(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [showToast]);

  function applyState(state: {
    profile?: GrantApplicationProfile;
    inputs?: Record<GrantApplicationPanel, GrantApplicationPanelInput>;
    outputs?: Record<GrantApplicationPanel, string>;
    proposalModules?: Record<GrantProposalModuleKey, string>;
    proposalVisualSettings?: GrantProposalVisualSettings;
    proposalModuleQualityChecks?: Record<GrantProposalModuleKey, GrantProposalModuleQuality>;
    proposalFinalReview?: GrantProposalFinalReview;
    reviewDefenseReport?: string;
    proposalTemplateMapping?: GrantProposalTemplateMapping;
    proposalTemplateFillReport?: GrantTemplateFillReport;
    task?: GrantApplicationTaskState;
    projectId?: string;
  }) {
    setProfile(state.profile || defaultProfile);
    setInputs({ ...createDefaultInputs(), ...(state.inputs || {}) });
    setOutputs({ ...createDefaultOutputs(), ...(state.outputs || {}) });
    setProposalModules({ ...createDefaultProposalModules(), ...(state.proposalModules || {}) });
    setProposalVisualSettings({ ...defaultProposalVisualSettings, ...(state.proposalVisualSettings || {}) });
    setProposalModuleQualityChecks({ ...createDefaultProposalModuleQualityChecks(), ...(state.proposalModuleQualityChecks || {}) });
    setProposalFinalReview({ ...defaultProposalFinalReview, ...(state.proposalFinalReview || {}) });
    setReviewDefenseReport(String(state.reviewDefenseReport || ''));
    setProposalTemplateMapping({ ...defaultProposalTemplateMapping, ...(state.proposalTemplateMapping || {}) });
    setProposalTemplateFillReport({ ...defaultProposalTemplateFillReport, ...(state.proposalTemplateFillReport || {}) });
    setTask(state.task);
    if (state.projectId) {
      setProjectList((prev) => ({ ...prev, activeProjectId: state.projectId || prev.activeProjectId }));
    }
  }

  async function refreshProjects() {
    const projects = await window.yibiao?.grantApplication.listProjects();
    if (projects) setProjectList(projects);
    return projects;
  }

  useEffect(() => {
    if (!loadedRef.current || loading) return undefined;
    const timer = window.setTimeout(() => {
      const panel = initialPanel;
      void window.yibiao?.grantApplication.saveWorkspace({
        panel,
        profile,
        input: inputs[panel] || { taskText: '', materialText: '' },
        output: outputs[panel] || '',
      }).catch((error) => {
        console.warn('保存课题申报工作区失败', error);
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [initialPanel, inputs, loading, outputs, profile]);

  function openProfileEditor() {
    setProfileEditDraft(profile);
    setProfileEditOpen(true);
  }

  function saveProfileEditor() {
    setProfile(profileEditDraft);
    setProfileEditOpen(false);
    showToast('课题档案已更新', 'success');
  }

  function updateCurrentInput(field: keyof GrantApplicationPanelInput, value: string) {
    setInputs((prev) => ({
      ...prev,
      [initialPanel]: {
        ...(prev[initialPanel] || { taskText: '', materialText: '' }),
        [field]: value,
      },
    }));
  }

  function updateCurrentOutput(value: string) {
    setOutputs((prev) => ({ ...prev, [initialPanel]: value }));
  }

  function startAiProgress(title: string, message: string, moduleKey?: GrantProposalModuleKey, moduleAction?: GrantApplicationAiProgress['moduleAction']) {
    setAiProgress({ running: true, title, message, progress: 8, panel: initialPanel, moduleKey, moduleAction });
  }

  function updateAiProgress(progress: number, message: string, moduleKey?: GrantProposalModuleKey, moduleAction?: GrantApplicationAiProgress['moduleAction']) {
    setAiProgress((prev) => ({
      ...prev,
      running: true,
      progress: Math.max(8, Math.min(96, progress)),
      message,
      panel: prev.panel || initialPanel,
      moduleKey,
      moduleAction,
    }));
  }

  function finishAiProgress(message: string) {
    setAiProgress((prev) => ({ ...prev, running: false, progress: 100, message }));
  }

  function formatGrantApplicationError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/system memory overloaded|memory overloaded|overloaded/i.test(message)) {
      return '模型服务当前内存繁忙，已停止本次操作。请稍后重试，或减少撰写依据/材料长度后再检测。';
    }
    return message.replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '') || fallback;
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function switchPanel(panel: GrantApplicationPanel) {
    onNavigate?.(panelCopy[panel].section);
  }

  function navigateNextPanel() {
    if (!nextPanel) {
      showToast('当前已经是最后一个入口。', 'info');
      return;
    }
    if (visibleOutputText.trim()) {
      const nextInput = inputs[nextPanel] || { taskText: '', materialText: '' };
      const nextMaterial = [
        nextInput.materialText,
        `## ${copy.label}成果`,
        visibleOutputText.trim(),
      ].filter((item) => String(item || '').trim()).join('\n\n');
      setInputs((prev) => ({
        ...prev,
        [nextPanel]: {
          ...nextInput,
          materialText: nextMaterial,
        },
      }));
      void window.yibiao?.grantApplication.saveWorkspace({
        panel: nextPanel,
        profile,
        input: { ...nextInput, materialText: nextMaterial },
        output: outputs[nextPanel] || '',
      }).catch((error) => {
        console.warn('带入下一步材料失败', error);
      });
    }
    switchPanel(nextPanel);
  }

  function appendPreviousOutputsToMaterial() {
    const currentIndex = panelOrder.indexOf(initialPanel);
    const previousPanels = panelOrder.slice(0, Math.max(0, currentIndex));
    const context = previousPanels
      .map((panel) => {
        const content = outputs[panel]?.trim();
        return content ? `## ${panelCopy[panel].label}成果\n\n${content}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    if (!context) {
      showToast('暂无可带入的前序成果。', 'info');
      return;
    }

    const nextMaterial = [
      currentInput.materialText,
      '## 前序阶段成果',
      context,
    ].filter((item) => String(item || '').trim()).join('\n\n');
    updateCurrentInput('materialText', nextMaterial);
    showToast('已带入前序阶段成果', 'success');
  }

  async function saveCurrentOutput() {
    try {
      setSavingOutput(true);
      const state = await window.yibiao?.grantApplication.saveOutput({ panel: initialPanel, output: visibleOutputText });
      if (state) {
        applyState(state);
      }
      showToast('工作稿已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存工作稿失败', 'error');
    } finally {
      setSavingOutput(false);
    }
  }

  async function generateWithAi() {
    try {
      setGenerating(true);
      startAiProgress(generateDraftLabel, `正在生成“${copy.label}”阶段工作稿。`);
      const state = await window.yibiao?.grantApplication.generate({
        panel: initialPanel,
        profile,
        input: currentInput,
      });
      updateAiProgress(86, '正在整理生成结果并写入工作区。');
      if (state) {
        applyState(state);
      }
      finishAiProgress('工作稿已生成');
      showToast('课题申报工作稿已生成', 'success');
    } catch (error) {
      setAiProgress((prev) => ({ ...prev, running: false, message: '生成失败，请检查模型配置或输入材料。' }));
      showToast(error instanceof Error ? error.message : '生成课题申报工作稿失败', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function updateProposalModule(moduleKey: GrantProposalModuleKey, value: string) {
    setProposalModules((prev) => ({ ...prev, [moduleKey]: value }));
  }

  async function updateProposalVisualSetting(field: keyof GrantProposalVisualSettings, value: boolean) {
    const settings = { ...proposalVisualSettings, [field]: value };
    setProposalVisualSettings(settings);
    try {
      const state = await window.yibiao?.grantApplication.saveProposalVisualSettings({ settings });
      if (state) applyState(state);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存图示设置失败', 'error');
    }
  }

  async function saveSelectedProposalModule() {
    try {
      setSavingProposalModule(true);
      const state = await window.yibiao?.grantApplication.saveProposalModule({
        moduleKey: selectedProposalModule,
        content: proposalModules[selectedProposalModule] || '',
      });
      if (state) applyState(state);
      setOutputMode('preview');
      showToast('申报书模块已保存并合并', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存申报书模块失败', 'error');
    } finally {
      setSavingProposalModule(false);
    }
  }

  async function generateSelectedProposalModule() {
    try {
      setGeneratingProposalModule(true);
      startAiProgress('生成当前模块', `正在生成“${selectedProposalModuleDefinition.label}”。`, selectedProposalModule, 'generate');
      const state = await window.yibiao?.grantApplication.generateProposalModule({
        moduleKey: selectedProposalModule,
        profile,
        input: currentInput,
      });
      updateAiProgress(86, `正在合并“${selectedProposalModuleDefinition.label}”到申报书草稿。`, selectedProposalModule, 'generate');
      if (state) applyState(state);
      setOutputMode('preview');
      finishAiProgress(`${selectedProposalModuleDefinition.label}已生成`);
      showToast(`${selectedProposalModuleDefinition.label}已生成`, 'success');
    } catch (error) {
      setAiProgress((prev) => ({ ...prev, running: false, message: '模块生成失败，请稍后重试。' }));
      showToast(error instanceof Error ? error.message : '生成申报书模块失败', 'error');
    } finally {
      setGeneratingProposalModule(false);
    }
  }

  async function generateMissingProposalModules() {
    const missingModules = proposalModuleDefinitions.filter((module) => !proposalModules[module.key]?.trim());
    if (!missingModules.length) {
      showToast('申报书模块已经全部生成。', 'info');
      return;
    }

    try {
      setGeneratingMissingProposalModules(true);
      startAiProgress('批量生成模块', `准备按顺序生成 ${missingModules.length} 个缺失模块。`, missingModules[0]?.key, 'generate');
      for (const [index, module] of missingModules.entries()) {
        setSelectedProposalModule(module.key);
        updateAiProgress(
          Math.round((index / missingModules.length) * 82) + 10,
          `正在生成 ${index + 1}/${missingModules.length}：${module.label}`,
          module.key,
          'generate',
        );
        const state = await window.yibiao?.grantApplication.generateProposalModule({
          moduleKey: module.key,
          profile,
          input: currentInput,
        });
        if (state) applyState(state);
      }
      updateAiProgress(92, '正在合并模块内容并刷新申报书草稿。');
      setOutputMode('preview');
      finishAiProgress('缺失模块已批量生成');
      showToast('缺失模块已补齐并合并', 'success');
    } catch (error) {
      setAiProgress((prev) => ({ ...prev, running: false, message: '批量生成失败，请检查已生成内容后重试。' }));
      showToast(error instanceof Error ? error.message : '补齐申报书模块失败', 'error');
    } finally {
      setGeneratingMissingProposalModules(false);
    }
  }

  async function checkProposalModulesInOrder() {
    const generatedModules = proposalModuleDefinitions.filter((module) => proposalModules[module.key]?.trim());
    const skippedModules = proposalModuleDefinitions.filter((module) => !proposalModules[module.key]?.trim());
    if (!generatedModules.length) {
      showToast('暂无可检测的申报书模块，请先生成或填写模块内容。', 'info');
      return;
    }

    try {
      setCheckingProposalModules(true);
      setSkippedProposalCheckModules([]);
      startAiProgress('批量检测模块', `准备按顺序检测 ${generatedModules.length} 个已生成模块，${skippedModules.length} 个未生成模块会跳过。`, generatedModules[0]?.key, 'check');
      for (const [index, module] of generatedModules.entries()) {
        setSelectedProposalModule(module.key);
        updateAiProgress(
          Math.round((index / generatedModules.length) * 82) + 10,
          `正在检测 ${index + 1}/${generatedModules.length}：${module.label}`,
          module.key,
          'check',
        );
        const checkedState = await window.yibiao?.grantApplication.generateProposalModuleQualityCheck({
          moduleKey: module.key,
          profile,
          input: currentInput,
        });
        if (checkedState) {
          applyState(checkedState);
        }
        if (index < generatedModules.length - 1) {
          await wait(650);
        }
      }
      const skippedKeys = skippedModules.map((module) => module.key);
      setSkippedProposalCheckModules(skippedKeys);
      updateAiProgress(92, skippedModules.length ? `正在汇总检测结果，${skippedModules.length} 个未生成模块已跳过。` : '正在汇总模块检测结果。');
      finishAiProgress(skippedModules.length ? `已检测 ${generatedModules.length} 个模块，跳过 ${skippedModules.length} 个未生成模块` : '模块批量检测完成');
      showToast(skippedModules.length ? `已检测 ${generatedModules.length} 个模块，${skippedModules.length} 个未生成模块已跳过` : '已按顺序完成模块质量检测', 'success');
      if (skippedKeys.length) {
        window.setTimeout(() => setSkippedProposalCheckModules([]), 5000);
      }
    } catch (error) {
      const message = formatGrantApplicationError(error, '批量检测申报书模块失败');
      setAiProgress((prev) => ({ ...prev, running: false, message }));
      showToast(message, 'error');
    } finally {
      setCheckingProposalModules(false);
    }
  }

  async function checkSelectedProposalModule() {
    try {
      setCheckingProposalModule(true);
      startAiProgress('检查当前模块', `正在检测“${selectedProposalModuleDefinition.label}”的完整性、风险和修改建议。`, selectedProposalModule, 'check');
      const state = await window.yibiao?.grantApplication.generateProposalModuleQualityCheck({
        moduleKey: selectedProposalModule,
        profile,
        input: currentInput,
      });
      updateAiProgress(86, `正在写入“${selectedProposalModuleDefinition.label}”检测结果。`, selectedProposalModule, 'check');
      if (state) applyState(state);
      finishAiProgress(`${selectedProposalModuleDefinition.label}质量检查已完成`);
      showToast(`${selectedProposalModuleDefinition.label}质量检查已完成`, 'success');
    } catch (error) {
      const message = formatGrantApplicationError(error, '检查申报书模块失败');
      setAiProgress((prev) => ({ ...prev, running: false, message }));
      showToast(message, 'error');
    } finally {
      setCheckingProposalModule(false);
    }
  }

  async function polishSelectedProposalModule() {
    try {
      setPolishingProposalModule(true);
      startAiProgress('按意见优化模块', `正在根据检查意见优化“${selectedProposalModuleDefinition.label}”。`, selectedProposalModule, 'polish');
      const state = await window.yibiao?.grantApplication.polishProposalModule({
        moduleKey: selectedProposalModule,
        profile,
        input: currentInput,
      });
      updateAiProgress(86, `正在保存“${selectedProposalModuleDefinition.label}”优化结果。`, selectedProposalModule, 'polish');
      if (state) applyState(state);
      setOutputMode('preview');
      finishAiProgress(`${selectedProposalModuleDefinition.label}已优化`);
      showToast(`${selectedProposalModuleDefinition.label}已按检查意见优化`, 'success');
    } catch (error) {
      setAiProgress((prev) => ({ ...prev, running: false, message: '模块优化失败，请稍后重试。' }));
      showToast(error instanceof Error ? error.message : '优化申报书模块失败', 'error');
    } finally {
      setPolishingProposalModule(false);
    }
  }

  async function polishProposalModulesInOrder() {
    const generatedModules = proposalModuleDefinitions.filter((module) => proposalModules[module.key]?.trim());
    if (!generatedModules.length) {
      showToast('暂无可优化的申报书模块，请先批量生成或填写模块内容。', 'info');
      return;
    }

    try {
      setPolishingProposalModules(true);
      startAiProgress('批量优化模块', `准备按顺序优化 ${generatedModules.length} 个已生成模块。`, generatedModules[0]?.key, 'polish');
      for (const [index, module] of generatedModules.entries()) {
        setSelectedProposalModule(module.key);
        updateAiProgress(
          Math.round((index / generatedModules.length) * 82) + 10,
          `正在优化 ${index + 1}/${generatedModules.length}：${module.label}`,
          module.key,
          'polish',
        );
        const state = await window.yibiao?.grantApplication.polishProposalModule({
          moduleKey: module.key,
          profile,
          input: currentInput,
        });
        if (state) applyState(state);
        if (index < generatedModules.length - 1) {
          await wait(650);
        }
      }
      updateAiProgress(92, '正在合并优化后的模块内容并刷新申报书草稿。');
      setOutputMode('preview');
      finishAiProgress('模块批量优化完成');
      showToast('已按顺序优化申报书模块', 'success');
    } catch (error) {
      const message = formatGrantApplicationError(error, '批量优化申报书模块失败');
      setAiProgress((prev) => ({ ...prev, running: false, message }));
      showToast(message, 'error');
    } finally {
      setPolishingProposalModules(false);
    }
  }

  async function checkProposalFinalReview() {
    try {
      setCheckingProposalFinalReview(true);
      startAiProgress('整稿质量检查', '正在从完整性、政策契合、落地性和评审风险维度检查整稿。');
      const state = await window.yibiao?.grantApplication.generateProposalFinalReview({
        profile,
        input: inputs.proposal || currentInput,
      });
      updateAiProgress(88, '正在汇总整稿质量检查报告。');
      if (state) applyState(state);
      finishAiProgress('整稿质量检查已完成');
      showToast('整稿质量检查已完成', 'success');
    } catch (error) {
      setAiProgress((prev) => ({ ...prev, running: false, message: '整稿质量检查失败，请稍后重试。' }));
      showToast(error instanceof Error ? error.message : '整稿质量检查失败', 'error');
    } finally {
      setCheckingProposalFinalReview(false);
    }
  }

  async function generateQualityReview() {
    try {
      setGeneratingQualityReview(true);
      startAiProgress('八维检测报告', '正在从评审视角生成问题清单、修改优先级和答辩风险。');
      const state = await window.yibiao?.grantApplication.generateQualityReview({
        profile,
        input: currentInput,
      });
      updateAiProgress(88, '正在整理八维检测报告。');
      if (state) {
        applyState(state);
      }
      setOutputMode('preview');
      finishAiProgress('八维检测报告已生成');
      showToast('八维检测报告已生成', 'success');
    } catch (error) {
      setAiProgress((prev) => ({ ...prev, running: false, message: '八维检测报告生成失败，请稍后重试。' }));
      showToast(error instanceof Error ? error.message : '生成八维检测报告失败', 'error');
    } finally {
      setGeneratingQualityReview(false);
    }
  }

  async function importMaterial() {
    try {
      setImporting(true);
      const result = await window.yibiao?.grantApplication.importMaterial({ panel: initialPanel });
      if (!result) return;
      if (!result.success) {
        showToast(result.message || '已取消导入', result.message === '已取消选择' ? 'info' : 'error');
        return;
      }
      applyState(result.state);
      showToast(result.message || '材料已导入', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入材料失败', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function exportWord(exportAll = false) {
    const outline = exportAll
      ? panelOrder
        .map((panel) => ({
          id: `grant-${panel}`,
          title: panelCopy[panel].label,
          description: '',
          content: normalizeGrantExportMarkdown(getPanelExportOutput(panel, outputs[panel] || '')),
        }))
        .filter((item) => item.content)
      : [{
        id: `grant-${initialPanel}`,
        title: buildExportTitle(copy, activeProjectName),
        description: '',
        hideTitle: true,
        content: normalizeGrantExportMarkdown(visibleOutputText.trim()),
      }];

    if (!outline.length) {
      showToast(exportAll ? '请先生成或填写至少一个阶段工作稿。' : '请先生成或填写工作稿。', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未连接客户端导出能力，请在 Electron 客户端中导出。', 'info');
      return;
    }

    const requestId = `grant-application-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;
    const title = exportAll ? buildFullExportTitle(activeProjectName) : buildExportTitle(copy, activeProjectName);

    try {
      unsubscribe = window.yibiao.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportDialogOpen(true);
        setExportProgress({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          error: event.phase === 'error' ? event.message : '',
        });
      });

      const result = await window.yibiao.export.exportWord({
        requestId,
        document_profile: 'grant-application',
        project_name: title,
        outline,
      });

      if (result.canceled) {
        setExportProgress({ running: false, progress: 0, message: '', error: '' });
        setExportDialogOpen(false);
        showToast('已取消导出', 'info');
        return;
      }
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message: result.message || 'Word 已导出', error: '' });
      showToast(result.message || 'Word 已导出', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message, error: message });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function exportProposalFinalPackage() {
    const proposal = outputs.proposal?.trim() || '';
    if (!proposal) {
      showToast('请先生成或填写申报书草稿。', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未连接客户端导出能力，请在 Electron 客户端中导出。', 'info');
      return;
    }

    const moduleQualitySummary = buildModuleQualitySummary(proposalModuleQualityChecks);
    const finalReview = proposalFinalReview.report.trim()
      ? proposalFinalReview.report.trim()
      : '尚未执行整稿质量检查。建议导出前先运行“整稿质量检查”，再核对需补充项、图示一致性和定稿前核验项。';
    const outline = [
      {
        id: 'grant-proposal-final',
        title: '申报书定稿',
        description: '',
        content: normalizeGrantExportMarkdown(proposal),
      },
      {
        id: 'grant-proposal-final-review',
        title: '终稿质量检查报告',
        description: '',
        content: normalizeGrantExportMarkdown(finalReview),
      },
      {
        id: 'grant-proposal-module-quality',
        title: '模块质量摘要',
        description: '',
        content: normalizeGrantExportMarkdown(moduleQualitySummary),
      },
      {
        id: 'grant-proposal-submit-note',
        title: '提交前核验提示',
        description: '',
        content: normalizeGrantExportMarkdown(buildSubmitChecklist(proposalVisualSettings)),
      },
    ];

    const requestId = `grant-application-final-package-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = window.yibiao.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportDialogOpen(true);
        setExportProgress({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          error: event.phase === 'error' ? event.message : '',
        });
      });

      const result = await window.yibiao.export.exportWord({
        requestId,
        document_profile: 'grant-application',
        project_name: buildProposalFinalPackageTitle(activeProjectName),
        outline,
      });

      if (result.canceled) {
        setExportProgress({ running: false, progress: 0, message: '', error: '' });
        setExportDialogOpen(false);
        showToast('已取消导出', 'info');
        return;
      }
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message: result.message || '申报书定稿包已导出', error: '' });
      showToast(result.message || '申报书定稿包已导出', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出申报书定稿包失败';
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message, error: message });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function refreshFormFields() {
    try {
      setLoadingFormFields(true);
      const result = await window.yibiao?.grantApplication.getFormFields();
      if (result?.mapping) setFormFieldMapping(result.mapping);
      if (result?.state) applyState(result.state);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '刷新申报表字段失败', 'error');
    } finally {
      setLoadingFormFields(false);
    }
  }

  async function exportFormFieldWordPackage() {
    const mapping = formFieldMapping.fields.length ? formFieldMapping : (await window.yibiao?.grantApplication.getFormFields())?.mapping;
    if (!mapping?.fields.length) {
      showToast('请先生成或填写申报书草稿，再刷新字段映射。', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未连接客户端导出能力，请在 Electron 客户端中导出。', 'info');
      return;
    }

    const requestId = `grant-application-form-fields-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = window.yibiao.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportDialogOpen(true);
        setExportProgress({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          error: event.phase === 'error' ? event.message : '',
        });
      });

      const result = await window.yibiao.export.exportWord({
        requestId,
        document_profile: 'grant-application',
        project_name: buildFormFieldPackageTitle(activeProjectName),
        outline: [{
          id: 'grant-form-fields',
          title: '申报表填报包',
          description: '',
          content: buildFormFieldPackageMarkdown(mapping),
        }],
      });

      if (result.canceled) {
        setExportProgress({ running: false, progress: 0, message: '', error: '' });
        setExportDialogOpen(false);
        showToast('已取消导出', 'info');
        return;
      }
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message: result.message || '申报表填报包已导出', error: '' });
      showToast(result.message || '申报表填报包已导出', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出申报表填报包失败';
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message, error: message });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function importProposalTemplate() {
    try {
      setImportingTemplate(true);
      const result = await window.yibiao?.grantApplication.importProposalTemplate();
      if (!result) return;
      if (!result.success) {
        showToast(result.message || '已取消导入模板', result.message === '已取消选择' ? 'info' : 'error');
        return;
      }
      if (result.mapping) setProposalTemplateMapping(result.mapping);
      applyState(result.state);
      showToast(result.message || '申报模板已导入并匹配', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入申报模板失败', 'error');
    } finally {
      setImportingTemplate(false);
    }
  }

  async function exportTemplateMatchedWordPackage() {
    if (!proposalTemplateMapping.sections.length) {
      showToast('请先导入申报模板。', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未连接客户端导出能力，请在 Electron 客户端中导出。', 'info');
      return;
    }

    const requestId = `grant-application-template-package-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = window.yibiao.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportDialogOpen(true);
        setExportProgress({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          error: event.phase === 'error' ? event.message : '',
        });
      });

      const result = await window.yibiao.export.exportWord({
        requestId,
        document_profile: 'grant-application',
        project_name: buildTemplatePackageTitle(activeProjectName),
        outline: [{
          id: 'grant-template-matched-package',
          title: '按模板栏目填报稿',
          description: '',
          content: buildTemplatePackageMarkdown(proposalTemplateMapping),
        }],
      });

      if (result.canceled) {
        setExportProgress({ running: false, progress: 0, message: '', error: '' });
        setExportDialogOpen(false);
        showToast('已取消导出', 'info');
        return;
      }
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message: result.message || '按模板栏目填报稿已导出', error: '' });
      showToast(result.message || '按模板栏目填报稿已导出', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出按模板栏目填报稿失败';
      setExportDialogOpen(true);
      setExportProgress({ running: false, progress: 100, message, error: message });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function exportFilledProposalTemplate() {
    try {
      setFillingTemplate(true);
      const result = await window.yibiao?.grantApplication.exportFilledProposalTemplate();
      if (!result) return;
      if (result.canceled) {
        showToast('已取消导出', 'info');
        return;
      }
      if (result.report) setProposalTemplateFillReport(result.report);
      if (result.state) applyState(result.state);
      showToast(result.message || '原位填充申报表已导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '原位填充申报表失败', 'error');
    } finally {
      setFillingTemplate(false);
    }
  }

  async function clearWorkspace() {
    try {
      setClearing(true);
      const result = await window.yibiao?.grantApplication.clear();
      const state = result?.state;
      if (state) {
        applyState(state);
      } else {
        setProfile(defaultProfile);
        setInputs(createDefaultInputs());
        setOutputs(createDefaultOutputs());
        setProposalModules(createDefaultProposalModules());
        setTask(undefined);
      }
      showToast('已清空课题申报工作区', 'success');
      setClearConfirmOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空课题申报工作区失败', 'error');
    } finally {
      setClearing(false);
    }
  }

  async function switchProject(projectId: string) {
    if (!projectId || projectId === projectList.activeProjectId) return;
    try {
      setProjectBusy(true);
      const state = await window.yibiao?.grantApplication.switchProject(projectId);
      if (state) applyState(state);
      await refreshProjects();
      showToast('已切换课题项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换课题项目失败', 'error');
    } finally {
      setProjectBusy(false);
    }
  }

  async function createProject() {
    try {
      setProjectBusy(true);
      const result = await window.yibiao?.grantApplication.createProject({
        projectName: projectNameDraft || createProjectProfileDraft.direction || '未命名课题',
        profile: createProjectProfileDraft,
      });
      if (result?.state) applyState(result.state);
      if (result?.projects) setProjectList(result.projects);
      setCreateProjectOpen(false);
      setProjectNameDraft('');
      setCreateProjectProfileDraft(defaultProfile);
      showToast('已创建课题项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建课题项目失败', 'error');
    } finally {
      setProjectBusy(false);
    }
  }

  async function renameProject() {
    try {
      setProjectBusy(true);
      const result = await window.yibiao?.grantApplication.renameProject({ projectId: projectList.activeProjectId, name: projectNameDraft });
      if (result?.state) applyState(result.state);
      if (result?.projects) setProjectList(result.projects);
      setRenameProjectOpen(false);
      setProjectNameDraft('');
      showToast('已重命名课题项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重命名课题项目失败', 'error');
    } finally {
      setProjectBusy(false);
    }
  }

  async function deleteProject() {
    try {
      setProjectBusy(true);
      const result = await window.yibiao?.grantApplication.deleteProject(projectList.activeProjectId);
      if (result?.state) applyState(result.state);
      if (result?.projects) setProjectList(result.projects);
      setDeleteProjectOpen(false);
      showToast('已删除课题项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除课题项目失败', 'error');
    } finally {
      setProjectBusy(false);
    }
  }

  async function exportWorkspaceJson() {
    try {
      setExportingArtifact('json');
      const result = await window.yibiao?.grantApplication.exportWorkspaceJson();
      if (result?.canceled) {
        showToast('已取消导出', 'info');
        return;
      }
      showToast(result?.message || '工作区 JSON 已导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出工作区 JSON 失败', 'error');
    } finally {
      setExportingArtifact('');
    }
  }

  async function exportFormFields() {
    try {
      setExportingArtifact('fields');
      const result = await window.yibiao?.grantApplication.exportFormFields();
      if (result?.canceled) {
        showToast('已取消导出', 'info');
        return;
      }
      showToast(result?.message || '申报系统字段摘要已导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出申报系统字段摘要失败', 'error');
    } finally {
      setExportingArtifact('');
    }
  }

  return (
    <div className="grant-application-page">
      <section className="grant-application-header">
        <div>
          <div className="grant-application-title-row">
            <span className="section-kicker">课题申报</span>
            <button type="button" className="grant-application-help-button" onClick={() => setHelpOpen(true)}>使用说明</button>
          </div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="grant-application-header-side">
          <strong>{profileSummary}</strong>
          <span>课题申报全流程工作台</span>
          <div className="grant-application-project-row">
            <select value={projectList.activeProjectId} onChange={(event) => void switchProject(event.target.value)} disabled={projectBusy || task?.status === 'running'}>
              {projectList.projects.map((project) => (
                <option value={project.id} key={project.id}>{project.name}</option>
              ))}
            </select>
            <button type="button" className="secondary-action" onClick={() => onNavigate?.('grant-projects')}>项目页</button>
          </div>
          <div className="grant-application-project-actions">
            <button type="button" className="secondary-action" onClick={() => setCreateProjectOpen(true)} disabled={projectBusy}>新建</button>
            <button type="button" className="secondary-action" onClick={openProfileEditor} disabled={projectBusy}>修改档案</button>
            <button type="button" className="secondary-action" onClick={() => { setProjectNameDraft(projectList.projects.find((project) => project.id === projectList.activeProjectId)?.name || ''); setRenameProjectOpen(true); }} disabled={projectBusy}>重命名</button>
            <button type="button" className="secondary-action" onClick={() => setDeleteProjectOpen(true)} disabled={projectBusy || projectList.projects.length <= 1}>删除</button>
          </div>
        </div>
      </section>

      <nav className="grant-application-tabs" aria-label="课题申报流程">
        {panelOrder.map((panel) => (
          <button
            type="button"
            key={panel}
            className={panel === initialPanel ? 'is-active' : ''}
            onClick={() => switchPanel(panel)}
          >
            <strong>{panelCopy[panel].label}</strong>
            <span>{panelCopy[panel].steps[0]}</span>
          </button>
        ))}
      </nav>

      {initialPanel === 'diagnosis' && (
        <section className="grant-application-profile">
          <div className="grant-application-panel-head">
            <div>
              <h3>课题档案</h3>
              <p>创建项目时填写，后续页面会固定引用这些信息。</p>
            </div>
            <button type="button" className="secondary-action" onClick={openProfileEditor}>修改档案</button>
          </div>
          <div className="grant-application-profile-readonly">
            <div>
              <span>课题级别</span>
              <strong>{profile.level || '未填写'}</strong>
            </div>
            <div>
              <span>学科领域</span>
              <strong>{profile.discipline || '未填写'}</strong>
            </div>
            <div>
              <span>当前阶段</span>
              <strong>{profile.stage || '未填写'}</strong>
            </div>
            <div>
              <span>截止时间</span>
              <strong>{profile.deadline || '未填写'}</strong>
            </div>
            <div className="is-wide">
              <span>研究方向</span>
              <strong>{profile.direction || '未填写'}</strong>
            </div>
            <div className="is-wide">
              <span>基础说明</span>
              <p>{profile.sourceNotes || '未填写'}</p>
            </div>
          </div>
        </section>
      )}

      <section className="grant-application-workspace">
        <div className="grant-application-main">
          <article className="grant-application-panel">
            <div className="grant-application-panel-head">
              <div>
                <h3>{copy.inputTitle}</h3>
                <p>{copy.inputHelp}</p>
              </div>
            </div>
            <textarea className="grant-application-textarea" value={currentInput.taskText} onChange={(event) => updateCurrentInput('taskText', event.target.value)} placeholder={copy.placeholder} />
          </article>

          {initialPanel === 'proposal' && (
            <article className="grant-application-panel">
              <div className="grant-application-panel-head">
                <div>
                  <h3>分模块生成</h3>
                  <p>逐段生成申报书内容，保存后自动合并为完整草稿。</p>
                </div>
              </div>
              <div className="grant-application-proposal-command-bar">
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => void generateMissingProposalModules()}
                  disabled={loading || checkingProposalModules || generatingMissingProposalModules || generatingProposalModule || checkingProposalModule || polishingProposalModule || polishingProposalModules || task?.status === 'running' || completedProposalModuleCount === proposalModuleDefinitions.length}
                >
                  {generatingMissingProposalModules ? '批量生成中...' : '批量生成'}
                </button>
                <button type="button" className="primary-action" onClick={() => void checkProposalModulesInOrder()} disabled={loading || checkingProposalModules || generatingMissingProposalModules || generatingProposalModule || checkingProposalModule || polishingProposalModule || polishingProposalModules || task?.status === 'running'}>
                  {checkingProposalModules ? '批量检测中...' : '批量检测'}
                </button>
                <button type="button" className="secondary-action" onClick={() => void polishProposalModulesInOrder()} disabled={loading || checkingProposalModules || generatingMissingProposalModules || generatingProposalModule || checkingProposalModule || polishingProposalModule || polishingProposalModules || task?.status === 'running' || completedProposalModuleCount === 0}>
                  {polishingProposalModules ? '批量优化中...' : '批量优化'}
                </button>
                <button type="button" className="secondary-action" onClick={() => void generateSelectedProposalModule()} disabled={loading || checkingProposalModules || generatingProposalModule || generatingMissingProposalModules || checkingProposalModule || polishingProposalModule || polishingProposalModules || task?.status === 'running'}>
                  {generatingProposalModule ? '生成中...' : '生成当前模块'}
                </button>
                <button type="button" className="secondary-action" onClick={() => void checkSelectedProposalModule()} disabled={loading || checkingProposalModules || checkingProposalModule || generatingProposalModule || generatingMissingProposalModules || polishingProposalModule || polishingProposalModules || task?.status === 'running'}>
                  {checkingProposalModule ? '检查中...' : '检查当前模块'}
                </button>
                <button type="button" className="secondary-action" onClick={() => void polishSelectedProposalModule()} disabled={loading || checkingProposalModules || polishingProposalModule || polishingProposalModules || checkingProposalModule || generatingProposalModule || generatingMissingProposalModules || task?.status === 'running' || !proposalModules[selectedProposalModule]?.trim()}>
                  {polishingProposalModule ? '优化中...' : '按意见优化'}
                </button>
                <button type="button" className="secondary-action" onClick={() => void saveSelectedProposalModule()} disabled={savingProposalModule || task?.status === 'running'}>
                  {savingProposalModule ? '保存中...' : '保存并合并'}
                </button>
                <span className="grant-application-command-hint">建议先批量生成，再批量检测，最后按检查意见批量优化。</span>
              </div>
              {aiProgress.title && aiProgress.panel === 'proposal' && (
                <div className={`grant-application-ai-progress ${aiProgress.running ? 'is-running' : ''}`}>
                  <div>
                    <strong>{aiProgress.title}</strong>
                    <span>{aiProgress.message}</span>
                  </div>
                  <em>{Math.round(aiProgress.progress)}%</em>
                  <progress value={aiProgress.progress} max={100} />
                </div>
              )}
              <div className="grant-application-visual-options">
                <label>
                  <input type="checkbox" checked={proposalVisualSettings.useAiImage} onChange={(event) => void updateProposalVisualSetting('useAiImage', event.target.checked)} />
                  <span>AI 生图提示词</span>
                </label>
                <label>
                  <input type="checkbox" checked={proposalVisualSettings.useTechnicalDiagram} onChange={(event) => void updateProposalVisualSetting('useTechnicalDiagram', event.target.checked)} />
                  <span>技术路线/研究框架图</span>
                </label>
                <label>
                  <input type="checkbox" checked={proposalVisualSettings.useMermaid} onChange={(event) => void updateProposalVisualSetting('useMermaid', event.target.checked)} />
                  <span>Mermaid 图</span>
                </label>
              </div>
              <div className="grant-application-module-workspace">
                <div className="grant-application-module-list" aria-label="申报书模块">
                  {proposalModuleDefinitions.map((module) => {
                    const completed = Boolean(proposalModules[module.key]?.trim());
                    const quality = proposalModuleQualityChecks[module.key] || defaultProposalModuleQuality;
                    const isActiveAiModule = aiProgress.running && aiProgress.moduleKey === module.key;
                    const skippedCheck = skippedProposalCheckModules.includes(module.key);
                    const runningLabel = aiProgress.moduleAction === 'check' ? '正在检测' : aiProgress.moduleAction === 'generate' ? '正在生成' : aiProgress.moduleAction === 'polish' ? '正在优化' : '';
                    return (
                      <button
                        type="button"
                        key={module.key}
                        className={`${module.key === selectedProposalModule ? 'is-active' : ''} ${isActiveAiModule ? 'is-running' : ''}`}
                        onClick={() => setSelectedProposalModule(module.key)}
                      >
                        <span>{isActiveAiModule ? runningLabel : skippedCheck ? '未生成跳过' : completed ? '已生成' : '待生成'} · {quality.status === 'unchecked' ? '未检' : quality.status === 'pass' ? '通过' : quality.status === 'warning' ? '需补充' : '高风险'}</span>
                        <strong>{module.label}</strong>
                        <em>{module.hint}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="grant-application-module-editor">
                  <div className="grant-application-module-editor-head">
                    <div>
                      <strong>{selectedProposalModuleDefinition.label}</strong>
                      <span>{selectedProposalModuleDefinition.hint}</span>
                    </div>
                    <em>{completedProposalModuleCount}/{proposalModuleDefinitions.length}</em>
                  </div>
                  {selectedProposalQuality.status !== 'unchecked' && (
                    <div className={`grant-application-quality-card is-${selectedProposalQuality.status}`}>
                      <strong>{selectedProposalQuality.status === 'pass' ? '检查通过' : selectedProposalQuality.status === 'warning' ? '需要补充' : '高风险'}</strong>
                      <span>{selectedProposalQuality.score ? `参考分 ${selectedProposalQuality.score} · ` : ''}{selectedProposalQuality.summary}</span>
                    </div>
                  )}
                  <MarkdownEditor
                    className="grant-application-module-markdown-editor"
                    value={proposalModules[selectedProposalModule] || ''}
                    onChange={(value) => updateProposalModule(selectedProposalModule, value)}
                    placeholder={`生成或粘贴“${selectedProposalModuleDefinition.label}”内容，保存后会合并到申报书草稿。`}
                  />
                  {selectedProposalQuality.report.trim() && (
                    <button
                      type="button"
                      className="grant-application-report-link"
                      onClick={() => setQualityReportDialog({ title: `${selectedProposalModuleDefinition.label}质量检查报告`, content: selectedProposalQuality.report })}
                    >
                      查看质量检查报告
                    </button>
                  )}
                </div>
              </div>
            </article>
          )}

          <article className="grant-application-panel">
            <div className="grant-application-panel-head">
              <div>
                <h3>{copy.materialTitle}</h3>
                <p>{copy.materialHelp}</p>
              </div>
              <button type="button" className="secondary-action" onClick={importMaterial} disabled={loading || importing || task?.status === 'running'}>
                {importing ? '导入中...' : '导入材料'}
              </button>
              {initialPanel !== 'diagnosis' && (
                <button type="button" className="secondary-action" onClick={appendPreviousOutputsToMaterial} disabled={loading || task?.status === 'running'}>
                  带入前序成果
                </button>
              )}
            </div>
            <MarkdownEditor className="grant-application-markdown-editor" value={currentInput.materialText} onChange={(value) => updateCurrentInput('materialText', value)} placeholder={copy.materialPlaceholder} />
          </article>

          {initialPanel === 'review-defense' && (
            <article className="grant-application-panel grant-application-report-panel">
              <div className="grant-application-panel-head">
                <div>
                  <h3>八维检测报告</h3>
                  <p>独立生成和保留，用于评估申报书质量，不会覆盖下方 AI 工作稿。</p>
                </div>
                <div className="grant-application-panel-actions">
                  <button type="button" className="secondary-action" onClick={() => void generateQualityReview()} disabled={loading || generatingQualityReview || task?.status === 'running'}>
                    {generatingQualityReview ? '检测中...' : '生成八维检测报告'}
                  </button>
                </div>
              </div>
              {isReviewReportProgress && (
                <div className={`grant-application-ai-progress ${aiProgress.running ? 'is-running' : ''}`}>
                  <div>
                    <strong>{aiProgress.title}</strong>
                    <span>{aiProgress.message}</span>
                  </div>
                  <em>{Math.round(aiProgress.progress)}%</em>
                  <progress value={aiProgress.progress} max={100} />
                </div>
              )}
              {visibleReviewDefenseReport ? (
                <div className="grant-application-preview">
                  <MarkdownRenderer allowRawHtml={false}>{visibleReviewDefenseReport}</MarkdownRenderer>
                </div>
              ) : (
                <div className="grant-application-empty">点击“生成八维检测报告”后，这里会显示独立的质量检测报告。</div>
              )}
            </article>
          )}

          <article className="grant-application-panel">
            <div className="grant-application-panel-head">
              <div>
                <h3>{initialPanel === 'review-defense' ? 'AI 工作稿' : copy.outputTitle}</h3>
                <p>{initialPanel === 'review-defense' ? '用于生成修改优先级、答辩问题和实施管理建议，与八维检测报告分开保存。' : copy.outputHelp}</p>
              </div>
              <div className="grant-application-output-controls">
                <div className="grant-application-output-mode-row">
                  <div className="grant-application-mode-switch" aria-label="工作稿显示模式">
                    <button type="button" className={outputMode === 'preview' ? 'is-active' : ''} onClick={() => setOutputMode('preview')}>预览</button>
                    <button type="button" className={outputMode === 'edit' ? 'is-active' : ''} onClick={() => setOutputMode('edit')}>编辑</button>
                  </div>
                </div>
                <div className="grant-application-panel-actions">
                  <button type="button" className="secondary-action" onClick={() => void saveCurrentOutput()} disabled={savingOutput || task?.status === 'running'}>
                    {savingOutput ? '保存中...' : '保存工作稿'}
                  </button>
                  {nextPanel && (
                    <button type="button" className="secondary-action" onClick={navigateNextPanel} disabled={task?.status === 'running'}>
                      进入下一步
                    </button>
                  )}
                  {initialPanel !== 'proposal' && (
                    <button type="button" className="primary-action" onClick={generateWithAi} disabled={loading || generating || task?.status === 'running'}>
                      {isCurrentTaskRunning || generating ? '生成中...' : generateDraftLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {task?.status === 'running' && task.type === initialPanel && !isReviewReportProgress && (
              <div className="grant-application-task is-running">
                <div>
                  <strong>当前入口正在生成</strong>
                  <span>{task.message}</span>
                </div>
                <em>{Math.round(task.progress || 0)}%</em>
              </div>
            )}
            {initialPanel !== 'proposal' && aiProgress.title && aiProgress.panel === initialPanel && !isReviewReportProgress && task?.status !== 'running' && (
              <div className={`grant-application-ai-progress ${aiProgress.running ? 'is-running' : ''}`}>
                <div>
                  <strong>{aiProgress.title}</strong>
                  <span>{aiProgress.message}</span>
                </div>
                <em>{Math.round(aiProgress.progress)}%</em>
                <progress value={aiProgress.progress} max={100} />
              </div>
            )}
            {outputMode === 'edit' ? (
              <MarkdownEditor className="grant-application-output-editor" value={visibleOutputText} onChange={updateCurrentOutput} placeholder={copy.outputPlaceholder} />
            ) : visibleOutputText ? (
              <div className="grant-application-preview">
                <MarkdownRenderer allowRawHtml={false}>{visibleOutputText}</MarkdownRenderer>
              </div>
            ) : (
              <div className="grant-application-empty">{copy.outputPlaceholder}</div>
            )}
          </article>
        </div>

        <aside className="grant-application-side">
          <article className="grant-application-panel grant-application-side-guide">
            <div className="grant-application-panel-head">
              <div>
                <h3>阶段提示</h3>
                <p>查看当前入口的流程和预检项。</p>
              </div>
            </div>
            <div className="grant-application-guide-actions">
              <button type="button" className="secondary-action" onClick={() => setSideGuideOpen('flow')}>流程映射</button>
              <button type="button" className="secondary-action" onClick={() => setSideGuideOpen('check')}>预检清单</button>
            </div>
          </article>

          <article className="grant-application-panel">
            <div className="grant-application-panel-head">
              <div>
                <h3>交付操作</h3>
                <p>将当前工作稿导出为 Word，或清空本机工作区重新开始。</p>
              </div>
            </div>
            <div className="grant-application-action-list">
              <button type="button" className="primary-action" onClick={() => void exportWord()} disabled={!visibleOutputText.trim() || exportProgress.running}>
                {exportProgress.running ? '导出中...' : '导出 Word'}
              </button>
              <button type="button" className="secondary-action" onClick={() => void exportWord(true)} disabled={!completedOutputCount || exportProgress.running}>
                导出全流程 Word
              </button>
              {nextPanel && (
                <button type="button" className="secondary-action" onClick={navigateNextPanel} disabled={task?.status === 'running'}>
                  进入{panelCopy[nextPanel].label}
                </button>
              )}
              {initialPanel === 'proposal' && (
                <button type="button" className="secondary-action" onClick={() => void checkProposalFinalReview()} disabled={!outputs.proposal?.trim() || checkingProposalFinalReview || task?.status === 'running'}>
                  {checkingProposalFinalReview ? '检查中...' : '整稿质量检查'}
                </button>
              )}
              {initialPanel === 'proposal' && (
                <button type="button" className="primary-action" onClick={() => void exportProposalFinalPackage()} disabled={!outputs.proposal?.trim() || exportProgress.running}>
                  {exportProgress.running ? '导出中...' : '导出定稿包 Word'}
                </button>
              )}
              <button type="button" className="secondary-action" onClick={() => void exportWorkspaceJson()} disabled={exportingArtifact !== ''}>
                {exportingArtifact === 'json' ? '导出中...' : '导出工作区 JSON'}
              </button>
              <button type="button" className="secondary-action" onClick={() => setClearConfirmOpen(true)} disabled={clearing || task?.status === 'running' || exportProgress.running}>
                {clearing ? '清空中...' : '清空工作区'}
              </button>
            </div>
            <div className="grant-application-delivery-note">
              已形成 {completedOutputCount} 个阶段工作稿
            </div>
            {initialPanel === 'proposal' && proposalFinalReview.status !== 'unchecked' && (
              <div className={`grant-application-quality-card is-${proposalFinalReview.status}`}>
                <strong>{proposalFinalReview.status === 'pass' ? '终稿检查通过' : proposalFinalReview.status === 'warning' ? '终稿仍需补充' : '终稿高风险'}</strong>
                <span>{proposalFinalReview.score ? `参考分 ${proposalFinalReview.score} · ` : ''}{proposalFinalReview.summary}</span>
              </div>
            )}
            {initialPanel === 'proposal' && proposalFinalReview.report.trim() && (
              <button
                type="button"
                className="grant-application-report-link"
                onClick={() => setQualityReportDialog({ title: '整稿质量检查报告', content: proposalFinalReview.report })}
              >
                查看整稿质量检查报告
              </button>
            )}
            {initialPanel === 'proposal' && (
              <div className="grant-application-field-mapping">
                <div className="grant-application-field-mapping-head">
                  <div>
                    <strong>申报表填报检查</strong>
                    <span>
                      将申报书拆成系统表单字段，检查缺口和字数风险。
                    </span>
                  </div>
                  <span className="grant-application-tool-count">已填 {formFieldMapping.summary.ready} / 缺失 {formFieldMapping.summary.missing}</span>
                </div>
                <div className="grant-application-tool-actions">
                  <button type="button" className="secondary-action" onClick={() => void refreshFormFields()} disabled={loadingFormFields}>
                    {loadingFormFields ? '检查中...' : '检查字段'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => void exportFormFields()} disabled={exportingArtifact !== '' || !outputs.proposal?.trim()}>
                    {exportingArtifact === 'fields' ? '导出中...' : '导出摘要'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => void exportFormFieldWordPackage()} disabled={exportProgress.running || !outputs.proposal?.trim()}>
                    {exportProgress.running ? '导出中...' : '导出填报包'}
                  </button>
                </div>
                {formFieldMapping.fields.length ? (
                  <div className="grant-application-field-list">
                    {formFieldMapping.fields.map((field) => (
                      <details key={field.key} className={`grant-application-field-item is-${field.status}`}>
                        <summary>
                          <strong>{field.label}</strong>
                          <span>{field.status === 'ready' ? '已填写' : field.status === 'missing' ? '缺失' : field.status === 'verify' ? '待核验' : '过长'} · {field.length} 字</span>
                        </summary>
                        <p>{field.note}</p>
                        <MarkdownRenderer allowRawHtml={false}>{field.content || '需补充'}</MarkdownRenderer>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="grant-application-delivery-note">点击“检查字段”后，可查看推荐填报内容、缺口状态和过长字段。</div>
                )}
              </div>
            )}
            {initialPanel === 'proposal' && (
              <div className="grant-application-field-mapping">
                <div className="grant-application-field-mapping-head">
                  <div>
                    <strong>套用申报模板</strong>
                    <span>
                      导入官方模板后，按模板栏目匹配、导出或原位填充。
                    </span>
                  </div>
                  <span className="grant-application-tool-count">匹配 {proposalTemplateMapping.summary.matched} / 缺失 {proposalTemplateMapping.summary.missing}</span>
                </div>
                <div className="grant-application-tool-actions">
                  <button type="button" className="secondary-action" onClick={() => void importProposalTemplate()} disabled={importingTemplate || task?.status === 'running'}>
                    {importingTemplate ? '导入中...' : '导入模板'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => void exportTemplateMatchedWordPackage()} disabled={!proposalTemplateMapping.sections.length || !outputs.proposal?.trim() || exportProgress.running}>
                    {exportProgress.running ? '导出中...' : '按栏目导出'}
                  </button>
                  <button type="button" className="primary-action" onClick={() => void exportFilledProposalTemplate()} disabled={!proposalTemplateMapping.sections.length || !outputs.proposal?.trim() || fillingTemplate || task?.status === 'running'}>
                    {fillingTemplate ? '填充中...' : '原位填充'}
                  </button>
                </div>
                {proposalTemplateMapping.sections.length ? (
                  <div className="grant-application-field-list">
                    {proposalTemplateMapping.sections.map((section) => (
                      <details key={section.id} className={`grant-application-field-item is-${section.status}`}>
                        <summary>
                          <strong>{section.title}</strong>
                          <span>{templateStatusLabel(section.status)} · {section.length} 字</span>
                        </summary>
                        <p>{section.matchedFieldLabel ? `匹配字段：${section.matchedFieldLabel}。${section.note}` : section.note}</p>
                        <MarkdownRenderer allowRawHtml={false}>{section.content || '需人工补充'}</MarkdownRenderer>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="grant-application-delivery-note">适合已有官方申报书模板时使用。未导入模板前，不影响普通 Word 导出。</div>
                )}
                {proposalTemplateFillReport.items.length > 0 && (
                  <button
                    type="button"
                    className="grant-application-report-link"
                    onClick={() => setQualityReportDialog({
                      title: `原位填充报告：成功 ${proposalTemplateFillReport.filled}/${proposalTemplateFillReport.total}`,
                      content: proposalTemplateFillReport.items.map((item) => `- ${item.title}：${item.status === 'filled' ? '已填充' : '跳过'}，${item.message}`).join('\n'),
                    })}
                  >
                    查看原位填充报告
                  </button>
                )}
              </div>
            )}
          </article>
        </aside>
      </section>
      <Dialog.Root open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>清空课题申报工作区</Dialog.Title>
                <Dialog.Description>
                  课题档案、输入材料和四个入口的工作稿都会从本机工作区删除，此操作不会影响其他模块。
                </Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭清空确认">×</Dialog.Close>
            </div>
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="secondary-action" type="button" disabled={clearing}>取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={() => void clearWorkspace()} disabled={clearing}>
                {clearing ? '清空中...' : '确认清空'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {renderCreateProjectDialog({
        open: createProjectOpen,
        value: projectNameDraft,
        profile: createProjectProfileDraft,
        confirmLabel: projectBusy ? '创建中...' : '创建并进入',
        onValueChange: setProjectNameDraft,
        onProfileChange: (field, value) => setCreateProjectProfileDraft((prev) => ({ ...prev, [field]: value })),
        onOpenChange: setCreateProjectOpen,
        onConfirm: createProject,
        busy: projectBusy,
      })}
      {renderProfileEditDialog({
        open: profileEditOpen,
        profile: profileEditDraft,
        onProfileChange: (field, value) => setProfileEditDraft((prev) => ({ ...prev, [field]: value })),
        onOpenChange: setProfileEditOpen,
        onConfirm: saveProfileEditor,
        busy: projectBusy,
      })}
      {renderProjectDialog({
        open: renameProjectOpen,
        title: '重命名课题项目',
        description: '只修改项目显示名称，不影响已保存的课题档案和工作稿。',
        value: projectNameDraft,
        confirmLabel: projectBusy ? '保存中...' : '保存名称',
        onValueChange: setProjectNameDraft,
        onOpenChange: setRenameProjectOpen,
        onConfirm: renameProject,
        busy: projectBusy,
      })}
      <Dialog.Root open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>删除课题项目</Dialog.Title>
                <Dialog.Description>
                  当前课题项目的档案、材料和工作稿都会被删除。至少会保留一个课题项目。
                </Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭删除确认">×</Dialog.Close>
            </div>
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="secondary-action" type="button" disabled={projectBusy}>取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={() => void deleteProject()} disabled={projectBusy}>
                {projectBusy ? '删除中...' : '确认删除'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (!open && exportProgress.running) return;
          setExportDialogOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card grant-application-export-dialog">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>{exportProgress.error ? '导出失败' : exportProgress.running ? '正在导出 Word' : '导出完成'}</Dialog.Title>
                <Dialog.Description>
                  {exportProgress.running ? '正在生成 Word 文档，请等待进度完成。' : '导出任务已结束，可以打开文件核对图片、表格和版式。'}
                </Dialog.Description>
              </div>
            </div>
            <div className={`grant-application-export-progress ${exportProgress.error ? 'is-error' : ''}`}>
              <div>
                <strong>{exportProgress.message || '正在准备导出。'}</strong>
                <em>{Math.round(exportProgress.progress || 0)}%</em>
              </div>
              <progress value={exportProgress.progress || 0} max={100} />
            </div>
            {!exportProgress.running && (
              <div className="grant-application-dialog-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card grant-application-help-card">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>课题申报使用说明</Dialog.Title>
                <Dialog.Description>
                  建议按“启动诊断 - 选题与政策 - 申报书撰写 - 评审优化与答辩”的顺序推进。
                </Dialog.Description>
              </div>
            </div>
            <div className="grant-application-help-content">
              <section>
                <strong>1. 启动诊断</strong>
                <p>填写级别、学科、方向、已有材料和截止时间，先判断材料缺口和推进路线。</p>
              </section>
              <section>
                <strong>2. 选题与政策</strong>
                <p>把诊断成果带入，生成候选题、政策契合点、研究空白和推荐题目。</p>
              </section>
              <section>
                <strong>3. 申报书撰写</strong>
                <p>分模块生成、检查、优化申报书；可开启 Mermaid、技术路线图和 AI 配图提示词。</p>
              </section>
              <section>
                <strong>4. 评审优化与答辩</strong>
                <p>对定稿材料做八维检测，准备修改优先级、答辩问题和实施管理建议。</p>
              </section>
              <div className="grant-application-help-note">
                每个入口的“进入下一步”会自动把当前工作稿带入下一入口材料区。
              </div>
            </div>
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={sideGuideOpen !== ''} onOpenChange={(open) => !open && setSideGuideOpen('')}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card grant-application-help-card">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>{sideGuideOpen === 'flow' ? '流程映射' : '预检清单'}</Dialog.Title>
                <Dialog.Description>
                  {sideGuideOpen === 'flow' ? '当前入口对应的工作步骤。' : '进入下一步前建议确认的关键点。'}
                </Dialog.Description>
              </div>
            </div>
            {sideGuideOpen === 'flow' ? (
              <div className="grant-application-step-list">
                {copy.steps.map((step, index) => (
                  <div key={step}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{step}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="grant-application-check-list">
                {copy.checks.map((check) => <li key={check}>{check}</li>)}
              </ul>
            )}
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={Boolean(qualityReportDialog)} onOpenChange={(open) => !open && setQualityReportDialog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-card grant-application-report-dialog">
            <div className="content-regenerate-card-head">
              <div>
                <Dialog.Title>{qualityReportDialog?.title || '质量检查报告'}</Dialog.Title>
                <Dialog.Description>检查结论仅作为定稿前修订参考，请结合申报通知和单位要求复核。</Dialog.Description>
              </div>
            </div>
            <div className="grant-application-report-dialog-body">
              <MarkdownRenderer allowRawHtml={false}>{qualityReportDialog?.content || ''}</MarkdownRenderer>
            </div>
            <div className="grant-application-dialog-actions">
              <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function renderCreateProjectDialog({
  open,
  value,
  profile,
  confirmLabel,
  onValueChange,
  onProfileChange,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  value: string;
  profile: GrantApplicationProfile;
  confirmLabel: string;
  onValueChange: (value: string) => void;
  onProfileChange: (field: keyof GrantApplicationProfile, value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="content-regenerate-card grant-application-create-dialog">
          <div className="content-regenerate-card-head">
            <div>
              <Dialog.Title>新建课题项目</Dialog.Title>
              <Dialog.Description>创建独立工作区，并先填写课题档案。后续诊断、选题、撰写和评审都会引用这些信息。</Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭新建项目">×</Dialog.Close>
          </div>
          <div className="grant-application-create-profile-grid">
            <label>
              <span>项目名称</span>
              <input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="例如：市级课题-分层作业设计研究" autoFocus />
            </label>
            <label>
              <span>课题级别</span>
              <select value={profile.level} onChange={(event) => onProfileChange('level', event.target.value)}>
                <option>校级</option>
                <option>县级</option>
                <option>市级</option>
                <option>省级</option>
                <option>国家级</option>
                <option>不确定</option>
              </select>
            </label>
            <label>
              <span>学科领域</span>
              <select value={profile.discipline} onChange={(event) => onProfileChange('discipline', event.target.value)}>
                <option>教育学</option>
                <option>医学/临床</option>
                <option>工程技术</option>
                <option>农业科学</option>
                <option>艺术/体育</option>
                <option>基础科学</option>
                <option>其他</option>
              </select>
            </label>
            <label>
              <span>当前阶段</span>
              <select value={profile.stage} onChange={(event) => onProfileChange('stage', event.target.value)}>
                <option>准备申报</option>
                <option>已有方向</option>
                <option>已有草稿</option>
                <option>等待评审</option>
                <option>答辩准备</option>
                <option>立项实施</option>
              </select>
            </label>
            <label>
              <span>截止时间</span>
              <input type="date" value={profile.deadline} onChange={(event) => onProfileChange('deadline', event.target.value)} />
            </label>
            <label className="is-wide">
              <span>研究方向</span>
              <input value={profile.direction} onChange={(event) => onProfileChange('direction', event.target.value)} placeholder="一句话描述课题方向" />
            </label>
            <label className="is-wide">
              <span>基础说明</span>
              <textarea value={profile.sourceNotes} onChange={(event) => onProfileChange('sourceNotes', event.target.value)} placeholder="补充团队基础、学校场景、已有成果、数据来源或申报限制。" />
            </label>
          </div>
          <div className="grant-application-dialog-actions">
            <Dialog.Close className="secondary-action" type="button" disabled={busy}>取消</Dialog.Close>
            <button type="button" className="primary-action" onClick={() => void onConfirm()} disabled={busy || !value.trim()}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function renderProfileEditDialog({
  open,
  profile,
  onProfileChange,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  profile: GrantApplicationProfile;
  onProfileChange: (field: keyof GrantApplicationProfile, value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="content-regenerate-card grant-application-create-dialog">
          <div className="content-regenerate-card-head">
            <div>
              <Dialog.Title>修改课题档案</Dialog.Title>
              <Dialog.Description>修改后会作为当前课题项目的基础信息，后续诊断、选题、撰写和评审都会引用。</Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭修改档案">×</Dialog.Close>
          </div>
          <div className="grant-application-create-profile-grid">
            <label>
              <span>课题级别</span>
              <select value={profile.level} onChange={(event) => onProfileChange('level', event.target.value)}>
                <option>校级</option>
                <option>县级</option>
                <option>市级</option>
                <option>省级</option>
                <option>国家级</option>
                <option>不确定</option>
              </select>
            </label>
            <label>
              <span>学科领域</span>
              <select value={profile.discipline} onChange={(event) => onProfileChange('discipline', event.target.value)}>
                <option>教育学</option>
                <option>医学/临床</option>
                <option>工程技术</option>
                <option>农业科学</option>
                <option>艺术/体育</option>
                <option>基础科学</option>
                <option>其他</option>
              </select>
            </label>
            <label>
              <span>当前阶段</span>
              <select value={profile.stage} onChange={(event) => onProfileChange('stage', event.target.value)}>
                <option>准备申报</option>
                <option>已有方向</option>
                <option>已有草稿</option>
                <option>等待评审</option>
                <option>答辩准备</option>
                <option>立项实施</option>
              </select>
            </label>
            <label>
              <span>截止时间</span>
              <input type="date" value={profile.deadline} onChange={(event) => onProfileChange('deadline', event.target.value)} />
            </label>
            <label className="is-wide">
              <span>研究方向</span>
              <input value={profile.direction} onChange={(event) => onProfileChange('direction', event.target.value)} placeholder="一句话描述课题方向" />
            </label>
            <label className="is-wide">
              <span>基础说明</span>
              <textarea value={profile.sourceNotes} onChange={(event) => onProfileChange('sourceNotes', event.target.value)} placeholder="补充团队基础、学校场景、已有成果、数据来源或申报限制。" />
            </label>
          </div>
          <div className="grant-application-dialog-actions">
            <Dialog.Close className="secondary-action" type="button" disabled={busy}>取消</Dialog.Close>
            <button type="button" className="primary-action" onClick={() => void onConfirm()} disabled={busy}>
              保存档案
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function renderProjectDialog({
  open,
  title,
  description,
  value,
  confirmLabel,
  onValueChange,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  description: string;
  value: string;
  confirmLabel: string;
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="content-regenerate-card">
          <div className="content-regenerate-card-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭项目弹窗">×</Dialog.Close>
          </div>
          <label className="grant-application-dialog-field">
            <span>项目名称</span>
            <input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="例如：市级课题-分层作业研究" autoFocus />
          </label>
          <div className="grant-application-dialog-actions">
            <Dialog.Close className="secondary-action" type="button" disabled={busy}>取消</Dialog.Close>
            <button type="button" className="primary-action" onClick={() => void onConfirm()} disabled={busy || !value.trim()}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function sanitizeFileTitle(value: string) {
  return String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || '课题申报';
}

function buildExportTitle(copy: GrantApplicationPanelCopy, projectName: string) {
  return `${sanitizeFileTitle(projectName)}-${copy.label}`;
}

function buildFullExportTitle(projectName: string) {
  return `${sanitizeFileTitle(projectName)}-全流程`;
}

function buildProposalFinalPackageTitle(projectName: string) {
  return `${sanitizeFileTitle(projectName)}-定稿包`;
}

function buildFormFieldPackageTitle(projectName: string) {
  return `${sanitizeFileTitle(projectName)}-填报包`;
}

function buildTemplatePackageTitle(projectName: string) {
  return `${sanitizeFileTitle(projectName)}-模板填报稿`;
}

function normalizeGrantExportMarkdown(markdown: string) {
  let inFence = false;
  return String(markdown || '').split(/\r?\n/).map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return cleanupGrantExportLine(line.replace(
      /^(#{1,6})\s+(?:第[一二三四五六七八九十百千万\d]+[章节部分][：:、.\s]*)?(?:(?:\d+(?:\.\d+)*|[一二三四五六七八九十]+)[.、]\s+)/,
      '$1 ',
    ));
  }).join('\n');
}

function cleanupGrantExportLine(line: string) {
  return line
    .replace(/([\u3400-\u9fff])[\t 　]+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/([\u3400-\u9fff])[\t 　]+([：:，,。；;、！？!?）】》」』])/g, '$1$2')
    .replace(/([（【《「『])[\t 　]+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\*\*([\u3400-\u9fff])[\t 　]+(?=[\u3400-\u9fff])/g, '**$1')
    .replace(/([\u3400-\u9fff])[\t 　]+(?=[\u3400-\u9fff][^*]*\*\*)/g, '$1');
}

function isReviewQualityReportText(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  const hitCount = [
    /八维检测/,
    /文本质量参考分/,
    /总体评分参考/,
    /总体判断/,
    /修改优先级/,
    /不代表.*(立项|评审)/,
  ].filter((pattern) => pattern.test(text)).length;
  return hitCount >= 2 && !/答辩问题与参考回答|实施管理建议/.test(text.slice(0, 800));
}

function getPanelExportOutput(panel: GrantApplicationPanel, output: string) {
  if (panel === 'review-defense' && isReviewQualityReportText(output)) return '';
  return output.trim();
}

function buildModuleQualitySummary(qualityChecks: Record<GrantProposalModuleKey, GrantProposalModuleQuality>) {
  const statusLabels: Record<GrantProposalModuleQuality['status'], string> = {
    unchecked: '未检查',
    pass: '通过',
    warning: '需补充',
    risk: '高风险',
  };
  const lines = proposalModuleDefinitions.map((module) => {
    const quality = qualityChecks[module.key] || defaultProposalModuleQuality;
    const score = quality.score ? `，参考分：${quality.score}` : '';
    const summary = quality.summary ? `，结论：${quality.summary}` : '';
    return `- ${module.label}：${statusLabels[quality.status]}${score}${summary}`;
  });
  return ['# 模块质量摘要', '', ...lines].join('\n');
}

function buildFormFieldPackageMarkdown(mapping: GrantFormFieldMapping) {
  const statusLabels: Record<GrantFormFieldItemStatus, string> = {
    ready: '已填写',
    missing: '缺失',
    verify: '待核验',
    too_long: '过长',
  };
  const fieldSections = mapping.fields.flatMap((field) => [
    `## ${field.label}`,
    '',
    `- 状态：${statusLabels[field.status]}`,
    `- 字数：${field.length}`,
    `- 注意事项：${field.note}`,
    '',
    '### 推荐填报内容',
    '',
    field.content || '需补充',
    '',
  ]);
  return [
    '# 申报表填报包',
    '',
    '## 基本信息',
    '',
    `- 课题级别：${mapping.profile.level || '需补充'}`,
    `- 学科领域：${mapping.profile.discipline || '需补充'}`,
    `- 研究方向：${mapping.profile.direction || '需补充'}`,
    `- 当前阶段：${mapping.profile.stage || '需补充'}`,
    `- 截止时间：${mapping.profile.deadline || '需补充'}`,
    '',
    '## 字段概览',
    '',
    `- 字段总数：${mapping.summary.total}`,
    `- 已填写：${mapping.summary.ready}`,
    `- 缺失：${mapping.summary.missing}`,
    `- 待核验：${mapping.summary.verify}`,
    `- 过长：${mapping.summary.too_long}`,
    '',
    ...fieldSections,
    '## 使用提示',
    '',
    '导入线上申报系统前，请逐项核对事实、政策文件、文献、成果、字数限制和申报模板格式。',
  ].join('\n');
}

type GrantFormFieldItemStatus = GrantFormFieldMapping['fields'][number]['status'];

function templateStatusLabel(status: GrantProposalTemplateMapping['sections'][number]['status']) {
  const labels = {
    matched: '已匹配',
    missing: '缺失',
    unmatched: '未匹配',
    verify: '待核验',
    too_long: '过长',
  };
  return labels[status] || '未匹配';
}

function buildTemplatePackageMarkdown(mapping: GrantProposalTemplateMapping) {
  const sectionBlocks = mapping.sections.flatMap((section) => [
    `## ${section.title}`,
    '',
    `- 匹配状态：${templateStatusLabel(section.status)}`,
    `- 匹配字段：${section.matchedFieldLabel || '未匹配'}`,
    `- 字数：${section.length}`,
    `- 注意事项：${section.note}`,
    section.instruction ? `- 模板说明：${section.instruction}` : '',
    '',
    '### 推荐填报内容',
    '',
    section.content || '需人工补充',
    '',
  ].filter(Boolean));

  return [
    '# 按模板栏目填报稿',
    '',
    `模板文件：${mapping.fileName || '未命名模板'}`,
    '',
    '## 匹配概览',
    '',
    `- 栏目总数：${mapping.summary.total}`,
    `- 已匹配：${mapping.summary.matched}`,
    `- 缺失：${mapping.summary.missing}`,
    `- 待核验：${mapping.summary.verify}`,
    `- 过长：${mapping.summary.too_long}`,
    `- 未匹配：${mapping.summary.unmatched}`,
    '',
    ...sectionBlocks,
    '## 使用提示',
    '',
    '本文件按导入模板栏目顺序整理，尚未直接写回原始模板。复制到正式申报表前，请核对栏目名称、字数限制、表格格式和需人工补充项。',
  ].join('\n');
}

function buildSubmitChecklist(settings: GrantProposalVisualSettings) {
  return [
    '# 提交前核验提示',
    '',
    '- 核对申报通知、课题指南、申报表模板和字数限制。',
    '- 核对政策、文献、数据、成果、团队基础和单位信息，删除无法证明的表述。',
    '- 检查全文中的“需补充”“待核验”“未填写”，提交前必须处理。',
    '- 检查题目、研究目标、研究内容、研究方法、实施计划和预期成果是否前后一致。',
    settings.useMermaid || settings.useTechnicalDiagram
      ? '- 检查 Mermaid 图、研究框架图和技术路线图是否与正文一致，图中不要出现正文没有支撑的信息。'
      : '- 当前未启用图示增强；如申报模板要求技术路线图，请单独补充。',
    settings.useAiImage
      ? '- AI 配图提示词仅用于生成示意图，提交前需确认申报模板是否允许配图。'
      : '- 当前未启用 AI 生图提示词；一般申报书不建议添加装饰性图片。',
    '- Word 导出后请人工检查页眉页脚、表格、标题层级、编号和 Mermaid 转图效果。',
  ].join('\n');
}

export default GrantApplicationPage;
