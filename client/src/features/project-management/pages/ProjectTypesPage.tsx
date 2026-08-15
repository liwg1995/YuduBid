import { useEffect, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { ProjectManagementDictionaries } from '../types';
import '../projectManagement.css';

type DictionaryKind = keyof ProjectManagementDictionaries;

const emptyDictionaries: ProjectManagementDictionaries = {
  projectTypes: [],
  projectGroups: [],
};

function ProjectTypesPage() {
  const { showToast } = useToast();
  const [dictionaries, setDictionaries] = useState<ProjectManagementDictionaries>(emptyDictionaries);
  const [drafts, setDrafts] = useState<Record<DictionaryKind, string>>({ projectTypes: '', projectGroups: '' });
  const [collapsed, setCollapsed] = useState<Record<DictionaryKind, boolean>>({ projectTypes: false, projectGroups: false });
  const [editing, setEditing] = useState<{ kind: DictionaryKind; value: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    window.yibiao?.projectManagement.readDictionaries()
      .then((result) => {
        if (alive && result) setDictionaries(result);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取项目类型失败', 'error'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [showToast]);

  async function saveItems(kind: DictionaryKind, items: string[]) {
    const result = await window.yibiao?.projectManagement.saveDictionary({ kind, items });
    if (result) setDictionaries(result);
  }

  async function addItem(kind: DictionaryKind) {
    const value = drafts[kind].trim();
    if (!value) {
      showToast('请先填写名称', 'info');
      return;
    }
    if (dictionaries[kind].includes(value)) {
      showToast('该名称已存在', 'info');
      return;
    }
    try {
      await saveItems(kind, [...dictionaries[kind], value]);
      setDrafts((current) => ({ ...current, [kind]: '' }));
      showToast('已新增', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '新增失败', 'error');
    }
  }

  async function removeItem(kind: DictionaryKind, value: string) {
    try {
      await saveItems(kind, dictionaries[kind].filter((item) => item !== value));
      showToast('已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  }

  async function submitEdit() {
    if (!editing) return;
    const value = editingValue.trim();
    if (!value) {
      showToast('名称不能为空', 'info');
      return;
    }
    const currentItems = dictionaries[editing.kind];
    if (value !== editing.value && currentItems.includes(value)) {
      showToast('该名称已存在', 'info');
      return;
    }
    try {
      await saveItems(editing.kind, currentItems.map((item) => (item === editing.value ? value : item)));
      setEditing(null);
      setEditingValue('');
      showToast('已保存修改', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存修改失败', 'error');
    }
  }

  function renderPanel(kind: DictionaryKind, title: string, description: string, placeholder: string) {
    const isCollapsed = collapsed[kind];
    return (
      <section className="project-dictionary-panel">
        <div className="project-dictionary-panel-head">
          <div>
            <span className="section-kicker">{title}</span>
            <h3>{description}</h3>
          </div>
          <div className="project-dictionary-panel-actions">
            <strong>{dictionaries[kind].length} 项</strong>
            <button type="button" className="secondary-action" onClick={() => setCollapsed((current) => ({ ...current, [kind]: !current[kind] }))}>
              {isCollapsed ? '展开' : '收起'}
            </button>
          </div>
        </div>
        {!isCollapsed ? (
          <>
            <div className="project-dictionary-add">
              <input value={drafts[kind]} onChange={(event) => setDrafts((current) => ({ ...current, [kind]: event.target.value }))} placeholder={placeholder} />
              <button type="button" className="primary-action" onClick={() => void addItem(kind)}>新增</button>
            </div>
            <div className="project-dictionary-list">
              {dictionaries[kind].length ? dictionaries[kind].map((item) => (
                <article key={item}>
                  {editing?.kind === kind && editing.value === item ? (
                    <>
                      <input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
                      <button type="button" className="secondary-action" onClick={() => void submitEdit()}>保存</button>
                      <button type="button" className="secondary-action" onClick={() => setEditing(null)}>取消</button>
                    </>
                  ) : (
                    <>
                      <span>{item}</span>
                      <button type="button" className="secondary-action" onClick={() => { setEditing({ kind, value: item }); setEditingValue(item); }}>编辑</button>
                      <button type="button" className="secondary-action danger-action" onClick={() => void removeItem(kind, item)}>删除</button>
                    </>
                  )}
                </article>
              )) : <p>{kind === 'projectGroups' ? '暂无分组，可按地域、客户类型、业务线等自行创建。' : '暂无项目类型。'}</p>}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  if (loading) {
    return <div className="project-dictionary-page"><section className="project-dictionary-hero">正在读取项目类型...</section></div>;
  }

  return (
    <div className="project-dictionary-page">
      <section className="project-dictionary-hero">
        <div>
          <span className="section-kicker">项目类型</span>
          <h2>管理创建项目时可选的类型和分组</h2>
          <p>项目类型内置常见交付类型；项目分组不预设默认值，可按地域、客户类型、业务线或内部管理口径自行维护。</p>
        </div>
      </section>
      {renderPanel('projectTypes', '项目类型', '用于区分项目交付形态', '例如：数据治理项目')}
      {renderPanel('projectGroups', '项目分组', '完全由用户自定义的项目分类', '例如：华东区域 / 重点客户 / 金融行业')}
    </div>
  );
}

export default ProjectTypesPage;
