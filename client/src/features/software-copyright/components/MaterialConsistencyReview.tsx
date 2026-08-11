import type { SoftwareCopyrightConsistencyCheck } from '../types';

interface MaterialConsistencyReviewProps {
  checks: SoftwareCopyrightConsistencyCheck[];
  onNavigate: (check: SoftwareCopyrightConsistencyCheck) => void;
}
const statusLabels: Record<SoftwareCopyrightConsistencyCheck['status'], string> = {
  pass: '一致',
  fail: '不一致',
  pending: '待检查',
};

export function MaterialConsistencyReview({ checks, onNavigate }: MaterialConsistencyReviewProps) {
  const passedCount = checks.filter((check) => check.status === 'pass').length;
  const failedCount = checks.filter((check) => check.status === 'fail').length;

  return (
    <div className={`software-copyright-consistency ${failedCount ? 'is-failed' : 'is-passed'}`}>
      <div className="software-copyright-consistency-head">
        <div>
          <strong>跨材料一致性</strong>
          <span>核对登记字段、申请表、手册和代码清单</span>
        </div>
        <span>{passedCount}/{checks.length} 项一致</span>
      </div>
      <div className="software-copyright-consistency-list">
        {checks.map((check) => (
          <button type="button" className={`is-${check.status}`} onClick={() => onNavigate(check)} key={check.id}>
            <span className="software-copyright-consistency-status">{statusLabels[check.status]}</span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
            <em>去核对</em>
          </button>
        ))}
      </div>
    </div>
  );
}
