const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { planHtmlChart, insertHtmlChart, validateHtml, renderHtmlToPng, generateHtmlIllustration } = require('../electron/services/htmlIllustrationService.cjs');

async function main() {
  const content = '网关负责访问控制。数据库与容器节点通过内网连接。\n\n后续说明。';
  const plan = planHtmlChart('系统部署', content);
  assert.equal(plan?.type, '系统拓扑图');
  assert.equal(planHtmlChart('系统部署', '本项目重视质量。'), null);
  assert.match(insertHtmlChart(content, plan, 'local.png', '系统拓扑图'), /连接。\n\n<!-- yibiao-illustration:html -->/);

  const fullDocument = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:1240px;height:827px}.chart{padding:40px;font-size:28px}</style></head><body><svg width="30" height="30"><defs><marker id="arrow"></marker></defs><path marker-end="url(#arrow)" /></svg><div class="chart">系统拓扑图</div></body></html>';
  assert.doesNotMatch(validateHtml(fullDocument), /<meta\b/i);
  assert.throws(() => validateHtml('<script>alert(1)</script>'));
  assert.throws(() => validateHtml('<style>a{background:url(https://example.com/a.png)}</style>'));

  await app.whenReady();
  assert.ok((await renderHtmlToPng(fullDocument)).png.length > 0);
  const bodyStyled = '<body style="display:flex;flex-direction:column;width:1240px;height:827px"><div style="flex:1;display:flex;position:relative"><div style="width:100%;height:100%;padding:40px;font-size:28px">主图模块</div><div style="position:absolute;bottom:0;width:100%;height:240px;background:#edf4fc;padding:40px;font-size:28px">覆盖模块</div></div></body>';
  await assert.rejects(renderHtmlToPng(bodyStyled), /定位元素大面积遮挡/);
  const clipped = '<div style="width:30px;overflow:hidden;white-space:nowrap">这段文字会被容器裁切</div>';
  await assert.rejects(renderHtmlToPng(clipped), /文字被容器裁切/);
  await assert.rejects(renderHtmlToPng('<div style="height:930px;padding:40px;font-size:28px">超高画布</div>'), /内容超出画布/);
  await assert.rejects(renderHtmlToPng('<div style="width:160px;height:50px;border:1px solid #ccc"><span style="display:block;width:300px;font-size:24px;white-space:nowrap">卡片文字明显超出边框</span></div>'), /文字超出卡片边界/);
  await assert.rejects(renderHtmlToPng('<div style="width:700px;height:600px;margin:40px;padding:24px;background:#fff;border:1px solid #ccc;font-size:28px">内容全部挤在顶部</div>'), /近半高度为空白/);
  const smallText = await renderHtmlToPng('<div style="padding:40px;font-size:12px">小字号标签</div>');
  assert.ok(smallText.layoutWarnings.some((warning) => warning.includes('字号不足')));
  assert.ok(smallText.layoutWarnings.some((warning) => warning.includes('画布上半部')));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-html-smoke-'));
  try {
    let calls = 0;
    const goodChart = '<div style="padding:40px;font-size:24px"><h1>系统拓扑图</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:80px"><div style="padding:36px;border:2px solid #9cb6d3;height:450px;display:flex;align-items:center">访问层：网关</div><div style="padding:36px;border:2px solid #9cb6d3;height:450px;display:flex;align-items:center">服务层：容器节点</div><div style="padding:36px;border:2px solid #9cb6d3;height:450px;display:flex;align-items:center">数据层：数据库</div></div></div>';
    const aiService = { chat: async ({ messages }) => {
      calls += 1;
      if (calls === 1) return clipped;
      assert.match(messages[1].content, /未通过本地检查/);
      return goodChart;
    } };
    const result = await generateHtmlIllustration({ app: { getPath: () => tempDir }, aiService, title: '系统部署', content, chartType: '系统拓扑图', itemId: 'smoke' });
    assert.equal(calls, 2);
    assert.ok(fs.statSync(result.file_path).size > 0);
    let qualityCalls = 0;
    const qualityService = { chat: async ({ messages }) => {
      qualityCalls += 1;
      if (qualityCalls === 1) return '<div style="padding:40px;font-size:12px">字号太小</div>';
      assert.match(messages[1].content, /字号不足/);
      return goodChart;
    } };
    await generateHtmlIllustration({ app: { getPath: () => tempDir }, aiService: qualityService, title: '系统部署', content, chartType: '系统拓扑图', itemId: 'quality' });
    assert.equal(qualityCalls, 2, '排版质量警告不能直接接受，必须尝试修复');
    let failedQualityCalls = 0;
    const fallback = await generateHtmlIllustration({ app: { getPath: () => tempDir }, aiService: { chat: async () => { failedQualityCalls += 1; return '<div style="padding:40px;font-size:12px">始终很小的图</div>'; } }, title: '系统部署', content, chartType: '系统拓扑图', itemId: 'bad-quality' });
    assert.equal(failedQualityCalls, 4, '多次排版失败时应继续尝试');
    assert.equal(fallback.fallback, true, '多次失败后应生成原文摘录备用图');
    assert.ok(fs.statSync(fallback.file_path).size > 0);
    let requestCalls = 0;
    const recovered = await generateHtmlIllustration({ app: { getPath: () => tempDir }, aiService: { chat: async () => { requestCalls += 1; if (requestCalls === 1) throw new Error('Connection closed'); return goodChart; } }, title: '系统部署', content, chartType: '系统拓扑图', itemId: 'request-retry' });
    assert.equal(requestCalls, 2, '模型请求失败后应自动重试');
    assert.equal(recovered.fallback, undefined);
    let unavailableCalls = 0;
    const sourceOnly = await generateHtmlIllustration({ app: { getPath: () => tempDir }, aiService: { chat: async () => { unavailableCalls += 1; throw new Error('Connection closed'); } }, title: '系统部署', content: '网关负责访问控制，限制未经授权的访问。数据库与容器节点通过内网连接，并按权限校验请求。部署前核对容器节点的配置和资源配额。上线后监测网关、数据库和容器节点的运行状态。', chartType: '系统拓扑图', itemId: 'source-only' });
    assert.equal(unavailableCalls, 4);
    assert.equal(sourceOnly.fallback, true, '连续请求失败时应以原文信息图保留配图');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('HTML 配图选择、校验、截图和失败修复检查通过');
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
