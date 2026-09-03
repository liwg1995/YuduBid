'use strict';

const CAPABILITY_ID = 'bid.feasibility-report.summary.read';
const SAFE_STATUSES = new Set(['idle', 'pending', 'running', 'paused', 'success', 'error']);

function safeStatus(value) {
  const status = String(value || 'idle');
  return SAFE_STATUSES.has(status) ? status : 'idle';
}

function safeProgress(value) {
  const progress = Number(value || 0);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
}

function summarizeTask(task) {
  return { status: safeStatus(task?.status), progress: safeProgress(task?.progress) };
}

function countOutline(items) {
  let totalSections = 0;
  let leafSections = 0;
  let completedSections = 0;
  for (const item of Array.isArray(items) ? items : []) {
    totalSections += 1;
    const children = Array.isArray(item?.children) ? item.children : [];
    if (children.length) {
      const childCounts = countOutline(children);
      totalSections += childCounts.totalSections;
      leafSections += childCounts.leafSections;
      completedSections += childCounts.completedSections;
    } else {
      leafSections += 1;
      if (String(item?.content || '').trim()) completedSections += 1;
    }
  }
  return { totalSections, leafSections, completedSections };
}

function createSummary(state) {
  const outline = countOutline(state?.outlineData?.outline);
  return {
    module: 'feasibility-report',
    projectName: String(state?.projectName || '未命名可研项目').replace(/\s+/g, ' ').trim().slice(0, 160),
    step: String(state?.step || 'materials').slice(0, 40),
    sources: { count: Array.isArray(state?.sourceFiles) ? state.sourceFiles.length : 0 },
    analysis: {
      ready: Boolean(String(state?.analysisMarkdown || '').trim()),
      task: summarizeTask(state?.analysisTask),
    },
    outline: {
      ready: outline.totalSections > 0,
      totalSections: outline.totalSections,
      leafSections: outline.leafSections,
      task: summarizeTask(state?.outlineTask),
    },
    parameters: {
      ready: Boolean(String(state?.keyParametersMarkdown || '').trim()),
      task: summarizeTask(state?.parametersTask),
    },
    content: {
      completedSections: outline.completedSections,
      totalSections: outline.leafSections,
      task: summarizeTask(state?.contentTask),
    },
  };
}

function registerFeasibilityReportCapabilities(capabilityRegistry, feasibilityReportStore) {
  capabilityRegistry.register({
    id: CAPABILITY_ID,
    name: '可研报告工作区摘要',
    version: '1.0',
    permission: CAPABILITY_ID,
  }, () => createSummary(feasibilityReportStore.loadState({})));
}

module.exports = { CAPABILITY_ID, createSummary, registerFeasibilityReportCapabilities };
