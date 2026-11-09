const AdmZip = require('adm-zip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const textOf = (node) => Array.from(node.getElementsByTagNameNS(WORD, 't'), (item) => item.textContent).join('').trim();

function openDocument(buffer) {
  const zip = new AdmZip(buffer);
  if (!zip.getEntry('word/document.xml')) throw new Error('请选择有效的 Word 招标文件');
  const doc = new DOMParser().parseFromString(zip.readAsText('word/document.xml', 'utf8'), 'application/xml');
  const body = doc.getElementsByTagNameNS(WORD, 'body')[0];
  if (!body) throw new Error('招标文件缺少正文结构');
  const nodes = Array.from(body.childNodes).filter((node) => node.namespaceURI === WORD && node.localName !== 'sectPr');
  return { zip, doc, body, nodes };
}

function headingLevel(node) {
  if (node.localName !== 'p') return null;
  const title = textOf(node);
  if (!title || title.length > 100 || /[。；;]/.test(title)) return null;
  const style = node.getElementsByTagNameNS(WORD, 'pStyle')[0]?.getAttributeNS(WORD, 'val') || '';
  if (/^toc/i.test(style) || node.getElementsByTagNameNS(WORD, 'instrText').length
    || /[.．·…]{3}|\t\s*\d+$/.test(title)) return null;
  const outline = node.getElementsByTagNameNS(WORD, 'outlineLvl')[0]?.getAttributeNS(WORD, 'val');
  if (outline !== undefined && Number(outline) < 9) return Number(outline);
  const styled = /^(?:heading|标题)\s*([1-9])$/i.exec(style);
  if (styled) return Number(styled[1]) - 1;
  if (/^第[一二三四五六七八九十百零\d]+[章节篇部分]/.test(title)) return 0;
  if (/^[一二三四五六七八九十]+[、．.]/.test(title)) return 1;
  if (/^[（(][一二三四五六七八九十\d]+[）)]/.test(title)) return 2;
  if (/^\d+[、．.]/.test(title)) return 2;
  if (/^(?:投标文件格式|商务标格式|商务文件格式|资格审查资料|授权委托书|法定代表人身份证明|投标函)(?:[（(].*[）)])?$/.test(title)) return 1;
  return null;
}

function listBusinessForms(buffer) {
  const { nodes } = openDocument(buffer);
  const headings = nodes.flatMap((node, start) => {
    const level = headingLevel(node);
    return level === null ? [] : [{ start, level, title: textOf(node) }];
  });
  return headings.flatMap((heading, index) => {
    if (!/(?:投标|响应|商务).*(?:格式|表单)|资格审查|授权委托书|法定代表人身份证明|投标函|报价表|偏离表|承诺函|承诺书|业绩表|人员.*表|证书.*表/.test(heading.title)) return [];
    const end = headings.slice(index + 1).find((next) => next.level <= heading.level)?.start ?? nodes.length;
    const selected = nodes.slice(heading.start, end);
    return [{ id: String(heading.start), title: heading.title, start: heading.start, end,
      tableCount: selected.reduce((count, node) => count + (node.localName === 'tbl' ? 1 : 0) + node.getElementsByTagNameNS(WORD, 'tbl').length, 0),
      preview: selected.map(textOf).filter(Boolean).join('\n').slice(0, 1200) }];
  });
}

function extractBusinessForms(buffer, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string')) throw new Error('请选择需要提取的表单章节');
  const candidates = listBusinessForms(buffer);
  const selected = [...new Set(ids)].map((id) => candidates.find((entry) => entry.id === id));
  if (selected.some((entry) => !entry)) throw new Error('表单章节已变化，请重新读取招标文件');
  const { zip, doc, body, nodes } = openDocument(buffer);
  for (const [index, node] of nodes.entries()) {
    if (!selected.some(({ start, end }) => index >= start && index < end)) body.removeChild(node);
  }
  zip.updateFile('word/document.xml', Buffer.from(new XMLSerializer().serializeToString(doc), 'utf8'));
  return zip.toBuffer();
}
module.exports = { listBusinessForms, extractBusinessForms };

const FORM_TITLE = /(?:投标|响应|商务).*(?:格式|表单)|资格审查|授权委托书|法定代表人身份证明|投标函|报价表|偏离表|承诺函|承诺书|业绩表|人员.*表|证书.*表/;

function listMarkdownBusinessForms(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const headings = [];
  let fence;
  const codeLines = new Set();
  lines.forEach((line, start) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      codeLines.add(start);
      if (!fence) fence = marker[1];
      else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = undefined;
      return;
    }
    if (fence) { codeLines.add(start); return; }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(line);
    const title = (heading ? heading[2] : line.trim()).replace(/^\*\*(.*?)\*\*$/, '$1');
    if (!title || title.length > 100 || /[。；;]|[.．·…]{3}|\|/.test(title)) return;
    let level = heading ? heading[1].length - 1 : null;
    if (level === null) {
      if (/^第[一二三四五六七八九十百零\d]+[章节篇部分]/.test(title)) level = 0;
      else if (/^[一二三四五六七八九十]+[、．.]/.test(title)) level = 1;
      else if (/^[（(][一二三四五六七八九十\d]+[）)]|^\d+[、．.]/.test(title)) level = 2;
      else if (FORM_TITLE.test(title) && /(?:格式|资料|书|函|表)$/.test(title)) level = 1;
    }
    if (level !== null) headings.push({ start, level, title });
  });
  const candidates = headings.flatMap((heading, index) => {
    if (!FORM_TITLE.test(heading.title)) return [];
    const end = headings.slice(index + 1).find((next) => next.level <= heading.level)?.start ?? lines.length;
    const content = lines.slice(heading.start, end).join('\n');
    const pipeTables = (content.match(/^\s*\|?\s*:?-{3,}:?\s*\|.*$/gm) || []).length;
    return [{ id: String(heading.start), title: heading.title, start: heading.start, end,
      tableCount: pipeTables + (content.match(/<table\b/gi) || []).length, preview: content.slice(0, 1200) }];
  });
  for (let start = 0; start < lines.length; start += 1) {
    if (codeLines.has(start)) continue;
    let end;
    if (/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[start + 1] || '') && lines[start].includes('|')) {
      end = start + 2;
      while (end < lines.length && lines[end].includes('|') && lines[end].trim() && !codeLines.has(end)) end += 1;
    } else if (/<table\b/i.test(lines[start])) {
      end = start;
      while (end < lines.length && !/<\/table>/i.test(lines[end])) end += 1;
      if (end === lines.length) continue;
      end += 1;
    }
    if (!end || candidates.some((entry) => entry.start <= start && entry.end >= end)) continue;
    candidates.push({ id: String(start), title: `独立表格（第 ${start + 1} 行）`, start, end, tableCount: 1, preview: lines.slice(start, end).join('\n').slice(0, 1200) });
    start = end - 1;
  }
  return candidates.sort((a, b) => a.start - b.start);
}

function extractMarkdownBusinessForms(markdown, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string')) throw new Error('请选择需要提取的表单章节');
  const candidates = listMarkdownBusinessForms(markdown);
  const selected = [...new Set(ids)].map((id) => candidates.find((entry) => entry.id === id));
  if (selected.some((entry) => !entry)) throw new Error('表单章节已变化，请重新读取招标文件');
  return String(markdown).split(/\r?\n/).filter((_, index) => selected.some(({ start, end }) => index >= start && index < end)).join('\n');
}
module.exports.listMarkdownBusinessForms = listMarkdownBusinessForms;
module.exports.extractMarkdownBusinessForms = extractMarkdownBusinessForms;
