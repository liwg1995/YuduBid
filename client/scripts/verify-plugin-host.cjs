'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { app } = require('electron');
const { createPluginManager } = require('../electron/plugins/pluginManager.cjs');
const { registerBidReviewCapabilities } = require('../electron/plugins/bidReviewCapabilities.cjs');
const { registerFeasibilityReportCapabilities } = require('../electron/plugins/feasibilityReportCapabilities.cjs');
const { registerTechnicalPlanCapabilities } = require('../electron/plugins/technicalPlanCapabilities.cjs');
const { registerKnowledgeBaseCapabilities } = require('../electron/plugins/knowledgeBaseCapabilities.cjs');
const { registerBidOpportunityCapabilities } = require('../electron/plugins/bidOpportunityCapabilities.cjs');

async function main() {
  const packagePath = path.resolve(process.argv[2] || '');
  if (!packagePath || !fs.existsSync(packagePath)) throw new Error(`测试插件包不存在：${packagePath}`);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yudubid-plugin-host-'));
  app.setPath('userData', userDataDir);
  await app.whenReady();

  let receivedNavigationContext = false;
  let receivedWorkspaceSummary = false;
  let requestedSectionId = '';
  let requestedNavigation = null;
  let workspaceChangedSectionId = '';
  let aiCallCount = 0;
  let tenderImportCount = 0;
  let analysisStartCount = 0;
  let analysisTask = null;
  let outlineTask = null;
  let globalFactsTask = null;
  const knowledgeFolders = [{ id: 'folder-tech', name: '技术资料' }];
  const knowledgeDocuments = [{ id: 'knowledge-one', folder_id: 'folder-tech', file_name: '技术规范.docx', status: 'success', progress: 100, item_count: 12, source_path: '/private/knowledge.docx' }];
  const technicalProjects = [
    { id: 'tp-test', name: '测试技术方案项目', workflowKind: 'technical-plan', isActive: true },
    { id: 'tp-other', name: '备选技术方案项目', workflowKind: 'technical-plan', isActive: false },
  ];
  const opportunities = [
    { opportunityId: 'opp-one', title: '智慧园区采购项目', status: 'review', owner: '张经理', bidDeadline: '2026-10-10', tenderFile: { fileName: 'SECRET_TENDER.docx', path: '/private/opportunity/tender.docx' }, analysisTask: null, deepAnalysis: null, workflowStage: 'qualification', decisionOutcome: 'undecided', decisionReason: '内部评审中', decisionDueAt: '2026-09-10T10:00', nextAction: '组织资格预审', nextActionDueAt: '2026-09-08T09:00' },
    { opportunityId: 'opp-two', title: '城市数据平台项目', status: 'new', owner: '李经理', bidDeadline: '2026-11-08', tenderFile: null, analysisTask: null, deepAnalysis: null, workflowStage: 'discovery', decisionOutcome: 'undecided', decisionReason: '', decisionDueAt: '', nextAction: '', nextActionDueAt: '' },
  ];
  const opportunitySources = [
    { sourceId: 'source-central', name: '中央公开招标公告', enabled: true, baseUrl: 'https://secret.invalid', config: { token: 'SECRET_SOURCE_TOKEN' } },
    { sourceId: 'source-local', name: '地方公开招标公告', enabled: true, baseUrl: 'https://secret.invalid/local' },
  ];
  let opportunityScans = {};
  let opportunityScanBatch = { status: 'idle', total: 2, completed: 0, createdCount: 0, updatedCount: 0 };
  const manager = createPluginManager({
    app,
    aiService: {
      chat: async (request) => {
        aiCallCount += 1;
        receivedNavigationContext = request?.messages?.[0]?.content?.includes('技术方案') === true;
        receivedWorkspaceSummary = request?.messages?.[0]?.content?.includes('测试技术方案项目') === true
          && request?.messages?.[0]?.content?.includes('SECRET_BODY') === false
          && request?.messages?.[0]?.content?.includes('/private/workspace/tender.md') === false;
        return '<think>SECRET_INTERNAL_REASONING</think>\n插件对话验证通过';
      },
    },
  });
  registerTechnicalPlanCapabilities(manager.capabilityRegistry, {
    listProjects: (workflowKind) => ({
      projects: technicalProjects.filter((project) => project.workflowKind === workflowKind),
    }),
    loadTechnicalPlan: ({ workflowKind, projectId }) => {
      if (workflowKind !== 'technical-plan' || projectId !== 'tp-test') {
        throw new Error('摘要读取未使用用户明确选择的项目');
      }
      return {
      workflowKind: 'technical-plan',
      projectId: 'tp-test',
      projectName: '测试技术方案项目',
      step: 'content-edit',
      tenderFile: { fileName: '招标文件.docx', markdownPath: '/private/workspace/tender.md' },
      bidAnalysisProgress: analysisTask?.progress ?? 100,
      bidAnalysisTask: analysisTask || undefined,
      bidAnalysisTasks: {
        projectOverview: { status: 'success', content: 'SECRET_BODY' },
        techRequirements: { status: 'success', content: 'SECRET_BODY' },
      },
      outlineGenerationTask: outlineTask || undefined,
      outlineData: { outline: [{ id: 'one', title: '秘密章节标题', content: 'SECRET_BODY' }] },
      outlineMode: 'aligned',
      referenceKnowledgeDocumentIds: ['knowledge-two'],
      globalFactsTask: globalFactsTask || undefined,
      globalFacts: globalFactsTask ? [] : [{ id: 'fact', content: 'SECRET_BODY' }],
      };
    },
    createProject: ({ workflowKind, projectName }) => {
      technicalProjects.forEach((project) => { project.isActive = false; });
      const project = { id: `tp-created-${technicalProjects.length}`, name: projectName, workflowKind, isActive: true };
      technicalProjects.push(project);
      return { project, projects: technicalProjects };
    },
    deleteProject: ({ workflowKind, projectId }) => {
      const index = technicalProjects.findIndex((project) => project.workflowKind === workflowKind && project.id === projectId);
      if (index < 0) throw new Error('项目不存在');
      technicalProjects.splice(index, 1);
      const next = technicalProjects.find((project) => project.workflowKind === workflowKind) || null;
      technicalProjects.forEach((project) => { project.isActive = project.id === next?.id; });
      return {
        workflowKind,
        activeProjectId: next?.id || '',
        projects: technicalProjects.filter((project) => project.workflowKind === workflowKind),
      };
    },
    renameProject: ({ workflowKind, projectId, name }) => {
      const project = technicalProjects.find((item) => item.workflowKind === workflowKind && item.id === projectId);
      if (!project) throw new Error('项目不存在');
      project.name = name;
      return {
        workflowKind,
        activeProjectId: technicalProjects.find((item) => item.workflowKind === workflowKind && item.isActive)?.id || '',
        projects: technicalProjects.filter((item) => item.workflowKind === workflowKind),
      };
    },
    importTenderDocument: async ({ workflowKind, projectId }) => {
      if (workflowKind !== 'technical-plan' || projectId !== 'tp-test') throw new Error('文件导入未使用用户明确选择的项目');
      tenderImportCount += 1;
      return {
        success: true,
        state: { tenderFile: { fileName: '测试招标文件.docx', markdownPath: '/private/never-return.md' } },
        markdown: 'SECRET_IMPORTED_BODY',
      };
    },
    saveOutlineConfig: ({ workflowKind, projectId, outlineMode, referenceKnowledgeDocumentIds }) => {
      if (workflowKind !== 'technical-plan' || projectId !== 'tp-test' || outlineMode !== 'free'
        || JSON.stringify(referenceKnowledgeDocumentIds) !== JSON.stringify(['knowledge-one'])) {
        throw new Error('目录配置未使用聊天框确认值');
      }
      return {};
    },
  }, {
    knowledgeBaseService: {
      list: () => ({
        folders: [
          { id: 'folder-tech', name: '技术资料' },
          { id: 'folder-cases', name: '案例库' },
        ],
        documents: [
          { id: 'knowledge-one', folder_id: 'folder-tech', file_name: '技术规范.docx', status: 'success', item_count: 12, source_path: '/private/never-return.docx' },
          { id: 'knowledge-two', folder_id: 'folder-cases', file_name: '历史方案.docx', status: 'success', item_count: 28 },
          { id: 'knowledge-pending', folder_id: 'folder-tech', file_name: '未完成.docx', status: 'matching', item_count: 0 },
        ],
      }),
    },
    taskService: {
      startBidAnalysis: ({ workflowKind, projectId, mode }) => {
        if (workflowKind !== 'technical-plan' || projectId !== 'tp-test' || mode !== 'key') throw new Error('分析任务参数未受控');
        analysisStartCount += 1;
        analysisTask = { task_id: 'task-test', status: 'running', progress: 12 };
        return analysisTask;
      },
      startOutlineGeneration: ({ workflowKind, projectId, mode, reference_knowledge_document_ids: documentIds }) => {
        if (workflowKind !== 'technical-plan' || projectId !== 'tp-test' || mode !== 'free'
          || JSON.stringify(documentIds) !== JSON.stringify(['knowledge-one'])) {
          throw new Error('目录生成任务参数未受控');
        }
        outlineTask = { task_id: 'outline-test', status: 'running', progress: 8 };
        return outlineTask;
      },
      startGlobalFactsGeneration: ({ workflowKind, projectId }) => {
        if (workflowKind !== 'technical-plan' || projectId !== 'tp-test') throw new Error('全局事实任务参数未受控');
        globalFactsTask = { task_id: 'facts-test', status: 'running', progress: 15 };
        return globalFactsTask;
      },
    },
    onWorkspaceChanged: (sectionId, plugin) => manager.notifyWorkspaceChanged(sectionId, plugin),
  });
  registerKnowledgeBaseCapabilities(manager.capabilityRegistry, {
    list: () => ({ folders: knowledgeFolders, documents: knowledgeDocuments }),
    createFolder: (name) => {
      const folder = { id: `folder-${knowledgeFolders.length + 1}`, name, source_path: '/private/folder' };
      knowledgeFolders.push(folder);
      return folder;
    },
    renameFolder: (folderId, name) => {
      const folder = knowledgeFolders.find((item) => item.id === folderId);
      folder.name = name;
      return folder;
    },
    deleteFolder: (folderId) => {
      const index = knowledgeFolders.findIndex((item) => item.id === folderId);
      if (index >= 0) knowledgeFolders.splice(index, 1);
      for (let item = knowledgeDocuments.length - 1; item >= 0; item -= 1) if (knowledgeDocuments[item].folder_id === folderId) knowledgeDocuments.splice(item, 1);
      return { success: true, message: '已删除文件夹' };
    },
    deleteDocument: (documentId) => {
      const index = knowledgeDocuments.findIndex((item) => item.id === documentId);
      if (index >= 0) knowledgeDocuments.splice(index, 1);
      return { success: true, message: '已删除文档' };
    },
    uploadDocuments: async (folderId) => {
      const document = { id: 'knowledge-uploaded', folder_id: folderId, file_name: '新增资料.pdf', status: 'pending', progress: 0, item_count: 0, source_path: '/private/uploaded.pdf', markdown_path: '/private/uploaded.md' };
      knowledgeDocuments.push(document);
      return { success: true, message: '已加入处理任务', documents: [document] };
    },
    startMatching: () => ({ success: true }),
  }, {
    onWorkspaceChanged: (sectionId, plugin) => manager.notifyWorkspaceChanged(sectionId, plugin),
  });
  registerBidReviewCapabilities(manager.capabilityRegistry, {
    duplicateCheckStore: {
      loadDuplicateCheck: () => ({
        step: 'analysis',
        tenderFile: { fileName: 'SECRET_DUPLICATE.docx', path: '/private/duplicate/tender.docx' },
        bidFiles: [
          { fileName: 'SECRET_BID_1.docx', content: 'SECRET_DUPLICATE_BODY' },
          { fileName: 'SECRET_BID_2.docx', content: 'SECRET_DUPLICATE_BODY' },
        ],
        analysisTask: { status: 'running', progress: 60, logs: ['SECRET_TASK_LOG'] },
        metadataAnalysis: { status: 'success', progress: 100, values: ['SECRET_METADATA'] },
        outlineAnalysis: { status: 'running', progress: 45, titles: ['SECRET_OUTLINE'] },
        contentAnalysis: { status: 'pending', progress: 0, duplicateSentences: ['SECRET_SENTENCE'] },
        imageAnalysis: { status: 'pending', progress: 0, duplicateImages: [{ hash: 'SECRET_HASH' }] },
      }),
    },
    rejectionCheckStore: {
      loadRejectionCheck: () => ({
        step: 'check',
        tenderDocument: { fileName: 'SECRET_REJECTION.docx', content: 'SECRET_REJECTION_BODY' },
        bidDocument: { fileName: 'SECRET_REJECTION_BID.docx', path: '/private/rejection/bid.docx' },
        bidDocuments: [{ fileName: 'SECRET_REJECTION_BID.docx' }],
        invalidBidAndRejectionItems: { status: 'success', content: 'SECRET_CLAUSES' },
        checkOptions: { rejectionCheck: true, typoCheck: true, logicCheck: false },
        checkTask: { status: 'running', progress: 50, logs: ['SECRET_CHECK_LOG'] },
        rejectionCheckResult: { status: 'success', findings: [{ title: 'SECRET_FINDING_1' }, { title: 'SECRET_FINDING_2' }] },
        typoCheckResult: { status: 'running', findings: [{ originalExcerpt: 'SECRET_FINDING_3' }] },
        logicCheckResult: { status: 'idle', findings: [] },
        customCheckItems: 'SECRET_CUSTOM_CHECK',
      }),
      importDocument: async () => ({ success: false, message: '已取消选择' }),
      importBidDocuments: async () => ({ success: false, message: '已取消选择' }),
      saveUiState: () => ({}),
    },
    fileService: {
      selectDuplicateCheckFiles: async () => ({ success: false, message: '已取消选择', files: [] }),
    },
    taskService: {
      startDuplicateAnalysis: () => ({ task_id: 'duplicate-test', status: 'running', progress: 1 }),
      startRejectionItemsExtraction: () => ({ task_id: 'extraction-test', status: 'running', progress: 1 }),
      startRejectionCheck: () => ({ task_id: 'rejection-test', status: 'running', progress: 1 }),
    },
    onWorkspaceChanged: (sectionId, plugin) => manager.notifyWorkspaceChanged(sectionId, plugin),
  });
  registerFeasibilityReportCapabilities(manager.capabilityRegistry, {
    loadState: () => ({
      projectId: 'SECRET_PROJECT_ID',
      projectName: '测试可研项目',
      step: 'content',
      sourceFiles: [
        { fileName: 'SECRET_SOURCE_1.docx', markdownPath: '/private/feasibility/source-1.md' },
        { fileName: 'SECRET_SOURCE_2.docx', markdown: 'SECRET_SOURCE_BODY' },
      ],
      analysisMarkdown: 'SECRET_ANALYSIS_BODY',
      analysisTask: { status: 'success', progress: 100, logs: ['SECRET_ANALYSIS_LOG'] },
      outlineData: {
        outline: [{
          id: 'root',
          title: 'SECRET_OUTLINE_TITLE',
          children: [
            { id: 'one', title: 'SECRET_CHAPTER_1', content: 'SECRET_CONTENT_1' },
            { id: 'two', title: 'SECRET_CHAPTER_2', content: '' },
          ],
        }],
      },
      outlineTask: { status: 'success', progress: 100 },
      keyParametersMarkdown: 'SECRET_PARAMETERS_BODY',
      parametersTask: { status: 'success', progress: 100 },
      contentTask: { status: 'running', progress: 50, error: 'SECRET_TASK_ERROR' },
    }),
  });
  registerBidOpportunityCapabilities(manager.capabilityRegistry, {
    getSnapshot: () => ({
      opportunities,
      sources: opportunitySources,
      scans: opportunityScans,
      scanBatch: opportunityScanBatch,
      counts: {
        total: opportunities.length,
        new: opportunities.filter((item) => item.status === 'new').length,
        review: opportunities.filter((item) => item.status === 'review').length,
        following: opportunities.filter((item) => item.status === 'following').length,
        abandoned: opportunities.filter((item) => item.status === 'abandoned').length,
      },
    }),
    importOpportunityFile: async () => ({ success: false, message: '已取消选择' }),
    importTenderFile: async () => ({ success: false, message: '已取消选择' }),
    updateStatus: ({ opportunityId, status }) => {
      const opportunity = opportunities.find((item) => item.opportunityId === opportunityId);
      opportunity.status = status;
      return opportunity;
    },
    startDeepAnalysis: (opportunityId) => {
      const opportunity = opportunities.find((item) => item.opportunityId === opportunityId);
      opportunity.analysisTask = { status: 'running', progress: 18, logs: ['SECRET_ANALYSIS_LOG'] };
      return opportunity;
    },
    updateDecisionWorkflow: (payload) => {
      const opportunity = opportunities.find((item) => item.opportunityId === payload.opportunityId);
      Object.assign(opportunity, payload, { status: payload.decisionOutcome === 'no_bid' ? 'abandoned' : payload.decisionOutcome === 'bid' || payload.workflowStage === 'bidding' ? 'following' : opportunity.status });
      return opportunity;
    },
    bulkUpdate: ({ opportunityIds, status, owner }) => {
      let updatedCount = 0;
      for (const opportunity of opportunities.filter((item) => opportunityIds.includes(item.opportunityId))) {
        if (status) opportunity.status = status;
        if (owner !== undefined) opportunity.owner = owner;
        updatedCount += 1;
      }
      return { success: true, updatedCount };
    },
    startAllSourceScans: () => {
      opportunityScans = {
        'source-central': { sourceId: 'source-central', status: 'running', progress: 35, fetchedCount: 20, matchedCount: 3, createdCount: 2, updatedCount: 1, errors: ['SECRET_SCAN_ERROR'] },
      };
      opportunityScanBatch = { status: 'running', total: 2, completed: 0, createdCount: 2, updatedCount: 1 };
      return opportunityScanBatch;
    },
    sendTenderToTechnicalPlan: (opportunityId) => ({ opportunity: opportunities.find((item) => item.opportunityId === opportunityId), projectId: 'tp-from-opportunity', existing: false }),
    sendTenderToRejectionCheck: (opportunityId) => ({ opportunity: opportunities.find((item) => item.opportunityId === opportunityId), existing: false }),
    createPresalesProject: (opportunityId) => ({ opportunity: opportunities.find((item) => item.opportunityId === opportunityId), projectId: 'presales-from-opportunity', existing: false }),
  }, {
    onWorkspaceChanged: (sectionId, plugin) => manager.notifyWorkspaceChanged(sectionId, plugin),
  });
  const unsubscribe = manager.subscribe((event) => {
    if (event.type === 'navigation-requested') {
      requestedSectionId = event.sectionId || '';
      requestedNavigation = event;
    }
    if (event.type === 'workspace-changed') workspaceChangedSectionId = event.sectionId || '';
  });
  try {
    const installed = await manager.installFromPath(packagePath);
    if (installed.plugin?.id !== 'com.yudu.assistant' || installed.plugin.enabled) {
      throw new Error('插件安装状态不符合预期');
    }
    const enabled = await manager.enable('com.yudu.assistant');
    if (!enabled.plugin?.enabled || enabled.plugin.status !== 'running') {
      throw new Error('插件未完成独立进程握手');
    }
    const projectRequired = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '查看当前进度' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (projectRequired?.message?.presentation?.kind !== 'project-selection'
      || projectRequired.message.presentation.projects?.length !== 2
      || aiCallCount !== 0) {
      throw new Error('未选项目时未返回项目选择器，或错误默认了首个项目');
    }
    const selected = await manager.request('com.yudu.assistant', 'project.select', {
      projectId: 'tp-test',
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (selected?.selectedProject?.id !== 'tp-test') throw new Error('插件显式项目选择失败');
    const chat = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '你好' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (chat?.message?.content !== '插件对话验证通过' || !receivedNavigationContext || !receivedWorkspaceSummary) {
      throw new Error('插件对话 Capability 调用失败');
    }
    const capabilityIntroduction = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '你能做什么呀？' }],
      context: { sectionId: 'settings', title: '设置', description: '应用设置' },
    });
    const capabilityIntroductionContent = String(capabilityIntroduction?.message?.content || '');
    if (!capabilityIntroductionContent.includes('我是禹都 AI 智能助手')
      || !capabilityIntroductionContent.includes('当前页面：设置')
      || capabilityIntroductionContent.includes('YuduBid')
      || capabilityIntroductionContent.includes('YuduAssistant')
      || capabilityIntroductionContent.includes('Markdown')
      || capabilityIntroductionContent.includes('Sapiens')
      || aiCallCount !== 1) {
      throw new Error('插件能力介绍未走确定性免模型响应');
    }
    const navigation = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '前往招投标的技术方案' }],
      context: { sectionId: 'settings', title: '设置', description: '应用设置' },
    });
    if (navigation?.message?.content !== '已打开技术方案。' || requestedSectionId !== 'technical-plan') {
      throw new Error('插件安全页面导航调用失败');
    }
    const expandedNavigation = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '打开知识库' }],
      context: { sectionId: 'home', title: '首页', description: '产品概览' },
    });
    if (expandedNavigation?.message?.content !== '已打开知识库。' || requestedSectionId !== 'knowledge-base') {
      throw new Error('插件扩展页面导航调用失败');
    }
    const knowledgeHistory = await manager.request('com.yudu.assistant', 'history.get', {
      context: { sectionId: 'knowledge-base', title: '知识库', description: '素材、模板和案例资产' },
    });
    if (!knowledgeHistory?.messages?.some((item) => item.role === 'assistant' && item.content === '已打开知识库。')) {
      throw new Error('页面切换后未在目标页面恢复导航完成提示');
    }
    const knowledgeUploadRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '上传知识库文档' }],
      context: { sectionId: 'knowledge-base', title: '知识库', description: '素材、模板和案例资产' },
    });
    if (knowledgeUploadRequest?.message?.presentation?.kind !== 'knowledge-upload-configuration'
      || knowledgeUploadRequest.message.presentation.folders?.[0]?.name !== '技术资料') {
      throw new Error('知识库上传未在聊天框返回文件夹选择卡');
    }
    const knowledgeUpload = await manager.request('com.yudu.assistant', 'knowledge-base.upload', {
      folderId: 'folder-tech',
      context: { sectionId: 'knowledge-base', title: '知识库', description: '素材、模板和案例资产' },
    });
    const knowledgeUploadMessage = knowledgeUpload?.messages?.at(-1);
    if (knowledgeUploadMessage?.presentation?.kind !== 'progress'
      || !knowledgeUploadMessage.content.includes('新增资料.pdf')
      || /\/private\/|source_path|markdown_path/.test(JSON.stringify(knowledgeUpload))) {
      throw new Error('知识库上传结果未脱敏或未返回动态进度卡');
    }
    const folderRename = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '把文件夹技术资料重命名为项目资料' }],
      context: { sectionId: 'knowledge-base', title: '知识库', description: '素材、模板和案例资产' },
    });
    if (!folderRename?.message?.content?.includes('已重命名为 **项目资料**') || knowledgeFolders[0]?.name !== '项目资料') {
      throw new Error('知识库文件夹未通过对话重命名');
    }
    const documentDeleteRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '删除知识库文档：技术规范.docx' }],
      context: { sectionId: 'knowledge-base', title: '知识库', description: '素材、模板和案例资产' },
    });
    const knowledgeDeletePresentation = documentDeleteRequest?.message?.presentation;
    if (knowledgeDeletePresentation?.kind !== 'knowledge-target-confirmation'
      || knowledgeDeletePresentation.action !== 'document-delete'
      || !knowledgeDocuments.some((item) => item.id === 'knowledge-one')) {
      throw new Error('知识库文档删除前未返回目标确认卡');
    }
    const documentDelete = await manager.request('com.yudu.assistant', 'knowledge-base.target.confirm', {
      action: 'document-delete',
      targetId: 'knowledge-one',
      context: { sectionId: 'knowledge-base', title: '知识库', description: '素材、模板和案例资产' },
    });
    if (!documentDelete?.messages?.at(-1)?.content?.includes('整理结果已删除')
      || knowledgeDocuments.some((item) => item.id === 'knowledge-one')) {
      throw new Error('知识库文档未在二次确认后删除');
    }
    const opportunityRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '查看投标机会' }],
      context: { sectionId: 'home', title: '首页', description: '产品概览' },
    });
    if (opportunityRequest?.message?.presentation?.kind !== 'opportunity-selection'
      || opportunityRequest.message.presentation.opportunities?.length !== 2
      || opportunityRequest.message.presentation.opportunities?.some((item) => item.selected)
      || requestedSectionId !== 'bid-opportunity'
      || /SECRET_|\/private\//.test(JSON.stringify(opportunityRequest))) {
      throw new Error('投标机会未通过脱敏聊天卡明确选择，或错误默认了第一条');
    }
    const opportunityHistory = await manager.request('com.yudu.assistant', 'history.get', {
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (opportunityHistory?.messages?.at(-1)?.presentation?.kind !== 'opportunity-selection') {
      throw new Error('切换到投标机会页面后未恢复聊天选择卡');
    }
    const selectedOpportunity = await manager.request('com.yudu.assistant', 'opportunity.select', {
      opportunityId: 'opp-one',
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (selectedOpportunity?.selectedOpportunity?.id !== 'opp-one') throw new Error('投标机会显式选择失败');
    const statusRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '把当前投标机会状态改为跟进中' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (statusRequest?.message?.presentation?.kind !== 'opportunity-action-confirmation'
      || opportunities[0].status !== 'review') {
      throw new Error('投标机会状态更新未先二次确认');
    }
    const statusUpdated = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '确认更新' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (opportunities[0].status !== 'following' || !statusUpdated?.message?.content?.includes('跟进中')) {
      throw new Error('投标机会状态未通过聊天确认更新');
    }
    const analysisRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '开始深度分析' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (analysisRequest?.message?.presentation?.action !== 'analysis-start' || opportunities[0].analysisTask) {
      throw new Error('投标机会深度分析未先二次确认');
    }
    const analysisStarted = await manager.request('com.yudu.assistant', 'opportunity.action.confirm', {
      action: 'analysis-start',
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    const opportunityProgress = analysisStarted?.messages?.at(-1)?.presentation;
    if (opportunityProgress?.kind !== 'progress'
      || !opportunityProgress.items?.some((item) => item.label === '深度分析' && item.value === 18)
      || /SECRET_|\/private\//.test(JSON.stringify(analysisStarted))) {
      throw new Error('投标机会分析任务、动态进度或脱敏结果不符合预期');
    }
    const decisionRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '设置投标决策' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    const decisionPresentation = decisionRequest?.message?.presentation;
    if (decisionPresentation?.kind !== 'opportunity-decision-configuration'
      || decisionPresentation.workflowStage !== 'qualification'
      || decisionPresentation.decisionReason !== '内部评审中'
      || decisionPresentation.nextAction !== '组织资格预审') {
      throw new Error('投标决策现有配置未无损恢复到聊天卡');
    }
    const decisionConversation = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '阶段改为决策评审，决定不投标，原因是资质条件不满足，下一步行动是归档评审材料' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (decisionConversation?.message?.presentation?.workflowStage !== 'decision'
      || decisionConversation.message.presentation.decisionOutcome !== 'no_bid'
      || decisionConversation.message.presentation.decisionReason !== '资质条件不满足'
      || decisionConversation.message.presentation.nextAction !== '归档评审材料') {
      throw new Error('投标决策未通过自然语言同步更新聊天配置卡');
    }
    const decisionUpdated = await manager.request('com.yudu.assistant', 'opportunity.decision.update', {
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
      opportunityId: 'opp-one',
      workflowStage: 'decision',
      decisionOutcome: 'no_bid',
      decisionReason: '资质条件不满足',
      decisionDueAt: '2026-09-11T10:30',
      nextAction: '归档评审材料',
      nextActionDueAt: '2026-09-12T17:00',
    });
    if (opportunities[0].workflowStage !== 'decision'
      || opportunities[0].decisionOutcome !== 'no_bid'
      || opportunities[0].status !== 'abandoned'
      || !decisionUpdated?.messages?.at(-1)?.content?.includes('决策评审 · 决定不投')
      || decisionUpdated.messages.at(-1).presentation) {
      throw new Error('投标决策未通过聊天配置确认保存或状态未沿用原业务规则');
    }
    const bulkRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '批量更新投标机会' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (bulkRequest?.message?.presentation?.kind !== 'opportunity-bulk-configuration'
      || bulkRequest.message.presentation.opportunities?.length !== 2) {
      throw new Error('投标机会批量更新未返回聊天多选卡');
    }
    const bulkUpdated = await manager.request('com.yudu.assistant', 'opportunity.bulk.update', {
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
      opportunityIds: ['opp-one', 'opp-two'],
      status: 'review',
      owner: '王经理',
    });
    if (opportunities.some((item) => item.status !== 'review' || item.owner !== '王经理')
      || !bulkUpdated?.messages?.at(-1)?.content?.includes('已批量更新 2 条')) {
      throw new Error('投标机会批量更新未按聊天选择执行');
    }
    const scanRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '扫描最新投标机会' }],
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    if (scanRequest?.message?.presentation?.kind !== 'opportunity-action-confirmation'
      || scanRequest.message.presentation.action !== 'source-scan'
      || !scanRequest.message.content.includes('2 个启用的数据来源')
      || /SECRET_|secret\.invalid/.test(JSON.stringify(scanRequest))) {
      throw new Error('投标机会来源扫描未返回脱敏确认卡');
    }
    const scanStarted = await manager.request('com.yudu.assistant', 'opportunity.action.confirm', {
      action: 'source-scan',
      context: { sectionId: 'bid-opportunity', title: '投标机会', description: '机会发现与线索跟踪' },
    });
    const scanProgress = scanStarted?.messages?.at(-1)?.presentation;
    if (scanProgress?.kind !== 'progress'
      || !scanProgress.items?.some((item) => item.label === '发现与匹配机会' && item.status === 'running' && item.value === 18)
      || /SECRET_|secret\.invalid/.test(JSON.stringify(scanStarted))
      || workspaceChangedSectionId !== 'bid-opportunity') {
      throw new Error('投标机会来源扫描未启动、进度未同步或返回内容未脱敏');
    }
    const patentNavigation = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '前往专利生成的专利挖掘' }],
      context: { sectionId: 'home', title: '首页', description: '产品概览' },
    });
    if (patentNavigation?.message?.content !== '已打开专利挖掘。' || requestedSectionId !== 'patent-mining') {
      throw new Error('插件未识别一级模块与二级功能组合导航');
    }
    const projectViewNavigation = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '我想查看方案目录内容' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (projectViewNavigation?.message?.content !== '已打开项目 **测试技术方案项目** 的方案目录页面。'
      || requestedNavigation?.sectionId !== 'technical-plan'
      || requestedNavigation?.workflowKind !== 'technical-plan'
      || requestedNavigation?.projectId !== 'tp-test'
      || requestedNavigation?.viewId !== 'outline-generation') {
      throw new Error('插件未进入所选项目的方案目录页面');
    }
    const progress = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '查看当前进度' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const progressContent = String(progress?.message?.content || '');
    if (!progressContent.includes('测试技术方案项目')
      || !progressContent.includes('当前阶段：生成与编辑正文')
      || progressContent.includes('SECRET_BODY')
      || progressContent.includes('/private/workspace/tender.md')
      || progressContent.includes('秘密章节标题')
      || aiCallCount !== 1) {
      throw new Error('结构化进度查询未通过脱敏或免模型校验');
    }
    const guidance = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '下一步建议' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const guidanceContent = String(guidance?.message?.content || '');
    if (!guidanceContent.includes('下一步建议')
      || !guidanceContent.includes('正文已全部生成')
      || guidanceContent.includes('SECRET_BODY')
      || aiCallCount !== 1) {
      throw new Error('下一步建议未通过脱敏或免模型校验');
    }
    const duplicateProgress = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '查看当前进度' }],
      context: { sectionId: 'duplicate-check', title: '标书查重', description: '投标文件重复内容检查' },
    });
    const duplicateProgressContent = String(duplicateProgress?.message?.content || '');
    if (!duplicateProgressContent.includes('投标文件 2 份')
      || !duplicateProgressContent.includes('目录：进行中，45%')
      || /SECRET_|\/private\//.test(duplicateProgressContent)
      || aiCallCount !== 1) {
      throw new Error('标书查重摘要未通过脱敏或免模型校验');
    }
    const rejectionProgress = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '查看当前进度' }],
      context: { sectionId: 'rejection-check', title: '废标项检查', description: '废标风险与质量检查' },
    });
    const rejectionProgressContent = String(rejectionProgress?.message?.content || '');
    if (!rejectionProgressContent.includes('废标风险：已完成，发现 2 项')
      || !rejectionProgressContent.includes('错别字：进行中，发现 1 项')
      || /SECRET_|\/private\//.test(rejectionProgressContent)
      || aiCallCount !== 1) {
      throw new Error('废标项检查摘要未通过脱敏或免模型校验');
    }
    const feasibilityProgress = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '查看当前进度' }],
      context: { sectionId: 'feasibility-report', title: '可研报告', description: '可行性研究报告编制' },
    });
    const feasibilityProgressContent = String(feasibilityProgress?.message?.content || '');
    if (!feasibilityProgressContent.includes('测试可研项目')
      || !feasibilityProgressContent.includes('正文：1/2，50%')
      || feasibilityProgress?.message?.presentation?.items?.find((item) => item.label === '正文内容')?.value !== 50
      || /SECRET_|\/private\//.test(feasibilityProgressContent)
      || aiCallCount !== 1) {
      throw new Error('可研报告摘要未通过脱敏、结构化展示或免模型校验');
    }
    const stoppedForRestart = manager.disable('com.yudu.assistant');
    if (stoppedForRestart.plugin?.enabled || stoppedForRestart.plugin?.status !== 'stopped') {
      throw new Error('插件会话恢复测试前停用失败');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const restarted = await manager.enable('com.yudu.assistant');
    if (!restarted.plugin?.enabled || restarted.plugin?.status !== 'running') {
      throw new Error('插件会话恢复测试重新启用失败');
    }
    const history = await manager.request('com.yudu.assistant', 'history.get', {
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (!Array.isArray(history?.messages)
      || history?.selectedProject?.id !== 'tp-test'
      || !history.messages.some((item) => item.role === 'user' && item.content === '下一步建议')
      || !history.messages.some((item) => item.role === 'assistant' && item.content.includes('正文已全部生成'))) {
      throw new Error('插件页面会话恢复失败');
    }
    const storagePlugin = {
      manifest: { id: 'com.yudu.assistant', permissions: ['storage.local'] },
      dataDir: path.join(userDataDir, 'plugins-data', 'com.yudu.assistant'),
    };
    const otherPlugin = {
      manifest: { id: 'com.example.other', permissions: ['storage.local'] },
      dataDir: path.join(userDataDir, 'plugins-data', 'com.example.other'),
    };
    const isolatedRead = await manager.capabilityRegistry.invoke(otherPlugin, 'storage.get', { key: 'assistant.conversations.v1' });
    if (isolatedRead.found) throw new Error('插件私有存储未按插件目录隔离');
    let invalidStorageKeyRejected = false;
    try {
      await manager.capabilityRegistry.invoke(storagePlugin, 'storage.get', { key: '../registry' });
    } catch (error) {
      invalidStorageKeyRejected = String(error?.message || error).includes('键格式无效');
    }
    if (!invalidStorageKeyRejected) throw new Error('插件存储未拒绝非法键');
    let oversizedStorageRejected = false;
    try {
      await manager.capabilityRegistry.invoke(storagePlugin, 'storage.set', { key: 'oversized', value: 'x'.repeat(257 * 1024) });
    } catch (error) {
      oversizedStorageRejected = String(error?.message || error).includes('256KB');
    }
    if (!oversizedStorageRejected) throw new Error('插件存储未拒绝超限值');
    const clearedHistory = await manager.request('com.yudu.assistant', 'history.clear', {
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const emptyHistory = await manager.request('com.yudu.assistant', 'history.get', {
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (!clearedHistory?.cleared || !Array.isArray(emptyHistory?.messages) || emptyHistory.messages.length) {
      throw new Error('插件页面会话清空失败');
    }
    let navigationAllowlistRejected = false;
    try {
      await manager.capabilityRegistry.invoke(
        { manifest: { id: 'com.yudu.assistant', permissions: ['navigation.open'] } },
        'navigation.open',
        { sectionId: 'business-bid' },
      );
    } catch (error) {
      navigationAllowlistRejected = String(error?.message || error).includes('不允许打开页面');
    }
    if (!navigationAllowlistRejected) throw new Error('导航 Capability 未拒绝白名单外页面');
    let navigationViewAllowlistRejected = false;
    try {
      await manager.capabilityRegistry.invoke(
        { manifest: { id: 'com.yudu.assistant', permissions: ['navigation.open'] } },
        'navigation.open',
        { sectionId: 'technical-plan', workflowKind: 'technical-plan', projectId: 'tp-test', viewId: 'secret-step' },
      );
    } catch (error) {
      navigationViewAllowlistRejected = String(error?.message || error).includes('不允许打开工作步骤');
    }
    if (!navigationViewAllowlistRejected) throw new Error('导航 Capability 未拒绝白名单外工作步骤');
    const created = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '我想创建一个新项目，名为：资质' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const createdContent = String(created?.message?.content || '');
    if (!createdContent.includes('资质')
      || !createdContent.includes('已创建并选中')
      || created?.selectedProject?.name !== '资质'
      || !technicalProjects.some((project) => project.name === '资质')
      || workspaceChangedSectionId !== 'technical-plan'
      || aiCallCount !== 1) {
      throw new Error('插件未通过宿主 Capability 真实创建项目并刷新工作区');
    }
    const deleteRequested = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '删除项目名称为：资质 的项目' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const deletePresentation = deleteRequested?.message?.presentation;
    if (deletePresentation?.kind !== 'project-delete-confirmation'
      || deletePresentation?.project?.name !== '资质'
      || !technicalProjects.some((project) => project.name === '资质')) {
      throw new Error('项目删除请求未经过受控二次确认，或确认前已经删除');
    }
    const deleted = await manager.request('com.yudu.assistant', 'project.delete.confirm', {
      projectId: deletePresentation.project.id,
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (!deleted?.messages?.at(-1)?.content?.includes('已删除')
      || technicalProjects.some((project) => project.name === '资质')
      || deleted?.selectedProject?.id !== 'tp-test'
      || workspaceChangedSectionId !== 'technical-plan'
      || aiCallCount !== 1) {
      throw new Error('项目确认删除、选择回退或工作区刷新失败');
    }
    const renamed = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '把当前项目改名为测试方案新版' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (!String(renamed?.message?.content || '').includes('已重命名为')
      || renamed?.selectedProject?.id !== 'tp-test'
      || renamed?.selectedProject?.name !== '测试方案新版'
      || technicalProjects.find((project) => project.id === 'tp-test')?.name !== '测试方案新版'
      || workspaceChangedSectionId !== 'technical-plan'
      || aiCallCount !== 1) {
      throw new Error('项目重命名、选择名称同步或工作区刷新失败');
    }
    const importRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '上传招标文件' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (importRequest?.message?.presentation?.kind !== 'file-request'
      || importRequest.message.presentation.actionId !== 'technical-plan.import-tender'
      || tenderImportCount !== 0) {
      throw new Error('文件导入未先显示受控确认卡');
    }
    const imported = await manager.request('com.yudu.assistant', 'action.confirm', {
      actionId: 'technical-plan.import-tender',
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const importedMessage = imported?.messages?.at(-1);
    if (tenderImportCount !== 1
      || importedMessage?.presentation?.kind !== 'action-confirmation'
      || importedMessage.presentation.actionId !== 'technical-plan.analysis.start'
      || JSON.stringify(imported).includes('SECRET_IMPORTED_BODY')
      || JSON.stringify(imported).includes('/private/never-return.md')) {
      throw new Error('文件导入执行、脱敏返回或解析确认卡失败');
    }
    const started = await manager.request('com.yudu.assistant', 'action.confirm', {
      actionId: 'technical-plan.analysis.start',
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const startedMessage = started?.messages?.at(-1);
    if (analysisStartCount !== 1
      || startedMessage?.presentation?.kind !== 'progress'
      || !startedMessage.presentation.items?.some((item) => item.label === '招标分析')
      || workspaceChangedSectionId !== 'technical-plan') {
      throw new Error('招标文件分析启动或进度展示失败');
    }
    const outlineRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '生成大纲' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (outlineRequest?.message?.presentation?.kind !== 'outline-configuration'
      || outlineRequest.message.presentation.documents?.length !== 2
      || JSON.stringify(outlineRequest.message.presentation.selectedDocumentIds) !== JSON.stringify(['knowledge-two'])
      || JSON.stringify(outlineRequest).includes('/private/never-return.docx')
      || !outlineRequest?.message?.content?.includes('当前聊天框')
      || outlineTask
      || requestedNavigation?.sectionId !== 'technical-plan'
      || requestedNavigation?.workflowKind !== 'technical-plan'
      || requestedNavigation?.projectId !== 'tp-test'
      || requestedNavigation?.viewId !== 'outline-generation'
      || requestedNavigation?.panelId) {
      throw new Error('目录生成未在聊天框返回受控配置选项');
    }
    const outlineStarted = await manager.request('com.yudu.assistant', 'outline.start', {
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
      mode: 'free',
      documentIds: ['knowledge-one'],
    });
    const outlineStartedMessage = outlineStarted?.messages?.at(-1);
    if (!outlineTask
      || outlineStartedMessage?.presentation?.kind !== 'progress'
      || !outlineStartedMessage?.content?.includes('自由生成')
      || !outlineStartedMessage?.content?.includes('参考 1 个知识库文档')
      || workspaceChangedSectionId !== 'technical-plan') {
      throw new Error('聊天内目录配置未能启动任务或同步页面进度');
    }
    const globalFactsRequest = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '生成全局事实' }],
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    if (globalFactsRequest?.message?.presentation?.kind !== 'action-confirmation'
      || globalFactsRequest.message.presentation.actionId !== 'technical-plan.global-facts.start'
      || globalFactsTask) {
      throw new Error('全局事实整理未先显示受控确认卡');
    }
    const globalFactsStarted = await manager.request('com.yudu.assistant', 'action.confirm', {
      actionId: 'technical-plan.global-facts.start',
      context: { sectionId: 'technical-plan', title: '技术方案', description: '技术方案编制与导出' },
    });
    const globalFactsStartedMessage = globalFactsStarted?.messages?.at(-1);
    if (!globalFactsTask
      || globalFactsStartedMessage?.presentation?.kind !== 'progress'
      || !globalFactsStartedMessage.presentation.items?.some((item) => item.label === '全局事实' && item.value === 15)
      || workspaceChangedSectionId !== 'technical-plan') {
      throw new Error('全局事实任务启动、动态进度或页面联动失败');
    }
    const upgradePackagePath = path.join(userDataDir, 'yudu-assistant-upgrade-test.yudu-plugin');
    const upgradeZip = new AdmZip(packagePath);
    const upgradeManifest = JSON.parse(upgradeZip.readAsText('plugin.json'));
    upgradeManifest.version = '0.28.1';
    upgradeZip.updateFile('plugin.json', Buffer.from(`${JSON.stringify(upgradeManifest, null, 2)}\n`));
    const upgradeMainPath = upgradeManifest.entry.main;
    const upgradeMain = upgradeZip.readAsText(upgradeMainPath);
    if (!upgradeMain.includes('### 🐾 我能陪你做这些')) throw new Error('升级测试无法写入运行版本标记');
    upgradeZip.updateFile(upgradeMainPath, Buffer.from(upgradeMain.replace('### 🐾 我能陪你做这些', '### 插件热升级运行验证')));
    upgradeZip.writeZip(upgradePackagePath);
    const upgraded = await manager.installFromPath(upgradePackagePath);
    if (upgraded.plugin?.version !== '0.28.1' || upgraded.plugin?.enabled || upgraded.plugin?.status !== 'stopped') {
      throw new Error('运行中插件升级后未切换到待启用的新版本');
    }
    const upgradeEnabled = await manager.enable('com.yudu.assistant');
    if (!upgradeEnabled.plugin?.enabled || upgradeEnabled.plugin?.status !== 'running') {
      throw new Error('升级后的插件未能启动');
    }
    const upgradeProof = await manager.request('com.yudu.assistant', 'chat', {
      messages: [{ role: 'user', content: '你能做什么' }],
      context: { sectionId: 'settings', title: '设置', description: '应用设置' },
    });
    if (!String(upgradeProof?.message?.content || '').includes('插件热升级运行验证')) {
      throw new Error('运行中升级后仍在复用旧插件进程');
    }
    const disabled = manager.disable('com.yudu.assistant');
    if (disabled.plugin?.enabled || disabled.plugin?.status !== 'stopped') {
      throw new Error('插件停用状态不符合预期');
    }
    console.info(JSON.stringify({ installed: true, handshake: true, projectSelectionRequired: true, explicitProjectSelection: true, opportunitySelectionRequired: true, explicitOpportunitySelection: true, opportunityStatusConfirmation: true, opportunityAnalysisProgress: true, projectCreation: true, projectDeleteConfirmation: true, projectDeletion: true, projectRename: true, tenderImportConfirmation: true, tenderImport: true, analysisStart: true, outlineConfigNavigation: true, globalFactsConfirmation: true, globalFactsStart: true, reasoningFiltered: true, dynamicProgress: true, runtimeUpgradeRestart: true, workspaceRefreshEvent: true, chat: true, context: true, workspaceSummary: true, capabilityIntroduction: true, capabilityIntroductionWithoutAi: true, bidReviewSummaries: true, feasibilityReportSummary: true, markdownPresentation: true, progressPresentation: true, sensitiveContentExcluded: true, navigation: true, expandedBidNavigation: true, destinationNavigationHistory: true, hierarchicalNavigation: true, projectViewNavigation: true, navigationAllowlistRejected: true, navigationViewAllowlistRejected: true, structuredProgress: true, progressWithoutAi: true, nextStepGuidance: true, guidanceWithoutAi: true, conversationHistory: true, historyRestoredAfterRestart: true, historyClear: true, storageIsolation: true, storageLimits: true, disabled: true }, null, 2));
  } finally {
    unsubscribe();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
