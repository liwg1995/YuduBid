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
  mermaidScriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'mermaid', 'mermaid.min.js')
    : require.resolve('mermaid/dist/mermaid.min.js');
  if (!fs.existsSync(mermaidScriptPath)) {
    throw new Error(`Mermaid 浏览器资源不存在：${mermaidScriptPath}`);
  }
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
    const cleanup = () => {
      clearTimeout(timer);
      win.webContents.removeListener('did-finish-load', onFinish);
      win.webContents.removeListener('did-fail-load', onFail);
    };
    const onFinish = () => {
      cleanup();
      resolve();
    };
    const onFail = (_event, code, description) => {
      cleanup();
      reject(new Error(`本地 Mermaid 页面加载失败：${code} ${description || ''}`.trim()));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('本地 Mermaid 渲染超时'));
    }, RENDER_TIMEOUT_MS);
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

async function renderMermaid(code, { capturePng = false } = {}) {
  if (!String(code || '').trim()) throw new Error('Mermaid 内容为空');
  return enqueueRender(async () => {
    let needsLoad = false;
    if (!renderWindow || renderWindow.isDestroyed()) {
      renderWindow = createWindow();
      needsLoad = true;
    }

    try {
      if (needsLoad) {
        const loadPromise = waitForLoad(renderWindow);
        await renderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createRenderDocument())}`);
        await loadPromise;
      }
      const result = await Promise.race([
        renderWindow.webContents.executeJavaScript(`(async () => {
          const api = window.mermaid && (window.mermaid.default || window.mermaid);
          if (!api) throw new Error('未加载 Mermaid 浏览器脚本');
          api.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'default',
            htmlLabels: false,
            flowchart: { htmlLabels: false },
          });
          const rendered = await api.render('yibiao-mermaid-${Date.now()}', ${JSON.stringify(String(code))});
          const root = document.getElementById('root');
          const normalizedSvg = rendered.svg.replace(/(<style(?:\\s[^>]*)?>)([\\s\\S]*?)(<\\/style>)/gi, (_match, open, css, close) => (
            open + css.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&') + close
          ));
          root.innerHTML = normalizedSvg;
          const svgElement = root.querySelector('svg');
          if (!svgElement) throw new Error('Mermaid 未返回有效 SVG');
          const viewBox = svgElement.viewBox?.baseVal;
          // Flowcharts usually use a positive viewBox with width="100%". Give
          // those SVGs an intrinsic size so long diagrams are not stretched or
          // clipped by the render viewport. Sequence diagrams commonly use a
          // negative viewBox origin; overriding their intrinsic size makes
          // Chromium paint the diagram outside the captured area.
          if (viewBox?.width > 0 && viewBox?.height > 0 && viewBox.x >= 0 && viewBox.y >= 0) {
            svgElement.setAttribute('width', String(viewBox.width));
            svgElement.setAttribute('height', String(viewBox.height));
            svgElement.style.width = String(viewBox.width) + 'px';
            svgElement.style.height = String(viewBox.height) + 'px';
          }
          svgElement.style.display = 'block';
          svgElement.style.maxWidth = 'none';
          if (document.fonts?.ready) await document.fonts.ready;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const bounds = root.getBoundingClientRect();
          return {
            svg: normalizedSvg,
            clip: {
              x: Math.max(0, Math.floor(bounds.x)),
              y: Math.max(0, Math.floor(bounds.y)),
              width: Math.max(1, Math.ceil(bounds.width)),
              height: Math.max(1, Math.ceil(bounds.height)),
            },
          };
        })()`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('本地 Mermaid 执行超时')), RENDER_TIMEOUT_MS)),
      ]);
      const svg = String(result?.svg || '').trim();
      if (!svg.startsWith('<svg')) throw new Error('Mermaid 未返回有效 SVG');
      if (!capturePng) return { svg };
      renderWindow.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const image = await renderWindow.webContents.capturePage(result.clip);
      if (!image || image.isEmpty()) throw new Error('Mermaid PNG 截图为空');
      return { svg, png: image.toPNG() };
    } catch (error) {
      disposeRenderWindow();
      throw error;
    }
  });
}

function createLocalImageRenderService() {
  registerLifecycle();
  return {
    async renderMermaidToSvg(code) {
      const { svg } = await renderMermaid(code);
      return svg;
    },
    async renderMermaidToDataUrl(code) {
      const { png } = await renderMermaid(code, { capturePng: true });
      return `data:image/png;base64,${png.toString('base64')}`;
    },
    dispose() {
      disposeRenderWindow();
    },
  };
}

module.exports = { createLocalImageRenderService };
