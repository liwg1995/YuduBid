import { useState } from 'react';
import ExportFormatPage from './ExportFormatPage';
import MyTemplatesPage from './MyTemplatesPage';
import '../../../styles/feature-export-format.css';

type EditorState = { mode: 'create' } | { mode: 'edit'; templateId: string } | null;

function BidTemplateManagementPage() {
  const [editor, setEditor] = useState<EditorState>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const closeEditor = () => { setEditor(null); setRefreshKey((value) => value + 1); };

  return <div className="template-management-page">
    <div className="template-management-list" hidden={Boolean(editor)}><MyTemplatesPage refreshKey={refreshKey} onCreateTemplate={() => setEditor({ mode: 'create' })} onEditTemplate={(templateId) => setEditor({ mode: 'edit', templateId })} /></div>
    {editor?.mode === 'create' && <ExportFormatPage mode="create" onBack={closeEditor} />}
    {editor?.mode === 'edit' && <ExportFormatPage mode="edit" templateId={editor.templateId} onBack={closeEditor} />}
  </div>;

}

export default BidTemplateManagementPage;
