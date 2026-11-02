import { useState } from 'react';
import type { ReactNode } from 'react';
import { AppDialog, MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';

type View = 'preview' | 'markdown' | 'compare';
const views: { id: View; label: string }[] = [{ id: 'preview', label: '阅读' }, { id: 'markdown', label: '源码' }, { id: 'compare', label: '对照' }];
interface Props {
  title: string; content: string; editing: boolean; disabled: boolean; status: string;
  note: string; empty: ReactNode; actions: ReactNode; onChange: (value: string) => void;
}
/** 可研 Markdown 结果共用阅读、源码、对照及草稿预览，沿用分析页的字阶和主题。 */
export default function FeasibilityMarkdownWorkspace({ title, content, editing, disabled, status, note, empty, actions, onChange }: Props) {
  const [view, setView] = useState<View>('preview');
  const [previewOpen, setPreviewOpen] = useState(false);
  // 阅读切入编辑时展示编辑器，保留用户已选择的对照方式。
  const currentView = editing && view === 'preview' ? 'markdown' : view;
  return <section className="feasibility-analysis-document" aria-label={title}>
    <header><div><strong>{title}</strong><span role="status">{status}</span></div><div className="feasibility-analysis-document-actions">{actions}<button type="button" className="secondary-action" disabled={!content.trim()} onClick={() => setPreviewOpen(true)}>全屏预览</button></div></header>
    <div className="feasibility-analysis-viewbar"><fieldset className="feasibility-analysis-views"><legend className="sr-only">{title}视图</legend>{views.filter(item => !editing || item.id !== 'preview').map(item => <label key={item.id}><input type="radio" name={`feasibility-${title}-view`} value={item.id} checked={currentView === item.id} onChange={() => setView(item.id)} /><span>{item.label}</span></label>)}</fieldset><span>{note}</span></div>
    <div className={`feasibility-analysis-reading is-${currentView}`}>
      {currentView !== 'preview' && <div className="feasibility-analysis-markdown" aria-label={`${title}源码`}>{editing ? <MarkdownEditor ariaLabel={title} value={content} disabled={disabled} onChange={onChange} placeholder={`在此校正${title}…`} /> : <pre>{content.trim() ? content : `尚无${title}`}</pre>}</div>}
      {currentView !== 'markdown' && <div className="feasibility-analysis-preview markdown-viewer" aria-label={`${title}阅读`}>{content.trim() ? <MarkdownRenderer allowRawHtml={false}>{content}</MarkdownRenderer> : empty}</div>}
    </div>
    <AppDialog open={previewOpen} onOpenChange={setPreviewOpen} title={editing ? `${title}草稿预览` : `${title}预览`} description={editing ? '当前预览包含尚未保存的修改。' : '已保存的全文统一口径。'} cardClassName="feasibility-analysis-full-preview" actions={<button type="button" className="secondary-action" onClick={() => setPreviewOpen(false)}>关闭预览</button>}><div className="markdown-viewer"><MarkdownRenderer allowRawHtml={false}>{content}</MarkdownRenderer></div></AppDialog>
  </section>;
}
