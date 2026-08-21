const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  getFeasibilityAnalysisMarkdownPath,
  getFeasibilityKeyParametersMarkdownPath,
  getFeasibilityReportDir,
  getFeasibilitySourceDir,
} = require('../utils/paths.cjs');
const { deleteImportedImageBatches } = require('../utils/importedImages.cjs');

const DEFAULT_PROJECT_INFO = {
  projectName: '',
  projectType: 'government',
  industry: '',
  constructionUnit: '',
  location: '',
  constructionContent: '',
  constructionPeriodYears: '2',
  operationPeriodYears: '20',
  totalInvestment: '',
  fundingSource: '',
};

const DEFAULT_CONTENT_GENERATION_OPTIONS = {
  useAiImages: false,
  maxAiImages: 6,
  useMermaidImages: true,
  useTechnicalDiagrams: true,
};

const TASK_FIELDS = {
  'feasibility-analysis': 'analysisTask',
  'feasibility-outline': 'outlineTask',
  'feasibility-outline-adjustment': 'outlineAdjustmentTask',
  'feasibility-parameters': 'parametersTask',
  'feasibility-content': 'contentTask',
  'feasibility-human-writing': 'humanWritingTask',
};

function now() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stableHash(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function isValidStep(value) {
  return ['materials', 'sources', 'analysis', 'outline', 'parameters', 'content'].includes(value);
}

function normalizeSourceId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) throw new Error('可研资料 ID 无效');
  return normalized;
}

function normalizeProjectInfo(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_PROJECT_INFO,
    ...Object.fromEntries(Object.keys(DEFAULT_PROJECT_INFO).map((key) => [key, String(source[key] ?? DEFAULT_PROJECT_INFO[key])])),
    projectType: source.projectType === 'enterprise' ? 'enterprise' : 'government',
  };
}

function normalizeContentGenerationOptions(value) {
  const source = value && typeof value === 'object' ? value : {};
  const requestedMaxAiImages = Number(source.maxAiImages ?? DEFAULT_CONTENT_GENERATION_OPTIONS.maxAiImages);
  return {
    useAiImages: Boolean(source.useAiImages ?? DEFAULT_CONTENT_GENERATION_OPTIONS.useAiImages),
    maxAiImages: Math.max(0, Math.min(100, Number.isFinite(requestedMaxAiImages) ? Math.round(requestedMaxAiImages) : DEFAULT_CONTENT_GENERATION_OPTIONS.maxAiImages)),
    useMermaidImages: Boolean(source.useMermaidImages ?? DEFAULT_CONTENT_GENERATION_OPTIONS.useMermaidImages),
    useTechnicalDiagrams: Boolean(source.useTechnicalDiagrams ?? DEFAULT_CONTENT_GENERATION_OPTIONS.useTechnicalDiagrams),
  };
}

function flattenOutline(items, parentNodeId = null, level = 1, rows = []) {
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const nodeId = String(item?.id || '').trim();
    if (!nodeId) return;
    rows.push({
      node_id: nodeId,
      parent_node_id: parentNodeId,
      sort_order: index,
      level,
      title: String(item?.title || '未命名章节').trim() || '未命名章节',
      description: String(item?.description || '').trim(),
      knowledge_item_ids_json: Array.isArray(item?.knowledge_item_ids) && item.knowledge_item_ids.length ? JSON.stringify(item.knowledge_item_ids) : null,
      content: String(item?.content || ''),
      content_source: String(item?.content_source || (String(item?.content || '').trim() ? 'ai' : 'none')),
    });
    flattenOutline(item?.children, nodeId, level + 1, rows);
  });
  return rows;
}

function createFeasibilityReportStore({ app, db }) {
  const reportDir = getFeasibilityReportDir(app);
  const sourceDir = getFeasibilitySourceDir(app);
  const analysisPath = getFeasibilityAnalysisMarkdownPath(app);
  const keyParametersPath = getFeasibilityKeyParametersMarkdownPath(app);

  function ensureMetaRow() {
    const existing = db.prepare('SELECT * FROM feasibility_report_meta WHERE id = 1').get();
    if (existing) return existing;
    const timestamp = now();
    db.prepare(`
      INSERT INTO feasibility_report_meta (id, step, project_info_json, outline_template, target_words, created_at, updated_at)
      VALUES (1, 'materials', @project_info_json, 'government', 30000, @timestamp, @timestamp)
    `).run({ project_info_json: JSON.stringify(DEFAULT_PROJECT_INFO), timestamp });
    return db.prepare('SELECT * FROM feasibility_report_meta WHERE id = 1').get();
  }

  function updateMeta(fields = {}) {
    ensureMetaRow();
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const assignments = entries.map(([key]) => `${key} = @${key}`).join(', ');
    db.prepare(`UPDATE feasibility_report_meta SET ${assignments}, updated_at = @updated_at WHERE id = 1`).run({
      ...Object.fromEntries(entries),
      updated_at: now(),
    });
  }

  function readMarkdown(filePath) {
    return filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  }

  function writeMarkdown(filePath, content) {
    const markdown = String(content || '');
    if (!markdown.trim()) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      return { path: null, hash: null, chars: 0 };
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, markdown, 'utf-8');
    return { path: filePath, hash: stableHash(markdown), chars: markdown.length };
  }

  function resolveSourceMarkdownPath(sourceId, storedPath) {
    const expectedPath = path.resolve(sourceDir, `${sourceId}.md`);
    const resolvedPath = path.resolve(String(storedPath || expectedPath));
    if (resolvedPath !== expectedPath) throw new Error('可研资料路径无效，已停止文件操作');
    return resolvedPath;
  }

  function loadSources() {
    return db.prepare('SELECT * FROM feasibility_report_sources ORDER BY sort_order ASC, imported_at ASC').all().map((row) => ({
      id: row.source_id,
      fileName: row.file_name,
      markdownPath: row.markdown_path,
      markdownChars: row.markdown_chars,
      contentHash: row.content_hash,
      parserLabel: row.parser_label || null,
      importedAt: row.imported_at,
    }));
  }

  function loadReferenceDocumentIds() {
    return db.prepare('SELECT document_id FROM feasibility_report_reference_docs ORDER BY sort_order ASC').all().map((row) => row.document_id);
  }

  function loadTasks() {
    const result = {};
    for (const row of db.prepare('SELECT * FROM feasibility_report_tasks').all()) {
      const field = TASK_FIELDS[row.type];
      if (!field) continue;
      result[field] = {
        task_id: row.task_id,
        type: row.type,
        status: row.status,
        progress: row.progress,
        logs: safeJsonParse(row.logs_json, []),
        stats: safeJsonParse(row.stats_json, undefined),
        error: row.error || undefined,
        pause_requested: Number(row.pause_requested) === 1,
        started_at: row.started_at,
        updated_at: row.updated_at,
      };
    }
    return result;
  }

  function loadOutlineData(meta) {
    const rows = db.prepare('SELECT * FROM feasibility_report_outline_nodes ORDER BY level ASC, parent_node_id ASC, sort_order ASC').all();
    if (!rows.length) return null;
    const byId = new Map(rows.map((row) => [row.node_id, {
      id: row.node_id,
      title: row.title,
      description: row.description || '',
      knowledge_item_ids: safeJsonParse(row.knowledge_item_ids_json, []),
      content: row.content || '',
      content_source: row.content_source || 'none',
      children: [],
    }]));
    const roots = [];
    rows.forEach((row) => {
      const item = byId.get(row.node_id);
      const parent = row.parent_node_id ? byId.get(row.parent_node_id) : null;
      if (parent) parent.children.push(item);
      else roots.push(item);
    });
    const removeEmptyChildren = (items) => items.map((item) => ({
      ...item,
      children: item.children.length ? removeEmptyChildren(item.children) : undefined,
    }));
    return {
      outline: removeEmptyChildren(roots),
      project_name: meta.outline_project_name || undefined,
      project_overview: meta.outline_project_overview || undefined,
    };
  }

  function loadContentSections() {
    return Object.fromEntries(db.prepare('SELECT * FROM feasibility_report_content_sections').all().map((row) => [row.node_id, {
      nodeId: row.node_id,
      status: row.status,
      error: row.error || undefined,
      updatedAt: row.updated_at,
    }]));
  }

  function loadFeasibilityReport() {
    const meta = ensureMetaRow();
    return {
      step: isValidStep(meta.step) ? meta.step : 'materials',
      projectInfo: normalizeProjectInfo(safeJsonParse(meta.project_info_json, DEFAULT_PROJECT_INFO)),
      sourceFiles: loadSources(),
      analysisMarkdown: readMarkdown(meta.analysis_markdown_path || analysisPath),
      outlineTemplate: meta.outline_template || 'government',
      targetWords: Number(meta.target_words || 30000),
      referenceDocumentIds: loadReferenceDocumentIds(),
      keyParametersMarkdown: readMarkdown(meta.key_parameters_markdown_path || keyParametersPath),
      contentGenerationOptions: normalizeContentGenerationOptions(safeJsonParse(meta.content_generation_options_json, DEFAULT_CONTENT_GENERATION_OPTIONS)),
      outlineData: loadOutlineData(meta),
      contentSections: loadContentSections(),
      ...loadTasks(),
    };
  }

  function clearOutlineAndAfter() {
    db.prepare('DELETE FROM feasibility_report_content_sections').run();
    db.prepare('DELETE FROM feasibility_report_outline_nodes').run();
    db.prepare(`DELETE FROM feasibility_report_tasks WHERE type IN ('feasibility-outline','feasibility-outline-adjustment','feasibility-parameters','feasibility-content','feasibility-human-writing')`).run();
    writeMarkdown(keyParametersPath, '');
    updateMeta({
      key_parameters_markdown_path: null,
      key_parameters_markdown_hash: null,
      key_parameters_markdown_chars: 0,
      outline_project_name: null,
      outline_project_overview: null,
    });
  }

  function clearAnalysisAndAfter() {
    db.prepare("DELETE FROM feasibility_report_tasks WHERE type = 'feasibility-analysis'").run();
    writeMarkdown(analysisPath, '');
    updateMeta({ analysis_markdown_path: null, analysis_markdown_hash: null, analysis_markdown_chars: 0 });
    clearOutlineAndAfter();
  }

  function updateStep(step) {
    if (!isValidStep(step)) throw new Error('可研报告步骤无效');
    updateMeta({ step });
    return loadFeasibilityReport();
  }

  function saveProjectInfo(projectInfo, options = {}) {
    const normalized = normalizeProjectInfo(projectInfo);
    const current = normalizeProjectInfo(safeJsonParse(ensureMetaRow().project_info_json, DEFAULT_PROJECT_INFO));
    const changed = JSON.stringify(current) !== JSON.stringify(normalized);
    updateMeta({ project_info_json: JSON.stringify(normalized) });
    if (changed && options.clearDownstream !== false) clearAnalysisAndAfter();
    return loadFeasibilityReport();
  }

  function importSources(documents = []) {
    const normalizedDocuments = (Array.isArray(documents) ? documents : []).map((document) => {
      const sourceId = normalizeSourceId(document?.id);
      const markdown = String(document?.markdown || '').trim();
      if (!markdown) throw new Error(`${String(document?.fileName || '项目资料')}未提取到有效内容`);
      return {
        sourceId,
        fileName: String(document?.fileName || '未命名资料').trim() || '未命名资料',
        markdown,
        parserLabel: String(document?.parserLabel || '').trim() || null,
        markdownPath: path.join(sourceDir, `${sourceId}.md`),
      };
    });
    if (!normalizedDocuments.length) return loadFeasibilityReport();

    fs.mkdirSync(sourceDir, { recursive: true });
    const createdPaths = [];
    const temporaryPaths = [];
    try {
      normalizedDocuments.forEach((document) => {
        const tempPath = path.join(sourceDir, `${document.sourceId}.${Date.now()}.tmp.md`);
        temporaryPaths.push(tempPath);
        fs.writeFileSync(tempPath, `${document.markdown}\n`, 'utf-8');
        fs.renameSync(tempPath, document.markdownPath);
        temporaryPaths.splice(temporaryPaths.indexOf(tempPath), 1);
        createdPaths.push(document.markdownPath);
      });
      const timestamp = now();
      const nextSortOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM feasibility_report_sources').get()?.value || 0);
      const persist = db.transaction(() => {
        clearAnalysisAndAfter();
        const insert = db.prepare(`
          INSERT INTO feasibility_report_sources
            (source_id, file_name, markdown_path, markdown_chars, content_hash, parser_label, sort_order, imported_at, updated_at)
          VALUES
            (@source_id, @file_name, @markdown_path, @markdown_chars, @content_hash, @parser_label, @sort_order, @timestamp, @timestamp)
        `);
        normalizedDocuments.forEach((document, index) => insert.run({
          source_id: document.sourceId,
          file_name: document.fileName,
          markdown_path: document.markdownPath,
          markdown_chars: document.markdown.length,
          content_hash: stableHash(document.markdown),
          parser_label: document.parserLabel,
          sort_order: nextSortOrder + index,
          timestamp,
        }));
      });
      persist();
      return loadFeasibilityReport();
    } catch (error) {
      temporaryPaths.forEach((filePath) => fs.rmSync(filePath, { force: true }));
      createdPaths.forEach((filePath) => fs.rmSync(filePath, { force: true }));
      throw error;
    }
  }

  function readSourceMarkdown(sourceId) {
    const id = normalizeSourceId(sourceId);
    const row = db.prepare('SELECT markdown_path FROM feasibility_report_sources WHERE source_id = ?').get(id);
    if (!row) throw new Error('可研资料不存在或已移除');
    return readMarkdown(resolveSourceMarkdownPath(id, row.markdown_path));
  }

  function readCombinedSourceMarkdown() {
    return loadSources().map((source) => {
      const markdown = readMarkdown(resolveSourceMarkdownPath(source.id, source.markdownPath));
      return `# 资料：${source.fileName}\n\n${markdown}`;
    }).join('\n\n---\n\n');
  }

  function saveTask(type, task) {
    const field = TASK_FIELDS[type];
    if (!field) throw new Error('不支持的可研后台任务类型');
    if (!task) {
      db.prepare('DELETE FROM feasibility_report_tasks WHERE type = ?').run(type);
      return loadFeasibilityReport();
    }
    const timestamp = now();
    db.prepare(`
      INSERT INTO feasibility_report_tasks
        (type, task_id, status, progress, logs_json, stats_json, error, pause_requested, started_at, updated_at)
      VALUES
        (@type, @task_id, @status, @progress, @logs_json, @stats_json, @error, @pause_requested, @started_at, @updated_at)
      ON CONFLICT(type) DO UPDATE SET
        task_id = excluded.task_id, status = excluded.status, progress = excluded.progress,
        logs_json = excluded.logs_json, stats_json = excluded.stats_json, error = excluded.error,
        pause_requested = excluded.pause_requested, started_at = excluded.started_at, updated_at = excluded.updated_at
    `).run({
      type,
      task_id: String(task.task_id || ''),
      status: String(task.status || 'running'),
      progress: Number(task.progress || 0),
      logs_json: JSON.stringify(Array.isArray(task.logs) ? task.logs : []),
      stats_json: task.stats === undefined ? null : JSON.stringify(task.stats),
      error: task.error ? String(task.error) : null,
      pause_requested: task.pause_requested ? 1 : 0,
      started_at: String(task.started_at || timestamp),
      updated_at: String(task.updated_at || timestamp),
    });
    return loadFeasibilityReport();
  }

  function removeSource(sourceId) {
    const id = normalizeSourceId(sourceId);
    const row = db.prepare('SELECT markdown_path FROM feasibility_report_sources WHERE source_id = ?').get(id);
    if (!row) throw new Error('可研资料不存在或已移除');
    const remove = db.transaction(() => {
      db.prepare('DELETE FROM feasibility_report_sources WHERE source_id = ?').run(id);
      clearAnalysisAndAfter();
    });
    remove();
    fs.rmSync(resolveSourceMarkdownPath(id, row.markdown_path), { force: true });
    deleteImportedImageBatches(app, `feasibility-report-source-${id}`);
    return loadFeasibilityReport();
  }

  function saveAnalysis(markdown) {
    const saved = writeMarkdown(analysisPath, markdown);
    updateMeta({
      analysis_markdown_path: saved.path,
      analysis_markdown_hash: saved.hash,
      analysis_markdown_chars: saved.chars,
    });
    clearOutlineAndAfter();
    return loadFeasibilityReport();
  }

  function replaceReferences(documentIds) {
    db.prepare('DELETE FROM feasibility_report_reference_docs').run();
    const insert = db.prepare('INSERT INTO feasibility_report_reference_docs (document_id, sort_order) VALUES (?, ?)');
    [...new Set((Array.isArray(documentIds) ? documentIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
      .forEach((documentId, index) => insert.run(documentId, index));
  }

  function saveOutlineConfig(payload = {}) {
    const template = String(payload.outlineTemplate || 'government');
    const targetWords = Math.max(5000, Math.min(200000, Number(payload.targetWords || 30000)));
    updateMeta({ outline_template: template, target_words: targetWords });
    replaceReferences(payload.referenceDocumentIds);
    clearOutlineAndAfter();
    return loadFeasibilityReport();
  }

  function saveOutline(outlineData) {
    const rows = flattenOutline(outlineData?.outline || []);
    const timestamp = now();
    const replace = db.transaction(() => {
      db.prepare('DELETE FROM feasibility_report_content_sections').run();
      db.prepare('DELETE FROM feasibility_report_outline_nodes').run();
      const insert = db.prepare(`
        INSERT INTO feasibility_report_outline_nodes
          (node_id, parent_node_id, sort_order, level, title, description, knowledge_item_ids_json, content, content_source, created_at, updated_at)
        VALUES
          (@node_id, @parent_node_id, @sort_order, @level, @title, @description, @knowledge_item_ids_json, @content, @content_source, @timestamp, @timestamp)
      `);
      rows.forEach((row) => insert.run({ ...row, timestamp }));
    });
    replace();
    writeMarkdown(keyParametersPath, '');
    db.prepare(`DELETE FROM feasibility_report_tasks WHERE type IN ('feasibility-outline-adjustment','feasibility-parameters','feasibility-content','feasibility-human-writing')`).run();
    updateMeta({
      outline_project_name: String(outlineData?.project_name || ''),
      outline_project_overview: String(outlineData?.project_overview || ''),
      key_parameters_markdown_path: null,
      key_parameters_markdown_hash: null,
      key_parameters_markdown_chars: 0,
    });
    return loadFeasibilityReport();
  }

  function saveKeyParameters(markdown) {
    const saved = writeMarkdown(keyParametersPath, markdown);
    updateMeta({
      key_parameters_markdown_path: saved.path,
      key_parameters_markdown_hash: saved.hash,
      key_parameters_markdown_chars: saved.chars,
    });
    db.prepare('DELETE FROM feasibility_report_content_sections').run();
    db.prepare("UPDATE feasibility_report_outline_nodes SET content = '', content_source = 'none', updated_at = ?").run(now());
    db.prepare(`DELETE FROM feasibility_report_tasks WHERE type IN ('feasibility-content','feasibility-human-writing')`).run();
    return loadFeasibilityReport();
  }

  function saveChapterContent({ nodeId, content }) {
    const id = String(nodeId || '').trim();
    if (!id) throw new Error('正文小节 ID 不能为空');
    const markdown = String(content || '');
    const timestamp = now();
    const save = db.transaction(() => {
      const result = db.prepare("UPDATE feasibility_report_outline_nodes SET content = ?, content_source = 'manual', updated_at = ? WHERE node_id = ?").run(markdown, timestamp, id);
      if (!result.changes) throw new Error('正文小节不存在或已被删除');
      db.prepare(`INSERT INTO feasibility_report_content_sections (node_id, status, error, updated_at) VALUES (?, ?, NULL, ?)
        ON CONFLICT(node_id) DO UPDATE SET status = excluded.status, error = NULL, updated_at = excluded.updated_at`)
        .run(id, markdown.trim() ? 'success' : 'idle', timestamp);
    });
    save();
    return loadFeasibilityReport();
  }

  function saveContentGenerationOptions(options) {
    updateMeta({ content_generation_options_json: JSON.stringify(normalizeContentGenerationOptions(options)) });
    return loadFeasibilityReport();
  }

  function saveContentSection({ nodeId, status, error }) {
    const id = String(nodeId || '').trim();
    if (!id) throw new Error('正文小节 ID 不能为空');
    if (!['idle', 'running', 'success', 'error'].includes(status)) throw new Error('正文小节状态无效');
    db.prepare(`INSERT INTO feasibility_report_content_sections (node_id, status, error, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(node_id) DO UPDATE SET status = excluded.status, error = excluded.error, updated_at = excluded.updated_at`)
      .run(id, status, error ? String(error) : null, now());
    return loadFeasibilityReport();
  }

  function saveGeneratedChapterContent({ nodeId, content }) {
    const id = String(nodeId || '').trim();
    const markdown = String(content || '').trim();
    if (!id || !markdown) throw new Error('生成的正文小节内容无效');
    const timestamp = now();
    const save = db.transaction(() => {
      const result = db.prepare("UPDATE feasibility_report_outline_nodes SET content = ?, content_source = 'ai', updated_at = ? WHERE node_id = ?").run(markdown, timestamp, id);
      if (!result.changes) throw new Error('正文小节不存在或已被删除');
      db.prepare(`INSERT INTO feasibility_report_content_sections (node_id, status, error, updated_at) VALUES (?, 'success', NULL, ?)
        ON CONFLICT(node_id) DO UPDATE SET status = 'success', error = NULL, updated_at = excluded.updated_at`).run(id, timestamp);
    });
    save();
    return loadFeasibilityReport();
  }

  function saveReviewedChapterContent({ nodeId, content }) {
    const id = String(nodeId || '').trim();
    const markdown = String(content || '').trim();
    if (!id || !markdown) throw new Error('审校后的正文小节内容无效');
    const timestamp = now();
    const save = db.transaction(() => {
      const result = db.prepare("UPDATE feasibility_report_outline_nodes SET content = ?, content_source = 'humanized', updated_at = ? WHERE node_id = ?").run(markdown, timestamp, id);
      if (!result.changes) throw new Error('正文小节不存在或已被删除');
      db.prepare(`INSERT INTO feasibility_report_content_sections (node_id, status, error, updated_at) VALUES (?, 'success', NULL, ?)
        ON CONFLICT(node_id) DO UPDATE SET status = 'success', error = NULL, updated_at = excluded.updated_at`).run(id, timestamp);
    });
    save();
    return loadFeasibilityReport();
  }

  function recoverInterruptedContentSections() {
    db.prepare("UPDATE feasibility_report_content_sections SET status = 'error', error = '上次生成未完成，请重新生成本节', updated_at = ? WHERE status = 'running'").run(now());
    return loadFeasibilityReport();
  }

  function clearFeasibilityReport() {
    const clear = db.transaction(() => {
      db.prepare('DELETE FROM feasibility_report_content_sections').run();
      db.prepare('DELETE FROM feasibility_report_outline_nodes').run();
      db.prepare('DELETE FROM feasibility_report_tasks').run();
      db.prepare('DELETE FROM feasibility_report_reference_docs').run();
      db.prepare('DELETE FROM feasibility_report_sources').run();
      db.prepare('DELETE FROM feasibility_report_meta').run();
    });
    clear();
    fs.rmSync(reportDir, { recursive: true, force: true });
    deleteImportedImageBatches(app, 'feasibility-report');
    ensureMetaRow();
    return { success: true, message: '可研项目工作区已重置', state: loadFeasibilityReport() };
  }

  return {
    loadFeasibilityReport,
    updateStep,
    saveProjectInfo,
    importSources,
    readSourceMarkdown,
    readCombinedSourceMarkdown,
    saveTask,
    removeSource,
    saveAnalysis,
    saveOutlineConfig,
    saveOutline,
    saveKeyParameters,
    saveChapterContent,
    saveContentGenerationOptions,
    saveContentSection,
    saveGeneratedChapterContent,
    saveReviewedChapterContent,
    recoverInterruptedContentSections,
    clearFeasibilityReport,
  };
}

module.exports = { createFeasibilityReportStore, DEFAULT_PROJECT_INFO, DEFAULT_CONTENT_GENERATION_OPTIONS };
