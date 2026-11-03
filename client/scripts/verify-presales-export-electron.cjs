const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, dialog } = require('electron');
const AdmZip = require('adm-zip');
const { createPresalesWorkbenchService } = require('../electron/services/presalesWorkbenchService.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-presales-export-'));
app.setPath('userData', path.join(root, '中文用户数据'));

async function run() {
  const outputDir = path.join(root, '中文导出');
  fs.mkdirSync(outputDir);
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [outputDir] });
  try {
    const service = createPresalesWorkbenchService({
      app,
      aiService: { chat: () => { throw new Error('离线导出验收不允许调用模型'); } },
    });
    service.createProject({ projectName: '中文售前导出验收' });
    service.saveProfile({ projectName: '中文售前导出验收', customerName: '合成客户', keyBackground: '仅用于隔离验收的合成资料。' });
    service.savePresentationResult({ markdown: '# 合成方案汇报\n\n## 第1页：建设目标\n核心观点：建设统一服务体系。\n页面内容要点：\n- 提升公共服务能力。\n- 统一数据口径。\n\n## 第2页：实施计划\n核心观点：分阶段交付。\n页面内容要点：\n- 需求核验。\n- 分期实施与验收。' });
    const result = await service.exportPresentationPptx({ formats: ['pptx', 'html'], useAiVisuals: false });
    assert.equal(result.success, true);
    assert.equal(result.outputs.length, 2);
    const pptxPath = result.outputs.find((item) => item.type === 'pptx').filePath;
    const htmlPath = result.outputs.find((item) => item.type === 'html').filePath;
    const zip = new AdmZip(pptxPath);
    const slides = zip.getEntries().filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName));
    assert.ok(slides.length >= 4, 'PPTX 应包含封面、内容页及结束页');
    const text = slides.map((entry) => entry.getData().toString('utf8')).join('\n');
    for (const value of ['中文售前导出验收', '建设目标', '实施计划', '提升公共服务能力']) assert.ok(text.includes(value), `PPTX 缺少已保存内容：${value}`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('建设目标') && html.includes('实施计划'));
    const restored = createPresalesWorkbenchService({ app }).loadState();
    assert.equal(restored.exportRecords.filter((item) => ['pptx', 'html'].includes(item.type)).length, 2);
    const fileCount = fs.readdirSync(outputDir).length;
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    const canceled = await service.exportPresentationPptx({ formats: ['pptx'], useAiVisuals: false });
    assert.equal(canceled.canceled, true);
    assert.equal(canceled.success, false);
    assert.equal(fs.readdirSync(outputDir).length, fileCount, '取消导出不应新增文件');
    assert.equal(service.loadState().exportRecords.length, restored.exportRecords.length);
    console.log('[presales-export-electron] 中文路径 PPTX/HTML、已保存内容、导出记录持久化和取消导出验证通过。');
    console.log(JSON.stringify({ slideCount: slides.length, pptxBytes: fs.statSync(pptxPath).size, htmlBytes: fs.statSync(htmlPath).size }));
  } finally {
    dialog.showOpenDialog = originalDialog;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

app.whenReady().then(run).then(() => app.exit(0)).catch((error) => {
  console.error(error?.stack || String(error));
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(1);
});
