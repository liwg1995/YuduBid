import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BidExportTemplateRecord, BidWordExportMode, OutlineItem, WordExportProgressEvent } from '../../../shared/types';
import { FloatingToolbar, ToolbarArrowLeftIcon, ToolbarArrowRightIcon, ToolbarDocumentIcon, useAppDialog } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import {
  FEASIBILITY_STEPS,
  type FeasibilityProjectList,
  type FeasibilityProjectRecord,
  type FeasibilityReportState,
  type FeasibilityReportStep,
} from '../types';
import ProjectMaterialsPanel from '../components/ProjectMaterialsPanel';
import SourceFilesPanel from '../components/SourceFilesPanel';
import AnalysisPanel from '../components/AnalysisPanel';
import OutlinePanel from '../components/OutlinePanel';
import ParametersPanel from '../components/ParametersPanel';
import ContentPanel from '../components/ContentPanel';
import BidWordExportDialog from '../../export-format/components/BidWordExportDialog';
import { isTaskRunning } from '../components/TaskProgressCard';
import '../feasibilityReport.css';

const emptyProjectList: FeasibilityProjectList = { projects: [] };

interface ExportProgressState {
  open: boolean;
  running: boolean;
  progress: number;
  message: string;
  warnings: string[];
  mermaidCount: number;
  filePath?: string;
  error?: string;
}

const initialExportProgress: ExportProgressState = {
  open: false,
  running: false,
  progress: 0,
  message: '',
  warnings: [],
  mermaidCount: 0,
};

function collectLeafItems(items: OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => item.children?.length ? collectLeafItems(item.children) : [item]);
}

function countMermaidDiagrams(items: OutlineItem[]) {
  return collectLeafItems(items).reduce((total, item) => total + (String(item.content || '').match(/```mermaid[\s\S]*?```/gi) || []).length, 0);
}

const stageCopy: Record<FeasibilityReportStep, { title: string; description: string }> = {
  materials: { title: '建立项目编制边界', description: '填写项目类型、建设单位、建设地点、建设内容、周期、投资额和资金来源。' },
  sources: { title: '汇集项目支撑资料', description: '批量导入项目建议书、批复、规划、测算和其他支撑文件，并预览解析后的 Markdown。' },
  analysis: { title: '形成资料分析底稿', description: '区分材料事实、合理推导和待确认信息，为目录与正文生成提供可靠依据。' },
  outline: { title: '组织可研报告目录', description: '选择适用大纲和目标字数，生成最多三级目录，并支持手动编辑和 AI 调整。' },
  parameters: { title: '统一全文关键口径', description: '集中校对投资、周期、建设规模、资金来源和效益指标，避免章节之间相互矛盾。' },
  content: { title: '生成并审校报告正文', description: '按目录叶子小节生成正文，支持暂停恢复、缺失补写、手动编辑、自然化审校和 Word 导出。' },
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function getFeasibilityBridge() {
  const bridge = window.yibiao?.feasibilityReport;
  if (!bridge) throw new Error('可研报告本地服务尚未就绪，请重启客户端后重试');
  return bridge;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getStepLabel(step?: FeasibilityReportStep) {
  return FEASIBILITY_STEPS.find((item) => item.id === step)?.label || FEASIBILITY_STEPS[0].label;
}

function FeasibilityWorkbench({ project, onBack }: { project: FeasibilityProjectRecord; onBack: () => void }) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [reportState, setReportState] = useState<FeasibilityReportState | null>(null);
  const [activeStep, setActiveStep] = useState<FeasibilityReportStep>('materials');
  const [loading, setLoading] = useState(true);
  const [savingStep, setSavingStep] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState>(initialExportProgress);
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    void getFeasibilityBridge().loadState({ projectId: project.id })
      .then((state) => {
        if (disposed) return;
        setReportState(state);
        setActiveStep(state.step);
      })
      .catch((error) => {
        if (!disposed) showToast(`读取项目失败：${getErrorMessage(error)}`, 'error');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, [project.id, showToast]);

  useEffect(() => {
    const bridge = getFeasibilityBridge();
    const unsubscribe = bridge.onTaskEvent((event) => {
      if (event.task.project_id === project.id || event.feasibilityReport.projectId === project.id) setReportState(event.feasibilityReport);
    });
    void bridge.getActiveTasks({ projectId: project.id }).then((result) => setReportState(result.state)).catch((error) => showToast(`恢复后台任务状态失败：${getErrorMessage(error)}`, 'error'));
    return unsubscribe;
  }, [project.id, showToast]);

  const changeStep = async (step: FeasibilityReportStep) => {
    if (step === activeStep || savingStep) return;
    if (reportState) {
      if (step === 'outline' && !reportState.analysisMarkdown.trim()) { showToast('请先完成资料分析', 'info'); return; }
      if (step === 'parameters' && !reportState.outlineData) { showToast('请先生成报告目录', 'info'); return; }
      if (step === 'content' && !reportState.keyParametersMarkdown.trim()) { showToast('请先生成并确认关键参数', 'info'); return; }
    }
    const previousStep = activeStep;
    setActiveStep(step);
    setSavingStep(true);
    try {
      const state = await getFeasibilityBridge().updateStep({ projectId: project.id, step });
      setReportState(state);
    } catch (error) {
      setActiveStep(previousStep);
      showToast(`保存当前步骤失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setSavingStep(false);
    }
  };

  const activeDefinition = FEASIBILITY_STEPS.find((step) => step.id === activeStep) || FEASIBILITY_STEPS[0];
  const copy = stageCopy[activeStep];
  const activeIndex = FEASIBILITY_STEPS.findIndex((step) => step.id === activeStep);
  const previousDefinition = FEASIBILITY_STEPS[activeIndex - 1];
  const nextDefinition = FEASIBILITY_STEPS[activeIndex + 1];
  const workflowBusy = loading || savingStep || !reportState;
  const backgroundTaskRunning = Boolean(reportState && [reportState.analysisTask, reportState.outlineTask, reportState.outlineAdjustmentTask, reportState.parametersTask, reportState.contentTask, reportState.humanWritingTask].some(isTaskRunning));
  const contentLeaves = useMemo(() => collectLeafItems(reportState?.outlineData?.outline || []), [reportState?.outlineData]);
  const completedContentCount = useMemo(() => contentLeaves.filter((item) => String(item.content || '').trim()).length, [contentLeaves]);
  const isNextDisabled = workflowBusy
    || !nextDefinition
    || (activeStep === 'analysis' && !reportState?.analysisMarkdown.trim())
    || (activeStep === 'outline' && !reportState?.outlineData)
    || (activeStep === 'parameters' && !reportState?.keyParametersMarkdown.trim());
  const nextTooltip = loading
    ? '正在读取项目工作区'
    : savingStep
      ? '正在保存当前步骤'
      : activeStep === 'analysis' && !reportState?.analysisMarkdown.trim()
        ? '完成资料分析后才能进入报告目录'
        : activeStep === 'outline' && !reportState?.outlineData
          ? '生成报告目录后才能进入关键参数'
          : activeStep === 'parameters' && !reportState?.keyParametersMarkdown.trim()
            ? '生成并确认关键参数后才能进入正文生成'
            : !nextDefinition
              ? '当前已经是最后一步'
              : `进入${nextDefinition.label}`;
  const resetReport = async () => {
    if (backgroundTaskRunning) {
      showToast('当前有后台生成任务正在运行，请等待任务完成或暂停正文生成后再重置', 'info');
      return;
    }
    const confirmed = await confirm({
      title: '重置可行性研究报告',
      description: '这会清空当前项目的基础资料、导入文件、分析底稿、报告目录、关键参数、正文和生成进度。项目本身仍会保留，此操作无法撤销。',
      confirmLabel: '确认重置',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const result = await getFeasibilityBridge().clear({ projectId: project.id });
      setReportState(result.state);
      setActiveStep('materials');
      showToast(result.message || '可研报告已重置', 'success');
    } catch (error) { showToast(`重置可研报告失败：${getErrorMessage(error)}`, 'error'); }
  };

  const exportWord = async (mode: Exclude<BidWordExportMode, 'original-template'> = 'word-optimization', template?: BidExportTemplateRecord) => {
    if (!reportState?.outlineData?.outline.length || !completedContentCount) {
      showToast('当前没有可导出的正文', 'info');
      return;
    }
    if (completedContentCount < contentLeaves.length && !await confirm({
      title: '导出未完成报告',
      description: `当前仍有 ${contentLeaves.length - completedContentCount} 个小节没有正文，Word 中将仅包含已完成内容。`,
      confirmLabel: '继续导出',
    })) return;

    const requestId = `feasibility-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const mermaidCount = countMermaidDiagrams(reportState.outlineData.outline);
    let unsubscribe: (() => void) | undefined;
    try {
      setExportProgress({
        open: true,
        running: true,
        progress: 2,
        message: mermaidCount
          ? `检测到 ${mermaidCount} 张 Mermaid 图，导出时会转换为 Word 图片，可能需要稍等。`
          : '正在准备导出可行性研究报告 Word。',
        warnings: [],
        mermaidCount,
      });
      unsubscribe = window.yibiao?.export.onWordExportProgress((event: WordExportProgressEvent) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportProgress((current) => ({
          ...current,
          open: true,
          running: event.phase === 'running',
          progress: event.progress,
          message: event.message,
          warnings: event.warnings || current.warnings,
          error: event.phase === 'error' ? event.message : undefined,
        }));
      });
      const result = await window.yibiao?.export.exportWord({
        requestId,
        documentScope: 'bid',
        exportMode: mode,
        exportFormat: template?.config,
        templateId: template?.templateId,
        documentProfile: 'feasibility-report',
        document_title: '可行性研究报告',
        project_name: reportState.projectInfo.projectName || reportState.projectName,
        construction_unit: reportState.projectInfo.constructionUnit,
        outline: reportState.outlineData.outline,
      });
      if (!result) throw new Error('Word 导出服务尚未就绪，请重启客户端后重试');
      if (result.canceled) {
        setExportProgress(initialExportProgress);
        showToast('已取消导出', 'info');
        return;
      }
      setExportProgress((current) => ({
        ...current,
        open: true,
        running: false,
        progress: 100,
        message: result.message || '可行性研究报告 Word 已导出，请打开文档核对图片、表格和版式。',
        warnings: result.warnings || current.warnings,
        filePath: result.path || result.filePath,
      }));
      showToast(result.message || '可行性研究报告 Word 已导出', result.warnings?.length ? 'info' : 'success');
    } catch (error) {
      const message = getErrorMessage(error);
      setExportProgress((current) => ({ ...current, open: true, running: false, progress: 100, message, error: message }));
      showToast(`导出失败：${message}`, 'error');
    } finally {
      unsubscribe?.();
    }
  };

  const navigationActions = activeStep === 'content'
    ? [
      {
        id: 'previous-step',
        label: '上一步',
        icon: <ToolbarArrowLeftIcon />,
        disabled: workflowBusy || !previousDefinition,
        tooltip: previousDefinition ? `返回${previousDefinition.label}` : '当前已经是第一步',
        onClick: () => { if (previousDefinition) void changeStep(previousDefinition.id); },
      },
      {
        id: 'export-word',
        label: exportProgress.running ? '导出中...' : '导出 Word',
        icon: <ToolbarDocumentIcon />,
        variant: 'primary' as const,
        disabled: workflowBusy || backgroundTaskRunning || exportProgress.running || !completedContentCount,
        tooltip: backgroundTaskRunning
          ? '正文生成或审校任务运行期间不能导出'
          : exportProgress.running
            ? 'Word 正在导出，请稍候'
            : completedContentCount
              ? '导出当前可行性研究报告正文'
              : '请先生成正文再导出',
        onClick: () => setExportChoiceOpen(true),
      },
    ]
    : [
      {
        id: 'previous-step',
        label: '上一步',
        icon: <ToolbarArrowLeftIcon />,
        disabled: workflowBusy || !previousDefinition,
        tooltip: previousDefinition ? `返回${previousDefinition.label}` : '当前已经是第一步',
        onClick: () => { if (previousDefinition) void changeStep(previousDefinition.id); },
      },
      {
        id: 'next-step',
        label: '下一步',
        icon: <ToolbarArrowRightIcon />,
        variant: 'primary' as const,
        disabled: isNextDisabled,
        tooltip: nextTooltip,
        onClick: () => { if (nextDefinition) void changeStep(nextDefinition.id); },
      },
    ];
  const toolbarGroups = [{
    id: 'feasibility-report-reset',
    actions: [
      {
        id: 'reset',
        label: '重置',
        variant: 'danger' as const,
        disabled: workflowBusy || backgroundTaskRunning,
        tooltip: backgroundTaskRunning ? '后台任务运行期间不能重置' : '清空当前项目的可研报告内容',
        onClick: () => void resetReport(),
      },
      {
        id: 'home',
        label: '首页',
        variant: activeStep === 'materials' ? 'primary' as const : 'secondary' as const,
        disabled: workflowBusy,
        tooltip: '回到项目资料步骤',
        onClick: () => void changeStep('materials'),
      },
    ],
  }, {
    id: 'feasibility-report-navigation',
    actions: navigationActions,
  }];

  return (
    <div className="page-stack technical-workbench feasibility-workbench">
      <section className="technical-project-context feasibility-project-context">
        <div>
          <span className="section-kicker">当前项目</span>
          <strong>{reportState?.projectName || project.name}</strong>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}>返回项目列表</button>
      </section>

      <main className="plan-step-body feasibility-step-page">
        <header className="content-generation-command-bar feasibility-step-command-bar">
          <div>
            <span className="section-kicker">STEP {String(activeIndex + 1).padStart(2, '0')} · {activeDefinition.label}</span>
            <strong>{copy.title}</strong>
            <p>{copy.description}</p>
          </div>
          <div className="feasibility-step-summary" aria-live="polite">
            <span>编制进度</span>
            <strong>{activeIndex + 1} / {FEASIBILITY_STEPS.length}</strong>
            <small>{loading ? '读取中' : savingStep ? '保存中' : '步骤已保存'}</small>
          </div>
        </header>

        <div className="feasibility-step-content">
          {reportState && activeStep === 'materials' ? (
            <ProjectMaterialsPanel projectId={project.id} state={reportState} onStateChange={setReportState} />
          ) : reportState && activeStep === 'sources' ? (
            <SourceFilesPanel projectId={project.id} state={reportState} onStateChange={setReportState} />
          ) : reportState && activeStep === 'analysis' ? (
            <AnalysisPanel projectId={project.id} state={reportState} onStateChange={setReportState} />
          ) : reportState && activeStep === 'outline' ? (
            <OutlinePanel projectId={project.id} state={reportState} onStateChange={setReportState} />
          ) : reportState && activeStep === 'parameters' ? (
            <ParametersPanel projectId={project.id} state={reportState} onStateChange={setReportState} />
          ) : reportState && activeStep === 'content' ? (
            <ContentPanel projectId={project.id} state={reportState} onStateChange={setReportState} />
          ) : (
            <section className="feasibility-step-loading">
              <strong>正在读取{activeDefinition.label}</strong>
              <p>正在从本地项目工作区恢复可研报告编制状态。</p>
            </section>
          )}
        </div>
      </main>
      <BidWordExportDialog
        open={exportChoiceOpen}
        onOpenChange={setExportChoiceOpen}
        disabled={exportProgress.running}
        onConfirm={exportWord}
      />
      <Dialog.Root
        open={exportProgress.open}
        onOpenChange={(open) => {
          if (!open && !exportProgress.running) setExportProgress(initialExportProgress);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="export-progress-card">
            <div className="content-regenerate-card-head">
              <span className="section-kicker">Word 导出</span>
              <Dialog.Title>{exportProgress.running ? '正在导出 Word' : exportProgress.error ? '导出失败' : '导出完成'}</Dialog.Title>
              <Dialog.Description>
                {exportProgress.mermaidCount > 0
                  ? `本次包含 ${exportProgress.mermaidCount} 张 Mermaid 图，导出时会在本地转换成 Word 图片，无需联网，图较多时可能需要稍等。`
                  : '正在将可研正文、表格和图片写入 Word 文档。'}
              </Dialog.Description>
            </div>
            <div className="export-progress-body">
              <div className="content-generation-progress-track" aria-label={`Word 导出进度 ${exportProgress.progress}%`}>
                <span style={{ width: `${exportProgress.progress}%` }} />
              </div>
              <p>{exportProgress.message || '正在处理导出任务，请稍候。'}</p>
              {!exportProgress.running && exportProgress.filePath ? (
                <div className="export-file-path">
                  <span>生成路径</span>
                  <button
                    type="button"
                    title="点击打开文件所在文件夹"
                    onClick={async () => {
                      try {
                        await window.yibiao?.export.showExportFile(exportProgress.filePath!);
                      } catch (error) {
                        showToast(`打开生成路径失败：${getErrorMessage(error)}`, 'error');
                      }
                    }}
                  >
                    {exportProgress.filePath}
                  </button>
                </div>
              ) : null}
              {exportProgress.warnings.length ? (
                <div className="export-warning-list">
                  <strong>需要核对</strong>
                  {exportProgress.warnings.slice(0, 4).map((warning) => <small key={warning}>{warning}</small>)}
                  {exportProgress.warnings.length > 4 ? <small>还有 {exportProgress.warnings.length - 4} 条提示，请打开导出的 Word 核对。</small> : null}
                </div>
              ) : null}
            </div>
            {!exportProgress.running ? (
              <div className="content-regenerate-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <FloatingToolbar groups={toolbarGroups} label="可研报告步骤工具条" />
    </div>
  );
}

function FeasibilityReportHome() {
  const { showToast } = useToast();
  const [projectList, setProjectList] = useState<FeasibilityProjectList>(emptyProjectList);
  const [activeProject, setActiveProject] = useState<FeasibilityProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteProject, setPendingDeleteProject] = useState<FeasibilityProjectRecord | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      setProjectList(await getFeasibilityBridge().listProjects());
    } catch (error) {
      showToast(`读取可研项目失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const keyword = searchText.trim().toLocaleLowerCase('zh-CN');
    if (!keyword) return projectList.projects;
    return projectList.projects.filter((project) => project.name.toLocaleLowerCase('zh-CN').includes(keyword));
  }, [projectList.projects, searchText]);

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) {
      showToast('请先填写可研项目名称', 'info');
      return;
    }
    setBusy(true);
    try {
      const result = await getFeasibilityBridge().createProject({ projectName: name });
      setProjectList(result.projects);
      setProjectName('');
      setCreateDialogOpen(false);
      setActiveProject(result.project);
      showToast('可研项目已创建并保存到本地工作区', 'success');
    } catch (error) {
      showToast(`创建项目失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const enterProject = async (project: FeasibilityProjectRecord) => {
    if (busy) return;
    setBusy(true);
    try {
      await getFeasibilityBridge().switchProject({ projectId: project.id });
      setActiveProject(project);
    } catch (error) {
      showToast(`进入项目失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startRename = (project: FeasibilityProjectRecord) => {
    setRenamingProjectId(project.id);
    setRenameValue(project.name);
  };

  const renameProject = async (project: FeasibilityProjectRecord) => {
    const name = renameValue.trim();
    if (!name) {
      showToast('项目名称不能为空', 'info');
      return;
    }
    if (name === project.name) {
      setRenamingProjectId(null);
      return;
    }
    setBusy(true);
    try {
      setProjectList(await getFeasibilityBridge().renameProject({ projectId: project.id, name }));
      setRenamingProjectId(null);
      showToast('项目名称已更新', 'success');
    } catch (error) {
      showToast(`重命名失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async () => {
    if (!pendingDeleteProject) return;
    setBusy(true);
    try {
      setProjectList(await getFeasibilityBridge().deleteProject({ projectId: pendingDeleteProject.id }));
      setPendingDeleteProject(null);
      showToast('可研项目及其本地工作区已删除', 'success');
    } catch (error) {
      showToast(`删除项目失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (activeProject) {
    return <FeasibilityWorkbench project={activeProject} onBack={() => { setActiveProject(null); void loadProjects(); }} />;
  }

  return (
    <div className="page-stack feasibility-report-page feasibility-project-page">
      <section className="feasibility-project-hero">
        <div>
          <span className="section-kicker">招投标</span>
          <strong>可研报告</strong>
          <p>围绕项目资料、论证目录、关键参数和正文编制建立独立工作区。</p>
        </div>
        <button type="button" className="primary-action" disabled={busy} onClick={() => setCreateDialogOpen(true)}>新建可研项目</button>
      </section>

      <section className="feasibility-project-guide">
        <div className="feasibility-project-guide-copy">
          <strong>{loading ? '正在读取本地项目...' : projectList.projects.length ? `已建立 ${projectList.projects.length} 个可研项目` : '从一个清晰的项目工作区开始'}</strong>
          <p>一个真实项目对应一个可研工作区。资料、分析、目录、参数和正文按项目隔离保存。</p>
          <small>项目数据保存在本机，可在关闭或刷新客户端后继续编制。</small>
        </div>
        <div className="feasibility-project-guide-flow" aria-label="可研报告工作流摘要">
          {FEASIBILITY_STEPS.map((step) => <span key={step.id}>{step.label}</span>)}
        </div>
      </section>

      <section className="feasibility-project-toolbar" aria-label="筛选可研项目">
        <label><span className="sr-only">搜索项目名称</span><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索项目名称" /></label>
        <span>{filteredProjects.length} 个项目</span>
      </section>

      <section className="feasibility-project-list" aria-label="可研项目列表">
        {!loading && !filteredProjects.length ? (
          <div className="feasibility-project-empty">
            <strong>{searchText.trim() ? '没有匹配的可研项目' : '还没有可研项目'}</strong>
            <p>{searchText.trim() ? '请调整搜索关键词后重试。' : '创建项目后，编制进度与成果会保存在独立的本地工作区。'}</p>
            {!searchText.trim() ? <button type="button" className="secondary-action" onClick={() => setCreateDialogOpen(true)}>创建可研项目</button> : null}
          </div>
        ) : filteredProjects.map((project) => (
          <article className={`feasibility-project-card${project.isActive ? ' is-active' : ''}`} key={project.id}>
            <div className="feasibility-project-card-copy">
              {renamingProjectId === project.id ? (
                <input className="feasibility-project-name-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void renameProject(project); if (event.key === 'Escape') setRenamingProjectId(null); }} autoFocus />
              ) : <strong>{project.name}</strong>}
              <p>
                当前步骤：{getStepLabel(project.step)}
                {project.contentTotal ? ` · 正文 ${project.contentCompleted || 0}/${project.contentTotal}` : ''}
                {' · '}最近更新：{formatUpdatedAt(project.updated_at)}
                {project.isActive ? ' · 当前项目' : ''}
              </p>
            </div>
            <div className="feasibility-project-actions">
              {renamingProjectId === project.id ? (
                <><button type="button" className="secondary-action" disabled={busy} onClick={() => setRenamingProjectId(null)}>取消</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void renameProject(project)}>保存名称</button></>
              ) : <button type="button" className="secondary-action" disabled={busy} onClick={() => startRename(project)}>重命名</button>}
              <button type="button" className="danger-action" disabled={busy} onClick={() => setPendingDeleteProject(project)}>删除</button>
              <button type="button" className="primary-action" disabled={busy} onClick={() => void enterProject(project)}>进入工作区</button>
            </div>
          </article>
        ))}
      </section>

      <Dialog.Root open={createDialogOpen} onOpenChange={(open) => { if (!busy) setCreateDialogOpen(open); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="feasibility-create-dialog">
            <form onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
              <div className="feasibility-dialog-head">
                <div><Dialog.Title>新建可研项目</Dialog.Title><Dialog.Description>项目将保存到独立的本地工作区，后续编制内容与其他项目隔离。</Dialog.Description></div>
                <Dialog.Close type="button" className="detail-help-close" aria-label="关闭新建可研项目">×</Dialog.Close>
              </div>
              <label className="feasibility-create-field"><span>项目名称</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：某某产业园建设项目" autoFocus /></label>
              <div className="content-regenerate-actions"><Dialog.Close type="button" className="secondary-action" onClick={() => setProjectName('')}>取消</Dialog.Close><button type="submit" className="primary-action" disabled={busy}>{busy ? '正在创建...' : '创建并进入'}</button></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(pendingDeleteProject)} onOpenChange={(open) => { if (!open && !busy) setPendingDeleteProject(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="feasibility-create-dialog">
            <div className="feasibility-confirm-dialog">
              <div className="feasibility-dialog-head">
                <div><Dialog.Title>确认删除可研项目</Dialog.Title><Dialog.Description>将永久删除“{pendingDeleteProject?.name}”及其本地资料、目录和正文，删除后无法恢复。</Dialog.Description></div>
                <Dialog.Close type="button" className="detail-help-close" aria-label="关闭删除确认">×</Dialog.Close>
              </div>
              <div className="content-regenerate-actions"><Dialog.Close type="button" className="secondary-action">取消</Dialog.Close><button type="button" className="danger-action" disabled={busy} onClick={() => void deleteProject()}>{busy ? '正在删除...' : '确认删除'}</button></div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default FeasibilityReportHome;
