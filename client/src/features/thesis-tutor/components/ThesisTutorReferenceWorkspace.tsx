import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { ThesisTutorBibliographyPreview, ThesisTutorState } from '../../../shared/types/contracts/thesisTutor';
import { useToast } from '../../../shared/ui/ToastProvider';
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
  onImportedState: (state: ThesisTutorState) => void;
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
  onImportedState,
}: ThesisTutorReferenceWorkspaceProps) {
  const { showToast } = useToast();
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    referenceId: string; doi: string; title: string; authors: string; year: string; source: string; url: string;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<ThesisTutorBibliographyPreview | null>(null);
  const [importing, setImporting] = useState(false);

  async function previewBibliography() {
    if (!window.yibiao?.thesisTutor) return;
    setImporting(true);
    try {
      const preview = await window.yibiao.thesisTutor.previewBibliographyImport({ references });
      if (!preview.canceled) setImportPreview(preview);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取题录文件失败', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function confirmBibliography() {
    if (!importPreview?.candidates?.length || !window.yibiao?.thesisTutor) return;
    setImporting(true);
    try {
      const result = await window.yibiao.thesisTutor.commitBibliographyImport({
        references,
        candidates: importPreview.candidates,
        fileName: importPreview.fileName || '题录文件',
      });
      onImportedState(result.state);
      setImportPreview(null);
      showToast(`已导入 ${result.addedCount} 条题录，均为待核验`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存题录失败', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function lookUpDoi() {
    if (!activeReference?.doi.trim() || !window.yibiao?.thesisTutor) return;
    setLookingUp(true);
    setLookupResult(null);
    try {
      const result = await window.yibiao.thesisTutor.lookupDoi(activeReference.doi);
      setLookupResult({ ...result, referenceId: activeReference.id });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'DOI 题录查询失败', 'error');
    } finally {
      setLookingUp(false);
    }
  }

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
              <details className="thesis-tutor-bibliography-import">
                <summary>批量导入题录</summary>
                <div><span>支持 RIS、BibTeX 文件；先预览去重，再保存为待核验文献。</span><button type="button" className="secondary-action" onClick={() => void previewBibliography()} disabled={saving || isRunning || importing || references.length >= 80}>{importing ? '读取中…' : '选择题录文件'}</button></div>
              </details>
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
                      <details className="thesis-tutor-reference-details">
                        <summary>检索与核验记录</summary>
                        <div className="thesis-tutor-reference-detail-grid">
                          <label className="is-wide"><span>证据编号（用于正文标记）</span><input value={activeReference.id} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
                          <label><span>DOI（可选）</span><input value={activeReference.doi} onChange={(event) => { updateActiveReference({ doi: event.target.value, verificationStatus: 'unverified' }); setLookupResult(null); }} placeholder="10.xxxx/xxxxx；中文文献可留空" disabled={isRunning} /></label>
                          <div className="thesis-tutor-reference-lookup"><button type="button" className="secondary-action" onClick={() => void lookUpDoi()} disabled={isRunning || saving || lookingUp || !activeReference.doi.trim()}>{lookingUp ? '查询中…' : '核对 DOI 题录'}</button><span>仅查询题录，原文和观点仍需人工核验。</span></div>
                          {lookupResult?.referenceId === activeReference.id && (
                            <div className="thesis-tutor-reference-match">
                              <strong>Crossref 题录候选</strong>
                              <p>{lookupResult.title || '无题名'} · {lookupResult.authors || '无作者'} · {lookupResult.year || '无年份'} · {lookupResult.source || '无来源'}</p>
                              <button type="button" className="secondary-action" onClick={() => { updateActiveReference({ title: lookupResult.title || activeReference.title, authors: lookupResult.authors || activeReference.authors, year: lookupResult.year || activeReference.year, source: lookupResult.source || activeReference.source, doi: lookupResult.doi, verificationSource: lookupResult.url, verificationStatus: 'unverified' }); setLookupResult(null); showToast('已填入候选题录，请打开原文核验后再修改核验状态', 'info'); }} disabled={isRunning || saving}>采用候选题录</button>
                            </div>
                          )}
                          <label><span>检索数据库</span><input value={activeReference.searchDatabase} onChange={(event) => updateActiveReference({ searchDatabase: event.target.value })} placeholder="如知网、万方、PubMed" disabled={isRunning} /></label>
                          <label><span>检索日期</span><input type="date" value={activeReference.searchedAt} onChange={(event) => updateActiveReference({ searchedAt: event.target.value })} disabled={isRunning} /></label>
                          <label className="is-wide"><span>检索式或关键词</span><input value={activeReference.searchQuery} onChange={(event) => updateActiveReference({ searchQuery: event.target.value })} placeholder="记录实际使用的检索词和组合方式" disabled={isRunning} /></label>
                          <label className="is-wide"><span>筛选说明</span><input value={activeReference.screeningNote} onChange={(event) => updateActiveReference({ screeningNote: event.target.value })} placeholder="为何纳入或排除、研究对象与时间范围" disabled={isRunning} /></label>
                          <label className="is-wide"><span>原文定位</span><input value={activeReference.evidenceLocator} onChange={(event) => updateActiveReference({ evidenceLocator: event.target.value, verificationStatus: 'unverified' })} placeholder="页码、章节、图表编号或原文链接；供观点核对" disabled={isRunning} /></label>
                        </div>
                      </details>
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
                  <p>还没有文献或证据条目。可用上方“新增证据”，或在材料区填写内容后拆成证据条目。</p>
                </div>
              )}
              <Dialog.Root open={Boolean(importPreview)} onOpenChange={(open) => { if (!open && !importing) setImportPreview(null); }}>
                <Dialog.Portal>
                  <Dialog.Overlay className="content-regenerate-modal" />
                  <Dialog.Content className="thesis-tutor-help-card thesis-tutor-bibliography-dialog">
                    <Dialog.Title>确认导入题录</Dialog.Title>
                    <Dialog.Description>{importPreview?.fileName} · {importPreview?.format}，识别 {importPreview?.total || 0} 条；可新增 {importPreview?.candidates?.length || 0} 条，重复 {importPreview?.duplicateCount || 0} 条{importPreview?.overflowCount ? `，超出工作区容量 ${importPreview.overflowCount} 条` : ''}。</Dialog.Description>
                    <p>仅导入题录信息，原文、引用格式和观点仍需人工核验。</p>
                    {Boolean(importPreview?.candidates?.length) && <ul>{importPreview?.candidates?.slice(0, 12).map((item, index) => <li key={`${item.doi || item.title}-${index}`}>{item.title}{item.year ? `（${item.year}）` : ''}</li>)}{(importPreview?.candidates?.length || 0) > 12 && <li>其余 {(importPreview?.candidates?.length || 0) - 12} 条将在确认后导入</li>}</ul>}
                    <div className="thesis-tutor-bibliography-dialog-actions">
                      <button type="button" className="secondary-action" onClick={() => setImportPreview(null)} disabled={importing}>取消</button>
                      <button type="button" className="primary-action" onClick={() => void confirmBibliography()} disabled={importing || !importPreview?.candidates?.length}>{importing ? '保存中…' : '确认导入'}</button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
  );
}
