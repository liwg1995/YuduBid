const crypto = require('node:crypto');
const { analysisMessages, outlineMessages, adjustmentMessages, parametersMessages, contentMessages, illustrationPlanMessages, humanWritingMessages } = require('./feasibilityReportPrompts.cjs');

const TASK_FIELDS = {
  'feasibility-analysis': 'analysisTask',
  'feasibility-outline': 'outlineTask',
  'feasibility-outline-adjustment': 'outlineAdjustmentTask',
  'feasibility-parameters': 'parametersTask',
  'feasibility-content': 'contentTask',
  'feasibility-human-writing': 'humanWritingTask',
};
const ACTIVE_STATUSES = new Set(['running', 'pausing', 'stopping']);

function timestamp() { return new Date().toISOString(); }
function taskKey(projectId, type) { return `${projectId}:${type}`; }
function normalizeMarkdown(value) { return String(value || '').replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim(); }

function normalizeGeneratedContentHeadings(value) {
  const lines = normalizeMarkdown(value).replace(/\r\n?/g, '\n').split('\n');
  let fenceMarker = '';

  return lines.map((line) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      if (!fenceMarker) fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = '';
      return line;
    }
    if (fenceMarker) return line;

    return line.replace(
      /^(\s{0,3}#{1,6}[ \t]+)((?:\*{1,2}|_{1,2})?[ \t]*)(?:[（(][ \t]*[一二三四五六七八九十百千万]+[ \t]*[）)]|[一二三四五六七八九十百千万]+[、.．])[ \t]*/,
      '$1$2',
    );
  }).join('\n').trim();
}

function singleLine(value, maxLength = 100) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength); }
function normalizeMermaidCode(value) { return String(value || '').replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```$/i, '').trim(); }
function normalizeIllustrationPlan(value) {
  const source = value && typeof value === 'object' ? value : {};
  const image = source.image && typeof source.image === 'object' ? source.image : {};
  const mermaid = source.mermaid && typeof source.mermaid === 'object' ? source.mermaid : {};
  const diagram = source.diagram && typeof source.diagram === 'object' ? source.diagram : {};
  const nodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
  const arrows = Array.isArray(diagram.arrows) ? diagram.arrows : [];
  return {
    image: {
      needed: Boolean(image.needed && image.prompt),
      style: image.style === 'realistic_photo' ? 'realistic_photo' : 'engineering_diagram',
      title: singleLine(image.title || '项目配图'),
      prompt: String(image.prompt || '').trim(),
    },
    mermaid: {
      needed: Boolean(mermaid.needed && mermaid.code),
      title: singleLine(mermaid.title || '项目流程'),
      code: normalizeMermaidCode(mermaid.code),
    },
    diagram: {
      needed: Boolean(diagram.needed && nodes.length >= 2),
      type: singleLine(diagram.type || 'architecture', 32),
      style: singleLine(diagram.style || 'document', 24),
      title: singleLine(diagram.title || '项目技术图谱'),
      subtitle: singleLine(diagram.subtitle, 120),
      nodes,
      arrows,
    },
  };
}

function appendAiImage(content, plan, generated) {
  if (!generated?.asset_url) return content;
  const title = singleLine(plan.title || generated.title || '项目配图');
  const caption = title.endsWith('图') || title.endsWith('示意图') ? title : `${title}示意图`;
  return `${String(content || '').trimEnd()}\n\n<!-- yibiao-illustration:ai -->\n![${caption}](${generated.asset_url})\n\n*图：${caption}*`;
}

function appendMermaid(content, plan) {
  if (!plan?.code) return content;
  const title = singleLine(plan.title || '项目流程');
  const caption = title.endsWith('图') ? title : `${title}图`;
  return `${String(content || '').trimEnd()}\n\n<!-- yibiao-illustration:mermaid -->\n\`\`\`mermaid\n${normalizeMermaidCode(plan.code)}\n\`\`\`\n\n*图：${caption}*`;
}

function appendTechnicalDiagram(content, plan, generated) {
  if (!generated?.asset_url) return content;
  const title = singleLine(plan.title || generated.title || '项目技术图谱');
  const caption = title.endsWith('图') || title.endsWith('图谱') ? title : `${title}图`;
  return `${String(content || '').trimEnd()}\n\n<!-- yibiao-illustration:diagram -->\n![${caption}](${generated.asset_url})\n\n*图：${caption}*`;
}

async function runWithEstimatedProgress(operation, { update, from, to, intervalMs = 900 }) {
  let progress = from;
  const timer = setInterval(() => {
    if (progress >= to) return;
    progress = Math.min(to, progress + Math.max(1, Math.ceil((to - progress) * 0.14)));
    update(progress, null);
  }, intervalMs);
  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}

function assertReviewPreservesProtectedContent(before, after) {
  const source = String(before || '');
  const result = String(after || '');
  const collect = (value, pattern, mapper = (match) => match[0]) => [...value.matchAll(pattern)].map(mapper);
  const mermaidBefore = collect(source, /```mermaid[\s\S]*?```/gi);
  const mermaidAfter = collect(result, /```mermaid[\s\S]*?```/gi);
  if (JSON.stringify(mermaidBefore) !== JSON.stringify(mermaidAfter)) throw new Error('审校结果改变了 Mermaid 图，已保留原正文');
  const imagesBefore = collect(source, /!\[[^\]]*]\(([^)]+)\)/g, (match) => match[1]);
  const imagesAfter = collect(result, /!\[[^\]]*]\(([^)]+)\)/g, (match) => match[1]);
  if (JSON.stringify(imagesBefore) !== JSON.stringify(imagesAfter)) throw new Error('审校结果改变了图片引用，已保留原正文');
  const numbers = (value) => (value.match(/\d+(?:[.,]\d+)*(?:%|％)?/g) || []).sort();
  if (JSON.stringify(numbers(source)) !== JSON.stringify(numbers(result))) throw new Error('审校结果改变了数字参数，已保留原正文');
  const tableLines = (value) => value.split(/\r?\n/).filter((line) => /^\s*\|.*\|\s*$/.test(line));
  if (JSON.stringify(tableLines(source)) !== JSON.stringify(tableLines(result))) throw new Error('审校结果改变了 Markdown 表格，已保留原正文');
}

function analysisToMarkdown(value) {
  const data = value && typeof value === 'object' ? value : {};
  const section = (title, items) => {
    const values = (Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean);
    return `## ${title}\n\n${values.length ? values.map((item) => `- ${item}`).join('\n') : '- 暂无'}`;
  };
  return [`# 项目资料分析底稿`, `\n${String(data.summary || '暂无项目概况')}`, section('材料事实', data.facts), section('合理推导', data.inferences), section('待确认与缺失信息', data.missing_information), section('资料冲突', data.conflicts), section('政策与合规关注', data.policy_and_compliance), section('主要风险', data.risks), section('编制建议', data.recommendations)].join('\n\n');
}

function normalizeOutline(value) {
  const seen = new Set();
  let sequence = 0;
  const visit = (items, level = 1) => (Array.isArray(items) ? items : []).map((item) => {
    let id = String(item?.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!id || seen.has(id)) id = `fr-node-${++sequence}`;
    seen.add(id);
    const node = {
      id,
      title: String(item?.title || '').trim(),
      description: String(item?.description || '').trim(),
      knowledge_item_ids: [...new Set((Array.isArray(item?.knowledge_item_ids) ? item.knowledge_item_ids : []).map(String).filter(Boolean))],
    };
    if (!node.title) throw new Error('模型返回的目录包含空标题');
    const children = level < 3 ? visit(item?.children, level + 1) : [];
    if (children.length) node.children = children;
    return node;
  });
  const outline = visit(value?.outline);
  if (!outline.length) throw new Error('模型未返回有效目录');
  return { project_name: String(value?.project_name || ''), project_overview: String(value?.project_overview || ''), outline };
}

function createFeasibilityReportTaskService({ aiService, technicalDiagramService, knowledgeBaseService, feasibilityReportStore }) {
  const activeTasks = new Map();
  const activeControls = new Map();
  const subscribers = new Set();

  function emit(task, state) {
    for (const webContents of subscribers) {
      if (webContents.isDestroyed?.()) { subscribers.delete(webContents); continue; }
      webContents.send('feasibility-report:task-event', { task, feasibilityReport: state });
    }
  }

  function references(documentIds) {
    if (!documentIds?.length || !knowledgeBaseService?.getOutlineReferences) return [];
    return knowledgeBaseService.getOutlineReferences(documentIds) || [];
  }

  function start(type, payload, runner, prepare) {
    const projectId = String(payload?.projectId || payload?.project_id || '').trim();
    if (!projectId) throw new Error('可研项目 ID 不能为空');
    const existing = activeTasks.get(taskKey(projectId, type));
    if (existing) return existing;
    if ([...activeTasks.values()].some((task) => ACTIVE_STATUSES.has(task.status))) throw new Error('当前已有可研后台任务运行，请等待完成后再试');
    const startedAt = timestamp();
    const task = { task_id: crypto.randomUUID(), project_id: projectId, type, status: 'running', progress: 1, logs: ['任务已创建，正在准备上下文。'], started_at: startedAt, updated_at: startedAt };
    activeTasks.set(taskKey(projectId, type), task);
    let state;
    try {
      if (prepare) prepare(task);
      state = feasibilityReportStore.saveTask({ projectId, type, task });
    } catch (error) {
      activeTasks.delete(taskKey(projectId, type));
      throw error;
    }
    emit(task, state);

    const update = (progress, message, patch = {}) => {
      Object.assign(task, patch, { progress, updated_at: timestamp() });
      if (message) task.logs = [...task.logs, message];
      state = feasibilityReportStore.saveTask({ projectId, type, task });
      emit({ ...task }, state);
    };
    const control = { pauseRequested: false, update };
    activeControls.set(taskKey(projectId, type), control);
    void Promise.resolve().then(() => runner({ task, update, projectId, isPauseRequested: () => control.pauseRequested })).then((result) => {
      if (result?.status === 'paused') update(task.progress, result.message || '任务已暂停。', { status: 'paused', pause_requested: false, error: undefined, stats: result.stats });
      else if (result?.status === 'error') update(task.progress, result.message || '任务未全部完成。', { status: 'error', pause_requested: false, error: result.error || result.message, stats: result.stats });
      else update(100, result?.message || '任务完成。', { status: 'success', pause_requested: false, error: undefined, stats: result?.stats });
    }).catch((error) => {
      update(task.progress, `任务失败：${error.message || String(error)}`, { status: 'error', error: error.message || String(error) });
    }).finally(() => {
      activeTasks.delete(taskKey(projectId, type));
      activeControls.delete(taskKey(projectId, type));
    });
    return task;
  }

  async function collectJson(request) {
    return aiService.collectJsonResponse ? aiService.collectJsonResponse(request) : aiService.requestJson(request);
  }

  function collectLeafSections(items, parents = []) {
    return (Array.isArray(items) ? items : []).flatMap((item) => {
      const path = [...parents, String(item.title || '未命名章节')];
      return item.children?.length ? collectLeafSections(item.children, path) : [{ item, path }];
    });
  }

  function resolveContentTargets(state, payload = {}) {
    const allLeaves = collectLeafSections(state.outlineData?.outline);
    const requestedIds = new Set((Array.isArray(payload.sectionIds) ? payload.sectionIds : []).map(String));
    const regenerateAll = Boolean(payload.regenerateAll);
    const targets = allLeaves.filter(({ item }) => requestedIds.size
      ? requestedIds.has(item.id)
      : regenerateAll || !String(item.content || '').trim() || state.contentSections[item.id]?.status === 'error');
    return { allLeaves, targets };
  }

  function loadKnowledgeItems(referenceIds) {
    const groups = new Map();
    for (const referenceId of Array.isArray(referenceIds) ? referenceIds : []) {
      const [documentId, itemId] = String(referenceId).split('::');
      if (!documentId || !itemId) continue;
      if (!groups.has(documentId)) groups.set(documentId, new Set());
      groups.get(documentId).add(itemId);
    }
    const result = [];
    for (const [documentId, itemIds] of groups) {
      const items = knowledgeBaseService?.readItems ? knowledgeBaseService.readItems(documentId) : [];
      for (const item of items || []) if (itemIds.has(String(item.id))) result.push({ id: `${documentId}::${item.id}`, title: item.title, resume: item.resume, content: item.content });
    }
    return result;
  }

  return {
    subscribe(webContents) {
      subscribers.add(webContents);
      webContents.once?.('destroyed', () => subscribers.delete(webContents));
    },

    getActiveTasks(payload = {}) {
      const projectId = String(payload.projectId || payload.project_id || '').trim();
      let state = feasibilityReportStore.loadState({ projectId });
      for (const [type, field] of Object.entries(TASK_FIELDS)) {
        const persisted = state[field];
        if (persisted && ACTIVE_STATUSES.has(persisted.status) && !activeTasks.has(taskKey(projectId, type))) {
          if (type === 'feasibility-content') state = feasibilityReportStore.recoverInterruptedContentSections({ projectId });
          const recovered = { ...persisted, project_id: projectId, status: 'error', error: '上次任务未完成，请重新执行', logs: [...(persisted.logs || []), '检测到客户端已重启，上次任务未完成，请重新执行。'], updated_at: timestamp() };
          state = feasibilityReportStore.saveTask({ projectId, type, task: recovered });
        }
      }
      [...activeTasks.values()].filter((task) => task.project_id === projectId).forEach((task) => emit(task, state));
      return { tasks: [...activeTasks.values()].filter((task) => task.project_id === projectId), state };
    },

    startAnalysis(payload = {}) {
      return start('feasibility-analysis', payload, async ({ update, projectId }) => {
        const state = feasibilityReportStore.loadState({ projectId });
        if (!state.projectInfo.projectName.trim()) throw new Error('请先完善项目基本信息');
        update(8, '正在读取项目资料。');
        const sourceMarkdown = feasibilityReportStore.readCombinedSourceMarkdown({ projectId });
        update(18, '正在分析项目事实、缺失信息与风险。');
        const result = await runWithEstimatedProgress(
          () => collectJson({ messages: analysisMessages({ projectInfo: state.projectInfo, sourceMarkdown }), temperature: 0.2, failureMessage: '项目分析结果格式无效' }),
          { update, from: 18, to: 82 },
        );
        update(85, '分析完成，正在保存底稿。');
        feasibilityReportStore.saveAnalysis({ projectId, markdown: analysisToMarkdown(result) });
      });
    },

    startOutline(payload = {}) {
      return start('feasibility-outline', payload, async ({ update, projectId }) => {
        const state = feasibilityReportStore.loadState({ projectId });
        if (!state.analysisMarkdown.trim()) throw new Error('请先完成项目分析');
        update(10, '正在整理模板和知识库参考。');
        const refs = references(state.referenceDocumentIds);
        update(22, '正在生成最多三级的报告目录。');
        const result = await runWithEstimatedProgress(
          () => collectJson({ messages: outlineMessages({ ...state, references: refs }), temperature: 0.5, normalizer: normalizeOutline, failureMessage: '目录结果格式无效' }),
          { update, from: 22, to: 82 },
        );
        update(85, '目录生成完成，正在保存。');
        feasibilityReportStore.saveOutline({ projectId, outlineData: normalizeOutline(result) });
      }, () => feasibilityReportStore.saveOutlineConfig({ projectId: payload.projectId, outlineTemplate: payload.outlineTemplate, targetWords: payload.targetWords, referenceDocumentIds: payload.referenceDocumentIds || [] }));
    },

    startOutlineAdjustment(payload = {}) {
      return start('feasibility-outline-adjustment', payload, async ({ update, projectId }) => {
        const state = feasibilityReportStore.loadState({ projectId });
        if (!state.outlineData) throw new Error('请先生成报告目录');
        const instruction = String(payload.instruction || '').trim();
        if (!instruction) throw new Error('请输入目录调整要求');
        update(18, '正在按要求调整目录。');
        const result = await runWithEstimatedProgress(
          () => collectJson({ messages: adjustmentMessages({ outlineData: state.outlineData, instruction }), temperature: 0.4, normalizer: normalizeOutline, failureMessage: '调整后的目录格式无效' }),
          { update, from: 18, to: 82 },
        );
        update(85, '调整完成，正在保存新目录。');
        feasibilityReportStore.saveOutline({ projectId, outlineData: normalizeOutline(result) });
      });
    },

    startParameters(payload = {}) {
      return start('feasibility-parameters', payload, async ({ update, projectId }) => {
        const state = feasibilityReportStore.loadState({ projectId });
        if (!state.analysisMarkdown.trim() || !state.outlineData) throw new Error('请先完成项目分析和报告目录');
        update(12, '正在汇总项目口径与知识库参考。');
        const refs = references(state.referenceDocumentIds);
        update(24, '正在生成全文关键参数。');
        const markdown = await runWithEstimatedProgress(
          () => aiService.chat({ messages: parametersMessages({ ...state, references: refs }), temperature: 0.2 }),
          { update, from: 24, to: 82 },
        );
        if (!normalizeMarkdown(markdown)) throw new Error('模型未返回有效关键参数');
        update(85, '关键参数生成完成，正在保存。');
        feasibilityReportStore.saveKeyParameters({ projectId, markdown: normalizeMarkdown(markdown) });
      });
    },

    startContent(payload = {}) {
      return start('feasibility-content', payload, async ({ update, projectId, isPauseRequested }) => {
        const initial = feasibilityReportStore.loadState({ projectId });
        if (!initial.outlineData || !initial.keyParametersMarkdown.trim()) throw new Error('请先完成报告目录和关键参数');
        const { allLeaves, targets } = resolveContentTargets(initial, payload);
        if (!targets.length) throw new Error('没有需要生成或补写的正文小节');
        const wordsPerSection = Math.max(500, Math.round(initial.targetWords / Math.max(1, allLeaves.length)));
        const requestedOptions = payload.contentGenerationOptions && typeof payload.contentGenerationOptions === 'object' ? payload.contentGenerationOptions : initial.contentGenerationOptions || {};
        const imageAvailability = aiService.getImageModelAvailability?.() || { available: false };
        const useAiImages = Boolean(requestedOptions.useAiImages && imageAvailability.available);
        const useMermaidImages = Boolean(requestedOptions.useMermaidImages);
        const useTechnicalDiagrams = Boolean(requestedOptions.useTechnicalDiagrams && technicalDiagramService?.generateDiagram && aiService.isSkillEnabled?.('technical-diagram'));
        const requestedMaxAiImages = Number(requestedOptions.maxAiImages);
        const maxAiImages = useAiImages ? Math.max(0, Math.min(Number.isFinite(requestedMaxAiImages) ? Math.round(requestedMaxAiImages) : 6, targets.length)) : 0;
        const maxMermaidImages = useMermaidImages ? Math.min(6, targets.length) : 0;
        const maxTechnicalDiagrams = useTechnicalDiagrams ? Math.min(6, targets.length) : 0;
        const imageStats = {
          ai: { planned: 0, attempted: 0, success: 0, failed: 0, skipped: 0 },
          mermaid: { planned: 0, attempted: 0, success: 0, failed: 0, skipped: 0 },
          diagram: { planned: 0, attempted: 0, success: 0, failed: 0, skipped: 0 },
        };
        let completed = 0;
        let failed = 0;
        update(3, `已确定 ${targets.length} 个待生成小节。配图方式：${[useAiImages ? 'AI 生图' : '', useTechnicalDiagrams ? '技术图谱' : '', useMermaidImages ? 'Mermaid' : ''].filter(Boolean).join('、') || '不配图'}。`, { stats: { total: targets.length, completed, failed, images: imageStats } });
        for (const { item, path } of targets) {
          if (isPauseRequested()) return { status: 'paused', message: `任务已暂停，已完成 ${completed} 个小节。`, stats: { total: targets.length, completed, failed } };
          feasibilityReportStore.saveContentSection({ projectId, nodeId: item.id, status: 'running' });
          update(Math.max(5, Math.round(((completed + failed) / targets.length) * 95)), `正在生成“${path.join(' / ')}”。`, { stats: { total: targets.length, completed, failed, currentNodeId: item.id } });
          try {
            let markdown = normalizeGeneratedContentHeadings(await aiService.chat({
              messages: contentMessages({ projectInfo: initial.projectInfo, analysisMarkdown: initial.analysisMarkdown, keyParametersMarkdown: initial.keyParametersMarkdown, sectionPath: path, section: item, targetWords: wordsPerSection, knowledge: loadKnowledgeItems(item.knowledge_item_ids) }),
              temperature: 0.45,
            }));
            if (!markdown) throw new Error('模型未返回有效正文');
            if (useAiImages || useMermaidImages || useTechnicalDiagrams) {
              update(Math.max(8, Math.round(((completed + failed + 0.65) / targets.length) * 95)), `正在为“${item.title}”编排配图。`, { stats: { total: targets.length, completed, failed, currentNodeId: item.id, phase: 'illustrating', images: imageStats } });
              try {
                const plan = await aiService.collectJsonResponse({
                  messages: illustrationPlanMessages({ projectInfo: initial.projectInfo, sectionPath: path, section: item, content: markdown, useAiImages: useAiImages && imageStats.ai.planned < maxAiImages, useMermaidImages: useMermaidImages && imageStats.mermaid.planned < maxMermaidImages, useTechnicalDiagrams: useTechnicalDiagrams && imageStats.diagram.planned < maxTechnicalDiagrams }),
                  temperature: 0.2,
                  failureMessage: '模型返回的配图编排无效',
                  normalizer: normalizeIllustrationPlan,
                  max_retries: 1,
                });
                if (plan.image.needed && imageStats.ai.planned < maxAiImages) {
                  imageStats.ai.planned += 1;
                  imageStats.ai.attempted += 1;
                  try {
                    const generated = await aiService.generateImage({ title: plan.image.title, logTitle: `可研配图-${item.id}-${plan.image.title}`, prompt: plan.image.prompt, style: plan.image.style });
                    markdown = appendAiImage(markdown, plan.image, generated);
                    imageStats.ai.success += 1;
                  } catch { imageStats.ai.failed += 1; }
                }
                if (plan.diagram.needed && imageStats.diagram.planned < maxTechnicalDiagrams) {
                  imageStats.diagram.planned += 1;
                  imageStats.diagram.attempted += 1;
                  try {
                    markdown = appendTechnicalDiagram(markdown, plan.diagram, technicalDiagramService.generateDiagram(plan.diagram));
                    imageStats.diagram.success += 1;
                  } catch { imageStats.diagram.failed += 1; }
                }
                if (plan.mermaid.needed && imageStats.mermaid.planned < maxMermaidImages) {
                  imageStats.mermaid.planned += 1;
                  imageStats.mermaid.attempted += 1;
                  markdown = appendMermaid(markdown, plan.mermaid);
                  imageStats.mermaid.success += 1;
                }
              } catch (illustrationError) {
                update(Math.max(8, Math.round(((completed + failed + 0.8) / targets.length) * 95)), `“${item.title}”配图编排失败，已保留正文：${illustrationError.message || String(illustrationError)}`, { stats: { total: targets.length, completed, failed, currentNodeId: item.id, phase: 'illustrating', images: imageStats } });
              }
            }
            feasibilityReportStore.saveGeneratedChapterContent({ projectId, nodeId: item.id, content: markdown });
            completed += 1;
            update(Math.round(((completed + failed) / targets.length) * 95), `“${item.title}”已生成并保存。`, { stats: { total: targets.length, completed, failed, phase: 'generating', images: imageStats } });
          } catch (error) {
            failed += 1;
            feasibilityReportStore.saveContentSection({ projectId, nodeId: item.id, status: 'error', error: error.message || String(error) });
            update(Math.round(((completed + failed) / targets.length) * 95), `“${item.title}”生成失败，已保留其他小节成果。`, { stats: { total: targets.length, completed, failed } });
          }
        }
        const stats = { total: targets.length, completed, failed, phase: 'done', images: imageStats };
        if (failed && !completed) return { status: 'error', message: '本轮正文生成失败，可点击补写失败小节重试。', error: '所有待生成小节均生成失败', stats };
        return { message: failed ? `正文生成结束，成功 ${completed} 节、失败 ${failed} 节。` : `已完成 ${completed} 个正文小节。`, stats };
      }, () => {
        const initial = feasibilityReportStore.loadState({ projectId: payload.projectId });
        if (!initial.outlineData || !initial.keyParametersMarkdown.trim()) throw new Error('请先完成报告目录和关键参数');
        if (!resolveContentTargets(initial, payload).targets.length) throw new Error('所有正文小节均已生成，无需补写');
      });
    },

    pauseContent(payload = {}) {
      const projectId = String(payload.projectId || payload.project_id || '').trim();
      const key = taskKey(projectId, 'feasibility-content');
      const task = activeTasks.get(key);
      const control = activeControls.get(key);
      if (!task || !control) throw new Error('当前没有正在运行的正文任务');
      if (!control.pauseRequested) {
        control.pauseRequested = true;
        control.update(task.progress, '已请求暂停，将在当前小节生成完成后暂停。', { status: 'pausing', pause_requested: true });
      }
      return task;
    },

    startHumanWriting(payload = {}) {
      return start('feasibility-human-writing', payload, async ({ update, projectId }) => {
        const initial = feasibilityReportStore.loadState({ projectId });
        if (!initial.outlineData) throw new Error('请先生成报告正文');
        const requestedIds = new Set((Array.isArray(payload.sectionIds) ? payload.sectionIds : []).map(String));
        const targets = collectLeafSections(initial.outlineData.outline).filter(({ item }) => String(item.content || '').trim() && (!requestedIds.size || requestedIds.has(item.id)));
        if (!targets.length) throw new Error('没有可审校的正文小节');
        let completed = 0;
        let failed = 0;
        update(5, `已确定 ${targets.length} 个待审校小节。`, { stats: { total: targets.length, completed, failed } });
        for (const { item, path } of targets) {
          update(Math.max(8, Math.round(((completed + failed) / targets.length) * 95)), `正在审校“${path.join(' / ')}”。`, { stats: { total: targets.length, completed, failed, currentNodeId: item.id } });
          try {
            const markdown = normalizeGeneratedContentHeadings(await aiService.chat({ messages: humanWritingMessages({ projectInfo: initial.projectInfo, keyParametersMarkdown: initial.keyParametersMarkdown, sectionPath: path, content: item.content }), temperature: 0.25 }));
            if (!markdown) throw new Error('模型未返回有效审校正文');
            assertReviewPreservesProtectedContent(item.content, markdown);
            feasibilityReportStore.saveReviewedChapterContent({ projectId, nodeId: item.id, content: markdown });
            completed += 1;
            update(Math.round(((completed + failed) / targets.length) * 95), `“${item.title}”审校完成并保存。`, { stats: { total: targets.length, completed, failed } });
          } catch (error) {
            failed += 1;
            update(Math.round(((completed + failed) / targets.length) * 95), `“${item.title}”审校失败，已保留原正文。`, { stats: { total: targets.length, completed, failed } });
          }
        }
        const stats = { total: targets.length, completed, failed };
        if (failed && !completed) return { status: 'error', message: '本轮自然化审校失败，原正文未受影响。', error: '所有待审校小节均处理失败', stats };
        return { message: failed ? `自然化审校结束，成功 ${completed} 节、失败 ${failed} 节。` : `已完成 ${completed} 个小节的自然化审校。`, stats };
      });
    },
  };
}

module.exports = { createFeasibilityReportTaskService, normalizeOutline, analysisToMarkdown, assertReviewPreservesProtectedContent, normalizeGeneratedContentHeadings };
