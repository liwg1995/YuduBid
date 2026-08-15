import type {
  ThesisTutorChapter,
  ThesisTutorFeedbackItem,
  ThesisTutorFeedbackPriority,
  ThesisTutorFeedbackStatus,
} from '../types';
import { feedbackPriorityOptions, feedbackStatusOptions } from '../model/thesisTutorPageModel';

interface ThesisTutorFeedbackWorkspaceProps {
  activeFeedback: ThesisTutorFeedbackItem | null;
  feedbackItems: ThesisTutorFeedbackItem[];
  chapters: ThesisTutorChapter[];
  isRunning: boolean;
  saving: boolean;
  sourceText: string;
  setActiveFeedbackId: (id: string) => void;
  updateActiveFeedback: (patch: Partial<ThesisTutorFeedbackItem>) => void;
  addFeedback: () => void;
  fillFeedbackFromSource: () => void;
  removeActiveFeedback: () => void;
  saveFeedbackWorkspace: () => void;
  toggleFeedbackChapter: (chapterId: string) => void;
  extractMaterialToWorkspace: () => void;
}

export function ThesisTutorFeedbackWorkspace({
  activeFeedback,
  feedbackItems,
  chapters,
  isRunning,
  saving,
  sourceText,
  setActiveFeedbackId,
  updateActiveFeedback,
  addFeedback,
  fillFeedbackFromSource,
  removeActiveFeedback,
  saveFeedbackWorkspace,
  toggleFeedbackChapter,
  extractMaterialToWorkspace,
}: ThesisTutorFeedbackWorkspaceProps) {
  return (
    <div className="thesis-tutor-panel thesis-tutor-feedback-panel">
      <div className="thesis-tutor-panel-head">
        <div>
          <strong>导师反馈闭环</strong>
          <span>把导师意见拆成可追踪任务，关联章节并记录处理方案，后续写作和检查会自动带入。</span>
        </div>
        <div className="thesis-tutor-chapter-actions">
          <button type="button" className="secondary-action" onClick={addFeedback} disabled={saving || isRunning}>新增反馈</button>
          <button type="button" className="secondary-action" onClick={fillFeedbackFromSource} disabled={saving || isRunning || !sourceText.trim()}>用材料区填意见</button>
          <button type="button" className="secondary-action is-danger" onClick={removeActiveFeedback} disabled={saving || isRunning || !activeFeedback}>删除当前</button>
          <button type="button" className="primary-action" onClick={saveFeedbackWorkspace} disabled={saving || isRunning || !feedbackItems.length}>保存反馈</button>
        </div>
      </div>
      {feedbackItems.length ? (
        <>
          <div className="thesis-tutor-feedback-summary">
            <span>待处理：{feedbackItems.filter((item) => item.status === 'todo').length}</span>
            <span>处理中：{feedbackItems.filter((item) => item.status === 'doing').length}</span>
            <span>已完成：{feedbackItems.filter((item) => item.status === 'done').length}</span>
          </div>
          <div className="thesis-tutor-feedback-toolbar">
            <label>
              <span>当前反馈</span>
              <select value={activeFeedback?.id || ''} onChange={(event) => setActiveFeedbackId(event.target.value)} disabled={isRunning}>
                {feedbackItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>优先级</span>
              <select
                value={activeFeedback?.priority || 'medium'}
                onChange={(event) => updateActiveFeedback({ priority: event.target.value as ThesisTutorFeedbackPriority })}
                disabled={!activeFeedback || isRunning}
              >
                {feedbackPriorityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>状态</span>
              <select
                value={activeFeedback?.status || 'todo'}
                onChange={(event) => updateActiveFeedback({ status: event.target.value as ThesisTutorFeedbackStatus })}
                disabled={!activeFeedback || isRunning}
              >
                {feedbackStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {activeFeedback && (
            <div className="thesis-tutor-feedback-grid">
              <label>
                <span>反馈标题</span>
                <input
                  value={activeFeedback.title}
                  onChange={(event) => updateActiveFeedback({ title: event.target.value })}
                  placeholder="如 第二章理论框架不清晰"
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>来源</span>
                <input
                  value={activeFeedback.source}
                  onChange={(event) => updateActiveFeedback({ source: event.target.value })}
                  placeholder="如导师一审、预答辩、学院盲审"
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>原始意见</span>
                <textarea
                  value={activeFeedback.originalFeedback}
                  onChange={(event) => updateActiveFeedback({ originalFeedback: event.target.value })}
                  placeholder="粘贴导师原话、批注或评审意见。"
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>处理方案</span>
                <textarea
                  value={activeFeedback.actionPlan}
                  onChange={(event) => updateActiveFeedback({ actionPlan: event.target.value })}
                  placeholder="写清准备怎么改：补文献、改结构、重写段落、补数据或调整表达。"
                  disabled={isRunning}
                />
              </label>
              <label className="is-wide">
                <span>修改记录</span>
                <textarea
                  value={activeFeedback.revisionNotes}
                  onChange={(event) => updateActiveFeedback({ revisionNotes: event.target.value })}
                  placeholder="记录已完成的修改、仍需补充的材料、下一轮给导师看的说明。"
                  disabled={isRunning}
                />
              </label>
            </div>
          )}
          {activeFeedback && chapters.length > 0 && (
            <div className="thesis-tutor-reference-chapters">
              <strong>关联章节</strong>
              <div>
                {chapters.map((chapter) => (
                  <button
                    type="button"
                    key={chapter.id}
                    className={activeFeedback.relatedChapterIds.includes(chapter.id) ? 'is-active' : ''}
                    onClick={() => toggleFeedbackChapter(chapter.id)}
                    disabled={isRunning}
                  >
                    {chapter.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="thesis-tutor-chapter-note">
            建议把每条反馈拆到可执行粒度。生成评审方案或逐章写作时，会优先处理“待处理”和“处理中”的高优先级任务。
          </div>
        </>
      ) : (
        <div className="thesis-tutor-chapter-empty">
          <p>还没有导师反馈任务。可以先新增反馈，或把导师批注粘到材料区后拆成待处理任务。</p>
          <div className="thesis-tutor-empty-actions">
            <button type="button" className="secondary-action" onClick={addFeedback} disabled={saving || isRunning}>新增反馈</button>
            <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>从材料区拆反馈</button>
          </div>
        </div>
      )}
    </div>
  );
}
