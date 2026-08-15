const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProjectManagementService } = require('../electron/services/projectManagementService.cjs');
const { createProjectManagementStore } = require('../electron/services/projectManagementStore.cjs');
const {
  normalizeProfile,
  normalizeState,
  normalizeTask,
  recoverInterruptedTask,
} = require('../electron/services/projectManagementState.cjs');
const { getProjectManagementDir } = require('../electron/utils/paths.cjs');

const modules = [
  {
    id: 'planning',
    saveInput: 'savePlanningInput',
    generate: 'generatePlanning',
    inputKey: 'planningInput',
    resultKey: 'planningResult',
    input: { background: '建设统一项目管理平台', objectives: '提升交付透明度' },
  },
  {
    id: 'discovery',
    saveInput: 'saveDiscoveryInput',
    generate: 'generateDiscovery',
    inputKey: 'discoveryInput',
    resultKey: 'discoveryResult',
    input: { interviewNotes: '客户要求统一任务入口', userRoles: '项目经理、交付经理' },
  },
  {
    id: 'execution',
    saveInput: 'saveExecutionInput',
    generate: 'generateExecution',
    inputKey: 'executionInput',
    resultKey: 'executionResult',
    input: { workstreams: '产品、研发、测试', milestones: '需求确认、试运行、验收' },
  },
  {
    id: 'risk',
    saveInput: 'saveRiskInput',
    generate: 'generateRisk',
    inputKey: 'riskInput',
    resultKey: 'riskResult',
    input: { riskSignals: '关键接口联调延迟', currentIssues: '测试环境尚未就绪' },
  },
  {
    id: 'stakeholder',
    saveInput: 'saveStakeholderInput',
    generate: 'generateStakeholder',
    inputKey: 'stakeholderInput',
    resultKey: 'stakeholderResult',
    input: { stakeholders: '客户负责人、项目经理', decisionsNeeded: '确认验收窗口' },
  },
  {
    id: 'delivery',
    saveInput: 'saveDeliveryInput',
    generate: 'generateDelivery',
    inputKey: 'deliveryInput',
    resultKey: 'deliveryResult',
    input: { testStatus: '核心流程测试完成', acceptanceCriteria: '关键用例全部通过' },
  },
  {
    id: 'reporting',
    saveInput: 'saveReportingInput',
    generate: 'generateReporting',
    inputKey: 'reportingInput',
    resultKey: 'reportingResult',
    input: { reportPeriod: '本周', completedWork: '完成需求基线确认' },
  },
  {
    id: 'commercial',
    saveInput: 'saveCommercialInput',
    generate: 'generateCommercial',
    inputKey: 'commercialInput',
    resultKey: 'commercialResult',
    input: { contractTerms: '按里程碑付款', paymentMilestones: '验收后支付尾款' },
  },
  {
    id: 'retrospective',
    saveInput: 'saveRetrospectiveInput',
    generate: 'generateRetrospective',
    inputKey: 'retrospectiveInput',
    resultKey: 'retrospectiveResult',
    input: { projectOutcome: '完成一期交付', problemsLessons: '接口联调应更早启动' },
  },
  {
    id: 'compliance',
    saveInput: 'saveComplianceInput',
    generate: 'generateCompliance',
    inputKey: 'complianceInput',
    resultKey: 'complianceResult',
    input: { systemScope: '项目管理 Web 系统', dataTypes: '项目档案和任务数据' },
  },
];

function createMockApp(userDataDir) {
  return { getPath: () => userDataDir };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-project-management-'));
  const userDataDir = path.join(tempRoot, '用户数据');
  const aiRequests = [];
  const aiService = {
    async chat(request) {
      aiRequests.push(request);
      return `# ${request.logTitle}\n\n- 基于真实项目材料生成。`;
    },
  };
  const configStore = {
    load: () => ({
      api_key: 'fixture-key',
      base_url: 'https://example.invalid/v1',
      model_name: 'fixture-model',
    }),
  };
  const app = createMockApp(userDataDir);
  const service = createProjectManagementService({ app, aiService, configStore });

  try {
    const normalizedProfile = normalizeProfile({
      projectName: '  状态模型验证  ',
      projectType: '',
      currentStage: '',
    });
    assert.equal(normalizedProfile.projectName, '状态模型验证');
    assert.equal(normalizedProfile.projectType, 'IT服务项目');
    assert.equal(normalizedProfile.currentStage, '项目启动');

    const normalizedTask = normalizeTask({
      id: '',
      type: '',
      status: 'unexpected',
      progress: 180,
      message: '  任务处理中  ',
    });
    assert.match(normalizedTask.id, /^project-management-/);
    assert.equal(normalizedTask.type, 'planning');
    assert.equal(normalizedTask.status, 'running');
    assert.equal(normalizedTask.progress, 100);
    assert.equal(normalizedTask.message, '任务处理中');

    const normalizedState = normalizeState({
      projectId: ' fixture-project ',
      planningInput: { background: '  真实项目背景  ', objectives: 'x'.repeat(21000) },
      task: { id: 'done', type: 'planning', status: 'success', progress: 99.6 },
    });
    assert.equal(normalizedState.projectId, 'fixture-project');
    assert.equal(normalizedState.planningInput.background, '真实项目背景');
    assert.equal(normalizedState.planningInput.objectives.length, 20000);
    assert.equal(normalizedState.task.progress, 100);
    assert.equal(recoverInterruptedTask(normalizedState), normalizedState);
    const recoveredFixture = recoverInterruptedTask({
      ...normalizedState,
      task: { ...normalizedState.task, status: 'running', progress: 42 },
    });
    assert.equal(recoveredFixture.task.status, 'error');
    assert.equal(recoveredFixture.task.progress, 100);
    assert.equal(recoveredFixture.task.message, '上次任务未完成，请重新执行。');

    const legacyApp = createMockApp(path.join(tempRoot, '历史工作区'));
    const legacyDir = getProjectManagementDir(legacyApp);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'state.json'), JSON.stringify({
      projectId: 'legacy-project',
      profile: { projectName: '历史中文项目', clientName: '历史客户' },
      planningResult: '# 历史规划结果',
      updated_at: '2026-01-01T00:00:00.000Z',
    }, null, 2), 'utf-8');
    const storeEvents = [];
    const legacyStore = createProjectManagementStore({
      app: legacyApp,
      onStateChange: (nextState) => storeEvents.push(nextState),
    });
    const migratedState = legacyStore.loadState();
    assert.equal(migratedState.projectId, 'legacy-project');
    assert.equal(migratedState.profile.projectName, '历史中文项目');
    assert.equal(migratedState.planningResult, '# 历史规划结果');
    assert.equal(legacyStore.listProjects().projects[0].completedCount, 1);
    legacyStore.saveState({ reportingResult: '# 历史项目汇报' });
    assert.equal(storeEvents.length, 1);
    assert.equal(storeEvents[0].reportingResult, '# 历史项目汇报');

    let state = service.loadState();
    assert.equal(state.projectId, 'default');
    assert.equal(state.profile.projectType, 'IT服务项目');
    assert.equal(service.listProjects().projects.length, 1);

    let dictionaries = service.saveDictionary('projectGroups', [' 政企项目 ', '政企项目', '', '内部项目']);
    assert.deepEqual(dictionaries.projectGroups, ['政企项目', '内部项目']);
    dictionaries = service.saveDictionary('projectTypes', ['定制开发', '定制开发']);
    assert.ok(dictionaries.projectTypes.includes('IT服务项目'));
    assert.equal(dictionaries.projectTypes.filter((item) => item === '定制开发').length, 1);

    const receivedEvents = [];
    let destroyedListener = null;
    const subscriber = {
      isDestroyed: () => false,
      send: (channel, payload) => receivedEvents.push({ channel, payload }),
      once: (event, listener) => {
        if (event === 'destroyed') destroyedListener = listener;
      },
    };
    service.subscribe(subscriber);
    assert.equal(receivedEvents[0].channel, 'project-management:event');

    const created = service.createProject({
      projectName: ' 智能交付平台 ',
      profile: {
        clientName: '示例客户',
        vendorName: '示例交付方',
        projectType: '定制开发',
        projectGroup: '政企项目',
        currentStage: '项目规划',
      },
    });
    const generatedProjectId = created.state.projectId;
    assert.notEqual(generatedProjectId, 'default');
    assert.equal(created.state.profile.projectName, '智能交付平台');
    assert.equal(created.projects.projects.length, 2);
    assert.equal(created.projects.activeProjectId, generatedProjectId);

    state = service.saveProfile({
      ...created.state.profile,
      projectName: '智能交付平台一期',
      projectGroup: '重点项目',
      paymentTerms: '里程碑验收后付款',
    });
    assert.equal(state.profile.projectName, '智能交付平台一期');
    assert.ok(service.readDictionaries().projectGroups.includes('重点项目'));

    for (const module of modules) {
      state = service[module.saveInput](module.input);
      for (const [key, value] of Object.entries(module.input)) {
        assert.equal(state[module.inputKey][key], value);
      }
      state = await service[module.generate]({});
      assert.equal(state.task.status, 'success');
      assert.equal(state.task.type, module.id);
      assert.equal(state.task.progress, 100);
      assert.match(state[module.resultKey], /^# 项目管理-/);
      assert.match(state.latestPrompt, /智能交付平台一期/);
      assert.match(state.latestPrompt, /```mermaid/);
    }

    assert.equal(aiRequests.length, modules.length);
    assert.match(aiRequests[1].messages[1].content, /项目管理-启动与规划/);
    assert.ok(receivedEvents.some(({ payload }) => payload.task?.status === 'running'));
    assert.ok(receivedEvents.some(({ payload }) => payload.task?.status === 'success'));

    let projectList = service.listProjects();
    const generatedRecord = projectList.projects.find((project) => project.id === generatedProjectId);
    assert.equal(generatedRecord.completedCount, modules.length);
    assert.equal(generatedRecord.name, '智能交付平台一期');

    state = service.switchProject('default');
    assert.equal(state.projectId, 'default');
    assert.equal(state.profile.projectName, '');
    state = service.switchProject(generatedProjectId);
    assert.equal(state.profile.projectName, '智能交付平台一期');

    const secondary = service.createProject({ projectName: '待删除项目' });
    const secondaryProjectId = secondary.state.projectId;
    let deletion = service.deleteProjects([secondaryProjectId, secondaryProjectId, 'missing-project']);
    assert.equal(deletion.success, true);
    assert.ok(!deletion.projects.projects.some((project) => project.id === secondaryProjectId));

    state = service.clear().state;
    assert.equal(state.projectId, generatedProjectId);
    assert.equal(state.profile.projectName, '');
    assert.equal(state.planningResult, '');
    assert.equal(service.listProjects().projects.find((project) => project.id === generatedProjectId).completedCount, 0);

    const eventCountBeforeDestroy = receivedEvents.length;
    destroyedListener();
    service.saveProfile({ projectName: '订阅释放验证' });
    assert.equal(receivedEvents.length, eventCountBeforeDestroy);

    const stateFile = path.join(getProjectManagementDir(app), 'projects', `${generatedProjectId}.json`);
    const storedState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    fs.writeFileSync(stateFile, JSON.stringify({
      ...storedState,
      task: {
        id: 'stale-project-management-task',
        type: 'planning',
        status: 'running',
        progress: 45,
        message: '仍在生成',
      },
    }, null, 2), 'utf-8');
    const restartedService = createProjectManagementService({ app, aiService, configStore });
    state = restartedService.loadState();
    assert.equal(state.task.status, 'error');
    assert.equal(state.task.progress, 100);
    assert.equal(state.task.message, '上次任务未完成，请重新执行。');

    let resolveDeferredGeneration;
    const concurrentService = createProjectManagementService({
      app: createMockApp(path.join(tempRoot, '并发任务')),
      aiService: {
        chat: () => new Promise((resolve) => {
          resolveDeferredGeneration = resolve;
        }),
      },
      configStore,
    });
    const pendingGeneration = concurrentService.generatePlanning({});
    await assert.rejects(
      concurrentService.generateDiscovery({}),
      /需求与 PRD 正在生成中/,
    );
    resolveDeferredGeneration('# 并发任务完成');
    const concurrentState = await pendingGeneration;
    assert.equal(concurrentState.task.status, 'success');
    assert.equal(concurrentState.planningResult, '# 并发任务完成');

    const failedService = createProjectManagementService({
      app: createMockApp(path.join(tempRoot, '失败任务')),
      aiService: { chat: async () => { throw new Error('模拟模型失败'); } },
      configStore,
    });
    await assert.rejects(failedService.generateRisk({}), /模拟模型失败/);
    const failedState = failedService.loadState();
    assert.equal(failedState.task.status, 'error');
    assert.equal(failedState.task.progress, 100);
    assert.equal(failedState.task.message, '模拟模型失败');
    assert.equal(failedState.riskResult, '');

    const missingConfigService = createProjectManagementService({
      app: createMockApp(path.join(tempRoot, '缺少配置')),
      aiService,
      configStore: { load: () => ({}) },
    });
    await assert.rejects(
      missingConfigService.generatePlanning({}),
      /API Key、Base URL、模型名称/,
    );

    projectList = restartedService.listProjects();
    console.log('[project-management-verify] passed');
    console.log(JSON.stringify({
      generatedModules: aiRequests.length,
      projectCount: projectList.projects.length,
      subscriberEvents: receivedEvents.length,
      dictionaries: restartedService.readDictionaries(),
      interruptedTaskRecovered: true,
      concurrentTaskGuarded: true,
      failedTaskPersisted: true,
      legacyStateMigrated: true,
    }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[project-management-verify] failed');
  console.error(error);
  process.exitCode = 1;
});
