'use strict';
const { GRANT_TOOL_IDS } = require('../tools/grantApplicationReadTools.cjs');
const GRANT_AGENT_ID = 'grant-application-agent';
function registerGrantApplicationAgent(registry) {
  return registry.register({ id: GRANT_AGENT_ID, name: '课题申报 Agent', version: '0.1.0', description: '按诊断、选题、申报书、终审和答辩流程规划下一步。', instructions: '只读取课题申报状态摘要，不读取正文，不直接修改业务数据。', allowedTools: Object.values(GRANT_TOOL_IDS), enabledByDefault: false });
}
module.exports = { GRANT_AGENT_ID, registerGrantApplicationAgent };
