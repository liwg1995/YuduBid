export type SoftwareCopyrightJourneyStatus = 'done' | 'current' | 'upcoming';

export interface SoftwareCopyrightJourneyStep {
  id: string;
  number: number;
  label: string;
  description: string;
  status: SoftwareCopyrightJourneyStatus;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

interface SoftwareCopyrightJourneyGuideProps {
  steps: SoftwareCopyrightJourneyStep[];
}

export function SoftwareCopyrightJourneyGuide({ steps }: SoftwareCopyrightJourneyGuideProps) {
  const current = steps.find((step) => step.status === 'current');

  return (
    <section className="software-copyright-journey" aria-labelledby="software-copyright-journey-title">
      <div className="software-copyright-journey-head">
        <div>
          <span className="section-kicker">首次使用引导</span>
          <h3 id="software-copyright-journey-title">按顺序完成软著材料</h3>
        </div>
        {current && <span className="software-copyright-journey-current">当前：{current.label}</span>}
      </div>
      <ol className="software-copyright-journey-steps">
        {steps.map((step) => (
          <li className={`is-${step.status}`} key={step.id}>
            <span className="software-copyright-journey-number">{step.status === 'done' ? '✓' : step.number}</span>
            <span className="software-copyright-journey-copy">
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </span>
          </li>
        ))}
      </ol>
      {current?.onAction && (
        <div className="software-copyright-journey-action">
          <div>
            <strong>下一步</strong>
            <span>{current.description}</span>
          </div>
          <button type="button" className="primary-action" onClick={current.onAction} disabled={current.disabled}>
            {current.actionLabel || `前往${current.label}`}
          </button>
        </div>
      )}
    </section>
  );
}
