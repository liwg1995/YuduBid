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

const supportedDiagramSamples = [
  ['graph', 'graph TD\nA[输入] --> B[输出]'],
  ['mindmap', 'mindmap\n  root((论文主题))\n    第一章\n    第二章'],
  ['gantt', 'gantt\n  title 项目计划\n  dateFormat YYYY-MM-DD\n  section 实施\n  开发 :a1, 2026-08-01, 3d'],
  ['timeline', 'timeline\n  title 项目阶段\n  2026-08 : 启动\n  2026-09 : 验收'],
  ['journey', 'journey\n  title 用户旅程\n  section 使用\n    提交需求: 5: 用户\n    查看结果: 4: 用户'],
  ['quadrantChart', 'quadrantChart\n  title 优先级\n  x-axis 低投入 --> 高投入\n  y-axis 低收益 --> 高收益\n  优化项: [0.3, 0.8]'],
  ['pie', 'pie title 工作占比\n  "开发" : 60\n  "测试" : 40'],
  ['xychart-beta', 'xychart-beta\n  title "进度"\n  x-axis ["一月", "二月", "三月"]\n  y-axis "完成率" 0 --> 100\n  line [20, 55, 90]'],
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

    for (const [name, code] of supportedDiagramSamples) {
      const svg = await renderService.renderMermaidToSvg(code);
      assert.match(svg, /^<svg[\s>]/, `${name} 必须返回 SVG`);
      assert.ok(svg.length > 200, `${name} SVG 内容异常`);
    }

    console.log('[mermaid-export-verify] passed', JSON.stringify({
      pngSamples: results.map(({ png: _png, blackRatio, foregroundRatio, ...result }) => ({
        ...result,
        blackRatio: Number(blackRatio.toFixed(4)),
        foregroundRatio: Number(foregroundRatio.toFixed(4)),
      })),
      diagramTypes: ['flowchart', 'sequenceDiagram', ...supportedDiagramSamples.map(([name]) => name)],
    }));
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
