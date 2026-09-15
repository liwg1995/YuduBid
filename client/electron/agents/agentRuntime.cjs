'use strict';

const crypto = require('node:crypto');

const MAX_GOAL_LENGTH = 4000;
const MAX_TOOL_CALLS = 16;

function now() {
  return new Date().toISOString();
}

function safeClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeGoal(value) {
  const goal = String(value || '').trim();
  if (!goal) throw new Error('Agent 目标不能为空');
  if (goal.length > MAX_GOAL_LENGTH) throw new Error(`Agent 目标不能超过 ${MAX_GOAL_LENGTH} 个字符`);
  return goal;
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('Agent 计划格式无效');
  const calls = Array.isArray(plan.toolCalls) ? plan.toolCalls : [];
  if (calls.length > MAX_TOOL_CALLS) throw new Error(`单次 dry-run 最多调用 ${MAX_TOOL_CALLS} 个 Tool`);
  return {
    summary: String(plan.summary || '').trim(),
    toolCalls: calls.map((call, index) => ({
      id: String(call?.id || `call-${index + 1}`).trim(),
      toolId: String(call?.toolId || '').trim(),
      args: safeClone(call?.args || {}),
    })),
  };
}

function createAgentRuntime({ agentRegistry, toolRegistry, planner, runStore, approvalService }) {
  if (!agentRegistry || !toolRegistry || typeof planner?.createPlan !== 'function' || typeof planner?.createRecommendation !== 'function') {
    throw new Error('Agent Runtime 依赖未完整初始化');
  }
  const pendingApprovedCalls = new Map();

  function persistRun(run) {
    if (!runStore?.saveRun) return;
    try {
      runStore.saveRun(run);
    } catch (error) {
      run.persistenceError = String(error?.message || error);
    }
  }

  async function runReadOnly(input = {}, mode = 'dry-run') {
    const goal = normalizeGoal(input.goal);
    const agent = agentRegistry.get(input.agentId);
    if (!agent) throw new Error(`Agent 未注册：${input.agentId || '未填写'}`);
    const run = {
      runId: crypto.randomUUID(),
      mode,
      agentId: agent.id,
      agentVersion: agent.version,
      goal,
      scope: {
        workflowKind: String(input?.context?.workflowKind || 'technical-plan').slice(0, 80),
        projectId: String(input?.context?.projectId || '').slice(0, 128) || undefined,
      },
      status: 'planning',
      startedAt: now(),
      steps: [],
    };

    try {
      const plan = normalizePlan(await planner.createPlan({
        agent: safeClone(agent),
        goal,
        context: safeClone(input.context || {}),
      }));
      run.plan = plan.summary;
      run.status = 'running';

      for (const call of plan.toolCalls) {
        if (!call.toolId || !agent.allowedTools.includes(call.toolId)) {
          throw new Error(`Agent 计划调用了未授权 Tool：${call.toolId || '未填写'}`);
        }
        const definition = toolRegistry.get(call.toolId);
        if (!definition) throw new Error(`Agent 计划调用了未注册 Tool：${call.toolId}`);
        if (definition.risk !== 'read' || definition.approval !== 'never') {
          throw new Error(`dry-run 禁止调用非只读 Tool：${call.toolId}`);
        }

        const startedAt = now();
        const result = await toolRegistry.invoke(call.toolId, call.args, {
          mode,
          runId: run.runId,
          agentId: agent.id,
          permissions: agent.allowedTools,
        });
        run.steps.push({
          id: call.id,
          toolId: call.toolId,
          status: 'success',
          startedAt,
          finishedAt: now(),
          result: safeClone(result),
        });
      }

      run.recommendation = String(await planner.createRecommendation({
        agent: safeClone(agent),
        goal,
        plan: safeClone(plan),
        steps: safeClone(run.steps),
      }) || '').trim();
      if (mode === 'shadow') {
        if (typeof planner.createShadowEvaluation !== 'function') throw new Error('Agent Planner 不支持影子评估');
        run.shadowEvaluation = safeClone(await planner.createShadowEvaluation({
          agent: safeClone(agent),
          goal,
          plan: safeClone(plan),
          steps: safeClone(run.steps),
          recommendation: run.recommendation,
        }));
      }
      run.status = 'success';
      run.finishedAt = now();
      persistRun(run);
      return safeClone(run);
    } catch (error) {
      const runtimeError = error instanceof Error ? error : new Error(String(error));
      run.status = 'error';
      run.error = runtimeError.message;
      run.finishedAt = now();
      persistRun(run);
      runtimeError.agentRun = safeClone(run);
      throw runtimeError;
    }
  }

  const runDryRun = (input = {}) => runReadOnly(input, 'dry-run');
  const runShadowRun = (input = {}) => {
    const projectlessWorkflows = new Set(['official-document', 'grant-application', 'thesis-tutor', 'software-copyright']);
    if (!projectlessWorkflows.has(String(input?.context?.workflowKind || '')) && !String(input?.context?.projectId || '').trim()) {
      throw new Error('影子运行必须指定项目 ID');
    }
    return runReadOnly(input, 'shadow');
  };

  function prepareApprovedToolCall(input = {}) {
    if (!runStore?.saveRun || !approvalService?.requestApproval) throw new Error('审批执行 Runtime 尚未初始化');
    const goal = normalizeGoal(input.goal);
    const agent = agentRegistry.get(input.agentId);
    if (!agent) throw new Error(`Agent 未注册：${input.agentId || '未填写'}`);
    const toolId = String(input.toolId || '').trim();
    if (!agent.allowedTools.includes(toolId)) throw new Error(`Agent 未获得 Tool 权限：${toolId || '未填写'}`);
    const definition = toolRegistry.get(toolId);
    if (!definition) throw new Error(`Tool 未注册：${toolId}`);
    if (definition.risk === 'read' || definition.approval !== 'always') {
      throw new Error('审批执行入口只允许始终需要确认的写 Tool');
    }
    const summary = String(input.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!summary) throw new Error('审批操作摘要不能为空');
    const run = {
      runId: crypto.randomUUID(),
      mode: 'approved-tool',
      agentId: agent.id,
      agentVersion: agent.version,
      goal,
      status: 'waiting_approval',
      startedAt: now(),
      steps: [{ id: 'approval', toolId, status: 'waiting_approval', summary }],
    };
    const args = safeClone(input.args || {});
    const approval = approvalService.requestApproval({
      runId: run.runId,
      agentId: agent.id,
      toolId,
      args,
      summary,
      ttlMs: input.ttlMs,
    });
    run.approvalId = approval.approvalId;
    runStore.saveRun(run);
    pendingApprovedCalls.set(run.runId, { agent, toolId, args, approvalId: approval.approvalId });
    return { run: safeClone(run), approval: safeClone(approval) };
  }

  async function executeApprovedToolCall(input = {}) {
    if (!runStore?.getRun || !approvalService?.consume) throw new Error('审批执行 Runtime 尚未初始化');
    const runId = String(input.runId || '').trim();
    const pending = pendingApprovedCalls.get(runId);
    const storedRun = runStore.getRun(runId);
    if (!storedRun || storedRun.status !== 'waiting_approval') throw new Error('Agent Run 不在等待审批状态');
    if (!pending) throw new Error('待执行参数已失效，请重新发起并确认操作');
    if (pending.approvalId !== String(input.approvalId || '').trim()) throw new Error('审批请求与待执行操作不匹配');

    const receipt = approvalService.consume({
      approvalId: pending.approvalId,
      runId,
      agentId: pending.agent.id,
      toolId: pending.toolId,
      args: pending.args,
    });
    pendingApprovedCalls.delete(runId);
    const startedAt = now();
    const running = {
      ...storedRun,
      status: 'running',
      steps: [{ ...storedRun.steps[0], status: 'running', startedAt }],
    };
    runStore.saveRun(running);

    try {
      const result = await toolRegistry.invoke(pending.toolId, pending.args, {
        mode: 'approved-tool',
        runId,
        agentId: pending.agent.id,
        permissions: pending.agent.allowedTools,
        approval: receipt,
      });
      const completed = {
        ...running,
        status: 'success',
        finishedAt: now(),
        steps: [{ ...running.steps[0], status: 'success', finishedAt: now(), result: safeClone(result) }],
      };
      runStore.saveRun(completed);
      return safeClone(completed);
    } catch (error) {
      const runtimeError = error instanceof Error ? error : new Error(String(error));
      const failed = {
        ...running,
        status: 'error',
        error: runtimeError.message,
        finishedAt: now(),
        steps: [{ ...running.steps[0], status: 'error', finishedAt: now(), error: runtimeError.message }],
      };
      persistRun(failed);
      runtimeError.agentRun = safeClone(failed);
      throw runtimeError;
    }
  }

  return { runDryRun, runShadowRun, prepareApprovedToolCall, executeApprovedToolCall };
}

module.exports = { createAgentRuntime };
