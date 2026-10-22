const assert = require('node:assert/strict');
const { __test__: { runLogicCheck } } = require('../electron/services/rejectionCheckTask.cjs');
const { __test__: { rejectionSheets } } = require('../electron/services/checkResultExportService.cjs');

async function main() {
  const candidates = [
    { id: 'correct-total', title: '金额合计错误', originalText: '1 + 2 = 3', locationHint: '业绩表', fallacyReason: '计算正确。', suggestion: '撤销此项，数据一致。' },
    { id: 'date-ok', title: '日期逻辑一致', originalText: '2026年4月；2026年10月', locationHint: '标准表', fallacyReason: '日期一致，无逻辑矛盾。', suggestion: '无' },
    { id: 'speculative', title: '年份可能有误', originalText: '2026年10月', locationHint: '封面', fallacyReason: '若项目实际发生在2024年，则年份有误。', suggestion: '全面核对项目年份。' },
    { id: 'real-conflict', title: '同一工期不一致', originalText: '承诺函为30天；进度表为40天', locationHint: '承诺函、进度表', fallacyReason: '工期前后不一致。', suggestion: '核对工期。' },
  ];
  const schemas = [];
  const aiService = {
    collectJsonResponse: async ({ schemaName }) => {
      schemas.push(schemaName);
      if (schemaName === 'LogicCheckFindings') return { findings: candidates };
      if (schemaName === 'LogicCheckReview') return { verdicts: [
        { id: 'speculative', verdict: 'dismiss', reason: '', suggestion: '' },
        { id: 'real-conflict', verdict: 'keep', reason: '承诺函写30天，进度表写40天，同一工期不一致。', suggestion: '核对并统一承诺函和进度表的工期。' },
      ] };
      throw new Error(`unexpected schema ${schemaName}`);
    },
  };
  const findings = await runLogicCheck(aiService, { bidContent: '承诺函写工期30天，进度表写工期40天。' }, () => {});
  assert.deepEqual(schemas, ['LogicCheckFindings', 'LogicCheckReview']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'real-conflict');
  assert.equal(findings[0].fallacyReason, '承诺函写30天，进度表写40天，同一工期不一致。');

  const sheets = rejectionSheets({ logicCheckResult: { status: 'success', findings: candidates } });
  const overview = sheets.find((sheet) => sheet.name === '检查概览');
  const logic = sheets.find((sheet) => sheet.name === '逻辑问题');
  assert.equal(overview.rows.find((row) => row[0] === '逻辑问题')[2], 2);
  assert.deepEqual(logic.rows.slice(1).map((row) => row[1]), ['年份可能有误', '同一工期不一致']);
  console.log('逻辑问题复核与 Excel 自证无误项过滤验证通过');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
