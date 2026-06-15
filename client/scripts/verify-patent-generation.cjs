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
    async collectJsonResponse() {
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
      if (title.includes('修订')) {
        return [
          '# 技术交底书',
          '**案件名称**：一种投标文件风险项自动检查方法及系统',
          '## 一、介绍相关技术背景，描述与本发明技术最相近的现有技术，并说明该现有技术存在的缺点',
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
        '## 一、介绍相关技术背景，描述与本发明技术最相近的现有技术，并说明该现有技术存在的缺点',
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
  const statePath = path.join(rootDir, 'state.json');

  let state = service.loadState();
  state = service.saveCaseInfo({
    caseName: '一种投标文件风险项自动检查方法及系统',
    topic: '投标文件风险项自动检查',
    patentType: 'method',
    contact: { name: '张三', phone: '13800000000', email: 'test@example.com' },
  });
  assert.equal(state.caseInfo.caseName, '一种投标文件风险项自动检查方法及系统');
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
  report.push(`专利挖掘：${state.miningResult.length} 个候选点，主候选为“${state.miningResult[0].title}”`);
  report.push(`扫描摘要：${state.scanSummary.replace(/\n/g, '；')}`);

  state = service.selectPatentPoint(state.miningResult[0].id);
  assert.equal(state.selectedPatentPointId, state.miningResult[0].id);
  report.push(`主专利点：${state.miningResult[0].title}`);

  state = await service.generatePriorArtAnalysis({ sourceText: '资料 A：一种用于投标文件条款核对的公开方案。' });
  assert.match(state.priorArtMarkdown, /查新资料整理/);
  report.push('查新分析：已生成现有技术整理 Markdown');

  state = await service.generateDisclosureDraft();
  assert.equal(state.disclosureDrafts.length, 1);
  const draft = service.readDisclosureDraft(state.activeDraftId);
  assert.match(draft.content, /# 技术交底书/);
  assert.match(draft.content, /mermaid/);
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

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(report.map((line) => `- ${line}`).join('\n'));
  console.log('Patent generation smoke verification passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
