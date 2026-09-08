import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SectionId } from '../../../shared/types/navigation';
import type { PatentApplicationType, PatentWorkspaceProject, PatentWorkspaceProjectList } from '../types';
import '../patentGeneration.css';

interface Props { onNavigate: (section: SectionId) => void }

const stageLabel: Record<string, string> = {
  setup: '待准备', mining: '专利挖掘', disclosure: '交底书', 'prior-art': '查新增强', iteration: '修订迭代',
};
const typeLabel: Record<PatentApplicationType, string> = {
  invention: '发明', 'utility-model': '实用新型', design: '外观设计', unknown: '待确认',
};

function PatentProjectsPage({ onNavigate }: Props) {
  const { showToast } = useToast();
  const [data, setData] = useState<PatentWorkspaceProjectList>({ activeProjectId: '', projects: [] });
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'create' | 'rename'; project?: PatentWorkspaceProject } | null>(null);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [applicationType, setApplicationType] = useState<PatentApplicationType>('invention');
  const [deleteTarget, setDeleteTarget] = useState<PatentWorkspaceProject | null>(null);
  const [busy, setBusy] = useState('');
  const loadErrorShown = useRef(false);

  async function refresh() {
    const api = window.yibiao?.patentGeneration;
    if (!api?.listProjects) throw new Error('专利项目服务尚未加载，请完全退出开发窗口后重新运行 npm run dev');
    const result = await api.listProjects();
    if (result) setData(result);
  }

  useEffect(() => {
    refresh().catch((error) => {
      if (loadErrorShown.current) return;
      loadErrorShown.current = true;
      showToast(error instanceof Error ? error.message : '读取专利项目失败', 'error');
    }).finally(() => setLoading(false));
  }, [showToast]);

  const visible = useMemo(() => data.projects.filter((project) => {
    if (!showArchived && project.archived) return false;
    const needle = keyword.trim().toLowerCase();
    return !needle || [project.name, project.caseName, project.topic, project.selectedPatentTitle].some((value) => value.toLowerCase().includes(needle));
  }), [data.projects, keyword, showArchived]);

  async function enter(project: PatentWorkspaceProject) {
    setBusy(project.id);
    try {
      await window.yibiao?.patentGeneration.switchProject(project.id);
      onNavigate('patent-mining');
    } catch (error) { showToast(error instanceof Error ? error.message : '进入专利项目失败', 'error'); }
    finally { setBusy(''); }
  }

  async function submit() {
    if (!editor || !name.trim()) return;
    setBusy(editor.project?.id || 'new');
    try {
      if (editor.mode === 'create') {
        const api = window.yibiao?.patentGeneration;
        if (!api?.createProject) throw new Error('专利项目服务尚未加载，请完全退出开发窗口后重新运行 npm run dev');
        const result = await api.createProject({ name: name.trim(), caseName: name.trim(), topic: topic.trim(), applicationType });
        if (!result?.project?.id) throw new Error('专利项目创建失败，请重新启动客户端后再试');
        showToast('专利项目已创建', 'success');
        onNavigate('patent-mining');
      } else if (editor.project) {
        const result = await window.yibiao?.patentGeneration.renameProject({ id: editor.project.id, name: name.trim() });
        if (result) setData(result);
        showToast('项目名称已更新', 'success');
      }
      setEditor(null);
    } catch (error) { showToast(error instanceof Error ? error.message : '项目操作失败', 'error'); }
    finally { setBusy(''); }
  }

  async function toggleArchive(project: PatentWorkspaceProject) {
    setBusy(project.id);
    try {
      const result = await window.yibiao?.patentGeneration.archiveProject({ id: project.id, archived: !project.archived });
      if (result) setData(result);
      showToast(project.archived ? '项目已恢复' : '项目已归档', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '项目操作失败', 'error'); }
    finally { setBusy(''); }
  }

  async function removeProject() {
    if (!deleteTarget) return;
    setBusy(deleteTarget.id);
    try {
      const result = await window.yibiao?.patentGeneration.deleteProject(deleteTarget.id);
      if (result) setData(result);
      setDeleteTarget(null);
      showToast('专利项目已删除', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '删除专利项目失败', 'error'); }
    finally { setBusy(''); }
  }

  const activeCount = data.projects.filter((item) => !item.archived).length;
  const draftCount = data.projects.reduce((sum, item) => sum + item.draftCount, 0);

  return <main className="patent-projects-page">
    <header className="patent-projects-header">
      <div><span>专利生成</span><h1>专利项目</h1><p>每个项目独立保存案件资料、候选专利点、交底书和修订版本。</p></div>
      <button className="patent-projects-primary" onClick={() => { setName(''); setTopic(''); setApplicationType('invention'); setEditor({ mode: 'create' }); }}>＋ 创建专利项目</button>
    </header>
    <section className="patent-projects-toolbar">
      <div className="patent-projects-stats"><strong>{activeCount}</strong><span>进行中的项目</span><strong>{draftCount}</strong><span>交底书草稿</span></div>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目、案件或技术主题" aria-label="搜索专利项目" />
      <label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />显示已归档</label>
    </section>
    <section className="patent-projects-grid">
      {loading ? <div className="patent-projects-empty">正在读取专利项目…</div> : visible.map((project) => <article className={`patent-project-card${project.id === data.activeProjectId ? ' is-active' : ''}${project.archived ? ' is-archived' : ''}`} key={project.id}>
        <div className="patent-project-card-top"><span>{typeLabel[project.applicationType]}</span><small>{stageLabel[project.stage]}</small></div>
        <h2>{project.name}</h2>
        <p>{project.topic || project.selectedPatentTitle || '尚未填写技术主题，进入项目后即可完善。'}</p>
        <div className="patent-project-card-metrics"><span><strong>{project.candidateCount}</strong> 候选专利点</span><span><strong>{project.draftCount}</strong> 交底书版本</span></div>
        <time>更新于 {new Date(project.updated_at).toLocaleString('zh-CN', { hour12: false })}</time>
        <div className="patent-project-card-actions">
          {!project.archived && <button className="is-enter" disabled={busy === project.id} onClick={() => enter(project)}>{busy === project.id ? '处理中…' : '进入项目'}</button>}
          <button onClick={() => { setName(project.name); setEditor({ mode: 'rename', project }); }}>重命名</button>
          <button onClick={() => toggleArchive(project)}>{project.archived ? '恢复' : '归档'}</button>
          <button className="is-danger" onClick={() => setDeleteTarget(project)}>删除</button>
        </div>
      </article>)}
      {!loading && visible.length === 0 && <div className="patent-projects-empty"><strong>{data.projects.length ? '没有符合条件的项目' : '从一个专利项目开始'}</strong><span>创建后，专利挖掘到交底书修订的全部资料都会归入该项目。</span><button onClick={() => { setName(''); setTopic(''); setApplicationType('invention'); setEditor({ mode: 'create' }); }}>创建专利项目</button></div>}
    </section>

    <Dialog.Root open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}><Dialog.Portal><Dialog.Overlay className="patent-project-dialog-overlay" /><Dialog.Content className="patent-project-dialog">
      <Dialog.Title>{editor?.mode === 'rename' ? '重命名项目' : '创建专利项目'}</Dialog.Title>
      <Dialog.Description>{editor?.mode === 'rename' ? '项目内的案件资料不会改变。' : '先建立项目，再进入专利挖掘及后续步骤。'}</Dialog.Description>
      <label>项目名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：无限画布并行生成专利" /></label>
      {editor?.mode === 'create' && <><label>技术主题（可稍后填写）<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="用一句话描述核心技术" /></label><label>申请类型<select value={applicationType} onChange={(event) => setApplicationType(event.target.value as PatentApplicationType)}><option value="invention">发明</option><option value="utility-model">实用新型</option><option value="design">外观设计</option></select></label></>}
      <div className="patent-project-dialog-actions"><Dialog.Close asChild><button>取消</button></Dialog.Close><button className="is-primary" disabled={!name.trim() || Boolean(busy)} onClick={submit}>{editor?.mode === 'rename' ? '保存名称' : '创建并进入'}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>

    <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><Dialog.Portal><Dialog.Overlay className="patent-project-dialog-overlay" /><Dialog.Content className="patent-project-dialog">
      <Dialog.Title>删除专利项目？</Dialog.Title><Dialog.Description>“{deleteTarget?.name}”的案件资料、交底书和修订记录将一并删除，此操作无法撤销。</Dialog.Description>
      <div className="patent-project-dialog-actions"><Dialog.Close asChild><button>取消</button></Dialog.Close><button className="is-danger" onClick={removeProject}>确认删除</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </main>;
}

export default PatentProjectsPage;
