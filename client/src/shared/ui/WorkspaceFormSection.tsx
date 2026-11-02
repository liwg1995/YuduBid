import { useId, type ReactNode } from 'react';
import './workspaceFormSection.css';

/** 用语义分组和间距组织工作区表单，不额外叠加卡片背景。 */
export default function WorkspaceFormSection({ title, description, children, className = '', disabled = false }: {
  title: string; description?: string; children: ReactNode; className?: string; disabled?: boolean;
}) {
  const descriptionId = useId();
  return <fieldset disabled={disabled} className={`yb-workspace-form-section ${className}`} aria-describedby={description ? descriptionId : undefined}>
    <legend>{title}</legend>
    {description && <p id={descriptionId} className="yb-workspace-form-description">{description}</p>}
    <div className="yb-workspace-form-fields">{children}</div>
  </fieldset>;
}
