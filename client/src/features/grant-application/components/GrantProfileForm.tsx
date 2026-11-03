import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import type { GrantApplicationProfile } from '../types';

export default function GrantProfileForm({ profile, onProfileChange, projectName, onProjectNameChange }: {
  profile: GrantApplicationProfile;
  onProfileChange: (field: keyof GrantApplicationProfile, value: string) => void;
  projectName?: string;
  onProjectNameChange?: (value: string) => void;
}) {
  return <div className="grant-application-profile-sections">
    {onProjectNameChange && <WorkspaceFormSection title="项目名称"><label className="is-wide"><span>项目名称</span><input value={projectName || ''} onChange={event => onProjectNameChange(event.target.value)} placeholder="例如：市级课题-分层作业设计研究" autoFocus /></label></WorkspaceFormSection>}
    <WorkspaceFormSection title="研究定位" description="明确申报级别、学科与研究方向。">
      <label>
        <span>课题级别</span>
        <select value={profile.level} onChange={(event) => onProfileChange('level', event.target.value)}>
          <option>校级</option>
          <option>县级</option>
          <option>市级</option>
          <option>省级</option>
          <option>国家级</option>
          <option>不确定</option>
        </select>
      </label>
      <label>
        <span>学科领域</span>
        <select value={profile.discipline} onChange={(event) => onProfileChange('discipline', event.target.value)}>
          <option>教育学</option>
          <option>医学/临床</option>
          <option>工程技术</option>
          <option>农业科学</option>
          <option>艺术/体育</option>
          <option>基础科学</option>
          <option>其他</option>
        </select>
      </label>
      <label className="is-wide">
        <span>研究方向</span>
        <input value={profile.direction} onChange={(event) => onProfileChange('direction', event.target.value)} placeholder="一句话描述课题方向" />
      </label>
    </WorkspaceFormSection>
    <WorkspaceFormSection title="申报安排" description="阶段、截止时间和已有基础供后续各阶段引用。">
      <label>
        <span>当前阶段</span>
        <select value={profile.stage} onChange={(event) => onProfileChange('stage', event.target.value)}>
          <option>准备申报</option>
          <option>已有方向</option>
          <option>已有草稿</option>
          <option>等待评审</option>
          <option>答辩准备</option>
          <option>立项实施</option>
        </select>
      </label>
      <label>
        <span>截止时间</span>
        <input type="date" value={profile.deadline} onChange={(event) => onProfileChange('deadline', event.target.value)} />
      </label>
      <label className="is-wide">
        <span>基础说明</span>
        <textarea value={profile.sourceNotes} onChange={(event) => onProfileChange('sourceNotes', event.target.value)} placeholder="补充团队基础、学校场景、已有成果、数据来源或申报限制。" />
      </label>
    </WorkspaceFormSection>
  </div>;
}
