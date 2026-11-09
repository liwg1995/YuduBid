const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { getPreparedBusinessWordPath } = require('../utils/paths.cjs');
const AdmZip = require('adm-zip');
const { appendAttachmentWord, attachmentMarkerKey, buildAttachmentWord, describeAttachmentSlots } = require('./businessAttachments.cjs');
const { neutralWordText, neutralizeWordBuffer } = require('./wordNeutralText.cjs');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const { listBusinessForms, extractBusinessForms, listMarkdownBusinessForms, extractMarkdownBusinessForms } = require('./businessFormExtraction.cjs');

const profileAliases = require('./businessTemplateFields.json');

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML = 'http://www.w3.org/XML/1998/namespace';

function templateParagraphs(zip) {
  if (!zip.getEntry('word/document.xml')) throw new Error('请选择有效的 Word 模板');
  return zip.getEntries()
    .filter(({ entryName }) => /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(entryName))
    .map((entry) => {
      const fail = () => { throw new Error('Word 模板结构无效'); };
      const doc = new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } })
        .parseFromString(zip.readAsText(entry, 'utf8'), 'application/xml');
      const groups = Array.from(doc.getElementsByTagNameNS(WORD, 'p')).flatMap((paragraph) => {
        const groups = [];
        let nodes = [];
        function visit(node) {
          if (node.namespaceURI === WORD && node.localName === 't') {
            nodes.push(node);
            return;
          }
          if (node !== paragraph && node.namespaceURI === WORD && ['p', 'tab', 'br', 'drawing', 'fldChar'].includes(node.localName)) {
            if (nodes.length) groups.push(nodes);
            nodes = [];
            return;
          }
          for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
        }
        visit(paragraph);
        if (nodes.length) groups.push(nodes);
        return groups;
      });
      return { entry, doc, groups };
    });
}

function normalizeLabel(label) {
  return label.trim().replace(/[：:]$/, '').trim();
}

const profileFields = new Map(Object.entries(profileAliases)
  .flatMap(([key, aliases]) => aliases.map((alias) => [alias, key])));

const recognizedLabels = new Set([
  ...profileFields.keys(), '项目名称', '招标项目名称', '招标编号', '项目编号',
  '标段名称', '标段编号', '投标报价', '投标总价', '报价有效期', '投标有效期', '交货期', '工期',
]);

function directWordChildren(element, localName) {
  return Array.from(element.childNodes).filter((node) => node.namespaceURI === WORD && node.localName === localName);
}

function hasOnlyWordChildren(element, allowed) {
  return Array.from(element.childNodes).every((node) =>
    (node.nodeType === 3 && !node.nodeValue.trim())
    || (node.namespaceURI === WORD && allowed(node)));
}

function blankFieldParagraph(cell) {
  const paragraphs = directWordChildren(cell, 'p');
  if (paragraphs.length !== 1 || !hasOnlyWordChildren(cell, (node) => ['tcPr', 'p'].includes(node.localName))) return null;
  const [paragraph] = paragraphs;
  if (!hasOnlyWordChildren(paragraph, (node) => ['pPr', 'r', 'proofErr'].includes(node.localName))) return null;
  if (!directWordChildren(paragraph, 'r').every((run) => hasOnlyWordChildren(run, (node) =>
    node.localName === 'rPr' || (node.localName === 't' && /^[\s_＿]*$/.test(node.textContent))))) return null;
  return paragraph;
}

function wordProperty(element, container, name) {
  const properties = directWordChildren(element, container)[0];
  return properties && directWordChildren(properties, name)[0];
}

function describeTableRow(row) {
  let column = Number(wordProperty(row, 'trPr', 'gridBefore')?.getAttributeNS(WORD, 'val')) || 0;
  return directWordChildren(row, 'tc').map((cell) => {
    const start = column;
    const span = Number(wordProperty(cell, 'tcPr', 'gridSpan')?.getAttributeNS(WORD, 'val')) || 1;
    column += Math.max(1, span);
    const merge = wordProperty(cell, 'tcPr', 'vMerge');
    return {
      cell, start, end: column,
      vertical: merge ? merge.getAttributeNS(WORD, 'val') || 'continue' : '',
      horizontal: Boolean(wordProperty(cell, 'tcPr', 'hMerge')),
    };
  });
}

function hasAlignedContinuation(rows, rowIndex, label, field) {
  if (label.vertical === '' && field.vertical === '') return true;
  if (label.vertical !== 'restart' || field.vertical !== 'restart') return false;
  let sharedRows = 0;
  for (let index = rowIndex + 1; index < rows.length; index += 1) {
    if (rows[index].some((entry) => entry.vertical === 'unsupported')) return false;
    const continuation = (origin) => rows[index].find((entry) => entry.vertical === 'continue'
      && entry.start < origin.end && entry.end > origin.start);
    const left = continuation(label);
    const right = continuation(field);
    if (!left && !right) break;
    if (!left || !right
      || left.start !== label.start || left.end !== label.end || right.start !== field.start || right.end !== field.end
      || left.horizontal || right.horizontal || !blankFieldParagraph(left.cell) || !blankFieldParagraph(right.cell)) return false;
    sharedRows += 1;
  }
  return sharedRows > 0;
}

function blankTableFields(doc) {
  const fields = [];
  for (const table of Array.from(doc.getElementsByTagNameNS(WORD, 'tbl'))) {
    const rows = Array.from(table.getElementsByTagNameNS(WORD, 'tr')).filter((row) => {
      let owner = row.parentNode;
      while (owner && !(owner.namespaceURI === WORD && owner.localName === 'tbl')) owner = owner.parentNode;
      return owner === table;
    }).map((row) => row.parentNode === table ? describeTableRow(row) : describeTableRow(row).map((entry) => ({
      ...entry, vertical: entry.vertical ? 'unsupported' : '',
    })));
    for (const [rowIndex, cells] of rows.entries()) {
      for (let index = 1; index < cells.length; index += 1) {
        const label = cells[index - 1];
        const field = cells[index];
        if (label.horizontal || field.horizontal || !hasAlignedContinuation(rows, rowIndex, label, field)) continue;
        if (directWordChildren(label.cell, 'p').length !== 1 || label.cell.getElementsByTagNameNS(WORD, 'tbl').length) continue;
        const name = normalizeLabel(Array.from(label.cell.getElementsByTagNameNS(WORD, 't'))
          .map((node) => node.textContent).join(''));
        if (!recognizedLabels.has(name)) continue;
        const paragraph = blankFieldParagraph(field.cell);
        if (paragraph) fields.push({ name, paragraph });
      }
    }
  }
  return fields;
}

function readFieldValue(values, name) {
  const value = values && Object.hasOwn(values, name) ? values[name] : '';
  if (typeof value !== 'string' || !value.trim()) return '';
  if (value.length > 5000 || /[\u0000-\u001f\ufffe\uffff]/.test(value)) {
    throw new Error('字段值须为不超过 5000 字符的单行文本');
  }
  return value;
}

function fillTemplate(buffer, values = {}) {
  const zip = new AdmZip(buffer);
  const fields = new Set();
  for (const { entry, doc, groups } of templateParagraphs(zip)) {
    let changed = false;
    const emptyCells = blankTableFields(doc);
    for (const nodes of groups) {
      const text = nodes.map((node) => node.textContent).join('');
      const matches = [...text.matchAll(/\{\{\s*([^{}\r\n]{1,80}?)\s*\}\}/g)]
        .filter((match) => !attachmentMarkerKey(match[1]));
      for (const match of matches) fields.add(match[1].trim());
      for (const match of matches.reverse()) {
        const key = match[1].trim();
        const value = readFieldValue(values, key);
        if (!value) continue;
        let offset = 0;
        const end = match.index + match[0].length;
        for (const node of nodes) {
          const current = node.textContent;
          const next = offset + current.length;
          if (offset < end && next > match.index) {
            node.textContent = current.slice(0, Math.max(0, match.index - offset))
              + (offset <= match.index ? value : '') + current.slice(Math.min(current.length, end - offset));
            node.setAttributeNS(XML, 'xml:space', 'preserve');
          }
          offset = next;
        }
        changed = true;
      }
    }
    for (const { name, paragraph } of emptyCells) {
      fields.add(name);
      const value = readFieldValue(values, name);
      if (!value) continue;
      for (const placeholder of Array.from(paragraph.getElementsByTagNameNS(WORD, 't'))) placeholder.textContent = '';
      const prefix = paragraph.prefix ? paragraph.prefix + ':' : '';
      const run = directWordChildren(paragraph, 'r')[0] || paragraph.appendChild(doc.createElementNS(WORD, prefix + 'r'));
      const text = run.appendChild(doc.createElementNS(WORD, prefix + 't'));
      text.setAttributeNS(XML, 'xml:space', 'preserve');
      text.textContent = value;
      changed = true;
    }
    if (changed) zip.updateFile(entry.entryName, Buffer.from(new XMLSerializer().serializeToString(doc), 'utf8'));
  }
  return { fields: [...fields].filter(Boolean), toBuffer: () => zip.toBuffer() };
}

function createBusinessTemplateService(dialog, getCredentialLibraryService, app, getTenderSource, getTenderParsedSource, buildWord) {
  function preparedPath(key) {
    const match = /^(technical-plan|existing-plan-expansion):([a-z0-9_-]{1,120})$/.exec(key);
    if (!match) throw new Error('商务部分项目标识无效');
    const [, workflow, id] = match;
    const userData = app.getPath('userData');
    const scope = id === 'default'
      ? (workflow === 'technical-plan' ? userData : path.join(userData, workflow))
      : path.join(userData, 'technical-plan-projects', workflow, id);
    return getPreparedBusinessWordPath({ getPath: () => scope });
  }

  async function readPrepared(key, read) {
    await sessionQueues.get(key)?.catch(() => {});
    try {
      const metadata = JSON.parse(await fs.readFile(preparedPath(key) + '.source.json', 'utf8'));
      if (!metadata || metadata.version !== sourceVersion(key)) return null;
      const buffer = await fs.readFile(preparedPath(key));
      if (metadata.hash !== createHash('sha256').update(buffer).digest('hex')) return null;
      return read === fs.readFile ? buffer : await read(preparedPath(key));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }
  async function savePrepared(prepareKey, document, expectedVersion) {
    const queued = (sessionQueues.get(prepareKey) || Promise.resolve()).catch(() => {}).then(async () => {
      const target = preparedPath(prepareKey);
      if (expectedVersion !== sourceVersion(prepareKey)) throw new Error('招标文件或标段已变化，请重新准备商务部分');
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = target + '.' + randomUUID() + '.tmp';
      const metadata = target + '.source.json';
      const temporaryMetadata = temporary + '.json';
      try {
        await fs.writeFile(temporary, document, { flag: 'wx' });
        await fs.writeFile(temporaryMetadata, JSON.stringify({ version: expectedVersion, hash: createHash('sha256').update(document).digest('hex') }), { encoding: 'utf8', flag: 'wx' });
        if (expectedVersion !== sourceVersion(prepareKey)) throw new Error('招标文件已变化，旧商务部分未保存');
        await fs.rename(temporary, target);
        await fs.rename(temporaryMetadata, metadata);
      } finally {
        await fs.rm(temporary, { force: true });
        await fs.rm(temporaryMetadata, { force: true });
      }
    });
    sessionQueues.set(prepareKey, queued);
    return queued;
  }
  const templates = new WeakMap();
  const tenderSources = new WeakMap();
  function installTemplate(sender, file, buffer, name) {
    const { fields } = fillTemplate(buffer);
    const profileBindings = Object.fromEntries(fields.flatMap((field) => {
      const key = profileFields.get(normalizeLabel(field));
      return key ? [[field, key]] : [];
    }));
    const attachmentSlots = describeAttachmentSlots(buffer);
    templates.set(sender, { file, buffer, name });
    return { name: neutralWordText(name), fields, profileBindings, attachmentSlots };
  }
  const sessionContexts = new WeakMap();
  const sessionQueues = new Map();
  function sessionPath(key) { return path.join(path.dirname(preparedPath(key)), 'business-session.zip'); }
  function sourceVersion(key) {
    preparedPath(key);
    const [workflowKind, projectId] = key.split(':');
    return createHash('sha256').update(getTenderParsedSource?.({ workflowKind, projectId })?.markdown || '', 'utf8').digest('hex');
  }
  async function atomicSession(key, buffer) {
    const target = sessionPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = target + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temp, buffer, { flag: 'wx' }); await fs.rename(temp, target); }
    finally { await fs.rm(temp, { force: true }); }
  }
  return {
    async resetSession(sender, key) {
      await sessionQueues.get(key)?.catch(() => {});
      await fs.rm(sessionPath(key), { force: true });
      await fs.rm(preparedPath(key), { force: true });
      await fs.rm(preparedPath(key) + '.source.json', { force: true });
      return this.loadSession(sender, key);
    },
    async loadSession(sender, key) {
      await sessionQueues.get(key)?.catch(() => {});
      const version = sourceVersion(key);
      sessionContexts.set(sender, { key, version });
      templates.delete(sender);
      tenderSources.delete(sender);
      let zip;
      try { zip = new AdmZip(await fs.readFile(sessionPath(key))); }
      catch (error) { if (error.code === 'ENOENT') return null; throw new Error('商务工作草稿读取失败，请检查项目文件'); }
      let data;
      try { data = JSON.parse(zip.readAsText('session.json', 'utf8')); if (!data || typeof data !== 'object') throw new Error(); }
      catch { throw new Error('商务工作草稿结构损坏，可重新读取或清除后重建'); }
      if (data.version !== version) return null;
      const template = zip.getEntry('template.docx')
        ? installTemplate(sender, data.template.file, zip.readFile('template.docx'), data.template.name) : null;
      let formSource = null;
      if (data.source) {
        const source = { ...data.source };
        if (zip.getEntry('source.docx')) source.buffer = zip.readFile('source.docx');
        tenderSources.set(sender, source);
        const candidates = source.markdown !== undefined ? listMarkdownBusinessForms(source.markdown) : listBusinessForms(source.buffer);
        formSource = { name: neutralWordText(source.name), sourceKind: source.markdown !== undefined ? 'reconstructed' : 'original-word',
          candidates: candidates.map(({ id, title, tableCount, preview }) => ({ id, title: neutralWordText(title), tableCount, preview: neutralWordText(preview) })) };
      }
      return { template, formSource, values: data.values, companyId: data.companyId, attachmentIds: data.attachmentIds, selectedForms: data.selectedForms, formDraft: data.formDraft };
    },
    saveSession(sender, key, payload) {
      const context = sessionContexts.get(sender);
      if (!context || context.key !== key || context.version !== sourceVersion(key)) throw new Error('项目或招标文件已变化，请重新进入生成设置');
      const template = templates.get(sender);
      const source = payload.formSourceActive ? tenderSources.get(sender) : null;
      const values = {};
      for (const field of template ? fillTemplate(template.buffer).fields : []) values[field] = readFieldValue(payload.values, field);
      const attachmentIds = {};
      for (const field of ['employeeIds', 'projectIds', 'certificateIds', 'imageIds']) {
        const ids = payload.attachmentIds?.[field] || [];
        if (!Array.isArray(ids) || ids.length > 5000 || ids.some((id) => typeof id !== 'string' || id.length > 200)) throw new Error('附件选择无效');
        attachmentIds[field] = [...new Set(ids)];
      }
      if (payload.formDraft != null && (typeof payload.formDraft !== 'string' || payload.formDraft.length > 300000)) throw new Error('整理稿过长');
      if (!Array.isArray(payload.selectedForms) || payload.selectedForms.some((id) => typeof id !== 'string')) throw new Error('表单章节选择无效');
      const zip = new AdmZip();
      if (template) zip.addFile('template.docx', template.buffer);
      if (source?.buffer) zip.addFile('source.docx', source.buffer);
      const data = { version: context.version, values, attachmentIds, companyId: String(payload.companyId || ''),
        selectedForms: payload.selectedForms, formDraft: payload.formDraft ?? null,
        template: template ? { file: template.file, name: template.name } : null,
        source: source ? { file: source.file, name: source.name, markdown: source.markdown } : null };
      zip.addFile('session.json', Buffer.from(JSON.stringify(data), 'utf8'));
      const buffer = zip.toBuffer();
      const queued = (sessionQueues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
        if (context.version !== sourceVersion(key)) throw new Error('招标文件已变化，旧商务草稿未保存');
        await atomicSession(key, buffer);
        await fs.rm(preparedPath(key), { force: true });
      });
      sessionQueues.set(key, queued);
      return queued.then(() => true);
    },
    getPrepared(key) {
      return readPrepared(key, fs.readFile);
    },
    async getPreparedStatus(key) {
      return Boolean(await readPrepared(key, fs.stat));
    },
    async saveDraftWord({ content, prepareKey }, buildWord) {
      const version = prepareKey ? sourceVersion(prepareKey) : null;
      const markdown = String(content || '').trim();
      if (!markdown || markdown.length > 300000) throw new Error('商务卷草稿为空或过长');
      const selection = prepareKey ? null : await dialog.showSaveDialog({
        title: '导出商务卷草稿',
        defaultPath: '商务卷草稿.docx',
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });
      if (!prepareKey && (selection.canceled || !selection.filePath)) return null;
      const document = neutralizeWordBuffer(await buildWord({
        documentScope: 'bid', exportMode: 'basic', project_name: '商务卷草稿',
        outline: [{ id: '', title: '商务卷', content: markdown }],
      }));
      if (prepareKey) {
        await savePrepared(prepareKey, document, version);
        return 'prepared';
      }
      await fs.writeFile(selection.filePath, document);
      return selection.filePath;
    },
    async select(sender) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'], filters: [{ name: 'Word 模板', extensions: ['docx'] }],
      });
      if (canceled || !filePaths[0]) return null;
      const file = filePaths[0];
      const buffer = await fs.readFile(file);
      return installTemplate(sender, file, buffer, path.basename(file));
    },
    async inspectTenderForms(sender, projectKey) {
      let projectFile;
      if (projectKey !== undefined) {
        const match = /^(technical-plan|existing-plan-expansion):([a-z0-9_-]{1,120})$/.exec(projectKey);
        if (!match) throw new Error('项目标识无效');
        projectFile = getTenderSource?.({ workflowKind: match[1], projectId: match[2] });
        if (!projectFile) {
          const source = getTenderParsedSource?.({ workflowKind: match[1], projectId: match[2] });
          if (!source?.markdown?.trim()) throw new Error('当前项目没有可提取的招标内容，请先导入招标文件');
          const candidates = listMarkdownBusinessForms(source.markdown);
          tenderSources.set(sender, { markdown: source.markdown, name: source.name || '项目招标文件' });
          return { name: neutralWordText(source.name || '项目招标文件'), sourceKind: 'reconstructed',
            candidates: candidates.map(({ id, title, tableCount, preview }) => ({ id, title: neutralWordText(title), tableCount, preview: neutralWordText(preview) })) };
        }
      }
      const { canceled, filePaths } = projectFile ? { canceled: false, filePaths: [projectFile] } : await dialog.showOpenDialog({
        title: '选择包含商务表单的招标文件', properties: ['openFile'],
        filters: [{ name: 'Word 招标文件', extensions: ['docx'] }],
      });
      if (canceled || !filePaths[0]) return null;
      const file = filePaths[0];
      const buffer = await fs.readFile(file);
      const candidates = listBusinessForms(buffer);
      const name = projectFile ? '当前项目招标文件.docx' : path.basename(file);
      tenderSources.set(sender, { file, buffer, name });
      return { name: neutralWordText(name), sourceKind: 'original-word', candidates: candidates.map(({ id, title, tableCount, preview }) => ({
        id, title: neutralWordText(title), tableCount, preview: neutralWordText(preview),
      })) };
    },
    readTenderFormDraft(sender, ids) {
      const source = tenderSources.get(sender);
      if (source?.markdown === undefined) throw new Error('当前来源不需要重建整理稿');
      return extractMarkdownBusinessForms(source.markdown, ids);
    },
    async useTenderForms(sender, ids, editedMarkdown) {
      const source = tenderSources.get(sender);
      if (!source) throw new Error('请先读取招标文件中的商务表单');
      let buffer;
      if (source.markdown !== undefined) {
        if (!buildWord) throw new Error('表单转换服务未初始化');
        let content = extractMarkdownBusinessForms(source.markdown, ids);
        if (editedMarkdown !== undefined) {
          if (typeof editedMarkdown !== 'string' || !editedMarkdown.trim() || editedMarkdown.length > 300000) throw new Error('整理稿须为非空文本，且不超过 30 万字符');
          content = editedMarkdown;
        }
        // Only turn explicit empty underline placeholders into editable fields.
        for (const label of [...recognizedLabels].sort((a, b) => b.length - a.length)) {
          const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(`(${escaped}[ \t]*[：:][ \t]*)[_＿]{3,}`, 'g'), `$1{{${label}}}`);
        }
        buffer = await buildWord({ documentScope: 'bid', exportMode: 'basic', project_name: '商务表单整理稿',
          outline: [{ id: 'business-forms', title: '商务表单', content }] });
      } else buffer = extractBusinessForms(source.buffer, ids);
      return installTemplate(sender, source.file, buffer, source.name.replace(/\.[^.]+$/, '') + (source.markdown !== undefined ? '-商务表单整理稿.docx' : '-商务原表.docx'));
    },
    async export(sender, values, attachments, prepareKey) {
      const version = prepareKey ? sourceVersion(prepareKey) : null;
      const template = templates.get(sender);
      if (!template) throw new Error('请先选择商务标模板');
      const filled = fillTemplate(template.buffer, values);
      const { canceled, filePath } = prepareKey ? {} : await dialog.showSaveDialog({
        defaultPath: neutralWordText(template.name).replace(/\.docx$/i, '') + '-商务标.docx',
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });
      if (!prepareKey && (canceled || !filePath)) return null;
      let outputBuffer = filled.toBuffer();
      if (attachments) {
        const selection = {};
        for (const key of ['employeeIds', 'projectIds', 'certificateIds', 'imageIds']) {
          const ids = attachments[key];
          if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new Error('附件选择无效');
          selection[key] = ids;
        }
        if (Object.values(selection).some((ids) => ids.length)) {
          const library = getCredentialLibraryService?.();
          if (!library || typeof attachments.companyId !== 'string' || !attachments.companyId) throw new Error('请重新选择资信库企业');
          const snapshot = library.load(attachments.companyId);
          const appendix = await buildAttachmentWord(snapshot, selection, (image) => library.readAttachmentImage(image));
          outputBuffer = appendAttachmentWord(outputBuffer, appendix);
        }
      }
      const document = neutralizeWordBuffer(outputBuffer);
      if (prepareKey) {
        await savePrepared(prepareKey, document, version);
        return 'prepared';
      }
      const [source, output] = await Promise.all([template.file ? fs.realpath(template.file).catch(() => path.resolve(template.file)) : null, fs.realpath(filePath).catch(() => path.resolve(filePath))]);
      if (source && source.toLowerCase() === output.toLowerCase()) throw new Error('请选择其他位置，避免覆盖原模板');
      await fs.writeFile(filePath, document);
      return filePath;
    },
  };
}

module.exports = { createBusinessTemplateService, fillTemplate };
