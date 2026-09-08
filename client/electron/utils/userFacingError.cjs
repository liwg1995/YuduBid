function toChineseErrorMessage(value, fallback = '操作失败，请稍后重试') {
  let message = String(value?.message || value || '').trim();
  message = message
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, '')
    .replace(/^(?:(?:Error|ReferenceError|TypeError|RangeError|SyntaxError|NetworkError|AbortError):\s*)+/i, '')
    .split(/\n\s*at\s+/i)[0]
    .trim();

  if (/请求已取消|cancel(?:led)?|abort/i.test(message)) return '请求已取消';
  if (/超时|timed?\s*out|timeout/i.test(message)) return '请求超时，请稍后重试';
  if (/\b401\b|unauthorized|invalid api.?key|authentication/i.test(message)) return '服务认证失败，请检查密钥和模型配置';
  if (/\b403\b|forbidden/i.test(message)) return '当前服务拒绝访问，请检查账号权限';
  if (/\b404\b|not found/i.test(message)) return '请求的服务或资源不存在，请检查服务地址';
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return '请求过于频繁，请稍后重试';
  if (/\b5\d\d\b|bad gateway|service unavailable/i.test(message)) return '服务暂时不可用，请稍后重试';
  if (/failed to fetch|fetch failed|network(?: request)? failed|econnreset|enotfound|econnrefused/i.test(message)) return '网络请求失败，请检查网络和服务配置';
  if (/enoent|no such file or directory/i.test(message)) return '文件或目录不存在，请重新选择';
  if (/eacces|eperm|permission denied/i.test(message)) return '没有访问该文件或目录的权限';
  if (/is not defined|cannot read propert|undefined is not|not a function/i.test(message)) return '程序内部发生异常，请重启应用后重试';
  if (/unexpected token|json.*(?:parse|invalid)|invalid json/i.test(message)) return '返回数据格式错误，请重新生成';

  return /[\u3400-\u9fff]/.test(message) ? message : fallback;
}

module.exports = { toChineseErrorMessage };
