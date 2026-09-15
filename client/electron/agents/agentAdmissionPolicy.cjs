'use strict';

const DEFAULT_POLICY = Object.freeze({
  minEvaluatedRuns: 20,
  minAlignmentRate: 95,
  maxFailureRate: 2,
  maxHighRiskMismatches: 0,
});

const HIGH_RISK_REASON_CODES = new Set([
  'ACTIVE_TASK_CONFLICT',
  'WORKBENCH_STEP_AHEAD',
  'STATE_INCONSISTENT',
]);

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function evaluateAgentAdmission({ total = 0, evaluated = 0, aligned = 0, failed = 0, mismatchReasons = [] } = {}, policy = DEFAULT_POLICY) {
  const alignmentRate = evaluated > 0 ? percent(aligned, evaluated) : null;
  const failureRate = percent(failed, total);
  const highRiskMismatches = (Array.isArray(mismatchReasons) ? mismatchReasons : [])
    .filter((reason) => HIGH_RISK_REASON_CODES.has(String(reason?.code || '')))
    .reduce((sum, reason) => sum + Math.max(0, Math.round(Number(reason?.count || 0))), 0);
  const checks = [
    { id: 'sample-size', label: '有效影子样本', passed: evaluated >= policy.minEvaluatedRuns, actual: evaluated, required: `≥ ${policy.minEvaluatedRuns}` },
    { id: 'alignment-rate', label: '决策一致率', passed: alignmentRate !== null && alignmentRate >= policy.minAlignmentRate, actual: alignmentRate, required: `≥ ${policy.minAlignmentRate}%`, unit: '%' },
    { id: 'failure-rate', label: '运行失败率', passed: failureRate <= policy.maxFailureRate, actual: failureRate, required: `≤ ${policy.maxFailureRate}%`, unit: '%' },
    { id: 'high-risk-mismatch', label: '高风险偏差', passed: highRiskMismatches <= policy.maxHighRiskMismatches, actual: highRiskMismatches, required: `≤ ${policy.maxHighRiskMismatches}` },
  ];
  const enoughSamples = checks[0].passed;
  const eligible = checks.every((check) => check.passed);
  return {
    status: eligible ? 'eligible' : enoughSamples ? 'blocked' : 'insufficient-data',
    eligibleForHumanApprovalPilot: eligible,
    alignmentRate,
    failureRate,
    highRiskMismatches,
    policy: { ...policy },
    checks,
    note: eligible
      ? '达到人工确认执行试点的观测门槛；写权限仍需单独开发、审核和显式启用。'
      : enoughSamples
        ? '影子数据未达到安全门槛，继续保持只读模式。'
        : `有效样本不足 ${policy.minEvaluatedRuns} 次，继续保持只读模式。`,
  };
}

module.exports = { DEFAULT_POLICY, HIGH_RISK_REASON_CODES, evaluateAgentAdmission };
