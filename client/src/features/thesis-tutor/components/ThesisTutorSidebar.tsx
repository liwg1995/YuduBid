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
            <strong>{completedPanels.length}/7</strong>
            <span>阶段成果</span>
          </div>
        </div>
        <div className="thesis-tutor-overview-grid">
          <button type="button" onClick={navigateToDiagnosis}>
            <strong>{profile.title.trim() ? '已定题' : '未定题'}</strong>
            <span>{profile.title.trim() || profile.direction.trim() || '先补方向和题目'}</span>
          </button>
          <button type="button" onClick={() => switchPanel('writing')}>
            <strong>{chapters.length ? `${chapterDoneCount}/${chapters.length}` : '未建章节'}</strong>
            <span>{chapters.length ? `${chapterActiveCount} 个章节推进中` : '从目录生成章节'}</span>
          </button>
          <button type="button" onClick={() => switchPanel('literature')}>
            <strong>{references.length}</strong>
            <span>文献与证据条目</span>
          </button>
          <button type="button" onClick={() => switchPanel('review')}>
            <strong>{openFeedbackCount}</strong>
            <span>{highPriorityFeedbackCount ? `${highPriorityFeedbackCount} 个高优先级` : '待处理反馈'}</span>
          </button>
          <button type="button" onClick={() => switchPanel('format')}>
            <strong>{openCheckCount}</strong>
            <span>{severeCheckCount ? `${severeCheckCount} 个高严重级别` : '待处理检查项'}</span>
          </button>
          <button type="button" onClick={() => switchPanel('topic')}>
            <strong>{profile.stage}</strong>
            <span>{profile.discipline.trim() || '专业未填写'}</span>
          </button>
        </div>
        <div className="thesis-tutor-overview-next">
          <strong>建议下一步</strong>
          <span>
            {profileCompletion < 60
              ? '先补全论文档案和补充档案。'
              : !chapters.length
                ? '从目录计划生成章节工作区。'
                : openFeedbackCount
                  ? '优先处理导师反馈闭环中的待办。'
                  : openCheckCount
                    ? '完成格式与查重检查清单。'
                    : '继续沉淀阶段成果并导出需要的 Word。'}
          </span>
        </div>
      </section>

      <section className="thesis-tutor-panel thesis-tutor-workflow-panel">
        <div className="thesis-tutor-panel-head">
          <div>
            <strong>论文项目进度</strong>
            <span>每次生成或保存结果后，会沉淀为后续模块的项目上下文。</span>
          </div>
        </div>
        <div className="thesis-tutor-workflow-summary">
          <strong>{completedPanels.length}/7</strong>
          <span>已沉淀阶段成果</span>
        </div>
        <div className="thesis-tutor-workflow-list">
          {panelOrder.map((item, index) => {
            const itemResult = panelResults[item];
            const isDone = Boolean(itemResult?.content);
            const isCurrent = item === activePanel;
            return (
              <button
                type="button"
                key={item}
                className={`${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}
                onClick={() => switchPanel(item)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{panelCopy[item].label}</strong>
                  <em>{isDone ? `已保存 · ${new Date(itemResult?.updated_at || '').toLocaleDateString('zh-CN')}` : isCurrent ? '当前模块' : '待推进'}</em>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="thesis-tutor-panel thesis-tutor-history">
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
      </section>
    </aside>
  );
}
