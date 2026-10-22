// 缓存和模型规划都不能绕过本轮的配图开关。
function enabledIllustrationTypes(types, enabled) {
  return types.filter((type) => enabled[type] === true);
}
module.exports = { enabledIllustrationTypes };
