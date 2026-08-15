import type { ThesisTutorChapter, ThesisTutorReference, ThesisTutorReferenceType, ThesisTutorReferenceVerificationStatus } from '../types';
import { referenceTypeOptions, referenceVerificationOptions } from '../model/thesisTutorPageModel';

interface ThesisTutorReferenceWorkspaceProps {
  activeReference: ThesisTutorReference | null;
  references: ThesisTutorReference[];
  chapters: ThesisTutorChapter[];
  isRunning: boolean;
  saving: boolean;
  sourceText: string;
  setActiveReferenceId: (id: string) => void;
  updateActiveReference: (patch: Partial<ThesisTutorReference>) => void;
  addReference: () => void;
  fillReferenceFromSource: () => void;
  removeActiveReference: () => void;
  saveReferenceWorkspace: () => void;
  toggleReferenceChapter: (chapterId: string) => void;
  extractMaterialToWorkspace: () => void;
}

export function ThesisTutorReferenceWorkspace({
  activeReference,
  references,
  chapters,
  isRunning,
  saving,
  sourceText,
  setActiveReferenceId,
  updateActiveReference,
  addReference,
  fillReferenceFromSource,
  removeActiveReference,
  saveReferenceWorkspace,
  toggleReferenceChapter,
  extractMaterialToWorkspace,
}: ThesisTutorReferenceWorkspaceProps) {
  return (
            <div className="thesis-tutor-panel thesis-tutor-reference-panel">
              <div className="thesis-tutor-panel-head">
                <div>
                  <strong>文献与证据链</strong>
                  <span>把真实文献、政策、案例、数据或原文摘录整理成条目；生成时会作为可引用依据带入。</span>
                </div>
                <div className="thesis-tutor-chapter-actions">
                  <button type="button" className="secondary-action" onClick={addReference} disabled={saving || isRunning}>新增证据</button>
                  <button type="button" className="secondary-action" onClick={fillReferenceFromSource} disabled={saving || isRunning || !sourceText.trim()}>用材料区填摘要</button>
                  <button type="button" className="secondary-action is-danger" onClick={removeActiveReference} disabled={saving || isRunning || !activeReference}>删除当前</button>
                  <button type="button" className="primary-action" onClick={saveReferenceWorkspace} disabled={saving || isRunning || !references.length}>保存证据链</button>
                </div>
              </div>
              {references.length ? (
                <>
                  <div className="thesis-tutor-reference-verification-summary">
                    <span>已核验：{references.filter((reference) => reference.verificationStatus === 'verified').length}</span>
                    <span>待核验：{references.filter((reference) => reference.verificationStatus === 'unverified').length}</span>
                    <span>信息不完整：{references.filter((reference) => reference.verificationStatus === 'partial').length}</span>
                    <span>慎用：{references.filter((reference) => reference.verificationStatus === 'invalid').length}</span>
                  </div>
                  <div className="thesis-tutor-reference-toolbar">
                    <label>
                      <span>当前证据</span>
                      <select value={activeReference?.id || ''} onChange={(event) => setActiveReferenceId(event.target.value)} disabled={isRunning}>
                        {references.map((reference) => (
                          <option key={reference.id} value={reference.id}>{reference.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>类型</span>
                      <select
                        value={activeReference?.type || 'literature'}
                        onChange={(event) => updateActiveReference({ type: event.target.value as ThesisTutorReferenceType })}
                        disabled={!activeReference || isRunning}
                      >
                        {referenceTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>核验状态</span>
                      <select
                        value={activeReference?.verificationStatus || 'unverified'}
                        onChange={(event) => updateActiveReference({ verificationStatus: event.target.value as ThesisTutorReferenceVerificationStatus })}
                        disabled={!activeReference || isRunning}
                      >
                        {referenceVerificationOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeReference && (
                    <div className="thesis-tutor-reference-grid">
                      <label className="is-wide">
                        <span>题名/证据名称</span>
                        <input
                          value={activeReference.title}
                          onChange={(event) => updateActiveReference({ title: event.target.value })}
                          placeholder="如论文标题、政策名称、案例名称、数据表名称"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>作者/机构</span>
                        <input
                          value={activeReference.authors}
                          onChange={(event) => updateActiveReference({ authors: event.target.value })}
                          placeholder="如作者、课题组、发布机构"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>年份</span>
                        <input
                          value={activeReference.year}
                          onChange={(event) => updateActiveReference({ year: event.target.value })}
                          placeholder="如 2024"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>来源</span>
                        <input
                          value={activeReference.source}
                          onChange={(event) => updateActiveReference({ source: event.target.value })}
                          placeholder="如期刊、数据库、政府网站、案例公司"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>关键词</span>
                        <input
                          value={activeReference.keywords}
                          onChange={(event) => updateActiveReference({ keywords: event.target.value })}
                          placeholder="用逗号分隔"
                          disabled={isRunning}
                        />
                      </label>
                      <label className="is-wide">
                        <span>规范引用/出处</span>
                        <textarea
                          value={activeReference.citation}
                          onChange={(event) => updateActiveReference({ citation: event.target.value })}
                          placeholder="按学校要求或 GB/T 7714、APA 等格式整理；未整理也可以先贴原始题录。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>核验来源</span>
                        <textarea
                          value={activeReference.verificationSource}
                          onChange={(event) => updateActiveReference({ verificationSource: event.target.value })}
                          placeholder="如知网/万方/期刊官网/政府官网/DOI/原始文件路径。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>核验备注</span>
                        <textarea
                          value={activeReference.verificationNotes}
                          onChange={(event) => updateActiveReference({ verificationNotes: event.target.value })}
                          placeholder="记录缺失字段、核验结果、使用限制或为什么暂时不能作为正式引用。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>摘要/证据内容</span>
                        <textarea
                          value={activeReference.summary}
                          onChange={(event) => updateActiveReference({ summary: event.target.value })}
                          placeholder="粘贴摘要、政策条款、案例事实、数据说明或原文摘录。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>可用观点/写作用途</span>
                        <textarea
                          value={activeReference.keyPoints}
                          onChange={(event) => updateActiveReference({ keyPoints: event.target.value })}
                          placeholder="写清这条证据能支撑哪个观点、适合放在哪一章、使用时要注意什么。"
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                  )}
                  {activeReference && chapters.length > 0 && (
                    <div className="thesis-tutor-reference-chapters">
                      <strong>关联章节</strong>
                      <div>
                        {chapters.map((chapter) => (
                          <button
                            type="button"
                            key={chapter.id}
                            className={activeReference.relatedChapterIds.includes(chapter.id) ? 'is-active' : ''}
                            onClick={() => toggleReferenceChapter(chapter.id)}
                            disabled={isRunning}
                          >
                            {chapter.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="thesis-tutor-chapter-note">
                    提醒：证据链只保存你提供或整理过的真实依据。正文生成会优先使用这些条目，材料不足时会要求补充，不会自动编造引用。
                  </div>
                </>
              ) : (
                <div className="thesis-tutor-chapter-empty">
                  <p>还没有文献或证据条目。可以先新增证据，或把材料粘到下方材料区后结构化提取。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="secondary-action" onClick={addReference} disabled={saving || isRunning}>新增证据</button>
                    <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>从材料区拆证据</button>
                  </div>
                </div>
              )}
            </div>
  );
}
