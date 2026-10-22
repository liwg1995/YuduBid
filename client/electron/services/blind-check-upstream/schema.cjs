function addColumnIfMissing(db, table, name, type) { if (!db.prepare('PRAGMA table_info(' + table + ')').all().some(row => row.name === name)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + name + ' ' + type); }
function createBlindCheckSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blind_check_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL DEFAULT 'upload',
      preset_id TEXT NOT NULL DEFAULT 'builtin-general',
      preset_tab TEXT NOT NULL DEFAULT 'page',
      result_tab TEXT NOT NULL DEFAULT 'all',
      use_credential_words INTEGER NOT NULL DEFAULT 1,
      file_id TEXT,
      file_name TEXT,
      source_path TEXT,
      original_path TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_modified_at TEXT,
      content_hash TEXT,
      imported_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blind_check_presets (
      preset_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      profile_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blind_check_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blind_check_results (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      input_signature TEXT,
      preset_name TEXT,
      summary_json TEXT,
      stats_json TEXT,
      rule_errors_json TEXT,
      error TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS blind_check_finding_groups (
      group_id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      rule_title TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      finding_count INTEGER NOT NULL DEFAULT 0,
      samples_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_blind_check_finding_groups_order
    ON blind_check_finding_groups(sort_order);
  `);
}

function createBlindCheckFixSchema(db) {
  addColumnIfMissing(db, 'blind_check_meta', 'fix_rules_json', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS blind_check_fix_results (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      input_signature TEXT,
      fix_rules_json TEXT,
      output_path TEXT,
      source_bytes INTEGER NOT NULL DEFAULT 0,
      output_bytes INTEGER NOT NULL DEFAULT 0,
      fixes_json TEXT,
      notes_json TEXT,
      validation_json TEXT,
      before_summary_json TEXT,
      before_rule_counts_json TEXT,
      after_summary_json TEXT,
      after_stats_json TEXT,
      error TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS blind_check_fix_groups (
      group_id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      rule_title TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      finding_count INTEGER NOT NULL DEFAULT 0,
      samples_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_blind_check_fix_groups_order
    ON blind_check_fix_groups(sort_order);
  `);
}

function addBlindCheckPresetSource(db) {
  addColumnIfMissing(db, 'blind_check_presets', 'source_json', 'TEXT');
}

function createBlindCheckReviewSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blind_check_reviews (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      input_signature TEXT,
      tender_name TEXT,
      review_json TEXT,
      error TEXT,
      updated_at TEXT
    );
  `);
}

// AI 复核：程序初筛后由持久 Agent 补漏、判定候选问题，修复结果与检查结果逐条对应。
// 修复是否带 AI 修复单独记住，作为下次弹窗的默认选项；检查是否带 AI 复核沿用 ai_review_enabled。
function addBlindCheckFixMode(db) {
  addColumnIfMissing(db, 'blind_check_meta', 'fix_ai_enabled', 'INTEGER NOT NULL DEFAULT 1');
}

function addBlindCheckReview(db) {
  addColumnIfMissing(db, 'blind_check_meta', 'ai_review_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'blind_check_finding_groups', 'candidate', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'blind_check_finding_groups', 'items_json', 'TEXT');
  addColumnIfMissing(db, 'blind_check_fix_results', 'items_json', 'TEXT');
  addColumnIfMissing(db, 'blind_check_fix_results', 'new_groups_json', 'TEXT');
  addColumnIfMissing(db, 'blind_check_fix_results', 'clauses_json', 'TEXT');
  addColumnIfMissing(db, 'blind_check_fix_results', 'agent_json', 'TEXT');
  createBlindCheckReviewSchema(db);
}


function migrateBlindCheck(db) {
  createBlindCheckSchema(db); addColumnIfMissing(db, 'blind_check_meta', 'credential_company_id', "TEXT NOT NULL DEFAULT ''"); createBlindCheckFixSchema(db); addBlindCheckPresetSource(db); addBlindCheckFixMode(db); addBlindCheckReview(db);
  db.exec(`CREATE TABLE IF NOT EXISTS blind_check_task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_domain TEXT NOT NULL, task_type TEXT NOT NULL, task_id TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_blind_task_logs ON blind_check_task_logs(task_domain, task_type, id);`);
}
module.exports = { migrateBlindCheck };
