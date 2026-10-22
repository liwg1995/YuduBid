const BUSY_STATUSES = new Set(['running', 'pausing', 'paused', 'stopping']);

function assertOutlineEditable(plan = {}) {
  for (const [field, label] of [['outlineGenerationTask', '目录生成'], ['globalFactsTask', '全局事实生成'], ['contentGenerationTask', '正文生成']]) {
    if (BUSY_STATUSES.has(plan[field]?.status)) throw new Error(`当前${label}任务尚未结束，请先结束任务再修改目录。`);
  }
}
module.exports = { assertOutlineEditable };
