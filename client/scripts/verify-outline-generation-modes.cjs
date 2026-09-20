const assert = require('node:assert/strict');
const { getBidAnalysisTasks } = require('../electron/services/bidAnalysisTask.cjs');
const { runOutlineGenerationTask, isMissingTechnicalScoreItems } = require('../electron/services/outlineGenerationTask.cjs');
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

async function runCase(scoreContent, payload, responseFileRequirements) {
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
        value = { outline: [{ id: '1', title: '技术方案', description: '服务方案', children: [{ id: '1.1', title: '人员安排', description: '人员安排', children: [{ id: '1.1.1', title: '岗位配置', description: '岗位配置' }] }] }] };
      } else if (options.progressLabel?.includes('子目录')) {
        value = { children: [{ id: '1.1', title: '人员安排', description: '人员安排', children: [{ id: '1.1.1', title: '岗位配置', description: '岗位配置' }] }] };
      } else if (options.progressLabel?.includes('审核')) {
        value = { passed: true, suggestions: [] };
      } else {
        throw new Error(`未预期的模型请求：${options.progressLabel}`);
      }
      const normalized = options.normalizer ? options.normalizer(value) : value;
      options.validator?.(normalized);
      return normalized;
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

  const originalPlan = { ...createPlan('没有提及'), outlineData: { outline: [{ id: '1', title: '已有目录', content: '已有正文' }] } };
  let writes = 0;
  const taskService = createTaskService({
    technicalPlanStore: {
      loadTechnicalPlan: () => originalPlan,
      updateTechnicalPlan: () => { writes += 1; throw new Error('确认前不应修改工作区'); },
    },
  });
  assert.throws(() => taskService.startOutlineGeneration({ mode: 'aligned' }), /请先确认以无技术评分项模式生成目录/);
  assert.equal(writes, 0, '确认前不能清空旧目录或正文');
  assert.equal(originalPlan.outlineData.outline[0].content, '已有正文');

  await assert.rejects(
    runCase('没有提及', { mode: 'aligned' }),
    /请先确认以无技术评分项模式生成目录/,
  );

  const noScore = await runCase('没有提及', { mode: 'aligned', noTechnicalScoreMode: true });
  assert.equal(noScore.plan.outlineData.outline[0].title, '技术方案');
  assert(!noScore.calls.some((call) => call.progressLabel === '技术评分大类'));
  assert(noScore.calls[0].messages.some((message) => message.content.includes('招标文件没有可用的技术评分项')));

  const responseFile = await runCase('实施方案 20 分', { mode: 'response-file' });
  assert(responseFile.calls.some((call) => call.progressLabel === '技术评分大类' && call.messages.some((message) => message.content.includes('响应文件要求中的技术文件组成'))));
  assert.equal(responseFile.plan.outlineData.outline[0].source_requirement_title, '技术方案');
  const fallback = await runCase('实施方案 20 分', { mode: 'response-file' }, '');
  assert(fallback.calls.some((call) => call.progressLabel === '技术评分大类' && call.messages.some((message) => message.content.includes('技术评分要求'))));
  console.log('目录生成模式分流与无技术评分项流程验证通过');
})().catch((error) => { console.error(error); process.exitCode = 1; });
