import type { FloatingToolbarAction } from './FloatingToolbar';
import './dockedActionBar.css';

interface DockedActionBarProps {
  label: string;
  leading: FloatingToolbarAction[];
  trailing: FloatingToolbarAction[];
  status?: string;
}

function ActionButton({ action }: { action: FloatingToolbarAction }) {
  return <button
    type="button"
    className={`modern-docked-action is-${action.variant || 'secondary'}`}
    disabled={action.disabled}
    title={action.tooltip}
    onClick={action.onClick}
  >
    {action.icon && <span aria-hidden="true">{action.icon}</span>}
    {action.label}
  </button>;
}

export default function DockedActionBar({ label, leading, trailing, status }: DockedActionBarProps) {
  return <div className="modern-docked-actions" role="toolbar" aria-label={label}>
    <div className="modern-docked-actions-group">{leading.map((action) => <ActionButton key={action.id} action={action} />)}</div>
    <div className="modern-docked-actions-group is-trailing">{status && <span className="modern-docked-actions-status" role="status">{status}</span>}{trailing.map((action) => <ActionButton key={action.id} action={action} />)}</div>
  </div>;
}
