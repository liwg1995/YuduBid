import KnowledgeImageThumbnail from './KnowledgeImageThumbnail';
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeImage, KnowledgeImageFolder } from '../../../shared/types/contracts/knowledgeBase';
import { useKnowledgeImages } from '../hooks/useKnowledgeImages';
import '../imageKnowledgeBase.css';
import '../pages/imageLibraryDesign.css';

interface KnowledgeImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (image: KnowledgeImage) => void;
}

export default function KnowledgeImagePicker({ open, onOpenChange, onSelect }: KnowledgeImagePickerProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const [folders, setFolders] = useState<KnowledgeImageFolder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState('');
  const [query, setQuery] = useState('');

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true); setFoldersError('');
    try {
      const next = await window.yibiao!.knowledgeImage.listFolders();
      setFolders(next);
      setFolderId((current) => next.some((item) => item.id === current) ? current : next[0]?.id || '');
    } catch (error) { setFoldersError(error instanceof Error ? error.message : '读取图片文件夹失败'); }
    finally { setFoldersLoading(false); }
  }, []);
  useEffect(() => { if (open) void loadFolders(); }, [open, loadFolders]);
  const { images, thumbnails, loading, error, reload } = useKnowledgeImages(folderId, query, open && !foldersLoading && !foldersError);

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="detail-help-modal"/><Dialog.Content className="detail-help-card knowledge-image-picker" onOpenAutoFocus={(event) => { event.preventDefault(); returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; searchInput.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus({ preventScroll: true }); }}>
    <header className="detail-help-head"><div><Dialog.Title>插入图片知识库素材</Dialog.Title><Dialog.Description>选择图片后会在当前光标位置插入本地 Markdown 引用。</Dialog.Description></div><Dialog.Close type="button" className="detail-help-close" aria-label="关闭图片选择器">×</Dialog.Close></header>
    <div className="knowledge-image-picker-filters"><select aria-label="图片文件夹" disabled={foldersLoading || Boolean(foldersError)} value={folderId} onChange={(event) => { setFolderId(event.target.value); setQuery(''); }}>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select><input ref={searchInput} aria-label="搜索图片" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图片"/></div>
    {foldersLoading || loading ? <div className="image-library-empty" role="status">正在读取图片…</div> : foldersError || error ? <div className="image-library-empty" role="alert"><strong>读取图片库失败</strong><p>{foldersError || error}</p><button type="button" onClick={() => void (foldersError ? loadFolders() : reload())}>重新读取</button></div> : !folders.length ? <div className="image-library-empty">图片知识库暂无文件夹，请先到图片知识库导入素材。</div> : !images.length ? <div className="image-library-empty">{query ? <>没有匹配的图片。<button type="button" onClick={() => setQuery('')}>清除搜索</button></> : '当前文件夹没有图片，请先在图片素材库导入。'}</div> : <div className="knowledge-image-picker-grid">{images.map((image) => <button type="button" key={image.id} onClick={() => onSelect(image)}><KnowledgeImageThumbnail name={image.name} src={thumbnails[image.id]} loading={!(image.id in thumbnails)} /><strong>{image.name}</strong><small>{image.tags.join(' · ') || image.description || '无标签'}</small></button>)}</div>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
