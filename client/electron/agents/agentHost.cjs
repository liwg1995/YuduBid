'use strict';

const { createAgentRegistry } = require('./agentRegistry.cjs');
const { createToolRegistry } = require('./toolRegistry.cjs');
const { createAgentRuntime } = require('./agentRuntime.cjs');
const { createAgentRunStore } = require('./agentRunStore.cjs');
const { createContinuousRunStore } = require('./continuousRunStore.cjs');
const { createApprovalService } = require('./approvalService.cjs');
const { registerBidAgent, BID_AGENT_ID } = require('./agents/bidAgent.cjs');
const { createBidDryRunPlanner } = require('./planners/bidDryRunPlanner.cjs');
const { registerBidReadTools } = require('./tools/bidReadTools.cjs');
const { OUTLINE_START_TOOL_ID, registerBidWriteTools } = require('./tools/bidWriteTools.cjs');
const { evaluateAgentAdmission } = require('./agentAdmissionPolicy.cjs');
const { createActionPreviewService } = require('./actionPreviewService.cjs');
const { createApprovalDraftService } = require('./approvalDraftService.cjs');
const { registerPresalesAgent, PRESALES_AGENT_ID } = require('./agents/presalesAgent.cjs');
const { createPresalesDryRunPlanner } = require('./planners/presalesDryRunPlanner.cjs');
const { registerPresalesReadTools } = require('./tools/presalesReadTools.cjs');
const { registerOfficialDocumentAgent, OFFICIAL_DOCUMENT_AGENT_ID } = require('./agents/officialDocumentAgent.cjs');
const { createOfficialDocumentPlanner } = require('./planners/officialDocumentPlanner.cjs');
const { registerOfficialDocumentReadTools } = require('./tools/officialDocumentReadTools.cjs');
const { registerGrantApplicationAgent, GRANT_AGENT_ID } = require('./agents/grantApplicationAgent.cjs');
const { createGrantApplicationPlanner } = require('./planners/grantApplicationPlanner.cjs');
const { registerGrantApplicationReadTools } = require('./tools/grantApplicationReadTools.cjs');
const { registerProjectManagementAgent, PROJECT_MANAGEMENT_AGENT_ID } = require('./agents/projectManagementAgent.cjs');
const { createProjectManagementPlanner } = require('./planners/projectManagementPlanner.cjs');
const { registerProjectManagementReadTools } = require('./tools/projectManagementReadTools.cjs');
const { registerThesisTutorAgent, THESIS_TUTOR_AGENT_ID } = require('./agents/thesisTutorAgent.cjs');
const { createThesisTutorPlanner } = require('./planners/thesisTutorPlanner.cjs');
const { registerThesisTutorReadTools } = require('./tools/thesisTutorReadTools.cjs');
const { registerSoftwareCopyrightAgent, SOFTWARE_COPYRIGHT_AGENT_ID } = require('./agents/softwareCopyrightAgent.cjs');
const { createSoftwareCopyrightPlanner } = require('./planners/softwareCopyrightPlanner.cjs');
const { registerSoftwareCopyrightReadTools } = require('./tools/softwareCopyrightReadTools.cjs');
const { registerPatentGenerationAgent, PATENT_GENERATION_AGENT_ID } = require('./agents/patentGenerationAgent.cjs');
const { createPatentGenerationPlanner } = require('./planners/patentGenerationPlanner.cjs');
const { registerPatentGenerationReadTools } = require('./tools/patentGenerationReadTools.cjs');

const PILOT_STATUS = Object.freeze({
  id: 'technical-plan-agent-pilot',
  phase: 'frozen-read-only',
  businessExecutionEnabled: false,
  approvalEnabled: false,
});

function createDisabledHost() {
  const disabled = () => { throw new Error('Agent 功能尚未启用'); };
  return {
    getStatus: () => ({ enabled: false, experimentalWritesEnabled: false, pilot: PILOT_STATUS, agents: [], tools: [] }),
    runDryRun: disabled,
    runShadowRun: disabled,
    getShadowReport: () => {
      const empty = { total: 0, evaluated: 0, aligned: 0, mismatched: 0, failed: 0, alignmentRate: null, mismatchReasons: [], recent: [] };
      return { ...empty, admission: evaluateAgentAdmission(empty) };
    },
    previewOutlineGeneration: disabled,
    createOutlineApprovalDraft: disabled,
    revokeApprovalDraft: disabled,
    listApprovalDrafts: () => [],
    getApprovalDraftIntegrity: () => ({ integrityVersion: 1, quarantinedCount: 0, recent: [] }),
    getApprovalDraftAuditLog: () => ({ chainValid: true, total: 0, recent: [] }),
    previewApprovalPackage: disabled,
    validateApprovalPackage: disabled,
    getContinuousRun: disabled,
    saveContinuousRun: disabled,
    prepareOutlineGeneration: disabled,
    approve: disabled,
    reject: disabled,
    executeApprovedToolCall: disabled,
    getRun: () => undefined,
    listRuns: () => [],
    listApprovals: () => [],
  };
}

function createAgentHost({ app, services = {}, enabled = false, experimentalWritesEnabled = false } = {}) {
  if (!enabled) return createDisabledHost();
  if (!app?.getPath) throw new Error('Agent Host 缺少 Electron app');
  const { technicalPlanStore, taskService, knowledgeBaseService, presalesWorkbenchService, officialDocumentService, grantApplicationService, projectManagementService, thesisTutorService, softwareCopyrightService, patentGenerationService } = services;
  if (!technicalPlanStore || !taskService || !knowledgeBaseService || !presalesWorkbenchService || !officialDocumentService || !grantApplicationService || !projectManagementService || !thesisTutorService || !softwareCopyrightService || !patentGenerationService) throw new Error('Agent Host 业务依赖未完整初始化');

  const toolRegistry = createToolRegistry();
  registerBidReadTools(toolRegistry, { technicalPlanStore, taskService, knowledgeBaseService });
  registerPresalesReadTools(toolRegistry, { presalesWorkbenchService });
  registerOfficialDocumentReadTools(toolRegistry, { officialDocumentService });
  registerGrantApplicationReadTools(toolRegistry, { grantApplicationService });
  registerProjectManagementReadTools(toolRegistry, { projectManagementService });
  registerThesisTutorReadTools(toolRegistry, { thesisTutorService });
  registerSoftwareCopyrightReadTools(toolRegistry, { softwareCopyrightService });
  registerPatentGenerationReadTools(toolRegistry, { patentGenerationService });
  if (experimentalWritesEnabled) registerBidWriteTools(toolRegistry, { technicalPlanStore, taskService });

  const agentRegistry = createAgentRegistry({ toolRegistry });
  registerBidAgent(agentRegistry, { includeExperimentalWrites: experimentalWritesEnabled });
  registerPresalesAgent(agentRegistry);
  registerOfficialDocumentAgent(agentRegistry);
  registerGrantApplicationAgent(agentRegistry);
  registerProjectManagementAgent(agentRegistry);
  registerThesisTutorAgent(agentRegistry);
  registerSoftwareCopyrightAgent(agentRegistry);
  registerPatentGenerationAgent(agentRegistry);
  const runStore = createAgentRunStore({ app });
  const continuousRunStore = createContinuousRunStore({ app });
  const approvalService = createApprovalService({ app });
  const runtime = createAgentRuntime({
    agentRegistry,
    toolRegistry,
    planner: createBidDryRunPlanner(),
    runStore,
    approvalService,
  });
  const presalesRuntime = createAgentRuntime({
    agentRegistry,
    toolRegistry,
    planner: createPresalesDryRunPlanner(),
    runStore,
    approvalService,
  });
  const officialDocumentRuntime = createAgentRuntime({ agentRegistry, toolRegistry, planner: createOfficialDocumentPlanner(), runStore, approvalService });
  const grantRuntime = createAgentRuntime({ agentRegistry, toolRegistry, planner: createGrantApplicationPlanner(), runStore, approvalService });
  const projectManagementRuntime = createAgentRuntime({ agentRegistry, toolRegistry, planner: createProjectManagementPlanner(), runStore, approvalService });
  const thesisTutorRuntime = createAgentRuntime({ agentRegistry, toolRegistry, planner: createThesisTutorPlanner(), runStore, approvalService });
  const softwareCopyrightRuntime = createAgentRuntime({ agentRegistry, toolRegistry, planner: createSoftwareCopyrightPlanner(), runStore, approvalService });
  const patentGenerationRuntime = createAgentRuntime({ agentRegistry, toolRegistry, planner: createPatentGenerationPlanner(), runStore, approvalService });

  function selectReadOnlyRuntime(input = {}) {
    if (input?.context?.workflowKind === 'presales') return { runtime: presalesRuntime, agentId: PRESALES_AGENT_ID };
    if (input?.context?.workflowKind === 'official-document') return { runtime: officialDocumentRuntime, agentId: OFFICIAL_DOCUMENT_AGENT_ID };
    if (input?.context?.workflowKind === 'grant-application') return { runtime: grantRuntime, agentId: GRANT_AGENT_ID };
    if (input?.context?.workflowKind === 'project-management') return { runtime: projectManagementRuntime, agentId: PROJECT_MANAGEMENT_AGENT_ID };
    if (input?.context?.workflowKind === 'thesis-tutor') return { runtime: thesisTutorRuntime, agentId: THESIS_TUTOR_AGENT_ID };
    if (input?.context?.workflowKind === 'software-copyright') return { runtime: softwareCopyrightRuntime, agentId: SOFTWARE_COPYRIGHT_AGENT_ID };
    if (input?.context?.workflowKind === 'patent-generation') return { runtime: patentGenerationRuntime, agentId: PATENT_GENERATION_AGENT_ID };
    return { runtime, agentId: BID_AGENT_ID };
  }

  function getShadowReport(options = {}) {
    const requestedLimit = Math.max(1, Math.min(50, Math.round(Number(options.limit || 10))));
    const reportAgentId = options.workflowKind === 'presales'
      ? PRESALES_AGENT_ID
      : options.workflowKind === 'official-document' ? OFFICIAL_DOCUMENT_AGENT_ID
        : options.workflowKind === 'grant-application' ? GRANT_AGENT_ID
          : options.workflowKind === 'project-management' ? PROJECT_MANAGEMENT_AGENT_ID
            : options.workflowKind === 'thesis-tutor' ? THESIS_TUTOR_AGENT_ID
              : options.workflowKind === 'software-copyright' ? SOFTWARE_COPYRIGHT_AGENT_ID
                : options.workflowKind === 'patent-generation' ? PATENT_GENERATION_AGENT_ID : BID_AGENT_ID;
    const runs = runStore.listRuns({ agentId: reportAgentId, limit: 100 }).filter((run) => run.mode === 'shadow');
    const evaluatedRuns = runs.filter((run) => run.status === 'success' && run.shadowEvaluation);
    const aligned = evaluatedRuns.filter((run) => run.shadowEvaluation.aligned === true).length;
    const mismatched = evaluatedRuns.filter((run) => run.shadowEvaluation.aligned === false).length;
    const failed = runs.filter((run) => run.status === 'error').length;
    const mismatchReasonCounts = new Map();
    for (const run of evaluatedRuns.filter((item) => item.shadowEvaluation.aligned === false)) {
      const code = String(run.shadowEvaluation.reasonCode || 'STATE_INCONSISTENT');
      const current = mismatchReasonCounts.get(code) || { code, label: String(run.shadowEvaluation.reasonLabel || '项目状态不一致'), count: 0 };
      current.count += 1;
      mismatchReasonCounts.set(code, current);
    }
    const report = {
      total: runs.length,
      evaluated: evaluatedRuns.length,
      aligned,
      mismatched,
      failed,
      alignmentRate: evaluatedRuns.length ? Math.round((aligned / evaluatedRuns.length) * 1000) / 10 : null,
      mismatchReasons: [...mismatchReasonCounts.values()].sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
      recent: runs.slice(0, requestedLimit).map((run) => ({
        runId: String(run.runId || ''),
        status: run.status === 'success' ? 'success' : 'error',
        startedAt: String(run.startedAt || ''),
        workflowKind: String(run.scope?.workflowKind || ''),
        projectId: String(run.scope?.projectId || ''),
        currentStep: String(run.shadowEvaluation?.currentStep || ''),
        legacyAction: String(run.shadowEvaluation?.legacyAction || ''),
        agentAction: String(run.shadowEvaluation?.agentAction || ''),
        aligned: typeof run.shadowEvaluation?.aligned === 'boolean' ? run.shadowEvaluation.aligned : null,
        reasonCode: String(run.shadowEvaluation?.reasonCode || ''),
        reasonLabel: String(run.shadowEvaluation?.reasonLabel || ''),
        activeTaskCount: Math.max(0, Math.round(Number(run.shadowEvaluation?.activeTaskCount || 0))),
        note: String(run.shadowEvaluation?.note || run.error || '').slice(0, 500),
      })),
    };
    return { ...report, admission: evaluateAgentAdmission(report) };
  }
  const actionPreviewService = createActionPreviewService({ technicalPlanStore, taskService, getShadowReport });
  const approvalDraftService = createApprovalDraftService({ app });

  return {
    getStatus: () => ({
      enabled: true,
      experimentalWritesEnabled: Boolean(experimentalWritesEnabled),
      pilot: PILOT_STATUS,
      agents: agentRegistry.list().map(({ instructions, ...agent }) => agent),
      tools: toolRegistry.list(),
    }),
    runDryRun(input = {}) {
      const selected = selectReadOnlyRuntime(input);
      return selected.runtime.runDryRun({ ...input, agentId: selected.agentId });
    },
    runShadowRun(input = {}) {
      const selected = selectReadOnlyRuntime(input);
      return selected.runtime.runShadowRun({ ...input, agentId: selected.agentId });
    },
    getShadowReport,
    previewOutlineGeneration(input = {}) {
      const preview = actionPreviewService.previewOutlineGeneration(input);
      return { ...preview, draftDrift: approvalDraftService.reconcile({ preview }) };
    },
    createOutlineApprovalDraft(input = {}) {
      const args = input.args || {};
      const preview = actionPreviewService.previewOutlineGeneration(args);
      approvalDraftService.reconcile({ preview });
      return approvalDraftService.create({ preview, args, ttlMs: input.ttlMs });
    },
    revokeApprovalDraft: (draftId) => approvalDraftService.revoke(draftId),
    listApprovalDrafts: (options) => approvalDraftService.list(options),
    getApprovalDraftIntegrity: (options) => approvalDraftService.getIntegrityStatus(options),
    getApprovalDraftAuditLog: (options) => approvalDraftService.getAuditLog(options),
    previewApprovalPackage: (draftId) => approvalDraftService.previewPackage(draftId),
    validateApprovalPackage: (approvalPackage) => approvalDraftService.validatePackage(approvalPackage),
    getContinuousRun: (input) => continuousRunStore.get(input),
    saveContinuousRun: (input) => continuousRunStore.save(input),
    prepareOutlineGeneration(input = {}) {
      if (!experimentalWritesEnabled) throw new Error('Agent 实验性写操作尚未启用');
      return runtime.prepareApprovedToolCall({
        agentId: BID_AGENT_ID,
        goal: input.goal || '生成技术方案目录',
        toolId: OUTLINE_START_TOOL_ID,
        args: input.args,
        summary: input.summary,
        ttlMs: input.ttlMs,
      });
    },
    approve: (approvalId) => approvalService.approve(approvalId),
    reject: (approvalId) => approvalService.reject(approvalId),
    executeApprovedToolCall: (input) => runtime.executeApprovedToolCall(input),
    getRun: (runId) => runStore.getRun(runId),
    listRuns: (options) => runStore.listRuns(options),
    listApprovals: (options) => approvalService.listApprovals(options),
  };
}

module.exports = { PILOT_STATUS, createAgentHost };
