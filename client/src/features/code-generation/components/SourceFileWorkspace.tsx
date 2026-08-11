import { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeGenerationAnalysis, CodeGenerationFile, CodeGenerationState } from '../types';

interface SourceFileWorkspaceProps {
  analysis: CodeGenerationAnalysis;
  selectedPaths: string[];
  sortMode: CodeGenerationState['sortMode'];
  disabled?: boolean;
  onChange: (selectedPaths: string[], sortMode?: CodeGenerationState['sortMode']) => void;
}

interface DirectoryNode {
  name: string;
  path: string;
  directories: DirectoryNode[];
  files: CodeGenerationFile[];
}

interface DirectoryAccumulator {
  name: string;
  path: string;
  directories: Map<string, DirectoryAccumulator>;
  files: CodeGenerationFile[];
}

function buildTree(files: CodeGenerationFile[]): DirectoryNode {
  const root: DirectoryAccumulator = { name: '项目根目录', path: '', directories: new Map(), files: [] };
  for (const file of files) {
    const segments = file.path.split('/');
    let current = root;
    segments.slice(0, -1).forEach((segment) => {
      const nextPath = current.path ? `${current.path}/${segment}` : segment;
      if (!current.directories.has(segment)) {
        current.directories.set(segment, { name: segment, path: nextPath, directories: new Map(), files: [] });
      }
      current = current.directories.get(segment)!;
    });
    current.files.push(file);
  }

  const finalize = (node: DirectoryAccumulator): DirectoryNode => ({
    name: node.name,
    path: node.path,
    directories: Array.from(node.directories.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')).map(finalize),
    files: [...node.files].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN')),
  });
  return finalize(root);
}

function directoryFiles(node: DirectoryNode): CodeGenerationFile[] {
  return [...node.files, ...node.directories.flatMap(directoryFiles)];
}

function filterTree(node: DirectoryNode, query: string): DirectoryNode | null {
  if (!query) return node;
  const normalized = query.toLowerCase();
  const directories = node.directories.map((child) => filterTree(child, query)).filter(Boolean) as DirectoryNode[];
  const files = node.files.filter((file) => `${file.path} ${file.category} ${file.extension}`.toLowerCase().includes(normalized));
  if (!directories.length && !files.length && !node.path.toLowerCase().includes(normalized)) return null;
  return { ...node, directories, files };
}

function TriStateCheckbox({ checked, mixed, label, disabled, onChange }: {
  checked: boolean;
  mixed: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} disabled={disabled} onChange={onChange} />;
}

function DirectoryTreeRow({ node, selected, expanded, searchActive, disabled, onToggleExpand, onToggleDirectory, onToggleFile }: {
  node: DirectoryNode;
  selected: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  searchActive: boolean;
  disabled?: boolean;
  onToggleExpand: (path: string) => void;
  onToggleDirectory: (node: DirectoryNode) => void;
  onToggleFile: (path: string) => void;
}) {
  const files = directoryFiles(node);
  const selectedCount = files.filter((file) => selected.has(file.path)).length;
  const isExpanded = searchActive || node.path === '' || expanded.has(node.path);
  return (
    <div className="code-source-tree-branch">
      {node.path !== '' && (
        <div className="code-source-tree-row is-directory">
          <button type="button" className="code-source-tree-disclosure" onClick={() => onToggleExpand(node.path)} aria-expanded={isExpanded} aria-label={`${isExpanded ? '折叠' : '展开'}目录 ${node.path}`}>
            {isExpanded ? '⌄' : '›'}
          </button>
          <TriStateCheckbox
            checked={selectedCount === files.length && files.length > 0}
            mixed={selectedCount > 0 && selectedCount < files.length}
            label={`选择目录 ${node.path}`}
            disabled={disabled}
            onChange={() => onToggleDirectory(node)}
          />
          <button type="button" className="code-source-tree-name" title={node.path} onClick={() => onToggleExpand(node.path)}>{node.name}</button>
          <span>{selectedCount}/{files.length}</span>
        </div>
      )}
      {isExpanded && (
        <div className={node.path ? 'code-source-tree-children' : ''}>
          {node.directories.map((child) => (
            <DirectoryTreeRow
              key={child.path}
              node={child}
              selected={selected}
              expanded={expanded}
              searchActive={searchActive}
              disabled={disabled}
              onToggleExpand={onToggleExpand}
              onToggleDirectory={onToggleDirectory}
              onToggleFile={onToggleFile}
            />
          ))}
          {node.files.map((file) => (
            <label className="code-source-tree-row is-file" key={file.path} title={file.path}>
              <span className="code-source-tree-spacer" />
              <input type="checkbox" checked={selected.has(file.path)} disabled={disabled} onChange={() => onToggleFile(file.path)} />
              <span className="code-source-language">{file.extension.replace('.', '').toUpperCase()}</span>
              <strong>{file.path.split('/').pop()}</strong>
              <small>{file.line_count} 行</small>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SourceFileWorkspace({ analysis, selectedPaths, sortMode, disabled, onChange }: SourceFileWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const selected = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const byPath = useMemo(() => new Map(analysis.candidates.map((file) => [file.path, file])), [analysis.candidates]);
  const selectedFiles = useMemo(() => selectedPaths.map((filePath) => byPath.get(filePath)).filter(Boolean) as CodeGenerationFile[], [byPath, selectedPaths]);
  const tree = useMemo(() => buildTree(analysis.candidates), [analysis.candidates]);
  const visibleTree = useMemo(() => filterTree(tree, query.trim()), [query, tree]);
  const extensionStats = useMemo(() => {
    const stats = new Map<string, { extension: string; totalFiles: number; totalLines: number; selectedFiles: number; selectedLines: number; paths: string[] }>();
    analysis.candidates.forEach((file) => {
      const current = stats.get(file.extension) || { extension: file.extension, totalFiles: 0, totalLines: 0, selectedFiles: 0, selectedLines: 0, paths: [] };
      current.totalFiles += 1;
      current.totalLines += file.line_count;
      current.paths.push(file.path);
      if (selected.has(file.path)) {
        current.selectedFiles += 1;
        current.selectedLines += file.line_count;
      }
      stats.set(file.extension, current);
    });
    return Array.from(stats.values()).sort((a, b) => b.selectedLines - a.selectedLines || b.totalLines - a.totalLines || a.extension.localeCompare(b.extension));
  }, [analysis.candidates, selected]);

  const update = (next: Iterable<string>, nextSortMode = sortMode) => onChange(Array.from(new Set(next)), nextSortMode);
  const toggleFile = (filePath: string) => {
    const next = new Set(selectedPaths);
    if (next.has(filePath)) next.delete(filePath);
    else next.add(filePath);
    update(next);
  };
  const toggleDirectory = (node: DirectoryNode) => {
    const paths = directoryFiles(node).map((file) => file.path);
    const next = new Set(selectedPaths);
    const allSelected = paths.every((filePath) => next.has(filePath));
    paths.forEach((filePath) => allSelected ? next.delete(filePath) : next.add(filePath));
    update(next);
  };
  const toggleExpanded = (directoryPath: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(directoryPath)) next.delete(directoryPath);
      else next.add(directoryPath);
      return next;
    });
  };
  const moveFile = (from: number, to: number) => {
    if (to < 0 || to >= selectedPaths.length || from === to) return;
    const next = [...selectedPaths];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update(next, 'manual');
  };

  return (
    <div className="code-source-workspace">
      <section className="code-source-composition" aria-label="源码类型构成">
        <div className="code-source-composition-head">
          <div><strong>类型构成</strong><span>点击后缀可整类纳入或排除</span></div>
          <span>已选 {selectedFiles.length} 个文件，{selectedFiles.reduce((sum, file) => sum + file.line_count, 0).toLocaleString()} 行</span>
        </div>
        <div className="code-source-extension-list">
          {extensionStats.map((item) => {
            const allSelected = item.selectedFiles === item.totalFiles;
            return (
              <button
                type="button"
                className={item.selectedFiles ? 'is-selected' : ''}
                disabled={disabled}
                onClick={() => {
                  const next = new Set(selectedPaths);
                  item.paths.forEach((filePath) => allSelected ? next.delete(filePath) : next.add(filePath));
                  update(next);
                }}
                key={item.extension}
              >
                <strong>{item.extension || '无后缀'}</strong>
                <span>{item.selectedFiles}/{item.totalFiles} 文件</span>
                <small>{item.selectedLines.toLocaleString()}/{item.totalLines.toLocaleString()} 行</small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="code-source-columns">
        <section className="code-source-tree-panel">
          <div className="code-source-panel-head">
            <div><strong>项目目录</strong><span>目录支持全选、部分选中和未选三种状态</span></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索路径、类型或后缀" aria-label="搜索源码文件" />
          </div>
          <div className="code-source-bulk-actions">
            <button type="button" disabled={disabled} onClick={() => update(analysis.candidates.map((file) => file.path))}>全选</button>
            <button type="button" disabled={disabled || !selectedPaths.length} onClick={() => update([])}>清空</button>
            <button type="button" disabled={disabled} onClick={() => update(analysis.candidates.filter((file) => !selected.has(file.path)).map((file) => file.path))}>反选</button>
            <span>{query && visibleTree ? '正在显示匹配文件及所在目录' : `共 ${analysis.candidates.length} 个源码文件`}</span>
          </div>
          <div className="code-source-tree" role="tree" aria-label="项目源码目录树">
            {visibleTree ? (
              <DirectoryTreeRow
                node={visibleTree}
                selected={selected}
                expanded={expanded}
                searchActive={Boolean(query.trim())}
                disabled={disabled}
                onToggleExpand={toggleExpanded}
                onToggleDirectory={toggleDirectory}
                onToggleFile={toggleFile}
              />
            ) : <div className="software-copyright-empty">没有匹配的源码文件。</div>}
          </div>
        </section>

        <section className="code-source-order-panel">
          <div className="code-source-panel-head">
            <div><strong>已纳入顺序</strong><span>顺序决定首页起点、末页终点和前后段内容</span></div>
            <div className="code-source-sort" role="tablist" aria-label="源码排序方式">
              {([['smart', '入口优先'], ['path', '路径排序'], ['manual', '手动排序']] as Array<[CodeGenerationState['sortMode'], string]>).map(([value, label]) => (
                <button type="button" className={sortMode === value ? 'is-active' : ''} disabled={disabled} onClick={() => update(selectedPaths, value)} key={value}>{label}</button>
              ))}
            </div>
          </div>
          <div className="code-source-order-list">
            {selectedFiles.map((file, index) => (
              <div
                className="code-source-order-row"
                draggable={!disabled}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => { if (dragIndex !== null) moveFile(dragIndex, index); setDragIndex(null); }}
                key={file.path}
              >
                <span className="code-source-order-index">{index + 1}</span>
                <div>
                  <strong title={file.path}>{file.path}</strong>
                  <small>{file.category}，{file.line_count} 行{index === 0 ? '，首页起点' : index === selectedFiles.length - 1 ? '，末页终点' : ''}</small>
                </div>
                <div className="code-source-order-actions">
                  <button type="button" aria-label={`上移 ${file.path}`} disabled={disabled || index === 0} onClick={() => moveFile(index, index - 1)}>↑</button>
                  <button type="button" aria-label={`下移 ${file.path}`} disabled={disabled || index === selectedFiles.length - 1} onClick={() => moveFile(index, index + 1)}>↓</button>
                  <button type="button" aria-label={`移除 ${file.path}`} disabled={disabled} onClick={() => toggleFile(file.path)}>移除</button>
                </div>
              </div>
            ))}
            {!selectedFiles.length && <div className="software-copyright-empty">请从左侧目录树选择源码文件。</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
