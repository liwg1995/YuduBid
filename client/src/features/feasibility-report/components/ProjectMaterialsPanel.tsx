import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAppDialog, useToast } from '../../../shared/ui';
import type { FeasibilityProjectInfo, FeasibilityReportState } from '../types';

interface ProjectMaterialsPanelProps {
  projectId: string;
  state: FeasibilityReportState;
  onStateChange: (state: FeasibilityReportState) => void;
}

const fields: Array<{
  key: keyof FeasibilityProjectInfo;
  label: string;
  placeholder: string;
  wide?: boolean;
  multiline?: boolean;
}> = [
  { key: 'projectName', label: '报告项目名称', placeholder: '例如：某某产业园建设项目' },
  { key: 'industry', label: '所属行业', placeholder: '例如：产业园区、能源、交通' },
  { key: 'constructionUnit', label: '建设单位', placeholder: '填写项目建设单位' },
  { key: 'location', label: '建设地点', placeholder: '填写省、市、区县及具体位置', wide: true },
  { key: 'constructionContent', label: '主要建设内容与规模', placeholder: '概述建设内容、规模、主要设施和服务能力', wide: true, multiline: true },
  { key: 'constructionPeriodYears', label: '建设期（年）', placeholder: '例如：2' },
  { key: 'operationPeriodYears', label: '运营期（年）', placeholder: '例如：20' },
  { key: 'totalInvestment', label: '总投资', placeholder: '例如：12000 万元' },
  { key: 'fundingSource', label: '资金来源', placeholder: '例如：财政资金、企业自筹、银行贷款' },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '保存失败');
}

function hasDownstreamContent(state: FeasibilityReportState) {
  return Boolean(
    state.analysisMarkdown.trim()
    || state.outlineData
    || state.keyParametersMarkdown.trim()
    || Object.keys(state.contentSections).length,
  );
}

export default function ProjectMaterialsPanel({ projectId, state, onStateChange }: ProjectMaterialsPanelProps) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [form, setForm] = useState<FeasibilityProjectInfo>(state.projectInfo);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(state.projectInfo); }, [state.projectInfo]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(state.projectInfo), [form, state.projectInfo]);

  const updateField = (key: keyof FeasibilityProjectInfo, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.projectName.trim()) {
      showToast('请填写报告项目名称', 'info');
      return;
    }
    if (!dirty || saving) return;
    if (hasDownstreamContent(state)) {
      const accepted = await confirm({
        title: '确认更新项目资料',
        description: '项目资料发生变化后，已有资料分析、报告目录、关键参数和正文将被清空，已导入的资料文件会保留。',
        confirmLabel: '更新并清空下游',
      });
      if (!accepted) return;
    }
    setSaving(true);
    try {
      const bridge = window.yibiao?.feasibilityReport;
      if (!bridge) throw new Error('可研报告本地服务尚未就绪');
      const nextState = await bridge.saveProjectInfo({ projectId, projectInfo: form, clearDownstream: true });
      onStateChange(nextState);
      showToast('项目资料已保存', 'success');
    } catch (error) {
      showToast(`保存项目资料失败：${getErrorMessage(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="feasibility-materials-panel" onSubmit={(event) => void save(event)}>
      <section className="feasibility-panel-head">
        <div>
          <h3>项目基础信息</h3>
          <p>这些信息将作为资料分析、目录生成和正文编制的统一项目边界。</p>
        </div>
        <span className={`feasibility-save-state${dirty ? ' is-dirty' : ''}`}>{dirty ? '有未保存修改' : '已保存'}</span>
      </section>

      <div className="feasibility-materials-grid">
        <label className="field-project-type">
          <span>项目类型</span>
          <select value={form.projectType} onChange={(event) => updateField('projectType', event.target.value)}>
            <option value="government">政府投资项目</option>
            <option value="enterprise">企业投资项目</option>
          </select>
        </label>
        {fields.map((field) => (
          <label className={`${field.wide ? 'is-wide ' : ''}field-${field.key}`} key={field.key}>
            <span>{field.label}{field.key === 'projectName' ? ' *' : ''}</span>
            {field.multiline ? (
              <textarea value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)} placeholder={field.placeholder} rows={5} />
            ) : (
              <input value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)} placeholder={field.placeholder} />
            )}
          </label>
        ))}
      </div>

      <div className="feasibility-panel-actions">
        <button type="button" className="secondary-action" disabled={!dirty || saving} onClick={() => setForm(state.projectInfo)}>撤销修改</button>
        <button type="submit" className="primary-action" disabled={!dirty || saving}>{saving ? '正在保存...' : '保存项目资料'}</button>
      </div>
    </form>
  );
}
