'use strict';

const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAgentDefinition(input = {}) {
  const id = String(input.id || '').trim();
  const name = String(input.name || '').trim();
  const version = String(input.version || '').trim();
  const instructions = String(input.instructions || '').trim();
  const allowedTools = [...new Set((input.allowedTools || []).map((item) => String(item || '').trim()).filter(Boolean))];

  if (!AGENT_ID_PATTERN.test(id)) throw new Error(`Agent ID 格式无效：${id || '未填写'}`);
  if (!name) throw new Error(`Agent 名称不能为空：${id}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Agent 版本必须使用 SemVer：${id}`);
  if (!instructions) throw new Error(`Agent 指令不能为空：${id}`);

  return Object.freeze({
    id,
    name,
    version,
    instructions,
    allowedTools,
    description: String(input.description || '').trim(),
    enabledByDefault: input.enabledByDefault === true,
  });
}

function createAgentRegistry({ toolRegistry } = {}) {
  const agents = new Map();

  function register(definition) {
    const normalized = normalizeAgentDefinition(definition);
    if (agents.has(normalized.id)) throw new Error(`Agent 已注册：${normalized.id}`);
    if (toolRegistry) {
      const missing = normalized.allowedTools.filter((toolId) => !toolRegistry.has(toolId));
      if (missing.length) throw new Error(`Agent 引用了未注册 Tool：${missing.join('、')}`);
    }
    agents.set(normalized.id, normalized);
    return cloneSerializable(normalized);
  }

  function get(id) {
    const definition = agents.get(String(id || '').trim());
    return definition ? cloneSerializable(definition) : undefined;
  }

  function list() {
    return [...agents.values()].map(cloneSerializable);
  }

  return { register, get, list };
}

module.exports = { createAgentRegistry, normalizeAgentDefinition };
