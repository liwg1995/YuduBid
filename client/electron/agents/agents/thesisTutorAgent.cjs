'use strict';
const { THESIS_TUTOR_TOOL_IDS } = require('../tools/thesisTutorReadTools.cjs');
const THESIS_TUTOR_AGENT_ID = 'thesis-tutor-agent';
function registerThesisTutorAgent(registry) {
  return registry.register({ id: THESIS_TUTOR_AGENT_ID, name: '论文导师 Agent', version: '0.1.0', description: '按诊断、研究准备、写作、评审和格式检查规划下一步。', instructions: '只读取论文工作区状态摘要，不读取论文正文、文献内容或导师反馈原文，不直接修改业务数据。', allowedTools: Object.values(THESIS_TUTOR_TOOL_IDS), enabledByDefault: false });
}
module.exports = { THESIS_TUTOR_AGENT_ID, registerThesisTutorAgent };
