import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import type { PresalesAnalysisInput } from '../types';

export default function PresalesAnalysisForm({ value, onChange, disabled = false }: { value: PresalesAnalysisInput; disabled?: boolean; onChange: (value: PresalesAnalysisInput) => void }) {
  return <div className="presales-input-sections">
      <WorkspaceFormSection disabled={disabled} title="分析重点" description="优先填写本轮重点，无需重复粘贴已导入材料。">
        <label className="is-wide">
          <span>分析重点 / 关注口径</span>
          <textarea value={value.rawNotes} onChange={(event) => onChange({ ...value, rawNotes: event.target.value })} placeholder="例如：重点判断决策链、国产化要求、预算风险、客户真实痛点优先级。无需重复粘贴客户材料。" />
        </label>
      </WorkspaceFormSection>
      <WorkspaceFormSection disabled={disabled} title="补充判断" description="只补充材料未覆盖的信息，不确定的内容可留空。">
        <label>
          <span>现有系统补充</span>
          <textarea value={value.knownSystems} onChange={(event) => onChange({ ...value, knownSystems: event.target.value })} placeholder="只填写客户材料未覆盖的系统、数据、接口或部署补充信息。" />
        </label>
        <label>
          <span>痛点判断补充</span>
          <textarea value={value.businessPainPoints} onChange={(event) => onChange({ ...value, businessPainPoints: event.target.value })} placeholder="对痛点优先级、根因、影响范围的补充判断；不确定可留空。" />
        </label>
        <label>
          <span>干系人判断补充</span>
          <textarea value={value.stakeholders} onChange={(event) => onChange({ ...value, stakeholders: event.target.value })} placeholder="补充谁可能拍板、谁影响方案、谁负责技术确认、谁可能提出异议。" />
        </label>
        <label>
          <span>约束判断补充</span>
          <textarea value={value.constraints} onChange={(event) => onChange({ ...value, constraints: event.target.value })} placeholder="补充预算、周期、合规、安全、国产化、审批等约束的判断或假设。" />
        </label>
      </WorkspaceFormSection>
  </div>;
}
