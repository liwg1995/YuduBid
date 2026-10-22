import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { BackgroundTaskState } from '../types';
import { useToast } from '../../../shared/ui';
import './outlineQuestionDialog.css';

export function OutlineQuestionDialog({ task }: { task?: BackgroundTaskState }) {
  const question = task?.stats?.outlineQuestion;
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<NonNullable<NonNullable<BackgroundTaskState['stats']>['outlineQuestion']>['items']>([]);
  const [instructions, setInstructions] = useState('');
  const [action, setAction] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  useEffect(() => {
    setOpen(Boolean(question));
    setSelectedIds(question?.items?.map(item => item.id) || []);
    setItems(question?.items || []);
    setInstructions('');
    setAction('');
  }, [question?.id]);
  if (!question || !task || !['running', 'pausing', 'paused'].includes(task.status)) return null;
  const submit = async () => {
    setSaving(true);
    try {
      await window.yibiao!.tasks.answerOutlineQuestion({ taskId: task.task_id, questionId: question.id, answer: { selectedIds, action, instructions, items } });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '提交回答失败', 'error');
    } finally { setSaving(false); }
  };
  return <>
    <button type="button" className="secondary-action" onClick={() => setOpen(true)}>处理目录生成确认</button>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal>
      <Dialog.Overlay className="content-regenerate-modal" />
      <Dialog.Content className="outline-question-dialog">
        <Dialog.Title>{question.items ? '确认一级目录' : '确认生成依据'}</Dialog.Title>
        <Dialog.Description>{question.message}</Dialog.Description>
        {question.items ? <div className="outline-question-items">{(items || []).map(item => <label key={item.id}>
          <input type="checkbox" checked={selectedIds.includes(item.id)} disabled={saving} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
          <span>{question.editable ? <><input aria-label="一级目录标题" value={item.title} maxLength={200} disabled={saving} onChange={event => setItems(values => values?.map(value => value.id === item.id ? { ...value, title: event.target.value } : value))} /><textarea aria-label="一级目录描述" value={item.description || ''} maxLength={4000} disabled={saving} onChange={event => setItems(values => values?.map(value => value.id === item.id ? { ...value, description: event.target.value } : value))} /></> : <><strong>{item.title}</strong><small>{item.description}</small></>}</span><small>技术 · AI 生成</small>
        </label>)}</div> : <div className="outline-question-items">{[...(question.allowRevise ? [{ value: 'revise', label: '按审核建议重新细化', description: '保留已确认的一级目录，修正二三级目录。' }] : []), { value: 'continue', label: '按现有资料继续', description: question.allowRevise ? '保留当前目录，记录审核建议并人工核对。' : '不编造缺失的评分项或项目事实，生成结果需要人工核对。' }, { value: 'stop', label: '结束任务并补充资料', description: '补充招标文件或修改解析结果后重新生成。' }].map(option => <label key={option.value}><input type="radio" name="outline-answer" checked={action === option.value} disabled={saving} onChange={() => setAction(option.value)} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div>}
        <label className="outline-question-instructions">补充处理要求（可选）<textarea value={instructions} disabled={saving} onChange={event => setInstructions(event.target.value)} placeholder="例如：按实施阶段组织章节，展开到三级目录" /></label>
        <div className="outline-question-actions"><Dialog.Close className="secondary-action" disabled={saving}>稍后处理</Dialog.Close><button type="button" className="primary-action" disabled={saving || (question.items ? !selectedIds.length : !action)} onClick={() => void submit()}>{saving ? '提交中…' : '确认并继续'}</button></div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </>;
}
