const path = require('node:path');

async function readWordLayout(file) {
  const { BrowserWindow } = require('electron');
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, 'wordLayoutPreload.cjs'), sandbox: false,
    nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
  } });
  let timeout;
  try {
    await window.loadURL('data:text/html;charset=utf-8,<html><body></body></html>');
    return await Promise.race([
      window.webContents.executeJavaScript(`window.wordLayout.read(${JSON.stringify(file)})`),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Word 格式自检超时，请检查文档大小')), 120000); }),
    ]);
  } finally {
    clearTimeout(timeout);
    if (!window.isDestroyed()) window.destroy();
  }
}

function layoutParagraphs(blocks) {
  return (blocks || []).flatMap((block) => block.kind === 'paragraph' ? [block]
    : (block.rows || []).flatMap((row) => (row.cells || []).flatMap((cell) => layoutParagraphs(cell.blocks))));
}

function paragraphText(paragraph) {
  return (paragraph.lines || []).flatMap((line) => (line.spans || []).map((span) => span.text || '')).join('');
}

function inspectWordLayout(layout) {
  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  const pageTexts = pages.map((page) => layoutParagraphs(page.fragments).map(paragraphText).join(''));
  const issues = [];
  pages.forEach((page, index) => {
    if (index === 0 || index === pages.length - 1) return;
    const blocks = page.fragments || [];
    const paragraphs = layoutParagraphs(blocks);
    const readable = paragraphs.map(paragraphText).join('').trim();
    const bottom = Math.max(0, ...blocks.map((block) => (block.box?.y || 0) + (block.box?.height || 0)));
    const height = page.contentBox?.height || 0;
    const nextParagraph = layoutParagraphs(pages[index + 1]?.fragments)[0];
    const nextStartsWithImage = Boolean(nextParagraph?.lines?.some((line) => line.drawings?.length))
      && (nextParagraph?.box?.height || 0) > height - bottom;
    if (readable.length > 120 && height > 0 && height - bottom > Math.max(100, height * 0.3)
      && !nextParagraph?.props?.some((prop) => prop.localName === 'pageBreakBefore')) {
      issues.push({ page: index + 1, code: 'bottom-space', repairable: nextStartsWithImage,
        message: nextStartsWithImage ? '图片被挤到下一页，当前页有较大留白。' : '正文止于页面上半部，请核对分页留白。' });
    }
  });
  return { pageCount: pages.length, checkedPages: pages.length, pageTexts, issues };
}

function normalizeLayoutText(value) {
  return String(value || '').replace(/[\s\u00a0\u3000]+/g, '').toLocaleLowerCase();
}

// 只修补有正文且可定位到小节的页尾留白；空白页和越界文字需要人工检查模板。
function selectLayoutRepairTargets(audit, contexts) {
  const pages = Array.isArray(audit?.pageTexts) ? audit.pageTexts : [];
  const sections = (contexts || []).filter((context) => context?.item?.title && context?.content);
  if (!pages.length || !sections.length) return [];
  const sectionByPage = [];
  let current = -1;
  pages.forEach((page, index) => {
    const text = normalizeLayoutText(page);
    while (current + 1 < sections.length && text.includes(normalizeLayoutText(sections[current + 1].item.title))) current += 1;
    sectionByPage[index + 1] = current >= 0 ? sections[current] : null;
  });
  const seen = new Set();
  return (audit.issues || []).filter((issue) => issue.code === 'bottom-space' && issue.repairable === true)
    .map((issue) => sectionByPage[issue.page] ? {
      ...sectionByPage[issue.page],
      layoutPage: issue.page,
      precedingText: String(pages[issue.page - 1] || '').slice(-160),
    } : null)
    .filter((context) => {
      if (!context || seen.has(context.item.id)) return false;
      seen.add(context.item.id);
      return true;
    });
}

module.exports = { readWordLayout, inspectWordLayout, selectLayoutRepairTargets };
