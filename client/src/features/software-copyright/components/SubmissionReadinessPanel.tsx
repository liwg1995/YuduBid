export type SubmissionReadinessStatus = 'ready' | 'warning' | 'blocked' | 'pending';

export type SubmissionReadinessTarget =
  | 'source'
  | 'fields'
  | 'manual'
  | 'code'
  | 'settings'
  | 'task'
  | 'drafts'
  | 'submission';

export interface SubmissionReadinessItem {
  id: string;
  label: string;
  summary: string;
  status: SubmissionReadinessStatus;
  target: SubmissionReadinessTarget;
}

interface SubmissionReadinessPanelProps {
  items: SubmissionReadinessItem[];
  checking: boolean;
  canCheck: boolean;
  onCheck: () => void;
  onNavigate: (target: SubmissionReadinessTarget) => void;
}

const statusLabels: Record<SubmissionReadinessStatus, string> = {
  ready: '就绪',
  warning: '需核对',
  blocked: '待处理',
  pending: '未完成',
};

export function SubmissionReadinessPanel({ items, checking, canCheck, onCheck, onNavigate }: SubmissionReadinessPanelProps) {
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const warningCount = items.filter((item) => item.status === 'warning').length;
  const overallStatus = blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : readyCount === items.length ? 'ready' : 'pending';

  return (
    <section className={`software-copyright-readiness is-${overallStatus}`} aria-labelledby="software-copyright-readiness-title">
      <div className="software-copyright-readiness-head">
        <div>
          <span className="section-kicker">提交前总检</span>
          <h3 id="software-copyright-readiness-title">材料就绪清单</h3>
        </div>
        <div className="software-copyright-readiness-score" aria-label={`${readyCount} 项就绪，共 ${items.length} 项`}>
          <strong>{readyCount}</strong>
          <span>/ {items.length} 项就绪</span>
        </div>
      </div>

      <div className="software-copyright-readiness-summary" aria-live="polite">
        {blockedCount > 0
          ? `${blockedCount} 项需要先处理`
          : warningCount > 0
            ? `${warningCount} 项需要人工核对`
            : readyCount === items.length
              ? '当前材料已具备导出条件'
              : '请继续完成材料准备'}
      </div>

      <div className="software-copyright-readiness-list">
        {items.map((item) => (
          <button
            type="button"
            className={`software-copyright-readiness-item is-${item.status}`}
            onClick={() => onNavigate(item.target)}
            key={item.id}
          >
            <span className="software-copyright-readiness-state">{statusLabels[item.status]}</span>
            <span className="software-copyright-readiness-copy">
              <strong>{item.label}</strong>
              <small>{item.summary}</small>
            </span>
            <span className="software-copyright-readiness-action">去处理</span>
          </button>
        ))}
      </div>

      <button type="button" className="secondary-action software-copyright-readiness-check" onClick={onCheck} disabled={!canCheck || checking}>
        {checking ? '检查中...' : '重新检查草稿与一致性'}
      </button>
    </section>
  );
}
