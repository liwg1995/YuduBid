const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { createCanvas } = require('@napi-rs/canvas');
const { createSoftwareCopyrightService } = require('../electron/services/softwareCopyrightService.cjs');
const { analyzeProject, createCodeGenerationService } = require('../electron/services/codeGenerationService.cjs');
const { cleanSource } = require('../electron/services/softwareCopyrightCodePipeline.cjs');
const { getSoftwareCopyrightDir } = require('../electron/utils/paths.cjs');

const DEFAULT_TIMEOUT_MS = 90_000;

function createTempApp() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-sc-verify-'));
  return {
    userData,
    app: {
      getPath(name) {
        if (name !== 'userData') {
          throw new Error(`Unsupported app path requested: ${name}`);
        }
        return userData;
      },
    },
  };
}

function createMockAiService(fields, app) {
  let generatedImageIndex = 0;
  return {
    getImageModelAvailability() {
      return { available: true, status: 'available', message: '软著验证生图模型可用' };
    },
    async requestJson() {
      return {
        product_positioning: `${fields.softwareName}是一套面向招投标资料编制与审查场景的桌面应用。`,
        industry: fields.industry,
        target_users: ['投标专员', '项目经理', '企业管理人员'],
        core_value: '帮助用户整理招投标资料、生成文档内容并检查响应完整性。',
        business_features: ['技术方案生成', '商务标资料管理', '知识库检索', '标书查重', '废标项检查', '软著资料生成'],
        operation_flow: ['进入系统', '选择业务功能', '导入或填写资料', '启动生成或检查任务', '查看结果并导出资料'],
        main_functions: fields.mainFunctions,
        technical_characteristics: fields.technicalFeatures,
        manual_modules: [
          {
            title: '技术方案',
            purpose: '用于生成和编辑投标技术方案正文。',
            entry: '左侧导航栏的技术方案菜单',
            visible_elements: ['步骤区域', '正文编辑区', '导出按钮'],
            operation_steps: ['导入招标文件', '生成目录', '生成正文', '检查并导出文档'],
            validation_rules: ['招标文件不能为空', '目录节点需有效'],
            feedback: '页面展示生成进度、正文内容和导出结果。',
            screenshot: '技术方案页面截图预留位',
          },
          {
            title: '软著生成',
            purpose: '用于生成软件著作权申请表、操作手册和代码材料。',
            entry: '左侧导航栏的软件著作/软著生成菜单',
            visible_elements: ['项目来源', '申请字段', '任务进度', '草稿资料', '正式资料'],
            operation_steps: ['选择项目', '补全字段', '生成草稿', '检查并确认草稿', '导出正式资料'],
            validation_rules: ['软件名称不能为空', '草稿需完整'],
            feedback: '页面展示草稿检查结果和正式资料路径。',
            screenshot: '软著生成页面截图预留位',
          },
        ],
      };
    },
    async chat() {
      return [
        `# ${fields.softwareName} 操作手册`,
        '',
        '## 一、相关文档',
        '',
        '| 文档名称 | 说明 |',
        '| --- | --- |',
        '| 总体设计说明 | 说明软件目标、用户对象和总体功能组成。 |',
        '| 详细设计说明 | 说明各功能模块的输入、处理和输出。 |',
        '| 测试用例 | 记录主要功能的测试过程和结果。 |',
        '',
        '## 二、说明',
        '',
        `${fields.softwareName}面向${fields.industry}场景，用户可通过软件完成资料导入、内容生成、材料检查和结果导出等工作。`,
        '',
        '## 三、功能特点',
        '',
        '软件围绕招投标资料处理流程组织功能入口，并在关键步骤展示任务进度和处理结果。',
        '',
        '## 四、系统要求',
        '',
        `运行平台为${fields.runningPlatform}，运行支撑环境为${fields.runtimeSupport}。`,
        '',
        '## 五、技术方案',
        '',
        '用户从左侧导航栏进入技术方案页面，导入招标文件后可生成目录和正文内容。',
        '',
        '【截图预留：技术方案页面截图预留位】',
        '',
        '## 六、软著生成',
        '',
        '用户从软件著作菜单进入软著生成页面，选择项目并补全字段后生成草稿，检查通过后导出正式资料。',
        '',
        '【截图预留：软著生成页面截图预留位】',
        '',
        '## 七、常见问题解答',
        '',
        '如生成结果不完整，用户应检查输入字段和项目源码后重新生成。',
        '',
        '## 八、术语表',
        '',
        '| 术语 | 说明 |',
        '| --- | --- |',
        '| 草稿 | 正式导出前可编辑确认的软著材料。 |',
        '| 正式资料 | 确认草稿后导出的申请表、手册和代码材料。 |',
        '',
      ].join('\n');
    },
    async generateImage() {
      generatedImageIndex += 1;
      const canvas = createCanvas(1024, 1024);
      const context = canvas.getContext('2d');
      context.fillStyle = generatedImageIndex % 2 ? '#eef4ff' : '#f8fafc';
      context.fillRect(0, 0, 1024, 1024);
      context.fillStyle = '#1d4ed8';
      context.font = 'bold 46px sans-serif';
      context.fillText(`AI Illustration ${generatedImageIndex}`, 110, 250);
      context.fillStyle = '#334155';
      context.font = '28px sans-serif';
      context.fillText('Software copyright verification', 110, 320);
      const outputDir = path.join(getSoftwareCopyrightDir(app), 'mock-ai-output');
      fs.mkdirSync(outputDir, { recursive: true });
      const filePath = path.join(outputDir, `generated-${generatedImageIndex}.png`);
      fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
      return { success: true, file_path: filePath, asset_url: '', mime_type: 'image/png' };
    },
  };
}

function createVerifyFields() {
  return {
    softwareName: '禹都AI解决方案助手软件',
    shortName: '禹都AI解决方案助手',
    version: 'V1.0',
    category: '应用软件',
    developmentCompletedDate: '2026-06-08',
    developmentMode: '单独开发',
    softwareDescription: '原创',
    publishStatus: '未发表',
    firstPublishDate: '',
    copyrightOwner: '中国/河南省/企业/禹都科技有限公司/统一社会信用代码91410100MA00000000',
    rightsScope: '全部权利',
    rightsAcquisition: '原始取得',
    developmentHardware: 'Apple Silicon/16GB/512GB',
    runningHardware: '常规办公电脑/8GB内存及以上',
    developmentOs: 'macOS 15',
    developmentTools: 'VS Code、Vite、Electron',
    runningPlatform: 'Windows 10 及以上、macOS 13 及以上',
    runtimeSupport: 'Electron、Chromium、Node.js',
    programmingLanguage: 'TypeScript、JavaScript、CSS',
    sourceLineCount: '',
    developmentPurpose: '提升招投标资料编制效率',
    industry: '招投标与企业办公软件',
    mainFunctions: '招标文件解析、技术方案生成、商务标资料管理、知识库检索、标书查重、废标项检查、软著材料生成。',
    technicalFeatures: '桌面端 Electron 应用，支持 Markdown 编辑、AI 文档生成、Word 导出和本地工作区存储。',
    pageCount: '',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTask(service, type, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = service.loadState();
    if (state.task?.type === type && state.task.status !== 'running') {
      return state;
    }
    await sleep(200);
  }
  throw new Error(`等待任务超时：${type}`);
}

function writeInitialState(app, projectDir, fields) {
  const rootDir = getSoftwareCopyrightDir(app);
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'state.json'), JSON.stringify({
    step: 'setup',
    project: { path: projectDir, name: path.basename(projectDir) },
    fields,
    options: {
      sourceMode: 'project',
      screenshotMode: 'skip',
      useAiImages: false,
      exportItems: {
        application: true,
        manual: true,
        code: true,
        report: true,
      },
      codeExcludedPaths: [],
      codeIncludedPaths: [],
    },
    drafts: {},
    draftConfirmed: false,
    outputDir: '',
    outputs: [],
  }, null, 2), 'utf-8');
}

function attachManualScreenshots(app) {
  const rootDir = getSoftwareCopyrightDir(app);
  const statePath = path.join(rootDir, 'state.json');
  const screenshotDir = path.join(rootDir, 'manual-screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const screenshots = Array.from({ length: 3 }, (_, index) => {
    const canvas = createCanvas(960, 540);
    const context = canvas.getContext('2d');
    context.fillStyle = index % 2 ? '#edf4ff' : '#f8fafc';
    context.fillRect(0, 0, 960, 540);
    context.fillStyle = '#1d4ed8';
    context.font = 'bold 42px sans-serif';
    context.fillText(`Software Copyright Screen ${index + 1}`, 80, 170);
    context.fillStyle = '#334155';
    context.font = '26px sans-serif';
    context.fillText('Local screenshot export verification', 80, 230);
    const id = `verify-screen-${index + 1}`;
    const filePath = path.join(screenshotDir, `${id}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return {
      id,
      name: `${id}.png`,
      path: filePath,
      assetUrl: `yibiao-asset://software-copyright-screenshots/${id}.png`,
      caption: `验证界面 ${index + 1}`,
      width: 960,
      height: 540,
      createdAt: new Date().toISOString(),
    };
  });
  state.manualScreenshots = screenshots;
  state.options = { ...(state.options || {}), screenshotMode: 'manual', useAiImages: false };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  return screenshots;
}

function assertOutputFiles(outputs) {
  if (!Array.isArray(outputs) || outputs.length < 4) {
    throw new Error(`正式资料数量异常：${outputs?.length || 0}`);
  }
  for (const output of outputs) {
    const stat = fs.statSync(output.path);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`正式资料为空或不可读：${output.path}`);
    }
  }
}

function inspectOutputs(state) {
  const manifestPath = path.join(state.draftDir, '代码提取清单.json');
  const applicationPath = path.join(state.outputDir, '申请表信息.txt');
  const reportPath = path.join(state.outputDir, '生成报告.md');
  const readmePath = path.join(state.outputDir, '导出说明.txt');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const application = fs.readFileSync(applicationPath, 'utf-8');
  const report = fs.readFileSync(reportPath, 'utf-8');
  const readme = fs.readFileSync(readmePath, 'utf-8');
  if (manifest.lines_per_page !== 50) {
    throw new Error(`代码材料每页行数错误：${manifest.lines_per_page}`);
  }
  if (!Array.isArray(manifest.pages) || !manifest.pages.length) {
    throw new Error('代码材料缺少权威分页数据。');
  }
  if (manifest.pages.slice(0, -1).some((page) => page.lines.length !== 50)) {
    throw new Error('代码材料存在非末页不足 50 行。');
  }
  if ((manifest.audit || []).some((item) => item.status === 'fail')) {
    throw new Error(`代码材料审查未通过：${manifest.audit.filter((item) => item.status === 'fail').map((item) => item.name).join('、')}`);
  }
  if (!state.outputs.some((output) => output.name.endsWith('.txt') && output.name.includes('-代码('))) {
    throw new Error('正式资料缺少代码 TXT 备查文件。');
  }
  const manualOutput = state.outputs.find((output) => output.name.endsWith('_操作手册.docx'));
  if (!manualOutput) throw new Error('正式资料缺少操作手册 DOCX。');
  const manualZip = new AdmZip(manualOutput.path);
  const manualMedia = manualZip.getEntries().filter((entry) => /^word\/media\//u.test(entry.entryName));
  const manualDocumentXml = manualZip.readAsText('word/document.xml');
  if (manualMedia.length < 2) {
    throw new Error(`操作手册未嵌入全部附录图片：${manualMedia.length}`);
  }
  if (manualDocumentXml.includes('截图预留')) {
    throw new Error('已关联图片未替换操作手册中的截图预留位。');
  }
  for (const output of state.outputs.filter((item) => item.name.endsWith('.docx') && item.name.includes('-代码('))) {
    const zip = new AdmZip(output.path);
    const documentXml = zip.readAsText('word/document.xml');
    const headerEntry = zip.getEntries().find((entry) => /^word\/header\d+\.xml$/u.test(entry.entryName));
    const headerXml = headerEntry ? zip.readAsText(headerEntry) : '';
    const paragraphCount = (documentXml.match(/<w:p(?:\s|>)/g) || []).length;
    const pageBreakCount = (documentXml.match(/<w:pageBreakBefore\/>/g) || []).length;
    const expectedPages = output.name.includes('前30页') || output.name.includes('后30页') ? 30 : manifest.pages.length;
    if (paragraphCount !== expectedPages * 50 && !(expectedPages === manifest.pages.length && paragraphCount === manifest.material_line_count)) {
      throw new Error(`代码 DOCX 段落数量异常：${output.name}，${paragraphCount}`);
    }
    if (pageBreakCount !== expectedPages - 1) {
      throw new Error(`代码 DOCX 显式分页数量异常：${output.name}，${pageBreakCount}`);
    }
    if (!headerXml.includes('源程序') || !headerXml.includes('PAGE')) {
      throw new Error(`代码 DOCX 页眉或页码域缺失：${output.name}`);
    }
  }
  if (application.includes('待用户确认')) {
    throw new Error('申请表信息仍包含“待用户确认”。');
  }
  if (!readme.includes('导出材料格式需根据当地受理要求人为微调，请勿直接使用')) {
    throw new Error('导出说明缺少人工微调提醒。');
  }
  return {
    draftCount: Object.keys(state.drafts || {}).length,
    outputCount: state.outputs.length,
    totalPages: manifest.total_pages,
    materialLineCount: manifest.material_line_count,
    manifestFileCount: Array.isArray(manifest.files) ? manifest.files.length : 0,
    reportExcerpt: report.split(/\r?\n/).slice(0, 8),
    readmeExcerpt: readme.split(/\r?\n/).slice(0, 8),
  };
}

async function run() {
  const cleaned = cleanSource([
    'const endpoint = "https://example.com/api"; // 删除这段注释',
    'const apiKey = "sk-example-secret-value";',
    '',
    'function ready() { return true; }',
  ].join('\n'), '.ts', {});
  if (!cleaned.lines.some((line) => line.includes('https://example.com/api'))) throw new Error('清洗器误删了字符串中的注释符号。');
  if (cleaned.lines.some((line) => line.includes('删除这段注释'))) throw new Error('清洗器未删除行注释。');
  if (cleaned.lines.some((line) => line.includes('example-secret-value'))) throw new Error('清洗器未脱敏密钥。');
  if (cleaned.maskedEvidence?.[0]?.line !== 2 || cleaned.maskedEvidence[0].detail.includes('example-secret-value')) {
    throw new Error('清洗器未生成安全的敏感信息定位证据。');
  }

  const projectDir = path.resolve(process.env.SOFTWARE_COPYRIGHT_VERIFY_PROJECT || path.join(process.cwd(), 'src'));
  if (!fs.existsSync(projectDir)) {
    throw new Error(`验证项目不存在：${projectDir}`);
  }

  const legacyFixture = createTempApp();
  const legacyRoot = getSoftwareCopyrightDir(legacyFixture.app);
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'state.json'), JSON.stringify({
    step: 'generating',
    project: { path: projectDir, name: path.basename(projectDir) },
    fields: {
      software_name: '旧版软著迁移验证软件',
      copyright_owner: '旧版著作权人',
      development_completed_date: '2026-05-01',
    },
    options: { useAiImages: false },
    drafts: [],
    draftConfirmed: true,
    task: {
      task_id: 'legacy-running-task',
      type: 'software-copyright-draft-generation',
      status: 'running',
      progress: 48,
      logs: ['旧版任务执行中'],
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }, null, 2), 'utf-8');
  const legacyService = createSoftwareCopyrightService({
    app: legacyFixture.app,
    aiService: createMockAiService(createVerifyFields(), legacyFixture.app),
    configStore: {},
    codeGenerationService: null,
  });
  const migratedLegacyState = legacyService.loadState();
  if (migratedLegacyState.schemaVersion !== 4 || migratedLegacyState.migration?.fromVersion !== 0) {
    throw new Error('旧版软著工作区未迁移到当前状态版本。');
  }
  if (migratedLegacyState.fields.softwareName !== '旧版软著迁移验证软件' || migratedLegacyState.fields.copyrightOwner !== '旧版著作权人') {
    throw new Error('旧版蛇形字段未正确迁移。');
  }
  if (migratedLegacyState.draftConfirmed || migratedLegacyState.confirmedSnapshot) {
    throw new Error('缺少确认快照的旧版确认状态未安全失效。');
  }
  if (migratedLegacyState.task?.status !== 'error' || !migratedLegacyState.task.recovery?.actions?.length) {
    throw new Error('异常退出留下的运行中任务未转换为可重试状态。');
  }

  const futureFixture = createTempApp();
  const futureRoot = getSoftwareCopyrightDir(futureFixture.app);
  fs.mkdirSync(futureRoot, { recursive: true });
  fs.writeFileSync(path.join(futureRoot, 'state.json'), JSON.stringify({ schemaVersion: 999, fields: {}, options: {} }), 'utf-8');
  const futureService = createSoftwareCopyrightService({
    app: futureFixture.app,
    aiService: createMockAiService(createVerifyFields(), futureFixture.app),
    configStore: {},
    codeGenerationService: null,
  });
  let futureVersionBlocked = false;
  try {
    futureService.loadState();
  } catch (error) {
    futureVersionBlocked = String(error?.message || error).includes('高于当前客户端支持版本');
  }
  if (!futureVersionBlocked) throw new Error('高版本软著工作区未被安全拦截。');

  const deletionFixture = createTempApp();
  writeInitialState(deletionFixture.app, projectDir, createVerifyFields());
  const deletionService = createSoftwareCopyrightService({
    app: deletionFixture.app,
    aiService: createMockAiService(createVerifyFields(), deletionFixture.app),
    configStore: {},
    codeGenerationService: null,
  });
  const deletionInitial = deletionService.listCases();
  const deletionFirstId = deletionInitial.activeCaseId;
  const deletionSecond = deletionService.createCase({ name: '待删除当前项目' });
  const deletionSecondId = deletionSecond.cases.activeCaseId;
  const deletionThird = deletionService.createCase({ name: '待删除非当前项目' });
  const deletionThirdId = deletionThird.cases.activeCaseId;
  const deletedInactive = deletionService.deleteCase(deletionSecondId);
  if (deletedInactive.cases.cases.some((item) => item.id === deletionSecondId)) throw new Error('非当前软著项目删除失败。');
  const deletedActive = deletionService.deleteCase(deletionThirdId);
  if (deletedActive.cases.activeCaseId !== deletionFirstId || deletedActive.cases.cases.some((item) => item.id === deletionThirdId)) {
    throw new Error('当前软著项目删除后未切换到剩余项目。');
  }
  const deletedLast = deletionService.deleteCase(deletionFirstId);
  if (deletedLast.cases.cases.length !== 1 || deletedLast.cases.activeCaseId === deletionFirstId) {
    throw new Error('删除最后一个软著项目后未建立新的空白项目。');
  }
  if (deletedLast.state.project || Object.keys(deletedLast.state.drafts || {}).length) {
    throw new Error('删除最后一个软著项目后的接续项目不是空白工作区。');
  }

  const { app, userData } = createTempApp();
  const fields = createVerifyFields();
  writeInitialState(app, projectDir, fields);
  const codeGenerationService = createCodeGenerationService({ app });

  const service = createSoftwareCopyrightService({
    app,
    aiService: createMockAiService(fields, app),
    configStore: {},
    codeGenerationService,
  });

  console.log(`[software-copyright-verify] project=${projectDir}`);
  console.log(`[software-copyright-verify] userData=${userData}`);

  service.startGeneration({ fields, sourceMode: 'project', useAiImages: false });
  const draftState = await waitForTask(service, 'software-copyright-draft-generation');
  if (draftState.task.status !== 'success') {
    throw new Error(draftState.task.error || '草稿生成失败');
  }

  const applicationDraft = service.readDraft('application');
  service.saveDraft({ key: 'application', content: `${applicationDraft.content}\n<!-- verify draft save -->\n` });
  const versionsAfterSave = service.listDraftVersions('application');
  if (versionsAfterSave.length !== 1 || versionsAfterSave[0].reason !== '保存前自动备份') {
    throw new Error('草稿保存前版本未正确记录。');
  }
  const versionComparison = service.compareDraftVersion({ key: 'application', versionId: versionsAfterSave[0].id });
  if (!versionComparison.changed || versionComparison.addedLineCount <= 0) {
    throw new Error('草稿版本差异未正确识别。');
  }
  const restoredDraft = service.restoreDraftVersion({ key: 'application', versionId: versionsAfterSave[0].id });
  if (restoredDraft.content !== applicationDraft.content) {
    throw new Error('草稿历史版本恢复失败。');
  }
  const versionsAfterRestore = service.listDraftVersions('application');
  if (versionsAfterRestore.length < 2 || versionsAfterRestore[0].reason !== '恢复前自动备份') {
    throw new Error('恢复草稿前未自动备份当前内容。');
  }

  const screenshots = attachManualScreenshots(app);
  const reordered = service.reorderManualScreenshots([screenshots[1].id, screenshots[0].id, screenshots[2].id]);
  if (reordered.manualScreenshots[0].id !== screenshots[1].id) throw new Error('手动截图排序保存失败。');
  const captionUpdated = service.updateManualScreenshot({ id: screenshots[1].id, caption: '项目首页界面' });
  if (captionUpdated.manualScreenshots[0].caption !== '项目首页界面') throw new Error('手动截图图注保存失败。');
  const removedPath = screenshots[2].path;
  const afterRemove = service.removeManualScreenshot(screenshots[2].id);
  if (afterRemove.manualScreenshots.length !== 2 || fs.existsSync(removedPath)) throw new Error('手动截图移除失败。');

  const savedAiSettings = service.saveAiIllustrationSettings({ prompt: '生成资料处理与结果导出的专业功能示意图', style: 'engineering_diagram' });
  if (savedAiSettings.aiIllustrationSettings.prompt !== '生成资料处理与结果导出的专业功能示意图') throw new Error('AI 插图设置保存失败。');
  const aiOne = await service.generateAiIllustration({ prompt: savedAiSettings.aiIllustrationSettings.prompt, style: 'engineering_diagram', caption: '资料处理流程' });
  const aiTwo = await service.generateAiIllustration({ prompt: '生成核心功能模块关系图', style: 'engineering_diagram', caption: '核心功能关系' });
  const aiThree = await service.generateAiIllustration({ prompt: '生成软件使用场景图', style: 'realistic_photo', caption: '软件使用场景' });
  const manualPlaceholders = service.loadState().manualPlaceholders;
  if (manualPlaceholders.length < 2) throw new Error('操作手册截图预留位解析失败。');
  const reorderedAi = service.reorderAiIllustrations([aiTwo.item.id, aiOne.item.id, aiThree.item.id]);
  if (reorderedAi.aiIllustrations[0].id !== aiTwo.item.id) throw new Error('AI 插图排序保存失败。');
  const updatedAi = service.updateAiIllustration({ id: aiTwo.item.id, caption: '资料处理与导出关系', placement: manualPlaceholders[0] });
  service.updateAiIllustration({ id: aiOne.item.id, caption: '资料处理流程', placement: manualPlaceholders[1] });
  if (updatedAi.aiIllustrations[0].caption !== '资料处理与导出关系' || updatedAi.aiIllustrations[0].placement !== manualPlaceholders[0]) throw new Error('AI 插图图注或插入位置保存失败。');
  const removedAiPath = aiThree.item.path;
  const afterAiRemove = service.removeAiIllustration(aiThree.item.id);
  if (afterAiRemove.aiIllustrations.length !== 2 || fs.existsSync(removedAiPath)) throw new Error('AI 插图移除失败。');
  service.saveManualAssetReview({
    checks: { content: true, captionPlacement: true },
    notes: '自动验证：AI 插图内容、图注和插入位置已核对。',
  });

  const consistentApplicationDraft = service.readDraft('application');
  service.saveDraft({
    key: 'application',
    content: consistentApplicationDraft.content.replace('➤版本号：V1.0', '➤版本号：V9.9'),
  });
  const mismatchValidation = service.validateDraft();
  if (mismatchValidation.valid || !mismatchValidation.issues.some((issue) => issue.type === 'consistency' && issue.key === 'application')) {
    throw new Error('跨材料版本号不一致未被阻止。');
  }
  service.saveDraft({ key: 'application', content: consistentApplicationDraft.content });

  const validation = service.validateDraft();
  if (!validation.valid) {
    throw new Error(`草稿检查未通过：${validation.issues.map((issue) => issue.message).join('；')}`);
  }
  if (validation.consistencyChecks.length !== 5 || validation.consistencyChecks.some((check) => check.status !== 'pass')) {
    throw new Error(`跨材料一致性检查异常：${validation.consistencyChecks.map((check) => `${check.label}=${check.status}`).join('；')}`);
  }

  service.saveCodeMaterialReview({
    checks: { pageRange: true, sourceScope: true, readability: true },
    notes: '自动验证：代码页数、源码范围和可读性已核对。',
  });

  const confirmedState = service.confirmDraft();
  if (!confirmedState.draftConfirmed) {
    throw new Error('草稿确认状态未写入。');
  }
  if (!confirmedState.confirmedSnapshot?.path || !fs.existsSync(confirmedState.confirmedSnapshot.stateFile)) {
    throw new Error('草稿确认后未生成可追溯快照。');
  }
  const confirmedBusinessVersions = service.listDraftVersions('business');
  const confirmedBusinessComparison = service.compareDraftVersion({ key: 'business', versionId: confirmedBusinessVersions[0].id });
  if (confirmedBusinessComparison.changed) {
    throw new Error('业务理解确认版本与当前草稿不一致。');
  }

  service.saveManualReview({
    checks: { ownership: true, identity: true, dates: true, sourceEvidence: true, localRequirements: true },
    notes: '自动验证：申报人工复核与证据链已确认。',
  });

  service.exportFinal();
  const finalState = await waitForTask(service, 'software-copyright-final-export');
  if (finalState.task.status !== 'success') {
    throw new Error(finalState.task.error || '正式资料导出失败');
  }

  assertOutputFiles(finalState.outputs);
  const inspected = inspectOutputs(finalState);
  const exportBatches = service.listExportBatches();
  if (exportBatches.length !== 1 || exportBatches[0].status !== 'pass') {
    throw new Error('正式资料交付批次未正确记录或完整性检查未通过。');
  }
  const exportedBatch = exportBatches[0];
  if (!fs.existsSync(exportedBatch.zipPath)) throw new Error('正式资料 ZIP 交付包未生成。');
  const zipEntries = new AdmZip(exportedBatch.zipPath).getEntries().map((entry) => entry.entryName);
  if (!zipEntries.includes('交付清单.json') || !zipEntries.includes('申报提交说明.md') || !zipEntries.some((entry) => entry.endsWith('.docx'))) {
    throw new Error('ZIP 交付包缺少交付清单、申报说明或正式文档。');
  }
  const deliveryManifest = JSON.parse(fs.readFileSync(path.join(exportedBatch.directory, '交付清单.json'), 'utf-8'));
  if (deliveryManifest.snapshotId !== confirmedState.confirmedSnapshot.id || !deliveryManifest.files.every((item) => item.sha256)) {
    throw new Error('交付清单未正确关联确认快照或文件哈希。');
  }
  if (!deliveryManifest.files.some((item) => item.name === '申报提交说明.md')) {
    throw new Error('交付清单未记录申报提交说明。');
  }

  const submissionReview = service.getSubmissionReview();
  if (submissionReview.fieldMappings.length < 20 || !submissionReview.deliveryChecks.some((item) => item.id === 'file-naming' && item.status === 'pass')) {
    throw new Error('申报字段映射或正式文件命名检查未正确生成。');
  }
  if (!submissionReview.deliveryChecks.some((item) => item.id === 'delivery-integrity' && item.status === 'pass')) {
    throw new Error('申报总检未识别当前快照的完整交付包。');
  }
  if (!submissionReview.fieldMappings.some((item) => item.key === 'copyrightOwner' && item.status === 'pass')) {
    throw new Error('申报字段检查未正确识别已填写的著作权人。');
  }
  const generatedGuide = service.generateSubmissionGuide();
  if (!generatedGuide.latestGuide?.path || !fs.existsSync(generatedGuide.latestGuide.path)) {
    throw new Error('一键申报提交说明未生成。');
  }
  const generatedGuideContent = fs.readFileSync(generatedGuide.latestGuide.path, 'utf-8');
  if (!generatedGuideContent.includes('## 官网填报字段') || !generatedGuideContent.includes('## 提交前检查')) {
    throw new Error('申报提交说明缺少字段映射或风险清单。');
  }

  const tamperTarget = path.join(exportedBatch.directory, '导出说明.txt');
  const originalTamperContent = fs.readFileSync(tamperTarget);
  fs.appendFileSync(tamperTarget, '\nverify tamper\n', 'utf-8');
  if (service.listExportBatches()[0].status !== 'changed') {
    throw new Error('交付文件被修改后未触发完整性异常。');
  }
  fs.writeFileSync(tamperTarget, originalTamperContent);
  if (service.listExportBatches()[0].status !== 'pass') {
    throw new Error('交付文件恢复后完整性状态未恢复。');
  }

  const changedFieldsState = service.saveFields({ developmentPurpose: `${fields.developmentPurpose}（变更验证）` });
  if (changedFieldsState.draftConfirmed || changedFieldsState.confirmedSnapshot) {
    throw new Error('关键字段变更后未使确认状态和快照失效。');
  }
  if (service.listExportBatches().length !== 1) throw new Error('已交付批次被后续草稿变更误删除。');
  service.saveFields({ developmentPurpose: fields.developmentPurpose });
  const reconfirmValidation = service.validateDraft();
  if (!reconfirmValidation.valid) throw new Error('字段恢复后草稿校验未通过。');
  service.confirmDraft();
  const reviewAfterReconfirm = service.getSubmissionReview();
  if (!reviewAfterReconfirm.deliveryChecks.some((item) => item.id === 'delivery-integrity' && item.status === 'pending')) {
    throw new Error('重新确认草稿后未正确提示当前快照需重新导出。');
  }

  const codeAnalysis = analyzeProject(projectDir);
  const scopedCodeStateDir = path.join(getSoftwareCopyrightDir(app), 'code-generation');
  fs.mkdirSync(scopedCodeStateDir, { recursive: true });
  fs.writeFileSync(path.join(scopedCodeStateDir, 'state.json'), JSON.stringify({
    project: { path: projectDir, name: path.basename(projectDir) },
    analysis: codeAnalysis,
    selectedPaths: codeAnalysis.candidates.slice(0, 4).map((item) => item.path),
    sortMode: 'smart',
    scannedAt: new Date().toISOString(),
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, null, 2), 'utf-8');
  if (!codeGenerationService.loadState().confirmed) throw new Error('当前软著项目未读取独立源码准备状态。');

  const initialCases = service.listCases();
  if (initialCases.cases.length !== 1 || !initialCases.activeCaseId) throw new Error('旧单工作区未迁移为软著项目档案。');
  const originalCaseId = initialCases.activeCaseId;
  const duplicated = service.duplicateCase({ id: originalCaseId, name: '复制验证项目' });
  if (duplicated.cases.cases.length !== 2 || duplicated.cases.activeCaseId === originalCaseId) throw new Error('软著项目复制失败。');
  const duplicatedCaseId = duplicated.cases.activeCaseId;
  codeGenerationService.clear();
  service.saveFields({ shortName: '副本专用简称' });
  const switchedOriginal = service.switchCase(originalCaseId);
  if (switchedOriginal.state.fields.shortName === '副本专用简称') throw new Error('软著项目工作区未正确隔离。');
  if (!codeGenerationService.loadState().confirmed) throw new Error('切回原项目后未恢复对应源码准备状态。');
  const switchedDuplicate = service.switchCase(duplicatedCaseId);
  if (switchedDuplicate.state.fields.shortName !== '副本专用简称') throw new Error('软著项目切换后未恢复副本字段。');
  if (codeGenerationService.loadState().confirmed) throw new Error('副本项目的源码准备状态未与原项目隔离。');
  service.renameCase({ id: duplicatedCaseId, name: '已重命名副本' });
  service.setCaseArchived({ id: originalCaseId, archived: true });
  const archivedCases = service.listCases();
  if (!archivedCases.cases.find((item) => item.id === originalCaseId)?.archived) throw new Error('软著项目归档失败。');
  service.setCaseArchived({ id: originalCaseId, archived: false });
  const created = service.createCase({ name: '全新验证项目' });
  if (Object.keys(created.state.drafts || {}).length || created.state.project) throw new Error('新建软著项目不是空白工作区。');
  service.switchCase(duplicatedCaseId);

  console.log('[software-copyright-verify] passed');
  console.log(JSON.stringify({
    draftDir: finalState.draftDir,
    outputDir: finalState.outputDir,
    validationIssueCount: validation.issues.length,
    consistencyCheckCount: validation.consistencyChecks.length,
    applicationVersionCount: service.listDraftVersions('application').length,
    caseCount: service.listCases().cases.length,
    confirmedSnapshotId: confirmedState.confirmedSnapshot.id,
    exportBatchCount: exportBatches.length,
    deliveryZipPath: exportedBatch.zipPath,
    submissionFieldCount: submissionReview.fieldMappings.length,
    submissionGuidePath: generatedGuide.latestGuide.path,
    migratedSchemaVersion: migratedLegacyState.schemaVersion,
    interruptedTaskRecovered: migratedLegacyState.task.status === 'error',
    outputs: finalState.outputs.map((output) => ({
      name: output.name,
      path: output.path,
      size: fs.statSync(output.path).size,
    })),
    inspected,
  }, null, 2));
}

run().catch((error) => {
  console.error('[software-copyright-verify] failed');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
