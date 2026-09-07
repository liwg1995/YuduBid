const { ipcMain } = require('electron');

function registerKnowledgeBaseIpc({ knowledgeBaseService, knowledgeImageService }) {
  ipcMain.handle('knowledge-base:get-migration-status', () => knowledgeBaseService.getMigrationStatus());
  ipcMain.handle('knowledge-base:migrate-legacy', () => knowledgeBaseService.migrateLegacy());
  ipcMain.handle('knowledge-base:list', () => knowledgeBaseService.list());
  ipcMain.handle('knowledge-base:create-folder', (_event, name) => knowledgeBaseService.createFolder(name));
  ipcMain.handle('knowledge-base:rename-folder', (_event, folderId, name) => knowledgeBaseService.renameFolder(folderId, name));
  ipcMain.handle('knowledge-base:delete-folder', (_event, folderId) => knowledgeBaseService.deleteFolder(folderId));
  ipcMain.handle('knowledge-base:delete-document', (_event, documentId) => knowledgeBaseService.deleteDocument(documentId));
  ipcMain.handle('knowledge-base:upload-documents', (event, folderId) => knowledgeBaseService.uploadDocuments(folderId, event.sender));
  ipcMain.handle('knowledge-base:start-matching', (event, documentId, batchSize) => knowledgeBaseService.startMatching(documentId, batchSize, event.sender));
  ipcMain.handle('knowledge-base:read-markdown', (_event, documentId) => knowledgeBaseService.readMarkdown(documentId));
  ipcMain.handle('knowledge-base:read-items', (_event, documentId) => knowledgeBaseService.readItems(documentId));
  ipcMain.handle('knowledge-base:read-analysis', (_event, documentId) => knowledgeBaseService.readAnalysis(documentId));
  ipcMain.handle('knowledge-image:list-folders', () => knowledgeImageService.listFolders());
  ipcMain.handle('knowledge-image:create-folder', (_event, name) => knowledgeImageService.createFolder(name));
  ipcMain.handle('knowledge-image:rename-folder', (_event, folderId, name) => knowledgeImageService.renameFolder(folderId, name));
  ipcMain.handle('knowledge-image:delete-folder', (_event, folderId, options) => knowledgeImageService.deleteFolder(folderId, options));
  ipcMain.handle('knowledge-image:list', (_event, folderId, query) => knowledgeImageService.list(folderId, query));
  ipcMain.handle('knowledge-image:upload', (_event, folderId) => knowledgeImageService.upload(folderId));
  ipcMain.handle('knowledge-image:update', (_event, imageId, patch) => knowledgeImageService.update(imageId, patch));
  ipcMain.handle('knowledge-image:move', (_event, imageIds, folderId) => knowledgeImageService.move(imageIds, folderId));
  ipcMain.handle('knowledge-image:add-tags', (_event, imageIds, tags) => knowledgeImageService.addTags(imageIds, tags));
  ipcMain.handle('knowledge-image:find-references', (_event, imageId) => knowledgeImageService.findReferences(imageId));
  ipcMain.handle('knowledge-image:remove', (_event, imageId, options) => knowledgeImageService.remove(imageId, options));
  ipcMain.handle('knowledge-image:get-data-url', (_event, imageId) => knowledgeImageService.getDataUrl(imageId));
  ipcMain.handle('knowledge-image:get-thumbnail-data-url', (_event, imageId) => knowledgeImageService.getThumbnailDataUrl(imageId));
}

module.exports = { registerKnowledgeBaseIpc };
