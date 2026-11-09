import { ProjectListHeader, ProjectListToolbar, ProjectListTable, ProjectListActions, formatProjectListTime } from '../../../shared/ui/ProjectList';
import BusinessTaskProgress from '../../../shared/ui/BusinessTaskProgress';
import type {
  ProjectManagementProfile,
  ProjectManagementProjectRecord,
  ProjectManagementState,
} from '../types';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import {
  formatProjectManagementTime,
  type ProjectManagementExportProgress,
  type ProjectManagementModule,
} from '../model/projectManagementPageModel';

interface ProjectManagementListViewProps {
  projects: ProjectManagementProjectRecord[];
  totalCount: number;
  keyword: string;
  selectedProjectIds: string[];
  isRunning: boolean;
  setKeyword: (value: string) => void;
  onCreateProject: () => void;
  onToggleAll: (checked: boolean) => void;
  onToggleProject: (projectId: string) => void;
  onDeleteSelected: () => void | Promise<unknown>;
  onDeleteProject: (projectId: string) => void | Promise<unknown>;
  onEnterProject: (projectId: string) => void | Promise<unknown>;
}

export function ProjectManagementListView({
  projects,
  totalCount,
  keyword,
  selectedProjectIds,
  isRunning,
  setKeyword,
  onCreateProject,
  onToggleAll,
  onToggleProject,
  onDeleteSelected,
  onDeleteProject,
  onEnterProject,
}: ProjectManagementListViewProps) {
  const allVisibleSelected = projects.length > 0 && selectedProjectIds.length === projects.length;
  const hasKeyword = Boolean(keyword.trim());

  if (getStoredUiAppearance() === 'modern') {
    return <section className="modern-pm-list">
      <ProjectListHeader title="项目管理" description="建立项目档案，按阶段推进工作成果。" actions={<button type="button" className="primary-action" onClick={onCreateProject} disabled={isRunning}>新建项目</button>} />
      <ProjectListToolbar query={keyword} onQueryChange={setKeyword} placeholder="搜索名称、客户、类型或分组" count={`${projects.length} / ${totalCount} 个项目`} />
      <div className="modern-pm-list-toolbar"><label><input type="checkbox" checked={allVisibleSelected} onChange={(event) => onToggleAll(event.target.checked)} />选择当前列表</label><span>显示 {projects.length} 个 · 已选择 {selectedProjectIds.length} 个</span><button type="button" onClick={() => void onDeleteSelected()} disabled={!selectedProjectIds.length || isRunning}>删除所选</button></div>
      <div className="yb-project-index-body"><ProjectListTable<ProjectManagementProjectRecord> dataSource={projects} columns={[
        { title: '选择', width: 60, render: (_, project) => <input type="checkbox" aria-label={`选择${project.name}`} checked={selectedProjectIds.includes(project.id)} onChange={() => onToggleProject(project.id)} /> },
        { title: '项目名称', render: (_, project) => <div className="yb-project-list-name"><button type="button" disabled={isRunning} onClick={() => void onEnterProject(project.id)}>{project.name}</button><small>{project.clientName || '客户待确认'} · {project.projectType || '类型待确认'}{project.isActive ? ' · 当前项目' : ''}</small><small>{project.projectGroup || '未分组'} · 交付方：{project.vendorName || '待确认'}</small></div> },
        { title: '阶段完成', width: 100, render: (_, project) => `${project.completedCount} / 10` },
        { title: '最近更新', dataIndex: 'updated_at', width: 180, defaultSortOrder: 'descend', sorter: (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at), render: formatProjectListTime },
        { title: '操作', width: 180, fixed: 'right', render: (_, project) => <ProjectListActions name={project.name} disabled={isRunning} onEnter={() => void onEnterProject(project.id)} items={[{ key: 'delete', label: '删除项目', danger: true, onClick: () => void onDeleteProject(project.id) }]} /> },
      ]} locale={{ emptyText: <div className="modern-pm-list-empty"><strong>{hasKeyword ? '没有找到匹配项目' : '暂无可管理项目'}</strong><button className={hasKeyword ? 'secondary-action' : 'primary-action'} type="button" onClick={hasKeyword ? () => setKeyword('') : onCreateProject}>{hasKeyword ? '清空搜索' : '新建项目'}</button></div> }} /></div>
    </section>;
  }

  return (
    <section className="project-management-list-panel">
      <div className="project-management-list-head">
        <div>
          <span className="section-kicker">项目列表</span>
          <h3>选择一个项目继续推进，或创建新的项目</h3>
          <p>项目管理负责创建、进入、删除和继续编辑；项目历史只做归档查看和阶段预览。</p>
        </div>
        <button type="button" className="primary-action create-action" onClick={onCreateProject} disabled={isRunning}>创建项目</button>
      </div>
      <div className="project-management-searchbar">
        <label>
          <span>检索项目</span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索项目名称、客户、交付方、阶段、项目类型或分组"
          />
        </label>
        <small>共 {projects.length}/{totalCount} 个项目</small>
      </div>
      <div className="project-management-bulkbar">
        <label>
          <input type="checkbox" checked={allVisibleSelected} onChange={(event) => onToggleAll(event.target.checked)} />
          全选当前列表
        </label>
        <span>已选择 {selectedProjectIds.length} 个项目</span>
        <button type="button" className="secondary-action danger-action" onClick={() => void onDeleteSelected()} disabled={!selectedProjectIds.length || isRunning}>删除所选</button>
      </div>
      {!projects.length ? (
        <div className="project-management-list-empty">
          <strong>{hasKeyword ? '没有找到匹配项目' : '暂无可管理项目'}</strong>
          <p>{hasKeyword ? '换个关键词试试，或清空检索条件查看全部项目。' : '点击创建项目后，即可进入 10 个阶段的项目管理工作台。'}</p>
          {hasKeyword ? (
            <button type="button" className="secondary-action" onClick={() => setKeyword('')}>清空检索</button>
          ) : (
            <button type="button" className="secondary-action create-action" onClick={onCreateProject}>创建项目</button>
          )}
        </div>
      ) : (
        <div className="project-management-project-grid">
          {projects.map((project) => (
            <article key={project.id} className={`project-management-project-card${project.isActive ? ' is-active' : ''}`}>
              <div className="project-management-project-select">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.includes(project.id)}
                    onChange={() => onToggleProject(project.id)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  选择
                </label>
                <button type="button" className="secondary-action danger-action" onClick={() => void onDeleteProject(project.id)} disabled={isRunning}>删除</button>
              </div>
              <button type="button" className="project-management-project-card-main" onClick={() => void onEnterProject(project.id)}>
                <span className="section-kicker">{project.isActive ? '当前项目' : '本地项目'}</span>
                <h3>{project.name}</h3>
                <p>{project.clientName || '客户待确认'} · {project.projectType || '项目类型待确认'}</p>
                <div className="project-management-project-tags">
                  <span>当前阶段：{project.currentStage || '待确认'}</span>
                  <span>类型：{project.projectType || '项目类型待确认'}</span>
                  <span>分组：{project.projectGroup || '未分组'}</span>
                  <span>交付方：{project.vendorName || '待确认'}</span>
                  <span>更新：{formatProjectManagementTime(project.updated_at)}</span>
                </div>
              </button>
              <div className="project-management-project-card-foot">
                <div>
                  <strong>{project.completedCount}/10</strong>
                  <span>阶段完成</span>
                </div>
                <button type="button" className="secondary-action" onClick={() => void onEnterProject(project.id)}>进入项目</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface ProjectManagementProjectBarProps {
  profile: ProjectManagementProfile;
  hasProject: boolean;
  isRunning: boolean;
  draftDirty?: boolean;
  onBack: () => void;
  onDelete: () => void;
}

export function ProjectManagementProjectBar({ profile, hasProject, isRunning, draftDirty, onBack, onDelete }: ProjectManagementProjectBarProps) {
  return (
    <section className="project-management-projectbar">
      <button type="button" className="secondary-action" onClick={onBack} disabled={isRunning}>返回项目列表</button>
      <div>
        <span className="section-kicker">当前项目</span>
        <strong>{profile.projectName || '未命名项目'}</strong>
        <small>{profile.clientName || '客户待确认'} · {profile.projectType || '项目类型待确认'}</small>
      </div>
      <div className="project-management-projectbar-actions">
        {draftDirty && <span className="modern-pm-draft-status" role="status">有未保存修改</span>}
        <button type="button" className="secondary-action danger-action" onClick={onDelete} disabled={isRunning || !hasProject}>删除项目</button>
      </div>
    </section>
  );
}

interface ProjectManagementFlowNavigationProps {
  modules: ProjectManagementModule[];
  activeModule: ProjectManagementModule;
  suggestedModule?: ProjectManagementModule;
  completedModuleIds: Set<string>;
  completedCount: number;
  currentModuleDone: boolean;
  isRunning: boolean;
  exporting: boolean;
  exportProgress?: ProjectManagementExportProgress | null;
  onSelectModule: (moduleId: string) => void;
  onExportAll: () => void | Promise<unknown>;
}

export function ProjectManagementFlowNavigation({
  modules,
  activeModule,
  suggestedModule,
  completedModuleIds,
  completedCount,
  currentModuleDone,
  isRunning,
  exporting,
  exportProgress,
  onSelectModule,
  onExportAll,
}: ProjectManagementFlowNavigationProps) {
  if (getStoredUiAppearance() === 'modern') return <aside className="modern-pm-flow">
    <div className="modern-pm-flow-head"><span>PROJECT / FLOW</span><strong>工作阶段</strong><small>{completedCount} / {modules.length} 已完成</small></div>
    <nav aria-label="项目管理阶段">{modules.map((module, index) => { const done = completedModuleIds.has(module.id); return <button key={module.id} type="button" className={module.id === activeModule.id ? 'is-active' : ''} title={module.title} onClick={() => onSelectModule(module.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{module.label}</strong><small>{done ? '✓' : suggestedModule?.id === module.id ? '下一步' : '›'}</small></button>; })}</nav>
    <div className="modern-pm-flow-foot"><p>{suggestedModule ? currentModuleDone ? `建议下一步：${suggestedModule.label}` : `当前建议：先完成${suggestedModule.label}` : '所有阶段已完成'}</p>{exportProgress && <BusinessTaskProgress label={exportProgress.message} percent={exportProgress.progress} status={exportProgress.phase === 'error' ? 'exception' : exportProgress.phase === 'success' ? 'success' : 'active'} />}<button type="button" onClick={() => void onExportAll()} disabled={isRunning || exporting || completedCount === 0}>{exporting ? '导出中...' : '导出全套 Word'}</button></div>
  </aside>;
  return (
    <>
      <div className="project-management-flow-head">
        <div>
          <span className="section-kicker">项目流程</span>
          <strong>已完成 {completedCount}/{modules.length} 个模块</strong>
          <small>
            {suggestedModule
              ? currentModuleDone
                ? `建议下一步：${suggestedModule.label}`
                : `当前建议：先完成${suggestedModule.label}`
              : '10 个模块已全部生成，可进入复盘、导出和归档。'}
          </small>
        </div>
        <div className="project-management-flow-actions">
          <button type="button" className="secondary-action" onClick={() => void onExportAll()} disabled={isRunning || exporting || completedCount === 0}>
            {exporting && exportProgress?.moduleId === 'all' ? '导出中...' : '导出全套 Word'}
          </button>
        </div>
      </div>
      {exportProgress && (
        <div className={`project-management-export is-${exportProgress.phase}`}>
          <span>{exportProgress.message}</span>
          <BusinessTaskProgress label="Word 导出" percent={exportProgress.progress} status={exportProgress.phase === 'error' ? 'exception' : exportProgress.phase === 'success' ? 'success' : 'active'} />
        </div>
      )}
      <nav className="project-management-tabs" aria-label="项目管理二级模块">
        {modules.map((module, index) => {
          const isDone = completedModuleIds.has(module.id);
          const isSuggested = suggestedModule?.id === module.id;
          return (
            <button
              key={module.id}
              type="button"
              className={`${module.id === activeModule.id ? 'is-active' : ''}${isDone ? ' is-done' : ''}${isSuggested ? ' is-suggested' : ''}`}
              onClick={() => onSelectModule(module.id)}
              title={module.title}
            >
              <span>{module.label}</span>
              <small>{isDone ? '已生成' : isSuggested ? '下一步' : `${index + 1}`}</small>
            </button>
          );
        })}
      </nav>
    </>
  );
}

interface ProjectManagementSidebarProps {
  profile: ProjectManagementProfile;
  state: ProjectManagementState | null;
  activeModule: ProjectManagementModule;
  suggestedModule?: ProjectManagementModule;
  currentModuleDone: boolean;
  completedCount: number;
  moduleCount: number;
  isRunning: boolean;
  onSelectModule: (moduleId: string) => void;
  onClear: () => void | Promise<unknown>;
}

export function ProjectManagementSidebar({
  profile,
  state,
  activeModule,
  suggestedModule,
  currentModuleDone,
  completedCount,
  moduleCount,
  isRunning,
  onSelectModule,
  onClear,
}: ProjectManagementSidebarProps) {
  return (
    <aside className="project-management-side">
      <span className="section-kicker">工作区状态</span>
      <h3>{profile.projectName || '未命名项目'}</h3>
      <p>10 个模块共用同一份项目上下文，前面模块生成的结果会作为后续模块的参考材料。</p>
      {suggestedModule && (
        <div className="project-management-next-card">
          <span>{currentModuleDone ? '建议下一步' : '当前重点'}</span>
          <strong>{suggestedModule.label}</strong>
          <p>{suggestedModule.promptHint}</p>
          {suggestedModule.id !== activeModule.id && (
            <button type="button" className="secondary-action" onClick={() => onSelectModule(suggestedModule.id)}>
              前往{suggestedModule.label}
            </button>
          )}
        </div>
      )}
      <div className="project-management-roadmap">
        <span>模块进度：{completedCount}/{moduleCount}</span>
        <span>当前阶段：{profile.currentStage || '待确认'}</span>
        <span>客户：{profile.clientName || '待确认'}</span>
        <span>交付方：{profile.vendorName || '待确认'}</span>
        <span>更新时间：{state?.updated_at ? new Date(state.updated_at).toLocaleString() : '暂无'}</span>
      </div>
      <button type="button" className="secondary-action project-management-clear" onClick={() => void onClear()} disabled={isRunning}>清空工作区</button>
    </aside>
  );
}
