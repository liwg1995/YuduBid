'use strict';

const DUPLICATE_CHECK_CAPABILITY_ID = 'bid.duplicate-check.summary.read';
const REJECTION_CHECK_CAPABILITY_ID = 'bid.rejection-check.summary.read';
const DUPLICATE_DOCUMENT_IMPORT_CAPABILITY_ID = 'bid.duplicate-check.document.import';
const DUPLICATE_ANALYSIS_START_CAPABILITY_ID = 'bid.duplicate-check.analysis.start';
const REJECTION_DOCUMENT_IMPORT_CAPABILITY_ID = 'bid.rejection-check.document.import';
const REJECTION_EXTRACTION_START_CAPABILITY_ID = 'bid.rejection-check.extraction.start';
const REJECTION_RUN_START_CAPABILITY_ID = 'bid.rejection-check.run.start';
const SAFE_STATUSES = new Set(['idle', 'pending', 'running', 'success', 'error']);

function safeStatus(value) {
  const status = String(value || 'idle');
  return SAFE_STATUSES.has(status) ? status : 'idle';
}

function safeProgress(value) {
  const progress = Number(value || 0);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
}

function safeCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

function summarizeTask(task) {
  return {
    status: safeStatus(task?.status),
    progress: safeProgress(task?.progress),
  };
}

function summarizeAnalysis(analysis) {
  const status = safeStatus(analysis?.status);
  return {
    status,
    progress: safeProgress(analysis?.progress),
    ready: status === 'success',
  };
}

function createDuplicateCheckSummary(state) {
  const analyses = {
    metadata: summarizeAnalysis(state?.metadataAnalysis),
    outline: summarizeAnalysis(state?.outlineAnalysis),
    content: summarizeAnalysis(state?.contentAnalysis),
    image: summarizeAnalysis(state?.imageAnalysis),
  };
  return {
    module: 'duplicate-check',
    step: String(state?.step || 'upload').slice(0, 40),
    documents: {
      tenderImported: Boolean(state?.tenderFile),
      bidFileCount: safeCount(Array.isArray(state?.bidFiles) ? state.bidFiles.length : 0),
    },
    task: summarizeTask(state?.analysisTask),
    analyses,
    completedAnalyses: Object.values(analyses).filter((item) => item.ready).length,
    totalAnalyses: Object.keys(analyses).length,
  };
}

function summarizeCheck(enabled, result) {
  return {
    enabled: Boolean(enabled),
    status: safeStatus(result?.status),
    findingCount: safeCount(Array.isArray(result?.findings) ? result.findings.length : 0),
  };
}

function createRejectionCheckSummary(state) {
  const bidDocumentCount = Array.isArray(state?.bidDocuments)
    ? state.bidDocuments.length
    : (state?.bidDocument ? 1 : 0);
  const checks = {
    rejection: summarizeCheck(state?.checkOptions?.rejectionCheck, state?.rejectionCheckResult),
    typo: summarizeCheck(state?.checkOptions?.typoCheck, state?.typoCheckResult),
    logic: summarizeCheck(state?.checkOptions?.logicCheck, state?.logicCheckResult),
  };
  const enabled = Object.values(checks).filter((item) => item.enabled);
  const extractionStatus = safeStatus(state?.invalidBidAndRejectionItems?.status);
  return {
    module: 'rejection-check',
    step: String(state?.step || 'documents').slice(0, 40),
    documents: {
      tenderImported: Boolean(state?.tenderDocument),
      bidImported: Boolean(state?.bidDocument || bidDocumentCount),
      bidDocumentCount: safeCount(bidDocumentCount),
    },
    extraction: {
      status: extractionStatus,
      ready: extractionStatus === 'success',
    },
    task: summarizeTask(state?.checkTask),
    checks,
    completedChecks: enabled.filter((item) => item.status === 'success').length,
    enabledChecks: enabled.length,
  };
}

function safeTask(task) {
  return { id: String(task?.task_id || '').slice(0, 128), status: safeStatus(task?.status), progress: safeProgress(task?.progress) };
}

function registerBidReviewCapabilities(capabilityRegistry, { duplicateCheckStore, rejectionCheckStore, fileService, taskService, onWorkspaceChanged }) {
  if (!capabilityRegistry || !duplicateCheckStore || !rejectionCheckStore || !fileService || !taskService) {
    throw new Error('招投标检查能力依赖未完整初始化');
  }
  capabilityRegistry.register({
    id: DUPLICATE_CHECK_CAPABILITY_ID,
    name: '标书查重工作区摘要',
    version: '1.0',
    permission: DUPLICATE_CHECK_CAPABILITY_ID,
  }, () => createDuplicateCheckSummary(duplicateCheckStore.loadDuplicateCheck()));

  capabilityRegistry.register({
    id: REJECTION_CHECK_CAPABILITY_ID,
    name: '废标项检查工作区摘要',
    version: '1.0',
    permission: REJECTION_CHECK_CAPABILITY_ID,
  }, () => createRejectionCheckSummary(rejectionCheckStore.loadRejectionCheck()));

  capabilityRegistry.register({ id: DUPLICATE_DOCUMENT_IMPORT_CAPABILITY_ID, name: '导入标书查重文件', version: '1.0', permission: DUPLICATE_DOCUMENT_IMPORT_CAPABILITY_ID }, async (args, plugin) => {
    const role = args?.role;
    if (!['tender', 'bid'].includes(role)) throw new Error('文件角色无效');
    const state = duplicateCheckStore.loadDuplicateCheck();
    if (state?.analysisTask?.status === 'running') throw new Error('标书查重正在运行，请完成后再调整文件');
    const result = await fileService.selectDuplicateCheckFiles({ multiple: role === 'bid' });
    if (!result?.success || !result.files?.length) return { imported: false, canceled: true, message: result?.message || '已取消选择' };
    let tenderFile = state?.tenderFile || null;
    let bidFiles = Array.isArray(state?.bidFiles) ? state.bidFiles : [];
    if (role === 'tender') tenderFile = result.files[0];
    else {
      const existing = new Set(bidFiles.map((file) => file.file_path));
      bidFiles = [...bidFiles, ...result.files.filter((file) => !existing.has(file.file_path))];
    }
    duplicateCheckStore.saveFiles({ tenderFile, bidFiles, step: 'upload', activeAnalysisTab: state?.activeAnalysisTab });
    onWorkspaceChanged?.('duplicate-check', plugin);
    return { imported: true, role, fileNames: result.files.map((file) => String(file?.file_name || '未命名文件').slice(0, 160)), bidFileCount: bidFiles.length };
  });

  capabilityRegistry.register({ id: DUPLICATE_ANALYSIS_START_CAPABILITY_ID, name: '启动标书查重', version: '1.0', permission: DUPLICATE_ANALYSIS_START_CAPABILITY_ID }, (_args, plugin) => {
    const state = duplicateCheckStore.loadDuplicateCheck();
    if (!Array.isArray(state?.bidFiles) || !state.bidFiles.length) throw new Error('请先导入至少一份投标文件');
    if (state?.analysisTask?.status === 'running') throw new Error('标书查重已经在运行');
    const task = taskService.startDuplicateAnalysis({ tenderFile: state.tenderFile || null, bidFiles: state.bidFiles, force: false });
    onWorkspaceChanged?.('duplicate-check', plugin);
    return { started: true, task: safeTask(task), summary: createDuplicateCheckSummary(duplicateCheckStore.loadDuplicateCheck()) };
  });

  capabilityRegistry.register({ id: REJECTION_DOCUMENT_IMPORT_CAPABILITY_ID, name: '导入废标检查文件', version: '1.0', permission: REJECTION_DOCUMENT_IMPORT_CAPABILITY_ID }, async (args, plugin) => {
    const role = args?.role;
    if (!['tender', 'bid'].includes(role)) throw new Error('文件角色无效');
    const result = role === 'tender' ? await rejectionCheckStore.importDocument('tender') : await rejectionCheckStore.importBidDocuments();
    if (!result?.success) return { imported: false, canceled: true, message: result?.message || '已取消选择' };
    onWorkspaceChanged?.('rejection-check', plugin);
    const summary = createRejectionCheckSummary(result.state || rejectionCheckStore.loadRejectionCheck());
    return { imported: true, role, message: String(result.message || '文件已导入').slice(0, 160), summary };
  });

  capabilityRegistry.register({ id: REJECTION_EXTRACTION_START_CAPABILITY_ID, name: '启动废标项提取', version: '1.0', permission: REJECTION_EXTRACTION_START_CAPABILITY_ID }, (_args, plugin) => {
    const state = rejectionCheckStore.loadRejectionCheck();
    if (!state?.tenderDocument) throw new Error('请先导入招标文件');
    if (state?.invalidBidAndRejectionItems?.status === 'running') throw new Error('废标项提取已经在运行');
    const task = taskService.startRejectionItemsExtraction({});
    onWorkspaceChanged?.('rejection-check', plugin);
    return { started: true, task: safeTask(task) };
  });

  capabilityRegistry.register({ id: REJECTION_RUN_START_CAPABILITY_ID, name: '启动废标项检查', version: '1.0', permission: REJECTION_RUN_START_CAPABILITY_ID }, (args, plugin) => {
    const checks = args?.checks || {};
    const runOptions = { rejectionCheck: checks.rejection === true, typoCheck: checks.typo === true, logicCheck: checks.logic === true };
    if (!Object.values(runOptions).some(Boolean)) throw new Error('请至少选择一种检查');
    const state = rejectionCheckStore.loadRejectionCheck();
    if (!(state?.bidDocument || state?.bidDocuments?.length)) throw new Error('请先导入投标文件');
    if (state?.checkTask?.status === 'running') throw new Error('废标项检查已经在运行');
    rejectionCheckStore.saveUiState({ checkOptions: runOptions });
    const task = taskService.startRejectionCheck({ runOptions });
    onWorkspaceChanged?.('rejection-check', plugin);
    return { started: true, task: safeTask(task) };
  });
}

module.exports = {
  DUPLICATE_CHECK_CAPABILITY_ID,
  REJECTION_CHECK_CAPABILITY_ID,
  DUPLICATE_DOCUMENT_IMPORT_CAPABILITY_ID,
  DUPLICATE_ANALYSIS_START_CAPABILITY_ID,
  REJECTION_DOCUMENT_IMPORT_CAPABILITY_ID,
  REJECTION_EXTRACTION_START_CAPABILITY_ID,
  REJECTION_RUN_START_CAPABILITY_ID,
  createDuplicateCheckSummary,
  createRejectionCheckSummary,
  registerBidReviewCapabilities,
};
