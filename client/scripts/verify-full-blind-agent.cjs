const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createBlindAgentAdapter } = require('../electron/services/blind-check-upstream/agentAdapter.cjs');
(async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), '暗标会话-'));
 try {
  const commands = [ { tool: 'read', args: { path: '../../outside' } }, { tool: 'write', args: { path: '结果.json', content: '{"checked":true}' } }, { tool: 'apply-edits', args: { edits: [] } }, { tool: 'json-validation', args: { file_path: '结果.json' } }, { tool: 'finish', args: {} } ];
  let customCalled = false; let pathRejected = false;
  const service = createBlindAgentAdapter({ app: { getPath: () => root }, aiService: { collectJsonResponse: async request => { if (request.messages.some(message => message.content.includes('工具路径必须位于'))) pathRejected = true; return commands.shift(); } } });
  const result = await service.runTask({ persistent_task: { mode: 'create' }, title: '验证复核', prompt: '执行验证', output_file: '结果.json', create_tools: () => [{ name: 'apply-edits', execute: async () => { customCalled = true; return { content: [{ type: 'text', text: 'done' }] }; } }], validateOutput: candidate => ({ value: JSON.parse(candidate.output_content), issues: [{ severity: 'quality', message: '待人工核对证据' }] }) });
  assert(result.validation_result.checked); assert(customCalled); assert(pathRejected);
  service.updatePersistentTask('blind-check-review', { input_signature: 'signature' });
  const resumed = createBlindAgentAdapter({ app: { getPath: () => root }, aiService: {} });
  assert(resumed.hasPersistentTaskSession()); assert.equal(resumed.loadPersistentTask().state.input_signature, 'signature');
  assert.equal(result.warnings.length, 1);
  console.log('暗标会话适配验证通过：工具执行、目录边界、结果文件校验、人工复核标记和会话持久化。');
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
