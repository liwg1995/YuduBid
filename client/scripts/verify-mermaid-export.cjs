const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const AdmZip = require('adm-zip');
const { createLocalImageRenderService } = require('../electron/services/localImageRenderService.cjs');
const { buildDocxResult, normalizeMermaidForExport } = require('../electron/services/exportService.cjs');

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

    const wideCode = `flowchart LR\n${Array.from({ length: 24 }, (_, index) => (
      `N${index}["节点 ${index + 1}"]${index < 23 ? ` --> N${index + 1}` : ''}`
    )).join('\n')}`;
    const wideDataUrl = await renderService.renderMermaidToDataUrl(wideCode);
    const wideMetrics = await analyzePng(Buffer.from(wideDataUrl.split(',')[1], 'base64'));
    assert.ok(wideMetrics.width > 1200, `宽 Mermaid 图不应被 1200px 初始窗口裁切：${wideMetrics.width}px`);
    assert.ok(wideMetrics.foregroundRatio > 0.005, '宽 Mermaid 图必须保留完整前景内容');

    const compactSequence = normalizeMermaidForExport(`sequenceDiagram
      participant A as 拆分器
      participant B as 正文任务
      A->>B: 拆分各组 loop 每组正文 B-->>A: 返回结果 end`);
    assert.match(compactSequence, /\n\s*loop 每组正文\n/, '同一行的 loop 必须拆为独立 Mermaid 语句');
    assert.match(compactSequence, /\n\s*end\s*$/m, '同一行的 end 必须拆为独立 Mermaid 语句');
    const repairedSvg = await renderService.renderMermaidToSvg(compactSequence);
    assert.match(repairedSvg, /^<svg[\s>]/, '整理后的紧凑时序图必须能够本地渲染');

    const patentMergeFlowchart = normalizeMermaidForExport(`flowchart TD
      F -.->|两轮提取| F1[第一轮: 完整事实输出]
      F -.->|上下文限制| F2[第二轮: 仅补充内容]
      F1 & F2 --> F3[程序合并形成全局事实列表]`);
    assert.doesNotMatch(patentMergeFlowchart, /F1\s*&\s*F2/, '多起点合流必须展开为兼容的独立连线');
    assert.match(patentMergeFlowchart, /F1 --> F3\[程序合并形成全局事实列表\]/, '第一个合流起点必须保留');
    assert.match(patentMergeFlowchart, /F2 --> F3\[程序合并形成全局事实列表\]/, '第二个合流起点必须保留');
    assert.match(await renderService.renderMermaidToSvg(patentMergeFlowchart), /^<svg[\s>]/, '专利合流图必须能够本地渲染');

    const patentLoopFlowchart = normalizeMermaidForExport(`flowchart TD
      S13 --> S14[按目录层级拆分各组]

      loop 每组正文
        S14 --> S15[合并该组全局事实+招标文件解析信息]
        S15 --> S16[提交AI筛选矛盾目录编号]
        S16 --> S17{本组是否有矛盾?}
      end

      S17 -->|是| S18[收集所有矛盾目录编号]`);
    assert.doesNotMatch(patentLoopFlowchart, /^\s*(?:loop\b|end\s*$)/m, '流程图中误混入的时序图 loop/end 必须移除');
    assert.match(patentLoopFlowchart, /S14 --> S15\[合并该组全局事实\+招标文件解析信息\]/, '循环中的流程节点必须保留');
    assert.match(await renderService.renderMermaidToSvg(patentLoopFlowchart), /^<svg[\s>]/, '专利循环流程图必须能够本地渲染');

    const docxResult = await buildDocxResult({
      project_name: '导出完整性验证',
      outline: [{
        id: 'diagram-export',
        title: '流程图验证',
        content: `\`\`\`text
┌──────────┐    ┌──────────┐
│ Phase 1  │───▶│ Phase 2  │
├──────────┤    ├──────────┤
│ 材料齐备 │    │ 提交申报 │
└──────────┘    └──────────┘
\`\`\`

\`\`\`mermaid
${compactSequence}
\`\`\`

\`\`\`mermaid
${patentMergeFlowchart}
\`\`\`

\`\`\`mermaid
${patentLoopFlowchart}
\`\`\``,
      }],
    });
    assert.deepEqual(docxResult.warnings, [], '有效文本流程图和 Mermaid 不应产生导出警告');
    const docxZip = new AdmZip(docxResult.buffer);
    const mediaEntries = docxZip.getEntries().filter((entry) => entry.entryName.startsWith('word/media/'));
    assert.ok(mediaEntries.length >= 4, '文本流程图和全部 Mermaid 都必须作为完整图片写入 Word');

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
      wideSample: wideMetrics,
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
