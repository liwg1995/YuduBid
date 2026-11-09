const AdmZip = require('adm-zip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const LEGACY_NAME = /易标|yibiao/gi;
const NEUTRAL_NAME = '投标工具';

function neutralWordText(value) {
  return String(value ?? '').replace(LEGACY_NAME, NEUTRAL_NAME);
}

function neutralizeWordPackage(zip) {
  for (const entry of zip.getEntries()) {
    if (!/^(?:word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml|docProps\/core\.xml)$/.test(entry.entryName)) continue;
    const xml = zip.readAsText(entry, 'utf8');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    let changed = false;
    const replaceNode = (node) => {
      const text = neutralWordText(node.data);
      if (text === node.data) return;
      node.data = node.nodeValue = text;
      changed = true;
    };
    for (const paragraph of Array.from(doc.getElementsByTagNameNS(WORD, 'p'))) {
      const spans = [];
      let text = '';
      for (const element of Array.from(paragraph.getElementsByTagNameNS(WORD, 't'))) {
        let parent = element.parentNode;
        while (parent && !(parent.namespaceURI === WORD && parent.localName === 'p')) parent = parent.parentNode;
        if (parent !== paragraph) continue;
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType !== 3) continue;
          spans.push({ node, start: text.length, end: text.length + node.data.length });
          text += node.data;
        }
      }
      for (const match of [...text.matchAll(LEGACY_NAME)].reverse()) {
        const start = match.index;
        const end = start + match[0].length;
        for (const span of spans) {
          if (span.end <= start || span.start >= end) continue;
          const value = span.node.data.slice(0, Math.max(0, start - span.start))
            + (span.start <= start ? NEUTRAL_NAME : '')
            + span.node.data.slice(Math.min(span.end, end) - span.start);
          span.node.data = span.node.nodeValue = value;
        }
        changed = true;
      }
    }

    for (const element of Array.from(doc.getElementsByTagName('*'))) {
      for (const attr of Array.from(element.attributes)) {
        if (!['descr', 'title', 'alt'].includes(attr.localName)) continue;
        const text = neutralWordText(attr.value);
        if (text === attr.value) continue;
        element.setAttributeNS(attr.namespaceURI, attr.name, text);
        changed = true;
      }
      if (entry.entryName === 'docProps/core.xml' || (element.namespaceURI === WORD && element.localName === 'delText')) {
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType === 3) replaceNode(node);
        }
      }
    }
    if (changed) zip.updateFile(entry.entryName, Buffer.from(new XMLSerializer().serializeToString(doc), 'utf8'));
  }
}

function neutralizeWordBuffer(buffer) {
  const zip = new AdmZip(buffer);
  neutralizeWordPackage(zip);
  return zip.toBuffer();
}

module.exports = { neutralWordText, neutralizeWordBuffer, neutralizeWordPackage };
