interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

function cellText(node: Node): string {
  if (node.nodeType === 3) return node.textContent || '';
  if (node.nodeType !== 1) return '';
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (['script', 'style', 'template'].includes(tag)) return '';
  if (tag === 'br') return '\n';
  const text = Array.from(element.childNodes).map(cellText).join('');
  return ['p', 'div', 'li'].includes(tag) ? `\n${text}\n` : text;
}

function safeSpan(value: string | null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 1000 ? number : 1;
}

function tableNode(html: string): MarkdownNode {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const table = document.querySelector('table');
  const rows = table ? Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table) : [];
  const children = rows.map(row => ({
    type: 'tableRow',
    children: Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(cell => {
      const lines = cellText(cell).replace(/[^\S\n]+/g, ' ').trim().split(/\n+/);
      const content: MarkdownNode[] = [];
      lines.forEach((line, index) => {
        if (index) content.push({ type: 'break' });
        content.push({ type: 'text', value: line.trim() });
      });
      return {
        type: 'tableCell', children: content,
        data: { hProperties: { colSpan: safeSpan(cell.getAttribute('colspan')), rowSpan: safeSpan(cell.getAttribute('rowspan')) } },
      };
    }),
  })).filter(row => row.children.length);
  // 不复制原始 HTML 属性，也不启用 rehypeRaw。只生成文本、换行和受限的合并单元格属性。
  return children.length ? { type: 'table', children } : { type: 'paragraph', children: [{ type: 'text', value: table ? cellText(table).trim() : '' }] };
}

export default function remarkSafeHtmlTables() {
  return (tree: MarkdownNode) => {
    if (typeof DOMParser === 'undefined') return;
    const visit = (parent: MarkdownNode) => {
      if (!parent.children) return;
      for (let index = 0; index < parent.children.length; index += 1) {
        const node = parent.children[index];
        if (node.type !== 'html' || !node.value || !/<table\b/i.test(node.value)) { visit(node); continue; }
        const pattern = /<table\b[\s\S]*?<\/table>/gi;
        const replacements: MarkdownNode[] = [];
        let offset = 0;
        for (const match of node.value.matchAll(pattern)) {
          const start = match.index ?? 0;
          if (start > offset) replacements.push({ type: 'html', value: node.value.slice(offset, start) });
          replacements.push(tableNode(match[0])); offset = start + match[0].length;
        }
        if (!replacements.length) continue;
        if (offset < node.value.length) replacements.push({ type: 'html', value: node.value.slice(offset) });
        parent.children.splice(index, 1, ...replacements); index += replacements.length - 1;
      }
    };
    visit(tree);
  };
}
