import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentHostStatus, AgentRunResult } from '../../../shared/types/ipc';
import { useToast } from '../../../shared/ui/ToastProvider';
import AgentFloatingPanel from '../../../shared/ui/AgentFloatingPanel';
import '../projectManagement.css';

import {
  ModuleIntro,
  ModulePlaceholder,
  ProjectDictionarySelect,
  ProjectManagementHelpDialog,
  ProjectManagementModuleWorkspace,
} from '../components/ProjectManagementPageParts';
import {
  ProjectManagementFlowNavigation,
  ProjectManagementListView,
  ProjectManagementProjectBar,
  ProjectManagementSidebar,
} from '../components/ProjectManagementShell';
import {
  commercialInputFields,
  complianceInputFields,
  deliveryInputFields,
  discoveryInputFields,
  executionInputFields,
  modules,
  planningInputFields,
  profileFields,
  reportingInputFields,
  retrospectiveInputFields,
  riskInputFields,
  stakeholderInputFields,
} from '../model/projectManagementPageModel';
import { useProjectManagementExport } from '../hooks/useProjectManagementExport';
import { useProjectManagementLifecycle } from '../hooks/useProjectManagementLifecycle';
import { useProjectManagementModuleOperations } from '../hooks/useProjectManagementModuleOperations';
import { useProjectManagementWorkspaceState } from '../hooks/useProjectManagementWorkspaceState';

function ProjectManagementPage() {
  const { showToast } = useToast();
  const [activeModuleId, setActiveModuleId] = useState(modules[0].id);
  const [agentStatus, setAgentStatus] = useState<AgentHostStatus | null>(null);
  const [agentRun, setAgentRun] = useState<AgentRunResult | null>(null);
  const [agentPlanning, setAgentPlanning] = useState(false);
  const [agentConfirmOpen, setAgentConfirmOpen] = useState(false);
  const [agentContinuousConfirmOpen, setAgentContinuousConfirmOpen] = useState(false);
  const [agentContinuousStatus, setAgentContinuousStatus] = useState<'idle' | 'running' | 'paused' | 'blocked' | 'completed'>('idle');
  const [agentContinuousMessage, setAgentContinuousMessage] = useState('一次确认后，按现有输入连续推进十个项目模块。');
  const [agentContinuousCycle, setAgentContinuousCycle] = useState(0);
  const agentContinuousLaunchingRef = useRef(false);
  const agentContinuousPersistenceReadyRef = useRef(false);
  const {
    state,
    profile,
    planningInput,
    planningResult,
    discoveryInput,
    discoveryResult,
    executionInput,
    executionResult,
    riskInput,
    riskResult,
    stakeholderInput,
    stakeholderResult,
    deliveryInput,
    deliveryResult,
    reportingInput,
    reportingResult,
    commercialInput,
    commercialResult,
    retrospectiveInput,
    retrospectiveResult,
    complianceInput,
    complianceResult,
    resultModes,
    applyState,
    updateProfileField,
    updatePlanningInputField,
    updateDiscoveryInputField,
    updateExecutionInputField,
    updateRiskInputField,
    updateStakeholderInputField,
    updateDeliveryInputField,
    updateReportingInputField,
    updateCommercialInputField,
    updateRetrospectiveInputField,
    updateComplianceInputField,
    setPlanningResult,
    setDiscoveryResult,
    setExecutionResult,
    setRiskResult,
    setStakeholderResult,
    setDeliveryResult,
    setReportingResult,
    setCommercialResult,
    setRetrospectiveResult,
    setComplianceResult,
    toggleResultMode,
    showResultEditor,
  } = useProjectManagementWorkspaceState();

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) || modules[0],
    [activeModuleId],
  );
  const moduleResults = useMemo<Record<string, string>>(() => ({
    planning: planningResult,
    discovery: discoveryResult,
    execution: executionResult,
    risk: riskResult,
    stakeholder: stakeholderResult,
    delivery: deliveryResult,
    reporting: reportingResult,
    commercial: commercialResult,
    retrospective: retrospectiveResult,
    compliance: complianceResult,
  }), [planningResult, discoveryResult, executionResult, riskResult, stakeholderResult, deliveryResult, reportingResult, commercialResult, retrospectiveResult, complianceResult]);
  const {
    exportProgress,
    exporting,
    exportModuleWord,
    exportAllProjectManagementWord,
  } = useProjectManagementExport({ profile, moduleResults, showToast });
  const {
    createProject,
    createProjectOpen,
    deleteCurrentProject,
    deleteProjectFromList,
    deleteProjectOpen,
    deleteSelectedProjects,
    enterProject,
    filteredProjectList,
    loading,
    newProjectProfile,
    projectGroupOptions,
    projectList,
    projectSearchKeyword,
    projectTypeOptions,
    refreshDictionaries,
    refreshProjectList,
    selectedProjectIds,
    setCreateProjectOpen,
    setDeleteProjectOpen,
    setNewProjectProfile,
    setProjectSearchKeyword,
    setViewMode,
    toggleAllVisibleProjects,
    toggleProjectSelection,
    viewMode,
  } = useProjectManagementLifecycle({
    currentProjectId: state?.projectId,
    applyState,
    resetActiveModule: () => setActiveModuleId(modules[0].id),
    showToast,
  });
  const moduleOperations = useProjectManagementModuleOperations({
    workspace: {
      profile,
      planningInput,
      planningResult,
      discoveryInput,
      discoveryResult,
      executionInput,
      executionResult,
      riskInput,
      riskResult,
      stakeholderInput,
      stakeholderResult,
      deliveryInput,
      deliveryResult,
      reportingInput,
      reportingResult,
      commercialInput,
      commercialResult,
      retrospectiveInput,
      retrospectiveResult,
      complianceInput,
      complianceResult,
    },
    applyState,
    showResultEditor,
    showToast,
  });
  const moduleOperationsRef = useRef(moduleOperations);
  useEffect(() => {
    moduleOperationsRef.current = moduleOperations;
  }, [moduleOperations]);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.agent.getStatus().then((status) => mounted && setAgentStatus(status)).catch(() => mounted && setAgentStatus(null));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setAgentRun(null);
    setAgentConfirmOpen(false);
  }, [state?.updated_at, state?.projectId]);

  useEffect(() => {
    agentContinuousPersistenceReadyRef.current = false;
    agentContinuousLaunchingRef.current = false;
    setAgentContinuousStatus('idle');
    setAgentContinuousMessage('一次确认后，按项目模块顺序连续生成工作成果。');
    const agentBridge = window.yibiao?.agent;
    const projectId = state?.projectId;
    if (!agentBridge || !agentStatus?.enabled || !projectId) return;
    let mounted = true;
    agentBridge.getContinuousRun({ workflowKind: 'project-management', projectId }).then((run) => {
      if (!mounted) return;
      if (run) {
        setAgentContinuousStatus(run.status);
        setAgentContinuousMessage(run.status === 'running' ? '正在恢复上次连续执行并检查项目模块…' : run.message);
      }
      agentContinuousPersistenceReadyRef.current = true;
    }).catch(() => { if (mounted) agentContinuousPersistenceReadyRef.current = true; });
    return () => { mounted = false; };
  }, [agentStatus?.enabled, state?.projectId]);

  useEffect(() => {
    const agentBridge = window.yibiao?.agent;
    const projectId = state?.projectId;
    if (!agentBridge || !projectId || agentContinuousStatus === 'idle' || !agentContinuousPersistenceReadyRef.current) return;
    agentBridge.saveContinuousRun({ workflowKind: 'project-management', projectId, status: agentContinuousStatus, message: agentContinuousMessage }).catch(() => undefined);
  }, [agentContinuousMessage, agentContinuousStatus, state?.projectId]);

  const projectAgentLabels: Record<string, string> = {
    'select-project': '选择或创建项目', 'wait-active-task': '等待当前任务完成', 'complete-profile': '完善项目档案', 'review-and-export': '人工复核并导出',
    ...Object.fromEntries(modules.flatMap((module) => [[`complete-${module.id}-input`, `补充${module.label}材料`], [`generate-${module.id}`, `生成${module.label}方案`]])),
  };

  async function planProjectNextStep() {
    if (!state?.projectId) return;
    setAgentPlanning(true);
    setAgentRun(null);
    try {
      const result = await window.yibiao?.agent.runShadow({ goal: '检查当前项目协作状态并推荐一个安全的下一步', context: { workflowKind: 'project-management', projectId: state.projectId } });
      if (result) setAgentRun(result);
      showToast('项目协作 Agent 已完成下一步规划', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : '项目协作 Agent 规划失败', 'error'); }
    finally { setAgentPlanning(false); }
  }

  function requestProjectAgentExecution() {
    const action = agentRun?.shadowEvaluation?.agentAction || '';
    if (action === 'wait-active-task') { showToast('当前已有项目协作任务运行', 'info'); return; }
    if (action === 'select-project') { setViewMode('list'); return; }
    if (action === 'complete-profile') { setActiveModuleId('planning'); showToast('请完善并保存项目档案', 'info'); return; }
    if (action === 'review-and-export') { showToast('请人工复核各模块后使用整套导出', 'info'); return; }
    const moduleId = modules.find((module) => action.includes(module.id))?.id;
    if (!moduleId) return;
    setActiveModuleId(moduleId);
    if (action.startsWith('complete-')) { showToast(`请补充${projectAgentLabels[action] || '当前模块材料'}`, 'info'); return; }
    setAgentConfirmOpen(true);
  }

  async function executeProjectAgentRecommendation() {
    const action = agentRun?.shadowEvaluation?.agentAction || '';
    const moduleId = modules.find((module) => action === `generate-${module.id}`)?.id as keyof typeof moduleOperations | undefined;
    setAgentConfirmOpen(false);
    if (!moduleId) return;
    setActiveModuleId(moduleId);
    await moduleOperations[moduleId].generate();
    setAgentRun(null);
  }

  function requestProjectContinuousRun() {
    if (!profile.projectName.trim() || (!profile.clientName.trim() && !profile.keyConstraints.trim())) {
      setActiveModuleId('planning');
      showToast('请先完善项目名称，并填写客户名称或关键约束', 'info');
      return;
    }
    setAgentContinuousConfirmOpen(true);
  }

  function confirmProjectContinuousRun() {
    setAgentContinuousConfirmOpen(false);
    setAgentRun(null);
    setAgentContinuousStatus('running');
    setAgentContinuousMessage('正在检查十个模块的已有成果与输入…');
  }

  function pauseProjectContinuousRun() {
    setAgentContinuousStatus('paused');
    setAgentContinuousMessage('连续执行已暂停；当前项目任务完成后，不会自动启动下一模块。');
  }

  const completedModuleIds = useMemo(() => new Set(
    modules.filter((module) => moduleResults[module.id]?.trim()).map((module) => module.id),
  ), [moduleResults]);
  const completedCount = completedModuleIds.size;
  const nextIncompleteModule = modules.find((module) => !completedModuleIds.has(module.id));
  const activeIndex = modules.findIndex((module) => module.id === activeModule.id);
  const nextModule = modules[activeIndex + 1];
  const isRunning = state?.task?.status === 'running';
  useEffect(() => {
    if (agentContinuousStatus !== 'running' || loading || !state?.projectId || agentContinuousLaunchingRef.current) return;
    if (isRunning) {
      setAgentContinuousMessage('正在等待当前项目模块生成完成…');
      return;
    }
    const moduleInputs: Record<string, object> = {
      planning: planningInput, discovery: discoveryInput, execution: executionInput, risk: riskInput,
      stakeholder: stakeholderInput, delivery: deliveryInput, reporting: reportingInput, commercial: commercialInput,
      retrospective: retrospectiveInput, compliance: complianceInput,
    };
    const nextModule = modules.find((module) => !moduleResults[module.id]?.trim());
    if (!nextModule) {
      setAgentContinuousStatus('completed');
      setAgentContinuousMessage('十个项目协作模块已全部生成，请人工复核后导出整套成果。');
      showToast('项目协作 Agent 连续执行已完成，请复核成果', 'success');
      return;
    }
    const hasInput = Object.values(moduleInputs[nextModule.id] || {}).some((value) => String(value || '').trim());
    if (!hasInput) {
      setActiveModuleId(nextModule.id);
      setAgentContinuousStatus('blocked');
      setAgentContinuousMessage(`请先补充“${nextModule.label}”模块材料，然后继续执行。`);
      return;
    }
    const moduleId = nextModule.id as keyof typeof moduleOperations;
    agentContinuousLaunchingRef.current = true;
    setActiveModuleId(nextModule.id);
    setAgentContinuousMessage(`正在执行：生成${nextModule.label}方案`);
    void moduleOperationsRef.current[moduleId].generate().then((success) => {
      if (!success) {
        setAgentContinuousStatus('blocked');
        setAgentContinuousMessage(`生成${nextModule.label}方案失败，已停止连续执行。`);
      }
    }).finally(() => {
      agentContinuousLaunchingRef.current = false;
      setAgentContinuousCycle((cycle) => cycle + 1);
    });
  }, [agentContinuousCycle, agentContinuousStatus, commercialInput, complianceInput, deliveryInput, discoveryInput, executionInput, isRunning, loading, moduleResults, planningInput, reportingInput, retrospectiveInput, riskInput, stakeholderInput, state?.projectId]);
  const isPlanningModule = activeModule.id === 'planning';
  const isDiscoveryModule = activeModule.id === 'discovery';
  const isExecutionModule = activeModule.id === 'execution';
  const isRiskModule = activeModule.id === 'risk';
  const isStakeholderModule = activeModule.id === 'stakeholder';
  const isDeliveryModule = activeModule.id === 'delivery';
  const isReportingModule = activeModule.id === 'reporting';
  const isCommercialModule = activeModule.id === 'commercial';
  const isRetrospectiveModule = activeModule.id === 'retrospective';
  const isComplianceModule = activeModule.id === 'compliance';
  const visibleTask = state?.task && (state.task.status === 'running' || state.task.type === activeModule.id) ? state.task : undefined;
  const currentModuleDone = completedModuleIds.has(activeModule.id);
  const suggestedModule = currentModuleDone ? nextModule || nextIncompleteModule : activeModule;
  const activeExportProgress = exportProgress?.moduleId === activeModule.id ? exportProgress : null;
  const allExportProgress = exportProgress?.moduleId === 'all' ? exportProgress : null;
  async function saveProfile() {
    try {
      const nextState = await window.yibiao?.projectManagement.saveProfile(profile);
      if (nextState) applyState(nextState);
      await refreshProjectList();
      await refreshDictionaries();
      showToast('项目档案已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存项目档案失败', 'error');
    }
  }

  async function clearWorkspace() {
    try {
      const result = await window.yibiao?.projectManagement.clear();
      if (result?.state) applyState(result.state);
      showToast('项目管理工作区已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空项目管理工作区失败', 'error');
    }
  }

  if (loading) {
    return <div className="project-management-page"><div className="project-management-detail">正在读取项目管理工作区...</div></div>;
  }

  return (
    <div className="project-management-page">
      <section className="project-management-hero">
        <div>
          <div className="project-management-hero-kicker">
            <span className="section-kicker">项目管理</span>
            <ProjectManagementHelpDialog modules={modules} triggerMode="label" />
          </div>
          <h2>把项目从计划、推进、交付、复盘到合规收拢成一个工作台</h2>
          <p>
            先建立项目档案，再按启动、需求、排期、风险、沟通、交付、汇报、回款、复盘、合规的顺序推进。每个模块都会沿用同一份项目上下文。
          </p>
        </div>
      </section>

      {viewMode === 'list' ? (
        <ProjectManagementListView
          projects={filteredProjectList}
          totalCount={projectList.length}
          keyword={projectSearchKeyword}
          selectedProjectIds={selectedProjectIds}
          isRunning={Boolean(isRunning)}
          setKeyword={setProjectSearchKeyword}
          onCreateProject={() => setCreateProjectOpen(true)}
          onToggleAll={toggleAllVisibleProjects}
          onToggleProject={toggleProjectSelection}
          onDeleteSelected={deleteSelectedProjects}
          onDeleteProject={deleteProjectFromList}
          onEnterProject={enterProject}
        />
      ) : (
      <>
      <ProjectManagementProjectBar
        profile={profile}
        hasProject={Boolean(state?.projectId)}
        isRunning={Boolean(isRunning)}
        onBack={() => setViewMode('list')}
        onDelete={() => setDeleteProjectOpen(true)}
      />
      {agentStatus?.enabled && state?.projectId && (
        <AgentFloatingPanel label="项目协作 Agent" className="project-management-agent-panel">
          <div><span className="section-kicker">项目协作 Agent</span><strong>{agentContinuousStatus !== 'idle' ? `连续执行：${agentContinuousStatus === 'running' ? '进行中' : agentContinuousStatus === 'paused' ? '已暂停' : agentContinuousStatus === 'blocked' ? '需要补充' : '已完成'}` : agentRun?.shadowEvaluation?.agentAction ? `建议：${projectAgentLabels[agentRun.shadowEvaluation.agentAction] || agentRun.shadowEvaluation.agentAction}` : '检查十个项目模块并安排下一步'}</strong><p>{agentContinuousStatus !== 'idle' ? agentContinuousMessage : agentRun?.recommendation || 'Agent 可以规划单步，也可以按已有输入连续推进十个项目模块。'}</p></div>
          <div className="project-management-agent-actions">{agentContinuousStatus === 'running' ? <button type="button" className="secondary-action" onClick={pauseProjectContinuousRun}>暂停连续执行</button> : <button type="button" className="primary-action" onClick={requestProjectContinuousRun} disabled={loading || Boolean(isRunning)}>{agentContinuousStatus === 'paused' || agentContinuousStatus === 'blocked' ? '继续连续执行' : agentContinuousStatus === 'completed' ? '检查未完成项' : '连续执行'}</button>}<button type="button" className="secondary-action" onClick={() => void planProjectNextStep()} disabled={agentPlanning || Boolean(isRunning)}>{agentPlanning ? '规划中...' : agentRun ? '重新规划' : '规划下一步'}</button>{agentRun?.shadowEvaluation?.agentAction && <button type="button" className="primary-action" onClick={requestProjectAgentExecution} disabled={Boolean(isRunning)}>执行建议</button>}</div>
        </AgentFloatingPanel>
      )}
      <section className="project-management-workspace">
        <ProjectManagementFlowNavigation
          modules={modules}
          activeModule={activeModule}
          suggestedModule={suggestedModule}
          completedModuleIds={completedModuleIds}
          completedCount={completedCount}
          currentModuleDone={currentModuleDone}
          isRunning={Boolean(isRunning)}
          exporting={exporting}
          exportProgress={allExportProgress}
          onSelectModule={setActiveModuleId}
          onExportAll={exportAllProjectManagementWord}
        />

        <div className="project-management-layout">
          <article className="project-management-detail">
            <ModuleIntro module={activeModule} />
            {isPlanningModule ? (
              <ProjectManagementModuleWorkspace
                fields={planningInputFields}
                input={planningInput}
                inputKicker="启动材料"
                inputTitle="生成启动与规划方案"
                generateLabel="生成启动规划"
                resultKicker="规划方案"
                resultPlaceholder="生成的项目启动与规划方案会显示在这里，也可以先手动编写。"
                result={planningResult}
                resultMode={resultModes.planning}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updatePlanningInputField}
                onSaveInput={moduleOperations.planning.saveInput}
                onGenerate={moduleOperations.planning.generate}
                onToggleResultMode={() => toggleResultMode('planning')}
                onSaveResult={moduleOperations.planning.saveResult}
                saveResultLabel="保存方案"
                onExportWord={() => exportModuleWord('planning')}
                onResultChange={setPlanningResult}
                beforeInput={(
                  <section className="project-management-form-panel">
                    <div className="project-management-panel-head">
                      <div>
                        <span className="section-kicker">项目档案</span>
                        <h4>先把项目基本盘写清楚</h4>
                      </div>
                      <button type="button" className="secondary-action" onClick={() => void saveProfile()} disabled={isRunning}>保存档案</button>
                    </div>
                    <div className="project-management-form-grid">
                      {profileFields.map((field) => (
                        <label className={field.wide ? 'is-wide' : ''} key={field.key}>
                          <span>{field.label}</span>
                          {field.multiline ? (
                            <textarea value={profile[field.key]} onChange={(event) => updateProfileField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                          ) : field.key === 'projectType' ? (
                            <ProjectDictionarySelect
                              value={profile.projectType}
                              options={projectTypeOptions}
                              placeholder="选择项目类型"
                              addLabel="新增类型"
                              onChange={(value) => updateProfileField('projectType', value)}
                              disabled={isRunning}
                            />
                          ) : field.key === 'projectGroup' ? (
                            <ProjectDictionarySelect
                              value={profile.projectGroup}
                              options={projectGroupOptions}
                              placeholder="选择或新增项目分组"
                              addLabel="新增分组"
                              onChange={(value) => updateProfileField('projectGroup', value)}
                              disabled={isRunning}
                            />
                          ) : (
                            <input type={field.key === 'startDate' || field.key === 'endDate' ? 'date' : 'text'} value={profile[field.key]} onChange={(event) => updateProfileField(field.key, event.target.value)} placeholder={field.placeholder} disabled={isRunning} />
                          )}
                        </label>
                      ))}
                    </div>
                  </section>
                )}
              />
            ) : isDiscoveryModule ? (
              <ProjectManagementModuleWorkspace
                fields={discoveryInputFields}
                input={discoveryInput}
                inputKicker="需求材料"
                inputTitle="从访谈和诉求整理 PRD 框架"
                generateLabel="生成需求 PRD"
                resultKicker="需求与 PRD"
                resultPlaceholder="生成的需求分析与 PRD 框架会显示在这里，也可以先手动编写。"
                result={discoveryResult}
                resultMode={resultModes.discovery}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateDiscoveryInputField}
                onSaveInput={moduleOperations.discovery.saveInput}
                onGenerate={moduleOperations.discovery.generate}
                onToggleResultMode={() => toggleResultMode('discovery')}
                onSaveResult={moduleOperations.discovery.saveResult}
                onExportWord={() => exportModuleWord('discovery')}
                onResultChange={setDiscoveryResult}
              />
            ) : isExecutionModule ? (
              <ProjectManagementModuleWorkspace
                fields={executionInputFields}
                input={executionInput}
                inputKicker="排期材料"
                inputTitle="把任务、资源和节奏拆成推进计划"
                generateLabel="生成排期计划"
                resultKicker="排期与推进"
                resultPlaceholder="生成的排期与推进计划会显示在这里，也可以先手动编写。"
                result={executionResult}
                resultMode={resultModes.execution}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateExecutionInputField}
                onSaveInput={moduleOperations.execution.saveInput}
                onGenerate={moduleOperations.execution.generate}
                onToggleResultMode={() => toggleResultMode('execution')}
                onSaveResult={moduleOperations.execution.saveResult}
                onExportWord={() => exportModuleWord('execution')}
                onResultChange={setExecutionResult}
              />
            ) : isRiskModule ? (
              <ProjectManagementModuleWorkspace
                fields={riskInputFields}
                input={riskInput}
                inputKicker="风险材料"
                inputTitle="识别风险、问题和升级路径"
                generateLabel="生成风险方案"
                resultKicker="风险问题"
                resultPlaceholder="生成的风险与问题应对方案会显示在这里，也可以先手动编写。"
                result={riskResult}
                resultMode={resultModes.risk}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateRiskInputField}
                onSaveInput={moduleOperations.risk.saveInput}
                onGenerate={moduleOperations.risk.generate}
                onToggleResultMode={() => toggleResultMode('risk')}
                onSaveResult={moduleOperations.risk.saveResult}
                onExportWord={() => exportModuleWord('risk')}
                onResultChange={setRiskResult}
              />
            ) : isStakeholderModule ? (
              <ProjectManagementModuleWorkspace
                fields={stakeholderInputFields}
                input={stakeholderInput}
                inputKicker="沟通变更材料"
                inputTitle="管理干系人、分歧和变更留痕"
                generateLabel="生成沟通方案"
                resultKicker="沟通变更"
                resultPlaceholder="生成的沟通与变更管理方案会显示在这里，也可以先手动编写。"
                result={stakeholderResult}
                resultMode={resultModes.stakeholder}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateStakeholderInputField}
                onSaveInput={moduleOperations.stakeholder.saveInput}
                onGenerate={moduleOperations.stakeholder.generate}
                onToggleResultMode={() => toggleResultMode('stakeholder')}
                onSaveResult={moduleOperations.stakeholder.saveResult}
                onExportWord={() => exportModuleWord('stakeholder')}
                onResultChange={setStakeholderResult}
              />
            ) : isDeliveryModule ? (
              <ProjectManagementModuleWorkspace
                fields={deliveryInputFields}
                input={deliveryInput}
                inputKicker="交付上线材料"
                inputTitle="准备测试、验收、上线和交接"
                generateLabel="生成交付方案"
                resultKicker="交付上线"
                resultPlaceholder="生成的交付上线与验收方案会显示在这里，也可以先手动编写。"
                result={deliveryResult}
                resultMode={resultModes.delivery}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateDeliveryInputField}
                onSaveInput={moduleOperations.delivery.saveInput}
                onGenerate={moduleOperations.delivery.generate}
                onToggleResultMode={() => toggleResultMode('delivery')}
                onSaveResult={moduleOperations.delivery.saveResult}
                onExportWord={() => exportModuleWord('delivery')}
                onResultChange={setDeliveryResult}
              />
            ) : isReportingModule ? (
              <ProjectManagementModuleWorkspace
                fields={reportingInputFields}
                input={reportingInput}
                inputKicker="汇报材料"
                inputTitle="整理周报、月报和管理层汇报"
                generateLabel="生成汇报材料"
                resultKicker="汇报周月报"
                resultPlaceholder="生成的项目汇报材料会显示在这里，也可以先手动编写。"
                result={reportingResult}
                resultMode={resultModes.reporting}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateReportingInputField}
                onSaveInput={moduleOperations.reporting.saveInput}
                onGenerate={moduleOperations.reporting.generate}
                onToggleResultMode={() => toggleResultMode('reporting')}
                onSaveResult={moduleOperations.reporting.saveResult}
                onExportWord={() => exportModuleWord('reporting')}
                onResultChange={setReportingResult}
              />
            ) : isCommercialModule ? (
              <ProjectManagementModuleWorkspace
                fields={commercialInputFields}
                input={commercialInput}
                inputKicker="商务回款材料"
                inputTitle="跟踪合同、验收、开票和回款"
                generateLabel="生成回款方案"
                resultKicker="商务回款"
                resultPlaceholder="生成的商务回款与续约跟进方案会显示在这里，也可以先手动编写。"
                result={commercialResult}
                resultMode={resultModes.commercial}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateCommercialInputField}
                onSaveInput={moduleOperations.commercial.saveInput}
                onGenerate={moduleOperations.commercial.generate}
                onToggleResultMode={() => toggleResultMode('commercial')}
                onSaveResult={moduleOperations.commercial.saveResult}
                onExportWord={() => exportModuleWord('commercial')}
                onResultChange={setCommercialResult}
              />
            ) : isRetrospectiveModule ? (
              <ProjectManagementModuleWorkspace
                fields={retrospectiveInputFields}
                input={retrospectiveInput}
                inputKicker="复盘材料"
                inputTitle="沉淀项目经验、案例和 SOP"
                generateLabel="生成复盘报告"
                resultKicker="复盘沉淀"
                resultPlaceholder="生成的项目复盘与沉淀报告会显示在这里，也可以先手动编写。"
                result={retrospectiveResult}
                resultMode={resultModes.retrospective}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateRetrospectiveInputField}
                onSaveInput={moduleOperations.retrospective.saveInput}
                onGenerate={moduleOperations.retrospective.generate}
                onToggleResultMode={() => toggleResultMode('retrospective')}
                onSaveResult={moduleOperations.retrospective.saveResult}
                onExportWord={() => exportModuleWord('retrospective')}
                onResultChange={setRetrospectiveResult}
              />
            ) : isComplianceModule ? (
              <ProjectManagementModuleWorkspace
                fields={complianceInputFields}
                input={complianceInput}
                inputKicker="合规本土化材料"
                inputTitle="梳理备案、安全、数据和上线准入"
                generateLabel="生成合规方案"
                resultKicker="合规本土化"
                resultPlaceholder="生成的合规本土化与上线准入方案会显示在这里，也可以先手动编写。"
                result={complianceResult}
                resultMode={resultModes.compliance}
                task={visibleTask}
                exportProgress={activeExportProgress}
                isRunning={isRunning}
                exporting={exporting}
                updateInputField={updateComplianceInputField}
                onSaveInput={moduleOperations.compliance.saveInput}
                onGenerate={moduleOperations.compliance.generate}
                onToggleResultMode={() => toggleResultMode('compliance')}
                onSaveResult={moduleOperations.compliance.saveResult}
                onExportWord={() => exportModuleWord('compliance')}
                onResultChange={setComplianceResult}
              />
            ) : (
              <ModulePlaceholder module={activeModule} />
            )}
          </article>

          <ProjectManagementSidebar
            profile={profile}
            state={state}
            activeModule={activeModule}
            suggestedModule={suggestedModule}
            currentModuleDone={currentModuleDone}
            completedCount={completedCount}
            moduleCount={modules.length}
            isRunning={Boolean(isRunning)}
            onSelectModule={setActiveModuleId}
            onClear={clearWorkspace}
          />
        </div>
      </section>
      </>
      )}

      <Dialog.Root open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-management-project-dialog">
            <div className="project-management-help-head">
              <div>
                <Dialog.Title>新建项目</Dialog.Title>
                <Dialog.Description>创建后会立即进入新的项目管理流程，原项目会保留在项目列表和项目历史中。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭新建项目">×</Dialog.Close>
            </div>
            <div className="project-management-form-grid">
              <label>
                项目名称
                <input value={newProjectProfile.projectName || ''} onChange={(event) => setNewProjectProfile((current) => ({ ...current, projectName: event.target.value }))} placeholder="例如：商户小程序会员系统" />
              </label>
              <label>
                甲方/客户
                <input value={newProjectProfile.clientName || ''} onChange={(event) => setNewProjectProfile((current) => ({ ...current, clientName: event.target.value }))} placeholder="例如：清河万象汇" />
              </label>
              <label>
                乙方/交付方
                <input value={newProjectProfile.vendorName || ''} onChange={(event) => setNewProjectProfile((current) => ({ ...current, vendorName: event.target.value }))} placeholder="例如：禹都科技" />
              </label>
              <label>
                项目类型
                <ProjectDictionarySelect
                  value={newProjectProfile.projectType || ''}
                  options={projectTypeOptions}
                  placeholder="选择项目类型"
                  addLabel="新增类型"
                  onChange={(value) => setNewProjectProfile((current) => ({ ...current, projectType: value }))}
                />
              </label>
              <label>
                项目分组
                <ProjectDictionarySelect
                  value={newProjectProfile.projectGroup || ''}
                  options={projectGroupOptions}
                  placeholder="选择或新增项目分组"
                  addLabel="新增分组"
                  onChange={(value) => setNewProjectProfile((current) => ({ ...current, projectGroup: value }))}
                />
              </label>
            </div>
            <div className="project-management-help-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="primary-action" onClick={() => void createProject()}>创建并进入</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={agentConfirmOpen} onOpenChange={setAgentConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-management-agent-dialog">
            <Dialog.Title>确认执行 Agent 建议</Dialog.Title>
            <Dialog.Description>将执行“{projectAgentLabels[agentRun?.shadowEvaluation?.agentAction || ''] || '下一步'}”，可能产生模型费用并更新当前项目。</Dialog.Description>
            <div className="project-management-agent-actions"><Dialog.Close asChild><button type="button" className="secondary-action">取消</button></Dialog.Close><button type="button" className="primary-action" onClick={() => void executeProjectAgentRecommendation()}>确认执行</button></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={agentContinuousConfirmOpen} onOpenChange={setAgentContinuousConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-management-agent-dialog">
            <Dialog.Title>确认项目协作连续执行</Dialog.Title>
            <Dialog.Description>Agent 将按既有顺序生成尚未完成且已经具备输入的项目模块，可能产生多次模型费用。遇到缺少材料或生成失败会停止，整套导出仍由你确认。</Dialog.Description>
            <div className="project-management-agent-actions"><Dialog.Close asChild><button type="button" className="secondary-action">取消</button></Dialog.Close><button type="button" className="primary-action" onClick={confirmProjectContinuousRun}>开始连续执行</button></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-management-project-dialog is-danger">
            <div className="project-management-help-head">
              <div>
                <Dialog.Title>删除当前项目？</Dialog.Title>
                <Dialog.Description>将删除“{profile.projectName || '未命名项目'}”的 10 个阶段内容和项目档案。删除后会自动切换到其他项目或新建空项目。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭删除项目">×</Dialog.Close>
            </div>
            <div className="project-management-help-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button type="button" className="primary-action danger-action-solid" onClick={() => void deleteCurrentProject()}>确认删除</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default ProjectManagementPage;
