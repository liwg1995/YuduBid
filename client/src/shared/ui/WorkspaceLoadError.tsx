import { ExclamationCircleOutlined } from '@ant-design/icons';
import { toChineseErrorMessage } from '../utils/userFacingError';
import './workspaceLoadError.css';

/** 读取失败与空数据分开；重试仅重新读取当前工作区，不刷新整个应用。 */
export default function WorkspaceLoadError({ message, onRetry, title = '工作区读取失败' }: { message: string; onRetry: () => void; title?: string }) {
  return <section className="yb-workspace-load-error" role="alert">
    <div className="yb-workspace-load-error-content">
      <ExclamationCircleOutlined className="yb-workspace-load-error-icon" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{toChineseErrorMessage(message, '读取失败，请重新读取当前工作区。')}</p>
      <button type="button" className="secondary-action" onClick={onRetry}>重新读取</button>
    </div>
  </section>;
}
