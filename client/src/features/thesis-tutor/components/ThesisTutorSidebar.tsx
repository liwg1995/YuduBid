import type {
  ThesisTutorChapter,
  ThesisTutorHistoryItem,
  ThesisTutorPanel,
  ThesisTutorProfile,
  ThesisTutorReference,
  ThesisTutorState,
} from '../types';
import { panelCopy, panelOrder } from '../model/thesisTutorPageModel';

interface ThesisTutorSidebarProps {
  profile: ThesisTutorProfile;
  profileCompletion: number;
  overviewHealthLabel: string;
  completedPanels: ThesisTutorPanel[];
  activePanel: ThesisTutorPanel;
  panelResults: ThesisTutorState['panelResults'];
  chapters: ThesisTutorChapter[];
  references: ThesisTutorReference[];
  chapterDoneCount: number;
  chapterActiveCount: number;
  openFeedbackCount: number;
  highPriorityFeedbackCount: number;
  openCheckCount: number;
  severeCheckCount: number;
  history: ThesisTutorHistoryItem[];
  filteredHistory: ThesisTutorHistoryItem[];
  historyPanelFilter: ThesisTutorPanel | 'all';
  historyImportantOnly: boolean;
  navigateToDiagnosis: () => void;
  switchPanel: (panel: ThesisTutorPanel) => void;
  setHistoryPanelFilter: (panel: ThesisTutorPanel | 'all') => void;
  toggleHistoryImportantOnly: () => void;
  renameHistoryItem: (item: ThesisTutorHistoryItem, title: string) => void;
  restoreHistoryItem: (item: ThesisTutorHistoryItem) => void;
  toggleHistoryImportant: (item: ThesisTutorHistoryItem) => void;
  removeHistoryItem: (item: ThesisTutorHistoryItem) => void;
}

export function ThesisTutorSidebar({
  profile,
  profileCompletion,
  overviewHealthLabel,
  completedPanels,
  activePanel,
  panelResults,
  chapters,
  references,
  chapterDoneCount,
  chapterActiveCount,
  openFeedbackCount,
  highPriorityFeedbackCount,
  openCheckCount,
  severeCheckCount,
  history,
  filteredHistory,
  historyPanelFilter,
  historyImportantOnly,
  navigateToDiagnosis,
  switchPanel,
  setHistoryPanelFilter,
  toggleHistoryImportantOnly,
  renameHistoryItem,
  restoreHistoryItem,
  toggleHistoryImportant,
  removeHistoryItem,
}: ThesisTutorSidebarProps) {
  return (
    <aside className="thesis-tutor-side">
      <section className="thesis-tutor-panel thesis-tutor-overview-panel">
        <div className="thesis-tutor-panel-head">
          <div>
            <strong>论文导师项目总览</strong>
            <span>{overviewHealthLabel}，关键上下文会随生成自动带入。</span>
          </div>
        </div>
        <div className="thesis-tutor-overview-score">
          <div>
            <strong>{profileCompletion}%</strong>
            <span>档案完整度</span>
          </div>
          <div>
            <strong>{completedPanels.length}/{panelOrder.length}</strong>
            <span>阶段成果</span>
          </div>
        </div>
        <p className="thesis-tutor-overview-caption">{profile.title.trim() || profile.direction.trim() || '尚未确定论文题目'} · {profile.stage}</p>
        <div className="thesis-tutor-overview-next">
          <strong>建议下一步</strong>
          <span>
            {profileCompletion < 60
              ? '先补全论文档案，生成时会自动带入研究背景。'
              : activePanel === 'review' && openFeedbackCount
                ? '先处理当前阶段的导师反馈待办。'
                : activePanel === 'format' && openCheckCount
                  ? '先完成当前阶段的检查清单。'
                  : panelResults[activePanel]?.content?.trim()
                    ? `继续完善“${panelCopy[activePanel].label}”的结果，完成后保存。`
                    : `填写“${panelCopy[activePanel].label}”的任务要求，再生成结果。`}
          </span>
        </div>
      </section>

      <details className="thesis-tutor-panel thesis-tutor-history thesis-tutor-collapsible">
        <summary>历史记录 <span>{history.length} 条</span></summary>
        <div className="thesis-tutor-panel-head">
          <div>
            <strong>历史记录</strong>
            <span>最近 30 次生成会保存在本机，可恢复到结果区继续编辑。</span>
          </div>
        </div>
        {history.length ? (
          <>
            <div className="thesis-tutor-history-filters">
              <label>
                <span>模块</span>
                <select value={historyPanelFilter} onChange={(event) => setHistoryPanelFilter(event.target.value as ThesisTutorPanel | 'all')}>
                  <option value="all">全部模块</option>
                  {panelOrder.map((item) => (
                    <option key={item} value={item}>{panelCopy[item].label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={historyImportantOnly ? 'is-active' : ''}
                onClick={toggleHistoryImportantOnly}
              >
                只看重要
              </button>
            </div>
            {filteredHistory.length ? (
              <div className="thesis-tutor-history-list">
                {filteredHistory.map((item) => (
                  <article key={item.id} className={item.important ? 'is-important' : ''}>
                    <div className="thesis-tutor-history-meta">
                      <span>{item.important ? '重要版本' : item.panelLabel}</span>
                      <em>{new Date(item.created_at).toLocaleDateString('zh-CN')}</em>
                    </div>
                    <input
                      defaultValue={item.customTitle || item.title}
                      onBlur={(event) => renameHistoryItem(item, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                      aria-label="历史版本名称"
                    />
                    <p>{item.input || item.panelLabel}</p>
                    <div className="thesis-tutor-history-actions">
                      <button type="button" onClick={() => restoreHistoryItem(item)}>恢复到结果区</button>
                      <button type="button" onClick={() => toggleHistoryImportant(item)}>
                        {item.important ? '取消重要' : '标记重要'}
                      </button>
                      <button type="button" className="is-danger" onClick={() => removeHistoryItem(item)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="thesis-tutor-empty">当前筛选条件下没有历史记录。</p>
            )}
          </>
        ) : (
          <p className="thesis-tutor-empty">还没有生成记录。</p>
        )}
      </details>
    </aside>
  );
}
