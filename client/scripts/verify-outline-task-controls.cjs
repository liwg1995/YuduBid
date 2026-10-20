const assert = require('node:assert/strict');
const { getBidAnalysisTasks } = require('../electron/services/bidAnalysisTask.cjs');
const { createTaskService } = require('../electron/services/taskService.cjs');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitUntil(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`等待超时：${label}`);
}

const outline = { outline: [
  { id: '1', title: '总体方案', description: '总体方案', children: [{ id: '1.1', title: '架构', description: '架构', children: [{ id: '1.1.1', title: '模块', description: '模块' }] }] },
  { id: '2', title: '实施方案', description: '实施方案', children: [{ id: '2.1', title: '部署', description: '部署', children: [{ id: '2.1.1', title: '验证', description: '验证' }] }] },
] };
const initialPlan = {
  workflowKind: 'technical-plan',
  projectId: 'default',
  projectOverview: '服务项目',
  techRequirements: '实施方案 20 分',
  bidAnalysisTasks: Object.fromEntries(getBidAnalysisTasks('key').map((item) => [item.id, { status: 'success', content: '实施方案 20 分' }])),
};
let plan = { ...initialPlan };
let cleared = false;
let writesAfterClear = 0;
const store = {
  loadTechnicalPlan: () => plan,
  updateTechnicalPlan(patch) {
    if (cleared) writesAfterClear += 1;
    plan = { ...plan, ...patch };
    return plan;
  },
  forWorkflow() { return this; },
  listProjects: () => ({ projects: [{ id: 'default' }] }),
  clearTechnicalPlan() {
    cleared = true;
    plan = { workflowKind: 'technical-plan', projectId: 'default' };
    return { state: plan };
  },
};
let activeGate = deferred();
let modelStarted = deferred();
let requestCount = 0;
const aiService = {
  async collectJsonResponse(options) {
    requestCount += 1;
    if (options.progressLabel === '完整目录') {
      modelStarted.resolve();
      return Promise.race([
        activeGate.promise.then(() => outline),
        new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('AI 请求已取消')), { once: true })),
      ]).then((value) => {
        const normalized = options.normalizer(value);
        options.validator(normalized);
        return normalized;
      });
    }
    if (options.progressLabel?.includes('审核')) return { passed: true, suggestions: [] };
    throw new Error(`意外的目录请求：${options.progressLabel}`);
  },
};
const taskService = createTaskService({ aiService, technicalPlanStore: store });
const target = { workflowKind: 'technical-plan', projectId: 'default', mode: 'free' };

(async () => {
  taskService.startOutlineGeneration(target);
  await modelStarted.promise;
  assert.equal(taskService.pauseOutlineGeneration(target).status, 'pausing');
  activeGate.resolve();
  await waitUntil(() => plan.outlineGenerationTask?.status === 'paused', '目录暂停');
  const callsWhilePaused = requestCount;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requestCount, callsWhilePaused, '暂停期间不能继续审核');
  assert.equal(taskService.resumeOutlineGeneration(target).status, 'running');
  await waitUntil(() => plan.outlineGenerationTask?.status === 'success', '目录继续完成');
  assert.equal(plan.outlineData.outline.length, 2);

  activeGate = deferred();
  modelStarted = deferred();
  taskService.startOutlineGeneration(target);
  await modelStarted.promise;
  await taskService.prepareTechnicalPlanReset(target);
  assert.equal(plan.outlineGenerationTask.status, 'stopped');
  store.clearTechnicalPlan();
  activeGate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(writesAfterClear, 0, '重置后旧任务不能写回');
  assert.equal(plan.outlineData, undefined);
  assert.equal(taskService.peekActiveTasks().length, 0);
  console.log('目录暂停、继续、停止及重置等待验证通过');
})().catch((error) => { console.error(error); process.exitCode = 1; });
