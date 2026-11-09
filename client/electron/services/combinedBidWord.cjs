const AdmZip = require('adm-zip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';

function readXml(zip, name) {
  const entry = zip.getEntry(name);
  const fail = () => { throw new Error('Word 文档结构无效'); };
  if (!entry) fail();
  return new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } })
    .parseFromString(zip.readAsText(entry, 'utf8'), 'application/xml');
}

function openBusinessWord(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const doc = readXml(zip, 'word/document.xml');
    if (!doc.getElementsByTagNameNS(WORD, 'body').length) throw new Error('缺少正文');
    readXml(zip, '[Content_Types].xml');
  } catch {
    throw new Error('请选择可打开的商务标 .docx 文件');
  }
}

function combineBidWord(technicalBuffer, businessBuffer) {
  const zip = new AdmZip(technicalBuffer);
  const doc = readXml(zip, 'word/document.xml');
  const relationships = readXml(zip, 'word/_rels/document.xml.rels');
  const types = readXml(zip, '[Content_Types].xml');
  const body = doc.getElementsByTagNameNS(WORD, 'body')[0];
  const section = Array.from(body.childNodes).find((node) => node.namespaceURI === WORD && node.localName === 'sectPr');
  const existingIds = new Set(Array.from(relationships.getElementsByTagNameNS(PACKAGE_REL, 'Relationship'))
    .map((item) => item.getAttribute('Id')));
  let sequence = 1;
  while (existingIds.has(`rIdBusinessVolume${sequence}`) || zip.getEntry(`word/business-volume-${sequence}.docx`)) sequence += 1;
  const id = `rIdBusinessVolume${sequence}`;
  const target = `business-volume-${sequence}.docx`;

  const rel = relationships.createElementNS(PACKAGE_REL, 'Relationship');
  rel.setAttribute('Id', id);
  rel.setAttribute('Type', `${OFFICE_REL}/aFChunk`);
  rel.setAttribute('Target', target);
  relationships.documentElement.appendChild(rel);

  const type = types.createElementNS(TYPES, 'Override');
  type.setAttribute('PartName', `/word/${target}`);
  type.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  types.documentElement.appendChild(type);

  const pageBreak = doc.createElementNS(WORD, 'w:p');
  const run = pageBreak.appendChild(doc.createElementNS(WORD, 'w:r'));
  run.appendChild(doc.createElementNS(WORD, 'w:br')).setAttributeNS(WORD, 'w:type', 'page');
  body.insertBefore(pageBreak, section || null);
  const chunk = doc.createElementNS(WORD, 'w:altChunk');
  chunk.setAttributeNS(OFFICE_REL, 'r:id', id);
  body.insertBefore(chunk, section || null);

  const serializer = new XMLSerializer();
  for (const [name, xml] of [
    ['word/document.xml', doc],
    ['word/_rels/document.xml.rels', relationships],
    ['[Content_Types].xml', types],
  ]) zip.updateFile(name, Buffer.from(serializer.serializeToString(xml), 'utf8'));
  zip.addFile(`word/${target}`, businessBuffer);
  return zip.toBuffer();
}

module.exports = { combineBidWord, openBusinessWord };
