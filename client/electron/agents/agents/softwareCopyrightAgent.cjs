'use strict';
const { SOFTWARE_COPYRIGHT_TOOL_IDS } = require('../tools/softwareCopyrightReadTools.cjs');
const SOFTWARE_COPYRIGHT_AGENT_ID = 'software-copyright-agent';
function registerSoftwareCopyrightAgent(registry) {
  return registry.register({ id: SOFTWARE_COPYRIGHT_AGENT_ID, name: '软件著作 Agent', version: '0.1.0', description: '按源码、登记信息、草稿、人工复核和导出流程规划下一步。', instructions: '只读取软著工作区状态摘要，不读取源码、申请材料或草稿正文，不直接修改业务数据。', allowedTools: Object.values(SOFTWARE_COPYRIGHT_TOOL_IDS), enabledByDefault: false });
}
module.exports = { SOFTWARE_COPYRIGHT_AGENT_ID, registerSoftwareCopyrightAgent };
