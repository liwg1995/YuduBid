import type { ToastType } from '../../../shared/ui/ToastProvider';
import type { ProjectManagementState } from '../types';

type ModuleId = 'planning' | 'discovery' | 'execution' | 'risk' | 'stakeholder'
  | 'delivery' | 'reporting' | 'commercial' | 'retrospective' | 'compliance';

type WorkspaceData = Pick<ProjectManagementState,
  | 'profile'
  | 'planningInput' | 'planningResult'
  | 'discoveryInput' | 'discoveryResult'
  | 'executionInput' | 'executionResult'
  | 'riskInput' | 'riskResult'
  | 'stakeholderInput' | 'stakeholderResult'
  | 'deliveryInput' | 'deliveryResult'
  | 'reportingInput' | 'reportingResult'
  | 'commercialInput' | 'commercialResult'
  | 'retrospectiveInput' | 'retrospectiveResult'
  | 'complianceInput' | 'complianceResult'
>;

type ShowToast = (message: string, type?: ToastType) => void;

interface ModuleOperation {
  saveInput: () => Promise<void>;
  generate: () => Promise<void>;
  saveResult: () => Promise<void>;
}

interface ModuleActionConfig {
  moduleId: ModuleId;
  saveInput: () => Promise<ProjectManagementState>;
  generate: () => Promise<ProjectManagementState>;
  saveResult: () => Promise<ProjectManagementState>;
  messages: {
    inputSaved: string;
    inputSaveFailed: string;
    generated: string;
    generateFailed: string;
    resultSaved: string;
    resultSaveFailed: string;
  };
}

interface UseProjectManagementModuleOperationsOptions {
  workspace: WorkspaceData;
  applyState: (state: ProjectManagementState) => void;
  showResultEditor: (moduleId: ModuleId) => void;
  showToast: ShowToast;
}

export function useProjectManagementModuleOperations({
  workspace,
  applyState,
  showResultEditor,
  showToast,
}: UseProjectManagementModuleOperationsOptions): Record<ModuleId, ModuleOperation> {
  function getApi() {
    const api = window.yibiao?.projectManagement;
    if (!api) throw new Error('项目管理服务不可用，请重启应用后重试');
    return api;
  }

  async function runAction(
    action: () => Promise<ProjectManagementState>,
    successMessage: string,
    failureMessage: string,
    generatedModuleId?: ModuleId,
  ) {
    try {
      const nextState = await action();
      if (nextState) applyState(nextState);
      if (generatedModuleId) showResultEditor(generatedModuleId);
      showToast(successMessage, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : failureMessage, 'error');
    }
  }

  function createOperations(config: ModuleActionConfig): ModuleOperation {
    return {
      saveInput: () => runAction(
        config.saveInput,
        config.messages.inputSaved,
        config.messages.inputSaveFailed,
      ),
      generate: () => runAction(
        config.generate,
        config.messages.generated,
        config.messages.generateFailed,
        config.moduleId,
      ),
      saveResult: () => runAction(
        config.saveResult,
        config.messages.resultSaved,
        config.messages.resultSaveFailed,
      ),
    };
  }

  const commonContext = {
    profile: workspace.profile,
    planningResult: workspace.planningResult,
    discoveryResult: workspace.discoveryResult,
    executionResult: workspace.executionResult,
    riskResult: workspace.riskResult,
    stakeholderResult: workspace.stakeholderResult,
    deliveryResult: workspace.deliveryResult,
    reportingResult: workspace.reportingResult,
    commercialResult: workspace.commercialResult,
    retrospectiveResult: workspace.retrospectiveResult,
  };

  return {
    planning: createOperations({
      moduleId: 'planning',
      saveInput: () => getApi().savePlanningInput(workspace.planningInput),
      generate: () => getApi().generatePlanning({ profile: workspace.profile, planningInput: workspace.planningInput }),
      saveResult: () => getApi().savePlanningResult({ planningResult: workspace.planningResult }),
      messages: {
        inputSaved: '启动材料已保存', inputSaveFailed: '保存启动材料失败',
        generated: '项目启动与规划方案已生成', generateFailed: '生成项目启动与规划方案失败',
        resultSaved: '规划方案已保存', resultSaveFailed: '保存规划方案失败',
      },
    }),
    discovery: createOperations({
      moduleId: 'discovery',
      saveInput: () => getApi().saveDiscoveryInput(workspace.discoveryInput),
      generate: () => getApi().generateDiscovery({ ...commonContext, discoveryInput: workspace.discoveryInput }),
      saveResult: () => getApi().saveDiscoveryResult({ discoveryResult: workspace.discoveryResult }),
      messages: {
        inputSaved: '需求材料已保存', inputSaveFailed: '保存需求材料失败',
        generated: '需求分析与 PRD 框架已生成', generateFailed: '生成需求分析与 PRD 框架失败',
        resultSaved: '需求与 PRD 结果已保存', resultSaveFailed: '保存需求与 PRD 结果失败',
      },
    }),
    execution: createOperations({
      moduleId: 'execution',
      saveInput: () => getApi().saveExecutionInput(workspace.executionInput),
      generate: () => getApi().generateExecution({ ...commonContext, executionInput: workspace.executionInput }),
      saveResult: () => getApi().saveExecutionResult({ executionResult: workspace.executionResult }),
      messages: {
        inputSaved: '排期材料已保存', inputSaveFailed: '保存排期材料失败',
        generated: '排期与推进计划已生成', generateFailed: '生成排期与推进计划失败',
        resultSaved: '排期与推进计划已保存', resultSaveFailed: '保存排期与推进计划失败',
      },
    }),
    risk: createOperations({
      moduleId: 'risk',
      saveInput: () => getApi().saveRiskInput(workspace.riskInput),
      generate: () => getApi().generateRisk({ ...commonContext, riskInput: workspace.riskInput }),
      saveResult: () => getApi().saveRiskResult({ riskResult: workspace.riskResult }),
      messages: {
        inputSaved: '风险材料已保存', inputSaveFailed: '保存风险材料失败',
        generated: '风险问题方案已生成', generateFailed: '生成风险问题方案失败',
        resultSaved: '风险问题方案已保存', resultSaveFailed: '保存风险问题方案失败',
      },
    }),
    stakeholder: createOperations({
      moduleId: 'stakeholder',
      saveInput: () => getApi().saveStakeholderInput(workspace.stakeholderInput),
      generate: () => getApi().generateStakeholder({ ...commonContext, stakeholderInput: workspace.stakeholderInput }),
      saveResult: () => getApi().saveStakeholderResult({ stakeholderResult: workspace.stakeholderResult }),
      messages: {
        inputSaved: '沟通变更材料已保存', inputSaveFailed: '保存沟通变更材料失败',
        generated: '沟通变更方案已生成', generateFailed: '生成沟通变更方案失败',
        resultSaved: '沟通变更方案已保存', resultSaveFailed: '保存沟通变更方案失败',
      },
    }),
    delivery: createOperations({
      moduleId: 'delivery',
      saveInput: () => getApi().saveDeliveryInput(workspace.deliveryInput),
      generate: () => getApi().generateDelivery({ ...commonContext, deliveryInput: workspace.deliveryInput }),
      saveResult: () => getApi().saveDeliveryResult({ deliveryResult: workspace.deliveryResult }),
      messages: {
        inputSaved: '交付上线材料已保存', inputSaveFailed: '保存交付上线材料失败',
        generated: '交付上线方案已生成', generateFailed: '生成交付上线方案失败',
        resultSaved: '交付上线方案已保存', resultSaveFailed: '保存交付上线方案失败',
      },
    }),
    reporting: createOperations({
      moduleId: 'reporting',
      saveInput: () => getApi().saveReportingInput(workspace.reportingInput),
      generate: () => getApi().generateReporting({ ...commonContext, reportingInput: workspace.reportingInput }),
      saveResult: () => getApi().saveReportingResult({ reportingResult: workspace.reportingResult }),
      messages: {
        inputSaved: '汇报材料已保存', inputSaveFailed: '保存汇报材料失败',
        generated: '汇报材料已生成', generateFailed: '生成汇报材料失败',
        resultSaved: '汇报材料已保存', resultSaveFailed: '保存汇报材料失败',
      },
    }),
    commercial: createOperations({
      moduleId: 'commercial',
      saveInput: () => getApi().saveCommercialInput(workspace.commercialInput),
      generate: () => getApi().generateCommercial({ ...commonContext, commercialInput: workspace.commercialInput }),
      saveResult: () => getApi().saveCommercialResult({ commercialResult: workspace.commercialResult }),
      messages: {
        inputSaved: '商务回款材料已保存', inputSaveFailed: '保存商务回款材料失败',
        generated: '商务回款方案已生成', generateFailed: '生成商务回款方案失败',
        resultSaved: '商务回款方案已保存', resultSaveFailed: '保存商务回款方案失败',
      },
    }),
    retrospective: createOperations({
      moduleId: 'retrospective',
      saveInput: () => getApi().saveRetrospectiveInput(workspace.retrospectiveInput),
      generate: () => getApi().generateRetrospective({ ...commonContext, retrospectiveInput: workspace.retrospectiveInput }),
      saveResult: () => getApi().saveRetrospectiveResult({ retrospectiveResult: workspace.retrospectiveResult }),
      messages: {
        inputSaved: '复盘材料已保存', inputSaveFailed: '保存复盘材料失败',
        generated: '复盘沉淀报告已生成', generateFailed: '生成复盘沉淀报告失败',
        resultSaved: '复盘沉淀报告已保存', resultSaveFailed: '保存复盘沉淀报告失败',
      },
    }),
    compliance: createOperations({
      moduleId: 'compliance',
      saveInput: () => getApi().saveComplianceInput(workspace.complianceInput),
      generate: () => getApi().generateCompliance({ ...commonContext, complianceInput: workspace.complianceInput }),
      saveResult: () => getApi().saveComplianceResult({ complianceResult: workspace.complianceResult }),
      messages: {
        inputSaved: '合规材料已保存', inputSaveFailed: '保存合规材料失败',
        generated: '合规本土化方案已生成', generateFailed: '生成合规本土化方案失败',
        resultSaved: '合规本土化方案已保存', resultSaveFailed: '保存合规本土化方案失败',
      },
    }),
  };
}
