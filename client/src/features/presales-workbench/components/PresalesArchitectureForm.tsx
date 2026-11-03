import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import type { PresalesArchitectureInput } from '../types';

export default function PresalesArchitectureForm({ value, onChange, disabled = false }: { value: PresalesArchitectureInput; disabled?: boolean; onChange: (value: PresalesArchitectureInput) => void }) {
  return <div className="presales-input-sections">
      <WorkspaceFormSection disabled={disabled} title="方案边界" description="先明确本次方案范围与技术方向。">
        <label className="is-wide">
          <span>方案范围</span>
          <textarea value={value.solutionScope} onChange={(event) => onChange({ ...value, solutionScope: event.target.value })} placeholder="描述本次方案覆盖的业务范围、系统范围、数据范围、组织范围和明确不包含的边界。" />
        </label>
        <label>
          <span>架构偏好 / 技术路线</span>
          <textarea value={value.architecturePreferences} onChange={(event) => onChange({ ...value, architecturePreferences: event.target.value })} placeholder="例如：云原生、微服务、国产化、低代码、AI/RAG、数据中台、私有化部署等。" />
        </label>
      </WorkspaceFormSection>
      <WorkspaceFormSection disabled={disabled} title="集成与交付" description="补充周边系统、非功能需求及交付约束。">
        <label>
          <span>集成与周边系统</span>
          <textarea value={value.integrationNotes} onChange={(event) => onChange({ ...value, integrationNotes: event.target.value })} placeholder="记录需要对接的现有系统、接口方式、数据流向、同步频率和外部依赖。" />
        </label>
        <label>
          <span>非功能需求</span>
          <textarea value={value.nonFunctionalRequirements} onChange={(event) => onChange({ ...value, nonFunctionalRequirements: event.target.value })} placeholder="性能、可用性、安全、扩展性、审计、容灾、等保、国产化等要求。" />
        </label>
        <label>
          <span>交付约束</span>
          <textarea value={value.deliveryConstraints} onChange={(event) => onChange({ ...value, deliveryConstraints: event.target.value })} placeholder="预算、周期、资源、环境、上线窗口、客户配合、数据迁移等约束。" />
        </label>
      </WorkspaceFormSection>
  </div>;
}
