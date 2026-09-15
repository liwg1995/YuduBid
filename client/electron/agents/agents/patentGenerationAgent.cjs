'use strict';
const { PATENT_GENERATION_TOOL_IDS } = require('../tools/patentGenerationReadTools.cjs');
const PATENT_GENERATION_AGENT_ID = 'patent-generation-agent';
function registerPatentGenerationAgent(registry) {
  return registry.register({ id: PATENT_GENERATION_AGENT_ID, name: '专利生成 Agent', version: '0.1.0', description: '按案件准备、专利挖掘、事实补充、交底书、查新和修订规划下一步。', instructions: '只读取专利工作区状态摘要，不读取项目源码、事实内容、查新材料或交底书正文，不直接修改业务数据。', allowedTools: Object.values(PATENT_GENERATION_TOOL_IDS), enabledByDefault: false });
}
module.exports = { PATENT_GENERATION_AGENT_ID, registerPatentGenerationAgent };
