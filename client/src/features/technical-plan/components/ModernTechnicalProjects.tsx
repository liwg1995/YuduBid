import { useState } from 'react';
import ProjectDetailsDrawer from '../../../shared/ui/ProjectDetailsDrawer';
import WorkspaceLoadError from '../../../shared/ui/WorkspaceLoadError';
import { ProjectListHeader, ProjectListToolbar, ProjectListTable, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import { AppDialog, EmptyState } from '../../../shared/ui';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import type { TechnicalPlanProject } from '../types';
import './modernTechnicalProjects.css';

interface Props {
  workflowTitle: string;
  projects: TechnicalPlanProject[];
  filteredProjects: TechnicalPlanProject[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  busy: boolean;
  action: string;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onCreateOpenChange: (open: boolean) => void;
  createOpen: boolean;
  newProjectName: string;
  onNewProjectNameChange: (value: string) => void;
  onCreate: () => void;
  editingProjectId: string;
  editingProjectName: string;
  onEditingProjectNameChange: (value: string) => void;
  onStartRename: (project: TechnicalPlanProject) => void;
  onCancelRename: () => void;
  onRename: (project: TechnicalPlanProject) => void;
  onDelete: (project: TechnicalPlanProject) => void;
  onEnter: (project: TechnicalPlanProject) => void;
}

export default function ModernTechnicalProjects(props: Props) {
  const { workflowTitle, projects, filteredProjects, loading, error, onRetry, busy, action, keyword, onKeywordChange,
    onCreateOpenChange, createOpen, newProjectName, onNewProjectNameChange, onCreate, editingProjectId,
    editingProjectName, onEditingProjectNameChange, onStartRename, onCancelRename, onRename, onDelete, onEnter } = props;
  const unavailable = loading || busy;
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = projects.find(project => project.id === detailId);

  return <EnterpriseUiProvider>
    <div className="modern-project-workspace modern-technical-projects">
      <ProjectListHeader title={workflowTitle} description="招标文件、目录和正文按项目独立保存在本地工作区。" actions={<button type="button" className="primary-action" disabled={unavailable} onClick={() => onCreateOpenChange(true)}>新建项目</button>} />
      <ProjectListToolbar query={keyword} onQueryChange={onKeywordChange} label="搜索项目" placeholder="搜索名称、历史项目或创建时间" disabled={Boolean(editingProjectId) || busy} count={loading ? '正在读取项目' : error ? '读取失败' : `${filteredProjects.length} / ${projects.length} 个项目`} />
      <section className="modern-technical-list" aria-label={`${workflowTitle}项目列表`} aria-busy={unavailable}>
        {loading ? <p role="status" className="modern-project-empty">正在读取项目…</p> : error ? <WorkspaceLoadError title="项目读取失败" message={error} onRetry={onRetry} /> : !projects.length ? <EmptyState title="还没有项目" hint="创建项目后即可导入招标文件，开始编写技术方案。"><button type="button" className="primary-action" disabled={busy} onClick={() => onCreateOpenChange(true)}>创建项目</button></EmptyState> : !filteredProjects.length ? <EmptyState title="没有匹配的项目" hint="试试更短的名称，或清空搜索查看全部项目。"><button type="button" className="secondary-action" onClick={() => onKeywordChange('')}>清空搜索</button></EmptyState> : <ProjectListTable<TechnicalPlanProject> dataSource={filteredProjects} columns={[
          { title: '项目名称', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }), render: (_, project) => editingProjectId === project.id ? <form className="technical-project-rename" onSubmit={event => { event.preventDefault(); onRename(project); }}><input autoFocus value={editingProjectName} disabled={busy} onFocus={event => event.currentTarget.select()} onChange={event => onEditingProjectNameChange(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !busy) onCancelRename(); }} aria-label="编辑项目名称" /><button type="submit" disabled={busy || !editingProjectName.trim()}>保存</button><button type="button" disabled={busy} onClick={onCancelRename}>取消</button></form> : <div className="yb-project-list-name"><button type="button" disabled={unavailable || Boolean(editingProjectId)} onClick={() => setDetailId(project.id)}>{project.name}</button><small>{project.id === 'default' ? '历史项目' : '独立项目'}{project.isActive ? ' · 当前项目' : ''}</small></div> },
          { title: '创建时间', dataIndex: 'created_at', width: 180, sorter: (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at), render: formatProjectListTime },
          { title: '最近更新', dataIndex: 'updated_at', width: 180, defaultSortOrder: 'descend', sorter: (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at), render: formatProjectListTime },
          { title: '操作', width: 180, fixed: 'right', render: (_, project) => <ProjectListActions name={project.name} disabled={unavailable || Boolean(editingProjectId)} onEnter={() => onEnter(project)} items={[{ key: 'rename', label: '重命名', onClick: () => onStartRename(project) }, ...(project.id !== 'default' ? [{ key: 'delete', label: '删除项目', danger: true, onClick: () => onDelete(project) }] : [])]} /> },
        ]} />}

      </section>
      <ProjectDetailsDrawer open={Boolean(detail)} onClose={() => setDetailId(null)} enterDisabled={unavailable}
        onEnter={detail ? () => { setDetailId(null); onEnter(detail); } : undefined} items={detail ? [
          { key: 'name', label: '项目名称', children: detail.name },
          { key: 'workflow', label: '所属业务', children: workflowTitle },
          { key: 'kind', label: '项目类型', children: detail.id === 'default' ? '历史项目' : '独立项目' },
          { key: 'active', label: '工作区', children: detail.isActive ? '当前项目' : '其他项目' },
          { key: 'created', label: '创建时间', children: formatProjectListTime(detail.created_at) },
          { key: 'updated', label: '更新时间', children: formatProjectListTime(detail.updated_at) },
        ] : []} />
      <AppDialog open={createOpen} onOpenChange={(open) => { if (action === 'create') return; onCreateOpenChange(open); if (!open) onNewProjectNameChange(''); }} preventClose={action === 'create'} title="创建项目" description="招标文件、解析结果、目录和正文将保存在此项目中。" actions={<><button type="button" className="secondary-action" disabled={busy} onClick={() => { onCreateOpenChange(false); onNewProjectNameChange(''); }}>取消</button><button type="submit" form="technical-project-create-form" className="primary-action" disabled={busy || !newProjectName.trim()}>{action === 'create' ? '创建中…' : '创建项目'}</button></>}>
        <form id="technical-project-create-form" className="technical-project-create-form" onSubmit={(event) => { event.preventDefault(); onCreate(); }}><label>项目名称<input required value={newProjectName} disabled={busy} onChange={(event) => onNewProjectNameChange(event.target.value)} placeholder="例如：某某系统建设项目" /></label></form>
      </AppDialog>
    </div>
  </EnterpriseUiProvider>;
}
