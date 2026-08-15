import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';

interface MarkdownRendererProps {
  children: string;
  components?: Components;
  allowRawHtml?: boolean;
  enableGfm?: boolean;
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

function mergeMarkdownComponents(components?: Components): Components {
  return { ...defaultMarkdownComponents, ...(components || {}) };
}

function MarkdownRenderer({ children, components, allowRawHtml = false, enableGfm = true }: MarkdownRendererProps) {
  const normalizedChildren = allowRawHtml ? children : normalizeLegacyHtmlTables(children);

  return (
    <ReactMarkdown
      remarkPlugins={enableGfm ? [remarkGfm] : []}
      rehypePlugins={allowRawHtml ? [rehypeRaw] : []}
      urlTransform={markdownUrlTransform}
      components={mergeMarkdownComponents(components)}
    >
      {normalizedChildren}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
