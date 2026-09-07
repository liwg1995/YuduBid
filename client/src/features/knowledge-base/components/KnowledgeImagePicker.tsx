import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { KnowledgeImage, KnowledgeImageFolder } from '../../../shared/types/contracts/knowledgeBase';
import { useToast } from '../../../shared/ui';

interface KnowledgeImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (image: KnowledgeImage) => void;
}

export default function KnowledgeImagePicker({ open, onOpenChange, onSelect }: KnowledgeImagePickerProps) {
  const { showToast } = useToast();
  const [folders, setFolders] = useState<KnowledgeImageFolder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [images, setImages] = useState<KnowledgeImage[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    window.yibiao?.knowledgeImage.listFolders().then((next) => {
      setFolders(next);
      setFolderId((current) => next.some((item) => item.id === current) ? current : next[0]?.id || '');
    }).catch((error) => showToast(error instanceof Error ? error.message : '加载图片文件夹失败', 'error'));
  }, [open, showToast]);

  useEffect(() => {
    if (!open || !folderId) { setImages([]); return; }
    let active = true;
    window.yibiao?.knowledgeImage.list(folderId, query).then(async (next) => {
      if (!active) return;
      setImages(next);
      const entries = await Promise.all(next.map(async (image) => [image.id, await window.yibiao!.knowledgeImage.getThumbnailDataUrl(image.id)] as const));
      if (active) setThumbnails((current) => ({ ...current, ...Object.fromEntries(entries) }));
    }).catch((error) => showToast(error instanceof Error ? error.message : '加载图片失败', 'error'));
    return () => { active = false; };
  }, [folderId, open, query, showToast]);

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="detail-help-modal"/><Dialog.Content className="detail-help-card knowledge-image-picker">
    <header className="detail-help-head"><div><Dialog.Title>插入图片知识库素材</Dialog.Title><Dialog.Description>选择图片后会在当前光标位置插入本地 Markdown 引用。</Dialog.Description></div><Dialog.Close type="button" className="detail-help-close">×</Dialog.Close></header>
    <div className="knowledge-image-picker-filters"><select value={folderId} onChange={(event) => setFolderId(event.target.value)}>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图片"/></div>
    {!folders.length ? <div className="image-library-empty">图片知识库暂无文件夹，请先到图片知识库导入素材。</div> : !images.length ? <div className="image-library-empty">没有匹配的图片。</div> : <div className="knowledge-image-picker-grid">{images.map((image) => <button type="button" key={image.id} onClick={() => onSelect(image)}><img src={thumbnails[image.id]} alt={image.name}/><strong>{image.name}</strong><small>{image.tags.join(' · ') || image.description || '无标签'}</small></button>)}</div>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
