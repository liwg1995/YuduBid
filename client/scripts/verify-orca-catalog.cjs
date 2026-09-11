// OrcaRouter model catalog: parsing, per-capability filtering, multimodal
// fail-closed behaviour, bounds, the verified seed, and the guarantee that a
// hand-written example list never masquerades as the live catalog.
//
// No test framework is used because the repository has none; this follows the
// existing scripts/verify-*.cjs idiom.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CATALOG_MAX_ITEMS,
  VERIFIED_SEED,
  buildCatalogUrl,
  catalogQueryCapability,
  discoverCatalog,
  isChatCapable,
  normalizeCatalogItem,
  parseCatalogPayload,
  seedModels,
  supportsInputModality,
} = require('../electron/services/orcaModelCatalog.cjs');

// A fixture covering every shape the filter must discriminate: text-only chat,
// image-input chat, an image-generation model, an embedding model, a video
// model, a rerank model, and records that declare nothing at all.
const FIXTURE = {
  data: [
    {
      id: 'openai/gpt-5.5',
      name: 'GPT-5.5',
      context_length: 400000,
      supported_endpoint_types: ['openai', 'openai-response'],
      architecture: { input_modalities: ['text', 'image', 'file'], output_modalities: null },
    },
    {
      id: 'anthropic/claude-opus-4.8',
      name: 'Claude Opus 4.8',
      supported_endpoint_types: ['openai', 'anthropic'],
      architecture: { input_modalities: ['text', 'image', 'file'], output_modalities: ['text'] },
    },
    {
      id: 'deepseek/deepseek-v4-pro',
      supported_endpoint_types: ['openai'],
      architecture: { input_modalities: ['text'], output_modalities: null },
    },
    {
      id: 'google/gemini-3-pro-image-preview',
      supported_endpoint_types: ['gemini'],
      architecture: { input_modalities: ['image', 'text'], output_modalities: ['image', 'text'] },
    },
    { id: 'google/imagen-4.0-fast-generate-001', supported_endpoint_types: ['image-generation'] },
    { id: 'google/gemini-embedding-001', supported_endpoint_types: ['embeddings'] },
    { id: 'vendor/reranker-large', supported_endpoint_types: ['jina-rerank'] },
    { id: 'vendor/veo-3', supported_endpoint_types: ['openai-video'] },
    // Declares nothing: must fail closed for every modality filter.
    { id: 'vendor/undeclared-chat', supported_endpoint_types: ['openai'] },
    // Null endpoint types: cannot prove the client can speak to it.
    { id: 'vendor/unprovable', supported_endpoint_types: null },
    // Hostile shapes.
    { id: '', supported_endpoint_types: ['openai'] },
    { id: 'bad id with space', supported_endpoint_types: ['openai'] },
    { id: 'sk-orca-should-not-be-a-model', supported_endpoint_types: ['openai'] },
    'not-an-object',
    null,
  ],
};

const ids = (list) => list.map((model) => model.id);

function main() {
  // ---------------------------------------------------------------------
  // 1. Catalog URL and the capability query parameter.
  // ---------------------------------------------------------------------
  assert.equal(buildCatalogUrl('https://api.orcarouter.ai/v1', 'chat'), 'https://api.orcarouter.ai/v1/models?capability=chat');
  assert.equal(buildCatalogUrl('https://api.orcarouter.ai/v1/', 'embedding'), 'https://api.orcarouter.ai/v1/models?capability=embedding');
  assert.equal(buildCatalogUrl('https://api.orcarouter.ai/v1', 'image'), 'https://api.orcarouter.ai/v1/models?capability=image');
  // Video and rerank have no server-side capability value; they filter locally.
  assert.equal(catalogQueryCapability('video'), '');
  assert.equal(catalogQueryCapability('rerank'), '');
  assert.equal(buildCatalogUrl('https://api.orcarouter.ai/v1', 'video'), 'https://api.orcarouter.ai/v1/models');
  // The catalog is on the inference origin, never the auth origin.
  assert.ok(buildCatalogUrl('https://api.orcarouter.ai/v1', 'chat').startsWith('https://api.orcarouter.ai/v1/'));
  assert.ok(!buildCatalogUrl('https://api.orcarouter.ai/v1', 'chat').includes('www.orcarouter.ai'));

  // ---------------------------------------------------------------------
  // 2. Record normalization and hostile input.
  // ---------------------------------------------------------------------
  const normalized = normalizeCatalogItem(FIXTURE.data[0]);
  assert.equal(normalized.id, 'openai/gpt-5.5', 'the vendor/model namespace must survive verbatim');
  assert.equal(normalized.contextLength, 400000);
  assert.deepEqual(normalized.inputModalities, ['text', 'image', 'file']);
  assert.equal(normalizeCatalogItem({ id: 'bad id with space' }), null);
  assert.equal(normalizeCatalogItem({ id: '' }), null);
  assert.equal(normalizeCatalogItem(null), null);
  assert.equal(normalizeCatalogItem('not-an-object'), null);
  assert.equal(normalizeCatalogItem({ id: 'x'.repeat(201) }), null);
  // A key-shaped string is rejected at the boundary, not rendered as a model.
  assert.equal(normalizeCatalogItem({ id: 'sk-orca-should-not-be-a-model' }), null);

  // ---------------------------------------------------------------------
  // 3. Per-capability filtering.
  // ---------------------------------------------------------------------
  const chat = ids(parseCatalogPayload(FIXTURE, { capability: 'chat' }));
  assert.ok(chat.includes('openai/gpt-5.5'));
  assert.ok(chat.includes('anthropic/claude-opus-4.8'));
  assert.ok(chat.includes('deepseek/deepseek-v4-pro'));
  // An image-generation model that also accepts text is still a chat model
  // (it advertises a speakable endpoint and produces text), but it must not be
  // treated as a plain text model by the mere absence of a check.
  assert.ok(!chat.includes('google/imagen-4.0-fast-generate-001'), 'image-only models must not appear in a chat dropdown');
  assert.ok(!chat.includes('vendor/reranker-large'), 'rerank models must not appear in a chat dropdown');
  assert.ok(!chat.includes('vendor/veo-3'), 'video models must not appear in a chat dropdown');
  assert.ok(!chat.includes('google/gemini-embedding-001'), 'embedding models must not appear in a chat dropdown');
  // A record with null endpoint types cannot prove it is speakable.
  assert.ok(!chat.includes('vendor/unprovable'), 'undeclared endpoint types must fail closed');
  assert.ok(!chat.includes('sk-orca-should-not-be-a-model'), 'a key-shaped id must never be listed as a model');

  const embedding = ids(parseCatalogPayload(FIXTURE, { capability: 'embedding' }));
  assert.deepEqual(embedding, ['google/gemini-embedding-001']);
  const image = ids(parseCatalogPayload(FIXTURE, { capability: 'image' }));
  assert.deepEqual(image, ['google/imagen-4.0-fast-generate-001']);
  const video = ids(parseCatalogPayload(FIXTURE, { capability: 'video' }));
  assert.deepEqual(video, ['vendor/veo-3']);
  const rerank = ids(parseCatalogPayload(FIXTURE, { capability: 'rerank' }));
  assert.deepEqual(rerank, ['vendor/reranker-large']);

  // ---------------------------------------------------------------------
  // 4. Multimodal fail-closed.
  // ---------------------------------------------------------------------
  const chatImage = ids(parseCatalogPayload(FIXTURE, { capability: 'chat', modality: 'image' }));
  // Only models that advertise a speakable endpoint AND declare image input.
  // The image-preview model qualifies: it speaks `gemini` and accepts images.
  assert.deepEqual(chatImage, ['anthropic/claude-opus-4.8', 'google/gemini-3-pro-image-preview', 'openai/gpt-5.5']);
  assert.ok(!chatImage.includes('deepseek/deepseek-v4-pro'), 'a text-only model must be dropped once an image is attached');
  assert.ok(!chatImage.includes('vendor/undeclared-chat'), 'a model that declares no modalities must fail closed');
  const chatAudio = ids(parseCatalogPayload(FIXTURE, { capability: 'chat', modality: 'audio' }));
  assert.deepEqual(chatAudio, [], 'no fixture model declares audio input');

  assert.equal(supportsInputModality(normalizeCatalogItem(FIXTURE.data[2]), 'text'), true);
  assert.equal(supportsInputModality(normalizeCatalogItem(FIXTURE.data[2]), 'image'), false);
  assert.equal(supportsInputModality(normalizeCatalogItem(FIXTURE.data[8]), 'image'), false, 'undeclared must fail closed');

  // ---------------------------------------------------------------------
  // 5. Bounds.
  // ---------------------------------------------------------------------
  const many = { data: Array.from({ length: CATALOG_MAX_ITEMS + 250 }, (_, index) => ({
    id: `vendor/model-${index}`,
    supported_endpoint_types: ['openai'],
  })) };
  const bounded = parseCatalogPayload(many, { capability: 'chat' });
  assert.ok(bounded.length <= CATALOG_MAX_ITEMS, 'a catalog response must not be unbounded');
  assert.equal(CATALOG_MAX_ITEMS, 2000);

  // Duplicate ids collapse.
  const duplicated = parseCatalogPayload({ data: [
    { id: 'a/b', supported_endpoint_types: ['openai'] },
    { id: 'a/b', supported_endpoint_types: ['openai'] },
  ] }, { capability: 'chat' });
  assert.deepEqual(ids(duplicated), ['a/b']);
  // Results are stable regardless of catalog order.
  const reversed = parseCatalogPayload({ data: [...FIXTURE.data].reverse() }, { capability: 'chat' });
  assert.deepEqual(ids(reversed), chat.sort(), 'ordering must not depend on the catalog response order');

  // ---------------------------------------------------------------------
  // 6. The verified seed.
  // ---------------------------------------------------------------------
  const seedChat = seedModels({ capability: 'chat' });
  assert.deepEqual(ids(seedChat), [
    'openai/gpt-5.5',
    'anthropic/claude-opus-4.8',
    'google/gemini-3.5-flash',
    'deepseek/deepseek-v4-pro',
    'orcarouter/auto',
  ], 'the verified seed is the documented five models');
  const seedImage = ids(seedModels({ capability: 'chat', modality: 'image' }));
  assert.ok(seedImage.includes('openai/gpt-5.5'), 'GPT-5.5 declares image input and must stay selectable with an image attached');
  assert.ok(!seedImage.includes('deepseek/deepseek-v4-pro'), 'a text-only seed model must be dropped for an image request');
  // The reasoning effort ladder must survive a discovery outage.
  const gpt55 = seedChat.find((model) => model.id === 'openai/gpt-5.5');
  assert.deepEqual(gpt55.reasoningEfforts, ['low', 'medium', 'high', 'xhigh'], 'reasoning levels must be preserved');
  assert.equal(gpt55.reasoning, true);
  assert.ok(gpt55.contextLength > 0);
  // The seed is frozen so a caller cannot mutate the shared list.
  assert.throws(() => { VERIFIED_SEED.push({ id: 'x' }); }, TypeError);

  // ---------------------------------------------------------------------
  // 7. Live discovery is authoritative; the seed never contaminates it.
  // ---------------------------------------------------------------------
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => Buffer.from(JSON.stringify(FIXTURE)),
    };
  };

  return discoverCatalog({
    apiBaseUrl: 'https://api.orcarouter.ai/v1',
    apiKey: 'sk-orca-verify-catalog-key',
    capability: 'chat',
    fetchImpl: fakeFetch,
  }).then((result) => {
    assert.equal(result.source, 'remote');
    assert.equal(result.degraded, false);
    assert.equal(calls[0].url, 'https://api.orcarouter.ai/v1/models?capability=chat');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-orca-verify-catalog-key', 'the user key must be used when present');
    // A successful live discovery is the authoritative list: it must not be
    // merged with the seed.
    const liveIds = ids(result.models);
    assert.ok(!liveIds.includes('google/gemini-3.5-flash'), 'seed models absent from the live catalog must not be merged in');
    assert.deepEqual(liveIds, chat);

    // A failed discovery must reject, so the caller can decide to use the seed
    // and label it degraded — it must never silently return the seed as remote.
    return discoverCatalog({
      apiBaseUrl: 'https://api.orcarouter.ai/v1',
      capability: 'chat',
      fetchImpl: async () => ({ ok: false, status: 503, headers: { get: () => null } }),
    }).then(
      () => { throw new Error('a failed catalog request must reject'); },
      (error) => {
        assert.equal(error.status, 503);
      },
    );
  }).then(() => discoverCatalog({
    apiBaseUrl: 'https://api.orcarouter.ai/v1',
    capability: 'chat',
    fetchImpl: async (url, options) => {
      // The catalog is readable without a key, so an unauthenticated caller
      // must not be refused before the request is even made.
      assert.equal(options.headers.Authorization, undefined);
      return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from(JSON.stringify(FIXTURE)) };
    },
  })).then((unauthenticated) => {
    assert.equal(unauthenticated.source, 'remote');
    assert.ok(unauthenticated.count > 0);
  }).then(() => {
    // -------------------------------------------------------------------
    // 8. No hand-written example list may be presented as the full catalog,
    //    and no committed secret may exist.
    // -------------------------------------------------------------------
    const source = fs.readFileSync(path.join(__dirname, '../electron/services/orcaModelCatalog.cjs'), 'utf8');
    assert.ok(!/sk-orca-[A-Za-z0-9]{8,}/.test(source), 'no real-looking key may be committed');
    // The only literal model ids in the module belong to the verified seed.
    const literalIds = [...source.matchAll(/'((?:openai|anthropic|google|deepseek|orcarouter|vendor)\/[^']+)'/g)].map((match) => match[1]);
    const seedIds = VERIFIED_SEED.map((model) => model.id);
    for (const literal of literalIds) {
      assert.ok(seedIds.includes(literal), `unexpected hardcoded model id outside the verified seed: ${literal}`);
    }
    assert.ok(seedIds.length <= 5, 'the seed must stay small and verified');

    console.log(`OrcaRouter catalog verification passed (chat ${chat.length}, image-input ${chatImage.length}, seed ${seedIds.length})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
