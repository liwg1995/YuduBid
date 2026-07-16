const path = require('node:path');

function getUserDataPath(app) {
  return app.getPath('userData');
}

function getConfigFilePath(app) {
  return path.join(getUserDataPath(app), 'user_config.json');
}

function getWorkspaceDir(app) {
  return path.join(getUserDataPath(app), 'workspace');
}

function getWorkspaceDatabasePath(app) {
  return path.join(getWorkspaceDir(app), 'yibiao.sqlite');
}

function getTechnicalPlanDir(app) {
  return path.join(getWorkspaceDir(app), 'technical-plan');
}

function getTechnicalPlanTenderMarkdownPath(app) {
  return path.join(getTechnicalPlanDir(app), 'tender.md');
}

function getTechnicalPlanOriginalPlanMarkdownPath(app) {
  return path.join(getTechnicalPlanDir(app), 'original-plan.md');
}

function getTechnicalPlanOriginalPlanSourceDir(app) {
  return path.join(getTechnicalPlanDir(app), 'original-source');
}

function getDuplicateCheckDir(app) {
  return path.join(getWorkspaceDir(app), 'duplicate-check');
}

function getDuplicateCheckContentDir(app) {
  return path.join(getDuplicateCheckDir(app), 'contents');
}

function getRejectionCheckDir(app) {
  return path.join(getWorkspaceDir(app), 'rejection-check');
}

function getRejectionCheckDocumentMarkdownPath(app, role) {
  const fileName = role === 'bid' ? 'bid.md' : 'tender.md';
  return path.join(getRejectionCheckDir(app), fileName);
}

function getGeneratedImagesDir(app) {
  return path.join(getWorkspaceDir(app), 'generated-images');
}

function getImportedImagesDir(app) {
  return path.join(getWorkspaceDir(app), 'imported-images');
}

function getKnowledgeBaseDir(app) {
  return path.join(getWorkspaceDir(app), 'knowledge-base');
}

function getSoftwareCopyrightDir(app) {
  return path.join(getWorkspaceDir(app), 'software-copyright');
}

function getPatentGenerationDir(app) {
  return path.join(getWorkspaceDir(app), 'patent-generation');
}

function getOfficialDocumentDir(app) {
  return path.join(getWorkspaceDir(app), 'official-document');
}

function getGrantApplicationDir(app) {
  return path.join(getWorkspaceDir(app), 'grant-application');
}

function getThesisTutorDir(app) {
  return path.join(getWorkspaceDir(app), 'thesis-tutor');
}

function getProjectManagementDir(app) {
  return path.join(getWorkspaceDir(app), 'project-management');
}

function getPresalesWorkbenchDir(app) {
  return path.join(getWorkspaceDir(app), 'presales-workbench');
}

function getCodeGenerationDir(app) {
  return path.join(getWorkspaceDir(app), 'code-generation');
}

function getAiLogsDir(app) {
  return path.join(getUserDataPath(app), 'logs', 'ai');
}

module.exports = {
  getAiLogsDir,
  getDuplicateCheckContentDir,
  getDuplicateCheckDir,
  getConfigFilePath,
  getGeneratedImagesDir,
  getGrantApplicationDir,
  getImportedImagesDir,
  getKnowledgeBaseDir,
  getCodeGenerationDir,
  getOfficialDocumentDir,
  getProjectManagementDir,
  getPresalesWorkbenchDir,
  getThesisTutorDir,
  getPatentGenerationDir,
  getSoftwareCopyrightDir,
  getRejectionCheckDir,
  getRejectionCheckDocumentMarkdownPath,
  getTechnicalPlanDir,
  getTechnicalPlanOriginalPlanMarkdownPath,
  getTechnicalPlanOriginalPlanSourceDir,
  getTechnicalPlanTenderMarkdownPath,
  getWorkspaceDir,
  getWorkspaceDatabasePath,
  getUserDataPath,
};
