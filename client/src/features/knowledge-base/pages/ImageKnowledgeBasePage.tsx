import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { KnowledgeImage, KnowledgeImageFolder } from '../../../shared/types/contracts/knowledgeBase';
import { useAppDialog, useToast } from '../../../shared/ui';
import '../imageKnowledgeBase.css';

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface ImageKnowledgeBasePageProps {
  embedded?: boolean;
  createRequestKey?: number;
}

export default function ImageKnowledgeBasePage({ embedded = false, createRequestKey = 0 }: ImageKnowledgeBasePageProps) {
  const { showToast } = useToast();
  const { confirm, prompt } = useAppDialog();
  const [folders, setFolders] = useState<KnowledgeImageFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState('');
  const [images, setImages] = useState<KnowledgeImage[]>([]);
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<KnowledgeImage | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '', tags: '' });
  const createRequestRef = useRef(createRequestKey);

  const loadFolders = useCallback(async () => {
    const next = await window.yibiao!.knowledgeImage.listFolders();
    setFolders(next);
    setActiveFolderId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || '');
  }, []);

  const loadImages = useCallback(async () => {
    if (!activeFolderId) { setImages([]); return; }
    const next = await window.yibiao!.knowledgeImage.list(activeFolderId, query);
    setImages(next);
    const entries = await Promise.all(next.map(async (item) => [item.id, await window.yibiao!.knowledgeImage.getThumbnailDataUrl(item.id)] as const));
    setDataUrls(Object.fromEntries(entries));
    setSelectedIds((current) => current.filter((id) => next.some((item) => item.id === id)));
  }, [activeFolderId, query]);

  useEffect(() => { void loadFolders().catch((error) => showToast(error instanceof Error ? error.message : '加载图片库失败', 'error')); }, [loadFolders, showToast]);
  useEffect(() => { void loadImages().catch((error) => showToast(error instanceof Error ? error.message : '加载图片失败', 'error')); }, [loadImages, showToast]);

  const activeFolder = useMemo(() => folders.find((item) => item.id === activeFolderId), [folders, activeFolderId]);

  const createFolder = async () => {
    const name = await prompt({ title: '新建图片文件夹', description: '用于分类管理本地图片素材。', placeholder: '例如：系统架构图', confirmLabel: '创建' });
    if (!name?.trim()) return;
    try { const folder = await window.yibiao!.knowledgeImage.createFolder(name); await loadFolders(); setActiveFolderId(folder.id); showToast('文件夹已创建', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '创建失败', 'error'); }
  };

  useEffect(() => {
    if (createRequestKey === createRequestRef.current) return;
    createRequestRef.current = createRequestKey;
    void createFolder();
  }, [createRequestKey]);

  const renameFolder = async (folder: KnowledgeImageFolder) => {
    const name = await prompt({ title: '重命名文件夹', description: '输入新的文件夹名称。', defaultValue: folder.name, confirmLabel: '保存' });
    if (!name?.trim() || name.trim() === folder.name) return;
    try { await window.yibiao!.knowledgeImage.renameFolder(folder.id, name); await loadFolders(); showToast('文件夹已重命名', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '重命名失败', 'error'); }
  };

  const deleteFolder = async (folder: KnowledgeImageFolder) => {
    const accepted = await confirm({ title: '删除图片文件夹', description: `确定删除“${folder.name}”及其中全部图片吗？此操作无法撤销。`, confirmLabel: '删除', danger: true });
    if (!accepted) return;
    try {
      let result = await window.yibiao!.knowledgeImage.deleteFolder(folder.id);
      if (result.referenced) {
        const force = await confirm({ title: '文件夹中的图片正在被引用', description: `${result.message}。强制删除后，对应正文和 Word 导出中的图片将失效。`, confirmLabel: '仍然删除', danger: true });
        if (!force) return;
        result = await window.yibiao!.knowledgeImage.deleteFolder(folder.id, { force: true });
      }
      await loadFolders(); showToast(result.message, result.success ? 'success' : 'error');
    }
    catch (error) { showToast(error instanceof Error ? error.message : '删除失败', 'error'); }
  };

  const upload = async () => {
    if (!activeFolderId) { showToast('请先创建图片文件夹', 'info'); return; }
    setBusy(true);
    try { const result = await window.yibiao!.knowledgeImage.upload(activeFolderId); if (!result.canceled) { await loadImages(); showToast(result.message, 'success'); } }
    catch (error) { showToast(error instanceof Error ? error.message : '上传失败', 'error'); }
    finally { setBusy(false); }
  };

  const openEdit = (image: KnowledgeImage) => { setEditing(image); setDraft({ name: image.name, description: image.description, tags: image.tags.join('，') }); };
  const saveEdit = async () => {
    if (!editing || !draft.name.trim()) return;
    try {
      await window.yibiao!.knowledgeImage.update(editing.id, { name: draft.name, description: draft.description, tags: draft.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean) });
      setEditing(null); await loadImages(); showToast('图片信息已保存', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '保存失败', 'error'); }
  };
  const removeImage = async (image: KnowledgeImage) => {
    const accepted = await confirm({ title: '删除图片', description: `确定删除“${image.name}”吗？`, confirmLabel: '删除', danger: true });
    if (!accepted) return;
    try {
      let result = await window.yibiao!.knowledgeImage.remove(image.id);
      if (result.referenced) {
        const force = await confirm({ title: '图片正在被技术方案引用', description: `${result.message}。强制删除后，正文中的该图片将无法预览和导出。`, confirmLabel: '仍然删除', danger: true });
        if (!force) return;
        result = await window.yibiao!.knowledgeImage.remove(image.id, { force: true });
      }
      await loadImages(); showToast(result.message, result.success ? 'success' : 'error');
    }
    catch (error) { showToast(error instanceof Error ? error.message : '删除失败', 'error'); }
  };
  const copyMarkdown = async (image: KnowledgeImage) => {
    try {
      await navigator.clipboard.writeText(`![${image.name}](${image.asset_url})`);
      showToast('Markdown 图片引用已复制，可粘贴到技术方案正文', 'success');
    } catch { showToast('复制失败，请检查系统剪贴板权限', 'error'); }
  };
  const toggleSelection = (imageId: string) => setSelectedIds((current) => current.includes(imageId) ? current.filter((id) => id !== imageId) : [...current, imageId]);
  const moveSelected = async (targetFolderId: string) => {
    if (!selectedIds.length || !targetFolderId) return;
    try { const result = await window.yibiao!.knowledgeImage.move(selectedIds, targetFolderId); setSelectedIds([]); await loadImages(); showToast(result.message, 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '移动失败', 'error'); }
  };
  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    const references = await Promise.all(selectedIds.map((id) => window.yibiao!.knowledgeImage.findReferences(id)));
    const referenceCount = references.reduce((sum, item) => sum + item.reference_count, 0);
    const accepted = await confirm({ title: '批量删除图片', description: referenceCount ? `选中的图片共有 ${referenceCount} 处技术方案引用。强制删除后引用将失效，确定继续吗？` : `确定删除选中的 ${selectedIds.length} 张图片吗？`, confirmLabel: '删除', danger: true });
    if (!accepted) return;
    try { for (const id of selectedIds) await window.yibiao!.knowledgeImage.remove(id, { force: referenceCount > 0 }); setSelectedIds([]); await loadImages(); showToast('批量删除完成', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '批量删除失败', 'error'); }
  };
  const tagSelected = async () => {
    const value = await prompt({ title: '批量添加标签', description: `为选中的 ${selectedIds.length} 张图片追加标签，不会清除原有标签。`, placeholder: '例如：架构图，网络安全', confirmLabel: '添加' });
    const tags = String(value || '').split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    if (!tags.length) return;
    try { const result = await window.yibiao!.knowledgeImage.addTags(selectedIds, tags); await loadImages(); showToast(result.message, 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : '添加标签失败', 'error'); }
  };

  return <div className="image-library-page">
    <section className="image-library-workspace-bar">
      <div className="image-library-breadcrumb">
        <strong>{activeFolder?.name || '未选择文件夹'}</strong>
        <small>{folders.length} 个文件夹 / {images.length} 张图片</small>
      </div>
      <button className="primary-action" disabled={busy || !activeFolderId} onClick={() => void upload()}>{busy ? '正在导入...' : '导入图片'}</button>
    </section>
    <section className="image-library-layout">
      <aside className="image-library-sidebar">
        <div className="image-library-heading"><strong>文件夹</strong><span>{folders.length} 个</span>{!embedded && <button className="secondary-action" onClick={() => void createFolder()}>新建</button>}</div>
        <div className="image-folder-list">{folders.map((folder) => <article className={`image-folder-row ${folder.id === activeFolderId ? 'active' : ''}`} key={folder.id}>
          <button className="image-folder-name" onClick={() => setActiveFolderId(folder.id)}>
            <span aria-hidden="true">F</span><strong>{folder.name}</strong><small>{folder.id === activeFolderId ? `${images.length} 张图片` : '图片文件夹'}</small>
          </button>
          <div className="image-folder-actions"><button className="icon-text-button" onClick={() => void renameFolder(folder)}>重命名</button><button className="icon-text-button danger" onClick={() => void deleteFolder(folder)}>删除</button></div>
        </article>)}</div>
      </aside>
      <main className="image-library-main">
        <header className="image-library-toolbar"><div><strong>{activeFolder?.name || '图片素材'}</strong><small>支持 PNG、JPG、WebP、GIF、BMP，单张不超过 20MB</small></div><div className="image-library-actions"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、说明或标签"/></div></header>
      {selectedIds.length > 0 && <div className="image-batch-toolbar"><strong>已选择 {selectedIds.length} 张</strong><Popover.Root><Popover.Trigger asChild><button className="button secondary" disabled={!folders.some((folder) => folder.id !== activeFolderId)}>移动到文件夹</button></Popover.Trigger><Popover.Portal><Popover.Content className="image-move-popover" side="bottom" align="end" sideOffset={8}><div className="image-move-popover-head"><strong>选择目标文件夹</strong><small>图片将从当前文件夹移出</small></div><div className="image-move-folder-list">{folders.filter((folder) => folder.id !== activeFolderId).map((folder) => <Popover.Close asChild key={folder.id}><button type="button" onClick={() => void moveSelected(folder.id)}><span aria-hidden="true">F</span><strong>{folder.name}</strong><small>移动到此处</small></button></Popover.Close>)}</div><Popover.Arrow className="image-move-popover-arrow" /></Popover.Content></Popover.Portal></Popover.Root><button className="button secondary" onClick={() => void tagSelected()}>添加标签</button><button className="button secondary danger" onClick={() => void deleteSelected()}>批量删除</button><button className="button secondary" onClick={() => setSelectedIds([])}>取消选择</button></div>}
      {!activeFolderId ? <div className="image-library-empty">先新建一个文件夹，再导入图片素材。</div> : images.length === 0 ? <div className="image-library-empty">当前文件夹暂无匹配图片。</div> : <div className="image-card-grid">{images.map((item) => <article className="image-card" key={item.id}>
        <label className="image-card-select"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelection(item.id)}/>选择</label><button className="image-card-preview" onClick={() => openEdit(item)}><img src={dataUrls[item.id]} alt={item.name}/></button>
        <div className="image-card-body"><strong title={item.name}>{item.name}</strong><small>{formatSize(item.size)} · {item.mime_type.replace('image/', '').toUpperCase()}</small><p>{item.description || '暂无说明'}</p><div className="image-tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="image-card-actions"><button onClick={() => void copyMarkdown(item)}>复制引用</button><button onClick={() => openEdit(item)}>编辑</button><button className="danger" onClick={() => void removeImage(item)}>删除</button></div></div>
      </article>)}</div>}
      </main>
    </section>
    {editing && <div className="image-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="image-edit-dialog" role="dialog" aria-modal="true" aria-label="编辑图片信息"><h2>编辑图片信息</h2><img src={dataUrls[editing.id]} alt={editing.name}/><label>名称<input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}/></label><label>说明<textarea rows={3} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))}/></label><label>标签<input value={draft.tags} onChange={(event) => setDraft((value) => ({ ...value, tags: event.target.value }))} placeholder="用逗号分隔"/></label><div className="image-edit-actions"><button className="button secondary" onClick={() => setEditing(null)}>取消</button><button className="button primary" onClick={() => void saveEdit()}>保存</button></div></section></div>}
  </div>;
}
