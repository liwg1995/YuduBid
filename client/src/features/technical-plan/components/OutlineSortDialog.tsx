import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { OutlineItem } from '../../../shared/types';
import { moveOutlineSibling, outlineOrderKey } from '../services/outlineOrdering';
import './outlineQuestionDialog.css';

interface Props {
  open: boolean;
  items: OutlineItem[];
  onOpenChange: (open: boolean) => void;
  onSave: (items: OutlineItem[]) => Promise<boolean>;
}
export function OutlineSortDialog({ open, items, onOpenChange, onSave }: Props) {
  const [draft, setDraft] = useState(items);
  const [saving, setSaving] = useState(false);
  const dirty = outlineOrderKey(draft) !== outlineOrderKey(items);
  useEffect(() => { if (open) { setDraft(items); } }, [open, items]);
  const move = (id: string, offset: -1 | 1) => { setDraft(value => moveOutlineSibling(value, id, offset)); };
  const renderItems = (nodes: OutlineItem[], prefix = ''): React.ReactNode => nodes.map((item, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    return <li key={item.id}><div className="outline-sort-row"><span>{number} {item.title}</span><button type="button" disabled={saving || index === 0} aria-label={`上移${item.title}`} onClick={() => move(item.id, -1)}>上移</button><button type="button" disabled={saving || index === nodes.length - 1} aria-label={`下移${item.title}`} onClick={() => move(item.id, 1)}>下移</button></div>{item.children?.length ? <ol>{renderItems(item.children, number)}</ol> : null}</li>;
  });
  return <Dialog.Root open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}><Dialog.Portal>
    <Dialog.Overlay className="content-regenerate-modal" />
    <Dialog.Content className="outline-question-dialog">
      <Dialog.Title>调整目录顺序</Dialog.Title>
      <Dialog.Description>同级章节可上下移动，子目录随父章节一起移动。保存后将重新编号，并清空旧正文、全局事实和生成缓存。</Dialog.Description>
      <ol className="outline-sort-list">{renderItems(draft)}</ol>
      <div className="outline-question-actions"><Dialog.Close className="secondary-action" disabled={saving}>取消</Dialog.Close><button type="button" className="primary-action" disabled={saving || !dirty} onClick={async () => { setSaving(true); try { if (await onSave(draft)) onOpenChange(false); } finally { setSaving(false); } }}>{saving ? '保存中…' : '保存排序'}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
