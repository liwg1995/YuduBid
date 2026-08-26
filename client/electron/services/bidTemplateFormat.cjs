const SIZE_TO_PT = { 初号: 42, 小初: 36, 一号: 26, 小一: 24, 二号: 22, 小二: 18, 三号: 16, 小三: 15, 四号: 14, 小四: 12, 五号: 10.5, 小五: 9, 六号: 7.5, 小六: 6.5 };
const ALIGNMENTS = ['居中对齐', '两端对齐', '左对齐', '右对齐'];
const PAPER_SIZES = ['a4', 'a3', 'a5', 'b4', 'b5', 'letter', 'legal', '16k'];
const LIST_STYLES = ['none', 'disc', 'circle', 'square', 'diamond', 'dash', 'check', 'arrow', 'sparkle'];
const ORDERED_LIST_STYLES = ['decimal-dot', 'decimal-paren', 'decimal-full-paren', 'chinese-dot', 'chinese-paren', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];
const PARAGRAPH_SPACING_UNITS = ['pt', 'in', 'cm', 'mm', 'line', 'auto'];
const LINE_SPACING_MODES = ['single', 'one-and-half', 'double', 'at-least', 'exact', 'multiple'];
const LINE_SPACING_UNITS = ['multiple', 'pt', 'in', 'cm', 'mm'];

const DEFAULT_CELL = { font: '宋体', size: '小四', alignment: '左对齐', text_color: '#243048', background_color: '#ffffff' };
const DEFAULT_BID_EXPORT_TEMPLATE = {
  template_name: '默认模版',
  auto_numbering_enabled: true,
  page: { paper_size: 'a4', orientation: 'portrait', first_page_different: false, margin_top_cm: 2, margin_bottom_cm: 2, margin_left_cm: 2, margin_right_cm: 2, header_enabled: false, header_text: '', header_font: '宋体', header_size: '小五', header_alignment: '居中对齐', header_color: '#536176', footer_enabled: false, footer_text: '', footer_distance_cm: 1.75, footer_font: '宋体', footer_size: '小五', footer_alignment: '居中对齐', footer_color: '#536176', page_number_enabled: false, page_number_format: '第{page}页', page_number_start: 1 },
  cover: { enabled: false, logo_path: '', logo_width_cm: 4, project_name: '{project_name}', document_title: '投标技术文件', tenderer: '', bidder: '', compilation_date: '{date}', font: '宋体', project_name_size: '二号', document_title_size: '初号', info_size: '四号', alignment: '居中对齐', text_color: '#000000', bold: false, hide_header_footer: true },
  heading_level1_page_break_before: false,
  heading_border: { enabled: false, min_heading_left_enabled: false, border_color: '#cfd8ee', level_cell_colors: ['#eef5ff', '#f3f7ff', '#f8fbff', '#fbfdff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], structure: '上下结构' },
  headings: Array.from({ length: 9 }, () => ({ font: '宋体', size: '四号', alignment: '两端对齐', bold: false, text_color: '#000000', spacing_before_pt: 0, spacing_before_unit: 'pt', spacing_after_pt: 0, spacing_after_unit: 'pt', first_line_indent_chars: 0, line_spacing: 1.5, line_spacing_mode: 'one-and-half', line_spacing_unit: 'multiple', numbering_format: 'outline-decimal', numbering_template: '' })),
  body_text: { font: '宋体', size: '小四', alignment: '两端对齐', spacing_before_pt: 0, spacing_before_unit: 'pt', spacing_after_pt: 0, spacing_after_unit: 'pt', first_line_indent_chars: 2, line_spacing_multiple: 1.5, line_spacing_mode: 'one-and-half', line_spacing_unit: 'multiple', list_style: 'disc', ordered_list_style: 'decimal-full-paren', list_indent_chars: 2 },
  table: { border_width: 1, border_color: '#000000', cell_padding_pt: 6, full_width: true, caption_enabled: true, caption_font: '宋体', caption_size: '小五', caption_alignment: '居中对齐', caption_bold: false, caption_italic: false, header_row: { ...DEFAULT_CELL, font: '黑体', alignment: '居中对齐', background_color: '#eef5ff' }, first_column: { ...DEFAULT_CELL }, body_cell: { ...DEFAULT_CELL } },
  image: { max_width_percent: 90, alignment: '居中对齐', caption_enabled: true, caption_font: '宋体', caption_size: '小五', caption_alignment: '居中对齐', caption_bold: false, caption_italic: false },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function text(value, fallback = '', max = 200) { return (typeof value === 'string' ? value.trim() : '')?.slice(0, max) || fallback; }
function number(value, fallback, min, max) { const next = Number(value); return Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : fallback; }
function color(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback.toUpperCase(); }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function size(value, fallback) { return Object.prototype.hasOwnProperty.call(SIZE_TO_PT, value) ? value : fallback; }

function migrateLegacy(source) {
  if (!source || typeof source !== 'object' || !source.templateName || source.template_name) return source || {};
  const align = (value) => ({ left: '左对齐', center: '居中对齐', right: '右对齐', justify: '两端对齐' }[value] || value);
  const ptToSize = (value, fallback) => Object.entries(SIZE_TO_PT).sort((a, b) => Math.abs(a[1] - value) - Math.abs(b[1] - value))[0]?.[0] || fallback;
  const migrated = clone(DEFAULT_BID_EXPORT_TEMPLATE);
  migrated.template_name = source.templateName;
  migrated.page = { ...migrated.page, paper_size: 'a4', orientation: source.page?.orientation || 'portrait', margin_top_cm: source.page?.marginTopCm, margin_bottom_cm: source.page?.marginBottomCm, margin_left_cm: source.page?.marginLeftCm, margin_right_cm: source.page?.marginRightCm, header_enabled: source.page?.headerEnabled, header_text: source.page?.headerText || '', footer_enabled: source.page?.footerEnabled, footer_text: source.page?.footerText || '', page_number_enabled: source.page?.pageNumberEnabled };
  migrated.headings = migrated.headings.map((heading, index) => { const legacyLineSpacing = source.headings?.[index]?.lineSpacing; return { ...heading, font: source.headings?.[index]?.font || heading.font, size: ptToSize(source.headings?.[index]?.sizePt, heading.size), alignment: align(source.headings?.[index]?.alignment) || heading.alignment, bold: source.headings?.[index]?.bold ?? heading.bold, text_color: source.headings?.[index]?.color || heading.text_color, spacing_before_pt: source.headings?.[index]?.spacingBeforePt ?? heading.spacing_before_pt, spacing_after_pt: source.headings?.[index]?.spacingAfterPt ?? heading.spacing_after_pt, line_spacing: legacyLineSpacing ?? heading.line_spacing, line_spacing_mode: legacyLineSpacing === undefined ? heading.line_spacing_mode : legacyLineSpacing === 1 ? 'single' : 'multiple', line_spacing_unit: 'multiple' }; });
  migrated.body_text = { ...migrated.body_text, font: source.body?.font || migrated.body_text.font, size: ptToSize(source.body?.sizePt, migrated.body_text.size), alignment: align(source.body?.alignment) || migrated.body_text.alignment, first_line_indent_chars: source.body?.firstLineIndentChars ?? migrated.body_text.first_line_indent_chars, line_spacing_multiple: source.body?.lineSpacing ?? migrated.body_text.line_spacing_multiple, spacing_after_pt: source.body?.spacingAfterPt ?? migrated.body_text.spacing_after_pt };
  migrated.table = { ...migrated.table, border_color: source.table?.borderColor || migrated.table.border_color, border_width: source.table?.borderWidth ?? migrated.table.border_width, cell_padding_pt: source.table?.cellPaddingPt ?? migrated.table.cell_padding_pt, header_row: { ...migrated.table.header_row, font: source.table?.headerFont || migrated.table.header_row.font, size: ptToSize(source.table?.fontSizePt, migrated.table.header_row.size), background_color: source.table?.headerBackgroundColor || migrated.table.header_row.background_color }, body_cell: { ...migrated.table.body_cell, font: source.table?.bodyFont || migrated.table.body_cell.font, size: ptToSize(source.table?.fontSizePt, migrated.table.body_cell.size) } };
  migrated.image = { ...migrated.image, max_width_percent: source.image?.maxWidthPercent ?? migrated.image.max_width_percent, alignment: align(source.image?.alignment) || migrated.image.alignment, caption_enabled: source.image?.captionEnabled ?? true, caption_font: source.image?.captionFont || migrated.image.caption_font, caption_size: ptToSize(source.image?.captionSizePt, migrated.image.caption_size) };
  return migrated;
}

function normalizeCell(source, defaults) {
  const value = source && typeof source === 'object' ? source : {};
  return { font: text(value.font, defaults.font, 80), size: size(value.size, defaults.size), alignment: choice(value.alignment, ALIGNMENTS, defaults.alignment), text_color: color(value.text_color, defaults.text_color), background_color: color(value.background_color, defaults.background_color) };
}

function normalizeLineSpacing(value, fallbackValue, fallbackMode, fallbackUnit) {
  const hasLegacyValue = value && value.line_spacing_mode === undefined && value.line_spacing !== undefined;
  const mode = choice(value?.line_spacing_mode, LINE_SPACING_MODES, hasLegacyValue ? 'multiple' : fallbackMode);
  const lockedValue = { single: 1, 'one-and-half': 1.5, double: 2 }[mode];
  const unit = ['single', 'one-and-half', 'double', 'multiple'].includes(mode)
    ? 'multiple'
    : choice(value?.line_spacing_unit, LINE_SPACING_UNITS.filter((item) => item !== 'multiple'), fallbackUnit === 'multiple' ? 'pt' : fallbackUnit);
  const defaultValue = ['at-least', 'exact'].includes(mode) ? 28 : fallbackValue;
  return { value: lockedValue ?? number(value?.line_spacing, defaultValue, 0.1, 1000), mode, unit };
}

function normalizeBidExportTemplate(input) {
  const source = migrateLegacy(input);
  const def = DEFAULT_BID_EXPORT_TEMPLATE;
  const page = source.page || {};
  const cover = source.cover || {};
  const border = source.heading_border || {};
  const body = source.body_text || {};
  const table = source.table || {};
  const image = source.image || {};
  return {
    template_name: text(source.templateName || source.template_name, def.template_name, 80),
    auto_numbering_enabled: source.auto_numbering_enabled !== false,
    page: { paper_size: choice(page.paper_size, PAPER_SIZES, def.page.paper_size), orientation: page.orientation === 'landscape' ? 'landscape' : 'portrait', first_page_different: Boolean(page.first_page_different), margin_top_cm: number(page.margin_top_cm, def.page.margin_top_cm, 0, 10), margin_bottom_cm: number(page.margin_bottom_cm, def.page.margin_bottom_cm, 0, 10), margin_left_cm: number(page.margin_left_cm, def.page.margin_left_cm, 0, 10), margin_right_cm: number(page.margin_right_cm, def.page.margin_right_cm, 0, 10), header_enabled: Boolean(page.header_enabled), header_text: text(page.header_text, '', 200), header_font: text(page.header_font, def.page.header_font, 80), header_size: size(page.header_size, def.page.header_size), header_alignment: choice(page.header_alignment, ALIGNMENTS, def.page.header_alignment), header_color: color(page.header_color, def.page.header_color), footer_enabled: Boolean(page.footer_enabled), footer_text: text(page.footer_text, '', 200), footer_distance_cm: number(page.footer_distance_cm, def.page.footer_distance_cm, 0, 5), footer_font: text(page.footer_font, def.page.footer_font, 80), footer_size: size(page.footer_size, def.page.footer_size), footer_alignment: choice(page.footer_alignment, ALIGNMENTS, def.page.footer_alignment), footer_color: color(page.footer_color, def.page.footer_color), page_number_enabled: Boolean(page.page_number_enabled), page_number_format: text(page.page_number_format, def.page.page_number_format, 80), page_number_start: number(page.page_number_start, def.page.page_number_start, 1, 9999) },
    cover: { enabled: Boolean(cover.enabled), logo_path: text(cover.logo_path, '', 1200), logo_width_cm: number(cover.logo_width_cm, def.cover.logo_width_cm, 1, 12), project_name: text(cover.project_name, def.cover.project_name, 300), document_title: text(cover.document_title, def.cover.document_title, 300), tenderer: text(cover.tenderer, '', 300), bidder: text(cover.bidder, '', 300), compilation_date: text(cover.compilation_date, def.cover.compilation_date, 120), font: text(cover.font, def.cover.font, 80), project_name_size: size(cover.project_name_size, def.cover.project_name_size), document_title_size: size(cover.document_title_size, def.cover.document_title_size), info_size: size(cover.info_size, def.cover.info_size), alignment: choice(cover.alignment, ALIGNMENTS, def.cover.alignment), text_color: color(cover.text_color, def.cover.text_color), bold: Boolean(cover.bold), hide_header_footer: cover.hide_header_footer !== false },
    heading_level1_page_break_before: Boolean(source.heading_level1_page_break_before),
    heading_border: { enabled: Boolean(border.enabled), min_heading_left_enabled: Boolean(border.min_heading_left_enabled), border_color: color(border.border_color, def.heading_border.border_color), level_cell_colors: def.heading_border.level_cell_colors.map((fallback, index) => color(border.level_cell_colors?.[index], fallback)), structure: choice(border.structure, ['上下结构', '左右结构'], def.heading_border.structure) },
    headings: def.headings.map((fallback, index) => { const value = source.headings?.[index] || {}; const line = normalizeLineSpacing(value, fallback.line_spacing, fallback.line_spacing_mode, fallback.line_spacing_unit); return { font: text(value.font, fallback.font, 80), size: size(value.size, fallback.size), alignment: choice(value.alignment, ALIGNMENTS, fallback.alignment), bold: value.bold === undefined ? fallback.bold : Boolean(value.bold), text_color: color(value.text_color, fallback.text_color), spacing_before_pt: number(value.spacing_before_pt, fallback.spacing_before_pt, 0, 1000), spacing_before_unit: choice(value.spacing_before_unit, PARAGRAPH_SPACING_UNITS, fallback.spacing_before_unit), spacing_after_pt: number(value.spacing_after_pt, fallback.spacing_after_pt, 0, 1000), spacing_after_unit: choice(value.spacing_after_unit, PARAGRAPH_SPACING_UNITS, fallback.spacing_after_unit), first_line_indent_chars: number(value.first_line_indent_chars, fallback.first_line_indent_chars, 0, 10), line_spacing: line.value, line_spacing_mode: line.mode, line_spacing_unit: line.unit, numbering_format: choice(value.numbering_format, ['outline-decimal', 'custom'], fallback.numbering_format), numbering_template: typeof value.numbering_template === 'string' ? value.numbering_template.slice(0, 100) : fallback.numbering_template }; }),
    body_text: (() => { const line = normalizeLineSpacing({ line_spacing: body.line_spacing_multiple, line_spacing_mode: body.line_spacing_mode, line_spacing_unit: body.line_spacing_unit }, def.body_text.line_spacing_multiple, def.body_text.line_spacing_mode, def.body_text.line_spacing_unit); return { font: text(body.font, def.body_text.font, 80), size: size(body.size, def.body_text.size), alignment: choice(body.alignment, ALIGNMENTS, def.body_text.alignment), spacing_before_pt: number(body.spacing_before_pt, def.body_text.spacing_before_pt, 0, 1000), spacing_before_unit: choice(body.spacing_before_unit, PARAGRAPH_SPACING_UNITS, def.body_text.spacing_before_unit), spacing_after_pt: number(body.spacing_after_pt, def.body_text.spacing_after_pt, 0, 1000), spacing_after_unit: choice(body.spacing_after_unit, PARAGRAPH_SPACING_UNITS, def.body_text.spacing_after_unit), first_line_indent_chars: number(body.first_line_indent_chars, def.body_text.first_line_indent_chars, 0, 10), line_spacing_multiple: line.value, line_spacing_mode: line.mode, line_spacing_unit: line.unit, list_style: choice(body.list_style, LIST_STYLES, def.body_text.list_style), ordered_list_style: choice(body.ordered_list_style, ORDERED_LIST_STYLES, def.body_text.ordered_list_style), list_indent_chars: number(body.list_indent_chars, def.body_text.list_indent_chars, 0, 10) }; })(),
    table: { border_width: number(table.border_width, def.table.border_width, 0, 10), border_color: color(table.border_color, def.table.border_color), cell_padding_pt: number(table.cell_padding_pt, def.table.cell_padding_pt, 0, 50), full_width: table.full_width !== false, caption_enabled: table.caption_enabled !== false, caption_font: text(table.caption_font, def.table.caption_font, 80), caption_size: size(table.caption_size, def.table.caption_size), caption_alignment: choice(table.caption_alignment, ALIGNMENTS, def.table.caption_alignment), caption_bold: Boolean(table.caption_bold), caption_italic: Boolean(table.caption_italic), header_row: normalizeCell(table.header_row, def.table.header_row), first_column: normalizeCell(table.first_column, def.table.first_column), body_cell: normalizeCell(table.body_cell, def.table.body_cell) },
    image: { max_width_percent: number(image.max_width_percent, def.image.max_width_percent, 10, 100), alignment: choice(image.alignment, ALIGNMENTS, def.image.alignment), caption_enabled: image.caption_enabled !== false, caption_font: text(image.caption_font, def.image.caption_font, 80), caption_size: size(image.caption_size, def.image.caption_size), caption_alignment: choice(image.caption_alignment, ALIGNMENTS, def.image.caption_alignment), caption_bold: Boolean(image.caption_bold), caption_italic: Boolean(image.caption_italic) },
  };
}

function cloneDefaultBidExportTemplate() { return clone(DEFAULT_BID_EXPORT_TEMPLATE); }

module.exports = { DEFAULT_BID_EXPORT_TEMPLATE, SIZE_TO_PT, cloneDefaultBidExportTemplate, normalizeBidExportTemplate };
