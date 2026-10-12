const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { readWordLayout } = require('./contentLayoutRepair.cjs');

const MAX_PAGES = 300;
const MAX_ISSUES = 24;

function xmlAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name.replace(':', '\\:')}="([^"]*)"`))?.[1];
}

function inspectDocxStructure(buffer) {
  const zip = new AdmZip(buffer);
  const documentXml = zip.getEntry('word/document.xml')?.getData().toString('utf8');
  if (!documentXml) throw new Error('DOCX 缺少正文文件 word/document.xml');
  const issues = [];
  const add = (code, message) => {
    if (issues.length < MAX_ISSUES) issues.push({ page: null, severity: 'review', code, message });
  };
  const pageBreak = /<w:br\b(?=[^>]*\bw:type="page")[^>]*\/?\s*>/g;
  const parts = documentXml.split(pageBreak);
  const hasContent = (part) => /<w:t\b[^>]*>[^<\s][\s\S]*?<\/w:t>|<w:(?:drawing|pict|object)\b/.test(part);
  for (let index = 1; index < parts.length - 1; index += 1) {
    if (!hasContent(parts[index])) {
      add('consecutive-page-breaks', '发现连续手动分页符之间没有正文或图片，可能产生空白页。');
      break;
    }
  }
  if (parts.length > 1 && !hasContent(parts.at(-1))) add('trailing-page-break', '文档末尾有手动分页符，可能产生空白页。');

  const section = [...documentXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].at(-1)?.[0] || '';
  const pageSize = section.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0] || '';
  const margins = section.match(/<w:pgMar\b[^>]*\/?\s*>/)?.[0] || '';
  const pageWidth = Number(xmlAttribute(pageSize, 'w:w'));
  const leftMargin = Number(xmlAttribute(margins, 'w:left'));
  const rightMargin = Number(xmlAttribute(margins, 'w:right'));
  const usableWidth = pageWidth - leftMargin - rightMargin;
  if (pageWidth > 0 && usableWidth <= 0) add('invalid-page-margins', '左右页边距不小于纸张宽度，正文区域可能无法显示。');
  if (usableWidth > 0) {
    const oversizedImage = [...documentXml.matchAll(/<wp:extent\b[^>]*\/?\s*>/g)].some(([tag]) => Number(xmlAttribute(tag, 'cx')) > usableWidth * 635 * 1.05);
    if (oversizedImage) add('wide-image', '至少一张图片的显示宽度超过页面可用宽度，请检查是否越过页边距。');
    const oversizedTable = [...documentXml.matchAll(/<w:tblW\b[^>]*\/?\s*>/g)].some(([tag]) => xmlAttribute(tag, 'w:type') === 'dxa' && Number(xmlAttribute(tag, 'w:w')) > usableWidth * 1.05);
    if (oversizedTable) add('wide-table', '至少一个表格的指定宽度超过页面可用宽度，请检查是否越过页边距。');
  }

  const relationshipsXml = zip.getEntry('word/_rels/document.xml.rels')?.getData().toString('utf8') || '';
  const imageRefs = new Set([...documentXml.matchAll(/\br:embed="([^"]+)"/g)].map((match) => match[1]));
  for (const id of imageRefs) {
    const relation = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].find(([tag]) => xmlAttribute(tag, 'Id') === id)?.[0];
    const target = relation && xmlAttribute(relation, 'Target');
    const imagePath = target && path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join('word', target));
    if (!imagePath || !zip.getEntry(imagePath)) {
      add('missing-image', '发现图片引用缺失或图片文件未写入 DOCX，导出后可能显示为空白。');
      break;
    }
  }
  return { renderer: '内置结构检查', pageCount: null, checkedPages: 0, issues, truncated: issues.length >= MAX_ISSUES };
}

function layoutParagraphs(blocks) {
  return (blocks || []).flatMap((block) => block.kind === 'paragraph' ? [block]
    : (block.rows || []).flatMap((row) => (row.cells || []).flatMap((cell) => layoutParagraphs(cell.blocks))));
}

function inspectRenderedLayout(layout) {
  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  if (pages.length === 0) throw new Error('内置布局引擎没有返回页面');
  const issues = [];
  const checkedPages = Math.min(pages.length, MAX_PAGES);
  const add = (page, code, message, severity = 'review') => {
    if (issues.length < MAX_ISSUES) issues.push({ page, severity, code, message });
  };
  for (let index = 0; index < checkedPages; index += 1) {
    const page = pages[index];
    const blocks = page.fragments || [];
    const paragraphs = layoutParagraphs(blocks);
    const text = paragraphs.flatMap((paragraph) => (paragraph.lines || [])
      .flatMap((line) => (line.spans || []).map((span) => span.text || ''))).join('').trim();
    const hasDrawing = paragraphs.some((paragraph) => (paragraph.lines || [])
      .some((line) => (line.drawings || []).length > 0));
    const hasTable = blocks.some((block) => block.kind === 'table');
    const pageNumber = index + 1;
    if (!text && !hasDrawing && !hasTable) {
      add(pageNumber, 'blank-page', '页面正文区域没有可读取的文字、图片或表格，请核对是否为空白页。', 'warning');
      continue;
    }
    if (index <= 1 || index >= pages.length - 1 || !text || hasDrawing) continue;
    if (text.length < 90 && !hasTable) {
      add(pageNumber, 'sparse-page', `正文仅约 ${text.length} 字，请核对是否存在大块留白。`);
      continue;
    }
    const contentHeight = Number(page.contentBox?.height) || 0;
    const bottom = Math.max(0, ...blocks.map((block) => (Number(block.box?.y) || 0) + (Number(block.box?.height) || 0)));
    if (contentHeight > 0 && text.length >= 90 && bottom < contentHeight * 0.53) {
      add(pageNumber, 'bottom-space', '正文止于页面上半部，请核对是否存在不必要的分页。');
    }
  }
  return {
    renderer: '内置分页预检',
    pageCount: pages.length,
    checkedPages,
    issues,
    truncated: pages.length > MAX_PAGES || issues.length >= MAX_ISSUES,
    note: '使用内置布局引擎预检分页；Word/WPS 的实际分页和表格跨页可能有差异。',
  };
}

async function checkWordLayout(filePath) {
  const target = String(filePath || '').trim();
  if (!path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.docx') throw new Error('请选择有效的 DOCX 导出文件');
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error('DOCX 文件不存在');
  if (stat.size > 100 * 1024 * 1024) throw new Error('DOCX 超过 100 MB，请先缩小文档后再进行版式自检');
  const structure = inspectDocxStructure(await fs.readFile(target));
  try {
    const rendered = inspectRenderedLayout(await readWordLayout(target));
    const room = Math.max(0, MAX_ISSUES - rendered.issues.length);
    return {
      ...rendered,
      issues: [...rendered.issues, ...structure.issues.slice(0, room)],
      truncated: rendered.truncated || structure.issues.length > room,
    };
  } catch (error) {
    return {
      ...structure,
      note: `内置分页预检未完成，已检查 DOCX 结构：${error.message || String(error)}。请在 Word/WPS 中核对分页。`,
    };
  }
}

module.exports = { checkWordLayout, inspectDocxStructure, inspectRenderedLayout };
