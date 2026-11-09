import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { TechnicalPlanStep } from '../types';
import './modernTechnicalWorkflow.css';

export type WorkflowStepStatus = 'pending' | 'running' | 'waiting' | 'success' | 'error' | 'paused';
interface StepItem { id: TechnicalPlanStep; label: string; status?: WorkflowStepStatus }
const statusLabels: Record<WorkflowStepStatus, string> = { pending: '未完成', running: '进行中', waiting: '等待确认', success: '已完成', error: '失败', paused: '已暂停' };
export interface WorkflowAction { id: string; label: string; icon?: ReactNode; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; tooltip?: string; onClick: () => void }

interface Props {
  modern: boolean;
  projectName: string;
  activeStep: TechnicalPlanStep;
  steps: StepItem[];
  nextDisabled: boolean;
  nextHint: string;
  onStepChange: (step: TechnicalPlanStep) => void;
  onBackToProjects?: () => void;
  actions: WorkflowAction[];
  children: ReactNode;
}

export default function ModernTechnicalWorkflow({ modern, projectName, activeStep, steps, nextDisabled, nextHint, onStepChange, onBackToProjects, actions, children }: Props) {
  const [stepsOpen, setStepsOpen] = useState(false);
  if (!modern) return <>{children}</>;
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const current = steps[activeIndex];
  const navigationIds = new Set(['previous-step', 'next-step', 'skip-settings', 'export-word', 'continue-expand']);
  const renderAction = (action: WorkflowAction) => <button key={action.id} type="button" className={`modern-workflow-command${action.variant === 'primary' ? ' is-primary' : ''}${action.variant === 'danger' ? ' is-danger' : ''}`}
    disabled={action.disabled} title={action.tooltip} onClick={action.onClick}>{action.icon && <span aria-hidden="true">{action.icon}</span>}{action.label}</button>;
  return (
    <div className="modern-workflow-layout">
      <div className="modern-workflow-main">
        <header className="modern-workflow-heading">
          <div className="modern-workflow-heading-top">
            <div className="modern-workflow-location"><span>项目列表</span><span aria-hidden="true">/</span><span title={projectName}>{projectName}</span></div>
            <button type="button" className="modern-workflow-back" onClick={onBackToProjects} disabled={!onBackToProjects}>← 返回项目列表</button>
          </div>
          <Popover.Root open={stepsOpen} onOpenChange={setStepsOpen}><Popover.Trigger asChild><button type="button" className="modern-workflow-stage-picker" aria-label={`选择工作阶段，当前${current?.label}，第 ${activeIndex + 1} 步，共 ${steps.length} 步`}>流程 · {current?.label}<span>{activeIndex + 1} / {steps.length} ▾</span></button></Popover.Trigger><Popover.Portal><Popover.Content className="modern-workflow-stage-popover" align="start" sideOffset={8} aria-label="选择工作阶段">
      <aside className="modern-workflow-steps modern-workflow-steps-popover" aria-label="技术方案步骤">
        <div className="modern-workflow-steps-head"><span>工作流程</span><strong>{String(activeIndex + 1).padStart(2, '0')} <small>/ {String(steps.length).padStart(2, '0')}</small></strong></div>
        <nav aria-label="技术方案步骤">
          {steps.map((step, index) => {
            const isCurrent = index === activeIndex;
            const isAvailable = !isCurrent && (step.status === 'success' || steps.slice(0, index).every((previous) => previous.status === 'success') || index < activeIndex || (index === activeIndex + 1 && !nextDisabled));
            return <button key={step.id} type="button" className={`${isCurrent ? 'is-current' : ''}${step.status === 'success' ? ' is-past' : ''}`}
              aria-current={isCurrent ? 'step' : undefined} disabled={!isAvailable} title={!isAvailable && !isCurrent ? index === activeIndex + 1 && nextDisabled ? nextHint : '请按顺序完成前面的步骤' : undefined}
              onClick={() => { onStepChange(step.id); setStepsOpen(false); }}>
              <span className="modern-workflow-step-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="modern-workflow-step-label">{step.label}<small className={`workflow-status is-${step.status || 'pending'}`}>{statusLabels[step.status || 'pending']}</small></span>
              <span className="modern-workflow-step-mark" aria-hidden="true">{step.status === 'success' ? '✓' : step.status === 'error' ? '!' : isCurrent ? '●' : ''}</span>
            </button>;
          })}
        </nav>
        <p>按顺序完成每个阶段，项目数据会持续保存在本地。</p>
      </aside>
          </Popover.Content></Popover.Portal></Popover.Root>
        </header>
        <div className="modern-workflow-stage" key={activeStep}>{children}</div>
        {nextDisabled && nextHint && <p className="modern-workflow-next-hint" role="status">下一步：{nextHint}</p>}
        <div className="modern-workflow-commandbar" aria-label="方案生成操作">
          <div>{actions.filter((action) => !navigationIds.has(action.id)).map(renderAction)}</div>
          <div>{actions.filter((action) => navigationIds.has(action.id)).map(renderAction)}</div>
        </div>
      </div>
    </div>
  );
}
