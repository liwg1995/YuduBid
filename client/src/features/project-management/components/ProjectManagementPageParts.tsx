import '../../../shared/ui/readingDialog.css';
import * as Popover from '@radix-ui/react-popover';
import './projectDictionarySelect.css';
import WorkspaceFormSection from '../../../shared/ui/WorkspaceFormSection';
import WorkspaceViewControl from '../../../shared/ui/WorkspaceViewControl';
import BusinessTaskProgress from '../../../shared/ui/BusinessTaskProgress';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MarkdownEditor, MarkdownRenderer } from '../../../shared/ui';
import type { ProjectManagementTask } from '../types';
import type { ProjectManagementExportProgress, ProjectManagementModule } from '../model/projectManagementPageModel';

interface ProjectManagementModuleWorkspaceProps<TInput extends object> {
  fields: Array<{ key: keyof TInput; label: string; placeholder: string }>;
  input: TInput;
  inputKicker: string;
  inputTitle: string;
  generateLabel: string;
  resultKicker: string;
  resultPlaceholder: string;
  result: string;
  resultMode: 'edit' | 'preview';
  task?: ProjectManagementTask;
  exportProgress?: ProjectManagementExportProgress | null;
  isRunning: boolean;
  exporting: boolean;
  beforeInput?: ReactNode;
  saveResultLabel?: string;
  updateInputField: (key: keyof TInput, value: string) => void;
  onSaveInput: () => void | Promise<unknown>;
  onGenerate: () => void | Promise<unknown>;
  onToggleResultMode: () => void;
  onSaveResult: () => void | Promise<unknown>;
  onExportWord: () => void | Promise<unknown>;
  onResultChange: (value: string) => void;
}

export function ProjectManagementModuleWorkspace<TInput extends object>({
  fields,
  input,
  inputKicker,
  inputTitle,
  generateLabel,
  resultKicker,
  resultPlaceholder,
  result,
  resultMode,
  task,
  exportProgress,
  isRunning,
  exporting,
  beforeInput,
  saveResultLabel = '保存结果',
  updateInputField,
  onSaveInput,
  onGenerate,
  onToggleResultMode,
  onSaveResult,
  onExportWord,
  onResultChange,
}: ProjectManagementModuleWorkspaceProps<TInput>) {
  return (
    <div className="project-management-mvp">
      {beforeInput && <div className="project-management-before-input">{beforeInput}</div>}
      <section className="project-management-form-panel">
        <div className="project-management-panel-head">
          <div>
            <h4>{inputTitle}</h4>
          </div>
          <div className="project-management-actions">
            <button type="button" className="secondary-action" onClick={() => void onSaveInput()} disabled={isRunning}>保存材料</button>
            <button type="button" className="primary-action" onClick={() => void onGenerate()} disabled={isRunning}>
              {isRunning ? '生成中...' : generateLabel}
            </button>
          </div>
        </div>
        <WorkspaceFormSection title={inputKicker} className="project-management-input-section">
          {fields.map((field) => (
            <label key={String(field.key)}>
              <span>{field.label}</span>
              <textarea
                value={String(input[field.key] ?? '')}
                onChange={(event) => updateInputField(field.key, event.target.value)}
                placeholder={field.placeholder}
                disabled={isRunning}
              />
            </label>
          ))}
        </WorkspaceFormSection>
      </section>

      <ProjectManagementTaskStatus task={task} />

      <section className="project-management-result-panel">
        <div className="project-management-panel-head">
          <div>
            <span className="section-kicker">{resultKicker}</span>
            <h4>生成后可继续编辑保存</h4>
          </div>
          <div className="project-management-actions">
            <WorkspaceViewControl label="项目阶段结果查看方式" value={resultMode} onChange={mode => { if (mode !== resultMode) onToggleResultMode(); }} options={[{ value: 'edit', label: '编辑' }, { value: 'preview', label: '预览' }]} />
            <button type="button" className="secondary-action" onClick={() => void onSaveResult()} disabled={isRunning}>{saveResultLabel}</button>
            <button type="button" className="primary-action" onClick={() => void onExportWord()} disabled={isRunning || exporting || !result.trim()}>
              {exporting ? '导出中...' : '导出 Word'}
            </button>
          </div>
        </div>
        {exportProgress && (
          <div className={`project-management-export is-${exportProgress.phase}`}>
            <span>{exportProgress.message}</span>
            <BusinessTaskProgress label="Word 导出" percent={exportProgress.progress} status={exportProgress.phase === 'error' ? 'exception' : exportProgress.phase === 'success' ? 'success' : 'active'} />
          </div>
        )}
        {resultMode === 'edit' ? (
          <MarkdownEditor ariaLabel={`${resultKicker}工作稿`} value={result} onChange={onResultChange} placeholder={resultPlaceholder} disabled={isRunning} />
        ) : (
          <div className="project-management-preview">
            {result.trim() ? <MarkdownRenderer allowRawHtml={false}>{result}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
          </div>
        )}
      </section>
    </div>
  );
}

interface ProjectDictionarySelectProps {
  value: string;
  options: string[];
  placeholder: string;
  addLabel: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ProjectDictionarySelect({ value, options, placeholder, addLabel, onChange, disabled }: ProjectDictionarySelectProps) {
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setCustomMode(false);
      setDraft('');
      setKeyword('');
    }
  }, [disabled]);
  const normalizedOptions = useMemo(() => Array.from(new Set([...options, value].map((item) => item.trim()).filter(Boolean))), [options, value]);
  const visibleOptions = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return normalizedOptions;
    return normalizedOptions.filter((item) => item.toLowerCase().includes(query));
  }, [keyword, normalizedOptions]);
  const needsSearch = normalizedOptions.length > 8;

  function commitCustom() {
    const nextValue = draft.trim();
    if (disabled || !nextValue) return;
    onChange(nextValue);
    setDraft('');
    setKeyword('');
    setCustomMode(false);
    setOpen(false);
  }

  return (
    <Popover.Root open={open && !disabled} onOpenChange={nextOpen => { if (disabled) return; setOpen(nextOpen); setCustomMode(false); if (!nextOpen) setKeyword(''); }}>
    <div className="project-management-select">
      <Popover.Trigger asChild>
      <button
        type="button"
        className={`project-management-select-trigger${value ? '' : ' is-placeholder'}`}
        aria-label={placeholder}
        onKeyDown={event => { if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setOpen(true); } }}
        disabled={disabled}
      >
        <span>{value || placeholder}</span>
        <b aria-hidden="true">⌄</b>
      </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="project-management-select-menu" aria-label={placeholder} align="start" sideOffset={6} collisionPadding={12}>
          {needsSearch ? (
            <input
              className="project-management-select-search"
              aria-label="搜索选项"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索选项"
              autoFocus
            />
          ) : null}
          <div className="project-management-select-options">
            {visibleOptions.length ? visibleOptions.map((item) => (
              <button
                type="button"
                className={item === value ? 'is-active' : ''}
                key={item}
                onClick={() => {
                  if (disabled) return;
                  onChange(item);
                  setKeyword('');
                  setOpen(false);
                }}
              >
                {item}
              </button>
            )) : <p>没有匹配项，可在下方新增。</p>}
          </div>
          {customMode ? (
            <div className="project-management-select-custom">
              <input aria-label={addLabel} value={draft} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft.trim()) { event.preventDefault(); commitCustom(); } }} onChange={(event) => setDraft(event.target.value)} placeholder={addLabel.replace('新增', '输入新')} autoFocus />
              <div className="project-management-select-custom-actions">
                <button type="button" onClick={() => { setCustomMode(false); setDraft(''); requestAnimationFrame(() => addButtonRef.current?.focus()); }}>取消</button>
                <button type="button" onClick={commitCustom} disabled={!draft.trim()}>确定</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              ref={addButtonRef}
              className="project-management-select-add"
              onClick={() => {
                setDraft(keyword.trim());
                setCustomMode(true);
              }}
            >
              + {addLabel}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </div>
    </Popover.Root>
  );
}

export function ModuleIntro({ module }: { module: ProjectManagementModule }) {
  return (
    <>
      <div className="project-management-detail-head">
        <div>
          <span className="section-kicker">{module.label}</span>
          <h3>{module.title}</h3>
          <p>{module.description}</p>
        </div>
      </div>
      <details className="project-management-module-reference">
        <summary>模块参考 <span>交付物、方法、场景与图表</span></summary>
        <div className="project-management-section-grid">
          <InfoBlock title="核心交付物" items={module.deliverables} />
          <InfoBlock title="方法框架" items={module.methods} />
          <InfoBlock title="适用场景" items={module.scenarios} />
          <InfoBlock title="推荐图表" items={module.diagrams} />
        </div>
      </details>
    </>
  );
}

export function ProjectManagementTaskStatus({ task }: { task?: ProjectManagementTask }) {
  if (!task) return null;

  const running = task.status === 'running';


  return (
    <section className={`project-management-task is-${task.status}${running ? ' is-running' : ''}`}>
      <BusinessTaskProgress label={task.message || '任务阶段'} percent={task.progress} status={task.status === 'error' ? 'exception' : task.status === 'success' ? 'success' : 'active'} />
      {running && <p>模型正在处理完整文档，期间进度条会持续活动；完成后会一次性写入结果。</p>}
    </section>
  );
}

export function ProjectManagementHelpDialog({ modules, triggerMode = 'button' }: { modules: ProjectManagementModule[]; triggerMode?: 'button' | 'label' }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`${triggerMode === 'label' ? 'project-management-help-label' : 'project-management-help-trigger'} context-help-trigger`}
        >
          查看管理参考
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="project-management-help-card yb-reading-dialog">
          <div className="project-management-help-head">
            <div>
              <Dialog.Title>项目管理使用方法</Dialog.Title>
              <Dialog.Description>
                按项目从启动到收尾的顺序推进，每一步生成的结果会自动成为后续步骤的上下文。
              </Dialog.Description>
            </div>
            <Dialog.Close className="detail-help-close" type="button" aria-label="关闭项目管理使用方法">×</Dialog.Close>
          </div>
          <div className="project-management-help-body">
            <section>
              <h4>推荐流程</h4>
              <ol>
                <li>先在“启动与规划”填写项目档案、项目背景、目标、范围和已知风险，生成项目基线。</li>
                <li>继续进入“需求与 PRD”，把客户访谈和功能诉求整理成需求边界、优先级和验收标准。</li>
                <li>按“排期与推进、风险问题、沟通变更、交付上线”的顺序，把计划落到执行动作。</li>
                <li>项目过程中可随时生成“汇报周月报”和“商务回款”，结项后再做“复盘沉淀”和“合规本土化”。</li>
              </ol>
            </section>
            <section>
              <h4>模块顺序</h4>
              <div className="project-management-help-modules">
                {modules.map((module, index) => (
                  <span key={module.id}>{index + 1}. {module.label}</span>
                ))}
              </div>
            </section>
            <section>
              <h4>使用提示</h4>
              <p>不必一次填满所有字段。先填关键事实生成初稿，再在结果区编辑、保存或导出 Word；后续模块会优先读取已保存和已生成的内容。每个模块会同步生成 Mermaid 阶段图表，预览时可查看，导出 Word 时会转成图片。</p>
            </section>
          </div>
          <div className="project-management-help-actions">
            <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ModulePlaceholder({ module }: { module: ProjectManagementModule }) {
  return (
    <div className="project-management-prompt">
      <span>模块说明</span>
      <p>{module.promptHint}</p>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h4>{title}</h4>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
