import ProjectDetailsDrawer from '../../../shared/ui/ProjectDetailsDrawer';
import { ProjectListTable, ProjectListToolbar, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import useListTableViewport from '../../../shared/ui/useListTableViewport';
import type { ColumnsType } from 'antd/es/table';
import { useLayoutEffect, useState, type RefObject } from 'react';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import { FEASIBILITY_STEPS, type FeasibilityProjectRecord } from '../types';

interface Props {
  projects: FeasibilityProjectRecord[];
  query: string;
  page: number;
  sortOrder: 'ascend' | 'descend' | null;
  loading: boolean;
  error: string;
  disabled: boolean;
  active: boolean;
  scrollPosition: RefObject<number>;
  onQueryChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onSortChange: (value: 'ascend' | 'descend' | null) => void;
  onEnter: (project: FeasibilityProjectRecord) => void;
  onRename: (project: FeasibilityProjectRecord) => void;
  onDelete: (project: FeasibilityProjectRecord) => void;
  onCreate: () => void;
}

export default function FeasibilityProjectTable({ projects, query, page, sortOrder, loading, error, disabled, active, scrollPosition, onQueryChange, onPageChange, onSortChange, onEnter, onRename, onDelete, onCreate }: Props) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = projects.find(project => project.id === detailId);
  const filtered = projects.filter(project => project.name.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN')));
  const { scrollRef, currentPage } = useListTableViewport({ page, total: filtered.length, resetKey: JSON.stringify([query, sortOrder]), onPageChange, scrollPosition });
  useLayoutEffect(() => { if (active && !loading && scrollRef.current) scrollRef.current.scrollTop = scrollPosition.current; }, [active, loading, projects, scrollPosition]);
  // 菜单操作先阻止原 Enter 的默认激活，再回焦来源，供确认框记录稳定的返回位置。
  const columns: ColumnsType<FeasibilityProjectRecord> = [
    { title: '项目名称', dataIndex: 'name', render: (name: string, project) => <div className="yb-project-list-name"><button type="button" className="feasibility-project-title" data-project-id={project.id} disabled={disabled} onClick={() => setDetailId(project.id)}>{name}</button></div> },
    { title: '当前步骤', dataIndex: 'step', width: 130, render: step => FEASIBILITY_STEPS.find(item => item.id === step)?.label || '项目资料' },
    { title: '正文小节', width: 120, render: (_, project) => project.contentTotal ? `${project.contentCompleted || 0} / ${project.contentTotal}` : '尚未生成' },
    { title: '最近更新', dataIndex: 'updated_at', width: 180, sorter: (a, b) => a.updated_at.localeCompare(b.updated_at), sortOrder, render: formatProjectListTime },
    { title: '操作', width: 180, fixed: 'right', render: (_, project) => <ProjectListActions name={project.name} menuId={project.id} disabled={disabled} onEnter={() => onEnter(project)} items={[{ key: 'rename', label: '重命名', onClick: () => onRename(project) }, { key: 'delete', label: '删除项目', danger: true, onClick: () => onDelete(project) }]} /> },
  ];
  return <EnterpriseUiProvider><div className="feasibility-project-table">
    <ProjectListToolbar query={query} onQueryChange={value => { onQueryChange(value); onPageChange(1); }} count={error && !projects.length ? '项目尚未读取' : loading && !projects.length ? '正在读取项目' : `${filtered.length} / ${projects.length} 个项目`} />
    <div ref={scrollRef} tabIndex={-1} role="region" aria-label="可研项目列表" className="feasibility-project-table-scroll" onScroll={event => { scrollPosition.current = event.currentTarget.scrollTop; }}><ProjectListTable rowKey="id" loading={loading} columns={columns} dataSource={filtered} size="middle" scroll={{ x: 860 }} onChange={(_, __, sorter, extra) => { if (extra.action === 'sort' && !Array.isArray(sorter)) { onSortChange(sorter.order || null); onPageChange(1); } }} pagination={{ current: currentPage, pageSize: 20, onChange: onPageChange, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: <div className="feasibility-project-empty"><strong>{error ? '项目列表未能读取' : query.trim() ? '没有匹配的可研项目' : '还没有可研项目'}</strong>{!error && <button type="button" disabled={disabled} onClick={query.trim() ? () => { onQueryChange(''); onPageChange(1); } : onCreate}>{query.trim() ? '清除搜索' : '新建可研项目'}</button>}</div> }} /></div>
    <ProjectDetailsDrawer open={Boolean(detail)} onClose={() => setDetailId(null)} enterDisabled={disabled}
      onEnter={detail ? () => { setDetailId(null); onEnter(detail); } : undefined} items={detail ? [
        { key: 'name', label: '项目名称', children: detail.name },
        { key: 'stage', label: '当前步骤', children: FEASIBILITY_STEPS.find(item => item.id === detail.step)?.label || '项目资料' },
        { key: 'content', label: '正文小节', children: detail.contentTotal ? `${detail.contentCompleted || 0} / ${detail.contentTotal}` : '尚未生成' },
        { key: 'created', label: '创建时间', children: formatProjectListTime(detail.created_at) },
        { key: 'updated', label: '更新时间', children: formatProjectListTime(detail.updated_at) },
      ] : []} />
  </div></EnterpriseUiProvider>;
}
