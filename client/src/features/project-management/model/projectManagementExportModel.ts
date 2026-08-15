export function normalizeProjectManagementMetaLine(line: string) {
  const metaLabelPattern = '项目名称|文档版本|版本号|版本|编制日期|日期|编制人|所属公司|所属单位|适用对象|适用周期|汇报周期|汇报人|甲方\\/客户|乙方\\/交付方';
  const labelPatterns: Array<[RegExp, string]> = [
    [/项\s*目\s*名\s*称/g, '项目名称'],
    [/文\s*档\s*版\s*本/g, '文档版本'],
    [/版\s*本\s*号/g, '版本号'],
    [/编\s*制\s*日\s*期/g, '编制日期'],
    [/编\s*制\s*人/g, '编制人'],
    [/所\s*属\s*公\s*司/g, '所属公司'],
    [/所\s*属\s*单\s*位/g, '所属单位'],
    [/甲\s*方\s*\/\s*客\s*户/g, '甲方/客户'],
    [/乙\s*方\s*\/\s*交\s*付\s*方/g, '乙方/交付方'],
    [/适\s*用\s*对\s*象/g, '适用对象'],
    [/适\s*用\s*周\s*期/g, '适用周期'],
    [/汇\s*报\s*周\s*期/g, '汇报周期'],
    [/汇\s*报\s*人/g, '汇报人'],
    [/日\s*期/g, '日期'],
    [/版\s*本/g, '版本'],
  ];
  const withoutMarkdown = String(line || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1');
  const normalized = labelPatterns.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), withoutMarkdown);
  if (new RegExp(`(${metaLabelPattern})\\s*[:：]`).test(normalized)) {
    return normalized
      .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
      .replace(/\s*([:：])\s*/g, '$1 ');
  }
  return normalized;
}
export function normalizeProjectManagementExportContent(content: string, documentTitle: string) {
  const normalizeHeadingText = (value: string) => String(value || '')
    .replace(/^[\d.、\s]+/, '')
    .replace(/^《(.+)》$/, '$1')
    .trim();
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  const nextLines = [...lines];
  const normalizeMetaText = (value: string) => value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[ \t　]+/g, '')
    .trim();
  const isCoverMetaBlock = (value: string) => {
    const normalized = normalizeMetaText(value);
    const matches = normalized.match(/项目名称|文档版本|编制日期|编制人|所属公司|所属单位|适用对象|客户|甲方|乙方|交付方/g);
    return (matches?.length || 0) >= 2;
  };

  while (nextLines.length && !nextLines[0].trim()) {
    nextLines.shift();
  }

  if (!nextLines.length) return '';

  const headingMatch = /^(#{1,6})\s+(.+)$/.exec(nextLines[0].trim());
  if (headingMatch && normalizeHeadingText(headingMatch[2]) === documentTitle) {
    nextLines[0] = `# ${documentTitle}`;
  } else {
    nextLines.unshift(`# ${documentTitle}`, '');
  }

  for (let index = 0; index < nextLines.length; index += 1) {
    const line = nextLines[index];
    const currentHeading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (currentHeading && normalizeHeadingText(currentHeading[2]) === documentTitle) {
      nextLines[index] = `${currentHeading[1]} ${documentTitle}`;
    } else {
      nextLines[index] = normalizeProjectManagementMetaLine(line);
    }
  }

  const firstHeadingIndex = nextLines.findIndex((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^\d+(?:\.\d+)*[.、]\s*\S+/.test(trimmed)) return true;
    return index > 0 && /^[-*]\s+\S+/.test(trimmed);
  });
  const preamble = firstHeadingIndex > 0 ? nextLines.slice(0, firstHeadingIndex).join('\n') : '';
  if (firstHeadingIndex > 0 && isCoverMetaBlock(preamble)) {
    return nextLines.slice(firstHeadingIndex).join('\n').trim();
  }

  const metaLabelPattern = '(?:项目名称|文档版本|版本号|版本|编制日期|日期|编制人|所属公司|所属单位|适用对象|适用周期|汇报周期|汇报人|甲方\\/客户|乙方\\/交付方)';
  return nextLines
    .join('\n')
    .replace(new RegExp(`\\s+(?=${metaLabelPattern}\\s*[:：])`, 'g'), '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function demoteMarkdownHeadings(content: string) {
  return String(content || '').replace(/^(#{1,5})(\s+)/gm, '#$1$2');
}
