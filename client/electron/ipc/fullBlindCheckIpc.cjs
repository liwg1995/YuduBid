const fs = require('node:fs');
const path = require('node:path');
const { ipcMain } = require('electron');
function registerFullBlindCheckIpc({ controller, dialog }) {
  const store = controller.store;
  const handlers = {
    'load-state': () => controller.loadState(), 'list-presets': () => store.listPresets(), 'get-credential-words': () => store.getCredentialWords(), 'get-input-signature': () => store.getInputSignature(), 'get-tender-sources': () => store.getTenderSources(),
    'import-file': file => controller.importFile(file), 'remove-file': () => controller.removeFile(), 'clear': () => controller.clear(),
    'select-credential-company': id => controller.mutate('selectCredentialCompany', id),
    'save-ui-state': value => store.saveUiState(value), 'create-preset': value => controller.mutate('createPreset', value), 'update-preset': (id, value) => controller.mutate('updatePreset', id, value), 'delete-preset': id => controller.mutate('deletePreset', id), 'select-preset': id => controller.mutate('selectPreset', id), 'set-use-credential-words': enabled => controller.mutate('setUseCredentialWords', enabled), 'save-fix-rules': rules => controller.mutate('saveFixRules', rules),
    'start-check': value => controller.startCheck(value), 'start-fix': value => controller.startFix(value), 'start-extraction': value => controller.startExtraction(value),
    'save-fixed-document': () => controller.saveFixedDocument(), 'open-export': file => controller.openExport(file),
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`full-blind-check:${name}`, (_event, ...args) => handler(...args));
  for (const [name, tender] of [['select-document', false], ['select-tender', true]]) ipcMain.handle(`full-blind-check:${name}`, async (_event, options) => {
    const extensions = tender ? ['docx', 'doc', 'wps', 'pdf', 'md', 'markdown', 'txt', 'png', 'jpg', 'jpeg', 'jp2', 'webp', 'gif', 'bmp', 'html', 'ppt', 'pptx', 'xls', 'xlsx'] : ['docx'];
    const result = !tender && options?.filePaths?.length ? { canceled: false, filePaths: options.filePaths.slice(0, 1) } : await dialog.showOpenDialog({ title: tender ? '选择招标文件' : '选择投标文件', properties: ['openFile'], filters: [{ name: '标书文档', extensions }] });
    if (result.canceled || !result.filePaths.length) return { success: false, message: '已取消选择', files: [] };
    const file = result.filePaths[0]; const stats = await fs.promises.stat(file);
    if (!extensions.includes(path.extname(file).slice(1).toLowerCase()) || !stats.isFile()) throw new Error('不支持的标书文件');
    return { success: true, files: [{ file_path: file, file_name: path.basename(file), size: stats.size, modified_at: stats.mtime.toISOString() }] };
  });
}
module.exports = { registerFullBlindCheckIpc };
