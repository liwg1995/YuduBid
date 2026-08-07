const CAPABILITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function createCapabilityCacheKey({ provider, baseUrl, model }) {
  return [provider, String(baseUrl || '').trim().replace(/\/+$/, ''), model].map((value) => String(value || '').trim()).join('|');
}

function firstNumber(...values) {
  return values.map(Number).find((value) => Number.isFinite(value) && value > 0) || undefined;
}

function findBoolean(source, keys) {
  for (const key of keys) {
    if (typeof source?.[key] === 'boolean') return source[key];
  }
  return undefined;
}

function normalizeCapabilityPayload(payload, context = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const capabilities = data.capabilities && typeof data.capabilities === 'object' ? data.capabilities : {};
  const modalities = Array.isArray(data.modalities) ? data.modalities : [];
  const inputModalities = Array.isArray(data.input_modalities) ? data.input_modalities : [];
  const outputModalities = Array.isArray(data.output_modalities) ? data.output_modalities : [];
  const supportsVision = findBoolean({ ...data, ...capabilities }, ['supports_vision', 'vision', 'image_input'])
    ?? ([...modalities, ...inputModalities].some((item) => String(item).toLowerCase().includes('image')) || undefined);
  const supportsThinking = findBoolean({ ...data, ...capabilities }, ['supports_thinking', 'thinking', 'reasoning', 'supports_reasoning']);
  const supportsJsonMode = findBoolean({ ...data, ...capabilities }, ['supports_json_mode', 'json_mode', 'structured_outputs']);

  return {
    provider: context.provider || data.owned_by || '',
    model: context.model || data.id || '',
    contextLength: firstNumber(data.context_length, data.max_context_length, data.context_window, data.max_input_tokens),
    maxOutputTokens: firstNumber(data.max_output_tokens, data.max_tokens, data.max_output),
    supportsTemperature: findBoolean({ ...data, ...capabilities }, ['supports_temperature', 'temperature']),
    supportsThinking,
    supportsVision,
    supportsJsonMode,
    modalities: [...new Set([...modalities, ...inputModalities, ...outputModalities].map(String).filter(Boolean))],
  };
}

function isCapabilityCacheFresh(item, now = Date.now()) {
  const fetchedAt = Date.parse(item?.fetchedAt || '');
  return Boolean(Number.isFinite(fetchedAt) && now - fetchedAt >= 0 && now - fetchedAt < CAPABILITY_CACHE_TTL_MS);
}

function getKnownCapability({ provider, model }) {
  if (provider === 'deepseek' && (model === 'deepseek-v4-flash' || model === 'deepseek-v4-pro')) {
    return {
      known: true,
      provider,
      model,
      contextLength: 1000000,
      maxOutputTokens: 384000,
      supportsTemperature: false,
      supportsThinking: true,
      supportsVision: false,
      supportsJsonMode: true,
      modalities: ['text'],
    };
  }
  if (provider === 'longcat' && model === 'LongCat-2.0') {
    return {
      known: true,
      provider,
      model,
      maxOutputTokens: 131072,
      supportsTemperature: true,
      supportsThinking: true,
      supportsVision: false,
      modalities: ['text'],
    };
  }
  if (provider !== 'agnes-ai-cn' && provider !== 'agnes-ai-global') return null;
  const normalizedModel = String(model || '').trim();
  if (!normalizedModel.startsWith('agnes-')) return null;
  const isProAlpha = normalizedModel === 'agnes-2.5-pro-alpha';
  const isFlash = normalizedModel === 'agnes-2.0-flash' || normalizedModel === 'agnes-2.5-flash';
  return {
    known: true,
    provider,
    model: normalizedModel,
    contextLength: isProAlpha ? 1000000 : isFlash ? 512000 : undefined,
    maxOutputTokens: isProAlpha || isFlash ? 65536 : undefined,
    supportsTemperature: true,
    supportsThinking: isProAlpha || isFlash || normalizedModel === 'agnes-2.5-pro',
    supportsVision: true,
    modalities: ['text', 'image_url'],
  };
}

module.exports = {
  CAPABILITY_CACHE_TTL_MS,
  createCapabilityCacheKey,
  normalizeCapabilityPayload,
  isCapabilityCacheFresh,
  getKnownCapability,
};
