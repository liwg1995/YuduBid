import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { SoftwareCopyrightAiIllustration } from '../types';

interface AiIllustrationManagerProps {
  illustrations: SoftwareCopyrightAiIllustration[];
  placeholders?: string[];
  prompt: string;
  style: 'engineering_diagram' | 'realistic_photo';
  modelAvailable: boolean;
  modelMessage?: string;
  disabled?: boolean;
  generating?: boolean;
  generatingPrompt?: boolean;
  regeneratingId?: string;
  onSettingsChange: (settings: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) => void;
  onGeneratePrompt: (style: 'engineering_diagram' | 'realistic_photo') => void;
  onRegenerate: (id: string, settings: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) => void;
  onGenerate: (settings: { prompt: string; style: 'engineering_diagram' | 'realistic_photo' }) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onPlacementChange: (id: string, placement: string) => void;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
}

export function AiIllustrationManager({
  illustrations,
  placeholders = [],
  prompt,
  style,
  modelAvailable,
  modelMessage,
  disabled,
  generating,
  generatingPrompt,
  regeneratingId,
  onSettingsChange,
  onGeneratePrompt,
  onRegenerate,
  onGenerate,
  onCaptionChange,
  onPlacementChange,
  onReorder,
  onRemove,
}: AiIllustrationManagerProps) {
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [draftStyle, setDraftStyle] = useState(style);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<SoftwareCopyrightAiIllustration | null>(null);
  const [previewId, setPreviewId] = useState('');
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [regenerateStyle, setRegenerateStyle] = useState<'engineering_diagram' | 'realistic_photo'>('engineering_diagram');
  const previewTarget = illustrations.find((item) => item.id === previewId) || null;

  useEffect(() => setDraftPrompt(prompt), [prompt]);
  useEffect(() => setDraftStyle(style), [style]);
  useEffect(() => {
    setCaptions(Object.fromEntries(illustrations.map((item) => [item.id, item.caption])));
  }, [illustrations]);

  function settings() {
    return { prompt: draftPrompt.trim(), style: draftStyle };
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= illustrations.length) return;
    const ids = illustrations.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    onReorder(ids);
  }

  function openPreview(item: SoftwareCopyrightAiIllustration) {
    setPreviewId(item.id);
    setRegeneratePrompt(item.prompt || '');
    setRegenerateStyle(item.style);
  }

  return (
    <div className="software-copyright-ai-manager">
      <div className="software-copyright-ai-compose">
        <div className="software-copyright-ai-compose-head">
          <div>
            <strong>生成说明</strong>
            <span>每次生成会调用一次已配置的生图模型，生成后请人工检查界面文字和功能表达。</span>
          </div>
          <span className={`software-copyright-ai-model is-${modelAvailable ? 'available' : 'unavailable'}`}>
            {modelAvailable ? '模型可用' : modelMessage || '模型不可用'}
          </span>
        </div>
        <div className="software-copyright-ai-prompt">
          <div className="software-copyright-ai-prompt-head">
            <span>生图提示词</span>
            <button
              type="button"
              className="secondary-action"
              disabled={disabled || generating || generatingPrompt}
              onClick={() => onGeneratePrompt(draftStyle)}
            >
              {generatingPrompt ? 'AI构思中...' : 'AI换一条提示词'}
            </button>
          </div>
          <textarea
            value={draftPrompt}
            maxLength={2000}
            disabled={disabled || generating || generatingPrompt}
            placeholder="描述需要表现的软件功能、页面关系和操作流程，避免要求模型生成大段文字。"
            onChange={(event) => setDraftPrompt(event.target.value)}
            onBlur={() => onSettingsChange(settings())}
          />
          <em>{draftPrompt.length} / 2000</em>
        </div>
        <div className="software-copyright-ai-compose-foot">
          <div className="software-copyright-ai-style" role="radiogroup" aria-label="AI 插图风格">
            <button
              type="button"
              role="radio"
              aria-checked={draftStyle === 'engineering_diagram'}
              className={draftStyle === 'engineering_diagram' ? 'is-active' : ''}
              disabled={disabled || generating || generatingPrompt}
              onClick={() => {
                setDraftStyle('engineering_diagram');
                onSettingsChange({ prompt: draftPrompt.trim(), style: 'engineering_diagram' });
              }}
            >工程示意图</button>
            <button
              type="button"
              role="radio"
              aria-checked={draftStyle === 'realistic_photo'}
              className={draftStyle === 'realistic_photo' ? 'is-active' : ''}
              disabled={disabled || generating || generatingPrompt}
              onClick={() => {
                setDraftStyle('realistic_photo');
                onSettingsChange({ prompt: draftPrompt.trim(), style: 'realistic_photo' });
              }}
            >实景效果图</button>
          </div>
          <button
            type="button"
            className="primary-action"
            disabled={disabled || generating || generatingPrompt || !modelAvailable || !draftPrompt.trim() || illustrations.length >= 6}
            onClick={() => onGenerate(settings())}
          >
            {generating ? '正在生成...' : illustrations.length >= 6 ? '已达6张上限' : '生成示意图'}
          </button>
        </div>
      </div>

      {illustrations.length ? (
        <div className="software-copyright-screenshot-list">
          {illustrations.map((item, index) => (
            <article className="software-copyright-screenshot-row is-ai" key={item.id}>
              <button
                type="button"
                className="software-copyright-screenshot-preview software-copyright-ai-preview-trigger"
                onClick={() => openPreview(item)}
                disabled={disabled || generating || Boolean(regeneratingId)}
                aria-label={`预览${item.caption || item.name}`}
              >
                <img src={item.assetUrl} alt={item.caption || item.name} />
                <span>{index + 1}</span>
                <em className="software-copyright-eye-icon" aria-hidden="true" />
                <small>点击预览</small>
              </button>
              <div className="software-copyright-screenshot-content">
                <strong>{item.style === 'realistic_photo' ? '实景效果图' : '工程示意图'}</strong>
                <span>{item.width} × {item.height} px</span>
                <label>
                  <span>图片说明</span>
                  <input
                    value={captions[item.id] ?? item.caption}
                    placeholder="例如：资料处理与结果导出流程"
                    maxLength={120}
                    disabled={disabled || generating}
                    onChange={(event) => setCaptions((current) => ({ ...current, [item.id]: event.target.value }))}
                    onBlur={(event) => {
                      const caption = event.target.value.trim();
                      if (caption !== item.caption) onCaptionChange(item.id, caption);
                    }}
                  />
                </label>
                <label>
                  <span>插入位置</span>
                  <select value={item.placement || ''} disabled={disabled || generating} onChange={(event) => onPlacementChange(item.id, event.target.value)}>
                    <option value="">文末附录</option>
                    {placeholders.map((placeholder) => <option value={placeholder} key={placeholder}>{placeholder}</option>)}
                  </select>
                </label>
                <details>
                  <summary>查看生成提示词</summary>
                  <p>{item.prompt}</p>
                </details>
              </div>
              <div className="software-copyright-screenshot-actions">
                <button type="button" disabled={disabled || generating || index === 0} onClick={() => move(index, -1)}>上移</button>
                <button type="button" disabled={disabled || generating || index === illustrations.length - 1} onClick={() => move(index, 1)}>下移</button>
                <button type="button" disabled={disabled || generating} onClick={() => setRemoveTarget(item)}>移除</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="software-copyright-screenshot-empty">
          <strong>尚未生成 AI 示意图</strong>
          <span>先调整提示词和风格，再生成一张图片进行审核。正式导出只会使用已保留的图片。</span>
        </div>
      )}

      <Dialog.Root open={Boolean(previewTarget)} onOpenChange={(open) => { if (!open) setPreviewId(''); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="software-copyright-ai-preview-dialog">
            <div className="software-copyright-ai-preview-head">
              <div>
                <Dialog.Title>{previewTarget?.caption || 'AI 功能示意图'}</Dialog.Title>
                <Dialog.Description>查看大图，或修改提示词后替换当前图片。图片说明和插入位置会保留。</Dialog.Description>
              </div>
              <Dialog.Close className="secondary-action" type="button">关闭</Dialog.Close>
            </div>
            {previewTarget && (
              <div className="software-copyright-ai-preview-body">
                <div className="software-copyright-ai-preview-stage">
                  <img src={previewTarget.assetUrl} alt={previewTarget.caption || previewTarget.name} />
                </div>
                <div className="software-copyright-ai-regenerate-panel">
                  <strong>重新生成当前图片</strong>
                  <span>可在原提示词基础上补充需要修改的画面、功能重点、颜色或布局。</span>
                  <label>
                    <span>本次重绘提示词</span>
                    <textarea
                      value={regeneratePrompt}
                      onChange={(event) => setRegeneratePrompt(event.target.value)}
                      maxLength={2000}
                      disabled={regeneratingId === previewTarget.id}
                    />
                    <em>{regeneratePrompt.length} / 2000</em>
                  </label>
                  <div className="software-copyright-ai-regenerate-style" role="radiogroup" aria-label="重新生成图片风格">
                    <button type="button" className={regenerateStyle === 'engineering_diagram' ? 'is-active' : ''} onClick={() => setRegenerateStyle('engineering_diagram')} disabled={regeneratingId === previewTarget.id}>工程示意图</button>
                    <button type="button" className={regenerateStyle === 'realistic_photo' ? 'is-active' : ''} onClick={() => setRegenerateStyle('realistic_photo')} disabled={regeneratingId === previewTarget.id}>实景效果图</button>
                  </div>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => onRegenerate(previewTarget.id, { prompt: regeneratePrompt.trim(), style: regenerateStyle })}
                    disabled={!regeneratePrompt.trim() || regeneratingId === previewTarget.id}
                  >
                    {regeneratingId === previewTarget.id ? '正在重新生成...' : '按此提示重新生成'}
                  </button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="software-copyright-screenshot-remove-card">
            <Dialog.Title>移除 AI 示意图</Dialog.Title>
            <Dialog.Description>
              将从软著工作区移除“{removeTarget?.caption || removeTarget?.name}”。该图片不会再写入操作手册。
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
