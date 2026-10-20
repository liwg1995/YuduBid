const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { getGeneratedImagesDir } = require('../utils/paths.cjs');

const CHART_RULES = [
  { type: '甘特图', title: /甘特|排期|工期|进度计划/, evidence: [/阶段|任务|工作包|活动/, /日期|周次|月份|里程碑|工期|时间节点/] },
  { type: 'WBS 工作分解图', title: /WBS|工作分解|任务分解/, evidence: [/工作包|子任务|分解|分项任务/, /交付物|验收|责任|阶段/] },
  { type: '系统拓扑图', title: /拓扑|网络架构|部署架构|系统架构/, evidence: [/网关|服务器|节点|交换机|防火墙|数据库|容器|集群|客户端|服务组件/, /连接|访问|流量|路由|部署|互联|通信/] },
  { type: '组织架构图', title: /组织架构|项目组织|团队架构/, evidence: [/项目经理|负责人|团队|部门|岗位|项目组/, /职责|汇报|管理|分工|协同/] },
  { type: '泳道图', title: /泳道|跨部门流程|部门协作流程/, evidence: [/部门|角色|岗位|责任人/, /审批|移交|流转|交接|处理步骤/] },
  { type: '进度网络图', title: /关键路径|进度网络|任务依赖/, evidence: [/前置|后续|依赖|先后/, /任务|活动|工序|阶段/] },
  { type: 'RACI 职责矩阵', title: /RACI|职责矩阵|责任分工/, evidence: [/部门|角色|岗位|负责人/, /负责|审批|协作|知会|职责/] },
  { type: '风险矩阵', title: /风险矩阵|风险分级|风险评估/, evidence: [/风险|隐患/, /概率|可能性|影响|等级|严重程度/] },
  { type: '时间轴图', title: /时间轴|实施阶段|项目里程碑/, evidence: [/阶段|里程碑|节点/, /日期|周次|月份|时间|期限/] },
  { type: '鱼骨图', title: /鱼骨|根因分析|原因分析/, evidence: [/原因|因素|诱因/, /人员|设备|方法|环境|材料|管理/] },
  { type: '界面原型图', title: /界面|交互设计|页面原型/, evidence: [/模块|页面|组件|界面/, /操作|预览|输入|反馈|交互/] },
];
const CHART_TYPES = CHART_RULES.map((rule) => rule.type);
const CHART_LAYOUT_GUIDANCE = {
  甘特图: '左侧任务名、右侧时间轴，最多 8 行；仅使用正文明确的时间与先后关系。',
  'WBS 工作分解图': '自上而下分两到三级，最多 4 列、12 个节点；同级卡片等宽对齐，层级之间留均匀间距，主图占据画布中部约三分之二的高度，不留下大块空白面板。',
  系统拓扑图: '按访问层、服务层、数据层分区，最多 12 个节点；所有箭头必须从具体节点出发并落到具体节点，不要在两列节点中间单独画一组悬空箭头；分区和节点占满画布的主要区域。',
  组织架构图: '上级与下级居中对齐，最多三级；岗位与职责各用一行。',
  泳道图: '每个角色一条横向泳道，按步骤从左到右推进；最多 5 条泳道。',
  进度网络图: '节点与依赖箭头按时间从左到右排列，避免交叉线。',
  'RACI 职责矩阵': '角色为列、任务为行，最多 6×6 格；用颜色和字母同时表达职责。',
  风险矩阵: '概率与影响各分三级，形成 3×3 矩阵；仅填正文提及的风险。',
  时间轴图: '最多 7 个节点，沿一条时间线均匀分布。',
  鱼骨图: '主问题位于右侧，原因按少量类别分支，避免长句挤在骨架上。',
  界面原型图: '只展示一个核心界面及关键交互反馈，最多三栏；代码预览只作小型示意，不要再叠加流程大面板。',
};
const WIDTH = 1240;
const HEIGHT = 827;
const MAX_GENERATION_ATTEMPTS = 2;
let renderWindow = null;
let renderQueue = Promise.resolve();
app?.once?.('before-quit', () => {
  if (renderWindow && !renderWindow.isDestroyed()) renderWindow.destroy();
  renderWindow = null;
});

function planHtmlChart(title, content, allowedTypes = CHART_TYPES) {
  const body = String(content || '').replace(/```[\s\S]*?```|!\[[^\]]*\]\([^)]*\)|<!--[\s\S]*?-->/g, '');
  const blocks = body.split(/\n\s*\n/).map((text) => text.trim()).filter((text) => text && !/^\|/.test(text));
  const candidates = CHART_RULES.filter((rule) => allowedTypes.includes(rule.type)).map((rule) => {
    const titleHit = rule.title.test(String(title || ''));
    const bodyHits = rule.evidence.filter((pattern) => pattern.test(body)).length;
    if (bodyHits < 2) return null;
    const anchor = blocks.map((text, index) => ({ text, index, hits: rule.evidence.filter((pattern) => pattern.test(text)).length }))
      .filter((block) => block.hits > 0 && !/^#{1,6}\s/.test(block.text))
      .sort((left, right) => right.hits - left.hits || left.index - right.index)[0];
    if (!anchor || (!titleHit && anchor.hits < 2)) return null;
    return { type: rule.type, score: bodyHits * 2 + (titleHit ? 3 : 0) + anchor.hits, anchor: anchor.text, evidence: rule.evidence.map((pattern) => body.match(pattern)?.[0]).filter(Boolean) };
  }).filter(Boolean);
  return candidates.sort((left, right) => right.score - left.score)[0] || null;
}

function selectHtmlChartType(title, content, allowedTypes = CHART_TYPES) {
  return planHtmlChart(title, content, allowedTypes)?.type || '';
}

function insertHtmlChart(content, plan, assetUrl, caption) {
  const source = String(content || '').trimEnd();
  const illustration = `<!-- yibiao-illustration:html -->\n![${caption}](${assetUrl})\n\n*图：${caption}*`;
  const anchorEnd = plan?.anchor ? source.indexOf(plan.anchor) + plan.anchor.length : -1;
  if (anchorEnd < plan?.anchor?.length || anchorEnd < 0) return `${source}\n\n${illustration}`;
  return `${source.slice(0, anchorEnd)}\n\n${illustration}${source.slice(anchorEnd)}`;
}

function validateHtml(source) {
  const sourceHtml = String(source || '').replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!sourceHtml || sourceHtml.length > 120000) throw new Error('HTML 图内容为空或过长');
  const forbidden = sourceHtml.match(/<\s*(?:script|iframe|object|embed|link|base|form|input|video|audio)\b|\bon\w+\s*=|\b(?:src|href|action|xlink:href)\s*=|@import|javascript:|data:/i);
  if (forbidden) {
    throw new Error(`HTML 图包含脚本或外部资源（${forbidden[0]}）`);
  }
  // SVG arrows use local references such as marker-end="url(#arrow)".
  // All other CSS URLs could load resources outside the illustration.
  for (const match of sourceHtml.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const reference = (match[1] ?? match[2] ?? match[3]).trim();
    if (!/^#[A-Za-z_][\w.:-]*$/.test(reference)) {
      throw new Error(`HTML 图包含脚本或外部资源（${match[0]}）`);
    }
  }
  // Models often return a complete document. Keep its inline styles and body,
  // while discarding metadata before embedding it in our isolated render page.
  const head = sourceHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const headStyles = [...head.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((match) => match[0]).join('\n');
  const body = sourceHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  const html = `${headStyles}\n${body ?? sourceHtml
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')}`.trim();
  if (!html || /<\s*(?:html|head|body)\b/i.test(html)) throw new Error('HTML 图文档结构无效');
  return html;
}

function renderBodyAttributes(source) {
  const attributes = String(source || '').match(/<body\b([^>]*)>/i)?.[1] || '';
  const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return ['style', 'class', 'id'].map((name) => {
    const value = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
    return value ? ` ${name}="${escape(value[1] ?? value[2])}"` : '';
  }).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function stripPositionNumber(title) {
  const text = String(title || '').trim();
  return text.replace(/^(?:\d+(?:\.\d+){1,5}|第[一二三四五六七八九十百千\d]+[章节]|图\s*\d+(?:\.\d+)*)(?:[\s\u00a0、.．:：-]+|(?=[\u3400-\u9fff])|$)/, '').trim() || text;
}

function removePositionNumberFromHtml(source) {
  const prefix = /^(\s*)(?:\d+(?:\.\d+){1,5}|第[一二三四五六七八九十百千\d]+[章节]|图\s*\d+(?:\.\d+)*)(?:(?:\s|&nbsp;|&#160;|[、.．:：-])+|(?=[\u3400-\u9fff])|(?=$))/;
  return String(source || '').replace(/(<(?:h[1-6]|div|span|p|header|strong|b|small|label|text)\b[^>]*>)([^<]*)/gi,
    (match, tag, value) => `${tag}${value.replace(prefix, '$1')}`);
}

function extractSourceFacts(focusText, content) {
  const facts = [];
  for (const block of [focusText, content]) {
    const source = String(block || '')
      .replace(/```[\s\S]*?```|!\[[^\]]*\]\([^)]*\)|<!--[^]*?-->/g, ' ')
      .replace(/^\s*(?:#{1,6}\s*|[-*+]\s+|\d+[.)、]\s*)/gm, '')
      .replace(/\[[^\]]+\]\([^)]*\)/g, (match) => match.slice(1, match.indexOf(']')));
    for (const piece of source.split(/[。；;\n]+/)) {
      const text = piece.replace(/\s+/g, ' ').trim();
      if (text.length < 8 || /^\|/.test(text)) continue;
      for (const clause of text.length > 90 ? text.split(/[，,]/) : [text]) {
        const fact = clause.trim();
        if (fact.length < 8 || facts.includes(fact)) continue;
        facts.push(fact.slice(0, 86));
        if (facts.length === 4) return facts;
      }
    }
  }
  return facts;
}

function buildSourceFactsHtml(title, focusText, content) {
  const facts = extractSourceFacts(focusText, content);
  if (!facts.length) return '';
  const cards = facts.map((fact, index) => `<article class="fact"><span class="number">${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(fact.length > 62 ? `${fact.slice(0, 62)}…` : fact)}</p></article>`).join('');
  return `<style>
    body{margin:0;width:1240px;height:827px;background:#eef3f9;font-family:"Microsoft YaHei",Arial,sans-serif;color:#20344c}
    .sheet{width:1176px;height:763px;margin:32px;padding:38px 44px 42px;background:#fff;border:1px solid #dce6f1;border-radius:22px;display:flex;flex-direction:column}
    .eyebrow{color:#3074bb;font-size:18px;font-weight:700;letter-spacing:2px;margin:0 0 12px}
    h1{font-size:34px;line-height:1.3;margin:0;color:#172b44}
    .rule{height:4px;width:76px;border-radius:2px;background:#3181cd;margin:24px 0 26px}
    .facts{display:grid;grid-template-columns:${facts.length <= 2 ? '1fr' : 'repeat(2,minmax(0,1fr))'};grid-template-rows:repeat(${facts.length <= 2 ? facts.length : 2},minmax(0,1fr));gap:20px;flex:1;min-height:0}
    .fact{min-width:0;min-height:0;padding:30px 32px;border:1px solid #d8e5f1;border-left:6px solid #2e83cc;border-radius:14px;display:flex;flex-direction:column;justify-content:center}
    .fact:last-child:nth-child(odd){grid-column:1/-1}
    .number{font-size:20px;font-weight:700;color:#2e83cc;margin-bottom:15px}
    .fact p{font-size:23px;line-height:1.42;margin:0;overflow-wrap:anywhere}
    .footer{font-size:16px;color:#6d8096;margin-top:20px}
  </style><main class="sheet"><div class="eyebrow">正文要点 · HTML 信息图</div><h1>${escapeHtml(String(title || '章节要点').slice(0, 28))}</h1><div class="rule"></div><section class="facts">${cards}</section><div class="footer">依据本节正文整理，具体实施以投标文件正文为准</div></main>`;
}

const LAYOUT_PROBE = `(async()=>{
  await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const body=document.body, issues=[], warnings=[];
  const add=(message)=>{if(message&&!issues.includes(message)&&issues.length<8)issues.push(message)};
  const warn=(message)=>{if(message&&!warnings.includes(message)&&warnings.length<4)warnings.push(message)};
  let textLength=0;
  let smallestFont=Infinity;
  const textRects=[];
  const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(!node.textContent.trim())continue;
    const element=node.parentElement;
    if(!element || ['STYLE','SCRIPT','NOSCRIPT'].includes(element.tagName))continue;
    const style=getComputedStyle(element);
    if(style.display==='none'||style.visibility==='hidden')continue;
    textLength+=node.textContent.trim().length;
    const fontSize=parseFloat(style.fontSize);
    if(Number.isFinite(fontSize))smallestFont=Math.min(smallestFont,fontSize);
    const range=document.createRange();range.selectNodeContents(node);
    for(const rect of range.getClientRects()){
      if(rect.width<1||rect.height<1)continue;
      textRects.push({element,rect});
      const label=node.textContent.trim().slice(0,18);
      if(rect.left< -2||rect.top< -2||rect.right>innerWidth+2||rect.bottom>innerHeight+2){add('文字超出画布：'+label);break}
      for(let parent=element;parent&&parent!==body.parentElement;parent=parent.parentElement){
        const css=getComputedStyle(parent),box=parent.getBoundingClientRect();
        if((['hidden','clip','scroll','auto'].includes(css.overflowX)&&(rect.left<box.left-2||rect.right>box.right+2))||(['hidden','clip','scroll','auto'].includes(css.overflowY)&&(rect.top<box.top-2||rect.bottom>box.bottom+2))){add('文字被容器裁切：'+label);break}
        const hasPanel=parent!==body&&parent.tagName!=='SVG'&&parent.tagName!=='TEXT'&&(parseFloat(css.borderTopWidth)>0||parseFloat(css.borderLeftWidth)>0||parseFloat(css.borderRightWidth)>0||parseFloat(css.borderBottomWidth)>0);
        if(hasPanel&&box.width>40&&box.height>24&&(rect.left<box.left-3||rect.right>box.right+3||rect.top<box.top-3||rect.bottom>box.bottom+3)){add('文字超出卡片边界：'+label);break}
      }
    }
  }
  const overlapArea=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  for(let i=0;i<textRects.length;i++){
    const first=textRects[i];
    for(let j=i+1;j<textRects.length;j++){
      const second=textRects[j];
      if(first.element===second.element)continue;
      const area=overlapArea(first.rect,second.rect);
      if(area>80&&area/Math.max(1,Math.min(first.rect.width*first.rect.height,second.rect.width*second.rect.height))>.35){add('文字互相重叠');break}
    }
  }
  for(const parent of body.querySelectorAll('*')){
    const children=Array.from(parent.children);
    for(const foreground of children){
      if(!['absolute','fixed','sticky'].includes(getComputedStyle(foreground).position))continue;
      const front=foreground.getBoundingClientRect();
      for(const sibling of children){
        if(sibling===foreground)continue;
        const back=sibling.getBoundingClientRect();
        const area=overlapArea(front,back);
        if(area>4000&&area/Math.max(1,Math.min(front.width*front.height,back.width*back.height))>.15){add('定位元素大面积遮挡相邻模块');break}
      }
    }
  }
  for(const element of body.querySelectorAll('*')){
    // The document's full-canvas wrapper is a layout surface, not a content panel.
    // Measuring its text distribution mistakes a valid chart for a half-empty card.
    if(element.parentElement===body)continue;
    const box=element.getBoundingClientRect();
    if(box.width<240||box.height<200||box.width*box.height<90000)continue;
    const style=getComputedStyle(element);
    const color=style.backgroundColor;
    if(color==='rgba(0, 0, 0, 0)'||color==='transparent')continue;
    if(parseFloat(style.borderTopWidth)===0&&parseFloat(style.borderLeftWidth)===0&&parseFloat(style.borderRightWidth)===0&&parseFloat(style.borderBottomWidth)===0)continue;
    const ownText=textRects.filter((entry)=>element.contains(entry.element)&&entry.rect.top>=box.top&&entry.rect.bottom<=box.bottom);
    const visuals=Array.from(element.querySelectorAll('svg,img,canvas')).map((item)=>item.getBoundingClientRect()).filter((rect)=>rect.width>100&&rect.height>100);
    const contentBottom=Math.max(0,...ownText.map((entry)=>entry.rect.bottom),...visuals.map((rect)=>rect.bottom));
    if((ownText.length||visuals.length)&&contentBottom<box.top+box.height*.5){add('大面积面板近半高度为空白，请缩小面板或重新分布内容');break}
    if((ownText.length||visuals.length)&&contentBottom<box.top+box.height*.65){warn('大面积面板下半部分空白，请缩小面板或重新分布内容');break}
  }
  for(const svg of body.querySelectorAll('svg')){
    const box=svg.getBoundingClientRect();
    if(box.width>180&&box.height>180&&svg.querySelectorAll('line,path,polyline').length>2&&!svg.querySelector('rect,circle,ellipse,polygon,text,foreignObject')){warn('大幅连线与节点分离，请让箭头连接具体节点');break}
  }
  const roots=Array.from(body.children).filter((element)=>!['STYLE','SCRIPT','NOSCRIPT'].includes(element.tagName));
  if(roots.length){
    const boxes=roots.map((element)=>element.getBoundingClientRect()).filter((rect)=>rect.width>20&&rect.height>20);
    if(boxes.length){
      const left=Math.min(...boxes.map((rect)=>rect.left)),right=Math.max(...boxes.map((rect)=>rect.right));
      if(left<innerWidth*.15&&right<innerWidth*.8)warn('图形只占画布左侧，需扩展或居中主图');
    }
  }
  const textBottom=Math.max(0,...textRects.map((entry)=>entry.rect.bottom));
  if(textLength>0&&textBottom<innerHeight*.55)warn('主体内容只占画布上半部，需调整图形高度和纵向分布');
  if(smallestFont<16)warn('最小文字字号不足 16px，缩入 Word 后难以阅读');
  return {width:body.scrollWidth,height:body.scrollHeight,text:textLength,issues,warnings};
})()`;

async function renderHtmlToPng(source) {
  const html = validateHtml(source);
  const task = renderQueue.then(async () => {
    if (!renderWindow || renderWindow.isDestroyed()) {
      renderWindow = new BrowserWindow({ show: false, width: WIDTH, height: HEIGHT, backgroundColor: '#ffffff', webPreferences: { partition: 'html-illustration-renderer', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      renderWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      renderWindow.webContents.on('will-navigate', (event) => event.preventDefault());
      renderWindow.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*', 'file://*/*'] }, (_details, callback) => callback({ cancel: true }));
      renderWindow.setContentSize(WIDTH, HEIGHT);
    }
    const win = renderWindow;
    const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'"><style>html,body{box-sizing:border-box;margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#fff}body{font-family:Arial,'Microsoft YaHei',sans-serif;color:#19324a}*,*:before,*:after{box-sizing:border-box}</style></head><body${renderBodyAttributes(source)}>${html}</body></html>`;
    try {
    await Promise.race([
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('HTML 图加载超时')), 30000)),
    ]);
    const layout = await win.webContents.executeJavaScript(LAYOUT_PROBE);
    if (!layout.text) throw new Error('HTML 图没有可见文字');
    // Chromium may report a few extra pixels for font and border rounding.
    if (layout.width > WIDTH + 8 || layout.height > HEIGHT + 8) throw new Error(`HTML 图内容超出画布（${layout.width}×${layout.height}，画布 ${WIDTH}×${HEIGHT}），请重排内容，不能整体缩小`);
    if (layout.issues.length) {
      console.warn(`[html-illustration] layout rejected: canvas=${layout.width}x${layout.height}, text=${layout.text}, issues=${layout.issues.join('；')}, warnings=${layout.warnings.join('；')}`);
      throw new Error(`HTML 图排版需修复：${layout.issues.join('；')}`);
    }
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    if (image.isEmpty()) throw new Error('HTML 图截图为空');
    return { html, png: image.toPNG(), layoutWarnings: layout.warnings };
    } catch (error) {
      if (/加载超时|页面加载失败|截图为空/.test(String(error?.message || ''))) {
        if (!win.isDestroyed()) win.destroy();
        renderWindow = null;
      }
      // Electron may include the entire data: URL (and source text) in load errors.
      if (/data:text\/html/i.test(String(error?.message || ''))) throw new Error('HTML 图页面加载失败');
      throw error;
    }
  });
  renderQueue = task.catch(() => undefined);
  return task;
}

async function generateHtmlIllustration({ app, aiService, title, content, chartType, itemId, focusText = '' }) {
  const dir = getGeneratedImagesDir(app);
  fs.mkdirSync(dir, { recursive: true });
  const chartTitle = stripPositionNumber(title);
  let lastError;
  let lastSource = '';
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let response;
    try {
      const retryInstruction = attempt >= 2
        ? `前面的 HTML 图未通过本地检查：${lastError?.message || '模型请求失败'}。这次从头绘制简化版，不复用旧 HTML。只保留 2～4 个最重要的原文要点，用整齐的 Grid 卡片排版；如果关系没有明确依据，就不要画箭头。必须完整放在 ${WIDTH}×${HEIGHT} 画布内。`
        : `上一版${chartType}的 HTML 未通过本地检查：${lastError?.message || '模型请求失败'}。图型版式：${CHART_LAYOUT_GUIDANCE[chartType] || '使用整齐对齐的卡片和清晰的主次层级。'}请重新安排节点、面板尺寸和间距，减少次要说明，修复问题；不要整体缩小或用空白面板填充画布。保持已核实的事实和图型。旧版 HTML 供定位问题：\n${lastSource.slice(0, 22000)}`;
      response = await aiService.chat({
        max_request_attempts: 1,
        messages: [
          { role: 'system', content: `你是投标文件图表设计师。只输出 HTML 片段及内嵌 CSS，不输出代码围栏、解释、脚本、外链或图片。body 是 ${WIDTH}×${HEIGHT} 像素固定画布；用 CSS Grid/Flex 将标题、主图、必要图例排成稳定的纵向区域，四周留 40px；不要让任何模块靠绝对定位覆盖别的模块，不要使用固定定位或 overflow:hidden 裁切内容。所有内容必须在画布内，禁止依赖整体 transform:scale 缩小来塞入画布。主图应使用画布主要面积，避免固定高大面板里只有上半部内容、大片白边或空卡片。主标题至少 30px，节点/正文至少 18px，图注至少 16px；卡片文字必须完整留在边框内，不能重叠或穿过连线。图内不得出现章节编号、图号或页码，例如“3.2.1”“图6”；标题只写主题名称。流程步骤自身的序号可以保留。拓扑图的箭头必须连接具体节点，不能在空白区域悬浮；不确定的连接关系不要绘制。只保留能看清的关键节点与关系，颜色控制在蓝灰主色加一两种强调色，节点间距与对齐一致。禁止 script、事件属性、src/href、外部 CSS url()、data: 资源；SVG 箭头可使用图内 marker 的 url(#id)。只使用正文能证实的事实；缺少日期、工期、人员或连接关系时标注“待确认”，不得编造。` },
          { role: 'user', content: lastError
            ? `${retryInstruction}\n\n相关段落：\n${String(focusText).slice(0, 5000)}\n\n章节正文：\n${String(content).slice(0, 12000)}\n\n请输出完整 HTML。`
            : `根据以下正文绘制一张${chartType}，图内标题为“${chartTitle}”。图型版式：${CHART_LAYOUT_GUIDANCE[chartType] || '使用整齐对齐的卡片和清晰的主次层级。'}优先表达已匹配的相关段落，其他正文只作事实核对。正文中的章节编号仅用于定位，不要写进图片。\n\n相关段落：\n${String(focusText).slice(0, 8000)}\n\n章节正文：\n${String(content).slice(0, 20000)}` },
        ],
        temperature: 0.25,
        logTitle: `HTML配图-${itemId}-${chartType}${attempt ? '-修复' : ''}`,
      });
    } catch (error) {
      if (/已取消|cancelled|canceled/i.test(String(error?.message || ''))) throw error;
      lastError = error;
      console.warn(`[html-illustration] item=${itemId} type=${chartType} attempt=${attempt + 1}/${MAX_GENERATION_ATTEMPTS}: 模型请求失败：${error.message || error}`);
      if (attempt + 1 < MAX_GENERATION_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    const name = `html-${crypto.randomUUID()}`;
    lastSource = removePositionNumberFromHtml(response);
    fs.writeFileSync(path.join(dir, `${name}.html`), lastSource, 'utf8');
    try {
      const { png, layoutWarnings } = await renderHtmlToPng(lastSource);
      if (layoutWarnings.length) throw new Error(`HTML 图排版质量需修复：${layoutWarnings.join('；')}`);
      fs.writeFileSync(path.join(dir, `${name}.png`), png);
      return { asset_url: `yibiao-asset://generated-images/${name}.png`, file_path: path.join(dir, `${name}.png`), layout_warnings: [] };
    } catch (error) {
      lastError = error;
      console.warn(`[html-illustration] item=${itemId} type=${chartType} attempt=${attempt + 1}/${MAX_GENERATION_ATTEMPTS}: ${error.message || error}`);
    }
  }
  const fallbackHtml = removePositionNumberFromHtml(buildSourceFactsHtml(chartTitle, focusText, content));
  if (fallbackHtml) {
    const name = `html-${crypto.randomUUID()}`;
    try {
      const { png, layoutWarnings } = await renderHtmlToPng(fallbackHtml);
      if (layoutWarnings.length) throw new Error(layoutWarnings.join('；'));
      fs.writeFileSync(path.join(dir, `${name}.html`), fallbackHtml, 'utf8');
      fs.writeFileSync(path.join(dir, `${name}.png`), png);
      console.warn(`[html-illustration] item=${itemId} type=${chartType}: 多次生成失败，已使用正文摘录备用图。原因：${lastError?.message || '未知'}`);
      return { asset_url: `yibiao-asset://generated-images/${name}.png`, file_path: path.join(dir, `${name}.png`), layout_warnings: [], fallback: true, fallback_reason: String(lastError?.message || '未知原因').slice(0, 300) };
    } catch (fallbackError) {
      console.warn(`[html-illustration] item=${itemId} type=${chartType}: 备用图失败：${fallbackError.message || fallbackError}`);
    }
  }
  throw lastError || new Error('HTML 配图生成失败');
}

module.exports = { CHART_TYPES, planHtmlChart, selectHtmlChartType, insertHtmlChart, validateHtml, renderHtmlToPng, generateHtmlIllustration };
