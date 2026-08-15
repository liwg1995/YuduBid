const {
  createCommercialPrompt,
  createCompliancePrompt,
  createDeliveryPrompt,
  createDiscoveryPrompt,
  createExecutionPrompt,
  createPlanningPrompt,
  createReportingPrompt,
  createRetrospectivePrompt,
  createRiskPrompt,
  createStakeholderPrompt,
} = require('./projectManagementPrompts.cjs');
const {
  normalizeCommercialInput,
  normalizeComplianceInput,
  normalizeDeliveryInput,
  normalizeDiscoveryInput,
  normalizeExecutionInput,
  normalizePlanningInput,
  normalizeProfile,
  normalizeReportingInput,
  normalizeRetrospectiveInput,
  normalizeRiskInput,
  normalizeStakeholderInput,
  now,
} = require('./projectManagementState.cjs');
const { createProjectManagementStore } = require('./projectManagementStore.cjs');

const generationDefinitions = {
  planning: {
    inputKey: 'planningInput', resultKey: 'planningResult', dependencyKeys: [],
    normalizeInput: normalizePlanningInput, promptBuilder: createPlanningPrompt,
    activeError: '项目管理规划正在生成中，请稍后再试', actionName: '生成项目启动与规划方案',
    prepareMessage: '正在准备项目启动与规划任务', requestMessage: '正在请求文本模型生成规划方案',
    organizeMessage: '正在整理项目启动与规划结果', successMessage: '项目启动与规划方案已生成', failureMessage: '项目启动与规划生成失败',
    systemPrompt: '你是专业、务实、风险前置的中文项目管理助手。', temperature: 0.35, logTitle: '项目管理-启动与规划',
  },
  discovery: {
    inputKey: 'discoveryInput', resultKey: 'discoveryResult', dependencyKeys: ['planningResult'],
    normalizeInput: normalizeDiscoveryInput, promptBuilder: createDiscoveryPrompt,
    activeError: '项目管理需求与 PRD 正在生成中，请稍后再试', actionName: '生成需求分析与 PRD 框架',
    prepareMessage: '正在准备需求与 PRD 任务', requestMessage: '正在请求文本模型生成需求与 PRD 框架',
    organizeMessage: '正在整理需求与 PRD 结果', successMessage: '需求分析与 PRD 框架已生成', failureMessage: '需求分析与 PRD 生成失败',
    systemPrompt: '你是专业、克制、验收导向的中文产品经理和项目管理助手。', temperature: 0.35, logTitle: '项目管理-需求与PRD',
  },
  execution: {
    inputKey: 'executionInput', resultKey: 'executionResult', dependencyKeys: ['planningResult', 'discoveryResult'],
    normalizeInput: normalizeExecutionInput, promptBuilder: createExecutionPrompt,
    activeError: '项目管理排期与推进计划正在生成中，请稍后再试', actionName: '生成排期与推进计划',
    prepareMessage: '正在准备排期与推进任务', requestMessage: '正在请求文本模型生成排期与推进计划',
    organizeMessage: '正在整理排期与推进结果', successMessage: '排期与推进计划已生成', failureMessage: '排期与推进计划生成失败',
    systemPrompt: '你是专业、节奏清晰、强执行导向的中文项目管理助手。', temperature: 0.35, logTitle: '项目管理-排期与推进',
  },
  risk: {
    inputKey: 'riskInput', resultKey: 'riskResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult'],
    normalizeInput: normalizeRiskInput, promptBuilder: createRiskPrompt,
    activeError: '项目管理风险问题方案正在生成中，请稍后再试', actionName: '生成风险问题方案',
    prepareMessage: '正在准备风险问题任务', requestMessage: '正在请求文本模型生成风险问题方案',
    organizeMessage: '正在整理风险问题结果', successMessage: '风险问题方案已生成', failureMessage: '风险问题方案生成失败',
    systemPrompt: '你是专业、冷静、结果导向的中文项目风险管理助手。', temperature: 0.3, logTitle: '项目管理-风险问题',
  },
  stakeholder: {
    inputKey: 'stakeholderInput', resultKey: 'stakeholderResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult', 'riskResult'],
    normalizeInput: normalizeStakeholderInput, promptBuilder: createStakeholderPrompt,
    activeError: '项目管理沟通变更方案正在生成中，请稍后再试', actionName: '生成沟通变更方案',
    prepareMessage: '正在准备沟通变更任务', requestMessage: '正在请求文本模型生成沟通变更方案',
    organizeMessage: '正在整理沟通变更结果', successMessage: '沟通变更方案已生成', failureMessage: '沟通变更方案生成失败',
    systemPrompt: '你是专业、克制、善于留痕的中文项目沟通管理助手。', temperature: 0.35, logTitle: '项目管理-沟通变更',
  },
  delivery: {
    inputKey: 'deliveryInput', resultKey: 'deliveryResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult', 'riskResult', 'stakeholderResult'],
    normalizeInput: normalizeDeliveryInput, promptBuilder: createDeliveryPrompt,
    activeError: '项目管理交付上线方案正在生成中，请稍后再试', actionName: '生成交付上线方案',
    prepareMessage: '正在准备交付上线任务', requestMessage: '正在请求文本模型生成交付上线方案',
    organizeMessage: '正在整理交付上线结果', successMessage: '交付上线方案已生成', failureMessage: '交付上线方案生成失败',
    systemPrompt: '你是专业、严谨、验收导向的中文项目交付管理助手。', temperature: 0.3, logTitle: '项目管理-交付上线',
  },
  reporting: {
    inputKey: 'reportingInput', resultKey: 'reportingResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult', 'riskResult', 'stakeholderResult', 'deliveryResult'],
    normalizeInput: normalizeReportingInput, promptBuilder: createReportingPrompt,
    activeError: '项目管理汇报材料正在生成中，请稍后再试', actionName: '生成汇报材料',
    prepareMessage: '正在准备汇报周月报任务', requestMessage: '正在请求文本模型生成汇报材料',
    organizeMessage: '正在整理汇报材料结果', successMessage: '汇报材料已生成', failureMessage: '汇报材料生成失败',
    systemPrompt: '你是专业、清晰、适合管理汇报的中文项目管理助手。', temperature: 0.35, logTitle: '项目管理-汇报周月报',
  },
  commercial: {
    inputKey: 'commercialInput', resultKey: 'commercialResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult', 'riskResult', 'stakeholderResult', 'deliveryResult', 'reportingResult'],
    normalizeInput: normalizeCommercialInput, promptBuilder: createCommercialPrompt,
    activeError: '项目管理商务回款方案正在生成中，请稍后再试', actionName: '生成商务回款方案',
    prepareMessage: '正在准备商务回款任务', requestMessage: '正在请求文本模型生成商务回款方案',
    organizeMessage: '正在整理商务回款结果', successMessage: '商务回款方案已生成', failureMessage: '商务回款方案生成失败',
    systemPrompt: '你是专业、务实、重视回款与客户关系的中文项目商务管理助手。', temperature: 0.32, logTitle: '项目管理-商务回款',
  },
  retrospective: {
    inputKey: 'retrospectiveInput', resultKey: 'retrospectiveResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult', 'riskResult', 'stakeholderResult', 'deliveryResult', 'reportingResult', 'commercialResult'],
    normalizeInput: normalizeRetrospectiveInput, promptBuilder: createRetrospectivePrompt,
    activeError: '项目管理复盘沉淀报告正在生成中，请稍后再试', actionName: '生成复盘沉淀报告',
    prepareMessage: '正在准备复盘沉淀任务', requestMessage: '正在请求文本模型生成复盘沉淀报告',
    organizeMessage: '正在整理复盘沉淀结果', successMessage: '复盘沉淀报告已生成', failureMessage: '复盘沉淀报告生成失败',
    systemPrompt: '你是专业、真实、善于沉淀组织资产的中文项目复盘助手。', temperature: 0.35, logTitle: '项目管理-复盘沉淀',
  },
  compliance: {
    inputKey: 'complianceInput', resultKey: 'complianceResult', dependencyKeys: ['planningResult', 'discoveryResult', 'executionResult', 'riskResult', 'stakeholderResult', 'deliveryResult', 'reportingResult', 'commercialResult', 'retrospectiveResult'],
    normalizeInput: normalizeComplianceInput, promptBuilder: createCompliancePrompt,
    activeError: '项目管理合规本土化方案正在生成中，请稍后再试', actionName: '生成合规本土化方案',
    prepareMessage: '正在准备合规本土化任务', requestMessage: '正在请求文本模型生成合规本土化方案',
    organizeMessage: '正在整理合规本土化结果', successMessage: '合规本土化方案已生成', failureMessage: '合规本土化方案生成失败',
    systemPrompt: '你是专业、谨慎、以上线准入和风险整改为导向的中文项目合规助手。', temperature: 0.28, logTitle: '项目管理-合规本土化',
  },
};

function createProjectManagementService({ app, aiService, configStore }) {
  const subscribers = new Set();
  let activeTask = null;

  function assertNoActiveTask(actionName) {
    if (activeTask) {
      throw new Error(`项目管理正在生成中，暂时无法${actionName}`);
    }
  }

  function broadcast(state) {
    for (const webContents of subscribers) {
      if (!webContents.isDestroyed()) {
        webContents.send('project-management:event', state);
      }
    }
  }

  const store = createProjectManagementStore({
    app,
    getActiveTask: () => activeTask,
    onStateChange: broadcast,
  });
  const {
    listProjects,
    loadState,
    readDictionaries,
    saveState,
    upsertDictionaryItem,
  } = store;

  function saveDictionary(kind, items = []) {
    assertNoActiveTask('保存项目字典');
    return store.saveDictionary(kind, items);
  }

  function createProject(payload = {}) {
    assertNoActiveTask('新建项目');
    return store.createProject(payload);
  }

  function switchProject(projectId) {
    assertNoActiveTask('切换项目');
    return store.switchProject(projectId);
  }

  function deleteProject(projectId) {
    assertNoActiveTask('删除项目');
    return store.deleteProject(projectId);
  }

  function deleteProjects(projectIds = []) {
    assertNoActiveTask('批量删除项目');
    return store.deleteProjects(projectIds);
  }

  function updateActiveTask(task, progress, message) {
    activeTask = { ...task, progress, message };
    saveState({ task: activeTask });
  }

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    const isNewSubscriber = !subscribers.has(webContents);
    subscribers.add(webContents);
    if (isNewSubscriber) {
      webContents.once('destroyed', () => subscribers.delete(webContents));
    }
    broadcast(loadState());
  }

  function ensureTextModelReady(actionName) {
    if (!configStore) return;
    const config = configStore.load();
    const missing = [];
    if (!String(config?.api_key || '').trim()) missing.push('API Key');
    if (!String(config?.base_url || '').trim()) missing.push('Base URL');
    if (!String(config?.model_name || '').trim()) missing.push('模型名称');
    if (missing.length) {
      throw new Error(`无法${actionName}：请先到“设置 - 文本模型”完善${missing.join('、')}。`);
    }
  }

  function saveProfile(profile = {}) {
    const normalized = normalizeProfile(profile);
    upsertDictionaryItem('projectTypes', normalized.projectType);
    upsertDictionaryItem('projectGroups', normalized.projectGroup);
    return saveState({ profile: normalized });
  }

  function savePlanningInput(planningInput = {}) {
    return saveState({ planningInput: normalizePlanningInput(planningInput) });
  }

  function savePlanningResult(payload = {}) {
    return saveState({ planningResult: String(payload.planningResult ?? payload.result ?? '') });
  }

  function saveDiscoveryInput(discoveryInput = {}) {
    return saveState({ discoveryInput: normalizeDiscoveryInput(discoveryInput) });
  }

  function saveDiscoveryResult(payload = {}) {
    return saveState({ discoveryResult: String(payload.discoveryResult ?? payload.result ?? '') });
  }

  function saveExecutionInput(executionInput = {}) {
    return saveState({ executionInput: normalizeExecutionInput(executionInput) });
  }

  function saveExecutionResult(payload = {}) {
    return saveState({ executionResult: String(payload.executionResult ?? payload.result ?? '') });
  }

  function saveRiskInput(riskInput = {}) {
    return saveState({ riskInput: normalizeRiskInput(riskInput) });
  }

  function saveRiskResult(payload = {}) {
    return saveState({ riskResult: String(payload.riskResult ?? payload.result ?? '') });
  }

  function saveStakeholderInput(stakeholderInput = {}) {
    return saveState({ stakeholderInput: normalizeStakeholderInput(stakeholderInput) });
  }

  function saveStakeholderResult(payload = {}) {
    return saveState({ stakeholderResult: String(payload.stakeholderResult ?? payload.result ?? '') });
  }

  function saveDeliveryInput(deliveryInput = {}) {
    return saveState({ deliveryInput: normalizeDeliveryInput(deliveryInput) });
  }

  function saveDeliveryResult(payload = {}) {
    return saveState({ deliveryResult: String(payload.deliveryResult ?? payload.result ?? '') });
  }

  function saveReportingInput(reportingInput = {}) {
    return saveState({ reportingInput: normalizeReportingInput(reportingInput) });
  }

  function saveReportingResult(payload = {}) {
    return saveState({ reportingResult: String(payload.reportingResult ?? payload.result ?? '') });
  }

  function saveCommercialInput(commercialInput = {}) {
    return saveState({ commercialInput: normalizeCommercialInput(commercialInput) });
  }

  function saveCommercialResult(payload = {}) {
    return saveState({ commercialResult: String(payload.commercialResult ?? payload.result ?? '') });
  }

  function saveRetrospectiveInput(retrospectiveInput = {}) {
    return saveState({ retrospectiveInput: normalizeRetrospectiveInput(retrospectiveInput) });
  }

  function saveRetrospectiveResult(payload = {}) {
    return saveState({ retrospectiveResult: String(payload.retrospectiveResult ?? payload.result ?? '') });
  }

  function saveComplianceInput(complianceInput = {}) {
    return saveState({ complianceInput: normalizeComplianceInput(complianceInput) });
  }

  function saveComplianceResult(payload = {}) {
    return saveState({ complianceResult: String(payload.complianceResult ?? payload.result ?? '') });
  }

  async function generateModule(type, payload = {}) {
    const definition = generationDefinitions[type];
    if (activeTask) {
      throw new Error(definition.activeError);
    }
    ensureTextModelReady(definition.actionName);

    const current = loadState();
    const context = {
      profile: normalizeProfile(payload.profile || current.profile),
      [definition.inputKey]: definition.normalizeInput(payload[definition.inputKey] || current[definition.inputKey]),
    };
    for (const dependencyKey of definition.dependencyKeys) {
      context[dependencyKey] = String(payload[dependencyKey] ?? current[dependencyKey] ?? '');
    }
    const prompt = definition.promptBuilder(context);
    const task = {
      id: `project-management-${Date.now()}`,
      type,
      status: 'running',
      progress: 12,
      message: definition.prepareMessage,
      started_at: now(),
    };

    activeTask = task;
    saveState({ ...context, latestPrompt: prompt, task });

    try {
      activeTask = { ...task, progress: 35, message: definition.requestMessage };
      saveState({ task: activeTask });
      const content = await aiService.chat({
        messages: [
          { role: 'system', content: definition.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: definition.temperature,
        logTitle: definition.logTitle,
      });
      updateActiveTask(task, 72, definition.organizeMessage);
      const result = String(content || '').trim();
      const finalTask = {
        ...task,
        status: 'success',
        progress: 100,
        message: definition.successMessage,
        finished_at: now(),
      };
      activeTask = null;
      return saveState({
        ...context,
        [definition.resultKey]: result,
        latestPrompt: prompt,
        task: finalTask,
      });
    } catch (error) {
      const failedTask = {
        ...task,
        status: 'error',
        progress: 100,
        message: error?.message || definition.failureMessage,
        finished_at: now(),
      };
      activeTask = null;
      saveState({ ...context, latestPrompt: prompt, task: failedTask });
      throw error;
    }
  }

  const generatePlanning = (payload = {}) => generateModule('planning', payload);
  const generateDiscovery = (payload = {}) => generateModule('discovery', payload);
  const generateExecution = (payload = {}) => generateModule('execution', payload);
  const generateRisk = (payload = {}) => generateModule('risk', payload);
  const generateStakeholder = (payload = {}) => generateModule('stakeholder', payload);
  const generateDelivery = (payload = {}) => generateModule('delivery', payload);
  const generateReporting = (payload = {}) => generateModule('reporting', payload);
  const generateCommercial = (payload = {}) => generateModule('commercial', payload);
  const generateRetrospective = (payload = {}) => generateModule('retrospective', payload);
  const generateCompliance = (payload = {}) => generateModule('compliance', payload);

  function clear() {
    return store.clear();
  }

  return {
    loadState,
    listProjects,
    readDictionaries,
    saveDictionary,
    createProject,
    switchProject,
    deleteProject,
    deleteProjects,
    saveProfile,
    savePlanningInput,
    savePlanningResult,
    saveDiscoveryInput,
    saveDiscoveryResult,
    saveExecutionInput,
    saveExecutionResult,
    saveRiskInput,
    saveRiskResult,
    saveStakeholderInput,
    saveStakeholderResult,
    saveDeliveryInput,
    saveDeliveryResult,
    saveReportingInput,
    saveReportingResult,
    saveCommercialInput,
    saveCommercialResult,
    saveRetrospectiveInput,
    saveRetrospectiveResult,
    saveComplianceInput,
    saveComplianceResult,
    generatePlanning,
    generateDiscovery,
    generateExecution,
    generateRisk,
    generateStakeholder,
    generateDelivery,
    generateReporting,
    generateCommercial,
    generateRetrospective,
    generateCompliance,
    clear,
    subscribe,
  };
}

module.exports = {
  createProjectManagementService,
};
