const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const { buildDocxResult } = require('../electron/services/exportService.cjs');
const { cloneDefaultBidExportTemplate } = require('../electron/services/bidTemplateFormat.cjs');

function paragraphFor(xml, text) {
  return [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
    .find(([paragraph]) => paragraph.includes(`<w:t xml:space="preserve">${text}</w:t>`))?.[0] || '';
}

async function main() {
  const config = cloneDefaultBidExportTemplate();
  config.body_text.first_line_indent_chars = 2;
  config.body_text.spacing_before_pt = 6;
  config.body_text.spacing_after_pt = 10;
  config.headings[1].first_line_indent_chars = 1.5;
  const result = await buildDocxResult({
    documentScope: 'bid',
    exportMode: 'custom-template',
    exportFormat: config,
    project_name: '模板验收',
    outline: [{ id: '1', title: '章节', children: [{ id: '1.1', title: '子节', content: '正文第一段。\n\n## 内嵌标题\n\n正文第二段。\n\n- 列表正文' }] }],
  });
  const zip = new AdmZip(result.buffer);
  const document = zip.readAsText('word/document.xml');
  const styles = zip.readAsText('word/styles.xml');
  assert.match(styles, /<w:ind[^>]*w:firstLine="480"[^>]*w:firstLineChars="200"/);
  assert.match(paragraphFor(document, '正文第一段。'), /<w:ind[^>]*w:left="0"[^>]*w:firstLineChars="200"/);
  assert.match(paragraphFor(document, '正文第一段。'), /<w:spacing[^>]*w:after="200"[^>]*w:before="120"/);
  assert.match(paragraphFor(document, '子节'), /<w:ind[^>]*w:firstLineChars="150"/);
  assert.match(paragraphFor(document, '内嵌标题'), /<w:ind[^>]*w:firstLineChars="150"/);
  assert.match(paragraphFor(document, '正文第二段。'), /<w:ind[^>]*w:firstLineChars="200"/);
  assert.match(paragraphFor(document, '列表正文'), /<w:ind[^>]*w:leftChars="200"[^>]*w:hangingChars="100"/);
  console.log('招投标模板正文和标题字符缩进、段间距验证通过');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
