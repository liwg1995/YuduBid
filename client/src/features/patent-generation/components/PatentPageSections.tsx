import * as Dialog from '@radix-ui/react-dialog';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import type { PatentCaseInfo, PatentDisclosureDraftFile, PatentGenerationState, PatentPoint, PatentTaskState, PatentTypePreference } from '../types';

export type PatentCaseInfoPatch = Partial<Omit<PatentCaseInfo, 'contact'>> & {
  contact?: Partial<PatentCaseInfo['contact']>;
};

export interface PatentMetric {
  label: string;
  value: string;
  detail: string;
}

export interface PatentStep {
  title: string;
  text: string;
}

export interface PatentPreviewItem {
  title: string;
  status: string;
  detail: string;
  id?: string;
  qualityWarnings?: string[];
}

interface PatentExportProgressView {
  running: boolean;
  progress: number;
  message: string;
  warnings: string[];
  error?: string;
}

const patentTypeLabels: Record<PatentTypePreference, string> = {
  method: '方法',
  system: '系统',
  device: '装置',
  unknown: '暂不确定',
};

const patentFieldTooltipWidth = 260;
const patentFieldTooltipGap = 10;
const patentFieldTooltipMargin = 12;

function PatentHintIcon({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, arrowLeft: 24 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const tooltipWidth = Math.min(patentFieldTooltipWidth, Math.max(160, viewportWidth - patentFieldTooltipMargin * 2));
      const preferredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      const left = Math.min(
        Math.max(patentFieldTooltipMargin, preferredLeft),
        Math.max(patentFieldTooltipMargin, viewportWidth - tooltipWidth - patentFieldTooltipMargin),
      );
      const arrowLeft = Math.min(Math.max(16, rect.left + rect.width / 2 - left), tooltipWidth - 16);
      const top = Math.max(patentFieldTooltipMargin, rect.top - patentFieldTooltipGap);
      setPosition({ left, top, arrowLeft });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="patent-field-hint"
        aria-label={`${label}填写提示：${hint}`}
        aria-describedby={open ? `${label}-hint` : undefined}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onFocus={() => setOpen(true)}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        !
      </button>
      {open && createPortal(
        <span
          id={`${label}-hint`}
          className="patent-field-tooltip"
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            width: Math.min(patentFieldTooltipWidth, Math.max(160, window.innerWidth - patentFieldTooltipMargin * 2)),
            '--patent-field-tooltip-arrow-left': `${position.arrowLeft}px`,
          } as CSSProperties}
        >
          {hint}
        </span>,
        document.body,
      )}
    </>
  );
}

function PatentFieldLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="patent-field-label">
      <span>{label}</span>
      <PatentHintIcon label={label} hint={hint} />
    </span>
  );
}

export function formatPatentUpdatedAt(value: string) {
  if (!value) return '尚未保存';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未保存';
  return date.toLocaleString('zh-CN', { hour12: false });
}

interface PatentHeroProps {
  kicker: string;
  title: string;
  description: string;
  actionLabel: string;
  caseSummary: string;
  loading: boolean;
  updatedAt: string;
  metrics: PatentMetric[];
  task?: PatentTaskState;
  projectSelected: boolean;
  processing: boolean;
  mining: boolean;
  generatingDraft: boolean;
  enableMiningActions: boolean;
  enableDisclosureDraft: boolean;
  showUsageHelp?: boolean;
  workflowSteps: PatentStep[];
  onPrimaryAction?: () => void;
  onReimportProject?: () => void;
}

function PatentUsageHelp() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="patent-usage-help-trigger">如何使用？</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="patent-usage-help-card">
          <div className="patent-usage-help-head">
            <div>
              <Dialog.Title>专利生成功能怎么用</Dialog.Title>
              <Dialog.Description>
                这套流程适合把已有项目、方案、源码和技术文档整理成可交给代理人继续处理的技术交底材料。
              </Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭专利生成使用说明">×</Dialog.Close>
          </div>

          <div className="patent-usage-help-body">
            <section>
              <span className="section-kicker">推荐材料</span>
              <p>
                优先选择包含真实技术细节的项目目录，例如设计文档、流程说明、接口说明、核心代码、算法规则、数据结构和已有方案稿。
                材料越具体，专利挖掘越容易聚焦到“技术问题、技术手段、区别点和可实施性”。
              </p>
            </section>

            <section className="patent-usage-flow" aria-label="专利生成流程图">
              {['导入资料', '专利挖掘', '选择主点', '查新分析', '交底书生成', '修订迭代', '导出 Word'].map((item, index, list) => (
                <div className="patent-usage-flow-item" key={item}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item}</strong>
                  {index < list.length - 1 && <i aria-hidden="true">→</i>}
                </div>
              ))}
            </section>

            <section className="patent-usage-help-grid">
              <article>
                <strong>第一步：先做专利挖掘</strong>
                <p>点击“选择项目资料”，选择一个项目目录。系统会扫描文档和代码，输出 3-5 个候选专利点，并按创新性、区别点和可实施性排序。</p>
              </article>
              <article>
                <strong>第二步：确定主专利点</strong>
                <p>优先选择技术手段清楚、能落到模块或流程、区别点明确的候选点。选中后，它会成为交底书、查新分析和后续修订的共同主线。</p>
              </article>
              <article>
                <strong>第三步：补充查新材料</strong>
                <p>在“查新分析”里粘贴公开专利、论文、网页资料或代理人检索结果。系统只基于你提供的资料整理现有技术，不会编造专利号。</p>
              </article>
              <article>
                <strong>第四步：生成并修订交底书</strong>
                <p>生成交底书后，先人工检查技术方案、实施例和保护点；有补充材料或纠错说明时，到“修订迭代”生成新版本，旧稿会保留。</p>
              </article>
            </section>

            <section className="patent-usage-checklist">
              <span className="section-kicker">使用建议</span>
              <p>好的专利点通常不是“做了一个功能”，而是“用一组技术手段解决了一个具体技术问题”。</p>
              <ul>
                <li>标题尽量包含方法、系统、装置或介质等保护客体。</li>
                <li>创新点要写清数据怎么处理、流程怎么闭环、规则或模型如何协同。</li>
                <li>区别点要能对比人工处理、关键词检索、普通规则配置或常规系统流程。</li>
                <li>导出 Word 前建议人工核对图表、术语一致性和代理人要求的章节格式。</li>
              </ul>
            </section>
          </div>

          <div className="patent-usage-help-actions">
            <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PatentWorkflowHelp({ kicker, steps }: { kicker: string; steps: PatentStep[] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="patent-workflow-help-trigger">流程规划</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="patent-workflow-help-card">
          <div className="patent-usage-help-head">
            <div>
              <Dialog.Title>{kicker}工作路径</Dialog.Title>
              <Dialog.Description>
                这里展示当前模块的推荐流程，不占用主操作区空间。
              </Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭流程规划">×</Dialog.Close>
          </div>
          <div className="demo-step-list patent-workflow-help-list">
            {steps.map((step, index) => (
              <article key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PatentHero({
  kicker,
  title,
  description,
  actionLabel,
  caseSummary,
  loading,
  updatedAt,
  metrics,
  task,
  projectSelected,
  processing,
  mining,
  generatingDraft,
  enableMiningActions,
  enableDisclosureDraft,
  showUsageHelp = false,
  workflowSteps,
  onPrimaryAction,
  onReimportProject,
}: PatentHeroProps) {
  const taskType = task?.type || (enableMiningActions ? 'patent-mining' : enableDisclosureDraft ? 'patent-disclosure' : '');
  const isHeroTask = Boolean(task && (
    (enableMiningActions && taskType === 'patent-mining')
    || (enableDisclosureDraft && taskType === 'patent-disclosure')
  ));
  const heroTaskRunning = task?.status === 'running' && isHeroTask;
  const heroTaskFinished = Boolean(task && isHeroTask && (task.status === 'success' || task.status === 'error'));
  const optimisticMining = enableMiningActions && projectSelected && mining && !heroTaskRunning;
  const optimisticDisclosure = enableDisclosureDraft && generatingDraft && !heroTaskRunning;
  const showHeroProgress = heroTaskRunning || heroTaskFinished || optimisticMining || optimisticDisclosure;
  const heroProgress = heroTaskRunning || heroTaskFinished
    ? Math.min(100, Math.max(0, Number(task?.progress || 0)))
    : 8;
  const heroProgressMessage = heroTaskRunning || heroTaskFinished
    ? task?.message || '正在处理...'
    : optimisticMining
      ? '正在启动专利挖掘...'
      : '正在启动交底书生成...';
  const heroLatestLog = heroTaskRunning || heroTaskFinished ? task?.logs?.filter(Boolean).at(-1) : '';
  const primaryLabel = enableMiningActions
    ? !projectSelected
      ? '导入项目资料'
      : processing
        ? '挖掘中...'
        : '开始挖掘专利'
    : processing
      ? '处理中...'
      : generatingDraft
        ? '生成中...'
        : actionLabel;

  return (
    <section className="demo-hero-card">
      <div className="demo-hero-copy">
        <div className="patent-hero-kicker-row">
          <span className="section-kicker">{kicker}</span>
          <PatentWorkflowHelp kicker={kicker} steps={workflowSteps} />
          {showUsageHelp && <PatentUsageHelp />}
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="patent-case-summary" title={caseSummary}>
          <span>当前案件</span>
          <strong>{loading ? '读取中...' : caseSummary}</strong>
          <small>更新时间：{formatPatentUpdatedAt(updatedAt)}</small>
        </div>
        <div className="demo-hero-actions">
          <button
            type="button"
            className="primary-action"
            onClick={onPrimaryAction}
            disabled={loading || processing || generatingDraft || (!enableMiningActions && !enableDisclosureDraft)}
          >
            {primaryLabel}
          </button>
          {enableMiningActions && projectSelected && (
            <button
              type="button"
              className="secondary-action"
              onClick={onReimportProject}
              disabled={loading || processing || generatingDraft}
            >
              重新导入
            </button>
          )}
        </div>
        {showHeroProgress && (
          <div className={`patent-task-progress patent-hero-progress${task?.status === 'error' ? ' is-error' : task?.status === 'success' ? ' is-success' : ''}`} role="status" aria-live="polite">
            <div className="patent-task-progress-head">
              <strong>{heroProgressMessage}</strong>
              <span>{heroProgress}%</span>
            </div>
            <div className="patent-task-progress-track" aria-label={`${enableMiningActions ? '专利挖掘' : '交底书生成'}进度`}>
              <span style={{ width: `${heroProgress}%` }} />
            </div>
            {heroLatestLog && <p>{heroLatestLog}</p>}
          </div>
        )}
      </div>

      <div className="demo-metric-stack" aria-label={`${kicker}规划指标`}>
        {metrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

interface PatentCasePanelProps {
  caseInfo: PatentCaseInfo;
  loading: boolean;
  saving: boolean;
  selectingProject: boolean;
  mining: boolean;
  isRunning: boolean;
  state: PatentGenerationState | null;
  enableMiningActions: boolean;
  onCaseInfoChange: (partial: PatentCaseInfoPatch) => void;
  onSaveCaseInfo: () => void;
  onResetCase: () => void;
  onSelectProject: () => void;
  onStartMining: () => void;
}

export function PatentCasePanel({
  caseInfo,
  loading,
  saving,
  selectingProject,
  mining,
  isRunning,
  state,
  enableMiningActions,
  onCaseInfoChange,
  onSaveCaseInfo,
  onResetCase,
  onSelectProject,
  onStartMining,
}: PatentCasePanelProps) {
  return (
    <section className="demo-panel patent-case-panel">
      <div className="demo-panel-head">
        <div>
          <span className="section-kicker">案件信息</span>
          <h3 className="patent-case-title">
            <span>共享专利案件</span>
            <PatentHintIcon
              label="共享专利案件"
              hint="这是一套贯穿专利挖掘、交底书生成、查新分析和修订迭代的案件基础信息。保存后，各页面会共用同一案件名称、技术主题、专利类型倾向和联系人信息，避免重复填写，并作为生成交底书与导出 Word 的上下文。"
            />
          </h3>
        </div>
        <span className="demo-soft-pill">{patentTypeLabels[caseInfo.patentType]}</span>
      </div>
      <div className="patent-case-form">
        <label>
          <PatentFieldLabel label="案件名称" hint="例如：一种投标文件风险项自动检查方法及系统" />
          <input
            value={caseInfo.caseName}
            onChange={(event) => onCaseInfoChange({ caseName: event.target.value })}
          />
        </label>
        <label>
          <PatentFieldLabel label="技术主题" hint="例如：投标文件合规性自动检查" />
          <input
            value={caseInfo.topic}
            onChange={(event) => onCaseInfoChange({ topic: event.target.value })}
          />
        </label>
        <label>
          <PatentFieldLabel label="专利类型倾向" hint="不确定时保持默认，后续可根据候选专利点再调整为方法、系统或装置。" />
          <select
            value={caseInfo.patentType}
            onChange={(event) => onCaseInfoChange({ patentType: event.target.value as PatentTypePreference })}
          >
            <option value="unknown">暂不确定</option>
            <option value="method">方法</option>
            <option value="system">系统</option>
            <option value="device">装置</option>
          </select>
        </label>
        <label>
          <PatentFieldLabel label="联系人" hint="填写技术联系人姓名，便于导出的交底书保留案件联系信息。" />
          <input
            value={caseInfo.contact.name}
            onChange={(event) => onCaseInfoChange({ contact: { name: event.target.value } })}
          />
        </label>
        <label>
          <PatentFieldLabel label="联系电话" hint="填写技术联系人的电话；仅保存到本机专利案件状态中。" />
          <input
            value={caseInfo.contact.phone}
            onChange={(event) => onCaseInfoChange({ contact: { phone: event.target.value } })}
          />
        </label>
        <label>
          <PatentFieldLabel label="联系邮箱" hint="填写技术联系人邮箱；生成交底书时会作为联系人信息引用。" />
          <input
            value={caseInfo.contact.email}
            onChange={(event) => onCaseInfoChange({ contact: { email: event.target.value } })}
          />
        </label>
        <div className="patent-case-actions">
          <div className="patent-case-actions-left">
            <button type="button" className="secondary-action" onClick={onSaveCaseInfo} disabled={saving || loading}>
              {saving ? '保存中...' : '保存案件信息'}
            </button>
            <button type="button" className="secondary-action is-danger" onClick={onResetCase} disabled={loading || isRunning}>
              重置案件
            </button>
          </div>
          {enableMiningActions && (
            <div className="patent-mining-actions">
              <button type="button" className="secondary-action" onClick={onSelectProject} disabled={selectingProject || mining || isRunning}>
                {selectingProject ? '扫描中...' : '选择项目目录'}
              </button>
              <button type="button" className="primary-action" onClick={onStartMining} disabled={!state?.project || mining || isRunning}>
                {mining || isRunning ? '挖掘中...' : '开始专利挖掘'}
              </button>
            </div>
          )}
        </div>
        {enableMiningActions && (
          <div className="patent-project-status">
            <strong>{state?.project?.name || '尚未选择项目'}</strong>
            <span>{state?.scanSummary || '选择项目目录后，会扫描技术文档和核心代码摘要。'}</span>
            {state?.task?.message && <em>{state.task.message}</em>}
            {state?.task?.error && <em className="is-error">{state.task.error}</em>}
          </div>
        )}
      </div>
    </section>
  );
}

export function PatentWorkflowPanel({ kicker, steps }: { kicker: string; steps: PatentStep[] }) {
  return (
    <section className="demo-panel patent-workflow-panel">
      <div className="demo-panel-head">
        <div>
          <span className="section-kicker">流程规划</span>
          <h3>{kicker}工作路径</h3>
        </div>
        <span className="demo-soft-pill">规划预览</span>
      </div>
      <div className="demo-step-list">
        {steps.map((step, index) => (
          <article key={step.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PatentSelectedPointPanel({ selectedPatentPoint }: { selectedPatentPoint: PatentPoint | null }) {
  return (
    <section className="demo-panel patent-selected-point-panel">
      <div className="demo-panel-head">
        <div>
          <span className="section-kicker">主专利点</span>
          <h3>{selectedPatentPoint ? selectedPatentPoint.title : '尚未选择主专利点'}</h3>
        </div>
        <span className="demo-soft-pill patent-selected-point-status">{selectedPatentPoint ? '已就绪' : '待选择'}</span>
      </div>
      {selectedPatentPoint ? (
        <div className="patent-selected-point">
          <article>
            <span>核心创新</span>
            <p>{selectedPatentPoint.innovation || '未生成'}</p>
          </article>
          <article>
            <span>区别点</span>
            <p>{selectedPatentPoint.difference || '未生成'}</p>
          </article>
          <article>
            <span>可实施性</span>
            <p>{selectedPatentPoint.feasibility || '未生成'}</p>
          </article>
          <article>
            <span>权利要求倾向</span>
            <p>{selectedPatentPoint.recommendedClaims?.length ? selectedPatentPoint.recommendedClaims.join('、') : '暂不确定'}</p>
          </article>
          {selectedPatentPoint.qualityWarnings?.length ? (
            <article className="is-warning">
              <span>质量提示</span>
              <p>{selectedPatentPoint.qualityWarnings.join('；')}</p>
            </article>
          ) : null}
        </div>
      ) : (
        <p className="patent-empty-tip">请先到“专利挖掘”生成候选专利点，并选择一个作为交底书生成方向。</p>
      )}
    </section>
  );
}

interface PatentResultPanelProps {
  previewTitle: string;
  items: PatentPreviewItem[];
  enablePatentPointSelection: boolean;
  selectingPointId: string;
  onSelectPatentPoint: (pointId: string) => void;
}

export function PatentResultPanel({ previewTitle, items, enablePatentPointSelection, selectingPointId, onSelectPatentPoint }: PatentResultPanelProps) {
  return (
    <section className="demo-panel demo-table-panel patent-result-panel">
      <div className="demo-panel-head">
        <div>
          <span className="section-kicker">结果预览</span>
          <h3>{previewTitle}</h3>
        </div>
      </div>
      <div className="demo-table-list">
        {items.map((item) => (
          <article key={item.id || item.title} className={item.status === '已选' ? 'is-selected' : ''}>
            <strong>{item.title}</strong>
            <span className="demo-status-pill is-ok">{item.status}</span>
            <p>{item.detail}</p>
            {item.qualityWarnings?.length ? (
              <div className="patent-quality-warning-list">
                {item.qualityWarnings.map((warning) => <em key={warning}>{warning}</em>)}
              </div>
            ) : null}
            {enablePatentPointSelection && item.id && (
              <button
                type="button"
                className="secondary-action patent-select-point-action"
                onClick={() => onSelectPatentPoint(item.id || '')}
                disabled={selectingPointId === item.id || item.status === '已选'}
              >
                {item.status === '已选' ? '当前主专利点' : selectingPointId === item.id ? '设置中...' : '设为主专利点'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function PatentOutputCard({ outputTitle, outputItems, outputDescription }: { outputTitle: string; outputItems: string[]; outputDescription: string }) {
  return (
    <aside className="demo-preview-card patent-output-card">
      <span className="section-kicker">交付物</span>
      <h3>{outputTitle}</h3>
      <div className="demo-document-preview">
        {outputItems.map((item, index) => index === 0 ? <strong key={item}>{item}</strong> : <span key={item}>{item}</span>)}
      </div>
      <p>{outputDescription}</p>
    </aside>
  );
}

interface PatentDraftPanelProps {
  draftFile: PatentDisclosureDraftFile | null;
  draftContent: string;
  draftViewMode: 'edit' | 'preview';
  task?: PatentTaskState;
  savingDraft: boolean;
  exportingWord: boolean;
  exportProgress: PatentExportProgressView;
  generatingDraft: boolean;
  isRunning: boolean;
  selectedPatentPoint: PatentPoint | null;
  exportMessage: string;
  onDraftContentChange: (value: string) => void;
  onDraftViewModeChange: (mode: 'edit' | 'preview') => void;
  onSaveDraft: () => void;
  onExportWord: () => void;
  onGenerateDraft: () => void;
}

export function PatentDraftPanel({
  draftFile,
  draftContent,
  draftViewMode,
  task,
  savingDraft,
  exportingWord,
  exportProgress,
  generatingDraft,
  isRunning,
  selectedPatentPoint,
  exportMessage,
  onDraftContentChange,
  onDraftViewModeChange,
  onSaveDraft,
  onExportWord,
  onGenerateDraft,
}: PatentDraftPanelProps) {
  const showExportProgress = exportingWord || Boolean(exportProgress.message);
  const showDraftProgress = !showExportProgress
    && task?.type === 'patent-disclosure'
    && (task.status === 'running' || task.status === 'success' || task.status === 'error');
  const draftProgress = Math.min(100, Math.max(0, Number(task?.progress || 0)));
  const latestDraftLog = task?.logs?.filter(Boolean).at(-1);
  const wordExportProgress = Math.min(100, Math.max(0, Number(exportProgress.progress || 0)));

  return (
    <section className="demo-panel patent-draft-panel">
      <div className="demo-panel-head">
        <div>
          <span className="section-kicker">Markdown 草稿</span>
          <h3>{draftFile?.title || '技术交底书草稿'}</h3>
        </div>
        <div className="patent-draft-actions">
          <button type="button" className={draftViewMode === 'edit' ? 'primary-action' : 'secondary-action'} onClick={() => onDraftViewModeChange('edit')}>
            编辑
          </button>
          <button type="button" className={draftViewMode === 'preview' ? 'primary-action' : 'secondary-action'} onClick={() => onDraftViewModeChange('preview')}>
            预览
          </button>
          <button type="button" className="secondary-action" onClick={onSaveDraft} disabled={!draftFile || savingDraft}>
            {savingDraft ? '保存中...' : '保存草稿'}
          </button>
          <button type="button" className="secondary-action" onClick={onExportWord} disabled={!draftFile || exportingWord}>
            {exportingWord ? '导出中...' : '导出 Word'}
          </button>
          <button type="button" className="primary-action" onClick={onGenerateDraft} disabled={!selectedPatentPoint || generatingDraft || isRunning}>
            {generatingDraft || isRunning ? '生成中...' : draftFile ? '重新生成' : '生成草稿'}
          </button>
        </div>
      </div>
      {exportMessage && !showExportProgress && <p className="patent-export-message">{exportMessage}</p>}
      {showExportProgress && (
        <div className={`patent-task-progress patent-export-progress${exportProgress.error ? ' is-error' : ''}`} role="status" aria-live="polite">
          <div className="patent-task-progress-head">
            <strong>{exportProgress.message || '正在导出 Word...'}</strong>
            <span>{wordExportProgress}%</span>
          </div>
          <div className="patent-task-progress-track" aria-label="Word 导出进度">
            <span style={{ width: `${wordExportProgress}%` }} />
          </div>
          {exportProgress.warnings.length > 0 && (
            <div className="patent-export-warnings">
              {exportProgress.warnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
              {exportProgress.warnings.length > 3 && <p>还有 {exportProgress.warnings.length - 3} 条导出提示，请打开 Word 核对。</p>}
            </div>
          )}
        </div>
      )}
      {showDraftProgress && (
        <div className={`patent-task-progress${task?.status === 'error' ? ' is-error' : task?.status === 'success' ? ' is-success' : ''}`} role="status" aria-live="polite">
          <div className="patent-task-progress-head">
            <strong>{task?.message || '正在生成技术交底书草稿...'}</strong>
            <span>{draftProgress}%</span>
          </div>
          <div className="patent-task-progress-track" aria-label="交底书生成进度">
            <span style={{ width: `${draftProgress}%` }} />
          </div>
          {latestDraftLog && <p>{latestDraftLog}</p>}
        </div>
      )}
      {draftFile ? (
        draftViewMode === 'edit' ? (
          <MarkdownEditor value={draftContent} onChange={onDraftContentChange} placeholder="生成后可在这里编辑技术交底书 Markdown 草稿..." />
        ) : (
          <div className="patent-draft-preview">
            <MarkdownRenderer allowRawHtml={false}>{draftContent}</MarkdownRenderer>
          </div>
        )
      ) : (
        <p className="patent-empty-tip">选择主专利点后，点击“生成草稿”即可创建技术交底书 Markdown 初稿。</p>
      )}
    </section>
  );
}

interface PatentPriorArtPanelsProps {
  sourceText: string;
  markdown: string;
  viewMode: 'edit' | 'preview';
  generating: boolean;
  saving: boolean;
  isRunning: boolean;
  onSourceTextChange: (value: string) => void;
  onMarkdownChange: (value: string) => void;
  onViewModeChange: (mode: 'edit' | 'preview') => void;
  onGenerate: () => void;
  onSave: () => void;
}

export function PatentPriorArtPanels({
  sourceText,
  markdown,
  viewMode,
  generating,
  saving,
  isRunning,
  onSourceTextChange,
  onMarkdownChange,
  onViewModeChange,
  onGenerate,
  onSave,
}: PatentPriorArtPanelsProps) {
  return (
    <>
      <section className="demo-panel patent-prior-art-panel">
        <div className="demo-panel-head">
          <div>
            <span className="section-kicker">查新资料</span>
            <h3>手动资料整理</h3>
          </div>
          <button type="button" className="primary-action" onClick={onGenerate} disabled={generating || isRunning}>
            {generating || isRunning ? '整理中...' : '生成查新分析'}
          </button>
        </div>
        <textarea
          className="patent-prior-art-source"
          value={sourceText}
          onChange={(event) => onSourceTextChange(event.target.value)}
          placeholder="粘贴公开专利、论文摘要、网页资料、代理人检索结果等。请保留标题、公开来源 URL、摘要或关键段落，便于生成可核验的现有技术分析。"
        />
      </section>

      <section className="demo-panel patent-prior-art-result-panel">
        <div className="demo-panel-head">
          <div>
            <span className="section-kicker">分析结果</span>
            <h3>现有技术与区别点</h3>
          </div>
          <div className="patent-draft-actions">
            <button type="button" className={viewMode === 'edit' ? 'primary-action' : 'secondary-action'} onClick={() => onViewModeChange('edit')}>
              编辑
            </button>
            <button type="button" className={viewMode === 'preview' ? 'primary-action' : 'secondary-action'} onClick={() => onViewModeChange('preview')}>
              预览
            </button>
            <button type="button" className="secondary-action" onClick={onSave} disabled={saving}>
              {saving ? '保存中...' : '保存分析'}
            </button>
          </div>
        </div>
        {markdown ? (
          viewMode === 'edit' ? (
            <MarkdownEditor value={markdown} onChange={onMarkdownChange} placeholder="生成后可在这里编辑查新分析 Markdown..." />
          ) : (
            <div className="patent-draft-preview">
              <MarkdownRenderer allowRawHtml={false}>{markdown}</MarkdownRenderer>
            </div>
          )
        ) : (
          <p className="patent-empty-tip">粘贴现有技术资料后点击“生成查新分析”，结果会用于后续交底书第一章。</p>
        )}
      </section>
    </>
  );
}

interface PatentRevisionPanelsProps {
  state: PatentGenerationState | null;
  revisionKind: 'merge' | 'correct';
  revisionInstruction: string;
  generatingRevision: boolean;
  isRunning: boolean;
  onRevisionKindChange: (kind: 'merge' | 'correct') => void;
  onRevisionInstructionChange: (value: string) => void;
  onGenerateRevision: () => void;
}

export function PatentRevisionPanels({
  state,
  revisionKind,
  revisionInstruction,
  generatingRevision,
  isRunning,
  onRevisionKindChange,
  onRevisionInstructionChange,
  onGenerateRevision,
}: PatentRevisionPanelsProps) {
  return (
    <>
      <section className="demo-panel patent-revision-panel">
        <div className="demo-panel-head">
          <div>
            <span className="section-kicker">修订说明</span>
            <h3>生成新的交底书版本</h3>
          </div>
          <button type="button" className="primary-action" onClick={onGenerateRevision} disabled={generatingRevision || isRunning}>
            {generatingRevision || isRunning ? '生成中...' : '生成修订版本'}
          </button>
        </div>
        <div className="patent-revision-controls">
          <label>
            <span>修订类型</span>
            <select value={revisionKind} onChange={(event) => onRevisionKindChange(event.target.value as 'merge' | 'correct')}>
              <option value="merge">补充合并</option>
              <option value="correct">纠错修正</option>
            </select>
          </label>
          <label>
            <span>当前草稿</span>
            <input value={state?.activeDraftId ? '已选择当前交底书草稿' : '尚未生成交底书草稿'} readOnly />
          </label>
        </div>
        <textarea
          className="patent-prior-art-source"
          value={revisionInstruction}
          onChange={(event) => onRevisionInstructionChange(event.target.value)}
          placeholder="请输入补充材料、纠错说明、参数修正、实施例扩展或保护点调整要求。生成后会另存新 Markdown 草稿，不覆盖旧稿。"
        />
      </section>

      <section className="demo-panel patent-revision-log-panel">
        <div className="demo-panel-head">
          <div>
            <span className="section-kicker">修订记录</span>
            <h3>版本留档</h3>
          </div>
          <span className="demo-soft-pill">{state?.revisionLogs?.length || 0} 条</span>
        </div>
        {state?.revisionLogs?.length ? (
          <div className="patent-revision-log-list">
            {state.revisionLogs.map((log) => (
              <article key={log.id}>
                <div>
                  <strong>{log.kind === 'correct' ? '纠错修正' : '补充合并'}</strong>
                  <span>{formatPatentUpdatedAt(log.created_at)}</span>
                </div>
                <p>{log.summary}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="patent-empty-tip">暂无修订记录。生成修订版本后，会在这里保留摘要和时间。</p>
        )}
      </section>
    </>
  );
}

interface PatentResetDialogProps {
  open: boolean;
  resetting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function PatentResetDialog({ open, resetting, onOpenChange, onConfirm }: PatentResetDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="patent-reset-confirm-card">
          <Dialog.Title>重置专利案件</Dialog.Title>
          <Dialog.Description>
            将清空当前专利案件信息、候选专利点、查新分析、草稿索引和修订记录。已经通过保存对话框导出的 Word 文件不会被删除。
          </Dialog.Description>
          <div className="patent-reset-confirm-actions">
            <Dialog.Close asChild>
              <button type="button" className="secondary-action" disabled={resetting}>取消</button>
            </Dialog.Close>
            <button type="button" className="primary-action" onClick={onConfirm} disabled={resetting}>
              {resetting ? '重置中...' : '确认重置'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
