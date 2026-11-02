import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import { officialDocumentTypes, type OfficialDocumentPromptInput, type OfficialDocumentType } from '../../../shared/prompts/officialDocument';

export default function OfficialDocumentInputForm({ input, updateInput }: {
  input: OfficialDocumentPromptInput;
  updateInput: <K extends keyof OfficialDocumentPromptInput>(key: K, value: OfficialDocumentPromptInput[K]) => void;
}) {
  return <div className="official-document-input-sections">
<WorkspaceFormSection title="行文信息" description="明确文种、行文关系、发文主体和接收对象。">
<label className="official-document-field">
                    <span>文种</span>
                    <select value={input.documentType} onChange={(event) => updateInput('documentType', event.target.value as OfficialDocumentType)}>
                      {officialDocumentTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
<label className="official-document-field">
                    <span>行文关系</span>
                    <select value={input.audienceRelation} onChange={(event) => updateInput('audienceRelation', event.target.value)}>
                      <option value="上行">上行</option>
                      <option value="下行">下行</option>
                      <option value="平行">平行</option>
                      <option value="面向公众">面向公众</option>
                    </select>
                  </label>
<label className="official-document-field">
                    <span>发文/讲话主体</span>
                    <input value={input.issuer} placeholder="例如：XX市住房和城乡建设局" onChange={(event) => updateInput('issuer', event.target.value)} />
                  </label>
<label className="official-document-field">
                    <span>面向对象/主送机关</span>
                    <input value={input.recipient} placeholder="例如：各县区住建局、局属各单位" onChange={(event) => updateInput('recipient', event.target.value)} />
                  </label>
</WorkspaceFormSection>
<WorkspaceFormSection title="事实材料" description="交代使用场景和事实依据，生成前请核实数据与时间。">
<label className="official-document-field">
                    <span>使用场景</span>
                    <input value={input.scenario} placeholder="例如：部署安全生产专项排查" onChange={(event) => updateInput('scenario', event.target.value)} />
                  </label>
<label className="official-document-field is-wide">
                    <span>材料要点</span>
                    <textarea value={input.facts} placeholder="粘贴背景、问题、数据、任务、责任单位、截止时间、政策依据等事实材料。" onChange={(event) => updateInput('facts', event.target.value)} />
                  </label>
</WorkspaceFormSection>
<WorkspaceFormSection title="表达要求" description="按需要调整篇幅、语气和特殊要求。">
<label className="official-document-field">
                    <span>篇幅要求</span>
                    <input value={input.length} placeholder="例如：约 800 字 / 1500 字以内" onChange={(event) => updateInput('length', event.target.value)} />
                  </label>
<label className="official-document-field">
                    <span>希望语气</span>
                    <input value={input.tone} placeholder="例如：庄重、平实、克制" onChange={(event) => updateInput('tone', event.target.value)} />
                  </label>
<label className="official-document-field is-wide">
                    <span>特殊要求</span>
                    <input value={input.specialRequirements} placeholder="例如：降低 AI 味、保留小标题、附检查意见" onChange={(event) => updateInput('specialRequirements', event.target.value)} />
                  </label>
</WorkspaceFormSection>
</div>;
}
