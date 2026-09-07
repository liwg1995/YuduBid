const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const excelCellLimit = 32767;

function cleanText(value) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  return text.length > excelCellLimit ? `${text.slice(0, 32740)}……（已截断）` : text;
}

function escapeXml(value) {
  return cleanText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function sheetXml(rows, widths = []) {
  const cols = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
    return typeof value === 'number' && Number.isFinite(value)
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

function createXlsx(sheets) {
  const zip = new AdmZip();
  const add = (name, value) => zip.addFile(name, Buffer.from(value, 'utf-8'));
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name).slice(0, 31)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`);
  sheets.forEach((sheet, index) => add(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows, sheet.widths)));
  return zip.toBuffer();
}

function statusText(result) {
  if (result?.status === 'success') return '已完成';
  if (result?.status === 'error') return '失败';
  if (result?.status === 'running') return '执行中';
  return '未执行';
}

function rejectionSheets(state) {
  const rejection = state?.rejectionCheckResult || {};
  const typo = state?.typoCheckResult || {};
  const logic = state?.logicCheckResult || {};
  return [
    { name: '检查概览', widths: [20, 18, 14], rows: [['检查类型', '状态', '问题数量'], ['废标项', statusText(rejection), rejection.findings?.length || 0], ['错别字', statusText(typo), typo.findings?.length || 0], ['逻辑问题', statusText(logic), logic.findings?.length || 0]] },
    { name: '废标项', widths: [8, 12, 12, 28, 42, 42, 42, 42, 42], rows: [['序号', '类型', '风险等级', '标题', '摘要', '招标要求', '投标证据', '风险原因', '修改建议'], ...(rejection.findings || []).map((item, index) => [index + 1, item.type === 'invalidBid' ? '无效标' : '废标项', ({ high: '高', medium: '中', low: '低' })[item.severity] || '', item.title, item.summary, item.requirement, item.bidEvidence, item.riskReason, item.suggestion])] },
    { name: '错别字', widths: [8, 20, 20, 30, 54, 42], rows: [['序号', '错误文本', '建议改正', '位置', '原文摘录', '判断原因'], ...(typo.findings || []).map((item, index) => [index + 1, item.wrongText, item.correctText, item.locationHint, item.originalExcerpt, item.reason])] },
    { name: '逻辑问题', widths: [8, 28, 30, 54, 42, 42], rows: [['序号', '标题', '位置', '原文', '问题原因', '修改建议'], ...(logic.findings || []).map((item, index) => [index + 1, item.title, item.locationHint, item.originalText, item.fallacyReason, item.suggestion])] },
  ];
}

function duplicateSheets(state) {
  const metadata = state?.metadataAnalysis || {};
  const outline = state?.outlineAnalysis || {};
  const content = state?.contentAnalysis || {};
  const image = state?.imageAnalysis || {};
  const fileNames = new Map([...(state?.tenderFiles || [state?.tenderFile].filter(Boolean)), ...(state?.bidFiles || [])].map((file) => [file.id, file.file_name || file.fileName || file.id]));
  const names = (ids) => (ids || []).map((id) => fileNames.get(id) || id).join('；');
  return [
    { name: '查重概览', widths: [20, 18, 14], rows: [['分析维度', '状态', '结果数量'], ['元数据', statusText(metadata), metadata.rows?.length || 0], ['目录', statusText(outline), outline.duplicateGroups?.length || 0], ['正文', statusText(content), content.duplicateSentences?.length || 0], ['图片', statusText(image), image.duplicateImages?.length || 0]] },
    { name: '元数据', widths: [28, 42, 42], rows: [['元数据项', '重复文件', '同日文件'], ...(metadata.rows || []).map((item) => [item.label, names(item.duplicate_file_ids), names(item.same_day_file_ids)])] },
    { name: '目录重复', widths: [8, 12, 42, 14, 48], rows: [['序号', '类型', '标题', '相似度', '涉及文件'], ...(outline.duplicateGroups || []).map((item, index) => [index + 1, item.type === 'duplicate' ? '重复' : '相似', item.title, item.score, names(item.file_ids)])] },
    { name: '文件相似度', widths: [36, 36, 16, 14], rows: [['文件 A', '文件 B', '综合相似度', '风险'], ...(outline.pairwiseSimilarities || []).map((item) => [fileNames.get(item.file_a_id) || item.file_a_id, fileNames.get(item.file_b_id) || item.file_b_id, item.score, ({ high: '高', medium: '中', low: '低', none: '无' })[item.risk] || '无'])] },
    { name: '重复句子', widths: [8, 72, 48], rows: [['序号', '重复句子', '涉及文件'], ...(content.duplicateSentences || []).map((item, index) => [index + 1, item.sentence, names(item.file_ids)])] },
    { name: '重复图片', widths: [8, 48, 48], rows: [['序号', '图片 Hash', '涉及文件'], ...(image.duplicateImages || []).map((item, index) => [index + 1, item.hash, names(item.file_ids)])] },
  ];
}

function createCheckResultExportService({ app, dialog, rejectionCheckStore, duplicateCheckStore }) {
  async function save(kind, sheets) {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const result = await dialog.showSaveDialog({
      title: `导出${kind}结果`,
      defaultPath: path.join(app.getPath('downloads'), `${kind}结果_${timestamp}.xlsx`),
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true, message: '已取消导出' };
    const outputPath = /\.xlsx$/i.test(result.filePath) ? result.filePath : `${result.filePath}.xlsx`;
    fs.writeFileSync(outputPath, createXlsx(sheets));
    return { success: true, path: outputPath, message: 'Excel 已导出' };
  }
  return {
    exportRejectionExcel: () => save('废标检查', rejectionSheets(rejectionCheckStore.loadRejectionCheck())),
    exportDuplicateExcel: () => save('标书查重', duplicateSheets(duplicateCheckStore.loadDuplicateCheck())),
  };
}

module.exports = { createCheckResultExportService, __test__: { cleanText, createXlsx, rejectionSheets, duplicateSheets } };
