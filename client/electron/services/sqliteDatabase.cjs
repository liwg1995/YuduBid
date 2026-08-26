const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { getWorkspaceDatabasePath } = require('../utils/paths.cjs');

const schemaVersion = 18;

function createInitialSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS technical_plan_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workflow_kind TEXT NOT NULL DEFAULT 'technical-plan',
      step TEXT NOT NULL DEFAULT 'document-analysis',
      tender_file_name TEXT,
      tender_markdown_path TEXT,
      tender_markdown_hash TEXT,
      tender_markdown_chars INTEGER NOT NULL DEFAULT 0,
      tender_parser_label TEXT,
      tender_imported_at TEXT,
      original_plan_file_name TEXT,
      original_plan_markdown_path TEXT,
      original_plan_markdown_hash TEXT,
      original_plan_markdown_chars INTEGER NOT NULL DEFAULT 0,
      original_plan_source_path TEXT,
      original_plan_source_ext TEXT,
      original_plan_parser_label TEXT,
      original_plan_imported_at TEXT,
      bid_analysis_mode TEXT NOT NULL DEFAULT 'key',
      outline_mode TEXT NOT NULL DEFAULT 'aligned',
      outline_project_name TEXT,
      outline_project_overview TEXT,
      content_generation_options_json TEXT,
      content_generation_runtime_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS technical_plan_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      pause_requested INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS technical_plan_bid_items (
      item_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      error TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_bid_items_order
    ON technical_plan_bid_items(sort_order);

    CREATE TABLE IF NOT EXISTS technical_plan_reference_docs (
      document_id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_reference_docs_order
    ON technical_plan_reference_docs(sort_order);

    CREATE TABLE IF NOT EXISTS technical_plan_outline_nodes (
      node_id TEXT PRIMARY KEY,
      parent_node_id TEXT,
      sort_order INTEGER NOT NULL,
      level INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_requirement_id TEXT,
      source_requirement_title TEXT,
      knowledge_item_ids_json TEXT,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_node_id) REFERENCES technical_plan_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_outline_parent_order
    ON technical_plan_outline_nodes(parent_node_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_technical_plan_outline_level
    ON technical_plan_outline_nodes(level);

    CREATE TABLE IF NOT EXISTS technical_plan_content_sections (
      node_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES technical_plan_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_content_sections_status
    ON technical_plan_content_sections(status);

    CREATE TABLE IF NOT EXISTS technical_plan_content_plans (
      node_id TEXT PRIMARY KEY,
      plan_json TEXT NOT NULL,
      illustration_type TEXT NOT NULL DEFAULT 'none',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES technical_plan_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS technical_plan_global_fact_groups (
      group_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_global_fact_groups_order
    ON technical_plan_global_fact_groups(sort_order);
  `);
}

function createTechnicalPlanGlobalFactsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS technical_plan_global_fact_groups (
      group_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_global_fact_groups_order
    ON technical_plan_global_fact_groups(sort_order);
  `);
}

function createDuplicateCheckSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS duplicate_check_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL DEFAULT 'upload',
      active_analysis_tab TEXT NOT NULL DEFAULT 'metadata',
      current_signature TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_files (
      file_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_files_role_order
    ON duplicate_check_files(role, sort_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      payload_signature TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_analysis_sections (
      section TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      signature TEXT,
      stats_json TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_content_files (
      file_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      content_path TEXT,
      content_length INTEGER NOT NULL DEFAULT 0,
      parser_label TEXT,
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_files_status
    ON duplicate_check_content_files(status);

    CREATE TABLE IF NOT EXISTS duplicate_check_metadata_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      normalized TEXT,
      date_day TEXT,
      comparable INTEGER NOT NULL DEFAULT 0,
      date_comparable INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(file_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_metadata_file_order
    ON duplicate_check_metadata_items(file_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_metadata_key
    ON duplicate_check_metadata_items(key);

    CREATE TABLE IF NOT EXISTS duplicate_check_outline_items (
      item_id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      parent_item_id TEXT,
      level INTEGER NOT NULL,
      number TEXT,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      path_titles_json TEXT NOT NULL,
      normalized_path TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      from_tender INTEGER NOT NULL DEFAULT 0,
      matched_tender_sentence TEXT,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      FOREIGN KEY (parent_item_id) REFERENCES duplicate_check_outline_items(item_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_file_order
    ON duplicate_check_outline_items(file_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_normalized
    ON duplicate_check_outline_items(normalized_title, normalized_path);

    CREATE TABLE IF NOT EXISTS duplicate_check_outline_groups (
      group_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      file_ids_json TEXT NOT NULL,
      item_ids_json TEXT NOT NULL,
      paths_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_groups_order
    ON duplicate_check_outline_groups(sort_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_outline_pairwise (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_a_id TEXT NOT NULL,
      file_b_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      title_overlap REAL NOT NULL DEFAULT 0,
      path_overlap REAL NOT NULL DEFAULT 0,
      order_similarity REAL NOT NULL DEFAULT 0,
      shared_count INTEGER NOT NULL DEFAULT 0,
      risk TEXT NOT NULL DEFAULT 'none',
      FOREIGN KEY (file_a_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      FOREIGN KEY (file_b_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(file_a_id, file_b_id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_pairwise_score
    ON duplicate_check_outline_pairwise(score DESC);

    CREATE TABLE IF NOT EXISTS duplicate_check_content_duplicates (
      duplicate_id TEXT PRIMARY KEY,
      sentence TEXT NOT NULL,
      normalized TEXT NOT NULL,
      file_ids_json TEXT NOT NULL,
      first_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_duplicates_order
    ON duplicate_check_content_duplicates(first_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_content_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duplicate_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (duplicate_id) REFERENCES duplicate_check_content_duplicates(duplicate_id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(duplicate_id, file_id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_occ_file
    ON duplicate_check_content_occurrences(file_id);

    CREATE TABLE IF NOT EXISTS duplicate_check_image_files (
      file_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      image_count INTEGER NOT NULL DEFAULT 0,
      unique_image_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_duplicate_images (
      image_id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      preview_url TEXT NOT NULL,
      file_ids_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_duplicate_images_hash
    ON duplicate_check_duplicate_images(hash);

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_duplicate_images_order
    ON duplicate_check_duplicate_images(sort_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_image_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      locations_json TEXT,
      FOREIGN KEY (image_id) REFERENCES duplicate_check_duplicate_images(image_id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(image_id, file_id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_image_occ_file
    ON duplicate_check_image_occurrences(file_id);
  `);
}

function createRejectionCheckSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rejection_check_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL DEFAULT 'documents',
      active_document_tab TEXT NOT NULL DEFAULT 'tender',
      active_result_tab TEXT NOT NULL DEFAULT 'analysis',
      active_check_result_tab TEXT NOT NULL DEFAULT 'rejection',
      custom_check_items TEXT NOT NULL DEFAULT '',
      check_options_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rejection_check_documents (
      role TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content_chars INTEGER NOT NULL DEFAULT 0,
      parser_label TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rejection_check_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rejection_check_extraction (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      content TEXT NOT NULL DEFAULT '',
      source TEXT,
      tender_signature TEXT,
      error TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rejection_check_results (
      result_type TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      input_signature TEXT,
      active_finding_id TEXT,
      progress_message TEXT,
      compliance_matrix_json TEXT,
      error TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rejection_check_risk_findings (
      finding_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      requirement TEXT NOT NULL,
      bid_evidence TEXT NOT NULL,
      risk_reason TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_risk_order
    ON rejection_check_risk_findings(sort_order);

    CREATE INDEX IF NOT EXISTS idx_rejection_check_risk_severity
    ON rejection_check_risk_findings(severity);

    CREATE TABLE IF NOT EXISTS rejection_check_typo_findings (
      finding_id TEXT PRIMARY KEY,
      wrong_text TEXT NOT NULL,
      correct_text TEXT NOT NULL,
      original_excerpt TEXT NOT NULL,
      reason TEXT NOT NULL,
      location_hint TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_typo_order
    ON rejection_check_typo_findings(sort_order);

    CREATE TABLE IF NOT EXISTS rejection_check_logic_findings (
      finding_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_text TEXT NOT NULL,
      location_hint TEXT NOT NULL,
      fallacy_reason TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_logic_order
    ON rejection_check_logic_findings(sort_order);
  `);
}

function createWorkspaceV2Schema(db) {
  createDuplicateCheckSchema(db);
  createRejectionCheckSchema(db);
}

function createKnowledgeBaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_migration_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      legacy_index_hash TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      migrated_folder_count INTEGER NOT NULL DEFAULT 0,
      migrated_document_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      cleanup_completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_folders (
      folder_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_folders_order
    ON knowledge_folders(sort_order, created_at);

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      document_id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      document_dir TEXT NOT NULL,
      source_path TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      markdown_hash TEXT,
      markdown_chars INTEGER NOT NULL DEFAULT 0,
      source_extension TEXT,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      error TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      block_count INTEGER NOT NULL DEFAULT 0,
      filtered_block_count INTEGER NOT NULL DEFAULT 0,
      candidate_item_count INTEGER NOT NULL DEFAULT 0,
      discarded_block_count INTEGER NOT NULL DEFAULT 0,
      system_discarded_after_retry_count INTEGER NOT NULL DEFAULT 0,
      last_batch_size INTEGER,
      parser_label TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES knowledge_folders(folder_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_folder_order
    ON knowledge_documents(folder_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status
    ON knowledge_documents(status);

    CREATE TABLE IF NOT EXISTS knowledge_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      type TEXT NOT NULL,
      heading_path_json TEXT,
      content TEXT NOT NULL,
      content_chars INTEGER NOT NULL DEFAULT 0,
      is_filtered INTEGER NOT NULL DEFAULT 0,
      filter_reason TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, block_id, is_filtered)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_blocks_document_order
    ON knowledge_blocks(document_id, is_filtered, sort_order);

    CREATE INDEX IF NOT EXISTS idx_knowledge_blocks_block_id
    ON knowledge_blocks(document_id, block_id);

    CREATE TABLE IF NOT EXISTS knowledge_candidate_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_candidate_items_document_order
    ON knowledge_candidate_items(document_id, sort_order);

    CREATE TABLE IF NOT EXISTS knowledge_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      resume TEXT NOT NULL,
      content TEXT NOT NULL,
      source_file TEXT,
      content_chars INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_items_document_order
    ON knowledge_items(document_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_knowledge_items_title
    ON knowledge_items(title);

    CREATE TABLE IF NOT EXISTS knowledge_item_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, item_id, block_id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_item_blocks_item_order
    ON knowledge_item_blocks(document_id, item_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_knowledge_item_blocks_block
    ON knowledge_item_blocks(document_id, block_id);

    CREATE TABLE IF NOT EXISTS knowledge_discarded_groups (
      group_id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      block_ids_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_discarded_document_order
    ON knowledge_discarded_groups(document_id, source, sort_order);

    CREATE TABLE IF NOT EXISTS knowledge_reports (
      document_id TEXT PRIMARY KEY,
      total_blocks INTEGER NOT NULL DEFAULT 0,
      filtered_blocks_count INTEGER NOT NULL DEFAULT 0,
      candidate_items_count INTEGER NOT NULL DEFAULT 0,
      final_items_count INTEGER NOT NULL DEFAULT 0,
      matched_blocks_count INTEGER NOT NULL DEFAULT 0,
      discarded_blocks_count INTEGER NOT NULL DEFAULT 0,
      system_discarded_after_retry_count INTEGER NOT NULL DEFAULT 0,
      new_items_from_recovery_count INTEGER NOT NULL DEFAULT 0,
      recovery_attempt_count INTEGER NOT NULL DEFAULT 0,
      batch_size INTEGER NOT NULL DEFAULT 20,
      coverage_rate REAL NOT NULL DEFAULT 0,
      matched_rate REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
    );
  `);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function createTechnicalPlanExpansionSchema(db) {
  addColumnIfMissing(db, 'technical_plan_meta', 'workflow_kind', "TEXT NOT NULL DEFAULT 'technical-plan'");
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_file_name', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_markdown_path', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_markdown_hash', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_markdown_chars', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_source_path', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_source_ext', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_parser_label', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_imported_at', 'TEXT');
}

function createTechnicalPlanOriginalSourceSchema(db) {
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_source_path', 'TEXT');
  addColumnIfMissing(db, 'technical_plan_meta', 'original_plan_source_ext', 'TEXT');
}

function createRejectionCheckTechnicalPlanSourceSchema(db) {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rejection_check_documents'",
  ).get();
  if (!table) return;
  addColumnIfMissing(db, 'rejection_check_documents', 'source_project_id', 'TEXT');
}

function createRejectionCheckComplianceSchema(db) {
  addColumnIfMissing(db, 'rejection_check_results', 'compliance_matrix_json', 'TEXT');
}

function createBidOpportunitySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_monitors (
      monitor_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      industry TEXT NOT NULL DEFAULT '',
      regions_json TEXT NOT NULL DEFAULT '[]',
      notice_types_json TEXT NOT NULL DEFAULT '[]',
      required_keywords_json TEXT NOT NULL DEFAULT '[]',
      optional_keywords_json TEXT NOT NULL DEFAULT '[]',
      excluded_keywords_json TEXT NOT NULL DEFAULT '[]',
      buyer_keywords_json TEXT NOT NULL DEFAULT '[]',
      budget_min REAL,
      budget_max REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bid_opportunities (
      opportunity_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notice_type TEXT NOT NULL DEFAULT '其他',
      source_name TEXT NOT NULL DEFAULT '手工录入',
      source_url TEXT NOT NULL DEFAULT '',
      project_code TEXT NOT NULL DEFAULT '',
      buyer TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL DEFAULT '',
      publish_date TEXT,
      bid_deadline TEXT,
      budget REAL,
      summary TEXT NOT NULL DEFAULT '',
      content_path TEXT,
      source_kind TEXT NOT NULL DEFAULT 'manual',
      rule_score INTEGER NOT NULL DEFAULT 0,
      information_score INTEGER NOT NULL DEFAULT 0,
      qualification_status TEXT NOT NULL DEFAULT 'unknown',
      value_score INTEGER NOT NULL DEFAULT 0,
      feasibility_score INTEGER NOT NULL DEFAULT 0,
      recommendation TEXT NOT NULL DEFAULT '待判断',
      matched_keywords_json TEXT NOT NULL DEFAULT '[]',
      risk_flags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      owner TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      presales_project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bid_opportunities_status_updated
    ON bid_opportunities(status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_bid_opportunities_deadline
    ON bid_opportunities(bid_deadline);

    CREATE TABLE IF NOT EXISTS opportunity_monitor_matches (
      opportunity_id TEXT NOT NULL,
      monitor_id TEXT NOT NULL,
      matched_keywords_json TEXT NOT NULL DEFAULT '[]',
      match_score INTEGER NOT NULL DEFAULT 0,
      matched_at TEXT NOT NULL,
      PRIMARY KEY (opportunity_id, monitor_id),
      FOREIGN KEY (opportunity_id) REFERENCES bid_opportunities(opportunity_id) ON DELETE CASCADE,
      FOREIGN KEY (monitor_id) REFERENCES opportunity_monitors(monitor_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS opportunity_events (
      event_id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES bid_opportunities(opportunity_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_opportunity_events_opportunity_time
    ON opportunity_events(opportunity_id, created_at DESC);
  `);
}

function createOpportunityIntelligenceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_enterprise_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT '',
      industries_json TEXT NOT NULL DEFAULT '[]',
      service_regions_json TEXT NOT NULL DEFAULT '[]',
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      qualifications_json TEXT NOT NULL DEFAULT '[]',
      personnel_json TEXT NOT NULL DEFAULT '[]',
      performances_json TEXT NOT NULL DEFAULT '[]',
      advantages TEXT NOT NULL DEFAULT '',
      limitations TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);
  addColumnIfMissing(db, 'bid_opportunities', 'deep_analysis_json', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'analysis_task_json', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'analysis_signature', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'analyzed_at', 'TEXT');
}

function createOpportunitySourceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_sources (
      source_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      adapter_type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{}',
      health_status TEXT NOT NULL DEFAULT 'untested',
      last_run_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      last_result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunity_scan_runs (
      run_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      fetched_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES opportunity_sources(source_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_opportunity_scan_runs_source_time
    ON opportunity_scan_runs(source_id, started_at DESC);
  `);
  addColumnIfMissing(db, 'bid_opportunities', 'source_item_id', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'content_hash', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'last_seen_at', 'TEXT');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bid_opportunities_source_item ON bid_opportunities(source_name, source_item_id) WHERE source_item_id <> '';`);
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO opportunity_sources
    (source_id,name,adapter_type,base_url,enabled,config_json,health_status,created_at,updated_at)
    VALUES ('ccgp-central-open-tender','中国政府采购网·中央公开招标','ccgp-central-open-tender',
    'https://www.ccgp.gov.cn/cggg/zygg/gkzb/index.htm',1,'{"maxItems":20}', 'untested', ?, ?)`).run(timestamp, timestamp);
}

function createOpportunityProjectTimelineSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_project_clusters (
      cluster_id TEXT PRIMARY KEY,
      canonical_title TEXT NOT NULL,
      normalized_title TEXT NOT NULL DEFAULT '',
      buyer TEXT NOT NULL DEFAULT '',
      project_code TEXT NOT NULL DEFAULT '',
      current_stage TEXT NOT NULL DEFAULT 'other',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opportunity_project_clusters_match
    ON opportunity_project_clusters(buyer, normalized_title);
  `);
  addColumnIfMissing(db, 'bid_opportunities', 'project_cluster_id', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'announcement_stage', "TEXT NOT NULL DEFAULT 'other'");
  addColumnIfMissing(db, 'bid_opportunities', 'cluster_confidence', 'REAL');
  addColumnIfMissing(db, 'bid_opportunities', 'cluster_method', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'expected_purchase_date', 'TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bid_opportunities_project_cluster ON bid_opportunities(project_cluster_id, publish_date);`);
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO opportunity_sources
    (source_id,name,adapter_type,base_url,enabled,config_json,health_status,created_at,updated_at)
    VALUES ('ccgp-procurement-intention','中国政府采购网·政府采购意向','ccgp-procurement-intention',
    'http://cgyx.ccgp.gov.cn/cgyx/pub/pubSearch',1,'{"maxItems":20}', 'untested', ?, ?)`).run(timestamp, timestamp);
}

function createOpportunityLifecycleSchema(db) {
  addColumnIfMissing(db, 'bid_opportunities', 'award_supplier', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'award_amount', 'REAL');
  addColumnIfMissing(db, 'bid_opportunities', 'termination_reason', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'change_summary', "TEXT NOT NULL DEFAULT ''");
  const timestamp = new Date().toISOString();
  const statement = db.prepare(`INSERT OR IGNORE INTO opportunity_sources
    (source_id,name,adapter_type,base_url,enabled,config_json,health_status,created_at,updated_at)
    VALUES (?,?,?,?,1,'{"maxItems":20}','untested',?,?)`);
  statement.run('ccgp-central-correction', '中国政府采购网·中央更正公告', 'ccgp-central-correction', 'https://www.ccgp.gov.cn/cggg/zygg/gzgg/index.htm', timestamp, timestamp);
  statement.run('ccgp-central-award', '中国政府采购网·中央中标公告', 'ccgp-central-award', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/index.htm', timestamp, timestamp);
  statement.run('ccgp-central-termination', '中国政府采购网·中央终止公告', 'ccgp-central-termination', 'https://www.ccgp.gov.cn/cggg/zygg/fblbgg/index.htm', timestamp, timestamp);
}

function createOpportunityDecisionWorkflowSchema(db) {
  addColumnIfMissing(db, 'bid_opportunities', 'workflow_stage', "TEXT NOT NULL DEFAULT 'discovery'");
  addColumnIfMissing(db, 'bid_opportunities', 'decision_outcome', "TEXT NOT NULL DEFAULT 'undecided'");
  addColumnIfMissing(db, 'bid_opportunities', 'decision_reason', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'decision_due_at', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'next_action', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'next_action_due_at', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'tender_file_name', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'tender_markdown_path', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'tender_markdown_hash', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'tender_parser_label', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunities', 'tender_imported_at', 'TEXT');
  addColumnIfMissing(db, 'bid_opportunities', 'technical_plan_project_id', 'TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bid_opportunities_workflow_action ON bid_opportunities(workflow_stage, next_action_due_at);`);
}

function createOpportunityExpandedSourcesSchema(db) {
  const timestamp = new Date().toISOString();
  const statement = db.prepare(`INSERT OR IGNORE INTO opportunity_sources
    (source_id,name,adapter_type,base_url,enabled,config_json,health_status,created_at,updated_at)
    VALUES (?,?,?,?,1,'{"maxItems":20}','untested',?,?)`);
  statement.run('ccgp-local-open-tender', '中国政府采购网·地方公开招标', 'ccgp-local-open-tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/index.htm', timestamp, timestamp);
  statement.run('ccgp-local-correction', '中国政府采购网·地方更正公告', 'ccgp-local-correction', 'https://www.ccgp.gov.cn/cggg/dfgg/gzgg/index.htm', timestamp, timestamp);
  statement.run('ccgp-local-award', '中国政府采购网·地方中标公告', 'ccgp-local-award', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/index.htm', timestamp, timestamp);
  statement.run('ccgp-local-termination', '中国政府采购网·地方终止公告', 'ccgp-local-termination', 'https://www.ccgp.gov.cn/cggg/dfgg/fblbgg/index.htm', timestamp, timestamp);
  statement.run('ccgp-central-deal', '中国政府采购网·中央成交公告', 'ccgp-central-deal', 'https://www.ccgp.gov.cn/cggg/zygg/cjgg/index.htm', timestamp, timestamp);
}

function createFeasibilityReportSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feasibility_report_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL DEFAULT 'materials',
      project_info_json TEXT,
      analysis_markdown_path TEXT,
      analysis_markdown_hash TEXT,
      analysis_markdown_chars INTEGER NOT NULL DEFAULT 0,
      outline_template TEXT NOT NULL DEFAULT 'government',
      target_words INTEGER NOT NULL DEFAULT 30000,
      key_parameters_markdown_path TEXT,
      key_parameters_markdown_hash TEXT,
      key_parameters_markdown_chars INTEGER NOT NULL DEFAULT 0,
      outline_project_name TEXT,
      outline_project_overview TEXT,
      content_generation_options_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feasibility_report_sources (
      source_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      markdown_chars INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      parser_label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feasibility_report_sources_order
    ON feasibility_report_sources(sort_order);

    CREATE TABLE IF NOT EXISTS feasibility_report_reference_docs (
      document_id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_feasibility_report_reference_docs_order
    ON feasibility_report_reference_docs(sort_order);

    CREATE TABLE IF NOT EXISTS feasibility_report_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      pause_requested INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feasibility_report_outline_nodes (
      node_id TEXT PRIMARY KEY,
      parent_node_id TEXT,
      sort_order INTEGER NOT NULL,
      level INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      knowledge_item_ids_json TEXT,
      content TEXT NOT NULL DEFAULT '',
      content_source TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_node_id) REFERENCES feasibility_report_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_feasibility_report_outline_parent_order
    ON feasibility_report_outline_nodes(parent_node_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_feasibility_report_outline_level
    ON feasibility_report_outline_nodes(level);

    CREATE TABLE IF NOT EXISTS feasibility_report_content_sections (
      node_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES feasibility_report_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_feasibility_report_content_sections_status
    ON feasibility_report_content_sections(status);
  `);
}

function createBidExportTemplatesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bid_export_templates (
      template_id TEXT PRIMARY KEY,
      template_name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bid_export_templates_updated
    ON bid_export_templates(updated_at DESC);
  `);
}

const migrations = [
  {
    version: 1,
    description: '创建技术方案 SQLite 初始表结构',
    up: createInitialSchema,
  },
  {
    version: 2,
    description: '新增标书查重和废标项检查 SQLite 表结构',
    up: createWorkspaceV2Schema,
  },
  {
    version: 3,
    description: '新增知识库 SQLite 表结构',
    up: createKnowledgeBaseSchema,
  },
  {
    version: 4,
    description: '新增技术方案全局事实表结构',
    up: createTechnicalPlanGlobalFactsSchema,
  },
  {
    version: 5,
    description: '新增已有方案扩写原方案元数据',
    up: createTechnicalPlanExpansionSchema,
  },
  {
    version: 6,
    description: '新增已有方案扩写原方案源文件模板元数据',
    up: createTechnicalPlanOriginalSourceSchema,
  },
  {
    version: 7,
    description: '记录废标项检查文档关联的技术方案项目',
    up: createRejectionCheckTechnicalPlanSourceSchema,
  },
  {
    version: 8,
    description: '新增废标检查符合性矩阵',
    up: createRejectionCheckComplianceSchema,
  },
  {
    version: 9,
    description: '新增投标机会、监控方案和状态历史表结构',
    up: createBidOpportunitySchema,
  },
  {
    version: 10,
    description: '新增企业能力画像与投标机会 AI 深度分析缓存',
    up: createOpportunityIntelligenceSchema,
  },
  {
    version: 11,
    description: '新增真实公告数据源、增量扫描和健康诊断',
    up: createOpportunitySourceSchema,
  },
  {
    version: 12,
    description: '新增采购意向来源、项目聚类和公告阶段时间线',
    up: createOpportunityProjectTimelineSchema,
  },
  {
    version: 13,
    description: '新增更正、中标和终止公告生命周期字段与来源',
    up: createOpportunityLifecycleSchema,
  },
  {
    version: 14,
    description: '新增投标决策工作流、行动计划和正式招标文件关联',
    up: createOpportunityDecisionWorkflowSchema,
  },
  {
    version: 15,
    description: '新增地方采购生命周期公告和中央成交公告来源',
    up: createOpportunityExpandedSourcesSchema,
  },
  {
    version: 16,
    description: '新增可研报告工作区表结构',
    up: createFeasibilityReportSchema,
  },
  {
    version: 17,
    description: '新增可研报告正文配图生成配置',
    up(db) {
      addColumnIfMissing(db, 'feasibility_report_meta', 'content_generation_options_json', 'TEXT');
    },
  },
  {
    version: 18,
    description: '新增招投标 Word 导出模板表结构',
    up: createBidExportTemplatesSchema,
  },
];

function timestampForFileName() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').replace(/\..*$/, '');
}

function copyIfExists(source, target) {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  }
}

function backupDatabaseFiles(db, databasePath) {
  if (!fs.existsSync(databasePath)) {
    return;
  }

  db.pragma('wal_checkpoint(TRUNCATE)');
  const suffix = `backup-${timestampForFileName()}`;
  copyIfExists(databasePath, `${databasePath}.${suffix}`);
  copyIfExists(`${databasePath}-wal`, `${databasePath}-wal.${suffix}`);
  copyIfExists(`${databasePath}-shm`, `${databasePath}-shm.${suffix}`);
}

function applyMigrations(db, databasePath) {
  const currentVersion = Number(db.pragma('user_version', { simple: true }) || 0);
  if (currentVersion > schemaVersion) {
    throw new Error(`本地数据库版本 ${currentVersion} 高于当前客户端支持版本 ${schemaVersion}，请升级客户端后再使用技术方案功能。`);
  }
  if (currentVersion === schemaVersion) {
    return;
  }

  if (currentVersion > 0) {
    backupDatabaseFiles(db, databasePath);
  }

  const runMigration = db.transaction((migration) => {
    migration.up(db);
    db.pragma(`user_version = ${migration.version}`);
  });

  for (const migration of migrations.filter((item) => item.version > currentVersion).sort((a, b) => a.version - b.version)) {
    try {
      runMigration(migration);
    } catch (error) {
      throw new Error(`数据库升级失败（v${migration.version} ${migration.description}）：${error.message || String(error)}`);
    }
  }
}

function createSqliteDatabase(app) {
  const databasePath = getWorkspaceDatabasePath(app);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applyMigrations(db, databasePath);

  const close = () => {
    if (db.open) {
      db.close();
    }
  };

  app.once('before-quit', close);

  return {
    db,
    path: databasePath,
    schemaVersion,
    close,
  };
}

module.exports = {
  createSqliteDatabase,
  schemaVersion,
};
