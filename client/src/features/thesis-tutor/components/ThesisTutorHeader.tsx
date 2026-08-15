import * as Dialog from '@radix-ui/react-dialog';
import {
  thesisTutorNoticeItems,
  type ThesisTutorPanelCopy,
} from '../model/thesisTutorPageModel';

interface ThesisTutorHeaderProps {
  panel: ThesisTutorPanelCopy;
  saving: boolean;
  isRunning: boolean;
  exportProjectPackage: () => void;
  exportWorkspace: () => void;
  importWorkspace: () => void;
  clearAll: () => void;
}

export function ThesisTutorHeader({
  panel,
  saving,
  isRunning,
  exportProjectPackage,
  exportWorkspace,
  importWorkspace,
  clearAll,
}: ThesisTutorHeaderProps) {
  const actionsDisabled = saving || isRunning;

  return (
    <header className="thesis-tutor-header">
      <div>
        <div className="thesis-tutor-title-row">
          <span className="thesis-tutor-kicker">论文导师 · {panel.label}</span>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button type="button" className="thesis-tutor-notice-trigger">注意事项</button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="content-regenerate-modal" />
              <Dialog.Content className="thesis-tutor-help-card thesis-tutor-notice-card">
                <div className="thesis-tutor-help-head">
                  <div>
                    <Dialog.Title>论文导师注意事项</Dialog.Title>
                    <Dialog.Description>
                      论文导师的定位是辅助研究和写作管理，不是替你完成整篇论文。
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="detail-help-close" type="button" aria-label="关闭论文导师注意事项">×</Dialog.Close>
                </div>
                <div className="thesis-tutor-notice-list">
                  {thesisTutorNoticeItems.map((item) => <p key={item}>{item}</p>)}
                </div>
                <div className="thesis-tutor-help-tip">
                  建议把它当成“论文教练”和“写作检查员”：你提供真实材料和判断，它帮你把路径、结构、问题和表达整理得更清楚。
                </div>
                <div className="thesis-tutor-help-actions">
                  <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
        <h2>{panel.title}</h2>
        <p>{panel.description}</p>
      </div>
      <div className="thesis-tutor-actions">
        <button type="button" className="secondary-action" onClick={exportProjectPackage} disabled={actionsDisabled}>导出项目包</button>
        <button type="button" className="secondary-action" onClick={exportWorkspace} disabled={actionsDisabled}>导出备份</button>
        <button type="button" className="secondary-action" onClick={importWorkspace} disabled={actionsDisabled}>导入备份/项目包</button>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button type="button" className="secondary-action is-danger" disabled={actionsDisabled}>清空</button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="content-regenerate-modal" />
            <Dialog.Content className="thesis-tutor-help-card thesis-tutor-clear-card">
              <div className="thesis-tutor-help-head">
                <div>
                  <Dialog.Title>清空论文导师工作区？</Dialog.Title>
                  <Dialog.Description>
                    清空会移除论文档案、阶段成果、章节工作区、文献证据、导师反馈、格式检查清单和历史记录。建议先导出备份，再继续清空。
                  </Dialog.Description>
                </div>
                <Dialog.Close className="detail-help-close" type="button" aria-label="关闭清空确认">×</Dialog.Close>
              </div>
              <div className="thesis-tutor-help-tip">
                导出的备份可以在之后通过“导入备份”恢复，用于换电脑、回滚误改或保留不同论文版本。
              </div>
              <div className="thesis-tutor-help-actions">
                <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
                <Dialog.Close asChild>
                  <button type="button" className="secondary-action" onClick={exportWorkspace}>先导出备份</button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <button type="button" className="secondary-action is-danger" onClick={clearAll}>仍然清空</button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
