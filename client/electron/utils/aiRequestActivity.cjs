const { AsyncLocalStorage } = require('node:async_hooks');

const activityStorage = new AsyncLocalStorage();

function runWithAiRequestActivity(activity, runner) {
  return activityStorage.run(activity, runner);
}

function bindAiRequestActivity(runner) {
  const activity = activityStorage.getStore();
  return (...args) => runWithAiRequestActivity(activity, () => runner(...args));
}

function notifyActivity(method, ...args) {
  try {
    activityStorage.getStore()?.[method]?.(...args);
  } catch (error) {
    // 活动记录不能影响模型请求本身。
    console.warn('[ai-activity] 更新任务活动状态失败', error);
  }
}

module.exports = {
  runWithAiRequestActivity,
  bindAiRequestActivity,
  notifyAiRequestStart: () => notifyActivity('onRequestStart'),
  notifyAiResponse: () => notifyActivity('onResponse'),
  notifyAiRetry: (error, attempt, maxAttempts) => notifyActivity('onRetry', error, attempt, maxAttempts),
};
