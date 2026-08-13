const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const { createSqliteDatabase, schemaVersion } = require('../electron/services/sqliteDatabase.cjs');
const { createBidOpportunityService } = require('../electron/services/bidOpportunityService.cjs');

function makeApp(userDataPath) {
  const fakeApp = new EventEmitter();
  fakeApp.getPath = (name) => {
    assert.equal(name, 'userData');
    return userDataPath;
  };
  return fakeApp;
}

async function verifyCoreFlow(rootDir) {
  const fakeApp = makeApp(path.join(rootDir, 'core'));
  const database = createSqliteDatabase(fakeApp);
  const service = createBidOpportunityService({ app: fakeApp, db: database.db });

  try {
    const subscriber = new EventEmitter();
    subscriber.isDestroyed = () => false;
    subscriber.send = () => {};
    service.subscribe(subscriber);
    service.subscribe(subscriber);
    assert.equal(subscriber.listenerCount('destroyed'), 1, '重复订阅不应增加 destroyed 监听器');

    const monitor = service.saveMonitor({
      name: '华东智慧政务项目',
      regions: ['江苏'],
      noticeTypes: ['招标公告'],
      requiredKeywords: ['平台'],
      optionalKeywords: ['智慧政务', '数据治理'],
      buyerKeywords: ['政务服务中心'],
      budgetMin: 1000000,
      budgetMax: 5000000,
    }).monitor;

    const matching = service.saveOpportunity({
      title: '江苏省政务服务中心智慧政务平台公开招标公告',
      noticeType: '招标公告',
      buyer: '江苏省政务服务中心',
      region: '江苏',
      budget: 3000000,
      bidDeadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      summary: '建设智慧政务平台并开展数据治理。',
      content: '本项目建设智慧政务平台，包含数据治理服务。',
    });
    const unrelated = service.saveOpportunity({
      title: '广东某单位办公家具采购公告',
      noticeType: '招标公告',
      buyer: '广东某单位',
      region: '广东',
      budget: 500000,
      content: '采购办公桌椅。',
    });

    const matchedDetail = service.getOpportunity(matching.opportunityId);
    assert.ok(matchedDetail.content.includes('智慧政务平台'), '详情读取应包含公告正文');
    assert.equal(matchedDetail.monitorMatches.length, 1, '符合组合条件的机会应命中监控');
    assert.equal(matchedDetail.monitorMatches[0].monitorId, monitor.monitorId);
    assert.ok(matchedDetail.monitorMatches[0].reasons.some((item) => item.includes('智慧政务')));
    assert.equal(service.getOpportunity(unrelated.opportunityId).monitorMatches.length, 0, '不符合条件的机会不应命中监控');

    const overdue = new Date(Date.now() - 86400000).toISOString();
    const decided = service.updateDecisionWorkflow({
      opportunityId: matching.opportunityId,
      workflowStage: 'decision',
      decisionOutcome: 'bid',
      decisionReason: '资格与预算范围匹配',
      nextAction: '组织投标启动会',
      nextActionDueAt: overdue,
    });
    assert.equal(decided.status, 'following');
    assert.equal(decided.decisionOutcome, 'bid');

    const bulkResult = service.bulkUpdate({
      opportunityIds: [matching.opportunityId, unrelated.opportunityId],
      status: 'review',
      owner: '测试负责人',
    });
    assert.equal(bulkResult.updatedCount, 2);
    const snapshot = service.getSnapshot();
    assert.equal(snapshot.counts.total, 2);
    assert.equal(snapshot.opportunities[0].content, '', '列表快照不应加载完整公告正文');
    assert.equal(snapshot.operatingMetrics.owners.find((item) => item.owner === '测试负责人')?.total, 2);
    assert.equal(snapshot.operatingMetrics.tasks.overdue, 1);

    database.db.prepare('UPDATE bid_opportunities SET analysis_task_json=? WHERE opportunity_id=?').run(JSON.stringify({ taskId: 'interrupted-analysis', status: 'running', progress: 40, message: '处理中' }), matching.opportunityId);
    const sourceId = snapshot.sources[0].sourceId;
    database.db.prepare(`INSERT INTO opportunity_scan_runs (run_id,source_id,status,progress,message,started_at,updated_at) VALUES (?,?, 'running',40,'处理中',?,?)`).run('interrupted-scan', sourceId, new Date().toISOString(), new Date().toISOString());
    const recoveredSnapshot = service.getSnapshot();
    assert.equal(recoveredSnapshot.diagnostics.interruptedAnalyses, 1);
    assert.equal(recoveredSnapshot.diagnostics.interruptedScans, 1);
    assert.ok(recoveredSnapshot.diagnostics.issues.some((issue) => issue.kind === 'source' && issue.sourceId === sourceId && issue.title.includes('中断')));
    assert.ok(recoveredSnapshot.diagnostics.issues.some((issue) => issue.kind === 'analysis' && issue.opportunityId === matching.opportunityId));

    const backup = await service.createWorkspaceBackup();
    assert.equal(backup.success, true);
    const verified = service.verifyLatestBackup();
    assert.equal(verified.verified, true);
    assert.ok(fs.existsSync(path.join(verified.path, 'yibiao.sqlite')));

    service.deleteMonitor(monitor.monitorId);
    assert.equal(service.getOpportunity(matching.opportunityId).monitorMatches.length, 0, '删除监控后应清理命中关系');
    console.log('[bid-opportunity] matching, decision workflow, lazy content, recovery, backup and subscription checks passed.');
  } finally {
    database.close();
  }
}

function verifyV14Migration(rootDir) {
  const userDataPath = path.join(rootDir, 'migration');
  const workspacePath = path.join(userDataPath, 'workspace');
  const databasePath = path.join(workspacePath, 'yibiao.sqlite');
  fs.mkdirSync(workspacePath, { recursive: true });

  const legacy = new Database(databasePath);
  legacy.exec(`
    CREATE TABLE opportunity_sources (
      source_id TEXT PRIMARY KEY, name TEXT NOT NULL, adapter_type TEXT NOT NULL, base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, config_json TEXT NOT NULL DEFAULT '{}', health_status TEXT NOT NULL DEFAULT 'untested',
      last_run_at TEXT, last_success_at TEXT, last_error TEXT, last_result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  legacy.prepare(`INSERT INTO opportunity_sources
    (source_id,name,adapter_type,base_url,enabled,config_json,health_status,created_at,updated_at)
    VALUES (?,?,?,?,1,'{}','healthy',?,?)`).run('legacy-source', '既有数据源', 'legacy', 'https://example.test', '2026-01-01', '2026-01-01');
  legacy.pragma('user_version = 14');
  legacy.close();

  const database = createSqliteDatabase(makeApp(userDataPath));
  try {
    assert.equal(database.db.pragma('user_version', { simple: true }), schemaVersion);
    assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM opportunity_sources WHERE source_id=?').get('legacy-source').count, 1);
    assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM opportunity_sources WHERE source_id IN ('ccgp-local-open-tender','ccgp-local-correction','ccgp-local-award','ccgp-local-termination','ccgp-central-deal')").get().count, 5);
    const backups = fs.readdirSync(workspacePath).filter((name) => name.startsWith('yibiao.sqlite.backup-'));
    assert.ok(backups.length >= 1, '数据库升级前应创建备份');
    console.log('[bid-opportunity] v14 to v15 migration and backup checks passed.');
  } finally {
    database.close();
  }
}

function finish(code) {
  if (app?.isReady?.()) app.exit(code);
  else process.exit(code);
}

async function run() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-bid-opportunity-'));
  try {
    await verifyCoreFlow(rootDir);
    verifyV14Migration(rootDir);
    console.log('[bid-opportunity] all regression checks passed.');
    finish(0);
  } catch (error) {
    console.error('[bid-opportunity] regression verification failed.');
    console.error(error?.stack || error?.message || String(error));
    finish(1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

app.whenReady().then(run, (error) => {
  console.error(error?.stack || error?.message || String(error));
  finish(1);
});
