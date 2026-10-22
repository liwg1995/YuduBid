const assert = require('node:assert/strict');
const { getBidAnalysisTasks } = require('../electron/services/bidAnalysisTask.cjs');
const { runOutlineGenerationTask, isMissingTechnicalScoreItems, hasResponseFileOutline } = require('../electron/services/outlineGenerationTask.cjs');
const { createTaskService } = require('../electron/services/taskService.cjs');

function createPlan(scoreContent) {
  return {
    projectOverview: '物业管理服务项目',
    techRequirements: scoreContent,
    responseFileRequirements: '技术方案、人员配置、服务保障',
    bidAnalysisTasks: Object.fromEntries(getBidAnalysisTasks('key').map((task) => [task.id, {
      status: 'success',
      content: task.id === 'techRequirements' ? scoreContent : '已解析',
    }])),
  };
}

async function runCase(scoreContent, payload, responseFileRequirements, behavior = {}) {
  let plan = createPlan(scoreContent);
  if (responseFileRequirements !== undefined) plan.responseFileRequirements = responseFileRequirements;
  const calls = [];
  const aiService = {
    async collectJsonResponse(options) {
      calls.push(options);
      let value;
      if (options.progressLabel === '技术评分大类') {
        value = { groups: [{ requirement_id: 'R1', title: '技术方案', description: '服务方案', detail_points: ['人员安排'] }] };
      } else if (options.progressLabel === '完整目录') {
        if (behavior.failFull) throw new Error('模型返回的目录数据格式无效');
        value = behavior.shallowChapter
          ? { outline: [
            { id: '1', title: '技术方案', children: [{ id: '1.1', title: '人员安排' }] },
            { id: '2', title: '实施方案', children: [{ id: '2.1', title: '部署实施', children: [{ id: '2.1.1', title: '验证步骤' }] }] },
          ] }
          : behavior.missingMetadata
          ? { outline: [{ title: '技术方案', children: [{ title: '人员安排', children: [{ title: '岗位配置' }] }] }] }
          : { outline: [{ id: '1', title: '技术方案', description: '服务方案', children: [{ id: '1.1', title: '人员安排', description: '人员安排', children: [{ id: '1.1.1', title: '岗位配置', description: '岗位配置' }] }] }] };
      } else if (options.progressLabel === '一级目录') {
        value = { outline: [{ title: '技术方案' }] };
      } else if (options.progressLabel?.includes('子目录')) {
        value = behavior.shallowChildren
          ? { children: [{ id: '1.1', title: '人员安排', description: '人员安排' }] }
          : { children: [{ id: '1.1', title: '人员安排', description: '人员安排', children: [{ id: '1.1.1', title: '岗位配置', description: '岗位配置' }] }] };
      } else if (options.progressLabel?.includes('审核')) {
        value = { passed: true, suggestions: [] };
      } else {
        throw new Error(`未预期的模型请求：${options.progressLabel}`);
      }
      try {
        const normalized = options.normalizer ? options.normalizer(value) : value;
        options.validator?.(normalized);
        return normalized;
      } catch (error) {
        if (!behavior.shallowChapter && !behavior.shallowChildren) throw error;
        throw new Error(options.failureMessage || error.message);
      }
    },
  };
  const workspaceStore = {
    loadTechnicalPlan: () => plan,
    updateTechnicalPlan: (patch) => { plan = { ...plan, ...patch }; return plan; },
  };
  await runOutlineGenerationTask({ aiService, workspaceStore, updateTask: (state) => state, payload });
  return { calls, plan };
}

(async () => {
  assert(isMissingTechnicalScoreItems('技术评分项：没有提及'));
  assert(!isMissingTechnicalScoreItems('技术评分项：实施方案 20 分'));
  assert(hasResponseFileOutline('技术方案、人员配置、服务保障'));
  assert(!hasResponseFileOutline('原文未明确技术文件目录'));

  const originalPlan = { ...createPlan('没有提及'), outlineData: { outline: [{ id: '1', title: '已有目录', content: '已有正文' }] } };
  let writes = 0;
  const taskService = createTaskService({
    technicalPlanStore: {
      loadTechnicalPlan: () => originalPlan,
      updateTechnicalPlan: () => { writes += 1; throw new Error('无效方式不应修改工作区'); },
    },
  });
  assert.throws(() => taskService.startOutlineGeneration({ mode: 'aligned' }), /没有技术评分项，无法按评分项对齐/);
  assert.equal(writes, 0, '无效方式不能清空旧目录或正文');
  assert.equal(originalPlan.outlineData.outline[0].content, '已有正文');

  await assert.rejects(
    runCase('没有提及', { mode: 'aligned' }),
    /没有技术评分项，无法按评分项对齐/,
  );

  const noScore = await runCase('没有提及', { mode: 'free' });
  assert.equal(noScore.plan.outlineData.outline[0].title, '技术方案');
  assert(!noScore.calls.some((call) => call.progressLabel === '技术评分大类'));
  assert(noScore.calls[0].messages.some((message) => message.content.includes('招标文件没有可用的技术评分项')));
  const noScoreResponseFile = await runCase('没有提及', { mode: 'response-file' });
  assert(noScoreResponseFile.calls.some((call) => call.progressLabel === '技术评分大类' && call.messages.some((message) => message.content.includes('响应文件要求中的技术文件组成'))));
  assert(!noScoreResponseFile.calls.some((call) => call.progressLabel === '完整目录'));
  assert.equal(noScoreResponseFile.plan.outlineMode, 'response-file');
  await assert.rejects(runCase('没有提及', { mode: 'response-file' }, '原文未明确技术文件目录'), /未找到明确的响应文件技术目录/);

  const responseFile = await runCase('实施方案 20 分', { mode: 'response-file' });
  assert(responseFile.calls.some((call) => call.progressLabel === '技术评分大类' && call.messages.some((message) => message.content.includes('响应文件要求中的技术文件组成'))));
  assert.equal(responseFile.plan.outlineData.outline[0].source_requirement_title, '技术方案');
  const fallback = await runCase('实施方案 20 分', { mode: 'response-file' }, '');
  assert(fallback.calls.some((call) => call.progressLabel === '技术评分大类' && call.messages.some((message) => message.content.includes('技术评分要求'))));
  const sparseFree = await runCase('1. 支持身份认证；2. 支持操作审计', { mode: 'free' });
  assert.equal(sparseFree.calls.filter((call) => call.progressLabel === '完整目录').length, 2, '自由目录只有一个一级章时应检查能否合理分章');
  assert(sparseFree.calls[0].messages.some((message) => message.content.includes('不要求一级目录与评分项一一对应')));
  assert(sparseFree.calls.some((call) => call.messages.some((message) => message.content.includes('只有一个一级目录'))));
  const locallyRepaired = await runCase('实施方案 20 分', { mode: 'free' }, undefined, { missingMetadata: true });
  assert.equal(locallyRepaired.plan.outlineData.outline[0].id, '1');
  assert.equal(locallyRepaired.plan.outlineData.outline[0].description, '技术方案');
  assert.equal(locallyRepaired.plan.outlineData.outline[0].children[0].children[0].id, '1.1.1');
  const earlyFallback = await runCase('实施方案 20 分', { mode: 'free' }, undefined, { failFull: true });
  assert.equal(earlyFallback.calls.filter((call) => call.progressLabel === '完整目录').length, 1);
  assert.equal(earlyFallback.calls.find((call) => call.progressLabel === '完整目录').max_retries, 0);
  assert(earlyFallback.calls.some((call) => call.progressLabel === '一级目录'));
  const incompleteFull = await runCase('实施方案 20 分', { mode: 'free' }, undefined, { shallowChapter: true });
  assert(incompleteFull.calls.some((call) => call.progressLabel === '一级目录'), '某个一级章仅有二级目录时应分步重生成');
  assert.equal(incompleteFull.plan.outlineData.outline[0].children[0].children.length, 1);
  await assert.rejects(
    runCase('实施方案 20 分', { mode: 'aligned' }, undefined, { shallowChildren: true }),
    /模型返回的目录数据格式无效/,
    '分步生成时不能把缺少三级目录的章节保存为成功',
  );
  console.log('目录生成模式分流与无技术评分项流程验证通过');
})().catch((error) => { console.error(error); process.exitCode = 1; });
