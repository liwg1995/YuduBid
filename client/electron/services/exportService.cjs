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
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  PageBreak,
  Packer,
  Paragraph,
  PageNumber,
  PageOrientation,
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
const { SIZE_TO_PT, normalizeBidExportTemplate } = require('./bidTemplateFormat.cjs');

const MAX_IMAGE_WIDTH = 520;
const PAPER_DIMENSIONS_MM = { a4: { width: 210, height: 297 }, a3: { width: 297, height: 420 }, a5: { width: 148, height: 210 }, b4: { width: 250, height: 353 }, b5: { width: 176, height: 250 }, letter: { width: 215.9, height: 279.4 }, legal: { width: 215.9, height: 355.6 }, '16k': { width: 184, height: 260 } };
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
const DEFAULT_IMAGE_MAX_HEIGHT = 620;
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
  return normalizeMermaidForExport(horizontalizeMermaidForProjectManagement(code));
}

function normalizeFlowchartForExport(source) {
  let invalidLoopDepth = 0;
  const normalizedLines = [];

  for (const rawLine of String(source || '').split('\n')) {
    const trimmedLine = rawLine.trim();
    if (/^loop(?:\s|$)/i.test(trimmedLine)) {
      invalidLoopDepth += 1;
      continue;
    }
    if (invalidLoopDepth > 0 && /^end\s*$/i.test(trimmedLine)) {
      invalidLoopDepth -= 1;
      continue;
    }

    const multiSourceEdge = rawLine.match(/^(\s*)((?:[A-Za-z][\w-]*\s*&\s*)+[A-Za-z][\w-]*)\s*(-->|---|-.->|==>)\s*(.+?)\s*$/);
    if (multiSourceEdge) {
      const [, indent, sources, arrow, target] = multiSourceEdge;
      normalizedLines.push(...sources.split(/\s*&\s*/).map((nodeId) => `${indent}${nodeId} ${arrow} ${target}`));
      continue;
    }

    normalizedLines.push(rawLine);
  }

  return normalizedLines.join('\n')
    .replace(/\s*;\s*/g, '\n')
    .replace(/[ \t]+(?=[A-Za-z][\w-]*(?:\[[^\n]*?\]|\([^\n]*?\)|\{[^\n]*?\})?\s*(?:-->|---|-.->|==>))/g, '\n');
}

function normalizeMermaidForExport(code) {
  let source = normalizeXyChartMermaidForExport(code)
    .replace(/^\s*```(?:mermaid)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/\r\n?/g, '\n')
    .trim();

  if (/^\s*sequenceDiagram\b/i.test(source)) {
    source = source
      .replace(/[ \t]+(?=(?:loop|alt|opt|par|critical|break|rect)\b)/gi, '\n')
      .replace(/[ \t]+(?=(?:else|and)\b)/gi, '\n')
      .replace(/[ \t]+end(?=\s|$)/gi, '\nend\n')
      .replace(/[ \t]+(?=[A-Za-z][\w-]*\s*(?:--?>>?|->>?)\s*[A-Za-z][\w-]*\s*:)/g, '\n');
  } else if (/^\s*(?:flowchart|graph)\b/i.test(source)) {
    source = normalizeFlowchartForExport(source);
  }

  return source.replace(/\n{3,}/g, '\n\n').trim();
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

function colorWithoutHash(value, fallback = '000000') {
  return String(value || fallback).replace(/^#/, '').toUpperCase();
}

function pointsToHalfPoints(value, fallback = 12) {
  const points = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(13, Math.round(points * 2));
}

function pointsToTwips(value, fallback = 0) {
  const points = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.round(points * 20));
}

function centimetersToTwips(value, fallback = 2.54) {
  const centimeters = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(284, Math.round(centimeters * 567));
}

function lineSpacingToTwips(value, fallback = 1.5) {
  const multiple = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(240, Math.round(multiple * 240));
}

function measurementToPoints(value, unit = 'pt', fontSizePoints = 12) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (unit === 'in') return amount * 72;
  if (unit === 'cm') return amount * 28.3465;
  if (unit === 'mm') return amount * 2.83465;
  if (unit === 'line') return amount * fontSizePoints;
  if (unit === 'auto') return 0;
  return amount;
}

function paragraphSpacingToTwips(value, unit, fontSizePoints = 12) {
  return pointsToTwips(measurementToPoints(value, unit, fontSizePoints));
}

function customLineSpacing(value, mode = 'multiple', unit = 'multiple') {
  if (mode === 'single') return { line: 240, lineRule: LineRuleType.AUTO };
  if (mode === 'one-and-half') return { line: 360, lineRule: LineRuleType.AUTO };
  if (mode === 'double') return { line: 480, lineRule: LineRuleType.AUTO };
  if (mode === 'at-least') return { line: pointsToTwips(measurementToPoints(value, unit)), lineRule: LineRuleType.AT_LEAST };
  if (mode === 'exact') return { line: pointsToTwips(measurementToPoints(value, unit)), lineRule: LineRuleType.EXACTLY };
  return { line: lineSpacingToTwips(value, 1), lineRule: LineRuleType.AUTO };
}

function docxAlignment(value, fallback = AlignmentType.JUSTIFIED) {
  return {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    '左对齐': AlignmentType.LEFT,
    '居中对齐': AlignmentType.CENTER,
    '右对齐': AlignmentType.RIGHT,
    '两端对齐': AlignmentType.JUSTIFIED,
  }[value] || fallback;
}

function chineseSizeToPoints(value, fallback = 12) {
  return SIZE_TO_PT[value] || fallback;
}

function customBodyRunOptions(context, overrides = {}) {
  const body = context?.exportFormat?.body_text;
  if (!context?.customTemplateEnabled || !body) return overrides;
  return {
    font: body.font,
    size: pointsToHalfPoints(chineseSizeToPoints(body.size)),
    color: '000000',
    optimized: true,
    ...overrides,
  };
}

function customBodyParagraphOptions(context, overrides = {}) {
  const body = context?.exportFormat?.body_text;
  if (!context?.customTemplateEnabled || !body) return overrides;
  return {
    optimized: true,
    alignment: docxAlignment(body.alignment),
    spacing: {
      before: paragraphSpacingToTwips(body.spacing_before_pt, body.spacing_before_unit, chineseSizeToPoints(body.size)),
      after: paragraphSpacingToTwips(body.spacing_after_pt, body.spacing_after_unit, chineseSizeToPoints(body.size)),
      ...customLineSpacing(body.line_spacing_multiple, body.line_spacing_mode, body.line_spacing_unit),
    },
    indent: { left: Math.round(body.list_indent_chars * 240), right: 0, firstLine: Math.round(body.first_line_indent_chars * 240) },
    ...overrides,
  };
}

function customHeadingStyle(context, level) {
  if (!context?.customTemplateEnabled) return null;
  const headings = context.exportFormat?.headings || [];
  return headings[Math.max(0, Math.min(headings.length - 1, Number(level || 1) - 1))] || null;
}

function customHeadingDecoration(context, level) {
  const frame = context?.customTemplateEnabled ? context.exportFormat?.heading_border : null;
  if (!frame?.enabled) return {};
  const border = { style: BorderStyle.SINGLE, size: 6, color: colorWithoutHash(frame.border_color, 'CFD8EE') };
  return {
    border: { top: border, bottom: border, left: border, right: border },
    shading: { type: ShadingType.CLEAR, fill: colorWithoutHash(frame.level_cell_colors?.[Math.min(8, Math.max(0, level - 1))], 'FFFFFF') },
  };
}

function headingNumberingFormat(headingStyle) {
  if (headingStyle?.numbering_format !== 'custom') return LevelFormat.DECIMAL;
  const template = String(headingStyle.numbering_template || '');
  if (template.includes('{zh}')) return LevelFormat.CHINESE_COUNTING;
  if (template.includes('{circled}')) return LevelFormat.DECIMAL_ENCLOSED_CIRCLE;
  if (template.includes('{ALPHA}')) return LevelFormat.UPPER_LETTER;
  if (template.includes('{alpha}')) return LevelFormat.LOWER_LETTER;
  if (template.includes('{ROMAN}')) return LevelFormat.UPPER_ROMAN;
  if (template.includes('{roman}')) return LevelFormat.LOWER_ROMAN;
  return LevelFormat.DECIMAL;
}

function headingNumberingText(headingStyle, level) {
  const currentLevel = Math.max(1, Math.min(9, Number(level || 1)));
  const full = Array.from({ length: currentLevel }, (_item, index) => `%${index + 1}`).join('.');
  if (headingStyle?.numbering_format !== 'custom') return full;

  const template = String(headingStyle.numbering_template || '');
  if (!template) return '';
  const current = `%${currentLevel}`;
  const tailStart = currentLevel >= 3 ? 3 : currentLevel;
  const tail = Array.from({ length: currentLevel - tailStart + 1 }, (_item, index) => `%${tailStart + index}`).join('.');
  return template
    .replace(/\{tail(\d+)\}/g, (_match, startLevelText) => {
      const startLevel = Number(startLevelText);
      if (!Number.isFinite(startLevel) || startLevel < 1 || startLevel > currentLevel) return '';
      return Array.from({ length: currentLevel - startLevel + 1 }, (_item, index) => `%${startLevel + index}`).join('.');
    })
    .replace(/\{(?:zh|num|circled|alpha|ALPHA|roman|ROMAN)\}/g, current)
    .replace(/\{tail\}/g, tail)
    .replace(/\{full\}/g, full);
}

function staticHeadingNumberParts(value) {
  return String(value || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function staticHeadingNumberToChinese(value) {
  const number = Math.max(1, Math.min(9999, Math.floor(value)));
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千'];
  const source = String(number);
  let result = '';
  let pendingZero = false;
  for (let index = 0; index < source.length; index += 1) {
    const digit = Number(source[index]);
    const unitIndex = source.length - index - 1;
    if (digit === 0) {
      pendingZero = result.length > 0;
      continue;
    }
    if (pendingZero) result += '零';
    if (!(digit === 1 && unitIndex === 1 && result === '')) result += digits[digit];
    result += units[unitIndex];
    pendingZero = false;
  }
  return result;
}

function staticHeadingNumberToCircled(value) {
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  return circled[value - 1] || String(value);
}

function staticHeadingNumberToAlpha(value, upper = false) {
  let number = Math.max(1, Math.floor(value));
  let result = '';
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(97 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return upper ? result.toUpperCase() : result;
}

function staticHeadingNumberToRoman(value, upper = false) {
  let number = Math.max(1, Math.min(3999, Math.floor(value)));
  const pairs = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let result = '';
  for (const [amount, symbol] of pairs) {
    while (number >= amount) {
      result += symbol;
      number -= amount;
    }
  }
  return upper ? result.toUpperCase() : result;
}

function staticHeadingNumber(outlineId, headingStyle) {
  const parts = staticHeadingNumberParts(outlineId);
  if (!parts.length) return '';
  if (headingStyle?.numbering_format !== 'custom') return parts.join('.');
  const current = parts[parts.length - 1];
  const tail = (parts.length >= 3 ? parts.slice(2) : [current]).join('.');
  return String(headingStyle.numbering_template || '')
    .replace(/\{tail(\d+)\}/g, (_match, startLevelText) => {
      const startLevel = Number(startLevelText);
      if (!Number.isFinite(startLevel) || startLevel < 1 || startLevel > 9 || startLevel > parts.length) return '';
      return parts.slice(startLevel - 1).join('.');
    })
    .replace(/\{zh\}/g, staticHeadingNumberToChinese(current))
    .replace(/\{num\}/g, String(current))
    .replace(/\{tail\}/g, tail)
    .replace(/\{full\}/g, parts.join('.'))
    .replace(/\{circled\}/g, staticHeadingNumberToCircled(current))
    .replace(/\{alpha\}/g, staticHeadingNumberToAlpha(current))
    .replace(/\{ALPHA\}/g, staticHeadingNumberToAlpha(current, true))
    .replace(/\{roman\}/g, staticHeadingNumberToRoman(current))
    .replace(/\{ROMAN\}/g, staticHeadingNumberToRoman(current, true))
    .trim();
}

function staticHeadingTitle(outlineId, title, headingStyle) {
  const prefix = staticHeadingNumber(outlineId, headingStyle);
  if (!prefix) return String(title || '');
  const separator = /[、，。；：）)】\]》〉]$/.test(prefix) ? '' : ' ';
  return `${prefix}${separator}${title || ''}`;
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
    pageBreakBefore: options.pageBreakBefore,
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

function customTemplateHeader(page) {
  if (!page?.header_enabled) return undefined;
  return new Header({
    children: [paragraph([textRun(page.header_text || '', { font: page.header_font, size: pointsToHalfPoints(chineseSizeToPoints(page.header_size, 9)), color: colorWithoutHash(page.header_color, '536176') })], {
      alignment: docxAlignment(page.header_alignment, AlignmentType.CENTER),
      indent: { left: 0, right: 0, firstLine: 0 },
      before: 0,
      after: 0,
    })],
  });
}

function customTemplateFooter(page) {
  if (!page?.footer_enabled && !page?.page_number_enabled) return undefined;
  const children = [];
  if (page.footer_enabled && page.footer_text) children.push(textRun(page.footer_text, { font: page.footer_font, size: pointsToHalfPoints(chineseSizeToPoints(page.footer_size, 9)), color: colorWithoutHash(page.footer_color, '536176') }));
  if (page.footer_enabled && page.footer_text && page.page_number_enabled) children.push(textRun('  ·  ', { size: 18, color: '666666' }));
  if (page.page_number_enabled) {
    const format = page.page_number_format || '{page}';
    const [prefix, suffix] = format.split('{page}');
    if (prefix) children.push(textRun(prefix, { font: page.footer_font, size: pointsToHalfPoints(chineseSizeToPoints(page.footer_size, 9)) }));
    children.push(new TextRun({ children: [PageNumber.CURRENT], font: page.footer_font || 'Times New Roman', size: pointsToHalfPoints(chineseSizeToPoints(page.footer_size, 9)), color: colorWithoutHash(page.footer_color, '000000') }));
    if (suffix) children.push(textRun(suffix, { font: page.footer_font, size: pointsToHalfPoints(chineseSizeToPoints(page.footer_size, 9)) }));
  }
  return new Footer({
    children: [paragraph(children, {
      alignment: docxAlignment(page.footer_alignment, AlignmentType.CENTER),
      indent: { left: 0, right: 0, firstLine: 0 },
      before: 0,
      after: 0,
    })],
  });
}

function resolveCustomCoverText(value, payload) {
  return String(value || '')
    .replaceAll('{project_name}', String(payload.project_name || payload.projectName || '投标项目'))
    .replaceAll('{date}', new Date().toLocaleDateString('zh-CN'));
}

async function createCustomBidCover(payload, context) {
  const cover = context.exportFormat.cover;
  const alignment = docxAlignment(cover.alignment, AlignmentType.CENTER);
  const color = colorWithoutHash(cover.text_color, '000000');
  const children = [];

  if (cover.logo_path) {
    try {
      const loadedSource = await loadImage(cover.logo_path, context);
      const loaded = await normalizeImageForDocx(loadedSource);
      if (loaded?.buffer && loaded.type) {
        const dimensions = getSafeImageDimensions(loaded.buffer);
        const width = Math.max(38, Math.round(cover.logo_width_cm * 37.795));
        const height = Math.max(20, Math.round(width * (dimensions.height || width) / (dimensions.width || width)));
        children.push(paragraph([new ImageRun({ type: loaded.type, data: loaded.buffer, transformation: { width, height } })], {
          alignment,
          after: 720,
          indent: { left: 0, right: 0 },
        }));
      }
    } catch (error) {
      addWarning(context, `封面 Logo 未能导出：${error.message || '图片读取失败'}`);
    }
  }

  children.push(
    paragraph([textRun(resolveCustomCoverText(cover.project_name, payload), { font: cover.font, size: pointsToHalfPoints(chineseSizeToPoints(cover.project_name_size, 22)), color, bold: cover.bold })], { alignment, before: cover.logo_path ? 0 : 1600, after: 420, indent: { left: 0, right: 0 } }),
    paragraph([textRun(resolveCustomCoverText(cover.document_title, payload), { font: cover.font, size: pointsToHalfPoints(chineseSizeToPoints(cover.document_title_size, 42)), color, bold: true })], { alignment, after: 1800, indent: { left: 0, right: 0 } }),
  );

  for (const value of [cover.tenderer, cover.bidder, cover.compilation_date]) {
    const resolved = resolveCustomCoverText(value, payload);
    if (resolved) children.push(paragraph([textRun(resolved, { font: cover.font, size: pointsToHalfPoints(chineseSizeToPoints(cover.info_size, 14)), color, bold: cover.bold })], { alignment, after: 180, indent: { left: 0, right: 0 } }));
  }
  return children;
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

function tableBorders(optimized = false, projectManagementDocument = false, templateStyle = null) {
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
    const templateBorder = templateStyle ? {
      style: BorderStyle.SINGLE,
      size: Math.max(1, Math.round(templateStyle.border_width * 8)),
      color: colorWithoutHash(templateStyle.border_color),
    } : null;
    return {
      top: templateBorder || { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      bottom: templateBorder || { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      left: templateBorder || { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      right: templateBorder || { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      insideHorizontal: templateBorder || { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      insideVertical: templateBorder || { style: BorderStyle.SINGLE, size: 4, color: '000000' },
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

function createTableCell({ children, isHeader = false, columnSpan = 1, totalColumns = 1, optimized = false, projectManagementDocument = false, templateStyle = null, templateCellStyle = null }) {
  const safeSpan = Math.max(1, columnSpan || 1);
  return new TableCell({
    children,
    shading: templateCellStyle
      ? { type: ShadingType.CLEAR, fill: colorWithoutHash(templateCellStyle.background_color, 'FFFFFF') }
      : isHeader && !optimized && !projectManagementDocument ? { type: ShadingType.CLEAR, fill: 'F1F6FF' } : undefined,
    margins: projectManagementDocument
      ? { top: 80, bottom: 80, left: 100, right: 100 }
      : templateStyle
        ? { top: pointsToTwips(templateStyle.cell_padding_pt), bottom: pointsToTwips(templateStyle.cell_padding_pt), left: pointsToTwips(templateStyle.cell_padding_pt), right: pointsToTwips(templateStyle.cell_padding_pt) }
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
    width: options.templateStyle?.full_width === false ? { size: 0, type: WidthType.AUTO } : { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: options.templateStyle?.full_width === false ? undefined : tableColumnWidths(columnCount),
    layout: options.templateStyle?.full_width === false ? TableLayoutType.AUTOFIT : optimized || projectManagementDocument ? TableLayoutType.AUTOFIT : TableLayoutType.FIXED,
    alignment: projectManagementDocument ? AlignmentType.CENTER : undefined,
    borders: tableBorders(optimized, projectManagementDocument, options.templateStyle),
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

function createListReference(context, ordered) {
  if (!context.numberingReferences) {
    context.numberingReferences = [];
  }
  context.numberingIndex = (context.numberingIndex || 0) + 1;
  const reference = `${NUMBERING_REFERENCE_PREFIX}-${context.numberingIndex}`;
  context.numberingReferences.push({
    reference,
    ordered,
    style: ordered
      ? context.customTemplateEnabled ? context.exportFormat.body_text.ordered_list_style : 'decimal-dot'
      : context.customTemplateEnabled ? context.exportFormat.body_text.list_style : 'disc',
  });
  return reference;
}

function createOrderedListReference(context) {
  return createListReference(context, true);
}

function createUnorderedListReference(context) {
  return createListReference(context, false);
}

function customListIndent(context) {
  const indentChars = Number(context?.exportFormat?.body_text?.list_indent_chars);
  const left = Math.max(240, Math.round((Number.isFinite(indentChars) ? indentChars : 2) * 240));
  return { left, hanging: 240, right: 0 };
}

function orderedListNumbering(style, level) {
  const placeholder = `%${level + 1}`;
  const definitions = {
    'decimal-dot': { format: LevelFormat.DECIMAL, text: `${placeholder}.` },
    'decimal-paren': { format: LevelFormat.DECIMAL, text: `${placeholder})` },
    'decimal-full-paren': { format: LevelFormat.DECIMAL, text: `（${placeholder}）` },
    'chinese-dot': { format: LevelFormat.CHINESE_COUNTING, text: `${placeholder}、` },
    'chinese-paren': { format: LevelFormat.CHINESE_COUNTING, text: `（${placeholder}）` },
    'lower-alpha': { format: LevelFormat.LOWER_LETTER, text: `${placeholder}.` },
    'upper-alpha': { format: LevelFormat.UPPER_LETTER, text: `${placeholder}.` },
    'lower-roman': { format: LevelFormat.LOWER_ROMAN, text: `${placeholder}.` },
    'upper-roman': { format: LevelFormat.UPPER_ROMAN, text: `${placeholder}.` },
  };
  return definitions[style] || definitions['decimal-dot'];
}

function unorderedListNumbering(style, level) {
  const symbols = {
    disc: '•',
    circle: '○',
    square: '■',
    diamond: '◆',
    dash: '—',
    check: '✓',
    arrow: '➢',
    sparkle: '✧',
  };
  return { format: LevelFormat.BULLET, text: symbols[style] || symbols.disc, level };
}

function headingLevel(level) {
  if (level <= 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  if (level === 4) return HeadingLevel.HEADING_4;
  if (level === 5) return HeadingLevel.HEADING_5;
  if (level === 6) return HeadingLevel.HEADING_6;
  return undefined;
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

function captionStyle(context = {}, type = 'figure') {
  if (!context.customTemplateEnabled) return null;
  return type === 'table' ? context.exportFormat?.table : context.exportFormat?.image;
}

function captionTextRun(value, context = {}, type = 'figure') {
  const imageStyle = captionStyle(context, type);
  return textRun(value, {
    font: imageStyle?.caption_font || '黑体',
    size: imageStyle ? pointsToHalfPoints(chineseSizeToPoints(imageStyle.caption_size, 10.5)) : 21,
    bold: imageStyle?.caption_bold,
    italics: imageStyle?.caption_italic,
    color: '000000',
  });
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
  const style = captionStyle(context, type);
  return paragraph([
    captionTextRun(`${sequence.label} `, context, type),
    new SimpleField(`SEQ ${sequence.identifier} \\* ARABIC`, sequence.cachedValue),
    ...(captionName ? [captionTextRun(` ${captionName}`, context, type)] : []),
  ], {
    optimized: true,
    alignment: style ? docxAlignment(style.caption_alignment, AlignmentType.CENTER) : AlignmentType.CENTER,
    indent: { left: 0, right: 0 },
    tabStops: [],
    run: {
      font: style?.caption_font || '黑体',
      size: style ? pointsToHalfPoints(chineseSizeToPoints(style.caption_size, 10.5)) : 21,
      color: '000000',
    },
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
      ? Math.round(WORD_OPTIMIZATION_IMAGE_MAX_WIDTH * (context.customTemplateEnabled ? context.exportFormat.image.max_width_percent / 100 : 1))
      : MAX_IMAGE_WIDTH;
  const maxImageHeight = context.projectManagementDocumentEnabled
    ? PROJECT_MANAGEMENT_IMAGE_MAX_HEIGHT
    : context.presalesProposalDocumentEnabled
      ? PRESALES_PROPOSAL_IMAGE_MAX_HEIGHT
    : context.wordOptimizationEnabled
      ? WORD_OPTIMIZATION_IMAGE_MAX_HEIGHT
      : DEFAULT_IMAGE_MAX_HEIGHT;
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
  const alignment = context.customTemplateEnabled
    ? docxAlignment(context.exportFormat.image.alignment, AlignmentType.CENTER)
    : AlignmentType.CENTER;
  return paragraph([await imageRunFromNode({ url: source, alt }, context, options)], { alignment });
}

function looksLikeTextDiagram(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 4) return false;
  const boxGlyphs = (lines.join('').match(/[┌┐└┘├┤┬┴│─┼╭╮╰╯┏┓┗┛┣┫┳┻┃━]/g) || []).length;
  const structuralLines = lines.filter((line) => /(?:[-=_]{5,}|(?:\||│).*(?:\||│)|\bPhase\s*\d+)/i.test(line)).length;
  return boxGlyphs >= 4 || structuralLines >= 3;
}

function renderTextDiagramToDataUrl(value) {
  registerCanvasCjkFonts();
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const fontSize = 18;
  const lineHeight = 28;
  const padding = 24;
  const measureCanvas = createCanvas(1, 1);
  const measureContext = measureCanvas.getContext('2d');
  measureContext.font = `${fontSize}px Consolas, "${CANVAS_CJK_FONT_ALIAS}", "Microsoft YaHei", monospace`;
  const contentWidth = Math.max(320, ...lines.map((line) => Math.ceil(measureContext.measureText(line || ' ').width)));
  const width = Math.min(8192, contentWidth + padding * 2);
  const height = Math.min(8192, Math.max(120, lines.length * lineHeight + padding * 2));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#f6f9ff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#243048';
  context.font = `${fontSize}px Consolas, "${CANVAS_CJK_FONT_ALIAS}", "Microsoft YaHei", monospace`;
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, padding, padding + index * lineHeight));
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

async function inlineRuns(nodes = [], context = {}, marks = {}) {
  marks = customBodyRunOptions(context, marks);
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
  marks = customBodyRunOptions(context, marks);
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
  const templateStyle = context.customTemplateEnabled ? context.exportFormat.table : null;
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
      const templateCellStyle = templateStyle ? (isHeader ? templateStyle.header_row : cellIndex === 0 ? templateStyle.first_column : templateStyle.body_cell) : null;
      const remainingSpan = cellIndex === row.cells.length - 1 ? maxColumns - row.columnCount : 0;
      cells.push(createTableCell({
        children: [paragraph(await htmlInlineRuns($, $(cellNode).contents().toArray(), context, {
          bold: isHeader,
          font: templateCellStyle?.font || (optimized && isHeader ? '黑体' : undefined),
          size: templateCellStyle ? pointsToHalfPoints(chineseSizeToPoints(templateCellStyle.size)) : undefined,
          color: templateCellStyle ? colorWithoutHash(templateCellStyle.text_color) : undefined,
          optimized,
        }), {
          after: optimized ? 0 : 80,
          ...optimizedTableCellParagraphOptions(optimized),
          alignment: templateCellStyle ? docxAlignment(templateCellStyle.alignment, AlignmentType.CENTER) : undefined,
        })],
        isHeader,
        columnSpan: cell.columnSpan + Math.max(0, remainingSpan),
        totalColumns: maxColumns,
        optimized,
        templateStyle,
        templateCellStyle,
      }));
    }
    rows.push(new TableRow({ children: cells, tableHeader: optimized && rows.length === 0 }));
  }

  if (!rows.length) {
    return [];
  }

  const blocks = [];
  if (optimized) {
    if (!context.customTemplateEnabled || context.exportFormat.table.caption_enabled) {
      blocks.push(createCaptionParagraph(context, 'table', inferTableCaptionName(context), '数据表'));
    }
  }
  blocks.push(createDocxTable(rows, maxColumns, { optimized, templateStyle }));
  return blocks;
}

async function htmlListToDocx($, listNode, context, options = {}) {
  const blocks = [];
  const ordered = htmlTagName(listNode) === 'ol';
  const customUnorderedDisabled = !ordered && context.customTemplateEnabled && context.exportFormat.body_text.list_style === 'none';
  const numberingReference = ordered
    ? createOrderedListReference(context)
    : context.customTemplateEnabled && !customUnorderedDisabled ? createUnorderedListReference(context) : null;

  for (const itemNode of $(listNode).children('li').toArray()) {
    const inlineNodes = $(itemNode).contents().toArray().filter((child) => !['ul', 'ol'].includes(htmlTagName(child)));
    const listOptions = numberingReference
      ? { numbering: { reference: numberingReference, level: Math.min(options.listLevel || 0, 2) } }
      : customUnorderedDisabled ? {} : { bullet: { level: Math.min(options.listLevel || 0, 2) } };
    blocks.push(paragraph(await htmlInlineRuns($, inlineNodes, context), {
      ...customBodyParagraphOptions(context),
      ...listOptions,
      indent: context.customTemplateEnabled ? customListIndent(context) : undefined,
    }));

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
    if (context.wordOptimizationEnabled && (!context.customTemplateEnabled || context.exportFormat.image.caption_enabled)) {
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

async function tableCellParagraphs(cell, context, isHeader = false, isFirstColumn = false) {
  const optimized = Boolean(context.wordOptimizationEnabled);
  const templateStyle = context.customTemplateEnabled ? context.exportFormat.table : null;
  const templateCellStyle = templateStyle ? (isHeader ? templateStyle.header_row : isFirstColumn ? templateStyle.first_column : templateStyle.body_cell) : null;
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
      font: projectManagementDocument ? '仿宋_GB2312' : templateCellStyle?.font || (optimized && isHeader ? '黑体' : undefined),
      size: projectManagementDocument ? PROJECT_MANAGEMENT_TABLE_FONT_SIZE : templateCellStyle ? pointsToHalfPoints(chineseSizeToPoints(templateCellStyle.size)) : undefined,
      color: projectManagementDocument ? '000000' : templateCellStyle ? colorWithoutHash(templateCellStyle.text_color) : undefined,
      optimized,
      cleanMarkdown: projectManagementDocument,
    }), {
      after: optimized ? 0 : 80,
      ...optimizedTableCellParagraphOptions(optimized),
      ...projectTableParagraphOptions,
      alignment: templateCellStyle ? docxAlignment(templateCellStyle.alignment, AlignmentType.CENTER) : undefined,
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
      font: templateCellStyle?.font || (isHeader ? '黑体' : '宋体'),
      size: templateCellStyle ? pointsToHalfPoints(chineseSizeToPoints(templateCellStyle.size)) : undefined,
      color: templateCellStyle ? colorWithoutHash(templateCellStyle.text_color) : undefined,
      optimized,
    }), {
      ...optimizedTableCellParagraphOptions(true),
      alignment: templateCellStyle ? docxAlignment(templateCellStyle.alignment, AlignmentType.CENTER) : undefined,
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
      const customHeading = customHeadingStyle(context, node.depth);
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
              ? customHeading
                ? { font: customHeading.font, size: pointsToHalfPoints(chineseSizeToPoints(customHeading.size)), bold: customHeading.bold, color: colorWithoutHash(customHeading.text_color), optimized, normalizeNumbering: false }
                : { font: '黑体', color: '000000', optimized, normalizeNumbering: true }
              : officialDocument
                ? { font: officialHeadingFont, color: '000000', size: node.depth === 1 ? 44 : 32, normalizeNumbering: true }
                : {},
          );
      blocks.push(paragraph(headingRuns, {
        heading: headingLevel(node.depth),
        outlineLevel: headingNumberingLevel(node.depth),
        style: headingStyleId(node.depth),
        before: customHeading ? paragraphSpacingToTwips(customHeading.spacing_before_pt, customHeading.spacing_before_unit, chineseSizeToPoints(customHeading.size)) : optimized || formalDocument ? 0 : node.depth === 1 ? 280 : 180,
        after: customHeading ? paragraphSpacingToTwips(customHeading.spacing_after_pt, customHeading.spacing_after_unit, chineseSizeToPoints(customHeading.size)) : optimized || formalDocument ? 0 : 120,
        spacing: customHeading ? { before: paragraphSpacingToTwips(customHeading.spacing_before_pt, customHeading.spacing_before_unit, chineseSizeToPoints(customHeading.size)), after: paragraphSpacingToTwips(customHeading.spacing_after_pt, customHeading.spacing_after_unit, chineseSizeToPoints(customHeading.size)), ...customLineSpacing(customHeading.line_spacing, customHeading.line_spacing_mode, customHeading.line_spacing_unit) } : undefined,
        optimized,
        officialDocument,
        projectManagementDocument,
        presalesProposalDocument,
        keepNext: optimized || formalDocument ? true : undefined,
        numbering: context.customTemplateEnabled ? undefined : optimized || structuredDocument ? { reference: WORD_OPTIMIZATION_HEADING_REFERENCE, level: headingDepth } : undefined,
        indent: optimized || formalDocument ? { left: 0, right: 0 } : undefined,
        tabStops: optimized || formalDocument ? [] : undefined,
        // 标题只有一行时不能使用两端对齐，否则中文字符会被拉开。
        // 保留正式公文一级标题居中，其余标题统一左对齐并保留编号缩进。
        alignment: customHeading ? docxAlignment(customHeading.alignment, AlignmentType.LEFT) : officialDocument && node.depth === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
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
            ...customBodyParagraphOptions(context),
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
        if (!context.customTemplateEnabled || context.exportFormat.image.caption_enabled) {
          blocks.push(createCaptionParagraph(context, 'figure', imageNode?.alt || '', '图片'));
        }
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
          ...(!options.inTable ? customBodyParagraphOptions(context) : {}),
          after: formalDocument ? 0 : options.inTable ? 80 : 160,
          optimized,
          officialDocument,
          projectManagementDocument,
          presalesProposalDocument,
          alignment: !options.inTable && context.customTemplateEnabled
            ? docxAlignment(context.exportFormat.body_text.alignment)
            : options.inTable && (optimized || projectManagementDocument)
            ? AlignmentType.CENTER
            : isNumberedBodyParagraph(text)
              ? AlignmentType.LEFT
            : !options.inTable && (isImageOnlyParagraph(node) || isFigureCaptionParagraph(node)) ? AlignmentType.CENTER : undefined,
          indent: !options.inTable && context.customTemplateEnabled && !isNumberedBodyParagraph(text)
            ? { left: 0, right: 0, firstLine: Math.round(context.exportFormat.body_text.first_line_indent_chars * 240) }
            : projectManagementDocument && options.inTable
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
      const customUnorderedDisabled = !node.ordered && context.customTemplateEnabled && context.exportFormat.body_text.list_style === 'none';
      const numberingReference = node.ordered
        ? createOrderedListReference(context)
        : context.customTemplateEnabled && !customUnorderedDisabled ? createUnorderedListReference(context) : null;
      for (const item of node.children || []) {
        const firstParagraph = (item.children || []).find((child) => child.type === 'paragraph');
        const restChildren = (item.children || []).filter((child) => child !== firstParagraph);
        const listOptions = numberingReference
          ? { numbering: { reference: numberingReference, level: Math.min(options.listLevel || 0, 2) } }
          : customUnorderedDisabled ? {} : { bullet: { level: Math.min(options.listLevel || 0, 2) } };
        blocks.push(paragraph(await inlineRuns(firstParagraph?.children || [], context, optimized
          ? { optimized }
          : projectManagementDocument
            ? { font: '仿宋_GB2312', size: 32, color: '000000', cleanMarkdown: true }
            : {}), {
          ...customBodyParagraphOptions(context),
          ...listOptions,
          optimized,
          projectManagementDocument,
          alignment: AlignmentType.LEFT,
          indent: context.customTemplateEnabled ? customListIndent(context) : optimized ? optimizedNumberedBodyIndent() : projectManagementDocument ? optimizedNumberedBodyIndent() : undefined,
          tabStops: optimized || projectManagementDocument ? [] : undefined,
        }));
        blocks.push(...await markdownNodesToDocx(restChildren, context, { ...options, listLevel: (options.listLevel || 0) + 1 }));
      }
    } else if (node.type === 'table') {
      const rows = [];
      const templateStyle = context.customTemplateEnabled ? context.exportFormat.table : null;
      const maxColumns = Math.max(1, ...(node.children || []).map((row) => row.children?.length || 0));
      for (const [rowIndex, row] of (node.children || []).entries()) {
        const cells = [];
        const rowCells = row.children || [];
        for (const [cellIndex, cell] of rowCells.entries()) {
          const columnSpan = cellIndex === rowCells.length - 1
            ? Math.max(1, maxColumns - rowCells.length + 1)
            : 1;
          cells.push(createTableCell({
            children: await tableCellParagraphs(cell, context, rowIndex === 0, cellIndex === 0),
            isHeader: rowIndex === 0,
            columnSpan,
            totalColumns: maxColumns,
            optimized,
            projectManagementDocument,
            templateStyle,
            templateCellStyle: templateStyle ? (rowIndex === 0 ? templateStyle.header_row : cellIndex === 0 ? templateStyle.first_column : templateStyle.body_cell) : null,
          }));
        }
        rows.push(new TableRow({ children: cells, tableHeader: (optimized || projectManagementDocument) && rowIndex === 0 }));
      }
      if (rows.length) {
        if (optimized && (!context.customTemplateEnabled || context.exportFormat.table.caption_enabled)) {
          blocks.push(createCaptionParagraph(context, 'table', inferMarkdownTableCaptionName(node, context), '数据表'));
        }
        blocks.push(createDocxTable(rows, maxColumns, { optimized, projectManagementDocument, templateStyle }));
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
          : normalizeMermaidForExport(node.value);
        try {
          const imageDataUrl = await localImageRenderService.renderMermaidToDataUrl(mermaidCode);
          blocks.push(await imageParagraphFromSource(imageDataUrl, 'Mermaid 图', context));
        } catch (error) {
          const message = `图片无法导出：Mermaid 图，本地渲染失败：${compactText(error?.message || '未知错误', 120)}`;
          addWarning(context, message);
          blocks.push(textRun(`[${message}]`, { color: 'C83220' }));
        }
        if (optimized && (!context.customTemplateEnabled || context.exportFormat.image.caption_enabled)) {
          blocks.push(createCaptionParagraph(context, 'figure', `Mermaid 图 ${nextIndex}`, 'Mermaid 图'));
        }
        context.convertedMermaidCount = nextIndex;
        reportConversionProgress(context, `Mermaid 图 ${nextIndex}/${total} 已处理。`);
      } else if (projectManagementDocument && looksLikeMarkdownTemplate(node.value)) {
        blocks.push(...await markdownToDocxBlocks(node.value, context));
      } else if (!options.inTable && looksLikeTextDiagram(node.value)) {
        blocks.push(await imageParagraphFromSource(renderTextDiagramToDataUrl(node.value), '文本流程图', context));
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
  const tree = unified().use(remarkParse.default).use(remarkGfm.default).parse(normalizeMarkdownTablesForDocx(content));
  tree.children = repairMalformedStrongNodes(tree.children || []);
  return tree;
}

function splitMalformedStrongTextNode(node) {
  const source = String(node?.value || '');
  // AI 正文偶尔会输出 `**内容。 **`。结束标记前的空白会让 CommonMark
  // 将整段视为普通文本，因此在 AST 的 text 节点中兼容修复；code/inlineCode
  // 节点不会进入这里，避免修改用户需要原样保留的代码内容。
  const malformedStrongPattern = /\*\*((?:(?!\*\*)[^\r\n])*?\S)([ \t\u3000]+)\*\*/g;
  const nodes = [];
  let cursor = 0;
  let match;

  while ((match = malformedStrongPattern.exec(source)) !== null) {
    if (match.index > cursor) {
      nodes.push({ type: 'text', value: source.slice(cursor, match.index) });
    }
    nodes.push({
      type: 'strong',
      children: [{ type: 'text', value: match[1] }],
    });
    nodes.push({ type: 'text', value: match[2] });
    cursor = match.index + match[0].length;
  }

  if (!nodes.length) return [node];
  if (cursor < source.length) {
    nodes.push({ type: 'text', value: source.slice(cursor) });
  }
  return nodes;
}

function repairMalformedStrongNodes(nodes = []) {
  return nodes.flatMap((node) => {
    if (node.type === 'text') {
      return splitMalformedStrongTextNode(node);
    }
    if (Array.isArray(node.children)) {
      return [{ ...node, children: repairMalformedStrongNodes(node.children) }];
    }
    return [node];
  });
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
    const customHeading = customHeadingStyle(context, level);
    const rawTitle = item.title || '未命名章节';
    const cleanTitle = stripLeadingNumbering(rawTitle) || rawTitle;
    const suppressSmallestNumber = context.customTemplateEnabled && context.exportFormat.heading_border?.enabled && context.exportFormat.heading_border.min_heading_left_enabled && level >= 6;
    const title = context.customTemplateEnabled
      ? context.exportFormat.auto_numbering_enabled
        ? cleanTitle
        : staticHeadingTitle(item.id, cleanTitle, customHeading)
      : optimized || structuredDocument
      ? cleanTitle
      : `${item.id || ''} ${rawTitle}`.trim();
    const shouldRenderTitle = !(officialDocument && item.hideTitle);
    if (shouldRenderTitle) {
      children.push(paragraph([textRun(title, {
        bold: customHeading ? customHeading.bold : true,
        font: customHeading?.font || (projectManagementDocument ? '楷体_GB2312' : optimized || officialDocument || presalesProposalDocument ? '黑体' : undefined),
        color: customHeading ? colorWithoutHash(customHeading.text_color) : optimized || formalDocument ? '000000' : undefined,
        size: customHeading ? pointsToHalfPoints(chineseSizeToPoints(customHeading.size)) : projectManagementDocument ? (level === 1 ? 32 : 30) : presalesProposalDocument ? (level === 1 ? 30 : 28) : officialDocument ? 32 : undefined,
        cleanMarkdown: structuredDocument,
      })], {
        ...customHeadingDecoration(context, level),
        heading: headingLevel(level),
        outlineLevel: headingNumberingLevel(level),
        style: headingStyleId(level),
        before: customHeading ? paragraphSpacingToTwips(customHeading.spacing_before_pt, customHeading.spacing_before_unit, chineseSizeToPoints(customHeading.size)) : optimized || formalDocument ? 0 : level === 1 ? 320 : 200,
        after: customHeading ? paragraphSpacingToTwips(customHeading.spacing_after_pt, customHeading.spacing_after_unit, chineseSizeToPoints(customHeading.size)) : optimized || formalDocument ? 0 : 120,
        spacing: customHeading ? { before: paragraphSpacingToTwips(customHeading.spacing_before_pt, customHeading.spacing_before_unit, chineseSizeToPoints(customHeading.size)), after: paragraphSpacingToTwips(customHeading.spacing_after_pt, customHeading.spacing_after_unit, chineseSizeToPoints(customHeading.size)), ...customLineSpacing(customHeading.line_spacing, customHeading.line_spacing_mode, customHeading.line_spacing_unit) } : undefined,
        optimized,
        officialDocument,
        projectManagementDocument,
        presalesProposalDocument,
        keepNext: optimized || formalDocument ? true : undefined,
        numbering: context.customTemplateEnabled
          ? context.exportFormat.auto_numbering_enabled && !suppressSmallestNumber
            ? { reference: WORD_OPTIMIZATION_HEADING_REFERENCE, level: headingNumberingLevel(level) }
            : undefined
          : optimized || structuredDocument
          ? { reference: WORD_OPTIMIZATION_HEADING_REFERENCE, level: headingNumberingLevel(level) }
          : undefined,
        indent: customHeading ? { left: 0, right: 0, firstLine: Math.round(customHeading.first_line_indent_chars * 240) } : optimized || formalDocument ? { left: 0, right: 0 } : undefined,
        tabStops: optimized || formalDocument ? [] : undefined,
        alignment: suppressSmallestNumber ? AlignmentType.LEFT : customHeading ? docxAlignment(customHeading.alignment, AlignmentType.LEFT) : undefined,
        pageBreakBefore: context.customTemplateEnabled && level === 1 && context.exportFormat.heading_level1_page_break_before ? true : undefined,
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
  const customHeadingNumberingEnabled = Boolean(context.customTemplateEnabled && context.exportFormat?.auto_numbering_enabled);
  const headingNumberingEnabled = optimized || projectManagementDocument || presalesProposalDocument || customHeadingNumberingEnabled;
  if (!references.length && !headingNumberingEnabled) {
    return undefined;
  }

  return {
    config: [
      ...(headingNumberingEnabled ? [{
        reference: WORD_OPTIMIZATION_HEADING_REFERENCE,
        levels: Array.from({ length: 9 }, (_item, level) => {
          const customHeading = customHeadingNumberingEnabled ? customHeadingStyle(context, level + 1) : null;
          return {
          level,
          format: customHeading ? headingNumberingFormat(customHeading) : LevelFormat.DECIMAL,
          text: customHeading ? headingNumberingText(customHeading, level + 1) : Array.from({ length: level + 1 }, (_part, index) => `%${index + 1}`).join('.'),
          alignment: AlignmentType.START,
          suffix: LevelSuffix.SPACE,
          style: {
            paragraph: {
              indent: customHeadingNumberingEnabled ? { left: 0, hanging: 0 } : { left: 360 + level * 180, hanging: 0 },
              spacing: customHeadingNumberingEnabled
                ? { before: 0, after: 0, ...customLineSpacing(customHeading.line_spacing, customHeading.line_spacing_mode, customHeading.line_spacing_unit) }
                : { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY },
            },
            run: customHeadingNumberingEnabled
              ? { font: customHeading.font, size: pointsToHalfPoints(chineseSizeToPoints(customHeading.size)), bold: customHeading.bold, color: colorWithoutHash(customHeading.text_color) }
              : { font: projectManagementDocument ? '楷体_GB2312' : '黑体', size: projectManagementDocument ? 28 : 24, bold: true, color: '000000' },
          },
        };}),
      }] : []),
      ...references.map((definition) => ({
        reference: definition.reference,
        levels: [0, 1, 2].map((level) => ({
          level,
          ...(definition.ordered
            ? orderedListNumbering(definition.style, level)
            : unorderedListNumbering(definition.style, level)),
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: context.customTemplateEnabled ? customListIndent(context) : optimized || projectManagementDocument ? optimizedNumberedBodyIndent() : { left: 720 + level * 420, hanging: 260 },
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
  const feasibilityReportEnabled = payload.document_profile === 'feasibility-report' || payload.documentProfile === 'feasibility-report';
  const structuredDocumentEnabled = projectManagementDocumentEnabled || presalesProposalDocumentEnabled;
  const formalDocumentEnabled = officialDocumentEnabled || structuredDocumentEnabled;
  const documentScope = payload.documentScope || payload.document_scope;
  const exportMode = payload.exportMode || payload.export_mode;
  const customTemplateEnabled = !formalDocumentEnabled && documentScope === 'bid' && exportMode === 'custom-template';
  const exportFormat = customTemplateEnabled ? normalizeBidExportTemplate(payload.exportFormat || payload.export_format) : null;
  const customCoverEnabled = Boolean(customTemplateEnabled && exportFormat.cover?.enabled);
  const wordOptimizationEnabled = !formalDocumentEnabled && (
    customTemplateEnabled
    || (documentScope === 'bid' && exportMode === 'basic' ? false : isWordOptimizationEnabled(options.config))
  );
  const context = {
    baseDir: payload.base_dir || payload.baseDir,
    onProgress: options.onProgress,
    warnings: options.warnings || [],
    stats,
    officialDocumentEnabled,
    projectManagementDocumentEnabled,
    presalesProposalDocumentEnabled,
    feasibilityReportEnabled,
    wordOptimizationEnabled,
    customTemplateEnabled,
    exportFormat,
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
  const structuredCoverChildren = projectManagementDocumentEnabled
    ? createProjectManagementCover(payload)
    : presalesProposalDocumentEnabled
    ? createPresalesProposalCover(payload)
    : [];
  const tocChildren = structuredDocumentEnabled ? createProjectManagementTocPage() : [];
  const children = structuredDocumentEnabled
    ? []
    : feasibilityReportEnabled && !customCoverEnabled
    ? [
        paragraph([textRun(payload.project_name || '建设项目', { bold: true, size: 34, font: '黑体', color: '000000' })], { alignment: AlignmentType.CENTER, before: 1600, after: 420, indent: { left: 0, right: 0 } }),
        paragraph([textRun(payload.document_title || '可行性研究报告', { bold: true, size: 44, font: '黑体', color: '000000' })], { alignment: AlignmentType.CENTER, after: 1600, indent: { left: 0, right: 0 } }),
        paragraph([textRun(payload.construction_unit || '', { size: 24, font: '宋体', color: '000000' })], { alignment: AlignmentType.CENTER, after: 180, indent: { left: 0, right: 0 } }),
        paragraph([textRun(payload.report_date || new Date().toLocaleDateString('zh-CN'), { size: 22, font: '宋体', color: '000000' })], { alignment: AlignmentType.CENTER, after: 300, indent: { left: 0, right: 0 } }),
        pageBreakParagraph(),
      ]
    : officialDocumentEnabled
    ? []
    : wordOptimizationEnabled && !customCoverEnabled
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

  const customCoverChildren = customCoverEnabled ? await createCustomBidCover(payload, context) : [];

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
    : customTemplateEnabled
    ? {
        spacing: { before: paragraphSpacingToTwips(exportFormat.body_text.spacing_before_pt, exportFormat.body_text.spacing_before_unit, chineseSizeToPoints(exportFormat.body_text.size)), after: paragraphSpacingToTwips(exportFormat.body_text.spacing_after_pt, exportFormat.body_text.spacing_after_unit, chineseSizeToPoints(exportFormat.body_text.size)), ...customLineSpacing(exportFormat.body_text.line_spacing_multiple, exportFormat.body_text.line_spacing_mode, exportFormat.body_text.line_spacing_unit) },
        alignment: docxAlignment(exportFormat.body_text.alignment),
        indent: { firstLine: Math.round(exportFormat.body_text.first_line_indent_chars * 240) },
      }
    : wordOptimizationEnabled
    ? {
        spacing: { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACTLY },
        alignment: AlignmentType.JUSTIFIED,
        indent: optimizedBodyIndent(),
      }
    : { spacing: { line: 360, after: 160 } };
  const optimizedHeadingStyle = wordOptimizationEnabled || structuredDocumentEnabled || customTemplateEnabled
    ? {
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: customTemplateEnabled ? exportFormat.headings[0].font : projectManagementDocumentEnabled ? '楷体_GB2312' : '黑体',
          size: customTemplateEnabled ? pointsToHalfPoints(chineseSizeToPoints(exportFormat.headings[0].size)) : projectManagementDocumentEnabled ? 30 : presalesProposalDocumentEnabled ? 28 : 24,
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
  const configuredHeadingStyle = (level) => ({
    ...optimizedHeadingStyle,
    run: customTemplateEnabled
      ? (() => {
          const heading = exportFormat.headings[Math.min(level - 1, exportFormat.headings.length - 1)];
          return { font: heading.font, size: pointsToHalfPoints(chineseSizeToPoints(heading.size)), bold: heading.bold, color: colorWithoutHash(heading.text_color) };
        })()
      : projectManagementDocumentEnabled
      ? { font: '楷体_GB2312', size: level === 1 ? 32 : level === 2 ? 30 : 28, bold: true, color: '000000' }
      : presalesProposalDocumentEnabled
      ? { font: '黑体', size: level === 1 ? 30 : level === 2 ? 28 : 26, bold: true, color: '000000' }
      : optimizedHeadingStyle.run,
    paragraph: customTemplateEnabled
      ? (() => {
          const heading = exportFormat.headings[Math.min(level - 1, exportFormat.headings.length - 1)];
          return {
            spacing: { before: paragraphSpacingToTwips(heading.spacing_before_pt, heading.spacing_before_unit, chineseSizeToPoints(heading.size)), after: paragraphSpacingToTwips(heading.spacing_after_pt, heading.spacing_after_unit, chineseSizeToPoints(heading.size)), ...customLineSpacing(heading.line_spacing, heading.line_spacing_mode, heading.line_spacing_unit) },
            alignment: docxAlignment(heading.alignment, AlignmentType.LEFT),
            indent: { left: 0, right: 0 },
            tabStops: [],
            numbering: exportFormat.auto_numbering_enabled && !(exportFormat.heading_border?.enabled && exportFormat.heading_border.min_heading_left_enabled && level >= 6)
              ? { reference: WORD_OPTIMIZATION_HEADING_REFERENCE, level: headingNumberingLevel(level) }
              : undefined,
          };
        })()
      : optimizedHeadingStyle.paragraph,
  });
  const sections = structuredDocumentEnabled
    ? [
        {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              margin: projectManagementPageMargin(),
            },
          },
          children: structuredCoverChildren,
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
    : customCoverEnabled
    ? [
        {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              size: (() => { const dimensions = PAPER_DIMENSIONS_MM[exportFormat.page.paper_size] || PAPER_DIMENSIONS_MM.a4; return { width: centimetersToTwips(dimensions.width / 10), height: centimetersToTwips(dimensions.height / 10), orientation: exportFormat.page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }; })(),
              margin: {
                top: centimetersToTwips(exportFormat.page.margin_top_cm),
                right: centimetersToTwips(exportFormat.page.margin_right_cm),
                bottom: centimetersToTwips(exportFormat.page.margin_bottom_cm),
                left: centimetersToTwips(exportFormat.page.margin_left_cm),
                footer: centimetersToTwips(exportFormat.page.footer_distance_cm),
              },
            },
          },
          headers: !exportFormat.cover.hide_header_footer && customTemplateHeader(exportFormat.page) ? { default: customTemplateHeader(exportFormat.page) } : undefined,
          footers: !exportFormat.cover.hide_header_footer && customTemplateFooter(exportFormat.page) ? { default: customTemplateFooter(exportFormat.page) } : undefined,
          children: customCoverChildren,
        },
        {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              size: (() => { const dimensions = PAPER_DIMENSIONS_MM[exportFormat.page.paper_size] || PAPER_DIMENSIONS_MM.a4; return { width: centimetersToTwips(dimensions.width / 10), height: centimetersToTwips(dimensions.height / 10), orientation: exportFormat.page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }; })(),
              margin: {
                top: centimetersToTwips(exportFormat.page.margin_top_cm),
                right: centimetersToTwips(exportFormat.page.margin_right_cm),
                bottom: centimetersToTwips(exportFormat.page.margin_bottom_cm),
                left: centimetersToTwips(exportFormat.page.margin_left_cm),
                footer: centimetersToTwips(exportFormat.page.footer_distance_cm),
              },
              pageNumbers: exportFormat.page.page_number_enabled ? { start: exportFormat.page.page_number_start } : undefined,
            },
          },
          headers: customTemplateHeader(exportFormat.page) ? { default: customTemplateHeader(exportFormat.page) } : undefined,
          footers: customTemplateFooter(exportFormat.page) ? { default: customTemplateFooter(exportFormat.page) } : undefined,
          children,
        },
      ]
    : [{
        properties: {
          page: {
            size: customTemplateEnabled ? (() => { const dimensions = PAPER_DIMENSIONS_MM[exportFormat.page.paper_size] || PAPER_DIMENSIONS_MM.a4; return { width: centimetersToTwips(dimensions.width / 10), height: centimetersToTwips(dimensions.height / 10), orientation: exportFormat.page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }; })() : undefined,
            margin: customTemplateEnabled
              ? {
                  top: centimetersToTwips(exportFormat.page.margin_top_cm),
                  right: centimetersToTwips(exportFormat.page.margin_right_cm),
                  bottom: centimetersToTwips(exportFormat.page.margin_bottom_cm),
                  left: centimetersToTwips(exportFormat.page.margin_left_cm),
                  footer: centimetersToTwips(exportFormat.page.footer_distance_cm),
                }
              : officialDocumentEnabled
              ? { top: 2098, right: 1475, bottom: 1890, left: 1587 }
              : { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            pageNumbers: customTemplateEnabled && exportFormat.page.page_number_enabled ? { start: exportFormat.page.page_number_start } : undefined,
          },
          ...(customTemplateEnabled && exportFormat.page.first_page_different ? { titlePage: true } : {}),
        },
        headers: customTemplateEnabled && customTemplateHeader(exportFormat.page) ? { default: customTemplateHeader(exportFormat.page) } : undefined,
        footers: customTemplateEnabled
          ? customTemplateFooter(exportFormat.page) ? { default: customTemplateFooter(exportFormat.page) } : undefined
          : wordOptimizationEnabled ? { default: centeredPageNumberFooter() } : undefined,
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
            : customTemplateEnabled
            ? { font: exportFormat.body_text.font, size: pointsToHalfPoints(chineseSizeToPoints(exportFormat.body_text.size)), color: '000000' }
            : { font: '宋体', size: 24, color: wordOptimizationEnabled ? '000000' : undefined },
          paragraph: defaultParagraphStyle,
        },
        ...(customTemplateEnabled ? {
          heading1: configuredHeadingStyle(1),
          heading2: configuredHeadingStyle(2),
          heading3: configuredHeadingStyle(3),
          heading4: configuredHeadingStyle(4),
          heading5: configuredHeadingStyle(5),
          heading6: configuredHeadingStyle(6),
        } : {}),
      },
      paragraphStyles: [
        ...(wordOptimizationEnabled || structuredDocumentEnabled || customTemplateEnabled ? [
          ...(customTemplateEnabled ? [7, 8, 9] : Array.from({ length: 9 }, (_item, index) => index + 1)).map((level) => ({
            id: `Heading${level}`,
            name: `Heading ${level}`,
            ...configuredHeadingStyle(level),
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

  reportProgress(progressContext, 5, '正在读取原方案 DOCX 模板。');

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

function resolveBidTemplatePayload(payload = {}, templateStore) {
  const documentScope = payload.documentScope || payload.document_scope;
  const exportMode = payload.exportMode || payload.export_mode;
  if (exportMode !== 'custom-template') return payload;
  if (documentScope !== 'bid') {
    throw new Error('自定义招投标模板不能用于其他业务模块');
  }

  const templateId = String(payload.templateId || payload.template_id || '').trim();
  if (!templateId) {
    if (payload.templatePreview === true || payload.template_preview === true) {
      if (!(payload.exportFormat || payload.export_format)) {
        throw new Error('未找到当前模板的测试导出配置');
      }
      return payload;
    }
    throw new Error('请选择一个已保存的招投标模板');
  }

  if (!templateStore || typeof templateStore.get !== 'function') {
    throw new Error('招投标模板服务尚未就绪，请重启客户端后重试');
  }
  const template = templateStore.get(templateId);
  if (!template) {
    throw new Error('所选招投标模板已不存在，请重新选择');
  }
  return {
    ...payload,
    templateId: template.templateId,
    exportFormat: template.config,
  };
}

function createExportService({ configStore, getTemplateStore } = {}) {
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

      const config = configStore ? configStore.load() : null;
      const documentScope = payload.documentScope || payload.document_scope;
      const exportMode = payload.exportMode || payload.export_mode;
      if (exportMode === 'custom-template') {
        const templateStore = typeof getTemplateStore === 'function' ? getTemplateStore() : null;
        payload = resolveBidTemplatePayload(payload, templateStore);
      }
      if (documentScope === 'bid' && exportMode === 'custom-template' && !(payload.exportFormat || payload.export_format)) {
        throw new Error('未找到本次导出的自定义模板配置');
      }
      if (documentScope === 'bid' && exportMode === 'word-optimization' && !isWordOptimizationEnabled(config)) {
        throw new Error('请先到 设置 > 技能管理 启用 word-optimization');
      }

      const stats = countOutlineStats(payload.outline || []);
      const progressContext = { onProgress, warnings: [], stats };
      const feasibilityReport = payload.document_profile === 'feasibility-report' || payload.documentProfile === 'feasibility-report';
      const defaultFilename = feasibilityReport
        ? `${sanitizeFilename(payload.project_name || '建设项目')}-可行性研究报告.docx`
        : `${sanitizeFilename(payload.project_name || '标书文档')}-技术方案.docx`;
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

      reportProgress(progressContext, 2, stats.mermaidCount
        ? `检测到 ${stats.mermaidCount} 张 Mermaid 图，导出时会转换为 Word 图片。`
        : '正在准备 Word 导出。');

      const warnings = [];
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
  normalizeMermaidForExport,
  resolveBidTemplatePayload,
  svgBufferToPngBuffer,
};
