import { useEffect, useState } from 'react';
import './contentWordPreview.css';

interface ContentWordPreviewProps {
  sectionId: string;
  title: string;
  content: string;
  projectName: string;
  documentProfile?: 'feasibility-report';
}

export default function ContentWordPreview({ sectionId, title, content, projectName, documentProfile }: ContentWordPreviewProps) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setHtml('');
    setLoading(true);
    setError('');
    window.yibiao?.export.previewWord({
      project_name: projectName,
      documentProfile,
      outline: [{ id: sectionId, title, description: '', content }],
    }).then((previewHtml) => {
      if (active) setHtml(previewHtml);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sectionId, title, content, projectName, documentProfile, version]);

  return <div className="content-word-preview">
    {loading ? <div className="content-word-status" role="status">正在生成 Word 预览…</div> : null}
    {error ? <div className="content-word-status" role="alert"><strong>Word 预览失败</strong><p>{error}</p><button type="button" className="secondary-action" onClick={() => setVersion((value) => value + 1)}>重试</button></div> : null}
    {html ? <article className="content-word-page" dangerouslySetInnerHTML={{ __html: html }} /> : null}
  </div>;
}
