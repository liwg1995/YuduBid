const assert = require('node:assert/strict');
const { runOutlineGenerationTask } = require('../electron/services/outlineGenerationTask.cjs');
const { getBidAnalysisTasks } = require('../electron/services/bidAnalysisTask.cjs');

async function verify(mode, noScore = false, revise = false) {
  let state = { projectOverview: '项目概述', techRequirements: noScore ? '没有提及' : '技术要求：系统部署与实施', bidAnalysisTasks: Object.fromEntries(getBidAnalysisTasks('key').map(task => [task.id, { status: 'success', content: task.id === 'techRequirements' && noScore ? '没有提及' : '已提取内容' }])) };
  let rootQuestions = 0;
  let childCalls = 0;
  let reviewCalls = 0;
  const questions = [];
  const roots = [{ id: '1', title: '系统部署', description: '部署方案' }, { id: '2', title: '实施验证', description: '验证方案' }];
  await runOutlineGenerationTask({
    payload: { mode },
    workspaceStore: { loadTechnicalPlan: () => state, updateTechnicalPlan: patch => (state = { ...state, ...patch }) },
    updateTask: patch => patch,
    taskControl: { checkpoint: async () => {}, ask: async question => {
      questions.push(question);
      if (question.items) { rootQuestions++; return { items: question.items.slice(1), instructions: '必须保留三级目录' }; }
      return { action: question.allowRevise && revise ? 'revise' : 'continue', instructions: '' };
    } },
    aiService: { collectJsonResponse: async options => {
      let raw;
      if (options.progressLabel === '一级目录') raw = { outline: roots };
      else if (options.progressLabel === '技术评分大类') raw = { groups: roots.map((item, index) => ({ ...item, requirement_id: `R${index + 1}` })) };
      else if (options.progressLabel.includes('子目录')) {
        childCalls++;
        raw = { children: [{ id: '2.1', title: '验证流程', description: '实施验证', children: [{ id: '2.1.1', title: '验证步骤', description: '执行检查' }] }] };
        assert(options.messages.some(message => message.content.includes('必须保留三级目录')));
      } else {
        reviewCalls++;
        if (mode === 'aligned') {
          const selectedGroupMessage = options.messages.find(message => message.content.includes('技术评分大类 JSON：'));
          assert(selectedGroupMessage, '评分项对齐审核应提供已选大类');
          assert(selectedGroupMessage.content.includes('"requirement_id":"R2"'));
          assert(!selectedGroupMessage.content.includes('"requirement_id":"R1"'), '未选大类不应作为审核缺项');
          assert(options.messages[0].content.includes('未选大类不视为目录遗漏'));
        }
        raw = { passed: !revise || reviewCalls > 1, suggestions: ['细化验证步骤'] };
      }
      const value = options.normalizer ? options.normalizer(raw) : raw;
      options.validator?.(value);
      return value;
    } },
  });
  assert.equal(rootQuestions, 1);
  assert.equal(state.outlineData.outline.length, 1);
  assert.equal(state.outlineData.outline[0].title, '实施验证');
  assert.equal(state.outlineData.outline[0].children[0].children.length, 1);
  assert.equal(childCalls, revise ? 2 : 1);
  assert.equal(questions.some(question => question.id.startsWith('input-')), noScore);
  assert.equal(state.outlineGenerationTask.status, 'success');
}
(async () => {
  await verify('free');
  await verify('aligned');
  await verify('free', true);
  await verify('free', false, true);
  await verify('aligned', false, true);
  console.log('目录确认验证通过：自由/对齐模式、缺失资料、审核修正、补充要求、三级目录和选择保留。');
})().catch(error => { console.error(error); process.exitCode = 1; });
