const fs = require('node:fs');
const path = require('node:path');
const chardet = require('chardet');
const iconv = require('iconv-lite');

const LINES_PER_PAGE = 50;
const MAX_PAGES = 60;
const MAX_MATERIAL_LINES = LINES_PER_PAGE * MAX_PAGES;

const DEFAULT_CLEAN_OPTIONS = {
  removeComments: true,
  removeBlankLines: true,
  maskSensitive: true,
  wrapLongLines: true,
  maxLineWidth: 78,
  tabWidth: 4,
};

const C_LIKE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.dart', '.go', '.h', '.hpp', '.java', '.js', '.jsx',
  '.kt', '.kts', '.m', '.mm', '.php', '.rs', '.scala', '.scss', '.swift', '.ts', '.tsx',
]);

function normalizeCleanOptions(value = {}) {
  return {
    ...DEFAULT_CLEAN_OPTIONS,
    ...(value || {}),
    maxLineWidth: Math.max(40, Math.min(160, Number(value?.maxLineWidth) || DEFAULT_CLEAN_OPTIONS.maxLineWidth)),
    tabWidth: Math.max(1, Math.min(8, Number(value?.tabWidth) || DEFAULT_CLEAN_OPTIONS.tabWidth)),
  };
}

function detectEncoding(buffer) {
  const detected = String(chardet.detect(buffer) || 'UTF-8').toLowerCase();
  if (detected.includes('gb') || detected.includes('big5')) return detected.includes('big5') ? 'big5' : 'gb18030';
  if (detected.includes('utf-16le')) return 'utf16-le';
  if (detected.includes('utf-16be')) return 'utf16-be';
  return 'utf-8';
}

function readSourceFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const encoding = detectEncoding(buffer);
  return { text: iconv.decode(buffer, encoding), encoding };
}

function widthOf(value) {
  return Array.from(String(value || '')).reduce((sum, character) => sum + (character.codePointAt(0) > 0x2e7f ? 2 : 1), 0);
}

function wrapLine(value, maxWidth) {
  const text = String(value || '');
  const leadingIndent = text.match(/^[\t ]*/u)?.[0] || '';
  const continuationIndent = `${leadingIndent}    `;
  const result = [];
  let remaining = text;
  let firstLine = true;

  while (widthOf(`${firstLine ? '' : continuationIndent}${remaining}`) > maxWidth) {
    const prefix = firstLine ? '' : continuationIndent;
    const availableWidth = Math.max(12, maxWidth - widthOf(prefix));
    const characters = Array.from(remaining);
    let currentWidth = 0;
    let limit = 0;
    for (; limit < characters.length; limit += 1) {
      const nextWidth = widthOf(characters[limit]);
      if (limit > 0 && currentWidth + nextWidth > availableWidth) break;
      currentWidth += nextWidth;
    }

    const minimumNaturalBreak = Math.max(1, Math.floor(limit * 0.55));
    let breakAt = limit;
    let foundNaturalBreak = false;
    const breakRules = [
      (previous) => /[\s,;]/u.test(previous),
      (previous, next) => /[:(){}[\]=+*/|-]/u.test(previous) || next === '.',
      (_previous, next) => next === '_',
    ];
    for (const matchesBreak of breakRules) {
      for (let index = limit; index > minimumNaturalBreak; index -= 1) {
        const previous = characters[index - 1] || '';
        const next = characters[index] || '';
        if (matchesBreak(previous, next)) {
          breakAt = index;
          foundNaturalBreak = true;
          break;
        }
      }
      if (foundNaturalBreak) break;
    }

    result.push(`${prefix}${characters.slice(0, breakAt).join('')}`.replace(/\s+$/u, ''));
    remaining = characters.slice(breakAt).join('').replace(/^\s+/u, '');
    firstLine = false;
  }

  result.push(`${firstLine ? '' : continuationIndent}${remaining}`);
  return result;
}

function maskSensitiveText(value) {
  let count = 0;
  let text = String(value || '');
  const replace = (pattern, replacer) => {
    text = text.replace(pattern, (...args) => {
      count += 1;
      return replacer(...args);
    });
  };
  replace(/((?:api[_-]?key|secret|token|passwd|password|access[_-]?key)\s*[:=]\s*["'])([^"']{4,})(["'])/gi, (_match, start, secret, end) => `${start}${String(secret).slice(0, 2)}****${end}`);
  replace(/\b(?:sk|pk|ghp|gho|glpat|AKIA|ASIA)[-_][A-Za-z0-9_-]{8,}\b/g, (match) => `${String(match).slice(0, 5)}****`);
  replace(/\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2}\b/g, () => '10.0.*.*');
  replace(/\b1[3-9]\d{9}\b/g, (match) => `${String(match).slice(0, 3)}********`);
  return { text, count };
}

function syntaxFor(extension) {
  const ext = String(extension || '').toLowerCase();
  if (C_LIKE_EXTENSIONS.has(ext)) return { line: ['//'], blocks: [['/*', '*/']], quotes: ['"', "'", '`'] };
  if (ext === '.py' || ext === '.rb' || ext === '.sh') return { line: ['#'], blocks: [], quotes: ['"', "'"] };
  if (ext === '.sql' || ext === '.lua') return { line: ['--'], blocks: ext === '.sql' ? [['/*', '*/']] : [['--[[', ']]']], quotes: ['"', "'"] };
  if (['.html', '.htm', '.xml'].includes(ext)) return { line: [], blocks: [['<!--', '-->']], quotes: ['"', "'"] };
  if (ext === '.vue') return { line: ['//'], blocks: [['<!--', '-->'], ['/*', '*/']], quotes: ['"', "'", '`'] };
  if (['.css', '.less'].includes(ext)) return { line: ext === '.less' ? ['//'] : [], blocks: [['/*', '*/']], quotes: ['"', "'"] };
  return { line: [], blocks: [], quotes: ['"', "'", '`'] };
}

function stripComments(source, extension) {
  const syntax = syntaxFor(extension);
  let output = '';
  let removedComments = 0;
  let quote = null;
  let blockEnd = null;
  let escaped = false;
  for (let index = 0; index < source.length;) {
    if (blockEnd) {
      if (source.startsWith(blockEnd, index)) {
        const blockEndLength = blockEnd.length;
        blockEnd = null;
        index += blockEndLength;
        removedComments += 1;
      } else {
        if (source[index] === '\n') output += '\n';
        index += 1;
      }
      continue;
    }
    const character = source[index];
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (syntax.quotes.includes(character)) {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    const block = syntax.blocks.find(([start]) => source.startsWith(start, index));
    if (block) {
      blockEnd = block[1];
      index += block[0].length;
      continue;
    }
    const lineMarker = syntax.line.find((marker) => source.startsWith(marker, index));
    if (lineMarker) {
      const nextLine = source.indexOf('\n', index + lineMarker.length);
      output += nextLine >= 0 ? '\n' : '';
      index = nextLine >= 0 ? nextLine + 1 : source.length;
      removedComments += 1;
      continue;
    }
    output += character;
    index += 1;
  }
  return { text: output, removedComments };
}

function extractAttributions(source, file, extension = path.extname(file)) {
  const evidence = [];
  const patterns = [
    ['author', /@author\b\s*[:：]?\s*([^*\r\n]+)/gi],
    ['copyright', /\bcopyright\b\s*(?:\(c\)|©)?\s*(?:\d{4}(?:\s*[-,]\s*\d{2,4})?\s*)?([^*\r\n]+)/gi],
  ];
  const syntax = syntaxFor(extension);
  let inBlockComment = false;
  source.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    const startsBlock = syntax.blocks.some(([start]) => trimmed.startsWith(start));
    const startsLineComment = syntax.line.some((marker) => trimmed.startsWith(marker));
    const continuesBlock = inBlockComment && (trimmed.startsWith('*') || trimmed.length > 0);
    const isComment = startsBlock || startsLineComment || continuesBlock;
    if (startsBlock && !syntax.blocks.some(([start, end]) => trimmed.startsWith(start) && trimmed.includes(end, start.length))) {
      inBlockComment = true;
    }
    if (inBlockComment && syntax.blocks.some(([, end]) => trimmed.includes(end))) {
      inBlockComment = false;
    }
    if (!isComment) return;
    for (const [kind, pattern] of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const subject = String(match[1] || '').replace(/(?:-->|\*\/|\*|#|\/\/)+\s*$/g, '').trim();
        if (subject) evidence.push({ kind, subject, file, line: index + 1, detail: line.trim() });
      }
    }
  });
  return evidence;
}

function cleanSource(source, extension, options) {
  const normalized = normalizeCleanOptions(options);
  const withoutComments = normalized.removeComments ? stripComments(source, extension) : { text: source, removedComments: 0 };
  const tabReplacement = ' '.repeat(normalized.tabWidth);
  const result = [];
  let removedBlankLines = 0;
  let maskedCount = 0;
  let wrappedLines = 0;
  const maskedEvidence = [];
  for (const [lineIndex, rawLine] of withoutComments.text.split(/\r?\n/).entries()) {
    let line = rawLine.replace(/\t/g, tabReplacement).replace(/\s+$/g, '');
    if (normalized.removeBlankLines && !line.trim()) {
      removedBlankLines += 1;
      continue;
    }
    if (normalized.maskSensitive) {
      const masked = maskSensitiveText(line);
      line = masked.text;
      maskedCount += masked.count;
      if (masked.count > 0) {
        maskedEvidence.push({
          line: lineIndex + 1,
          detail: `检测并脱敏 ${masked.count} 处疑似密钥、密码、内网地址或个人信息。`,
        });
      }
    }
    const lines = normalized.wrapLongLines && widthOf(line) > normalized.maxLineWidth ? wrapLine(line, normalized.maxLineWidth) : [line];
    wrappedLines += Math.max(0, lines.length - 1);
    result.push(...lines);
  }
  return {
    lines: result,
    removedComments: withoutComments.removedComments,
    removedBlankLines,
    maskedCount,
    maskedEvidence,
    wrappedLines,
  };
}

function normalizeParty(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function createAudit({ pages, files, fields, cleanOptions, totalLines, truncated }) {
  const items = [];
  const title = `${fields.softwareName || ''} ${fields.version || ''}`.trim();
  if (!fields.softwareName || !fields.version) items.push({ status: 'fail', name: '页眉信息不完整', detail: '软件全称和版本号必须完整填写。', recommendation: '补全申请字段中的软件全称和版本号，然后重新抽取代码材料。' });
  else items.push({ status: 'pass', name: '页眉信息完整', detail: `将使用“${title} 源程序”作为代码材料页眉。` });

  if (!pages.length) items.push({ status: 'fail', name: '没有有效源码', detail: '所选文件清洗后没有可提交的代码内容。', recommendation: '返回源码准备工作台补充核心源码，或关闭过度清洗规则后重新抽取。' });
  else {
    const shortPages = pages.slice(0, -1).filter((page) => page.lines.length < LINES_PER_PAGE);
    items.push(shortPages.length
      ? { status: 'fail', name: '存在行数不足的页面', detail: `第 ${shortPages.map((page) => page.no).join('、')} 页不足 ${LINES_PER_PAGE} 行。`, recommendation: '补充有效源码并重新抽取，确保除末页外每页均为 50 行。' }
      : { status: 'pass', name: '分页行数符合要求', detail: `除末页外，每页均为 ${LINES_PER_PAGE} 行。` });
    const lastPage = pages[pages.length - 1];
    items.push(lastPage.lines.length < Math.ceil(LINES_PER_PAGE * 2 / 3)
      ? { status: 'warn', name: '末页内容偏少', detail: `末页只有 ${lastPage.lines.length} 行，建议补充到至少 ${Math.ceil(LINES_PER_PAGE * 2 / 3)} 行。`, recommendation: '从候选文件中补充与核心业务相关的源码，再重新抽取。' }
      : { status: 'pass', name: '末页内容充足', detail: `末页包含 ${lastPage.lines.length} 行。` });
    items.push({
      status: 'pass',
      name: truncated ? '前后段截取边界明确' : '完整源码已纳入',
      detail: truncated ? `已从 ${totalLines} 行中截取前 1500 行和后 1500 行。` : `已纳入全部 ${totalLines} 行清洗后源码。`,
    });
  }

  const maskedCount = files.reduce((sum, file) => sum + file.masked_count, 0);
  const maskedEvidence = files.flatMap((file) => (file.sensitive_evidence || []).map((item) => ({ ...item, file: file.path })));
  items.push(maskedCount
    ? { status: 'warn', name: '已脱敏敏感信息', detail: `共替换 ${maskedCount} 处疑似敏感信息，请核对占位内容。`, recommendation: '逐项确认脱敏位置；若文件不应提交，可直接标记排除后重新抽取。', evidence: maskedEvidence.slice(0, 12) }
    : { status: 'pass', name: '未发现敏感信息', detail: cleanOptions.maskSensitive ? '未发现需要脱敏的密钥、密码、内网地址或手机号。' : '敏感信息脱敏未启用。' });

  const ownerKey = normalizeParty(fields.copyrightOwner);
  const conflicts = files.flatMap((file) => file.attributions || []).filter((item) => {
    const subjectKey = normalizeParty(item.subject);
    return ownerKey && subjectKey && !ownerKey.includes(subjectKey) && !subjectKey.includes(ownerKey);
  });
  if (conflicts.length) {
    items.push({
      status: 'fail',
      name: '检测到疑似署名冲突',
      detail: `发现 ${conflicts.length} 处与著作权人不一致的 @author 或 Copyright 声明。`,
      recommendation: '确认权属后修正源码声明，或将第三方文件标记排除，再重新抽取代码材料。',
      evidence: conflicts.slice(0, 8),
    });
  } else if (ownerKey) {
    items.push({ status: 'pass', name: '未发现署名冲突', detail: '所选源码中未发现与著作权人明显冲突的署名。' });
  } else {
    items.push({ status: 'warn', name: '无法核对源码署名', detail: '请填写著作权人后重新抽取代码材料。', recommendation: '填写完整著作权人信息并保存字段，然后重新抽取。' });
  }
  return items.sort((a, b) => ({ fail: 0, warn: 1, pass: 2 })[a.status] - ({ fail: 0, warn: 1, pass: 2 })[b.status]);
}

function buildCodeMaterial(projectDir, selectedFiles, fields, cleanOptions) {
  const normalizedOptions = normalizeCleanOptions(cleanOptions);
  const stream = [];
  const files = [];
  for (const item of selectedFiles) {
    const filePath = path.resolve(projectDir, item.path);
    const rootPath = path.resolve(projectDir);
    if (!filePath.startsWith(`${rootPath}${path.sep}`) || !fs.existsSync(filePath)) continue;
    const { text, encoding } = readSourceFile(filePath);
    const cleaned = cleanSource(text, path.extname(item.path), normalizedOptions);
    const start = stream.length + 1;
    for (const line of cleaned.lines) stream.push({ text: line, file: item.path });
    files.push({
      path: item.path,
      category: item.category,
      selection_score: item.selection_score,
      encoding,
      source_line_count: text.split(/\r?\n/).length,
      cleaned_line_count: cleaned.lines.length,
      material_line_start: start,
      material_line_end: stream.length,
      removed_comments: cleaned.removedComments,
      removed_blank_lines: cleaned.removedBlankLines,
      masked_count: cleaned.maskedCount,
      sensitive_evidence: cleaned.maskedEvidence,
      wrapped_lines: cleaned.wrappedLines,
      attributions: extractAttributions(text, item.path, path.extname(item.path)),
    });
  }

  const truncated = stream.length > MAX_MATERIAL_LINES;
  const selectedStream = truncated
    ? [...stream.slice(0, MAX_MATERIAL_LINES / 2), ...stream.slice(-MAX_MATERIAL_LINES / 2)]
    : stream;
  const pages = [];
  for (let index = 0; index < selectedStream.length; index += LINES_PER_PAGE) {
    const chunk = selectedStream.slice(index, index + LINES_PER_PAGE);
    pages.push({
      no: pages.length + 1,
      lines: chunk.map((entry) => entry.text),
      start_file: chunk[0]?.file || '',
      end_file: chunk[chunk.length - 1]?.file || '',
      segment: truncated && pages.length >= MAX_PAGES / 2 ? 'back' : 'front',
    });
  }
  const audit = createAudit({ pages, files, fields, cleanOptions: normalizedOptions, totalLines: stream.length, truncated });
  return { pages, files, audit, cleanOptions: normalizedOptions, totalLines: stream.length, truncated };
}

module.exports = {
  DEFAULT_CLEAN_OPTIONS,
  LINES_PER_PAGE,
  MAX_PAGES,
  buildCodeMaterial,
  cleanSource,
  normalizeCleanOptions,
  readSourceFile,
  wrapLine,
};
