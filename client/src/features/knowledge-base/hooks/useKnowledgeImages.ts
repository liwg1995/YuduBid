import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeImage } from '../../../shared/types/contracts/knowledgeBase';

/** 切换分类或搜索后，只接收当前查询的结果；单张缩略图失败不隐藏其余素材。 */
export function useKnowledgeImages(folderId: string, query: string, enabled = true) {
  const scope = JSON.stringify([folderId, query]);
  const request = useRef(0);
  const [state, setState] = useState({ scope: '', images: [] as KnowledgeImage[], thumbnails: {} as Record<string, string>, loading: false, error: '' });
  const reload = useCallback(async () => {
    const id = ++request.current;
    if (!enabled || !folderId) {
      setState({ scope, images: [], thumbnails: {}, loading: false, error: '' });
      return;
    }
    setState({ scope, images: [], thumbnails: {}, loading: true, error: '' });
    try {
      const images = await window.yibiao!.knowledgeImage.list(folderId, query);
      if (id !== request.current) return;
      setState({ scope, images, thumbnails: {}, loading: false, error: '' });
      const entries = await Promise.all(images.map(async (image) => {
        try { return [image.id, await window.yibiao!.knowledgeImage.getThumbnailDataUrl(image.id)] as const; }
        catch { return [image.id, ''] as const; }
      }));
      if (id === request.current) setState({ scope, images, thumbnails: Object.fromEntries(entries), loading: false, error: '' });
    } catch (error) {
      if (id === request.current) setState({ scope, images: [], thumbnails: {}, loading: false, error: error instanceof Error ? error.message : '读取图片失败' });
    }
  }, [enabled, folderId, query, scope]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), query ? 180 : 0);
    return () => { window.clearTimeout(timer); request.current += 1; };
  }, [reload, query]);
  const current: Pick<typeof state, 'images' | 'thumbnails' | 'loading' | 'error'> = state.scope === scope ? state : { images: [], thumbnails: {}, loading: enabled && Boolean(folderId), error: '' };
  return { ...current, reload };
}
