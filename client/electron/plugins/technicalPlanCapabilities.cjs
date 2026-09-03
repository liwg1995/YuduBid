'use strict';

const CAPABILITY_ID = 'bid.technical-plan.summary.read';
const PROJECTS_LIST_CAPABILITY_ID = 'bid.technical-plan.projects.list';
const PROJECT_CREATE_CAPABILITY_ID = 'bid.technical-plan.project.create';
const PROJECT_DELETE_CAPABILITY_ID = 'bid.technical-plan.project.delete';
const PROJECT_RENAME_CAPABILITY_ID = 'bid.technical-plan.project.rename';
const DOCUMENT_IMPORT_CAPABILITY_ID = 'bid.technical-plan.document.import';
const ANALYSIS_START_CAPABILITY_ID = 'bid.technical-plan.analysis.start';
const OUTLINE_CONFIG_READ_CAPABILITY_ID = 'bid.technical-plan.outline.config.read';
const OUTLINE_START_CAPABILITY_ID = 'bid.technical-plan.outline.start';
const GLOBAL_FACTS_START_CAPABILITY_ID = 'bid.technical-plan.global-facts.start';

function normalizeWorkflowKind(value) {
  if (value === 'existing-plan-expansion') return value;
  if (!value || value === 'technical-plan') return 'technical-plan';
  throw new Error('不支持的技术方案工作流');
}

function safeText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function requireProject(technicalPlanStore, workflowKind, value) {
  const projectId = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(projectId)) throw new Error('请先选择有效项目');
  const projects = technicalPlanStore.listProjects(workflowKind)?.projects || [];
  const project = projects.find((item) => item?.id === projectId);
  if (!project) throw new Error('项目不存在、已删除或不属于当前工作流');
  return project;
}

function normalizeProjectName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 80) throw new Error('项目名称必须为 1-80 个字符');
  if (/[\\/\u0000-\u001f\u007f]/.test(name)) throw new Error('项目名称包含不支持的字符');
  return name;
}

function taskStatus(task) {
  return task?.status ? safeText(task.status, 24) : 'idle';
}

function taskProgress(task) {
  const value = Number(task?.progress || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function safeProject(project, workflowKind) {
  return {
    id: safeText(project?.id, 128),
    name: safeText(project?.name || '未命名项目', 160),
    workflowKind,
  };
}

function countOutline(items) {
  let totalSections = 0;
  let leafSections = 0;
  let completedSections = 0;
  for (const item of Array.isArray(items) ? items : []) {
    totalSections += 1;
    const children = Array.isArray(item?.children) ? item.children : [];
    if (children.length) {
      const childCounts = countOutline(children);
      totalSections += childCounts.totalSections;
      leafSections += childCounts.leafSections;
      completedSections += childCounts.completedSections;
    } else {
      leafSections += 1;
      if (String(item?.content || '').trim()) completedSections += 1;
    }
  }
  return { totalSections, leafSections, completedSections };
}

function loadAvailableKnowledgeDocuments(knowledgeBaseService) {
  const index = knowledgeBaseService?.list?.() || {};
  const folderNames = new Map((Array.isArray(index.folders) ? index.folders : []).map((folder) => [
    String(folder?.id || ''),
    safeText(folder?.name || '未分类', 120),
  ]));
  return (Array.isArray(index.documents) ? index.documents : [])
    .filter((document) => document?.status === 'success')
    .slice(0, 100)
    .map((document) => ({
      id: safeText(document?.id, 128),
      name: safeText(document?.file_name || '未命名文档', 160),
      folderName: folderNames.get(String(document?.folder_id || '')) || '未分类',
      itemCount: Math.max(0, Math.round(Number(document?.item_count || 0))),
    }))
    .filter((document) => /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(document.id));
}

function createSummary(state, workflowKind) {
  const bidItems = Object.values(state?.bidAnalysisTasks || {});
  const outlineCounts = countOutline(state?.outlineData?.outline);
  return {
    workflowKind,
    projectId: safeText(state?.projectId || 'default', 128),
    projectName: safeText(state?.projectName || state?.outlineData?.project_name || '未命名项目', 160),
    step: safeText(state?.step || 'document-analysis', 40),
    document: {
      imported: Boolean(state?.tenderFile || state?.originalPlanFile),
      fileName: safeText(state?.tenderFile?.fileName || state?.originalPlanFile?.fileName, 160),
    },
    bidAnalysis: {
      progress: Math.max(0, Math.min(100, Math.round(Number(state?.bidAnalysisProgress || 0)))),
      completed: bidItems.filter((item) => item?.status === 'success').length,
      total: bidItems.length,
      taskStatus: taskStatus(state?.bidAnalysisTask),
    },
    outline: {
      ready: Boolean(state?.outlineData?.outline?.length),
      totalSections: outlineCounts.totalSections,
      leafSections: outlineCounts.leafSections,
      taskStatus: taskStatus(state?.outlineGenerationTask),
      taskProgress: taskProgress(state?.outlineGenerationTask),
    },
    globalFacts: {
      count: Array.isArray(state?.globalFacts) ? state.globalFacts.length : 0,
      taskStatus: taskStatus(state?.globalFactsTask),
      taskProgress: taskProgress(state?.globalFactsTask),
    },
    content: {
      completedSections: outlineCounts.completedSections,
      totalSections: outlineCounts.leafSections,
      taskStatus: taskStatus(state?.contentGenerationTask),
      taskProgress: taskProgress(state?.contentGenerationTask),
    },
  };
}

function registerTechnicalPlanCapabilities(capabilityRegistry, technicalPlanStore, options = {}) {
  capabilityRegistry.register({
    id: PROJECTS_LIST_CAPABILITY_ID,
    name: '技术方案项目列表',
    version: '1.0',
    permission: PROJECTS_LIST_CAPABILITY_ID,
  }, (args) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    const result = technicalPlanStore.listProjects(workflowKind);
    return {
      workflowKind,
      projects: (Array.isArray(result?.projects) ? result.projects : []).map((project) => ({
        id: safeText(project?.id, 128),
        name: safeText(project?.name || '未命名项目', 160),
        isActive: Boolean(project?.isActive),
      })),
    };
  });

  capabilityRegistry.register({
    id: CAPABILITY_ID,
    name: '技术方案工作区摘要',
    version: '1.0',
    permission: CAPABILITY_ID,
  }, (args) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind, projectId: project.id });
    return createSummary(state, workflowKind);
  });

  capabilityRegistry.register({
    id: PROJECT_CREATE_CAPABILITY_ID,
    name: '创建技术方案项目',
    version: '1.0',
    permission: PROJECT_CREATE_CAPABILITY_ID,
  }, (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    const name = normalizeProjectName(args?.name);
    const result = technicalPlanStore.createProject({ workflowKind, projectName: name });
    const project = result?.project;
    if (!project?.id) throw new Error('项目创建失败');
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      created: true,
      project: {
        id: safeText(project.id, 128),
        name: safeText(project.name || name, 160),
        workflowKind,
      },
    };
  });

  capabilityRegistry.register({
    id: PROJECT_DELETE_CAPABILITY_ID,
    name: '删除技术方案项目',
    version: '1.0',
    permission: PROJECT_DELETE_CAPABILITY_ID,
  }, (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    if (project.id === 'default' || project.isLegacy) throw new Error('历史项目不能直接删除，请先创建独立项目');
    const result = technicalPlanStore.deleteProject({ workflowKind, projectId: project.id });
    const projects = (Array.isArray(result?.projects) ? result.projects : []).map((item) => ({
      id: safeText(item?.id, 128),
      name: safeText(item?.name || '未命名项目', 160),
      isActive: Boolean(item?.isActive),
    }));
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      deleted: true,
      deletedProject: {
        id: safeText(project.id, 128),
        name: safeText(project.name || '未命名项目', 160),
        workflowKind,
      },
      activeProjectId: safeText(result?.activeProjectId || projects.find((item) => item.isActive)?.id, 128),
      projects,
    };
  });

  capabilityRegistry.register({
    id: PROJECT_RENAME_CAPABILITY_ID,
    name: '重命名技术方案项目',
    version: '1.0',
    permission: PROJECT_RENAME_CAPABILITY_ID,
  }, (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const name = normalizeProjectName(args?.name);
    const result = technicalPlanStore.renameProject({ workflowKind, projectId: project.id, name });
    const projects = (Array.isArray(result?.projects) ? result.projects : []).map((item) => ({
      id: safeText(item?.id, 128),
      name: safeText(item?.name || '未命名项目', 160),
      isActive: Boolean(item?.isActive),
    }));
    const renamedProject = projects.find((item) => item.id === project.id);
    if (!renamedProject) throw new Error('项目重命名失败');
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      renamed: true,
      project: { ...renamedProject, workflowKind },
      projects,
    };
  });

  capabilityRegistry.register({
    id: DOCUMENT_IMPORT_CAPABILITY_ID,
    name: '导入技术方案招标文件',
    version: '1.0',
    permission: DOCUMENT_IMPORT_CAPABILITY_ID,
  }, async (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    if (workflowKind !== 'technical-plan') throw new Error('当前只支持在技术方案中导入招标文件');
    if (args?.documentKind !== 'tender') throw new Error('当前只支持导入招标文件');
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const result = await technicalPlanStore.importTenderDocument({ workflowKind, projectId: project.id });
    if (!result?.success) {
      return {
        imported: false,
        canceled: true,
        message: safeText(result?.message || '已取消导入', 160),
        project: safeProject(project, workflowKind),
      };
    }
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      imported: true,
      document: {
        kind: 'tender',
        fileName: safeText(result?.state?.tenderFile?.fileName || '招标文件', 160),
      },
      project: safeProject(project, workflowKind),
    };
  });

  capabilityRegistry.register({
    id: ANALYSIS_START_CAPABILITY_ID,
    name: '启动招标文件分析',
    version: '1.0',
    permission: ANALYSIS_START_CAPABILITY_ID,
  }, (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    if (workflowKind !== 'technical-plan') throw new Error('当前只支持启动技术方案招标文件分析');
    if (args?.mode && args.mode !== 'key') throw new Error('当前只支持关键内容分析');
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind, projectId: project.id });
    if (!state?.tenderFile) throw new Error('请先导入招标文件');
    if (!options.taskService?.startBidAnalysis) throw new Error('招标文件分析服务尚未初始化');
    const task = options.taskService.startBidAnalysis({
      workflowKind,
      projectId: project.id,
      mode: 'key',
      force_rerun: false,
    });
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      started: true,
      task: {
        id: safeText(task?.task_id, 128),
        status: taskStatus(task),
        progress: taskProgress(task),
      },
      project: safeProject(project, workflowKind),
    };
  });

  capabilityRegistry.register({
    id: OUTLINE_CONFIG_READ_CAPABILITY_ID,
    name: '读取技术方案目录生成选项',
    version: '1.0',
    permission: OUTLINE_CONFIG_READ_CAPABILITY_ID,
  }, (args) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    if (workflowKind !== 'technical-plan') throw new Error('当前只支持配置技术方案目录');
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind, projectId: project.id });
    if (!state?.tenderFile) throw new Error('请先导入并解析招标文件');
    const requiredItems = ['projectOverview', 'techRequirements'];
    if (requiredItems.some((itemId) => state?.bidAnalysisTasks?.[itemId]?.status !== 'success')) {
      throw new Error('请先完成关键招标文件解析');
    }
    const documents = loadAvailableKnowledgeDocuments(options.knowledgeBaseService);
    const availableIds = new Set(documents.map((document) => document.id));
    const selectedDocumentIds = [...new Set(Array.isArray(state?.referenceKnowledgeDocumentIds) ? state.referenceKnowledgeDocumentIds : [])]
      .map((id) => String(id || '').trim())
      .filter((id) => availableIds.has(id));
    return {
      project: safeProject(project, workflowKind),
      selectedMode: ['free', 'aligned', 'response-file'].includes(state?.outlineMode) ? state.outlineMode : 'aligned',
      selectedDocumentIds,
      documents,
    };
  });

  capabilityRegistry.register({
    id: OUTLINE_START_CAPABILITY_ID,
    name: '启动技术方案目录生成',
    version: '1.0',
    permission: OUTLINE_START_CAPABILITY_ID,
  }, (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    if (workflowKind !== 'technical-plan') throw new Error('当前只支持生成技术方案目录');
    const mode = String(args?.mode || '');
    if (!['free', 'aligned', 'response-file'].includes(mode)) throw new Error('请选择有效的目录生成方式');
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind, projectId: project.id });
    if (!state?.tenderFile) throw new Error('请先导入并解析招标文件');
    const requiredItems = ['projectOverview', 'techRequirements'];
    if (requiredItems.some((itemId) => state?.bidAnalysisTasks?.[itemId]?.status !== 'success')) {
      throw new Error('请先完成关键招标文件解析');
    }
    const requestedDocumentIds = [...new Set(Array.isArray(args?.referenceKnowledgeDocumentIds) ? args.referenceKnowledgeDocumentIds : [])]
      .map((id) => String(id || '').trim());
    if (requestedDocumentIds.length > 100 || requestedDocumentIds.some((id) => !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(id))) {
      throw new Error('参考知识库文档选择无效');
    }
    const availableIds = new Set(loadAvailableKnowledgeDocuments(options.knowledgeBaseService).map((document) => document.id));
    if (requestedDocumentIds.some((id) => !availableIds.has(id))) throw new Error('参考知识库文档不存在或尚未整理完成');
    if (!options.taskService?.startOutlineGeneration) throw new Error('方案目录生成服务尚未初始化');
    technicalPlanStore.saveOutlineConfig({
      workflowKind,
      projectId: project.id,
      outlineMode: mode,
      referenceKnowledgeDocumentIds: requestedDocumentIds,
    });
    const task = options.taskService.startOutlineGeneration({
      workflowKind,
      projectId: project.id,
      mode,
      reference_knowledge_document_ids: requestedDocumentIds,
    });
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      started: true,
      task: {
        id: safeText(task?.task_id, 128),
        status: taskStatus(task),
        progress: taskProgress(task),
      },
      project: safeProject(project, workflowKind),
    };
  });

  capabilityRegistry.register({
    id: GLOBAL_FACTS_START_CAPABILITY_ID,
    name: '启动技术方案全局事实整理',
    version: '1.0',
    permission: GLOBAL_FACTS_START_CAPABILITY_ID,
  }, (args, plugin) => {
    const workflowKind = normalizeWorkflowKind(args?.workflowKind);
    if (workflowKind !== 'technical-plan') throw new Error('当前只支持整理技术方案全局事实');
    const project = requireProject(technicalPlanStore, workflowKind, args?.projectId);
    const state = technicalPlanStore.loadTechnicalPlan({ workflowKind, projectId: project.id });
    if (!state?.outlineData?.outline?.length) throw new Error('请先生成并确认方案目录');
    if (!options.taskService?.startGlobalFactsGeneration) throw new Error('全局事实整理服务尚未初始化');
    const task = options.taskService.startGlobalFactsGeneration({
      workflowKind,
      projectId: project.id,
    });
    options.onWorkspaceChanged?.(workflowKind, plugin);
    return {
      started: true,
      task: {
        id: safeText(task?.task_id, 128),
        status: taskStatus(task),
        progress: taskProgress(task),
      },
      project: safeProject(project, workflowKind),
    };
  });
}

module.exports = {
  CAPABILITY_ID,
  PROJECTS_LIST_CAPABILITY_ID,
  PROJECT_CREATE_CAPABILITY_ID,
  PROJECT_DELETE_CAPABILITY_ID,
  PROJECT_RENAME_CAPABILITY_ID,
  DOCUMENT_IMPORT_CAPABILITY_ID,
  ANALYSIS_START_CAPABILITY_ID,
  OUTLINE_CONFIG_READ_CAPABILITY_ID,
  OUTLINE_START_CAPABILITY_ID,
  GLOBAL_FACTS_START_CAPABILITY_ID,
  createSummary,
  registerTechnicalPlanCapabilities,
};
