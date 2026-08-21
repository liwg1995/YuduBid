import type { FeasibilityReportStep } from '../../shared/types/contracts/feasibilityReport';

export type {
  FeasibilityBackgroundTaskState,
  FeasibilityContentSectionState,
  FeasibilityContentGenerationOptions,
  FeasibilityOutlineTemplate,
  FeasibilityProjectInfo,
  FeasibilityProjectList,
  FeasibilityProjectPayload,
  FeasibilityProjectRecord,
  FeasibilityProjectType,
  FeasibilityReportState,
  FeasibilityReportStep,
  FeasibilitySourceFile,
  FeasibilityTaskEvent,
} from '../../shared/types/contracts/feasibilityReport';

export interface FeasibilityStepDefinition {
  id: FeasibilityReportStep;
  label: string;
  description: string;
}

export const FEASIBILITY_STEPS: FeasibilityStepDefinition[] = [
  { id: 'materials', label: '项目资料', description: '项目基本信息与建设边界' },
  { id: 'sources', label: '资料文件', description: '导入、解析与核对原始资料' },
  { id: 'analysis', label: '资料分析', description: '提取事实、缺口与编制依据' },
  { id: 'outline', label: '报告目录', description: '选择模板并组织报告结构' },
  { id: 'parameters', label: '关键参数', description: '统一投资、周期与指标口径' },
  { id: 'content', label: '正文生成', description: '逐节生成、编辑、审校与导出' },
];
