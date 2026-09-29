const { normalizeBidSections } = require('./bidSectionSelection.cjs');

const MAX_SEGMENT_CHARS = 24000;
const MAX_LINE_FRAGMENT_CHARS = 1400;

function numberedSegments(markdown) {
  const segments = [];
  let current = '';
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  for (const [index, line] of lines.entries()) {
    const parts = [];
    for (let offset = 0; offset < line.length; offset += MAX_LINE_FRAGMENT_CHARS) {
      parts.push(line.slice(offset, offset + MAX_LINE_FRAGMENT_CHARS));
    }
    if (!parts.length) parts.push('');
    for (const [partIndex, part] of parts.entries()) {
      const numbered = `L${String(index + 1).padStart(6, '0')}${parts.length > 1 ? `[${partIndex + 1}/${parts.length}]` : ''} | ${part}\n`;
      if (current && current.length + numbered.length > MAX_SEGMENT_CHARS) {
        segments.push(current);
        current = '';
      }
      current += numbered;
    }
  }
  if (current) segments.push(current);
  return segments;
}

function normalizeCandidate(candidate, index, markdown) {
  const normalized = normalizeBidSections([{
    id: `candidate-${index + 1}`,
    title: candidate?.title,
    includeRanges: candidate?.includeRanges,
    evidence: candidate?.evidence,
  }], markdown)[0];
  if (!normalized) return null;
  const source = String(markdown || '');
  normalized.evidence = normalized.evidence.filter((quote) => source.includes(quote));
  if (!normalized.evidence.length) {
    const lines = source.split(/\r?\n/);
    const firstRange = normalized.includeRanges[0];
    const excerpt = lines.slice(firstRange.startLine - 1, Math.min(firstRange.endLine, firstRange.startLine + 2))
      .map((line) => line.trim()).find(Boolean);
    if (excerpt) normalized.evidence = [excerpt.slice(0, 160)];
  }
  return normalized;
}

function mergeCandidates(candidates, markdown) {
  const merged = new Map();
  for (const [index, candidate] of candidates.entries()) {
    const normalized = normalizeCandidate(candidate, index, markdown);
    if (!normalized) continue;
    const key = normalized.title.replace(/\s+/g, '').replace(/^第/, '').toLowerCase();
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, normalized);
    } else {
      const combined = normalizeBidSections([{
        ...previous,
        includeRanges: [...previous.includeRanges, ...normalized.includeRanges],
        evidence: [...previous.evidence, ...normalized.evidence],
      }], markdown)[0];
      merged.set(key, combined);
    }
  }
  return [...merged.values()]
    .sort((left, right) => left.startLine - right.startLine)
    .map((section, index) => ({ ...section, id: `section-${index + 1}` }));
}

function extractionMessages(segment, index, total) {
  return [
    { role: 'system', content: '你是招标文件标段范围识别专家。只依据提供的原文行号提取明确属于标段、标包、分包、采购包、包件或标的的范围。不得编造原文或行号。' },
    { role: 'user', content: `这是招标文件第 ${index + 1}/${total} 段。每行前缀 L000001 是整份原文的行号；同一行的 [1/2] 等片段仍属于同一个原文行。

请返回 JSON：{"sections":[{"title":"一标段","includeRanges":[{"startLine":1,"endLine":3,"reason":"采购范围"}],"evidence":["原文中的标段名称"]}]}。
只输出有明确归属的行；通用条款、归属不确定的行不输出。一个标段在多处出现时可以给出多个范围。没有明确内容时返回 {"sections":[]}。行号必须来自输入。不要输出解释。

原文：\n${segment}` },
  ];
}

function candidateWithinSegment(candidate, segment) {
  const availableLines = new Set([...segment.matchAll(/(?:^|\n)L(\d{6,})/g)].map((match) => Number(match[1])));
  const includeRanges = (Array.isArray(candidate?.includeRanges) ? candidate.includeRanges : [])
    .filter((range) => {
      const start = Number(range?.startLine);
      const end = Number(range?.endLine);
      return Number.isInteger(start) && Number.isInteger(end) && start <= end
        && availableLines.has(start) && availableLines.has(end);
    });
  return includeRanges.length ? { ...candidate, includeRanges } : null;
}

async function runBidSectionExtractionTask({ aiService, workspaceStore, updateTask }) {
  const markdown = workspaceStore.readTenderMarkdown();
  if (!markdown.trim()) throw new Error('请先导入招标文件');
  const segments = numberedSegments(markdown);
  const all = [];
  const logs = ['开始按原文行号识别投标标段。'];
  updateTask({ status: 'running', progress: 5, logs }, workspaceStore.loadTechnicalPlan());
  for (const [index, segment] of segments.entries()) {
    const result = await aiService.collectJsonResponse({
      messages: extractionMessages(segment, index, segments.length),
      temperature: 0.1,
      response_format: { type: 'json_object' },
      logTitle: `多标段识别-${index + 1}`,
      progressLabel: `多标段识别第 ${index + 1} 段`,
      failureMessage: '标段识别结果不是有效 JSON，请重试',
    });
    if (Array.isArray(result?.sections)) {
      all.push(...result.sections.map((candidate) => candidateWithinSegment(candidate, segment)).filter(Boolean));
    }
    logs.push(`已完成第 ${index + 1}/${segments.length} 段识别。`);
    updateTask({ status: 'running', progress: Math.min(90, Math.round(((index + 1) / segments.length) * 85) + 5), logs: logs.slice(-80) }, workspaceStore.loadTechnicalPlan());
  }
  const sections = mergeCandidates(all, markdown);
  if (sections.length < 2) throw new Error('没有识别到至少两个有明确原文范围的标段；可继续使用标题识别结果');
  const state = workspaceStore.saveDetectedBidSections(sections, markdown);
  logs.push(`已识别 ${sections.length} 个标段。请核对证据和范围后选择本次投标标段。`);
  updateTask({ status: 'success', progress: 100, logs: logs.slice(-80) }, state);
}

module.exports = { runBidSectionExtractionTask, numberedSegments, mergeCandidates, candidateWithinSegment };
