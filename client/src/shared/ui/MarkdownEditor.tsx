import { useRef } from 'react';
import './markdownEditor.css';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onRequestImage?: (insert: (markdown: string) => void) => void;
}

const toolbarActions = [
  { id: 'bold', label: '加粗', title: '加粗', prefix: '**', suffix: '**', content: <strong>B</strong> },
  { id: 'italic', label: '斜体', title: '斜体', prefix: '*', suffix: '*', content: <em>I</em> },
  { id: 'heading', label: '标题', title: '标题', prefix: '## ', suffix: '', content: 'H' },
  { id: 'quote', label: '引用', title: '引用', prefix: '> ', suffix: '', content: '❝' },
  { id: 'unordered-list', label: '无序列表', title: '无序列表', prefix: '- ', suffix: '', content: '•' },
  { id: 'ordered-list', label: '有序列表', title: '有序列表', prefix: '1. ', suffix: '', content: '1.' },
];

function MarkdownEditor({ value, onChange, placeholder = '输入 Markdown 内容...', ariaLabel = 'Markdown 内容', className, disabled = false, onRequestImage }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestRef = useRef({ value, disabled, onChange });
  latestRef.current = { value, disabled, onChange };

  function insertMarkdown(prefix: string, suffix = '') {
    const textarea = textareaRef.current;
    if (!textarea || disabled) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scrollTop = textarea.scrollTop;
    const selected = value.slice(start, end) || '文本';
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.scrollTop = scrollTop;
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selected.length;
    });
  }

  function insertRawMarkdown(markdown: string) {
    const textarea = textareaRef.current;
    const current = latestRef.current;
    if (!textarea || current.disabled) return;
    const value = current.value;
    const scrollTop = textarea.scrollTop;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prefix = start > 0 && value[start - 1] !== '\n' ? '\n\n' : '';
    const suffix = end < value.length && value[end] !== '\n' ? '\n\n' : '\n';
    const insertion = `${prefix}${markdown}${suffix}`;
    current.onChange(value.slice(0, start) + insertion + value.slice(end));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.scrollTop = scrollTop;
      textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
    });
  }

  return (
    <div className={`markdown-editor${className ? ` ${className}` : ''}`}>
      <div className="markdown-editor-toolbar" role="group" aria-label="Markdown 编辑工具栏">
        {toolbarActions.map((action) => (
          <button
            type="button"
            title={action.title}
            aria-label={action.label}
            aria-keyshortcuts={action.id === 'bold' ? 'Control+B Meta+B' : action.id === 'italic' ? 'Control+I Meta+I' : undefined}
            disabled={disabled}
            onClick={() => insertMarkdown(action.prefix, action.suffix)}
            key={action.id}
          >
            {action.content}
          </button>
        ))}
        {onRequestImage && (
          <button
            type="button"
            className="markdown-editor-image-action"
            title="从图片知识库插入素材"
            aria-label="插入图片"
            disabled={disabled}
            onClick={() => onRequestImage(insertRawMarkdown)}
          >
            插入图片
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        className="markdown-editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
          const action = event.key.toLowerCase() === 'b' ? toolbarActions[0] : event.key.toLowerCase() === 'i' ? toolbarActions[1] : undefined;
          if (action) { event.preventDefault(); insertMarkdown(action.prefix, action.suffix); }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

export default MarkdownEditor;
