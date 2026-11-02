import TaskProgressSummary from './TaskProgressSummary';
import { getStoredUiAppearance } from '../uiAppearance';
import { normalizeTaskProgress, taskProgressStatusLabels, type TaskProgressStatus } from './taskProgressState';
import './businessTaskProgress.css';

/** 业务阶段进度不与浏览步骤混用；经典外观保留原生主题。 */
export default function BusinessTaskProgress({ label, percent, status = 'normal' }: { label: string; percent?: number; status?: TaskProgressStatus | 'paused' | 'stopped' }) {
  const value = normalizeTaskProgress(percent);
  if (status === 'paused' || status === 'stopped') return <div className={`yb-business-progress is-${status} yb-progress-complete`} role="status"><span>{label}</span><span className="yb-progress-status">{status === 'paused' ? '已暂停' : '已停止'}</span>{value !== undefined && <span>进度 {value}%</span>}</div>;
  const stateLabel = taskProgressStatusLabels[status];
  const pending = value === undefined;
  const showProgress = !pending || status === 'active';
  if (status === 'exception') return <div className="yb-business-progress is-exception yb-progress-complete" role="status"><span>{label}</span><span className="yb-progress-status">失败</span>{value !== undefined && <span>中止于 {value}%</span>}</div>;
  if (status === 'success') return <div className="yb-business-progress is-success yb-progress-complete" role="status"><span>{label}</span><span className="yb-progress-status">已完成</span></div>;
  return (
    <div className={`yb-business-progress is-${status}`}>
      {!pending && getStoredUiAppearance() === 'modern' ? (
        <TaskProgressSummary label={label} percent={value} status={status} />
      ) : (
        <div className="yb-business-progress-native">
          <div className="yb-business-progress-caption">
            <span>{label}</span>
            <span className="yb-progress-status">{stateLabel || (pending ? '等待阶段反馈' : '')}</span>
          </div>
          {showProgress && <progress value={value} max={100} aria-label={label} aria-valuetext={pending ? '进行中，暂无百分比' : `${stateLabel ? `${stateLabel}，` : ''}${value}%`} />}
          {showProgress && <span className="yb-business-progress-value">{pending ? '—' : `${value}%`}</span>}
        </div>
      )}
    </div>
  );
}
