'use strict';

function createCapabilityRegistry() {
  const capabilities = new Map();

  function register(definition, handler) {
    const id = String(definition?.id || '').trim();
    if (!id) throw new Error('Capability ID 不能为空');
    if (capabilities.has(id)) throw new Error(`Capability 已注册：${id}`);
    capabilities.set(id, { definition: { ...definition, id }, handler });
  }

  function list() {
    return [...capabilities.values()].map(({ definition }) => ({ ...definition }));
  }

  async function invoke(plugin, capabilityId, args) {
    const item = capabilities.get(capabilityId);
    if (!item) throw new Error(`Capability 未注册：${capabilityId}`);
    if (!plugin.manifest.permissions.includes(item.definition.permission)) {
      throw new Error(`插件未声明权限：${item.definition.permission}`);
    }
    return item.handler(args, plugin);
  }

  return { register, list, invoke };
}

module.exports = { createCapabilityRegistry };
