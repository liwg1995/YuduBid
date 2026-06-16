const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const { parseDocumentWithConfig, resolveFileParser } = require('./fileService.cjs');
const { getOfficialDocumentDir } = require('../utils/paths.cjs');

const initialInput = {
  documentType: '通知',
  scenario: '',
  issuer: '',
  recipient: '',
  audienceRelation: '下行',
  facts: '',
  tone: '庄重、平实、克制',
  length: '约 800 字',
  needTitle: true,
  needSignature: true,
  specialRequirements: '',
};

const initialState = {
  input: initialInput,
  draft: '',
  review: '',
  prompt: '',
  revisions: [],
  importedFileName: '',
  task: undefined,
  updated_at: '',
};

const documentTypeNotes = {
  通知: '用于下行或平行告知办理、执行、周知事项，重点写清对象、事项、责任、时限。',
  请示: '用于向上级请求指示、批准或支持，坚持一文一事，一般只送一个主送机关。',
  报告: '用于向上级汇报工作、反映情况或答复询问，不夹带请示事项。',
  函: '用于不相隶属机关之间商洽、询问、答复或请求批准，语气平等礼貌。',
  纪要: '用于记载会议主要情况和议定事项，写清会议认为、议定、要求和落实责任。',
  工作方案: '用于专项任务组织实施，重点写目标、任务、步骤、分工和保障。',
  工作总结: '用于阶段工作回顾，写总体情况、做法成效、问题不足和下步安排。',
  讲话稿: '用于会议、活动、座谈发言，可有判断和动员，但必须落到具体工作。',
  调研报告: '用于反映调研结果，结构为背景、现状、问题原因、对策建议。',
  宣传稿: '用于面向公众展示政策、活动或典型，表达可更生动但避免过度拔高。',
};

const validDocumentTypes = new Set(Object.keys(documentTypeNotes));
const validRelations = new Set(['上行', '下行', '平行', '面向公众']);

function now() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function normalizeString(value, maxLength = 20000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeInput(input = {}) {
  const merged = { ...initialInput, ...input };
  return {
    documentType: validDocumentTypes.has(merged.documentType) ? merged.documentType : initialInput.documentType,
    scenario: normalizeString(merged.scenario, 2000),
    issuer: normalizeString(merged.issuer, 500),
    recipient: normalizeString(merged.recipient, 800),
    audienceRelation: validRelations.has(merged.audienceRelation) ? merged.audienceRelation : initialInput.audienceRelation,
    facts: normalizeString(merged.facts, 60000),
    tone: normalizeString(merged.tone, 500) || initialInput.tone,
    length: normalizeString(merged.length, 200) || initialInput.length,
    needTitle: Boolean(merged.needTitle),
    needSignature: Boolean(merged.needSignature),
    specialRequirements: normalizeString(merged.specialRequirements, 2000),
  };
}

function cloneState(state) {
  return {
    ...initialState,
    ...state,
    input: normalizeInput(state?.input),
    task: state?.task,
    draft: String(state?.draft || ''),
    review: String(state?.review || ''),
    prompt: String(state?.prompt || ''),
    revisions: Array.isArray(state?.revisions) ? state.revisions.map(normalizeRevision).filter(Boolean).slice(0, 10) : [],
    importedFileName: normalizeString(state?.importedFileName, 260),
  };
}

function normalizeRevision(revision) {
  if (!revision || typeof revision !== 'object') return null;
  const content = String(revision.content || '');
  if (!content.trim()) return null;
  return {
    id: normalizeString(revision.id, 80) || `revision-${Date.now()}`,
    type: ['draft', 'polish', 'rewrite', 'manual'].includes(revision.type) ? revision.type : 'manual',
    title: normalizeString(revision.title, 120) || '未命名版本',
    summary: normalizeString(revision.summary, 300),
    content,
    created_at: normalizeString(revision.created_at, 60) || now(),
  };
}

function createRevision(type, content, input, summary) {
  const timestamp = now();
  return {
    id: `${type}-${Date.now()}`,
    type,
    title: `${input.documentType}${type === 'polish' ? '润色版' : type === 'draft' ? '生成版' : '手动版'}`,
    summary: summary || `${input.documentType}｜${input.scenario || '未填写场景'}`,
    content: String(content || '').trim(),
    created_at: timestamp,
  };
}

function appendRevision(state, revision) {
  const normalized = normalizeRevision(revision);
  if (!normalized) return state.revisions || [];
  const current = Array.isArray(state.revisions) ? state.revisions : [];
  const deduped = current.filter((item) => String(item.content || '').trim() !== normalized.content);
  return [normalized, ...deduped].slice(0, 10);
}

function recoverInterruptedTask(state) {
  if (state?.task?.status !== 'running') return state;
  return {
    ...state,
    task: {
      ...state.task,
      status: 'error',
      progress: 100,
      message: '上次任务未完成，请重新执行。',
      finished_at: now(),
    },
  };
}

function createPrompt(input) {
  const titleRule = input.needTitle ? '需要标题。' : '如不影响使用，可省略标题。';
  const signatureRule = input.needSignature ? '需要落款和成文日期，日期未知时使用〔日期〕占位。' : '如不影响使用，可省略落款。';
  const rules = [
    '你是党政机关公文和事务文书写作助手，输出中文，文风稳妥、克制、具体、可交付。',
    '先判断文种、行文关系和用途是否匹配；如用户指定文种明显不合适，应在不编造事实的前提下修正结构或简要提示。',
    '不得编造法律法规、文件名称、会议、领导、人名、数字、部门、预算、日期、成果或批复。',
    '正式公文默认包含标题、主送机关、正文、落款和日期；发文字号、附件、抄送、版记仅在用户提供或明确要求时写。',
    '正文优先写事实、任务、责任、时限、反馈路径，再写必要判断。避免空泛套话、机械排比和万能结尾。',
    '请示坚持一文一事，结尾使用“妥否，请批示。”或同类请求语；报告不得夹带“请予批准”。',
    '层次序数按“一、（一）1.（1）”顺序使用，不跳层、不乱序。',
    '输出前自检：文种是否匹配、事实是否具体、判断是否有依据、每段是否有功能、抽象词是否有落点。',
  ];

  return [
    rules.join('\n'),
    '',
    '请根据以下信息起草一份可直接修改使用的公文或机关材料：',
    `文种：${input.documentType}`,
    `使用场景：${input.scenario || '〔请根据材料合理推断〕'}`,
    `发文/讲话主体：${input.issuer || '〔发文机关〕'}`,
    `面向对象/主送机关：${input.recipient || '〔主送机关〕'}`,
    `行文关系：${input.audienceRelation || '〔上行/下行/平行/面向公众〕'}`,
    `材料要点：${input.facts || '〔请补充具体事实、动作、数据、时限、责任主体〕'}`,
    `希望语气：${input.tone || '庄重、平实、克制'}`,
    `篇幅要求：${input.length || '不限，优先完整可用'}`,
    `格式要求：${titleRule}${signatureRule}`,
    `特殊要求：${input.specialRequirements || '无'}`,
    '',
    '输出要求：',
    '1. 先输出完整正文，不要只给提纲。',
    '2. 信息缺失但不影响起草时，用少量方括号占位，例如〔数量〕、〔日期〕。',
    '3. 如关键事实缺失导致文稿不可用，在正文后用“需补充信息”列出最多 5 项。',
    '4. 不输出写作过程和评分表。',
  ].join('\n');
}

function createReviewPrompt(input, draft) {
  return [
    '你是党政机关公文审核助手。请依据 GB/T 9704-2012 核心格式要点、公文文种规则和“降 AI 味”标准，检查以下公文草稿。',
    '',
    '检查边界：',
    '1. 不得编造事实、法规、会议、领导、数字、日期或批复。',
    '2. 只基于用户提供的文种、行文关系、材料要点和草稿内容判断。',
    '3. 重点发现可执行问题，不做泛泛表扬。',
    '',
    `文种：${input.documentType}`,
    `行文关系：${input.audienceRelation}`,
    `发文/讲话主体：${input.issuer || '未填写'}`,
    `面向对象/主送机关：${input.recipient || '未填写'}`,
    `材料要点：${input.facts || '未填写'}`,
    '',
    '请按 Markdown 输出以下栏目：',
    '## 总体判断',
    '- 给出 0-100 分评分和一句话结论。',
    '## 格式与文种问题',
    '- 检查标题、主送机关、正文结构、结尾语、落款日期、附件提示、层次序数、请示/报告/函等文种匹配问题。',
    '## 事实密度与 AI 味',
    '- 指出空泛套话、过度拔高、机械排比、抽象词无落点、万能结尾等问题。',
    '## 修改建议',
    '- 给出可直接执行的修改建议，必要时提供替换句。',
    '',
    '草稿如下：',
    draft,
  ].join('\n');
}

function createPolishPrompt(input, draft) {
  return [
    '你是党政机关公文润色助手。请对以下草稿进行“降 AI 味”和格式修正，输出一版可直接使用的完整正文。',
    '',
    '润色规则：',
    '1. 保留原有事实、数据、主体、时限和责任边界，不新增未提供的信息。',
    '2. 降低空泛套话、机械排比、过度拔高和万能结尾。',
    '3. 每段尽量有明确功能：背景、问题、依据、措施、责任、时限、保障或结尾。',
    '4. 按文种调整语气和结尾：请示不写成报告，报告不夹带批准请求，函保持平等商洽语气。',
    '5. 只输出润色后的完整文稿，不输出说明、清单或评分。',
    '',
    `文种：${input.documentType}`,
    `行文关系：${input.audienceRelation}`,
    `发文/讲话主体：${input.issuer || '未填写'}`,
    `面向对象/主送机关：${input.recipient || '未填写'}`,
    `篇幅要求：${input.length || '不限'}`,
    `特殊要求：${input.specialRequirements || '无'}`,
    '',
    '草稿如下：',
    draft,
  ].join('\n');
}

function createRewritePrompt(input, draft, instruction) {
  return [
    '你是党政机关公文改写助手。请根据用户的具体修改要求，对以下草稿进行定向改写，输出一版完整文稿。',
    '',
    '硬性规则：',
    '1. 不新增草稿和用户要求之外的事实、数据、法规、会议、领导、人名、预算、日期或批复。',
    '2. 保留文种和行文关系的基本规范；如用户要求与文种冲突，应优先保持公文规范。',
    '3. 输出完整文稿，不输出解释、清单或修改说明。',
    '4. 文风保持庄重、平实、克制，减少空泛套话。',
    '',
    `文种：${input.documentType}`,
    `行文关系：${input.audienceRelation}`,
    `发文/讲话主体：${input.issuer || '未填写'}`,
    `面向对象/主送机关：${input.recipient || '未填写'}`,
    `用户修改要求：${instruction || '请在保持事实不变的前提下优化结构和表达。'}`,
    '',
    '草稿如下：',
    draft,
  ].join('\n');
}

function buildExtractInputMessages(draft) {
  return [
    {
      role: 'system',
      content: [
        '你是公文要素抽取助手，只输出 JSON。',
        '不得编造草稿中没有的信息；缺失字段输出空字符串或合理默认值。',
        'documentType 只能取：通知、请示、报告、函、纪要、工作方案、工作总结、讲话稿、调研报告、宣传稿。',
        'audienceRelation 只能取：上行、下行、平行、面向公众。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请从以下公文草稿中抽取起草要素，输出 JSON：',
        '',
        'JSON 字段：',
        '{',
        '  "documentType": "通知",',
        '  "scenario": "使用场景或事由",',
        '  "issuer": "发文/讲话主体",',
        '  "recipient": "主送机关或面向对象",',
        '  "audienceRelation": "上行/下行/平行/面向公众",',
        '  "facts": "从草稿中提炼出的关键事实、任务、责任、时限、数据、依据，使用换行分条",',
        '  "tone": "语气风格",',
        '  "length": "篇幅估计",',
        '  "specialRequirements": "后续修改应注意的问题"',
        '}',
        '',
        '草稿：',
        String(draft || '').slice(0, 60000),
      ].join('\n'),
    },
  ];
}

function createOfficialDocumentService({ app, aiService, configStore }) {
  const subscribers = new Set();
  let activeTask = null;

  const dir = () => ensureDir(getOfficialDocumentDir(app));
  const statePath = () => path.join(dir(), 'state.json');
  const draftPath = () => path.join(dir(), 'draft.md');

  function loadState() {
    const state = fs.existsSync(statePath())
      ? safeJsonParse(fs.readFileSync(statePath(), 'utf-8'), initialState)
      : initialState;
    const normalized = cloneState(activeTask ? state : recoverInterruptedTask(state));
    if (fs.existsSync(draftPath())) {
      normalized.draft = fs.readFileSync(draftPath(), 'utf-8');
    }
    if (!activeTask && state?.task?.status === 'running') {
      fs.writeFileSync(statePath(), JSON.stringify(normalized, null, 2), 'utf-8');
    }
    return normalized;
  }

  function saveState(partial) {
    const nextState = cloneState({ ...loadState(), ...partial, updated_at: now() });
    ensureDir(path.dirname(statePath()));
    if (nextState.draft) {
      fs.writeFileSync(draftPath(), nextState.draft, 'utf-8');
    } else if (fs.existsSync(draftPath())) {
      fs.rmSync(draftPath(), { force: true });
    }
    fs.writeFileSync(statePath(), JSON.stringify(nextState, null, 2), 'utf-8');
    broadcast(nextState);
    return nextState;
  }

  function broadcast(state = loadState()) {
    for (const webContents of subscribers) {
      if (!webContents || webContents.isDestroyed()) {
        subscribers.delete(webContents);
        continue;
      }
      webContents.send('official-document:event', state);
    }
  }

  function saveTaskProgress(taskId, progress, message) {
    if (!activeTask || activeTask.id !== taskId) return;
    activeTask = {
      ...activeTask,
      progress,
      message,
    };
    saveState({ task: activeTask });
  }

  function startProgressPulse(taskId, checkpoints, options = {}) {
    const intervalMs = options.intervalMs || 1200;
    const ceiling = options.ceiling || 96;
    const waitingMessages = options.waitingMessages || ['模型仍在处理，请稍候'];
    let index = 0;
    let waitIndex = 0;
    const timer = setInterval(() => {
      if (!activeTask || activeTask.id !== taskId) {
        clearInterval(timer);
        return;
      }
      const checkpoint = checkpoints[index];
      if (checkpoint) {
        index += 1;
        saveTaskProgress(taskId, checkpoint.progress, checkpoint.message);
        return;
      }

      const currentProgress = Number(activeTask.progress || 0);
      if (currentProgress >= ceiling) {
        const message = waitingMessages[waitIndex % waitingMessages.length];
        waitIndex += 1;
        saveTaskProgress(taskId, ceiling, message);
        return;
      }

      const nextProgress = Math.min(ceiling, currentProgress + (currentProgress < 70 ? 3 : 1));
      const message = waitingMessages[waitIndex % waitingMessages.length];
      waitIndex += 1;
      saveTaskProgress(taskId, nextProgress, message);
    }, intervalMs);
    return () => clearInterval(timer);
  }

  function subscribe(webContents) {
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
    broadcast(loadState());
  }

  function ensureTextModelReady(actionName) {
    if (!configStore) return;
    const config = configStore.load();
    const missing = [];
    if (!String(config?.api_key || '').trim()) missing.push('API Key');
    if (!String(config?.base_url || '').trim()) missing.push('Base URL');
    if (!String(config?.model_name || '').trim()) missing.push('模型名称');
    if (missing.length) {
      throw new Error(`无法${actionName}：请先到“设置 - 文本模型”完善${missing.join('、')}。`);
    }
  }

  async function generateDraft(payload = {}) {
    if (activeTask) {
      throw new Error('公文正在生成中，请稍后再试');
    }

    const input = normalizeInput(payload.input || payload);
    const prompt = createPrompt(input);
    ensureTextModelReady('生成公文草稿');
    const task = {
      id: `official-document-${Date.now()}`,
      type: 'draft',
      status: 'running',
      progress: 8,
      message: '正在准备公文起草任务',
      started_at: now(),
    };

    activeTask = task;
    saveState({ input, prompt, task });

    const stopProgress = startProgressPulse(task.id, [
      { progress: 24, message: '正在整理文种规则和材料要点' },
      { progress: 38, message: '正在生成正文结构和标题落款' },
      { progress: 55, message: '正在补齐责任、时限和反馈路径' },
      { progress: 72, message: '正在压缩空泛表达并降低 AI 味' },
      { progress: 88, message: '正在做格式与事实自检' },
      { progress: 94, message: '正在收尾整理公文草稿' },
    ], {
      waitingMessages: [
        '文本模型仍在生成正文，材料越长耗时越久',
        '正在等待模型返回完整草稿，请勿关闭窗口',
        '模型仍在处理，完成后会自动保存到本机工作区',
      ],
    });

    try {
      saveTaskProgress(task.id, 18, '正在请求文本模型生成草稿');
      const draft = await aiService.chat({
        messages: [
          { role: 'system', content: '你是专业、克制、事实优先的中文公文写作助手。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.45,
        logTitle: `公文写作-${input.documentType}`,
      });
      stopProgress();
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: '公文草稿已生成',
        finished_at: now(),
      };
      activeTask = null;
      const draftContent = String(draft || '').trim();
      return saveState({
        input,
        prompt,
        draft: draftContent,
        revisions: appendRevision(loadState(), createRevision('draft', draftContent, input, 'AI 生成公文草稿')),
        task: finalTask,
      });
    } catch (error) {
      stopProgress();
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || '公文生成失败',
        finished_at: now(),
      };
      activeTask = null;
      saveState({ input, prompt, task: failedTask });
      throw error;
    }
  }

  function saveInput(input) {
    const normalized = normalizeInput(input);
    return saveState({ input: normalized, prompt: createPrompt(normalized) });
  }

  function saveDraft(draft) {
    return saveState({ draft: String(draft || '') });
  }

  function saveRevision(payload = {}) {
    const currentState = loadState();
    const input = normalizeInput(payload.input || currentState.input);
    const content = normalizeString(payload.content ?? currentState.draft, 120000);
    if (!content) throw new Error('请先填写公文草稿');
    return saveState({
      input,
      draft: content,
      revisions: appendRevision(currentState, createRevision('manual', content, input, '手动保存版本')),
    });
  }

  async function importDraft() {
    const config = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
    const provider = config.file_parser?.provider || 'local';
    const result = await dialog.showOpenDialog({
      title: '选择公文草稿',
      properties: ['openFile'],
      filters: [
        { name: '公文草稿', extensions: ['docx', 'doc', 'pdf', 'md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择', state: loadState() };
    }

    const filePath = result.filePaths[0];
    const parser = resolveFileParser(config, filePath);
    let draft = '';
    try {
      draft = (await parseDocumentWithConfig(app, filePath, config, {
        assetScope: 'official-document',
        preserveImages: false,
      })).trim();
    } catch (error) {
      return {
        success: false,
        message: error?.message || `当前解析方式不支持该文件格式`,
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
      };
    }

    if (!draft) {
      return {
        success: false,
        message: '未提取到有效文本内容，请检查文件内容',
        fileName: path.basename(filePath),
        parserProvider: parser.provider || provider,
        state: loadState(),
      };
    }

    const currentState = loadState();
    const input = normalizeInput(currentState.input);
    const nextState = saveState({
      draft,
      importedFileName: path.basename(filePath),
      revisions: appendRevision(currentState, createRevision('manual', draft, input, `导入草稿：${path.basename(filePath)}`)),
    });
    return {
      success: true,
      message: parser.fallbackToLocal ? '草稿已导入，当前格式已自动使用本地解析' : '草稿已导入',
      fileName: path.basename(filePath),
      parserProvider: parser.provider || provider,
      state: nextState,
    };
  }

  async function extractInputFromDraft(payload = {}) {
    if (activeTask) {
      throw new Error('公文任务正在处理中，请稍后再试');
    }

    const currentState = loadState();
    const currentInput = normalizeInput(payload.input || currentState.input);
    const draft = normalizeString(payload.draft ?? currentState.draft, 120000);
    if (!draft) throw new Error('请先导入、生成或填写公文草稿');
    ensureTextModelReady('提取公文要素');

    const task = {
      id: `official-document-extract-${Date.now()}`,
      type: 'extract',
      status: 'running',
      progress: 12,
      message: '正在从草稿提取起草要素',
      started_at: now(),
    };

    activeTask = task;
    saveState({ input: currentInput, draft, task });

    const stopProgress = startProgressPulse(task.id, [
      { progress: 28, message: '正在识别文种和行文关系' },
      { progress: 44, message: '正在提取主送机关和使用场景' },
      { progress: 62, message: '正在整理事实、任务和时限' },
      { progress: 80, message: '正在归并起草要素' },
      { progress: 92, message: '正在校验提取结果' },
    ], {
      waitingMessages: [
        '文本模型仍在抽取要素，长草稿可能需要更久',
        '正在等待模型返回结构化结果',
        '模型仍在处理，完成后会自动回填起草要素',
      ],
    });

    try {
      saveTaskProgress(task.id, 20, '正在识别文种、主送机关和材料要点');
      const extracted = await aiService.requestJson({
        logTitle: '公文要素提取',
        progressLabel: '公文要素提取',
        temperature: 0.2,
        timeout_ms: 300000,
        messages: buildExtractInputMessages(draft),
        failureMessage: '公文要素提取 JSON 生成失败',
      });

      const nextInput = normalizeInput({
        ...currentInput,
        ...extracted,
        needTitle: currentInput.needTitle,
        needSignature: currentInput.needSignature,
      });
      stopProgress();
      activeTask = null;
      return saveState({
        input: nextInput,
        draft,
        prompt: createPrompt(nextInput),
        task: { ...task, status: 'success', progress: 100, message: '起草要素已提取', finished_at: now() },
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      saveState({
        input: currentInput,
        draft,
        task: { ...task, status: 'error', progress: 100, message: error?.message || '起草要素提取失败', finished_at: now() },
      });
      throw error;
    }
  }

  async function checkDraft(payload = {}) {
    if (activeTask) {
      throw new Error('公文任务正在处理中，请稍后再试');
    }

    const currentState = loadState();
    const input = normalizeInput(payload.input || currentState.input);
    const draft = normalizeString(payload.draft ?? currentState.draft, 120000);
    if (!draft) throw new Error('请先生成或填写公文草稿');
    ensureTextModelReady('检查公文草稿');

    const task = {
      id: `official-document-check-${Date.now()}`,
      type: 'check',
      status: 'running',
      progress: 10,
      message: '正在准备格式检查',
      started_at: now(),
    };

    activeTask = task;
    saveState({ input, draft, task });

    const stopProgress = startProgressPulse(task.id, [
      { progress: 24, message: '正在核对文种和行文关系' },
      { progress: 40, message: '正在检查标题、主送和正文结构' },
      { progress: 58, message: '正在识别事实密度和责任时限' },
      { progress: 74, message: '正在定位空泛表达和 AI 痕迹' },
      { progress: 88, message: '正在汇总修改建议' },
      { progress: 95, message: '正在整理检查报告' },
    ], {
      waitingMessages: [
        '文本模型仍在检查草稿，内容越长耗时越久',
        '正在等待模型返回完整检查意见',
        '模型仍在处理，完成后会自动显示检查结果',
      ],
    });

    try {
      saveTaskProgress(task.id, 18, '正在检查文种、格式和 AI 味问题');
      const review = await aiService.chat({
        messages: [
          { role: 'system', content: '你是严谨、克制、面向实务修改的中文公文审核助手。' },
          { role: 'user', content: createReviewPrompt(input, draft) },
        ],
        temperature: 0.25,
        logTitle: `公文检查-${input.documentType}`,
      });
      stopProgress();
      activeTask = null;
      return saveState({
        input,
        draft,
        review: String(review || '').trim(),
        task: { ...task, status: 'success', progress: 100, message: '格式检查已完成', finished_at: now() },
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      saveState({
        input,
        draft,
        task: { ...task, status: 'error', progress: 100, message: error?.message || '格式检查失败', finished_at: now() },
      });
      throw error;
    }
  }

  async function polishDraft(payload = {}) {
    if (activeTask) {
      throw new Error('公文任务正在处理中，请稍后再试');
    }

    const currentState = loadState();
    const input = normalizeInput(payload.input || currentState.input);
    const draft = normalizeString(payload.draft ?? currentState.draft, 120000);
    if (!draft) throw new Error('请先生成或填写公文草稿');
    ensureTextModelReady('润色公文草稿');

    const task = {
      id: `official-document-polish-${Date.now()}`,
      type: 'polish',
      status: 'running',
      progress: 10,
      message: '正在准备降 AI 味润色',
      started_at: now(),
    };

    activeTask = task;
    saveState({ input, draft, task });

    const stopProgress = startProgressPulse(task.id, [
      { progress: 24, message: '正在保留事实和责任边界' },
      { progress: 40, message: '正在压缩套话和机械表达' },
      { progress: 58, message: '正在优化段落功能和层次' },
      { progress: 74, message: '正在校正文种语气和结尾' },
      { progress: 88, message: '正在检查是否新增事实' },
      { progress: 95, message: '正在整理润色版本' },
    ], {
      waitingMessages: [
        '文本模型仍在润色草稿，长文稿可能需要更久',
        '正在等待模型返回完整润色版本',
        '模型仍在处理，完成后会自动替换为润色正文',
      ],
    });

    try {
      saveTaskProgress(task.id, 18, '正在润色草稿并修正文种表达');
      const polishedDraft = await aiService.chat({
        messages: [
          { role: 'system', content: '你是专业、克制、事实优先的中文公文润色助手。' },
          { role: 'user', content: createPolishPrompt(input, draft) },
        ],
        temperature: 0.35,
        logTitle: `公文润色-${input.documentType}`,
      });
      stopProgress();
      activeTask = null;
      const polishedContent = String(polishedDraft || '').trim();
      return saveState({
        input,
        draft: polishedContent,
        revisions: appendRevision(loadState(), createRevision('polish', polishedContent, input, '降 AI 味润色版本')),
        task: { ...task, status: 'success', progress: 100, message: '降 AI 味润色已完成', finished_at: now() },
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      saveState({
        input,
        draft,
        task: { ...task, status: 'error', progress: 100, message: error?.message || '润色失败', finished_at: now() },
      });
      throw error;
    }
  }

  async function rewriteDraft(payload = {}) {
    if (activeTask) {
      throw new Error('公文任务正在处理中，请稍后再试');
    }

    const currentState = loadState();
    const input = normalizeInput(payload.input || currentState.input);
    const draft = normalizeString(payload.draft ?? currentState.draft, 120000);
    const instruction = normalizeString(payload.instruction, 3000);
    if (!draft) throw new Error('请先生成或填写公文草稿');
    if (!instruction) throw new Error('请先填写改写要求');
    ensureTextModelReady('改写公文草稿');

    const task = {
      id: `official-document-rewrite-${Date.now()}`,
      type: 'rewrite',
      status: 'running',
      progress: 10,
      message: '正在准备定向改写',
      started_at: now(),
    };

    activeTask = task;
    saveState({ input, draft, task });

    const stopProgress = startProgressPulse(task.id, [
      { progress: 24, message: '正在理解改写要求' },
      { progress: 42, message: '正在保留原文事实边界' },
      { progress: 60, message: '正在调整结构和文种表达' },
      { progress: 78, message: '正在降低空泛和 AI 痕迹' },
      { progress: 92, message: '正在整理改写版本' },
    ], {
      waitingMessages: [
        '文本模型仍在按要求改写，长文稿可能需要更久',
        '正在等待模型返回完整改写版本',
        '模型仍在处理，完成后会自动更新正文',
      ],
    });

    try {
      saveTaskProgress(task.id, 18, '正在按要求改写公文草稿');
      const rewrittenDraft = await aiService.chat({
        messages: [
          { role: 'system', content: '你是专业、克制、事实优先的中文公文改写助手。' },
          { role: 'user', content: createRewritePrompt(input, draft, instruction) },
        ],
        temperature: 0.35,
        logTitle: `公文改写-${input.documentType}`,
      });
      stopProgress();
      const rewrittenContent = String(rewrittenDraft || '').trim();
      activeTask = null;
      return saveState({
        input,
        draft: rewrittenContent,
        revisions: appendRevision(loadState(), createRevision('rewrite', rewrittenContent, input, `定向改写：${instruction.slice(0, 80)}`)),
        task: { ...task, status: 'success', progress: 100, message: '定向改写已完成', finished_at: now() },
      });
    } catch (error) {
      stopProgress();
      activeTask = null;
      saveState({
        input,
        draft,
        task: { ...task, status: 'error', progress: 100, message: error?.message || '改写失败', finished_at: now() },
      });
      throw error;
    }
  }

  function clear() {
    activeTask = null;
    if (fs.existsSync(dir())) fs.rmSync(dir(), { recursive: true, force: true });
    return { success: true, state: saveState(initialState) };
  }

  return {
    loadState,
    saveInput,
    saveDraft,
    saveRevision,
    importDraft,
    extractInputFromDraft,
    generateDraft,
    checkDraft,
    polishDraft,
    rewriteDraft,
    clear,
    subscribe,
  };
}

module.exports = {
  createOfficialDocumentService,
};
