import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useToast } from '../../../shared/ui';
import { ActivityWaiting } from '../../../shared/ui/ActivityWaiting';
import type { BackgroundTaskState, TechnicalPlanWorkflowKind } from '../types';
import type { KnowledgeBaseIndex, KnowledgeDocument } from '../../knowledge-base/types';
import type { OutlineData, OutlineItem, OutlineMode } from '../../../shared/types';
import { getStoredUiAppearance } from '../../../shared/uiAppearance';
import './modernOutline.css';

interface OutlineEditPageProps {
  projectId?: string;
  workflowKind: TechnicalPlanWorkflowKind;
  projectOverview: string;
  techRequirements: string;
  responseFileRequirements: string;
  outlineMode: OutlineMode;
  referenceKnowledgeDocumentIds: string[];
  outlineData: OutlineData | null;
  task?: BackgroundTaskState;
  onOutlineConfigChange: (mode: OutlineMode, documentIds: string[]) => Promise<void>;
  onOutlineGenerated: (outlineData: OutlineData) => void;
  openGenerationConfigRequestId?: number;
}

const emptyKnowledgeIndex: KnowledgeBaseIndex = { folders: [], documents: [] };

const outlineModeLabels: Record<OutlineMode, string> = {
  free: '自由生成',
  aligned: '按评分项对齐',
  'response-file': '按响应文件目录',
};

function isMissingTechnicalScoreItems(content: string) {
  const text = content.trim();
  if (/^(未提取到|没有提及|未提及|未提及技术评分项)[。\s]*$/.test(text)) return true;
  if (/^(?:【?技术评分项(?:名称)?】?|【评分项名称】)\s*[：:]\s*(?:未提及|没有提及|未提取到)[。\s]*$/.test(text)) return true;
  const section = text.match(/^##[\t ]+技术评分项[\t ]*\r?\n([\s\S]*?)(?=^#{1,2}[\t ]|$(?![\s\S]))/m);
  return /^(没有提及|未提取到|未提及|未提及技术评分项)[。\s]*$/.test(section?.[1]?.trim() || '');
}

function hasResponseFileOutline(content: string) {
  const text = content.trim().replace(/^#{1,6}\s*响应文件要求\s*/u, '').trim();
  return Boolean(text) && !/^(?:原文未明确技术文件目录|未提及|没有提及|未提取到)[。\s]*$/u.test(text);
}

function collectOutlineIds(items: OutlineItem[], ids = new Set<string>()) {
  items.forEach((item) => {
    ids.add(item.id);
    if (item.children?.length) {
      collectOutlineIds(item.children, ids);
    }
  });
  return ids;
}

function collectRootIds(items: OutlineItem[]) {
  return new Set(items.map((item) => item.id));
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renumberOutlineItems(items: OutlineItem[], parentPrefix = ''): OutlineItem[] {
  return items.map((item, index) => {
    const id = parentPrefix ? `${parentPrefix}.${index + 1}` : `${index + 1}`;
    return {
      ...item,
      id,
      children: item.children?.length ? renumberOutlineItems(item.children, id) : undefined,
    };
  });
}

function updateOutlineItem(items: OutlineItem[], itemId: string, updater: (item: OutlineItem) => OutlineItem): OutlineItem[] {
  return items.map((item) => {
    if (item.id === itemId) {
      return updater(item);
    }

    return {
      ...item,
      children: item.children ? updateOutlineItem(item.children, itemId, updater) : undefined,
    };
  });
}

function deleteOutlineItem(items: OutlineItem[], itemId: string): OutlineItem[] {
  return items.flatMap((item) => {
    if (item.id === itemId) {
      return [];
    }

    return [{
      ...item,
      children: item.children ? deleteOutlineItem(item.children, itemId) : undefined,
    }];
  });
}

function findOutlineItem(items: OutlineItem[], itemId: string): OutlineItem | null {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    const child = item.children ? findOutlineItem(item.children, itemId) : null;
    if (child) {
      return child;
    }
  }
  return null;
}

function getInitialExpandedKnowledgeFolders(index: KnowledgeBaseIndex) {
  const firstAvailableFolder = index.folders.find((folder) => (
    index.documents.some((document) => document.folder_id === folder.id && document.status === 'success')
  ));
  return new Set(firstAvailableFolder ? [firstAvailableFolder.id] : []);
}

function includesKeyword(value: string, keyword: string) {
  return value.toLowerCase().includes(keyword);
}

function OutlineEditPage({
  projectId,
  workflowKind,
  projectOverview,
  techRequirements,
  responseFileRequirements,
  outlineMode,
  referenceKnowledgeDocumentIds,
  outlineData,
  task,
  onOutlineConfigChange,
  onOutlineGenerated,
  openGenerationConfigRequestId,
}: OutlineEditPageProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [startingOutline, setStartingOutline] = useState(false);
  const [taskActionPending, setTaskActionPending] = useState(false);
  const [progressCollapsed, setProgressCollapsed] = useState(true);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [draftOutlineMode, setDraftOutlineMode] = useState<OutlineMode>(outlineMode);
  const noTechnicalScoreMode = isMissingTechnicalScoreItems(techRequirements);
  const responseFileAvailable = hasResponseFileOutline(responseFileRequirements);
  const initialOutlineMode = noTechnicalScoreMode && (outlineMode === 'aligned' || (outlineMode === 'response-file' && !responseFileAvailable))
    ? 'free'
    : outlineMode;
  const [draftKnowledgeDocumentIds, setDraftKnowledgeDocumentIds] = useState<string[]>(referenceKnowledgeDocumentIds);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [expandedKnowledgeFolderIds, setExpandedKnowledgeFolderIds] = useState<Set<string>>(new Set());
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeBaseIndex>(emptyKnowledgeIndex);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [localStartAt, setLocalStartAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const logListRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  const selectedItem = outlineData && selectedItemId ? findOutlineItem(outlineData.outline, selectedItemId) : null;
  const taskRunning = ['running', 'pausing', 'stopping'].includes(task?.status || '');
  const taskPaused = task?.status === 'paused';
  const taskFailed = task?.status === 'error';
  const generating = startingOutline || taskRunning || taskPaused;
  const progressLogs = task?.logs || [];
  const latestLog = progressLogs[progressLogs.length - 1];
  const progress = generating || task?.status === 'stopped'
    ? Math.max(5, Math.min(99, task?.progress || 5))
    : taskFailed
      ? Math.max(0, Math.min(99, task?.progress || 0))
      : outlineData || task?.status === 'success'
        ? 100
        : 0;
  const statusText = task?.status === 'pausing' ? '暂停中' : taskPaused ? '已暂停' : task?.status === 'stopping' ? '停止中' : task?.status === 'stopped' ? '已停止' : generating ? '运行中' : taskFailed ? '失败' : outlineData ? '已完成' : '未开始';
  const aiStatusTitle = generating ? 'AI 正在工作' : taskFailed ? '生成失败' : outlineData ? '目录已生成' : '等待生成';
  const statusMessage = taskFailed ? task?.error || latestLog || '目录生成失败，请查看开发者日志。' : latestLog || '点击生成目录后，这里会显示目录生成、审核和修正过程。';
  const startedAt = task?.started_at ? Date.parse(task.started_at) : NaN;
  const updatedAt = task?.updated_at ? Date.parse(task.updated_at) : NaN;
  const effectiveStartedAt = Number.isFinite(startedAt) ? startedAt : localStartAt;
  const elapsedText = taskRunning && effectiveStartedAt ? `已运行 ${formatDuration(nowTick - effectiveStartedAt)}` : '';
  const staleText = taskRunning && Number.isFinite(updatedAt) ? `最近更新 ${Math.floor(Math.max(0, nowTick - updatedAt) / 1000)} 秒前` : '';

  useEffect(() => {
    if (outlineData?.outline?.length) {
      const validIds = collectOutlineIds(outlineData.outline);
      setExpandedItems((prev) => {
        const next = new Set([...prev].filter((id) => validIds.has(id)));
        return next.size ? next : collectRootIds(outlineData.outline);
      });
      setSelectedItemId((prev) => (prev && validIds.has(prev) ? prev : outlineData.outline[0]?.id || null));
      return;
    }

    setExpandedItems(new Set());
    setSelectedItemId(null);
  }, [outlineData]);

  useEffect(() => {
    if (task?.status) {
      setStartingOutline(false);
      if (!['running', 'pausing', 'stopping'].includes(task.status)) {
        setLocalStartAt(null);
      }
    }
  }, [task?.status]);

  useEffect(() => {
    if (!generating) {
      return;
    }

    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
  }, [progressLogs.length]);

  useEffect(() => {
    if (!generationDialogOpen) {
      return;
    }

    setDraftOutlineMode(initialOutlineMode);
    setDraftKnowledgeDocumentIds(referenceKnowledgeDocumentIds);
    setKnowledgeSearch('');
    void loadKnowledgeIndex();
  }, [generationDialogOpen, initialOutlineMode, referenceKnowledgeDocumentIds]);

  const loadKnowledgeIndex = async () => {
    try {
      setLoadingKnowledge(true);
      const data = await window.yibiao?.knowledgeBase.list();
      setKnowledgeIndex(data || emptyKnowledgeIndex);
      setExpandedKnowledgeFolderIds(getInitialExpandedKnowledgeFolders(data || emptyKnowledgeIndex));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取知识库失败', 'error');
      setKnowledgeIndex(emptyKnowledgeIndex);
      setExpandedKnowledgeFolderIds(new Set());
    } finally {
      setLoadingKnowledge(false);
    }
  };

  const openGenerationDialog = () => {
    if (!projectOverview || !techRequirements) {
      showToast('请先完成招标文件解析', 'info');
      return;
    }

    setDraftOutlineMode(initialOutlineMode);
    setDraftKnowledgeDocumentIds(referenceKnowledgeDocumentIds);
    setKnowledgeSearch('');
    setGenerationDialogOpen(true);
  };

  useEffect(() => {
    if (!openGenerationConfigRequestId || generating || !projectOverview || !techRequirements) return;
    openGenerationDialog();
  }, [openGenerationConfigRequestId]);

  const saveOutlineConfig = async () => {
    try {
      if (draftOutlineMode === 'response-file' && !responseFileAvailable && noTechnicalScoreMode) {
        showToast('未找到明确的响应文件技术目录，请选择自由生成', 'info');
        return;
      }
      await onOutlineConfigChange(draftOutlineMode, draftKnowledgeDocumentIds);
      setGenerationDialogOpen(false);
      showToast('目录生成配置已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存目录生成配置失败', 'error');
    }
  };

  const generateOutline = async () => {
    if (!projectOverview || !techRequirements) {
      showToast('请先完成招标文件解析', 'info');
      return;
    }
    if (noTechnicalScoreMode && draftOutlineMode === 'aligned') {
      showToast('没有技术评分项，无法按评分项对齐', 'info');
      return;
    }
    if (draftOutlineMode === 'response-file' && !responseFileAvailable && noTechnicalScoreMode) {
      showToast('未找到明确的响应文件技术目录，请选择自由生成', 'info');
      return;
    }

    try {
      const startedNow = Date.now();
      setStartingOutline(true);
      setLocalStartAt(startedNow);
      setNowTick(startedNow);
      await onOutlineConfigChange(draftOutlineMode, draftKnowledgeDocumentIds);
      setGenerationDialogOpen(false);
      await window.yibiao?.tasks.startOutlineGeneration({
        workflowKind,
        projectId,
        mode: draftOutlineMode,
        responseFileRequirements,
        reference_knowledge_document_ids: draftKnowledgeDocumentIds,
      });
      showToast('目录生成任务已在后台启动', 'success');
    } catch (error) {
      setStartingOutline(false);
      setLocalStartAt(null);
      showToast(error instanceof Error ? error.message : '启动目录生成任务失败', 'error');
    }
  };

  const controlOutline = async (action: 'pause' | 'resume' | 'stop') => {
    if (taskActionPending) return;
    setTaskActionPending(true);
    try {
      const tasks = window.yibiao?.tasks;
      if (!tasks) throw new Error('后台任务服务不可用，请重启客户端');
      const target = { workflowKind, projectId };
      if (action === 'pause') await tasks.pauseOutlineGeneration(target);
      if (action === 'resume') await tasks.resumeOutlineGeneration(target);
      if (action === 'stop') await tasks.stopOutlineGeneration(target);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作目录任务失败', 'error');
    } finally {
      setTaskActionPending(false);
    }
  };

  const taskControls = ['running', 'pausing', 'paused', 'stopping'].includes(task?.status || '') ? (
    <div className="outline-task-controls" aria-label="目录生成任务操作">
      {task?.status === 'running' && <button type="button" onClick={() => void controlOutline('pause')} disabled={taskActionPending}>暂停</button>}
      {task?.status === 'pausing' && <button type="button" disabled>暂停中…</button>}
      {taskPaused && <button type="button" className="is-primary" onClick={() => void controlOutline('resume')} disabled={taskActionPending}>继续</button>}
      {task?.status === 'stopping'
        ? <button type="button" disabled>停止中…</button>
        : <button type="button" className="is-danger" onClick={() => void controlOutline('stop')} disabled={taskActionPending}>停止</button>}
    </div>
  ) : null;

  const toggleDraftKnowledgeDocument = (document: KnowledgeDocument) => {
    if (document.status !== 'success' || generating) {
      return;
    }

    setDraftKnowledgeDocumentIds((prev) => (
      prev.includes(document.id)
        ? prev.filter((id) => id !== document.id)
        : [...prev, document.id]
    ));
  };

  const toggleKnowledgeFolder = (folderId: string) => {
    setExpandedKnowledgeFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const selectFolderDocuments = (documents: KnowledgeDocument[]) => {
    const ids = documents.filter((document) => document.status === 'success').map((document) => document.id);
    setDraftKnowledgeDocumentIds((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))]);
  };

  const clearFolderDocuments = (documents: KnowledgeDocument[]) => {
    const ids = new Set(documents.map((document) => document.id));
    setDraftKnowledgeDocumentIds((prev) => prev.filter((id) => !ids.has(id)));
  };

  const removeDraftKnowledgeDocument = (documentId: string) => {
    setDraftKnowledgeDocumentIds((prev) => prev.filter((id) => id !== documentId));
  };

  const clearDraftKnowledgeDocuments = () => {
    setDraftKnowledgeDocumentIds([]);
  };

  const updateOutline = (outline: OutlineItem[]) => {
    if (!outlineData) {
      return;
    }
    onOutlineGenerated({ ...outlineData, outline: renumberOutlineItems(outline) });
  };

  const startEditing = (item: OutlineItem) => {
    if (generating) {
      return;
    }
    setSelectedItemId(item.id);
    setEditingItemId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description);
  };

  const saveEditing = () => {
    if (!outlineData || !editingItemId || generating) {
      return;
    }

    updateOutline(updateOutlineItem(outlineData.outline, editingItemId, (item) => ({
      ...item,
      title: editTitle.trim() || item.title,
      description: editDescription.trim(),
    })));
    setEditingItemId(null);
    showToast('目录项已更新', 'success');
  };

  const addRootItem = () => {
    if (!outlineData || generating) {
      return;
    }

    const newItem: OutlineItem = {
      id: `${outlineData.outline.length + 1}`,
      title: '新目录项',
      description: '请编辑描述',
    };
    updateOutline([...outlineData.outline, newItem]);
    setSelectedItemId(newItem.id);
    setTimeout(() => startEditing(newItem), 0);
  };

  const addChildItem = (parentId: string) => {
    if (!outlineData || generating) {
      return;
    }

    const parent = findOutlineItem(outlineData.outline, parentId);
    const nextIndex = (parent?.children?.length || 0) + 1;
    const newItem: OutlineItem = {
      id: `${parentId}.${nextIndex}`,
      title: '新目录项',
      description: '请编辑描述',
    };

    updateOutline(updateOutlineItem(outlineData.outline, parentId, (item) => ({
      ...item,
      children: [...(item.children || []), newItem],
    })));
    setExpandedItems((prev) => new Set(prev).add(parentId));
    setSelectedItemId(newItem.id);
    setTimeout(() => startEditing(newItem), 0);
  };

  const removeItem = (itemId: string) => {
    if (!outlineData || generating) {
      return;
    }
    updateOutline(deleteOutlineItem(outlineData.outline, itemId));
    setSelectedItemId(null);
    showToast('目录项已删除', 'success');
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const expandAllItems = () => {
    if (outlineData?.outline?.length) {
      setExpandedItems(collectOutlineIds(outlineData.outline));
    }
  };

  const collapseAllItems = () => {
    setExpandedItems(new Set());
  };

  const renderItem = (item: OutlineItem, level = 0) => {
    const hasChildren = Boolean(item.children?.length);
    const isExpanded = expandedItems.has(item.id);
    const isActive = selectedItemId === item.id;

    return (
      <div className="outline-tree-node" key={item.id} style={{ '--outline-level': level } as CSSProperties}>
        <div className={`outline-tree-item${isActive ? ' is-active' : ''}`}>
          <button
            type="button"
            className={`outline-tree-toggle${hasChildren ? '' : ' is-leaf'}${isExpanded ? ' is-expanded' : ''}`}
            onClick={() => hasChildren && toggleExpanded(item.id)}
            disabled={!hasChildren}
            aria-label={hasChildren ? `${isExpanded ? '折叠' : '展开'} ${item.title}` : `${item.title} 无子目录`}
          >
            {hasChildren ? '›' : '•'}
          </button>
          <button
            type="button"
            className="outline-tree-content"
            onClick={() => setSelectedItemId(item.id)}
            onDoubleClick={() => hasChildren && toggleExpanded(item.id)}
          >
            <strong>{item.id} {item.title}</strong>
            <small>{item.description || '无描述'}</small>
          </button>
        </div>
        {hasChildren && isExpanded && item.children?.map((child) => renderItem(child, level + 1))}
      </div>
    );
  };

  const renderKnowledgePicker = () => {
    if (loadingKnowledge) {
      return <div className="outline-knowledge-empty">正在读取知识库...</div>;
    }

    const keyword = knowledgeSearch.trim().toLowerCase();
    const availableDocuments = knowledgeIndex.documents.filter((document) => document.status === 'success');
    const selectedDocuments = draftKnowledgeDocumentIds
      .map((documentId) => knowledgeIndex.documents.find((document) => document.id === documentId))
      .filter((document): document is KnowledgeDocument => Boolean(document));
    const visibleFolders = knowledgeIndex.folders.flatMap((folder) => {
      const folderDocuments = availableDocuments.filter((document) => document.folder_id === folder.id);
      const folderMatched = keyword ? includesKeyword(folder.name, keyword) : false;
      const documents = keyword
        ? folderDocuments.filter((document) => folderMatched || includesKeyword(document.file_name, keyword))
        : folderDocuments;

      return documents.length ? [{ folder, documents }] : [];
    });

    if (!availableDocuments.length) {
      return <div className="outline-knowledge-empty">暂无已完成的知识库文档，可先到知识库上传并处理完成后再选择。</div>;
    }

    return (
      <div className="outline-knowledge-compact">
        <input
          className="outline-knowledge-search"
          value={knowledgeSearch}
          onChange={(event) => setKnowledgeSearch(event.target.value)}
          placeholder="搜索文件夹或文档"
        />
        <div className="outline-knowledge-grid">
          <div className="outline-knowledge-browser">
            <div className="outline-knowledge-pane-head">
              <strong>知识库</strong>
              <span>{availableDocuments.length} 个可用</span>
            </div>
            <div className="outline-knowledge-folder-list compact">
              {visibleFolders.length ? visibleFolders.map(({ folder, documents }) => {
                const expanded = keyword ? true : expandedKnowledgeFolderIds.has(folder.id);
                const selectedCount = documents.filter((document) => draftKnowledgeDocumentIds.includes(document.id)).length;

                return (
                  <section className="outline-knowledge-folder compact" key={folder.id}>
                    <div className="outline-knowledge-folder-head compact">
                      <button type="button" onClick={() => toggleKnowledgeFolder(folder.id)} disabled={Boolean(keyword)}>
                        <span>{expanded ? '▾' : '▸'}</span>
                        <strong>{folder.name}</strong>
                      </button>
                      <small>{documents.length} 个 / 已选 {selectedCount}</small>
                      <div className="outline-knowledge-folder-actions">
                        <button type="button" onClick={() => selectFolderDocuments(documents)} disabled={generating}>全选</button>
                        <button type="button" onClick={() => clearFolderDocuments(documents)} disabled={generating || !selectedCount}>取消</button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="outline-knowledge-document-list compact">
                        {documents.map((document) => {
                          const selected = draftKnowledgeDocumentIds.includes(document.id);

                          return (
                            <label className={`outline-knowledge-document compact${selected ? ' is-selected' : ''}`} key={document.id}>
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={generating}
                                onChange={() => toggleDraftKnowledgeDocument(document)}
                              />
                              <strong title={document.file_name}>{document.file_name}</strong>
                              <small>{document.item_count || 0} 条</small>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              }) : <div className="outline-knowledge-empty compact">没有匹配的知识库文档</div>}
            </div>
          </div>
          <aside className="outline-knowledge-selected-pane">
            <div className="outline-knowledge-pane-head">
              <strong>本次已选</strong>
              <button type="button" onClick={clearDraftKnowledgeDocuments} disabled={generating || !draftKnowledgeDocumentIds.length}>清空</button>
            </div>
            {selectedDocuments.length ? (
              <div className="outline-knowledge-selected-list">
                {selectedDocuments.map((document) => (
                  <div className="outline-knowledge-selected-item" key={document.id}>
                    <strong title={document.file_name}>{document.file_name}</strong>
                    <button type="button" onClick={() => removeDraftKnowledgeDocument(document.id)} disabled={generating}>移除</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="outline-knowledge-empty compact">未选择知识库文档</div>
            )}
          </aside>
        </div>
      </div>
    );
  };

  const generationDialog = (
      <Dialog.Root open={generationDialogOpen} onOpenChange={setGenerationDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="outline-generation-config-card">
            <Dialog.Title className="sr-only">{outlineData ? '重新生成目录' : '生成目录'}</Dialog.Title>
            <Dialog.Description className="sr-only">选择本次目录生成方式和参考知识库。</Dialog.Description>

            <section className="outline-generation-config-section">
              <div className="outline-generation-config-head">
                <strong>生成方式</strong>
                <span>{noTechnicalScoreMode ? `无技术评分项 · ${outlineModeLabels[draftOutlineMode]}` : outlineModeLabels[draftOutlineMode]}</span>
              </div>
              <div className="outline-generation-mode-list" role="radiogroup" aria-label="目录生成方式">
                <button
                  type="button"
                  className={`outline-generation-mode-card${draftOutlineMode === 'free' ? ' is-active' : ''}`}
                  onClick={() => setDraftOutlineMode('free')}
                  disabled={generating}
                >
                  <strong>自由生成</strong>
                  <span>{noTechnicalScoreMode ? '根据项目概述和已有技术要求组织目录，不依赖评分项。' : '完全由 AI 分析并生成目录，标题贴近技术评分项语义，但不完全一致。'}</span>
                </button>
                <button
                  type="button"
                  className={`outline-generation-mode-card${draftOutlineMode === 'aligned' ? ' is-active' : ''}`}
                  onClick={() => setDraftOutlineMode('aligned')}
                  disabled={generating || noTechnicalScoreMode}
                >
                  <strong>按评分项对齐</strong>
                  <span>一级目录完全和技术评分项要求一致，二三级目录由 AI 生成。</span>
                </button>
                <button
                  type="button"
                  className={`outline-generation-mode-card${draftOutlineMode === 'response-file' ? ' is-active' : ''}`}
                  onClick={() => setDraftOutlineMode('response-file')}
                  disabled={generating || (noTechnicalScoreMode && !responseFileAvailable)}
                >
                  <strong>按响应文件目录</strong>
                  <span>优先按招标文件中的技术文件组成和编制要求组织一级目录，二三级目录由 AI 生成。</span>
                </button>
              </div>
              {noTechnicalScoreMode ? (
                <div className="outline-generation-no-score">
                  <strong>未检测到技术评分项</strong>
                  <span>{responseFileAvailable ? '可选择自由生成或按响应文件目录生成。' : '未找到明确的技术文件目录，当前可使用自由生成。'}</span>
                </div>
              ) : null}
            </section>

            <section className="outline-generation-config-section outline-knowledge-picker">
              <div className="outline-generation-config-head">
                <strong>参考知识库</strong>
                <span>已选择 {draftKnowledgeDocumentIds.length} 个文档</span>
              </div>
              {renderKnowledgePicker()}
            </section>

            <div className="content-regenerate-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="secondary-action" onClick={saveOutlineConfig} disabled={generating}>
                保存配置
              </button>
              {!noTechnicalScoreMode && draftOutlineMode === 'response-file' && !responseFileAvailable ? (
                <span className="outline-generation-config-hint">未找到独立的响应文件要求，将退回使用技术评分要求。</span>
              ) : null}
              <button type="button" className="primary-action" onClick={generateOutline} disabled={generating || !projectOverview || !techRequirements}>
                开始生成
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
  );

  const renderModernItem = (item: OutlineItem): ReactNode => {
    const hasChildren = Boolean(item.children?.length);
    const expanded = expandedItems.has(item.id);
    return <div className="modern-outline-node" key={item.id}>
      <div className={`modern-outline-item${selectedItemId === item.id ? ' is-active' : ''}`}>
        <button type="button" className="modern-outline-expand" onClick={() => toggleExpanded(item.id)} disabled={!hasChildren} aria-label={hasChildren ? `${expanded ? '折叠' : '展开'} ${item.title}` : `${item.title} 无子目录`}>{hasChildren ? expanded ? '▾' : '▸' : '·'}</button>
        <button type="button" className="modern-outline-select" onClick={() => setSelectedItemId(item.id)} onDoubleClick={() => hasChildren && toggleExpanded(item.id)}><span>{item.id}</span><strong>{item.title}</strong><small>{item.description || '无描述'}</small></button>
      </div>
      {hasChildren && expanded && item.children?.map((child) => renderModernItem(child))}
    </div>;
  };

  if (getStoredUiAppearance() === 'modern') {
    return <div className="modern-outline-page">
      <header className="modern-outline-header"><div><span>目录结构工作台</span><h2>组织技术方案章节</h2><p>当前参考知识库：{referenceKnowledgeDocumentIds.length ? `已选 ${referenceKnowledgeDocumentIds.length} 个文档` : '未选择文档'}。</p></div><button type="button" onClick={openGenerationDialog} disabled={generating || !projectOverview || !techRequirements}>{generating ? 'AI 正在生成目录' : outlineData ? '重新生成目录' : '生成目录'}</button></header>
      <section className="modern-outline-progress"><div><span className={`modern-outline-status is-${taskFailed ? 'error' : generating ? 'running' : outlineData ? 'success' : 'idle'}`}>{statusText}</span><strong>{progress}%</strong><div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="目录生成进度"><span style={{ width: `${progress}%` }} /></div><button type="button" onClick={() => setProgressCollapsed((value) => !value)} aria-expanded={!progressCollapsed}>{progressCollapsed ? '查看过程' : '收起过程'}</button></div>{!progressCollapsed && <div className="modern-outline-progress-detail"><p>{statusMessage}</p>{(elapsedText || staleText) && <small>{[elapsedText, staleText].filter(Boolean).join(' · ')}</small>}{taskFailed && <small>{task?.error || latestLog || '目录生成失败'}</small>}<div ref={logListRef}>{progressLogs.length ? progressLogs.map((item, index) => <p key={`${item}-${index}`} className={index === progressLogs.length - 1 ? 'is-latest' : ''}>{item}</p>) : <p>等待生成任务启动。</p>}</div></div>}</section>
      {taskControls}
      <div className="modern-outline-workspace"><section className="modern-outline-tree"><header><div><span>CHAPTER STRUCTURE</span><h3>目录结构 <small>{outlineData?.outline?.length || 0} 个一级目录</small></h3></div><div><button type="button" onClick={addRootItem} disabled={!outlineData || generating}>新增一级目录</button><button type="button" onClick={expandAllItems} disabled={!outlineData?.outline?.length}>全部展开</button><button type="button" onClick={collapseAllItems} disabled={!outlineData?.outline?.length}>全部折叠</button></div></header><div className="modern-outline-tree-body">{outlineData?.outline?.length ? outlineData.outline.map((item) => renderModernItem(item)) : generating ? <ActivityWaiting title="正在生成目录" description={statusMessage || "正在组织技术方案章节，生成后将在这里显示目录结构。"} progress={progress} /> : <div className="modern-outline-empty"><strong>尚未生成目录</strong><p>完成招标文件解析后，点击“生成目录”。</p></div>}</div></section>
        <aside className="modern-outline-detail"><header><span>CHAPTER DETAIL</span><h3>目录项详情</h3><small>{selectedItem?.id || '未选择'}</small></header>{selectedItem ? <div className="modern-outline-detail-body">{generating && <p className="modern-outline-lock">目录生成中，暂不可编辑，以免覆盖后台结果。</p>}{editingItemId === selectedItem.id ? <><label>标题<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} disabled={generating} /></label><label>描述<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} disabled={generating} /></label><div><button type="button" className="is-primary" onClick={saveEditing} disabled={generating}>保存</button><button type="button" onClick={() => setEditingItemId(null)}>取消</button></div></> : <><h4>{selectedItem.title}</h4><p>{selectedItem.description || '无描述'}</p>{selectedItem.source_requirement_title && <small>来源评分项：{selectedItem.source_requirement_title}</small>}<div><button type="button" className="is-primary" onClick={() => startEditing(selectedItem)} disabled={generating}>编辑</button><button type="button" onClick={() => addChildItem(selectedItem.id)} disabled={generating}>添加子目录</button><button type="button" className="is-danger" onClick={() => removeItem(selectedItem.id)} disabled={generating}>删除</button></div></>}</div> : <div className="modern-outline-empty"><strong>选择目录项</strong><p>选择左侧章节后，可以查看和编辑标题与描述。</p></div>}</aside>
      </div>
      {generationDialog}
    </div>;
  }

  return (
    <div className="plan-step-body outline-generation-page">
      <section className="outline-command-bar">
        <div>
          <span className="section-kicker">STEP 04</span>
          <strong>目录生成</strong>
          <p>生成前选择目录方式和参考知识库；当前参考知识库：{referenceKnowledgeDocumentIds.length ? `已选择 ${referenceKnowledgeDocumentIds.length} 个文档` : '未选择'}。</p>
        </div>
        <div className="outline-command-actions">
          <button
            type="button"
            className="outline-config-action"
            onClick={openGenerationDialog}
            disabled={generating || !projectOverview || !techRequirements}
            aria-label="打开目录生成配置"
            title="目录生成配置"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.93a1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 10 3.01V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </button>
          <button type="button" className="primary-action" onClick={openGenerationDialog} disabled={generating || !projectOverview || !techRequirements}>
            {generating ? 'AI 正在生成目录' : outlineData ? '重新生成目录' : '生成目录'}
          </button>
        </div>
      </section>

      <section className="outline-generation-workspace">
        <aside className="outline-progress-panel">
          <div className="analysis-result-head">
            <strong>生成过程</strong>
            <span>{statusText}</span>
          </div>
          <div className={`content-outline-stats outline-progress-summary${progressCollapsed ? ' is-collapsed' : ''}`}>
            <button type="button" onClick={() => setProgressCollapsed((prev) => !prev)} aria-expanded={!progressCollapsed}>
              <span>生成进度</span>
              <strong>{progress}%</strong>
              <em>{progressCollapsed ? '展开' : '折叠'}</em>
            </button>
            {!progressCollapsed && (
              <div className="content-outline-stats-body">
                <div className="content-generation-progress-track" aria-label={`目录生成进度 ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p>{statusMessage}</p>
                {(elapsedText || staleText) && (
                  <div className="outline-progress-meta">
                    {elapsedText && <span>{elapsedText}</span>}
                    {staleText && <span>{staleText}</span>}
                  </div>
                )}
                {taskFailed && <small>{task?.error || latestLog || '目录生成失败'}</small>}
              </div>
            )}
          </div>
          {taskControls}
          <div className="outline-progress-log" ref={logListRef}>
            {progressLogs.length ? progressLogs.map((item, index) => (
              <p className={index === progressLogs.length - 1 ? 'is-latest' : ''} key={`${item}-${index}`}>{item}</p>
            )) : <p>等待生成任务启动。</p>}
          </div>
        </aside>

        <section className="outline-tree-panel">
          <div className="analysis-result-head outline-tree-head">
            <div>
              <strong>目录结构</strong>
              <span>{outlineData?.outline?.length || 0} 个一级目录</span>
            </div>
            <div className="outline-tree-tools">
              {outlineData && (
                <button type="button" className="outline-add-root-action" onClick={addRootItem} disabled={generating}>
                  添加一级目录
                </button>
              )}
              <button type="button" onClick={expandAllItems} disabled={!outlineData?.outline?.length}>全部展开</button>
              <button type="button" onClick={collapseAllItems} disabled={!outlineData?.outline?.length}>全部折叠</button>
            </div>
          </div>
          {outlineData?.outline?.length ? (
            <div className="outline-tree-list">
              {outlineData.outline.map((item) => renderItem(item))}
            </div>
          ) : (
            <div className="markdown-empty-state outline-empty-state">
              <strong>尚未生成目录</strong>
              <p>先完成招标文件解析，再生成技术方案目录。</p>
            </div>
          )}
        </section>

        <aside className="outline-detail-panel">
          <div className="analysis-result-head">
            <div>
              <strong>目录项详情</strong>
              <span>{selectedItem ? selectedItem.id : '未选择'}</span>
            </div>
          </div>
          {selectedItem ? (
            <div className="outline-detail-body">
              {generating && (
                <div className="outline-detail-lock">
                  目录生成任务正在运行，当前目录暂不可编辑，避免覆盖后台生成结果。
                </div>
              )}
              {editingItemId === selectedItem.id ? (
                <>
                  <label>
                    <span>标题</span>
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} disabled={generating} />
                  </label>
                  <label>
                    <span>描述</span>
                    <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} disabled={generating} />
                  </label>
                  <div className="outline-detail-actions">
                    <button type="button" className="primary-action" onClick={saveEditing} disabled={generating}>保存</button>
                    <button type="button" className="secondary-action" onClick={() => setEditingItemId(null)}>取消</button>
                  </div>
                </>
              ) : (
                <>
                  <h3>{selectedItem.title}</h3>
                  <p>{selectedItem.description || '无描述'}</p>
                  {selectedItem.source_requirement_title && <small>来源评分项：{selectedItem.source_requirement_title}</small>}
                  <div className="outline-detail-actions">
                    <button type="button" className="primary-action" onClick={() => startEditing(selectedItem)} disabled={generating}>编辑</button>
                    <button type="button" className="secondary-action" onClick={() => addChildItem(selectedItem.id)} disabled={generating}>添加子目录</button>
                    <button type="button" className="danger-action" onClick={() => removeItem(selectedItem.id)} disabled={generating}>删除</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="markdown-empty-state outline-empty-state">
              <strong>选择一个目录项</strong>
              <p>在左侧目录树中选择章节后，可查看并编辑标题和描述。</p>
            </div>
          )}
        </aside>
      </section>

      {generationDialog}
    </div>
  );
}

export default OutlineEditPage;
