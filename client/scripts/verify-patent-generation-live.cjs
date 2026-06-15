const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore } = require('../electron/services/configStore.cjs');
const { createAiService } = require('../electron/services/aiService.cjs');
const { createPatentGenerationService } = require('../electron/services/patentGenerationService.cjs');
const { getPatentGenerationDir } = require('../electron/utils/paths.cjs');

function createApp(userDataDir) {
  return {
    getPath(name) {
      if (name === 'userData') return userDataDir;
      if (name === 'documents') return userDataDir;
      return userDataDir;
    },
    getVersion() {
      return 'verify-live';
    },
  };
}

function maskConfig(config) {
  return {
    provider: config.text_model_provider,
    has_api_key: Boolean(config.api_key),
    has_base_url: Boolean(config.base_url),
    model_name: config.model_name || '',
  };
}

function getConfigCandidates() {
  const supportDir = path.join(os.homedir(), 'Library', 'Application Support');
  return [
    process.env.YIBIAO_USER_DATA,
    path.join(supportDir, 'yudubid-client'),
    path.join(supportDir, '禹都AI解决方案助手'),
    path.join(supportDir, '禹都AI投标助手'),
    path.join(supportDir, 'yudubiao-client'),
  ].filter(Boolean);
}

function isCompleteTextConfig(config) {
  return Boolean(config.api_key && config.model_name && config.base_url);
}

function loadConfigCandidates() {
  return getConfigCandidates()
    .filter((userDataDir, index, all) => all.indexOf(userDataDir) === index)
    .filter((userDataDir) => fs.existsSync(path.join(userDataDir, 'user_config.json')))
    .map((userDataDir) => {
      const app = createApp(userDataDir);
      const configStore = createConfigStore(app);
      const config = configStore.load();
      const configPath = configStore.getConfigFilePath();
      return {
        userDataDir,
        configPath,
        config,
        summary: maskConfig(config),
        complete: isCompleteTextConfig(config),
        mtimeMs: fs.statSync(configPath).mtimeMs,
      };
    })
    .sort((left, right) => {
      if (left.complete !== right.complete) return left.complete ? -1 : 1;
      return right.mtimeMs - left.mtimeMs;
    });
}

function resolveProjectDir() {
  const input = process.argv[2] || process.cwd();
  return path.resolve(input);
}

function summarizeMarkdown(markdown) {
  const content = String(markdown || '');
  const headings = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,4}\s+/.test(line))
    .slice(0, 12);
  return {
    char_count: content.length,
    headings,
    checks: {
      has_title: /^#\s+/.test(content.trim()) || /技术交底书/.test(content),
      has_background: /背景|现有技术|缺点/.test(content),
      has_solution: /技术方案|详细阐述|实施方式/.test(content),
      has_effect: /有益效果|技术效果/.test(content),
      has_claim_hint: /权利要求|保护点|创新点/.test(content),
    },
  };
}

function summarizePriorArt(markdown) {
  const content = String(markdown || '');
  return {
    char_count: content.length,
    headings: content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^#{2,4}\s+/.test(line))
      .slice(0, 8),
    checks: {
      has_entries: /现有技术条目/.test(content),
      has_differences: /区别点/.test(content),
      has_reusable_text: /可回写至交底书/.test(content),
      has_risks: /风险|待补充/.test(content),
    },
  };
}

function buildLivePriorArtSource(point) {
  return [
    '资料一：公开资料显示，现有投标文件或技术方案文档管理系统通常采用单一 JSON 文件、普通文件目录或关系数据库保存项目数据。',
    '其常见方式是将目录、章节正文、任务状态和生成缓存整体序列化保存，或者仅按文件夹拆分 Markdown 文档。',
    '该类方案的局限在于：当文档规模较大或章节数量较多时，整体读写容易导致界面阻塞；局部章节更新时需要重新写入较大的状态包；并发生成、断点恢复和版本迁移时容易出现状态覆盖。',
    '',
    '资料二：部分通用 AI 文档生成工具通过 Prompt 约束生成标书、方案或说明书正文，但通常不显式区分“大文本权威内容”和“结构化任务状态”。',
    '其流程侧重内容生成，缺少对目录节点、正文段落、任务进度、生成缓存和审计结果之间关系的结构化约束。',
    '',
    '本案主专利点：',
    `标题：${point.title}`,
    `核心创新：${point.innovation || '未提供'}`,
    `区别点：${point.difference || '未提供'}`,
  ].join('\n');
}

async function main() {
  const candidates = loadConfigCandidates();
  const selected = candidates[0];
  const config = selected ? selected.config : {};
  const configSummary = maskConfig(config);

  if (!selected || !isCompleteTextConfig(config)) {
    console.log(JSON.stringify({
      success: false,
      reason: '文本模型配置不完整，请先在应用设置里配置 API Key、Base URL 和模型名称。',
      config_path: selected ? selected.configPath : '',
      config: configSummary,
      checked_configs: candidates.map((candidate) => ({
        config_path: candidate.configPath,
        config: candidate.summary,
      })),
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const projectDir = resolveProjectDir();
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    throw new Error(`项目目录不存在或不是目录：${projectDir}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-patent-live-'));
  try {
    const app = createApp(tempRoot);
    const tempConfigStore = {
      load() {
        return config;
      },
    };
    const aiService = createAiService({ app, configStore: tempConfigStore });
    const patentService = createPatentGenerationService({ app, aiService });
    let state = patentService.saveCaseInfo({
      caseName: '真实模型专利挖掘验收',
      topic: '从项目资料挖掘可专利化技术点',
      patentType: 'unknown',
      contact: {},
    });

    const statePath = path.join(getPatentGenerationDir(app), 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      ...state,
      project: { path: projectDir, name: path.basename(projectDir) },
    }, null, 2), 'utf-8');

    state = await patentService.startMining();
    const selectedPoint = (state.miningResult || []).find((point) => point.id === state.selectedPatentPointId) || state.miningResult?.[0];
    if (!selectedPoint) {
      throw new Error('真实模型未返回可用于生成交底书的候选专利点');
    }

    state = patentService.selectPatentPoint(selectedPoint.id);
    state = patentService.saveCaseInfo({
      ...state.caseInfo,
      caseName: selectedPoint.title,
      topic: selectedPoint.innovation,
      patentType: 'method',
    });

    state = await patentService.generatePriorArtAnalysis({
      sourceText: buildLivePriorArtSource(selectedPoint),
    });
    const priorArtMarkdown = state.priorArtMarkdown;

    state = await patentService.generateDisclosureDraft();
    const draft = patentService.readDisclosureDraft(state.activeDraftId);
    const revision = await patentService.generateRevision({
      kind: 'merge',
      instruction: '请补充一个实施例：当用户导入大型投标技术方案项目后，系统将目录结构、章节正文、任务进度和生成缓存分别存储，并在单个章节重新生成时只更新对应结构化记录，同时保留旧版本草稿以便对比。',
    });
    const revisedDraft = revision.draft;

    console.log(JSON.stringify({
      success: true,
      config_path: selected.configPath,
      config: configSummary,
      project: projectDir,
      scanSummary: state.scanSummary,
      selected_point_id: selectedPoint.id,
      points: (state.miningResult || []).map((point) => ({
        title: point.title,
        score: point.score,
        recommendedClaims: point.recommendedClaims,
        qualityWarnings: point.qualityWarnings || [],
        innovation: point.innovation,
        difference: point.difference,
      })),
      prior_art: summarizePriorArt(priorArtMarkdown),
      disclosure_draft: {
        title: draft.title,
        file_name: path.basename(draft.file_path),
        ...summarizeMarkdown(draft.content),
      },
      revision: {
        logs_count: revision.state.revisionLogs.length,
        latest_summary: revision.state.revisionLogs[0]?.summary || '',
        title: revisedDraft.title,
        file_name: path.basename(revisedDraft.file_path),
        ...summarizeMarkdown(revisedDraft.content),
      },
    }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
