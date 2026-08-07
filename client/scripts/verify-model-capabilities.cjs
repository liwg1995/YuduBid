const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createCapabilityCacheKey,
  isCapabilityCacheFresh,
  normalizeCapabilityPayload,
  getKnownCapability,
} = require('../electron/utils/modelCapabilities.cjs');

const capability = normalizeCapabilityPayload({
  id: 'demo-model',
  context_length: 128000,
  max_output_tokens: 8192,
  capabilities: { supports_thinking: true, supports_json_mode: true },
  input_modalities: ['text', 'image'],
}, { provider: 'custom', model: 'demo-model' });

assert.equal(capability.contextLength, 128000);
assert.equal(capability.maxOutputTokens, 8192);
assert.equal(capability.supportsThinking, true);
assert.equal(capability.supportsJsonMode, true);
assert.equal(capability.supportsVision, true);
assert.notEqual(createCapabilityCacheKey({ provider: 'custom', baseUrl: 'https://a.test/v1', model: 'demo' }), createCapabilityCacheKey({ provider: 'custom', baseUrl: 'https://b.test/v1', model: 'demo' }));
assert.equal(isCapabilityCacheFresh({ fetchedAt: new Date().toISOString() }), true);
assert.equal(isCapabilityCacheFresh({ fetchedAt: '2020-01-01T00:00:00.000Z' }), false);
assert.equal(getKnownCapability({ provider: 'agnes-ai-cn', model: 'agnes-2.5-pro-alpha' }).contextLength, 1000000);
assert.equal(getKnownCapability({ provider: 'deepseek', model: 'deepseek-v4-pro' }).supportsThinking, true);
assert.equal(getKnownCapability({ provider: 'longcat', model: 'LongCat-2.0' }).supportsThinking, true);
const rendererSource = fs.readFileSync(path.join(__dirname, '../electron/services/localImageRenderService.cjs'), 'utf8');
const outlineSource = fs.readFileSync(path.join(__dirname, '../electron/services/outlineGenerationTask.cjs'), 'utf8');
assert.match(rendererSource, /renderQueue/);
assert.match(rendererSource, /before-quit/);
assert.match(outlineSource, /response-file/);
assert.match(outlineSource, /responseFileRequirements/);
const aiSource = fs.readFileSync(path.join(__dirname, '../electron/services/aiService.cjs'), 'utf8');
assert.match(aiSource, /extra_body: \{ response_format: 'url' \}/);
assert.match(aiSource, /chat_template_kwargs/);
assert.match(aiSource, /budget_tokens/);
assert.match(aiSource, /ratio: request\.ratio/);
console.log('model capability verification passed');
