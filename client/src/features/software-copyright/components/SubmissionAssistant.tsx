import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SoftwareCopyrightManualReviewChecks, SoftwareCopyrightSubmissionFieldMapping, SoftwareCopyrightSubmissionReview, SoftwareCopyrightSubmissionStatus } from '../types';

interface SubmissionAssistantProps {
  revision?: string;
  onReviewSaved?: () => void;
  onReviewChanged?: (ready: boolean) => void;
}

const statusLabels: Record<SoftwareCopyrightSubmissionStatus, string> = {
  pass: '通过',
  warning: '需复核',
  blocked: '待处理',
  pending: '待完成',
};

const emptyManualReviewChecks: SoftwareCopyrightManualReviewChecks = {
  ownership: false,
  identity: false,
  dates: false,
  sourceEvidence: false,
  localRequirements: false,
};

const manualReviewItems: Array<{ key: keyof SoftwareCopyrightManualReviewChecks; label: string; description: string }> = [
  { key: 'ownership', label: '软件权属', description: '已核对职务开发、委托或合作开发关系及相关权属材料。' },
  { key: 'identity', label: '申请主体与证件', description: '著作权人名称、证件名称和证件号码与实际提交主体一致。' },
  { key: 'dates', label: '关键日期', description: '开发完成日期、首次发表日期及相关证明材料能够相互印证。' },
  { key: 'sourceEvidence', label: '源码与创作证据', description: '已保留源码仓库、提交记录、设计文档和人工修改记录等证据。' },
  { key: 'localRequirements', label: '当地受理要求', description: '已核对当前受理机构对页数、格式、签章和材料组成的最新要求。' },
];

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function SubmissionAssistant({ revision, onReviewSaved, onReviewChanged }: SubmissionAssistantProps) {
  const { showToast } = useToast();
  const [review, setReview] = useState<SoftwareCopyrightSubmissionReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [copyingKey, setCopyingKey] = useState('');
  const [manualReviewOpen, setManualReviewOpen] = useState(false);
  const [manualReviewSaving, setManualReviewSaving] = useState(false);
  const [manualReviewChecks, setManualReviewChecks] = useState<SoftwareCopyrightManualReviewChecks>(emptyManualReviewChecks);
  const [manualReviewNotes, setManualReviewNotes] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.yibiao?.softwareCopyright.getSubmissionReview()
      .then((result) => active && setReview(result || null))
      .catch((error) => active && showToast(error.message || '读取申报检查结果失败', 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [revision, showToast]);

  useEffect(() => {
    if (!review?.manualReview) return;
    setManualReviewChecks({ ...emptyManualReviewChecks, ...review.manualReview.checks });
    setManualReviewNotes(review.manualReview.notes || '');
  }, [review]);

  useEffect(() => {
    onReviewChanged?.(Boolean(review?.readyToSubmit));
  }, [onReviewChanged, review?.readyToSubmit]);

  const groups = useMemo(() => {
    const grouped = new Map<string, SoftwareCopyrightSubmissionFieldMapping[]>();
    for (const item of review?.fieldMappings || []) {
      grouped.set(item.group, [...(grouped.get(item.group) || []), item]);
    }
    return Array.from(grouped.entries());
  }, [review]);

  async function handleCopy(item: SoftwareCopyrightSubmissionFieldMapping) {
    if (!item.value) return;
    setCopyingKey(String(item.key));
    try {
      await copyText(item.value);
      showToast(`已复制：${item.label}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制字段失败', 'error');
    } finally {
      setCopyingKey('');
    }
  }

  async function handleGenerateGuide() {
    setGenerating(true);
    try {
      const result = await window.yibiao?.softwareCopyright.generateSubmissionGuide();
      if (result) setReview(result);
      showToast('申报提交说明已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成申报提交说明失败', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleOpenGuideDirectory() {
    setOpening(true);
    try {
      await window.yibiao?.softwareCopyright.openSubmissionGuideDirectory();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开申报辅助目录失败', 'error');
    } finally {
      setOpening(false);
    }
  }

  async function handleConfirmManualReview() {
    setManualReviewSaving(true);
    try {
      await window.yibiao?.softwareCopyright.saveManualReview({ checks: manualReviewChecks, notes: manualReviewNotes });
      const result = await window.yibiao?.softwareCopyright.getSubmissionReview();
      if (result) setReview(result);
      onReviewSaved?.();
      setManualReviewOpen(false);
      showToast('人工复核已完成，并绑定当前确认快照', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存人工复核结果失败', 'error');
    } finally {
      setManualReviewSaving(false);
    }
  }

  if (loading && !review) return <div className="software-copyright-empty">正在生成申报映射与风险清单...</div>;
  if (!review) return <div className="software-copyright-empty">暂时无法读取申报辅助信息，请重新进入页面。</div>;

  return (
    <div className="software-copyright-submission" aria-label="申报辅助与提交前检查">
      <div className={`software-copyright-submission-overview is-${review.overallStatus}`}>
        <div>
          <strong>{review.readyToSubmit ? '具备提交准备条件' : '尚有事项需处理'}</strong>
          <span>检查时间 {new Date(review.checkedAt).toLocaleString()}</span>
        </div>
        <div className="software-copyright-submission-counts" aria-label="提交检查统计">
          <span><strong>{review.counts.pass}</strong>通过</span>
          <span><strong>{review.counts.warning}</strong>复核</span>
          <span><strong>{review.counts.blocked}</strong>处理</span>
          <span><strong>{review.counts.pending}</strong>未完成</span>
        </div>
      </div>

      <section className="software-copyright-submission-section">
        <header>
          <div>
            <strong>官网填报字段</strong>
            <span>按常见登记表字段分组，复制后请以实际系统为准</span>
          </div>
        </header>
        <div className="software-copyright-submission-groups">
          {groups.map(([group, items], groupIndex) => {
            const blocked = items.filter((item) => item.status === 'blocked').length;
            const warning = items.filter((item) => item.status === 'warning').length;
            return (
              <details open={groupIndex === 0} key={group}>
                <summary>
                  <span>{group}</span>
                  <em>{blocked ? `${blocked} 项待处理` : warning ? `${warning} 项需精简` : '全部通过'}</em>
                </summary>
                <div className="software-copyright-submission-fields">
                  {items.map((item) => (
                    <article className={`is-${item.status}`} key={String(item.key)}>
                      <div className="software-copyright-submission-field-head">
                        <strong>{item.label}</strong>
                        <span>{item.maxLength ? `${item.length} / ${item.maxLength}` : `${item.length} 字符`}</span>
                      </div>
                      <p>{item.value || '待填写'}</p>
                      <small>{item.message}</small>
                      <button type="button" className="secondary-action" disabled={!item.value || copyingKey === item.key} onClick={() => void handleCopy(item)}>
                        {copyingKey === item.key ? '复制中...' : '复制字段'}
                      </button>
                    </article>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="software-copyright-submission-section">
        <header>
          <div>
            <strong>提交前检查</strong>
            <span>导出前核对项目源码、官网字段、确认快照和人工复核</span>
          </div>
        </header>
        <div className="software-copyright-submission-checks">
          {review.checks.map((item) => (
            <article className={`is-${item.status}`} key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <em>{statusLabels[item.status]}</em>
              </div>
              <p>{item.detail}</p>
              <small>{item.recommendation}</small>
              {item.id === 'manual-review' && (
                <button type="button" className="secondary-action" onClick={() => setManualReviewOpen((current) => !current)}>
                  {review.manualReview.isCurrent ? '查看复核记录' : '开始复核'}
                </button>
              )}
            </article>
          ))}
        </div>
        {manualReviewOpen && (
          <div className="software-copyright-manual-review">
            <div className="software-copyright-manual-review-head">
              <div>
                <strong>人工复核清单</strong>
                <span>复核结果将绑定当前草稿确认快照；字段或草稿变化后需要重新复核。</span>
              </div>
              {review.manualReview.confirmedAt && <em>上次确认：{new Date(review.manualReview.confirmedAt).toLocaleString()}</em>}
            </div>
            <div className="software-copyright-manual-review-items">
              {manualReviewItems.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={manualReviewChecks[item.key]}
                    onChange={(event) => setManualReviewChecks((current) => ({ ...current, [item.key]: event.target.checked }))}
                  />
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </label>
              ))}
            </div>
            <label className="software-copyright-manual-review-notes">
              <span>证据位置或复核备注（可选）</span>
              <textarea
                value={manualReviewNotes}
                maxLength={500}
                placeholder="例如：权属协议位于项目资料/权属证明；源码提交记录已归档。"
                onChange={(event) => setManualReviewNotes(event.target.value)}
              />
            </label>
            {!review.manualReview.currentSnapshotId && <p>请先完成草稿检查并点击“确认草稿”，再保存人工复核结果。</p>}
            <div className="software-copyright-manual-review-actions">
              <button type="button" className="secondary-action" onClick={() => setManualReviewOpen(false)}>收起</button>
              <button
                type="button"
                className="primary-action"
                disabled={manualReviewSaving || !review.manualReview.currentSnapshotId || !Object.values(manualReviewChecks).every(Boolean)}
                onClick={() => void handleConfirmManualReview()}
              >
                {manualReviewSaving ? '保存中...' : '确认已完成人工复核'}
              </button>
            </div>
          </div>
        )}
      </section>

      {review.latestBatch && review.deliveryChecks.length > 0 && (
        <section className="software-copyright-submission-section">
          <header>
            <div>
              <strong>交付包校验</strong>
              <span>正式资料导出后自动核对文件完整性与命名，不属于导出前置步骤</span>
            </div>
          </header>
          <div className="software-copyright-submission-checks">
            {review.deliveryChecks.map((item) => (
              <article className={`is-${item.status}`} key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <em>{statusLabels[item.status]}</em>
                </div>
                <p>{item.detail}</p>
                <small>{item.recommendation}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="software-copyright-submission-guide">
        <div>
          <strong>申报提交说明</strong>
          <span>生成包含字段映射、风险清单和提交顺序的 Markdown 文档</span>
          {review.latestGuide && <code title={review.latestGuide.path}>{review.latestGuide.path}</code>}
        </div>
        <div>
          <button type="button" className="primary-action" disabled={generating} onClick={() => void handleGenerateGuide()}>
            {generating ? '生成中...' : '生成申报说明'}
          </button>
          <button type="button" className="secondary-action" disabled={opening} onClick={() => void handleOpenGuideDirectory()}>
            {opening ? '打开中...' : '打开申报辅助目录'}
          </button>
        </div>
      </section>
    </div>
  );
}
