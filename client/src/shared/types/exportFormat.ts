/**
 * 导出格式配置类型、编号格式选项和字号/字体映射表
 */

// ── 编号格式 ─────────────────────────────────────
export const HEADING_NUMBERING_FORMAT_OPTIONS = [
  { value: 'outline-decimal', label: '数字连续多级编号（1.1.1）' },
  { value: 'custom', label: '自定义' },
] as const;

export type HeadingNumberingFormat = (typeof HEADING_NUMBERING_FORMAT_OPTIONS)[number]['value'];

export const PARAGRAPH_SPACING_UNIT_OPTIONS = [
  { value: 'pt', label: '磅' },
  { value: 'in', label: '英寸' },
  { value: 'cm', label: '厘米' },
  { value: 'mm', label: '毫米' },
  { value: 'line', label: '行' },
  { value: 'auto', label: '自动' },
] as const;

export type ParagraphSpacingUnit = (typeof PARAGRAPH_SPACING_UNIT_OPTIONS)[number]['value'];

export const LINE_SPACING_MODE_OPTIONS = [
  { value: 'single', label: '单倍行距' },
  { value: 'one-and-half', label: '1.5 倍行距' },
  { value: 'double', label: '2 倍行距' },
  { value: 'at-least', label: '最小值' },
  { value: 'exact', label: '固定值' },
  { value: 'multiple', label: '多倍行距' },
] as const;

export type LineSpacingMode = (typeof LINE_SPACING_MODE_OPTIONS)[number]['value'];
export type LineSpacingUnit = 'multiple' | 'pt' | 'in' | 'cm' | 'mm';

export const HEADING_BORDER_STRUCTURE_OPTIONS = [
  { value: '上下结构', label: '上下结构' },
  { value: '左右结构', label: '左右结构' },
] as const;

export type HeadingBorderStructure = (typeof HEADING_BORDER_STRUCTURE_OPTIONS)[number]['value'];

// ── 标题级别样式 ──────────────────────────────────
export interface HeadingStyleConfig {
  font: string;
  size: string;                 // 中文字号名，如 '小二'、'四号'
  alignment: string;            // '居中对齐' | '两端对齐' | '左对齐' | '右对齐'
  bold: boolean;
  text_color: string;
  spacing_before_pt: number;
  spacing_before_unit: ParagraphSpacingUnit;
  spacing_after_pt: number;
  spacing_after_unit: ParagraphSpacingUnit;
  first_line_indent_chars: number;
  line_spacing: number;
  line_spacing_mode: LineSpacingMode;
  line_spacing_unit: LineSpacingUnit;
  numbering_format: HeadingNumberingFormat;
  numbering_template: string;   // 自定义编号模板，支持 {zh}、{num}、{tail}、{tail1} 至 {tail9}、{full}、{circled} 等
}

export interface HeadingBorderConfig {
  enabled: boolean;
  min_heading_left_enabled: boolean;
  border_color: string;
  level_cell_colors: string[];
  structure: HeadingBorderStructure;
}

// ── 正文样式 ──────────────────────────────────────
export interface BodyTextStyleConfig {
  font: string;
  size: string;
  alignment: string;
  spacing_before_pt: number;
  spacing_before_unit: ParagraphSpacingUnit;
  spacing_after_pt: number;
  spacing_after_unit: ParagraphSpacingUnit;
  first_line_indent_chars: number;
  line_spacing_multiple: number;
  line_spacing_mode: LineSpacingMode;
  line_spacing_unit: LineSpacingUnit;
  list_style: ListStyle;
  ordered_list_style: OrderedListStyle;
  list_indent_chars: number;
}

export interface TableCellStyleConfig {
  font: string;
  size: string;
  alignment: string;
  text_color: string;
  background_color: string;
}

export interface TableStyleConfig {
  border_width: number;
  border_color: string;
  cell_padding_pt: number;
  full_width: boolean;
  caption_enabled: boolean;
  caption_font: string;
  caption_size: string;
  caption_alignment: string;
  caption_bold: boolean;
  caption_italic: boolean;
  header_row: TableCellStyleConfig;
  first_column: TableCellStyleConfig;
  body_cell: TableCellStyleConfig;
}

export interface ImageStyleConfig {
  max_width_percent: number;
  alignment: string;
  caption_enabled: boolean;
  caption_font: string;
  caption_size: string;
  caption_alignment: string;
  caption_bold: boolean;
  caption_italic: boolean;
}

// ── 纸张类型 ──────────────────────────────────────
export const PAPER_SIZES = [
  { value: 'a4', label: 'A4', detail: '210×297mm 国际标准公文纸' },
  { value: 'a3', label: 'A3', detail: '297×420mm 国际标准大页' },
  { value: 'a5', label: 'A5', detail: '148×210mm 国际标准小册' },
  { value: 'b4', label: 'B4', detail: '250×353mm JIS 标准' },
  { value: 'b5', label: 'B5', detail: '176×250mm JIS 标准' },
  { value: 'letter', label: 'Letter', detail: '215.9×279.4mm 美标信纸' },
  { value: 'legal', label: 'Legal', detail: '215.9×355.6mm 美标法律文书' },
  { value: '16k', label: '16开', detail: '184×260mm 中国常用开本' },
] as const;

export type PaperSize = (typeof PAPER_SIZES)[number]['value'];

/** 纸张尺寸 mm（portrait 模式 width × height） */
export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  a5: { width: 148, height: 210 },
  b4: { width: 250, height: 353 },
  b5: { width: 176, height: 250 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  '16k': { width: 184, height: 260 },
};

// ── 页面设置 ──────────────────────────────────────
export interface PageSetupConfig {
  paper_size: PaperSize;
  orientation: 'portrait' | 'landscape';
  first_page_different: boolean;
  margin_top_cm: number;
  margin_bottom_cm: number;
  margin_left_cm: number;
  margin_right_cm: number;
  header_enabled: boolean;
  header_text: string;
  header_font: string;
  header_size: string;
  header_alignment: string;
  header_color: string;
  footer_enabled: boolean;
  footer_text: string;
  footer_distance_cm: number;
  footer_font: string;
  footer_size: string;
  footer_alignment: string;
  footer_color: string;
  page_number_enabled: boolean;
  page_number_format: string;   // '第{page}页'
  page_number_start: number;
}

// ── 封面设置 ──────────────────────────────────────
export interface CoverStyleConfig {
  enabled: boolean;
  logo_path: string;
  logo_width_cm: number;
  project_name: string;
  document_title: string;
  tenderer: string;
  bidder: string;
  compilation_date: string;
  font: string;
  project_name_size: string;
  document_title_size: string;
  info_size: string;
  alignment: string;
  text_color: string;
  bold: boolean;
  hide_header_footer: boolean;
}

// ── 完整导出格式配置 ──────────────────────────────
export interface ExportFormatConfig {
  template_name: string;
  /** 是否把 Word 标题 1～标题 9 绑定到同一个多级列表。关闭后只输出纯标题。 */
  auto_numbering_enabled: boolean;
  page: PageSetupConfig;
  cover: CoverStyleConfig;
  heading_level1_page_break_before: boolean;
  heading_border: HeadingBorderConfig;
  headings: HeadingStyleConfig[];  // 索引 0=L1（章），8=L9
  body_text: BodyTextStyleConfig;
  table: TableStyleConfig;
  image: ImageStyleConfig;
}

export interface ExportTemplateRecord {
  template_id: string;
  template_name: string;
  config: ExportFormatConfig;
  created_at: string;
  updated_at: string;
}

// ── 选项常量 ──────────────────────────────────────

export const FONT_OPTIONS = [
  '宋体',
  '新宋体',
  '黑体',
  '楷体',
  '仿宋',
  '微软雅黑',
  '微软雅黑 Light',
  '等线',
  '等线 Light',
  '隶书',
  '幼圆',
  '华文宋体',
  '华文黑体',
  '华文楷体',
  '华文仿宋',
  '华文中宋',
  '华文细黑',
  '苹方',
  'PingFang SC',
  '宋体-简',
  '黑体-简',
  '楷体-简',
  '冬青黑体简体中文',
  'Hiragino Sans GB',
  '思源宋体',
  '思源黑体',
  'Source Han Serif SC',
  'Source Han Sans SC',
] as const;

export type FontOption = (typeof FONT_OPTIONS)[number];

export const SIZE_OPTIONS = [
  '初号',
  '小初',
  '一号',
  '小一',
  '二号',
  '小二',
  '三号',
  '小三',
  '四号',
  '小四',
  '五号',
  '小五',
  '六号',
  '小六',
] as const;

export type SizeOption = (typeof SIZE_OPTIONS)[number];

export const ALIGNMENT_OPTIONS = [
  '居中对齐',
  '两端对齐',
  '左对齐',
  '右对齐',
] as const;

export type AlignmentOption = (typeof ALIGNMENT_OPTIONS)[number];

export const LIST_STYLE_OPTIONS = [
  { value: 'none', label: '无', icon: '无', font_family: 'inherit' },
  { value: 'disc', label: '实心圆点', icon: '•', font_family: 'Arial, sans-serif' },
  { value: 'circle', label: '空心圆点', icon: '○', font_family: 'Arial, sans-serif' },
  { value: 'square', label: '实心方块', icon: '■', font_family: 'Arial, sans-serif' },
  { value: 'diamond', label: '实心菱形', icon: '◆', font_family: 'Arial, sans-serif' },
  { value: 'dash', label: '短横线', icon: '–', font_family: 'Arial, sans-serif' },
  { value: 'check', label: '对勾', icon: '✓', font_family: 'Segoe UI Symbol, Arial, sans-serif' },
  { value: 'arrow', label: '箭头', icon: '➢', font_family: 'Segoe UI Symbol, Arial, sans-serif' },
  { value: 'sparkle', label: '四角星', icon: '✧', font_family: 'Segoe UI Symbol, Arial, sans-serif' },
] as const;

export type ListStyle = (typeof LIST_STYLE_OPTIONS)[number]['value'];

export const ORDERED_LIST_STYLE_OPTIONS = [
  { value: 'decimal-dot', label: '数字编号（1.）' },
  { value: 'decimal-paren', label: '数字括号（1）' },
  { value: 'decimal-full-paren', label: '数字全括号（（1））' },
  { value: 'chinese-dot', label: '中文编号（一、）' },
  { value: 'chinese-paren', label: '中文括号（（一））' },
  { value: 'lower-alpha', label: '小写字母（a.）' },
  { value: 'upper-alpha', label: '大写字母（A.）' },
  { value: 'lower-roman', label: '小写罗马（i.）' },
  { value: 'upper-roman', label: '大写罗马（I.）' },
] as const;

export type OrderedListStyle = (typeof ORDERED_LIST_STYLE_OPTIONS)[number]['value'];

// ── 中文字号 → pt 映射 ────────────────────────────
export const SIZE_TO_PT: Record<string, number> = {
  '初号': 42,
  '小初': 36,
  '一号': 26,
  '小一': 24,
  '二号': 22,
  '小二': 18,
  '三号': 16,
  '小三': 15,
  '四号': 14,
  '小四': 12,
  '五号': 10.5,
  '小五': 9,
  '六号': 7.5,
  '小六': 6.5,
};

// ── 中文字体 → CSS font-family 映射 ───────────────
export const FONT_TO_CSS: Record<string, string> = {
  '宋体': "'SimSun', 'STSong', serif",
  '新宋体': "'NSimSun', 'SimSun', serif",
  '黑体': "'SimHei', 'STHeiti', sans-serif",
  '楷体': "'KaiTi', 'STKaiti', 'Kai', serif",
  '仿宋': "'FangSong', 'STFangsong', serif",
  '微软雅黑': "'Microsoft YaHei', sans-serif",
  '微软雅黑 Light': "'Microsoft YaHei UI Light', 'Microsoft YaHei Light', 'Microsoft YaHei', sans-serif",
  '等线': "'DengXian', 'Microsoft YaHei', sans-serif",
  '等线 Light': "'DengXian Light', 'DengXian', sans-serif",
  '隶书': "'LiSu', 'STLiti', serif",
  '幼圆': "'YouYuan', sans-serif",
  '华文宋体': "'华文宋体', 'STSong', serif",
  '华文黑体': "'华文黑体', 'STHeiti', sans-serif",
  '华文楷体': "'华文楷体', 'STKaiti', serif",
  '华文仿宋': "'华文仿宋', 'STFangsong', serif",
  '华文中宋': "'华文中宋', 'STZhongsong', serif",
  '华文细黑': "'华文细黑', 'STXihei', sans-serif",
  '苹方': "'PingFang SC', 'PingFang', sans-serif",
  'PingFang SC': "'PingFang SC', 'PingFang', sans-serif",
  '宋体-简': "'Songti SC', 'STSong', serif",
  '黑体-简': "'Heiti SC', 'STHeiti', sans-serif",
  '楷体-简': "'Kaiti SC', 'STKaiti', serif",
  '冬青黑体简体中文': "'Hiragino Sans GB', '冬青黑体简体中文', sans-serif",
  'Hiragino Sans GB': "'Hiragino Sans GB', sans-serif",
  '思源宋体': "'Source Han Serif SC', 'Noto Serif CJK SC', serif",
  '思源黑体': "'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif",
  'Source Han Serif SC': "'Source Han Serif SC', 'Noto Serif CJK SC', serif",
  'Source Han Sans SC': "'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif",
};

// ── 对齐方式 → CSS text-align 映射 ────────────────
export const ALIGNMENT_TO_CSS: Record<string, string> = {
  '居中对齐': 'center',
  '两端对齐': 'justify',
  '左对齐': 'left',
  '右对齐': 'right',
};

// ── 默认值 ────────────────────────────────────────

const DEFAULT_PAGE_SETUP: PageSetupConfig = {
  paper_size: 'a4',
  orientation: 'portrait',
  first_page_different: false,
  margin_top_cm: 2,
  margin_bottom_cm: 2,
  margin_left_cm: 2,
  margin_right_cm: 2,
  header_enabled: false,
  header_text: '',
  header_font: '宋体',
  header_size: '小五',
  header_alignment: '居中对齐',
  header_color: '#536176',
  footer_enabled: false,
  footer_text: '',
  footer_distance_cm: 1.75,
  footer_font: '宋体',
  footer_size: '小五',
  footer_alignment: '居中对齐',
  footer_color: '#536176',
  page_number_enabled: false,
  page_number_format: '第{page}页',
  page_number_start: 1,
};

const DEFAULT_COVER_STYLE: CoverStyleConfig = {
  enabled: false,
  logo_path: '',
  logo_width_cm: 4,
  project_name: '{project_name}',
  document_title: '投标技术文件',
  tenderer: '',
  bidder: '',
  compilation_date: '{date}',
  font: '宋体',
  project_name_size: '二号',
  document_title_size: '初号',
  info_size: '四号',
  alignment: '居中对齐',
  text_color: '#000000',
  bold: false,
  hide_header_footer: true,
};

const DEFAULT_BODY_TEXT: BodyTextStyleConfig = {
  font: '宋体',
  size: '小四',
  alignment: '两端对齐',
  spacing_before_pt: 0,
  spacing_before_unit: 'pt',
  spacing_after_pt: 0,
  spacing_after_unit: 'pt',
  first_line_indent_chars: 2,
  line_spacing_multiple: 1.5,
  line_spacing_mode: 'one-and-half',
  line_spacing_unit: 'multiple',
  list_style: 'disc',
  ordered_list_style: 'decimal-full-paren',
  list_indent_chars: 2,
};

const DEFAULT_TABLE_CELL: TableCellStyleConfig = {
  font: '宋体',
  size: '小四',
  alignment: '左对齐',
  text_color: '#243048',
  background_color: '#ffffff',
};

const DEFAULT_TABLE_STYLE: TableStyleConfig = {
  border_width: 1,
  border_color: '#000000',
  cell_padding_pt: 6,
  full_width: true,
  caption_enabled: true,
  caption_font: '宋体',
  caption_size: '小五',
  caption_alignment: '居中对齐',
  caption_bold: false,
  caption_italic: false,
  header_row: {
    font: '黑体',
    size: '小四',
    alignment: '居中对齐',
    text_color: '#243048',
    background_color: '#eef5ff',
  },
  first_column: {
    font: '宋体',
    size: '小四',
    alignment: '左对齐',
    text_color: '#243048',
    background_color: '#ffffff',
  },
  body_cell: { ...DEFAULT_TABLE_CELL },
};

const DEFAULT_IMAGE_STYLE: ImageStyleConfig = {
  max_width_percent: 90,
  alignment: '居中对齐',
  caption_enabled: true,
  caption_font: '宋体',
  caption_size: '小五',
  caption_alignment: '居中对齐',
  caption_bold: false,
  caption_italic: false,
};

export const DEFAULT_HEADING_BORDER_CELL_COLORS = ['#eef5ff', '#f3f7ff', '#f8fbff', '#fbfdff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'] as const;

const DEFAULT_HEADING_BORDER: HeadingBorderConfig = {
  enabled: false,
  min_heading_left_enabled: false,
  border_color: '#cfd8ee',
  level_cell_colors: [...DEFAULT_HEADING_BORDER_CELL_COLORS],
  structure: '上下结构',
};

/** 默认导出格式：九级数字连续多级编号，宋体四号，两端对齐 */
export const DEFAULT_EXPORT_FORMAT: ExportFormatConfig = {
  template_name: '默认模版',
  auto_numbering_enabled: true,
  page: { ...DEFAULT_PAGE_SETUP },
  cover: { ...DEFAULT_COVER_STYLE },
  heading_level1_page_break_before: false,
  heading_border: { ...DEFAULT_HEADING_BORDER },
  headings: Array.from({ length: 9 }, () => ({
    font: '宋体',
    size: '四号',
    alignment: '两端对齐',
    bold: false,
    text_color: '#243048',
    spacing_before_pt: 0,
    spacing_before_unit: 'pt' as const,
    spacing_after_pt: 0,
    spacing_after_unit: 'pt' as const,
    first_line_indent_chars: 0,
    line_spacing: 1.5,
    line_spacing_mode: 'one-and-half' as const,
    line_spacing_unit: 'multiple' as const,
    numbering_format: 'outline-decimal' as const,
    numbering_template: '',
  })),
  body_text: { ...DEFAULT_BODY_TEXT },
  table: {
    border_width: DEFAULT_TABLE_STYLE.border_width,
    border_color: DEFAULT_TABLE_STYLE.border_color,
    cell_padding_pt: DEFAULT_TABLE_STYLE.cell_padding_pt,
    full_width: DEFAULT_TABLE_STYLE.full_width,
    caption_enabled: DEFAULT_TABLE_STYLE.caption_enabled,
    caption_font: DEFAULT_TABLE_STYLE.caption_font,
    caption_size: DEFAULT_TABLE_STYLE.caption_size,
    caption_alignment: DEFAULT_TABLE_STYLE.caption_alignment,
    caption_bold: DEFAULT_TABLE_STYLE.caption_bold,
    caption_italic: DEFAULT_TABLE_STYLE.caption_italic,
    header_row: { ...DEFAULT_TABLE_STYLE.header_row },
    first_column: { ...DEFAULT_TABLE_STYLE.first_column },
    body_cell: { ...DEFAULT_TABLE_STYLE.body_cell },
  },
  image: { ...DEFAULT_IMAGE_STYLE },
};

/** 标题级别中文标签 */
export const HEADING_LEVEL_LABELS = [
  '一级标题',
  '二级标题',
  '三级标题',
  '四级标题',
  '五级标题',
  '六级标题',
  '七级标题',
  '八级标题',
  '九级标题',
];

// 本项目仅在招投标大模块使用该模板模型，保留 Bid 前缀避免被其他模块误用。
export type BidWordExportMode = 'basic' | 'word-optimization' | 'custom-template' | 'original-template';
export type BidHeadingStyleConfig = HeadingStyleConfig;
export type BidBodyStyleConfig = BodyTextStyleConfig;
export type BidPageStyleConfig = PageSetupConfig;
export type BidCoverStyleConfig = CoverStyleConfig;
export type BidTableStyleConfig = TableStyleConfig;
export type BidImageStyleConfig = ImageStyleConfig;
export type BidExportTemplateConfig = ExportFormatConfig;

export interface BidExportTemplateRecord extends ExportTemplateRecord {
  templateId: string;
  templateName: string;
  createdAt: string;
  updatedAt: string;
}

export const BID_EXPORT_FONT_OPTIONS = FONT_OPTIONS;
export const BID_EXPORT_SIZE_OPTIONS = SIZE_OPTIONS;
export const BID_EXPORT_ALIGNMENT_OPTIONS = ALIGNMENT_OPTIONS;
export const BID_EXPORT_PAPER_OPTIONS = PAPER_SIZES;
export const BID_EXPORT_LIST_OPTIONS = LIST_STYLE_OPTIONS;
export const BID_EXPORT_ORDERED_LIST_OPTIONS = ORDERED_LIST_STYLE_OPTIONS;
export const BID_EXPORT_SIZE_TO_PT = SIZE_TO_PT;
export const DEFAULT_BID_EXPORT_TEMPLATE = DEFAULT_EXPORT_FORMAT;

export const BID_EXPORT_TEMPLATE_PRESETS: Array<{ id: string; label: string; description: string; config: BidExportTemplateConfig }> = [
  { id: 'standard', label: '默认模版', description: '上游默认版面：A4、章/节编号、宋体小四正文。', config: DEFAULT_EXPORT_FORMAT },
  { id: 'compact', label: '紧凑评审版', description: '缩小边距和行距，适合页数受限场景。', config: { ...DEFAULT_EXPORT_FORMAT, template_name: '紧凑评审版', page: { ...DEFAULT_EXPORT_FORMAT.page, margin_top_cm: 1.8, margin_bottom_cm: 1.8 }, body_text: { ...DEFAULT_EXPORT_FORMAT.body_text, size: '五号', line_spacing_multiple: 1.1 } } },
  { id: 'formal', label: '正式装订版', description: '加宽左边距、开启页码，适合正式交付。', config: { ...DEFAULT_EXPORT_FORMAT, template_name: '正式装订版', page: { ...DEFAULT_EXPORT_FORMAT.page, margin_left_cm: 3.2, page_number_enabled: true } } },
];
