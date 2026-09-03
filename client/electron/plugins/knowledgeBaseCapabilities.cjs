'use strict';

const SUMMARY_CAPABILITY_ID = 'bid.knowledge-base.summary.read';
const FOLDER_CREATE_CAPABILITY_ID = 'bid.knowledge-base.folder.create';
const DOCUMENTS_UPLOAD_CAPABILITY_ID = 'bid.knowledge-base.documents.upload';
const DOCUMENT_MATCH_START_CAPABILITY_ID = 'bid.knowledge-base.document.match.start';
const FOLDER_RENAME_CAPABILITY_ID = 'bid.knowledge-base.folder.rename';
const FOLDER_DELETE_CAPABILITY_ID = 'bid.knowledge-base.folder.delete';
const DOCUMENT_DELETE_CAPABILITY_ID = 'bid.knowledge-base.document.delete';
const SAFE_STATUSES = new Set(['pending', 'copying', 'converting', 'extracting', 'ready_for_matching', 'matching', 'recovering', 'analyzing', 'saving', 'success', 'error']);

function safeText(value, length) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

function safeProgress(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function safeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function createKnowledgeBaseSummary(index) {
  const folders = (Array.isArray(index?.folders) ? index.folders : []).slice(0, 200).map((folder) => ({
    id: safeText(folder?.id, 128),
    name: safeText(folder?.name, 120),
  })).filter((folder) => folder.id && folder.name);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const documents = (Array.isArray(index?.documents) ? index.documents : []).slice(0, 500).map((document) => {
    const status = safeText(document?.status, 40);
    return {
      id: safeText(document?.id, 128),
      folderId: safeText(document?.folder_id, 128),
      name: safeText(document?.file_name, 160),
      status: SAFE_STATUSES.has(status) ? status : 'error',
      progress: safeProgress(document?.progress),
      itemCount: safeCount(document?.item_count),
    };
  }).filter((document) => document.id && document.name && folderIds.has(document.folderId));
  return {
    module: 'knowledge-base',
    folders,
    documents,
    counts: {
      folders: folders.length,
      documents: documents.length,
      processing: documents.filter((document) => !['success', 'error'].includes(document.status)).length,
      completed: documents.filter((document) => document.status === 'success').length,
      failed: documents.filter((document) => document.status === 'error').length,
    },
  };
}

function monitorUploadedDocuments(knowledgeBaseService, documentIds, plugin, onWorkspaceChanged) {
  const pending = new Set(documentIds);
  let signature = '';
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    try {
      const summary = createKnowledgeBaseSummary(knowledgeBaseService.list());
      const tracked = summary.documents.filter((document) => pending.has(document.id));
      const nextSignature = tracked.map((document) => `${document.id}:${document.status}:${document.progress}`).join('|');
      if (nextSignature && nextSignature !== signature) {
        signature = nextSignature;
        onWorkspaceChanged?.('knowledge-base', plugin);
      }
      if (!tracked.length || tracked.every((document) => ['success', 'error'].includes(document.status)) || ticks >= 900) clearInterval(timer);
    } catch {
      clearInterval(timer);
    }
  }, 1000);
  timer.unref?.();
}

function registerKnowledgeBaseCapabilities(capabilityRegistry, knowledgeBaseService, { onWorkspaceChanged } = {}) {
  if (!capabilityRegistry || !knowledgeBaseService) throw new Error('知识库能力依赖未完整初始化');

  capabilityRegistry.register({ id: SUMMARY_CAPABILITY_ID, name: '知识库摘要', version: '1.0', permission: SUMMARY_CAPABILITY_ID }, () => (
    createKnowledgeBaseSummary(knowledgeBaseService.list())
  ));

  capabilityRegistry.register({ id: FOLDER_CREATE_CAPABILITY_ID, name: '创建知识库文件夹', version: '1.0', permission: FOLDER_CREATE_CAPABILITY_ID }, (args, plugin) => {
    const name = safeText(args?.name, 80);
    if (!name) throw new Error('请输入文件夹名称');
    const current = createKnowledgeBaseSummary(knowledgeBaseService.list());
    if (current.folders.some((folder) => folder.name === name)) throw new Error('已存在同名知识库文件夹');
    const folder = knowledgeBaseService.createFolder(name);
    onWorkspaceChanged?.('knowledge-base', plugin);
    return { created: true, folder: { id: safeText(folder?.id, 128), name: safeText(folder?.name, 120) } };
  });

  capabilityRegistry.register({ id: DOCUMENTS_UPLOAD_CAPABILITY_ID, name: '上传知识库文档', version: '1.0', permission: DOCUMENTS_UPLOAD_CAPABILITY_ID }, async (args, plugin) => {
    const folderId = safeText(args?.folderId, 128);
    const before = createKnowledgeBaseSummary(knowledgeBaseService.list());
    const folder = before.folders.find((item) => item.id === folderId);
    if (!folder) throw new Error('请选择有效的知识库文件夹');
    const result = await knowledgeBaseService.uploadDocuments(folderId);
    if (!result?.success) return { uploaded: false, canceled: true, message: safeText(result?.message || '已取消选择', 160) };
    const documents = (Array.isArray(result.documents) ? result.documents : []).map((document) => ({
      id: safeText(document?.id, 128),
      name: safeText(document?.file_name, 160),
      status: SAFE_STATUSES.has(document?.status) ? document.status : 'pending',
      progress: safeProgress(document?.progress),
    })).filter((document) => document.id && document.name);
    onWorkspaceChanged?.('knowledge-base', plugin);
    monitorUploadedDocuments(knowledgeBaseService, documents.map((document) => document.id), plugin, onWorkspaceChanged);
    return { uploaded: true, folder, documents };
  });

  capabilityRegistry.register({ id: DOCUMENT_MATCH_START_CAPABILITY_ID, name: '整理知识库文档', version: '1.0', permission: DOCUMENT_MATCH_START_CAPABILITY_ID }, (args, plugin) => {
    const documentId = safeText(args?.documentId, 128);
    const summary = createKnowledgeBaseSummary(knowledgeBaseService.list());
    const document = summary.documents.find((item) => item.id === documentId);
    if (!document) throw new Error('知识库文档不存在');
    if (!['ready_for_matching', 'success', 'error'].includes(document.status)) throw new Error('请等待文档解析完成后再整理');
    const result = knowledgeBaseService.startMatching(documentId, 20);
    if (!result?.success) throw new Error(safeText(result?.message || '未能启动知识整理', 160));
    onWorkspaceChanged?.('knowledge-base', plugin);
    monitorUploadedDocuments(knowledgeBaseService, [documentId], plugin, onWorkspaceChanged);
    return { started: true, document: { id: document.id, name: document.name, status: 'matching', progress: Math.max(66, document.progress) } };
  });

  capabilityRegistry.register({ id: FOLDER_RENAME_CAPABILITY_ID, name: '重命名知识库文件夹', version: '1.0', permission: FOLDER_RENAME_CAPABILITY_ID }, (args, plugin) => {
    const folderId = safeText(args?.folderId, 128);
    const name = safeText(args?.name, 80);
    if (!name) throw new Error('请输入新的文件夹名称');
    const summary = createKnowledgeBaseSummary(knowledgeBaseService.list());
    const folder = summary.folders.find((item) => item.id === folderId);
    if (!folder) throw new Error('知识库文件夹不存在');
    if (summary.folders.some((item) => item.id !== folderId && item.name === name)) throw new Error('已存在同名知识库文件夹');
    const renamed = knowledgeBaseService.renameFolder(folderId, name);
    onWorkspaceChanged?.('knowledge-base', plugin);
    return { renamed: true, folder: { id: safeText(renamed?.id, 128), name: safeText(renamed?.name, 120) } };
  });

  capabilityRegistry.register({ id: FOLDER_DELETE_CAPABILITY_ID, name: '删除知识库文件夹', version: '1.0', permission: FOLDER_DELETE_CAPABILITY_ID }, (args, plugin) => {
    const folderId = safeText(args?.folderId, 128);
    const expectedName = safeText(args?.expectedName, 120);
    const summary = createKnowledgeBaseSummary(knowledgeBaseService.list());
    const folder = summary.folders.find((item) => item.id === folderId);
    if (!folder || folder.name !== expectedName) throw new Error('文件夹已变化，请重新确认删除');
    const documentCount = summary.documents.filter((document) => document.folderId === folderId).length;
    const result = knowledgeBaseService.deleteFolder(folderId);
    onWorkspaceChanged?.('knowledge-base', plugin);
    return { deleted: true, target: { type: 'folder', id: folder.id, name: folder.name, documentCount }, message: safeText(result?.message, 180) };
  });

  capabilityRegistry.register({ id: DOCUMENT_DELETE_CAPABILITY_ID, name: '删除知识库文档', version: '1.0', permission: DOCUMENT_DELETE_CAPABILITY_ID }, (args, plugin) => {
    const documentId = safeText(args?.documentId, 128);
    const expectedName = safeText(args?.expectedName, 160);
    const summary = createKnowledgeBaseSummary(knowledgeBaseService.list());
    const document = summary.documents.find((item) => item.id === documentId);
    if (!document || document.name !== expectedName) throw new Error('文档已变化，请重新确认删除');
    if (!['success', 'error', 'ready_for_matching'].includes(document.status)) throw new Error('该文档正在处理中，请完成后再删除');
    const result = knowledgeBaseService.deleteDocument(documentId);
    onWorkspaceChanged?.('knowledge-base', plugin);
    return { deleted: true, target: { type: 'document', id: document.id, name: document.name }, message: safeText(result?.message, 180) };
  });
}

module.exports = {
  SUMMARY_CAPABILITY_ID,
  FOLDER_CREATE_CAPABILITY_ID,
  DOCUMENTS_UPLOAD_CAPABILITY_ID,
  DOCUMENT_MATCH_START_CAPABILITY_ID,
  FOLDER_RENAME_CAPABILITY_ID,
  FOLDER_DELETE_CAPABILITY_ID,
  DOCUMENT_DELETE_CAPABILITY_ID,
  createKnowledgeBaseSummary,
  registerKnowledgeBaseCapabilities,
};
