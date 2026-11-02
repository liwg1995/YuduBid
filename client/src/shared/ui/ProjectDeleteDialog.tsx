import AppDialog from './AppDialog';
import './projectDeleteDialog.css';
import { toChineseErrorMessage } from '../utils/userFacingError';

/** 删除确认使用明确的对象和影响说明；实际删除仍由所属模块执行。 */
export default function ProjectDeleteDialog({ name, description, busy, error, onCancel, onConfirm }: { name?: string; description: string; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void }) {
  return <AppDialog open={Boolean(name)} onOpenChange={open => { if (!open && !busy) onCancel(); }} cardClassName="yb-project-delete-dialog" title="删除项目？" description={`将删除“${name || '未命名项目'}”。${description}`} preventClose={busy} actions={<>
    <button type="button" className="secondary-action" disabled={busy} onClick={onCancel}>取消</button>
    <button type="button" className="danger-action" disabled={busy} onClick={onConfirm}>{busy ? '删除中…' : '确认删除'}</button>
  </>}>
    {error && <div className="yb-operation-error" role="alert">{toChineseErrorMessage(error, '删除未完成，请重试。')}</div>}
  </AppDialog>;
}
