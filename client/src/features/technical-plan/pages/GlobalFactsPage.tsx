import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownEditor, MarkdownRenderer, useAppDialog, useToast } from '../../../shared/ui';
import { ActivityWaiting } from '../../../shared/ui/ActivityWaiting';
import type { OutlineData } from '../../../shared/types';
import type { BackgroundTaskState, GlobalFactGroupState, MissingFactPolicy, TechnicalPlanWorkflowKind } from '../types';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import { handleTabListKeyDown } from '../../../shared/utils/keyboardTabs';
import './modernGlobalFacts.css';

interface GlobalFactsPageProps {
  projectId?: string;
  workflowKind: TechnicalPlanWorkflowKind;
  outlineData: OutlineData | null;
  globalFacts: GlobalFactGroupState[];
  task?: BackgroundTaskState;
  missingFactPolicy?: MissingFactPolicy;
  policyStale?: boolean;
  onGlobalFactsSaved: (globalFacts: GlobalFactGroupState[]) => Promise<void> | void;
  onDraftDirtyChange?: (dirty: boolean) => void;
}

const statusLabels: Record<string, string> = {
  idle: '未开始',
  running: '生成中',
  success: '已完成',
  error: '失败',
};

function createFactId() {
  const randomId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manual_${randomId.replace(/[^a-zA-Z0-9_-]/g, '_')}`.toLowerCase();
}

function formatUpdatedAt(value?: string) {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function getProgress(task: BackgroundTaskState | undefined, hasFacts: boolean) {
  if (task?.status === 'running') return Math.max(5, Math.min(99, task.progress || 5));
  if (task?.status === 'error') return Math.max(0, Math.min(99, task.progress || 0));
  return hasFacts ? 100 : 0;
}

function GlobalFactsPage({ projectId, workflowKind, outlineData, globalFacts, task, missingFactPolicy, policyStale, onGlobalFactsSaved, onDraftDirtyChange }: GlobalFactsPageProps) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(globalFacts[0]?.id || null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressCollapsed, setProgressCollapsed] = useState(false);
  const hasOutline = Boolean(outlineData?.outline?.length);
  const running = starting || task?.status === 'running';
  const taskFailed = task?.status === 'error';
  const activeGroup = globalFacts.find((group) => group.id === selectedGroupId) || globalFacts[0] || null;
  const progress = getProgress(task, globalFacts.length > 0);
  const statusKey = running ? 'running' : taskFailed ? 'error' : globalFacts.length ? 'success' : 'idle';
  const latestLog = task?.logs?.[task.logs.length - 1] || '';
  const totalChars = useMemo(() => globalFacts.reduce((sum, group) => sum + group.content.length, 0), [globalFacts]);
  const pendingGroups = missingFactPolicy === 'placeholder' ? globalFacts.filter((group) => group.content.includes('【待填写】')) : [];
  const dirty = Boolean(activeGroup && (draftTitle !== activeGroup.title || draftContent !== activeGroup.content));
  useEffect(() => { onDraftDirtyChange?.(getStoredUiAppearance() === 'modern' && dirty); }, [dirty, onDraftDirtyChange]);
  useEffect(() => () => { onDraftDirtyChange?.(false); }, [onDraftDirtyChange]);

  const confirmDiscard = useCallback(async () => !dirty || await confirm({ title: '放弃未保存的修改？', description: '当前事实大项的标题或内容尚未保存，继续后这些修改会丢失。' }), [dirty, confirm]);
  const selectGroup = async (groupId: string) => {
    if (groupId === activeGroup?.id) return;
    if (!await confirmDiscard()) {
      document.getElementById(`modern-fact-tab-${activeGroup?.id}`)?.focus();
      return;
    }
    setSelectedGroupId(groupId);
  };

  const startGeneration = useCallback(async () => {
    if (!hasOutline) {
      showToast('请先生成目录，再进行全局事实设定', 'info');
      return;
    }
    if (getStoredUiAppearance() === 'modern' && !await confirmDiscard()) return;

    try {
      setStarting(true);
      await window.yibiao?.tasks.startGlobalFactsGeneration({ workflowKind, projectId });
      showToast('全局事实设定任务已在后台启动', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启动全局事实设定失败', 'error');
    } finally {
      setStarting(false);
    }
  }, [hasOutline, showToast, workflowKind, projectId, confirmDiscard]);

  useEffect(() => {
    if (!globalFacts.length) {
      setSelectedGroupId(null);
      return;
    }

    setSelectedGroupId((prev) => globalFacts.some((group) => group.id === prev) ? prev : globalFacts[0].id);
  }, [globalFacts]);

  useEffect(() => {
    if (!activeGroup) {
      setDraftTitle('');
      setDraftContent('');
      return;
    }

    setDraftTitle(activeGroup.title);
    setDraftContent(activeGroup.content);
  }, [activeGroup?.id, activeGroup?.title, activeGroup?.content]);

  const saveFacts = async (nextFacts: GlobalFactGroupState[], message = '全局事实已保存') => {
    try {
      setSaving(true);
      await onGlobalFactsSaved(nextFacts);
      onDraftDirtyChange?.(false);
      showToast(message, 'success');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存全局事实失败';
      if (message.startsWith('正文正在生成，请先暂停任务，再修改全局事实')) {
        showToast('正文正在生成，请先暂停任务，再修改全局事实。', 'error', {
          title: '修改后需重新编排并生成正文',
          duration: 12000,
        });
      } else {
        showToast(message, 'error');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveActiveGroup = async () => {
    if (!activeGroup) return;
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) {
      showToast('标题和内容不能为空', 'info');
      return;
    }

    await saveFacts(globalFacts.map((group) => (
      group.id === activeGroup.id
        ? { ...group, title, content, updated_at: new Date().toISOString() }
        : group
    )));
  };

  const addFactGroup = async () => {
    if (!await confirmDiscard()) return;
    const nextGroup: GlobalFactGroupState = {
      id: createFactId(),
      title: '新增事实大项',
      content: '- 项目经理：张伟，高级工程师，负责总体协调和质量把关。',
      updated_at: new Date().toISOString(),
    };
    if (await saveFacts([...globalFacts, nextGroup], '已新增事实大项')) setSelectedGroupId(nextGroup.id);
  };

  const deleteActiveGroup = async () => {
    if (!activeGroup) return;
    if (getStoredUiAppearance() === 'modern') {
      if (!await confirmDiscard()) return;
      if (!await confirm({ title: '删除当前事实大项？', description: `“${activeGroup.title}”将从项目事实中移除，已有正文生成缓存也会清空。`, confirmLabel: '确认删除' })) return;
    }
    await saveFacts(globalFacts.filter((group) => group.id !== activeGroup.id), '已删除事实大项');
  };

  const copyActiveGroup = async () => {
    if (!draftContent.trim()) {
      showToast('当前没有可复制的内容', 'info');
      return;
    }
    await navigator.clipboard.writeText(draftContent);
    showToast('全局事实内容已复制', 'success');
  };

  if (getStoredUiAppearance() === 'modern') {
    return <div className="modern-facts-page">
      <header className="modern-facts-overview"><div><span>事实变量工作区</span><h2>统一项目事实</h2><p>提前设定正文反复使用的人员、时间、型号与服务承诺。</p></div><div className="modern-facts-overview-stats"><span><strong>{globalFacts.length}</strong> 个大项</span><span><strong>{totalChars}</strong> 字</span><button type="button" onClick={() => startGeneration()} disabled={running || !hasOutline}>{running ? '生成中...' : globalFacts.length ? '重新解析' : '开始解析'}</button></div></header>
      {(pendingGroups.length > 0 || policyStale) && <div className="modern-facts-notices" role="status">{pendingGroups.length > 0 && <p>有 {pendingGroups.length} 个大项包含【待填写】：{pendingGroups.map((group) => group.title).join('、')}。请补齐并保存。</p>}{policyStale && <p>事实缺失处理方式已变更，请重新解析全局事实后继续。</p>}</div>}
      <div className="modern-facts-layout">
        <aside className="modern-facts-index" aria-label="全局事实大项列表"><header><div><span>FACT GROUPS</span><h3>事实大项</h3></div><small>{statusLabels[statusKey]}</small></header><button type="button" className="modern-facts-progress" onClick={() => setProgressCollapsed((value) => !value)} aria-expanded={!progressCollapsed}><span>设定进度</span><strong>{progress}%</strong><small>{progressCollapsed ? '展开' : '收起'}</small></button>{!progressCollapsed && <div className="modern-facts-progress-detail"><div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="全局事实设定进度"><span style={{ width: `${progress}%` }} /></div><p>{taskFailed ? task?.error || latestLog || '设定失败，请重新解析。' : latestLog || '首次进入本步骤时会自动开始解析。'}</p></div>}
          <nav role="tablist" aria-label="全局事实大项" onKeyDown={handleTabListKeyDown}>{globalFacts.length ? globalFacts.map((group, index) => <button key={group.id} type="button" role="tab" id={`modern-fact-tab-${group.id}`} aria-controls="modern-fact-panel" aria-selected={group.id === activeGroup?.id} tabIndex={group.id === activeGroup?.id ? 0 : -1} className={group.id === activeGroup?.id ? 'is-active' : ''} onClick={() => void selectGroup(group.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{group.title}</strong><small>{group.content.length} 字{group.content.includes('【待填写】') ? ' · 待补充' : ''}</small></button>) : <p>{running ? '正在生成全局事实' : hasOutline ? '等待后台任务返回事实大项。' : '请先完成目录生成。'}</p>}</nav>
          <button type="button" className="modern-facts-add" onClick={addFactGroup} disabled={running || saving}>＋ 新增事实大项</button>
        </aside>
        <section className="modern-facts-detail" role="tabpanel" id="modern-fact-panel" aria-labelledby={activeGroup ? `modern-fact-tab-${activeGroup.id}` : undefined}><header><div><span>编辑与预览</span><h3>{activeGroup?.title || '等待全局事实'}</h3><p>{activeGroup ? '保存修改后会清空旧正文生成缓存。' : '生成完成后，可在这里查看和编辑。'}</p></div><div><button type="button" onClick={copyActiveGroup} disabled={!activeGroup || !draftContent}>复制</button><button type="button" className="is-danger" onClick={deleteActiveGroup} disabled={!activeGroup || running || saving}>删除</button><button type="button" className="is-primary" onClick={saveActiveGroup} disabled={!activeGroup || !dirty || running || saving}>{saving ? '保存中...' : '保存修改'}</button></div></header>
          {activeGroup ? <div className="modern-facts-editor-layout"><div className="modern-facts-editor"><label>大项标题<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={running || saving} /></label><MarkdownEditor value={draftContent} onChange={setDraftContent} disabled={running || saving} placeholder="填写后续正文需要统一使用的事实变量..." /></div><div className="modern-facts-preview"><div>实时预览 <span>{dirty ? '尚未保存' : formatUpdatedAt(activeGroup.updated_at)}</span></div><div className="markdown-viewer">{draftContent.trim() ? <MarkdownRenderer allowRawHtml={false}>{draftContent}</MarkdownRenderer> : <p>暂无预览内容</p>}</div></div></div> : running ? <ActivityWaiting title="正在生成全局事实" description="正在整理正文需要统一使用的项目事实，完成后将在这里显示。" progress={progress} /> : <div className="modern-facts-empty"><strong>{hasOutline ? '等待全局事实生成' : '请先生成目录'}</strong><p>{hasOutline ? 'AI 会基于目录生成需要反复使用的事实变量。' : '目录生成完成后，本步骤会自动开始。'}</p></div>}
        </section>
      </div>
    </div>;
  }

  return (
    <div className="plan-step-body global-facts-page">
      <section className="global-facts-command-bar">
        <div>
          <span className="section-kicker">STEP 05</span>
          <strong>全局事实设定</strong>
          <p>基于目录提前预设正文会反复用到的事实变量，避免各小节随机生成人员、时间、型号等内容。</p>
          {pendingGroups.length > 0 && <div className="global-facts-pending" role="status">还有 {pendingGroups.length} 个事实大项包含【待填写】。请逐项核对并保存，补齐后才能进入正文生成：{pendingGroups.map((group) => group.title).join('、')}。</div>}
          {policyStale && <div className="global-facts-pending" role="status">事实缺失处理方式已变更，请重新解析全局事实后继续。</div>}
        </div>
        <div className="global-facts-stats">
          <span><strong>{globalFacts.length}</strong> 个大项</span>
          <span><strong>{totalChars}</strong> 字</span>
        </div>
        <button type="button" className="primary-action" onClick={() => startGeneration()} disabled={running || !hasOutline}>
          {running ? '生成中...' : globalFacts.length ? '重新解析' : '开始解析'}
        </button>
      </section>

      <section className="global-facts-workspace">
        <aside className="global-facts-panel" aria-label="全局事实大项列表">
          <div className="analysis-result-head global-facts-panel-head">
            <strong>事实大项</strong>
            <span className={`content-status-badge is-${statusKey}`}>{statusLabels[statusKey]}</span>
          </div>
          <div className={`content-outline-stats global-facts-progress${progressCollapsed ? ' is-collapsed' : ''}`}>
            <button type="button" onClick={() => setProgressCollapsed((prev) => !prev)} aria-expanded={!progressCollapsed}>
              <span>设定进度</span>
              <strong>{progress}%</strong>
              <em>{progressCollapsed ? '展开' : '折叠'}</em>
            </button>
            {!progressCollapsed && (
              <div className="content-outline-stats-body">
                <div className={`content-generation-progress-track${running ? ' is-active' : ''}`} aria-label={`全局事实设定进度 ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p>{taskFailed ? task?.error || latestLog || '全局事实设定失败，请重新解析。' : latestLog || '首次进入本步骤时会自动开始解析。'}</p>
                {taskFailed && <small>失败后不会自动重试，可点击“重新解析”。</small>}
              </div>
            )}
          </div>
          <div className="global-facts-list">
            {globalFacts.length ? globalFacts.map((group) => (
              <button
                type="button"
                className={`global-facts-item${group.id === activeGroup?.id ? ' is-active' : ''}`}
                key={group.id}
                onClick={() => void selectGroup(group.id)}
              >
                <strong>{group.title}</strong>
                <small>{group.content.length} 字{group.updated_at ? ` · ${formatUpdatedAt(group.updated_at)}` : ''}</small>
              </button>
            )) : (
              <div className="global-facts-empty-list">
                <strong>{running ? '正在生成全局事实' : '暂无全局事实'}</strong>
                <p>{hasOutline ? '等待后台任务返回事实大项。' : '请先完成目录生成。'}</p>
              </div>
            )}
          </div>
          <div className="global-facts-panel-actions">
            <button type="button" className="secondary-action" onClick={addFactGroup} disabled={running || saving}>新增大项</button>
          </div>
        </aside>

        <article className="global-facts-reader">
          <div className="global-facts-reader-head">
            <div>
              <span className="section-kicker">事实内容</span>
              <strong>{activeGroup?.title || '等待全局事实'}</strong>
              <p>{activeGroup ? '可直接编辑事实变量；保存后会清空旧正文生成缓存，避免继续使用旧内容。' : '全局事实生成完成后，可在这里查看和编辑。'}</p>
            </div>
            <div className="global-facts-reader-actions">
              <button type="button" className="secondary-action" onClick={copyActiveGroup} disabled={!activeGroup || !draftContent}>复制</button>
              <button type="button" className="danger-action" onClick={deleteActiveGroup} disabled={!activeGroup || running || saving}>删除</button>
              <button type="button" className="primary-action" onClick={saveActiveGroup} disabled={!activeGroup || !dirty || running || saving}>保存</button>
            </div>
          </div>

          {activeGroup ? (
            <div className="global-facts-editor-grid">
              <div className="global-facts-edit-pane">
                <label>
                  <span>大项标题</span>
                  <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={running || saving} />
                </label>
                <MarkdownEditor
                  value={draftContent}
                  onChange={setDraftContent}
                  disabled={running || saving}
                  placeholder="填写后续正文需要统一使用的事实变量，例如人员、时间、型号、服务承诺等..."
                />
              </div>
              <div className="global-facts-preview-pane markdown-viewer">
                {draftContent.trim() ? (
                  <MarkdownRenderer allowRawHtml={false}>{draftContent}</MarkdownRenderer>
                ) : (
                  <p className="content-editor-empty">暂无预览内容</p>
                )}
              </div>
            </div>
          ) : (
            <div className="markdown-empty-state global-facts-empty">
              <strong>{hasOutline ? '等待全局事实生成' : '请先生成目录'}</strong>
              <p>{hasOutline ? 'AI 会基于目录提前生成正文可能反复用到的短小事实变量。' : '目录生成完成后，本步骤会自动开始。'}</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default GlobalFactsPage;
