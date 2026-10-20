const assert = require('node:assert/strict');
const { createAiService } = require('../electron/services/aiService.cjs');

const config = {
  text_model_provider: 'custom',
  api_key: 'local-test-key',
  base_url: 'http://127.0.0.1:1/v1',
  model_name: 'local-test-model',
  developer_mode: false,
  text_model_profiles: { custom: { concurrency_limit: 1, request_mode: 'normal' } },
};
const aiService = createAiService({
  app: { getPath: () => '/tmp' },
  configStore: { load: () => config },
});
const originalFetch = global.fetch;

async function runResponses(responses, request) {
  const calls = [];
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const next = responses.shift();
    assert(next, '模型调用次数超过预期');
    return new Response(JSON.stringify({ choices: [{ message: { content: next.content }, finish_reason: next.finishReason || 'stop' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    return { result: await aiService.collectJsonResponse(request), calls };
  } finally {
    global.fetch = originalFetch;
  }
}

(async () => {
  const messages = [{ role: 'user', content: '返回 JSON' }];
  const progress = [];
  const request = {
    messages,
    progressLabel: '完整目录',
    failureMessage: '模型返回的目录数据格式无效',
    max_retries: 0,
    fail_on_truncated_output: true,
    repair_syntax_only: true,
    normalizer: (value) => value,
    validator: (value) => { if (!Array.isArray(value.outline)) throw new Error('outline 必须是数组'); },
    progressCallback: (message) => progress.push(message),
  };

  const repaired = await runResponses([
    { content: '{"outline": ' },
    { content: '{"outline": []}' },
  ], request);
  assert.deepEqual(repaired.result, { outline: [] });
  assert.equal(repaired.calls.length, 2, '语法错误只应触发一次修复');
  assert(progress.some((message) => message.includes('JSON 语法错误')));

  const structurallyInvalid = [{ content: '{"items": []}' }];
  await assert.rejects(runResponses(structurallyInvalid, request), (error) => error.code === 'JSON_STRUCTURE_INVALID');
  assert.equal(structurallyInvalid.length, 0, '结构错误应直接转分步生成');

  const failedResponses = [{ content: '{"outline": ' }, { content: '{"outline": ' }];
  await assert.rejects(runResponses(failedResponses, request), /模型返回的目录数据格式无效/);
  assert.equal(failedResponses.length, 0, '修复失败后不应再次生成整份目录');

  const truncatedResponses = [{ content: '{"outline": [', finishReason: 'length' }];
  await assert.rejects(runResponses(truncatedResponses, request), (error) => error.code === 'JSON_OUTPUT_TRUNCATED');
  assert.equal(truncatedResponses.length, 0, '截断结果不应发送整份修复请求');
  assert(progress.some((message) => message.includes('输出达到 Token 上限')));
  console.log('完整目录 JSON 诊断、一次修复与截断快速回退验证通过');
})().catch((error) => { global.fetch = originalFetch; console.error(error); process.exitCode = 1; });
