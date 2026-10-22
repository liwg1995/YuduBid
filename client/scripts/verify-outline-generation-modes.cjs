const assert = require('node:assert/strict');
const { getBidAnalysisTasks } = require('../electron/services/bidAnalysisTask.cjs');
const { runOutlineGenerationTask, isMissingTechnicalScoreItems, hasResponseFileOutline, getOutlineGenerationBlockReason } = require('../electron/services/outlineGenerationTask.cjs');
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
    readTenderMarkdownForGeneration: () => '系统支持身份认证和操作审计',
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
  assert.throws(() => taskService.startOutlineGeneration({ mode: 'aligned' }), /无法按评分项对齐/);
  assert.throws(() => taskService.startOutlineGeneration({ mode: 'response-file', responseFileRequirements: '原文未明确技术文件目录' }), /无法按响应文件目录生成/);
  assert.equal(writes, 0, '无效方式不能清空旧目录或正文');
  assert.equal(originalPlan.outlineData.outline[0].content, '已有正文');

  await assert.rejects(
    runCase('没有提及', { mode: 'aligned' }),
    /无法按评分项对齐/,
  );

  for (const content of ['没有提及', '未发现技术评分标准，本文件仅包含技术要求。', '1. 支持身份认证；2. 支持操作审计', '系统可用率99.9%，响应时间5分钟', '【评分项名称】：未提及\n【权重/分值】：未提供\n【评分标准】：未提供']) {
    assert(isMissingTechnicalScoreItems(content));
    await assert.rejects(runCase(content, { mode: 'aligned' }), /无法按评分项对齐/);
    assert.throws(() => taskService.startOutlineGeneration({ mode: 'aligned' }), /无法按评分项对齐/);
    assert.equal(getOutlineGenerationBlockReason('free', content, ''), '');
    const free = await runCase(content, { mode: 'free' });
    assert(free.plan.outlineData.outline.length > 0);
    assert(!free.calls.some(call => call.progressLabel === '技术评分大类'));
    assert(free.calls.some(call => call.messages.some(message => message.content.includes('系统支持身份认证和操作审计'))));
    const response = await runCase(content, { mode: 'response-file' });
    assert(response.plan.outlineData.outline.length > 0, '有响应目录时不需要评分项');
    await assert.rejects(runCase(content, { mode: 'response-file' }, '原文未明确技术文件目录'), /无法按响应文件目录生成/);
  }
  assert(!isMissingTechnicalScoreItems('技术评分权重：30%'));
  assert(!isMissingTechnicalScoreItems('评分标准：优秀、良好、一般，分档评价'));
  assert(getOutlineGenerationBlockReason('response-file', '实施方案20分', ''), '有评分不能替代响应文件目录');

  const responseFile = await runCase('实施方案 20 分', { mode: 'response-file' });
  assert(responseFile.calls.some((call) => call.progressLabel === '技术评分大类' && call.messages.some((message) => message.content.includes('响应文件要求中的技术文件组成'))));
  assert.equal(responseFile.plan.outlineData.outline[0].source_requirement_title, '技术方案');
  await assert.rejects(runCase('实施方案 20 分', { mode: 'response-file' }, ''), /无法按响应文件目录生成/);
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
