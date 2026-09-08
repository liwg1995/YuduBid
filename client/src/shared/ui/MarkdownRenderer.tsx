import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';

interface MarkdownRendererProps {
  children: string;
  components?: Components;
  allowRawHtml?: boolean;
  enableGfm?: boolean;
  enableMermaid?: boolean;
}

function markdownUrlTransform(value: string) {
  return value.startsWith('yibiao-asset://') ? value : defaultUrlTransform(value);
}

function normalizeExternalUrl(value: string | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}

function isExternalHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function openExternal(url: string) {
  if (window.yibiao?.openExternal) {
    void window.yibiao.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

function normalizeLegacyHtmlTables(markdown: string) {
  if (!/<table\b/i.test(markdown) || typeof DOMParser === 'undefined') return markdown;

  return markdown.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    const document = new DOMParser().parseFromString(tableHtml, 'text/html');
    const rows = Array.from(document.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
        escapeMarkdownTableCell(cell.textContent || ''),
      ),
    ).filter((row) => row.length > 0);

    if (!rows.length) return document.body.textContent?.trim() || '';

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) => [
      ...row,
      ...Array.from({ length: columnCount - row.length }, () => ''),
    ]);
    const [header, ...body] = normalizedRows;
    const divider = Array.from({ length: columnCount }, () => '---');
    return `\n\n| ${header.join(' | ')} |\n| ${divider.join(' | ')} |${body.length ? `\n${body.map((row) => `| ${row.join(' | ')} |`).join('\n')}` : ''}\n\n`;
  });
}

const defaultMarkdownComponents: Components = {
  a({ node: _node, href, children, ...props }) {
    const externalUrl = normalizeExternalUrl(href);
    const isExternal = isExternalHttpUrl(externalUrl);

    return (
      <a
        {...props}
        href={isExternal ? externalUrl : href}
        rel={isExternal ? 'noreferrer' : props.rel}
        target={isExternal ? '_blank' : props.target}
        onClick={(event) => {
          if (!isExternal) return;
          event.preventDefault();
          event.stopPropagation();
          openExternal(externalUrl);
        }}
      >
        {children as ReactNode}
      </a>
    );
  },
};

function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const source = code.trim();
    if (!source) {
      setStatus('error');
      setErrorMessage('Mermaid 图代码为空');
      return undefined;
    }
    setStatus('loading');
    setErrorMessage('');
    if (container) container.innerHTML = '';
    import('mermaid')
      .then((module) => {
        const mermaid = module.default;
        const dark = document.documentElement.dataset.uiTheme === 'dark';
        mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });
        return mermaid.render(`markdown-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`, source);
      })
      .then(({ svg }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        setStatus('success');
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Mermaid 图渲染失败');
      });
    return () => {
      cancelled = true;
      if (container) container.innerHTML = '';
    };
  }, [code]);

  return (
    <figure className={`mermaid-preview-card is-${status}`}>
      {status === 'loading' && <span>正在渲染 Mermaid 图...</span>}
      {status === 'error' && <div className="mermaid-preview-error"><strong>Mermaid 图渲染失败</strong><small>{errorMessage}</small><pre>{code}</pre></div>}
      <div ref={containerRef} className="mermaid-preview-canvas" aria-hidden={status !== 'success'} />
    </figure>
  );
}

function mergeMarkdownComponents(components?: Components, enableMermaid = false): Components {
  const mermaidComponents: Components = enableMermaid ? {
    pre({ children, ...props }) {
      const child = Children.count(children) === 1 ? Children.only(children) : null;
      if (isValidElement(child)) {
        const childProps = child.props as { className?: string; children?: ReactNode };
        if (/\blanguage-mermaid\b/i.test(childProps.className || '')) {
          return <MermaidBlock code={String(childProps.children || '').replace(/\n$/, '')} />;
        }
      }
      return <pre {...props}>{children}</pre>;
    },
  } : {};
  return { ...defaultMarkdownComponents, ...mermaidComponents, ...(components || {}) };
}

function MarkdownRenderer({ children, components, allowRawHtml = false, enableGfm = true, enableMermaid = false }: MarkdownRendererProps) {
  const normalizedChildren = allowRawHtml ? children : normalizeLegacyHtmlTables(children);

  return (
    <ReactMarkdown
      remarkPlugins={enableGfm ? [remarkGfm] : []}
      rehypePlugins={allowRawHtml ? [rehypeRaw] : []}
      urlTransform={markdownUrlTransform}
      components={mergeMarkdownComponents(components, enableMermaid)}
    >
      {normalizedChildren}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
