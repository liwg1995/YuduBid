function isSelfRefutingLogicFinding(item) {
  const title = String(item?.title || '').trim();
  const reason = String(item?.fallacyReason || '').trim();
  const suggestion = String(item?.suggestion || '').trim();
  if (/^撤销(?:此项|该项|本项)/.test(suggestion)) return true;
  if (/^(?:无|无需修改|无需处理)[。！!\s]*$/.test(suggestion)) return true;
  if (/逻辑一致|日期一致|计算正确|金额一致|数据一致/.test(title) && /无逻辑矛盾|无逻辑谬误|计算正确|数据一致|日期一致/.test(reason)) return true;
  return false;
}

module.exports = { isSelfRefutingLogicFinding };
