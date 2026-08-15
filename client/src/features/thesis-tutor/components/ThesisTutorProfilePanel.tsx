import type { ThesisTutorPanel, ThesisTutorProfile } from '../types';
import {
  citationOptions,
  degreeOptions,
  degreeTypeOptions,
  panelCopy,
  profileUsageByPanel,
  researchTypeOptions,
  stageOptions,
  writingScopeOptions,
} from '../model/thesisTutorPageModel';

interface ThesisTutorProfilePanelProps {
  activePanel: ThesisTutorPanel;
  profile: ThesisTutorProfile;
  profileLocked: boolean;
  expanded: boolean;
  saving: boolean;
  isRunning: boolean;
  setExpanded: (expanded: boolean) => void;
  updateProfile: <K extends keyof ThesisTutorProfile>(key: K, value: ThesisTutorProfile[K]) => void;
  saveProfile: () => void;
  toggleProfileLock: () => void;
  returnToDiagnosis: () => void;
}

export function ThesisTutorProfilePanel({
  activePanel,
  profile,
  profileLocked,
  expanded,
  saving,
  isRunning,
  setExpanded,
  updateProfile,
  saveProfile,
  toggleProfileLock,
  returnToDiagnosis,
}: ThesisTutorProfilePanelProps) {
  const shouldShowFullProfilePanel = activePanel === 'diagnosis' || expanded;
  const profileSummaryItems = [
    ['学位/类型', `${profile.degree || '未填写'} / ${profile.degreeType || '未填写'}`],
    ['专业方向', `${profile.discipline || '未填写'}${profile.direction ? ` / ${profile.direction}` : ''}`],
    ['当前阶段', profile.stage || '未填写'],
    ['引用格式', profile.citationFormat || '未填写'],
    ['论文题目', profile.title || '未定题'],
    ['档案状态', profileLocked ? '已锁定' : '可编辑'],
  ];
  const panel = panelCopy[activePanel];

  if (!shouldShowFullProfilePanel) {
    return (
      <section className="thesis-tutor-panel thesis-tutor-profile-summary-panel">
        <div className="thesis-tutor-profile-summary-main">
          <div>
            <strong>论文档案已作为本模块上下文带入</strong>
            <span>这里不再重复展示完整表单；题目、方向、阶段和引用格式会自动用于本次生成。</span>
          </div>
          <div className="thesis-tutor-profile-summary-chips">
            {profileSummaryItems.map(([label, value]) => (
              <span key={label}><b>{label}</b>{value}</span>
            ))}
          </div>
        </div>
        <div className="thesis-tutor-profile-summary-side">
          <div className="thesis-tutor-context-note">
            <strong>{panel.label}会重点使用</strong>
            <div>
              {profileUsageByPanel[activePanel].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <div className="thesis-tutor-profile-summary-actions">
            <button type="button" className="secondary-action" onClick={() => setExpanded(true)}>展开编辑档案</button>
            <button type="button" className="secondary-action" onClick={returnToDiagnosis}>回到启动诊断</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="thesis-tutor-panel thesis-tutor-profile-panel">
      <div className="thesis-tutor-panel-head thesis-tutor-profile-head">
        <div>
          <strong>论文档案（全流程生成上下文）</strong>
          <span>{activePanel === 'diagnosis' ? '建议先在启动诊断阶段确认一次；后续选题、综述、研究设计、写作和答辩都会沿用这份档案。' : '你正在临时展开编辑档案；保存后会继续作为后续模块上下文。'}</span>
        </div>
        <div className="thesis-tutor-profile-actions">
          {activePanel !== 'diagnosis' && (
            <button type="button" className="secondary-action" onClick={() => setExpanded(false)}>收起档案</button>
          )}
          <button type="button" className="secondary-action" onClick={toggleProfileLock} disabled={saving || isRunning}>
            {profileLocked ? '解锁档案' : '锁定档案'}
          </button>
          <button type="button" className="secondary-action" onClick={saveProfile} disabled={saving || isRunning || profileLocked}>保存档案</button>
        </div>
      </div>
      <div className="thesis-tutor-profile-guidance">
        <strong>{profileLocked ? '档案已锁定' : profile.title.trim() || profile.discipline.trim() || profile.direction.trim() ? '档案可继续沿用' : '先补全基础档案'}</strong>
        <span>{profileLocked ? '后续模块会继续使用当前档案；如需修改题目、阶段或引用格式，请先解锁。' : '题目、方向、阶段或引用格式发生变化时再回来调整；未变化时，后续模块会自动带入这些信息。'}</span>
      </div>
      <div className="thesis-tutor-context-note">
        <strong>{panel.label}会重点使用</strong>
        <div>
          {profileUsageByPanel[activePanel].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <fieldset className="thesis-tutor-profile-fieldset" disabled={profileLocked || isRunning}>
        <div className="thesis-tutor-form-grid thesis-tutor-profile-grid">
          <label>
            <span>学位</span>
            <select value={profile.degree} onChange={(event) => updateProfile('degree', event.target.value)}>
              {degreeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select value={profile.degreeType} onChange={(event) => updateProfile('degreeType', event.target.value)}>
              {degreeTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>专业</span>
            <input value={profile.discipline} onChange={(event) => updateProfile('discipline', event.target.value)} placeholder="如 管理学、计算机科学" />
          </label>
          <label>
            <span>方向</span>
            <input value={profile.direction} onChange={(event) => updateProfile('direction', event.target.value)} placeholder="如 数字治理、教育技术" />
          </label>
          <label>
            <span>语种</span>
            <input value={profile.language} onChange={(event) => updateProfile('language', event.target.value)} placeholder="中文/英文" />
          </label>
          <label>
            <span>当前阶段</span>
            <select value={profile.stage} onChange={(event) => updateProfile('stage', event.target.value)}>
              {stageOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>引用格式</span>
            <select value={profile.citationFormat} onChange={(event) => updateProfile('citationFormat', event.target.value)}>
              {citationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="is-full">
            <span>论文题目</span>
            <input value={profile.title} onChange={(event) => updateProfile('title', event.target.value)} placeholder="未定题可留空；确定后会作为后续模块边界" />
          </label>
        </div>
        <details className="thesis-tutor-profile-extra">
          <summary>
            <strong>补充档案</strong>
            <span>学校要求、导师偏好、时间节点、数据源和章节计划，填写后会一起进入后续生成上下文。</span>
          </summary>
          <div className="thesis-tutor-profile-extra-grid">
            <label>
              <span>学校/学院要求</span>
              <textarea value={profile.schoolRequirements} onChange={(event) => updateProfile('schoolRequirements', event.target.value)} placeholder="如格式模板、开题要求、字数、查重比例、学院特别要求。" />
            </label>
            <label>
              <span>导师偏好</span>
              <textarea value={profile.advisorPreferences} onChange={(event) => updateProfile('advisorPreferences', event.target.value)} placeholder="如导师偏好的研究方法、写作风格、重点关注问题或不希望采用的方向。" />
            </label>
            <label>
              <span>时间节点</span>
              <textarea value={profile.milestones} onChange={(event) => updateProfile('milestones', event.target.value)} placeholder="如开题、中期、初稿、预答辩、正式答辩的时间安排。" />
            </label>
            <label>
              <span>可用数据源</span>
              <textarea value={profile.dataSources} onChange={(event) => updateProfile('dataSources', event.target.value)} placeholder="如问卷、访谈对象、案例公司、公开数据、项目资料或政策文件。" />
            </label>
            <label>
              <span>研究类型</span>
              <select value={profile.researchType} onChange={(event) => updateProfile('researchType', event.target.value)}>
                {researchTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>成稿范围</span>
              <select value={profile.writingScope} onChange={(event) => updateProfile('writingScope', event.target.value)}>
                {writingScopeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>目标字数</span>
              <textarea value={profile.targetWordCount} onChange={(event) => updateProfile('targetWordCount', event.target.value)} placeholder="如整篇 12000 字、第一章约 2500 字、摘要 300 字。" />
            </label>
            <label>
              <span>数据/材料真实性说明</span>
              <textarea value={profile.dataIntegrityNotes} onChange={(event) => updateProfile('dataIntegrityNotes', event.target.value)} placeholder="说明哪些材料已确认真实，哪些文献/数据还待核验；没有真实数据时请明确写清。" />
            </label>
            <label>
              <span>已定研究问题</span>
              <textarea value={profile.researchQuestions} onChange={(event) => updateProfile('researchQuestions', event.target.value)} placeholder="如核心研究问题、子问题、假设或待验证观点。" />
            </label>
            <label>
              <span>方法/变量/样本条件</span>
              <textarea value={profile.methodologyNotes} onChange={(event) => updateProfile('methodologyNotes', event.target.value)} placeholder="如量化/质性/案例研究、变量设想、样本范围、访谈对象或分析工具。" />
            </label>
            <label>
              <span>论文目录或章节计划</span>
              <textarea value={profile.outlinePlan} onChange={(event) => updateProfile('outlinePlan', event.target.value)} placeholder="如第一章绪论、第二章文献综述、第三章研究设计等已有目录。" />
            </label>
            <label>
              <span>已有文献线索</span>
              <textarea value={profile.literatureNotes} onChange={(event) => updateProfile('literatureNotes', event.target.value)} placeholder="如核心文献、作者年份、关键词、数据库检索式或文献清单摘要。" />
            </label>
          </div>
        </details>
      </fieldset>
    </section>
  );
}
