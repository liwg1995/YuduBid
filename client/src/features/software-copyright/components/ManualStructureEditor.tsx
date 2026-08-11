import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoftwareCopyrightAiIllustration, SoftwareCopyrightManualScreenshot } from '../types';

export interface ManualSection {
  title: string;
  body: string;
  placeholders: string[];
}

export interface ManualStructure {
  preamble: string;
  sections: ManualSection[];
  placeholders: string[];
}

function extractPlaceholders(value: string) {
  return Array.from(value.matchAll(/【截图预留：([^】]+)】/gu), (match) => match[1].trim()).filter(Boolean);
}

export function parseManualStructure(markdown: string): ManualStructure {
  const lines = String(markdown || '').split(/\r?\n/u);
  const headingIndexes = lines.map((line, index) => (/^##\s+\S/u.test(line) ? index : -1)).filter((index) => index >= 0);
  if (!headingIndexes.length) {
    return { preamble: markdown, sections: [], placeholders: extractPlaceholders(markdown) };
  }
  const preamble = lines.slice(0, headingIndexes[0]).join('\n').trimEnd();
  const sections = headingIndexes.map((start, index) => {
    const end = headingIndexes[index + 1] ?? lines.length;
    const title = lines[start].replace(/^##\s+/u, '').trim();
    const body = lines.slice(start + 1, end).join('\n').replace(/^\n+/u, '').trimEnd();
    return { title, body, placeholders: extractPlaceholders(body) };
  });
  return {
    preamble,
    sections,
    placeholders: Array.from(new Set(sections.flatMap((section) => section.placeholders))),
  };
}

function buildManualMarkdown(structure: ManualStructure) {
  const blocks = [
    structure.preamble.trimEnd(),
    ...structure.sections.map((section) => `## ${section.title.trim() || '未命名章节'}\n\n${section.body.trim()}`.trimEnd()),
  ].filter(Boolean);
  return `${blocks.join('\n\n')}\n`;
}

interface ManualStructureEditorProps {
  markdown: string;
  assets: Array<SoftwareCopyrightManualScreenshot | SoftwareCopyrightAiIllustration>;
  expectedDocumentTitle?: string;
  focusDocumentTitleRequest?: number;
  disabled?: boolean;
  onChange: (markdown: string) => void;
}

export function ManualStructureEditor({ markdown, assets, expectedDocumentTitle, focusDocumentTitleRequest = 0, disabled, onChange }: ManualStructureEditorProps) {
  const structure = useMemo(() => parseManualStructure(markdown), [markdown]);
  const [activeIndex, setActiveIndex] = useState(0);
  const documentTitleInputRef = useRef<HTMLInputElement>(null);
  const activeSection = structure.sections[activeIndex];
  const documentTitle = structure.preamble.match(/^#[\t ]+(.*)$/mu)?.[1]?.trim() || '';

  useEffect(() => {
    if (activeIndex >= structure.sections.length) setActiveIndex(Math.max(0, structure.sections.length - 1));
  }, [activeIndex, structure.sections.length]);

  useEffect(() => {
    if (!focusDocumentTitleRequest) return;
    const input = documentTitleInputRef.current;
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      input.focus({ preventScroll: true });
      input.select();
    }, 260);
  }, [focusDocumentTitleRequest]);

  const linkedPlacements = useMemo(() => new Set(assets.map((item) => item.placement).filter(Boolean)), [assets]);
  const linkedCount = structure.placeholders.filter((placeholder) => linkedPlacements.has(placeholder)).length;

  function updateSection(patch: Partial<ManualSection>) {
    if (!activeSection) return;
    const sections = structure.sections.map((section, index) => index === activeIndex ? { ...section, ...patch } : section);
    onChange(buildManualMarkdown({ ...structure, sections }));
  }

  function updateDocumentTitle(title: string) {
    const nextHeading = `# ${title}`;
    const preamble = /^#(?:[\t ]+.*)?$/mu.test(structure.preamble)
      ? structure.preamble.replace(/^#(?:[\t ]+.*)?$/mu, nextHeading)
      : `${nextHeading}\n\n${structure.preamble}`.trimEnd();
    onChange(buildManualMarkdown({ ...structure, preamble }));
  }

  function move(direction: -1 | 1) {
    const target = activeIndex + direction;
    if (target < 0 || target >= structure.sections.length) return;
    const sections = [...structure.sections];
    const [moved] = sections.splice(activeIndex, 1);
    sections.splice(target, 0, moved);
    setActiveIndex(target);
    onChange(buildManualMarkdown({ ...structure, sections }));
  }

  function addSection() {
    const sections = [...structure.sections, { title: '新增章节', body: '请填写本章节的操作说明。', placeholders: [] }];
    setActiveIndex(sections.length - 1);
    onChange(buildManualMarkdown({ ...structure, sections }));
  }

  if (!structure.sections.length) {
    return (
      <div className="software-copyright-structure-empty">
        <strong>未识别到二级章节</strong>
        <span>结构化编辑器根据“## 章节标题”拆分内容。请先在 Markdown 模式中补充章节标题。</span>
      </div>
    );
  }

  return (
    <div className="software-copyright-structure-editor">
      <div className="software-copyright-document-title">
        <label>
          <span>文档总标题</span>
          <input
            ref={documentTitleInputRef}
            value={documentTitle}
            maxLength={100}
            disabled={disabled}
            onChange={(event) => updateDocumentTitle(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={disabled || !expectedDocumentTitle || documentTitle === expectedDocumentTitle}
          onClick={() => updateDocumentTitle(expectedDocumentTitle || '')}
        >
          按登记信息同步
        </button>
        <small>应为“软件全称 + 操作手册”，并与登记信息中的软件全称一致。</small>
      </div>
      <div className="software-copyright-structure-summary">
        <span><strong>{structure.sections.length}</strong> 个章节</span>
        <span><strong>{structure.placeholders.length}</strong> 个截图预留位</span>
        <span><strong>{linkedCount}</strong> 个已关联</span>
        <button type="button" onClick={addSection} disabled={disabled}>新增章节</button>
      </div>
      <div className="software-copyright-structure-layout">
        <nav className="software-copyright-structure-nav" aria-label="操作手册章节">
          {structure.sections.map((section, index) => {
            const linked = section.placeholders.filter((placeholder) => linkedPlacements.has(placeholder)).length;
            return (
              <button
                type="button"
                className={index === activeIndex ? 'is-active' : ''}
                onClick={() => setActiveIndex(index)}
                key={`${index}-${section.title}`}
              >
                <span>{section.title || '未命名章节'}</span>
                <em>{section.placeholders.length ? `${linked}/${section.placeholders.length} 图片` : '无预留位'}</em>
              </button>
            );
          })}
        </nav>
        {activeSection && (
          <div className="software-copyright-structure-content">
            <div className="software-copyright-structure-content-head">
              <label>
                <span>章节标题</span>
                <input
                  value={activeSection.title}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) => updateSection({ title: event.target.value })}
                />
              </label>
              <div>
                <button type="button" onClick={() => move(-1)} disabled={disabled || activeIndex === 0}>上移</button>
                <button type="button" onClick={() => move(1)} disabled={disabled || activeIndex === structure.sections.length - 1}>下移</button>
              </div>
            </div>
            <label className="software-copyright-structure-body">
              <span>章节内容</span>
              <textarea
                value={activeSection.body}
                disabled={disabled}
                onChange={(event) => updateSection({ body: event.target.value })}
              />
            </label>
            <div className="software-copyright-structure-placeholders">
              <strong>本章截图预留位</strong>
              {activeSection.placeholders.length ? activeSection.placeholders.map((placeholder) => (
                <span className={linkedPlacements.has(placeholder) ? 'is-linked' : ''} key={placeholder}>
                  {placeholder}
                  <em>{linkedPlacements.has(placeholder) ? '已关联' : '待关联'}</em>
                </span>
              )) : <p>本章没有截图预留位，可在内容中加入“【截图预留：名称】”。</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
