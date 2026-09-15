'use strict';

const { hashArgs } = require('./approvalService.cjs');

const TOOL_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const RISK_LEVELS = new Set(['read', 'low', 'medium', 'high']);
const APPROVAL_POLICIES = new Set(['never', 'policy', 'always']);

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeToolDefinition(input = {}) {
  const id = String(input.id || '').trim();
  const name = String(input.name || '').trim();
  const version = String(input.version || '').trim();
  const permission = String(input.permission || '').trim();
  const risk = String(input.risk || '').trim();
  const approval = String(input.approval || '').trim();

  if (!TOOL_ID_PATTERN.test(id)) throw new Error(`Tool ID 格式无效：${id || '未填写'}`);
  if (!name) throw new Error(`Tool 名称不能为空：${id}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Tool 版本必须使用 SemVer：${id}`);
  if (!permission) throw new Error(`Tool 权限不能为空：${id}`);
  if (!RISK_LEVELS.has(risk)) throw new Error(`Tool 风险等级无效：${id}`);
  if (!APPROVAL_POLICIES.has(approval)) throw new Error(`Tool 审批策略无效：${id}`);

  return Object.freeze({
    id,
    name,
    version,
    permission,
    risk,
    approval,
    description: String(input.description || '').trim(),
    taskGroup: String(input.taskGroup || '').trim() || undefined,
    idempotent: Boolean(input.idempotent),
    inputSchema: cloneSerializable(input.inputSchema || { type: 'object', additionalProperties: false }),
    outputSchema: cloneSerializable(input.outputSchema || {}),
  });
}

function createToolRegistry() {
  const tools = new Map();

  function register(definition, handler) {
    const normalized = normalizeToolDefinition(definition);
    if (typeof handler !== 'function') throw new Error(`Tool Handler 必须是函数：${normalized.id}`);
    if (tools.has(normalized.id)) throw new Error(`Tool 已注册：${normalized.id}`);
    tools.set(normalized.id, { definition: normalized, handler });
    return normalized;
  }

  function has(id) {
    return tools.has(String(id || '').trim());
  }

  function get(id) {
    const item = tools.get(String(id || '').trim());
    return item ? cloneSerializable(item.definition) : undefined;
  }

  function list() {
    return [...tools.values()].map(({ definition }) => cloneSerializable(definition));
  }

  async function invoke(id, args, context = {}) {
    const item = tools.get(String(id || '').trim());
    if (!item) throw new Error(`Tool 未注册：${id}`);
    if (!Array.isArray(context.permissions) || !context.permissions.includes(item.definition.permission)) {
      throw new Error(`Agent 未获得 Tool 权限：${item.definition.permission}`);
    }
    if (item.definition.approval === 'always') {
      const approval = context.approval;
      const validApproval = approval?.status === 'consumed'
        && approval.runId === context.runId
        && approval.agentId === context.agentId
        && approval.toolId === item.definition.id
        && approval.argsHash === hashArgs(args);
      if (!validApproval) {
        const error = new Error(`Tool 调用需要有效的用户确认：${item.definition.name}`);
        error.code = 'AGENT_APPROVAL_REQUIRED';
        throw error;
      }
    }
    return item.handler(args, context);
  }

  return { register, has, get, list, invoke };
}

module.exports = { createToolRegistry, normalizeToolDefinition };
