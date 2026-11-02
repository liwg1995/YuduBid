import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import type { ProjectManagementProfile } from '../types';
import { profileFields } from '../model/projectManagementPageModel';
import { ProjectDictionarySelect } from './ProjectManagementPageParts';

interface Props {
  profile: ProjectManagementProfile;
  projectTypeOptions: string[];
  projectGroupOptions: string[];
  isRunning: boolean;
  updateProfileField: (key: keyof ProjectManagementProfile, value: string) => void;
}
const groups = [
  { title: '基本信息', fields: profileFields.slice(0, 6) },
  { title: '合同与周期', fields: profileFields.slice(6, 10) },
  { title: '团队与约束', fields: profileFields.slice(10) },
];
export default function ProjectManagementProfileFields({ profile, projectTypeOptions, projectGroupOptions, isRunning, updateProfileField }: Props) {
  return <div className="project-management-profile-sections">{groups.map(group => <WorkspaceFormSection key={group.title} title={group.title}>
                      {group.fields.map((field) => (
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
  </WorkspaceFormSection>)}</div>;
}
