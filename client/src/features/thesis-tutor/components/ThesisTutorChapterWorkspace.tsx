import type { ThesisTutorChapter, ThesisTutorChapterStatus } from '../types';
import { chapterStatusOptions } from '../model/thesisTutorPageModel';

interface ThesisTutorChapterWorkspaceProps {
  activePanel: 'drafting' | 'writing';
  activeChapter: ThesisTutorChapter | null;
  chapters: ThesisTutorChapter[];
  isRunning: boolean;
  saving: boolean;
  sourceText: string;
  selectChapter: (chapterId: string) => void;
  updateActiveChapter: (patch: Partial<ThesisTutorChapter>) => void;
  createChaptersFromOutline: () => void;
  addChapter: () => void;
  saveChapterWorkspace: () => void;
  extractMaterialToWorkspace: () => void;
}

export function ThesisTutorChapterWorkspace({
  activePanel,
  activeChapter,
  chapters,
  isRunning,
  saving,
  sourceText,
  selectChapter,
  updateActiveChapter,
  createChaptersFromOutline,
  addChapter,
  saveChapterWorkspace,
  extractMaterialToWorkspace,
}: ThesisTutorChapterWorkspaceProps) {
  return (
    <div className="thesis-tutor-panel thesis-tutor-chapter-panel">
      <div className="thesis-tutor-panel-head">
        <div>
          <strong>章节工作区</strong>
          <span>{activePanel === 'drafting' ? '自动成稿会优先使用当前章节目标、材料和导师反馈，结果可回填为章节草稿。' : '逐章写作会优先参考当前章节的目标、材料、导师反馈和已保存草稿。'}</span>
        </div>
        <div className="thesis-tutor-chapter-actions">
          <button type="button" className="secondary-action" onClick={createChaptersFromOutline} disabled={saving || isRunning}>从目录生成章节</button>
          <button type="button" className="secondary-action" onClick={addChapter} disabled={saving || isRunning}>新增章节</button>
          <button type="button" className="primary-action" onClick={saveChapterWorkspace} disabled={saving || isRunning || !chapters.length}>保存章节</button>
        </div>
      </div>
      {chapters.length ? (
        <>
          <div className="thesis-tutor-chapter-toolbar">
            <label>
              <span>当前章节</span>
              <select value={activeChapter?.id || ''} onChange={(event) => selectChapter(event.target.value)} disabled={isRunning}>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>章节状态</span>
              <select
                value={activeChapter?.status || 'not_started'}
                onChange={(event) => updateActiveChapter({ status: event.target.value as ThesisTutorChapterStatus })}
                disabled={!activeChapter || isRunning}
              >
                {chapterStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {activeChapter && (
            <div className="thesis-tutor-chapter-grid">
              <label>
                <span>章节标题</span>
                <input
                  value={activeChapter.title}
                  onChange={(event) => updateActiveChapter({ title: event.target.value })}
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>本章目标</span>
                <textarea
                  value={activeChapter.goal}
                  onChange={(event) => updateActiveChapter({ goal: event.target.value })}
                  placeholder="如本章要解决的问题、目标字数、论证边界和写作口吻。"
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>本章材料</span>
                <textarea
                  value={activeChapter.material}
                  onChange={(event) => updateActiveChapter({ material: event.target.value })}
                  placeholder="可放本章专用文献、案例、数据、访谈或已有段落摘要。"
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>导师反馈/修改要求</span>
                <textarea
                  value={activeChapter.advisorFeedback}
                  onChange={(event) => updateActiveChapter({ advisorFeedback: event.target.value })}
                  placeholder="如导师批注、必须补充的论点、需要删除或重写的内容。"
                  disabled={isRunning}
                />
              </label>
            </div>
          )}
          <div className="thesis-tutor-chapter-note">
            下方结果区保存后会回填为当前章节草稿；如果只是暂存目标、材料或导师反馈，请点击“保存章节”。
          </div>
        </>
      ) : (
        <div className="thesis-tutor-chapter-empty">
          <p>还没有章节。可以先在“论文档案 → 补充档案 → 论文目录或章节计划”填写目录，再从目录生成章节；也可以直接新增章节。</p>
          <div className="thesis-tutor-empty-actions">
            <button type="button" className="secondary-action" onClick={createChaptersFromOutline} disabled={saving || isRunning}>从目录生成章节</button>
            <button type="button" className="secondary-action" onClick={addChapter} disabled={saving || isRunning}>新增章节</button>
            <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>材料放入章节</button>
          </div>
        </div>
      )}
    </div>
  );
}
