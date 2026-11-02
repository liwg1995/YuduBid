import { Progress } from 'antd';
import EnterpriseUiProvider from './EnterpriseUiProvider';
import './taskProgressSummary.css';
import { normalizeTaskProgress, taskProgressStatusLabels, type TaskProgressStatus } from './taskProgressState';

interface Props {
  label: string;
  detail?: string;
  percent: number;
  status?: TaskProgressStatus;
}

/** 阶段说明、计数和进度使用固定层次；百分比由标准控件统一对齐。 */
export default function TaskProgressSummary({ label, detail, percent, status = 'normal' }: Props) {
  const value = normalizeTaskProgress(percent) ?? 0;
  const stateLabel = taskProgressStatusLabels[status];
  const detailText = detail?.trim();
  const displayDetail = detailText && !/%$/.test(detailText) && !/\/\s*0$/.test(detailText) ? detailText.replace(/\s*\/\s*/g, ' / ') : undefined;
  if (status === 'exception') return <div className="yb-task-progress-summary is-exception yb-progress-complete" role="status"><span>{label}</span>{displayDetail && <span>{displayDetail}</span>}<span className="yb-progress-status">失败</span><span>中止于 {value}%</span></div>;
  if (status === 'success') return <div className="yb-task-progress-summary is-success yb-progress-complete" role="status"><span>{label}</span>{displayDetail && <span>{displayDetail}</span>}<span className="yb-progress-status">已完成</span></div>;
  return <EnterpriseUiProvider><div className={`yb-task-progress-summary is-${status}`} role="group" aria-label={`${label}进度`}>
    <div className="yb-task-progress-caption"><span title={label}>{label}</span><span className="yb-task-progress-meta">{displayDetail && <span title={displayDetail}>{displayDetail}</span>}{stateLabel && <span className="yb-progress-status">{stateLabel}</span>}</span></div>
    <div>
      <Progress aria-label={label} percent={value} status={status} size="small" format={() => `${value}%`} percentPosition={{ align: 'end', type: 'outer' }} />
    </div>
  </div></EnterpriseUiProvider>;
}
