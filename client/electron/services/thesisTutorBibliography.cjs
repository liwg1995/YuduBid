const fs = require('node:fs');
const path = require('node:path');
const iconv = require('iconv-lite');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 200;

function decodeBibliographyFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('题录文件超过 2 MB，请分批导入');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return iconv.decode(bytes, 'utf16-le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return iconv.decode(bytes, 'utf16-be');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return iconv.decode(bytes, 'gb18030');
  }
}

function first(fields, ...keys) {
  for (const key of keys) {
    const value = fields[key];
    if (Array.isArray(value) && value.length) return value[0];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function yearOf(value) {
  return String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
}

function cleanDoi(value) {
  return String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[.,;\s]+$/, '');
}

function candidate(fields, format) {
  const title = first(fields, 'title', 'TI', 'T1', 'CT');
  if (!title) return null;
  const authors = format === 'ris'
    ? (fields.AU || fields.A1 || []).join(', ')
    : first(fields, 'author').replace(/\s+and\s+/gi, ', ');
  return {
    title: title.slice(0, 260),
    authors: String(authors || '').slice(0, 240),
    year: yearOf(first(fields, 'year', 'date', 'PY', 'Y1', 'DA')),
    source: first(fields, 'journal', 'journaltitle', 'booktitle', 'publisher', 'JO', 'JF', 'T2', 'BT', 'PB').slice(0, 300),
    doi: cleanDoi(first(fields, 'doi', 'DO')).slice(0, 200),
    keywords: (format === 'ris' ? (fields.KW || []).join(', ') : first(fields, 'keywords')).slice(0, 500),
    summary: first(fields, 'abstract', 'AB', 'N2').slice(0, 5000),
  };
}

function parseRis(text) {
  const entries = [];
  let fields = null;
  let previousKey = '';
  const finish = () => {
    if (fields) entries.push(candidate(fields, 'ris'));
    fields = null;
    previousKey = '';
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9])\s*-\s*(.*)$/);
    if (match) {
      const [, key, raw] = match;
      if (key === 'TY') { finish(); fields = {}; }
      if (!fields) fields = {};
      if (key === 'ER') { finish(); continue; }
      if (key !== 'TY') {
        (fields[key] ||= []).push(raw.trim());
        previousKey = key;
      }
    } else if (fields && previousKey && line.trim()) {
      const values = fields[previousKey];
      values[values.length - 1] += ` ${line.trim()}`;
    }
  }
  finish();
  return entries.filter(Boolean).slice(0, MAX_ENTRIES);
}

function readBalanced(text, start, open, close) {
  if (open === '"') {
    for (let index = start + 1; index < text.length; index += 1) {
      if (text[index] === '\\') { index += 1; continue; }
      if (text[index] === '"') return { value: text.slice(start + 1, index), next: index + 1 };
    }
    return null;
  }
  let depth = 1;
  let index = start + 1;
  let quoted = false;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') { index += 1; continue; }
    if (char === '"' && open !== '"') quoted = !quoted;
    if (quoted) continue;
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return { value: text.slice(start + 1, index), next: index + 1 };
  }
  return null;
}

function parseBibFields(body) {
  const fields = {};
  let index = body.indexOf(',') + 1;
  if (!index) return fields;
  while (index < body.length) {
    while (/[\s,]/.test(body[index] || '') && index < body.length) index += 1;
    const name = body.slice(index).match(/^([\w-]+)\s*=/);
    if (!name) break;
    const key = name[1].toLowerCase();
    index += name[0].length;
    while (/\s/.test(body[index] || '') && index < body.length) index += 1;
    let value = '';
    if (body[index] === '{' || body[index] === '"') {
      const open = body[index];
      const parsed = readBalanced(body, index, open, open === '{' ? '}' : '"');
      if (!parsed) break;
      value = parsed.value;
      index = parsed.next;
    } else {
      const end = body.indexOf(',', index);
      value = body.slice(index, end < 0 ? body.length : end);
      index = end < 0 ? body.length : end;
    }
    fields[key] = value.replace(/\s+/g, ' ').replace(/[{}]/g, '').trim();
  }
  return fields;
}

function parseBibtex(text) {
  const entries = [];
  const source = String(text || '');
  const startPattern = /@([a-z]+)\s*([{(])/gi;
  let match;
  while ((match = startPattern.exec(source)) && entries.length < MAX_ENTRIES) {
    const type = match[1].toLowerCase();
    const open = match[2];
    const parsed = readBalanced(source, startPattern.lastIndex - 1, open, open === '{' ? '}' : ')');
    if (!parsed) break;
    startPattern.lastIndex = parsed.next;
    if (['string', 'preamble', 'comment'].includes(type)) continue;
    const item = candidate(parseBibFields(parsed.value), 'bibtex');
    if (item) entries.push(item);
  }
  return entries;
}

function parseBibliographyFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.ris', '.bib', '.bibtex'].includes(extension)) throw new Error('仅支持 RIS 或 BibTeX 题录文件');
  const format = extension === '.ris' ? 'RIS' : 'BibTeX';
  const text = decodeBibliographyFile(filePath);
  const entries = format === 'RIS' ? parseRis(text) : parseBibtex(text);
  if (!entries.length) throw new Error('未识别到含题名的题录，请确认导出格式为 RIS 或 BibTeX');
  return { format, entries };
}

function bibliographyKey(item) {
  const doi = cleanDoi(item?.doi).toLowerCase();
  if (doi) return `doi:${doi}`;
  const title = String(item?.title || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return title ? `title:${title}:${yearOf(item?.year)}` : '';
}

function selectNewEntries(candidates, existing, limit = 80) {
  const keys = new Set();
  for (const item of existing || []) {
    const doi = cleanDoi(item?.doi).toLowerCase();
    if (doi) keys.add(`doi:${doi}`);
    const title = String(item?.title || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (title) keys.add(`title:${title}:${yearOf(item?.year)}`);
  }
  const added = [];
  let duplicates = 0;
  let overflow = 0;
  for (const item of candidates || []) {
    const key = bibliographyKey(item);
    const titleKey = bibliographyKey({ title: item.title, year: item.year });
    if (!key || keys.has(key) || keys.has(titleKey)) { duplicates += 1; continue; }
    keys.add(key);
    keys.add(titleKey);
    if ((existing?.length || 0) + added.length >= limit) { overflow += 1; continue; }
    added.push(item);
  }
  return { added, duplicates, overflow };
}

module.exports = { parseRis, parseBibtex, parseBibliographyFile, selectNewEntries };
