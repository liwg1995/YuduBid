import './activityWaiting.css';

interface ActivityWaitingProps {
  title: string;
  description: string;
  progress?: number;
}

export function ActivityWaiting({ title, description, progress }: ActivityWaitingProps) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const displayedProgress = hasProgress ? Math.max(0, Math.min(100, Math.round(progress))) : 0;

  return (
    <div className="activity-waiting" role="status" aria-live="polite">
      <div className="activity-waiting-mark" aria-hidden="true"><span /><span /><span /></div>
      <strong>{title}</strong>
      <p>{description}</p>
      {hasProgress && <div className="activity-waiting-progress" role="progressbar" aria-label={title} aria-valuenow={displayedProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${displayedProgress}%` }} /></div>}
      {!hasProgress && <div className="activity-waiting-scan" aria-hidden="true"><span /></div>}
    </div>
  );
}
