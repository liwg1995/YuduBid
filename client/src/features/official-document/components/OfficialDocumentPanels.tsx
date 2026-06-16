import type { OfficialDocumentTemplate } from '../../../shared/prompts/officialDocument';
import type { OfficialDocumentState } from '../types';

export function OfficialDocumentTaskStatus({ task }: { task?: OfficialDocumentState['task'] }) {
  if (!task) return null;
  const progress = Math.max(0, Math.min(100, Math.round(task.progress || 0)));
  const runningHint = getTaskRunningHint(task.type);
  return (
    <div className={`official-document-task is-${task.status}`}>
      <div className="official-document-task-head">
        <div>
          <strong>{task.status === 'running' ? '处理中' : task.status === 'success' ? '已完成' : '处理失败'}</strong>
          <span>{task.message}</span>
          {task.status === 'running' && <small>{runningHint}</small>}
        </div>
        <em>{progress}%</em>
      </div>
      <div className="official-document-task-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function getTaskRunningHint(type?: NonNullable<OfficialDocumentState['task']>['type']) {
  if (type === 'draft') return '正在等待文本模型返回完整草稿，长材料会多花一些时间，页面可保持打开。';
  if (type === 'check') return '正在等待文本模型返回检查意见，完成后会自动展示结果。';
  if (type === 'polish') return '正在等待文本模型返回润色版本，完成后会自动更新正文。';
  if (type === 'rewrite') return '正在等待文本模型按要求改写，完成后会自动更新正文。';
  if (type === 'extract') return '正在等待文本模型提取结构化要素，完成后会自动回填。';
  return '任务正在后台处理中，完成后会自动刷新结果。';
}

interface OfficialDocumentTemplateActionProps {
  templates: OfficialDocumentTemplate[];
  disabled: boolean;
  onApply: (template: OfficialDocumentTemplate) => void | Promise<void>;
  onPreview?: (template: OfficialDocumentTemplate) => void;
}

export function OfficialDocumentTemplateGallery({
  templates,
  disabled,
  actionLabel,
  onApply,
  onPreview,
}: OfficialDocumentTemplateActionProps & { actionLabel: string }) {
  return (
    <div className="official-document-template-gallery">
      {templates.map((template) => (
        <article key={template.id}>
          <div className="official-document-template-gallery-head">
            <div>
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </div>
            <div className="official-document-template-actions">
              {onPreview && (
                <button type="button" className="secondary-action" onClick={() => onPreview(template)}>预览</button>
              )}
              <button type="button" className="secondary-action" onClick={() => void onApply(template)} disabled={disabled}>{actionLabel}</button>
            </div>
          </div>
          <div className="official-document-template-gallery-body">
            <div className="official-document-template-meta">
              <span>{template.documentType}</span>
              <span>{template.audienceRelation}</span>
            </div>
            <div className="official-document-template-outline">
              <span>结构步骤</span>
              <ol>
                {template.outline.map((item) => <li key={item}>{item}</li>)}
              </ol>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function OfficialDocumentTemplateShortcutList({ templates, disabled, onApply }: OfficialDocumentTemplateActionProps) {
  return (
    <div className="official-document-template-list">
      {templates.map((template) => (
        <article key={template.id}>
          <div>
            <strong>{template.name}</strong>
            <span>{template.description}</span>
          </div>
          <button type="button" className="secondary-action" onClick={() => void onApply(template)} disabled={disabled}>套用</button>
        </article>
      ))}
    </div>
  );
}

export function OfficialDocumentRevisionList({
  revisions,
  onRestore,
}: {
  revisions: OfficialDocumentState['revisions'];
  onRestore: (content: string) => void | Promise<void>;
}) {
  if (!revisions.length) {
    return <div className="official-document-revision-empty">生成、润色或点击“保存版本”后会在这里保留历史草稿。</div>;
  }

  return (
    <div className="official-document-revision-list">
      {revisions.map((revision) => (
        <article key={revision.id}>
          <div>
            <strong>{revision.title}</strong>
            <span>{revision.summary || formatRevisionTime(revision.created_at)}</span>
            <small>{formatRevisionTime(revision.created_at)}</small>
          </div>
          <button type="button" className="secondary-action" onClick={() => void onRestore(revision.content)}>恢复</button>
        </article>
      ))}
    </div>
  );
}

export function OfficialDocumentWorkflowSteps({ steps }: { steps: Array<{ title: string; text: string }> }) {
  return (
    <div className="official-document-step-list">
      {steps.map((step, index) => (
        <article key={step.title}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.text}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatRevisionTime(value: string) {
  if (!value) return '未记录时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
