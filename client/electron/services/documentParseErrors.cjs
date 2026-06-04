const path = require('node:path');

const LIBREOFFICE_DOWNLOAD_URL = 'https://zh-tw.libreoffice.org/download/';
const LIBREOFFICE_REQUIRED_MESSAGE = `.doc和.wps识别，需要安装 LibreOffice、WPS Office 或 Microsoft Word 任意一种本地转换组件（LibreOffice 下载：${LIBREOFFICE_DOWNLOAD_URL}），或者手动将文件转换为.docx格式再上传`;

function isLegacyOfficeFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return ext === '.doc' || ext === '.wps';
}

function isLibreOfficeMissingError(error) {
  return error?.code === 'office_backend_missing';
}

function createLibreOfficeMissingError(error, filePath) {
  const next = new Error(LIBREOFFICE_REQUIRED_MESSAGE);
  next.name = error?.name || 'DocumentParseError';
  next.code = 'office_backend_missing';
  next.details = {
    ...(error?.details || {}),
    filePath,
    downloadUrl: LIBREOFFICE_DOWNLOAD_URL,
  };
  if (error?.stack) {
    next.stack = error.stack;
  }
  return next;
}

function normalizeDocumentParseError(error, filePath) {
  if (isLegacyOfficeFile(filePath) && isLibreOfficeMissingError(error)) {
    return createLibreOfficeMissingError(error, filePath);
  }
  return error;
}

function formatDocumentParseError(error, filePath) {
  const normalized = normalizeDocumentParseError(error, filePath);
  return normalized instanceof Error ? normalized.message : String(normalized || '未知错误');
}

module.exports = {
  LIBREOFFICE_DOWNLOAD_URL,
  LIBREOFFICE_REQUIRED_MESSAGE,
  formatDocumentParseError,
  isLegacyOfficeFile,
  isLibreOfficeMissingError,
  normalizeDocumentParseError,
};
