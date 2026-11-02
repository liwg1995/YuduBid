import './workspaceViewControl.css';

/** 互斥的工作区视图，使用可访问的按钮状态，不承担业务数据。 */
export default function WorkspaceViewControl<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>; onChange: (value: T) => void;
}) {
  return <div className="yb-workspace-view-control" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" disabled={option.disabled} aria-pressed={value === option.value} onClick={() => { if (option.value !== value) onChange(option.value); }}>{option.label}</button>)}
  </div>;
}
