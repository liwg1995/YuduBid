import { useState } from 'react';
import ExportFormatPage from './ExportFormatPage';
import MyTemplatesPage from './MyTemplatesPage';
import '../../../styles/feature-export-format.css';

type EditorState = { mode: 'create' } | { mode: 'edit'; templateId: string } | null;

function BidTemplateManagementPage() {
  const [editor, setEditor] = useState<EditorState>(null);

  if (editor?.mode === 'create') {
    return <ExportFormatPage mode="create" onBack={() => setEditor(null)} />;
  }

  if (editor?.mode === 'edit') {
    return <ExportFormatPage mode="edit" templateId={editor.templateId} onBack={() => setEditor(null)} />;
  }

  return (
    <MyTemplatesPage
      onCreateTemplate={() => setEditor({ mode: 'create' })}
      onEditTemplate={(templateId) => setEditor({ mode: 'edit', templateId })}
    />
  );
}

export default BidTemplateManagementPage;
