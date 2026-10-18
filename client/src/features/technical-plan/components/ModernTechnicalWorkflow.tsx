import type { ReactNode } from 'react';
import type { TechnicalPlanStep } from '../types';
import './modernTechnicalWorkflow.css';

interface StepItem { id: TechnicalPlanStep; label: string }
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
  if (!modern) return <>{children}</>;
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const current = steps[activeIndex];
  const renderAction = (action: WorkflowAction) => <button key={action.id} type="button" className={`modern-workflow-command${action.variant === 'primary' ? ' is-primary' : ''}${action.variant === 'danger' ? ' is-danger' : ''}`}
    disabled={action.disabled} title={action.tooltip} onClick={action.onClick}>{action.icon && <span aria-hidden="true">{action.icon}</span>}{action.label}</button>;
  return (
    <div className="modern-workflow-layout">
      <aside className="modern-workflow-steps" aria-label="技术方案步骤">
        <div className="modern-workflow-steps-head"><span>工作流程</span><strong>{String(activeIndex + 1).padStart(2, '0')} <small>/ {String(steps.length).padStart(2, '0')}</small></strong></div>
        <nav aria-label="技术方案步骤">
          {steps.map((step, index) => {
            const isCurrent = index === activeIndex;
            const isAvailable = index < activeIndex || (index === activeIndex + 1 && !nextDisabled);
            return <button key={step.id} type="button" className={`${isCurrent ? 'is-current' : ''}${index < activeIndex ? ' is-past' : ''}`}
              aria-current={isCurrent ? 'step' : undefined} disabled={!isAvailable} title={index === activeIndex + 1 && nextDisabled ? nextHint : index > activeIndex + 1 ? '请按顺序完成前面的步骤' : undefined}
              onClick={() => onStepChange(step.id)}>
              <span className="modern-workflow-step-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="modern-workflow-step-label">{step.label}</span>
              <span className="modern-workflow-step-mark" aria-hidden="true">{index < activeIndex ? '✓' : isCurrent ? '●' : ''}</span>
            </button>;
          })}
        </nav>
        <p>按顺序完成每个阶段，项目数据会持续保存在本地。</p>
      </aside>

      <div className="modern-workflow-main">
        <header className="modern-workflow-heading">
          <div className="modern-workflow-heading-top">
            <div className="modern-workflow-location"><span>项目列表</span><span aria-hidden="true">/</span><span title={projectName}>{projectName}</span></div>
            <button type="button" className="modern-workflow-back" onClick={onBackToProjects} disabled={!onBackToProjects}>← 返回项目列表</button>
          </div>
          <div className="modern-workflow-heading-main"><div><span>阶段 {String(activeIndex + 1).padStart(2, '0')} · {String(steps.length).padStart(2, '0')}</span><h1>{current?.label}</h1></div><span className="modern-workflow-progress" aria-label={`第 ${activeIndex + 1} 步，共 ${steps.length} 步`}>{Math.round(((activeIndex + 1) / steps.length) * 100)}%</span></div>
        </header>
        <div className="modern-workflow-stage" key={activeStep}>{children}</div>
        <div className="modern-workflow-commandbar" aria-label="技术方案操作">
          <div>{actions.filter((action) => !['previous-step', 'next-step', 'export-word', 'continue-expand'].includes(action.id)).map(renderAction)}</div>
          <div>{actions.filter((action) => ['previous-step', 'next-step', 'export-word', 'continue-expand'].includes(action.id)).map(renderAction)}</div>
        </div>
      </div>
    </div>
  );
}
