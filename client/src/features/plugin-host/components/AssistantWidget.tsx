import * as Popover from '@radix-ui/react-popover';
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import logoUrl from '../../../../assets/assistant-chat.png';
import type { AssistantActionPresentation, AssistantActionResult, AssistantChatMessage, AssistantChatResult, AssistantHistoryResult, AssistantKnowledgeTargetConfirmationPresentation, AssistantKnowledgeUploadConfigurationPresentation, AssistantNavigationContext, AssistantOpportunityActionConfirmationPresentation, AssistantOpportunityBulkConfigurationPresentation, AssistantOpportunityDecisionConfigurationPresentation, AssistantOpportunityDecisionOutcome, AssistantOpportunityOption, AssistantOpportunitySelectionPresentation, AssistantOpportunitySelectionResult, AssistantOpportunityWorkflowStage, AssistantOutlineConfigurationPresentation, AssistantOutlineMode, AssistantProgressPresentation, AssistantProjectDeleteConfirmationPresentation, AssistantProjectDeleteResult, AssistantProjectOption, AssistantProjectSelectionPresentation, AssistantProjectSelectionResult, AssistantRejectionCheckConfigurationPresentation } from '../../../shared/types';
import type { AppMenuGroup } from '../../../shared/types/navigation';

const AssistantMarkdown = lazy(() => import('../../../shared/ui/MarkdownRenderer'));

const ASSISTANT_PLUGIN_ID = 'com.yudu.assistant';

interface AssistantWidgetProps {
  context: AssistantNavigationContext;
  navigationGroups: AppMenuGroup[];
}

interface AssistantQuickAction {
  label: string;
  message: string;
}

interface AssistantWidgetMessage extends AssistantChatMessage {
  reveal?: boolean;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function AssistantMessageContent({ message, selectingProjectId, selectingOpportunityId, deletingProjectId, actioningId, onSelect, onSelectOpportunity, onDelete, onAction, onOpportunityAction, onOpportunityDecisionUpdate, onOpportunityBulkUpdate, onStartOutline, onStartRejectionCheck, onUploadKnowledge, onKnowledgeTargetAction }: {
  message: AssistantWidgetMessage;
  selectingProjectId: string;
  selectingOpportunityId: string;
  deletingProjectId: string;
  actioningId: string;
  onSelect: (project: AssistantProjectOption) => void;
  onSelectOpportunity: (opportunity: AssistantOpportunityOption) => void;
  onDelete: (presentation: AssistantProjectDeleteConfirmationPresentation, confirmed: boolean) => void;
  onAction: (presentation: AssistantActionPresentation, confirmed: boolean) => void;
  onOpportunityAction: (presentation: AssistantOpportunityActionConfirmationPresentation, confirmed: boolean) => void;
  onOpportunityDecisionUpdate: (presentation: AssistantOpportunityDecisionConfigurationPresentation, values: Omit<AssistantOpportunityDecisionConfigurationPresentation, 'kind' | 'title' | 'opportunity'>) => void;
  onOpportunityBulkUpdate: (presentation: AssistantOpportunityBulkConfigurationPresentation, opportunityIds: string[], status: string, owner: string) => void;
  onStartOutline: (presentation: AssistantOutlineConfigurationPresentation, mode: AssistantOutlineMode, documentIds: string[]) => void;
  onStartRejectionCheck: (presentation: AssistantRejectionCheckConfigurationPresentation, checks: AssistantRejectionCheckConfigurationPresentation['checks']) => void;
  onUploadKnowledge: (presentation: AssistantKnowledgeUploadConfigurationPresentation, folderId: string) => void;
  onKnowledgeTargetAction: (presentation: AssistantKnowledgeTargetConfirmationPresentation, confirmed: boolean) => void;
}) {
  const [visibleContent, setVisibleContent] = useState(message.reveal ? '' : message.content);
  const [revealComplete, setRevealComplete] = useState(!message.reveal);

  useEffect(() => {
    if (!message.reveal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleContent(message.content);
      setRevealComplete(true);
      return;
    }
    let position = 0;
    const step = Math.max(1, Math.ceil(message.content.length / 90));
    const timer = window.setInterval(() => {
      position = Math.min(message.content.length, position + step);
      setVisibleContent(message.content.slice(0, position));
      if (position >= message.content.length) {
        window.clearInterval(timer);
        setRevealComplete(true);
      }
    }, 22);
    return () => window.clearInterval(timer);
  }, [message.content, message.reveal]);

  return (
    <div className="assistant-widget-message-body">
      {message.presentation?.kind !== 'progress' && (
        <Suspense fallback={<p className="assistant-widget-markdown-fallback">{visibleContent}</p>}>
          <AssistantMarkdown allowRawHtml={false}>{visibleContent}</AssistantMarkdown>
        </Suspense>
      )}
      {revealComplete && message.presentation?.kind === 'progress' && <AssistantProgress presentation={message.presentation} />}
      {revealComplete && message.presentation?.kind === 'project-selection' && (
        <AssistantProjectSelector
          presentation={message.presentation}
          selectingProjectId={selectingProjectId}
          onSelect={onSelect}
        />
      )}
      {revealComplete && message.presentation?.kind === 'project-delete-confirmation' && (
        <AssistantProjectDeleteConfirmation
          presentation={message.presentation}
          deletingProjectId={deletingProjectId}
          onAction={onDelete}
        />
      )}
      {revealComplete && message.presentation?.kind === 'opportunity-selection' && (
        <AssistantOpportunitySelector presentation={message.presentation} selectingOpportunityId={selectingOpportunityId} onSelect={onSelectOpportunity} />
      )}
      {revealComplete && message.presentation?.kind === 'opportunity-action-confirmation' && (
        <AssistantOpportunityActionCard presentation={message.presentation} actioningId={actioningId} onAction={onOpportunityAction} />
      )}
      {revealComplete && message.presentation?.kind === 'opportunity-decision-configuration' && (
        <AssistantOpportunityDecisionConfiguration presentation={message.presentation} actioningId={actioningId} onSave={onOpportunityDecisionUpdate} />
      )}
      {revealComplete && message.presentation?.kind === 'opportunity-bulk-configuration' && (
        <AssistantOpportunityBulkConfiguration presentation={message.presentation} actioningId={actioningId} onUpdate={onOpportunityBulkUpdate} />
      )}
      {revealComplete && (message.presentation?.kind === 'file-request' || message.presentation?.kind === 'action-confirmation') && (
        <AssistantActionCard presentation={message.presentation} actioningId={actioningId} onAction={onAction} />
      )}
      {revealComplete && message.presentation?.kind === 'outline-configuration' && (
        <AssistantOutlineConfiguration presentation={message.presentation} actioningId={actioningId} onStart={onStartOutline} />
      )}
      {revealComplete && message.presentation?.kind === 'rejection-check-configuration' && (
        <AssistantRejectionCheckConfiguration presentation={message.presentation} actioningId={actioningId} onStart={onStartRejectionCheck} />
      )}
      {revealComplete && message.presentation?.kind === 'knowledge-upload-configuration' && (
        <AssistantKnowledgeUploadConfiguration presentation={message.presentation} actioningId={actioningId} onUpload={onUploadKnowledge} />
      )}
      {revealComplete && message.presentation?.kind === 'knowledge-target-confirmation' && (
        <AssistantKnowledgeTargetConfirmation presentation={message.presentation} actioningId={actioningId} onAction={onKnowledgeTargetAction} />
      )}
    </div>
  );
}

const OPPORTUNITY_STATUS_LABELS: Record<AssistantOpportunityOption['status'], string> = {
  new: '新发现', review: '待评估', following: '跟进中', won: '已中标', abandoned: '已放弃', archived: '已归档',
};

function AssistantOpportunitySelector({ presentation, selectingOpportunityId, onSelect }: {
  presentation: AssistantOpportunitySelectionPresentation;
  selectingOpportunityId: string;
  onSelect: (opportunity: AssistantOpportunityOption) => void;
}) {
  return (
    <section className="assistant-widget-opportunity-selector" aria-label={presentation.title}>
      <strong>{presentation.title}</strong>
      <div>
        {presentation.opportunities.map((opportunity) => (
          <button className={opportunity.selected ? 'is-active' : ''} key={opportunity.id} type="button" disabled={Boolean(selectingOpportunityId)} onClick={() => onSelect(opportunity)}>
            <span><strong>{opportunity.title}</strong><small>{[OPPORTUNITY_STATUS_LABELS[opportunity.status], opportunity.owner, opportunity.deadline].filter(Boolean).join(' · ')}</small></span>
            <em>{selectingOpportunityId === opportunity.id ? '选择中...' : opportunity.selected ? '已选择' : '选择'}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function AssistantOpportunityActionCard({ presentation, actioningId, onAction }: {
  presentation: AssistantOpportunityActionConfirmationPresentation;
  actioningId: string;
  onAction: (presentation: AssistantOpportunityActionConfirmationPresentation, confirmed: boolean) => void;
}) {
  const busy = actioningId === `bid-opportunity.${presentation.action}`;
  return (
    <section className="assistant-widget-action-card is-opportunity" aria-label={presentation.title}>
      <div className="assistant-widget-action-icon" aria-hidden="true">{presentation.action.includes('import') ? '＋' : '🐾'}</div>
      <div className="assistant-widget-action-copy">
        <strong>{presentation.title}</strong>
        {presentation.opportunity && <small className="assistant-widget-action-target">{presentation.opportunity.title}</small>}
        <p>{presentation.description}</p>
        <div>
          <button type="button" disabled={Boolean(actioningId)} onClick={() => onAction(presentation, false)}>取消</button>
          <button className="is-primary" type="button" disabled={Boolean(actioningId)} onClick={() => onAction(presentation, true)}>{busy ? '处理中...' : presentation.confirmLabel}</button>
        </div>
      </div>
    </section>
  );
}

function toLocalDateTime(value: string) {
  return value ? value.slice(0, 16) : '';
}

function AssistantOpportunityDecisionConfiguration({ presentation, actioningId, onSave }: {
  presentation: AssistantOpportunityDecisionConfigurationPresentation;
  actioningId: string;
  onSave: (presentation: AssistantOpportunityDecisionConfigurationPresentation, values: Omit<AssistantOpportunityDecisionConfigurationPresentation, 'kind' | 'title' | 'opportunity'>) => void;
}) {
  const [workflowStage, setWorkflowStage] = useState<AssistantOpportunityWorkflowStage>(presentation.workflowStage);
  const [decisionOutcome, setDecisionOutcome] = useState<AssistantOpportunityDecisionOutcome>(presentation.decisionOutcome);
  const [decisionReason, setDecisionReason] = useState(presentation.decisionReason);
  const [decisionDueAt, setDecisionDueAt] = useState(toLocalDateTime(presentation.decisionDueAt));
  const [nextAction, setNextAction] = useState(presentation.nextAction);
  const [nextActionDueAt, setNextActionDueAt] = useState(toLocalDateTime(presentation.nextActionDueAt));
  const stages: Array<[AssistantOpportunityWorkflowStage, string]> = [['discovery', '新发现'], ['screening', '初筛'], ['qualification', '资格核验'], ['decision', '决策评审'], ['bidding', '立项投标'], ['closed', '已结束']];
  const outcomes: Array<[AssistantOpportunityDecisionOutcome, string]> = [['undecided', '暂未决策'], ['bid', '决定投标'], ['no_bid', '决定不投']];
  const invalid = decisionOutcome === 'no_bid' && !decisionReason.trim();
  return (
    <section className="assistant-widget-opportunity-decision" aria-label={presentation.title}>
      <div className="assistant-widget-outline-heading"><strong>{presentation.title}</strong><span>{presentation.opportunity.title}</span></div>
      <div className="assistant-widget-decision-group"><strong>当前阶段</strong><div>{stages.map(([value, label]) => <button className={workflowStage === value ? 'is-active' : ''} type="button" key={value} disabled={Boolean(actioningId)} onClick={() => setWorkflowStage(value)}>{label}</button>)}</div></div>
      <div className="assistant-widget-decision-group"><strong>决策结论</strong><div>{outcomes.map(([value, label]) => <button className={decisionOutcome === value ? `is-active is-${value}` : ''} type="button" key={value} disabled={Boolean(actioningId)} onClick={() => setDecisionOutcome(value)}>{label}</button>)}</div></div>
      <label className="assistant-widget-decision-field"><span>{decisionOutcome === 'no_bid' ? '不投原因（必填）' : '决策依据与备注'}</span><textarea rows={2} maxLength={2000} value={decisionReason} disabled={Boolean(actioningId)} onChange={(event) => setDecisionReason(event.target.value)} /></label>
      <div className="assistant-widget-decision-dates"><label><span>决策期限</span><input type="datetime-local" value={decisionDueAt} disabled={Boolean(actioningId)} onChange={(event) => setDecisionDueAt(event.target.value)} /></label><label><span>行动期限</span><input type="datetime-local" value={nextActionDueAt} disabled={Boolean(actioningId)} onChange={(event) => setNextActionDueAt(event.target.value)} /></label></div>
      <label className="assistant-widget-decision-field"><span>下一步行动</span><input maxLength={1000} value={nextAction} disabled={Boolean(actioningId)} onChange={(event) => setNextAction(event.target.value)} placeholder="例如：组织资格预审" /></label>
      {invalid && <p className="assistant-widget-decision-warning">选择“决定不投”时需要填写原因。</p>}
      <button className="assistant-widget-outline-start" type="button" disabled={Boolean(actioningId) || invalid} onClick={() => onSave(presentation, { workflowStage, decisionOutcome, decisionReason, decisionDueAt, nextAction, nextActionDueAt })}>{actioningId === 'bid-opportunity.decision-update' ? '正在保存...' : '确认保存决策'}</button>
    </section>
  );
}

function AssistantOpportunityBulkConfiguration({ presentation, actioningId, onUpdate }: {
  presentation: AssistantOpportunityBulkConfigurationPresentation;
  actioningId: string;
  onUpdate: (presentation: AssistantOpportunityBulkConfigurationPresentation, opportunityIds: string[], status: string, owner: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(presentation.selectedIds);
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <section className="assistant-widget-opportunity-decision assistant-widget-opportunity-bulk" aria-label={presentation.title}>
      <div className="assistant-widget-outline-heading"><strong>{presentation.title}</strong><span>已选 {selectedIds.length} 条</span></div>
      <div className="assistant-widget-bulk-list">
        {presentation.opportunities.map((item) => <label key={item.id} className={selectedIds.includes(item.id) ? 'is-active' : ''}><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={Boolean(actioningId)} onChange={() => toggle(item.id)} /><span><strong>{item.title}</strong><small>{OPPORTUNITY_STATUS_LABELS[item.status]} · {item.owner || '未分配'}</small></span></label>)}
      </div>
      <div className="assistant-widget-decision-dates"><label><span>更新状态</span><select value={status} disabled={Boolean(actioningId)} onChange={(event) => setStatus(event.target.value)}><option value="">保持不变</option>{Object.entries(OPPORTUNITY_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>负责人</span><input value={owner} maxLength={100} disabled={Boolean(actioningId)} onChange={(event) => setOwner(event.target.value)} placeholder="不修改可留空" /></label></div>
      <button className="assistant-widget-outline-start" type="button" disabled={Boolean(actioningId) || !selectedIds.length || (!status && !owner.trim())} onClick={() => onUpdate(presentation, selectedIds, status, owner.trim())}>{actioningId === 'bid-opportunity.bulk-update' ? '正在更新...' : '确认批量更新'}</button>
    </section>
  );
}

function AssistantKnowledgeTargetConfirmation({ presentation, actioningId, onAction }: {
  presentation: AssistantKnowledgeTargetConfirmationPresentation;
  actioningId: string;
  onAction: (presentation: AssistantKnowledgeTargetConfirmationPresentation, confirmed: boolean) => void;
}) {
  const deleting = presentation.action !== 'document-match';
  const busy = actioningId === `knowledge-base.${presentation.action}`;
  return (
    <section className="assistant-widget-delete-confirmation" aria-label={presentation.title}>
      <div><strong>{presentation.title}</strong><span>{presentation.target.name}</span></div>
      <p>{presentation.action === 'folder-delete' ? `将同时删除 ${presentation.target.documentCount} 份文档。` : deleting ? '对应解析结果和知识条目也会删除。' : '原有匹配结果会被更新。'}</p>
      <div>
        <button type="button" disabled={Boolean(actioningId)} onClick={() => onAction(presentation, false)}>取消</button>
        <button className={deleting ? 'is-danger' : 'is-primary'} type="button" disabled={Boolean(actioningId)} onClick={() => onAction(presentation, true)}>
          {busy ? '处理中...' : deleting ? '确认删除' : '开始整理'}
        </button>
      </div>
    </section>
  );
}

function AssistantKnowledgeUploadConfiguration({ presentation, actioningId, onUpload }: {
  presentation: AssistantKnowledgeUploadConfigurationPresentation;
  actioningId: string;
  onUpload: (presentation: AssistantKnowledgeUploadConfigurationPresentation, folderId: string) => void;
}) {
  const [folderId, setFolderId] = useState(presentation.selectedFolderId);
  return (
    <section className="assistant-widget-knowledge-upload" aria-label={presentation.title}>
      <div className="assistant-widget-outline-heading"><strong>{presentation.title}</strong><span>{folderId ? '已选择' : '请选择'}</span></div>
      <div className="assistant-widget-knowledge-folders">
        {presentation.folders.map((folder) => (
          <button className={folder.id === folderId ? 'is-active' : ''} type="button" key={folder.id} disabled={Boolean(actioningId)} onClick={() => setFolderId(folder.id)}>
            <strong>{folder.name}</strong><small>{folder.documentCount} 份文档</small>
          </button>
        ))}
      </div>
      <button className="assistant-widget-outline-start" type="button" disabled={Boolean(actioningId) || !folderId} onClick={() => onUpload(presentation, folderId)}>
        {actioningId === 'knowledge-base.documents.upload' ? '正在选择...' : '选择文件并上传'}
      </button>
    </section>
  );
}

function AssistantRejectionCheckConfiguration({ presentation, actioningId, onStart }: {
  presentation: AssistantRejectionCheckConfigurationPresentation;
  actioningId: string;
  onStart: (presentation: AssistantRejectionCheckConfigurationPresentation, checks: AssistantRejectionCheckConfigurationPresentation['checks']) => void;
}) {
  const [checks, setChecks] = useState(presentation.checks);
  const options: Array<{ id: keyof typeof checks; label: string; description: string }> = [
    { id: 'rejection', label: '废标风险', description: '核对废标项和无效投标条款' },
    { id: 'typo', label: '错别字', description: '检查明显的文字与用词问题' },
    { id: 'logic', label: '逻辑问题', description: '检查前后矛盾和内容冲突' },
  ];
  const selectedCount = Object.values(checks).filter(Boolean).length;
  return (
    <section className="assistant-widget-rejection-config" aria-label={presentation.title}>
      <div className="assistant-widget-outline-heading"><strong>{presentation.title}</strong><span>已选 {selectedCount} 项</span></div>
      <div className="assistant-widget-rejection-options">
        {options.map((option) => (
          <label className={checks[option.id] ? 'is-active' : ''} key={option.id}>
            <input type="checkbox" checked={checks[option.id]} disabled={Boolean(actioningId)} onChange={() => setChecks((current) => ({ ...current, [option.id]: !current[option.id] }))} />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
      </div>
      <button className="assistant-widget-outline-start" type="button" disabled={Boolean(actioningId) || selectedCount === 0} onClick={() => onStart(presentation, checks)}>
        {actioningId === 'rejection-check.run.start' ? '正在启动...' : '开始检查'}
      </button>
    </section>
  );
}

function AssistantOutlineConfiguration({ presentation, actioningId, onStart }: {
  presentation: AssistantOutlineConfigurationPresentation;
  actioningId: string;
  onStart: (presentation: AssistantOutlineConfigurationPresentation, mode: AssistantOutlineMode, documentIds: string[]) => void;
}) {
  const [mode, setMode] = useState<AssistantOutlineMode>(presentation.selectedMode);
  const [documentIds, setDocumentIds] = useState<string[]>(presentation.selectedDocumentIds);
  const busy = actioningId === 'technical-plan.outline.start';
  const modeOptions: Array<{ id: AssistantOutlineMode; label: string; description: string }> = [
    { id: 'free', label: '自由生成', description: '由 AI 分析并组织目录' },
    { id: 'aligned', label: '按评分项对齐', description: '一级目录对齐技术评分要求' },
    { id: 'response-file', label: '按响应文件目录', description: '优先沿用响应文件编制要求' },
  ];
  const toggleDocument = (documentId: string) => {
    setDocumentIds((current) => current.includes(documentId)
      ? current.filter((id) => id !== documentId)
      : [...current, documentId]);
  };
  return (
    <section className="assistant-widget-outline-config" aria-label={presentation.title}>
      <div className="assistant-widget-outline-heading">
        <strong>{presentation.title}</strong>
        <span>{presentation.project.name}</span>
      </div>
      <div className="assistant-widget-outline-modes">
        {modeOptions.map((option) => (
          <button className={mode === option.id ? 'is-active' : ''} type="button" key={option.id} disabled={Boolean(actioningId)} onClick={() => setMode(option.id)}>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
      <div className="assistant-widget-outline-documents">
        <div>
          <strong>参考知识库</strong>
          <span>已选 {documentIds.length} 个</span>
          {presentation.documents.length > 0 && <button type="button" disabled={Boolean(actioningId)} onClick={() => setDocumentIds(documentIds.length === presentation.documents.length ? [] : presentation.documents.map((document) => document.id))}>{documentIds.length === presentation.documents.length ? '清空' : '全选'}</button>}
        </div>
        {presentation.documents.length ? presentation.documents.map((document) => (
          <label key={document.id}>
            <input type="checkbox" checked={documentIds.includes(document.id)} disabled={Boolean(actioningId)} onChange={() => toggleDocument(document.id)} />
            <span><strong>{document.name}</strong><small>{document.folderName} · {document.itemCount} 条知识</small></span>
          </label>
        )) : <p>暂无已整理完成的知识库文档，可不选择直接生成。</p>}
      </div>
      <button className="assistant-widget-outline-start" type="button" disabled={Boolean(actioningId)} onClick={() => onStart(presentation, mode, documentIds)}>{busy ? '正在启动...' : '开始生成'}</button>
    </section>
  );
}

function AssistantActionCard({ presentation, actioningId, onAction }: {
  presentation: AssistantActionPresentation;
  actioningId: string;
  onAction: (presentation: AssistantActionPresentation, confirmed: boolean) => void;
}) {
  const busy = actioningId === presentation.actionId;
  return (
    <section className={`assistant-widget-action-card is-${presentation.kind}`} aria-label={presentation.title}>
      <div className="assistant-widget-action-icon" aria-hidden="true">{presentation.kind === 'file-request' ? '＋' : '🐾'}</div>
      <div className="assistant-widget-action-copy">
        <strong>{presentation.title}</strong>
        <p>{presentation.description}</p>
        <div>
          <button type="button" disabled={Boolean(actioningId)} onClick={() => onAction(presentation, false)}>{presentation.cancelLabel}</button>
          <button className={presentation.tone === 'danger' ? 'is-danger' : 'is-primary'} type="button" disabled={Boolean(actioningId)} onClick={() => onAction(presentation, true)}>
            {busy ? '处理中...' : presentation.confirmLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function AssistantProgress({ presentation }: { presentation: AssistantProgressPresentation }) {
  return (
    <section className="assistant-widget-progress" aria-label={presentation.title}>
      <strong>{presentation.title}</strong>
      <div className="assistant-widget-progress-list">
        {presentation.items.map((item, index) => (
          <div className={`assistant-widget-progress-item is-${item.status}`} key={`${item.label}-${index}`}>
            <div className="assistant-widget-progress-meta">
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </div>
            {typeof item.value === 'number' && (
              <div
                className="assistant-widget-progress-track"
                role="progressbar"
                aria-label={item.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, item.value))}
              >
                <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, item.value)) / 100})` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AssistantProjectSelector({ presentation, selectingProjectId, onSelect }: {
  presentation: AssistantProjectSelectionPresentation;
  selectingProjectId: string;
  onSelect: (project: AssistantProjectOption) => void;
}) {
  return (
    <section className="assistant-widget-project-selector" aria-label={presentation.title}>
      <strong>{presentation.title}</strong>
      <div>
        {presentation.projects.map((project) => (
          <button
            key={project.id}
            type="button"
            disabled={Boolean(selectingProjectId)}
            onClick={() => onSelect(project)}
          >
            <span>{project.name}</span>
            <small>{selectingProjectId === project.id ? '选择中...' : project.isActive ? '宿主当前项目' : '选择'}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function AssistantProjectDeleteConfirmation({ presentation, deletingProjectId, onAction }: {
  presentation: AssistantProjectDeleteConfirmationPresentation;
  deletingProjectId: string;
  onAction: (presentation: AssistantProjectDeleteConfirmationPresentation, confirmed: boolean) => void;
}) {
  const busy = deletingProjectId === presentation.project.id;
  return (
    <section className="assistant-widget-delete-confirmation" aria-label={presentation.title}>
      <div>
        <strong>{presentation.title}</strong>
        <span>{presentation.project.name}</span>
      </div>
      <p>删除后无法在助手中撤销。</p>
      <div>
        <button type="button" disabled={Boolean(deletingProjectId)} onClick={() => onAction(presentation, false)}>取消</button>
        <button className="is-danger" type="button" disabled={Boolean(deletingProjectId)} onClick={() => onAction(presentation, true)}>
          {busy ? '处理中...' : '确认删除'}
        </button>
      </div>
    </section>
  );
}

function getQuickActions(sectionId: string): AssistantQuickAction[] {
  if (sectionId === 'technical-plan') {
    return [
      { label: '查看当前进度', message: '查看当前进度' },
      { label: '下一步建议', message: '下一步建议' },
      { label: '打开已有方案扩写', message: '打开已有方案扩写' },
    ];
  }
  if (sectionId === 'existing-plan-expansion') {
    return [
      { label: '查看当前进度', message: '查看当前进度' },
      { label: '下一步建议', message: '下一步建议' },
      { label: '打开技术方案', message: '打开技术方案' },
    ];
  }
  if (sectionId === 'duplicate-check') {
    return [
      { label: '选择投标文件', message: '上传投标文件' },
      { label: '开始查重', message: '开始查重' },
      { label: '查看当前进度', message: '查看当前进度' },
      { label: '下一步建议', message: '下一步建议' },
    ];
  }
  if (sectionId === 'rejection-check') {
    return [
      { label: '选择招标文件', message: '上传招标文件' },
      { label: '选择投标文件', message: '上传投标文件' },
      { label: '开始检查', message: '开始检查' },
      { label: '查看当前进度', message: '查看当前进度' },
    ];
  }
  if (sectionId === 'knowledge-base') {
    return [
      { label: '上传文档', message: '上传知识库文档' },
      { label: '查看整理进度', message: '查看当前进度' },
      { label: '下一步建议', message: '下一步建议' },
    ];
  }
  if (sectionId === 'bid-opportunity') {
    return [
      { label: '选择投标机会', message: '选择投标机会' },
      { label: '导入新机会', message: '导入投标机会文件' },
      { label: '配置投标决策', message: '设置投标决策' },
      { label: '批量更新机会', message: '批量更新投标机会' },
      { label: '查看当前进度', message: '查看当前进度' },
      { label: '下一步建议', message: '下一步建议' },
    ];
  }
  if (sectionId === 'feasibility-report') {
    return [
      { label: '查看当前进度', message: '查看当前进度' },
      { label: '下一步建议', message: '下一步建议' },
      { label: '打开技术方案', message: '打开技术方案' },
    ];
  }
  if (sectionId === 'home') {
    return [
      { label: '了解助手能力', message: '查看助手能力' },
    ];
  }
  return [
    { label: '了解助手能力', message: '查看助手能力' },
    { label: '打开技术方案', message: '打开技术方案' },
    { label: '回到首页', message: '回到首页' },
  ];
}

function AssistantNavigation({ groups, activeGroupId, disabled, onGroupChange, onNavigate }: {
  groups: AppMenuGroup[];
  activeGroupId: string;
  disabled: boolean;
  onGroupChange: (groupId: string) => void;
  onNavigate: (message: string) => void;
}) {
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  return (
    <nav className="assistant-widget-navigation" aria-label="功能导航">
      <strong>功能导航</strong>
      <div className="assistant-widget-navigation-groups">
        {groups.map((group) => (
          <button className={activeGroupId === group.id ? 'is-active' : ''} key={group.id} type="button" onClick={() => onGroupChange(group.id)}>
            {group.label}
          </button>
        ))}
      </div>
      {activeGroup && (
        <div className="assistant-widget-navigation-items">
          {activeGroup.items.map((item) => (
            <button key={item.id} type="button" disabled={disabled} onClick={() => onNavigate(`前往${activeGroup.label}的${item.label}`)}>
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

export default function AssistantWidget({ context, navigationGroups }: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantWidgetMessage[]>([]);
  const [input, setInput] = useState('');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [selectingProjectId, setSelectingProjectId] = useState('');
  const [selectingOpportunityId, setSelectingOpportunityId] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [actioningId, setActioningId] = useState('');
  const [processingPhase, setProcessingPhase] = useState(0);
  const [selectedProject, setSelectedProject] = useState<AssistantProjectOption | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Pick<AssistantOpportunityOption, 'id' | 'title'> | null>(null);
  const [error, setError] = useState('');
  const [navigationGroupId, setNavigationGroupId] = useState('');
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);
  const quickActions = getQuickActions(context.sectionId);
  const processingPhases = context.sectionId === 'technical-plan' || context.sectionId === 'existing-plan-expansion'
    ? ['正在理解你的请求', '正在核对当前页面与项目', '正在整理回复']
    : ['正在理解你的请求', '正在核对当前页面', '正在整理回复'];

  useEffect(() => {
    if (!sending) {
      setProcessingPhase(0);
      return;
    }
    const timer = window.setInterval(() => {
      setProcessingPhase((current) => Math.min(processingPhases.length - 1, current + 1));
    }, 850);
    return () => window.clearInterval(timer);
  }, [sending, context.sectionId]);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, sending, error]);

  useEffect(() => {
    requestSequenceRef.current += 1;
    const requestSequence = requestSequenceRef.current;
    setMessages([]);
    setInput('');
    setError('');
    setSending(false);
    setClearing(false);
    setSelectingProjectId('');
    setSelectingOpportunityId('');
    setDeletingProjectId('');
    setActioningId('');
    setSelectedProject(null);
    setSelectedOpportunity(null);
    setHistoryLoading(true);
    const pluginBridge = window.yibiao?.plugins;
    if (!pluginBridge) {
      setHistoryLoading(false);
      return;
    }
    void pluginBridge.request<AssistantHistoryResult>(ASSISTANT_PLUGIN_ID, 'history.get', { context })
      .then((result) => {
        if (requestSequenceRef.current !== requestSequence) return;
        const restored = Array.isArray(result?.messages) ? result.messages : [];
        setMessages(restored.slice(-12));
        setSelectedProject(result?.selectedProject || null);
        setSelectedOpportunity(result?.selectedOpportunity || null);
      })
      .catch((loadError) => console.warn('恢复 Assistant 会话失败', loadError))
      .finally(() => {
        if (requestSequenceRef.current === requestSequence) setHistoryLoading(false);
      });
  }, [context.sectionId]);

  useEffect(() => {
    const activeGroup = navigationGroups.find((group) => group.items.some((item) => item.id === context.sectionId));
    setNavigationGroupId(activeGroup?.id || '');
  }, [context.sectionId, navigationGroups]);

  useEffect(() => {
    if (!open || sending || actioningId || historyLoading || clearing) return;
    let targetIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant'
        && message.presentation?.kind === 'progress'
        && message.presentation.items.some((item) => item.status === 'running' || item.status === 'pending')) {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex < 0) return;
    const timer = window.setInterval(() => {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge || document.visibilityState === 'hidden') return;
      void pluginBridge.request<AssistantChatResult>(ASSISTANT_PLUGIN_ID, 'progress.get', { context })
        .then((result) => {
          if (result?.selectedProject) setSelectedProject(result.selectedProject);
          if (result?.selectedOpportunity) setSelectedOpportunity(result.selectedOpportunity);
          if (!result?.message?.presentation || result.message.presentation.kind !== 'progress') return;
          setMessages((current) => current.map((message, index) => index === targetIndex
            ? { ...message, content: result.message.content, presentation: result.message.presentation }
            : message));
        })
        .catch((pollError) => console.warn('刷新助手进度失败', pollError));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [open, messages, sending, actioningId, historyLoading, clearing, context.sectionId]);

  async function submitMessage(value: string) {
    const content = value.trim();
    if (!content || sending || historyLoading || clearing || selectingProjectId || selectingOpportunityId || deletingProjectId || actioningId) return;
    const nextMessages = [...messages, { role: 'user' as const, content }].slice(-19);
    setMessages(nextMessages);
    setInput('');
    setError('');
    setSending(true);
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const startedAt = Date.now();
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantChatResult>(ASSISTANT_PLUGIN_ID, 'chat', { messages: nextMessages, context });
      const reply = String(result?.message?.content || '').trim();
      if (!reply) throw new Error('AI 未返回有效内容');
      await wait(Math.max(0, 650 - (Date.now() - startedAt)));
      if (requestSequenceRef.current !== requestSequence) return;
      if (result?.selectedProject) setSelectedProject(result.selectedProject);
      if (result?.selectedOpportunity) setSelectedOpportunity(result.selectedOpportunity);
      setMessages((current) => [...current, {
        role: 'assistant' as const,
        content: reply,
        reveal: true,
        ...(result?.message?.presentation ? { presentation: result.message.presentation } : {}),
      }].slice(-20));
    } catch (requestError) {
      if (requestSequenceRef.current !== requestSequence) return;
      setError(requestError instanceof Error ? requestError.message : '消息发送失败，请稍后重试');
    } finally {
      if (requestSequenceRef.current === requestSequence) setSending(false);
    }
  }

  async function clearHistory() {
    if (sending || historyLoading || clearing || selectingProjectId || selectingOpportunityId || deletingProjectId || actioningId || !messages.length) return;
    const requestSequence = requestSequenceRef.current;
    setClearing(true);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      await pluginBridge.request(ASSISTANT_PLUGIN_ID, 'history.clear', { context });
      if (requestSequenceRef.current !== requestSequence) return;
      setMessages([]);
    } catch (clearError) {
      if (requestSequenceRef.current !== requestSequence) return;
      setError(clearError instanceof Error ? clearError.message : '清空会话失败，请稍后重试');
    } finally {
      if (requestSequenceRef.current === requestSequence) setClearing(false);
    }
  }

  async function selectProject(project: AssistantProjectOption) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setSelectingProjectId(project.id);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantProjectSelectionResult>(ASSISTANT_PLUGIN_ID, 'project.select', {
        context,
        projectId: project.id,
      });
      setSelectedProject(result.selectedProject);
      setMessages(Array.isArray(result.messages) ? result.messages.slice(-12) : []);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : '项目选择失败，请稍后重试');
    } finally {
      setSelectingProjectId('');
    }
  }

  async function selectOpportunity(opportunity: AssistantOpportunityOption) {
    if (sending || historyLoading || clearing || selectingProjectId || selectingOpportunityId || deletingProjectId || actioningId) return;
    setSelectingOpportunityId(opportunity.id);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantOpportunitySelectionResult>(ASSISTANT_PLUGIN_ID, 'opportunity.select', { context, opportunityId: opportunity.id });
      setSelectedOpportunity(result.selectedOpportunity);
      setMessages(Array.isArray(result.messages) ? result.messages.slice(-12) : []);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : '投标机会选择失败，请稍后重试');
    } finally {
      setSelectingOpportunityId('');
    }
  }

  async function handleOpportunityAction(presentation: AssistantOpportunityActionConfirmationPresentation, confirmed: boolean) {
    if (sending || historyLoading || clearing || selectingProjectId || selectingOpportunityId || deletingProjectId || actioningId) return;
    setActioningId(`bid-opportunity.${presentation.action}`);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, confirmed ? 'opportunity.action.confirm' : 'opportunity.action.cancel', { context, action: presentation.action });
      if (result.selectedOpportunity) setSelectedOpportunity(result.selectedOpportunity);
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({ ...item, ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}) })));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '投标机会操作失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleOpportunityDecisionUpdate(presentation: AssistantOpportunityDecisionConfigurationPresentation, values: Omit<AssistantOpportunityDecisionConfigurationPresentation, 'kind' | 'title' | 'opportunity'>) {
    if (sending || historyLoading || clearing || selectingProjectId || selectingOpportunityId || deletingProjectId || actioningId) return;
    setActioningId('bid-opportunity.decision-update');
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, 'opportunity.decision.update', { context, opportunityId: presentation.opportunity.id, ...values });
      if (result.selectedOpportunity) setSelectedOpportunity(result.selectedOpportunity);
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({ ...item, ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}) })));
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : '保存投标决策失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleOpportunityBulkUpdate(_presentation: AssistantOpportunityBulkConfigurationPresentation, opportunityIds: string[], status: string, owner: string) {
    if (sending || historyLoading || clearing || selectingOpportunityId || actioningId) return;
    setActioningId('bid-opportunity.bulk-update');
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, 'opportunity.bulk.update', { context, opportunityIds, status, owner });
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({ ...item, ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}) })));
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : '批量更新失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleProjectDelete(presentation: AssistantProjectDeleteConfirmationPresentation, confirmed: boolean) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setDeletingProjectId(presentation.project.id);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantProjectDeleteResult>(
        ASSISTANT_PLUGIN_ID,
        confirmed ? 'project.delete.confirm' : 'project.delete.cancel',
        { context, projectId: presentation.project.id },
      );
      setSelectedProject(result.selectedProject || null);
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({
        ...item,
        ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}),
      })));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '项目操作失败，请稍后重试');
    } finally {
      setDeletingProjectId('');
    }
  }

  async function handleAssistantAction(presentation: AssistantActionPresentation, confirmed: boolean) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setActioningId(presentation.actionId);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(
        ASSISTANT_PLUGIN_ID,
        confirmed ? 'action.confirm' : 'action.cancel',
        { context, actionId: presentation.actionId },
      );
      setSelectedProject(result.selectedProject || null);
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({
        ...item,
        ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}),
      })));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '操作失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleOutlineStart(presentation: AssistantOutlineConfigurationPresentation, mode: AssistantOutlineMode, documentIds: string[]) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setActioningId('technical-plan.outline.start');
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, 'outline.start', {
        context,
        projectId: presentation.project.id,
        mode,
        documentIds,
      });
      setSelectedProject(result.selectedProject || null);
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({
        ...item,
        ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}),
      })));
    } catch (outlineError) {
      setError(outlineError instanceof Error ? outlineError.message : '启动目录生成失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleRejectionCheckStart(_presentation: AssistantRejectionCheckConfigurationPresentation, checks: AssistantRejectionCheckConfigurationPresentation['checks']) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setActioningId('rejection-check.run.start');
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, 'rejection-check.start', {
        context,
        checks,
      });
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({
        ...item,
        ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}),
      })));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : '启动检查失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleKnowledgeUpload(_presentation: AssistantKnowledgeUploadConfigurationPresentation, folderId: string) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setActioningId('knowledge-base.documents.upload');
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, 'knowledge-base.upload', { context, folderId });
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({
        ...item,
        ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}),
      })));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传知识库文档失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  async function handleKnowledgeTargetAction(presentation: AssistantKnowledgeTargetConfirmationPresentation, confirmed: boolean) {
    if (sending || historyLoading || clearing || selectingProjectId || deletingProjectId || actioningId) return;
    setActioningId(`knowledge-base.${presentation.action}`);
    setError('');
    try {
      const pluginBridge = window.yibiao?.plugins;
      if (!pluginBridge) throw new Error('插件通信桥未就绪');
      const result = await pluginBridge.request<AssistantActionResult>(ASSISTANT_PLUGIN_ID, confirmed ? 'knowledge-base.target.confirm' : 'knowledge-base.target.cancel', {
        context,
        action: presentation.action,
        targetId: presentation.target.id,
      });
      const nextMessages = Array.isArray(result.messages) ? result.messages.slice(-12) : [];
      setMessages(nextMessages.map((item, index) => ({ ...item, ...(index === nextMessages.length - 1 && item.role === 'assistant' ? { reveal: true } : {}) })));
    } catch (targetError) {
      setError(targetError instanceof Error ? targetError.message : '知识库操作失败，请稍后重试');
    } finally {
      setActioningId('');
    }
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    void submitMessage(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitMessage(input);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="assistant-widget-trigger" type="button" aria-label="打开 AI 智能助手">
          <img src={logoUrl} alt="" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="assistant-widget-panel" side="top" align="end" sideOffset={14} collisionPadding={18}>
          <header className="assistant-widget-header">
            <div className="assistant-widget-identity">
              <img src={logoUrl} alt="" />
              <div>
                <strong>AI 智能助手</strong>
                <div className="assistant-widget-context">
                  <span>当前页面</span>
                  <strong className="is-page">{context.title}</strong>
                  {selectedProject && <strong className="is-project">{selectedProject.name}</strong>}
                  {selectedOpportunity && <strong className="is-opportunity">{selectedOpportunity.title}</strong>}
                </div>
              </div>
            </div>
            <div className="assistant-widget-header-actions">
              <button
                className="assistant-widget-clear"
                type="button"
                disabled={!messages.length || sending || historyLoading || clearing || Boolean(selectingProjectId) || Boolean(selectingOpportunityId) || Boolean(deletingProjectId) || Boolean(actioningId)}
                onClick={() => void clearHistory()}
              >
                {clearing ? '清空中' : '清空本页'}
              </button>
              <Popover.Close className="assistant-widget-close" type="button" aria-label="关闭 AI 智能助手">×</Popover.Close>
            </div>
          </header>

          <div ref={conversationRef} className="assistant-widget-conversation" role="log" aria-live="polite">
            {historyLoading && (
              <div className="assistant-widget-message is-assistant is-loading" role="status">
                <span>AI 智能助手</span>
                <p>正在恢复本页对话...</p>
              </div>
            )}
            {!historyLoading && messages.length === 0 && (
              <>
                <div className="assistant-widget-welcome">
                  <strong>你好，我是禹都 AI 智能助手</strong>
                </div>
                <div className="assistant-widget-quick-actions" aria-label="快捷操作">
                  {quickActions.map((action) => (
                    <button
                      key={action.message}
                      type="button"
                      disabled={sending || clearing || Boolean(selectingProjectId) || Boolean(selectingOpportunityId) || Boolean(deletingProjectId) || Boolean(actioningId)}
                      onClick={() => void submitMessage(action.message)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <AssistantNavigation
                  groups={navigationGroups}
                  activeGroupId={navigationGroupId}
                  disabled={sending || clearing || Boolean(selectingProjectId) || Boolean(selectingOpportunityId) || Boolean(deletingProjectId) || Boolean(actioningId)}
                  onGroupChange={(groupId) => setNavigationGroupId((current) => current === groupId ? '' : groupId)}
                  onNavigate={(message) => void submitMessage(message)}
                />
              </>
            )}
            {!historyLoading && messages.length > 0 && navigationOpen && (
              <AssistantNavigation
                groups={navigationGroups}
                activeGroupId={navigationGroupId}
                disabled={sending || clearing || Boolean(selectingProjectId) || Boolean(selectingOpportunityId) || Boolean(deletingProjectId) || Boolean(actioningId)}
                onGroupChange={(groupId) => setNavigationGroupId((current) => current === groupId ? '' : groupId)}
                onNavigate={(message) => void submitMessage(message)}
              />
            )}
            {messages.map((message, index) => (
              <div className={`assistant-widget-message is-${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === 'user' ? '你' : 'AI 智能助手'}</span>
                {message.role === 'assistant' ? (
                  <AssistantMessageContent
                    message={message}
                    selectingProjectId={selectingProjectId}
                    selectingOpportunityId={selectingOpportunityId}
                    deletingProjectId={deletingProjectId}
                    actioningId={actioningId}
                    onSelect={(project) => void selectProject(project)}
                    onSelectOpportunity={(opportunity) => void selectOpportunity(opportunity)}
                    onDelete={(presentation, confirmed) => void handleProjectDelete(presentation, confirmed)}
                    onAction={(presentation, confirmed) => void handleAssistantAction(presentation, confirmed)}
                    onOpportunityAction={(presentation, confirmed) => void handleOpportunityAction(presentation, confirmed)}
                    onOpportunityDecisionUpdate={(presentation, values) => void handleOpportunityDecisionUpdate(presentation, values)}
                    onOpportunityBulkUpdate={(presentation, opportunityIds, status, owner) => void handleOpportunityBulkUpdate(presentation, opportunityIds, status, owner)}
                    onStartOutline={(presentation, mode, documentIds) => void handleOutlineStart(presentation, mode, documentIds)}
                    onStartRejectionCheck={(presentation, checks) => void handleRejectionCheckStart(presentation, checks)}
                    onUploadKnowledge={(presentation, folderId) => void handleKnowledgeUpload(presentation, folderId)}
                    onKnowledgeTargetAction={(presentation, confirmed) => void handleKnowledgeTargetAction(presentation, confirmed)}
                  />
                ) : <p>{message.content}</p>}
              </div>
            ))}
            {sending && (
              <div className="assistant-widget-message is-assistant is-loading" role="status">
                <span>AI 智能助手</span>
                <div className="assistant-widget-processing">
                  <p>{processingPhases[processingPhase]}</p>
                  <span aria-hidden="true"><i /><i /><i /></span>
                </div>
              </div>
            )}
            {error && <div className="assistant-widget-error" role="alert">{error}</div>}
          </div>

          <form className="assistant-widget-composer" onSubmit={sendMessage}>
            <label htmlFor="assistant-widget-input">对话输入</label>
            <textarea
              id="assistant-widget-input"
              rows={2}
              value={input}
              maxLength={8000}
              placeholder="输入消息，Enter 发送，Shift + Enter 换行"
              disabled={sending || historyLoading || clearing || Boolean(selectingProjectId) || Boolean(selectingOpportunityId) || Boolean(deletingProjectId) || Boolean(actioningId)}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
            />
            <div>
              <button className="assistant-widget-navigation-toggle" type="button" onClick={() => setNavigationOpen((current) => !current)}>{navigationOpen ? '收起功能' : '功能导航'}</button>
              <button type="submit" disabled={!input.trim() || sending || historyLoading || clearing || Boolean(selectingProjectId) || Boolean(selectingOpportunityId) || Boolean(deletingProjectId) || Boolean(actioningId)}>{sending ? '发送中' : '发送'}</button>
            </div>
          </form>
          <Popover.Arrow className="assistant-widget-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
