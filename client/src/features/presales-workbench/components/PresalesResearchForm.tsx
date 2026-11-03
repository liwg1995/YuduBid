import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import type { PresalesResearchInput } from '../types';

export default function PresalesResearchForm({ value, onChange, disabled = false }: { value: PresalesResearchInput; disabled?: boolean; onChange: (value: PresalesResearchInput) => void }) {
  return <div className="presales-input-sections">
      <WorkspaceFormSection disabled={disabled} title="会议安排" description="确认目标、参会角色和时间安排。">
        <label className="is-wide">
          <span>会议目标</span>
          <textarea value={value.meetingGoal} onChange={(event) => onChange({ ...value, meetingGoal: event.target.value })} placeholder="例如：确认业务痛点、补齐现有系统清单、对齐方案方向和下一步资料清单。" />
        </label>
        <label>
          <span>参会信息</span>
          <textarea value={value.attendeeInfo} onChange={(event) => onChange({ ...value, attendeeInfo: event.target.value })} placeholder="记录预计参会部门、角色、决策者、技术负责人、业务代表等。" />
        </label>
        <label>
          <span>会议时长</span>
          <input value={value.timeBox} onChange={(event) => onChange({ ...value, timeBox: event.target.value })} placeholder="例如：60 分钟、90 分钟、半天调研。" />
        </label>
      </WorkspaceFormSection>
      <WorkspaceFormSection disabled={disabled} title="问题准备" description="记录客户已经提出的问题，便于生成调研提纲。">
        <label className="is-wide">
          <span>已知客户问题</span>
          <textarea value={value.knownQuestions} onChange={(event) => onChange({ ...value, knownQuestions: event.target.value })} placeholder="客户已提出的疑问、顾虑、比较对象、预算或周期压力。" />
        </label>
      </WorkspaceFormSection>
  </div>;
}
