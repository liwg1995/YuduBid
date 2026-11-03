import { useEffect, useState } from 'react';

interface Props { name: string; src?: string; loading: boolean; }

export default function KnowledgeImageThumbnail({ name, src, loading }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />;
  return <span className="knowledge-image-thumbnail-state" role={loading ? 'status' : undefined}>{loading ? '正在读取缩略图…' : '缩略图暂不可用'}</span>;
}
