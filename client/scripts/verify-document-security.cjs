const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const PptxGenJS = require('pptxgenjs');
const { getSafeImageDimensions } = require('../electron/utils/safeImageDimensions.cjs');

function createMinimalPdf(text) {
  const safeText = String(text).replace(/([\\()])/g, '\\$1');
  const content = `BT /F1 18 Tf 72 720 Td (${safeText}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

function verifySafeImageDimensions() {
  const canvas = createCanvas(320, 180);
  const png = canvas.toBuffer('image/png');
  const jpeg = canvas.toBuffer('image/jpeg');
  const gif = Buffer.from('47494638396102000300', 'hex');

  assert.deepEqual(getSafeImageDimensions(png), { width: 320, height: 180, type: 'png' });
  assert.deepEqual(getSafeImageDimensions(jpeg), { width: 320, height: 180, type: 'jpg' });
  assert.deepEqual(getSafeImageDimensions(gif), { width: 2, height: 3, type: 'gif' });

  for (const blocked of [
    Buffer.from('69636e7300000008', 'hex'),
    Buffer.from('ff0a0000', 'hex'),
    Buffer.from('000000186674797068656963', 'hex'),
  ]) {
    assert.throws(() => getSafeImageDimensions(blocked), /出于安全原因不解析/);
  }
  assert.throws(() => getSafeImageDimensions(Buffer.alloc(2048), { maxBytes: 1024 }), /超过安全解析上限/);
  return png;
}

async function verifyPdfConversion(tempDir) {
  const pdfPath = path.join(tempDir, '安全验证.pdf');
  fs.writeFileSync(pdfPath, createMinimalPdf('Security PDF Test'));
  const { convertPathToMarkdown } = await import('../electron/services/doc2markdown/convert.mjs');
  const markdown = await convertPathToMarkdown(pdfPath, { includeImages: false });
  assert.match(markdown, /Security PDF Test/);
  return { pdfPath, markdownLength: markdown.length };
}

async function verifyPptxExport(tempDir, png) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.addText('安全依赖验证', { x: 0.8, y: 0.6, w: 5, h: 0.5 });
  slide.addImage({ data: `data:image/png;base64,${png.toString('base64')}`, x: 0.8, y: 1.4, w: 3.2, h: 1.8 });
  const pptxPath = path.join(tempDir, '安全依赖验证.pptx');
  await pptx.writeFile({ fileName: pptxPath });
  assert.ok(fs.statSync(pptxPath).size > 1000, 'PPTX 产物大小异常');
  return { pptxPath, size: fs.statSync(pptxPath).size };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-document-security-'));
  try {
    const png = verifySafeImageDimensions();
    const pdf = await verifyPdfConversion(tempDir);
    const pptx = await verifyPptxExport(tempDir, png);
    console.log('[document-security-verify] passed');
    console.log(JSON.stringify({
      pdfjsVersion: require('pdfjs-dist/package.json').version,
      canvasVersion: require('@napi-rs/canvas/package.json').version,
      safeImagePackageVersion: require('image-size/package.json').version,
      pdf,
      pptx,
    }, null, 2));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[document-security-verify] failed');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
