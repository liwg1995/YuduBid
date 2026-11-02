import TaskProgressSummary from '../../../shared/ui/TaskProgressSummary';
import type { DuplicateAnalysisStatus } from '../../../shared/types';

interface Props {
  label: string;
  status: DuplicateAnalysisStatus;
  progress?: number;
  message?: string;
  failures?: Array<{ file_name: string; error?: string }>;
}

/** 进度表示处理量，只有成功状态才表示本维度完成；失败保留具体依据。 */
export default function DuplicateAnalysisFeedback({ label, status, progress = 0, message, failures = [] }: Props) {
  if (status === 'pending') return null;
  return <div className={`duplicate-dimension-feedback is-${status}`}>
    {status === 'running' || status === 'success'
      ? <TaskProgressSummary label={`${label}分析`} percent={status === 'success' ? 100 : progress} status={status === 'success' ? 'success' : 'active'} />
      : <strong role="alert">{label}分析未完成</strong>}
    {message && <p role={status === 'running' ? 'status' : undefined}>{message}</p>}
    {failures.length > 0 && <details open={status === 'error'}><summary>{failures.length} 项文件处理失败</summary><ul>{failures.map((file, index) => <li key={`${file.file_name}-${index}`}><strong>{file.file_name}</strong><span>{file.error || '未能完成处理，请重新查重或更换文件。'}</span></li>)}</ul></details>}
    {status === 'error' && <p>当前结果可能不完整，可点击“重新查重”重试，或返回“选择标书”调整文件。</p>}
  </div>;
}
