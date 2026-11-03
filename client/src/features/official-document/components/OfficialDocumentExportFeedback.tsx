import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import BusinessTaskProgress from '../../../shared/ui/BusinessTaskProgress';
import './officialDocumentExportFeedback.css';

interface Props { running: boolean; progress: number; message: string; error: string; }

export default function OfficialDocumentExportFeedback({ running, progress, message, error }: Props) {
  if (!message) return null;
  return <div className={`official-document-export-feedback ${error ? 'is-error' : running ? 'is-running' : 'is-success'}`} role={error ? 'alert' : 'status'}>
    <div className="official-document-export-feedback-copy">
      {!running && (error ? <CrossCircledIcon aria-hidden="true" /> : <CheckCircledIcon aria-hidden="true" />)}
      <strong>{error ? '导出失败' : running ? '正在导出 Word' : '导出完成'}</strong>
      <span>{message}</span>
    </div>
    {running && <BusinessTaskProgress label="Word 导出进度" percent={progress} status="active" />}
  </div>;
}
