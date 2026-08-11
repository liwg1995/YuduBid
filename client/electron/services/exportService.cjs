const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, dialog, nativeImage, shell } = require('electron');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const { getSafeImageDimensions } = require('../utils/safeImageDimensions.cjs');
const { createCanvas, GlobalFonts, loadImage: loadCanvasImage } = require('@napi-rs/canvas');
const { getGeneratedImagesDir, getImportedImagesDir } = require('../utils/paths.cjs');
const { createLocalImageRenderService } = require('./localImageRenderService.cjs');
const { assertRemoteHttpUrl, fetchWithTimeout, readResponseBuffer } = require('../utils/secureHttp.cjs');
const localImageRenderService = createLocalImageRenderService();
const {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  PageBreak,
  Packer,
  Paragraph,
  PageNumber,
  NumberFormat,
  ShadingType,
  SimpleField,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} = require('docx');

const MAX_IMAGE_WIDTH = 520;
const NUMBERING_REFERENCE_PREFIX = 'technical-plan-numbering';
const DOCX_TABLE_WIDTH_TWIPS = 9000;
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 12000;
const WORD_OPTIMIZATION_HEADING_REFERENCE = 'word-optimization-heading-numbering';
const WORD_OPTIMIZATION_IMAGE_MAX_WIDTH = 520;
const WORD_OPTIMIZATION_IMAGE_MAX_HEIGHT = 620;
const PROJECT_MANAGEMENT_IMAGE_MAX_WIDTH = 560;
const PROJECT_MANAGEMENT_IMAGE_MAX_HEIGHT = 620;
const PRESALES_PROPOSAL_IMAGE_MAX_WIDTH = 430;
const PRESALES_PROPOSAL_IMAGE_MAX_HEIGHT = 500;
const WORD_OPTIMIZATION_TABLE_SEQ_ID = 'YDBTable';
const WORD_OPTIMIZATION_FIGURE_SEQ_ID = 'YDBFigure';
const WORD_TWO_CHARS_TWIPS = 480;
const PROJECT_MANAGEMENT_TABLE_FONT_SIZE = 24;
const CANVAS_CJK_FONT_ALIAS = 'YibiaoCJK';
let canvasCjkFontsRegistered = false;

function horizontalizeMermaidForProjectManagement(code) {
  const source = String(code || '');
  return source.replace(
    /^(\s*(?:graph|flowchart))\s+(TD|TB|BT)\b/im,
    (_match, prefix) => `${prefix} LR`,
  );
}

function normalizeXyChartMermaidForExport(code) {
  let source = String(code || '').replace(/\r\n?/g, '\n').trim();
  if (!/^\s*xychart-beta\b/i.test(source)) {
    return source;
  }

  source = source
    .replace(/^\s*xychart-beta\s+/i, 'xychart-beta\n')
    .replace(/[ \t]+(title|x-axis|y-axis|line|bar)\b/g, '\n$1')
    .replace(/\n{2,}/g, '\n')
    .trim();

  source = source.replace(/^(\s*title\s+)(?!["'])(.+)$/gim, (_match, prefix, title) => {
    const cleanTitle = String(title || '').trim().replace(/^["']|["']$/g, '');
    return `${prefix}"${cleanTitle}"`;
  });

  source = source.replace(/^(\s*y-axis\s+)(?!["'\[])(.+?)\s+(-?\d+(?:\.\d+)?\s*-->\s*-?\d+(?:\.\d+)?)\s*$/gim, (_match, prefix, label, range) => {
    const cleanLabel = String(label || '').trim().replace(/^["']|["']$/g, '');
    return `${prefix}"${cleanLabel}" ${range}`;
  });

  return source;
}

function normalizeMermaidForProjectManagementExport(code) {
  return normalizeXyChartMermaidForExport(horizontalizeMermaidForProjectManagement(code));
}

function looksLikeMarkdownTemplate(value) {
  const source = String(value || '').trim();
  if (!source) return false;
  return /^#{1,6}\s+\S/m.test(source)
    || /^\|.+\|$/m.test(source)
    || /^\s*[-*]\s+\S/m.test(source)
    || /\*\*[^*]+\*\*/.test(source)
    || /(?:会议纪要|变更申请单|Action Items|Change Request)/i.test(source);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImageWithTimeout(url, timeoutMs = REMOTE_IMAGE_FETCH_TIMEOUT_MS) {
  const safeUrl = assertRemoteHttpUrl(url, '导出图片地址不安全');
  const response = await fetchWithTimeout(safeUrl, {
    timeoutMs: Math.max(1000, Number(timeoutMs) || REMOTE_IMAGE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return { response, arrayBuffer: null };
  const buffer = await readResponseBuffer(response, 16 * 1024 * 1024);
  return { response, arrayBuffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
}

function clampPercent(value) {
  return Math.max(0, Math.min(Math.round(Number(value) || 0), 100));
}

function reportProgress(context, progress, message, extra = {}) {
  if (!context?.onProgress) return;
  try {
    context.onProgress({
      phase: extra.phase || 'running',
      progress: clampPercent(progress),
      message,
      warnings: [...(context.warnings || [])],
      ...extra,
    });
  } catch (error) {
    console.warn('[export-word] progress callback failed', error);
  }
}

function reportConversionProgress(context, message) {
  const stats = context?.stats || {};
  const total = Math.max(1, (stats.leafCount || 0) + (stats.mermaidCount || 0));
  const done = Math.min(total, (context.convertedLeafCount || 0) + (context.convertedMermaidCount || 0));
  reportProgress(context, 10 + (done / total) * 78, message);
}

function addWarning(context, message) {
  if (context?.warnings) {
    context.warnings.push(message);
  }
  console.warn(`[export-word] ${message}`);
}

function addUnsupportedHtmlWarning(context, tagName) {
  const tag = String(tagName || '').toLowerCase();
  if (!tag) return;
  if (!context.unsupportedHtmlTags) {
    context.unsupportedHtmlTags = new Set();
  }
  if (context.unsupportedHtmlTags.has(tag)) {
    return;
  }
  context.unsupportedHtmlTags.add(tag);
  addWarning(context, `HTML 标签 <${tag}> 导出时已降级，请核对 Word 内容。`);
}

function compactText(value, maxLength = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function countMermaidBlocks(content) {
  return (String(content || '').match(/```mermaid[\s\S]*?```/gi) || []).length;
}

function countOutlineStats(items = []) {
  let leafCount = 0;
  let mermaidCount = 0;

  for (const item of items || []) {
    if (item.children?.length) {
      const childStats = countOutlineStats(item.children);
      leafCount += childStats.leafCount;
      mermaidCount += childStats.mermaidCount;
    } else {
      leafCount += 1;
      mermaidCount += countMermaidBlocks(item.content);
    }
  }

  return { leafCount, mermaidCount };
}

function sanitizeFilename(value) {
  return String(value || '标书文档')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || '标书文档';
}

function cleanText(value) {
  return String(value || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function escapeXml(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripInlineMarkdown(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}

function markdownToPlainBlocks(content) {
  const blocks = [];
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  let paragraphLines = [];
  let inFence = false;
  let fenceLines = [];

  const flushParagraph = () => {
    const text = stripInlineMarkdown(paragraphLines.join(' ').replace(/\s+/g, ' '));
    if (text) blocks.push({ type: 'paragraph', text });
    paragraphLines = [];
  };

  const flushFence = () => {
    const text = fenceLines.join('\n').trim();
    if (text) blocks.push({ type: 'paragraph', text });
    fenceLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^```/.test(line.trim())) {
      if (inFence) {
        flushFence();
        inFence = false;
      } else {
        flushParagraph();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: stripInlineMarkdown(heading[2]) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph();
      const text = splitMarkdownTableCells(line).join('\t');
      if (text && !/^:?-{3,}:?(\t:?-{3,}:?)+$/.test(text)) {
        blocks.push({ type: 'paragraph', text });
      }
      continue;
    }
    paragraphLines.push(line.replace(/^\s*(?:[-*+]|\d+[.)、])\s+/, ''));
  }

  flushParagraph();
  if (inFence) flushFence();
  return blocks;
}

function outlineToMarkdown(items = [], level = 1, lines = []) {
  for (const item of items || []) {
    const title = String(item?.title || '').trim();
    if (title) lines.push(`${'#'.repeat(Math.max(1, Math.min(6, level)))} ${title}`);
    if (item?.content?.trim()) {
      lines.push('', String(item.content).trim(), '');
    }
    if (item?.children?.length) {
      outlineToMarkdown(item.children, level + 1, lines);
    }
  }
  return lines.join('\n');
}

function outlineItemToMarkdown(item, level = 1, includeTitle = true, lines = []) {
  const title = String(item?.title || '').trim();
  if (includeTitle && title) lines.push(`${'#'.repeat(Math.max(1, Math.min(6, level)))} ${title}`);
  if (item?.content?.trim()) {
    lines.push('', String(item.content).trim(), '');
  }
  if (item?.children?.length) {
    for (const child of item.children) {
      outlineItemToMarkdown(child, includeTitle ? level + 1 : level, true, lines);
    }
  }
  return lines.join('\n');
}

function wordParagraphXml(text, options = {}) {
  const chunks = String(text || '').split('\n');
  const runPropertiesXml = options.runPropertiesXml || '';
  const runs = chunks.map((chunk, index) => {
    const breakXml = index > 0 ? '<w:br/>' : '';
    return `${breakXml}<w:t xml:space="preserve">${escapeXml(chunk)}</w:t>`;
  }).join('');
  const paragraphPropertiesXml = options.paragraphPropertiesXml
    || (options.style ? `<w:pPr><w:pStyle w:val="${escapeXml(options.style)}"/></w:pPr>` : '');
  return `<w:p>${paragraphPropertiesXml}<w:r>${runPropertiesXml}${runs || '<w:t></w:t>'}</w:r></w:p>`;
}

function originalTemplateContentXml(outline = [], options = {}) {
  const markdown = outlineToMarkdown(outline);
  return originalTemplateMarkdownXml(markdown, options);
}

function originalTemplateMarkdownXml(markdown, options = {}) {
  const blocks = markdownToPlainBlocks(markdown);
  if (!blocks.length) {
    return '';
  }
  return blocks.map((block) => {
    if (block.type === 'heading') {
      const level = Math.max(1, Math.min(6, Number(block.level) || 1));
      return wordParagraphXml(block.text, { style: `Heading${level}` });
    }
    return wordParagraphXml(block.text, {
      paragraphPropertiesXml: options.paragraphPropertiesXml,
      runPropertiesXml: options.runPropertiesXml,
    });
  }).join('');
}

function normalizeTemplateHeadingText(value) {
  return stripLeadingNumbering(stripInlineMarkdown(value))
    .replace(/^[第\s]*[一二三四五六七八九十百千万\d]+[章节部分篇项条、.．\s]+/, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

function isTemplateHeadingMatch(paragraphText, title) {
  const paragraph = normalizeTemplateHeadingText(paragraphText);
  const target = normalizeTemplateHeadingText(title);
  if (!paragraph || !target) return false;
  return templateHeadingMatchScore(paragraph, target) >= 0.66;
}

function titleBigramSet(value) {
  const text = String(value || '');
  if (text.length <= 1) return new Set(text ? [text] : []);
  const grams = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.push(text.slice(index, index + 2));
  }
  return new Set(grams);
}

function diceCoefficient(leftValue, rightValue) {
  const left = titleBigramSet(leftValue);
  const right = titleBigramSet(rightValue);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return (2 * intersection) / (left.size + right.size);
}

function templateHeadingMatchScore(paragraph, target) {
  if (!paragraph || !target) return 0;
  if (paragraph === target) return 1;
  if (paragraph.endsWith(target) || target.endsWith(paragraph)) return 0.92;
  if (paragraph.includes(target) || target.includes(paragraph)) return 0.84;
  return diceCoefficient(paragraph, target);
}

function findBestTemplateHeadingMatch($, paragraphElements, title, usedIndexes) {
  const target = normalizeTemplateHeadingText(title);
  if (!target) return null;

  let best = null;
  for (let index = 0; index < paragraphElements.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const text = wordParagraphVisibleText($, paragraphElements[index]);
    if (!text || text.length > 80) continue;
    const paragraph = normalizeTemplateHeadingText(text);
    const score = templateHeadingMatchScore(paragraph, target);
    if (score >= 0.66 && (!best || score > best.score)) {
      best = { paragraph: paragraphElements[index], index, score, text };
    }
  }
  return best;
}

function wordParagraphVisibleText($, paragraphElement) {
  return $(paragraphElement).find('w\\:t').toArray().map((node) => $(node).text()).join('').replace(/\s+/g, ' ').trim();
}

function sanitizeParagraphPropertiesXml(value) {
  return String(value || '')
    .replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '')
    .replace(/<w:pageBreakBefore\/>/g, '')
    .replace(/<w:keepNext\/>/g, '')
    .trim();
}

function paragraphPropertiesXml($, paragraphElement) {
  const properties = $(paragraphElement).children('w\\:pPr').first();
  if (!properties.length) return '';
  return sanitizeParagraphPropertiesXml($.xml(properties));
}

function sanitizeRunPropertiesXml(value) {
  return String(value || '')
    .replace(/<w:br\/>/g, '')
    .replace(/<w:t[\s\S]*?<\/w:t>/g, '')
    .replace(/<w:drawing[\s\S]*?<\/w:drawing>/g, '')
    .trim();
}

function runPropertiesXml($, paragraphElement) {
  const properties = $(paragraphElement).find('w\\:rPr').first();
  if (!properties.length) return '';
  return sanitizeRunPropertiesXml($.xml(properties));
}

function isLikelyHeadingParagraph($, paragraphElement) {
  const style = $(paragraphElement).children('w\\:pPr').find('w\\:pStyle').attr('w:val') || '';
  if (/heading|title|标题/i.test(style)) return true;
  const text = wordParagraphVisibleText($, paragraphElement);
  return text.length > 0 && text.length <= 40 && /^(?:第?[一二三四五六七八九十百千万\d]+[章节部分篇项条、.．\s]|[一二三四五六七八九十]+[、.．\s]|\d+(?:\.\d+)*[、.．\s])/.test(text);
}

function findSectionBodyStyle($, paragraphElements, startIndex, endIndex) {
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const paragraph = paragraphElements[index];
    if (!paragraph) continue;
    const text = wordParagraphVisibleText($, paragraph);
    if (!text || isLikelyHeadingParagraph($, paragraph)) continue;
    const propertiesXml = paragraphPropertiesXml($, paragraph);
    const textRunPropertiesXml = runPropertiesXml($, paragraph);
    if (propertiesXml || textRunPropertiesXml) {
      return { paragraphPropertiesXml: propertiesXml, runPropertiesXml: textRunPropertiesXml };
    }
  }
  return { paragraphPropertiesXml: '', runPropertiesXml: '' };
}

function findDefaultBodyStyle($, paragraphElements) {
  for (const paragraph of paragraphElements) {
    const text = wordParagraphVisibleText($, paragraph);
    if (!text || isLikelyHeadingParagraph($, paragraph)) continue;
    const propertiesXml = paragraphPropertiesXml($, paragraph);
    const textRunPropertiesXml = runPropertiesXml($, paragraph);
    if (propertiesXml || textRunPropertiesXml) {
      return { paragraphPropertiesXml: propertiesXml, runPropertiesXml: textRunPropertiesXml };
    }
  }
  return { paragraphPropertiesXml: '', runPropertiesXml: '' };
}

function injectOriginalTemplateContent(documentXml, outline = []) {
  const $ = cheerio.load(documentXml, { xmlMode: true, decodeEntities: false });
  const body = $('w\\:body').first();
  if (!body.length) {
    return { xml: documentXml, matchedCount: 0, unmatchedCount: outline.length };
  }

  const paragraphElements = body.children('w\\:p').toArray();
  const matchedParagraphIndexes = new Set();
  const matches = [];
  const unmatched = [];

  for (const item of outline || []) {
    const title = String(item?.title || '').trim();
    const match = title ? findBestTemplateHeadingMatch($, paragraphElements, title, matchedParagraphIndexes) : null;
    if (match) {
      matches.push({ item, ...match });
      matchedParagraphIndexes.add(match.index);
    } else {
      unmatched.push(item);
    }
  }

  const sortedMatches = matches.sort((a, b) => a.index - b.index);
  const defaultBodyStyle = findDefaultBodyStyle($, paragraphElements);
  for (let index = sortedMatches.length - 1; index >= 0; index -= 1) {
    const match = sortedMatches[index];
    const nextMatch = sortedMatches[index + 1];
    const markdown = outlineItemToMarkdown(match.item, 2, false);
    const sectionBodyStyle = findSectionBodyStyle(
      $,
      paragraphElements,
      match.index,
      nextMatch?.index ?? paragraphElements.length,
    );
    const xml = originalTemplateMarkdownXml(markdown, {
      paragraphPropertiesXml: sectionBodyStyle.paragraphPropertiesXml || defaultBodyStyle.paragraphPropertiesXml,
      runPropertiesXml: sectionBodyStyle.runPropertiesXml || defaultBodyStyle.runPropertiesXml,
    });
    if (!xml) continue;
    if (nextMatch?.paragraph) {
      $(nextMatch.paragraph).before(xml);
    } else {
      const sectPr = body.children('w\\:sectPr').last();
      if (sectPr.length) {
        sectPr.before(xml);
      } else {
        body.append(xml);
      }
    }
  }

  if (unmatched.length) {
    const xml = originalTemplateContentXml(unmatched, defaultBodyStyle);
    if (xml) {
      const sectPr = body.children('w\\:sectPr').last();
      if (sectPr.length) {
        sectPr.before(xml);
      } else {
        body.append(xml);
      }
    }
  }

  return { xml: $.xml(), matchedCount: sortedMatches.length, unmatchedCount: unmatched.length };
}

function resolveTemplatePath(templatePath) {
  const value = String(templatePath || '').trim();
  if (!value) return '';
  if (path.isAbsolute(value)) return value;
  const workspaceDir = app?.getPath ? path.join(app.getPath('userData'), 'workspace') : process.cwd();
  return path.join(workspaceDir, value);
}

function isWordOptimizationEnabled(config) {
  return Boolean(config?.skill_settings?.skills?.['word-optimization']?.enabled);
}

function textRun(text, options = {}) {
  const sourceText = options.cleanMarkdown ? stripInlineMarkdownMarkers(text) : text;
  const normalizedText = options.normalizeNumbering ? normalizeLeadingNumbering(sourceText) : sourceText;
  return new TextRun({
    text: cleanText(normalizedText),
    font: options.font || '宋体',
    size: options.size || 24,
    bold: options.bold,
    italics: options.italics,
    strike: options.strike,
    color: options.color || (options.optimized ? '000000' : undefined),
    underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function normalizeLeadingNumbering(value) {
  return String(value || '')
    .replace(/^(\s*)([一二三四五六七八九十百千万]+)[、.．)]/, '$1（$2）')
    .replace(/^(\s*)(\d+)[、.．)]/, '$1（$2）')
    .replace(/^(\s*)([a-z])[、.．)]/i, '$1$2）');
}

function stripInlineMarkdownMarkers(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\*{2,}/g, '')
    .replace(/_{2,}/g, '');
}

function lineBreakRun() {
  return new TextRun({ break: 1 });
}

function pageBreakParagraph() {
  return paragraph([new PageBreak()], { indent: { left: 0, right: 0, firstLine: 0 }, before: 0, after: 0 });
}

function textRunsWithBreaks(value, options = {}) {
  const source = String(value || '');
  if (options.optimized) {
    // Word 优化导出不保留 Markdown/HTML 的手动换行符，让 Word 按页面宽度自然换行。
    return source.replace(/<br\s*\/?\s*>/gi, '')
      ? [textRun(source.replace(/<br\s*\/?\s*>/gi, ''), options)]
      : [];
  }
  const parts = source.split(/<br\s*\/?\s*>/gi);
  const runs = [];

  parts.forEach((part, index) => {
    if (index > 0) {
      runs.push(lineBreakRun());
    }
    if (part) {
      runs.push(textRun(part, options));
    }
  });

  return runs;
}

function paragraph(children, options = {}) {
  const optimized = Boolean(options.optimized);
  const officialDocument = Boolean(options.officialDocument);
  const projectManagementDocument = Boolean(options.projectManagementDocument);
  const presalesProposalDocument = Boolean(options.presalesProposalDocument);
  const formalDocument = officialDocument || projectManagementDocument || presalesProposalDocument;
  const defaultSpacing = optimized
    ? { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY }
    : presalesProposalDocument
      ? { before: options.before || 0, after: options.after ?? 0, line: 360, lineRule: LineRuleType.AUTO }
    : formalDocument
      ? { before: options.before || 0, after: options.after ?? 0, line: 560, lineRule: LineRuleType.EXACTLY }
    : { before: options.before || 0, after: options.after ?? 160, line: 360 };
  const spacing = options.spacing || defaultSpacing;
  const indent = (optimized || formalDocument) && options.indent === undefined
    ? { left: 0, right: 0, firstLine: WORD_TWO_CHARS_TWIPS }
    : options.indent;

  return new Paragraph({
    children: children?.length ? children : [textRun('')],
    heading: options.heading,
    alignment: options.alignment || (optimized || formalDocument ? AlignmentType.JUSTIFIED : undefined),
    bullet: options.bullet,
    numbering: options.numbering,
    spacing,
    indent,
    border: options.border,
    shading: options.shading,
    keepNext: options.keepNext,
    outlineLevel: options.outlineLevel,
    style: options.style,
    tabStops: options.tabStops,
    run: options.run,
  });
}

function optimizedBodyIndent() {
  return { left: 0, right: 0, firstLine: WORD_TWO_CHARS_TWIPS };
}

function optimizedNumberedBodyIndent() {
  return { left: WORD_TWO_CHARS_TWIPS, right: 0, hanging: WORD_TWO_CHARS_TWIPS };
}

function optimizedTableCellIndent() {
  return { left: 0, right: 0, firstLine: 0, hanging: 0 };
}

function optimizedTableCellParagraphOptions(optimized) {
  return optimized
    ? {
        optimized: true,
        alignment: AlignmentType.CENTER,
        indent: optimizedTableCellIndent(),
        tabStops: [],
      }
    : {};
}

function projectManagementParagraphOptions(overrides = {}) {
  return {
    projectManagementDocument: true,
    indent: { left: 0, right: 0, firstLine: 0 },
    tabStops: [],
    ...overrides,
  };
}

function createProjectManagementCover(payload = {}) {
  const profile = payload.project_profile || payload.projectProfile || {};
  const documentTitle = payload.document_title || payload.documentTitle || payload.project_name || '项目管理文档';
  const projectName = profile.projectName || payload.project_name || '待确认';
  const clientName = profile.clientName || '待确认';
  const vendorName = profile.vendorName || '待确认';
  const projectType = profile.projectType || '待确认';
  const projectGroup = profile.projectGroup || '未分组';
  const currentStage = profile.currentStage || '待确认';
  const exportDate = new Date().toLocaleDateString('zh-CN');
  const metaRows = [
    ['项目名称', projectName],
    ['文档类型', documentTitle],
    ['甲方/客户', clientName],
    ['乙方/交付方', vendorName],
    ['项目类型', projectType],
    ['项目分组', projectGroup],
    ['当前阶段', currentStage],
    ['导出日期', exportDate],
  ];
  const coverTableColumnWidths = [2200, 5400];

  return [
    paragraph([textRun('项目管理文档', { font: '楷体_GB2312', bold: true, size: 48, color: '000000', cleanMarkdown: true })], {
      alignment: AlignmentType.CENTER,
      indent: { left: 0, right: 0, firstLine: 0 },
      before: 560,
      after: 220,
    }),
    paragraph([textRun(documentTitle, { font: '楷体_GB2312', bold: true, size: 38, color: '000000', cleanMarkdown: true })], {
      alignment: AlignmentType.CENTER,
      indent: { left: 0, right: 0, firstLine: 0 },
      after: 420,
    }),
    new Table({
      width: { size: coverTableColumnWidths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
      columnWidths: coverTableColumnWidths,
      layout: TableLayoutType.FIXED,
      alignment: AlignmentType.CENTER,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      },
      rows: metaRows.map(([label, value]) => new TableRow({
        children: [
          new TableCell({
            width: { size: coverTableColumnWidths[0], type: WidthType.DXA },
            margins: { top: 110, bottom: 110, left: 180, right: 180 },
            verticalAlign: VerticalAlign.CENTER,
            children: [paragraph([textRun(label, { font: '楷体_GB2312', bold: true, size: 26, color: '000000', cleanMarkdown: true })], projectManagementParagraphOptions({ alignment: AlignmentType.CENTER }))],
          }),
          new TableCell({
            width: { size: coverTableColumnWidths[1], type: WidthType.DXA },
            margins: { top: 110, bottom: 110, left: 220, right: 220 },
            verticalAlign: VerticalAlign.CENTER,
            children: [paragraph([textRun(value, { font: '仿宋_GB2312', size: 26, color: '000000', cleanMarkdown: true })], projectManagementParagraphOptions())],
          }),
        ],
      })),
    }),
    paragraph([textRun('请在 Word/WPS 中更新目录域后定稿归档', { font: '仿宋_GB2312', size: 22, color: '666666', cleanMarkdown: true })], {
      alignment: AlignmentType.CENTER,
      indent: { left: 0, right: 0, firstLine: 0 },
      before: 360,
      after: 0,
    }),
  ];
}

function createPresalesProposalCover(payload = {}) {
  const profile = payload.project_profile || payload.projectProfile || {};
  const documentTitle = payload.document_title || payload.documentTitle || payload.project_name || '售前方案';
  const projectName = profile.projectName || payload.project_name || '待确认';
  const customerName = profile.customerName || profile.clientName || '待确认';
  const industry = profile.industry || '待确认';
  const currentStage = profile.currentStage || '待确认';
  const owner = profile.owner || '待确认';
  const exportDate = new Date().toLocaleDateString('zh-CN');
  const metaRows = [
    ['项目名称', projectName],
    ['客户名称', customerName],
    ['行业领域', industry],
    ['当前阶段', currentStage],
    ['负责人', owner],
    ['编制单位', '禹都AI解决方案助手'],
    ['保密级别', '内部资料'],
    ['导出日期', exportDate],
  ];
  const coverTableColumnWidths = [2200, 5400];

  return [
    paragraph([textRun('售前方案', { font: '黑体', bold: true, size: 52, color: '000000', cleanMarkdown: true })], {
      alignment: AlignmentType.CENTER,
      indent: { left: 0, right: 0, firstLine: 0 },
      before: 620,
      after: 260,
    }),
    paragraph([textRun(documentTitle, { font: '宋体', bold: true, size: 34, color: '000000', cleanMarkdown: true })], {
      alignment: AlignmentType.CENTER,
      indent: { left: 0, right: 0, firstLine: 0 },
      after: 460,
    }),
    new Table({
      width: { size: coverTableColumnWidths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
      columnWidths: coverTableColumnWidths,
      layout: TableLayoutType.FIXED,
      alignment: AlignmentType.CENTER,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      },
      rows: metaRows.map(([label, value]) => new TableRow({
        children: [
          new TableCell({
            width: { size: coverTableColumnWidths[0], type: WidthType.DXA },
            margins: { top: 110, bottom: 110, left: 180, right: 180 },
            verticalAlign: VerticalAlign.CENTER,
            children: [paragraph([textRun(label, { font: '宋体', bold: true, size: 24, color: '000000', cleanMarkdown: true })], projectManagementParagraphOptions({ alignment: AlignmentType.CENTER }))],
          }),
          new TableCell({
            width: { size: coverTableColumnWidths[1], type: WidthType.DXA },
            margins: { top: 110, bottom: 110, left: 220, right: 220 },
            verticalAlign: VerticalAlign.CENTER,
            children: [paragraph([textRun(value, { font: '宋体', size: 24, color: '000000', cleanMarkdown: true })], projectManagementParagraphOptions())],
          }),
        ],
      })),
    }),
  ];
}

function createProjectManagementTocPage() {
  return [
    paragraph([textRun('目录', { font: '宋体', bold: true, size: 36, color: '000000' })], {
      alignment: AlignmentType.CENTER,
      indent: { left: 0, right: 0, firstLine: 0 },
      after: 280,
    }),
    new TableOfContents('目录', {
      hyperlink: true,
      headingStyleRange: '1-4',
      useAppliedParagraphOutlineLevel: true,
      stylesWithLevels: [1, 2, 3, 4].map((level) => ({ styleName: `Heading${level}`, level })),
    }),
  ];
}

function projectManagementPageMargin() {
  return { top: 2098, right: 1475, bottom: 1890, left: 1587 };
}

function centeredPageNumberFooter(options = {}) {
  return new Footer({
    children: [
      paragraph([new TextRun({
        children: [PageNumber.CURRENT],
        font: options.font || 'Times New Roman',
        size: options.size || 18,
        color: '000000',
      })], {
        alignment: AlignmentType.CENTER,
        indent: { left: 0, right: 0 },
        tabStops: [],
        before: 0,
        after: 0,
      }),
    ],
  });
}

function createProjectManagementTocStyles() {
  return [1, 2, 3, 4].map((level) => ({
    id: `TOC${level}`,
    name: `TOC ${level}`,
    basedOn: 'Normal',
    next: 'Normal',
    semiHidden: true,
    unhideWhenUsed: true,
    paragraph: {
      spacing: { before: 0, after: 0, line: 420, lineRule: LineRuleType.EXACTLY },
      indent: { left: 0, right: 0, firstLine: 0, hanging: 0 },
      rightTabStop: 9350,
    },
    run: {
      font: '仿宋_GB2312',
      size: level === 1 ? 28 : 26,
      color: '000000',
    },
  }));
}

function createPresalesProposalTocStyles() {
  return [1, 2, 3, 4].map((level) => ({
    id: `TOC${level}`,
    name: `TOC ${level}`,
    basedOn: 'Normal',
    next: 'Normal',
    semiHidden: true,
    unhideWhenUsed: true,
    paragraph: {
      spacing: { before: 0, after: 0, line: 360, lineRule: LineRuleType.AUTO },
      indent: { left: 0, right: 0, firstLine: 0, hanging: 0 },
      tabStops: [],
    },
    run: {
      font: { ascii: '宋体', eastAsia: '宋体', hAnsi: '宋体' },
      size: 24,
      color: '000000',
    },
  }));
}

function tableBorders(optimized = false, projectManagementDocument = false) {
  if (projectManagementDocument) {
    return {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    };
  }

  if (optimized) {
    return {
      top: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    };
  }

  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'DCDFF6' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DCDFF6' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'DCDFF6' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'DCDFF6' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E8EDF6' },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E8EDF6' },
  };
}

function tableColumnWidths(columnCount) {
  const safeCount = Math.max(1, columnCount || 1);
  const base = Math.floor(DOCX_TABLE_WIDTH_TWIPS / safeCount);
  const widths = Array.from({ length: safeCount }, () => base);
  widths[widths.length - 1] += DOCX_TABLE_WIDTH_TWIPS - (base * safeCount);
  return widths;
}

function tableCellWidth(columnSpan, totalColumns) {
  const safeTotal = Math.max(1, totalColumns || 1);
  const safeSpan = Math.max(1, columnSpan || 1);
  return Math.round((DOCX_TABLE_WIDTH_TWIPS * safeSpan) / safeTotal);
}

function createTableCell({ children, isHeader = false, columnSpan = 1, totalColumns = 1, optimized = false, projectManagementDocument = false }) {
  const safeSpan = Math.max(1, columnSpan || 1);
  return new TableCell({
    children,
    shading: isHeader && !optimized && !projectManagementDocument ? { type: ShadingType.CLEAR, fill: 'F1F6FF' } : undefined,
    margins: projectManagementDocument
      ? { top: 80, bottom: 80, left: 100, right: 100 }
      : { top: 120, bottom: 120, left: 140, right: 140 },
    columnSpan: safeSpan > 1 ? safeSpan : undefined,
    width: { size: tableCellWidth(safeSpan, totalColumns), type: WidthType.DXA },
    verticalAlign: optimized || projectManagementDocument ? VerticalAlign.CENTER : undefined,
  });
}

function createDocxTable(rows, columnCount, options = {}) {
  const optimized = Boolean(options.optimized);
  const projectManagementDocument = Boolean(options.projectManagementDocument);
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: tableColumnWidths(columnCount),
    layout: optimized || projectManagementDocument ? TableLayoutType.AUTOFIT : TableLayoutType.FIXED,
    alignment: projectManagementDocument ? AlignmentType.CENTER : undefined,
    borders: tableBorders(optimized, projectManagementDocument),
  });
}

function normalizeColumnSpan(value) {
  const span = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(span) && span > 1 ? span : 1;
}

function isMarkdownTableRowLine(line) {
  return /^\s*\|.*\|\s*$/.test(String(line || ''));
}

function isMarkdownTableDelimiterLine(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ''));
}

function splitMarkdownTableCells(line) {
  let source = String(line || '').trim();
  if (!source.includes('|')) {
    return [];
  }
  if (source.startsWith('|')) {
    source = source.slice(1);
  }
  if (source.endsWith('|')) {
    source = source.slice(0, -1);
  }

  const cells = [];
  let current = '';
  let escaped = false;
  for (const char of source) {
    if (char === '|' && !escaped) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
    escaped = char === '\\' && !escaped;
  }
  cells.push(current.trim());
  return cells;
}

function isMarkdownTableDelimiterCell(cell) {
  return /^:?-{3,}:?$/.test(String(cell || '').trim());
}

function markdownTableRowIndent(line) {
  const match = /^(\s*)\|/.exec(String(line || ''));
  return match ? match[1] : '';
}

function formatMarkdownTableRow(cells, indent = '') {
  return `${indent}| ${cells.map((cell) => String(cell || '').trim()).join(' | ')} |`;
}

function expandCompressedMarkdownTableRows(headerLine, nextLine) {
  if (!isMarkdownTableRowLine(headerLine) || !isMarkdownTableRowLine(nextLine)) {
    return null;
  }

  const headerCells = splitMarkdownTableCells(headerLine);
  const nextCells = splitMarkdownTableCells(nextLine);
  const columnCount = headerCells.length;
  if (columnCount < 2 || nextCells.length <= columnCount) {
    return null;
  }

  const delimiterCells = nextCells.slice(0, columnCount);
  if (!delimiterCells.every(isMarkdownTableDelimiterCell)) {
    return null;
  }

  // 模型有时会把分隔行和后续数据行压成同一行，这里按表头列数拆回 GFM 表格。
  const indent = markdownTableRowIndent(headerLine);
  const lines = [formatMarkdownTableRow(headerCells, indent), formatMarkdownTableRow(delimiterCells, indent)];
  const remainingCells = nextCells.slice(columnCount);
  while (remainingCells.length) {
    if (remainingCells.length > columnCount && !remainingCells[0] && remainingCells.length % columnCount !== 0) {
      remainingCells.shift();
      continue;
    }
    const rowCells = remainingCells.splice(0, columnCount);
    if (rowCells.some((cell) => String(cell || '').trim())) {
      lines.push(formatMarkdownTableRow(rowCells, indent));
    }
  }

  return lines;
}

function expandInlineMarkdownTableRows(line) {
  const source = String(line || '');
  if (!/\|\s*:?-{3,}:?\s*\|/.test(source)) {
    return [source];
  }

  const firstPipeIndex = source.indexOf('|');
  if (firstPipeIndex < 0) {
    return [source];
  }

  const prefix = source.slice(0, firstPipeIndex);
  const isIndentedTableLine = /^\s*$/.test(prefix);
  const tableText = source.slice(firstPipeIndex).trim();
  const tableRows = tableText
    .replace(/\|\s+\|/g, '|\n|')
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean);

  if (isIndentedTableLine) {
    return tableRows.map((row) => `${prefix}${row}`);
  }

  return [prefix.trimEnd(), ...tableRows];
}

function normalizeMarkdownTablesForDocx(content) {
  const expandedLines = String(content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(expandInlineMarkdownTableRows);
  const lines = [];

  for (let index = 0; index < expandedLines.length; index += 1) {
    const line = expandedLines[index];
    const nextLine = expandedLines[index + 1] || '';
    const compressedTableRows = expandCompressedMarkdownTableRows(line, nextLine);
    const startsCompressedTable = Boolean(compressedTableRows);
    const startsTable = isMarkdownTableRowLine(line) && isMarkdownTableDelimiterLine(nextLine);
    const previousLine = lines[lines.length - 1] || '';

    if ((startsTable || startsCompressedTable) && previousLine.trim() && !isMarkdownTableRowLine(previousLine)) {
      lines.push('');
    }
    if (compressedTableRows) {
      lines.push(...compressedTableRows);
      index += 1;
      continue;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function createOrderedListReference(context) {
  if (!context.numberingReferences) {
    context.numberingReferences = [];
  }
  context.numberingIndex = (context.numberingIndex || 0) + 1;
  const reference = `${NUMBERING_REFERENCE_PREFIX}-${context.numberingIndex}`;
  context.numberingReferences.push(reference);
  return reference;
}

function headingLevel(level) {
  if (level <= 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  if (level === 4) return HeadingLevel.HEADING_4;
  if (level === 5) return HeadingLevel.HEADING_5;
  return HeadingLevel.HEADING_6;
}

function headingStyleId(level) {
  return `Heading${Math.max(1, Math.min(9, Number(level) || 1))}`;
}

function headingNumberingLevel(level) {
  return Math.max(0, Math.min(8, (Number(level) || 1) - 1));
}

function stripLeadingNumbering(value) {
  return String(value || '')
    .replace(/^\s*(?:\d+(?:\.\d+)*|[（(]?\d+[）)]|[一二三四五六七八九十]+)[、.)．]?\s*/, '')
    .trim();
}

function isNumberedBodyParagraph(value) {
  return /^\s*(?:\d+[、.)．]|[（(]\d+[）)]|[一二三四五六七八九十]+[、.)．]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[-–—•·●◆◇■□])\s*/.test(String(value || ''));
}

function isInlineNumberedHeading(node) {
  const firstChild = node?.children?.[0];
  return firstChild?.type === 'strong'
    && node.children.length > 1
    && isNumberedBodyParagraph(nodeText(firstChild));
}

function isMarkdownBreakNode(node) {
  return node?.type === 'break'
    || (node?.type === 'html' && /^<br\s*\/?\s*>$/i.test(String(node.value || '').trim()));
}

function trimMarkdownBreakNodes(nodes = []) {
  const source = Array.isArray(nodes) ? nodes : [];
  let start = 0;
  let end = source.length;
  while (start < end && isMarkdownBreakNode(source[start])) start += 1;
  while (end > start && isMarkdownBreakNode(source[end - 1])) end -= 1;
  return source.slice(start, end);
}

function splitInlineNumberedHeading(node) {
  const children = trimMarkdownBreakNodes(node?.children || []);
  if (!children.length) return null;
  const breakIndex = children.findIndex(isMarkdownBreakNode);
  if (breakIndex > 0) {
    const headingChildren = children.slice(0, breakIndex);
    const headingText = nodeText({ children: headingChildren }).trim();
    if (isNumberedBodyParagraph(headingText) && headingText.length <= 120) {
      return { headingChildren, bodyChildren: trimMarkdownBreakNodes(children.slice(breakIndex + 1)) };
    }
  }
  if (isInlineNumberedHeading({ ...node, children })) {
    return { headingChildren: [children[0]], bodyChildren: trimMarkdownBreakNodes(children.slice(1)) };
  }
  return null;
}

function isManualFigureCaptionText(value) {
  return /^\s*图\s*(?:\d+\s*)?[：:、.．]\s*\S+/.test(String(value || '').trim())
    || /^\s*图\s+\d+\s+\S+/.test(String(value || '').trim());
}

function isManualTableCaptionText(value) {
  return /^\s*表\s*(?:\d+\s*)?[：:、.．]\s*\S+/.test(String(value || '').trim())
    || /^\s*表\s+\d+\s+\S+/.test(String(value || '').trim());
}

function captionTextRun(value) {
  return textRun(value, { font: '黑体', size: 21, color: '000000' });
}

function summarizeCaptionName(value, fallback = '') {
  const cleaned = stripLeadingNumbering(value)
    .replace(/^(?:图|表)\s*\d*\s*[：:、.．]?\s*/g, '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:、.．]+$/g, '')
    .trim();
  const source = cleaned || fallback;
  if (!source) return '';

  const sentence = source.split(/[，,。；;：:、.．]/).find((part) => part.trim()) || source;
  const compact = sentence
    .replace(/^(?:关于|针对|用于|展示|说明|体现|呈现)/, '')
    .replace(/(?:示意图|架构图|拓扑图|流程图|统计表|汇总表|清单表|明细表)$/, '')
    .trim() || sentence;
  const maxLength = 14;
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function normalizeCaptionSource(value) {
  return stripLeadingNumbering(value)
    .replace(/^(?:图|表)\s*\d*\s*[：:、.．]?\s*/g, '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:、.．]+$/g, '')
    .trim();
}

function simplifyTableCaptionCandidate(value) {
  let text = normalizeCaptionSource(value);
  if (!text) return '';

  text = text
    .replace(/^(?:以下|下面|本文|本节|本章|此处|通过|针对|关于|用于|展示|说明|体现|呈现|列出|梳理)/, '')
    .replace(/(?:如下表所示|如下表|见下表|如下|所示|如下：|见表.*)$/g, '')
    .replace(/(?:的)?(?:主要)?(?:内容|情况|信息|数据|列表|清单)$/g, '')
    .replace(/(?:进行|用于|采用|包括|包含|提供|如下)$/g, '')
    .replace(/^的+/, '')
    .trim();

  const phraseMatches = [
    /([\u4e00-\u9fa5A-Za-z0-9]{2,18}(?:网络区域|资源配置|区域参数|技术参数|功能参数|性能指标|服务清单|配置清单|参数配置|指标统计|明细汇总|对比分析))/,
    /([\u4e00-\u9fa5A-Za-z0-9]{2,18}(?:参数|指标|配置|清单|明细|统计|汇总|对比|列表))/,
  ];
  for (const matcher of phraseMatches) {
    const match = matcher.exec(text);
    if (match?.[1]) {
      text = match[1];
      break;
    }
  }

  text = text
    .replace(/(?:表格|表单|表)$/g, '')
    .replace(/(?:如下表|见下表).*$/g, '')
    .trim();

  if (!text) return '';
  const maxLength = 12;
  const compact = text.length > maxLength ? text.slice(0, maxLength) : text;
  return /(?:表|清单|列表)$/.test(compact) ? compact : `${compact}表`;
}

function rememberParagraphText(context, value) {
  const text = compactText(value || '', 90);
  if (!text) return;
  context.lastParagraphText = text;
  const recent = Array.isArray(context.recentParagraphTexts) ? context.recentParagraphTexts : [];
  recent.push(text);
  context.recentParagraphTexts = recent.slice(-5);
}

function nextCaptionSequence(context, type) {
  if (type === 'table') {
    context.tableCaptionIndex = (context.tableCaptionIndex || 0) + 1;
    return {
      label: '表',
      identifier: WORD_OPTIMIZATION_TABLE_SEQ_ID,
      cachedValue: String(context.tableCaptionIndex),
    };
  }

  context.figureCaptionIndex = (context.figureCaptionIndex || 0) + 1;
  return {
    label: '图',
    identifier: WORD_OPTIMIZATION_FIGURE_SEQ_ID,
    cachedValue: String(context.figureCaptionIndex),
  };
}

function createCaptionParagraph(context, type, name, fallback = '') {
  const sequence = nextCaptionSequence(context, type);
  const captionName = summarizeCaptionName(name, fallback);
  return paragraph([
    captionTextRun(`${sequence.label} `),
    new SimpleField(`SEQ ${sequence.identifier} \\* ARABIC`, sequence.cachedValue),
    ...(captionName ? [captionTextRun(` ${captionName}`)] : []),
  ], {
    optimized: true,
    alignment: AlignmentType.CENTER,
    indent: { left: 0, right: 0 },
    tabStops: [],
    run: { font: '黑体', size: 21, color: '000000' },
  });
}

function inferTableCaptionName(context) {
  const recentTexts = [
    ...(Array.isArray(context.recentParagraphTexts) ? context.recentParagraphTexts : []),
    context.lastParagraphText || '',
  ].filter(Boolean);
  for (const text of recentTexts.slice(-5).reverse()) {
    if (/表|清单|列表|汇总|参数|指标|配置|明细|统计|对比|区域|网络/.test(text)) {
      const captionName = simplifyTableCaptionCandidate(text);
      if (captionName) {
        return captionName;
      }
    }
  }
  return '数据表';
}

function inferMarkdownTableCaptionName(node, context) {
  const contextualName = inferTableCaptionName(context);
  if (contextualName !== '数据表') {
    return contextualName;
  }

  const firstRow = node.children?.[0];
  const headerText = (firstRow?.children || [])
    .map((cell) => nodeText(cell))
    .filter(Boolean)
    .join(' ');
  return simplifyTableCaptionCandidate(headerText) || summarizeCaptionName(headerText, '数据表') || '数据表';
}

function imageTypeFromMime(mime) {
  if (!mime) return null;
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return null;
}

function imageTypeFromPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase().replace('.', '');
  if (ext === 'jpeg') return 'jpg';
  return ['png', 'jpg', 'gif', 'bmp', 'webp', 'svg'].includes(ext) ? ext : null;
}

function registerCanvasCjkFonts() {
  if (canvasCjkFontsRegistered) return;
  canvasCjkFontsRegistered = true;

  const fontCandidates = process.platform === 'darwin'
    ? [
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/System/Library/Fonts/Hiragino Sans GB.ttc',
        '/System/Library/Fonts/Supplemental/Songti.ttc',
        '/System/Library/Fonts/STHeiti Light.ttc',
      ]
    : process.platform === 'win32'
      ? [
          'C:\\Windows\\Fonts\\msyh.ttc',
          'C:\\Windows\\Fonts\\simhei.ttf',
          'C:\\Windows\\Fonts\\simsun.ttc',
        ]
      : [
          '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
        ];

  for (const fontPath of fontCandidates) {
    try {
      if (fs.existsSync(fontPath) && GlobalFonts.registerFromPath(fontPath, CANVAS_CJK_FONT_ALIAS)) {
        return;
      }
    } catch (error) {
      console.warn('[export-word] register CJK font failed', fontPath, error);
    }
  }
}

function parseSvgDeclarations(value) {
  const declarations = {};
  for (const declaration of String(value || '').split(';')) {
    const [rawKey, ...rawValue] = declaration.split(':');
    const key = String(rawKey || '').trim();
    const styleValue = rawValue.join(':').trim().replace(/\s*!important\s*$/i, '');
    if (key && styleValue) declarations[key] = styleValue;
  }
  return declarations;
}

function parseSvgClassStyles(svg) {
  const styles = {};
  const styleBlocks = String(svg || '').match(/<style[\s\S]*?<\/style>/gi) || [];
  for (const block of styleBlocks) {
    const css = block.replace(/<\/?style[^>]*>/gi, '');
    const classRules = css.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g);
    for (const match of classRules) {
      const style = parseSvgDeclarations(match[2]);
      styles[match[1]] = { ...(styles[match[1]] || {}), ...style };
    }
  }
  return styles;
}

const SVG_PRESENTATION_PROPERTIES = new Set([
  'color',
  'fill',
  'fill-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'opacity',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'visibility',
]);

function inlineSvgClassStyles(svg) {
  const source = String(svg || '');
  const $ = cheerio.load(source, { xmlMode: true, decodeEntities: false });
  const originalInlineStyles = new Map();
  const stylesheetStyles = new Map();

  $('*').each((_index, element) => {
    originalInlineStyles.set(element, parseSvgDeclarations($(element).attr('style')));
  });

  $('style').each((_index, styleElement) => {
    const css = $(styleElement).html()?.replace(/\/\*[\s\S]*?\*\//g, '') || '';
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = parseSvgDeclarations(match[2]);
      if (!Object.keys(declarations).length) continue;
      for (const rawSelector of match[1].split(',')) {
        const selector = rawSelector.trim();
        if (!selector || selector.startsWith('@')) continue;
        try {
          $(selector).each((_elementIndex, element) => {
            stylesheetStyles.set(element, {
              ...(stylesheetStyles.get(element) || {}),
              ...declarations,
            });
          });
        } catch (error) {
          console.warn('[export-word] skip unsupported SVG CSS selector', selector, error?.message || String(error));
        }
      }
    }
  });

  $('*').each((_index, element) => {
    const merged = {
      ...(stylesheetStyles.get(element) || {}),
      ...(originalInlineStyles.get(element) || {}),
    };
    if (!Object.keys(merged).length) return;
    $(element).attr('style', Object.entries(merged).map(([key, value]) => `${key}:${value}`).join(';'));
    for (const [key, value] of Object.entries(merged)) {
      if (SVG_PRESENTATION_PROPERTIES.has(key) && !String(value).includes('var(')) {
        $(element).attr(key, value);
      }
    }
  });

  return $.xml();
}

function svgNumeric(value, fallback = 0) {
  const number = Number.parseFloat(String(value || ''));
  return Number.isFinite(number) ? number : fallback;
}

function svgElementStyle($, element, classStyles) {
  const fromClass = ($(element).attr('class') || '')
    .split(/\s+/)
    .filter(Boolean)
    .reduce((style, className) => ({ ...style, ...(classStyles[className] || {}) }), {});
  const inline = parseSvgDeclarations($(element).attr('style'));
  return { ...fromClass, ...inline };
}

function drawSvgTextOverlay(ctx, svg) {
  registerCanvasCjkFonts();
  const $ = cheerio.load(String(svg || ''), { xmlMode: true, decodeEntities: false });
  const classStyles = parseSvgClassStyles(svg);

  $('text').each((_index, element) => {
    const text = $(element).text();
    if (!text) return;

    const style = svgElementStyle($, element, classStyles);
    const size = svgNumeric($(element).attr('font-size') || style['font-size'], 14);
    const weight = String($(element).attr('font-weight') || style['font-weight'] || '500').trim();
    const fill = $(element).attr('fill') || style.fill || '#172a3a';
    const anchor = $(element).attr('text-anchor') || style['text-anchor'] || 'start';
    const x = svgNumeric($(element).attr('x'));
    const y = svgNumeric($(element).attr('y'));

    ctx.save();
    ctx.fillStyle = fill;
    ctx.font = `${weight} ${size}px "${CANVAS_CJK_FONT_ALIAS}", "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
    ctx.textAlign = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  });
}

function pathPointPairs(d) {
  const numbers = String(d || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  const pairs = [];
  for (let index = 0; index < numbers.length - 1; index += 2) {
    pairs.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return pairs;
}

function drawArrowhead(ctx, from, to, color) {
  if (!from || !to) return;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 9;
  const spread = Math.PI / 7;
  const left = {
    x: to.x - size * Math.cos(angle - spread),
    y: to.y - size * Math.sin(angle - spread),
  };
  const right = {
    x: to.x - size * Math.cos(angle + spread),
    y: to.y - size * Math.sin(angle + spread),
  };
  ctx.save();
  ctx.fillStyle = color || '#2563eb';
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSvgArrowheadOverlay(ctx, svg) {
  const $ = cheerio.load(String(svg || ''), { xmlMode: true, decodeEntities: false });
  $('[marker-end]').each((_index, element) => {
    const color = $(element).attr('stroke') || '#2563eb';
    if (element.name === 'line') {
      drawArrowhead(
        ctx,
        { x: svgNumeric($(element).attr('x1')), y: svgNumeric($(element).attr('y1')) },
        { x: svgNumeric($(element).attr('x2')), y: svgNumeric($(element).attr('y2')) },
        color,
      );
      return;
    }

    const pairs = pathPointPairs($(element).attr('d'));
    if (pairs.length >= 2) {
      drawArrowhead(ctx, pairs[pairs.length - 2], pairs[pairs.length - 1], color);
    }
  });
}

async function svgBufferToPngBuffer(buffer) {
  const svg = Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : String(buffer || '');
  try {
    const preparedSvg = inlineSvgClassStyles(svg);
    const foreignObjectCount = (preparedSvg.match(/<foreignObject\b/gi) || []).length;
    if (foreignObjectCount) {
      console.warn('[export-word] SVG contains foreignObject labels; raster output may be incomplete', { foreignObjectCount });
    }
    // @napi-rs/canvas 在部分平台不会应用 SVG <style> 中的文字样式，
    // 先内联 class 样式并移除原文字节点，再由统一的 CJK 文字补绘逻辑绘制。
    const svgWithoutText = preparedSvg.replace(/<text\b[\s\S]*?<\/text>/gi, '');
    const image = await loadCanvasImage(Buffer.from(svgWithoutText, 'utf-8'));
    const width = Math.max(1, Math.round(image.width || 1));
    const height = Math.max(1, Math.round(image.height || 1));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    drawSvgTextOverlay(context, preparedSvg);
    drawSvgArrowheadOverlay(context, preparedSvg);
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.warn('[export-word] canvas SVG rasterization failed; falling back to Electron nativeImage', error?.message || String(error));
    // Electron 的 nativeImage 对部分包含复杂 CSS/marker 的 SVG 兼容性更好。
    // 只在 canvas 转换失败时兜底，避免影响现有 SVG 的文字和箭头增强逻辑。
    const image = nativeImage?.createFromBuffer ? nativeImage.createFromBuffer(Buffer.from(svg, 'utf-8')) : null;
    if (!image || image.isEmpty()) {
      throw error;
    }
    return image.toPNG();
  }
}

async function normalizeImageForDocx(loaded) {
  if (!loaded?.buffer || !loaded.type) {
    return loaded;
  }

  if (loaded.type === 'svg') {
    return { buffer: await svgBufferToPngBuffer(loaded.buffer), type: 'png' };
  }

  if (loaded.type !== 'webp') {
    return loaded;
  }

  const image = nativeImage?.createFromBuffer ? nativeImage.createFromBuffer(loaded.buffer) : null;
  if (!image || image.isEmpty()) {
    throw new Error('WebP 图片转换失败');
  }

  return { buffer: image.toPNG(), type: 'png' };
}

function resolveAssetImagePath(url) {
  if (!app?.getPath) return null;

  const assetUrl = new URL(url);
  const assetRoots = {
    'generated-images': getGeneratedImagesDir(app),
    'imported-images': getImportedImagesDir(app),
  };
  const rootDir = assetRoots[assetUrl.hostname];
  if (!rootDir) return null;

  const relativePath = decodeURIComponent(assetUrl.pathname.replace(/^\/+/, ''));
  if (!relativePath) return null;

  const baseDir = path.resolve(rootDir);
  const resolvedPath = path.resolve(baseDir, relativePath);
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

async function loadImage(source, context = {}, options = {}) {
  const url = String(source || '').trim();
  if (!url) return null;

  const dataUrlMatch = /^data:([^;,]+);base64,(.+)$/i.exec(url);
  if (dataUrlMatch) {
    return {
      buffer: Buffer.from(dataUrlMatch[2], 'base64'),
      type: imageTypeFromMime(dataUrlMatch[1]),
    };
  }

  if (/^yibiao-asset:\/\//i.test(url)) {
    const assetPath = resolveAssetImagePath(url);
    if (!assetPath || !fs.existsSync(assetPath)) {
      return null;
    }

    return {
      buffer: fs.readFileSync(assetPath),
      type: imageTypeFromPath(assetPath),
    };
  }

  if (/^https?:\/\//i.test(url)) {
    const { response, arrayBuffer } = await fetchImageWithTimeout(url, options.timeoutMs || REMOTE_IMAGE_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`图片下载失败：${url}`);
    }
    const type = imageTypeFromMime(response.headers.get('content-type')) || imageTypeFromPath(new URL(url).pathname);
    return { buffer: Buffer.from(arrayBuffer), type };
  }

  const fileUrlPrefix = 'file://';
  const rawPath = url.startsWith(fileUrlPrefix) ? fileURLToPath(url) : url;
  const resolvedPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(context.baseDir || process.cwd(), rawPath);

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  return {
    buffer: fs.readFileSync(resolvedPath),
    type: imageTypeFromPath(resolvedPath),
  };
}

async function loadImageWithRetry(source, context = {}, options = {}) {
  const retryAttempts = Math.max(0, Number(options.retryAttempts) || 0);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 0);
  let attempt = 0;

  while (attempt <= retryAttempts) {
    try {
      return await loadImage(source, context, options);
    } catch (error) {
      if (attempt >= retryAttempts) {
        throw error;
      }

      attempt += 1;
      if (typeof options.onRetry === 'function') {
        options.onRetry(attempt, error);
      }
      if (retryDelayMs > 0) {
        await delay(retryDelayMs * attempt);
      }
    }
  }

  return null;
}

async function imageRunFromNode(node, context, options = {}) {
  let loaded = null;
  const imageLabel = compactText(node.alt || node.url || '未知图片');
  const isMermaidImage = /mermaid/i.test(String(node.alt || '')) || /^https?:\/\/mermaid\.ink\//i.test(String(node.url || ''));
  try {
    loaded = await loadImageWithRetry(node.url, context, options.loadRetry);
  } catch (error) {
    const detail = compactText(error.message || '下载失败', 120);
    const warning = `图片无法导出：${imageLabel}，${detail}`;
    const message = isMermaidImage
      ? `图片无法导出：Mermaid 图，图片数据不可用。请重新导出或检查图表内容。`
      : warning;
    addWarning(context, warning);
    if (isMermaidImage && /^https?:\/\//i.test(String(node.url || ''))) {
      return new ExternalHyperlink({
        children: [textRun(`[${message}]`, { color: 'C83220', underline: true })],
        link: node.url,
      });
    }
    return textRun(`[${message}]`, { color: 'C83220' });
  }
  if (!loaded?.buffer || !loaded.type) {
    const message = `图片无法导出：${imageLabel}，未找到可用图片数据`;
    addWarning(context, message);
    return textRun(`[${message}]`, { color: 'C83220' });
  }

  try {
    loaded = await normalizeImageForDocx(loaded);
  } catch (error) {
    const message = `图片无法导出：${imageLabel}，${error.message || '图片格式转换失败'}`;
    addWarning(context, message);
    return textRun(`[${message}]`, { color: 'C83220' });
  }

  let size;
  try {
    size = getSafeImageDimensions(loaded.buffer);
  } catch (error) {
    const message = `图片无法导出：${imageLabel}，图片尺寸识别失败`;
    addWarning(context, message);
    return textRun(`[${message}]`, { color: 'C83220' });
  }
  const maxImageWidth = context.projectManagementDocumentEnabled
    ? PROJECT_MANAGEMENT_IMAGE_MAX_WIDTH
    : context.presalesProposalDocumentEnabled
      ? PRESALES_PROPOSAL_IMAGE_MAX_WIDTH
    : context.wordOptimizationEnabled
      ? WORD_OPTIMIZATION_IMAGE_MAX_WIDTH
      : MAX_IMAGE_WIDTH;
  const maxImageHeight = context.projectManagementDocumentEnabled
    ? PROJECT_MANAGEMENT_IMAGE_MAX_HEIGHT
    : context.presalesProposalDocumentEnabled
      ? PRESALES_PROPOSAL_IMAGE_MAX_HEIGHT
    : context.wordOptimizationEnabled
      ? WORD_OPTIMIZATION_IMAGE_MAX_HEIGHT
      : Number.POSITIVE_INFINITY;
  const sourceWidth = size.width || maxImageWidth;
  const sourceHeight = size.height || Math.round(maxImageWidth * 0.62);
  const ratio = Math.min(1, maxImageWidth / sourceWidth, maxImageHeight / sourceHeight);
  const width = Math.round(sourceWidth * ratio);
  const height = Math.round(sourceHeight * ratio);

  return new ImageRun({
    type: loaded.type,
    data: loaded.buffer,
    transformation: { width, height },
    altText: {
      title: cleanText(node.alt || '图片'),
      description: cleanText(node.alt || node.url || 'Markdown 图片'),
      name: cleanText(node.alt || 'image'),
    },
  });
}

async function imageParagraphFromSource(source, alt, context, options = {}) {
  return paragraph([await imageRunFromNode({ url: source, alt }, context, options)], { alignment: AlignmentType.CENTER });
}

async function inlineRuns(nodes = [], context = {}, marks = {}) {
  const runs = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const statusRuns = context.projectManagementDocumentEnabled
        ? (projectManagementLeadingStatusRuns(node.value, marks) || projectManagementInlineStatusRuns(node.value, marks))
        : null;
      runs.push(...(statusRuns || textRunsWithBreaks(node.value, marks)));
    } else if (node.type === 'strong') {
      runs.push(...await inlineRuns(node.children, context, { ...marks, bold: true }));
    } else if (node.type === 'emphasis') {
      runs.push(...await inlineRuns(node.children, context, { ...marks, italics: true }));
    } else if (node.type === 'delete') {
      runs.push(...await inlineRuns(node.children, context, { ...marks, strike: true }));
    } else if (node.type === 'inlineCode') {
      runs.push(new TextRun({ text: cleanText(node.value), font: 'Consolas', size: 22, color: '155BD7' }));
    } else if (node.type === 'break') {
      if (!marks.optimized) runs.push(lineBreakRun());
    } else if (node.type === 'html' && /^<br\s*\/?\s*>$/i.test(String(node.value || '').trim())) {
      if (!marks.optimized) runs.push(lineBreakRun());
    } else if (node.type === 'html') {
      const $ = cheerio.load(String(node.value || ''), null, false);
      runs.push(...await htmlInlineRuns($, $.root().contents().toArray(), context, marks));
    } else if (node.type === 'link') {
      const children = await inlineRuns(node.children, context, { ...marks, color: '2174FD', underline: true });
      runs.push(new ExternalHyperlink({ link: node.url, children }));
    } else if (node.type === 'image') {
      runs.push(await imageRunFromNode(node, context));
    } else if (node.children) {
      runs.push(...await inlineRuns(node.children, context, marks));
    }
  }

  return runs;
}

function nodeText(node) {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'inlineCode') return String(node.value || '');
  return (node.children || []).map(nodeText).join('');
}

function isImageOnlyParagraph(node) {
  return (node.children || []).filter((child) => child.type !== 'text' || String(child.value || '').trim()).length === 1
    && (node.children || []).some((child) => child.type === 'image');
}

function isFigureCaptionParagraph(node) {
  return /^图[:：]/.test(nodeText(node).trim());
}

function htmlTagName(node) {
  return String(node?.name || '').toLowerCase();
}

function hasBlockHtmlChildren($, node) {
  return $(node).contents().toArray().some((child) => ['table', 'ul', 'ol', 'blockquote', 'pre', 'div', 'section', 'article', 'img'].includes(htmlTagName(child)));
}

async function htmlInlineRuns($, nodes = [], context = {}, marks = {}) {
  const runs = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push(...textRunsWithBreaks(node.data || '', marks));
      continue;
    }

    if (node.type !== 'tag') {
      continue;
    }

    const tag = htmlTagName(node);
    if (tag === 'br') {
      if (!marks.optimized) runs.push(lineBreakRun());
    } else if (tag === 'strong' || tag === 'b') {
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, bold: true }));
    } else if (tag === 'em' || tag === 'i') {
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, italics: true }));
    } else if (tag === 'code') {
      runs.push(new TextRun({ text: cleanText($(node).text()), font: 'Consolas', size: 22, color: '155BD7' }));
    } else if (tag === 'a') {
      const href = $(node).attr('href') || '';
      const children = await htmlInlineRuns($, $(node).contents().toArray(), context, { ...marks, color: '2174FD', underline: true });
      if (href) {
        runs.push(new ExternalHyperlink({ link: href, children }));
      } else {
        runs.push(...children);
      }
    } else if (tag === 'img') {
      runs.push(await imageRunFromNode({ url: $(node).attr('src'), alt: $(node).attr('alt') || 'HTML 图片' }, context));
    } else {
      if (!['span', 'small', 'sub', 'sup', 'token'].includes(tag)) {
        addUnsupportedHtmlWarning(context, tag);
      }
      runs.push(...await htmlInlineRuns($, $(node).contents().toArray(), context, marks));
    }
  }

  return runs;
}

async function htmlTableToDocx($, tableNode, context) {
  const rows = [];
  const optimized = Boolean(context.wordOptimizationEnabled);
  const rowDescriptors = $(tableNode).find('tr').toArray().map((rowNode) => {
    const cells = $(rowNode).children('th,td').toArray().map((cellNode) => ({
      node: cellNode,
      columnSpan: normalizeColumnSpan($(cellNode).attr('colspan')),
    }));
    return {
      cells,
      columnCount: cells.reduce((sum, cell) => sum + cell.columnSpan, 0),
    };
  }).filter((row) => row.cells.length);
  const maxColumns = Math.max(1, ...rowDescriptors.map((row) => row.columnCount));

  for (const row of rowDescriptors) {
    const cells = [];
    for (const [cellIndex, cell] of row.cells.entries()) {
      const cellNode = cell.node;
      const isHeader = htmlTagName(cellNode) === 'th' || (optimized && rows.length === 0);
      const remainingSpan = cellIndex === row.cells.length - 1 ? maxColumns - row.columnCount : 0;
      cells.push(createTableCell({
        children: [paragraph(await htmlInlineRuns($, $(cellNode).contents().toArray(), context, {
          bold: isHeader,
          font: optimized && isHeader ? '黑体' : undefined,
          optimized,
        }), {
          after: optimized ? 0 : 80,
          ...optimizedTableCellParagraphOptions(optimized),
        })],
        isHeader,
        columnSpan: cell.columnSpan + Math.max(0, remainingSpan),
        totalColumns: maxColumns,
        optimized,
      }));
    }
    rows.push(new TableRow({ children: cells, tableHeader: optimized && rows.length === 0 }));
  }

  if (!rows.length) {
    return [];
  }

  const blocks = [];
  if (optimized) {
    blocks.push(createCaptionParagraph(context, 'table', inferTableCaptionName(context), '数据表'));
  }
  blocks.push(createDocxTable(rows, maxColumns, { optimized }));
  return blocks;
}

async function htmlListToDocx($, listNode, context, options = {}) {
  const blocks = [];
  const ordered = htmlTagName(listNode) === 'ol';
  const numberingReference = ordered ? createOrderedListReference(context) : null;

  for (const itemNode of $(listNode).children('li').toArray()) {
    const inlineNodes = $(itemNode).contents().toArray().filter((child) => !['ul', 'ol'].includes(htmlTagName(child)));
    const listOptions = ordered
      ? { numbering: { reference: numberingReference, level: Math.min(options.listLevel || 0, 2) } }
      : { bullet: { level: Math.min(options.listLevel || 0, 2) } };
    blocks.push(paragraph(await htmlInlineRuns($, inlineNodes, context), listOptions));

    for (const childList of $(itemNode).children('ul,ol').toArray()) {
      blocks.push(...await htmlListToDocx($, childList, context, { ...options, listLevel: (options.listLevel || 0) + 1 }));
    }
  }

  return blocks;
}

async function htmlNodeToDocxBlocks($, node, context, options = {}) {
  if (node.type === 'text') {
    const text = String(node.data || '').trim();
    return text ? [paragraph([textRun(text)])] : [];
  }

  if (node.type !== 'tag') {
    return [];
  }

  const tag = htmlTagName(node);
  if (['p', 'div', 'section', 'article'].includes(tag)
    && !$(node).text().replace(/\u00a0/g, ' ').trim()
    && !$(node).find('img,table,ul,ol').length) {
    return [];
  }
  if (tag === 'table') {
    return htmlTableToDocx($, node, context);
  }
  if (tag === 'img') {
    const alt = $(node).attr('alt') || 'HTML 图片';
    const blocks = [await imageParagraphFromSource($(node).attr('src'), alt, context)];
    if (context.wordOptimizationEnabled) {
      blocks.push(createCaptionParagraph(context, 'figure', alt, '图片'));
    }
    return blocks;
  }
  if (tag === 'ul' || tag === 'ol') {
    return htmlListToDocx($, node, context, options);
  }
  if (tag === 'blockquote') {
    return [paragraph(await htmlInlineRuns($, $(node).contents().toArray(), context, { color: '536176' }), {
      indent: { left: 360 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2174FD' } },
      shading: { type: ShadingType.CLEAR, fill: 'F6F9FF' },
    })];
  }
  if (tag === 'pre') {
    return [paragraph([new TextRun({ text: cleanText($(node).text()), font: 'Consolas', size: 21, color: '243048' })], {
      shading: { type: ShadingType.CLEAR, fill: 'F6F9FF' },
      indent: { left: 260, right: 260 },
    })];
  }
  if (tag === 'br') {
    return context.wordOptimizationEnabled ? [] : [paragraph([lineBreakRun()])];
  }
  if (['div', 'section', 'article'].includes(tag) && hasBlockHtmlChildren($, node)) {
    return htmlNodesToDocxBlocks($, $(node).contents().toArray(), context, options);
  }
  if (tag === 'p' && hasBlockHtmlChildren($, node)) {
    return htmlNodesToDocxBlocks($, $(node).contents().toArray(), context, options);
  }
  if (['p', 'div', 'section', 'article', 'span', 'small', 'sub', 'sup', 'token', 'strong', 'b', 'em', 'i', 'a', 'code'].includes(tag)) {
    return [paragraph(await htmlInlineRuns($, $(node).contents().toArray(), context), {
      alignment: /^图[:：]/.test($(node).text().trim()) ? AlignmentType.CENTER : undefined,
    })];
  }

  addUnsupportedHtmlWarning(context, tag);
  return htmlNodesToDocxBlocks($, $(node).contents().toArray(), context, options);
}

async function htmlNodesToDocxBlocks($, nodes = [], context = {}, options = {}) {
  const blocks = [];
  for (const node of nodes) {
    blocks.push(...await htmlNodeToDocxBlocks($, node, context, options));
  }
  return blocks;
}

async function htmlToDocxBlocks(html, context = {}, options = {}) {
  const source = String(html || '').trim();
  if (!source) {
    return [];
  }

  // 配图类型标记使用 HTML 注释保存于 Markdown 正文中，不应在 Word 中生成告警。
  // remark 会把单独的注释解析为 html 节点，此时没有可见块内容是正常情况。
  const visibleSource = source.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!visibleSource) {
    return [];
  }

  const $ = cheerio.load(visibleSource, null, false);
  const blocks = await htmlNodesToDocxBlocks($, $.root().contents().toArray(), context, options);
  if (!blocks.length) {
    addWarning(context, '部分 HTML 内容未能导出，请核对 Word 内容。');
  }
  return blocks;
}

function projectManagementStatusRuns(value, options = {}) {
  const text = String(value || '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[●○🔴🟡🟢✅❌✖✔☑⚠⏳]/g, '')
    .replace(/\s+/g, '')
    .trim();
  const statusMap = {
    红: { label: '红', color: 'E60012' },
    红色: { label: '红', color: 'E60012' },
    红色预警: { label: '红色预警', color: 'E60012' },
    高: { label: '高', color: 'E60012' },
    高风险: { label: '高', color: 'E60012' },
    高等级: { label: '高', color: 'E60012' },
    高优先级: { label: '高', color: 'E60012' },
    严重: { label: '严重', color: 'E60012' },
    未达成: { label: '未达成', color: 'E60012' },
    黄: { label: '黄', color: 'F59E0B' },
    黄色: { label: '黄', color: 'F59E0B' },
    黄色预警: { label: '黄色预警', color: 'F59E0B' },
    中: { label: '中', color: 'F59E0B' },
    中风险: { label: '中', color: 'F59E0B' },
    中等级: { label: '中', color: 'F59E0B' },
    中优先级: { label: '中', color: 'F59E0B' },
    中等: { label: '中等', color: 'F59E0B' },
    一般: { label: '一般', color: 'F59E0B' },
    部分达成: { label: '部分达成', color: 'F59E0B' },
    待确认: { label: '待确认', color: 'F59E0B' },
    进行中: { label: '进行中', color: 'F59E0B' },
    绿: { label: '绿', color: '16A34A' },
    绿色: { label: '绿', color: '16A34A' },
    绿色正常: { label: '绿色正常', color: '16A34A' },
    低: { label: '低', color: '16A34A' },
    低风险: { label: '低', color: '16A34A' },
    低等级: { label: '低', color: '16A34A' },
    低优先级: { label: '低', color: '16A34A' },
    达成: { label: '达成', color: '16A34A' },
    正常: { label: '正常', color: '16A34A' },
    良好: { label: '良好', color: '16A34A' },
  };
  const status = statusMap[text];
  if (!status) return null;
  const size = options.size || 21;
  return [
    textRun('● ', { font: '仿宋_GB2312', size, color: status.color }),
    textRun(status.label, { font: '仿宋_GB2312', size, color: '000000', cleanMarkdown: true }),
  ];
}

function projectManagementStatusFromToken(value) {
  const raw = String(value || '').replace(/[\uFE0E\uFE0F]/g, '').trim();
  if (/^(?:🔴|❌|✖)\s*$/.test(raw)) {
    return { label: '红', color: 'E60012' };
  }
  if (/^(?:🟡|⚠|⏳)\s*$/.test(raw)) {
    return { label: '预警', color: 'F59E0B' };
  }
  if (/^(?:🟢|✅|✔|☑)\s*$/.test(raw)) {
    return { label: '达成', color: '16A34A' };
  }
  const text = raw
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[●○]/g, '')
    .replace(/[🔴🟡🟢✅❌✖✔☑⚠⏳]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!text) return null;
  if (/^(?:🔴|❌|✖|未达成|红色预警|高风险|高等级|高优先级|严重|红色|红|高)$/.test(text)) {
    return { label: text.replace(/^(?:🔴|❌|✖)/, '') || '红', color: 'E60012' };
  }
  if (/^(?:🟡|⚠|⏳|黄色预警|中风险|中等级|中优先级|中等|一般|部分达成|待确认|进行中|风险|预警|黄色|黄|中)$/.test(text)) {
    return { label: text.replace(/^(?:🟡|⚠|⏳)/, '') || '预警', color: 'F59E0B' };
  }
  if (/^(?:🟢|✅|✔|☑|绿色正常|低风险|低等级|低优先级|达成|正常|良好|绿色|绿|低)$/.test(text)) {
    return { label: text.replace(/^(?:🟢|✅|✔|☑)/, '') || '达成', color: '16A34A' };
  }
  return null;
}

function projectManagementStatusInlineRuns(token, marks = {}) {
  const status = projectManagementStatusFromToken(token);
  if (!status) return null;
  return [
    textRun('● ', { ...marks, font: marks.font || '仿宋_GB2312', size: marks.size || 21, color: status.color }),
    textRun(status.label, { ...marks, font: marks.font || '仿宋_GB2312', size: marks.size || 21, color: '000000', cleanMarkdown: true }),
  ];
}

function projectManagementLeadingStatusRuns(value, marks = {}) {
  const source = String(value || '');
  const emojiMatch = /^(\s*)(🔴|🟡|🟢|✅|❌|✔|✖|☑|⚠️?|⏳)\s*(高风险|中风险|低风险|红色预警|黄色预警|绿色正常|未达成|部分达成|达成|待确认|进行中|风险|预警|正常|良好)?([\s\S]*)$/u.exec(source);
  const numberedMatch = /^(\s*(?:\d+(?:\.\d+)*[.、)]|[（(]?\d+[）)])\s*)(高风险|中风险|低风险|高等级|中等级|低等级|高优先级|中优先级|低优先级|红色预警|黄色预警|绿色正常|红色|黄色|绿色|严重|中等|一般|未达成|部分达成|达成|待确认|进行中|正常|良好|高|中|低|红|黄|绿)(?=[:：、，,\s]|风险|$)([\s\S]*)$/u.exec(source);
  const match = emojiMatch
    ? [emojiMatch[0], emojiMatch[1], emojiMatch[3] || emojiMatch[2], emojiMatch[4] || '']
    : numberedMatch;
  if (!match) return null;
  const statusRuns = projectManagementStatusInlineRuns(match[2], marks) || projectManagementStatusRuns(match[2]);
  if (!statusRuns) return null;
  const rest = match[3] || '';
  return [
    ...(match[1] ? [textRun(match[1], marks)] : []),
    ...statusRuns,
    ...(rest ? [textRun(rest, marks)] : []),
  ];
}

function projectManagementInlineStatusRuns(value, marks = {}) {
  const source = String(value || '').replace(/[\uFE0E\uFE0F]/g, '');
  const tokenPattern = /(🔴|🟡|🟢|✅|❌|✔|✖|☑|⚠\s*(?:高风险|中风险|低风险|风险|预警)?|⏳)/gu;
  const runs = [];
  let lastIndex = 0;
  let hasStatus = false;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index || 0;
    const statusRuns = projectManagementStatusInlineRuns(token, marks);
    if (!statusRuns) {
      continue;
    }
    if (index > lastIndex) {
      runs.push(...textRunsWithBreaks(source.slice(lastIndex, index), marks));
    }
    runs.push(...statusRuns);
    lastIndex = index + token.length;
    hasStatus = true;
  }
  if (!hasStatus) return null;
  if (lastIndex < source.length) {
    runs.push(...textRunsWithBreaks(source.slice(lastIndex), marks));
  }
  return runs;
}

async function tableCellParagraphs(cell, context, isHeader = false) {
  const optimized = Boolean(context.wordOptimizationEnabled);
  const projectManagementDocument = Boolean(context.projectManagementDocumentEnabled);
  const projectTableParagraphOptions = projectManagementDocument
    ? {
        projectManagementDocument: true,
        alignment: AlignmentType.CENTER,
        indent: optimizedTableCellIndent(),
        tabStops: [],
        after: 0,
        spacing: { before: 0, after: 0, line: 300, lineRule: LineRuleType.EXACTLY },
      }
    : {};
  if (projectManagementDocument && !isHeader) {
    const statusRuns = projectManagementStatusRuns(nodeText(cell), { size: PROJECT_MANAGEMENT_TABLE_FONT_SIZE });
    if (statusRuns) {
      return [paragraph(statusRuns, projectTableParagraphOptions)];
    }
  }
  const phrasingNodes = (cell.children || []).filter((child) => child.type !== 'paragraph');
  if (phrasingNodes.length) {
    return [paragraph(await inlineRuns(phrasingNodes, context, {
      bold: isHeader,
      font: projectManagementDocument ? '仿宋_GB2312' : optimized && isHeader ? '黑体' : undefined,
      size: projectManagementDocument ? PROJECT_MANAGEMENT_TABLE_FONT_SIZE : undefined,
      color: projectManagementDocument ? '000000' : undefined,
      optimized,
      cleanMarkdown: projectManagementDocument,
    }), {
      after: optimized ? 0 : 80,
      ...optimizedTableCellParagraphOptions(optimized),
      ...projectTableParagraphOptions,
    })];
  }

  const paragraphNodes = (cell.children || []).filter((child) => child.type === 'paragraph');
  if (projectManagementDocument && paragraphNodes.length) {
    return Promise.all(paragraphNodes.map(async (node) => paragraph(await inlineRuns(node.children || [], context, {
      bold: isHeader,
      font: '仿宋_GB2312',
      size: PROJECT_MANAGEMENT_TABLE_FONT_SIZE,
      color: '000000',
      cleanMarkdown: true,
    }), projectTableParagraphOptions)));
  }

  if (optimized && paragraphNodes.length) {
    return Promise.all(paragraphNodes.map(async (node) => paragraph(await inlineRuns(node.children || [], context, {
      bold: isHeader,
      font: isHeader ? '黑体' : '宋体',
      optimized,
    }), {
      ...optimizedTableCellParagraphOptions(true),
    })));
  }

  const blocks = await markdownNodesToDocx(cell.children || [], context, { inTable: true });
  if (!blocks.length) {
    return [paragraph([textRun('', { optimized })], {
      after: optimized ? 0 : 80,
      ...optimizedTableCellParagraphOptions(optimized),
      ...projectTableParagraphOptions,
    })];
  }
  return blocks.filter((block) => block instanceof Paragraph);
}

async function markdownNodesToDocx(nodes = [], context = {}, options = {}) {
  const blocks = [];
  const optimized = Boolean(context.wordOptimizationEnabled);
  const officialDocument = Boolean(context.officialDocumentEnabled);
  const projectManagementDocument = Boolean(context.projectManagementDocumentEnabled);
  const presalesProposalDocument = Boolean(context.presalesProposalDocumentEnabled);
  const structuredDocument = projectManagementDocument || presalesProposalDocument;
  const formalDocument = officialDocument || structuredDocument;

  for (const node of nodes) {
    if (node.type === 'heading') {
      const headingDepth = headingNumberingLevel(node.depth);
      const officialHeadingFont = node.depth === 1 ? '小标宋体' : node.depth === 2 ? '黑体' : '楷体_GB2312';
      const headingRuns = structuredDocument
        ? [textRun(stripLeadingNumbering(stripInlineMarkdownMarkers(nodeText(node))) || stripInlineMarkdownMarkers(nodeText(node)), {
            font: projectManagementDocument ? '楷体_GB2312' : '黑体',
            bold: true,
            color: '000000',
            size: projectManagementDocument
              ? node.depth === 1 ? 32 : node.depth === 2 ? 30 : 28
              : node.depth === 1 ? 30 : node.depth === 2 ? 28 : 26,
            cleanMarkdown: true,
          })]
        : await inlineRuns(
            node.children,
            context,
            optimized
              ? { font: '黑体', color: '000000', optimized, normalizeNumbering: true }
              : officialDocument
                ? { font: officialHeadingFont, color: '000000', size: node.depth === 1 ? 44 : 32, normalizeNumbering: true }
                : {},
          );
      blocks.push(paragraph(headingRuns, {
        heading: headingLevel(node.depth),
        style: headingStyleId(node.depth),
        before: optimized || formalDocument ? 0 : node.depth === 1 ? 280 : 180,
        after: optimized || formalDocument ? 0 : 120,
        optimized,
        officialDocument,
        projectManagementDocument,
        presalesProposalDocument,
        keepNext: optimized || formalDocument ? true : undefined,
        numbering: optimized || structuredDocument ? { reference: WORD_OPTIMIZATION_HEADING_REFERENCE, level: headingDepth } : undefined,
        indent: optimized || formalDocument ? { left: 0, right: 0 } : undefined,
        tabStops: optimized || formalDocument ? [] : undefined,
        // 标题只有一行时不能使用两端对齐，否则中文字符会被拉开。
        // 保留正式公文一级标题居中，其余标题统一左对齐并保留编号缩进。
        alignment: officialDocument && node.depth === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
      }));
      rememberParagraphText(context, nodeText(node));
    } else if (node.type === 'paragraph') {
      const text = nodeText(node).trim();
      if (!text && !(node.children || []).some((child) => child.type === 'image')) {
        // Markdown 空行、HTML 空段落不应在 Word 中变成大段垂直留白。
        continue;
      }
      const paragraphChildren = trimMarkdownBreakNodes(node.children);
      const inlineHeading = splitInlineNumberedHeading({ ...node, children: paragraphChildren });
      if (!options.inTable && inlineHeading) {
        const { headingChildren, bodyChildren } = inlineHeading;
        const headingNode = headingChildren[0];
        const bodyNodes = bodyChildren;
        const runMarks = optimized
          ? { optimized, normalizeNumbering: true }
          : projectManagementDocument
            ? { font: '仿宋_GB2312', size: 32, color: '000000', cleanMarkdown: true, normalizeNumbering: true }
            : presalesProposalDocument
              ? { font: '宋体', size: 24, color: '000000', cleanMarkdown: true, normalizeNumbering: true }
              : officialDocument
                ? { font: '仿宋_GB2312', size: 32, color: '000000', normalizeNumbering: true }
                : { normalizeNumbering: true };
        blocks.push(paragraph(await inlineRuns([headingNode], context, { optimized, bold: true, normalizeNumbering: true }), {
          optimized,
          officialDocument,
          projectManagementDocument,
          presalesProposalDocument,
          alignment: AlignmentType.LEFT,
          indent: { left: 360, right: 0 },
          after: 80,
          keepNext: true,
        }));
        if (bodyNodes.length && nodeText({ children: bodyNodes }).trim()) {
          blocks.push(paragraph(await inlineRuns(bodyNodes, context, runMarks), {
            optimized,
            officialDocument,
            projectManagementDocument,
            presalesProposalDocument,
            after: formalDocument ? 0 : 160,
          }));
        }
        rememberParagraphText(context, text);
        continue;
      }
      if (!options.inTable && optimized && isImageOnlyParagraph(node)) {
        const imageNode = (node.children || []).find((child) => child.type === 'image');
        blocks.push(await imageParagraphFromSource(imageNode?.url, imageNode?.alt || '图片', context));
        blocks.push(createCaptionParagraph(context, 'figure', imageNode?.alt || '', '图片'));
        context.lastParagraphText = '';
      } else if (!options.inTable && optimized && (isManualFigureCaptionText(text) || isManualTableCaptionText(text))) {
        context.lastParagraphText = '';
      } else {
        blocks.push(paragraph(await inlineRuns(paragraphChildren, context, optimized
          ? { optimized, normalizeNumbering: true }
          : projectManagementDocument
            ? { font: '仿宋_GB2312', size: 32, color: '000000', cleanMarkdown: true }
          : presalesProposalDocument
            ? { font: '宋体', size: 24, color: '000000', cleanMarkdown: true }
          : officialDocument
            ? { font: '仿宋_GB2312', size: 32, color: '000000' }
            : {}), {
          after: formalDocument ? 0 : options.inTable ? 80 : 160,
          optimized,
          officialDocument,
          projectManagementDocument,
          presalesProposalDocument,
          alignment: options.inTable && (optimized || projectManagementDocument)
            ? AlignmentType.CENTER
            : isNumberedBodyParagraph(text)
              ? AlignmentType.LEFT
            : !options.inTable && (isImageOnlyParagraph(node) || isFigureCaptionParagraph(node)) ? AlignmentType.CENTER : undefined,
          indent: projectManagementDocument && options.inTable
            ? optimizedTableCellIndent()
            : formalDocument
            ? { left: 0, right: 0, firstLine: WORD_TWO_CHARS_TWIPS }
            : optimized
            ? options.inTable
              ? optimizedTableCellIndent()
              : isNumberedBodyParagraph(text)
                ? { left: 720, right: 0, hanging: 360 }
                : { left: 0, right: 0, firstLine: WORD_TWO_CHARS_TWIPS }
            : { left: 0, right: 0, firstLine: WORD_TWO_CHARS_TWIPS },
          tabStops: optimized || formalDocument ? [] : undefined,
        }));
        if (!options.inTable && text) {
          rememberParagraphText(context, text);
        }
      }
    } else if (node.type === 'list') {
      const numberingReference = node.ordered ? createOrderedListReference(context) : null;
      for (const item of node.children || []) {
        const firstParagraph = (item.children || []).find((child) => child.type === 'paragraph');
        const restChildren = (item.children || []).filter((child) => child !== firstParagraph);
        const listOptions = node.ordered
          ? { numbering: { reference: numberingReference, level: Math.min(options.listLevel || 0, 2) } }
          : { bullet: { level: Math.min(options.listLevel || 0, 2) } };
        blocks.push(paragraph(await inlineRuns(firstParagraph?.children || [], context, optimized
          ? { optimized }
          : projectManagementDocument
            ? { font: '仿宋_GB2312', size: 32, color: '000000', cleanMarkdown: true }
            : {}), {
          ...listOptions,
          optimized,
          projectManagementDocument,
          alignment: AlignmentType.LEFT,
          indent: optimized ? optimizedNumberedBodyIndent() : projectManagementDocument ? optimizedNumberedBodyIndent() : undefined,
          tabStops: optimized || projectManagementDocument ? [] : undefined,
        }));
        blocks.push(...await markdownNodesToDocx(restChildren, context, { ...options, listLevel: (options.listLevel || 0) + 1 }));
      }
    } else if (node.type === 'table') {
      const rows = [];
      const maxColumns = Math.max(1, ...(node.children || []).map((row) => row.children?.length || 0));
      for (const [rowIndex, row] of (node.children || []).entries()) {
        const cells = [];
        const rowCells = row.children || [];
        for (const [cellIndex, cell] of rowCells.entries()) {
          const columnSpan = cellIndex === rowCells.length - 1
            ? Math.max(1, maxColumns - rowCells.length + 1)
            : 1;
          cells.push(createTableCell({
            children: await tableCellParagraphs(cell, context, rowIndex === 0),
            isHeader: rowIndex === 0,
            columnSpan,
            totalColumns: maxColumns,
            optimized,
            projectManagementDocument,
          }));
        }
        rows.push(new TableRow({ children: cells, tableHeader: (optimized || projectManagementDocument) && rowIndex === 0 }));
      }
      if (rows.length) {
        if (optimized) {
          blocks.push(createCaptionParagraph(context, 'table', inferMarkdownTableCaptionName(node, context), '数据表'));
        }
        blocks.push(createDocxTable(rows, maxColumns, { optimized, projectManagementDocument }));
      }
    } else if (node.type === 'blockquote') {
      for (const child of node.children || []) {
        if (child.type === 'paragraph') {
          blocks.push(paragraph(await inlineRuns(child.children, context, { color: '536176' }), {
            indent: { left: 360 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2174FD' } },
            shading: { type: ShadingType.CLEAR, fill: 'F6F9FF' },
          }));
        } else {
          blocks.push(...await markdownNodesToDocx([child], context, options));
        }
      }
    } else if (node.type === 'code') {
      if (String(node.lang || '').toLowerCase() === 'mermaid') {
        const nextIndex = (context.convertedMermaidCount || 0) + 1;
        const total = context.stats?.mermaidCount || nextIndex;
        reportConversionProgress(context, `正在本地转换 Mermaid 图 ${nextIndex}/${total}。`);
        const mermaidCode = context.projectManagementDocumentEnabled
          ? normalizeMermaidForProjectManagementExport(node.value)
          : node.value;
        try {
          const imageDataUrl = await localImageRenderService.renderMermaidToDataUrl(mermaidCode);
          blocks.push(await imageParagraphFromSource(imageDataUrl, 'Mermaid 图', context));
        } catch (error) {
          const message = `图片无法导出：Mermaid 图，本地渲染失败：${compactText(error?.message || '未知错误', 120)}`;
          addWarning(context, message);
          blocks.push(textRun(`[${message}]`, { color: 'C83220' }));
        }
        if (optimized) {
          blocks.push(createCaptionParagraph(context, 'figure', `Mermaid 图 ${nextIndex}`, 'Mermaid 图'));
        }
        context.convertedMermaidCount = nextIndex;
        reportConversionProgress(context, `Mermaid 图 ${nextIndex}/${total} 已处理。`);
      } else if (projectManagementDocument && looksLikeMarkdownTemplate(node.value)) {
        blocks.push(...await markdownToDocxBlocks(node.value, context));
      } else {
        blocks.push(paragraph([new TextRun({ text: cleanText(node.value), font: 'Consolas', size: 21, color: '243048' })], {
          shading: { type: ShadingType.CLEAR, fill: 'F6F9FF' },
          indent: { left: 260, right: 260 },
        }));
      }
    } else if (node.type === 'html') {
      blocks.push(...await htmlToDocxBlocks(node.value, context, options));
    } else if (node.type === 'thematicBreak') {
      blocks.push(paragraph([textRun('────────────────────────', { color: 'DCDFF6' })], { alignment: AlignmentType.CENTER }));
    } else if (node.children) {
      blocks.push(...await markdownNodesToDocx(node.children, context, options));
    }
  }

  return blocks;
}

async function parseMarkdown(content) {
  const [{ unified }, remarkParse, remarkGfm] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
  ]);
  return unified().use(remarkParse.default).use(remarkGfm.default).parse(normalizeMarkdownTablesForDocx(content));
}

async function markdownToDocxBlocks(content, context = {}) {
  const tree = await parseMarkdown(content);
  return markdownNodesToDocx(tree.children || [], context);
}

async function addMarkdownContent(children, content, context) {
  children.push(...await markdownToDocxBlocks(content, context));
}

async function addOutlineItems(children, items, context, level = 1) {
  const optimized = Boolean(context.wordOptimizationEnabled);
  const officialDocument = Boolean(context.officialDocumentEnabled);
  const projectManagementDocument = Boolean(context.projectManagementDocumentEnabled);
  const presalesProposalDocument = Boolean(context.presalesProposalDocumentEnabled);
  const structuredDocument = projectManagementDocument || presalesProposalDocument;
  const formalDocument = officialDocument || structuredDocument;
  for (const item of items || []) {
    const rawTitle = item.title || '未命名章节';
    const title = optimized || structuredDocument
      ? stripLeadingNumbering(rawTitle) || rawTitle
      : `${item.id || ''} ${rawTitle}`.trim();
    const shouldRenderTitle = !(officialDocument && item.hideTitle);
    if (shouldRenderTitle) {
      children.push(paragraph([textRun(title, {
        bold: true,
        font: projectManagementDocument ? '楷体_GB2312' : optimized || officialDocument || presalesProposalDocument ? '黑体' : undefined,
        color: optimized || formalDocument ? '000000' : undefined,
        size: projectManagementDocument ? (level === 1 ? 32 : 30) : presalesProposalDocument ? (level === 1 ? 30 : 28) : officialDocument ? 32 : undefined,
        cleanMarkdown: structuredDocument,
      })], {
        heading: headingLevel(level),
        style: headingStyleId(level),
        before: optimized || formalDocument ? 0 : level === 1 ? 320 : 200,
        after: optimized || formalDocument ? 0 : 120,
        optimized,
        officialDocument,
        projectManagementDocument,
        presalesProposalDocument,
        keepNext: optimized || formalDocument ? true : undefined,
        numbering: optimized || structuredDocument ? { reference: WORD_OPTIMIZATION_HEADING_REFERENCE, level: headingNumberingLevel(level) } : undefined,
        indent: optimized || formalDocument ? { left: 0, right: 0 } : undefined,
        tabStops: optimized || formalDocument ? [] : undefined,
      }));
      rememberParagraphText(context, title);
    }

    if (!item.children?.length) {
      if (String(item.content || '').trim()) {
        await addMarkdownContent(children, item.content, context);
      }
      context.convertedLeafCount = (context.convertedLeafCount || 0) + 1;
      reportConversionProgress(context, `已处理 ${context.convertedLeafCount}/${context.stats?.leafCount || context.convertedLeafCount} 个正文小节。`);
      continue;
    }

    await addOutlineItems(children, item.children, context, level + 1);
  }
}

function createNumberingConfig(context) {
  const references = context.numberingReferences || [];
  const optimized = Boolean(context.wordOptimizationEnabled);
  const projectManagementDocument = Boolean(context.projectManagementDocumentEnabled);
  const presalesProposalDocument = Boolean(context.presalesProposalDocumentEnabled);
  const headingNumberingEnabled = optimized || projectManagementDocument || presalesProposalDocument;
  if (!references.length && !headingNumberingEnabled) {
    return undefined;
  }

  return {
    config: [
      ...(headingNumberingEnabled ? [{
        reference: WORD_OPTIMIZATION_HEADING_REFERENCE,
        levels: Array.from({ length: 9 }, (_item, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: Array.from({ length: level + 1 }, (_part, index) => `%${index + 1}`).join('.'),
          alignment: AlignmentType.START,
          suffix: LevelSuffix.SPACE,
          style: {
            paragraph: {
              indent: { left: 360 + level * 180, hanging: 0 },
              spacing: { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY },
            },
            run: { font: projectManagementDocument ? '楷体_GB2312' : '黑体', size: projectManagementDocument ? 28 : 24, bold: true, color: '000000' },
          },
        })),
      }] : []),
      ...references.map((reference) => ({
        reference,
        levels: [0, 1, 2].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: optimized || projectManagementDocument ? optimizedNumberedBodyIndent() : { left: 720 + level * 420, hanging: 260 },
            },
          },
        })),
      })),
    ],
  };
}

async function buildDocxResult(payload, options = {}) {
  const stats = countOutlineStats(payload.outline || []);
  const officialDocumentEnabled = payload.document_profile === 'official-document' || payload.documentProfile === 'official-document';
  const projectManagementDocumentEnabled = payload.document_profile === 'project-management' || payload.documentProfile === 'project-management';
  const presalesProposalDocumentEnabled = payload.document_profile === 'presales-proposal' || payload.documentProfile === 'presales-proposal';
  const structuredDocumentEnabled = projectManagementDocumentEnabled || presalesProposalDocumentEnabled;
  const formalDocumentEnabled = officialDocumentEnabled || structuredDocumentEnabled;
  const wordOptimizationEnabled = !formalDocumentEnabled && isWordOptimizationEnabled(options.config);
  const context = {
    baseDir: payload.base_dir || payload.baseDir,
    onProgress: options.onProgress,
    warnings: options.warnings || [],
    stats,
    officialDocumentEnabled,
    projectManagementDocumentEnabled,
    presalesProposalDocumentEnabled,
    wordOptimizationEnabled,
    convertedLeafCount: 0,
    convertedMermaidCount: 0,
    numberingReferences: [],
    numberingIndex: 0,
    unsupportedHtmlTags: new Set(),
    figureCaptionIndex: 0,
    tableCaptionIndex: 0,
    lastParagraphText: '',
    recentParagraphTexts: [],
  };
  const coverChildren = projectManagementDocumentEnabled
    ? createProjectManagementCover(payload)
    : presalesProposalDocumentEnabled
    ? createPresalesProposalCover(payload)
    : [];
  const tocChildren = structuredDocumentEnabled ? createProjectManagementTocPage() : [];
  const children = structuredDocumentEnabled
    ? []
    : officialDocumentEnabled
    ? []
    : wordOptimizationEnabled
    ? [
        paragraph([textRun(payload.project_name || '投标技术文件', { bold: true, size: 34, font: '黑体', color: '000000' })], {
          alignment: AlignmentType.CENTER,
          after: 300,
          indent: { left: 0, right: 0 },
          tabStops: [],
        }),
      ]
    : [
        paragraph([textRun('内容由 AI 生成', { italics: true, size: 18 })], { alignment: AlignmentType.CENTER, after: 120 }),
        paragraph([textRun(payload.project_name || '投标技术文件', { bold: true, size: 34 })], { alignment: AlignmentType.CENTER, after: 300 }),
      ];

  reportProgress(context, 10, stats.mermaidCount
    ? `准备导出正文，并转换 ${stats.mermaidCount} 张 Mermaid 图。`
    : '准备导出正文。');
  await addOutlineItems(children, payload.outline || [], context);
  reportProgress(context, 90, '正在生成 Word 文件。');

  const numbering = createNumberingConfig(context);
  const defaultParagraphStyle = officialDocumentEnabled || projectManagementDocumentEnabled
    ? {
        spacing: { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY },
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: WORD_TWO_CHARS_TWIPS },
      }
    : presalesProposalDocumentEnabled
    ? {
        spacing: { before: 0, after: 0, line: 360, lineRule: LineRuleType.AUTO },
        alignment: AlignmentType.JUSTIFIED,
        indent: optimizedBodyIndent(),
      }
    : wordOptimizationEnabled
    ? {
        spacing: { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY },
        alignment: AlignmentType.JUSTIFIED,
        indent: optimizedBodyIndent(),
      }
    : { spacing: { line: 360, after: 160 } };
  const optimizedHeadingStyle = wordOptimizationEnabled || structuredDocumentEnabled
    ? {
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: projectManagementDocumentEnabled ? '楷体_GB2312' : '黑体',
          size: projectManagementDocumentEnabled ? 30 : presalesProposalDocumentEnabled ? 28 : 24,
          bold: true,
          color: '000000',
        },
        paragraph: {
          spacing: presalesProposalDocumentEnabled
            ? { before: 0, after: 0, line: 360, lineRule: LineRuleType.AUTO }
            : { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY },
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: 0, right: 0 },
          tabStops: [],
        },
      }
    : undefined;
  const sections = structuredDocumentEnabled
    ? [
        {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              margin: projectManagementPageMargin(),
            },
          },
          children: coverChildren,
        },
        {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              margin: projectManagementPageMargin(),
              pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
            },
          },
          footers: {
            default: centeredPageNumberFooter(),
          },
          children: tocChildren,
        },
        {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              margin: projectManagementPageMargin(),
              pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
            },
          },
          footers: {
            default: centeredPageNumberFooter(),
          },
          children,
        },
      ]
    : [{
        properties: {
          page: {
            margin: officialDocumentEnabled
              ? { top: 2098, right: 1475, bottom: 1890, left: 1587 }
              : { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: wordOptimizationEnabled ? {
          default: centeredPageNumberFooter(),
        } : undefined,
        children,
      }];

  const doc = new Document({
    ...(numbering ? { numbering } : {}),
    ...(wordOptimizationEnabled || structuredDocumentEnabled ? { features: { updateFields: true } } : {}),
    ...(wordOptimizationEnabled || structuredDocumentEnabled ? { defaultTabStop: 0 } : {}),
    styles: {
      default: {
        document: {
          run: projectManagementDocumentEnabled
            ? { font: '仿宋_GB2312', size: 32, color: '000000' }
            : presalesProposalDocumentEnabled
            ? { font: '宋体', size: 24, color: '000000' }
            : officialDocumentEnabled
            ? { font: '仿宋_GB2312', size: 32, color: '000000' }
            : { font: '宋体', size: 24, color: wordOptimizationEnabled ? '000000' : undefined },
          paragraph: defaultParagraphStyle,
        },
      },
      paragraphStyles: [
        ...(wordOptimizationEnabled || structuredDocumentEnabled ? [
          ...Array.from({ length: 9 }, (_item, index) => index + 1).map((level) => ({
            id: `Heading${level}`,
            name: `Heading ${level}`,
            ...optimizedHeadingStyle,
            run: projectManagementDocumentEnabled
              ? { font: '楷体_GB2312', size: level === 1 ? 32 : level === 2 ? 30 : 28, bold: true, color: '000000' }
              : presalesProposalDocumentEnabled
              ? { font: '黑体', size: level === 1 ? 30 : level === 2 ? 28 : 26, bold: true, color: '000000' }
              : optimizedHeadingStyle.run,
          })),
        ] : [
          ...[7, 8, 9].map((level) => ({
            id: `Heading${level}`,
            name: `Heading ${level}`,
            basedOn: 'Heading6',
            next: 'Normal',
            quickFormat: true,
          })),
        ]),
        ...(projectManagementDocumentEnabled ? createProjectManagementTocStyles() : []),
        ...(presalesProposalDocumentEnabled ? createPresalesProposalTocStyles() : []),
      ],
    },
    sections,
  });

  return { buffer: await Packer.toBuffer(doc), warnings: context.warnings, stats };
}

async function buildDocxBuffer(payload, options = {}) {
  const result = await buildDocxResult(payload, options);
  return result.buffer;
}

async function exportOriginalTemplateWord(payload = {}, onProgress) {
  if (!Array.isArray(payload.outline) || !payload.outline.length) {
    throw new Error('没有可导出的目录内容');
  }

  const templatePath = resolveTemplatePath(payload.originalTemplatePath || payload.templatePath);
  if (!templatePath || !fs.existsSync(templatePath)) {
    throw new Error('未找到原方案 DOCX 模板，请重新导入原方案后再试');
  }
  if (path.extname(templatePath).toLowerCase() !== '.docx') {
    throw new Error('原格式导出当前仅支持 DOCX 原方案，请使用 DOCX 原方案重新导入，或改用优化格式导出');
  }

  const progressContext = { onProgress, warnings: [], stats: countOutlineStats(payload.outline || []) };
  reportProgress(progressContext, 5, '正在读取原方案 DOCX 模板。');

  const defaultFilename = `${sanitizeFilename(payload.project_name || '已有方案扩写')}-原格式.docx`;
  const defaultDir = app?.getPath ? app.getPath('documents') : process.env.USERPROFILE || process.cwd();
  const result = await dialog.showSaveDialog({
    title: '原格式导出 Word 文档',
    defaultPath: path.join(defaultDir, defaultFilename),
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });

  if (result.canceled || !result.filePath) {
    reportProgress(progressContext, 0, '已取消导出。', { phase: 'canceled' });
    return { success: false, canceled: true, message: '已取消导出' };
  }

  const zip = new AdmZip(templatePath);
  const documentEntry = zip.getEntry('word/document.xml');
  if (!documentEntry) {
    throw new Error('原方案 DOCX 结构异常，未找到 word/document.xml');
  }

  reportProgress(progressContext, 45, '正在将扩写正文写入原方案结构。');
  const documentXml = documentEntry.getData().toString('utf-8');
  const injection = injectOriginalTemplateContent(documentXml, payload.outline || []);
  if (!injection.matchedCount && injection.unmatchedCount) {
    addWarning(progressContext, '未匹配到原方案章节标题，扩写内容已追加到文档末尾。');
  } else if (injection.unmatchedCount) {
    addWarning(progressContext, `${injection.unmatchedCount} 个章节未匹配到原方案标题，已追加到文档末尾。`);
  }

  zip.updateFile('word/document.xml', Buffer.from(injection.xml, 'utf-8'));
  reportProgress(progressContext, 88, '正在写入原格式 Word 文件。');
  zip.writeZip(result.filePath);

  const message = injection.matchedCount
    ? `Word 已按原方案格式导出，已匹配 ${injection.matchedCount} 个原方案章节，请打开文档核对扩写内容位置和分页。`
    : 'Word 已按原方案格式导出，请打开文档核对扩写内容位置和分页。';
  reportProgress(progressContext, 100, message, { phase: 'success' });
  return { success: true, path: result.filePath, filePath: result.filePath, message, warnings: progressContext.warnings };
}

function createExportService({ configStore } = {}) {
  return {
    showExportFile(filePath) {
      const target = String(filePath || '').trim();
      if (!target || !path.isAbsolute(target) || !fs.existsSync(target)) {
        throw new Error('导出的 Word 文件不存在或路径无效');
      }
      shell.showItemInFolder(target);
      return { success: true, path: target };
    },
    async exportWord(payload = {}, onProgress) {
      if (payload.exportMode === 'original-template') {
        return exportOriginalTemplateWord(payload, onProgress);
      }

      if (!Array.isArray(payload.outline) || !payload.outline.length) {
        throw new Error('没有可导出的目录内容');
      }

      const stats = countOutlineStats(payload.outline || []);
      const progressContext = { onProgress, warnings: [], stats };
      reportProgress(progressContext, 2, stats.mermaidCount
        ? `检测到 ${stats.mermaidCount} 张 Mermaid 图，导出时会转换为 Word 图片。`
        : '正在准备 Word 导出。');
      const defaultFilename = `${sanitizeFilename(payload.project_name || '标书文档')}-技术方案.docx`;
      const defaultDir = app?.getPath ? app.getPath('documents') : process.env.USERPROFILE || process.cwd();
      const result = await dialog.showSaveDialog({
        title: '导出 Word 文档',
        defaultPath: path.join(defaultDir, defaultFilename),
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });

      if (result.canceled || !result.filePath) {
        reportProgress(progressContext, 0, '已取消导出。', { phase: 'canceled' });
        return { success: false, canceled: true, message: '已取消导出' };
      }

      const warnings = [];
      const config = configStore ? configStore.load() : null;
      const buildResult = await buildDocxResult(payload, { onProgress, warnings, config });
      reportProgress({ onProgress, warnings: buildResult.warnings, stats: buildResult.stats }, 96, '正在写入 Word 文件。');
      fs.writeFileSync(result.filePath, buildResult.buffer);
      const imageWarningCount = buildResult.warnings.filter((warning) => String(warning).startsWith('图片无法导出：')).length;
      const message = buildResult.warnings.length
        ? imageWarningCount
          ? `Word 已导出，但有 ${imageWarningCount} 处图片未能插入，另有 ${buildResult.warnings.length - imageWarningCount} 条导出提示，请打开文档核对。`
          : `Word 已导出，但有 ${buildResult.warnings.length} 条导出提示，请打开文档核对。`
        : 'Word 已导出，请打开文档核对图片、表格和版式。';
      reportProgress({ onProgress, warnings: buildResult.warnings, stats: buildResult.stats }, 100, message, { phase: 'success' });
      return { success: true, path: result.filePath, filePath: result.filePath, message, warnings: buildResult.warnings };
    },
  };
}

module.exports = {
  buildDocxBuffer,
  buildDocxResult,
  createExportService,
  inlineSvgClassStyles,
  svgBufferToPngBuffer,
};
