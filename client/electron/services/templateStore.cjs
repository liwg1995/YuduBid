const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const { normalizeBidExportTemplate } = require('./bidTemplateFormat.cjs');

const PORTABLE_TEMPLATE_KIND = 'yudubid-bid-template';
const PORTABLE_TEMPLATE_VERSION = 1;
const MAX_PORTABLE_TEMPLATE_BYTES = 20 * 1024 * 1024;
const MAX_COVER_ASSET_BYTES = 10 * 1024 * 1024;

function templateFromRow(row) {
  if (!row) return null;
  return {
    templateId: row.template_id,
    templateName: row.template_name,
    config: normalizeBidExportTemplate(JSON.parse(row.config_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    template_id: row.template_id,
    template_name: row.template_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createTemplateStore({ app, db }) {
  const assetDir = path.join(app.getPath('userData'), 'workspace', 'template-assets');

  function isManagedAsset(filePath) {
    const target = path.resolve(String(filePath || ''));
    const root = `${path.resolve(assetDir)}${path.sep}`;
    return target.startsWith(root);
  }

  function imageDataUrl(filePath) {
    if (!isManagedAsset(filePath) || !fs.existsSync(filePath)) return '';
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return '';
    const extension = path.extname(filePath).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : '';
    return mime ? `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` : '';
  }

  function portableCoverAsset(filePath) {
    if (!isManagedAsset(filePath) || !fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_COVER_ASSET_BYTES) return null;
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === '.png' ? 'image/png' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : '';
    if (!mimeType) return null;
    const buffer = fs.readFileSync(filePath);
    return {
      file_name: path.basename(filePath),
      mime_type: mimeType,
      size: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      data_base64: buffer.toString('base64'),
    };
  }

  function safeTemplateFileName(value) {
    const name = String(value || '招投标模板')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/[. ]+$/g, '')
      .trim();
    return (name || '招投标模板').slice(0, 80);
  }

  function buildPortableTemplate(templateId) {
    const template = get(templateId);
    if (!template) throw new Error('模板不存在或已被删除');
    const config = normalizeBidExportTemplate(template.config);
    const coverLogo = portableCoverAsset(config.cover?.logo_path);
    config.cover.logo_path = '';
    return {
      kind: PORTABLE_TEMPLATE_KIND,
      version: PORTABLE_TEMPLATE_VERSION,
      exported_at: new Date().toISOString(),
      product: 'yudubid',
      template: {
        name: template.template_name,
        config,
      },
      assets: coverLogo ? { cover_logo: coverLogo } : {},
    };
  }

  function parsePortableTemplate(input) {
    let source = input;
    if (typeof input === 'string') {
      try {
        source = JSON.parse(input);
      } catch {
        throw new Error('模板文件不是有效的 JSON 格式');
      }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('模板文件内容无效');

    if (source.kind === PORTABLE_TEMPLATE_KIND) {
      if (Number(source.version) > PORTABLE_TEMPLATE_VERSION) throw new Error('模板文件版本过高，请升级 YuduBid 后再导入');
      if (!source.template?.config || typeof source.template.config !== 'object') throw new Error('模板文件缺少配置内容');
      return { config: source.template.config, templateName: source.template.name, coverAsset: source.assets?.cover_logo || null };
    }

    // 兼容早期导出的记录对象和用户手动保存的纯配置 JSON。
    const config = source.config && typeof source.config === 'object' ? source.config : source;
    if (!config.page && !config.body_text && !config.template_name && !config.templateName) throw new Error('不是可识别的招投标模板文件');
    return { config, templateName: source.template_name || source.templateName || config.template_name || config.templateName, coverAsset: null };
  }

  function uniqueImportedName(value) {
    const base = String(value || '导入模板').trim().slice(0, 70) || '导入模板';
    const exists = db.prepare('SELECT 1 FROM bid_export_templates WHERE template_name = ? LIMIT 1');
    if (!exists.get(base)) return { name: base, renamed: false };
    for (let index = 1; index < 1000; index += 1) {
      const suffix = index === 1 ? '（导入）' : `（导入 ${index}）`;
      const candidate = `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
      if (!exists.get(candidate)) return { name: candidate, renamed: true };
    }
    throw new Error('同名模板过多，请先重命名已有模板');
  }

  function restorePortableCoverAsset(asset) {
    if (!asset) return '';
    const mimeType = String(asset.mime_type || '');
    const extension = mimeType === 'image/png' ? '.png' : mimeType === 'image/jpeg' ? '.jpg' : '';
    if (!extension || typeof asset.data_base64 !== 'string') throw new Error('封面 Logo 数据格式不受支持');
    if (!/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(asset.data_base64)) throw new Error('封面 Logo 数据已损坏');
    const buffer = Buffer.from(asset.data_base64, 'base64');
    if (!buffer.length || buffer.length > MAX_COVER_ASSET_BYTES) throw new Error('封面 Logo 为空或超过 10MB');
    const isPng = extension === '.png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = extension === '.jpg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (!isPng && !isJpeg) throw new Error('封面 Logo 实际内容与声明格式不一致');
    if (Number(asset.size) && Number(asset.size) !== buffer.length) throw new Error('封面 Logo 文件大小校验失败');
    if (asset.sha256 && crypto.createHash('sha256').update(buffer).digest('hex') !== String(asset.sha256)) throw new Error('封面 Logo 完整性校验失败');
    fs.mkdirSync(assetDir, { recursive: true });
    const targetPath = path.join(assetDir, `imported-cover-logo-${Date.now()}-${crypto.randomUUID()}${extension}`);
    fs.writeFileSync(targetPath, buffer);
    return targetPath;
  }

  function importPortableTemplate(input) {
    const parsed = parsePortableTemplate(input);
    const normalized = normalizeBidExportTemplate(parsed.config);
    const resolvedName = uniqueImportedName(parsed.templateName || normalized.template_name);
    normalized.template_name = resolvedName.name;
    normalized.cover.logo_path = restorePortableCoverAsset(parsed.coverAsset);
    const template = create(normalized);
    return {
      success: true,
      renamed: resolvedName.renamed,
      template,
      message: resolvedName.renamed ? `模板已导入，并因重名保存为“${resolvedName.name}”` : `模板“${resolvedName.name}”已导入`,
    };
  }

  async function exportTemplate(templateId) {
    const portable = buildPortableTemplate(templateId);
    const defaultPath = `${safeTemplateFileName(portable.template.name)}.yudubid-template`;
    const result = await dialog.showSaveDialog({
      title: '导出招投标模板',
      defaultPath,
      filters: [{ name: 'YuduBid 模板', extensions: ['yudubid-template'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    const filePath = result.filePath.toLowerCase().endsWith('.yudubid-template') ? result.filePath : `${result.filePath}.yudubid-template`;
    fs.writeFileSync(filePath, `${JSON.stringify(portable, null, 2)}\n`, 'utf8');
    return { success: true, canceled: false, path: filePath, message: `模板已导出到 ${filePath}` };
  }

  async function importTemplate() {
    const result = await dialog.showOpenDialog({
      title: '导入招投标模板',
      properties: ['openFile'],
      filters: [
        { name: 'YuduBid 模板', extensions: ['yudubid-template', 'json'] },
      ],
    });
    if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_PORTABLE_TEMPLATE_BYTES) throw new Error('模板文件无效或超过 20MB');
    const imported = importPortableTemplate(fs.readFileSync(filePath, 'utf8'));
    return { ...imported, canceled: false, path: filePath };
  }

  async function selectCoverLogo() {
    const result = await dialog.showOpenDialog({
      title: '选择封面 Logo',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };

    const sourcePath = result.filePaths[0];
    const extension = path.extname(sourcePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw new Error('封面 Logo 仅支持 PNG、JPG 和 JPEG 图片');
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('封面 Logo 文件不能超过 10MB');

    fs.mkdirSync(assetDir, { recursive: true });
    const targetPath = path.join(assetDir, `cover-logo-${Date.now()}-${crypto.randomUUID()}${extension}`);
    fs.copyFileSync(sourcePath, targetPath);
    return { canceled: false, path: targetPath, dataUrl: imageDataUrl(targetPath) };
  }

  function getCoverLogoPreview(filePath) {
    return { dataUrl: imageDataUrl(filePath) };
  }
  function list() {
    return db.prepare(`
      SELECT template_id, template_name, config_json, created_at, updated_at
      FROM bid_export_templates
      ORDER BY updated_at DESC, created_at DESC
    `).all().map(templateFromRow);
  }

  function get(templateId) {
    return templateFromRow(db.prepare(`
      SELECT template_id, template_name, config_json, created_at, updated_at
      FROM bid_export_templates WHERE template_id = ?
    `).get(String(templateId || '')));
  }

  function create(config) {
    const normalized = normalizeBidExportTemplate(config);
    const timestamp = new Date().toISOString();
    const templateId = `bid-template-${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO bid_export_templates (template_id, template_name, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(templateId, normalized.template_name, JSON.stringify(normalized), timestamp, timestamp);
    return get(templateId);
  }

  function update(templateId, config) {
    const normalized = normalizeBidExportTemplate(config);
    const result = db.prepare(`
      UPDATE bid_export_templates
      SET template_name = ?, config_json = ?, updated_at = ?
      WHERE template_id = ?
    `).run(normalized.template_name, JSON.stringify(normalized), new Date().toISOString(), String(templateId || ''));
    if (!result.changes) throw new Error('模板不存在或已被删除');
    return get(templateId);
  }

  function remove(templateId) {
    const result = db.prepare('DELETE FROM bid_export_templates WHERE template_id = ?').run(String(templateId || ''));
    return { success: result.changes > 0, message: result.changes ? '模板已删除' : '模板不存在或已被删除' };
  }

  return {
    list,
    get,
    create,
    update,
    remove,
    selectCoverLogo,
    getCoverLogoPreview,
    buildPortableTemplate,
    importPortableTemplate,
    exportTemplate,
    importTemplate,
  };
}

module.exports = { PORTABLE_TEMPLATE_KIND, PORTABLE_TEMPLATE_VERSION, createTemplateStore };
