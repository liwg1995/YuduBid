import { useEffect, useState } from 'react';
import { Image } from 'antd';
import type { KnowledgeImage } from '../types';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';

interface Props { image: KnowledgeImage | null; onClose: () => void; }

export default function KnowledgeImagePreview({ image, onClose }: Props) {
  const [result, setResult] = useState({ id: '', url: '', error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!image) return;
    let active = true;
    setResult({ id: image.id, url: '', error: '' });
    window.yibiao!.knowledgeImage.getDataUrl(image.id).then((url) => {
      if (!url) throw new Error('图片内容不可用');
      if (active) setResult({ id: image.id, url, error: '' });
    }).catch((error) => { if (active) setResult({ id: image.id, url: '', error: error instanceof Error ? error.message : '读取图片失败' }); });
    return () => { active = false; };
  }, [image?.id, retry]);
  const current = !image || image.id === result.id ? result : { url: '', error: '' };
  return <EnterpriseUiProvider><Image.PreviewGroup items={current.url ? [{ src: current.url, alt: image?.name }] : []} preview={{ open: Boolean(image), onOpenChange: (open) => { if (!open) onClose(); }, imageRender: (node) => current.url ? node : <div className="knowledge-image-preview-state" role={current.error ? 'alert' : 'status'}><strong>{current.error ? '图片读取失败' : '正在读取原图…'}</strong>{current.error && <><p>{current.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>重新读取</button></>}</div>, actionsRender: (node) => <><span className="knowledge-image-preview-name">{image?.name}</span>{current.url && node}</> }} /></EnterpriseUiProvider>;
}
