import * as Dialog from '@radix-ui/react-dialog';
import type { TechnicalPlanProject } from '../types';
import { projectNameInitials } from '../../../shared/utils/projectNameInitials';

interface Props {
  workflowTitle: string;
  projects: TechnicalPlanProject[];
  filteredProjects: TechnicalPlanProject[];
  loading: boolean;
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
  pendingDeleteProjectId: string;
  onDelete: (project: TechnicalPlanProject) => void;
  onEnter: (project: TechnicalPlanProject) => void;
}

export default function ModernTechnicalProjects(props: Props) {
  const { workflowTitle, projects, filteredProjects, loading, keyword, onKeywordChange, onCreateOpenChange,
    createOpen, newProjectName, onNewProjectNameChange, onCreate, editingProjectId, editingProjectName,
    onEditingProjectNameChange, onStartRename, onCancelRename, onRename, pendingDeleteProjectId, onDelete, onEnter } = props;
  const hasSearch = keyword.trim().length > 0;

  return (
    <div className="modern-project-workspace modern-technical-projects">
      <header className="modern-technical-head">
        <div><span>PROJECTS / {workflowTitle}</span><h1>{workflowTitle}</h1><p>招标文件、目录和正文按项目独立保存在本地工作区。</p></div>
        <button type="button" onClick={() => onCreateOpenChange(true)}>＋ 创建新项目</button>
      </header>
      <div className="modern-technical-overview">
        <div><span>本地项目</span><strong>{projects.length}</strong></div>
        <label><span>查找项目</span><input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索项目名称、历史项目或创建时间" aria-label="搜索项目" /></label>
        <small>{hasSearch ? `找到 ${filteredProjects.length} 个` : `当前显示 ${filteredProjects.length} 个`}</small>
      </div>
      <section className="modern-technical-list" aria-label={`${workflowTitle}项目列表`}>
            {loading && <p className="modern-project-empty">正在读取项目...</p>}
            {!loading && !projects.length && <p className="modern-project-empty">暂无项目。点击“创建新项目”开始。</p>}
            {!loading && projects.length > 0 && !filteredProjects.length && <p className="modern-project-empty">没有匹配的项目，换个关键词试试。</p>}
            {!loading && filteredProjects.map((project) => (
              <article className={project.isActive ? 'is-active' : ''} key={project.id}>
                <div className="modern-technical-project-mark">{projectNameInitials(project.name)}</div>
                <div className="modern-technical-project-body">
                  {editingProjectId === project.id
                    ? <input value={editingProjectName} onChange={(event) => onEditingProjectNameChange(event.target.value)} aria-label="编辑项目名称" />
                    : <strong>{project.name}</strong>}
                  <span>{project.id === 'default' ? '历史项目 · 承接旧版项目数据' : '独立项目 · 招标文件、目录与正文'}</span>
                  <small>更新于 {new Date(project.updated_at).toLocaleString('zh-CN', { hour12: false })}{project.isActive ? ' · 当前项目' : ''}</small>
                </div>
                <div className="modern-technical-project-actions">
                  {editingProjectId === project.id ? <><button type="button" onClick={() => onRename(project)}>保存</button><button type="button" onClick={onCancelRename}>取消</button></> : <button type="button" onClick={() => onStartRename(project)}>重命名</button>}
                  {project.id !== 'default' && <button type="button" className="is-danger" onClick={() => onDelete(project)}>{pendingDeleteProjectId === project.id ? '确认删除' : '删除'}</button>}
                  <button type="button" className="is-primary" onClick={() => onEnter(project)}>进入工作区 →</button>
                </div>
              </article>
            ))}
      </section>
      <Dialog.Root open={createOpen} onOpenChange={onCreateOpenChange}>
        <Dialog.Portal><Dialog.Overlay className="content-regenerate-modal" /><Dialog.Content className="modern-project-create-dialog">
          <form onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
            <span>NEW PROJECT / {workflowTitle}</span><Dialog.Title>创建项目</Dialog.Title>
            <Dialog.Description>创建后进入独立工作区，文件、解析结果、目录和正文都会保存在此项目中。</Dialog.Description>
            <label>项目名称<input value={newProjectName} onChange={(event) => onNewProjectNameChange(event.target.value)} placeholder="例如：某某系统建设项目" autoFocus /></label>
            <div><Dialog.Close type="button" onClick={() => onNewProjectNameChange('')}>取消</Dialog.Close><button type="submit">确认创建</button></div>
          </form>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
