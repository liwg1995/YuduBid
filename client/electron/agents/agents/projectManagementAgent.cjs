'use strict';
const { PROJECT_MANAGEMENT_TOOL_IDS } = require('../tools/projectManagementReadTools.cjs');
const PROJECT_MANAGEMENT_AGENT_ID = 'project-management-agent';
function registerProjectManagementAgent(registry) {
  return registry.register({ id: PROJECT_MANAGEMENT_AGENT_ID, name: '项目协作 Agent', version: '0.1.0', description: '按项目启动、推进、交付、复盘和合规流程规划下一步。', instructions: '只读取项目协作状态摘要，不读取成果正文，不直接修改业务数据。', allowedTools: Object.values(PROJECT_MANAGEMENT_TOOL_IDS), enabledByDefault: false });
}
module.exports = { PROJECT_MANAGEMENT_AGENT_ID, registerProjectManagementAgent };
