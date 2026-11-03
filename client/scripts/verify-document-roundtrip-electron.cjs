const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, dialog } = require('electron');
const { Document, Header, Footer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Packer, HeadingLevel } = require('docx');
const { createCanvas } = require('@napi-rs/canvas');
const AdmZip = require('adm-zip');
const { createFileService } = require('../electron/services/fileService.cjs');
const { createFeasibilityReportStoreRouter } = require('../electron/services/feasibilityReportStoreRouter.cjs');
const { buildDocxResult } = require('../electron/services/exportService.cjs');
const { findFeasibilityImportedImage } = require('../electron/utils/importedImages.cjs');

const keepOutput = Boolean(process.env.DOCUMENT_ROUNDTRIP_OUTPUT_DIR);
const root = keepOutput ? path.resolve(process.env.DOCUMENT_ROUNDTRIP_OUTPUT_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-document-roundtrip-'));
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, '中文工作区'));

async function createDocx(inputDir) {
  const canvas = createCanvas(320, 160);
  const context = canvas.getContext('2d');
  context.fillStyle = '#e6f4ff'; context.fillRect(0, 0, 320, 160);
  context.fillStyle = '#1677ff'; context.fillRect(20, 20, 280, 120);
  const image = canvas.toBuffer('image/png');
  const cell = (text, options = {}) => new TableCell({ children: [new Paragraph(text)], ...options });
  const document = new Document({ sections: [{
    headers: { default: new Header({ children: [new Paragraph('合成项目资料页眉')] }) },
    footers: { default: new Footer({ children: [new Paragraph('隔离测试资料')] }) },
    children: [
      new Paragraph({ text: '园区建设项目支撑材料', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun('正文中文内容，'), new TextRun({ text: '关键指标需要保留。', bold: true })] }),
      new Table({ rows: [new TableRow({ children: [cell('投资指标', { columnSpan: 2 })] }), new TableRow({ children: [cell('总投资'), new TableCell({ children: [new Paragraph('12000 万元'), new Paragraph('资金口径需核验')] })] }), new TableRow({ children: [cell('建设期'), cell('2 年')] })] }),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: image, transformation: { width: 320, height: 160 }, altText: { title: '合成架构图', description: '仅用于图像保留验收', name: '合成架构图' } })] }),
      new Paragraph({ text: '第二页说明', heading: HeadingLevel.HEADING_2, pageBreakBefore: true }),
      new Paragraph('实施安排、责任边界与验收节点均为合成内容。'),
    ],
  }] });
  const file = path.join(inputDir, '中文表格与图片资料.docx');
  fs.writeFileSync(file, await Packer.toBuffer(document));
  return file;
}

function createPdf(inputDir, textLayer = true) {
  // 高于本地解析器默认的 80px 装饰图过滤阈值。
  const canvas = createCanvas(320, 160); const context = canvas.getContext('2d');
  context.fillStyle = '#1677ff'; context.fillRect(0, 0, 320, 160);
  const jpeg = canvas.toBuffer('image/jpeg');
  const stream = (data, attributes = '') => Buffer.concat([Buffer.from(`<< /Length ${data.length} ${attributes} >>\nstream\n`), data, Buffer.from('\nendstream')]);
  const imageCommands = 'q 160 0 0 80 72 530 cm /Im1 Do Q';
  const text = (x, y, value) => `BT /F1 14 Tf ${x} ${y} Td (${value}) Tj ET`;
  const page1 = [text(72, 750, 'Synthetic feasibility PDF'), '72 650 328 80 re S 240 650 m 240 730 l S 72 690 m 400 690 l S', text(80, 704, 'Indicator'), text(248, 704, 'Value'), text(80, 666, 'Investment'), text(248, 666, '12000'), imageCommands].join('\n');
  const page2 = [text(72, 750, 'Second page supporting material'), text(72, 710, 'Construction period: 2 years.')].join('\n');
  const page = (contentId) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents ${contentId} 0 R >>`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [6 0 R 8 0 R] /Count 2 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', stream(jpeg, '/Type /XObject /Subtype /Image /Width 320 /Height 160 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'), stream(Buffer.from(textLayer ? page1 : imageCommands)), page(5), stream(Buffer.from(textLayer ? page2 : imageCommands)), page(7)];
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0]; let length = parts[0].length;
  objects.forEach((object, index) => { offsets.push(length); const data = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object), Buffer.from('\nendobj\n')]); parts.push(data); length += data.length; });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  const file = path.join(inputDir, textLayer ? '多页表格图片资料.pdf' : '无文字层资料.pdf'); fs.writeFileSync(file, Buffer.concat(parts)); return file;
}

async function run() {
  const originalDialog = dialog.showOpenDialog;
  const inputDir = path.join(root, '输入资料'); fs.mkdirSync(inputDir, { recursive: true });
  try {
    const docxFile = await createDocx(inputDir);
    const fileService = createFileService({ app, configStore: { load: () => ({ file_parser: { provider: 'local' } }) } });
    const store = createFeasibilityReportStoreRouter({ app, fileService });
    const { project } = store.createProject({ projectName: '复杂资料隔离验收' });
    const projectId = project.id;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [docxFile] });
    const imported = await store.importSources({ projectId });
    assert.equal(imported.success, true, imported.message);
    assert.equal(imported.state.sourceFiles.length, 1);
    const markdown = store.readSourceMarkdown({ projectId, sourceId: imported.importedSourceIds[0] });
    for (const value of ['园区建设项目支撑材料', '总投资', '12000 万元', '第二页说明']) assert.ok(markdown.includes(value), `解析后缺少内容：${value}`);
    assert.ok(markdown.includes('yibiao-asset://imported-images/'), '应保留文档图片');
    assert.ok(markdown.includes('<table') || markdown.includes('|'), '应保留表格');
    fs.writeFileSync(path.join(root, '解析结果.md'), markdown, 'utf8');
    const imageUrl = markdown.match(/yibiao-asset:\/\/imported-images\/[^\s)"<>]+/)[0];
    const relativePath = decodeURIComponent(new URL(imageUrl).pathname.replace(/^\/+/, ''));
    const globalPath = path.join(app.getPath('userData'), 'workspace', 'imported-images', relativePath);
    const scopedPath = path.join(app.getPath('userData'), 'feasibility-report-projects', projectId, 'workspace', 'imported-images', relativePath);
    console.log('[document-roundtrip] image lookup', JSON.stringify({ globalExists: fs.existsSync(globalPath), scopedExists: fs.existsSync(scopedPath) }));
    assert.ok(fs.existsSync(scopedPath));
    assert.equal(findFeasibilityImportedImage(app, relativePath), scopedPath);
    assert.equal(findFeasibilityImportedImage(app, `feasibility-report-source-x/../../workspace/yibiao.sqlite`), null);
    assert.equal(findFeasibilityImportedImage(app, 'other-feature/image.png'), null);
    const result = await buildDocxResult({ documentProfile: 'feasibility-report', project_name: project.name, outline: [{ id: 'roundtrip', title: '资料往返验收', content: markdown }] });
    assert.deepEqual(result.warnings, [], '导入图片应能再次导出，不能显示图片丢失警告');
    const zip = new AdmZip(result.buffer);
    const media = zip.getEntries().filter((entry) => /^word\/media\/.+/.test(entry.entryName));
    assert.ok(media.length >= 1, '再次导出的 Word 必须包含原始图片');
    const xml = zip.readAsText('word/document.xml');
    assert.match(xml, /<w:gridSpan w:val="2"/, '表格横向合并必须保留');
    const investmentCell = [...xml.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].find(([value]) => value.includes('12000 万元'))?.[0] || '';
    assert.match(investmentCell, /12000 万元[\s\S]*?<\/w:p>[\s\S]*?<w:p>[\s\S]*?资金口径需核验/, '表格单元格内的独立段落不能合并');
    fs.writeFileSync(path.join(root, '往返导出.docx'), result.buffer);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [createPdf(inputDir)] });
    const pdfResult = await store.importSources({ projectId });
    assert.equal(pdfResult.success, true, pdfResult.message);
    const pdfMarkdown = store.readSourceMarkdown({ projectId, sourceId: pdfResult.importedSourceIds[0] });
    fs.writeFileSync(path.join(root, 'PDF解析结果.md'), pdfMarkdown, 'utf8');
    for (const value of ['Synthetic feasibility PDF', 'Second page supporting material', 'Investment', '12000']) assert.ok(pdfMarkdown.includes(value), `PDF 解析缺少内容：${value}`);
    assert.ok(pdfMarkdown.includes('yibiao-asset://imported-images/'));
    assert.ok(pdfMarkdown.includes('|'), 'PDF 网格表格应转换为 Markdown 表格');

    store.saveAnalysis({ projectId, markdown: '本批次失败时必须保留的原分析' });
    store.saveOutline({ projectId, outlineData: { outline: [{ id: 'existing', title: '原目录' }] } });
    store.saveKeyParameters({ projectId, markdown: '原参数' });
    store.saveChapterContent({ projectId, nodeId: 'existing', content: '原正文' });
    const before = store.loadState({ projectId });
    const assetDir = path.join(app.getPath('userData'), 'feasibility-report-projects', projectId, 'workspace', 'imported-images');
    const beforeAssets = fs.readdirSync(assetDir).sort();
    const broken = path.join(inputDir, '损坏资料.docx'); fs.writeFileSync(broken, 'not a DOCX');
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [docxFile, broken] });
    const failed = await store.importSources({ projectId });
    assert.equal(failed.success, false); assert.match(failed.message, /损坏资料/);
    assert.deepEqual(store.loadState({ projectId }), before, '混合批次失败应保留原资料及全部下游成果');
    assert.deepEqual(fs.readdirSync(assetDir).sort(), beforeAssets, '失败批次不得残留新增图片');
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [createPdf(inputDir, false)] });
    const scanned = await store.importSources({ projectId });
    assert.equal(scanned.success, false); assert.match(scanned.message, /中文字层/); assert.match(scanned.message, /OCR/);
    assert.deepEqual(store.loadState({ projectId }), before);
    assert.deepEqual(fs.readdirSync(assetDir).sort(), beforeAssets);
    console.log('[document-roundtrip] 中文 DOCX 表格/段落/图片往返、多页 PDF 表格/图片及失败批次回滚验证通过。');
  } finally {
    dialog.showOpenDialog = originalDialog;
  }
}

app.whenReady().then(run).then(() => app.quit()).catch((error) => {
  console.error(error?.stack || String(error));
  app.exit(1);
});
app.on('quit', () => { if (!keepOutput) fs.rmSync(root, { recursive: true, force: true }); });
