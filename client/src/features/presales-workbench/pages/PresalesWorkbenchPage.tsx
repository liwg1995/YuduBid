import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import MarkdownRenderer from '../../../shared/ui/MarkdownRenderer';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { WordExportProgressEvent } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import type {
  PresalesAnalysisInput,
  PresalesArchitectureInput,
  PresalesDiagramInput,
  PresalesManualMaterialInput,
  PresalesPresentationInput,
  PresalesProjectProfile,
  PresalesProjectState,
  PresalesResearchInput,
} from '../types';

const emptyProfile: PresalesProjectProfile = {
  projectName: '',
  customerName: '',
  industry: '',
  currentStage: '线索识别',
  opportunitySource: '',
  expectedValue: '',
  decisionDate: '',
  owner: '',
  keyBackground: '',
};

const emptyAnalysisInput: PresalesAnalysisInput = {
  rawNotes: '',
  knownSystems: '',
  businessPainPoints: '',
  stakeholders: '',
  constraints: '',
};

const emptyManualMaterialInput: PresalesManualMaterialInput = {
  title: '',
  customerBackground: '',
  meetingNotes: '',
  currentSituation: '',
  openQuestions: '',
};

const emptyResearchInput: PresalesResearchInput = {
  meetingGoal: '',
  attendeeInfo: '',
  knownQuestions: '',
  timeBox: '60 分钟',
};

const emptyArchitectureInput: PresalesArchitectureInput = {
  solutionScope: '',
  architecturePreferences: '',
  integrationNotes: '',
  nonFunctionalRequirements: '',
  deliveryConstraints: '',
};

const diagramTypeOptions = ['系统上下文图', '技术架构图', '业务流程图', '系统集成图', '部署架构图', '数据架构图', '实施路线图'];

const emptyDiagramInput: PresalesDiagramInput = {
  selectedDiagramTypes: diagramTypeOptions,
  diagramFocus: '',
  styleRequirements: '使用 Mermaid 稳定语法，节点命名简洁，信息不足处标注“待确认”。',
};

const presentationTypeOptions = ['高管简报', '方案汇报', '技术深潜', '客户交流会', 'PoC 汇报'];
const deliveryModeOptions = [
  { value: 'customer', label: '客户正式版' },
  { value: 'internal', label: '内部准备版' },
];
const pptLayoutTypeOptions = [
  { value: 'auto', label: '自动判断' },
  { value: 'pain-matrix', label: '痛点矩阵页' },
  { value: 'architecture', label: '架构说明页' },
  { value: 'roadmap', label: '路线图页' },
  { value: 'action-plan', label: '行动计划页' },
  { value: 'visual-brief', label: '图表简报页' },
  { value: 'point-bullets', label: '观点要点页' },
  { value: 'two-column', label: '双栏论证页' },
  { value: 'briefing-notes', label: '图表备注页' },
];
const pptStyleOptions = [
  { value: 'auto', label: '智能匹配' },
  { value: 'cyber-01-crimson', label: '01 经典深红咨询风' },
  { value: 'cyber-02-burgundy-gray', label: '02 冷灰勃艮第' },
  { value: 'cyber-03-ivory-wine', label: '03 暖象牙暗酒红' },
  { value: 'cyber-04-ivory-blue', label: '04 象牙白深蓝' },
  { value: 'cyber-05-gray-green', label: '05 浅灰白墨绿' },
  { value: 'cyber-06-paper-copper', label: '06 纸张米色铜棕' },
  { value: 'cyber-07-black-gold', label: '07 纯净浅灰黑金' },
  { value: 'cyber-08-white-purple', label: '08 冷白灰深紫' },
  { value: 'midnight-executive', label: '午夜商务' },
  { value: 'tech-deep-space', label: '科技深空' },
  { value: 'ocean-gradient', label: '海洋渐变' },
  { value: 'teal-trust', label: '青绿信任' },
  { value: 'charcoal-minimal', label: '炭灰极简' },
  { value: 'warm-clay', label: '暖陶简约' },
  { value: 'coral-energy', label: '珊瑚活力' },
];

const pptStyleSwatches: Record<string, string[]> = {
  auto: ['#f7f6f0', '#12355b', '#c9cdd1'],
  'cyber-01-crimson': ['#f3f4ef', '#8b1e1e', '#d6d6d2'],
  'cyber-02-burgundy-gray': ['#f2f3f5', '#7a1f2b', '#d3d8de'],
  'cyber-03-ivory-wine': ['#f4f1ea', '#8a1538', '#d8d3ca'],
  'cyber-04-ivory-blue': ['#f7f6f0', '#12355b', '#c9cdd1'],
  'cyber-05-gray-green': ['#f4f6f4', '#1f5d50', '#d2dad5'],
  'cyber-06-paper-copper': ['#f4f0e8', '#9a5a2e', '#d8d5ce'],
  'cyber-07-black-gold': ['#f6f6f4', '#000000', '#a87932'],
  'cyber-08-white-purple': ['#f4f5f6', '#4b2e83', '#c8ccd0'],
  'cyber-consulting-blue': ['#f7f6f0', '#12355b', '#0b6efd'],
  'midnight-executive': ['#1e2761', '#cadcfc', '#4f46e5'],
  'tech-deep-space': ['#0d1117', '#161b22', '#58a6ff'],
  'ocean-gradient': ['#065a82', '#1c7293', '#21295c'],
  'teal-trust': ['#028090', '#00a896', '#02c39a'],
  'charcoal-minimal': ['#36454f', '#f2f2f2', '#212121'],
  'warm-clay': ['#b85042', '#e7e8d1', '#a7beae'],
  'coral-energy': ['#f96167', '#f9e795', '#2f3c7e'],
};

const emptyPresentationInput: PresalesPresentationInput = {
  presentationType: '方案汇报',
  pptStyle: 'auto',
  deliveryMode: 'customer',
  audience: '',
  pageCount: '12-15 页',
  presentationGoal: '',
  emphasis: '',
};

type PresalesStepId = 'project' | 'materials' | 'analysis' | 'research' | 'architecture' | 'diagrams' | 'presentation';
type PresalesGenerationStepId = 'analysis' | 'research' | 'architecture' | 'diagrams' | 'presentation';
type LocalTaskProgress = {
  progress: number;
  message: string;
  status: 'running' | 'success' | 'error';
  outputs?: Array<{ type: 'pptx' | 'html'; fileName: string; filePath: string }>;
  outputDir?: string;
};
type WordExportProgressState = {
  running: boolean;
  progress: number;
  message: string;
  error: string;
  filePath?: string;
};
type OutlineExportProgressState = {
  message: string;
  error: string;
  filePath?: string;
};
type PresentationOutlinePageDraft = {
  id: string;
  title: string;
  layoutType: string;
  bodyLines: string[];
};

const workflowSteps: Array<{ id: PresalesStepId; title: string; desc: string }> = [
  { id: 'project', title: '项目资料', desc: '先建项目' },
  { id: 'materials', title: '客户材料', desc: '资料线索' },
  { id: 'analysis', title: '客户分析', desc: '画像痛点' },
  { id: 'research', title: '调研准备', desc: '议程问题' },
  { id: 'architecture', title: '方案架构', desc: '方案骨架' },
  { id: 'diagrams', title: '图表草稿', desc: 'Mermaid' },
  { id: 'presentation', title: '汇报材料', desc: '页纲与方案' },
];

interface PresalesWorkbenchPageProps {
  onNavigate?: (section: SectionId) => void;
}

function getPresalesBridge() {
  const bridge = window.yibiao?.presalesWorkbench;
  if (!bridge) {
    throw new Error('售前工作台本地服务未就绪，请重启客户端后重试。');
  }
  return bridge;
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '尚未生成';
}

function hasText(value?: string) {
  return Boolean(value?.trim());
}

function getNextStepId(stepId: PresalesStepId) {
  const index = workflowSteps.findIndex((step) => step.id === stepId);
  return workflowSteps[index + 1]?.id;
}

function getRecommendedStep(state: PresalesProjectState): PresalesStepId {
  const hasProfile = hasText(state.profile.customerName) || hasText(state.profile.industry) || hasText(state.profile.keyBackground);
  if (!hasProfile) return 'project';
  if (!state.materials.length) return 'materials';
  if (!hasText(state.analysisResult.markdown)) return 'analysis';
  if (!hasText(state.researchResult.markdown)) return 'research';
  if (!hasText(state.architectureResult.markdown)) return 'architecture';
  if (!hasText(state.diagramResult.markdown)) return 'diagrams';
  if (!hasText(state.presentationResult.markdown)) return 'presentation';
  return 'presentation';
}

function getGenerationProgressMessage(type: PresalesGenerationStepId, progress: number) {
  const labels: Record<PresalesGenerationStepId, string[]> = {
    analysis: ['整理项目资料和客户材料', '提炼客户画像与业务现状', '识别痛点、约束和待确认问题', '整理客户分析报告'],
    research: ['读取客户分析结论', '设计调研议程和问题路径', '生成 Q&A 预案和信息清单', '整理调研准备包'],
    architecture: ['汇总需求、约束和调研目标', '构建方案能力框架', '梳理集成、部署和交付边界', '整理方案架构草案'],
    diagrams: ['读取方案架构和关键场景', '设计图表类型和表达重点', '生成 Mermaid 图表草稿', '校验图表说明和待确认项'],
    presentation: ['汇总项目资料和前序成果', '规划汇报结构和页面节奏', '生成页面标题、要点和讲解备注', '整理 PPT 页纲'],
  };
  const index = progress < 24 ? 0 : progress < 52 ? 1 : progress < 82 ? 2 : 3;
  return labels[type][index];
}

function getPptExportProgressMessage(progress: number, visualEnabled: boolean) {
  if (progress < 18) return '正在保存汇报设置';
  if (progress < 34) return '正在检查页纲、样式和项目素材';
  if (visualEnabled && progress < 54) return '正在生成 AI 视觉图';
  if (progress < 70) return '正在组装 PPT 页面版式';
  if (progress < 88) return '正在写入 PPTX 文件';
  return '正在收尾并记录导出结果';
}

function isStepDone(state: PresalesProjectState | null, stepId: PresalesStepId) {
  if (!state) return false;
  switch (stepId) {
    case 'project':
      return hasText(state.profile.customerName) || hasText(state.profile.industry) || hasText(state.profile.keyBackground);
    case 'materials':
      return state.materials.length > 0;
    case 'analysis':
      return hasText(state.analysisResult.markdown);
    case 'research':
      return hasText(state.researchResult.markdown);
    case 'architecture':
      return hasText(state.architectureResult.markdown);
    case 'diagrams':
      return hasText(state.diagramResult.markdown);
    case 'presentation':
      return hasText(state.presentationResult.markdown);
    default:
      return false;
  }
}

function cleanPresentationLine(line: string) {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+]\s*/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/\*\*/g, '')
    .trim();
}

function stripPresentationTitle(line: string) {
  return cleanPresentationLine(line)
    .replace(/^(第\s*)?\d{1,2}\s*(页|P)?\s*[:：.\-、]?\s*/i, '')
    .replace(/^页面标题\s*[:：]\s*/, '')
    .trim();
}

function extractPresentationPageTitles(markdown?: string) {
  const titles: string[] = [];
  String(markdown || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,4}\s*((?:第\s*)?\d{1,2}\s*(?:页|P)?\s*[:：.\-、]\s*.+)$/i);
    const listTitleMatch = trimmed.match(/^[-*+]\s*(?:页码\s*[:：]?\s*)?(?:第\s*)?(\d{1,2})\s*(?:页|P)?\s*[:：.\-、]\s*(.+)$/i);
    if (headingMatch || listTitleMatch) {
      const title = stripPresentationTitle(headingMatch ? headingMatch[1] : `${listTitleMatch?.[1]} ${listTitleMatch?.[2]}`);
      if (title) titles.push(title.slice(0, 42));
    }
  });
  return titles.slice(0, 20);
}

function getPptStyleLabel(value: string) {
  return pptStyleOptions.find((option) => option.value === value)?.label || '智能匹配';
}

function getDeliveryModeLabel(value: string) {
  return deliveryModeOptions.find((option) => option.value === value)?.label || '客户正式版';
}

function getPptLayoutTypeLabel(value: string) {
  return pptLayoutTypeOptions.find((option) => option.value === value)?.label || '自动判断';
}

function getPptStyleSwatches(value: string) {
  return pptStyleSwatches[value] || pptStyleSwatches.auto;
}

function getPresentationLayoutValue(title: string, index: number) {
  if (/痛点|挑战|问题|现状|优先级/.test(title)) return 'pain-matrix';
  if (/架构|能力|系统|集成|部署|技术/.test(title)) return 'architecture';
  if (/路线|计划|阶段|里程碑|实施|推进/.test(title)) return 'roadmap';
  if (/行动|下一步|责任|决策|确认|收口/.test(title)) return 'action-plan';
  if (/图表|流程|素材|表达|Mermaid|可视化/i.test(title)) return 'visual-brief';
  return ['point-bullets', 'two-column', 'briefing-notes'][index % 3];
}

function getPresentationLayoutType(title: string, index: number) {
  return getPptLayoutTypeLabel(getPresentationLayoutValue(title, index));
}

function parsePresentationOutlineDraft(markdown?: string): PresentationOutlinePageDraft[] {
  const lines = String(markdown || '').split(/\r?\n/);
  const pages: PresentationOutlinePageDraft[] = [];
  let current: PresentationOutlinePageDraft | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,4}\s*((?:第\s*)?\d{1,2}\s*(?:页|P)?\s*[:：.\-、]\s*.+)$/i);
    const listTitleMatch = trimmed.match(/^[-*+]\s*(?:页码\s*[:：]?\s*)?(?:第\s*)?(\d{1,2})\s*(?:页|P)?\s*[:：.\-、]\s*(.+)$/i);
    if (headingMatch || listTitleMatch) {
      if (current) pages.push(current);
      const title = stripPresentationTitle(headingMatch ? headingMatch[1] : `${listTitleMatch?.[1]} ${listTitleMatch?.[2]}`);
      current = {
        id: `outline-${pages.length}-${title || Date.now()}`,
        title: title || `汇报页面 ${pages.length + 1}`,
        layoutType: 'auto',
        bodyLines: [],
      };
      return;
    }
    if (current) {
      const layoutMatch = cleanPresentationLine(line).match(/^版式类型\s*[:：]\s*(.+)$/);
      if (layoutMatch) {
        const matched = pptLayoutTypeOptions.find((option) => option.label === layoutMatch[1] || option.value === layoutMatch[1]);
        current.layoutType = matched?.value || 'auto';
        return;
      }
      current.bodyLines.push(line);
    }
  });

  if (current) pages.push(current);
  return pages.slice(0, 20);
}

function buildPresentationOutlineMarkdown(pages: PresentationOutlinePageDraft[]) {
  return pages.map((page, index) => {
    const layoutLine = page.layoutType !== 'auto' ? [`- 版式类型：${getPptLayoutTypeLabel(page.layoutType)}`] : [];
    const bodyLines = page.bodyLines
      .filter((line) => !/^版式类型\s*[:：]/.test(cleanPresentationLine(line)))
      .join('\n')
      .trim();
    const fallbackBody = [
      '- 核心观点：围绕客户关注点展开说明。',
      '- 页面内容要点：',
      '  - 待补充页面内容。',
      '- 推荐图表/素材：待补充。',
      '- 讲解备注：待补充。',
      '- 待补充信息：待确认。',
    ].join('\n');
    return [`## 第 ${index + 1} 页：${page.title || `汇报页面 ${index + 1}`}`, ...layoutLine, bodyLines || fallbackBody].join('\n');
  }).join('\n\n');
}

function buildPresalesProposalWordOutline(state: PresalesProjectState) {
  const profile = state.profile;
  const projectName = profile.projectName || profile.customerName || '售前方案';
  const projectSummary = [
    '| 字段 | 内容 |',
    '| --- | --- |',
    `| 项目名称 | ${projectName} |`,
    `| 客户名称 | ${profile.customerName || '待确认'} |`,
    `| 行业领域 | ${profile.industry || '待确认'} |`,
    `| 当前阶段 | ${profile.currentStage || '待确认'} |`,
    `| 机会来源 | ${profile.opportunitySource || '待确认'} |`,
    `| 负责人 | ${profile.owner || '待确认'} |`,
    `| 预估价值 | ${profile.expectedValue || '待确认'} |`,
    `| 决策时间 | ${profile.decisionDate || '待确认'} |`,
  ].join('\n');

  const normalizeProposalMarkdown = (markdown: string | undefined) => {
    return String(markdown || '')
      .replace(/^#{1,6}\s+/gm, '## ')
      .replace(/^(#{2}\s*)\s*(?:\d+(?:\.\d+)*|[（(]?\d+[）)]|[一二三四五六七八九十]+)[、.)．]?\s*/gm, '$1')
      .replace(/^\s*(项目名称|客户名称|行业领域|当前阶段|机会来源|负责人|预估价值|决策时间)：\s*/gm, '$1：')
      .trim();
  };

  return [
    {
      id: 'presales-proposal-background',
      title: '项目背景与客户理解',
      description: '',
      content: [
        '## 项目基本信息',
        projectSummary,
        '',
        profile.keyBackground || '项目背景待补充。',
        '',
        '## 客户材料摘要',
        state.materials.length ? state.materials.map((item, index) => `${index + 1}. ${item.name}（${item.type || '客户材料'}）`).join('\n') : '暂无导入或手动录入的客户材料。',
      ].join('\n'),
    },
    {
      id: 'presales-proposal-analysis',
      title: '客户现状、痛点与需求分析',
      description: '',
      content: normalizeProposalMarkdown(state.analysisResult.markdown) || '暂无客户分析报告，请先生成客户分析。',
    },
    {
      id: 'presales-proposal-objectives',
      title: '建设目标与方案定位',
      description: '',
      content: [
        '本方案围绕客户当前阶段的业务目标、技术约束和后续推进要求展开，重点说明建设目标、方案边界、关键能力和实施路径。',
        '',
        normalizeProposalMarkdown(state.researchResult.markdown) || '暂无调研准备包，可作为后续补充。',
      ].join('\n'),
    },
    {
      id: 'presales-proposal-architecture',
      title: '总体方案架构',
      description: '',
      content: normalizeProposalMarkdown(state.architectureResult.markdown) || '暂无方案架构草案，请先生成方案架构。',
    },
    {
      id: 'presales-proposal-diagrams',
      title: '关键图表与能力说明',
      description: '',
      content: normalizeProposalMarkdown(state.diagramResult.markdown) || '暂无图表草稿，可补充系统上下文图、技术架构图、流程图和部署图。',
    },
    {
      id: 'presales-proposal-delivery',
      title: '实施路径、风险与待确认事项',
      description: '',
      content: [
        normalizeProposalMarkdown(state.presentationResult.markdown) || '暂无汇报页纲，可补充汇报重点和下一步行动。',
        '',
        '## 后续建议',
        '- 补齐客户现有系统清单、接口边界、部署约束和安全要求。',
        '- 明确客户侧业务负责人、技术负责人和决策路径。',
        '- 根据客户反馈更新方案范围、实施计划和预算测算。',
      ].join('\n'),
    },
  ];
}

function PresalesWorkbenchPage({ onNavigate }: PresalesWorkbenchPageProps) {
  const { showToast } = useToast();
  const [state, setState] = useState<PresalesProjectState | null>(null);
  const [activeStep, setActiveStep] = useState<PresalesStepId>('project');
  const [profileDraft, setProfileDraft] = useState<PresalesProjectProfile>(emptyProfile);
  const [analysisDraft, setAnalysisDraft] = useState<PresalesAnalysisInput>(emptyAnalysisInput);
  const [researchDraft, setResearchDraft] = useState<PresalesResearchInput>(emptyResearchInput);
  const [architectureDraft, setArchitectureDraft] = useState<PresalesArchitectureInput>(emptyArchitectureInput);
  const [diagramDraft, setDiagramDraft] = useState<PresalesDiagramInput>(emptyDiagramInput);
  const [presentationDraft, setPresentationDraft] = useState<PresalesPresentationInput>(emptyPresentationInput);
  const [manualMaterialDraft, setManualMaterialDraft] = useState<PresalesManualMaterialInput>(emptyManualMaterialInput);
  const [manualMaterialOpen, setManualMaterialOpen] = useState(false);
  const [activeMaterialId, setActiveMaterialId] = useState('');
  const [activeMaterialMarkdown, setActiveMaterialMarkdown] = useState('');
  const [localTaskProgress, setLocalTaskProgress] = useState<Partial<Record<PresalesGenerationStepId, LocalTaskProgress>>>({});
  const [pptExportProgress, setPptExportProgress] = useState<LocalTaskProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingManualMaterial, setIsSavingManualMaterial] = useState(false);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isGeneratingResearch, setIsGeneratingResearch] = useState(false);
  const [isGeneratingArchitecture, setIsGeneratingArchitecture] = useState(false);
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const [isGeneratingPresentation, setIsGeneratingPresentation] = useState(false);
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [isPreviewingPackage, setIsPreviewingPackage] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isExportingOutline, setIsExportingOutline] = useState(false);
  const [wordExportProgress, setWordExportProgress] = useState<WordExportProgressState>({
    running: false,
    progress: 0,
    message: '',
    error: '',
  });
  const [outlineExportProgress, setOutlineExportProgress] = useState<OutlineExportProgressState>({ message: '', error: '' });
  const [presentationExportFormats, setPresentationExportFormats] = useState<{ pptx: boolean; html: boolean }>({ pptx: true, html: false });
  const [presentationExportOptionsOpen, setPresentationExportOptionsOpen] = useState(false);
  const [useAiVisuals, setUseAiVisuals] = useState(false);
  const [imageModelAvailability, setImageModelAvailability] = useState<{ available: boolean; message?: string }>({ available: false, message: '正在检测生图模型' });
  const [packagePreviewOpen, setPackagePreviewOpen] = useState(false);
  const [packagePreviewMarkdown, setPackagePreviewMarkdown] = useState('');
  const [pptStructurePreviewOpen, setPptStructurePreviewOpen] = useState(false);
  const [outlineDraftPages, setOutlineDraftPages] = useState<PresentationOutlinePageDraft[]>([]);

  const activeProjectName = useMemo(() => {
    return state?.profile.projectName?.trim() || state?.profile.customerName?.trim() || '未命名售前项目';
  }, [state]);

  const presentationExportCheck = useMemo(() => {
    const pageTitles = extractPresentationPageTitles(state?.presentationResult.markdown);
    const warnings: string[] = [];
    if (!state) {
      return {
        pageTitles,
        estimatedPages: 0,
        qualityScore: 0,
        styleLabel: getPptStyleLabel(presentationDraft.pptStyle),
        deliveryModeLabel: getDeliveryModeLabel(presentationDraft.deliveryMode),
        visualStatus: '正在检测',
        warnings: ['售前项目尚未加载完成'],
      };
    }
    if (!hasText(state.presentationResult.markdown)) warnings.push('还没有生成汇报页纲，导出页纲前请先生成。');
    if (pageTitles.length > 0 && pageTitles.length < 4) warnings.push('当前页纲页数偏少，建议补充到 6 页以上再导出。');
    if (!hasText(state.profile.customerName)) warnings.push('客户名称未填写，页纲和售前方案会显示“未填写”。');
    if (!hasText(state.profile.industry)) warnings.push('行业领域未填写，页纲里的行业语境会偏弱。');
    if (!state.materials.length) warnings.push('尚未导入或录入客户材料，内容依据会偏弱。');
    if (!hasText(state.analysisResult.markdown)) warnings.push('缺少客户分析报告，痛点和现状页会偏空。');
    if (!hasText(state.architectureResult.markdown)) warnings.push('缺少方案架构草案，方案页表达会偏弱。');
    if (!hasText(state.diagramResult.markdown)) warnings.push('缺少图表草稿，页纲里的图表建议会偏泛。');

    const completedItems = [
      hasText(state.profile.customerName),
      hasText(state.profile.industry),
      state.materials.length > 0,
      hasText(state.analysisResult.markdown),
      hasText(state.architectureResult.markdown),
      hasText(state.diagramResult.markdown),
      hasText(state.presentationResult.markdown),
    ].filter(Boolean).length;
    const qualityScore = Math.max(30, Math.round((completedItems / 7) * 100));
    const visualEnabled = useAiVisuals && imageModelAvailability.available;
    return {
      pageTitles,
      estimatedPages: pageTitles.length || 6,
      qualityScore,
      styleLabel: getPptStyleLabel(presentationDraft.pptStyle),
      deliveryModeLabel: getDeliveryModeLabel(presentationDraft.deliveryMode),
      visualStatus: visualEnabled ? '已启用' : imageModelAvailability.available ? '未启用' : '不可用',
      warnings,
    };
  }, [imageModelAvailability.available, presentationDraft.deliveryMode, presentationDraft.pptStyle, state, useAiVisuals]);

  const pptStructurePreview = useMemo(() => {
    const fallbackTitles = ['项目概览', '客户现状与痛点', '调研准备与关键问题', '方案架构与核心能力', '核心图表与表达建议', '汇报重点与下一步行动'];
    const sourceTitles = presentationExportCheck.pageTitles.length ? presentationExportCheck.pageTitles : fallbackTitles;
    const sourceLabel = presentationExportCheck.pageTitles.length ? 'AI 页纲' : '兜底结构';
    return {
      swatches: getPptStyleSwatches(presentationDraft.pptStyle),
      pages: [
        { title: activeProjectName, type: '封面页', source: '系统生成' },
        { title: '汇报结构', type: '目录页', source: '系统生成' },
        ...sourceTitles.map((title, index) => ({
          title,
          type: getPresentationLayoutType(title, index),
          source: sourceLabel,
        })),
      ],
    };
  }, [activeProjectName, presentationDraft.pptStyle, presentationExportCheck.pageTitles]);

  function applyState(nextState: PresalesProjectState) {
    setState(nextState);
    setProfileDraft(nextState.profile);
    setAnalysisDraft(nextState.analysisInput);
    setResearchDraft(nextState.researchInput);
    setArchitectureDraft(nextState.architectureInput);
    setDiagramDraft(nextState.diagramInput);
    setPresentationDraft(nextState.presentationInput);
    setActiveMaterialId((current) => {
      if (current && nextState.materials.some((material) => material.id === current)) return current;
      return nextState.materials[0]?.id || '';
    });
  }

  useEffect(() => {
    let mounted = true;
    const bridge = getPresalesBridge();
    Promise.all([
      bridge.loadState(),
      bridge.getImageModelAvailability().catch((error) => ({ available: false, message: error?.message || '生图模型状态读取失败' })),
    ])
      .then(([nextState, availability]) => {
        if (!mounted) return;
        applyState(nextState);
        setActiveStep(getRecommendedStep(nextState));
        setImageModelAvailability(availability);
        setUseAiVisuals(Boolean(availability.available));
      })
      .catch((error) => {
        showToast(error?.message || '请稍后重试', 'error', { title: '售前工作台加载失败' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  useEffect(() => {
    setOutlineDraftPages(parsePresentationOutlineDraft(state?.presentationResult.markdown));
  }, [state?.presentationResult.markdown]);

  useEffect(() => {
    if (!activeMaterialId) {
      setActiveMaterialMarkdown('');
      return;
    }

    let mounted = true;
    getPresalesBridge().readMaterialMarkdown(activeMaterialId)
      .then((markdown) => {
        if (mounted) setActiveMaterialMarkdown(markdown);
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : String(error), 'error', { title: '材料预览失败' });
      });

    return () => {
      mounted = false;
    };
  }, [activeMaterialId, showToast]);

  async function saveProfile() {
    setIsSaving(true);
    try {
      const nextState = await getPresalesBridge().saveProfile(profileDraft);
      applyState(nextState);
      showToast('项目资料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAnalysisInput() {
    setIsSaving(true);
    try {
      const nextState = await getPresalesBridge().saveAnalysisInput(analysisDraft);
      applyState(nextState);
      showToast('分析材料已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveResearchInput() {
    setIsSaving(true);
    try {
      const nextState = await getPresalesBridge().saveResearchInput(researchDraft);
      applyState(nextState);
      showToast('调研设置已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveArchitectureInput() {
    setIsSaving(true);
    try {
      const nextState = await getPresalesBridge().saveArchitectureInput(architectureDraft);
      applyState(nextState);
      showToast('架构输入已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDiagramInput() {
    setIsSaving(true);
    try {
      const nextState = await getPresalesBridge().saveDiagramInput(diagramDraft);
      applyState(nextState);
      showToast('图表设置已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function savePresentationInput() {
    setIsSaving(true);
    try {
      const nextState = await getPresalesBridge().savePresentationInput(presentationDraft);
      applyState(nextState);
      showToast('汇报设置已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function savePresentationOutlineDraft() {
    if (!outlineDraftPages.length) {
      showToast('当前还没有可编辑的汇报页纲', 'info');
      return;
    }
    setIsSaving(true);
    try {
      const markdown = buildPresentationOutlineMarkdown(outlineDraftPages);
      const nextState = await getPresalesBridge().savePresentationResult({ markdown });
      applyState(nextState);
      showToast('汇报页纲已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存大纲失败' });
    } finally {
      setIsSaving(false);
    }
  }

  async function importMaterial() {
    setIsImporting(true);
    try {
      const result = await getPresalesBridge().importMaterial();
      if (!result.success) {
        showToast(result.message || '已取消选择', 'info');
        return;
      }
      applyState(result.state);
      if (result.material) setActiveMaterialId(result.material.id);
      showToast(result.message || '客户材料导入完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '导入失败' });
    } finally {
      setIsImporting(false);
    }
  }

  async function saveManualMaterial() {
    setIsSavingManualMaterial(true);
    try {
      const result = await getPresalesBridge().saveManualMaterial(manualMaterialDraft);
      if (!result.success) {
        showToast(result.message || '请先填写客户线索', 'info');
        return;
      }
      applyState(result.state);
      if (result.material) setActiveMaterialId(result.material.id);
      setManualMaterialDraft(emptyManualMaterialInput);
      setManualMaterialOpen(false);
      showToast(result.message || '手动客户信息已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '保存失败' });
    } finally {
      setIsSavingManualMaterial(false);
    }
  }

  async function runGeneration(
    type: PresalesGenerationStepId,
    runner: () => Promise<PresalesProjectState>,
    setRunning: (value: boolean) => void,
    successMessage: string,
  ) {
    setRunning(true);
    setLocalTaskProgress((current) => ({
      ...current,
      [type]: {
        progress: 6,
        message: getGenerationProgressMessage(type, 6),
        status: 'running',
      },
    }));
    const timer = window.setInterval(() => {
      setLocalTaskProgress((current) => {
        const task = current[type];
        if (!task || task.status !== 'running') return current;
        const step = task.progress < 28 ? 7 : task.progress < 58 ? 5 : task.progress < 82 ? 3 : 1;
        const nextProgress = Math.min(92, task.progress + step);
        return {
          ...current,
          [type]: {
            ...task,
            progress: nextProgress,
            message: getGenerationProgressMessage(type, nextProgress),
          },
        };
      });
    }, 900);
    try {
      const nextState = await runner();
      applyState(nextState);
      setLocalTaskProgress((current) => ({
        ...current,
        [type]: {
          progress: 100,
          message: successMessage,
          status: 'success',
        },
      }));
      showToast(successMessage, 'success');
    } catch (error) {
      setLocalTaskProgress((current) => ({
        ...current,
        [type]: {
          progress: 100,
          message: error instanceof Error ? error.message : '生成失败',
          status: 'error',
        },
      }));
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '生成失败' });
      try {
        applyState(await getPresalesBridge().loadState());
      } catch {
        // ignore refresh failure after generation error
      }
    } finally {
      window.clearInterval(timer);
      setRunning(false);
      window.setTimeout(() => {
        setLocalTaskProgress((current) => {
          const next = { ...current };
          delete next[type];
          return next;
        });
      }, 1200);
    }
  }

  async function generateAnalysis() {
    await runGeneration('analysis', async () => {
      await getPresalesBridge().saveAnalysisInput(analysisDraft);
      return getPresalesBridge().generateAnalysis();
    }, setIsGeneratingAnalysis, '客户分析报告已生成');
  }

  async function generateResearch() {
    await runGeneration('research', async () => {
      await getPresalesBridge().saveResearchInput(researchDraft);
      return getPresalesBridge().generateResearch();
    }, setIsGeneratingResearch, '调研准备包已生成');
  }

  async function generateArchitecture() {
    await runGeneration('architecture', async () => {
      await getPresalesBridge().saveArchitectureInput(architectureDraft);
      return getPresalesBridge().generateArchitecture();
    }, setIsGeneratingArchitecture, '方案架构草案已生成');
  }

  async function generateDiagrams() {
    await runGeneration('diagrams', async () => {
      await getPresalesBridge().saveDiagramInput(diagramDraft);
      return getPresalesBridge().generateDiagrams();
    }, setIsGeneratingDiagrams, '图表草稿已生成');
  }

  async function generatePresentation() {
    await runGeneration('presentation', async () => {
      await getPresalesBridge().savePresentationInput(presentationDraft);
      return getPresalesBridge().generatePresentation();
    }, setIsGeneratingPresentation, '汇报材料页纲已生成');
  }

  async function exportPresentationOutline() {
    setIsExportingOutline(true);
    setOutlineExportProgress({ message: '正在导出售前汇报页纲。', error: '' });
    try {
      await getPresalesBridge().savePresentationInput(presentationDraft);
      const result = await getPresalesBridge().exportPresentationOutline();
      setOutlineExportProgress({
        message: result.message || (result.success ? '售前汇报页纲已导出，点击下方路径可打开导出目录。' : '已取消导出。'),
        error: result.success ? '' : result.message || '',
        filePath: result.filePath || '',
      });
      if (result.success) {
        applyState(result.state);
        showToast(result.message || '售前汇报页纲已导出', 'success');
      } else if (!result.canceled) {
        showToast(result.message || '导出页纲失败', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出页纲失败';
      setOutlineExportProgress({ message, error: message });
      showToast(message, 'error', { title: '导出页纲失败' });
    } finally {
      setIsExportingOutline(false);
    }
  }

  async function exportProjectPackage() {
    setIsExportingPackage(true);
    try {
      const result = await getPresalesBridge().exportProjectPackage();
      if (!result.success) {
        showToast(result.message || '已取消导出', 'info');
        return;
      }
      applyState(result.state);
      showToast(result.message || '售前项目包已导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '导出失败' });
    } finally {
      setIsExportingPackage(false);
    }
  }

  async function previewProjectPackage() {
    setIsPreviewingPackage(true);
    try {
      const result = await getPresalesBridge().previewProjectPackage();
      applyState(result.state);
      setPackagePreviewMarkdown(result.markdown);
      setPackagePreviewOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '预览失败' });
    } finally {
      setIsPreviewingPackage(false);
    }
  }

  type PresentationExportFormatState = { pptx: boolean; html: boolean };

  async function exportPresentationPptx(selectedFormats: PresentationExportFormatState = presentationExportFormats) {
    const formats = [
      selectedFormats.pptx ? 'pptx' : '',
      selectedFormats.html ? 'html' : '',
    ].filter(Boolean) as Array<'pptx' | 'html'>;
    if (!formats.length) {
      showToast('请至少选择一种导出格式', 'info');
      return;
    }
    const visualEnabled = useAiVisuals && imageModelAvailability.available;
    setIsExportingPptx(true);
    setPptExportProgress({
      progress: 6,
      message: getPptExportProgressMessage(6, visualEnabled),
      status: 'running',
    });
    const timer = window.setInterval(() => {
      setPptExportProgress((current) => {
        if (!current || current.status !== 'running') return current;
        const step = current.progress < 30 ? 6 : current.progress < 62 ? 4 : current.progress < 84 ? 3 : 1;
        const nextProgress = Math.min(94, current.progress + step);
        return {
          ...current,
          progress: nextProgress,
          message: getPptExportProgressMessage(nextProgress, visualEnabled),
        };
      });
    }, 850);
    try {
      await getPresalesBridge().savePresentationInput(presentationDraft);
      setPptExportProgress((current) => current ? {
        ...current,
        progress: Math.max(current.progress, 22),
        message: getPptExportProgressMessage(22, visualEnabled),
      } : current);
      const result = await getPresalesBridge().exportPresentationPptx({ useAiVisuals, formats });
      if (!result.success) {
        setPptExportProgress({
          progress: 100,
          message: result.message || '已取消导出',
          status: 'error',
        });
        showToast(result.message || '已取消导出', 'info');
        return;
      }
      applyState(result.state);
      setPptExportProgress({
        progress: 100,
        message: result.fileName ? `已导出 ${result.fileName}` : '汇报材料导出完成',
        status: 'success',
        outputs: result.outputs || (result.filePath && result.fileName ? [{ type: 'pptx', fileName: result.fileName, filePath: result.filePath }] : []),
        outputDir: result.outputDir,
      });
      showToast(result.message || '售前汇报材料已导出', 'success');
    } catch (error) {
      setPptExportProgress({
        progress: 100,
        message: error instanceof Error ? error.message : '导出汇报材料失败',
        status: 'error',
      });
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '导出汇报材料失败' });
    } finally {
      window.clearInterval(timer);
      setIsExportingPptx(false);
    }
  }

  function confirmPresentationExport() {
    const selectedFormats = { ...presentationExportFormats };
    if (!selectedFormats.pptx && !selectedFormats.html) {
      showToast('请至少选择一种导出格式', 'info');
      return;
    }
    setPresentationExportOptionsOpen(false);
    void exportPresentationPptx(selectedFormats);
  }

  async function exportPresalesProposalWord() {
    if (!state) {
      showToast('售前项目尚未加载完成', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未连接 Word 导出能力，请在客户端中导出。', 'info');
      return;
    }

    const requestId = `presales-proposal-word-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unsubscribe: (() => void) | undefined;
    const projectName = state.profile.projectName || state.profile.customerName || '售前方案';

    try {
      setWordExportProgress({
        running: true,
        progress: 2,
        message: '正在准备导出售前方案 Word。',
        error: '',
        filePath: '',
      });
      unsubscribe = window.yibiao.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setWordExportProgress((current) => ({
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          error: event.phase === 'error' ? event.message : '',
          filePath: current.filePath,
        }));
      });

      const nextState = await getPresalesBridge().savePresentationInput(presentationDraft);
      applyState(nextState);
      const result = await window.yibiao.export.exportWord({
        requestId,
        project_name: `${projectName}售前方案`,
        document_profile: 'presales-proposal',
        document_title: `${projectName}售前方案`,
        project_profile: {
          projectName: nextState.profile.projectName || projectName,
          customerName: nextState.profile.customerName || '待确认',
          industry: nextState.profile.industry || '待确认',
          currentStage: nextState.profile.currentStage || '待确认',
          owner: nextState.profile.owner || '待确认',
        },
        outline: buildPresalesProposalWordOutline(nextState),
      });
      setWordExportProgress({
        running: false,
        progress: result.success ? 100 : 0,
        message: result.message || (result.success ? '售前方案 Word 已导出，点击下方路径可打开导出目录。' : '已取消导出。'),
        error: result.success ? '' : result.message || '',
        filePath: result.filePath || result.path || '',
      });
      if (result.success) {
        const exportedFilePath = result.filePath || result.path || '';
        if (exportedFilePath) {
          try {
            const recorded = await getPresalesBridge().recordExport({
              type: 'word',
              filePath: exportedFilePath,
              pptStyle: presentationDraft.pptStyle,
              deliveryMode: presentationDraft.deliveryMode,
              useAiVisuals: false,
              pageCount: 0,
            });
            applyState(recorded.state);
          } catch (recordError) {
            showToast(recordError instanceof Error ? recordError.message : 'Word 已导出，但导出记录写入失败', 'info');
          }
        }
        showToast(result.message || '售前方案 Word 已导出', result.warnings?.length ? 'info' : 'success');
      } else if (!result.canceled) {
        showToast(result.message || '导出售前方案失败', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出售前方案失败';
      setWordExportProgress({
        running: false,
        progress: 100,
        message,
        error: message,
        filePath: '',
      });
      showToast(message, 'error', { title: '导出失败' });
    } finally {
      unsubscribe?.();
    }
  }

  async function showExportFile(filePath: string) {
    try {
      await getPresalesBridge().showExportFile(filePath);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '打开位置失败' });
    }
  }

  async function clearExportRecords() {
    try {
      const result = await getPresalesBridge().clearExportRecords();
      applyState(result.state);
      showToast('已清除导出记录，导出的文件不会被删除。', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error', { title: '清除记录失败' });
    }
  }

  function getExportRecordTypeLabel(type: string) {
    if (type === 'html') return 'HTML 演示';
    if (type === 'word') return 'Word 方案';
    if (type === 'outline') return '汇报页纲';
    return 'PPTX';
  }

  function getExportDirectoryDisplay(filePath: string) {
    const normalized = String(filePath || '');
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return index > 0 ? normalized.slice(0, index) : normalized;
  }

  function toggleDiagramType(diagramType: string) {
    setDiagramDraft((current) => {
      const exists = current.selectedDiagramTypes.includes(diagramType);
      const selectedDiagramTypes = exists
        ? current.selectedDiagramTypes.filter((item) => item !== diagramType)
        : [...current.selectedDiagramTypes, diagramType];
      return { ...current, selectedDiagramTypes };
    });
  }

  function renderTaskCard(type: PresalesStepId) {
    const localTask = ['analysis', 'research', 'architecture', 'diagrams', 'presentation'].includes(type)
      ? localTaskProgress[type as PresalesGenerationStepId]
      : undefined;
    const remoteTask = state?.task && state.task.type === type && state.task.status === 'running' ? state.task : null;
    const task = localTask || remoteTask;
    if (!task) return null;
    const progress = Math.max(0, Math.min(100, task.progress || 6));
    return (
      <div className={`presales-task-card ${task.status === 'error' ? 'is-error' : task.status === 'success' ? 'is-success' : ''}`}>
        <div>
          <strong>{task.message || getGenerationProgressMessage(type as PresalesGenerationStepId, progress)}</strong>
          <span>{progress}%</span>
        </div>
        <i><b style={{ width: `${progress}%` }} /></i>
        <p>{task.status === 'success' ? '生成完成，结果已写入当前售前项目。' : task.status === 'error' ? '生成未完成，请根据错误信息调整后重试。' : '正在按阶段生成内容，完成后会自动写入当前售前项目。'}</p>
      </div>
    );
  }

  function renderPresentationExportOptionsDialog() {
    const canExport = presentationExportFormats.pptx || presentationExportFormats.html;
    return (
      <Dialog.Root open={presentationExportOptionsOpen} onOpenChange={setPresentationExportOptionsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="presales-ppt-export-dialog">
            <div className="presales-ppt-export-head">
              <div>
                <Dialog.Title>导出汇报材料</Dialog.Title>
                <Dialog.Description>
                  请选择本次要导出的格式，可以同时导出 PPTX 和 HTML 演示。
                </Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭导出设置">×</Dialog.Close>
            </div>
            <div className="presales-export-option-panel">
              <label className="presales-ai-visual-toggle is-inline">
                <input type="checkbox" checked={presentationExportFormats.pptx} onChange={(event) => setPresentationExportFormats((current) => ({ ...current, pptx: event.target.checked }))} />
                <span>PPTX</span>
              </label>
              <label className="presales-ai-visual-toggle is-inline">
                <input type="checkbox" checked={presentationExportFormats.html} onChange={(event) => setPresentationExportFormats((current) => ({ ...current, html: event.target.checked }))} />
                <span>HTML 演示</span>
              </label>
            </div>
            <p className="presales-export-option-note">
              PPTX 适合客户侧继续编辑；HTML 演示适合浏览器全屏播放，带翻页和舒适动效。
            </p>
            <div className="presales-package-preview-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={confirmPresentationExport} disabled={!canExport || isExportingPptx}>
                {isExportingPptx ? '导出中...' : '确定导出'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderPptExportProgressDialog() {
    const progress = Math.max(0, Math.min(100, pptExportProgress?.progress || 0));
    return (
      <Dialog.Root
        open={Boolean(pptExportProgress)}
        onOpenChange={(open) => {
          if (!open && !isExportingPptx) setPptExportProgress(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="presales-ppt-export-dialog">
            <div className="presales-ppt-export-head">
              <div>
                <Dialog.Title>正在导出售前汇报材料</Dialog.Title>
                <Dialog.Description>
                  系统正在保存设置、组装页面并写入所选格式，请稍候。
                </Dialog.Description>
              </div>
              {!isExportingPptx ? (
                <Dialog.Close className="detail-help-close" type="button" aria-label="关闭导出进度">×</Dialog.Close>
              ) : null}
            </div>
            <div className={`presales-ppt-export-progress ${pptExportProgress?.status === 'error' ? 'is-error' : pptExportProgress?.status === 'success' ? 'is-success' : ''}`}>
              <div>
                <strong>{pptExportProgress?.message || '正在准备导出'}</strong>
                <span>{progress}%</span>
              </div>
              <i><b style={{ width: `${progress}%` }} /></i>
              <p>
                {pptExportProgress?.status === 'success'
                  ? '汇报材料已生成并记录到当前项目的导出记录中。'
                  : pptExportProgress?.status === 'error'
                    ? '导出未完成，请根据提示调整后重试。'
                    : '导出期间请不要关闭客户端，完成后会显示导出路径。'}
              </p>
            </div>
            {pptExportProgress?.status === 'success' && pptExportProgress.outputs?.length ? (
              <div className="presales-export-path-list">
                {pptExportProgress.outputs.map((output) => (
                  <button key={`${output.type}-${output.filePath}`} type="button" onClick={() => showExportFile(output.filePath)}>
                    <span>{output.type === 'html' ? 'HTML 演示' : 'PPTX'}</span>
                    <strong>{output.filePath}</strong>
                  </button>
                ))}
              </div>
            ) : null}
            {!isExportingPptx ? (
              <div className="presales-package-preview-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderWordExportProgressDialog() {
    const open = wordExportProgress.running || Boolean(wordExportProgress.message);
    if (!open) return null;
    const progress = Math.max(0, Math.min(100, wordExportProgress.progress || 0));
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !wordExportProgress.running) {
            setWordExportProgress({ running: false, progress: 0, message: '', error: '', filePath: '' });
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="presales-ppt-export-dialog">
            <div className="presales-ppt-export-head">
              <div>
                <Dialog.Title>正在导出售前方案 Word</Dialog.Title>
                <Dialog.Description>系统正在按 Word 优化规则整理正文、标题、编号和版式。</Dialog.Description>
              </div>
              {!wordExportProgress.running ? (
                <Dialog.Close className="detail-help-close" type="button" aria-label="关闭 Word 导出进度">×</Dialog.Close>
              ) : null}
            </div>
            <div className={`presales-ppt-export-progress ${wordExportProgress.error ? 'is-error' : progress >= 100 ? 'is-success' : ''}`}>
              <div>
                <strong>{wordExportProgress.message || '正在准备 Word 导出'}</strong>
                <span>{progress}%</span>
              </div>
              <i><b style={{ width: `${progress}%` }} /></i>
              <p>{wordExportProgress.error ? '导出未完成，请根据提示调整后重试。' : '导出完成后可在 Word/WPS 中继续微调目录和页码。'}</p>
            </div>
            {!wordExportProgress.running && !wordExportProgress.error && wordExportProgress.filePath ? (
              <div className="presales-export-path-list">
                <button type="button" onClick={() => showExportFile(wordExportProgress.filePath || '')}>
                  <span>点击打开导出目录</span>
                  <strong title={wordExportProgress.filePath}>{getExportDirectoryDisplay(wordExportProgress.filePath)}</strong>
                </button>
              </div>
            ) : null}
            {!wordExportProgress.running ? (
              <div className="presales-package-preview-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderOutlineExportDialog() {
    const open = Boolean(outlineExportProgress.message);
    if (!open) return null;
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isExportingOutline) {
            setOutlineExportProgress({ message: '', error: '', filePath: '' });
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="presales-ppt-export-dialog">
            <div className="presales-ppt-export-head">
              <div>
                <Dialog.Title>导出售前汇报页纲</Dialog.Title>
                <Dialog.Description>页纲会保存为 Markdown 文件，可继续交给其他 AI 或 PPT 工具使用。</Dialog.Description>
              </div>
              {!isExportingOutline ? (
                <Dialog.Close className="detail-help-close" type="button" aria-label="关闭页纲导出结果">×</Dialog.Close>
              ) : null}
            </div>
            <div className={`presales-ppt-export-progress ${outlineExportProgress.error ? 'is-error' : outlineExportProgress.filePath ? 'is-success' : ''}`}>
              <div>
                <strong>{outlineExportProgress.message || '正在导出页纲'}</strong>
                <span>{outlineExportProgress.filePath ? '100%' : '...'}</span>
              </div>
              <i><b style={{ width: outlineExportProgress.filePath ? '100%' : '42%' }} /></i>
              <p>{outlineExportProgress.error ? '导出未完成，请根据提示调整后重试。' : '导出完成后点击路径可打开所在目录。'}</p>
            </div>
            {!isExportingOutline && !outlineExportProgress.error && outlineExportProgress.filePath ? (
              <div className="presales-export-path-list">
                <button type="button" onClick={() => showExportFile(outlineExportProgress.filePath || '')}>
                  <span>点击打开导出目录</span>
                  <strong title={outlineExportProgress.filePath}>{getExportDirectoryDisplay(outlineExportProgress.filePath)}</strong>
                </button>
              </div>
            ) : null}
            {!isExportingOutline ? (
              <div className="presales-package-preview-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderMarkdownResult(markdown: string | undefined, emptyTitle: string, emptyText: string) {
    return (
      <div className="presales-analysis-result">
        {markdown?.trim() ? (
          <MarkdownRenderer allowRawHtml={false}>{markdown}</MarkdownRenderer>
        ) : (
          <div className="presales-empty-material">
            <strong>{emptyTitle}</strong>
            <span>{emptyText}</span>
          </div>
        )}
      </div>
    );
  }

  function renderPresentationExportCheck() {
    const previewTitles = presentationExportCheck.pageTitles.length
      ? presentationExportCheck.pageTitles
      : ['项目概览', '客户现状与痛点', '调研准备与关键问题', '方案架构与核心能力', '核心图表与表达建议', '汇报重点与下一步行动'];
    return (
      <div className="presales-ppt-check">
        <div className="presales-ppt-check-head">
          <div>
            <span className="section-kicker">页纲检查</span>
            <h4>汇报页纲完整度</h4>
          </div>
          <strong className={presentationExportCheck.qualityScore >= 80 ? 'is-good' : presentationExportCheck.qualityScore >= 55 ? 'is-warn' : 'is-risk'}>
            {presentationExportCheck.qualityScore} 分
          </strong>
        </div>
        <div className="presales-ppt-check-metrics">
          <span>预计页数：<b>{presentationExportCheck.estimatedPages + 2}</b></span>
          <span>内容页：<b>{presentationExportCheck.estimatedPages}</b></span>
          <span>听众：<b>{presentationDraft.audience.trim() || '未填写'}</b></span>
          <span>目标：<b>{presentationDraft.presentationGoal.trim() ? '已填写' : '未填写'}</b></span>
          <span>强调：<b>{presentationDraft.emphasis.trim() ? '已填写' : '未填写'}</b></span>
        </div>
        <div className="presales-ppt-page-preview">
          {previewTitles.slice(0, 10).map((title, index) => (
            <span key={`${title}-${index}`}><b>{String(index + 1).padStart(2, '0')}</b>{title}</span>
          ))}
          {previewTitles.length > 10 ? <span><b>+</b>另有 {previewTitles.length - 10} 页</span> : null}
        </div>
        <div className={presentationExportCheck.warnings.length ? 'presales-ppt-check-warnings' : 'presales-ppt-check-warnings is-ok'}>
          {presentationExportCheck.warnings.length ? (
            presentationExportCheck.warnings.slice(0, 5).map((warning) => <span key={warning}>{warning}</span>)
          ) : (
            <span>关键材料已齐备，可以导出。</span>
          )}
        </div>
        <div className="presales-ppt-check-actions">
          <button type="button" className="secondary-action" onClick={() => setPptStructurePreviewOpen(true)}>预览页纲结构</button>
        </div>
      </div>
    );
  }

  function updateOutlineDraftPage(index: number, patch: Partial<PresentationOutlinePageDraft>) {
    setOutlineDraftPages((current) => current.map((page, pageIndex) => (pageIndex === index ? { ...page, ...patch } : page)));
  }

  function moveOutlineDraftPage(index: number, direction: -1 | 1) {
    setOutlineDraftPages((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function deleteOutlineDraftPage(index: number) {
    setOutlineDraftPages((current) => current.filter((_, pageIndex) => pageIndex !== index));
  }

  function renderPresentationOutlineEditor() {
    return (
      <div className="presales-outline-editor">
        <div className="presales-outline-editor-head">
          <div>
            <span className="section-kicker">页纲编辑</span>
            <h4>汇报页面编排</h4>
          </div>
          <button type="button" className="secondary-action" onClick={savePresentationOutlineDraft} disabled={isSaving || !outlineDraftPages.length}>保存大纲</button>
        </div>
        {outlineDraftPages.length ? (
          <div className="presales-outline-page-list">
            {outlineDraftPages.map((page, index) => (
              <article key={page.id}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <label>
                  <span>页面标题</span>
                  <input value={page.title} onChange={(event) => updateOutlineDraftPage(index, { title: event.target.value })} />
                </label>
                <label>
                  <span>版式类型</span>
                  <select value={page.layoutType} onChange={(event) => updateOutlineDraftPage(index, { layoutType: event.target.value })}>
                    {pptLayoutTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div>
                  <button type="button" className="secondary-action" onClick={() => moveOutlineDraftPage(index, -1)} disabled={index === 0}>上移</button>
                  <button type="button" className="secondary-action" onClick={() => moveOutlineDraftPage(index, 1)} disabled={index === outlineDraftPages.length - 1}>下移</button>
                  <button type="button" className="secondary-action" onClick={() => deleteOutlineDraftPage(index)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="presales-empty-material">
            <strong>还没有可编辑页纲</strong>
            <span>先点击“生成汇报页纲”，生成后即可在这里调整标题、顺序和页面表达方式。</span>
          </div>
        )}
      </div>
    );
  }

  function renderPresentationExportRecords() {
    const records = state?.exportRecords || [];
    return (
      <div className="presales-export-records">
        <div className="presales-export-records-head">
          <div>
            <span className="section-kicker">导出记录</span>
            <h4>最近导出的售前材料</h4>
            <small>只清除记录，不删除本地文件。</small>
          </div>
          <div className="presales-export-records-head-actions">
            <span>{records.length ? `共 ${records.length} 条` : '暂无记录'}</span>
            {records.length ? <button type="button" className="secondary-action" onClick={clearExportRecords}>清除记录</button> : null}
          </div>
        </div>
        {records.length ? (
          <div className="presales-export-record-list">
            {records.map((record) => (
              <article key={record.id}>
                <div>
                  <strong>{record.fileName}</strong>
                  <span>{formatDateTime(record.exportedAt)} · {getExportRecordTypeLabel(record.type)} · {record.type === 'word' ? '售前方案' : record.type === 'outline' ? `${record.pageCount || '-'} 页 · Markdown` : `${getPptStyleLabel(record.pptStyle)} · ${getDeliveryModeLabel(record.deliveryMode)} · ${record.pageCount || '-'} 页 · ${record.useAiVisuals ? '含 AI 视觉图' : '无 AI 视觉图'}`}</span>
                  <small title={record.filePath}>{record.filePath}</small>
                </div>
                <button type="button" className="secondary-action" onClick={() => showExportFile(record.filePath)}>打开位置</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="presales-empty-material">
            <strong>还没有售前材料导出记录</strong>
            <span>导出成功后会在这里记录 Word 方案、汇报页纲和文件位置。</span>
          </div>
        )}
      </div>
    );
  }

  function renderPptStructurePreviewDialog() {
    return (
      <Dialog.Root open={pptStructurePreviewOpen} onOpenChange={setPptStructurePreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="presales-package-preview-dialog presales-ppt-structure-dialog">
            <div className="presales-package-preview-head">
              <div>
                <Dialog.Title>PPT 结构预览</Dialog.Title>
                <Dialog.Description>导出前确认封面、目录、页面来源、版式类型和当前风格色板。</Dialog.Description>
              </div>
              <button type="button" className="secondary-action" onClick={() => setPptStructurePreviewOpen(false)}>关闭</button>
            </div>
            <div className="presales-ppt-structure-body">
              <div className="presales-ppt-style-preview">
                <div>
                  <span className="section-kicker">当前风格</span>
                  <strong>{presentationExportCheck.styleLabel}</strong>
                  <small>版本：{presentationExportCheck.deliveryModeLabel} · AI 视觉图：{presentationExportCheck.visualStatus}</small>
                </div>
                <div className="presales-ppt-swatches">
                  {pptStructurePreview.swatches.map((color) => <i key={color} style={{ background: color }} title={color} />)}
                </div>
              </div>
              <div className="presales-ppt-structure-grid">
                {pptStructurePreview.pages.map((page, index) => (
                  <article key={`${page.title}-${index}`}>
                    <b>{String(index + 1).padStart(2, '0')}</b>
                    <div>
                      <strong>{page.title}</strong>
                      <span>{page.type} · {page.source}</span>
                      {presentationDraft.deliveryMode === 'customer' ? <small>正式版会隐藏内部备注</small> : <small>保留讲解备注和待补充信息</small>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="presales-package-preview-actions">
              <button type="button" className="secondary-action" onClick={() => setPptStructurePreviewOpen(false)}>返回编辑</button>
              <button type="button" className="primary-action" onClick={() => { setPptStructurePreviewOpen(false); exportPresentationPptx(); }} disabled={isLoading || isExportingPptx}>{isExportingPptx ? '导出中...' : '确认导出 PPT'}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderStepFooter(stepId: PresalesStepId) {
    const nextStepId = getNextStepId(stepId);
    const nextStep = workflowSteps.find((step) => step.id === nextStepId);
    return (
      <div className="presales-step-footer">
        <span className={isStepDone(state, stepId) ? 'is-done' : ''}>
          {isStepDone(state, stepId) ? '当前步骤已有结果' : '当前步骤待完善'}
        </span>
        <div>
          {onNavigate ? (
            <button type="button" className="secondary-action" onClick={() => onNavigate('presales-projects')}>返回售前项目</button>
          ) : null}
          {nextStepId && nextStep ? (
            <button type="button" className="primary-action" onClick={() => setActiveStep(nextStepId)}>下一步：{nextStep.title}</button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="presales-workbench-page is-workbench-mode">
      <main className="presales-workspace">
        <section className="presales-workspace-head">
          <div>
            <span className="section-kicker">售前工作台</span>
            <h2>{isLoading ? '加载售前项目中...' : activeProjectName}</h2>
            <p>当前显示最近进入或创建的售前项目。需要切换项目时，请先到“售前项目”点击目标项目卡片进入。</p>
          </div>
          <div className="presales-workspace-head-actions">
            <span className="demo-soft-pill">{state?.updated_at ? `更新于 ${formatDateTime(state.updated_at)}` : '本地项目'}</span>
            <div>
              <button type="button" className="secondary-action" onClick={previewProjectPackage} disabled={isLoading || isPreviewingPackage}>
                {isPreviewingPackage ? '预览中...' : '预览项目包'}
              </button>
              <button type="button" className="primary-action" onClick={exportProjectPackage} disabled={isLoading || isExportingPackage}>
                {isExportingPackage ? '导出中...' : '导出项目包'}
              </button>
              {onNavigate ? (
                <button type="button" className="secondary-action" onClick={() => onNavigate('presales-projects')}>返回售前项目</button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="presales-current-project-strip">
          <span>客户：{state?.profile.customerName || '未填写'}</span>
          <span>阶段：{state?.profile.currentStage || '未填写'}</span>
          <span>负责人：{state?.profile.owner || '未填写'}</span>
          <span>材料：{state?.materials.length || 0} 份</span>
          <span>输出：{workflowSteps.filter((step) => step.id !== 'project' && step.id !== 'materials' && isStepDone(state, step.id)).length}/5</span>
        </section>

        <nav className="presales-workflow-tabs">
          {workflowSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`${activeStep === step.id ? 'is-active' : ''}${isStepDone(state, step.id) ? ' is-done' : ''}`}
              onClick={() => setActiveStep(step.id)}
            >
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>{step.title}</span>
              <small>{step.desc}</small>
              <em>{isStepDone(state, step.id) ? '已完成' : '待处理'}</em>
            </button>
          ))}
        </nav>

        {activeStep === 'project' ? (
          <section className="presales-section presales-step-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">项目资料</span>
                <h3>先把售前机会放进一个项目</h3>
              </div>
              <button type="button" className="primary-action" onClick={saveProfile} disabled={isLoading || isSaving}>
                {isSaving ? '保存中...' : '保存项目资料'}
              </button>
            </div>
            <div className="presales-form-grid">
              <label>
                <span>项目名称</span>
                <input value={profileDraft.projectName} onChange={(event) => setProfileDraft({ ...profileDraft, projectName: event.target.value })} placeholder="例如：智慧园区一体化平台售前项目" />
              </label>
              <label>
                <span>客户名称</span>
                <input value={profileDraft.customerName} onChange={(event) => setProfileDraft({ ...profileDraft, customerName: event.target.value })} placeholder="客户单位或集团名称" />
              </label>
              <label>
                <span>行业领域</span>
                <input value={profileDraft.industry} onChange={(event) => setProfileDraft({ ...profileDraft, industry: event.target.value })} placeholder="政企、制造、医疗、教育等" />
              </label>
              <label>
                <span>当前阶段</span>
                <input value={profileDraft.currentStage} onChange={(event) => setProfileDraft({ ...profileDraft, currentStage: event.target.value })} placeholder="线索识别 / 需求调研 / 方案汇报" />
              </label>
              <label>
                <span>机会来源</span>
                <input value={profileDraft.opportunitySource} onChange={(event) => setProfileDraft({ ...profileDraft, opportunitySource: event.target.value })} placeholder="客户拜访、伙伴推荐、市场线索等" />
              </label>
              <label>
                <span>负责人</span>
                <input value={profileDraft.owner} onChange={(event) => setProfileDraft({ ...profileDraft, owner: event.target.value })} placeholder="售前负责人或跟进人" />
              </label>
              <label>
                <span>预估价值</span>
                <input value={profileDraft.expectedValue} onChange={(event) => setProfileDraft({ ...profileDraft, expectedValue: event.target.value })} placeholder="预算规模、战略价值或合作价值" />
              </label>
              <label>
                <span>决策时间</span>
                <input value={profileDraft.decisionDate} onChange={(event) => setProfileDraft({ ...profileDraft, decisionDate: event.target.value })} placeholder="预计汇报、立项或决策日期" />
              </label>
              <label className="is-wide">
                <span>背景摘要</span>
                <textarea value={profileDraft.keyBackground} onChange={(event) => setProfileDraft({ ...profileDraft, keyBackground: event.target.value })} placeholder="记录客户背景、机会背景、已有沟通结论和关键上下文。" />
              </label>
            </div>
            {renderStepFooter('project')}
          </section>
        ) : null}

        {activeStep === 'materials' ? (
          <section className="presales-section presales-step-panel presales-presentation-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">客户材料</span>
                <h3>导入或补充客户信息</h3>
                <p>客户给不出正式材料时，也可以把拜访纪要、口头需求和待确认问题先沉淀下来。</p>
              </div>
              <div className="presales-section-actions">
                <button type="button" className="secondary-action" onClick={() => setManualMaterialOpen((value) => !value)}>
                  {manualMaterialOpen ? '收起录入' : '手动录入'}
                </button>
                <button type="button" className="primary-action" onClick={importMaterial} disabled={isLoading || isImporting}>{isImporting ? '解析中...' : '导入材料'}</button>
              </div>
            </div>
            {manualMaterialOpen ? (
              <div className="presales-manual-material-form">
                <div className="presales-form-grid">
                  <label>
                    <span>记录标题</span>
                    <input
                      value={manualMaterialDraft.title}
                      onChange={(event) => setManualMaterialDraft({ ...manualMaterialDraft, title: event.target.value })}
                      placeholder="例如：客户初次沟通纪要"
                    />
                  </label>
                </div>
                <div className="presales-form-grid is-analysis">
                  <label>
                    <span>客户背景补充</span>
                    <textarea
                      value={manualMaterialDraft.customerBackground}
                      onChange={(event) => setManualMaterialDraft({ ...manualMaterialDraft, customerBackground: event.target.value })}
                      placeholder="只记录项目资料里没有覆盖的背景事实。"
                    />
                  </label>
                  <label>
                    <span>沟通纪要 / 原始线索</span>
                    <textarea
                      value={manualMaterialDraft.meetingNotes}
                      onChange={(event) => setManualMaterialDraft({ ...manualMaterialDraft, meetingNotes: event.target.value })}
                      placeholder="拜访、电话、微信沟通中听到的原话、事实和线索。"
                    />
                  </label>
                  <label>
                    <span>现有系统 / 现状描述</span>
                    <textarea
                      value={manualMaterialDraft.currentSituation}
                      onChange={(event) => setManualMaterialDraft({ ...manualMaterialDraft, currentSituation: event.target.value })}
                      placeholder="已有系统、数据、流程、运维或组织现状。"
                    />
                  </label>
                </div>
                <label className="presales-wide-field">
                  <span>待确认问题</span>
                  <textarea
                    value={manualMaterialDraft.openQuestions}
                    onChange={(event) => setManualMaterialDraft({ ...manualMaterialDraft, openQuestions: event.target.value })}
                    placeholder="后续调研必须问清楚的问题。"
                  />
                </label>
                <div className="presales-section-actions">
                  <button type="button" className="secondary-action" onClick={() => setManualMaterialDraft(emptyManualMaterialInput)} disabled={isSavingManualMaterial}>清空</button>
                  <button type="button" className="primary-action" onClick={saveManualMaterial} disabled={isSavingManualMaterial}>{isSavingManualMaterial ? '保存中...' : '保存为客户材料'}</button>
                </div>
              </div>
            ) : null}
            <div className="presales-material-layout">
              <div className="presales-material-list">
                {state?.materials.length ? state.materials.map((material) => (
                  <button
                    type="button"
                    className={material.id === activeMaterialId ? 'is-active' : ''}
                    key={material.id}
                    onClick={() => setActiveMaterialId(material.id)}
                  >
                    <strong>{material.name}</strong>
                    <span>{material.type || '客户材料'} · {formatDateTime(material.importedAt)}</span>
                  </button>
                )) : (
                  <div className="presales-empty-material">
                    <strong>客户没有提供材料也没关系</strong>
                    <span>可以导入文件，也可以点击“手动录入”记录沟通纪要和客户线索。</span>
                  </div>
                )}
              </div>
              <div className="presales-material-preview">
                {activeMaterialMarkdown.trim() ? (
                  <MarkdownRenderer allowRawHtml={false}>{activeMaterialMarkdown}</MarkdownRenderer>
                ) : (
                  <div className="presales-empty-material">
                    <strong>暂无预览</strong>
                    <span>选择左侧材料后，这里会显示解析后的 Markdown 内容。</span>
                  </div>
                )}
              </div>
            </div>
            {renderStepFooter('materials')}
          </section>
        ) : null}

        {activeStep === 'analysis' ? (
          <section className="presales-section presales-step-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">客户分析</span>
                <h3>沉淀客户画像、痛点、约束和待确认问题</h3>
                <p>系统会自动引用项目资料和客户材料；这里仅补充分析重点或材料里没有覆盖的信息。</p>
              </div>
              <div className="presales-section-actions">
                <button type="button" className="secondary-action" onClick={saveAnalysisInput} disabled={isLoading || isSaving}>保存输入</button>
                <button type="button" className="primary-action" onClick={generateAnalysis} disabled={isLoading || isGeneratingAnalysis}>{isGeneratingAnalysis ? '分析中...' : '生成分析报告'}</button>
              </div>
            </div>
            <div className="presales-form-grid is-analysis">
              <label className="is-wide">
                <span>分析重点 / 关注口径</span>
                <textarea value={analysisDraft.rawNotes} onChange={(event) => setAnalysisDraft({ ...analysisDraft, rawNotes: event.target.value })} placeholder="例如：重点判断决策链、国产化要求、预算风险、客户真实痛点优先级。无需重复粘贴客户材料。" />
              </label>
              <label>
                <span>现有系统补充</span>
                <textarea value={analysisDraft.knownSystems} onChange={(event) => setAnalysisDraft({ ...analysisDraft, knownSystems: event.target.value })} placeholder="只填写客户材料未覆盖的系统、数据、接口或部署补充信息。" />
              </label>
              <label>
                <span>痛点判断补充</span>
                <textarea value={analysisDraft.businessPainPoints} onChange={(event) => setAnalysisDraft({ ...analysisDraft, businessPainPoints: event.target.value })} placeholder="对痛点优先级、根因、影响范围的补充判断；不确定可留空。" />
              </label>
              <label>
                <span>干系人判断补充</span>
                <textarea value={analysisDraft.stakeholders} onChange={(event) => setAnalysisDraft({ ...analysisDraft, stakeholders: event.target.value })} placeholder="补充谁可能拍板、谁影响方案、谁负责技术确认、谁可能提出异议。" />
              </label>
              <label>
                <span>约束判断补充</span>
                <textarea value={analysisDraft.constraints} onChange={(event) => setAnalysisDraft({ ...analysisDraft, constraints: event.target.value })} placeholder="补充预算、周期、合规、安全、国产化、审批等约束的判断或假设。" />
              </label>
            </div>
            {renderTaskCard('analysis')}
            {renderMarkdownResult(state?.analysisResult.markdown, '还没有分析报告', '保存项目资料和客户材料后，点击“生成分析报告”。')}
            {renderStepFooter('analysis')}
          </section>
        ) : null}

        {activeStep === 'research' ? (
          <section className="presales-section presales-step-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">调研准备</span>
                <h3>生成会议议程、SPIN 问题和 Q&A 预案</h3>
              </div>
              <div className="presales-section-actions">
                <button type="button" className="secondary-action" onClick={saveResearchInput} disabled={isLoading || isSaving}>保存设置</button>
                <button type="button" className="primary-action" onClick={generateResearch} disabled={isLoading || isGeneratingResearch}>{isGeneratingResearch ? '生成中...' : '生成调研准备'}</button>
              </div>
            </div>
            <div className="presales-form-grid is-analysis">
              <label>
                <span>会议目标</span>
                <textarea value={researchDraft.meetingGoal} onChange={(event) => setResearchDraft({ ...researchDraft, meetingGoal: event.target.value })} placeholder="例如：确认业务痛点、补齐现有系统清单、对齐方案方向和下一步资料清单。" />
              </label>
              <label>
                <span>参会信息</span>
                <textarea value={researchDraft.attendeeInfo} onChange={(event) => setResearchDraft({ ...researchDraft, attendeeInfo: event.target.value })} placeholder="记录预计参会部门、角色、决策者、技术负责人、业务代表等。" />
              </label>
              <label>
                <span>已知客户问题</span>
                <textarea value={researchDraft.knownQuestions} onChange={(event) => setResearchDraft({ ...researchDraft, knownQuestions: event.target.value })} placeholder="客户已提出的疑问、顾虑、比较对象、预算或周期压力。" />
              </label>
              <label>
                <span>会议时长</span>
                <textarea value={researchDraft.timeBox} onChange={(event) => setResearchDraft({ ...researchDraft, timeBox: event.target.value })} placeholder="例如：60 分钟、90 分钟、半天调研。" />
              </label>
            </div>
            {renderTaskCard('research')}
            {renderMarkdownResult(state?.researchResult.markdown, '还没有调研准备包', '可先生成客户分析，再点击“生成调研准备”。')}
            {renderStepFooter('research')}
          </section>
        ) : null}

        {activeStep === 'architecture' ? (
          <section className="presales-section presales-step-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">方案架构</span>
                <h3>生成 HLD 骨架、风险清单和图表清单</h3>
              </div>
              <div className="presales-section-actions">
                <button type="button" className="secondary-action" onClick={saveArchitectureInput} disabled={isLoading || isSaving}>保存输入</button>
                <button type="button" className="primary-action" onClick={generateArchitecture} disabled={isLoading || isGeneratingArchitecture}>{isGeneratingArchitecture ? '生成中...' : '生成方案架构'}</button>
              </div>
            </div>
            <div className="presales-form-grid is-analysis">
              <label className="is-wide">
                <span>方案范围</span>
                <textarea value={architectureDraft.solutionScope} onChange={(event) => setArchitectureDraft({ ...architectureDraft, solutionScope: event.target.value })} placeholder="描述本次方案覆盖的业务范围、系统范围、数据范围、组织范围和明确不包含的边界。" />
              </label>
              <label>
                <span>架构偏好 / 技术路线</span>
                <textarea value={architectureDraft.architecturePreferences} onChange={(event) => setArchitectureDraft({ ...architectureDraft, architecturePreferences: event.target.value })} placeholder="例如：云原生、微服务、国产化、低代码、AI/RAG、数据中台、私有化部署等。" />
              </label>
              <label>
                <span>集成与周边系统</span>
                <textarea value={architectureDraft.integrationNotes} onChange={(event) => setArchitectureDraft({ ...architectureDraft, integrationNotes: event.target.value })} placeholder="记录需要对接的现有系统、接口方式、数据流向、同步频率和外部依赖。" />
              </label>
              <label>
                <span>非功能需求</span>
                <textarea value={architectureDraft.nonFunctionalRequirements} onChange={(event) => setArchitectureDraft({ ...architectureDraft, nonFunctionalRequirements: event.target.value })} placeholder="性能、可用性、安全、扩展性、审计、容灾、等保、国产化等要求。" />
              </label>
              <label>
                <span>交付约束</span>
                <textarea value={architectureDraft.deliveryConstraints} onChange={(event) => setArchitectureDraft({ ...architectureDraft, deliveryConstraints: event.target.value })} placeholder="预算、周期、资源、环境、上线窗口、客户配合、数据迁移等约束。" />
              </label>
            </div>
            {renderTaskCard('architecture')}
            {renderMarkdownResult(state?.architectureResult.markdown, '还没有方案架构草案', '可先生成客户分析和调研准备，再点击“生成方案架构”。')}
            {renderStepFooter('architecture')}
          </section>
        ) : null}

        {activeStep === 'diagrams' ? (
          <section className="presales-section presales-step-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">图表草稿</span>
                <h3>生成可预览的 Mermaid 图表草稿</h3>
              </div>
              <div className="presales-section-actions">
                <button type="button" className="secondary-action" onClick={saveDiagramInput} disabled={isLoading || isSaving}>保存设置</button>
                <button type="button" className="primary-action" onClick={generateDiagrams} disabled={isLoading || isGeneratingDiagrams}>{isGeneratingDiagrams ? '生成中...' : '生成图表草稿'}</button>
              </div>
            </div>
            <div className="presales-diagram-picker">
              {diagramTypeOptions.map((diagramType) => (
                <label key={diagramType}>
                  <input
                    type="checkbox"
                    checked={diagramDraft.selectedDiagramTypes.includes(diagramType)}
                    onChange={() => toggleDiagramType(diagramType)}
                  />
                  <span>{diagramType}</span>
                </label>
              ))}
            </div>
            <div className="presales-form-grid is-analysis">
              <label>
                <span>图表关注点</span>
                <textarea value={diagramDraft.diagramFocus} onChange={(event) => setDiagramDraft({ ...diagramDraft, diagramFocus: event.target.value })} placeholder="例如：突出客户现有系统与目标系统边界、核心业务流程、数据流转和部署安全边界。" />
              </label>
              <label>
                <span>风格要求</span>
                <textarea value={diagramDraft.styleRequirements} onChange={(event) => setDiagramDraft({ ...diagramDraft, styleRequirements: event.target.value })} placeholder="例如：优先横向布局，节点不超过 12 个，复杂内容放到图后说明。" />
              </label>
            </div>
            {renderTaskCard('diagrams')}
            {renderMarkdownResult(state?.diagramResult.markdown, '还没有图表草稿', '可先生成方案架构草案，再选择图表类型并生成。')}
            {renderStepFooter('diagrams')}
          </section>
        ) : null}

        {activeStep === 'presentation' ? (
          <section className="presales-section presales-step-panel">
            <div className="presales-section-head">
              <div>
                <span className="section-kicker">汇报材料</span>
                <h3>生成面向客户沟通的汇报页纲</h3>
              </div>
              <div className="presales-section-actions">
                <button type="button" className="secondary-action" onClick={savePresentationInput} disabled={isLoading || isSaving}>保存设置</button>
                <button type="button" className="primary-action" onClick={generatePresentation} disabled={isLoading || isGeneratingPresentation}>{isGeneratingPresentation ? '生成中...' : '生成汇报页纲'}</button>
                <button type="button" className="secondary-action" onClick={exportPresentationOutline} disabled={isLoading || isExportingOutline || !state?.presentationResult.markdown?.trim()}>{isExportingOutline ? '导出中...' : '导出页纲'}</button>
                <button type="button" className="secondary-action" onClick={exportPresalesProposalWord} disabled={isLoading || wordExportProgress.running}>{wordExportProgress.running ? '导出中...' : '导出售前方案'}</button>
              </div>
            </div>
            <div className="presales-presentation-form">
              <div className="presales-presentation-quick-fields">
                <div className="presales-presentation-card-title">
                  <strong>页纲参数</strong>
                  <span>控制页纲类型和页数范围</span>
                </div>
                <label>
                  <span>汇报类型</span>
                  <select value={presentationDraft.presentationType} onChange={(event) => setPresentationDraft({ ...presentationDraft, presentationType: event.target.value })}>
                    {presentationTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  <span>页数范围</span>
                  <input value={presentationDraft.pageCount} onChange={(event) => setPresentationDraft({ ...presentationDraft, pageCount: event.target.value })} placeholder="例如：10-12 页、20 页左右" />
                </label>
              </div>
              <label>
                <span>目标听众</span>
                <textarea value={presentationDraft.audience} onChange={(event) => setPresentationDraft({ ...presentationDraft, audience: event.target.value })} placeholder="例如：客户分管领导、信息中心、业务部门、采购负责人。" />
              </label>
              <label>
                <span>汇报目标</span>
                <textarea value={presentationDraft.presentationGoal} onChange={(event) => setPresentationDraft({ ...presentationDraft, presentationGoal: event.target.value })} placeholder="说明这次汇报想推动客户确认什么、接受什么、下一步做什么。" />
              </label>
              <label className="is-wide">
                <span>重点强调</span>
                <textarea value={presentationDraft.emphasis} onChange={(event) => setPresentationDraft({ ...presentationDraft, emphasis: event.target.value })} placeholder="例如：业务价值、建设路径、架构可行性、风险控制、投入产出、PoC 计划等。" />
              </label>
            </div>
            {renderTaskCard('presentation')}
            <div className="presales-outline-preview-block">
              <div className="presales-outline-preview-head">
                <div>
                  <span className="section-kicker">页纲预览</span>
                  <h4>生成结果</h4>
                </div>
                <small>确认结构后，可导出 Markdown 页纲或 Word 售前方案。</small>
              </div>
              {renderMarkdownResult(state?.presentationResult.markdown, '还没有汇报页纲', '可先生成客户分析和方案架构，再点击“生成汇报页纲”。')}
            </div>
            {renderPresentationExportCheck()}
            {renderPresentationOutlineEditor()}
            {renderPresentationExportRecords()}
            {renderStepFooter('presentation')}
          </section>
        ) : null}
      </main>
      {renderPresentationExportOptionsDialog()}
      {renderPptExportProgressDialog()}
      {renderWordExportProgressDialog()}
      {renderOutlineExportDialog()}
      <Dialog.Root open={packagePreviewOpen} onOpenChange={setPackagePreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="presales-package-preview-dialog">
            <div className="presales-package-preview-head">
              <div>
                <Dialog.Title>售前项目包预览</Dialog.Title>
                <Dialog.Description>导出前查看当前项目会汇总成哪些内容。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭预览">×</Dialog.Close>
            </div>
            <div className="presales-package-preview-body">
              <MarkdownRenderer allowRawHtml={false}>{packagePreviewMarkdown || '暂无可预览内容。'}</MarkdownRenderer>
            </div>
            <div className="presales-package-preview-actions">
              <Dialog.Close className="secondary-action" type="button">关闭</Dialog.Close>
              <button type="button" className="primary-action" onClick={exportProjectPackage} disabled={isExportingPackage}>
                {isExportingPackage ? '导出中...' : '导出项目包'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {renderPptStructurePreviewDialog()}
    </div>
  );
}

export default PresalesWorkbenchPage;
