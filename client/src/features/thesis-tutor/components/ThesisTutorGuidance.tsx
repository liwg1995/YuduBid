import * as Dialog from '@radix-ui/react-dialog';
import {
  panelCopy,
  panelOrder,
  thesisTutorFlowModules,
  thesisTutorUsageSteps,
} from '../model/thesisTutorPageModel';

interface ThesisTutorGuidanceProps {
  missingTextModelFields: string[];
  isFirstRun: boolean;
  saving: boolean;
  isRunning: boolean;
  navigateToSettings: () => void;
  startDiagnosisTemplate: () => void;
  importSource: () => void;
  generate: () => void;
}

export function ThesisTutorGuidance({
  missingTextModelFields,
  isFirstRun,
  saving,
  isRunning,
  navigateToSettings,
  startDiagnosisTemplate,
  importSource,
  generate,
}: ThesisTutorGuidanceProps) {
  const actionsDisabled = saving || isRunning;

  return (
    <>
      {missingTextModelFields.length > 0 && (
        <section className="thesis-tutor-config-notice">
          <div>
            <strong>文本模型尚未配置完整</strong>
            <span>请先到“设置 - 文本模型”完善{missingTextModelFields.join('、')}，否则无法生成论文导师回复。</span>
          </div>
          <button type="button" className="secondary-action" onClick={navigateToSettings}>去设置</button>
        </section>
      )}

      <section className="thesis-tutor-help-strip">
        <div>
          <strong>第一次使用论文导师？</strong>
          <span>先在启动诊断建立论文档案；后续模块会显示摘要并自动带入上下文。</span>
        </div>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button type="button" className="secondary-action">如何使用？</button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="content-regenerate-modal" />
            <Dialog.Content className="thesis-tutor-help-card">
              <div className="thesis-tutor-help-head">
                <div>
                  <Dialog.Title>论文导师使用方法</Dialog.Title>
                  <Dialog.Description>
                    论文导师是一个论文全过程工作台：先建档和诊断，再按模块推进选题、综述、研究设计、数据实证、图表模型、成稿、修改和检查。
                  </Dialog.Description>
                </div>
                <Dialog.Close className="detail-help-close" type="button" aria-label="关闭论文导师使用方法">×</Dialog.Close>
              </div>
              <div className="thesis-tutor-help-flow">
                <strong>推荐使用顺序</strong>
                <div>
                  {panelOrder.map((item) => <span key={item}>{panelCopy[item].label}</span>)}
                </div>
              </div>
              <div className="thesis-tutor-help-steps">
                {thesisTutorUsageSteps.map((item, index) => (
                  <article key={item.title}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="thesis-tutor-help-modules">
                <strong>各模块主要做什么</strong>
                <div>
                  {thesisTutorFlowModules.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
              <div className="thesis-tutor-help-lock">
                <strong>关于论文档案和锁定</strong>
                <p>论文档案是全流程上下文，不是每个模块都要重复填写的表单。完整档案默认放在启动诊断里维护；其它模块只显示摘要，生成时仍会自动带入。需要修改题目、阶段或引用格式时，再展开编辑或回到启动诊断。</p>
              </div>
              <div className="thesis-tutor-help-tip">
                小建议：如果结果太泛，通常不是模块选错，而是“本次需求”和“材料区”太少。把导师要求、文献摘要、数据说明或真实草稿贴进去；需要长期复用的内容，再沉淀到证据链、章节、反馈或检查清单。
              </div>
              <div className="thesis-tutor-help-actions">
                <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </section>

      {isFirstRun && (
        <section className="thesis-tutor-onboarding">
          <div>
            <strong>从这里开始论文导师</strong>
            <span>先确定阶段和卡点，再把导师要求、培养方案或已有材料导入进来。系统会把后续结果沉淀成论文档案、证据链、章节和检查清单。</span>
          </div>
          <div className="thesis-tutor-empty-actions">
            <button type="button" className="secondary-action" onClick={startDiagnosisTemplate} disabled={actionsDisabled}>填入诊断模板</button>
            <button type="button" className="secondary-action" onClick={importSource} disabled={actionsDisabled}>导入导师要求</button>
            <button type="button" className="primary-action" onClick={generate} disabled={actionsDisabled}>先生成诊断</button>
          </div>
        </section>
      )}
    </>
  );
}
