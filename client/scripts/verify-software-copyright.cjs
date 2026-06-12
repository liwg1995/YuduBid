const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSoftwareCopyrightService } = require('../electron/services/softwareCopyrightService.cjs');
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

function createMockAiService(fields) {
  return {
    getImageModelAvailability() {
      return { available: false, status: 'verify-disabled', message: '软著验证脚本未启用生图模型' };
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
  };
}

function createVerifyFields() {
  return {
    softwareName: '禹都AI投标助手软件',
    shortName: '禹都AI投标助手',
    version: 'V1.0',
    category: '应用软件',
    developmentCompletedDate: '2026-06-08',
    developmentMode: '单独开发',
    softwareDescription: '原创',
    publishStatus: '未发表',
    firstPublishDate: '',
    copyrightOwner: '中国/河南省/企业/禹都科技有限公司/统一社会信用代码待补充',
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
  const projectDir = path.resolve(process.env.SOFTWARE_COPYRIGHT_VERIFY_PROJECT || path.join(process.cwd(), 'src'));
  if (!fs.existsSync(projectDir)) {
    throw new Error(`验证项目不存在：${projectDir}`);
  }

  const { app, userData } = createTempApp();
  const fields = createVerifyFields();
  writeInitialState(app, projectDir, fields);

  const service = createSoftwareCopyrightService({
    app,
    aiService: createMockAiService(fields),
    configStore: {},
    codeGenerationService: null,
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

  const validation = service.validateDraft();
  if (!validation.valid) {
    throw new Error(`草稿检查未通过：${validation.issues.map((issue) => issue.message).join('；')}`);
  }

  const confirmedState = service.confirmDraft();
  if (!confirmedState.draftConfirmed) {
    throw new Error('草稿确认状态未写入。');
  }

  service.exportFinal();
  const finalState = await waitForTask(service, 'software-copyright-final-export');
  if (finalState.task.status !== 'success') {
    throw new Error(finalState.task.error || '正式资料导出失败');
  }

  assertOutputFiles(finalState.outputs);
  const inspected = inspectOutputs(finalState);

  console.log('[software-copyright-verify] passed');
  console.log(JSON.stringify({
    draftDir: finalState.draftDir,
    outputDir: finalState.outputDir,
    validationIssueCount: validation.issues.length,
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
