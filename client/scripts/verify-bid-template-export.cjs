const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const AdmZip = require('adm-zip');
const { createSqliteDatabase, schemaVersion } = require('../electron/services/sqliteDatabase.cjs');
const { createTemplateStore } = require('../electron/services/templateStore.cjs');
const { buildDocxBuffer, createExportService, resolveBidTemplatePayload } = require('../electron/services/exportService.cjs');
const { cloneDefaultBidExportTemplate } = require('../electron/services/bidTemplateFormat.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function paragraphStyleXml(stylesXml, styleId) {
  return new RegExp(`<w:style w:type="paragraph" w:styleId="${styleId}">[\\s\\S]*?</w:style>`).exec(stylesXml)?.[0] || '';
}

app.whenReady().then(async () => {
  const temporaryUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-bid-template-'));
  app.setPath('userData', temporaryUserData);
  const database = createSqliteDatabase(app);

  try {
    assert(schemaVersion === 18, `数据库版本应为 18，实际为 ${schemaVersion}`);
    const defaults = cloneDefaultBidExportTemplate();
    const logoPath = path.join(temporaryUserData, 'workspace', 'template-assets', 'cover-logo.png');
    fs.mkdirSync(path.dirname(logoPath), { recursive: true });
    fs.writeFileSync(logoPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    assert(defaults.headings.length === 9, '默认标题样式应为九级');
    assert(defaults.headings.every((heading) => heading.numbering_format === 'outline-decimal' && heading.font === '宋体' && heading.size === '四号' && heading.alignment === '两端对齐' && heading.text_color === '#000000'), '九级标题默认编号、字体、字号、对齐方式或文字颜色异常');
    assert(defaults.headings.every((heading) => heading.spacing_before_pt === 0 && heading.spacing_after_pt === 0 && heading.spacing_before_unit === 'pt' && heading.spacing_after_unit === 'pt'), '九级标题默认段前段后设置异常');
    assert(defaults.headings.every((heading) => heading.line_spacing === 1.5 && heading.line_spacing_mode === 'one-and-half'), '九级标题默认行距应为 1.5 倍');
    assert(defaults.body_text.alignment === '两端对齐' && defaults.body_text.line_spacing_multiple === 1.5 && defaults.body_text.line_spacing_mode === 'one-and-half', '正文默认对齐或行距异常');
    assert(defaults.body_text.ordered_list_style === 'decimal-full-paren', '正文默认有序列表应为数字全括号');
    assert(defaults.table.border_color === '#000000', '表格默认边框颜色应为纯黑');
    assert(defaults.cover.enabled === false && defaults.cover.project_name === '{project_name}' && defaults.cover.hide_header_footer, '封面默认配置异常');
    const store = createTemplateStore({ app, db: database.db });
    const created = store.create({
      templateName: '自动验证模板',
      page: { orientation: 'landscape', marginTopCm: 2, marginBottomCm: 2, marginLeftCm: 2.5, marginRightCm: 2, headerEnabled: true, headerText: '验证页眉', footerEnabled: true, footerText: '验证页脚', pageNumberEnabled: true },
      headings: [{ font: '黑体', sizePt: 18, alignment: 'center', bold: true, color: '#123456', spacingBeforePt: 8, spacingAfterPt: 8, lineSpacing: 1.5 }],
      body: { font: '宋体', sizePt: 12, alignment: 'justify', firstLineIndentChars: 2, lineSpacing: 1.5, spacingAfterPt: 0 },
      table: { borderColor: '#000000', borderWidth: 1, headerBackgroundColor: '#eeeeee', headerFont: '黑体', bodyFont: '宋体', fontSizePt: 10.5, cellPaddingPt: 5 },
      image: { maxWidthPercent: 80, alignment: 'center', captionEnabled: true, captionFont: '宋体', captionSizePt: 10.5 },
    });
    assert(created?.templateId, '模板创建失败');
    assert(store.list().length === 1, '模板列表数量异常');
    const updated = store.update(created.templateId, {
      ...created.config,
      templateName: '自动验证模板（已更新）',
      headings: created.config.headings.map((heading, index) => index === 0 ? {
        ...heading,
        spacing_before_pt: 1,
        spacing_before_unit: 'cm',
        line_spacing: 28,
        line_spacing_mode: 'exact',
        line_spacing_unit: 'pt',
      } : heading),
      body_text: {
        ...created.config.body_text,
        spacing_after_pt: 2,
        spacing_after_unit: 'line',
        line_spacing_multiple: 28,
        line_spacing_mode: 'at-least',
        line_spacing_unit: 'pt',
      },
      table: {
        ...created.config.table,
        caption_enabled: true,
        caption_font: '楷体',
        caption_size: '五号',
        caption_alignment: '右对齐',
        caption_bold: true,
        caption_italic: true,
      },
      cover: {
        ...created.config.cover,
        enabled: true,
        logo_path: logoPath,
        project_name: '{project_name}',
        document_title: '技术响应文件',
        tenderer: '招标人：验证单位',
        bidder: '投标人：测试公司',
        compilation_date: '{date}',
      },
    });
    assert(updated.templateName === '自动验证模板（已更新）', '模板更新失败');
    assert(updated.config.headings.length === 9, '标题样式未扩展到九级');

    const deepOutline = { id: '1', title: '总体方案', content: '' };
    let parentOutline = deepOutline;
    for (let level = 2; level <= 9; level += 1) {
      const child = { id: Array(level).fill('1').join('.'), title: `${level}级标题`, content: level === 9 ? '九级标题正文。' : '' };
      parentOutline.children = [child];
      parentOutline = child;
    }
    const buffer = await buildDocxBuffer({
      documentScope: 'bid',
      exportMode: 'custom-template',
      exportFormat: updated.config,
      project_name: '模板验证项目',
      outline: [deepOutline, { id: '2', title: '响应数据', content: '正文段落。\n\n- 无序事项\n\n1. 有序事项\n\n| 项目 | 响应 |\n| --- | --- |\n| 功能 | 满足 |' }],
    });
    const qaOutputPath = String(process.env.YUDUBID_QA_OUTPUT || '').trim();
    if (qaOutputPath) {
      fs.mkdirSync(path.dirname(qaOutputPath), { recursive: true });
      fs.writeFileSync(qaOutputPath, buffer);
      console.log(`Word 视觉验收样本已生成：${qaOutputPath}`);
    }
    const zip = new AdmZip(buffer);
    const documentXml = zip.getEntry('word/document.xml')?.getData().toString('utf-8') || '';
    const numberingXml = zip.getEntry('word/numbering.xml')?.getData().toString('utf-8') || '';
    const stylesXml = zip.getEntry('word/styles.xml')?.getData().toString('utf-8') || '';
    const headerXml = zip.getEntry('word/header1.xml')?.getData().toString('utf-8') || '';
    const footerXml = zip.getEntry('word/footer1.xml')?.getData().toString('utf-8') || '';
    assert(documentXml.includes('w:orient="landscape"'), '横向纸张未写入 DOCX');
    assert(documentXml.includes('模板验证项目') && documentXml.includes('技术响应文件') && documentXml.includes('招标人：验证单位') && documentXml.includes('投标人：测试公司'), '独立封面内容未写入 DOCX');
    assert((documentXml.match(/<w:sectPr/g) || []).length >= 2, '封面与正文未拆分为独立 Word 分节');
    assert(zip.getEntries().some((entry) => entry.entryName.startsWith('word/media/')), '封面 Logo 未嵌入 DOCX');
    assert(documentXml.includes('总体方案') && !documentXml.includes('1 总体方案'), '启用自动编号后仍把编号写成了普通标题文本');
    assert(/w:pStyle w:val="Heading1"[\s\S]*?<w:numPr>/.test(documentXml), '一级标题段落未接入 Word 多级编号');
    assert(numberingXml.includes('w:val="%1.%2.%3.%4.%5.%6.%7.%8.%9"'), '九级连续多级编号定义未写入 DOCX');
    const headingStyles = Array.from({ length: 9 }, (_item, index) => paragraphStyleXml(stylesXml, `Heading${index + 1}`));
    assert(headingStyles.every((styleXml) => styleXml.includes('<w:numPr>')), 'Heading 1～Heading 9 样式未绑定多级列表');
    assert(Array.from({ length: 9 }, (_item, index) => (stylesXml.match(new RegExp(`w:styleId="Heading${index + 1}"`, 'g')) || []).length).every((count) => count === 1), '标题样式存在重复定义');
    assert(documentXml.includes('w:val="123456"'), '标题颜色未写入 DOCX');
    assert(/w:before="567"/.test(documentXml) && /w:line="560" w:lineRule="exactly"/.test(documentXml), '标题段前单位或固定行距未正确换算到 DOCX');
    assert(/w:line="560" w:lineRule="atLeast"/.test(documentXml), '正文最小值行距未正确写入 DOCX');
    assert(documentXml.includes('w:pStyle w:val="Heading9"') && documentXml.includes('w:outlineLvl w:val="8"'), '九级标题未映射到 Word Heading 9');
    assert(documentXml.includes('w:fill="EEEEEE"'), '表头底色未写入 DOCX');
    assert(numberingXml.includes('w:val="（%1）"') && numberingXml.includes('w:val="•"'), '正文有序或无序列表样式未写入 DOCX');
    assert(numberingXml.includes('w:left="480"') && numberingXml.includes('w:hanging="240"'), '正文列表缩进未按模板写入 DOCX');
    const tableCaptionIndex = documentXml.indexOf('SEQ YDBTable');
    const tableIndex = documentXml.indexOf('<w:tbl>');
    assert(tableCaptionIndex >= 0 && tableIndex >= 0 && tableCaptionIndex < tableIndex, '表格题注未生成在表格上方');
    assert(documentXml.includes('w:rFonts w:ascii="楷体"') && documentXml.includes('<w:i/>'), '表格题注字体或斜体样式未写入 DOCX');
    assert(headerXml.includes('验证页眉'), '页眉未写入 DOCX');
    assert(footerXml.includes('验证页脚') && footerXml.includes('PAGE'), '页脚或页码未写入 DOCX');
    const plainTitleBuffer = await buildDocxBuffer({
      documentScope: 'bid',
      exportMode: 'custom-template',
      exportFormat: {
        ...updated.config,
        auto_numbering_enabled: false,
        headings: updated.config.headings.map((heading, index) => ({
          ...heading,
          numbering_format: 'custom',
          numbering_template: index === 0 ? '{zh}、' : index === 1 ? '（{zh}）' : '{full}',
        })),
      },
      project_name: '关闭编号验证',
      outline: [{ id: '1', title: '总体方案', children: [{ id: '1.1', title: '实施范围', content: '正文段落。' }] }],
    });
    const plainTitleXml = new AdmZip(plainTitleBuffer).getEntry('word/document.xml')?.getData().toString('utf-8') || '';
    assert(plainTitleXml.includes('一、总体方案') && plainTitleXml.includes('（一）实施范围') && !plainTitleXml.includes('<w:numPr>'), '关闭自动标题编号后未按自定义格式生成可手动调整的静态编号，或错误接入了 Word 多级编号');

    const optimizedBuffer = await buildDocxBuffer({
      documentScope: 'bid',
      exportMode: 'word-optimization',
      outline: [{ id: '1', title: '总体方案', content: '正文段落。' }],
    }, { config: { skill_settings: { skills: { 'word-optimization': { enabled: true } } } } });
    const optimizedZip = new AdmZip(optimizedBuffer);
    const optimizedXml = optimizedZip.getEntry('word/document.xml')?.getData().toString('utf-8') || '';
    const optimizedSettingsXml = optimizedZip.getEntry('word/settings.xml')?.getData().toString('utf-8') || '';
    assert(optimizedXml.includes('<w:numPr>') && optimizedSettingsXml.includes('w:updateFields'), 'word-optimization 模式未生成自动编号或更新域设置');
    const basicBuffer = await buildDocxBuffer({
      documentScope: 'bid',
      exportMode: 'basic',
      outline: [{ id: '1', title: '总体方案', content: '正文段落。' }],
    }, { config: { skill_settings: { skills: { 'word-optimization': { enabled: true } } } } });
    const basicXml = new AdmZip(basicBuffer).getEntry('word/document.xml')?.getData().toString('utf-8') || '';
    assert(basicXml.includes('1 总体方案') && !basicXml.includes('<w:numPr>'), '基础模式错误应用了 word-optimization 排版');
    const disabledOptimizationService = createExportService({
      configStore: { load: () => ({ skill_settings: { skills: { 'word-optimization': { enabled: false } } } }) },
    });
    let disabledOptimizationRejected = false;
    try {
      await disabledOptimizationService.exportWord({
        documentScope: 'bid',
        exportMode: 'word-optimization',
        outline: [{ id: '1', title: '总体方案', content: '正文段落。' }],
      });
    } catch (error) {
      disabledOptimizationRejected = String(error?.message || '').includes('启用 word-optimization');
    }
    assert(disabledOptimizationRejected, '技能停用后仍允许使用 word-optimization 导出');
    const portable = store.buildPortableTemplate(created.templateId);
    assert(portable.kind === 'yudubid-bid-template' && portable.version === 1, '可迁移模板包格式异常');
    assert(portable.template.config.cover.logo_path === '', '模板包不应保留原机器 Logo 绝对路径');
    assert(portable.assets.cover_logo?.data_base64 && portable.assets.cover_logo?.sha256, '模板包未携带封面 Logo 或完整性摘要');
    const imported = store.importPortableTemplate(JSON.stringify(portable));
    assert(imported.success && imported.renamed && imported.template.template_name.includes('导入'), '同名模板导入未自动重命名');
    assert(fs.existsSync(imported.template.config.cover.logo_path), '导入模板未恢复封面 Logo');
    const legacyImported = store.importPortableTemplate({ ...updated.config, template_name: '旧版 JSON 模板', cover: { ...updated.config.cover, logo_path: '/invalid/foreign/path.png' } });
    assert(legacyImported.success && legacyImported.template.config.cover.logo_path === '', '旧版 JSON 模板兼容导入或路径清理失败');
    const corrupted = JSON.parse(JSON.stringify(portable));
    corrupted.assets.cover_logo.sha256 = '0'.repeat(64);
    let corruptedRejected = false;
    try {
      store.importPortableTemplate(corrupted);
    } catch (error) {
      corruptedRejected = /完整性校验失败/.test(error?.message || '');
    }
    assert(corruptedRejected, '损坏的封面 Logo 未被拒绝');

    const resolvedPayload = resolveBidTemplatePayload({
      documentScope: 'bid',
      exportMode: 'custom-template',
      templateId: created.templateId,
      exportFormat: { template_name: '伪造的旧配置' },
    }, store);
    assert(resolvedPayload.exportFormat.template_name === updated.config.template_name, '主进程未根据模板 ID 使用最新权威配置');
    const previewPayload = {
      documentScope: 'bid',
      exportMode: 'custom-template',
      templatePreview: true,
      exportFormat: defaults,
    };
    assert(resolveBidTemplatePayload(previewPayload, null) === previewPayload, '未保存模板的测试导出通道异常');
    for (const [payload, expectedMessage] of [
      [{ documentScope: 'official-document', exportMode: 'custom-template', templateId: created.templateId }, '不能用于其他业务模块'],
      [{ documentScope: 'bid', exportMode: 'custom-template' }, '请选择一个已保存'],
      [{ documentScope: 'bid', exportMode: 'custom-template', templateId: 'missing-template' }, '已不存在'],
    ]) {
      let rejected = false;
      try {
        resolveBidTemplatePayload(payload, store);
      } catch (error) {
        rejected = String(error?.message || '').includes(expectedMessage);
      }
      assert(rejected, `模板导出边界未正确拦截：${expectedMessage}`);
    }
    for (const template of store.list()) assert(store.remove(template.template_id).success, '模板删除失败');
    assert(store.list().length === 0, '模板清理后列表不为空');
    console.log('招投标模板 CRUD、迁移包与 Word 导出验证通过');
  } finally {
    database.close();
    fs.rmSync(temporaryUserData, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
