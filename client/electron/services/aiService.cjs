const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { nativeImage } = require('electron');
const { getAiLogsDir, getGeneratedImagesDir } = require('../utils/paths.cjs');
const {
  isRetryableHttpStatus,
  markAiRequestError,
  runWithAiRetry,
} = require('../utils/aiRetry.cjs');
const {
  createCapabilityCacheKey,
  getKnownCapability,
  isCapabilityCacheFresh,
  normalizeCapabilityPayload,
} = require('../utils/modelCapabilities.cjs');
const {
  assertRemoteHttpUrl,
  fetchWithTimeout,
  readResponseBuffer,
} = require('../utils/secureHttp.cjs');

const AI_REQUEST_TIMEOUT_MS = 300000;
const GENERATED_IMAGE_MAX_BYTES = 32 * 1024 * 1024;
const MULTIMODAL_IMAGE_MAX_EDGE = 2048;
const MAX_AI_LOG_TITLE_LENGTH = 64;
const IMAGE_MODEL_TEST_TIMEOUT_MESSAGE = '生图模型测试超时，请检查 Base URL、API Key 或模型名称';
const OPENAI_IMAGE_PROVIDER_META = {
  'agnes-ai-cn': {
    label: 'agnes-ai【中国大陆】',
    defaultBaseUrl: 'https://api.agnes-ai.cn/v1',
    logProvider: 'agnes-ai-cn',
    modelLabel: '生图模型名称',
  },
  'agnes-ai-global': {
    label: 'agnes-ai【国际站】',
    defaultBaseUrl: 'https://apihub.agnes-ai.com/v1',
    logProvider: 'agnes-ai-global',
    modelLabel: '生图模型名称',
  },
  sensenova: {
    label: '商汤日日新 SenseNova',
    defaultBaseUrl: 'https://token.sensenova.cn/v1',
    logProvider: 'sensenova',
    modelLabel: '生图模型名称',
  },
  volcengine: {
    label: '火山方舟',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    logProvider: 'volcengine',
    modelLabel: '模型名称或推理接入点 ID',
  },
  custom: {
    label: '自定义生图服务',
    defaultBaseUrl: '',
    logProvider: 'custom',
    modelLabel: '生图模型名称',
  },
};
const AGNES_IMAGE_PROVIDERS = new Set(['agnes-ai-cn', 'agnes-ai-global']);
const SENSENOVA_IMAGE_PROVIDER = 'sensenova';

function supportsAgnesImageSizeAndRatio(modelName) {
  return modelName === 'agnes-image-2.1-flash' || modelName === 'agnes-image-2.5-flash';
}

function trimBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function requireBaseUrl(baseUrl, message) {
  const trimmed = trimBaseUrl(baseUrl);
  if (!trimmed) {
    throw new Error(message);
  }
  return trimmed;
}

function createRequestId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
}

function sanitizeAiLogTitle(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_AI_LOG_TITLE_LENGTH)
    .replace(/[. ]+$/g, '');
}

function resolveAiLogTitle(request, fallback = '') {
  return sanitizeAiLogTitle(request?.logTitle || request?.log_title || request?.progressLabel || request?.schemaName || fallback);
}

function buildAiLogFileName(payload) {
  const requestId = String(payload.request_id || createRequestId()).trim();
  const logTitle = sanitizeAiLogTitle(payload.log_title);
  if (!logTitle) {
    return `${requestId}.json`;
  }

  const match = /^(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(requestId);
  if (match) {
    return `${match[1]}-${logTitle}-${match[2]}.json`;
  }
  return `${requestId}-${logTitle}.json`;
}

function isResponseFormatUnsupported(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('response_format') && [
    'not supported',
    'does not support',
    'not support',
    'unsupported',
    'unknown parameter',
    'invalid parameter',
    'must be',
  ].some((marker) => normalized.includes(marker));
}

function writeAiLog(app, config, payload) {
  if (!config.developer_mode) {
    return;
  }

  const logsDir = getAiLogsDir(app);
  fs.mkdirSync(logsDir, { recursive: true });
  const logTitle = sanitizeAiLogTitle(payload.log_title);
  const logPayload = logTitle ? { ...payload, log_title: logTitle } : payload;
  const fileName = buildAiLogFileName(logPayload);
  fs.writeFileSync(path.join(logsDir, fileName), JSON.stringify(logPayload, null, 2), 'utf-8');
}

function normalizeRequestTimeoutMs(request) {
  const timeoutMs = Number(request?.timeout_ms);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : AI_REQUEST_TIMEOUT_MS;
}

function createAbortError() {
  const error = new Error('AI 请求超时');
  error.name = 'AbortError';
  return error;
}

function createOperationTimeout(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }
  const timeoutPromise = new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(createAbortError());
    }, timeoutMs);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });

  return {
    signal: controller.signal,
    run(promise) {
      return Promise.race([promise, timeoutPromise]);
    },
    clear() {
      externalSignal?.removeEventListener('abort', abortFromExternal);
      controller.abort();
    },
  };
}

function createHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function prepareMultimodalMessages(messages) {
  const prepared = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!Array.isArray(message.content)) {
      prepared.push(message);
      continue;
    }
    const content = [];
    for (const part of message.content) {
      if (part?.type !== 'local_image') {
        content.push(part);
        continue;
      }
      const filePath = String(part.path || '').trim();
      if (!filePath) throw new Error('本地图片路径不能为空');
      const source = nativeImage.createFromBuffer(await fs.promises.readFile(filePath));
      if (source.isEmpty()) throw new Error(`无法读取图片：${path.basename(filePath)}`);
      const size = source.getSize();
      const resized = Math.max(size.width, size.height) > MULTIMODAL_IMAGE_MAX_EDGE
        ? source.resize(size.width >= size.height ? { width: MULTIMODAL_IMAGE_MAX_EDGE, quality: 'best' } : { height: MULTIMODAL_IMAGE_MAX_EDGE, quality: 'best' })
        : source;
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${resized.toJPEG(85).toString('base64')}`, ...(part.detail ? { detail: part.detail } : {}) } });
    }
    prepared.push({ ...message, content });
  }
  return prepared;
}

function imageExtensionFromMime(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';
  return 'png';
}

function getImageModelAvailability(config) {
  const imageConfig = config.image_model || {};
  if (imageConfig.status !== 'available') {
    return { available: false, status: imageConfig.status || 'untested', message: '生图模型未测试可用' };
  }

  if (imageConfig.provider !== 'ollama' && imageConfig.provider !== 'comfyui' && !imageConfig.api_key) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型 API Key' };
  }

  if (!imageConfig.model_name && !(imageConfig.provider === 'comfyui' && String(imageConfig.comfyui_workflow || '').trim())) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型名称' };
  }

  if (!trimBaseUrl(imageConfig.base_url)) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型 Base URL' };
  }

  return { available: true, status: 'available', message: '生图模型可用' };
}

function normalizeImagePrompt(request) {
  const prompt = String(request.prompt || '').trim();
  if (!prompt) {
    throw new Error('生图提示词为空');
  }

  const styleHint = request.style === 'realistic_photo'
    ? '画面采用专业实景照片风格，真实、克制、适合投标技术方案插图。'
    : '画面采用工程项目图示风格，结构清晰、专业克制、适合投标技术方案插图。';
  return `${prompt}\n\n${styleHint}\n避免出现品牌标识、水印、夸张营销元素和无关文字。`;
}

function safeImageResponse(data) {
  return {
    ...data,
    data: Array.isArray(data?.data)
      ? data.data.map((item) => ({ ...item, b64_json: item.b64_json ? '[base64 omitted]' : item.b64_json }))
      : data?.data,
    candidates: Array.isArray(data?.candidates) ? '[candidates omitted]' : data?.candidates,
  };
}

async function downloadImage(url) {
  const safeUrl = assertRemoteHttpUrl(url, '生图服务返回了不安全的图片地址');
  const response = await fetchWithTimeout(safeUrl, { timeoutMs: 30000 });
  await ensureOk(response, '图片下载失败');
  return {
    buffer: await readResponseBuffer(response, GENERATED_IMAGE_MAX_BYTES),
    mime_type: response.headers.get('content-type') || 'image/png',
  };
}

function saveGeneratedImage(app, image) {
  const imagesDir = getGeneratedImagesDir(app);
  fs.mkdirSync(imagesDir, { recursive: true });
  const extension = imageExtensionFromMime(image.mime_type);
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(imagesDir, fileName);
  fs.writeFileSync(filePath, image.buffer);
  return {
    asset_url: `yibiao-asset://generated-images/${encodeURIComponent(fileName)}`,
    file_path: filePath,
    mime_type: image.mime_type,
  };
}

async function ensureOk(response, fallbackMessage) {
  if (response.ok) {
    return;
  }

  let detail = '';
  try {
    const body = await response.json();
    detail = body.error?.message || body.message || '';
  } catch {
    detail = await response.text().catch(() => '');
  }

  throw markAiRequestError(new Error(detail || fallbackMessage), {
    status: response.status,
    retryable: isRetryableHttpStatus(response.status),
  });
}

async function fetchOpenAICompatibleImageResponse(baseUrl, apiKey, requestBody, fallbackMessage, options = {}) {
  const sendRequest = (body) => fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const response = await sendRequest(requestBody);
  if (response.ok) {
    return response;
  }

  let detail = '';
  try {
    const body = await response.json();
    detail = body.error?.message || body.message || '';
  } catch {
    detail = await response.text().catch(() => '');
  }

  if (requestBody.response_format && isResponseFormatUnsupported(detail)) {
    const retryBody = { ...requestBody };
    delete retryBody.response_format;
    const retryResponse = await sendRequest(retryBody);
    await ensureOk(retryResponse, fallbackMessage);
    return retryResponse;
  }

  throw new Error(detail || fallbackMessage);
}

function extractJsonContent(content) {
  const normalized = String(content || '').trim();
  if (!normalized.startsWith('```')) {
    return normalized;
  }

  const lines = normalized.split(/\r?\n/);
  const firstLine = (lines[0] || '').trim().toLowerCase();
  const lastLine = (lines[lines.length - 1] || '').trim();
  if ((firstLine === '```' || firstLine === '```json') && lastLine.startsWith('```')) {
    return lines.slice(1, -1).join('\n').trim();
  }

  return normalized;
}

function extractFencedJsonBlocks(content) {
  const blocks = [];
  const normalized = String(content || '').trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = fenceRegex.exec(normalized);

  while (match) {
    const block = String(match[1] || '').trim();
    if (block) {
      blocks.push(block);
    }
    match = fenceRegex.exec(normalized);
  }

  return blocks;
}

function extractBalancedJsonCandidates(content) {
  const text = String(content || '');
  const candidates = [];

  for (let start = 0; start < text.length; start += 1) {
    const firstChar = text[start];
    if (firstChar !== '{' && firstChar !== '[') {
      continue;
    }

    const stack = [firstChar];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expectedOpen = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expectedOpen) {
          break;
        }

        stack.pop();
        if (!stack.length) {
          const candidate = text.slice(start, index + 1).trim();
          if (candidate) {
            candidates.push(candidate);
          }
          start = index;
          break;
        }
      }
    }
  }

  return candidates;
}

const jsonEscapeChars = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);
const markdownEscapeChars = new Set(['.', '(', ')', '[', ']', '{', '}', '#', '*', '+', '-', '_', '!', '<', '>', '|', '`']);

function repairInvalidJsonStringEscapes(content) {
  const text = String(content || '');
  let output = '';
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char !== '\\') {
      output += char;
      continue;
    }

    const nextChar = text[index + 1] || '';
    if (!nextChar) {
      output += '\\\\';
      continue;
    }

    if (nextChar === 'u') {
      const unicodeDigits = text.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
        output += text.slice(index, index + 6);
        index += 5;
      } else {
        output += '\\\\';
      }
      continue;
    }

    if (jsonEscapeChars.has(nextChar)) {
      output += char + nextChar;
      index += 1;
      continue;
    }

    if (markdownEscapeChars.has(nextChar)) {
      output += nextChar;
      index += 1;
      continue;
    }

    output += '\\\\';
  }

  return output;
}

function parseJsonContent(content) {
  const normalized = String(content || '').replace(/^\uFEFF/, '').trim();
  const candidates = [
    normalized,
    extractJsonContent(normalized),
    ...extractFencedJsonBlocks(normalized),
  ].filter(Boolean);

  const withBalancedCandidates = [];
  for (const candidate of candidates) {
    withBalancedCandidates.push(candidate);
    withBalancedCandidates.push(...extractBalancedJsonCandidates(candidate));
  }

  const repairedCandidates = [];
  for (const candidate of withBalancedCandidates) {
    const repaired = repairInvalidJsonStringEscapes(candidate);
    if (repaired !== candidate) {
      repairedCandidates.push(repaired);
    }
  }

  const uniqueCandidates = [...new Set([...withBalancedCandidates, ...repairedCandidates].map((item) => item.trim()).filter(Boolean))];
  let lastError = null;

  for (const candidate of uniqueCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('AI 返回内容为空，无法解析 JSON');
}

function formatJsonIssues(error) {
  if (error instanceof SyntaxError) {
    return [`JSON 语法错误：${error.message}`];
  }

  return [error?.message || String(error || '字段校验失败')];
}

function buildJsonRepairMessages(invalidContent, issues, targetDescription) {
  const issueLines = (issues || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    {
      role: 'system',
      content: `你是一个严格的 JSON 修复助手。请根据给出的原始内容和校验问题，修复现有结果。

要求：
1. 优先在原结果基础上做最小必要修改，不要整体重写
2. 尽量保留原有结构、字段值、节点顺序和已生成内容
3. 若缺少必填字段，应结合现有上下文补齐合理内容，不要用空字符串敷衍
4. 若存在多余说明、代码块包裹、字段名错误、children 结构不规范或顶层包裹错误，应修正为合法 JSON
5. 必须修复 JSON 字符串中的非法反斜杠转义，例如将 1\\. 改为 1.，或将必须保留的反斜杠写成 \\\\
6. 只返回修复后的完整 JSON，不要输出任何解释`,
    },
    { role: 'user', content: `目标结果类型：${targetDescription}` },
    { role: 'user', content: `当前校验问题：\n${issueLines}` },
    {
      role: 'user',
      content: `待修复内容：\n\`\`\`json\n${String(invalidContent || '').slice(0, 60000)}\n\`\`\``,
    },
    {
      role: 'user',
      content: '请在保留原有正确内容的前提下，仅修复上述问题，并返回完整 JSON。',
    },
  ];
}

async function emitProgress(progressCallback, message) {
  if (!progressCallback) {
    return;
  }

  await Promise.resolve(progressCallback(message));
}

function normalizeJsonPayload(request, parsed) {
  const normalized = request.normalizer ? request.normalizer(parsed) : parsed;
  if (request.validator) {
    request.validator(normalized);
  }
  return normalized;
}

async function repairJsonResponse(app, config, invalidContent, issues, temperature, responseFormat, progressCallback, progressLabel, repairMessagesBuilder, logTitle, usageStatsStore, signal, abortMessage) {
  await emitProgress(progressCallback, `${progressLabel}格式校验失败，正在基于当前结果进行修复。`);
  return chatWithConfig(app, config, {
    messages: repairMessagesBuilder
      ? repairMessagesBuilder({ invalidContent, issues, progressLabel })
      : buildJsonRepairMessages(invalidContent, issues, progressLabel),
    temperature,
    response_format: responseFormat,
    logTitle: logTitle ? `${logTitle}修复` : `${progressLabel}修复`,
    signal,
    abort_message: abortMessage,
  }, usageStatsStore);
}

async function parseOrRepairJsonResponseWithConfig(app, config, request, content, usageStatsStore) {
  const temperature = request.temperature ?? 0.7;
  const responseFormat = request.response_format || { type: 'json_object' };
  const progressLabel = request.progressLabel || 'JSON结果';
  const failureMessage = request.failureMessage || '模型返回的 JSON 数据格式无效';
  const logTitle = resolveAiLogTitle(request, progressLabel);

  try {
    return normalizeJsonPayload(request, parseJsonContent(content));
  } catch (error) {
    const issues = formatJsonIssues(error);
    try {
      const repairedContent = await repairJsonResponse(
        app,
        config,
        content,
        issues,
        temperature,
        responseFormat,
        request.progressCallback,
        progressLabel,
        request.repairMessagesBuilder,
        logTitle,
        usageStatsStore,
        request.signal,
        request.abort_message,
      );
      return normalizeJsonPayload(request, parseJsonContent(repairedContent));
    } catch {
      throw new Error(failureMessage);
    }
  }
}

async function collectJsonResponseWithConfig(app, config, request, usageStatsStore) {
  const maxRetries = request.max_retries ?? 2;
  const totalAttempts = maxRetries + 1;
  const temperature = request.temperature ?? 0.7;
  const responseFormat = request.response_format || { type: 'json_object' };
  const progressLabel = request.progressLabel || 'JSON结果';
  const failureMessage = request.failureMessage || '模型返回的 JSON 数据格式无效';
  const logTitle = resolveAiLogTitle(request, progressLabel);
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const content = await chatWithConfig(app, config, {
      messages: request.messages,
      temperature,
      response_format: responseFormat,
      timeout_ms: request.timeout_ms,
      timeout_message: request.timeout_message,
      logTitle,
      signal: request.signal,
      abort_message: request.abort_message,
    }, usageStatsStore);

    try {
      const parsed = parseJsonContent(content);
      return normalizeJsonPayload(request, parsed);
    } catch (error) {
      lastError = error;
      const issues = formatJsonIssues(error);

      try {
        const repairedContent = await repairJsonResponse(
          app,
          config,
          content,
          issues,
          temperature,
          responseFormat,
          request.progressCallback,
          progressLabel,
          request.repairMessagesBuilder,
          logTitle,
          usageStatsStore,
          request.signal,
          request.abort_message,
        );
        const repairedParsed = parseJsonContent(repairedContent);
        return normalizeJsonPayload(request, repairedParsed);
      } catch (repairError) {
        lastError = repairError;

        if (attempt === maxRetries) {
          await emitProgress(request.progressCallback, `${progressLabel}连续 ${totalAttempts} 次校验失败。`);
          throw new Error(failureMessage);
        }

        await emitProgress(request.progressCallback, `${progressLabel}第 ${attempt + 1}/${totalAttempts} 次校验失败，正在重试。`);
      }
    }
  }

  throw new Error(lastError?.message || failureMessage);
}

function createChatRequestBody(config, request, options = {}) {
  const body = {
    model: config.model_name,
    messages: request.messages,
    temperature: request.temperature ?? 0.3,
  };

  if (request.chat_template_kwargs && typeof request.chat_template_kwargs === 'object') {
    body.chat_template_kwargs = request.chat_template_kwargs;
  }
  if (request.thinking && typeof request.thinking === 'object') {
    body.thinking = request.thinking;
  }
  if (!request.chat_template_kwargs && !request.thinking
    && ['agnes-ai-cn', 'agnes-ai-global', 'deepseek', 'longcat'].includes(config.text_model_provider)
    && config.text_model_options?.thinking_enabled) {
    body.thinking = { type: 'enabled' };
    if (config.text_model_provider === 'agnes-ai-cn' || config.text_model_provider === 'agnes-ai-global') {
      body.thinking.budget_tokens = Math.max(256, Math.min(65536, Number(config.text_model_options.thinking_budget_tokens) || 2048));
    }
    if (config.text_model_provider === 'deepseek') {
      body.reasoning_effort = config.text_model_options.thinking_effort === 'max' ? 'max' : 'high';
    }
  }

  if (request.response_format && !options.omitResponseFormat) {
    body.response_format = request.response_format;
  }

  return body;
}

async function fetchChatCompletion(app, config, body, options = {}) {
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS) : null;
  try {
    const baseUrl = requireBaseUrl(config.base_url, '请先在设置中配置文本模型 Base URL');
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: createHeaders(config.api_key),
        body: JSON.stringify(body),
        signal: options.signal || controller.signal,
      });
    } catch (error) {
      throw markAiRequestError(error, { retryable: true });
    }
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function chatWithConfig(app, config, request, usageStatsStore) {
  if (config.text_model_provider !== 'ollama' && !config.api_key) {
    throw new Error('请先在设置中配置文本模型 API Key');
  }

  if (!config.model_name) {
    throw new Error('请先在设置中配置文本模型名称');
  }

  requireBaseUrl(config.base_url, '请先在设置中配置文本模型 Base URL');

  const preparedRequest = { ...request, messages: await prepareMultimodalMessages(request.messages) };
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, '文本请求');
  let requestBody = createChatRequestBody(config, preparedRequest);
  let responseData = null;
  let errorMessage = '';
  const timeoutMs = normalizeRequestTimeoutMs(request);

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-pending',
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    const result = await runWithAiRetry(async () => {
      const timeout = createOperationTimeout(timeoutMs, request.signal);
      try {
        let response = await timeout.run(fetchChatCompletion(app, config, requestBody, { signal: timeout.signal }));
        if (!response.ok && request.response_format) {
          const detail = await timeout.run(response.text().catch(() => ''));
          if (isResponseFormatUnsupported(detail)) {
            requestBody = createChatRequestBody(config, preparedRequest, { omitResponseFormat: true });
            response = await timeout.run(fetchChatCompletion(app, config, requestBody, { signal: timeout.signal }));
          } else {
            throw markAiRequestError(new Error(detail || 'AI 请求失败'), {
              status: response.status,
              retryable: isRetryableHttpStatus(response.status),
            });
          }
        }

        await timeout.run(ensureOk(response, 'AI 请求失败'));
        const data = await timeout.run(response.json());
        return { data, content: data.choices?.[0]?.message?.content || '' };
      } catch (error) {
        if (request.signal?.aborted) {
          throw markAiRequestError(error, { retryable: false });
        }
        throw error;
      } finally {
        timeout.clear();
      }
    }, {
      maxAttempts: request.max_request_attempts ?? 3,
      onRetry: ({ attempt }) => emitProgress(request.progressCallback, `${logTitle}第 ${attempt + 1} 次请求失败，正在重试。`),
    });
    responseData = result.data;
    const content = result.content;
    try {
      usageStatsStore?.record({
        provider: config.text_model_provider,
        model: config.model_name,
        usage: responseData?.usage,
        request_id: requestId,
      });
    } catch (usageError) {
      console.warn('[ai-usage] 保存本地 Token 统计失败', usageError);
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat',
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: responseData,
      content,
      created_at: new Date().toISOString(),
    });
    return content;
  } catch (error) {
    errorMessage = request.signal?.aborted
      ? request.abort_message || 'AI 请求已取消'
      : error.name === 'AbortError'
      ? request.timeout_message || `AI 请求超时（${timeoutMs / 1000} 秒）`
      : error.message;
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-error',
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: responseData,
      error: errorMessage,
      created_at: new Date().toISOString(),
    });
    throw new Error(errorMessage || 'AI 请求失败');
  }
}

async function testOpenAICompatibleImageModel(app, config, provider) {
  const imageConfig = config.image_model || {};
  const meta = OPENAI_IMAGE_PROVIDER_META[provider] || OPENAI_IMAGE_PROVIDER_META.volcengine;
  let responseData = null;

  if (!imageConfig.api_key) {
    throw new Error(`请先填写${meta.label} API Key`);
  }

  if (!imageConfig.model_name) {
    throw new Error(`请先填写${meta.label}${meta.modelLabel}`);
  }

  const baseUrl = requireBaseUrl(imageConfig.base_url, `${meta.label} Base URL 缺失，请重新选择服务商后保存配置`);
  const timeout = createOperationTimeout(AI_REQUEST_TIMEOUT_MS);

  try {
    const supportsSizeAndRatio = supportsAgnesImageSizeAndRatio(imageConfig.model_name);
    const requestBody = AGNES_IMAGE_PROVIDERS.has(provider)
      ? {
        model: imageConfig.model_name,
        prompt: 'a simple blue dot on a white background',
        size: supportsSizeAndRatio ? '1K' : '2048x2048',
        ...(supportsSizeAndRatio ? { ratio: '1:1' } : {}),
        extra_body: { response_format: 'url' },
      }
      : provider === SENSENOVA_IMAGE_PROVIDER
        ? {
          model: imageConfig.model_name,
          prompt: '白色背景上的一个简单蓝色圆点',
          size: '2048x2048',
          n: 1,
          output_format: 'png',
          response_format: 'b64_json',
          watermark: true,
          prompt_extend: true,
        }
        : {
          model: imageConfig.model_name,
          prompt: 'a simple blue dot on a white background',
          size: '2048x2048',
          response_format: 'url',
        };
    let response = null;
    try {
      response = await timeout.run(fetchOpenAICompatibleImageResponse(
        baseUrl,
        imageConfig.api_key,
        requestBody,
        `${meta.label}生图测试失败`,
        { signal: timeout.signal },
      ));
    } catch (error) {
      const message = error.message || '';
      if (message.includes('does not exist') || message.includes('do not have access')) {
        throw new Error(`${meta.label}生图模型不可用，请确认${meta.modelLabel}已开通并可访问。原始错误：${message}`);
      }

      throw error;
    }

    responseData = await timeout.run(response.json());
    const firstImage = responseData.data?.[0] || {};
    const imageUrl = firstImage.url || '';
    const imageData = firstImage.b64_json || '';

    return {
      success: true,
      message: imageUrl ? `测试成功：已生成图片 ${imageUrl}` : '测试成功：已返回生图结果',
      image_url: imageUrl,
      image_data: imageData,
      mime_type: 'image/png',
    };
  } catch (error) {
    throw new Error(error?.name === 'AbortError' ? IMAGE_MODEL_TEST_TIMEOUT_MESSAGE : error?.message || '生图模型测试失败');
  } finally {
    timeout.clear();
  }
}

async function testGoogleImageModel(app, config) {
  const imageConfig = config.image_model || {};

  if (!imageConfig.api_key) {
    throw new Error('请先填写 Google AI Studio API Key');
  }

  if (!imageConfig.model_name) {
    throw new Error('请先填写 Google 生图模型名称');
  }

  const baseUrl = requireBaseUrl(imageConfig.base_url, 'Google AI Studio Base URL 缺失，请重新选择服务商后保存配置');
  const timeout = createOperationTimeout(AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await timeout.run(fetch(`${baseUrl}/models/${encodeURIComponent(imageConfig.model_name)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': imageConfig.api_key,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Create a simple blue dot on a white background.' }],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
      signal: timeout.signal,
    }));

    await timeout.run(ensureOk(response, 'Google AI Studio 生图测试失败'));
    const data = await timeout.run(response.json());
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.find((part) => part.text)?.text || '';
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;

    return {
      success: true,
      message: inlineData?.data ? `测试成功：已返回图片${text ? `，${text}` : ''}` : `测试成功：${text || '已返回生成结果'}`,
      image_data: inlineData?.data || '',
      mime_type: inlineData?.mimeType || inlineData?.mime_type || 'image/png',
    };
  } catch (error) {
    throw new Error(error?.name === 'AbortError' ? IMAGE_MODEL_TEST_TIMEOUT_MESSAGE : error?.message || '生图模型测试失败');
  } finally {
    timeout.clear();
  }
}

async function generateOpenAICompatibleImage(app, config, request, provider) {
  const imageConfig = config.image_model || {};
  const meta = OPENAI_IMAGE_PROVIDER_META[provider] || OPENAI_IMAGE_PROVIDER_META.volcengine;
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, request.title ? `AI生图-${request.title}` : 'AI生图');
  const supportsSizeAndRatio = supportsAgnesImageSizeAndRatio(imageConfig.model_name);
  const requestBody = AGNES_IMAGE_PROVIDERS.has(provider)
    ? {
      model: imageConfig.model_name,
      prompt: normalizeImagePrompt(request),
      size: request.size || imageConfig.size || (supportsSizeAndRatio ? '2K' : '2048x2048'),
      ...(supportsSizeAndRatio ? { ratio: request.ratio || imageConfig.ratio || '1:1' } : {}),
      extra_body: { response_format: 'url' },
    }
    : provider === SENSENOVA_IMAGE_PROVIDER
      ? {
        model: imageConfig.model_name,
        prompt: normalizeImagePrompt(request),
        size: request.size || imageConfig.size || '2048x2048',
        n: 1,
        output_format: 'png',
        response_format: 'b64_json',
        watermark: true,
        prompt_extend: true,
      }
      : {
        model: imageConfig.model_name,
        prompt: normalizeImagePrompt(request),
        size: request.size || '2048x2048',
        response_format: 'url',
      };
  const baseUrl = requireBaseUrl(imageConfig.base_url, `${meta.label} Base URL 缺失，请重新选择服务商后保存配置`);
  let responseData = null;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-pending',
      provider: meta.logProvider,
      url: `${baseUrl}/images/generations`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    const response = await fetchOpenAICompatibleImageResponse(baseUrl, imageConfig.api_key, requestBody, `${meta.label}生图失败`);
    responseData = await response.json();

    const item = responseData.data?.[0] || {};
    const image = item.b64_json
      ? { buffer: Buffer.from(item.b64_json, 'base64'), mime_type: 'image/png' }
      : item.url
        ? await downloadImage(item.url)
        : null;

    if (!image) {
      throw new Error(`${meta.label}生图未返回图片数据`);
    }

    const saved = saveGeneratedImage(app, image);
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image',
      provider: meta.logProvider,
      request: requestBody,
      response: safeImageResponse(responseData),
      result: saved,
      created_at: new Date().toISOString(),
    });
    return { success: true, title: request.title || '', ...saved };
  } catch (error) {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-error',
      provider: meta.logProvider,
      request: requestBody,
      response: responseData ? safeImageResponse(responseData) : null,
      error: error.message,
      created_at: new Date().toISOString(),
    });
    throw error;
  }
}

async function generateGoogleImage(app, config, request) {
  const imageConfig = config.image_model || {};
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, request.title ? `AI生图-${request.title}` : 'AI生图');
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: normalizeImagePrompt(request) }],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };
  const baseUrl = requireBaseUrl(imageConfig.base_url, 'Google AI Studio Base URL 缺失，请重新选择服务商后保存配置');
  let responseData = null;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-pending',
      provider: 'google-ai-studio',
      url: `${baseUrl}/models/${encodeURIComponent(imageConfig.model_name)}:generateContent`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(imageConfig.model_name)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': imageConfig.api_key,
      },
      body: JSON.stringify(requestBody),
    });
    await ensureOk(response, 'Google AI Studio 生图失败');
    responseData = await response.json();
    const parts = responseData.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;

    if (!inlineData?.data) {
      throw new Error('Google AI Studio 生图未返回图片数据');
    }

    const saved = saveGeneratedImage(app, {
      buffer: Buffer.from(inlineData.data, 'base64'),
      mime_type: inlineData.mimeType || inlineData.mime_type || 'image/png',
    });
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image',
      provider: 'google-ai-studio',
      request: requestBody,
      response: safeImageResponse(responseData),
      result: saved,
      created_at: new Date().toISOString(),
    });
    return { success: true, title: request.title || '', ...saved };
  } catch (error) {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-error',
      provider: 'google-ai-studio',
      request: requestBody,
      response: responseData ? safeImageResponse(responseData) : null,
      error: error.message,
      created_at: new Date().toISOString(),
    });
    throw error;
  }
}

function runOllamaImageCommand(model, prompt) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('Ollama 本地生图目前仅在 macOS 获得官方支持'));
      return;
    }
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-ollama-image-'));
    const ollamaCommand = [
      '/Applications/Ollama.app/Contents/Resources/ollama',
      '/opt/homebrew/bin/ollama',
      '/usr/local/bin/ollama',
    ].find((candidate) => fs.existsSync(candidate)) || 'ollama';
    const child = spawn(ollamaCommand, ['run', model, prompt], {
      cwd: outputDir,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Ollama 生图超时，请确认模型已下载且本机资源充足'));
    }, AI_REQUEST_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '').slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      fs.rmSync(outputDir, { recursive: true, force: true });
      reject(new Error(error.code === 'ENOENT' ? '未找到 Ollama，请先安装并确保 ollama 命令可用' : error.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error(stderr.trim() || `Ollama 生图失败（退出码 ${code}）`);
        const imageName = fs.readdirSync(outputDir).find((name) => /\.(png|jpe?g|webp)$/i.test(name));
        if (!imageName) throw new Error('Ollama 未生成可识别的图片文件，请确认所选模型支持图片生成');
        const filePath = path.join(outputDir, imageName);
        resolve({
          buffer: fs.readFileSync(filePath),
          mime_type: /\.webp$/i.test(imageName) ? 'image/webp' : /\.jpe?g$/i.test(imageName) ? 'image/jpeg' : 'image/png',
        });
      } catch (error) {
        reject(error);
      } finally {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    });
  });
}

async function generateOllamaImage(app, config, request) {
  const imageConfig = config.image_model || {};
  if (!imageConfig.model_name) throw new Error('请先填写 Ollama 生图模型名称');
  const image = await runOllamaImageCommand(imageConfig.model_name, normalizeImagePrompt(request));
  const saved = saveGeneratedImage(app, image);
  return { success: true, title: request.title || '', ...saved };
}

async function testOllamaImageModel(app, config) {
  const result = await generateOllamaImage(app, config, { prompt: '白色背景上的一个简单蓝色圆点', title: 'Ollama 生图测试' });
  return {
    success: true,
    message: '测试成功：Ollama 已生成图片',
    image_url: result.asset_url,
    mime_type: result.mime_type,
  };
}

function createComfyUiWorkflow(modelName, prompt) {
  return {
    3: { class_type: 'KSampler', inputs: { seed: Math.floor(Math.random() * 2147483647), steps: 24, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: modelName } },
    5: { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: 'low quality, blurry, watermark, text artifacts', clip: ['4', 1] } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: 'Yibiao', images: ['8', 0] } },
  };
}

function prepareComfyUiWorkflow(imageConfig, prompt) {
  const raw = String(imageConfig.comfyui_workflow || '').trim();
  if (!raw) return createComfyUiWorkflow(imageConfig.model_name, prompt);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('ComfyUI 工作流 JSON 解析失败'); }
  const workflow = parsed?.prompt && typeof parsed.prompt === 'object' ? parsed.prompt : parsed;
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new Error('ComfyUI 工作流格式错误，请使用 Save (API Format) 导出的 JSON');
  const cloned = JSON.parse(JSON.stringify(workflow));
  const samplers = Object.values(cloned).filter((node) => node?.class_type === 'KSampler' || node?.class_type === 'KSamplerAdvanced');
  const positiveIds = new Set(samplers.map((node) => Array.isArray(node.inputs?.positive) ? String(node.inputs.positive[0]) : '').filter(Boolean));
  let injected = false;
  Object.entries(cloned).forEach(([id, node]) => {
    if (positiveIds.has(id) && node?.class_type === 'CLIPTextEncode' && typeof node.inputs?.text === 'string') {
      node.inputs.text = prompt;
      injected = true;
    }
  });
  if (!injected) {
    const fallback = Object.values(cloned).find((node) => node?.class_type === 'CLIPTextEncode' && typeof node.inputs?.text === 'string');
    if (fallback) { fallback.inputs.text = prompt; injected = true; }
  }
  if (!injected) throw new Error('ComfyUI 工作流中未找到可写入提示词的 CLIPTextEncode 节点');
  return cloned;
}

async function generateComfyUiImage(app, config, request) {
  const imageConfig = config.image_model || {};
  const baseUrl = trimBaseUrl(imageConfig.base_url);
  if (!baseUrl) throw new Error('请先填写 ComfyUI Base URL');
  if (!imageConfig.model_name && !String(imageConfig.comfyui_workflow || '').trim()) throw new Error('请填写 checkpoint 文件名或粘贴 ComfyUI 工作流 JSON');
  const clientId = crypto.randomUUID();
  const queued = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, prompt: prepareComfyUiWorkflow(imageConfig, normalizeImagePrompt(request)) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!queued.ok) throw new Error(`ComfyUI 提交任务失败（HTTP ${queued.status}）：${await queued.text()}`);
  const promptId = String((await queued.json()).prompt_id || '');
  if (!promptId) throw new Error('ComfyUI 未返回任务 ID');
  const deadline = Date.now() + AI_REQUEST_TIMEOUT_MS;
  let output;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      const history = await response.json();
      const job = history[promptId];
      if (job?.status?.status_str === 'error') throw new Error('ComfyUI 工作流执行失败，请检查 checkpoint 和节点配置');
      output = Object.values(job?.outputs || {}).flatMap((node) => node?.images || [])[0];
      if (output) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!output) throw new Error('ComfyUI 生图超时');
  const params = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder || '', type: output.type || 'output' });
  const imageResponse = await fetch(`${baseUrl}/view?${params}`, { signal: AbortSignal.timeout(30000) });
  if (!imageResponse.ok) throw new Error(`读取 ComfyUI 图片失败（HTTP ${imageResponse.status}）`);
  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  const saved = saveGeneratedImage(app, { buffer: Buffer.from(await imageResponse.arrayBuffer()), mime_type: contentType.split(';')[0] });
  return { success: true, title: request.title || '', ...saved };
}

async function testComfyUiImageModel(app, config) {
  const result = await generateComfyUiImage(app, config, { prompt: '白色背景上的一个简单蓝色圆点', title: 'ComfyUI 生图测试' });
  return { success: true, message: '测试成功：ComfyUI 已生成图片', image_url: result.asset_url, mime_type: result.mime_type };
}

async function generateImageWithConfig(app, config, request) {
  const availability = getImageModelAvailability(config);
  if (!availability.available) {
    throw new Error(availability.message);
  }

  if (config.image_model?.provider === 'agnes-ai-cn' || config.image_model?.provider === 'agnes-ai-global' || config.image_model?.provider === 'sensenova' || config.image_model?.provider === 'volcengine' || config.image_model?.provider === 'custom') {
    return generateOpenAICompatibleImage(app, config, request, config.image_model.provider);
  }

  if (config.image_model?.provider === 'google-ai-studio') {
    return generateGoogleImage(app, config, request);
  }

  if (config.image_model?.provider === 'ollama') {
    return generateOllamaImage(app, config, request);
  }

  if (config.image_model?.provider === 'comfyui') {
    return generateComfyUiImage(app, config, request);
  }

  throw new Error('当前生图服务商暂不支持正文配图');
}

function createAiService({ app, configStore, usageStatsStore }) {
  return {
    async chat(request) {
      const config = configStore.load();
      const content = await chatWithConfig(app, config, request, usageStatsStore);
      return content;
    },

    async requestJson(request) {
      const config = configStore.load();
      return collectJsonResponseWithConfig(app, config, request, usageStatsStore);
    },

    async collectJsonResponse(request) {
      const config = configStore.load();
      return collectJsonResponseWithConfig(app, config, request, usageStatsStore);
    },

    async parseJsonResponseContent(request, content) {
      const config = configStore.load();
      return parseOrRepairJsonResponseWithConfig(app, config, request, content, usageStatsStore);
    },

    async testImageModel(config) {
      if (config.image_model?.provider === 'ollama') {
        return testOllamaImageModel(app, config);
      }
      if (config.image_model?.provider === 'comfyui') {
        return testComfyUiImageModel(app, config);
      }
      if (config.image_model?.provider === 'agnes-ai-cn' || config.image_model?.provider === 'agnes-ai-global' || config.image_model?.provider === 'sensenova' || config.image_model?.provider === 'volcengine' || config.image_model?.provider === 'custom') {
        return testOpenAICompatibleImageModel(app, config, config.image_model.provider);
      }

      if (config.image_model?.provider === 'google-ai-studio') {
        return testGoogleImageModel(app, config);
      }

      throw new Error('当前服务商暂不支持测试');
    },

    getImageModelAvailability() {
      return getImageModelAvailability(configStore.load());
    },

    isDeveloperMode() {
      return Boolean(configStore.load()?.developer_mode);
    },

    isSkillEnabled(skillId) {
      return Boolean(configStore.load()?.skill_settings?.skills?.[skillId]?.enabled);
    },

    async generateImage(request) {
      const config = configStore.load();
      return generateImageWithConfig(app, config, request);
    },

    async listModels(configOverride) {
      const config = configOverride || configStore.load();

      if (config.text_model_provider !== 'ollama' && !config.api_key) {
        return { success: false, message: '请先填写文本模型 API Key', models: [] };
      }

      if (!trimBaseUrl(config.base_url)) {
        return { success: false, message: '请先填写文本模型 Base URL', models: [] };
      }

      try {
        const response = await fetch(`${trimBaseUrl(config.base_url)}/models`, {
          method: 'GET',
          headers: createHeaders(config.api_key),
        });

        await ensureOk(response, '获取模型列表失败');
        const data = await response.json();

        return {
          success: true,
          message: '模型列表已更新',
          models: Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [],
        };
      } catch (error) {
        if (error?.status === 401) {
          return { success: false, message: 'API Key 无效或已失效，请重新填写后再获取模型', models: [] };
        }
        if (error?.status === 403) {
          return { success: false, message: '当前 API Key 没有获取模型列表的权限', models: [] };
        }
        if (error?.status === 404) {
          return { success: false, message: '当前 Base URL 不支持模型列表接口，请检查服务地址', models: [] };
        }
        throw error;
      }
    },

    async getModelCapabilities(configOverride) {
      const config = configOverride || configStore.load();
      const baseUrl = trimBaseUrl(config.base_url);
      const model = String(config.model_name || '').trim();
      if (config.text_model_provider !== 'ollama' && !config.api_key) return { success: false, message: '请先填写文本模型 API Key', source: 'default' };
      if (!baseUrl) return { success: false, message: '请先填写文本模型 Base URL', source: 'default' };
      if (!model) return { success: false, message: '请先填写文本模型名称', source: 'default' };

      const cacheKey = createCapabilityCacheKey({ provider: config.text_model_provider, baseUrl, model });
      const cached = config.model_capabilities_cache?.[cacheKey];
      if (isCapabilityCacheFresh(cached)) {
        return { success: true, message: '已使用本地缓存的模型能力信息', source: 'cache', ...cached };
      }

      try {
        const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, {
          method: 'GET',
          headers: createHeaders(config.api_key),
        });
        await ensureOk(response, '获取模型能力信息失败');
        const capability = {
          ...normalizeCapabilityPayload(await response.json(), { provider: config.text_model_provider, model }),
          fetchedAt: new Date().toISOString(),
        };
        configStore.save({ model_capabilities_cache: { ...(config.model_capabilities_cache || {}), [cacheKey]: capability } });
        return { success: true, message: '模型能力信息已更新', source: 'remote', ...capability };
      } catch (error) {
        if (cached) return { success: false, message: `远程探测失败，已保留上次结果：${error.message}`, source: 'cache', ...cached };
        const knownCapability = getKnownCapability({ provider: config.text_model_provider, model });
        return {
          success: false,
          message: knownCapability ? `远程探测失败，已使用 Agnes 官方模型基础信息：${error.message}` : `当前服务未提供标准能力信息：${error.message}`,
          source: 'default',
          ...(knownCapability || { provider: config.text_model_provider, model }),
        };
      }
    },
  };
}

module.exports = {
  createAiService,
};
