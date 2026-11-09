const AdmZip = require('adm-zip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { neutralWordText } = require('./wordNeutralText.cjs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { Document, ImageRun, Packer, Paragraph, TextRun } = require('docx');

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const GROUP_STYLE_PREFIX = 'CredentialAttachmentGroup_';
const attachmentMarkers = new Map([
  ['附件:企业证书', 'certificateIds'],
  ['附件:人员资料', 'employeeIds'],
  ['附件:项目业绩', 'projectIds'],
  ['附件:证明图片', 'imageIds'],
]);

function attachmentMarkerKey(label) {
  return attachmentMarkers.get(String(label || '').trim().replace(/\s*[:：]\s*/g, ':'));
}

function wordChildren(node, name) {
  return Array.from(node.childNodes).filter((child) =>
    child.namespaceURI === WORD && (!name || child.localName === name));
}

function onlyWordChildren(node, names) {
  return Array.from(node.childNodes).every((child) =>
    (child.nodeType === 3 && !child.nodeValue.trim()) || (child.namespaceURI === WORD && names.includes(child.localName)));
}

function findAttachmentSlots(doc) {
  const slots = new Map();
  for (const paragraph of Array.from(doc.getElementsByTagNameNS(WORD, 'p'))) {
    const text = Array.from(paragraph.getElementsByTagNameNS(WORD, 't'), (node) => node.textContent).join('').trim();
    const markers = [...text.matchAll(/\{\{([^{}]+)\}\}/g)];
    if (!markers.length) continue;
    const parent = paragraph.parentNode;
    const properties = wordChildren(paragraph, 'pPr')[0];
    const valid = markers.length === 1 && markers[0][0] === text
      && parent.namespaceURI === WORD && ['body', 'tc'].includes(parent.localName)
      && onlyWordChildren(paragraph, ['pPr', 'r', 'proofErr'])
      && wordChildren(paragraph, 'r').every((run) => onlyWordChildren(run, ['rPr', 't']))
      && !(properties && wordChildren(properties, 'sectPr').length);
    for (const marker of markers) {
      const key = attachmentMarkerKey(marker[1]);
      if (!key) continue;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push(valid ? paragraph : null);
    }
  }
  return slots;
}

function describeAttachmentSlots(buffer) {
  const slots = findAttachmentSlots(xmlPart(new AdmZip(buffer), 'word/document.xml'));
  return Object.fromEntries([...slots].map(([key, candidates]) => [
    key, candidates.every(Boolean) ? 'positioned' : 'invalid',
  ]));
}

function xmlPart(zip, name) {
  if (!zip.getEntry(name)) throw new Error('商务标缺少 Word 文档结构');
  return new DOMParser().parseFromString(zip.readAsText(name, 'utf8'), 'application/xml');
}

async function appendixImage(data, title) {
  try {
    const image = await loadImage(data);
    const scale = Math.min(1, 480 / image.width, 540 / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    return new ImageRun({ type: 'png', data: canvas.toBuffer('image/png'), transformation: { width, height } });
  } catch {
    throw new Error(`无法读取所选图片：${neutralWordText(title)}。请在资信库中检查图片或换用 PNG、JPEG。`);
  }
}

async function buildAttachmentWord(snapshot, selection, readImage) {
  const children = [];
  const heading = (text, group) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28 })],
    keepNext: true,
    ...(group ? { style: GROUP_STYLE_PREFIX + group } : {}),
  });
  const line = (label, value) => {
    if (String(value || '').trim()) children.push(new Paragraph(`${label}：${value}`));
  };
  children.push(heading('商务标资信附件'));
  const groups = [
    ['人员资料', 'employeeIds', snapshot.employees, 'employeeId', 'name', [
      ['岗位', 'position'], ['职称', 'professionalTitle'], ['专业', 'major'], ['学历', 'education'],
    ]],
    ['项目业绩', 'projectIds', snapshot.projects, 'projectId', 'projectName', [
      ['项目编号', 'projectNumber'], ['客户名称', 'customerName'], ['项目经理', 'projectManager'],
      ['合同金额', 'contractAmount'], ['开始日期', 'startDate'], ['结束日期', 'endDate'],
    ]],
    ['企业证书', 'certificateIds', snapshot.certificates, 'certificateId', 'name', [
      ['证书编号', 'number'], ['有效期起', 'validFrom'], ['有效期止', 'validTo'],
    ]],
  ];
  for (const [label, key, records, idKey, nameKey, fields] of groups) {
    const ids = selection[key];
    if (!ids?.length) continue;
    children.push(heading(label, key));
    for (const id of new Set(ids)) {
      const record = records.find((item) => item[idKey] === id);
      if (!record) throw new Error('所选资信记录已变更，请刷新后重新选择');
      children.push(heading(record[nameKey] || '未命名记录'));
      for (const [fieldLabel, key] of fields) line(fieldLabel, record[key]);
      if (record.validityMode === 'long-term') line('有效期', '长期');
    }
  }
  if (selection.imageIds?.length) {
    children.push(heading('证明材料图片', 'imageIds'));
    for (const id of new Set(selection.imageIds)) {
      const item = snapshot.images.find((image) => image.imageId === id);
      if (!item) throw new Error('所选资信图片已变更，请刷新后重新选择');
      const title = item.customName || item.originalName || '证明材料';
      children.push(heading(title));
      children.push(new Paragraph({ children: [await appendixImage(await readImage(item), title)] }));
    }
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

function appendAttachmentWord(templateBuffer, appendixBuffer) {
  const zip = new AdmZip(templateBuffer);
  const appendix = new AdmZip(appendixBuffer);
  const doc = xmlPart(zip, 'word/document.xml');
  const appendixDoc = xmlPart(appendix, 'word/document.xml');
  const relName = 'word/_rels/document.xml.rels';
  const relationships = zip.getEntry(relName) ? xmlPart(zip, relName)
    : new DOMParser().parseFromString(`<Relationships xmlns="${PACKAGE_REL}"/>`, 'application/xml');
  const types = xmlPart(zip, '[Content_Types].xml');
  const usedIds = new Set(Array.from(relationships.getElementsByTagNameNS(PACKAGE_REL, 'Relationship'), (item) => item.getAttribute('Id')));
  const remapped = new Map();
  let sequence = 0;
  for (const item of Array.from(xmlPart(appendix, relName).getElementsByTagNameNS(PACKAGE_REL, 'Relationship'))) {
    if (item.getAttribute('Type') !== `${OFFICE_REL}/image`) continue;
    do { sequence += 1; } while (usedIds.has(`rIdCredentialImage${sequence}`) || zip.getEntry(`word/media/credential-${sequence}.png`));
    const id = `rIdCredentialImage${sequence}`;
    const target = `media/credential-${sequence}.png`;
    const data = appendix.readFile(`word/${item.getAttribute('Target')}`);
    if (!data) throw new Error('商务标附件图片数据缺失');
    zip.addFile(`word/${target}`, data);
    const relation = relationships.createElementNS(PACKAGE_REL, 'Relationship');
    relation.setAttribute('Id', id);
    relation.setAttribute('Type', `${OFFICE_REL}/image`);
    relation.setAttribute('Target', target);
    relationships.documentElement.appendChild(relation);
    const type = types.createElementNS(TYPES, 'Override');
    type.setAttribute('PartName', `/word/${target}`);
    type.setAttribute('ContentType', 'image/png');
    types.documentElement.appendChild(type);
    remapped.set(item.getAttribute('Id'), id);
  }
  const body = doc.getElementsByTagNameNS(WORD, 'body')[0];
  const appendixBody = appendixDoc.getElementsByTagNameNS(WORD, 'body')[0];
  if (!body || !appendixBody) throw new Error('商务标缺少正文结构');
  const section = Array.from(body.childNodes).find((node) => node.namespaceURI === WORD && node.localName === 'sectPr');
  const slots = findAttachmentSlots(doc);
  const appended = [];
  const usedSlots = new Set();
  let appendixTitle;
  let destinations = [];
  let drawingId = 0;
  const drawingNamespace = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  for (const entry of zip.getEntries()) {
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(entry.entryName)) continue;
    const part = entry.entryName === 'word/document.xml' ? doc : xmlPart(zip, entry.entryName);
    for (const drawing of Array.from(part.getElementsByTagNameNS(drawingNamespace, 'docPr'))) {
      drawingId = Math.max(drawingId, Number(drawing.getAttribute('id')) || 0);
    }
  }
  for (const node of Array.from(appendixBody.childNodes)) {
    if (node.namespaceURI !== WORD || node.localName !== 'p') continue;
    const paragraph = doc.importNode(node, true);
    const properties = wordChildren(paragraph, 'pPr')[0];
    const style = properties && wordChildren(properties, 'pStyle')[0];
    const styleId = style?.getAttributeNS(WORD, 'val') || '';
    if (styleId.startsWith(GROUP_STYLE_PREFIX)) {
      const candidates = slots.get(styleId.slice(GROUP_STYLE_PREFIX.length)) || [];
      if (candidates.some((candidate) => !candidate)) {
        throw new Error('附件位置标记须在正文或表格单元格中单独占一段');
      }
      destinations = candidates;
      for (const slot of destinations) usedSlots.add(slot);
      properties.removeChild(style);
    } else if (!appendixTitle) {
      appendixTitle = paragraph;
      continue;
    }

    // Clone before remapping and scaling so each destination retains its own cell dimensions.
    for (const slot of destinations.length ? destinations : [null]) {
      const placedParagraph = paragraph.cloneNode(true);
      const cell = slot?.parentNode?.localName === 'tc' ? slot.parentNode : null;
      const width = cell && wordChildren(cell, 'tcPr').flatMap((item) => wordChildren(item, 'tcW'))[0];
      const cellWidth = width?.getAttributeNS(WORD, 'type') === 'dxa' ? Number(width.getAttributeNS(WORD, 'w')) : 0;
      const maxImageWidth = cell ? (cellWidth > 360 ? cellWidth - 360 : 600) * 635 : Infinity;
      let imageScale = 1;
      for (const element of Array.from(placedParagraph.getElementsByTagName('*'))) {
        const embed = element.getAttributeNS(OFFICE_REL, 'embed');
        if (remapped.has(embed)) element.setAttributeNS(OFFICE_REL, 'r:embed', remapped.get(embed));
        if (element.namespaceURI === drawingNamespace && element.localName === 'docPr') element.setAttribute('id', String(++drawingId));
        if (element.namespaceURI === drawingNamespace && element.localName === 'extent') {
          const originalWidth = Number(element.getAttribute('cx'));
          if (originalWidth > maxImageWidth) imageScale = maxImageWidth / originalWidth;
        }
        if (imageScale < 1 && (element.localName === 'extent' || element.localName === 'ext')
          && element.hasAttribute('cx') && element.hasAttribute('cy')) {
          for (const axis of ['cx', 'cy']) element.setAttribute(axis, String(Math.round(Number(element.getAttribute(axis)) * imageScale)));
        }
      }
      if (slot) slot.parentNode.insertBefore(placedParagraph, slot);
      else appended.push(placedParagraph);
    }
  }
  for (const marker of usedSlots) marker.parentNode.removeChild(marker);
  if (appended.length) {
    const pageBreak = doc.createElementNS(WORD, 'w:p');
    const run = pageBreak.appendChild(doc.createElementNS(WORD, 'w:r'));
    run.appendChild(doc.createElementNS(WORD, 'w:br')).setAttributeNS(WORD, 'w:type', 'page');
    for (const paragraph of [pageBreak, appendixTitle, ...appended]) {
      if (paragraph) body.insertBefore(paragraph, section || null);
    }
  }
  const serialize = (part) => Buffer.from(new XMLSerializer().serializeToString(part), 'utf8');
  zip.updateFile('word/document.xml', serialize(doc));
  zip.updateFile('[Content_Types].xml', serialize(types));
  zip.addFile(relName, serialize(relationships));
  return zip.toBuffer();
}

module.exports = { appendAttachmentWord, attachmentMarkerKey, buildAttachmentWord, describeAttachmentSlots };
