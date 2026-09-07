const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dialog, nativeImage } = require('electron');
const Database = require('better-sqlite3');
const { getKnowledgeImageLibraryDir } = require('../utils/paths.cjs');
const { safeRemoveSync } = require('../utils/safeRemove.cjs');

const maxBytes = 20 * 1024 * 1024;
const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function now() { return new Date().toISOString(); }
function createId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function safeName(value) { return String(value || '未命名').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').trim() || '未命名'; }
function parseTags(value) { try { const tags = JSON.parse(value || '[]'); return Array.isArray(tags) ? tags : []; } catch { return []; } }
function mimeFromBuffer(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  return '';
}

function createKnowledgeImageService({ app, db }) {
  const baseDir = getKnowledgeImageLibraryDir(app);
  fs.mkdirSync(baseDir, { recursive: true });
  const folderFromRow = (row) => row && ({ id: row.folder_id, name: row.name, sort_order: row.sort_order, created_at: row.created_at, updated_at: row.updated_at });
  const imageFromRow = (row) => row && ({ id: row.image_id, folder_id: row.folder_id, name: row.name, description: row.description, tags: parseTags(row.tags_json), file_name: row.file_name, mime_type: row.mime_type, size: row.size, asset_url: `yibiao-asset://knowledge-images/${encodeURIComponent(row.file_path)}`, sort_order: row.sort_order, created_at: row.created_at, updated_at: row.updated_at });
  const requireFolder = (folderId) => {
    const row = db.prepare('SELECT * FROM knowledge_image_folders WHERE folder_id = ?').get(folderId);
    if (!row) throw new Error('图片文件夹不存在');
    return row;
  };
  const requireImage = (imageId) => {
    const row = db.prepare('SELECT * FROM knowledge_images WHERE image_id = ?').get(imageId);
    if (!row) throw new Error('图片不存在');
    return row;
  };
  const resolveImagePath = (row) => {
    const resolved = path.resolve(baseDir, row.file_path);
    if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) throw new Error('图片路径不合法');
    return resolved;
  };
  const assetUrlFromRow = (row) => `yibiao-asset://knowledge-images/${encodeURIComponent(row.file_path)}`;
  const walkDatabaseFiles = (directory, output = []) => {
    if (!fs.existsSync(directory)) return output;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'archive') continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walkDatabaseFiles(target, output);
      else if (entry.isFile() && entry.name === 'yibiao.sqlite') output.push(target);
    }
    return output;
  };
  const findReferences = (row) => {
    const assetUrl = assetUrlFromRow(row);
    const references = [];
    for (const databasePath of walkDatabaseFiles(path.join(app.getPath('userData'), 'workspace'))) {
      let referenceDb;
      try {
        referenceDb = databasePath === db.name ? db : new Database(databasePath, { readonly: true, fileMustExist: true });
        const table = referenceDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'technical_plan_outline_nodes'").get();
        if (!table) continue;
        const rows = referenceDb.prepare('SELECT node_id, title FROM technical_plan_outline_nodes WHERE content LIKE ?').all(`%${assetUrl}%`);
        rows.forEach((item) => references.push({ database_path: databasePath, node_id: item.node_id, title: item.title }));
      } catch {
        // 某个项目数据库不可读时跳过，不影响图片库浏览。
      } finally {
        if (referenceDb && referenceDb !== db) referenceDb.close();
      }
    }
    return references;
  };
  return {
    listFolders() { return db.prepare('SELECT * FROM knowledge_image_folders ORDER BY sort_order, created_at').all().map(folderFromRow); },
    createFolder(name) {
      const timestamp = now();
      const id = createId('kbimg-folder');
      const sortOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 value FROM knowledge_image_folders').get().value);
      db.prepare('INSERT INTO knowledge_image_folders (folder_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, safeName(name), sortOrder, timestamp, timestamp);
      return folderFromRow(db.prepare('SELECT * FROM knowledge_image_folders WHERE folder_id = ?').get(id));
    },
    renameFolder(folderId, name) {
      requireFolder(folderId);
      db.prepare('UPDATE knowledge_image_folders SET name = ?, updated_at = ? WHERE folder_id = ?').run(safeName(name), now(), folderId);
      return folderFromRow(db.prepare('SELECT * FROM knowledge_image_folders WHERE folder_id = ?').get(folderId));
    },
    deleteFolder(folderId, options = {}) {
      const folder = requireFolder(folderId);
      const rows = db.prepare('SELECT * FROM knowledge_images WHERE folder_id = ?').all(folderId);
      const referenced = rows.flatMap(findReferences);
      if (referenced.length && !options.force) return { success: false, referenced: true, reference_count: referenced.length, message: `该文件夹中有图片被 ${referenced.length} 个技术方案章节引用` };
      rows.forEach((row) => safeRemoveSync(path.dirname(resolveImagePath(row)), { recursive: true }));
      db.prepare('DELETE FROM knowledge_image_folders WHERE folder_id = ?').run(folderId);
      return { success: true, message: `已删除文件夹“${folder.name}”及 ${rows.length} 张图片` };
    },
    list(folderId, query = '') {
      requireFolder(folderId);
      const needle = String(query || '').trim().toLowerCase();
      return db.prepare('SELECT * FROM knowledge_images WHERE folder_id = ? ORDER BY sort_order, created_at DESC').all(folderId).map(imageFromRow).filter((item) => !needle || `${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(needle));
    },
    async upload(folderId) {
      requireFolder(folderId);
      const selected = await dialog.showOpenDialog({ title: '选择图片素材', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] });
      if (selected.canceled) return { success: false, canceled: true, message: '已取消选择', images: [] };
      const created = [];
      for (const sourcePath of selected.filePaths) {
        const extension = path.extname(sourcePath).toLowerCase();
        if (!supportedExtensions.has(extension)) continue;
        const stat = fs.statSync(sourcePath);
        if (stat.size > maxBytes) throw new Error(`${path.basename(sourcePath)} 超过 20MB 限制`);
        const buffer = fs.readFileSync(sourcePath);
        const mimeType = mimeFromBuffer(buffer);
        if (!mimeType) throw new Error(`${path.basename(sourcePath)} 不是受支持的图片格式`);
        const id = createId('kbimg');
        const imageDir = path.join(baseDir, id);
        const fileName = `source${extension === '.jpeg' ? '.jpg' : extension}`;
        fs.mkdirSync(imageDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, fileName), buffer);
        const timestamp = now();
        const sortOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 value FROM knowledge_images WHERE folder_id = ?').get(folderId).value);
        try {
          db.prepare('INSERT INTO knowledge_images (image_id, folder_id, name, description, tags_json, file_name, mime_type, size, file_path, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, folderId, path.basename(sourcePath, extension), '', '[]', path.basename(sourcePath), mimeType, stat.size, `${id}/${fileName}`, sortOrder, timestamp, timestamp);
          created.push(imageFromRow(requireImage(id)));
        } catch (error) {
          safeRemoveSync(imageDir, { recursive: true });
          throw error;
        }
      }
      return { success: true, message: `已上传 ${created.length} 张图片`, images: created };
    },
    update(imageId, patch = {}) {
      const image = requireImage(imageId);
      db.prepare('UPDATE knowledge_images SET name = ?, description = ?, tags_json = ?, updated_at = ? WHERE image_id = ?').run(patch.name === undefined ? image.name : safeName(patch.name), patch.description === undefined ? image.description : String(patch.description || ''), patch.tags === undefined ? image.tags_json : JSON.stringify(Array.isArray(patch.tags) ? patch.tags.map(String) : []), now(), imageId);
      return imageFromRow(requireImage(imageId));
    },
    move(imageIds, folderId) {
      requireFolder(folderId);
      const ids = [...new Set((Array.isArray(imageIds) ? imageIds : []).map(String))];
      const transaction = db.transaction(() => {
        const update = db.prepare('UPDATE knowledge_images SET folder_id = ?, sort_order = ?, updated_at = ? WHERE image_id = ?');
        let order = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 value FROM knowledge_images WHERE folder_id = ?').get(folderId).value);
        ids.forEach((id) => { requireImage(id); update.run(folderId, order++, now(), id); });
      });
      transaction();
      return { success: true, message: `已移动 ${ids.length} 张图片` };
    },
    addTags(imageIds, tags) {
      const ids = [...new Set((Array.isArray(imageIds) ? imageIds : []).map(String))];
      const additions = [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()).filter(Boolean))];
      const transaction = db.transaction(() => {
        const update = db.prepare('UPDATE knowledge_images SET tags_json = ?, updated_at = ? WHERE image_id = ?');
        ids.forEach((id) => {
          const image = requireImage(id);
          update.run(JSON.stringify([...new Set([...parseTags(image.tags_json), ...additions])]), now(), id);
        });
      });
      transaction();
      return { success: true, message: `已为 ${ids.length} 张图片添加标签` };
    },
    findReferences(imageId) {
      const image = requireImage(imageId);
      const references = findReferences(image);
      return { referenced: references.length > 0, reference_count: references.length, references };
    },
    remove(imageId, options = {}) {
      const image = requireImage(imageId);
      const references = findReferences(image);
      if (references.length && !options.force) return { success: false, referenced: true, reference_count: references.length, message: `图片被 ${references.length} 个技术方案章节引用` };
      safeRemoveSync(path.dirname(resolveImagePath(image)), { recursive: true });
      db.prepare('DELETE FROM knowledge_images WHERE image_id = ?').run(imageId);
      return { success: true, message: `已删除图片“${image.name}”` };
    },
    getDataUrl(imageId) {
      const image = requireImage(imageId);
      return `data:${image.mime_type};base64,${fs.readFileSync(resolveImagePath(image)).toString('base64')}`;
    },
    getThumbnailDataUrl(imageId) {
      const image = requireImage(imageId);
      const sourcePath = resolveImagePath(image);
      const thumbnailPath = path.join(path.dirname(sourcePath), 'thumbnail.png');
      if (!fs.existsSync(thumbnailPath) || fs.statSync(thumbnailPath).mtimeMs < fs.statSync(sourcePath).mtimeMs) {
        const source = nativeImage.createFromBuffer(fs.readFileSync(sourcePath));
        if (source.isEmpty()) throw new Error('无法生成图片缩略图');
        const size = source.getSize();
        const width = Math.min(360, Math.max(1, size.width));
        fs.writeFileSync(thumbnailPath, source.resize({ width, quality: 'good' }).toPNG());
      }
      return `data:image/png;base64,${fs.readFileSync(thumbnailPath).toString('base64')}`;
    },
  };
}

module.exports = { createKnowledgeImageService };
