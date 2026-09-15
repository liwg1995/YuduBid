'use strict';

const { TOOL_IDS } = require('../tools/bidReadTools.cjs');
const { OUTLINE_START_TOOL_ID } = require('../tools/bidWriteTools.cjs');

const BID_AGENT_ID = 'bid-agent';

function registerBidAgent(agentRegistry, { includeExperimentalWrites = false } = {}) {
  if (!agentRegistry) throw new Error('招投标 Agent Registry 未初始化');
  return agentRegistry.register({
    id: BID_AGENT_ID,
    name: '招投标 Agent',
    version: '0.1.0',
    description: '读取技术方案、活动任务和知识库摘要，提供流程建议。',
    instructions: [
      '你是受控的招投标辅助 Agent。',
      '当前版本只能读取摘要和活动任务，不得声称已经生成、修改、删除或导出任何业务数据。',
      '材料不足时明确指出缺口；所有建议必须区分已有事实、推断和待用户确认事项。',
    ].join('\n'),
    allowedTools: [
      ...Object.values(TOOL_IDS),
      ...(includeExperimentalWrites ? [OUTLINE_START_TOOL_ID] : []),
    ],
    enabledByDefault: false,
  });
}

module.exports = { BID_AGENT_ID, registerBidAgent };
