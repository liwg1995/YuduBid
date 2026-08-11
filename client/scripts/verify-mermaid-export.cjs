const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { createLocalImageRenderService } = require('../electron/services/localImageRenderService.cjs');

const samples = [
  {
    name: 'sequence',
    code: `sequenceDiagram
      participant U as 用户
      participant S as 业务系统
      participant W as 工作节点
      U->>S: 提交处理请求
      S->>W: 执行任务
      W-->>S: 返回执行结果
      S-->>U: 返回成功状态`,
  },
  {
    name: 'flowchart',
    code: `flowchart TD
      A["需求分析"] --> B["方案设计"]
      B --> C["开发实施"]
      C --> D["测试验收"]
      D --> E["上线运行"]`,
  },
];

async function analyzePng(png) {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let opaquePixels = 0;
  let blackPixels = 0;
  let foregroundPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 240) continue;
    opaquePixels += 1;
    if (pixels[index] < 8 && pixels[index + 1] < 8 && pixels[index + 2] < 8) {
      blackPixels += 1;
    }
    if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) {
      foregroundPixels += 1;
    }
  }
  return {
    width: image.width,
    height: image.height,
    blackRatio: opaquePixels ? blackPixels / opaquePixels : 1,
    foregroundRatio: opaquePixels ? foregroundPixels / opaquePixels : 0,
  };
}

async function verifyMermaidExport() {
  await app.whenReady();
  const renderService = createLocalImageRenderService();
  try {
    const results = [];
    const outputDir = String(process.env.MERMAID_VERIFY_OUTPUT_DIR || '').trim();
    if (outputDir) fs.mkdirSync(outputDir, { recursive: true });
    for (let index = 0; index < 12; index += 1) {
      const sample = samples[index % samples.length];
      const dataUrl = await renderService.renderMermaidToDataUrl(sample.code);
      assert.match(dataUrl, /^data:image\/png;base64,/, 'Mermaid 导出必须直接使用 Chromium PNG');
      const png = Buffer.from(dataUrl.split(',')[1], 'base64');
      const metrics = await analyzePng(png);
      if (outputDir) {
        fs.writeFileSync(path.join(outputDir, `${sample.name}.png`), png);
        fs.writeFileSync(path.join(outputDir, `${sample.name}.svg`), await renderService.renderMermaidToSvg(sample.code), 'utf8');
      }
      assert.ok(metrics.blackRatio < 0.08, `Mermaid PNG 黑色像素占比异常：${(metrics.blackRatio * 100).toFixed(2)}%`);
      assert.ok(metrics.foregroundRatio > 0.005, `Mermaid PNG 前景像素占比异常：${(metrics.foregroundRatio * 100).toFixed(2)}%`);
      if (index >= 10) {
        results.push({ name: sample.name, ...metrics, png });
      }
    }
    const sequenceSvg = await renderService.renderMermaidToSvg(samples.find((sample) => sample.name === 'sequence').code);
    assert.doesNotMatch(sequenceSvg, /text\.actor&gt;tspan/, '时序图参与者文字选择器不能保留 HTML 转义');
    assert.match(sequenceSvg, /text\.actor>tspan/, '时序图参与者文字必须应用可见前景色');

    console.log('[mermaid-export-verify] passed', JSON.stringify(results.map(({ png: _png, blackRatio, foregroundRatio, ...result }) => ({
      ...result,
      blackRatio: Number(blackRatio.toFixed(4)),
      foregroundRatio: Number(foregroundRatio.toFixed(4)),
    }))));
  } finally {
    renderService.dispose();
    app.quit();
  }
}

verifyMermaidExport().catch((error) => {
  console.error('[mermaid-export-verify] failed');
  console.error(error?.stack || error?.message || String(error));
  app.exit(1);
});
