// Live end-to-end check through the implemented provider path.
//
// This is not part of `verify:offline`: it talks to the real OrcaRouter
// gateway and therefore needs a real ORCAROUTER_API_KEY. It exercises the
// same modules the app wires up (credential seam -> aiService -> catalog) and
// never uses a bare curl as a substitute for the project code path.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createConfigStore } = require('../electron/services/configStore.cjs');
const { createAiService } = require('../electron/services/aiService.cjs');
const { createOrcaAuthService } = require('../electron/services/orcaAuthService.cjs');

const apiKey = String(process.env.ORCAROUTER_API_KEY || '').trim();
if (!apiKey) {
  console.log('ORCAROUTER_API_KEY is not set; skipping the live check');
  process.exit(0);
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-live-'));
  const app = { getPath: () => userData };
  const configStore = createConfigStore(app);
  const orcaAuthService = createOrcaAuthService({ configStore, openExternal: () => {}, onResult: () => {} });

  // The credential arrives through the API-key adapter, exactly as a user
  // pasting a key would.
  const credential = orcaAuthService.saveApiKey(apiKey);
  assert.equal(credential.source, 'api-key');
  assert.equal(orcaAuthService.getApiKeyForProvider('orcarouter'), apiKey);

  // Mirror what the settings page sends: the active provider is written both
  // as the flat active config and inside the per-provider profiles.
  configStore.save({
    text_model_provider: 'orcarouter',
    api_key: '',
    base_url: 'https://api.orcarouter.ai/v1',
    model_name: 'orcarouter/auto',
    text_model_profiles: {
      orcarouter: { api_key: '', base_url: 'https://api.orcarouter.ai/v1', model_name: 'orcarouter/auto' },
    },
  });

  const activeConfig = configStore.load();
  assert.equal(activeConfig.text_model_provider, 'orcarouter');
  assert.equal(activeConfig.model_name, 'orcarouter/auto', 'the active model must be the OrcaRouter one');

  const aiService = createAiService({ app, configStore, usageStatsStore: null, orcaAuthService });

  // 1. Live model catalog through the provider path.
  const listing = await aiService.listOrcaCatalog({ capability: 'chat' });
  assert.equal(listing.success, true, `catalog failed: ${listing.message}`);
  assert.equal(listing.source, 'remote', 'live discovery must be the authoritative source');
  assert.equal(listing.degraded, false, 'a successful live discovery must not be reported as degraded');
  assert.ok(listing.models.length > 0, 'the live catalog must return models');
  console.log(`live chat catalog: ${listing.models.length} models (authoritative, not degraded)`);
  console.log(`  sample: ${listing.models.slice(0, 5).join(', ')}`);

  // 2. The multimodal filter, through the same path.
  const multimodal = await aiService.listOrcaCatalog({ capability: 'chat', modality: 'image' });
  assert.equal(multimodal.success, true);
  assert.ok(multimodal.models.length > 0);
  assert.ok(multimodal.models.length < listing.models.length, 'attaching an image must narrow the list');
  // Every model that survives must declare image input in its catalog record.
  for (const model of multimodal.catalog) {
    assert.ok(model.inputModalities.includes('image'), `${model.id} does not declare image input but was offered`);
  }
  console.log(`live image-input catalog: ${multimodal.models.length} models (all declare image input)`);

  // 3. A real inference request through the implemented chat path.
  const content = await aiService.chat({
    messages: [{ role: 'user', content: 'Reply with exactly the two characters: OK' }],
    temperature: 0,
    max_request_attempts: 1,
    logTitle: 'orca-live-check',
  });
  assert.ok(typeof content === 'string' && content.trim().length > 0, 'a real completion must come back');
  console.log(`live completion via api.orcarouter.ai/v1: ${JSON.stringify(content.trim().slice(0, 60))}`);

  // 4. The credential is reusable and was not re-minted.
  const status = orcaAuthService.getStatus();
  assert.equal(status.source, 'api-key');
  assert.equal(status.generation, 1, 'a stored credential must be reused, not reissued');
  assert.ok(!JSON.stringify(listing).includes(apiKey), 'the key must not leak into catalog results');
  console.log(`stored credential reused: source=${status.source} generation=${status.generation} redacted=${status.redactedKey}`);

  fs.rmSync(userData, { recursive: true, force: true });
  console.log('OrcaRouter live verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
