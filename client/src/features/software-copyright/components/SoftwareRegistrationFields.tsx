import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import type { SoftwareCopyrightFields } from '../types';

const basicFieldRows: Array<{ key: keyof SoftwareCopyrightFields; label: string; placeholder?: string; inputType?: 'text' | 'date' }> = [
  { key: 'softwareName', label: '软件全称', placeholder: '例如：禹都AI解决方案助手软件' },
  { key: 'shortName', label: '软件简称', placeholder: '可选' },
  { key: 'version', label: '版本号', placeholder: 'V1.0' },
  { key: 'category', label: '软件分类', placeholder: '应用软件' },
  { key: 'developmentCompletedDate', label: '开发完成日期', inputType: 'date' },
  { key: 'developmentMode', label: '开发方式', placeholder: '单独开发' },
  { key: 'softwareDescription', label: '软件说明', placeholder: '原创' },
  { key: 'publishStatus', label: '发表状态', placeholder: '未发表' },
  { key: 'firstPublishDate', label: '首次发表日期', inputType: 'date' },
  { key: 'copyrightOwner', label: '著作权人', placeholder: '国家/省市/类型/姓名或单位/证件信息' },
];

const environmentFieldRows: Array<{ key: keyof SoftwareCopyrightFields; label: string; placeholder?: string }> = [
  { key: 'developmentHardware', label: '开发硬件环境', placeholder: '≤50字符，例如 Intel i7/16GB/512GB' },
  { key: 'runningHardware', label: '运行硬件环境', placeholder: '≤50字符，可沿用开发硬件' },
  { key: 'developmentOs', label: '开发操作系统', placeholder: '例如 Windows 11 / macOS 15' },
  { key: 'developmentTools', label: '开发环境 / 工具', placeholder: '开发环境: Windows 11/开发工具: VS Code' },
  { key: 'runningPlatform', label: '运行平台 / 操作系统', placeholder: '例如 Windows 10 及以上' },
  { key: 'runtimeSupport', label: '运行支撑环境', placeholder: '例如 Electron、Node.js、Chromium' },
  { key: 'programmingLanguage', label: '编程语言', placeholder: 'TypeScript、JavaScript' },
  { key: 'sourceLineCount', label: '源程序量', placeholder: '纯数字' },
  { key: 'developmentPurpose', label: '开发目的', placeholder: '≤50字符' },
  { key: 'industry', label: '面向领域 / 行业', placeholder: '≤50字符' },
];

interface FieldsProps { fields: SoftwareCopyrightFields; updateField: (key: keyof SoftwareCopyrightFields, value: string) => void; disabled: boolean }
function FieldRows({ rows, fields, updateField, disabled }: FieldsProps & { rows: typeof basicFieldRows }) {
  return <>{rows.map(field => <label className="software-copyright-field" data-software-copyright-field={field.key} key={field.key}>
    <span>{field.label}</span><input type={field.inputType || 'text'} value={fields[field.key]} placeholder={field.placeholder} onChange={event => updateField(field.key, event.target.value)} disabled={disabled} />
  </label>)}</>;
}
export function SoftwareBasicFields(props: FieldsProps) {
  return <div className="software-registration-sections">
    <WorkspaceFormSection title="软件标识" description="名称、版本和分类将用于登记材料。"><FieldRows {...props} rows={basicFieldRows.slice(0, 4)} /></WorkspaceFormSection>
    <WorkspaceFormSection title="开发与权属" description="核对开发情况、发表时间和著作权人信息。"><FieldRows {...props} rows={basicFieldRows.slice(4)} /></WorkspaceFormSection>
  </div>;
}
export function SoftwareEnvironmentFields(props: FieldsProps) {
  return <div className="software-registration-sections">
    <WorkspaceFormSection title="开发与运行环境" description="分别填写开发条件与用户运行条件。"><FieldRows {...props} rows={environmentFieldRows.slice(0, 6)} /></WorkspaceFormSection>
    <WorkspaceFormSection title="技术与应用范围" description="说明语言、代码规模、开发目的和适用行业。"><FieldRows {...props} rows={environmentFieldRows.slice(6)} /></WorkspaceFormSection>
  </div>;
}
