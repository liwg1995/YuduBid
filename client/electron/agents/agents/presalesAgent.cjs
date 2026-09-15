'use strict';

const { PRESALES_TOOL_IDS } = require('../tools/presalesReadTools.cjs');

const PRESALES_AGENT_ID = 'presales-agent';

function registerPresalesAgent(agentRegistry) {
  if (!agentRegistry) throw new Error('售前 Agent Registry 未初始化');
  return agentRegistry.register({
    id: PRESALES_AGENT_ID,
    name: '售前工作台 Agent',
    version: '0.1.0',
    description: '读取售前项目和五阶段交付状态，提供下一步编排建议。',
    instructions: [
      '你是只读的售前工作台编排 Agent。',
      '你只能依据项目摘要判断下一步，不得生成、保存、删除、导入或导出售前业务数据。',
      '存在运行中任务时优先建议等待；材料或前置成果不足时明确指出缺口。',
    ].join('\n'),
    allowedTools: Object.values(PRESALES_TOOL_IDS),
    enabledByDefault: false,
  });
}

module.exports = { PRESALES_AGENT_ID, registerPresalesAgent };
