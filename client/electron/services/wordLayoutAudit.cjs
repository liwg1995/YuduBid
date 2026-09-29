const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const MAX_PAGES = 300;
const MAX_ISSUES = 24;

function officeCandidates() {
  return [
    process.env.LIBREOFFICE_PATH,
    process.platform === 'darwin' && '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    process.platform === 'darwin' && path.join(os.homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
    process.platform === 'win32' && 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    process.platform === 'win32' && 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice',
    'libreoffice',
  ].filter(Boolean);
}

function runOffice(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let output = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(output);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('LibreOffice 渲染超时，请检查文档大小或稍后重试'));
    }, timeoutMs);
    child.on('error', finish);
    child.stdout.on('data', (chunk) => { output += String(chunk).slice(0, 2000); });
    child.stderr.on('data', (chunk) => { output += String(chunk).slice(0, 2000); });
    child.on('close', (code) => finish(code === 0 ? null : new Error(`LibreOffice 转换失败（${code}）：${output.slice(-300)}`)));
  });
}

async function renderDocxToPdf(filePath, directory) {
  const outputPath = path.join(directory, `${path.basename(filePath, path.extname(filePath))}.pdf`);
  const profilePath = path.join(directory, 'office-profile');
  const args = ['--headless', '--nologo', '--nodefault', '--nofirststartwizard', `-env:UserInstallation=${pathToFileURL(profilePath).href}`, '--convert-to', 'pdf:writer_pdf_Export', '--outdir', directory, filePath];
  let unavailable = true;
  let lastError;
  for (const command of officeCandidates()) {
    try {
      await runOffice(command, args);
      unavailable = false;
      await fs.access(outputPath);
      return outputPath;
    } catch (error) {
      lastError = unavailable ? error : new Error(`LibreOffice 未能生成分页 PDF：${error.message || String(error)}`);
      if (error.code !== 'ENOENT') unavailable = false;
    }
  }
  if (unavailable) throw new Error('未找到 LibreOffice，无法进行实际分页自检。请安装 LibreOffice 后重试。');
  throw lastError || new Error('LibreOffice 未生成分页 PDF');
}

function inspectPage(pageNumber, pageCount, page, textContent, operatorList, OPS) {
  const [, , width, height] = page.view;
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject, OPS.paintImageMaskXObject]);
  const hasImage = operatorList.fnArray.some((operator) => imageOps.has(operator));
  const textItems = textContent.items.filter((item) => typeof item.str === 'string' && item.str.trim());
  const bodyItems = textItems.filter((item) => item.transform[5] > height * 0.1 && item.transform[5] < height * 0.91);
  const bodyChars = bodyItems.reduce((total, item) => total + item.str.trim().length, 0);
  const issues = [];
  if (bodyItems.length === 0 && !hasImage) {
    issues.push({ page: pageNumber, severity: 'warning', code: 'blank-page', message: '正文区域没有可读取的文字或位图，可能是空白页或仅含矢量图。' });
  } else if (pageNumber > 2 && pageNumber < pageCount && bodyChars > 0 && bodyChars < 90 && !hasImage) {
    issues.push({ page: pageNumber, severity: 'review', code: 'sparse-page', message: `正文仅约 ${bodyChars} 字，请核对是否为章节换页造成的大块留白。` });
  }
  if (pageNumber > 2 && pageNumber < pageCount && bodyChars >= 90 && !hasImage) {
    const bottom = Math.min(...bodyItems.map((item) => item.transform[5]));
    if (bottom > height * 0.53) issues.push({ page: pageNumber, severity: 'review', code: 'bottom-space', message: '正文止于页面上半部，请核对是否存在不必要的分页。' });
  }
  const escaped = textItems.some((item) => {
    const [a, b, c, d, x, y] = item.transform;
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) return false;
    return x < -3 || y < -3 || x + Math.abs(item.width || a) > width + 3 || y + Math.abs(item.height || d) > height + 3;
  });
  if (escaped) issues.push({ page: pageNumber, severity: 'warning', code: 'text-overflow', message: '检测到文字边界超出纸张范围，请核对页面边缘。' });
  return issues;
}

async function checkWordLayout(filePath) {
  const target = String(filePath || '').trim();
  if (!path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.docx') throw new Error('请选择有效的 DOCX 导出文件');
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error('DOCX 文件不存在');
  if (stat.size > 100 * 1024 * 1024) throw new Error('DOCX 超过 100 MB，请先缩小文档后再进行版式自检');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yibiao-word-layout-'));
  try {
    const pdfPath = await renderDocxToPdf(target, directory);
    const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({ data: new Uint8Array(await fs.readFile(pdfPath)), useSystemFonts: true });
    const pdf = await loadingTask.promise;
    try {
      const issues = [];
      const checkedPages = Math.min(pdf.numPages, MAX_PAGES);
      let issueLimitReached = false;
      for (let pageNumber = 1; pageNumber <= checkedPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const [textContent, operatorList] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
        for (const issue of inspectPage(pageNumber, pdf.numPages, page, textContent, operatorList, OPS)) {
          if (issues.length < MAX_ISSUES) issues.push(issue);
          else issueLimitReached = true;
        }
        page.cleanup();
      }
      return { renderer: 'LibreOffice', pageCount: pdf.numPages, checkedPages, issues, truncated: pdf.numPages > MAX_PAGES || issueLimitReached };
    } finally {
      await loadingTask.destroy();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { checkWordLayout, inspectPage };
