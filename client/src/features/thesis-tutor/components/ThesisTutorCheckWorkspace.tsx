import type { ThesisTutorCheckCategory, ThesisTutorCheckItem, ThesisTutorCheckSeverity, ThesisTutorCheckStatus } from '../types';
import { checkCategoryOptions, checkSeverityOptions, checkStatusOptions } from '../model/thesisTutorPageModel';
import { ThesisTutorPreflightCard } from './ThesisTutorStatusCards';

interface ThesisTutorCheckWorkspaceProps {
  activeCheck: ThesisTutorCheckItem | null;
  checkItems: ThesisTutorCheckItem[];
  finalReviewGate: {
    score: number;
    label: string;
    tone: 'ready' | 'warning' | 'missing';
    summary: string;
    items: Array<{ label: string; status: 'ready' | 'warning' | 'missing'; detail: string }>;
  };
  isRunning: boolean;
  saving: boolean;
  sourceText: string;
  setActiveCheckId: (id: string) => void;
  updateActiveCheck: (patch: Partial<ThesisTutorCheckItem>) => void;
  createDefaultCheckItems: () => void;
  addCheckItem: () => void;
  fillCheckFromSource: () => void;
  removeActiveCheck: () => void;
  saveCheckWorkspace: () => void;
  extractMaterialToWorkspace: () => void;
}

export function ThesisTutorCheckWorkspace({
  activeCheck,
  checkItems,
  finalReviewGate,
  isRunning,
  saving,
  sourceText,
  setActiveCheckId,
  updateActiveCheck,
  createDefaultCheckItems,
  addCheckItem,
  fillCheckFromSource,
  removeActiveCheck,
  saveCheckWorkspace,
  extractMaterialToWorkspace,
}: ThesisTutorCheckWorkspaceProps) {
  return (
            <div className="thesis-tutor-panel thesis-tutor-check-panel">
              <div className="thesis-tutor-panel-head">
                <div>
                  <strong>格式与查重检查清单</strong>
                  <span>把格式、引用、重复表达、AI 味和逻辑问题拆成可勾选事项，生成时会作为检查依据带入。</span>
                </div>
                <div className="thesis-tutor-chapter-actions">
                  <button type="button" className="secondary-action" onClick={createDefaultCheckItems} disabled={saving || isRunning}>生成终稿审查清单</button>
                  <button type="button" className="secondary-action" onClick={addCheckItem} disabled={saving || isRunning}>新增检查项</button>
                  <button type="button" className="secondary-action" onClick={fillCheckFromSource} disabled={saving || isRunning || !sourceText.trim()}>用材料区填问题</button>
                  <button type="button" className="secondary-action is-danger" onClick={removeActiveCheck} disabled={saving || isRunning || !activeCheck}>删除当前</button>
                  <button type="button" className="primary-action" onClick={saveCheckWorkspace} disabled={saving || isRunning || !checkItems.length}>保存清单</button>
                </div>
              </div>
              <ThesisTutorPreflightCard
                className="thesis-tutor-final-review-gate"
                title="终稿质量门"
                summary={finalReviewGate.summary}
                score={finalReviewGate.score}
                label={finalReviewGate.label}
                tone={finalReviewGate.tone}
                items={finalReviewGate.items}
              />
              {checkItems.length ? (
                <>
                  <div className="thesis-tutor-feedback-summary thesis-tutor-check-summary">
                    <span>未检查：{checkItems.filter((item) => item.status === 'unchecked').length}</span>
                    <span>发现问题：{checkItems.filter((item) => item.status === 'issue_found').length}</span>
                    <span>已修正：{checkItems.filter((item) => item.status === 'fixed').length}</span>
                  </div>
                  <div className="thesis-tutor-check-toolbar">
                    <label>
                      <span>当前检查项</span>
                      <select value={activeCheck?.id || ''} onChange={(event) => setActiveCheckId(event.target.value)} disabled={isRunning}>
                        {checkItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>分类</span>
                      <select
                        value={activeCheck?.category || 'format'}
                        onChange={(event) => updateActiveCheck({ category: event.target.value as ThesisTutorCheckCategory })}
                        disabled={!activeCheck || isRunning}
                      >
                        {checkCategoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>严重级别</span>
                      <select
                        value={activeCheck?.severity || 'medium'}
                        onChange={(event) => updateActiveCheck({ severity: event.target.value as ThesisTutorCheckSeverity })}
                        disabled={!activeCheck || isRunning}
                      >
                        {checkSeverityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>状态</span>
                      <select
                        value={activeCheck?.status || 'unchecked'}
                        onChange={(event) => updateActiveCheck({ status: event.target.value as ThesisTutorCheckStatus })}
                        disabled={!activeCheck || isRunning}
                      >
                        {checkStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeCheck && (
                    <div className="thesis-tutor-check-grid">
                      <label>
                        <span>检查项标题</span>
                        <input
                          value={activeCheck.title}
                          onChange={(event) => updateActiveCheck({ title: event.target.value })}
                          placeholder="如 参考文献格式不统一"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>位置</span>
                        <input
                          value={activeCheck.location}
                          onChange={(event) => updateActiveCheck({ location: event.target.value })}
                          placeholder="如 第二章 2.1，参考文献列表，第 12 页"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>问题描述</span>
                        <textarea
                          value={activeCheck.issue}
                          onChange={(event) => updateActiveCheck({ issue: event.target.value })}
                          placeholder="记录格式、引用、重复表达、AI 味或逻辑问题。"
                          disabled={isRunning}
                        />
                      </label>
                      <label>
                        <span>修改建议</span>
                        <textarea
                          value={activeCheck.suggestion}
                          onChange={(event) => updateActiveCheck({ suggestion: event.target.value })}
                          placeholder="写清应该如何修改，或生成后由论文导师补充建议。"
                          disabled={isRunning}
                        />
                      </label>
                      <label className="is-wide">
                        <span>修改记录</span>
                        <textarea
                          value={activeCheck.revisionNotes}
                          onChange={(event) => updateActiveCheck({ revisionNotes: event.target.value })}
                          placeholder="记录已修正内容、暂不处理原因、或下一轮复查说明。"
                          disabled={isRunning}
                        />
                      </label>
                    </div>
                  )}
                  <div className="thesis-tutor-chapter-note">
                    这份清单用于辅助检查，不提供规避查重或 AI 检测的方法。建议把“发现问题”的条目处理完，再导出或提交给导师。
                  </div>
                </>
              ) : (
                <div className="thesis-tutor-chapter-empty">
                  <p>还没有检查项。可以先生成终稿审查清单，也可以根据学校模板、查重报告或导师意见新增单项检查。</p>
                  <div className="thesis-tutor-empty-actions">
                    <button type="button" className="secondary-action" onClick={createDefaultCheckItems} disabled={saving || isRunning}>生成终稿审查清单</button>
                    <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>从材料区拆检查项</button>
                  </div>
                </div>
              )}
            </div>
  );
}
