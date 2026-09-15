'use strict';

const { OFFICIAL_DOCUMENT_TOOL_IDS } = require('../tools/officialDocumentReadTools.cjs');

const OFFICIAL_DOCUMENT_AGENT_ID = 'official-document-agent';

function registerOfficialDocumentAgent(agentRegistry) {
  return agentRegistry.register({
    id: OFFICIAL_DOCUMENT_AGENT_ID,
    name: '公文写作 Agent',
    version: '0.1.0',
    description: '读取公文起草、检查和润色状态，安排下一步。',
    instructions: '只依据公文工作区摘要规划，不读取或返回正文，不直接修改业务数据。',
    allowedTools: Object.values(OFFICIAL_DOCUMENT_TOOL_IDS),
    enabledByDefault: false,
  });
}

module.exports = { OFFICIAL_DOCUMENT_AGENT_ID, registerOfficialDocumentAgent };
