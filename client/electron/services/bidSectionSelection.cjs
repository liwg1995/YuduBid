const SECTION_HEADING = /^\s*(?:#{1,6}\s*)?(?:第\s*)?([一二三四五六七八九十百千零〇两\d]+)\s*(标段|标包|分包|采购包|包件|包)(?:\s*(?:[：:、.．\-—]\s*|\s+).{1,80})?\s*$/;

function normalizeRanges(ranges, totalLines) {
  const sorted = (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      startLine: Math.floor(Number(range?.startLine ?? range?.start_line)),
      endLine: Math.floor(Number(range?.endLine ?? range?.end_line)),
      reason: String(range?.reason || '').trim(),
    }))
    .filter((range) => Number.isInteger(range.startLine) && Number.isInteger(range.endLine)
      && range.startLine >= 1 && range.endLine >= range.startLine && range.endLine <= totalLines)
    .sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.startLine <= previous.endLine + 1) {
      previous.endLine = Math.max(previous.endLine, range.endLine);
      if (range.reason && !previous.reason.includes(range.reason)) previous.reason = [previous.reason, range.reason].filter(Boolean).join('；');
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function normalizeBidSections(sections, markdown) {
  const totalLines = String(markdown || '').split(/\r?\n/).length;
  return (Array.isArray(sections) ? sections : []).map((section, index) => {
    const includeRanges = normalizeRanges(section?.includeRanges, totalLines);
    const title = String(section?.title || '').trim();
    if (!title || !includeRanges.length) return null;
    return {
      id: String(section.id || `section-${index + 1}`).trim(),
      title,
      startLine: includeRanges[0].startLine,
      endLine: includeRanges[includeRanges.length - 1].endLine,
      includeRanges,
      evidence: (Array.isArray(section.evidence) ? section.evidence : []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8),
    };
  }).filter(Boolean);
}

function detectBidSections(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    if (text && text.length <= 100 && SECTION_HEADING.test(text)) headings.push({ line: index + 1, title: text.replace(/^#+\s*/, '') });
  }
  if (headings.length < 2) return [];
  return headings.map((heading, index) => {
    const endLine = index + 1 < headings.length ? headings[index + 1].line - 1 : lines.length;
    return {
      id: `section-${heading.line}`,
      title: heading.title,
      startLine: heading.line,
      endLine,
      includeRanges: [{ startLine: heading.line, endLine, reason: '标题之间的连续范围，建议核对通用条款' }],
      evidence: [heading.title],
    };
  });
}

function selectBidSectionMarkdown(markdown, sectionId, candidates) {
  const source = String(markdown || '');
  if (!sectionId) return source;
  const sections = normalizeBidSections(candidates?.length ? candidates : detectBidSections(source), source);
  const selected = sections.find((section) => section.id === sectionId);
  if (!selected) throw new Error('所选标段已与当前招标文件不匹配，请重新选择');
  const lines = source.split(/\r?\n/);
  const selectedLines = new Set();
  for (const range of selected.includeRanges) {
    for (let line = range.startLine; line <= range.endLine; line += 1) selectedLines.add(line);
  }
  const otherLines = new Set();
  for (const section of sections) {
    if (section.id === selected.id) continue;
    for (const range of section.includeRanges) {
      for (let line = range.startLine; line <= range.endLine; line += 1) {
        if (!selectedLines.has(line)) otherLines.add(line);
      }
    }
  }
  return lines.filter((_, index) => !otherLines.has(index + 1)).join('\n');
}

module.exports = { detectBidSections, normalizeBidSections, selectBidSectionMarkdown };
