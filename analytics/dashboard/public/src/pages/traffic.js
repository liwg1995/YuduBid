import { assertReady, getEncodedProjectAndDays, loadProjectOptions, requestJson, saveSettings } from '../api.js';
import { renderTable } from '../render.js';
import { state } from '../state.js';

const pageLabels = {
  home: '首页',
  'technical-plan': '技术方案',
  'technical-plan/document-analysis': '技术方案 - 上传招标文件',
  'technical-plan/bid-analysis': '技术方案 - 招标文件解析',
  'technical-plan/outline-generation': '技术方案 - 目录生成',
  'technical-plan/global-facts': '技术方案 - 全局事实设定',
  'technical-plan/content-edit': '技术方案 - 生成正文',
  'technical-plan/expand': '技术方案 - 扩写改写',
  'business-bid': '商务标',
  'official-document-drafting': '公文写作 - 智能起草',
  'official-document-check': '公文写作 - 格式检查',
  'official-document-polish': '公文写作 - 润色改写',
  'official-document-templates': '公文写作 - 模板库',
  'code-generation': '代码生成',
  'software-copyright': '软著生成',
  'patent-mining': '专利生成 - 专利挖掘',
  'patent-disclosure': '专利生成 - 交底书生成',
  'patent-prior-art': '专利生成 - 查新分析',
  'patent-iteration': '专利生成 - 修订迭代',
  'knowledge-base': '知识库',
  'knowledge-base/library': '知识库 - 文档列表',
  'knowledge-base/viewer/items': '知识库 - 知识条目',
  'knowledge-base/viewer/markdown': '知识库 - Markdown 原文',
  'knowledge-base/viewer/analysis': '知识库 - 分析调试',
  'duplicate-check': '标书查重',
  'duplicate-check/upload': '标书查重 - 选择标书',
  'duplicate-check/analysis/metadata': '标书查重 - 元数据结果',
  'duplicate-check/analysis/outline': '标书查重 - 目录结果',
  'duplicate-check/analysis/content': '标书查重 - 正文结果',
  'duplicate-check/analysis/image': '标书查重 - 图片结果',
  'rejection-check': '废标项检查',
  'rejection-check/documents/tender': '废标项检查 - 招标文件',
  'rejection-check/documents/bid': '废标项检查 - 投标文件',
  'rejection-check/items/analysis': '废标项检查 - 解析结果',
  'rejection-check/items/custom': '废标项检查 - 自定义检查项',
  'rejection-check/results/rejection': '废标项检查 - 废标项结果',
  'rejection-check/results/typo': '废标项检查 - 错别字结果',
  'rejection-check/results/logic': '废标项检查 - 逻辑谬误结果',
  'bid-opportunity': '投标机会',
  'developer-test': '测试页',
  settings: '设置',
};

function getPageLabel(page) {
  return pageLabels[page] || '未知页面';
}

export async function loadTraffic() {
  assertReady();
  await loadProjectOptions();
  saveSettings();

  const { projectName, days } = getEncodedProjectAndDays();
  const summary = await requestJson(`/api/summary?projectName=${projectName}&days=${days}`);
  const pages = (summary.pages || []).map((row) => ({
    ...row,
    pageLabel: getPageLabel(row.page),
  }));

  renderTable(state.pagesTable, pages, [
    { key: 'pageLabel', label: '功能名称' },
    { key: 'page', label: '路由', code: true },
    { key: 'count', label: '访问量' },
  ], '暂无页面访问数据');

  renderTable(state.versionsTable, summary.versions || [], [
    { key: 'version', label: '版本', code: true },
    { key: 'clients', label: '活跃客户端数' },
    { key: 'todayClients', label: '今日活跃客户端' },
    { key: 'count', label: '事件数' },
  ], '暂无版本数据');
}
