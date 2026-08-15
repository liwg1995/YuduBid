import type { ThesisTutorPanel } from '../types';
import {
  chartTemplates,
  type ThesisTutorDataPreflight,
  type ThesisTutorDraftingPreflight,
  type ThesisTutorPanelCopy,
} from '../model/thesisTutorPageModel';
import { ThesisTutorPreflightCard } from './ThesisTutorStatusCards';

interface ThesisTutorGenerationWorkspaceProps {
  activePanel: ThesisTutorPanel;
  panel: ThesisTutorPanelCopy;
  selectedChartTemplateIds: string[];
  profileContextItems: string[];
  priorResultCount: number;
  draftingPreflight: ThesisTutorDraftingPreflight;
  dataPreflight: ThesisTutorDataPreflight;
  userInput: string;
  sourceText: string;
  importedSourceFileName?: string;
  nextActionLabel: string;
  materialExtractLabel: string;
  isRunning: boolean;
  saving: boolean;
  setSelectedChartTemplateIds: (ids: string[]) => void;
  setUserInput: (value: string) => void;
  setSourceText: (value: string) => void;
  toggleChartTemplate: (templateId: string) => void;
  applySelectedChartTemplates: () => void;
  generate: () => void;
  importSource: () => void;
  extractMaterialToWorkspace: () => void;
}

export function ThesisTutorGenerationWorkspace({
  activePanel,
  panel,
  selectedChartTemplateIds,
  profileContextItems,
  priorResultCount,
  draftingPreflight,
  dataPreflight,
  userInput,
  sourceText,
  importedSourceFileName,
  nextActionLabel,
  materialExtractLabel,
  isRunning,
  saving,
  setSelectedChartTemplateIds,
  setUserInput,
  setSourceText,
  toggleChartTemplate,
  applySelectedChartTemplates,
  generate,
  importSource,
  extractMaterialToWorkspace,
}: ThesisTutorGenerationWorkspaceProps) {
  return (
    <>
      <div className="thesis-tutor-panel">
        <div className="thesis-tutor-panel-head">
          <div>
            <strong>{panel.inputTitle}</strong>
            <span>{panel.inputHelp}</span>
          </div>
          <button type="button" className="primary-action" onClick={generate} disabled={saving || isRunning}>
            {isRunning ? '生成中...' : nextActionLabel}
          </button>
        </div>
        {activePanel === 'charts' && (
          <div className="thesis-tutor-chart-templates">
            <div className="thesis-tutor-chart-templates-head">
              <div>
                <strong>内置图形模板</strong>
                <span>可多选模板后一次性填入 Mermaid 初稿；你可以直接改节点，也可以继续让模型按论文档案优化。</span>
              </div>
              <div className="thesis-tutor-chart-template-actions">
                <span>已选 {selectedChartTemplateIds.length} 个</span>
                <button type="button" className="secondary-action" onClick={() => setSelectedChartTemplateIds([])} disabled={saving || isRunning || !selectedChartTemplateIds.length}>清空选择</button>
                <button type="button" className="primary-action" onClick={applySelectedChartTemplates} disabled={saving || isRunning || !selectedChartTemplateIds.length}>应用已选模板</button>
              </div>
            </div>
            <div className="thesis-tutor-chart-template-grid">
              {chartTemplates.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  className={selectedChartTemplateIds.includes(template.id) ? 'is-selected' : ''}
                  onClick={() => toggleChartTemplate(template.id)}
                  disabled={saving || isRunning}
                  aria-pressed={selectedChartTemplateIds.includes(template.id)}
                >
                  <strong>{template.title}</strong>
                  <span>{template.description}</span>
                  <em>{template.chartType}</em>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="thesis-tutor-generation-context">
          <strong>本次生成会带入上方论文档案</strong>
          <div>
            {profileContextItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
            <span>项目上下文：{priorResultCount ? `已带入 ${priorResultCount} 个阶段成果` : '暂无前序成果'}</span>
          </div>
        </div>
        {activePanel === 'drafting' && (
          <ThesisTutorPreflightCard
            title="自动成稿前置检查"
            summary={draftingPreflight.summary}
            score={draftingPreflight.score}
            label={draftingPreflight.label}
            tone={draftingPreflight.tone}
            items={draftingPreflight.items}
            modeTitle={draftingPreflight.mode}
            modeDescription="生成时会按材料完整度决定输出深度；缺失处会标注“需补充”或“待核验”。"
          />
        )}
        {activePanel === 'data' && (
          <ThesisTutorPreflightCard
            title="数据与实证预检"
            summary={dataPreflight.summary}
            score={dataPreflight.score}
            label={dataPreflight.label}
            tone={dataPreflight.tone}
            items={dataPreflight.items}
            modeTitle={dataPreflight.recommendation}
            modeDescription="生成时会区分真实数据、待核验数据和缺失数据；不会提前编造统计结论。"
          />
        )}
        <textarea
          className="thesis-tutor-textarea"
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          placeholder={panel.placeholder}
          disabled={isRunning}
        />
      </div>

      <div className="thesis-tutor-panel">
        <div className="thesis-tutor-panel-head">
          <div>
            <strong>{panel.materialTitle}</strong>
            <span>{panel.materialHelp}</span>
          </div>
          <div className="thesis-tutor-material-actions">
            <button type="button" className="secondary-action" onClick={importSource} disabled={saving || isRunning}>导入文件</button>
            <button type="button" className="secondary-action" onClick={extractMaterialToWorkspace} disabled={saving || isRunning || !sourceText.trim()}>
              {materialExtractLabel}
            </button>
          </div>
        </div>
        {importedSourceFileName && (
          <div className="thesis-tutor-source-name">已导入：{importedSourceFileName}</div>
        )}
        <textarea
          className="thesis-tutor-source"
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          placeholder={panel.sourcePlaceholder}
          disabled={isRunning}
        />
      </div>
    </>
  );
}
