const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createPatentGenerationService } = require('../electron/services/patentGenerationService.cjs');
const { getPatentGenerationDir } = require('../electron/utils/paths.cjs');

function createMockApp(userDataDir) {
  return {
    getPath(name) {
      if (name === 'userData') return userDataDir;
      if (name === 'documents') return userDataDir;
      return userDataDir;
    },
  };
}

function createMockAiService() {
  return {
    async collectJsonResponse(request = {}) {
      if (request.schemaName === 'PatentTechnicalTopic') {
        return { topic: '投标文件风险项智能检查' };
      }
      if (request.schemaName === 'PatentFactSupplements') {
        return {
          suggestions: [{
            fact: '需确认风险分级阈值的确定方式',
            content: '建议补充：建议结合历史风险样本的严重程度与命中概率设置分级阈值，并由发明人确认具体取值。',
            basis: '依据已有风险分级流程推断，具体参数待确认',
            confidence: 'medium',
          }],
        };
      }
      return {
        summary: '已从项目资料中识别出投标文件检查相关创新点。',
        points: [
          {
            title: '一种投标文件风险项自动检查方法及系统',
            technicalBackground: '投标文件编制后需要人工核对硬性条款、废标项和响应完整性。',
            innovation: '通过结构化条款抽取、响应证据匹配和风险项分级形成闭环检查。',
            difference: '区别于普通关键词检索，能够结合条款上下文和投标响应材料生成风险判断。',
            feasibility: '可基于已有文档解析、条款抽取和规则检查模块实现。',
            recommendedClaims: ['方法', '系统'],
            evidence: [{
              filePath: 'docs/technical-design.md',
              lineStart: 1,
              lineEnd: 3,
              excerpt: '系统解析招标文件硬性条款，抽取废标项，匹配投标文件响应证据。',
              evidenceType: 'implementation',
              confidence: 'high',
            }],
            assumptions: [],
            missingFacts: ['需确认风险分级阈值的确定方式'],
            scores: {
              technicality: 88,
              noveltyPotential: 72,
              inventivenessPotential: 74,
              evidenceStrength: 86,
              feasibility: 91,
              protectionValue: 78,
            },
            score: 91,
          },
        ],
      };
    },
    async chat(request = {}) {
      const title = request.logTitle || request.log_title || '';
      if (title.includes('查新')) {
        return [
          '## 查新资料整理',
          '### 一、现有技术条目',
          '- 资料 A：用于核对投标文件条款，公开来源为用户提供资料。',
          '### 二、与本案的区别点',
          '- 本案强调结构化抽取与风险分级闭环。',
          '### 三、可回写至交底书 1.1 的文字',
          '现有方案多依赖人工核对或简单关键词检索。',
          '### 四、风险与待补充',
          '- 需继续核验公开来源。',
        ].join('\n');
      }
      if (title.includes('修订摘要')) {
        return '已补充实施例，并保持主专利点和流程结构一致。';
      }
      if (title.includes('章节扩写')) {
        const prompt = request.messages?.at(-1)?.content || '';
        const heading = prompt.match(/指定二级标题：(## [^\n]+)/)?.[1] || '## 一、章节';
        return [
          heading,
          '### 9.9 （一）章节要点',
          '#### 9.9.9 处理步骤',
          '##### 9.9.9.9 实现方式',
          '###### 9.9.9.9.9 可选方案',
          '1. 第一项执行步骤',
          '2. 第二项执行步骤',
          '本章节基于项目证据详细说明技术实现、处理关系与技术效果。'.repeat(78),
        ].join('\n\n');
      }
      if (title.includes('技术图补充')) {
        return [
          '#### 系统框图',
          '```mermaid',
          'flowchart TD',
          'A[导入文档] --> B[风险检查]',
          '```',
          '#### 执行时序图',
          '```mermaid',
          'sequenceDiagram',
          'participant U as 用户',
          'participant S as 检查服务',
          'U->>S: 提交文档',
          'S-->>U: 返回检查结果',
          '```',
        ].join('\n');
      }
      if (title.includes('质量修订')) {
        return [
          '# 技术交底书',
          '**案件名称**：一种投标文件风险项自动检查方法及系统',
          '**技术联系人**：待填写',
          '**专利类型**：发明',
          '**联系电话**：待填写',
          '**联系邮箱**：待填写',
          '## 一、相关技术背景',
          '现有技术说明。',
          '## 二、针对上述缺点，说明本发明所要解决的技术问题',
          '技术问题说明。',
          '## 三、本发明技术方案的详细阐述',
          '```mermaid\nflowchart LR\nA[导入文档] --> B[风险检查]\n```',
          '## 四、与现有技术相比，本发明具有哪些优点？',
          '技术效果说明。',
          '## 五、本发明的技术关键点和欲保护点是什么？',
          '保护点说明。',
          '## 六、其它（实施例、技术效果、参数示例）',
          '具体实施例说明。',
        ].join('\n');
      }
      if (title.includes('修订')) {
        return [
          '# 技术交底书',
          '**案件名称**：一种投标文件风险项自动检查方法及系统',
          '## 一、相关技术背景',
          '补充修订后的现有技术说明。',
          '## 六、其它（实施例、技术效果、参数示例）',
          '新增实施例：系统导入招标文件和投标文件后生成风险项清单。',
        ].join('\n');
      }
      return [
        '# 技术交底书',
        '**案件名称**：一种投标文件风险项自动检查方法及系统',
        '**技术联系人**：待填写',
        '**专利类型**：发明',
        '## 注意事项',
        '交底书应使代理人能看懂。',
        '## 一、相关技术背景',
        '待补充查新资料。',
        '## 三、本发明技术方案的详细阐述',
        '```mermaid',
        'flowchart LR',
        'A[导入文档] --> B[风险检查]',
        '```',
      ].join('\n');
    },
  };
}

function createControllableAiService() {
  return {
    collectJsonResponse(request = {}) {
      return new Promise((_resolve, reject) => {
        if (request.signal?.aborted) {
          reject(new Error('专利挖掘请求已中断'));
          return;
        }
        request.signal?.addEventListener('abort', () => reject(new Error('专利挖掘请求已中断')), { once: true });
      });
    },
  };
}

function writeFixtureProject(projectDir) {
  fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'src', 'services'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'docs', 'technical-design.md'), [
    '# 投标文件风险检查设计',
    '系统解析招标文件硬性条款，抽取废标项，匹配投标文件响应证据。',
    '检查结果按风险等级输出，并支持定位原文。',
  ].join('\n'), 'utf-8');
  fs.writeFileSync(path.join(projectDir, 'src', 'services', 'riskCheck.ts'), [
    'export function checkRiskItems(tenderItems, bidEvidence) {',
    '  return tenderItems.map((item) => ({ item, matched: Boolean(bidEvidence[item.id]) }));',
    '}',
  ].join('\n'), 'utf-8');
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-patent-smoke-'));
  const userDataDir = path.join(tempRoot, 'userData');
  const projectDir = path.join(tempRoot, 'fixture-project');
  writeFixtureProject(projectDir);
  const report = [];

  const app = createMockApp(userDataDir);
  const service = createPatentGenerationService({ app, aiService: createMockAiService() });
  const rootDir = getPatentGenerationDir(app);
  service.createProject({ name: '风险检查专利项目' });
  const statePath = path.join(rootDir, 'projects', service.listProjects().activeProjectId, 'state.json');

  let state = service.loadState();
  state = service.saveCaseInfo({
    caseName: '一种投标文件风险项自动检查方法及系统',
    topic: '投标文件风险项自动检查',
    patentType: 'method',
    contact: { name: '张三', phone: '13800000000', email: 'test@example.com' },
  });
  assert.equal(state.caseInfo.caseName, '一种投标文件风险项自动检查方法及系统');
  assert.equal(state.caseInfo.applicationType, 'invention');
  assert.deepEqual(state.caseInfo.claimForms, ['method']);
  report.push(`案件信息：${state.caseInfo.caseName}`);

  fs.writeFileSync(statePath, JSON.stringify({
    ...state,
    project: { path: projectDir, name: path.basename(projectDir) },
  }, null, 2), 'utf-8');

  state = await service.startMining();
  assert.equal(state.miningResult.length, 1);
  assert.equal(state.task.status, 'success');
  assert.match(state.scanSummary, /纳入分析文件/);
  assert.ok(Array.isArray(state.miningResult[0].qualityWarnings));
  assert.equal(state.miningResult[0].evidence.length, 1);
  assert.equal(state.miningResult[0].missingFacts.length, 1);
  assert.equal(state.miningResult[0].scores.evidenceStrength, 86);
  report.push(`专利挖掘：${state.miningResult.length} 个候选点，主候选为“${state.miningResult[0].title}”`);
  report.push(`扫描摘要：${state.scanSummary.replace(/\n/g, '；')}`);

  state = service.selectPatentPoint(state.miningResult[0].id);
  assert.equal(state.selectedPatentPointId, state.miningResult[0].id);
  report.push(`主专利点：${state.miningResult[0].title}`);

  state = service.saveCaseInfo({ topic: '' });
  state = await service.generateTechnicalTopic();
  assert.equal(state.caseInfo.topic, '投标文件风险项智能检查');
  report.push(`技术主题：${state.caseInfo.topic}`);

  state = await service.generateFactSupplements(state.miningResult[0].id);
  assert.match(state.miningResult[0].factSupplements[0].content, /历史风险样本/);
  assert.doesNotMatch(state.miningResult[0].factSupplements[0].content, /^建议补充[：:]/);
  state = service.saveFactSupplements({
    pointId: state.miningResult[0].id,
    supplements: [{
      ...state.miningResult[0].factSupplements[0],
      content: '补充建议：风险等级由命中规则等级和人工确认结果共同确定。',
    }],
  });
  assert.equal(state.miningResult[0].factSupplements[0].source, 'manual');
  assert.match(state.miningResult[0].factSupplements[0].content, /人工确认结果/);
  assert.doesNotMatch(state.miningResult[0].factSupplements[0].content, /^补充建议[：:]/);
  assert.equal(state.miningResult[0].missingFacts.length, 0);
  const legacySavedState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  legacySavedState.miningResult[0].missingFacts = ['需确认 风险分级阈值的确定方式。'];
  fs.writeFileSync(statePath, JSON.stringify(legacySavedState, null, 2), 'utf-8');
  state = service.loadState();
  assert.equal(state.miningResult[0].missingFacts.length, 0);
  assert.equal(
    JSON.parse(fs.readFileSync(statePath, 'utf-8')).miningResult[0].missingFacts.length,
    0,
    '旧状态中的已确认事实应在加载时完成迁移并持久化清理',
  );
  state = service.saveFactSupplements({
    pointId: state.miningResult[0].id,
    supplements: [{
      ...state.miningResult[0].factSupplements[0],
      content: '风险等级由规则等级、人工复核结论和最新项目资料共同确定。',
    }],
  });
  assert.match(state.miningResult[0].factSupplements[0].content, /最新项目资料/);
  assert.equal(state.miningResult[0].missingFacts.length, 0);
  report.push('待补事实：AI 建议生成、人工修改、确认后再次编辑均已验证');

  state = await service.generatePriorArtAnalysis({ sourceText: '资料 A：一种用于投标文件条款核对的公开方案。' });
  assert.match(state.priorArtMarkdown, /查新资料整理/);
  report.push('查新分析：已生成现有技术整理 Markdown');

  state = await service.generateDisclosureDraft();
  assert.equal(state.disclosureDrafts.length, 1);
  const draft = service.readDisclosureDraft(state.activeDraftId);
  assert.match(draft.content, /# 技术交底书/);
  assert.match(draft.content, /mermaid/);
  assert.equal((draft.content.match(/```mermaid/g) || []).length >= 2, true);
  assert.match(draft.content, /sequenceDiagram/);
  assert.doesNotMatch(draft.content, /^## 注意事项/m);
  assert.doesNotMatch(draft.content, /待补充查新资料/);
  assert.match(draft.content, /^## 一、相关技术背景$/m);
  assert.match(draft.content, /\*\*案件名称\*\*[^\n]*\n\n\*\*技术联系人\*\*/);
  const disclosureChineseCharacters = (draft.content.match(/[\u3400-\u9fff]/g) || []).length;
  assert.ok(disclosureChineseCharacters >= 12_000 && disclosureChineseCharacters <= 15_000);
  assert.match(draft.content, /^### 1、/m);
  assert.doesNotMatch(draft.content, /^###\s+\d+、\s*[（(][一二三四五六七八九十]+[）)]/m);
  assert.match(draft.content, /^#### （1）/m);
  assert.match(draft.content, /^##### 1）/m);
  assert.match(draft.content, /^###### （a）/m);
  assert.match(draft.content, /^（a）第一项执行步骤/m);
  assert.match(draft.content, /^（b）第二项执行步骤/m);
  report.push(`交底书生成：已生成 ${state.disclosureDrafts.length} 份 Markdown 草稿`);

  const saved = service.saveDisclosureDraft({ id: draft.id, content: `${draft.content}\n\n补充编辑。` });
  assert.equal(saved.activeDraftId, draft.id);
  report.push('草稿编辑：保存成功');

  const revision = await service.generateRevision({
    kind: 'merge',
    instruction: '补充一个导入招标文件和投标文件后生成风险项清单的实施例。',
  });
  assert.equal(revision.state.revisionLogs.length, 1);
  assert.match(revision.draft.content, /新增实施例/);
  report.push(`修订迭代：已生成新版本，修订记录 ${revision.state.revisionLogs.length} 条`);

  const cleared = service.clear();
  assert.equal(cleared.success, true);
  assert.equal(cleared.state.miningResult.length, 0);
  report.push('清理验证：状态已重置');

  const controlApp = createMockApp(path.join(tempRoot, 'control-userData'));
  const controlService = createPatentGenerationService({ app: controlApp, aiService: createControllableAiService() });
  controlService.createProject({ name: '任务控制测试' });
  const controlStatePath = path.join(getPatentGenerationDir(controlApp), 'projects', controlService.listProjects().activeProjectId, 'state.json');
  const controlState = controlService.loadState();
  fs.writeFileSync(controlStatePath, JSON.stringify({
    ...controlState,
    project: { path: projectDir, name: path.basename(projectDir) },
  }, null, 2), 'utf-8');

  const pausingRun = controlService.startMining();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controlService.pauseMining().task.status, 'pausing');
  assert.equal((await pausingRun).task.status, 'paused');

  const stoppingRun = controlService.startMining({ resume: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controlService.stopMining().task.status, 'stopping');
  assert.equal((await stoppingRun).task.status, 'stopped');
  report.push('任务控制：暂停、继续发起和停止均已验证');

  const repairApp = createMockApp(path.join(tempRoot, 'repair-userData'));
  let repairCalls = 0;
  const repairService = createPatentGenerationService({
    app: repairApp,
    aiService: {
      async collectJsonResponse() {
        repairCalls += 1;
        if (repairCalls === 1) return { message: '候选结果字段不完整' };
        return {
          patentPoints: [{
            title: '一种投标文件风险分级处理方法',
            coreInnovation: '通过条款抽取、证据匹配和风险级别映射形成可回查的分级处理流程。',
            background: '现有人工核查方式难以稳定定位风险来源。',
            distinction: '区别于关键词检索，结合响应证据和规则等级输出结果。',
            implementation: '基于已有解析与规则检查模块实现。',
            recommendedClaims: ['方法'],
          }],
        };
      },
    },
  });
  repairService.createProject({ name: '模型修复测试' });
  const repairStatePath = path.join(getPatentGenerationDir(repairApp), 'projects', repairService.listProjects().activeProjectId, 'state.json');
  fs.mkdirSync(path.dirname(repairStatePath), { recursive: true });
  fs.writeFileSync(repairStatePath, JSON.stringify({
    ...repairService.loadState(),
    project: { path: projectDir, name: path.basename(projectDir) },
  }, null, 2), 'utf-8');
  const repairedState = await repairService.startMining();
  assert.equal(repairCalls, 2);
  assert.equal(repairedState.miningResult.length, 1);
  assert.match(repairedState.miningResult[0].innovation, /条款抽取/);
  report.push('异常模型结果：已验证字段兼容和自动纠正重试');

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(report.map((line) => `- ${line}`).join('\n'));
  console.log('Patent generation smoke verification passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
