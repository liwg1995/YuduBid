import type { ReactNode } from 'react';
import './emptyState.css';

export interface EmptyStateProps {
  title: ReactNode;
  /** 标题下的说明文案 */
  hint?: ReactNode;
  /** 可选的引导操作，例如直达主操作的按钮 */
  children?: ReactNode;
  className?: string;
}

/** 共用空态：标题、说明和引导操作按阅读顺序排列。 */
export default function EmptyState({ title, hint, children, className }: EmptyStateProps) {
  return (
    <div className={`yb-empty-state${className ? ` ${className}` : ''}`}>
      <strong>{title}</strong>
      {hint != null ? <span>{hint}</span> : null}
      {children}
    </div>
  );
}
