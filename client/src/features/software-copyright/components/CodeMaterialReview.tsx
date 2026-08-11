import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoftwareCopyrightCodeManifest } from '../types';

interface CodeMaterialReviewProps {
  manifest: SoftwareCopyrightCodeManifest;
  excludedPaths?: string[];
  disabled?: boolean;
  onExcludeFile?: (filePath: string) => void;
}

export function CodeMaterialReview({ manifest, excludedPaths = [], disabled, onExcludeFile }: CodeMaterialReviewProps) {
  const pages = manifest.pages || [];
  const [activePage, setActivePage] = useState(1);
  const [auditFilter, setAuditFilter] = useState<'risk' | 'all'>('risk');
  const previewRef = useRef<HTMLElement>(null);
  const currentPage = pages.find((page) => page.no === activePage) || pages[0];
  const audit = manifest.audit || [];
  const counts = useMemo(() => ({
    pass: audit.filter((item) => item.status === 'pass').length,
    warn: audit.filter((item) => item.status === 'warn').length,
    fail: audit.filter((item) => item.status === 'fail').length,
  }), [audit]);
  const visibleAudit = useMemo(
    () => auditFilter === 'risk' ? audit.filter((item) => item.status !== 'pass') : audit,
    [audit, auditFilter],
  );

  useEffect(() => {
    setActivePage(pages[0]?.no || 1);
  }, [manifest.project_root, manifest.material_line_count, pages]);

  function findMaterialPage(filePath: string) {
    const file = manifest.files?.find((item) => item.path === filePath);
    if (!file || !pages.length || file.material_line_end < file.material_line_start) return null;
    if (!manifest.truncated) return Math.min(pages.length, Math.max(1, Math.ceil(file.material_line_start / manifest.lines_per_page)));
    const segmentLines = Math.min(30, Math.floor(pages.length / 2)) * manifest.lines_per_page;
    if (file.material_line_start <= segmentLines) {
      return Math.max(1, Math.ceil(file.material_line_start / manifest.lines_per_page));
    }
    const backStart = Math.max(1, Number(manifest.cleaned_line_count || 0) - segmentLines + 1);
    if (file.material_line_end < backStart) return null;
    return Math.min(pages.length, Math.floor(pages.length / 2) + 1 + Math.floor((Math.max(file.material_line_start, backStart) - backStart) / manifest.lines_per_page));
  }

  function locateEvidence(filePath: string) {
    const page = findMaterialPage(filePath);
    if (!page) return;
    setActivePage(page);
    requestAnimationFrame(() => previewRef.current?.scrollIntoView({ block: 'start' }));
  }

  if (!pages.length && !audit.length) return null;

  return (
    <div className="software-copyright-review">
      {audit.length > 0 && (
        <section className="software-copyright-audit" aria-label="源码材料合规审查">
          <div className="software-copyright-audit-summary">
            <div>
              <strong>提交前审查</strong>
              <span>{counts.pass} 项通过，{counts.warn} 项警告，{counts.fail} 项退回风险</span>
            </div>
            <em className={`is-${counts.fail ? 'fail' : counts.warn ? 'warn' : 'pass'}`}>
              {counts.fail ? '需要处理' : counts.warn ? '建议复核' : '审查通过'}
            </em>
          </div>
          <div className="software-copyright-audit-toolbar" aria-label="审查结果筛选">
            <button type="button" className={auditFilter === 'risk' ? 'is-active' : ''} onClick={() => setAuditFilter('risk')}>
              仅看风险 {counts.fail + counts.warn}
            </button>
            <button type="button" className={auditFilter === 'all' ? 'is-active' : ''} onClick={() => setAuditFilter('all')}>
              全部项目 {audit.length}
            </button>
            <span>排除或修正后需重新抽取，审查状态才会更新。</span>
          </div>
          <div className="software-copyright-audit-list">
            {visibleAudit.length ? visibleAudit.map((item, index) => (
              <details className={`is-${item.status}`} key={`${item.name}-${index}`}>
                <summary>
                  <span aria-hidden="true">{item.status === 'pass' ? '✓' : item.status === 'warn' ? '!' : '×'}</span>
                  <strong>{item.name}</strong>
                  <em>{item.status === 'pass' ? '通过' : item.status === 'warn' ? '警告' : '退回风险'}</em>
                </summary>
                <p>{item.detail}</p>
                {item.recommendation && <div className="software-copyright-audit-recommendation"><strong>处理建议</strong><span>{item.recommendation}</span></div>}
                {item.evidence?.length ? (
                  <ul className="software-copyright-audit-evidence">
                    {item.evidence.map((evidence, evidenceIndex) => (
                      <li key={`${evidence.file}-${evidence.line || 0}-${evidenceIndex}`}>
                        <div>
                          <code>{evidence.file}{evidence.line ? `:${evidence.line}` : ''}</code>
                          <span>{evidence.detail}</span>
                        </div>
                        <div className="software-copyright-audit-evidence-actions">
                          <button type="button" disabled={!findMaterialPage(evidence.file)} onClick={() => locateEvidence(evidence.file)}>定位分页</button>
                          {onExcludeFile && (
                            <button type="button" disabled={disabled || excludedPaths.includes(evidence.file)} onClick={() => onExcludeFile(evidence.file)}>
                              {excludedPaths.includes(evidence.file) ? '已标记排除' : '排除此文件'}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            )) : <div className="software-copyright-audit-empty">当前没有警告或退回风险，可切换到“全部项目”查看通过项。</div>}
          </div>
        </section>
      )}

      {currentPage && (
        <section ref={previewRef} className="software-copyright-page-preview" aria-label="代码材料分页预览">
          <div className="software-copyright-page-preview-head">
            <div>
              <strong>分页预览</strong>
              <span>第 {currentPage.no} 页，共 {pages.length} 页，本页 {currentPage.lines.length} 行</span>
            </div>
            <span title={`${currentPage.start_file} 至 ${currentPage.end_file}`}>
              {currentPage.start_file === currentPage.end_file
                ? currentPage.start_file
                : `${currentPage.start_file} 至 ${currentPage.end_file}`}
            </span>
          </div>
          <div className="software-copyright-page-stage">
            <div className="software-copyright-paper">
              <header>
                <span>{manifest.software_name} {manifest.version} 源程序</span>
                <span>{currentPage.no}</span>
              </header>
              <ol start={(currentPage.no - 1) * manifest.lines_per_page + 1}>
                {currentPage.lines.map((line, index) => <li key={`${currentPage.no}-${index}`}><code>{line || ' '}</code></li>)}
              </ol>
            </div>
          </div>
          <div className="software-copyright-page-thumbs" aria-label="代码材料页码">
            {pages.map((page) => (
              <button
                type="button"
                className={`${page.no === currentPage.no ? 'is-active' : ''} ${page.no === 31 ? 'is-split' : ''}`}
                onClick={() => setActivePage(page.no)}
                aria-current={page.no === currentPage.no ? 'page' : undefined}
                key={page.no}
              >
                {page.no}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
