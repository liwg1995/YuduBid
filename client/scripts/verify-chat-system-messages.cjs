const assert = require('node:assert/strict');
const { normalizeChatMessages } = require('../electron/utils/normalizeChatMessages.cjs');

const messages = normalizeChatMessages([
  { role: 'user', content: '问题' },
  { role: 'system', content: '规则一' },
  { role: 'assistant', content: '上下文' },
  { role: 'system', content: '规则二' },
]);
assert.deepEqual(messages, [
  { role: 'system', content: '规则一\n\n规则二' },
  { role: 'user', content: '问题' },
  { role: 'assistant', content: '上下文' },
]);

const structured = normalizeChatMessages([
  { role: 'system', content: [{ type: 'text', text: '图像规则' }, { type: 'local_image', path: '/tmp/example.png' }] },
  { role: 'system', content: '补充规则' },
  { role: 'user', content: '问题' },
]);
assert.deepEqual(structured[0].content, [
  { type: 'text', text: '图像规则' },
  { type: 'local_image', path: '/tmp/example.png' },
  { type: 'text', text: '\n\n' },
  { type: 'text', text: '补充规则' },
]);
assert.equal(structured[1].role, 'user');
console.log('系统消息顺序与结构化内容校验通过');
