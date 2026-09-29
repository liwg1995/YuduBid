import { DocxEditor, useEditorState } from '@docx-editor.dev/react';
import '@docx-editor.dev/core/styles/editor.css';
import { useEffect, useRef, useState } from 'react';
import './contentWordPreview.css';

interface ContentWordPreviewProps {
  sectionId: string;
  title: string;
  content: string;
  projectName: string;
  documentProfile?: 'feasibility-report';
}

function WordDocumentStatus() {
  const error = useEditorState((snapshot) => snapshot.parseError);
  const loading = useEditorState((snapshot) => snapshot.isLoading || Boolean(snapshot.isOpening));
  if (!error && !loading) return null;
  return <div className="content-word-status" role={error ? 'alert' : 'status'}>{error || '正在打开 Word 预览…'}</div>;
}

export default function ContentWordPreview({ sectionId, title, content, projectName, documentProfile }: ContentWordPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<Uint8Array>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? preview.clientHeight : 1;
      const deltaY = event.deltaY * unit;
      const deltaX = event.deltaX * unit;
      const canScrollY = (deltaY < 0 && preview.scrollTop > 0)
        || (deltaY > 0 && preview.scrollTop + preview.clientHeight < preview.scrollHeight - 1);
      const canScrollX = (deltaX < 0 && preview.scrollLeft > 0)
        || (deltaX > 0 && preview.scrollLeft + preview.clientWidth < preview.scrollWidth - 1);
      if (!canScrollY && !canScrollX) return;

      event.preventDefault();
      event.stopPropagation();
      preview.scrollBy({ top: deltaY, left: deltaX });
    };

    preview.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => preview.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  useEffect(() => {
    let active = true;
    setDocument(undefined);
    setLoading(true);
    setError('');
    window.yibiao?.export.previewWord({
      project_name: projectName,
      documentProfile,
      outline: [{ id: sectionId, title, description: '', content }],
    }).then((bytes) => {
      if (active) setDocument(new Uint8Array(bytes));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sectionId, title, content, projectName, documentProfile, version]);

  return <div className="content-word-preview" ref={previewRef}>
    {loading ? <div className="content-word-status" role="status">正在生成 Word 预览…</div> : null}
    {error ? <div className="content-word-status" role="alert"><strong>Word 预览失败</strong><p>{error}</p><button type="button" className="secondary-action" onClick={() => setVersion((value) => value + 1)}>重试</button></div> : null}
    {document ? <DocxEditor className="content-word-editor" document={document} mode="view" chrome={false} navigation={false} rulers={false} locale="zh-CN"><WordDocumentStatus /></DocxEditor> : null}
  </div>;
}
