import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { SoftwareCopyrightManualScreenshot } from '../types';

interface ManualScreenshotManagerProps {
  screenshots: SoftwareCopyrightManualScreenshot[];
  placeholders?: string[];
  disabled?: boolean;
  onImport: () => void;
  onCaptionChange: (id: string, caption: string) => void;
  onPlacementChange: (id: string, placement: string) => void;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
}

export function ManualScreenshotManager({ screenshots, placeholders = [], disabled, onImport, onCaptionChange, onPlacementChange, onReorder, onRemove }: ManualScreenshotManagerProps) {
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<SoftwareCopyrightManualScreenshot | null>(null);

  useEffect(() => {
    setCaptions(Object.fromEntries(screenshots.map((item) => [item.id, item.caption])));
  }, [screenshots]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= screenshots.length) return;
    const ids = screenshots.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    onReorder(ids);
  }

  return (
    <div className="software-copyright-screenshot-manager">
      <div className="software-copyright-screenshot-head">
        <div>
          <strong>操作手册截图</strong>
          <span>按当前顺序写入 Word 附录，支持 PNG、JPG，单张不超过 15MB。</span>
        </div>
        <button type="button" className="secondary-action" onClick={onImport} disabled={disabled || screenshots.length >= 30}>
          {screenshots.length >= 30 ? '已达30张上限' : '导入截图'}
        </button>
      </div>

      {screenshots.length ? (
        <div className="software-copyright-screenshot-list">
          {screenshots.map((item, index) => (
            <article className="software-copyright-screenshot-row" key={item.id}>
              <div className="software-copyright-screenshot-preview">
                <img src={item.assetUrl} alt={item.caption || item.name} />
                <span>{index + 1}</span>
              </div>
              <div className="software-copyright-screenshot-content">
                <strong title={item.name}>{item.name}</strong>
                <span>{item.width} × {item.height} px</span>
                <label>
                  <span>图片说明</span>
                  <input
                    value={captions[item.id] ?? item.caption}
                    placeholder="例如：项目列表页面"
                    maxLength={120}
                    disabled={disabled}
                    onChange={(event) => setCaptions((current) => ({ ...current, [item.id]: event.target.value }))}
                    onBlur={(event) => {
                      const caption = event.target.value.trim();
                      if (caption !== item.caption) onCaptionChange(item.id, caption);
                    }}
                  />
                </label>
                <label>
                  <span>插入位置</span>
                  <select value={item.placement || ''} disabled={disabled} onChange={(event) => onPlacementChange(item.id, event.target.value)}>
                    <option value="">文末附录</option>
                    {placeholders.map((placeholder) => <option value={placeholder} key={placeholder}>{placeholder}</option>)}
                  </select>
                </label>
              </div>
              <div className="software-copyright-screenshot-actions">
                <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}>上移</button>
                <button type="button" disabled={disabled || index === screenshots.length - 1} onClick={() => move(index, 1)}>下移</button>
                <button type="button" disabled={disabled} onClick={() => setRemoveTarget(item)}>移除</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="software-copyright-screenshot-empty">
          <strong>尚未导入界面截图</strong>
          <span>建议依照实际操作流程导入首页、核心功能页和结果页截图。</span>
          <button type="button" className="secondary-action" onClick={onImport} disabled={disabled}>选择本地图片</button>
        </div>
      )}

      <Dialog.Root open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="software-copyright-screenshot-remove-card">
            <Dialog.Title>移除操作手册截图</Dialog.Title>
            <Dialog.Description>
              将从软著工作区移除“{removeTarget?.caption || removeTarget?.name}”的副本，不会删除你原来的图片文件。
            </Dialog.Description>
            <div>
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button
                className="danger-action"
                type="button"
                onClick={() => {
                  if (removeTarget) onRemove(removeTarget.id);
                  setRemoveTarget(null);
                }}
              >确认移除</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
