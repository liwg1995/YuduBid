import { Dropdown, Table, type TableProps, type InputRef } from 'antd';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import EmptyState from './EmptyState';
import EnterpriseSearchInput from './EnterpriseSearchInput';
import EnterpriseUiProvider from './EnterpriseUiProvider';
import './projectList.css';

export function ProjectListHeader({ title, description, actions }: { title: string; description: string; actions: ReactNode }) {
  return <header className="yb-project-list-header"><div><h1>{title}</h1><p>{description}</p></div><div className="yb-project-list-header-actions">{actions}</div></header>;
}

export function ProjectListToolbar({ query, onQueryChange, placeholder = '搜索项目名称', label = '搜索项目名称', count, disabled, children, inputRef }: {
  query: string; onQueryChange: (query: string) => void; placeholder?: string; label?: string; count: string; disabled?: boolean; children?: ReactNode; inputRef?: Ref<InputRef>;
}) {
  return <EnterpriseUiProvider><div className="yb-project-list-toolbar"><EnterpriseSearchInput ref={inputRef} aria-label={label} placeholder={placeholder} value={query} disabled={disabled} allowClear onChange={event => onQueryChange(event.target.value)} />{children}<span className="yb-project-list-count" role="status">{count}</span></div></EnterpriseUiProvider>;
}

/** 项目索引统一使用同一张表，业务模块仅提供列与已有回调。 */
export function ProjectListTable<T extends object>({ className, pagination, scroll, ...props }: TableProps<T>) {
  return <EnterpriseUiProvider><Table<T> {...props} className={`yb-project-list-table ${className || ''}`} size="middle" rowKey={props.rowKey || 'id'} scroll={scroll || { x: 780 }} pagination={pagination === false ? false : { defaultPageSize: 20, showSizeChanger: false, hideOnSinglePage: true, ...pagination }} /></EnterpriseUiProvider>;
}

const projectTimeFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export function formatProjectListTime(value?: string) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '时间未知' : projectTimeFormatter.format(date);
}

interface ProjectAction { key: string; label: string; danger?: boolean; disabled?: boolean; onClick: () => void }
export function ProjectListActions({ name, onEnter, items, disabled, menuId }: { name: string; onEnter?: () => void; items: ProjectAction[]; disabled?: boolean; menuId?: string }) {
  const [open, setOpen] = useState(false);
  const expanded = open && !disabled;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="yb-project-list-actions" onKeyDownCapture={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    {onEnter && <button type="button" disabled={disabled} onClick={onEnter}>进入项目</button>}
    <Dropdown autoFocus disabled={disabled} open={expanded} onOpenChange={next => setOpen(!disabled && next)} trigger={['click']} menu={{ items: items.map(({ onClick: _onClick, ...item }) => item), onClick: ({ key, domEvent }) => { domEvent.preventDefault(); if (disabled) return; const action = items.find(item => item.key === key); if (!action || action.disabled) return; setOpen(false); trigger.current?.focus({ preventScroll: true }); action.onClick(); } }}>
      <button ref={trigger} type="button" disabled={disabled} data-project-menu-id={menuId} aria-haspopup="menu" aria-expanded={expanded} aria-label={`${name}的更多操作`} onKeyDown={event => { if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setOpen(true); } }}>更多</button>
    </Dropdown>
  </div>;
}


/** 空项目与无搜索结果使用相同层级；入口继续调用各模块原有操作。 */
export function ProjectListEmpty({ subject = '项目', filtered, disabled, onReset, onCreate }: { subject?: string; filtered: boolean; disabled?: boolean; onReset: () => void; onCreate: () => void }) {
  return <EmptyState className="yb-project-list-empty" title={filtered ? '没有匹配的项目' : `暂无可显示的${subject}`} hint={filtered ? '调整关键词，或清空搜索查看项目。' : '新建项目后，即可开始整理资料和生成内容。'}>
    <button type="button" className={filtered ? 'secondary-action' : 'primary-action'} disabled={disabled} onClick={filtered ? onReset : onCreate}>{filtered ? '清空搜索' : '新建项目'}</button>
  </EmptyState>;
}
