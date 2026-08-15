import type {
  ThesisTutorChapter,
  ThesisTutorCheckItem,
  ThesisTutorFeedbackItem,
  ThesisTutorProfile,
  ThesisTutorReference,
} from '../types';

interface ThesisTutorDraftingPreflightItem {
  label: string;
  status: 'ready' | 'warning' | 'missing';
  detail: string;
}

interface ThesisTutorDraftingPreflight {
  score: number;
  label: string;
  mode: string;
  tone: 'ready' | 'warning' | 'missing';
  summary: string;
  items: ThesisTutorDraftingPreflightItem[];
}

type ThesisTutorDataPreflightItem = ThesisTutorDraftingPreflightItem;

interface ThesisTutorDataPreflight {
  score: number;
  label: string;
  tone: 'ready' | 'warning' | 'missing';
  summary: string;
  recommendation: string;
  items: ThesisTutorDataPreflightItem[];
}

interface ThesisTutorFinalReviewGate {
  score: number;
  label: string;
  tone: 'ready' | 'warning' | 'missing';
  summary: string;
  items: ThesisTutorDraftingPreflightItem[];
}

function hasText(value: unknown) {
  return String(value || '').trim().length > 0;
}

export function buildDraftingPreflight(params: {
  profile: ThesisTutorProfile;
  sourceText: string;
  chapters: ThesisTutorChapter[];
  references: ThesisTutorReference[];
  activeChapter: ThesisTutorChapter | null;
  feedbackItems: ThesisTutorFeedbackItem[];
}): ThesisTutorDraftingPreflight {
  const { profile, sourceText, chapters, references, activeChapter, feedbackItems } = params;
  const hasTopicBoundary = hasText(profile.title) || hasText(profile.direction) || hasText(profile.researchQuestions);
  const hasOutline = hasText(profile.outlinePlan) || chapters.length > 0;
  const hasMaterial = hasText(sourceText) || hasText(activeChapter?.material) || references.length > 0;
  const hasEvidence = references.length > 0 || hasText(profile.literatureNotes);
  const verifiedReferenceCount = references.filter((reference) => reference.verificationStatus === 'verified').length;
  const riskyReferenceCount = references.filter((reference) => reference.verificationStatus === 'invalid').length;
  const isEmpirical = /问卷|实证|统计|计量|实验|数据|回归|样本/.test(`${profile.researchType} ${profile.methodologyNotes} ${profile.dataSources}`);
  const hasDataBoundary = !isEmpirical || hasText(profile.dataSources) || hasText(profile.dataIntegrityNotes);
  const hasTarget = hasText(profile.writingScope) || hasText(profile.targetWordCount) || hasText(activeChapter?.title);
  const hasAdvisorContext = hasText(profile.advisorPreferences) || feedbackItems.length > 0 || hasText(profile.schoolRequirements);

  const items: ThesisTutorDraftingPreflightItem[] = [
    {
      label: '题目/方向',
      status: hasTopicBoundary ? 'ready' : 'missing',
      detail: hasTopicBoundary ? '已有题目、方向或研究问题，可控制成稿边界。' : '建议先填写题目、方向或研究问题，否则只能生成通用框架。',
    },
    {
      label: '目录/章节',
      status: hasOutline ? 'ready' : 'warning',
      detail: hasOutline ? `已有 ${chapters.length || '档案'} 个章节线索，可按结构展开。` : '还没有目录，建议先生成论文框架或只写指定小节。',
    },
    {
      label: '材料依据',
      status: hasMaterial ? 'ready' : 'warning',
      detail: hasMaterial ? '已有材料区、章节材料或证据链，初稿会优先引用这些内容。' : '未提供材料，系统会生成框架型草稿并标注需补充依据。',
    },
    {
      label: '文献/证据',
      status: verifiedReferenceCount > 0 ? 'ready' : hasEvidence ? 'warning' : 'warning',
      detail: verifiedReferenceCount > 0
        ? `已有 ${verifiedReferenceCount} 条已核验证据${riskyReferenceCount ? `，${riskyReferenceCount} 条慎用` : ''}。`
        : hasEvidence
          ? '已有文献或线索，但尚未标记为已核验；正文引用会提示待核验。'
          : '缺少可核验文献，正文引用会以“需补充文献”标注。',
    },
    {
      label: '数据真实性',
      status: hasDataBoundary ? 'ready' : 'missing',
      detail: hasDataBoundary ? '当前研究类型的数据边界基本清楚。' : '实证/统计类论文需要先说明数据来源、样本或真实性边界。',
    },
    {
      label: '成稿范围',
      status: hasTarget ? 'ready' : 'warning',
      detail: hasTarget ? `当前范围：${profile.writingScope || activeChapter?.title || '章节初稿'}${profile.targetWordCount ? `，${profile.targetWordCount}` : ''}。` : '建议写清要生成整篇、某章、某节、摘要还是结论。',
    },
    {
      label: '导师/学校要求',
      status: hasAdvisorContext ? 'ready' : 'warning',
      detail: hasAdvisorContext ? '已有导师反馈、学校要求或偏好，可减少返工。' : '建议补充导师要求、学校格式或写作禁区。',
    },
  ];
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const score = Math.round((readyCount / items.length) * 100);
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const warningCount = items.filter((item) => item.status === 'warning').length;
  const tone = missingCount > 0 ? 'missing' : warningCount >= 3 ? 'warning' : 'ready';
  const mode = score >= 75
    ? '适合生成较完整初稿'
    : score >= 45
      ? '建议生成框架型初稿'
      : '建议先补齐档案和材料';
  const label = score >= 75 ? '准备较充分' : score >= 45 ? '可以先起草' : '资料偏少';
  const summary = score >= 75
    ? '当前上下文足够支撑自动成稿，生成后建议再逐段核对引用和数据。'
    : score >= 45
      ? '可以先生成可编辑草稿，但系统会在缺依据处标注“需补充/待核验”。'
      : '建议先补题目、目录、材料或数据边界，再使用自动成稿。';
  return { score, label, mode, tone, summary, items };
}

export function buildDataPreflight(params: {
  profile: ThesisTutorProfile;
  sourceText: string;
  references: ThesisTutorReference[];
}): ThesisTutorDataPreflight {
  const { profile, sourceText, references } = params;
  const dataText = `${profile.dataSources} ${profile.dataIntegrityNotes} ${profile.methodologyNotes} ${sourceText}`.trim();
  const hasDataSource = hasText(profile.dataSources) || /数据|问卷|访谈|样本|统计|年鉴|公报|平台|日志|案例|表格|csv|excel/i.test(dataText);
  const hasIntegrity = hasText(profile.dataIntegrityNotes) || /真实|来源|官方|公开|自填|回收|模拟|待核验|未核验|原始/.test(dataText);
  const hasSample = /n\s*=\s*\d+|样本量|样本|份问卷|人|家公司|个案例|条数据|年度|年份|\d+\s*(份|人|家|个|条)/i.test(dataText);
  const hasVariables = hasText(profile.methodologyNotes) || /变量|指标|维度|题项|因变量|自变量|中介|调节|解释变量|被解释变量|量表/.test(dataText);
  const hasAnalysisGoal = /回归|相关|描述统计|信度|效度|kmo|cronbach|anova|t检验|卡方|访谈编码|案例分析|扎根|计量|中介|调节/i.test(dataText);
  const dataReferences = references.filter((reference) => reference.type === 'data' || /数据|统计|年鉴|公报|问卷|访谈|样本/.test(`${reference.title} ${reference.source} ${reference.keywords}`));
  const verifiedDataReferences = dataReferences.filter((reference) => reference.verificationStatus === 'verified').length;

  const items: ThesisTutorDataPreflightItem[] = [
    {
      label: '数据来源',
      status: hasDataSource ? 'ready' : 'missing',
      detail: hasDataSource ? '已有数据、问卷、访谈、案例或公开来源线索。' : '请先说明数据来自哪里，否则不能写实证结果。',
    },
    {
      label: '真实性边界',
      status: hasIntegrity ? 'ready' : 'missing',
      detail: hasIntegrity ? '已有真实性或核验边界说明。' : '需要说明真实数据、公开数据、用户自填数据，还是仅作模拟演示。',
    },
    {
      label: '样本规模',
      status: hasSample ? 'ready' : 'warning',
      detail: hasSample ? '已有样本量或数据规模线索，可继续判断适合的分析。' : '缺少样本量，暂时只能给分析计划，不能判断统计稳健性。',
    },
    {
      label: '变量/指标',
      status: hasVariables ? 'ready' : 'warning',
      detail: hasVariables ? '已有变量、指标或题项说明。' : '建议补充变量名、题项、指标口径或案例维度。',
    },
    {
      label: '分析目标',
      status: hasAnalysisGoal ? 'ready' : 'warning',
      detail: hasAnalysisGoal ? '已有想做的统计、计量或质性分析目标。' : '建议写清要做描述统计、相关/回归、问卷检验还是案例分析。',
    },
    {
      label: '数据证据核验',
      status: verifiedDataReferences > 0 ? 'ready' : dataReferences.length > 0 ? 'warning' : 'warning',
      detail: verifiedDataReferences > 0
        ? `已有 ${verifiedDataReferences} 条已核验数据证据。`
        : dataReferences.length > 0
          ? '已有数据证据条目，但尚未标记为已核验。'
          : '还没有数据类证据条目，可在证据链中新增并核验。',
    },
  ];
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const score = Math.round((readyCount / items.length) * 100);
  const tone = missingCount > 0 ? 'missing' : score >= 70 ? 'ready' : 'warning';
  const label = score >= 70 ? '可进入实证设计' : score >= 45 ? '可先做预检' : '数据边界不足';
  const summary = score >= 70
    ? '当前数据说明较完整，可以生成分析路线和写作边界。'
    : score >= 45
      ? '可以先做数据预检，但统计结论需要等真实分析结果确认。'
      : '建议先补数据来源和真实性说明，否则只能生成数据需求清单。';
  const recommendation = score >= 70
    ? '适合输出可做分析、风险和实证写法'
    : score >= 45
      ? '建议输出数据补齐清单和初步分析计划'
      : '建议先补数据来源、样本、变量和核验说明';
  return { score, label, tone, summary, recommendation, items };
}

export function buildFinalReviewGate(params: {
  profile: ThesisTutorProfile;
  chapters: ThesisTutorChapter[];
  references: ThesisTutorReference[];
  feedbackItems: ThesisTutorFeedbackItem[];
  checkItems: ThesisTutorCheckItem[];
  dataPreflight: ThesisTutorDataPreflight;
}): ThesisTutorFinalReviewGate {
  const { profile, chapters, references, feedbackItems, checkItems, dataPreflight } = params;
  const draftedChapters = chapters.filter((chapter) => chapter.draft.trim() || chapter.status === 'drafted' || chapter.status === 'done').length;
  const verifiedReferences = references.filter((reference) => reference.verificationStatus === 'verified').length;
  const riskyReferences = references.filter((reference) => reference.verificationStatus !== 'verified').length;
  const openFeedback = feedbackItems.filter((item) => item.status !== 'done' && item.status !== 'deferred').length;
  const openChecks = checkItems.filter((item) => item.status === 'unchecked' || item.status === 'issue_found').length;
  const severeChecks = checkItems.filter((item) => item.severity === 'high' && item.status !== 'fixed' && item.status !== 'ignored').length;
  const hasBasicProfile = hasText(profile.title) && hasText(profile.outlinePlan || chapters.map((chapter) => chapter.title).join('\n'));
  const hasChapterDrafts = chapters.length > 0 && draftedChapters > 0;

  const items: ThesisTutorDraftingPreflightItem[] = [
    {
      label: '题目与目录',
      status: hasBasicProfile ? 'ready' : 'missing',
      detail: hasBasicProfile ? '题目和目录/章节计划已形成，可进入终稿一致性检查。' : '缺题目或目录，终稿审查会失去结构边界。',
    },
    {
      label: '章节草稿',
      status: hasChapterDrafts ? (draftedChapters >= chapters.length ? 'ready' : 'warning') : 'missing',
      detail: hasChapterDrafts ? `已有 ${draftedChapters}/${chapters.length} 个章节含草稿或完成状态。` : '还没有章节草稿，建议先自动成稿或逐章写作。',
    },
    {
      label: '文献核验',
      status: verifiedReferences > 0 && riskyReferences === 0 ? 'ready' : verifiedReferences > 0 ? 'warning' : 'missing',
      detail: verifiedReferences > 0 ? `已核验 ${verifiedReferences} 条证据，仍有 ${riskyReferences} 条需处理。` : '没有已核验证据，参考文献和正文引用需优先核验。',
    },
    {
      label: '数据边界',
      status: dataPreflight.tone === 'ready' ? 'ready' : dataPreflight.tone === 'warning' ? 'warning' : 'missing',
      detail: dataPreflight.summary,
    },
    {
      label: '导师反馈',
      status: openFeedback === 0 ? 'ready' : 'warning',
      detail: openFeedback === 0 ? '暂无未处理导师反馈。' : `还有 ${openFeedback} 条导师反馈未关闭。`,
    },
    {
      label: '检查清单',
      status: checkItems.length && openChecks === 0 ? 'ready' : checkItems.length ? 'warning' : 'missing',
      detail: checkItems.length ? `已有 ${checkItems.length} 项检查，待处理 ${openChecks} 项，高风险 ${severeChecks} 项。` : '还没有终稿检查清单。',
    },
  ];
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const score = Math.round((readyCount / items.length) * 100);
  const tone = missingCount > 0 ? 'missing' : score >= 70 ? 'ready' : 'warning';
  const label = score >= 70 ? '接近可交付' : score >= 45 ? '需要复查' : '不建议交付';
  const summary = score >= 70
    ? '项目上下文较完整，可以按清单逐项复查后导出或提交导师。'
    : score >= 45
      ? '已有部分终稿基础，但仍建议先处理高风险项和未核验依据。'
      : '终稿基础不足，建议先补章节草稿、证据核验或数据边界。';
  return { score, label, tone, summary, items };
}

export type {
  ThesisTutorDataPreflight,
  ThesisTutorDraftingPreflight,
  ThesisTutorDraftingPreflightItem,
  ThesisTutorFinalReviewGate,
};
