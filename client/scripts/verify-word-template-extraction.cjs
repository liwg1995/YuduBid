const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require('docx');
const { extractWordTemplate } = require('../electron/services/wordTemplateExtractor.cjs');

(async () => {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: '技术方案', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun('项目名称：{{项目名称}}')] }),
    new Paragraph({ children: [new TextRun('签字：________')] }),
  ] }] });
  const buffer = await Packer.toBuffer(doc);
  const result = extractWordTemplate(buffer, '投标模板.docx');
  assert.equal(result.manifest.chapters[0]?.title, '技术方案');
  assert(result.manifest.fields.some((field) => field.name === '项目名称' && field.fill_by === 'ai'));
  assert(result.manifest.fields.some((field) => field.fill_by === 'manual'));
  assert.throws(() => extractWordTemplate(Buffer.from('invalid'), 'invalid.docx'));
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-template-review-'));
  try {
    const filePath = path.join(temporaryDir, '投标模板.docx');
    fs.writeFileSync(filePath, buffer);
    const workerResult = await new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, '../electron/services/wordTemplateWorker.cjs'), { workerData: { filePath, fileName: path.basename(filePath) } });
      worker.once('message', (message) => message.error ? reject(new Error(message.error)) : resolve(message.result));
      worker.once('error', reject);
    });
    assert.equal(workerResult.manifest.chapters[0]?.title, '技术方案');
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
  console.log('Word 模板标题、待填字段和无效文档校验通过');
})().catch((error) => { console.error(error); process.exitCode = 1; });
