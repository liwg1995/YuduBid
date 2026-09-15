'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createToolRegistry } = require('../electron/agents/toolRegistry.cjs');
const { createAgentRegistry } = require('../electron/agents/agentRegistry.cjs');
const { TOOL_IDS, registerBidReadTools } = require('../electron/agents/tools/bidReadTools.cjs');
const { registerBidAgent } = require('../electron/agents/agents/bidAgent.cjs');
const { createAgentRuntime } = require('../electron/agents/agentRuntime.cjs');
const { createBidDryRunPlanner } = require('../electron/agents/planners/bidDryRunPlanner.cjs');
const { deriveBidAction } = require('../electron/agents/planners/bidDryRunPlanner.cjs');
const { deriveOfficialDocumentAction } = require('../electron/agents/planners/officialDocumentPlanner.cjs');
const { deriveGrantAction } = require('../electron/agents/planners/grantApplicationPlanner.cjs');
const { deriveProjectManagementAction } = require('../electron/agents/planners/projectManagementPlanner.cjs');
const { deriveThesisTutorAction } = require('../electron/agents/planners/thesisTutorPlanner.cjs');
const { deriveSoftwareCopyrightAction } = require('../electron/agents/planners/softwareCopyrightPlanner.cjs');
const { derivePatentGenerationAction } = require('../electron/agents/planners/patentGenerationPlanner.cjs');
const { createAgentRunStore } = require('../electron/agents/agentRunStore.cjs');
const { createApprovalService, hashArgs } = require('../electron/agents/approvalService.cjs');
const { OUTLINE_START_TOOL_ID, registerBidWriteTools } = require('../electron/agents/tools/bidWriteTools.cjs');
const { createAgentHost } = require('../electron/agents/agentHost.cjs');
const { evaluateAgentAdmission } = require('../electron/agents/agentAdmissionPolicy.cjs');
const { createConfigStore } = require('../electron/services/configStore.cjs');
const { nextAction: nextPresalesAction } = require('../electron/agents/planners/presalesDryRunPlanner.cjs');
const agentIpcSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'agentIpc.cjs'), 'utf-8');
const ipcIndexSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'index.cjs'), 'utf-8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf-8');
const developerPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'developer', 'pages', 'DeveloperTestPage.tsx'), 'utf-8');
const settingsPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'settings', 'pages', 'SettingsPage.tsx'), 'utf-8');
const presalesPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'presales-workbench', 'pages', 'PresalesWorkbenchPage.tsx'), 'utf-8');
const technicalPlanPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'technical-plan', 'pages', 'TechnicalPlanHome.tsx'), 'utf-8');
const officialDocumentPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'official-document', 'pages', 'OfficialDocumentDraftingPage.tsx'), 'utf-8');
const grantPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'grant-application', 'pages', 'GrantApplicationPage.tsx'), 'utf-8');
const projectManagementPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'project-management', 'pages', 'ProjectManagementPage.tsx'), 'utf-8');
const thesisTutorPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'thesis-tutor', 'pages', 'ThesisTutorPage.tsx'), 'utf-8');
const softwareCopyrightPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'software-copyright', 'pages', 'SoftwareCopyrightPage.tsx'), 'utf-8');
const patentGenerationPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'patent-generation', 'components', 'PatentComingPage.tsx'), 'utf-8');

async function verify() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-agent-foundation-'));
  const runStore = createAgentRunStore({ app: { getPath: () => testRoot }, maxRuns: 2 });
  try {
  const toolRegistry = createToolRegistry();
  toolRegistry.register({
    id: 'foundation.echo',
    name: '契约回显',
    version: '1.0.0',
    permission: 'foundation.read',
    risk: 'read',
    approval: 'never',
    idempotent: true,
  }, (args) => args);

  const agentRegistry = createAgentRegistry({ toolRegistry });
  agentRegistry.register({
    id: 'foundation-agent',
    name: '基础验证 Agent',
    version: '1.0.0',
    instructions: '仅用于验证 Agent 与 Tool 注册契约。',
    allowedTools: ['foundation.echo'],
    enabledByDefault: false,
  });

  assert.equal(toolRegistry.list().length, 1);
  assert.equal(agentRegistry.list().length, 1);
  assert.deepEqual(
    await toolRegistry.invoke('foundation.echo', { ok: true }, { permissions: ['foundation.read'] }),
    { ok: true },
  );
  await assert.rejects(
    toolRegistry.invoke('foundation.echo', {}, { permissions: [] }),
    /未获得 Tool 权限/,
  );
  assert.throws(() => agentRegistry.register({
    id: 'broken-agent',
    name: '错误 Agent',
    version: '1.0.0',
    instructions: '验证缺失 Tool。',
    allowedTools: ['missing.tool'],
  }), /未注册 Tool/);

  const guardedRegistry = createToolRegistry();
  guardedRegistry.register({
    id: 'foundation.write',
    name: '受控写入',
    version: '1.0.0',
    permission: 'foundation.write',
    risk: 'high',
    approval: 'always',
  }, () => ({ written: true }));
  await assert.rejects(
    guardedRegistry.invoke('foundation.write', {}, { permissions: ['foundation.write'] }),
    (error) => error?.code === 'AGENT_APPROVAL_REQUIRED',
  );

  let storeWriteCount = 0;
  const readToolRegistry = createToolRegistry();
  registerBidReadTools(readToolRegistry, {
    technicalPlanStore: {
      listProjects: () => ({
        activeProjectId: 'project-1',
        projects: [{ id: 'project-1', name: '测试项目', isActive: true }],
      }),
      loadTechnicalPlan: () => ({
        step: 'outline-generation',
        tenderFile: { fileName: '招标文件.docx' },
        bidAnalysisProgress: 100,
        bidAnalysisTasks: { projectOverview: { status: 'success' } },
        bidAnalysisTask: { status: 'success', progress: 100 },
        outlineGenerationTask: { status: 'success', progress: 100 },
        contentGenerationTask: { status: 'success', progress: 100 },
        outlineData: { outline: [{ id: 'chapter-1', title: '项目概述', content: '正文' }] },
        globalFacts: [],
      }),
      updateTechnicalPlan: () => { storeWriteCount += 1; },
    },
    taskService: {
      peekActiveTasks: () => [
        { task_id: 'task-1', type: 'outline-generation', group: 'technical-plan', workflow_kind: 'technical-plan', project_id: 'project-1', status: 'running', progress: 42 },
        { task_id: 'task-2', type: 'rejection-check-run', group: 'rejection-check', status: 'running', progress: 20 },
      ],
    },
    knowledgeBaseService: {
      list: () => ({
        folders: [{ id: 'folder-1', name: '企业资料' }],
        documents: [{ id: 'document-1', folder_id: 'folder-1', file_name: '公司简介.docx', status: 'success', progress: 100, item_count: 3 }],
      }),
    },
  });
  const bidAgentRegistry = createAgentRegistry({ toolRegistry: readToolRegistry });
  const bidAgent = registerBidAgent(bidAgentRegistry);
  const readContext = { permissions: bidAgent.allowedTools };
  const projects = await readToolRegistry.invoke(TOOL_IDS.projects, { workflowKind: 'technical-plan' }, readContext);
  const workspace = await readToolRegistry.invoke(TOOL_IDS.workspace, { workflowKind: 'technical-plan', projectId: 'project-1' }, readContext);
  const tasks = await readToolRegistry.invoke(TOOL_IDS.tasks, { workflowKind: 'technical-plan', projectId: 'project-1' }, readContext);
  const knowledgeBase = await readToolRegistry.invoke(TOOL_IDS.knowledgeBase, {}, readContext);

  assert.equal(projects.projects.length, 1);
  assert.equal(workspace.content.completedSections, 1);
  assert.equal(tasks.tasks.length, 1);
  assert.equal(knowledgeBase.counts.completed, 1);
  assert.equal(storeWriteCount, 0, '只读 Tool 不得调用 Store 写方法');
  assert.equal(bidAgent.enabledByDefault, false);

  const runtime = createAgentRuntime({
    agentRegistry: bidAgentRegistry,
    toolRegistry: readToolRegistry,
    planner: createBidDryRunPlanner(),
    runStore,
  });
  const dryRun = await runtime.runDryRun({
    agentId: bidAgent.id,
    goal: '分析当前技术方案进度并建议下一步',
    context: { workflowKind: 'technical-plan', projectId: 'project-1' },
  });
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.status, 'success');
  assert.equal(dryRun.steps.length, 4);
  assert.match(dryRun.recommendation, /生成并确认全局事实/);
  assert.equal(storeWriteCount, 0, 'dry-run 不得调用 Store 写方法');
  assert.equal(runStore.getRun(dryRun.runId)?.status, 'success');
  assert.equal(runStore.listRuns({ agentId: bidAgent.id }).length, 1);
  const bidBase = { document: { imported: true }, bidAnalysis: { taskStatus: 'success' }, outline: { ready: true }, globalFacts: { count: 1 }, content: { completedSections: 0, totalSections: 1 } };
  assert.equal(deriveBidAction(null), 'select-project');
  assert.equal(deriveBidAction({ ...bidBase, document: { imported: false } }), 'document-analysis');
  assert.equal(deriveBidAction({ ...bidBase, bidAnalysis: { taskStatus: 'idle' } }), 'bid-analysis');
  assert.equal(deriveBidAction({ ...bidBase, outline: { ready: false } }), 'outline-generation');
  assert.equal(deriveBidAction({ ...bidBase, globalFacts: { count: 0 } }), 'global-facts');
  assert.equal(deriveBidAction(bidBase), 'content-generation');
  assert.equal(deriveBidAction({ ...bidBase, content: { completedSections: 1, totalSections: 1 } }), 'review-and-export');
  assert.equal(deriveBidAction(bidBase, [{ id: 'active-task' }]), 'wait-active-task');

  const unsafeRegistry = createToolRegistry();
  unsafeRegistry.register({
    id: 'foundation.dangerous',
    name: '危险操作',
    version: '1.0.0',
    permission: 'foundation.dangerous',
    risk: 'high',
    approval: 'always',
  }, () => ({ changed: true }));
  const unsafeAgents = createAgentRegistry({ toolRegistry: unsafeRegistry });
  unsafeAgents.register({
    id: 'unsafe-agent',
    name: '危险验证 Agent',
    version: '1.0.0',
    instructions: '仅验证 dry-run 拦截。',
    allowedTools: ['foundation.dangerous'],
  });
  const unsafeRuntime = createAgentRuntime({
    agentRegistry: unsafeAgents,
    toolRegistry: unsafeRegistry,
    planner: {
      createPlan: () => ({ toolCalls: [{ id: 'danger', toolId: 'foundation.dangerous', args: {} }] }),
      createRecommendation: () => '',
    },
  });
  await assert.rejects(
    unsafeRuntime.runDryRun({ agentId: 'unsafe-agent', goal: '执行危险操作' }),
    (error) => /dry-run 禁止调用非只读 Tool/.test(error.message) && error.agentRun?.status === 'error',
  );

  runStore.saveRun({ runId: 'sanitized-run', agentId: 'bid-agent', status: 'success', instructions: '不得落盘', reasoning: '不得落盘', apiKey: 'secret' });
  const stored = runStore.getRun('sanitized-run');
  assert.equal(stored.instructions, undefined);
  assert.equal(stored.reasoning, undefined);
  assert.equal(stored.apiKey, undefined);
  runStore.saveRun({ runId: 'latest-run', agentId: 'bid-agent', status: 'success' });
  assert.equal(runStore.listRuns().length, 2, '运行记录必须按配置数量自动裁剪');

  let approvalClock = Date.parse('2026-09-14T00:00:00.000Z');
  const approvals = createApprovalService({ app: { getPath: () => testRoot }, clock: () => approvalClock });
  const approvalArgs = { projectId: 'project-1', options: { mode: 'aligned', chapters: [1, 2] } };
  const approval = approvals.requestApproval({
    runId: dryRun.runId,
    agentId: bidAgent.id,
    toolId: 'bid.technical-plan.outline.start',
    args: approvalArgs,
    summary: '为测试项目生成技术方案目录',
    ttlMs: 60000,
  });
  assert.equal(approval.status, 'pending');
  assert.equal(approval.args, undefined, '审批记录不得保存完整 Tool 参数');
  assert.equal(approval.argsHash, hashArgs({ options: { chapters: [1, 2], mode: 'aligned' }, projectId: 'project-1' }), '参数哈希应与对象键顺序无关');
  assert.equal(approvals.approve(approval.approvalId).status, 'approved');
  await assert.rejects(async () => approvals.consume({
    approvalId: approval.approvalId,
    runId: dryRun.runId,
    agentId: bidAgent.id,
    toolId: 'bid.technical-plan.outline.start',
    args: { ...approvalArgs, projectId: 'project-2' },
  }), /审批参数已经变化/);
  const consumed = approvals.consume({
    approvalId: approval.approvalId,
    runId: dryRun.runId,
    agentId: bidAgent.id,
    toolId: 'bid.technical-plan.outline.start',
    args: approvalArgs,
  });
  assert.equal(consumed.status, 'consumed');
  assert.throws(() => approvals.consume({
    approvalId: approval.approvalId,
    runId: dryRun.runId,
    agentId: bidAgent.id,
    toolId: 'bid.technical-plan.outline.start',
    args: approvalArgs,
  }), /已经使用/);

  const expiring = approvals.requestApproval({
    runId: 'run-expiring',
    agentId: bidAgent.id,
    toolId: 'bid.test.write',
    args: {},
    summary: '过期验证',
    ttlMs: 1000,
  });
  approvalClock += 1001;
  assert.equal(approvals.approve(expiring.approvalId).status, 'expired');

  let outlineStartCount = 0;
  let outlineStartPayload;
  const writeToolRegistry = createToolRegistry();
  registerBidWriteTools(writeToolRegistry, {
    technicalPlanStore: {
      listProjects: () => ({ projects: [{ id: 'project-1', name: '测试项目' }] }),
      loadTechnicalPlan: () => ({ bidAnalysisTask: { status: 'success' } }),
    },
    taskService: {
      startOutlineGeneration: (payload) => {
        outlineStartCount += 1;
        outlineStartPayload = payload;
        return { task_id: 'outline-task-1', type: 'outline-generation', status: 'running', progress: 1 };
      },
    },
  });
  const writeArgs = { workflowKind: 'technical-plan', projectId: 'project-1', mode: 'aligned', referenceKnowledgeDocumentIds: ['document-1'] };
  const writeApproval = approvals.requestApproval({
    runId: 'write-run-1',
    agentId: 'bid-agent',
    toolId: OUTLINE_START_TOOL_ID,
    args: writeArgs,
    summary: '为测试项目生成技术方案目录',
  });
  approvals.approve(writeApproval.approvalId);
  const approvalReceipt = approvals.consume({
    approvalId: writeApproval.approvalId,
    runId: 'write-run-1',
    agentId: 'bid-agent',
    toolId: OUTLINE_START_TOOL_ID,
    args: writeArgs,
  });
  await assert.rejects(
    writeToolRegistry.invoke(OUTLINE_START_TOOL_ID, { ...writeArgs, projectId: 'project-2' }, {
      runId: 'write-run-1', agentId: 'bid-agent', permissions: [OUTLINE_START_TOOL_ID], approval: approvalReceipt,
    }),
    (error) => error?.code === 'AGENT_APPROVAL_REQUIRED',
  );
  assert.equal(outlineStartCount, 0, '审批参数不匹配时不得进入业务 Service');
  const writeResult = await writeToolRegistry.invoke(OUTLINE_START_TOOL_ID, writeArgs, {
    runId: 'write-run-1', agentId: 'bid-agent', permissions: [OUTLINE_START_TOOL_ID], approval: approvalReceipt,
  });
  assert.equal(writeResult.started, true);
  assert.equal(outlineStartCount, 1);
  assert.deepEqual(outlineStartPayload.reference_knowledge_document_ids, ['document-1']);

  const approvedAgentRegistry = createAgentRegistry({ toolRegistry: writeToolRegistry });
  approvedAgentRegistry.register({
    id: 'bid-write-test-agent',
    name: '招投标写入验证 Agent',
    version: '0.1.0',
    instructions: '仅验证受控审批执行。',
    allowedTools: [OUTLINE_START_TOOL_ID],
  });
  const approvedRuntime = createAgentRuntime({
    agentRegistry: approvedAgentRegistry,
    toolRegistry: writeToolRegistry,
    planner: { createPlan: () => ({ toolCalls: [] }), createRecommendation: () => '' },
    runStore,
    approvalService: approvals,
  });
  const prepared = approvedRuntime.prepareApprovedToolCall({
    agentId: 'bid-write-test-agent',
    goal: '生成技术方案目录',
    toolId: OUTLINE_START_TOOL_ID,
    args: writeArgs,
    summary: '为测试项目生成技术方案目录',
  });
  assert.equal(prepared.run.status, 'waiting_approval');
  assert.equal(runStore.getRun(prepared.run.runId).status, 'waiting_approval');
  assert.equal(outlineStartCount, 1, '等待审批时不得提前执行 Tool');
  approvals.approve(prepared.approval.approvalId);
  const executed = await approvedRuntime.executeApprovedToolCall({
    runId: prepared.run.runId,
    approvalId: prepared.approval.approvalId,
  });
  assert.equal(executed.status, 'success');
  assert.equal(outlineStartCount, 2);
  assert.equal(runStore.getRun(prepared.run.runId).status, 'success');
  await assert.rejects(
    approvedRuntime.executeApprovedToolCall({ runId: prepared.run.runId, approvalId: prepared.approval.approvalId }),
    /不在等待审批状态/,
  );

  const restartPrepared = approvedRuntime.prepareApprovedToolCall({
    agentId: 'bid-write-test-agent',
    goal: '验证重启后不自动执行',
    toolId: OUTLINE_START_TOOL_ID,
    args: writeArgs,
    summary: '重启安全验证',
  });
  approvals.approve(restartPrepared.approval.approvalId);
  const restartedRuntime = createAgentRuntime({
    agentRegistry: approvedAgentRegistry,
    toolRegistry: writeToolRegistry,
    planner: { createPlan: () => ({ toolCalls: [] }), createRecommendation: () => '' },
    runStore,
    approvalService: approvals,
  });
  await assert.rejects(
    restartedRuntime.executeApprovedToolCall({ runId: restartPrepared.run.runId, approvalId: restartPrepared.approval.approvalId }),
    /待执行参数已失效/,
  );
  assert.equal(outlineStartCount, 2, 'Runtime 重建后不得自动恢复写操作');

  const disabledHostRoot = path.join(testRoot, 'disabled-host');
  const disabledHost = createAgentHost({ app: { getPath: () => disabledHostRoot }, enabled: false });
  assert.equal(disabledHost.getStatus().enabled, false);
  assert.equal(fs.existsSync(path.join(disabledHostRoot, 'workspace', 'agent-runs')), false, '关闭状态不得创建 Agent 数据目录');
  await assert.rejects(async () => disabledHost.runDryRun({ goal: '测试关闭状态' }), /尚未启用/);

  const host = createAgentHost({
    app: { getPath: () => path.join(testRoot, 'enabled-host') },
    enabled: true,
    experimentalWritesEnabled: false,
    services: {
      technicalPlanStore: {
        listProjects: () => ({ activeProjectId: 'project-1', projects: [{ id: 'project-1', name: '测试项目', isActive: true }] }),
        loadTechnicalPlan: () => ({ tenderFile: { fileName: '招标文件.docx' }, bidAnalysisTask: { status: 'success' }, bidAnalysisTasks: {}, outlineData: null }),
      },
      taskService: { peekActiveTasks: () => [] },
      knowledgeBaseService: { list: () => ({ folders: [], documents: [] }) },
      presalesWorkbenchService: {
        listProjects: () => ({ activeProjectId: 'presales-1', projects: [{ id: 'presales-1', name: '测试售前项目', materialCount: 1, generatedCount: 2 }] }),
        loadState: () => ({
          projectId: 'presales-1',
          profile: { projectName: '测试售前项目', customerName: '测试客户' },
          materials: [{ id: 'material-1' }],
          analysisResult: { markdown: '# 分析' },
          researchResult: { markdown: '# 调研' },
          architectureResult: { markdown: '' },
          diagramResult: { markdown: '' },
          presentationResult: { markdown: '' },
          exportRecords: [],
          task: { status: 'success' },
        }),
      },
      officialDocumentService: {
        loadState: () => ({ input: { documentType: '通知', facts: '测试事实' }, draft: '# 通知草稿', review: '', revisions: [], importedFileName: '', updated_at: '2026-09-15T00:00:00.000Z' }),
      },
      grantApplicationService: {
        loadState: () => ({ projectId: 'grant-1', profile: { direction: '课堂研究' }, inputs: { diagnosis: { taskText: '申报诊断' } }, outputs: {}, proposalModules: {}, proposalFinalReview: { status: 'unchecked' } }),
      },
      projectManagementService: {
        loadState: () => ({ projectId: 'pm-1', profile: { projectName: '交付项目', clientName: '测试客户' }, planningInput: { objectives: '按期交付' }, planningResult: '', task: { status: 'success' } }),
      },
      thesisTutorService: {
        loadState: () => ({ profile: { discipline: '管理学', direction: '数字治理' }, activePanel: 'diagnosis', panelResults: {}, chapters: [], references: [], feedbackItems: [], checkItems: [], task: { status: 'success' } }),
      },
      softwareCopyrightService: {
        loadState: () => ({ project: { path: '/test/project' }, fields: { softwareName: '测试软件', version: 'V1.0' }, options: { sourceMode: 'project', screenshotMode: 'skip' }, drafts: {}, outputs: [], task: { status: 'success' } }),
      },
      patentGenerationService: {
        loadState: () => ({ caseId: 'patent-1', caseInfo: { caseName: '测试案件', topic: '风险检查' }, project: { path: '/test/project' }, miningResult: [], selectedPatentPointId: '', disclosureDrafts: [], revisionLogs: [], task: { status: 'success' } }),
      },
    },
  });
  const hostStatus = host.getStatus();
  assert.equal(hostStatus.enabled, true);
  assert.equal(hostStatus.experimentalWritesEnabled, false);
  assert.deepEqual(hostStatus.pilot, {
    id: 'technical-plan-agent-pilot',
    phase: 'frozen-read-only',
    businessExecutionEnabled: false,
    approvalEnabled: false,
  });
  assert.equal(hostStatus.agents[0].instructions, undefined, 'Host 状态不得暴露 Agent 系统指令');
  assert.equal(hostStatus.tools.some((tool) => tool.id === OUTLINE_START_TOOL_ID), false);
  const hostDryRun = await host.runDryRun({ goal: '建议下一步', context: { projectId: 'project-1' } });
  assert.equal(hostDryRun.status, 'success');
  assert.match(hostDryRun.recommendation, /生成并确认目录/);
  const presalesDryRun = await host.runDryRun({ goal: '建议售前下一步', context: { workflowKind: 'presales', projectId: 'presales-1' } });
  assert.equal(presalesDryRun.agentId, 'presales-agent');
  assert.equal(presalesDryRun.steps.length, 2);
  assert.match(presalesDryRun.recommendation, /方案架构草案/);
  assert.equal(presalesDryRun.steps.some((step) => !step.toolId.endsWith('.read')), false, '售前 Agent 仅允许调用只读 Tool');
  const presalesShadowRun = await host.runShadowRun({ goal: '影子对照售前流程', context: { workflowKind: 'presales', projectId: 'presales-1' } });
  assert.equal(presalesShadowRun.shadowEvaluation.agentAction, 'architecture');
  assert.equal(presalesShadowRun.shadowEvaluation.executed, false);
  assert.equal(host.getShadowReport({ workflowKind: 'presales' }).total, 1);
  const officialDocumentRun = await host.runShadowRun({ goal: '规划公文下一步', context: { workflowKind: 'official-document' } });
  assert.equal(officialDocumentRun.agentId, 'official-document-agent');
  assert.equal(officialDocumentRun.shadowEvaluation.agentAction, 'check-draft');
  assert.equal(host.getShadowReport({ workflowKind: 'official-document' }).total, 1);
  assert.equal(deriveOfficialDocumentAction({ activeTask: { id: 'task' } }), 'wait-active-task');
  assert.equal(deriveOfficialDocumentAction({ activeTask: null, hasDraft: false, inputReady: false }), 'complete-input');
  assert.equal(deriveOfficialDocumentAction({ activeTask: null, hasDraft: false, inputReady: true }), 'generate-draft');
  assert.equal(deriveOfficialDocumentAction({ activeTask: null, hasDraft: true, hasReview: false }), 'check-draft');
  assert.equal(deriveOfficialDocumentAction({ activeTask: null, hasDraft: true, hasReview: true, hasPolishedRevision: false }), 'polish-draft');
  assert.equal(deriveOfficialDocumentAction({ activeTask: null, hasDraft: true, hasReview: true, hasPolishedRevision: true }), 'review-and-export');
  const grantBase = { profileReady: true, inputReady: { diagnosis: true, 'topic-policy': true, proposal: true, 'review-defense': true }, outputsReady: { diagnosis: true, 'topic-policy': true, proposal: true, 'review-defense': true }, moduleCount: 10, moduleTotal: 10, finalReviewStatus: 'pass', activeTask: null };
  assert.equal(deriveGrantAction({ ...grantBase, activeTask: { type: 'proposal' } }), 'wait-active-task');
  assert.equal(deriveGrantAction({ ...grantBase, profileReady: false }), 'complete-diagnosis-input');
  assert.equal(deriveGrantAction({ ...grantBase, outputsReady: { ...grantBase.outputsReady, diagnosis: false } }), 'generate-diagnosis');
  assert.equal(deriveGrantAction({ ...grantBase, moduleCount: 4 }), 'generate-proposal-modules');
  assert.equal(deriveGrantAction({ ...grantBase, finalReviewStatus: 'unchecked' }), 'check-final-proposal');
  assert.equal(deriveGrantAction(grantBase), 'review-and-export');
  const projectBase = { projectId: 'pm-1', profileReady: true, activeTask: null, inputReady: {}, resultReady: {} };
  assert.equal(deriveProjectManagementAction({}), 'select-project');
  assert.equal(deriveProjectManagementAction({ ...projectBase, activeTask: { type: 'planning' } }), 'wait-active-task');
  assert.equal(deriveProjectManagementAction({ ...projectBase, profileReady: false }), 'complete-profile');
  assert.equal(deriveProjectManagementAction(projectBase), 'complete-planning-input');
  assert.equal(deriveProjectManagementAction({ ...projectBase, inputReady: { planning: true } }), 'generate-planning');
  assert.equal(deriveProjectManagementAction({ ...projectBase, inputReady: Object.fromEntries(['planning', 'discovery', 'execution', 'risk', 'stakeholder', 'delivery', 'reporting', 'commercial', 'retrospective', 'compliance'].map((id) => [id, true])), resultReady: Object.fromEntries(['planning', 'discovery', 'execution', 'risk', 'stakeholder', 'delivery', 'reporting', 'commercial', 'retrospective', 'compliance'].map((id) => [id, true])) }), 'review-and-export');
  const projectManagementRun = await host.runShadowRun({ goal: '规划项目协作下一步', context: { workflowKind: 'project-management', projectId: 'pm-1' } });
  assert.equal(projectManagementRun.agentId, 'project-management-agent');
  assert.equal(projectManagementRun.shadowEvaluation.agentAction, 'generate-planning');
  assert.equal(host.getShadowReport({ workflowKind: 'project-management' }).total, 1);
  const thesisBase = { profileReady: true, activeTask: null, panelReady: {} };
  assert.equal(deriveThesisTutorAction({ ...thesisBase, activeTask: { type: 'diagnosis' } }), 'wait-active-task');
  assert.equal(deriveThesisTutorAction({ ...thesisBase, profileReady: false }), 'complete-profile');
  assert.equal(deriveThesisTutorAction(thesisBase), 'generate-diagnosis');
  assert.equal(deriveThesisTutorAction({ ...thesisBase, panelReady: Object.fromEntries(['diagnosis', 'topic', 'literature', 'methodology', 'data', 'charts', 'drafting', 'writing', 'review', 'format'].map((id) => [id, true])) }), 'review-and-export');
  const thesisRun = await host.runShadowRun({ goal: '规划论文导师下一步', context: { workflowKind: 'thesis-tutor' } });
  assert.equal(thesisRun.agentId, 'thesis-tutor-agent');
  assert.equal(thesisRun.shadowEvaluation.agentAction, 'generate-diagnosis');
  assert.equal(host.getShadowReport({ workflowKind: 'thesis-tutor' }).total, 1);
  const copyrightBase = { hasSource: true, missingFieldCount: 0, hasDrafts: false, codeMaterialReviewed: false, draftConfirmed: false, manualAssetReady: true, manualReviewCurrent: false, hasOutputs: false, activeTask: null };
  assert.equal(deriveSoftwareCopyrightAction({ ...copyrightBase, hasSource: false }), 'select-source');
  assert.equal(deriveSoftwareCopyrightAction({ ...copyrightBase, missingFieldCount: 2 }), 'complete-fields');
  assert.equal(deriveSoftwareCopyrightAction(copyrightBase), 'generate-drafts');
  assert.equal(deriveSoftwareCopyrightAction({ ...copyrightBase, hasDrafts: true }), 'review-code-material');
  assert.equal(deriveSoftwareCopyrightAction({ ...copyrightBase, hasDrafts: true, codeMaterialReviewed: true }), 'confirm-draft');
  assert.equal(deriveSoftwareCopyrightAction({ ...copyrightBase, hasDrafts: true, codeMaterialReviewed: true, draftConfirmed: true, manualReviewCurrent: true }), 'review-and-export');
  const copyrightRun = await host.runShadowRun({ goal: '规划软件著作下一步', context: { workflowKind: 'software-copyright' } });
  assert.equal(copyrightRun.agentId, 'software-copyright-agent');
  assert.equal(copyrightRun.shadowEvaluation.agentAction, 'complete-fields');
  assert.equal(host.getShadowReport({ workflowKind: 'software-copyright' }).total, 1);
  const patentBase = { caseId: 'patent-1', caseReady: true, hasProject: true, candidateCount: 0, selectedPointReady: false, unresolvedFactCount: 0, hasFactSuggestions: false, hasDisclosure: false, hasPriorArt: false, revisionCount: 0, activeTask: null };
  assert.equal(derivePatentGenerationAction({}), 'select-case');
  assert.equal(derivePatentGenerationAction({ ...patentBase, caseReady: false }), 'complete-case-info');
  assert.equal(derivePatentGenerationAction({ ...patentBase, hasProject: false }), 'select-project');
  assert.equal(derivePatentGenerationAction(patentBase), 'start-mining');
  assert.equal(derivePatentGenerationAction({ ...patentBase, candidateCount: 2 }), 'select-patent-point');
  assert.equal(derivePatentGenerationAction({ ...patentBase, candidateCount: 2, selectedPointReady: true, unresolvedFactCount: 2 }), 'generate-fact-supplements');
  assert.equal(derivePatentGenerationAction({ ...patentBase, candidateCount: 2, selectedPointReady: true }), 'generate-disclosure');
  assert.equal(derivePatentGenerationAction({ ...patentBase, candidateCount: 2, selectedPointReady: true, hasDisclosure: true }), 'complete-prior-art');
  const patentRun = await host.runShadowRun({ goal: '规划专利生成下一步', context: { workflowKind: 'patent-generation', projectId: 'patent-1' } });
  assert.equal(patentRun.agentId, 'patent-generation-agent');
  assert.equal(patentRun.shadowEvaluation.agentAction, 'start-mining');
  assert.equal(host.getShadowReport({ workflowKind: 'patent-generation' }).total, 1);
  assert.equal(nextPresalesAction({ activeTask: { type: 'analysis' } }), 'wait-active-task');
  assert.equal(nextPresalesAction({ activeTask: null, profileReady: false, materialCount: 1, stages: {} }), 'complete-profile');
  assert.equal(nextPresalesAction({ activeTask: null, profileReady: true, materialCount: 0, stages: {} }), 'add-materials');
  assert.equal(nextPresalesAction({ activeTask: null, profileReady: true, materialCount: 1, stages: { analysis: true, research: true } }), 'architecture');
  assert.equal(nextPresalesAction({ activeTask: null, profileReady: true, materialCount: 1, stages: { analysis: true, research: true, architecture: true, diagrams: true, presentation: true } }), 'review-and-export');
  const shadowRun = await host.runShadowRun({ goal: '影子对照', context: { projectId: 'project-1' } });
  assert.equal(shadowRun.mode, 'shadow');
  assert.equal(shadowRun.shadowEvaluation.executed, false);
  assert.equal(shadowRun.shadowEvaluation.agentAction, 'outline-generation');
  assert.equal(typeof shadowRun.shadowEvaluation.aligned, 'boolean');
  assert.equal(shadowRun.shadowEvaluation.reasonCode, 'WORKBENCH_STEP_BEHIND');
  assert.equal(shadowRun.shadowEvaluation.activeTaskCount, 0);
  const shadowReport = host.getShadowReport({ limit: 1 });
  assert.equal(shadowReport.total, 1);
  assert.equal(shadowReport.evaluated, 1);
  assert.equal(shadowReport.recent.length, 1);
  assert.equal(shadowReport.recent[0].projectId, 'project-1');
  assert.deepEqual(shadowReport.mismatchReasons, [{ code: 'WORKBENCH_STEP_BEHIND', label: '工作台步骤滞后', count: 1 }]);
  assert.equal(shadowReport.admission.status, 'insufficient-data');
  assert.equal(shadowReport.admission.eligibleForHumanApprovalPilot, false);
  assert.equal(shadowReport.recent[0].steps, undefined, '影子统计不得暴露 Tool 调用结果');
  assert.equal(shadowReport.recent[0].recommendation, undefined, '影子统计不得暴露完整建议');
  const eligibleAdmission = evaluateAgentAdmission({ total: 20, evaluated: 20, aligned: 19, failed: 0, mismatchReasons: [{ code: 'WORKBENCH_STEP_BEHIND', count: 1 }] });
  assert.equal(eligibleAdmission.status, 'eligible');
  assert.equal(eligibleAdmission.eligibleForHumanApprovalPilot, true);
  const blockedAdmission = evaluateAgentAdmission({ total: 20, evaluated: 20, aligned: 20, failed: 0, mismatchReasons: [{ code: 'ACTIVE_TASK_CONFLICT', count: 1 }] });
  assert.equal(blockedAdmission.status, 'blocked');
  assert.equal(blockedAdmission.highRiskMismatches, 1);
  const actionPreview = host.previewOutlineGeneration({
    workflowKind: 'technical-plan',
    projectId: 'project-1',
    mode: 'aligned',
    referenceKnowledgeDocumentIds: ['knowledge-1'],
  });
  assert.equal(actionPreview.previewOnly, true);
  assert.equal(actionPreview.approvalCreated, false);
  assert.equal(actionPreview.executionStarted, false);
  assert.equal(actionPreview.readyForHumanApprovalPilot, false);
  assert.equal(actionPreview.parameters.referenceKnowledgeDocumentCount, 1);
  assert.equal(actionPreview.parameters.referenceKnowledgeDocumentIds, undefined, '执行预览不得暴露知识库文档 ID');
  assert.equal(actionPreview.blockers.some((item) => item.code === 'ADMISSION_GATE_BLOCKED'), true);
  const approvalDraft = host.createOutlineApprovalDraft({
    args: { workflowKind: 'technical-plan', projectId: 'project-1', mode: 'aligned', referenceKnowledgeDocumentIds: ['knowledge-1'] },
  });
  assert.equal(approvalDraft.status, 'blocked');
  assert.equal(approvalDraft.executable, false);
  assert.equal(approvalDraft.approvable, false);
  assert.equal(typeof approvalDraft.argsHash, 'string');
  assert.equal(approvalDraft.tool.version, '0.1.0');
  assert.equal(approvalDraft.policySnapshot.version, 'agent-admission/v1');
  assert.equal(approvalDraft.policySnapshot.status, 'insufficient-data');
  assert.equal(approvalDraft.policySnapshot.checks.length, 4);
  assert.equal(approvalDraft.policySnapshot.toolContract.id, OUTLINE_START_TOOL_ID);
  assert.equal(approvalDraft.policySnapshot.toolContract.version, '0.1.0');
  assert.match(approvalDraft.policySnapshot.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(approvalDraft.referenceKnowledgeDocumentIds, undefined, '审批草稿不得保存完整参数');
  assert.equal(host.listApprovalDrafts({ limit: 1 }).length, 1);
  assert.equal(host.listApprovalDrafts({ limit: 1 })[0].policySnapshot.snapshotHash, approvalDraft.policySnapshot.snapshotHash);
  const revokedDraft = host.revokeApprovalDraft(approvalDraft.draftId);
  assert.equal(revokedDraft.status, 'revoked');
  assert.throws(() => host.revokeApprovalDraft(approvalDraft.draftId), /不可撤销/);
  const driftDraft = host.createOutlineApprovalDraft({ args: { workflowKind: 'technical-plan', projectId: 'project-1', mode: 'aligned' } });
  const driftPreview = host.previewOutlineGeneration({ workflowKind: 'technical-plan', projectId: 'project-1', mode: 'free' });
  assert.equal(driftPreview.draftDrift.staleCount, 1);
  const staleDraft = host.listApprovalDrafts().find((draft) => draft.draftId === driftDraft.draftId);
  assert.equal(staleDraft.status, 'stale');
  assert.equal(staleDraft.staleReason, 'CONTEXT_DRIFT');
  assert.throws(() => host.revokeApprovalDraft(driftDraft.draftId), /不可撤销/);
  const agentDataDir = path.join(testRoot, 'enabled-host', 'workspace', 'agent-runs');
  const filesBeforePackage = fs.readdirSync(agentDataDir).sort();
  const packagePreview = host.previewApprovalPackage(driftDraft.draftId);
  assert.equal(packagePreview.inMemoryOnly, true);
  assert.equal(packagePreview.fileCreated, false);
  assert.equal(packagePreview.submitted, false);
  assert.equal(packagePreview.approvable, false);
  assert.equal(packagePreview.executable, false);
  assert.equal(packagePreview.draft.status, 'stale');
  assert.equal(packagePreview.audit.chainValid, true);
  assert.match(packagePreview.packageHash, /^[a-f0-9]{64}$/);
  const validPackageReport = host.validateApprovalPackage(packagePreview);
  assert.equal(validPackageReport.valid, true);
  assert.equal(validPackageReport.persisted, false);
  assert.equal(validPackageReport.submitted, false);
  assert.equal(validPackageReport.executed, false);
  const tamperedPackage = JSON.parse(JSON.stringify(packagePreview));
  tamperedPackage.draft.summary = '被修改的审批包摘要';
  const invalidPackageReport = host.validateApprovalPackage(tamperedPackage);
  assert.equal(invalidPackageReport.valid, false);
  assert.equal(invalidPackageReport.checks.packageHashValid, false);
  assert.deepEqual(fs.readdirSync(agentDataDir).sort(), filesBeforePackage, '审批包预览不得创建文件');
  const approvalDraftFile = path.join(testRoot, 'enabled-host', 'workspace', 'agent-runs', 'approval-drafts.json');
  const tamperedDraftData = JSON.parse(fs.readFileSync(approvalDraftFile, 'utf-8'));
  tamperedDraftData.drafts[0].summary = '被意外修改的摘要';
  fs.writeFileSync(approvalDraftFile, JSON.stringify(tamperedDraftData), 'utf-8');
  assert.equal(host.listApprovalDrafts().some((draft) => draft.draftId === driftDraft.draftId), false, '完整性失败的草稿不得返回页面');
  const integrityStatus = host.getApprovalDraftIntegrity();
  assert.equal(integrityStatus.quarantinedCount, 1);
  assert.equal(integrityStatus.recent[0].draftId, driftDraft.draftId);
  assert.equal(integrityStatus.recent[0].summary, undefined, '隔离记录不得保存被篡改内容');
  const auditLog = host.getApprovalDraftAuditLog();
  assert.equal(auditLog.chainValid, true);
  assert.equal(auditLog.recent.some((event) => event.type === 'CREATED'), true);
  assert.equal(auditLog.recent.some((event) => event.type === 'REVOKED'), true);
  assert.equal(auditLog.recent.some((event) => event.type === 'STALE'), true);
  assert.equal(auditLog.recent.some((event) => event.type === 'QUARANTINED'), true);
  assert.equal(auditLog.recent[0].summary, undefined, '审计事件不得保存草稿内容');
  const auditFile = path.join(testRoot, 'enabled-host', 'workspace', 'agent-runs', 'approval-draft-events.json');
  const tamperedAuditData = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
  tamperedAuditData.events[0].toStatus = 'tampered';
  fs.writeFileSync(auditFile, JSON.stringify(tamperedAuditData), 'utf-8');
  assert.equal(host.getApprovalDraftAuditLog().chainValid, false, '事件被修改后哈希链必须失效');
  assert.throws(() => host.runShadowRun({ goal: '缺少项目的影子对照' }), /必须指定项目 ID/);
  assert.throws(() => host.prepareOutlineGeneration({}), /写操作尚未启用/);

  assert.match(agentIpcSource, /agent:get-status/);
  assert.match(agentIpcSource, /agent:run-dry/);
  assert.match(agentIpcSource, /agent:run-shadow/);
  assert.match(agentIpcSource, /agent:get-shadow-report/);
  assert.match(agentIpcSource, /agent:preview-outline-generation/);
  assert.match(agentIpcSource, /agent:create-approval-draft/);
  assert.match(agentIpcSource, /agent:list-approval-drafts/);
  assert.match(agentIpcSource, /agent:revoke-approval-draft/);
  assert.match(agentIpcSource, /agent:get-approval-draft-integrity/);
  assert.match(agentIpcSource, /agent:get-approval-draft-audit-log/);
  assert.match(agentIpcSource, /agent:preview-approval-package/);
  assert.match(agentIpcSource, /agent:validate-approval-package/);
  assert.doesNotMatch(agentIpcSource, /agent:(?:start|approve|reject|execute)/, '当前 Agent IPC 不得暴露写操作');
  assert.match(preloadSource, /agent:get-status/);
  assert.match(preloadSource, /agent:run-dry/);
  assert.match(preloadSource, /agent:run-shadow/);
  assert.match(preloadSource, /agent:get-shadow-report/);
  assert.match(preloadSource, /agent:preview-outline-generation/);
  assert.match(preloadSource, /agent:create-approval-draft/);
  assert.match(preloadSource, /agent:list-approval-drafts/);
  assert.match(preloadSource, /agent:revoke-approval-draft/);
  assert.match(preloadSource, /agent:get-approval-draft-integrity/);
  assert.match(preloadSource, /agent:get-approval-draft-audit-log/);
  assert.match(preloadSource, /agent:preview-approval-package/);
  assert.match(preloadSource, /agent:validate-approval-package/);
  assert.doesNotMatch(preloadSource, /agent:(?:start|approve|reject|execute)/, 'preload 不得暴露 Agent 写操作');

  const configRoot = path.join(testRoot, 'config-migration');
  fs.mkdirSync(configRoot, { recursive: true });
  fs.writeFileSync(path.join(configRoot, 'user_config.json'), JSON.stringify({ developer_mode: true }), 'utf-8');
  const configStore = createConfigStore({ getPath: () => configRoot });
  const migratedConfig = configStore.load();
  assert.deepEqual(migratedConfig.agent_settings, { schema_version: 1, enabled: false, experimental_writes_enabled: false });
  assert.equal(migratedConfig.developer_mode, true, '旧配置迁移不得覆盖现有设置');
  configStore.save({ agent_settings: { enabled: 'true', experimental_writes_enabled: true } });
  assert.deepEqual(configStore.load().agent_settings, { schema_version: 1, enabled: false, experimental_writes_enabled: false }, '非法开关值必须按关闭处理');
  configStore.save({ agent_settings: { enabled: true, experimental_writes_enabled: true } });
  assert.deepEqual(configStore.load().agent_settings, { schema_version: 1, enabled: true, experimental_writes_enabled: true });
  assert.match(ipcIndexSource, /startupConfig\.developer_mode === true && startupConfig\.agent_settings\?\.enabled === true/, 'Main 必须同时检查开发者模式和 Agent 开关');
  assert.match(ipcIndexSource, /experimentalWritesEnabled: false/, 'Main 必须继续强制关闭 Agent 写操作');
  assert.doesNotMatch(ipcIndexSource, /experimentalWritesEnabled:\s*startupConfig|experimental_writes_enabled === true/, 'Main 不得读取实验写开关');
  assert.match(developerPageSource, /\.agent\.getStatus/);
  assert.match(developerPageSource, /\.agent\.runDry/);
  assert.match(developerPageSource, /\.agent\.runShadow/);
  assert.match(developerPageSource, /\.agent\.getShadowReport/);
  assert.match(developerPageSource, /\.agent\.previewOutlineGeneration/);
  assert.match(developerPageSource, /\.agent\.createOutlineApprovalDraft/);
  assert.match(developerPageSource, /\.agent\.revokeApprovalDraft/);
  assert.match(developerPageSource, /\.agent\.getApprovalDraftIntegrity/);
  assert.match(developerPageSource, /\.agent\.getApprovalDraftAuditLog/);
  assert.match(developerPageSource, /\.agent\.previewApprovalPackage/);
  assert.match(developerPageSource, /\.agent\.validateApprovalPackage/);
  assert.doesNotMatch(developerPageSource, /\.agent\.(?:approve|reject|execute|start)/, '开发者诊断页不得包含 Agent 写入口');
  for (const workflowKind of ['official-document', 'grant-application', 'project-management', 'thesis-tutor', 'software-copyright', 'patent-generation']) {
    assert.match(developerPageSource, new RegExp(`<option value="${workflowKind}">`), `开发者诊断页缺少 ${workflowKind}`);
  }
  assert.match(settingsPageSource, /Agent 工作台（内测）/);
  assert.match(settingsPageSource, /\{ id: 'general', label: '通用' \}/, '设置页必须提供通用标签入口');
  assert.match(settingsPageSource, /agent_settings: \{ \.\.\.state\.general\.agent_settings, schema_version: 1, experimental_writes_enabled: false \}/, '设置页必须强制保持 Agent 实验写入口关闭');
  assert.match(presalesPageSource, /\.agent\.runShadow/, '售前工作台必须通过 Agent 获取结构化建议');
  assert.match(presalesPageSource, /确认执行 Agent 建议/, '售前 Agent 执行前必须显示项目级确认');
  assert.match(presalesPageSource, /analysis: generateAnalysis/);
  assert.match(presalesPageSource, /research: generateResearch/);
  assert.match(presalesPageSource, /architecture: generateArchitecture/);
  assert.match(presalesPageSource, /diagrams: generateDiagrams/);
  assert.match(presalesPageSource, /presentation: generatePresentation/);
  assert.doesNotMatch(presalesPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/, '售前工作台不得绕过原业务方法执行 Agent 写 Tool');
  assert.match(technicalPlanPageSource, /\.agent\.runShadow/, '技术方案工作台必须通过 Agent 获取结构化建议');
  assert.match(technicalPlanPageSource, /tasks\.startBidAnalysis/, '招投标 Agent 必须复用原文件解析任务');
  assert.match(technicalPlanPageSource, /tasks\.startOutlineGeneration/, '招投标 Agent 必须复用原目录生成任务');
  assert.match(technicalPlanPageSource, /tasks\.startGlobalFactsGeneration/, '招投标 Agent 必须复用原全局事实任务');
  assert.match(technicalPlanPageSource, /确认执行 Agent 建议/, '招投标 Agent 启动后台任务前必须确认');
  assert.doesNotMatch(technicalPlanPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/, '技术方案工作台不得调用实验性 Agent 写入口');
  assert.match(officialDocumentPageSource, /\.agent\.runShadow/, '公文页面必须通过 Agent 获取结构化建议');
  assert.match(officialDocumentPageSource, /await generateDraft\(\)/);
  assert.match(officialDocumentPageSource, /await checkDraft\(\)/);
  assert.match(officialDocumentPageSource, /await polishDraft\(\)/);
  assert.match(officialDocumentPageSource, /确认执行 Agent 建议/);
  assert.doesNotMatch(officialDocumentPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/, '公文页面不得调用实验性 Agent 写入口');
  assert.match(grantPageSource, /\.agent\.runShadow/);
  assert.match(grantPageSource, /generateMissingProposalModules\(\)/);
  assert.match(grantPageSource, /checkProposalFinalReview\(\)/);
  assert.match(grantPageSource, /grantApplication\.generate/);
  assert.match(grantPageSource, /确认执行 Agent 建议/);
  assert.doesNotMatch(grantPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/);
  assert.match(projectManagementPageSource, /\.agent\.runShadow/);
  assert.match(projectManagementPageSource, /moduleOperations\[moduleId\]\.generate\(\)/);
  assert.match(projectManagementPageSource, /确认执行 Agent 建议/);
  assert.doesNotMatch(projectManagementPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/);
  assert.match(thesisTutorPageSource, /\.agent\.runShadow/);
  assert.match(thesisTutorPageSource, /await generate\(\)/);
  assert.match(thesisTutorPageSource, /确认执行 Agent 建议/);
  assert.doesNotMatch(thesisTutorPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/);
  assert.match(softwareCopyrightPageSource, /\.agent\.runShadow/);
  assert.match(softwareCopyrightPageSource, /await handleGenerateDraft\(\)/);
  assert.match(softwareCopyrightPageSource, /await handleConfirmDraft\(\)/);
  assert.match(softwareCopyrightPageSource, /确认执行 Agent 建议/);
  assert.doesNotMatch(softwareCopyrightPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/);
  assert.match(patentGenerationPageSource, /\.agent\.runShadow/);
  assert.match(patentGenerationPageSource, /await handleStartMining\(\)/);
  assert.match(patentGenerationPageSource, /await handleGenerateFactSupplements/);
  assert.match(patentGenerationPageSource, /await handleGenerateDisclosureDraft\(\)/);
  assert.match(patentGenerationPageSource, /确认执行 Agent 建议/);
  assert.doesNotMatch(patentGenerationPageSource, /\.agent\.(?:approve|reject|executeApprovedToolCall)/);

  console.log('Agent foundation verification passed.');
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
