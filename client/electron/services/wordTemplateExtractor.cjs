const AdmZip = require('adm-zip');
const path = require('node:path');
const { cloneDefaultBidExportTemplate, SIZE_TO_PT } = require('./bidTemplateFormat.cjs');

const MAX_XML_BYTES = 30 * 1024 * 1024;

function decodeXml(value) {
  return String(value || '').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (_match, numeric, named) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()] || '';
  });
}

function readXml(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return '';
  if (entry.header.size > MAX_XML_BYTES) throw new Error('Word 文档 XML 超过安全大小限制');
  const data = entry.getData();
  if (data.length > MAX_XML_BYTES) throw new Error('Word 文档 XML 超过安全大小限制');
  return data.toString('utf8');
}

function nearestChineseSize(halfPoints, fallback) {
  const points = Number(halfPoints) / 2;
  if (!Number.isFinite(points) || points <= 0) return fallback;
  return Object.entries(SIZE_TO_PT).reduce((best, next) => Math.abs(next[1] - points) < Math.abs(SIZE_TO_PT[best] - points) ? next[0] : best, fallback);
}

function readStyle(stylesXml, styleId, fallback) {
  const escaped = styleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`<w:style\\b[^>]*w:styleId="${escaped}"[^>]*>[\\s\\S]*?<\\/w:style>`).exec(stylesXml)?.[0] || '';
  if (!block) return fallback;
  const font = /<w:rFonts\b[^>]*(?:w:eastAsia|w:ascii)="([^"]+)"/.exec(block)?.[1];
  const size = /<w:sz\b[^>]*w:val="(\d+)"/.exec(block)?.[1];
  return {
    ...fallback,
    ...(font ? { font: decodeXml(font) } : {}),
    ...(size ? { size: nearestChineseSize(size, fallback.size) } : {}),
    ...(block.includes('<w:b/>') || /<w:b\b[^>]*w:val="(?:1|true)"/.test(block) ? { bold: true } : {}),
  };
}

function paragraphText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join('').trim();
}

function extractWordTemplate(buffer, fileName = 'Word 模板') {
  const zip = new AdmZip(buffer);
  const documentXml = readXml(zip, 'word/document.xml');
  if (!documentXml) throw new Error('不是有效的 DOCX 文档');
  const stylesXml = readXml(zip, 'word/styles.xml');
  const config = cloneDefaultBidExportTemplate();
  config.template_name = `${path.parse(fileName).name}（Word 提取）`.slice(0, 80);
  config.body_text = readStyle(stylesXml, 'Normal', config.body_text);
  config.headings = config.headings.map((style, index) => readStyle(stylesXml, `Heading${index + 1}`, style));

  const chapters = [];
  const fields = [];
  const seenFields = new Set();
  const paragraphs = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];
  for (const [index, match] of paragraphs.entries()) {
    const xml = match[0];
    const text = paragraphText(xml);
    if (!text) continue;
    const heading = /<w:pStyle\b[^>]*w:val="(?:Heading|heading)([1-9])"/.exec(xml);
    if (heading && chapters.length < 300) chapters.push({ level: Number(heading[1]), title: text.slice(0, 160), paragraph: index + 1 });
    const candidates = [...text.matchAll(/\{\{\s*([^{}]{1,60})\s*\}\}|【\s*([^【】]{1,60})\s*】|([_＿]{3,})/g)];
    if (xml.includes('<w:sdt')) {
      const controlName = /<w:(?:alias|tag)\b[^>]*w:val="([^"]+)"/.exec(xml)?.[1];
      if (controlName) candidates.push([controlName, decodeXml(controlName), '', '']);
    }
    for (const candidate of candidates) {
      if (fields.length >= 300) break;
      const name = (candidate[1] || candidate[2] || `空白处 ${index + 1}`).trim();
      const key = `${index}:${name}`;
      if (seenFields.has(key)) continue;
      seenFields.add(key);
      fields.push({ name, paragraph: index + 1, context: text.slice(0, 160), fill_by: /签字|签章|盖章|手印|公章|签名/.test(name + text) ? 'manual' : 'ai' });
    }
  }
  if (!chapters.length && !fields.length) throw new Error('Word 文档中未识别到标题或待填字段，请检查是否使用了 Word 标题样式或占位符');
  return { config, manifest: { source_name: path.basename(fileName), chapters, fields } };
}

module.exports = { extractWordTemplate };
