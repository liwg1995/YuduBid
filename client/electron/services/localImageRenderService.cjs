const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');

const RENDER_TIMEOUT_MS = 30000;
let renderWindow = null;
let mermaidScriptPath = null;
let renderQueue = Promise.resolve();
let lifecycleRegistered = false;

function resolveMermaidScript() {
  if (mermaidScriptPath && fs.existsSync(mermaidScriptPath)) return mermaidScriptPath;
  mermaidScriptPath = require.resolve('mermaid/dist/mermaid.min.js');
  return mermaidScriptPath;
}

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  return win;
}

function disposeRenderWindow() {
  if (renderWindow && !renderWindow.isDestroyed()) {
    renderWindow.destroy();
  }
  renderWindow = null;
}

function registerLifecycle() {
  if (lifecycleRegistered || !app?.once) return;
  lifecycleRegistered = true;
  app.once('before-quit', disposeRenderWindow);
}

function enqueueRender(task) {
  const next = renderQueue.then(task, task);
  renderQueue = next.catch(() => undefined);
  return next;
}

function waitForLoad(win) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('本地 Mermaid 渲染超时')), RENDER_TIMEOUT_MS);
    const onFinish = () => {
      clearTimeout(timer);
      resolve();
    };
    const onFail = (_event, code, description) => {
      clearTimeout(timer);
      reject(new Error(`本地 Mermaid 页面加载失败：${code} ${description || ''}`.trim()));
    };
    win.webContents.once('did-finish-load', onFinish);
    win.webContents.once('did-fail-load', onFail);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createRenderDocument() {
  const scriptUrl = pathToFileURL(resolveMermaidScript()).toString();
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}#root{display:inline-block;padding:24px;background:#fff}</style></head><body><div id="root"></div><script src="${escapeHtml(scriptUrl)}"></script></body></html>`;
}

async function renderMermaidToSvg(code) {
  if (!String(code || '').trim()) throw new Error('Mermaid 内容为空');
  return enqueueRender(async () => {
    if (!renderWindow || renderWindow.isDestroyed()) {
      renderWindow = createWindow();
    }

    try {
      const loadPromise = waitForLoad(renderWindow);
      await renderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createRenderDocument())}`);
      await loadPromise;
      const result = await Promise.race([
        renderWindow.webContents.executeJavaScript(`(async () => {
          const api = window.mermaid && (window.mermaid.default || window.mermaid);
          if (!api) throw new Error('未加载 Mermaid 浏览器脚本');
          api.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
          const rendered = await api.render('yibiao-mermaid-${Date.now()}', ${JSON.stringify(String(code))});
          return rendered.svg;
        })()`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('本地 Mermaid 执行超时')), RENDER_TIMEOUT_MS)),
      ]);
      const svg = String(result || '').trim();
      if (!svg.startsWith('<svg')) throw new Error('Mermaid 未返回有效 SVG');
      return svg;
    } catch (error) {
      disposeRenderWindow();
      throw error;
    }
  });
}

function createLocalImageRenderService() {
  registerLifecycle();
  return {
    async renderMermaidToDataUrl(code) {
      const svg = await renderMermaidToSvg(code);
      return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    },
    dispose() {
      disposeRenderWindow();
    },
  };
}

module.exports = { createLocalImageRenderService };
