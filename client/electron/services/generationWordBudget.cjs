function normalizeWordCount(value) {
  const words = Number(value);
  return Math.max(0, Number.isFinite(words) ? Math.round(words) : 0);
}

function wordBudgetGuidance({ minimumWords, maximumWords, sectionWords }) {
  const minimum = Math.max(0, Number(minimumWords) || 0);
  const maximum = Math.max(0, Number(maximumWords) || 0);
  const perSection = Math.max(0, Number(sectionWords) || 0);
  if (!minimum && !maximum && !perSection) return '';
  return `请按篇幅目标规划目录：${minimum ? `全文不少于约 ${minimum} 字；` : ''}${maximum ? `全文尽量不超过约 ${maximum} 字；` : ''}${perSection ? `叶子小节平均约 ${perSection} 字，按评分重要性调整；` : ''}当前章节只承担与其评分要求相称的篇幅，不得为凑字数拆出空泛或重复小节。`;
}

function resolveSectionWordTarget(sectionWords, maximumWords, leafCount) {
  if (sectionWords > 0) return sectionWords;
  return maximumWords > 0 ? Math.max(300, Math.floor(maximumWords / leafCount)) : 0;
}

module.exports = { normalizeWordCount, wordBudgetGuidance, resolveSectionWordTarget };
