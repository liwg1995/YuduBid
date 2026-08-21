const assert = require('node:assert/strict');
const { createFeasibilityReportTaskService, assertReviewPreservesProtectedContent } = require('../electron/services/feasibilityReportTaskService.cjs');

const projectId = 'fr-verification';
let state = {
  projectId, projectName: '验证项目', step: 'analysis',
  projectInfo: { projectName: '验证项目', projectType: 'government', industry: '公共服务', constructionUnit: '验证单位', location: '测试地区', constructionContent: '建设验证设施', constructionPeriodYears: '2', operationPeriodYears: '20', totalInvestment: '10000万元', fundingSource: '财政资金' },
  sourceFiles: [], analysisMarkdown: '', outlineTemplate: 'government', targetWords: 30000,
  referenceDocumentIds: [], keyParametersMarkdown: '', outlineData: null, contentSections: {},
  contentGenerationOptions: { useAiImages: true, maxAiImages: 1, useMermaidImages: true, useTechnicalDiagrams: true },
};
const fields = { 'feasibility-analysis': 'analysisTask', 'feasibility-outline': 'outlineTask', 'feasibility-outline-adjustment': 'outlineAdjustmentTask', 'feasibility-parameters': 'parametersTask', 'feasibility-content': 'contentTask', 'feasibility-human-writing': 'humanWritingTask' };
const store = {
  loadState: () => structuredClone(state),
  readCombinedSourceMarkdown: () => '# 资料：项目建议书\n\n建设验证设施。',
  saveTask: ({ type, task }) => { state = { ...state, [fields[type]]: structuredClone(task) }; return structuredClone(state); },
  saveAnalysis: ({ markdown }) => { state.analysisMarkdown = markdown; state.outlineData = null; state.keyParametersMarkdown = ''; return structuredClone(state); },
  saveOutlineConfig: (payload) => { state.outlineTemplate = payload.outlineTemplate; state.targetWords = payload.targetWords; state.referenceDocumentIds = payload.referenceDocumentIds; state.outlineData = null; state.keyParametersMarkdown = ''; return structuredClone(state); },
  saveOutline: ({ outlineData }) => { state.outlineData = structuredClone(outlineData); state.keyParametersMarkdown = ''; return structuredClone(state); },
  saveKeyParameters: ({ markdown }) => { state.keyParametersMarkdown = markdown; return structuredClone(state); },
  saveContentSection: ({ nodeId, status, error }) => { state.contentSections[nodeId] = { nodeId, status, error, updatedAt: new Date().toISOString() }; return structuredClone(state); },
  saveGeneratedChapterContent: ({ nodeId, content }) => {
    const visit = (items) => items.map((item) => item.id === nodeId ? { ...item, content } : { ...item, children: item.children ? visit(item.children) : undefined });
    state.outlineData.outline = visit(state.outlineData.outline);
    state.contentSections[nodeId] = { nodeId, status: 'success', updatedAt: new Date().toISOString() };
    return structuredClone(state);
  },
  saveReviewedChapterContent: ({ nodeId, content }) => {
    const visit = (items) => items.map((item) => item.id === nodeId ? { ...item, content } : { ...item, children: item.children ? visit(item.children) : undefined });
    state.outlineData.outline = visit(state.outlineData.outline);
    return structuredClone(state);
  },
};
let outlineVersion = 0;
const aiService = {
  async collectJsonResponse(request) {
    const prompt = request.messages.at(-1).content;
    if (prompt.includes('summary（项目概况）')) return { summary: '验证项目概况', facts: ['建设内容已明确'], inferences: [], missing_information: ['运营参数待确认'], conflicts: [], policy_and_compliance: [], risks: ['建设进度风险'], recommendations: ['补充运营方案'] };
    if (prompt.includes('可用配图方式')) {
      const raw = {
        image: { needed: true, style: 'engineering_diagram', title: '项目场景', prompt: '验证项目场景' },
        mermaid: { needed: true, title: '项目流程', code: 'flowchart LR\nA[开始] --> B[完成]' },
        diagram: { needed: true, type: 'architecture', style: 'document', title: '项目架构', subtitle: '', nodes: [{ id: 'node1', label: '输入' }, { id: 'node2', label: '输出' }], arrows: [{ from: 'node1', to: 'node2', label: '处理' }] },
      };
      return request.normalizer ? request.normalizer(raw) : raw;
    }
    outlineVersion += 1;
    const raw = { project_name: '验证项目', project_overview: '验证目录', outline: [{ id: 'chapter-1', title: outlineVersion > 1 ? '调整后的总论' : '总论', description: '项目总体情况', children: [{ id: 'section-1', title: '项目概况', description: '' }, { id: 'section-2', title: '结论建议', description: '' }] }] };
    return request.normalizer ? request.normalizer(raw) : raw;
  },
  async chat(request) {
    const prompt = request.messages.at(-1).content;
    if (prompt.includes('待审校正文')) {
      const content = prompt.match(/待审校正文：\n([\s\S]*?)\n\n重点处理/)?.[1] || '';
      return content.replace('本节验证正文', '本节审校后正文');
    }
    return prompt.includes('本节路径') ? '本节验证正文，严格使用已确认的关键参数。' : '# 关键参数\n\n- 总投资：10000万元\n- 运营参数：待确认';
  },
  getImageModelAvailability: () => ({ available: true }),
  isSkillEnabled: () => true,
  async generateImage() { return { asset_url: 'yibiao-asset://generated-images/feasibility-test.png', title: '项目场景' }; },
};
const technicalDiagramService = { generateDiagram: () => ({ asset_url: 'yibiao-asset://generated-images/feasibility-diagram.svg', title: '项目架构' }) };
const service = createFeasibilityReportTaskService({ aiService, technicalDiagramService, knowledgeBaseService: { getOutlineReferences: () => [] }, feasibilityReportStore: store });

async function waitFor(field) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (state[field]?.status === 'success') return;
    if (state[field]?.status === 'error') throw new Error(state[field].error);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${field} 未按时结束`);
}

(async () => {
  assert.doesNotThrow(() => assertReviewPreservesProtectedContent('投资 100 万元。\n\n```mermaid\nflowchart LR\nA-->B\n```', '项目投资为 100 万元。\n\n```mermaid\nflowchart LR\nA-->B\n```'));
  assert.throws(() => assertReviewPreservesProtectedContent('投资 100 万元。', '投资 120 万元。'), /数字参数/);
  service.startAnalysis({ projectId }); await waitFor('analysisTask');
  assert.match(state.analysisMarkdown, /材料事实/);
  service.startOutline({ projectId, outlineTemplate: 'government', targetWords: 36000, referenceDocumentIds: [] }); await waitFor('outlineTask');
  assert.equal(state.outlineData.outline[0].children[0].title, '项目概况');
  service.startOutlineAdjustment({ projectId, instruction: '调整总论标题' }); await waitFor('outlineAdjustmentTask');
  assert.equal(state.outlineData.outline[0].title, '调整后的总论');
  service.startParameters({ projectId }); await waitFor('parametersTask');
  assert.match(state.keyParametersMarkdown, /待确认/);
  service.startContent({ projectId });
  service.pauseContent({ projectId });
  const pauseDeadline = Date.now() + 3000;
  while (state.contentTask?.status !== 'paused' && Date.now() < pauseDeadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(state.contentTask.status, 'paused');
  service.startContent({ projectId }); await waitFor('contentTask');
  assert.equal(state.contentSections['section-1'].status, 'success');
  assert.match(state.outlineData.outline[0].children[1].content, /验证正文/);
  assert.match(state.outlineData.outline[0].children.map((item) => item.content).join('\n'), /yibiao-illustration:ai/);
  assert.match(state.outlineData.outline[0].children[1].content, /yibiao-illustration:diagram/);
  assert.match(state.outlineData.outline[0].children[1].content, /yibiao-illustration:mermaid/);
  service.startHumanWriting({ projectId, sectionIds: ['section-1'] }); await waitFor('humanWritingTask');
  assert.match(state.outlineData.outline[0].children[0].content, /审校后正文/);
  state.analysisTask = { ...state.analysisTask, status: 'running' };
  const recovered = service.getActiveTasks({ projectId });
  assert.equal(recovered.state.analysisTask.status, 'error');
  assert.match(recovered.state.analysisTask.error, /上次任务未完成/);
  console.log('[feasibility-report] analysis, outline, adjustment, parameters, content pause/resume, natural review and recovery verified.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
