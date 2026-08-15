interface ThesisTutorPreflightItem {
  label: string;
  status: 'ready' | 'warning' | 'missing';
  detail: string;
}

interface ThesisTutorPreflightCardProps {
  title: string;
  summary: string;
  score: number;
  label: string;
  tone: 'ready' | 'warning' | 'missing';
  items: ThesisTutorPreflightItem[];
  className?: string;
  modeTitle?: string;
  modeDescription?: string;
}

export function ThesisTutorPreflightCard({
  title,
  summary,
  score,
  label,
  tone,
  items,
  className = '',
  modeTitle,
  modeDescription,
}: ThesisTutorPreflightCardProps) {
  return (
    <div className={`thesis-tutor-drafting-preflight is-${tone}${className ? ` ${className}` : ''}`}>
      <div className="thesis-tutor-drafting-preflight-head">
        <div>
          <strong>{title}</strong>
          <span>{summary}</span>
        </div>
        <div className="thesis-tutor-drafting-score">
          <b>{score}%</b>
          <span>{label}</span>
        </div>
      </div>
      {modeTitle ? (
        <div className="thesis-tutor-drafting-mode">
          <strong>{modeTitle}</strong>
          {modeDescription ? <span>{modeDescription}</span> : null}
        </div>
      ) : null}
      <div className="thesis-tutor-drafting-checks">
        {items.map((item) => (
          <div key={item.label} className={`is-${item.status}`}>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ThesisTutorProgressCardProps {
  phase: string;
  message: string;
  progress: number;
  runningHint: string;
}

export function ThesisTutorProgressCard({ phase, message, progress, runningHint }: ThesisTutorProgressCardProps) {
  return (
    <div className={`thesis-tutor-task is-${phase}`}>
      <div className="thesis-tutor-task-head">
        <span>{message}</span>
        <strong>{progress}%</strong>
      </div>
      <div className="thesis-tutor-task-track" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
      {phase === 'running' ? <p>{runningHint}</p> : null}
    </div>
  );
}
