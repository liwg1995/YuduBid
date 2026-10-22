/* 隔离工作区的真实 Renderer 回归，不访问用户配置，不调用模型。需先启动 Vite。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const { createSqliteDatabase } = require('../electron/services/sqliteDatabase.cjs');
const { createFullBlindCheckController } = require('../electron/services/blind-check-upstream/controller.cjs');
const { registerFullBlindCheckIpc } = require('../electron/ipc/fullBlindCheckIpc.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blind-ui-'));
const output = process.env.BLIND_UI_OUTPUT || path.join(os.tmpdir(), 'blind-ui-review');
const html = path.join(__dirname, '..', 'blind-ui-qa.html');
const entry = path.join(__dirname, '..', 'blind-ui-qa.tsx');
app.setPath('userData', temp);
let database, window;
let exitStatus = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = code => window.webContents.executeJavaScript(code);
async function waitFor(code) {
  for (let i = 0; i < 80; i++) { if (await js(code)) return; await pause(100); }
  throw new Error('页面等待超时: ' + code + ' ' + (await js('document.documentElement.outerHTML')).slice(0,500));
}
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const proxyApp = { getPath: () => temp, getAppPath: () => path.resolve(__dirname, '..'), once() {}, isPackaged: false };
  database = createSqliteDatabase(proxyApp);
  const controller = createFullBlindCheckController({ app: proxyApp, db: database.db, aiService: { collectJsonResponse: async () => { await pause(1500); throw new Error('{"error":{"message":"rpm exhausted","type":"quota_exceeded_error","code":"8"}}'); } }, configStore: { load: () => ({}) }, credentialLibraryService: { listCompanies: () => [] }, technicalPlanStore: {}, dialog: {}, shell: {}, emit: event => { if (window && !window.webContents.isDestroyed()) window.webContents.send('tasks:event', event); } });
  const input = path.join(temp, '项目技术方案.docx');
  fs.writeFileSync(input, await Packer.toBuffer(new Document({ creator: '测试作者', sections: [{ children: [new Paragraph({ children: [new TextRun({ text: '项目实施计划', color: 'FF0000' })] })] }] })));
  await controller.importFile(input);
  registerFullBlindCheckIpc({ controller, dialog: {} });
  ipcMain.handle('tasks:get-active', () => []);
  let checkStartedFromUi = false;
  fs.writeFileSync(html, '<html><meta charset="UTF-8"><div id="root"></div><script type="module" src="/blind-ui-qa.tsx"></script></html>');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import './src/styles.css';import './src/modern.css';import './src/modernDialogs.css';import BlindCheckPage from './src/features/blind-check-upstream/pages/BlindCheckPage';import {ToastProvider} from './src/shared/ui/ToastProvider';import * as Tooltip from '@radix-ui/react-tooltip';const p=new URLSearchParams(location.search);const appearance=p.get('appearance')||'classic';localStorage.setItem('yudubid-ui-appearance',appearance);document.documentElement.dataset.uiAppearance=appearance;document.documentElement.dataset.uiTheme=p.get('theme')||'dark';createRoot(document.getElementById('root')!).render(<Tooltip.Provider><ToastProvider><div className={appearance==='modern'?'modern-shell':'app-shell'} style={{display:'block',width:'100%',height:'100vh',padding:20,boxSizing:'border-box'}}><BlindCheckPage/></div></ToastProvider></Tooltip.Provider>);`);
  window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), contextIsolation: true } });
  const errors = []; window.webContents.on('did-fail-load',(_event, code, message)=>console.error('LOAD',code,message));
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) { errors.push(message); console.error('CONSOLE', level, message); } });
  for (const appearance of ['classic', 'modern']) for (const theme of appearance === 'classic' ? ['light', 'dark'] : ['dark']) {
    for (const step of ['upload', 'preset', 'results', 'fix']) {
      controller.store.saveUiState({ step, presetTab: 'page', resultTab: 'all' });
      await window.loadURL(`http://127.0.0.1:5173/blind-ui-qa.html?appearance=${appearance}&theme=${theme}`);
      await waitFor(`!!document.querySelector('.blind-check-page.is-${step}')`);
      await pause(250);
      if (step === 'results' && !checkStartedFromUi) {
        const startButton = await js(`(() => { const button=[...document.querySelectorAll('.blind-check-step-bar button')].find(item=>item.textContent.includes('开始检查')); return button ? { disabled: button.disabled, text: button.textContent } : null })()`);
        assert(startButton && !startButton.disabled, JSON.stringify({ startButton }));
        await js(`([...document.querySelectorAll('.blind-check-step-bar button')].find(item=>item.textContent.includes('开始检查'))).click()`);
        await waitFor(`!!document.querySelector('[role=dialog] [aria-label="检查方式"]')`);
        await pause(300);
        const dialogGeometry = await js(`(() => { const dialog=document.querySelector('[role=dialog]'), rect=dialog.getBoundingClientRect(), top=document.elementFromPoint(innerWidth/2,innerHeight/2); return { visible:rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth, centerInside:dialog.contains(top), position:getComputedStyle(dialog).position, overlayPosition:getComputedStyle(document.querySelector('.app-dialog-modal')).position }; })()`);
        assert(dialogGeometry.visible && dialogGeometry.centerInside && dialogGeometry.position === 'fixed' && dialogGeometry.overlayPosition === 'fixed', JSON.stringify(dialogGeometry));
        fs.writeFileSync(path.join(output, 'check-method-dialog.png'), (await window.webContents.capturePage()).toPNG());
        await js(`document.querySelector('[aria-label="检查方式"] button').click()`);
        for (let i = 0; i < 100 && controller.loadState().checkTask?.status === 'running'; i++) await pause(100);
        assert.equal(controller.loadState().checkTask?.status, 'success', JSON.stringify(controller.loadState().checkTask));
        checkStartedFromUi = true;
      }
      if (step === 'results' && appearance === 'modern') {
        await js(`([...document.querySelectorAll('.blind-check-step-bar button')].find(item=>item.textContent.includes('重新检查'))).click()`);
        await waitFor(`!!document.querySelector('[role=dialog] [aria-label="检查方式"]')`);
        await pause(300);
        const optionBodies = await js(`[...document.querySelectorAll('.blind-check-option-card-body')].map(item=>({ background:getComputedStyle(item).backgroundColor, border:getComputedStyle(item).borderWidth }))`);
        assert(optionBodies.length === 2 && optionBodies.every(item => item.background === 'rgba(0, 0, 0, 0)' && item.border === '0px'), JSON.stringify(optionBodies));
        fs.writeFileSync(path.join(output, 'modern-check-method-dialog.png'), (await window.webContents.capturePage()).toPNG());
        await js(`document.querySelectorAll('[aria-label="检查方式"] button')[1].click()`);
        await waitFor(`!!document.querySelector('.blind-check-running.is-reviewing .blind-check-running-visual')`);
        const runningLayout = await js(`(() => { const panel=document.querySelector('.blind-check-running'), visual=document.querySelector('.blind-check-running-visual'), stages=document.querySelector('.blind-check-running-stages'); return { panelWidth:panel.clientWidth, visualWidth:visual.clientWidth, stageCount:stages.children.length, orbitAnimation:getComputedStyle(document.querySelector('.blind-check-running-orbit.is-outer')).animationName }; })()`);
        assert(runningLayout.panelWidth >= 700 && runningLayout.visualWidth >= 200 && runningLayout.stageCount === 3 && runningLayout.orbitAnimation === 'blind-check-orbit-spin', JSON.stringify(runningLayout));
        fs.writeFileSync(path.join(output, 'modern-review-running.png'), (await window.webContents.capturePage()).toPNG());
        for (let i = 0; i < 100 && controller.loadState().review?.status !== 'error'; i++) await pause(100);
        assert.equal(controller.loadState().result.status, 'success');
        assert.equal(controller.loadState().review?.status, 'error');
        await window.loadURL(`http://127.0.0.1:5173/blind-ui-qa.html?appearance=modern&theme=dark`);
        await waitFor(`!!document.querySelector('.blind-check-review-failure')`);
        const failureText = await js(`document.querySelector('.blind-check-review-failure').textContent`);
        assert(failureText.includes('每分钟请求额度已用尽') && failureText.includes('程序检查结果') && !failureText.includes('rpm exhausted'), failureText);
        await pause(500);
        fs.writeFileSync(path.join(output, 'modern-review-quota-failure.png'), (await window.webContents.capturePage()).toPNG());
      }
      const geometry = await js(`(() => { const p=document.querySelector('.blind-check-page'), panel=document.querySelector('.blind-check-step-panel');return { overflow:p.scrollWidth>p.clientWidth+2, panelHeight:panel?.clientHeight, footerBottom:document.querySelector('.blind-modern-footer')?.getBoundingClientRect().bottom, viewport:innerHeight, switches:[...document.querySelectorAll('[role=switch]')].map(s=>({width:s.offsetWidth,height:s.offsetHeight,thumb:s.firstElementChild?.offsetWidth})),lightSurfaces:[...document.querySelectorAll('.blind-check-step-panel,.blind-check-step-tabs,.blind-check-group,.content-generation-config-row')].filter(s=>{const c=getComputedStyle(s).backgroundColor.match(/\\d+/g);return c&&c.length>=3&&c.slice(0,3).every(n=>+n>200)&&!(c.length>3&&+c[3]===0)}).length}; })()`);
      assert(!geometry.overflow, JSON.stringify({ appearance, theme, step, geometry }));
      for (const s of geometry.switches) assert(s.width >= 40 && s.height >= 24 && s.thumb >= 18, JSON.stringify(s));
      if (step !== 'upload') assert(geometry.panelHeight > 200, JSON.stringify(geometry));
      if (appearance === 'modern') assert(geometry.footerBottom <= geometry.viewport + 2, JSON.stringify({step,geometry}));
      if (theme === 'dark') assert.equal(geometry.lightSurfaces, 0, JSON.stringify({ appearance, step, geometry }));
      fs.writeFileSync(path.join(output, `${appearance}-${theme}-${step}.png`), (await window.webContents.capturePage()).toPNG());
      if (step === 'preset') {
        await js(`document.querySelector('[role=switch]').click()`); await pause(250);
        assert(['checked','unchecked'].includes(await js(`document.querySelector('[role=switch]').getAttribute('data-state')`)));
        await js(`document.querySelector('[role=tab][id$="privacy"]').click()`); await pause(150);
        fs.writeFileSync(path.join(output, `${appearance}-${theme}-privacy.png`), (await window.webContents.capturePage()).toPNG());
        await js(`document.querySelector('button.primary-action').click()`); await pause(150);
        fs.writeFileSync(path.join(output, `${appearance}-${theme}-dialog.png`), (await window.webContents.capturePage()).toPNG());
      }
    }
  }
  window.setSize(800, 760);
  controller.store.saveUiState({ step: 'preset', presetTab: 'page' });
  await window.loadURL('http://127.0.0.1:5173/blind-ui-qa.html?appearance=modern&theme=dark');
  await waitFor("!!document.querySelector('.blind-check-page.is-preset')"); await pause(250);
  assert(await js("document.querySelector('.blind-check-step-panel').clientHeight>180"));
  fs.writeFileSync(path.join(output, 'modern-narrow.png'), (await window.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log('暗标 UI 验证通过：两套布局、三种外观、四个步骤、开关尺寸、暗色背景、窄窗口。截图：' + output);
}).catch(error => { console.error(error); exitStatus = 1; }).finally(() => {
  window?.destroy(); database?.close();
  for (const file of [html,entry]) fs.rmSync(file,{force:true});
  fs.rmSync(temp,{recursive:true,force:true}); app.exit(exitStatus);
});
