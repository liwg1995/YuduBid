import * as Dialog from '@radix-ui/react-dialog';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import { toChineseErrorMessage } from '../../../shared/utils/userFacingError';
import type { PatentApplicationType, PatentCaseInfo, PatentClaimForm, PatentDisclosureDraftFile, PatentGenerationState, PatentPoint, PatentTaskState } from '../types';
import { getConfirmedFactSupplements, getUnresolvedMissingFacts } from '../factSupplements';

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
  evidenceCount?: number;
  missingFactCount?: number;
  confirmedFactCount?: number;
  missingFacts?: string[];
  factSupplements?: PatentPoint['factSupplements'];
}

interface PatentExportProgressView {
  running: boolean;
  progress: number;
  message: string;
  warnings: string[];
  error?: string;
}

const patentTypeLabels: Record<PatentApplicationType, string> = {
  invention: '发明',
  'utility-model': '实用新型',
  design: '外观设计',
  unknown: '暂不确定',
};

const claimFormOptions: Array<{ value: PatentClaimForm; label: string }> = [
  { value: 'method', label: '方法' },
  { value: 'system', label: '系统' },
  { value: 'device', label: '装置' },
  { value: 'storage-medium', label: '存储介质' },
];

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

function formatPatentUpdatedAt(value: string) {
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
  onPauseMining?: () => void;
  onResumeMining?: () => void;
  onStopMining?: () => void;
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
                <p>选择项目目录后，系统会扫描文档和代码，输出带项目证据、事实缺口和分维度评分的候选专利点。</p>
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
                <p>生成后会自动检查章节、图示、实施例和保护点结构。仍需确认的问题会保留在草稿上方，修订时旧稿不会被覆盖。</p>
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
  caseSummary,
  loading,
  updatedAt,
  task,
  projectSelected,
  mining,
  generatingDraft,
  enableMiningActions,
  enableDisclosureDraft,
  onPauseMining,
  onResumeMining,
  onStopMining,
}: PatentHeroProps) {
  const taskType = task?.type || (enableMiningActions ? 'patent-mining' : enableDisclosureDraft ? 'patent-disclosure' : '');
  const isHeroTask = Boolean(task && enableMiningActions && taskType === 'patent-mining');
  const heroTaskRunning = task?.status === 'running' && isHeroTask;
  const heroTaskPausing = task?.status === 'pausing' && isHeroTask;
  const heroTaskPaused = task?.status === 'paused' && isHeroTask;
  const heroTaskStopping = task?.status === 'stopping' && isHeroTask;
  const heroTaskStopped = task?.status === 'stopped' && isHeroTask;
  const heroTaskError = task?.status === 'error' && isHeroTask;
  const optimisticMining = enableMiningActions && projectSelected && mining && !heroTaskRunning;
  const showHeroProgress = heroTaskRunning || heroTaskPausing || heroTaskPaused || heroTaskStopping || heroTaskStopped || heroTaskError || optimisticMining;
  const heroProgress = isHeroTask
    ? Math.min(100, Math.max(0, Number(task?.progress || 0)))
    : 8;
  const heroProgressMessage = isHeroTask
    ? heroTaskError ? toChineseErrorMessage(task?.error || task?.message) : task?.message || '正在处理...'
    : '正在启动专利挖掘...';
  const heroLatestLog = isHeroTask ? task?.logs?.filter(Boolean).at(-1) : '';
  const heroProgressLabel = heroTaskRunning && heroProgress >= 88 ? '处理中' : `${heroProgress}%`;
  return (
    <section className="demo-hero-card">
      <div className={`demo-hero-copy${showHeroProgress ? ' has-task-progress' : ''}`}>
        <div className="patent-hero-intro">
          <div className="patent-hero-kicker-row">
            <span className="section-kicker">{kicker}</span>
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
          <div className="patent-case-summary" title={caseSummary}>
            <span>当前案件</span>
            <strong>{loading ? '正在读取项目资料…' : caseSummary}</strong>
            <small>更新时间：{formatPatentUpdatedAt(updatedAt)}</small>
          </div>
        </div>
        {showHeroProgress && (
          <div className={`patent-task-progress patent-hero-progress${task?.status === 'error' ? ' is-error' : task?.status === 'success' ? ' is-success' : ''}`} role="status" aria-live="polite">
            <div className="patent-task-progress-head">
              <strong>{heroProgressMessage}</strong>
              <span>{heroProgressLabel}</span>
            </div>
            <div className="patent-task-progress-track" aria-label={`${enableMiningActions ? '专利挖掘' : '交底书生成'}进度`}>
              <span style={{ width: `${heroProgress}%` }} />
            </div>
            {heroLatestLog && <p>{heroLatestLog}</p>}
            {enableMiningActions && isHeroTask && (
              <div className="patent-task-controls">
                {heroTaskRunning && <button type="button" onClick={onPauseMining}>暂停</button>}
                {heroTaskPaused && <button type="button" className="is-primary" onClick={onResumeMining}>继续</button>}
                {(heroTaskRunning || heroTaskPausing || heroTaskPaused) && <button type="button" className="is-danger" onClick={onStopMining}>停止</button>}
                {(heroTaskPausing || heroTaskStopping) && <button type="button" disabled>{heroTaskPausing ? '暂停中...' : '停止中...'}</button>}
              </div>
            )}
          </div>
        )}
      </div>

    </section>
  );
}

interface PatentCasePanelProps {
  caseInfo: PatentCaseInfo;
  selectedPatentPoint: PatentPoint | null;
  loading: boolean;
  saving: boolean;
  generatingTopic: boolean;
  selectingProject: boolean;
  mining: boolean;
  isRunning: boolean;
  state: PatentGenerationState | null;
  enableMiningActions: boolean;
  onCaseInfoChange: (partial: PatentCaseInfoPatch) => void;
  onSaveCaseInfo: () => void;
  onGenerateTopic: () => void;
  onUseSelectedPatentName: () => void;
  onResetCase: () => void;
  onSelectProject: () => void;
  onStartMining: () => void;
}

export function PatentCasePanel({
  caseInfo,
  selectedPatentPoint,
  loading,
  saving,
  generatingTopic,
  selectingProject,
  mining,
  isRunning,
  state,
  enableMiningActions,
  onCaseInfoChange,
  onSaveCaseInfo,
  onGenerateTopic,
  onUseSelectedPatentName,
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
            <span>专利基本信息</span>
            <PatentHintIcon
              label="专利基本信息"
                hint="这些信息用于专利挖掘、交底书生成和 Word 导出。专利名称可以直接采用主专利点名称，也可以在生成前人工调整。"
            />
          </h3>
        </div>
        <span className="demo-soft-pill">{patentTypeLabels[caseInfo.applicationType]}</span>
      </div>
      <div className="patent-case-form">
        <label className="patent-case-name-field">
          <PatentFieldLabel label="专利名称" hint="用于交底书标题和导出文件名。可以直接采用主专利点名称，也可以人工调整。" />
          <span className="patent-case-name-control">
            <input
              value={caseInfo.caseName}
              onChange={(event) => onCaseInfoChange({ caseName: event.target.value })}
            />
            {selectedPatentPoint && caseInfo.caseName !== selectedPatentPoint.title && (
              <button type="button" onClick={onUseSelectedPatentName} disabled={saving}>
                使用主专利点名称
              </button>
            )}
          </span>
          <small>主专利点决定技术内容，专利名称用于成稿标题，两者可保持一致。</small>
        </label>
        <label>
          <PatentFieldLabel label="技术主题" hint="例如：投标文件合规性自动检查" />
          <span className="patent-case-name-control patent-topic-control">
            <input value={caseInfo.topic} onChange={(event) => onCaseInfoChange({ topic: event.target.value })} />
            <button type="button" onClick={onGenerateTopic} disabled={generatingTopic || loading}>
              {generatingTopic ? '生成中…' : 'AI 生成'}
            </button>
          </span>
        </label>
        <label>
          <PatentFieldLabel label="申请类型" hint="发明、实用新型和外观设计是申请类型；方法、系统、装置属于权利要求保护形态。" />
          <select
            value={caseInfo.applicationType}
            onChange={(event) => onCaseInfoChange({ applicationType: event.target.value as PatentApplicationType })}
          >
            <option value="invention">发明</option>
            <option value="utility-model">实用新型</option>
            <option value="design">外观设计</option>
            <option value="unknown">暂不确定（按发明分析）</option>
          </select>
        </label>
        <fieldset className="patent-claim-form-field">
          <legend><PatentFieldLabel label="权利要求形态" hint="可多选。发明通常可组合方法、系统和存储介质；实用新型通常选择装置。" /></legend>
          <div className="patent-claim-options">
            {claimFormOptions.map((option) => {
              const checked = caseInfo.claimForms.includes(option.value);
              return (
                <label key={option.value} className={checked ? 'is-checked' : ''}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onCaseInfoChange({
                      claimForms: checked
                        ? caseInfo.claimForms.filter((item) => item !== option.value)
                        : [...caseInfo.claimForms, option.value],
                    })}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
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
            {state?.task?.error && <em className="is-error">{toChineseErrorMessage(state.task.error)}</em>}
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
  const confirmedFactSupplements = selectedPatentPoint ? getConfirmedFactSupplements(selectedPatentPoint) : [];
  const unresolvedMissingFacts = selectedPatentPoint ? getUnresolvedMissingFacts(selectedPatentPoint) : [];
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
            <span>项目证据</span>
            {selectedPatentPoint.evidence?.length ? (
              <div className="patent-evidence-list">
                {selectedPatentPoint.evidence.map((item, index) => (
                  <p key={`${item.filePath}-${index}`}>
                    <strong>{item.filePath}{item.lineStart ? `:${item.lineStart}${item.lineEnd ? `-${item.lineEnd}` : ''}` : ''}</strong>
                    {item.excerpt}
                  </p>
                ))}
              </div>
            ) : <p>暂无可回查证据，建议补充技术文档或核心实现。</p>}
          </article>
          {confirmedFactSupplements.length ? (
            <article className="is-confirmed">
              <span>已补充事实</span>
              <div className="patent-confirmed-facts">
                {confirmedFactSupplements.map((item, index) => (
                    <p key={`${index}-${item.fact}`}>
                      <strong>{item.fact}</strong>
                      {item.content}
                    </p>
                  ))}
              </div>
            </article>
          ) : null}
          {unresolvedMissingFacts.length ? (
            <article className="is-warning">
              <span>待补事实</span>
              <p>{unresolvedMissingFacts.join('；')}</p>
            </article>
          ) : null}
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
  generatingFactPointId: string;
  savingFactPointId: string;
  onSelectPatentPoint: (pointId: string) => void;
  onGenerateFactSupplements: (pointId: string) => void;
  onSaveFactSupplements: (pointId: string, supplements: NonNullable<PatentPoint['factSupplements']>) => void;
}

export function PatentResultPanel({ previewTitle, items, enablePatentPointSelection, selectingPointId, generatingFactPointId, savingFactPointId, onSelectPatentPoint, onGenerateFactSupplements, onSaveFactSupplements }: PatentResultPanelProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
  const [supplementDrafts, setSupplementDrafts] = useState<Record<string, string>>({});

  function toggleItem(itemKey: string) {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  }

  return (
    <section className="demo-panel demo-table-panel patent-result-panel">
      <div className="demo-panel-head">
        <div>
          <span className="section-kicker">结果预览</span>
          <h3>{previewTitle}</h3>
        </div>
      </div>
      <div className="demo-table-list">
        {items.map((item) => {
          const itemKey = item.id || item.title;
          const expanded = expandedItems.has(itemKey);
          const confirmedSupplements = (item.factSupplements || []).filter((entry) => entry.source === 'manual' && entry.content.trim());
          const confirmedDraftsValid = confirmedSupplements.every((supplement, index) => (
            supplementDrafts[`${itemKey}::confirmed::${index}`] ?? supplement.content
          ).trim());
          return (
          <article key={itemKey} className={`${item.status === '已选' ? 'is-selected ' : ''}${expanded ? 'is-expanded' : ''}`}>
            <div className="patent-result-summary">
              <strong>{item.title}</strong>
              <span className="demo-status-pill is-ok">{item.status}</span>
            </div>
            {(item.evidenceCount !== undefined || item.missingFactCount !== undefined) && (
              <div className="patent-result-meta">
                <span>{item.evidenceCount || 0} 条项目证据</span>
                {Boolean(item.confirmedFactCount) && (
                  <button
                    type="button"
                    className="patent-confirmed-fact-status"
                    aria-expanded={expanded}
                    onClick={() => toggleItem(itemKey)}
                  >
                    <i aria-hidden="true">✓</i>
                    {item.confirmedFactCount === 1 ? '已补充' : `已补充 ${item.confirmedFactCount} 项`}
                    <span aria-hidden="true">{expanded ? '收起' : '查看'}</span>
                  </button>
                )}
                {item.missingFactCount ? (
                  <button
                    type="button"
                    className="patent-missing-facts-trigger is-warning"
                    aria-expanded={expanded}
                    onClick={() => toggleItem(itemKey)}
                  >
                    {item.missingFactCount} 项待补事实
                    <span aria-hidden="true">{expanded ? '收起' : '查看'}</span>
                  </button>
                ) : !item.confirmedFactCount ? <span>0 项待补事实</span> : null}
              </div>
            )}
            {expanded && (
              <div className="patent-result-details">
                <p>{item.detail}</p>
                {confirmedSupplements.length ? (
                  <div className="patent-confirmed-facts-editor">
                    <div className="patent-confirmed-facts-editor-head">
                      <strong><i aria-hidden="true">✓</i> 已确认的补充内容</strong>
                      <span>可继续修改，保存后交底书将使用最新内容</span>
                    </div>
                    {confirmedSupplements.map((supplement, index) => {
                      const draftKey = `${itemKey}::confirmed::${index}`;
                      return (
                        <label key={`${supplement.fact}-${index}`}>
                          <span>{supplement.fact}</span>
                          <textarea
                            value={supplementDrafts[draftKey] ?? supplement.content}
                            onChange={(event) => setSupplementDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}
                          />
                        </label>
                      );
                    })}
                    {item.id && (
                      <div className="patent-confirmed-facts-editor-actions">
                        <span>修改后请再次保存确认。</span>
                        <button
                          type="button"
                          disabled={savingFactPointId === item.id || !confirmedDraftsValid}
                          onClick={() => onSaveFactSupplements(item.id || '', confirmedSupplements.map((supplement, index) => ({
                            ...supplement,
                            content: supplementDrafts[`${itemKey}::confirmed::${index}`] ?? supplement.content,
                            source: 'manual',
                          })))}
                        >
                          {savingFactPointId === item.id ? '保存中...' : '保存修改'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {item.missingFacts?.length ? (
                  <div className="patent-missing-facts-list">
                    <div className="patent-missing-facts-head">
                      <strong>需要补充的事实</strong>
                      {item.id && (
                        <button type="button" onClick={() => onGenerateFactSupplements(item.id || '')} disabled={generatingFactPointId === item.id}>
                          {generatingFactPointId === item.id ? 'AI 生成中...' : 'AI 建议补充'}
                        </button>
                      )}
                    </div>
                    {item.missingFacts.map((fact, index) => {
                      const supplement = item.factSupplements?.find((entry) => entry.fact === fact) || item.factSupplements?.[index];
                      const draftKey = `${itemKey}::${index}`;
                      return (
                        <label key={`${index}-${fact}`}>
                          <span>{index + 1}. {fact}</span>
                          <textarea
                            value={supplementDrafts[draftKey] ?? supplement?.content ?? ''}
                            placeholder="可点击 AI 建议补充，再根据实际情况修改"
                            onChange={(event) => setSupplementDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}
                          />
                          {supplement?.basis && <small>建议依据：{supplement.basis}，置信度：{supplement.confidence === 'high' ? '高' : supplement.confidence === 'medium' ? '中' : '低'}</small>}
                        </label>
                      );
                    })}
                    {item.id && (
                      <div className="patent-missing-facts-actions">
                        <span>AI 内容仅为建议，保存前请人工确认。</span>
                        <button
                          type="button"
                          className="is-primary"
                          disabled={savingFactPointId === item.id}
                          onClick={() => onSaveFactSupplements(item.id || '', (item.missingFacts || []).map((fact, index) => {
                            const existing = item.factSupplements?.find((entry) => entry.fact === fact) || item.factSupplements?.[index];
                            return {
                              fact,
                              content: supplementDrafts[`${itemKey}::${index}`] ?? existing?.content ?? '',
                              basis: existing?.basis || '',
                              confidence: existing?.confidence || 'low',
                              source: 'manual',
                            };
                          }))}
                        >
                          {savingFactPointId === item.id ? '保存中...' : '保存补充内容'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {item.qualityWarnings?.length ? (
                  <div className="patent-quality-warning-list">
                    {item.qualityWarnings.map((warning) => <em key={warning}>{warning}</em>)}
                  </div>
                ) : null}
              </div>
            )}
            <div className="patent-result-actions">
              <button
                type="button"
                className="patent-result-toggle"
                aria-expanded={expanded}
                onClick={() => toggleItem(itemKey)}
              >
                {expanded ? '收起详情' : '查看详情'}
              </button>
              {enablePatentPointSelection && item.id && (
              <button
                type="button"
                className="secondary-action patent-select-point-action"
                onClick={() => onSelectPatentPoint(item.id || '')}
                disabled={selectingPointId === item.id || item.status === '已选'}
              >
                {item.status === '已选' ? '主专利点' : selectingPointId === item.id ? '设置中...' : '设为主专利点'}
              </button>
              )}
            </div>
          </article>
          );
        })}
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
  priorArtReady: boolean;
  exportMessage: string;
  exportFilePath: string;
  onDraftContentChange: (value: string) => void;
  onDraftViewModeChange: (mode: 'edit' | 'preview') => void;
  onSaveDraft: () => void;
  onExportWord: () => void;
  onOpenExportLocation: () => void;
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
  priorArtReady,
  exportMessage,
  exportFilePath,
  onDraftContentChange,
  onDraftViewModeChange,
  onSaveDraft,
  onExportWord,
  onOpenExportLocation,
  onGenerateDraft,
}: PatentDraftPanelProps) {
  const showExportProgress = exportingWord || Boolean(exportProgress.message);
  const showDraftProgress = !showExportProgress
    && task?.type === 'patent-disclosure'
    && (task.status === 'running' || task.status === 'error');
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
      {draftFile?.qualityWarnings?.length ? (
        <div className="patent-quality-gate is-warning" role="status">
          <div className="patent-quality-gate-copy">
            <strong>自动质量检查有 {draftFile.qualityWarnings.length} 项未通过</strong>
            <span>{draftFile.qualityWarnings.join('；')}</span>
          </div>
          <div className="patent-quality-gate-actions">
            <button type="button" className="secondary-action" onClick={() => onDraftViewModeChange('edit')}>
              定位到编辑
            </button>
            {draftFile.qualityWarnings.some((warning) => warning.startsWith('正文篇幅不足') || warning.startsWith('缺少')) && (
              <button type="button" className="primary-action" onClick={onGenerateDraft} disabled={generatingDraft || isRunning}>
                重新生成补足
              </button>
            )}
          </div>
          <small>修改后点击“保存草稿”，系统会重新检查；此处不是仅点击确认即可忽略的提示。</small>
        </div>
      ) : draftFile ? (
        <div className="patent-quality-gate is-ok" role="status">
          <strong>结构质量检查已通过</strong>
          <span>导出前仍建议核对技术事实、查新来源和代理人格式要求。</span>
        </div>
      ) : null}
      {draftFile && !priorArtReady && (
        <div className="patent-optional-prior-art-note" role="note">
          <strong>未进行查新增强</strong>
          <span>查新增强属于可选环节，不影响交底书生成；如需提高现有技术与区别点的可靠性，可后续补充。</span>
        </div>
      )}
      {exportMessage && !showExportProgress && <p className="patent-export-message">{exportMessage}</p>}
      {showExportProgress && (
        <div className={`patent-task-progress patent-export-progress${exportProgress.error ? ' is-error' : ''}`} role="status" aria-live="polite">
          <div className="patent-task-progress-head">
            <strong>{exportProgress.error ? toChineseErrorMessage(exportProgress.error) : exportProgress.message || '正在导出 Word...'}</strong>
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
          {!exportProgress.error && exportFilePath && (
            <div className="patent-export-location">
              <span title={exportFilePath}>导出位置：{exportFilePath}</span>
              <button type="button" className="secondary-action" onClick={onOpenExportLocation}>
                打开导出位置
              </button>
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
          {latestDraftLog && <p>{task?.status === 'error' ? toChineseErrorMessage(task.error || latestDraftLog) : latestDraftLog}</p>}
        </div>
      )}
      {draftFile ? (
        draftViewMode === 'edit' ? (
          <MarkdownEditor value={draftContent} onChange={onDraftContentChange} placeholder="生成后可在这里编辑技术交底书 Markdown 草稿..." />
        ) : (
          <div className="patent-draft-preview">
            <MarkdownRenderer allowRawHtml={false} enableMermaid>{draftContent}</MarkdownRenderer>
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
