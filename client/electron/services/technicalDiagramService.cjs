const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getGeneratedImagesDir } = require('../utils/paths.cjs');

const DIAGRAM_TYPES = new Set(['architecture', 'data-flow', 'flowchart', 'deployment', 'process', 'topology']);
const DIAGRAM_STYLES = new Set(['document', 'blueprint', 'clean']);
const FLOW_TYPES = new Set(['primary', 'data', 'control', 'write', 'read', 'async', 'feedback']);
const SVG_WIDTH = 1120;
const DEFAULT_NODE_WIDTH = 172;
const DEFAULT_NODE_HEIGHT = 58;
const MAX_TEXT_LENGTH = 28;

const styleProfiles = {
  document: {
    background: '#ffffff',
    title: '#132238',
    subtitle: '#5d6b7a',
    containerFill: '#f7f9fc',
    containerStroke: '#d9e2ec',
    nodeFill: '#ffffff',
    nodeStroke: '#9fb3c8',
    nodeText: '#172a3a',
    nodeSubText: '#5d6b7a',
    arrow: '#2563eb',
    muted: '#8a9bad',
  },
  blueprint: {
    background: '#082f49',
    title: '#e0f2fe',
    subtitle: '#7dd3fc',
    containerFill: 'none',
    containerStroke: '#0ea5e9',
    nodeFill: '#0b3b5e',
    nodeStroke: '#67e8f9',
    nodeText: '#e0f2fe',
    nodeSubText: '#bae6fd',
    arrow: '#67e8f9',
    muted: '#7dd3fc',
  },
  clean: {
    background: '#ffffff',
    title: '#111827',
    subtitle: '#6b7280',
    containerFill: '#ffffff',
    containerStroke: '#e5e7eb',
    nodeFill: '#f9fafb',
    nodeStroke: '#d1d5db',
    nodeText: '#111827',
    nodeSubText: '#6b7280',
    arrow: '#0f766e',
    muted: '#9ca3af',
  },
};

const flowColors = {
  primary: '#2563eb',
  data: '#f97316',
  control: '#7c3aed',
  write: '#10b981',
  read: '#0ea5e9',
  async: '#f59e0b',
  feedback: '#ef4444',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function singleLine(value, maxLength = 80) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDiagramType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return DIAGRAM_TYPES.has(normalized) ? normalized : 'architecture';
}

function normalizeDiagramStyle(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return DIAGRAM_STYLES.has(normalized) ? normalized : 'document';
}

function normalizeFlow(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return FLOW_TYPES.has(normalized) ? normalized : 'primary';
}

function normalizeNode(raw, index) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const id = singleLine(source.id, 48) || `node-${index + 1}`;
  const label = singleLine(source.label || source.name || source.title, 60) || `节点${index + 1}`;
  return {
    id,
    label,
    sublabel: singleLine(source.sublabel || source.subtitle || source.type_label || source.type, 56),
    group: singleLine(source.group || source.layer || source.container, 48),
    kind: ['database', 'decision', 'actor', 'service', 'gateway'].includes(source.kind) ? source.kind : 'service',
  };
}

function normalizeArrow(raw, index, nodeIds) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const from = singleLine(source.from || source.source || source.start, 48);
  const to = singleLine(source.to || source.target || source.end, 48);
  if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) {
    return null;
  }
  return {
    id: `arrow-${index + 1}`,
    from,
    to,
    label: singleLine(source.label || source.text || source.name, 42),
    flow: normalizeFlow(source.flow || source.type),
  };
}

function normalizeDiagramData(input) {
  const source = input && typeof input === 'object' ? input : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const nodes = rawNodes.slice(0, 18).map(normalizeNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const arrows = (Array.isArray(source.arrows) ? source.arrows : source.edges || [])
    .slice(0, 28)
    .map((arrow, index) => normalizeArrow(arrow, index, nodeIds))
    .filter(Boolean);

  return {
    type: normalizeDiagramType(source.type || source.diagram_type || source.diagramType),
    style: normalizeDiagramStyle(source.style),
    title: singleLine(source.title, 80) || '技术图谱',
    subtitle: singleLine(source.subtitle || source.description, 120),
    nodes,
    arrows,
    legend: (Array.isArray(source.legend) ? source.legend : [])
      .slice(0, 6)
      .map((item) => ({
        flow: normalizeFlow(item?.flow || item?.type),
        label: singleLine(item?.label || item?.text, 40),
      }))
      .filter((item) => item.label),
  };
}

function groupNodes(nodes) {
  const groups = [];
  const byGroup = new Map();
  for (const node of nodes) {
    const group = node.group || '核心组件';
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
      groups.push({ label: group, nodes: byGroup.get(group) });
    }
    byGroup.get(group).push(node);
  }
  return groups;
}

function layoutDiagram(nodes) {
  const groups = groupNodes(nodes);
  const contentTop = 118;
  const rowGap = 116;
  const minHeight = contentTop + Math.max(1, groups.length) * rowGap + 92;
  const height = clamp(minHeight, 520, 980);
  const positioned = new Map();
  const containers = [];

  groups.forEach((group, rowIndex) => {
    const y = contentTop + rowIndex * rowGap;
    const count = group.nodes.length;
    const availableWidth = SVG_WIDTH - 144;
    const step = count <= 1 ? 0 : availableWidth / (count - 1);
    const containerY = y - 32;
    containers.push({
      label: group.label,
      x: 44,
      y: containerY,
      width: SVG_WIDTH - 88,
      height: 96,
    });
    group.nodes.forEach((node, columnIndex) => {
      const centerX = count <= 1 ? SVG_WIDTH / 2 : 72 + columnIndex * step;
      positioned.set(node.id, {
        ...node,
        x: clamp(centerX - DEFAULT_NODE_WIDTH / 2, 68, SVG_WIDTH - 68 - DEFAULT_NODE_WIDTH),
        y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      });
    });
  });

  return {
    width: SVG_WIDTH,
    height,
    nodes: Array.from(positioned.values()),
    nodeMap: positioned,
    containers,
  };
}

function nodePort(node, side) {
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y };
  return { x: node.x + node.width / 2, y: node.y + node.height };
}

function arrowPath(fromNode, toNode) {
  const sameRow = Math.abs(fromNode.y - toNode.y) < 20;
  if (sameRow) {
    const from = nodePort(fromNode, fromNode.x < toNode.x ? 'right' : 'left');
    const to = nodePort(toNode, fromNode.x < toNode.x ? 'left' : 'right');
    return {
      d: `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`,
      labelX: (from.x + to.x) / 2,
      labelY: from.y - 10,
    };
  }
  const from = nodePort(fromNode, fromNode.y < toNode.y ? 'bottom' : 'top');
  const to = nodePort(toNode, fromNode.y < toNode.y ? 'top' : 'bottom');
  const middleY = (from.y + to.y) / 2;
  return {
    d: `M ${from.x} ${from.y} C ${from.x} ${middleY}, ${to.x} ${middleY}, ${to.x} ${to.y}`,
    labelX: (from.x + to.x) / 2,
    labelY: middleY - 8,
  };
}

function renderNode(node, style) {
  const label = escapeXml(node.label.length > MAX_TEXT_LENGTH ? `${node.label.slice(0, MAX_TEXT_LENGTH - 1)}…` : node.label);
  const sublabel = escapeXml(node.sublabel.length > MAX_TEXT_LENGTH ? `${node.sublabel.slice(0, MAX_TEXT_LENGTH - 1)}…` : node.sublabel);
  const rx = node.kind === 'decision' ? 4 : 10;

  if (node.kind === 'database') {
    return [
      `<g>`,
      `<path d="M ${node.x} ${node.y + 12} C ${node.x} ${node.y - 2}, ${node.x + node.width} ${node.y - 2}, ${node.x + node.width} ${node.y + 12} L ${node.x + node.width} ${node.y + node.height - 12} C ${node.x + node.width} ${node.y + node.height + 2}, ${node.x} ${node.y + node.height + 2}, ${node.x} ${node.y + node.height - 12} Z" fill="${style.nodeFill}" stroke="${style.nodeStroke}" stroke-width="1.6"/>`,
      `<path d="M ${node.x} ${node.y + 12} C ${node.x} ${node.y + 26}, ${node.x + node.width} ${node.y + 26}, ${node.x + node.width} ${node.y + 12}" fill="none" stroke="${style.nodeStroke}" stroke-width="1.4"/>`,
      `<text x="${node.x + node.width / 2}" y="${node.y + 32}" text-anchor="middle" class="node-title">${label}</text>`,
      sublabel ? `<text x="${node.x + node.width / 2}" y="${node.y + 49}" text-anchor="middle" class="node-sub">${sublabel}</text>` : '',
      `</g>`,
    ].filter(Boolean).join('\n');
  }

  if (node.kind === 'decision') {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    return [
      `<g>`,
      `<path d="M ${cx} ${node.y - 4} L ${node.x + node.width + 12} ${cy} L ${cx} ${node.y + node.height + 4} L ${node.x - 12} ${cy} Z" fill="${style.nodeFill}" stroke="${style.nodeStroke}" stroke-width="1.6"/>`,
      `<text x="${cx}" y="${cy - (sublabel ? 2 : -5)}" text-anchor="middle" class="node-title">${label}</text>`,
      sublabel ? `<text x="${cx}" y="${cy + 17}" text-anchor="middle" class="node-sub">${sublabel}</text>` : '',
      `</g>`,
    ].filter(Boolean).join('\n');
  }

  return [
    `<g>`,
    `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${rx}" fill="${style.nodeFill}" stroke="${style.nodeStroke}" stroke-width="1.6"/>`,
    `<text x="${node.x + node.width / 2}" y="${node.y + (sublabel ? 27 : 36)}" text-anchor="middle" class="node-title">${label}</text>`,
    sublabel ? `<text x="${node.x + node.width / 2}" y="${node.y + 45}" text-anchor="middle" class="node-sub">${sublabel}</text>` : '',
    `</g>`,
  ].filter(Boolean).join('\n');
}

function renderSvg(diagram) {
  const style = styleProfiles[diagram.style] || styleProfiles.document;
  const layout = layoutDiagram(diagram.nodes.length ? diagram.nodes : [
    normalizeNode({ id: 'input', label: '输入信息', group: '输入层' }, 0),
    normalizeNode({ id: 'core', label: '核心处理', group: '处理层' }, 1),
    normalizeNode({ id: 'output', label: '输出成果', group: '输出层' }, 2),
  ]);
  const arrows = diagram.arrows.length ? diagram.arrows : [
    { from: 'input', to: 'core', label: '处理', flow: 'primary' },
    { from: 'core', to: 'output', label: '输出', flow: 'data' },
  ];
  const defs = Object.entries(flowColors)
    .map(([flow, color]) => `<marker id="arrow-${flow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`)
    .join('\n');

  const containerSvg = layout.containers.map((container) => [
    `<rect x="${container.x}" y="${container.y}" width="${container.width}" height="${container.height}" rx="12" fill="${style.containerFill}" stroke="${style.containerStroke}" stroke-width="1.2" stroke-dasharray="6 5"/>`,
    `<text x="${container.x + 16}" y="${container.y + 23}" class="section">${escapeXml(container.label)}</text>`,
  ].join('\n')).join('\n');

  const arrowSvg = arrows.map((arrow) => {
    const fromNode = layout.nodeMap.get(arrow.from);
    const toNode = layout.nodeMap.get(arrow.to);
    if (!fromNode || !toNode) return '';
    const flow = normalizeFlow(arrow.flow);
    const color = flowColors[flow] || style.arrow;
    const pathData = arrowPath(fromNode, toNode);
    const label = singleLine(arrow.label, 34);
    return [
      `<path d="${pathData.d}" fill="none" stroke="${color}" stroke-width="2.2" marker-end="url(#arrow-${flow})"/>`,
      label ? `<g><rect x="${pathData.labelX - Math.max(34, label.length * 6) / 2}" y="${pathData.labelY - 15}" width="${Math.max(34, label.length * 6)}" height="20" rx="10" fill="${style.background}" opacity="0.92"/><text x="${pathData.labelX}" y="${pathData.labelY}" text-anchor="middle" class="arrow-label">${escapeXml(label)}</text></g>` : '',
    ].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');

  const legendItems = diagram.legend.length ? diagram.legend : [
    { flow: 'primary', label: '主流程' },
    { flow: 'data', label: '数据流' },
    { flow: 'control', label: '控制关系' },
  ];
  const legendSvg = legendItems.map((item, index) => {
    const x = 48 + index * 138;
    const y = layout.height - 34;
    const flow = normalizeFlow(item.flow);
    const color = flowColors[flow] || style.arrow;
    return `<g><line x1="${x}" y1="${y}" x2="${x + 28}" y2="${y}" stroke="${color}" stroke-width="2.2" marker-end="url(#arrow-${flow})"/><text x="${x + 38}" y="${y + 4}" class="legend">${escapeXml(item.label)}</text></g>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}">
  <defs>
    ${defs}
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
      .title { font-size: 30px; font-weight: 700; fill: ${style.title}; }
      .subtitle { font-size: 14px; font-weight: 500; fill: ${style.subtitle}; }
      .section { font-size: 13px; font-weight: 700; fill: ${style.muted}; letter-spacing: 1px; }
      .node-title { font-size: 17px; font-weight: 700; fill: ${style.nodeText}; }
      .node-sub { font-size: 12px; font-weight: 500; fill: ${style.nodeSubText}; }
      .arrow-label { font-size: 12px; font-weight: 600; fill: ${style.subtitle}; }
      .legend { font-size: 12px; font-weight: 500; fill: ${style.subtitle}; }
    </style>
  </defs>
  <rect width="${layout.width}" height="${layout.height}" fill="${style.background}"/>
  <text x="${layout.width / 2}" y="48" text-anchor="middle" class="title">${escapeXml(diagram.title)}</text>
  ${diagram.subtitle ? `<text x="${layout.width / 2}" y="74" text-anchor="middle" class="subtitle">${escapeXml(diagram.subtitle)}</text>` : ''}
  ${containerSvg}
  ${arrowSvg}
  ${layout.nodes.map((node) => renderNode(node, style)).join('\n')}
  ${legendSvg}
</svg>`;
}

function saveSvg(app, svg) {
  const imagesDir = getGeneratedImagesDir(app);
  fs.mkdirSync(imagesDir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.svg`;
  const filePath = path.join(imagesDir, fileName);
  fs.writeFileSync(filePath, svg, 'utf-8');
  return {
    asset_url: `yibiao-asset://generated-images/${encodeURIComponent(fileName)}`,
    file_path: filePath,
    mime_type: 'image/svg+xml',
  };
}

function createTechnicalDiagramService({ app }) {
  return {
    generateDiagram(input) {
      const diagram = normalizeDiagramData(input);
      const svg = renderSvg(diagram);
      return {
        ...saveSvg(app, svg),
        title: diagram.title,
        type: diagram.type,
        style: diagram.style,
      };
    },
  };
}

module.exports = {
  createTechnicalDiagramService,
  normalizeDiagramData,
};
