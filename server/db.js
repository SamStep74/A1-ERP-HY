const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const locale = require("./locale");
const payroll = require("./payroll");

const DEFAULT_EMAIL = "owner@armosphera.local";
const DEFAULT_PASSWORD = "change-me-now";
const MONEY_PRECISION_MIGRATION_ID = "rub-kopeck-minor-units-s8";
const MONEY_PRECISION_COLUMN_NAMES = new Set([
  "amount",
  "average_cost",
  "budget",
  "credit_carried",
  "estimated_value",
  "first_month_total",
  "gross",
  "gross_salary",
  "income_tax",
  "input_vat",
  "lifetime_value",
  "list_price",
  "monthly_ops_fee",
  "monthly_total",
  "net",
  "open_receivables",
  "output_vat",
  "payable",
  "pension",
  "promised_amount",
  "setup_fee",
  "stamp_duty",
  "standard_cost",
  "subtotal",
  "taxable_purchases",
  "taxable_sales",
  "total",
  "total_cost",
  "total_deductions",
  "unit_cost",
  "unit_price",
  "value",
  "vat",
  "weighted_value"
]);

function activeSeedCurrency() {
  return locale.active().money.code;
}

function activeSeedLocale() {
  return locale.activeLocale() === "ru" ? "ru-RU" : "hy-AM";
}

function currencyForOrg(db, orgId) {
  const row = db.prepare("SELECT currency FROM organizations WHERE id = ?").get(orgId);
  return String(row?.currency || activeSeedCurrency()).trim().toUpperCase();
}

function quoteIdentifier(name) {
  const text = String(name || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`Unsafe SQLite identifier: ${text}`);
  }
  return `"${text}"`;
}

function moneySubunitForCurrency(currency) {
  const code = String(currency || "").trim().toUpperCase();
  if (code === locale.profileFor("am").money.code) return locale.profileFor("am").money.subunit;
  if (code === locale.profileFor("ru").money.code) return locale.profileFor("ru").money.subunit;
  throw new Error(`Unsupported money precision currency: ${code || "(blank)"}`);
}

function moneyPrecisionTargets(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const targets = [];
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table.name)})`).all();
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("org_id")) continue;
    const moneyColumns = columns
      .filter((column) => MONEY_PRECISION_COLUMN_NAMES.has(column.name) && /INT/i.test(String(column.type || "")))
      .map((column) => column.name);
    if (moneyColumns.length === 0) continue;
    targets.push({
      table: table.name,
      columns: moneyColumns,
      hasCurrency: columnNames.has("currency")
    });
  }
  return targets;
}

function checksumMoneyPrecisionTargets(db, targets) {
  const globalHash = crypto.createHash("sha256");
  const tableReports = [];
  for (const target of targets) {
    const tableHash = crypto.createHash("sha256");
    const selectedColumns = ["org_id", ...target.columns].map(quoteIdentifier).join(", ");
    const rows = db.prepare(`SELECT rowid AS __rowid, ${selectedColumns} FROM ${quoteIdentifier(target.table)} ORDER BY org_id, rowid`).all();
    tableHash.update(target.table);
    tableHash.update("\0");
    tableHash.update(target.columns.join(","));
    for (const row of rows) {
      const values = target.columns.map((column) => row[column]);
      tableHash.update("\0");
      tableHash.update(String(row.org_id || ""));
      tableHash.update("\0");
      tableHash.update(String(row.__rowid));
      tableHash.update("\0");
      tableHash.update(JSON.stringify(values));
    }
    const checksum = tableHash.digest("hex");
    globalHash.update(target.table);
    globalHash.update("\0");
    globalHash.update(checksum);
    tableReports.push({
      table: target.table,
      columns: target.columns,
      rowCount: rows.length,
      checksum
    });
  }
  return { checksum: globalHash.digest("hex"), tables: tableReports };
}

function assertMoneyPrecisionCurrencyInvariant(db, targets) {
  const orgs = db.prepare("SELECT id, currency FROM organizations ORDER BY id").all();
  for (const org of orgs) moneySubunitForCurrency(org.currency);
  for (const target of targets) {
    if (!target.hasCurrency) continue;
    const mismatch = db.prepare(`
      SELECT COUNT(*) AS count
      FROM ${quoteIdentifier(target.table)} AS item
      JOIN organizations AS org ON org.id = item.org_id
      WHERE UPPER(TRIM(item.currency)) <> UPPER(TRIM(org.currency))
    `).get().count;
    if (mismatch > 0) {
      throw new Error(`Kopeck S8 currency invariant failed: ${target.table}.currency differs from organizations.currency for ${mismatch} row(s)`);
    }
  }
}

function ensureMoneyPrecisionMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS money_precision_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      status TEXT NOT NULL,
      target_currencies TEXT NOT NULL,
      table_count INTEGER NOT NULL,
      column_count INTEGER NOT NULL,
      rows_checked INTEGER NOT NULL,
      rows_scaled INTEGER NOT NULL,
      checksum_before TEXT NOT NULL,
      checksum_after TEXT NOT NULL,
      report TEXT NOT NULL
    )
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM money_precision_migrations WHERE id = ?").get(MONEY_PRECISION_MIGRATION_ID);
    if (existing) {
      db.exec("COMMIT");
      return;
    }

    const targets = moneyPrecisionTargets(db);
    assertMoneyPrecisionCurrencyInvariant(db, targets);
    const before = checksumMoneyPrecisionTargets(db, targets);
    const orgs = db.prepare("SELECT id, currency FROM organizations ORDER BY id").all()
      .map((org) => {
        const currency = String(org.currency || "").trim().toUpperCase();
        const subunit = moneySubunitForCurrency(currency);
        return { id: org.id, currency, subunit, factor: 10 ** subunit };
      });
    let rowsScaled = 0;
    const scaledByCurrency = {};
    const scaledByTable = {};

    for (const org of orgs) {
      if (org.subunit <= 0) continue;
      for (const target of targets) {
        const rowCount = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(target.table)} WHERE org_id = ?`).get(org.id).count;
        if (rowCount === 0) continue;
        const assignments = target.columns.map((column) => `${quoteIdentifier(column)} = ${quoteIdentifier(column)} * ${org.factor}`).join(", ");
        db.prepare(`UPDATE ${quoteIdentifier(target.table)} SET ${assignments} WHERE org_id = ?`).run(org.id);
        rowsScaled += rowCount;
        scaledByCurrency[org.currency] = (scaledByCurrency[org.currency] || 0) + rowCount;
        scaledByTable[target.table] = (scaledByTable[target.table] || 0) + rowCount;
      }
    }

    const after = checksumMoneyPrecisionTargets(db, targets);
    const rowCount = before.tables.reduce((sum, table) => sum + table.rowCount, 0);
    const columnCount = targets.reduce((sum, target) => sum + target.columns.length, 0);
    const report = {
      migrationId: MONEY_PRECISION_MIGRATION_ID,
      targets: targets.map((target) => ({ table: target.table, columns: target.columns })),
      currencies: orgs.map((org) => ({ currency: org.currency, subunit: org.subunit, factor: org.factor })),
      rowsScaled,
      scaledByCurrency,
      scaledByTable,
      checksums: {
        before: before.checksum,
        after: after.checksum,
        unchanged: before.checksum === after.checksum
      },
      before: before.tables,
      after: after.tables
    };

    db.prepare(`
      INSERT INTO money_precision_migrations (
        id, applied_at, status, target_currencies, table_count, column_count,
        rows_checked, rows_scaled, checksum_before, checksum_after, report
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      MONEY_PRECISION_MIGRATION_ID,
      new Date().toISOString(),
      "applied",
      JSON.stringify(orgs.map((org) => ({ currency: org.currency, subunit: org.subunit, factor: org.factor }))),
      targets.length,
      columnCount,
      rowCount,
      rowsScaled,
      before.checksum,
      after.checksum,
      JSON.stringify(report)
    );
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function openDatabase(dbPath) {
  if (dbPath && dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath || path.join(__dirname, "..", "data", "armosphera-one.db"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  initSchema(db);
  ensurePilotPacketLayer(db);
  ensureSessionGovernanceLayer(db);
  seedIfEmpty(db);
  ensureSuiteAppLayer(db);
  ensureRoleLayer(db);
  ensureProfileLayer(db);
  ensureServiceLayer(db);
  ensureWorkflowExecutionLayer(db);
  ensureWorkflowRuleVersions(db);
  ensureFinanceLayer(db);
  ensureDocsTemplateLayer(db);
  ensureQuoteLayer(db);
  ensureCrmSalesLayer(db);
  ensureCatalogLayer(db);
  ensureInventoryLayer(db);
  ensurePurchaseLayer(db);
  ensureMarketingLayer(db);
  ensureAnalyticsLayer(db);
  ensureMoneyPrecisionMigration(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'hy-AM',
      currency TEXT NOT NULL,
      market TEXT NOT NULL DEFAULT 'Armenia',
      data_region TEXT NOT NULL DEFAULT 'Armenia hosted',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      last_seen_at TEXT,
      user_agent TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      mfa_verified INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      revoked_by_user_id TEXT,
      revoked_reason TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id, expires_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_revoked
      ON sessions(revoked_at, expires_at);

    CREATE TABLE IF NOT EXISTS user_mfa_factors (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      factor_type TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      secret_base32 TEXT NOT NULL,
      enabled_at TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_mfa_factors_user
      ON user_mfa_factors(org_id, user_id, status);

    CREATE TABLE IF NOT EXISTS login_mfa_challenges (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      factor_id TEXT NOT NULL REFERENCES user_mfa_factors(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_login_mfa_challenges_user
      ON login_mfa_challenges(org_id, user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      route TEXT NOT NULL,
      maturity TEXT NOT NULL,
      priority INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_assignments (
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (org_id, role, app_id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tax_id TEXT,
      email TEXT,
      phone TEXT,
      segment TEXT,
      health_score INTEGER NOT NULL,
      lifetime_value INTEGER NOT NULL,
      open_receivables INTEGER NOT NULL,
      last_touch TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      tax_id TEXT,
      data_quality_score INTEGER NOT NULL DEFAULT 0,
      consent_status TEXT NOT NULL DEFAULT 'unknown',
      processing_purpose TEXT NOT NULL DEFAULT 'customer-operations',
      merge_status TEXT NOT NULL DEFAULT 'canonical',
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      last_event_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_customer
      ON customer_profiles(org_id, customer_id);

    CREATE TABLE IF NOT EXISTS customer_profile_sources (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
      source_app TEXT NOT NULL,
      source_entity_type TEXT NOT NULL,
      source_entity_id TEXT NOT NULL,
      match_key TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      authoritative INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customer_profile_sources_profile
      ON customer_profile_sources(org_id, profile_id);

    CREATE TABLE IF NOT EXISTS privacy_requests (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      request_type TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      legal_source_id TEXT REFERENCES legal_sources(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      fulfilled_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_privacy_requests_customer
      ON privacy_requests(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS privacy_export_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
      legal_source_id TEXT REFERENCES legal_sources(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_export_packets_source
      ON privacy_export_packets(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_privacy_export_packets_customer
      ON privacy_export_packets(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS privacy_retention_assessments (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
      legal_source_id TEXT REFERENCES legal_sources(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_retention_assessments_source
      ON privacy_retention_assessments(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_privacy_retention_assessments_customer
      ON privacy_retention_assessments(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      stage TEXT NOT NULL,
      value INTEGER NOT NULL,
      currency TEXT NOT NULL,
      probability INTEGER NOT NULL,
      next_step TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_categories (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      parent_category_id TEXT REFERENCES catalog_categories(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_categories_status
      ON catalog_categories(org_id, status, name);

    CREATE TABLE IF NOT EXISTS catalog_units_of_measure (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      precision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_units_of_measure_status
      ON catalog_units_of_measure(org_id, status, kind, code);

    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES catalog_categories(id) ON DELETE SET NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      item_type TEXT NOT NULL,
      status TEXT NOT NULL,
      unit_of_measure TEXT NOT NULL DEFAULT 'unit',
      list_price INTEGER NOT NULL,
      standard_cost INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT 'standard',
      track_stock INTEGER NOT NULL DEFAULT 0,
      track_lots INTEGER NOT NULL DEFAULT 0,
      fiscal_receipt_required INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, sku)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_items_status
      ON catalog_items(org_id, status, item_type);

    CREATE INDEX IF NOT EXISTS idx_catalog_items_category
      ON catalog_items(org_id, category_id, status);

    CREATE TABLE IF NOT EXISTS catalog_item_variants (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      attributes_json TEXT NOT NULL DEFAULT '{}',
      unit_of_measure TEXT NOT NULL DEFAULT 'unit',
      list_price INTEGER NOT NULL DEFAULT 0,
      standard_cost INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, sku)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_item_variants_item
      ON catalog_item_variants(org_id, catalog_item_id, status, sku);

    CREATE TABLE IF NOT EXISTS catalog_price_lists (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      customer_segment TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_price_lists_status
      ON catalog_price_lists(org_id, status, code);

    CREATE TABLE IF NOT EXISTS catalog_price_list_items (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      price_list_id TEXT NOT NULL REFERENCES catalog_price_lists(id) ON DELETE CASCADE,
      catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
      catalog_item_variant_id TEXT REFERENCES catalog_item_variants(id) ON DELETE SET NULL,
      min_quantity INTEGER NOT NULL DEFAULT 1,
      list_price INTEGER NOT NULL,
      discount_percent REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, price_list_id, catalog_item_id, catalog_item_variant_id, min_quantity)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_price_list_items_list
      ON catalog_price_list_items(org_id, price_list_id, status, catalog_item_id);

    CREATE TABLE IF NOT EXISTS catalog_margin_rules (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT NOT NULL DEFAULT '',
      minimum_margin_percent REAL NOT NULL,
      target_margin_percent REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_margin_rules_scope
      ON catalog_margin_rules(org_id, status, scope_type, scope_value);

    CREATE TABLE IF NOT EXISTS stock_locations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      location_type TEXT NOT NULL,
      status TEXT NOT NULL,
      parent_location_id TEXT REFERENCES stock_locations(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_locations_status
      ON stock_locations(org_id, status, location_type);

    CREATE TABLE IF NOT EXISTS stock_quants (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      reserved_quantity INTEGER NOT NULL DEFAULT 0,
      average_cost INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, catalog_item_id, location_id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_quants_item
      ON stock_quants(org_id, catalog_item_id);

    CREATE INDEX IF NOT EXISTS idx_stock_quants_location
      ON stock_quants(org_id, location_id);

    CREATE TABLE IF NOT EXISTS stock_moves (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      source_location_id TEXT REFERENCES stock_locations(id) ON DELETE SET NULL,
      destination_location_id TEXT REFERENCES stock_locations(id) ON DELETE SET NULL,
      move_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL DEFAULT 0,
      total_cost INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stock_moves_item
      ON stock_moves(org_id, catalog_item_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_stock_moves_locations
      ON stock_moves(org_id, source_location_id, destination_location_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS purchase_vendors (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tax_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      payment_terms_days INTEGER NOT NULL DEFAULT 0,
      lead_time_days INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_vendors_status
      ON purchase_vendors(org_id, status, name);

    CREATE TABLE IF NOT EXISTS purchase_vendor_prices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      vendor_id TEXT NOT NULL REFERENCES purchase_vendors(id) ON DELETE CASCADE,
      catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
      currency TEXT NOT NULL,
      unit_cost INTEGER NOT NULL,
      min_quantity INTEGER NOT NULL DEFAULT 1,
      lead_time_days INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, vendor_id, catalog_item_id, min_quantity, valid_from)
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_vendor_prices_item
      ON purchase_vendor_prices(org_id, catalog_item_id, vendor_id, status);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      vendor_id TEXT REFERENCES purchase_vendors(id) ON DELETE SET NULL,
      order_number TEXT NOT NULL,
      supplier TEXT NOT NULL,
      supplier_tax_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      order_date TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      confirmed_at TEXT,
      received_at TEXT,
      bill_id TEXT REFERENCES bills(id) ON DELETE SET NULL,
      receipt_reference TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, order_number)
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
      ON purchase_orders(org_id, status, order_date DESC);

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      vendor_price_id TEXT REFERENCES purchase_vendor_prices(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL,
      received_quantity INTEGER NOT NULL DEFAULT 0,
      unit_cost INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      stock_move_id TEXT REFERENCES stock_moves(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_order
      ON purchase_order_lines(org_id, purchase_order_id);

    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
      stock_move_id TEXT NOT NULL REFERENCES stock_moves(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_order
      ON purchase_receipts(org_id, purchase_order_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_line
      ON purchase_receipts(org_id, purchase_order_line_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_reference
      ON purchase_receipts(org_id, purchase_order_id, reference);

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
      stock_move_id TEXT NOT NULL REFERENCES stock_moves(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      returned_at TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_returns_order
      ON purchase_returns(org_id, purchase_order_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_returns_line
      ON purchase_returns(org_id, purchase_order_line_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_returns_reference
      ON purchase_returns(org_id, purchase_order_id, reference);

    CREATE TABLE IF NOT EXISTS crm_leads (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      tax_id TEXT,
      segment TEXT NOT NULL,
      source TEXT NOT NULL,
      channel TEXT NOT NULL,
      interest TEXT NOT NULL,
      estimated_value INTEGER NOT NULL,
      currency TEXT NOT NULL,
      consent_status TEXT NOT NULL,
      score INTEGER NOT NULL,
      rating TEXT NOT NULL,
      status TEXT NOT NULL,
      routed_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      next_action TEXT NOT NULL,
      converted_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      converted_deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      converted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      converted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crm_leads_status
      ON crm_leads(org_id, status, score DESC);

    CREATE INDEX IF NOT EXISTS idx_crm_leads_routed
      ON crm_leads(org_id, routed_to_user_id, status);

    CREATE TABLE IF NOT EXISTS crm_activities (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES crm_leads(id) ON DELETE SET NULL,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      forecast_category TEXT NOT NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crm_activities_customer
      ON crm_activities(org_id, customer_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_crm_activities_lead
      ON crm_activities(org_id, lead_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      audience TEXT NOT NULL,
      status TEXT NOT NULL,
      budget INTEGER NOT NULL,
      currency TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status
      ON marketing_campaigns(org_id, status, started_at DESC);

    CREATE TABLE IF NOT EXISTS marketing_attributions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
      lead_id TEXT REFERENCES crm_leads(id) ON DELETE SET NULL,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      attribution_weight INTEGER NOT NULL DEFAULT 100,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_attributions_source
      ON marketing_attributions(org_id, campaign_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_marketing_attributions_customer
      ON marketing_attributions(org_id, customer_id, campaign_id);

    CREATE TABLE IF NOT EXISTS crm_deal_forecasts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      forecast_category TEXT NOT NULL,
      close_date TEXT NOT NULL,
      weighted_value INTEGER NOT NULL,
      health_score INTEGER NOT NULL,
      health_status TEXT NOT NULL,
      health_reasons TEXT NOT NULL,
      manager_note TEXT NOT NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_deal_forecasts_deal
      ON crm_deal_forecasts(org_id, deal_id);

    CREATE INDEX IF NOT EXISTS idx_crm_deal_forecasts_category
      ON crm_deal_forecasts(org_id, forecast_category, health_status);

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      number TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL,
      total INTEGER NOT NULL,
      currency TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      public_token TEXT NOT NULL,
      sent_at TEXT,
      accepted_at TEXT,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_public_token
      ON quotes(org_id, public_token);

    CREATE INDEX IF NOT EXISTS idx_quotes_customer
      ON quotes(org_id, customer_id, status);

    CREATE TABLE IF NOT EXISTS quote_lines (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      catalog_item_id TEXT REFERENCES catalog_items(id) ON DELETE SET NULL,
      catalog_item_variant_id TEXT REFERENCES catalog_item_variants(id) ON DELETE SET NULL,
      catalog_price_list_id TEXT REFERENCES catalog_price_lists(id) ON DELETE SET NULL,
      catalog_price_list_code TEXT NOT NULL DEFAULT '',
      pricing_source TEXT NOT NULL DEFAULT 'manual',
      pricing_customer_segment TEXT NOT NULL DEFAULT '',
      discount_amount INTEGER NOT NULL DEFAULT 0,
      margin_status TEXT NOT NULL DEFAULT '',
      margin_rule_code TEXT NOT NULL DEFAULT '',
      margin_rule_minimum_percent REAL,
      margin_rule_target_percent REAL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      total INTEGER NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT 'standard',
      fiscal_receipt_required INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quote_acceptances (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_acceptances_quote
      ON quote_acceptances(org_id, quote_id);

    CREATE TABLE IF NOT EXISTS docs_signature_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      legal_source_id TEXT REFERENCES legal_sources(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_signature_packets_source
      ON docs_signature_packets(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_docs_signature_packets_customer
      ON docs_signature_packets(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS crm_tasks (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source_key TEXT NOT NULL,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      due_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer
      ON crm_tasks(org_id, customer_id, status, priority);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tasks_source
      ON crm_tasks(org_id, source_key);

    CREATE TABLE IF NOT EXISTS crm_collection_promises (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      promised_amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      promised_on TEXT NOT NULL,
      reminder_channel TEXT NOT NULL,
      reminder_at TEXT NOT NULL,
      message_hy TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_collection_promises_source
      ON crm_collection_promises(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_crm_collection_promises_customer
      ON crm_collection_promises(org_id, customer_id, status, promised_on);

    CREATE TABLE IF NOT EXISTS crm_collection_reminder_deliveries (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      promise_id TEXT NOT NULL REFERENCES crm_collection_promises(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      channel TEXT NOT NULL,
      provider TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message_hy TEXT NOT NULL,
      source_key TEXT NOT NULL,
      sent_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_collection_reminder_deliveries_source
      ON crm_collection_reminder_deliveries(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_crm_collection_reminder_deliveries_customer
      ON crm_collection_reminder_deliveries(org_id, customer_id, sent_at DESC);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      status TEXT NOT NULL,
      total INTEGER NOT NULL,
      vat INTEGER NOT NULL,
      due_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_periods (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      status TEXT NOT NULL,
      closed_at TEXT,
      closed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_periods_key
      ON finance_periods(org_id, period_key);

    CREATE TABLE IF NOT EXISTS finance_draft_invoices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      number TEXT NOT NULL,
      status TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL,
      total INTEGER NOT NULL,
      currency TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      period_key TEXT NOT NULL,
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_draft_invoices_source
      ON finance_draft_invoices(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_finance_draft_invoices_customer
      ON finance_draft_invoices(org_id, customer_id, status, period_key);

    CREATE TABLE IF NOT EXISTS finance_invoice_links (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_invoice_links_draft
      ON finance_invoice_links(org_id, draft_invoice_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_invoice_links_invoice
      ON finance_invoice_links(org_id, invoice_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_invoice_links_source
      ON finance_invoice_links(org_id, source_key);

    CREATE TABLE IF NOT EXISTS finance_payments (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      method TEXT NOT NULL,
      reference TEXT NOT NULL,
      period_key TEXT NOT NULL,
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_payments_source
      ON finance_payments(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_finance_payments_customer
      ON finance_payments(org_id, customer_id, paid_at DESC);

    CREATE TABLE IF NOT EXISTS ledger_accounts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_accounts_code
      ON ledger_accounts(org_id, code);

    CREATE TABLE IF NOT EXISTS ledger_journal (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      debit_code TEXT NOT NULL,
      credit_code TEXT NOT NULL,
      amount INTEGER NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      period_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_journal_source
      ON ledger_journal(org_id, source_type, source_id, debit_code, credit_code);

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      description TEXT NOT NULL DEFAULT '',
      vendor TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      currency TEXT NOT NULL,
      incurred_on TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id TEXT REFERENCES people_employees(id) ON DELETE SET NULL,
      employee_name TEXT NOT NULL DEFAULT '',
      gross INTEGER NOT NULL,
      income_tax INTEGER NOT NULL,
      pension INTEGER NOT NULL,
      stamp_duty INTEGER NOT NULL,
      total_deductions INTEGER NOT NULL,
      net INTEGER NOT NULL,
      run_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS people_employees (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      tax_id TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      gross_salary INTEGER NOT NULL DEFAULT 0,
      employment_status TEXT NOT NULL DEFAULT 'active',
      hire_date TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_people_employees_org ON people_employees(org_id, employment_status, full_name);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      doc_type TEXT NOT NULL DEFAULT 'agreement',
      status TEXT NOT NULL DEFAULT 'draft',
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      sealed_checksum TEXT NOT NULL DEFAULT '',
      sealed_at TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(org_id, status, created_at);

    CREATE TABLE IF NOT EXISTS document_signers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL DEFAULT '',
      signer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sign_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      signed_at TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_document_signers_doc ON document_signers(org_id, document_id, sign_order);

    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      name TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'agreement',
      title_template TEXT NOT NULL DEFAULT '',
      body_template TEXT NOT NULL DEFAULT '',
      variables TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_key ON document_templates(org_id, template_key);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning',
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
      start_date TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id, status, created_at);

    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      assignee_employee_id TEXT REFERENCES people_employees(id) ON DELETE SET NULL,
      due_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(org_id, project_id, status);

    CREATE TABLE IF NOT EXISTS project_milestones (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      reached INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(org_id, project_id, reached);

    CREATE TABLE IF NOT EXISTS project_time_entries (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES project_tasks(id) ON DELETE SET NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      entry_date TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      logged_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      billed_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_project_time_entries_project ON project_time_entries(org_id, project_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_project_time_entries_unbilled ON project_time_entries(org_id, project_id, billed_invoice_id);

    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      fields TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      submission_count INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_forms_org ON forms(org_id, status, created_at);

    CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      lead_id TEXT REFERENCES crm_leads(id) ON DELETE SET NULL,
      submitter_ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(org_id, form_id, created_at);

    CREATE TABLE IF NOT EXISTS tax_rates (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_rates_kind_date ON tax_rates(org_id, kind, effective_date);

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      currency TEXT NOT NULL,
      bill_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      period_key TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bill_payments (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'bank-transfer',
      reference TEXT NOT NULL DEFAULT '',
      period_key TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_bank_transactions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
      promise_id TEXT REFERENCES crm_collection_promises(id) ON DELETE SET NULL,
      payment_id TEXT REFERENCES finance_payments(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL DEFAULT '',
      transaction_date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      direction TEXT NOT NULL,
      description TEXT NOT NULL,
      reference TEXT NOT NULL,
      match_confidence INTEGER NOT NULL DEFAULT 0,
      match_reason TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL,
      imported_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      imported_at TEXT NOT NULL,
      reconciled_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_bank_transactions_source
      ON finance_bank_transactions(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_finance_bank_transactions_customer
      ON finance_bank_transactions(org_id, customer_id, status, transaction_date DESC);

    CREATE TABLE IF NOT EXISTS finance_src_exports (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      status TEXT NOT NULL,
      legal_source_id TEXT REFERENCES legal_sources(id) ON DELETE SET NULL,
      invoice_count INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL,
      total INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_src_exports_source
      ON finance_src_exports(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_finance_src_exports_period
      ON finance_src_exports(org_id, period_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS finance_vat_returns (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      status TEXT NOT NULL,
      legal_source_id TEXT REFERENCES legal_sources(id) ON DELETE SET NULL,
      output_vat INTEGER NOT NULL DEFAULT 0,
      input_vat INTEGER NOT NULL DEFAULT 0,
      taxable_sales INTEGER NOT NULL DEFAULT 0,
      taxable_purchases INTEGER NOT NULL DEFAULT 0,
      net INTEGER NOT NULL DEFAULT 0,
      payable INTEGER NOT NULL DEFAULT 0,
      credit_carried INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_vat_returns_source
      ON finance_vat_returns(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_finance_vat_returns_period
      ON finance_vat_returns(org_id, period_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      channel TEXT NOT NULL,
      owner TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_cases (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
      case_number TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      channel TEXT NOT NULL,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sla_due_at TEXT NOT NULL,
      sla_status TEXT NOT NULL,
      ai_suggestion TEXT NOT NULL,
      knowledge_article TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_service_cases_customer
      ON service_cases(org_id, customer_id, status, priority);

    CREATE TABLE IF NOT EXISTS case_messages (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
      author_type TEXT NOT NULL,
      author_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      body TEXT NOT NULL,
      approval_state TEXT NOT NULL DEFAULT 'not-required',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_case_escalations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      escalated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      response_due_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      source_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_service_case_escalations_source
      ON service_case_escalations(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_service_case_escalations_customer
      ON service_case_escalations(org_id, customer_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS service_case_resolutions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      escalation_id TEXT REFERENCES service_case_escalations(id) ON DELETE SET NULL,
      resolution_code TEXT NOT NULL,
      summary TEXT NOT NULL,
      satisfaction_score INTEGER,
      customer_confirmed_at TEXT,
      payload TEXT NOT NULL,
      source_key TEXT NOT NULL,
      resolved_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_service_case_resolutions_source
      ON service_case_resolutions(org_id, source_key);

    CREATE INDEX IF NOT EXISTS idx_service_case_resolutions_customer
      ON service_case_resolutions(org_id, customer_id, resolved_at DESC);

    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      trigger_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS automation_rule_versions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      enabled INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      checksum TEXT NOT NULL,
      changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      changed_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_rule_versions_number
      ON automation_rule_versions(org_id, rule_id, version_number);

    CREATE INDEX IF NOT EXISTS idx_automation_rule_versions_rule
      ON automation_rule_versions(org_id, rule_id, changed_at DESC);

    CREATE TABLE IF NOT EXISTS integration_connectors (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      connector_key TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      provider TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      status TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'sandbox',
      endpoint_url TEXT NOT NULL DEFAULT '',
      scopes TEXT NOT NULL DEFAULT '[]',
      capabilities TEXT NOT NULL DEFAULT '[]',
      required_scopes TEXT NOT NULL DEFAULT '[]',
      owner_role TEXT NOT NULL DEFAULT 'Admin',
      data_boundary TEXT NOT NULL,
      rebuild_policy TEXT NOT NULL,
      secret_hash TEXT NOT NULL DEFAULT '',
      secret_fingerprint TEXT NOT NULL DEFAULT '',
      last_health_status TEXT,
      last_health_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, connector_key)
    );

    CREATE INDEX IF NOT EXISTS idx_integration_connectors_org
      ON integration_connectors(org_id, status, connector_key);

    CREATE TABLE IF NOT EXISTS integration_connector_checks (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      connector_id TEXT REFERENCES integration_connectors(id) ON DELETE SET NULL,
      connector_key TEXT NOT NULL,
      status TEXT NOT NULL,
      checks TEXT NOT NULL,
      missing_scopes TEXT NOT NULL DEFAULT '[]',
      sample_event TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      checked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_integration_connector_checks_org
      ON integration_connector_checks(org_id, connector_key, checked_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_template_installs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_template_installs_org
      ON pilot_template_installs(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_owner_briefs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      install_id TEXT NOT NULL REFERENCES pilot_template_installs(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      report_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_owner_briefs_org
      ON pilot_owner_briefs(org_id, template_key, report_date DESC);

    CREATE TABLE IF NOT EXISTS pilot_operator_workbenches (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      brief_id TEXT NOT NULL REFERENCES pilot_owner_briefs(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      report_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_operator_workbenches_org
      ON pilot_operator_workbenches(org_id, template_key, report_date DESC);

    CREATE TABLE IF NOT EXISTS pilot_accountant_reviews (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      workbench_id TEXT NOT NULL REFERENCES pilot_operator_workbenches(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      report_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_accountant_reviews_org
      ON pilot_accountant_reviews(org_id, template_key, report_date DESC);

    CREATE TABLE IF NOT EXISTS pilot_launch_readiness_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      accountant_review_id TEXT NOT NULL REFERENCES pilot_accountant_reviews(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      target_launch_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_launch_readiness_packets_org
      ON pilot_launch_readiness_packets(org_id, template_key, target_launch_date DESC);

    CREATE TABLE IF NOT EXISTS pilot_launch_remediation_plans (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      launch_readiness_id TEXT NOT NULL REFERENCES pilot_launch_readiness_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      target_launch_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_launch_remediation_plans_org
      ON pilot_launch_remediation_plans(org_id, template_key, target_launch_date DESC);

    CREATE TABLE IF NOT EXISTS pilot_remediation_action_resolutions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      remediation_plan_id TEXT NOT NULL REFERENCES pilot_launch_remediation_plans(id) ON DELETE CASCADE,
      launch_readiness_id TEXT NOT NULL REFERENCES pilot_launch_readiness_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      target_launch_date TEXT NOT NULL,
      action_key TEXT NOT NULL,
      action_title TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      source_gate TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      evidence TEXT NOT NULL,
      money_at_risk INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, remediation_plan_id, action_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_remediation_action_resolutions_org
      ON pilot_remediation_action_resolutions(org_id, template_key, resolved_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_launch_clearance_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      remediation_plan_id TEXT NOT NULL REFERENCES pilot_launch_remediation_plans(id) ON DELETE CASCADE,
      launch_readiness_id TEXT NOT NULL REFERENCES pilot_launch_readiness_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      target_launch_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      resolved_action_count INTEGER NOT NULL DEFAULT 0,
      unresolved_action_count INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_launch_clearance_packets_org
      ON pilot_launch_clearance_packets(org_id, template_key, target_launch_date DESC);

    CREATE TABLE IF NOT EXISTS pilot_paid_offer_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      clearance_packet_id TEXT NOT NULL REFERENCES pilot_launch_clearance_packets(id) ON DELETE CASCADE,
      remediation_plan_id TEXT NOT NULL REFERENCES pilot_launch_remediation_plans(id) ON DELETE CASCADE,
      launch_readiness_id TEXT NOT NULL REFERENCES pilot_launch_readiness_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      target_launch_date TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      setup_fee INTEGER NOT NULL DEFAULT 0,
      monthly_ops_fee INTEGER NOT NULL DEFAULT 0,
      first_month_total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_paid_offer_packets_org
      ON pilot_paid_offer_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_offer_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      clearance_packet_id TEXT NOT NULL REFERENCES pilot_launch_clearance_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      first_month_total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_offer_quote_handoff_packets_org
      ON pilot_offer_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      quote_handoff_id TEXT NOT NULL REFERENCES pilot_offer_quote_handoff_packets(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_quote_release_packets_org
      ON pilot_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      quote_release_packet_id TEXT NOT NULL REFERENCES pilot_quote_release_packets(id) ON DELETE CASCADE,
      quote_handoff_id TEXT NOT NULL REFERENCES pilot_offer_quote_handoff_packets(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_quote_acceptance_handoff_packets_org
      ON pilot_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      quote_release_packet_id TEXT NOT NULL REFERENCES pilot_quote_release_packets(id) ON DELETE CASCADE,
      quote_handoff_id TEXT NOT NULL REFERENCES pilot_offer_quote_handoff_packets(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_hayhashvapah_draft_invoice_packets_org
      ON pilot_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      draft_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      quote_release_packet_id TEXT NOT NULL REFERENCES pilot_quote_release_packets(id) ON DELETE CASCADE,
      quote_handoff_id TEXT NOT NULL REFERENCES pilot_offer_quote_handoff_packets(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_hayhashvapah_invoice_posting_packets_org
      ON pilot_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      draft_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      quote_release_packet_id TEXT NOT NULL REFERENCES pilot_quote_release_packets(id) ON DELETE CASCADE,
      quote_handoff_id TEXT NOT NULL REFERENCES pilot_offer_quote_handoff_packets(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_hayhashvapah_payment_collection_packets_org
      ON pilot_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      draft_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      quote_release_packet_id TEXT NOT NULL REFERENCES pilot_quote_release_packets(id) ON DELETE CASCADE,
      quote_handoff_id TEXT NOT NULL REFERENCES pilot_offer_quote_handoff_packets(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES pilot_paid_offer_packets(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_closeout_packets_org
      ON pilot_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_quote_handoff_packets_org
      ON pilot_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_quote_release_packets_org
      ON pilot_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_quote_acceptance_handoff_packets_org
      ON pilot_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL,
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      next_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_renewal_closeout_packets_org
      ON pilot_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_quote_handoff_packets_org
      ON pilot_next_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_quote_release_packets_org
      ON pilot_next_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_quote_acceptance_handoff_packets_org
      ON pilot_next_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_next_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_next_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_next_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      following_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_renewal_closeout_packets_org
      ON pilot_next_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_quote_handoff_packets_org
      ON pilot_following_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_quote_release_packets_org
      ON pilot_following_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_quote_acceptance_handoff_packets_org
      ON pilot_following_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_following_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_following_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_following_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      subsequent_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_renewal_closeout_packets_org
      ON pilot_following_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_quote_handoff_packets_org
      ON pilot_subsequent_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_quote_release_packets_org
      ON pilot_subsequent_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_quote_acceptance_handoff_packets_org
      ON pilot_subsequent_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      continuation_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_renewal_closeout_packets_org
      ON pilot_subsequent_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_quote_handoff_packets_org
      ON pilot_continuation_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_quote_release_packets_org
      ON pilot_continuation_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_quote_acceptance_handoff_packets_org
      ON pilot_continuation_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_continuation_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_continuation_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_renewal_quote_release_packets(id) ON DELETE CASCADE,
      renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      ongoing_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_continuation_renewal_closeout_packets_org
      ON pilot_continuation_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_quote_handoff_packets_org
      ON pilot_ongoing_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_quote_release_packets_org
      ON pilot_ongoing_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_quote_acceptance_handoff_packets_org
      ON pilot_ongoing_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ongoing_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      next_ongoing_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_ongoing_renewal_closeout_packets_org
      ON pilot_ongoing_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_quote_handoff_packets_org
      ON pilot_next_ongoing_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_quote_release_packets_org
      ON pilot_next_ongoing_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_quote_acceptance_handoff_packets_org
      ON pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      continuation_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_release_packets(id) ON DELETE CASCADE,
      continuation_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_ongoing_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      continuation_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      continuation_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      following_ongoing_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_ongoing_renewal_closeout_packets_org
      ON pilot_next_ongoing_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_quote_handoff_packets_org
      ON pilot_following_ongoing_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_quote_release_packets_org
      ON pilot_following_ongoing_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_quote_acceptance_handoff_packets_org
      ON pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_following_ongoing_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      subsequent_ongoing_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_following_ongoing_renewal_closeout_packets_org
      ON pilot_following_ongoing_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_quote_handoff_packets_org
      ON pilot_subsequent_ongoing_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_quote_release_packets_org
      ON pilot_subsequent_ongoing_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets_org
      ON pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_subsequent_ongoing_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      next_recurring_ongoing_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_subsequent_ongoing_renewal_closeout_packets_org
      ON pilot_subsequent_ongoing_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_quote_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      monthly_total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_quote_handoff_packets_org
      ON pilot_next_recurring_ongoing_renewal_quote_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_quote_release_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_recurring_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      public_token TEXT NOT NULL,
      public_url TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_quote_release_packets_org
      ON pilot_next_recurring_ongoing_renewal_quote_release_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_recurring_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets_org
      ON pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_hayhashvapah_draft_invoice_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_recurring_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      finance_approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      draft_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_hayhashvapah_draft_invoice_packets_org
      ON pilot_next_recurring_ongoing_renewal_hayhashvapah_draft_invoice_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_hayhashvapah_invoice_posting_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_recurring_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_hayhashvapah_invoice_posting_packets_org
      ON pilot_next_recurring_ongoing_renewal_hayhashvapah_invoice_posting_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_hayhashvapah_payment_collection_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_recurring_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_hayhashvapah_payment_collection_packets_org
      ON pilot_next_recurring_ongoing_renewal_hayhashvapah_payment_collection_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_next_recurring_ongoing_renewal_closeout_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_key TEXT NOT NULL,
      next_recurring_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_recurring_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_subsequent_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      following_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_following_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_draft_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_hayhashvapah_draft_invoice_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_acceptance_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_acceptance_handoff_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_release_packet_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_release_packets(id) ON DELETE CASCADE,
      next_ongoing_renewal_quote_handoff_id TEXT NOT NULL REFERENCES pilot_next_ongoing_renewal_quote_handoff_packets(id) ON DELETE CASCADE,
      ongoing_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_closeout_packets(id) ON DELETE CASCADE,
      ongoing_renewal_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      ongoing_renewal_posting_packet_id TEXT NOT NULL REFERENCES pilot_ongoing_renewal_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      continuation_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_continuation_renewal_closeout_packets(id) ON DELETE CASCADE,
      subsequent_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_subsequent_renewal_closeout_packets(id) ON DELETE CASCADE,
      following_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_following_renewal_closeout_packets(id) ON DELETE CASCADE,
      next_renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_next_renewal_closeout_packets(id) ON DELETE CASCADE,
      renewal_closeout_packet_id TEXT NOT NULL REFERENCES pilot_renewal_closeout_packets(id) ON DELETE CASCADE,
      closeout_packet_id TEXT NOT NULL REFERENCES pilot_closeout_packets(id) ON DELETE CASCADE,
      prior_payment_collection_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_payment_collection_packets(id) ON DELETE CASCADE,
      prior_posting_packet_id TEXT NOT NULL REFERENCES pilot_hayhashvapah_invoice_posting_packets(id) ON DELETE CASCADE,
      renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      continuation_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      subsequent_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      next_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      following_recurring_ongoing_renewal_task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      acceptance_id TEXT NOT NULL REFERENCES quote_acceptances(id) ON DELETE CASCADE,
      draft_invoice_id TEXT NOT NULL REFERENCES finance_draft_invoices(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_link_id TEXT NOT NULL REFERENCES finance_invoice_links(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_key TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      closeout_date TEXT NOT NULL,
      following_recurring_ongoing_renewal_due_date TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      vat_mode TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, source_key)
    );

    CREATE INDEX IF NOT EXISTS idx_pilot_next_recurring_ongoing_renewal_closeout_packets_org
      ON pilot_next_recurring_ongoing_renewal_closeout_packets(org_id, template_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org
      ON webhook_endpoints(org_id, enabled);

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      request_body TEXT NOT NULL,
      response_status INTEGER,
      response_body TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      next_retry_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org
      ON webhook_deliveries(org_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_approvals (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      rule_id TEXT REFERENCES automation_rules(id) ON DELETE SET NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      action_key TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload TEXT NOT NULL,
      decided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      decided_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_approvals_status
      ON workflow_approvals(org_id, status, risk_level);

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      approval_id TEXT REFERENCES workflow_approvals(id) ON DELETE SET NULL,
      rule_id TEXT REFERENCES automation_rules(id) ON DELETE SET NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      action_key TEXT NOT NULL,
      status TEXT NOT NULL,
      result_type TEXT NOT NULL,
      result_id TEXT,
      payload TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_runs_approval
      ON workflow_runs(org_id, approval_id)
      WHERE approval_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_workflow_runs_customer
      ON workflow_runs(org_id, customer_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_dry_runs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      trigger_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      status TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1,
      matched_subject_type TEXT NOT NULL,
      matched_subject_id TEXT NOT NULL,
      result_preview TEXT NOT NULL,
      guardrails TEXT NOT NULL,
      checksum TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_dry_runs_customer
      ON workflow_dry_runs(org_id, customer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_workflow_dry_runs_rule
      ON workflow_dry_runs(org_id, rule_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_test_events (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      trigger_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL,
      evaluation TEXT NOT NULL,
      input_payload TEXT NOT NULL,
      guardrails TEXT NOT NULL,
      checksum TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_test_events_customer
      ON workflow_test_events(org_id, customer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_workflow_test_events_rule
      ON workflow_test_events(org_id, rule_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS legal_sources (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      source_url TEXT NOT NULL,
      status TEXT NOT NULL,
      effective_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legal_source_reviews (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      legal_source_id TEXT NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
      reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      status TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      review_note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_legal_source_reviews_source
      ON legal_source_reviews(org_id, legal_source_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS legal_questions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      asked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      question TEXT NOT NULL,
      topic TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_legal_questions_customer
      ON legal_questions(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS legal_answers (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES legal_questions(id) ON DELETE CASCADE,
      answer TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      review_required INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_answers_question
      ON legal_answers(org_id, question_id);

    CREATE TABLE IF NOT EXISTS legal_answer_sources (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      answer_id TEXT NOT NULL REFERENCES legal_answers(id) ON DELETE CASCADE,
      legal_source_id TEXT NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
      citation_label TEXT NOT NULL,
      relevance INTEGER NOT NULL,
      excerpt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_legal_answer_sources_answer
      ON legal_answer_sources(org_id, answer_id);

    CREATE TABLE IF NOT EXISTS legal_publications (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES legal_questions(id) ON DELETE CASCADE,
      answer_id TEXT NOT NULL REFERENCES legal_answers(id) ON DELETE CASCADE,
      approval_id TEXT NOT NULL REFERENCES workflow_approvals(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_ids TEXT NOT NULL,
      published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      published_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_publications_approval
      ON legal_publications(org_id, approval_id);

    CREATE INDEX IF NOT EXISTS idx_legal_publications_customer
      ON legal_publications(org_id, customer_id, published_at DESC);

    CREATE TABLE IF NOT EXISTS ai_customer_briefs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommended_next_actions TEXT NOT NULL,
      grounding_sources TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      advisory_only INTEGER NOT NULL DEFAULT 1,
      review_required INTEGER NOT NULL DEFAULT 0,
      model_policy TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_customer_briefs_customer
      ON ai_customer_briefs(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_deal_risk_briefs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      risk_factors TEXT NOT NULL,
      recommended_next_actions TEXT NOT NULL,
      grounding_sources TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      advisory_only INTEGER NOT NULL DEFAULT 1,
      review_required INTEGER NOT NULL DEFAULT 0,
      model_policy TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_deal_risk_briefs_deal
      ON ai_deal_risk_briefs(org_id, deal_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_deal_risk_briefs_customer
      ON ai_deal_risk_briefs(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_invoice_overdue_explanations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      days_past_due INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      vat INTEGER NOT NULL,
      suggested_follow_up TEXT NOT NULL,
      next_actions TEXT NOT NULL,
      grounding_sources TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      advisory_only INTEGER NOT NULL DEFAULT 1,
      review_required INTEGER NOT NULL DEFAULT 1,
      accountant_review_status TEXT NOT NULL,
      model_policy TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_invoice_overdue_explanations_invoice
      ON ai_invoice_overdue_explanations(org_id, invoice_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_invoice_overdue_explanations_customer
      ON ai_invoice_overdue_explanations(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_ticket_summaries (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommended_knowledge_article_id TEXT NOT NULL,
      recommended_knowledge_title TEXT NOT NULL,
      recommended_knowledge_review TEXT NOT NULL,
      recommended_next_actions TEXT NOT NULL,
      grounding_sources TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      advisory_only INTEGER NOT NULL DEFAULT 1,
      review_required INTEGER NOT NULL DEFAULT 1,
      model_policy TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_ticket_summaries_case
      ON ai_ticket_summaries(org_id, case_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_ticket_summaries_customer
      ON ai_ticket_summaries(org_id, customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_workflow_builder_suggestions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      suggested_rule_name TEXT NOT NULL,
      target_trigger TEXT NOT NULL,
      target_action TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1,
      required_apps TEXT NOT NULL,
      guardrails TEXT NOT NULL,
      suggested_payload TEXT NOT NULL,
      test_event_input TEXT NOT NULL,
      grounding_sources TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      advisory_only INTEGER NOT NULL DEFAULT 1,
      review_required INTEGER NOT NULL DEFAULT 1,
      model_policy TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_workflow_builder_suggestions_created
      ON ai_workflow_builder_suggestions(org_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS analytics_metric_snapshots (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      metric_id TEXT NOT NULL,
      metric_label TEXT NOT NULL,
      metric_unit TEXT NOT NULL,
      metric_value REAL NOT NULL,
      record_count INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      semantic_layer_version TEXT NOT NULL,
      source_apps TEXT NOT NULL,
      formula TEXT NOT NULL,
      definition TEXT NOT NULL,
      checksum TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      captured_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      captured_at TEXT NOT NULL,
      UNIQUE(org_id, metric_id, report_date)
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_metric_snapshots_metric
      ON analytics_metric_snapshots(org_id, metric_id, report_date);

    CREATE INDEX IF NOT EXISTS idx_analytics_metric_snapshots_date
      ON analytics_metric_snapshots(org_id, report_date DESC);

    CREATE TABLE IF NOT EXISTS analytics_report_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      period_key TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      metric_count INTEGER NOT NULL,
      snapshot_count INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      export_content TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_report_packets_org
      ON analytics_report_packets(org_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_analytics_report_packets_type
      ON analytics_report_packets(org_id, report_type, period_key);

    CREATE TABLE IF NOT EXISTS suite_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recorded',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_suite_events_customer
      ON suite_events(org_id, customer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_suite_events_type
      ON suite_events(org_id, event_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT,
      type TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_export_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      event_count INTEGER NOT NULL,
      first_event_id INTEGER,
      last_event_id INTEGER,
      checksum TEXT NOT NULL,
      chain_head TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_export_packets_org
      ON audit_export_packets(org_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS tenant_backup_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      table_counts TEXT NOT NULL,
      exclusions TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_backup_packets_org
      ON tenant_backup_packets(org_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS access_review_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      review_period TEXT NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_review_packets_org
      ON access_review_packets(org_id, created_at DESC);
  `);
}

function seedIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM organizations").get().count;
  if (count > 0) return;

  const now = new Date().toISOString();
  const orgId = "org-armosphera-demo";
  const seedLocale = activeSeedLocale();
  const seedCurrency = activeSeedCurrency();
  db.prepare(`
    INSERT INTO organizations (id, name, legal_name, tax_id, locale, currency, market, data_region, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orgId, "Armosphera Demo Clinic", "Արմոսֆերա Դեմո ՍՊԸ", "01234567", seedLocale, seedCurrency, "Armenia", "Armenia hosted / private tenant ready", now);

  db.prepare(`
    INSERT INTO users (id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("user-owner", orgId, DEFAULT_EMAIL, "Samvel Owner", "Owner", hashPassword(DEFAULT_PASSWORD), now);
  db.prepare(`
    INSERT INTO users (id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("user-operator", orgId, "operator@armosphera.local", "Armosphera Operator", "Operator", hashPassword(DEFAULT_PASSWORD), now);
  db.prepare(`
    INSERT INTO users (id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("user-support", orgId, "support@armosphera.local", "Support Lead", "Support", hashPassword(DEFAULT_PASSWORD), now);

  const apps = [
    ["crm", "Armosphera CRM", "Sales", "Customers, deals, quotes, inbox, tasks, and Armenian SMB Tubes.", "/app/crm", "partial-integration", 1],
    ["finance", "HayHashvapah Finance", "Finance", "Accounting, invoices, VAT, payroll, bank import, period locks, and Armenian legal RAG.", "/app/finance", "partial-integration", 2],
    ["copilot", "Legal & Accounting Copilot", "AI", "Armenian-first cited legal, accounting, payroll, month-close, privacy, and e-sign guidance.", "/app/copilot", "controlled-advisory", 3],
    ["desk", "Armosphera Desk", "Service", "Tickets, SLA-lite, channels, support knowledge, and customer portal.", "/app/desk", "new", 4],
    ["campaigns", "Campaigns & Forms", "Marketing", "Lead forms, segments, follow-up campaigns, consent, and unsubscribe.", "/app/campaigns", "new", 5],
    ["projects", "Projects", "Operations", "Client projects, tasks, milestones, time entries, and delivery state.", "/app/projects", "new", 6],
    ["inventory", "Catalog & Inventory", "Operations", "Products, warehouse balances, stock locations, and governed stock moves.", "/app/inventory", "new", 7],
    ["purchase", "Purchase", "Operations", "RFQs, purchase orders, stock receipts, and AP vendor-bill handoff.", "/app/purchase", "new", 8],
    ["people", "People", "HR", "Employee directory, onboarding, app access, leave-lite, and payroll handoff.", "/app/people", "new", 9],
    ["docs", "Docs & Sign", "Documents", "Templates, contracts, signatures, signed archive, and customer documents.", "/app/docs", "new", 10],
    ["analytics", "Analytics", "BI", "Cross-app dashboards, revenue, receivables, service, and automation KPIs.", "/app/analytics", "partial", 11],
    ["flow", "Flow & Creator", "Automation", "Event bus, rules, custom fields, custom modules, and applets.", "/app/flow", "partial", 12]
  ];
  const insertApp = db.prepare("INSERT INTO apps (id, name, category, description, route, maturity, priority) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const app of apps) insertApp.run(...app);

  const insertAssignment = db.prepare("INSERT INTO app_assignments (org_id, role, app_id, enabled) VALUES (?, ?, ?, ?)");
  for (const role of ["Owner", "Admin"]) {
    for (const app of apps) insertAssignment.run(orgId, role, app[0], 1);
  }
  for (const appId of ["crm", "finance", "desk", "campaigns", "projects", "inventory", "purchase", "analytics"]) {
    insertAssignment.run(orgId, "Operator", appId, 1);
  }
  for (const appId of ["crm", "desk", "docs"]) {
    insertAssignment.run(orgId, "Support", appId, 1);
  }

  const insertEmployee = db.prepare(`
    INSERT INTO people_employees (id, org_id, full_name, tax_id, position, department, gross_salary, employment_status, hire_date, email, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertEmployee.run("emp-anahit", orgId, "Անահիտ Հակոբյան", "10293847", "Գլխավոր հաշվապահ", "Finance", 600000, "active", "2024-02-01", "anahit@armosphera.local", "user-owner", now, now);
  insertEmployee.run("emp-davit", orgId, "Դավիթ Պետրոսյան", "55667788", "Վաճառքի մենեջեր", "Sales", 450000, "active", "2025-06-15", "davit@armosphera.local", "user-owner", now, now);
  insertEmployee.run("emp-mariam", orgId, "Մարիամ Սարգսյան", "99887766", "Աջակցման մասնագետ", "Service", 350000, "on-leave", "2025-09-01", "mariam@armosphera.local", "user-owner", now, now);

  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, org_id, name, tax_id, email, phone, segment, health_score, lifetime_value, open_receivables, last_touch)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCustomer.run("cust-nare", orgId, "Նարե Բժշկական Կենտրոն", "02576111", "finance@nareclinic.am", "+374 91 224455", "Clinic", 86, 14200000, 960000, "2026-05-25");
  insertCustomer.run("cust-ani", orgId, "Անի Գեղեցկության Սրահ", "01888999", "owner@anibeauty.am", "+374 77 808080", "Beauty", 74, 5400000, 180000, "2026-05-24");
  insertCustomer.run("cust-van", orgId, "Վանաձոր Տուր ՍՊԸ", "04444123", "ops@vanadzortour.am", "+374 55 441122", "Tourism", 61, 3900000, 0, "2026-05-22");

  const insertDocument = db.prepare(`
    INSERT INTO documents (id, org_id, title, body, doc_type, status, customer_id, sealed_checksum, sealed_at, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDocument.run("doc-ani-service", orgId, "Սպասարկման պայմանագիր — Անի Գեղեցկության Սրահ", "Կողմերը պայմանավորվում են մատուցել ամսական սպասարկման ծառայություններ՝ համաձայն հավելվածի.", "agreement", "draft", "cust-ani", "", "", "user-owner", now, now);
  insertDocument.run("doc-anahit-nda", orgId, "Գաղտնիության համաձայնագիր (NDA)", "Աշխատակիցը պարտավորվում է պահպանել գործատուի առևտրային գաղտնիքը.", "nda", "out-for-signature", null, "", "", "user-owner", now, now);
  db.prepare(`
    INSERT INTO document_signers (id, org_id, document_id, signer_name, signer_email, signer_user_id, sign_order, status, signed_at, ip_address, user_agent, checksum, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("dsign-anahit", orgId, "doc-anahit-nda", "Անահիտ Հակոբյան", "anahit@armosphera.local", null, 0, "pending", "", "", "", "", now);

  const insertDeal = db.prepare(`
    INSERT INTO deals (id, org_id, customer_id, title, stage, value, currency, probability, next_step)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDeal.run("deal-nare-retainer", orgId, "cust-nare", "Annual patient retention automation", "Proposal", 3200000, seedCurrency, 70, "Send Armenian quote and confirm VAT treatment");
  insertDeal.run("deal-ani-inbox", orgId, "cust-ani", "Instagram + WhatsApp inbox setup", "Negotiation", 950000, seedCurrency, 55, "Review package table with owner");
  insertDeal.run("deal-van-season", orgId, "cust-van", "Summer booking workflow", "Discovery", 720000, seedCurrency, 35, "Map booking form to CRM fields");

  const insertProject = db.prepare(`
    INSERT INTO projects (id, org_id, name, description, status, customer_id, deal_id, start_date, due_date, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProject.run("proj-nare-retention", orgId, "Հիվանդների պահպանման ավտոմատացում", "Նարե կլինիկայի ամսական հիշեցումների ներդրում.", "active", "cust-nare", "deal-nare-retainer", "2026-05-01", "2026-07-15", "user-owner", now, now);
  insertProject.run("proj-ani-inbox", orgId, "Inbox-ի կարգավորում (Instagram + WhatsApp)", "Անի սրահի հաղորդագրությունների միասնական մուտք.", "planning", "cust-ani", "deal-ani-inbox", "", "", "user-owner", now, now);
  const insertProjectTask = db.prepare(`
    INSERT INTO project_tasks (id, org_id, project_id, title, status, assignee_employee_id, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProjectTask.run("ptask-nare-1", orgId, "proj-nare-retention", "Կարգավորել հիշեցումների ձևանմուշները", "in-progress", "emp-davit", "2026-05-20", now, now);
  insertProjectTask.run("ptask-nare-2", orgId, "proj-nare-retention", "Միացնել WhatsApp ալիքը", "todo", "emp-mariam", "2026-06-01", now, now);
  db.prepare(`
    INSERT INTO project_milestones (id, org_id, project_id, title, due_date, reached, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run("pms-nare-1", orgId, "proj-nare-retention", "Փորձնական արձակում", "2026-06-15", 0, now, now);
  db.prepare(`
    INSERT INTO project_time_entries (id, org_id, project_id, task_id, minutes, entry_date, note, logged_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("pte-nare-1", orgId, "proj-nare-retention", "ptask-nare-1", 180, "2026-05-12", "Ձևանմուշների սկզբնական կարգավորում", "user-owner", now);

  db.prepare(`
    INSERT INTO forms (id, org_id, title, description, fields, status, submission_count, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "form-lead-intake", orgId, "Հետաքրքրության հայտ (Lead intake)", "Թողեք ձեր տվյալները և մենք կկապվենք ձեզ հետ.",
    JSON.stringify([
      { key: "companyName", label: "Ընկերություն", type: "text", required: true },
      { key: "contactName", label: "Կոնտակտային անձ", type: "text", required: true },
      { key: "email", label: "Էլ. փոստ", type: "email", required: true },
      { key: "phone", label: "Հեռախոս", type: "tel", required: true },
      { key: "interest", label: "Հետաքրքրությունը", type: "textarea", required: true }
    ]),
    "published", 0, "user-owner", now, now
  );

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (id, org_id, customer_id, number, status, total, vat, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertInvoice.run("inv-1007", orgId, "cust-nare", "HHV-1007", "overdue", 960000, 160000, "2026-05-20");
  insertInvoice.run("inv-1008", orgId, "cust-ani", "HHV-1008", "open", 180000, 30000, "2026-06-05");
  insertInvoice.run("inv-1009", orgId, "cust-van", "HHV-1009", "paid", 420000, 70000, "2026-05-17");

  const insertTicket = db.prepare(`
    INSERT INTO tickets (id, org_id, customer_id, subject, status, priority, channel, owner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTicket.run("ticket-nare-vat", orgId, "cust-nare", "Needs VAT invoice wording before procurement approval", "open", "high", "WhatsApp", "Mariam");
  insertTicket.run("ticket-ani-hours", orgId, "cust-ani", "Update salon working hours in bot answers", "open", "medium", "Telegram", "Arman");
  insertTicket.run("ticket-van-catalog", orgId, "cust-van", "Import seasonal package catalog", "waiting", "medium", "Email", "Mariam");

  const insertRule = db.prepare(`
    INSERT INTO automation_rules (id, org_id, name, trigger_key, action_key, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertRule.run("rule-won-invoice", orgId, "Deal won -> draft HayHashvapah invoice", "deal.stage_changed:won", "finance.invoice.propose", 1);
  insertRule.run("rule-overdue-task", orgId, "Overdue invoice -> CRM collection task", "invoice.overdue", "crm.task.create", 1);
  insertRule.run("rule-ticket-360", orgId, "High-priority ticket -> customer 360 alert", "ticket.priority:high", "customer360.alert", 1);

  const insertSource = db.prepare(`
    INSERT INTO legal_sources (id, org_id, title, jurisdiction, source_url, status, effective_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertSource.run("law-tax-code", orgId, "RA Tax Code Article 63 VAT rate", "Armenia", "https://www.arlis.am/hy/acts/224990", "needs-accountant-review", "2024-06-12");
  insertSource.run("law-personal-data", orgId, "RA Law on Protection of Personal Data", "Armenia", "https://www.arlis.am/DocumentView.aspx?docid=117034", "needs-lawyer-review", "2015-07-01");
  insertSource.run("law-esign", orgId, "RA Law on Electronic Document and Electronic Signature", "Armenia", "https://www.cba.am/EN/lalaws/Law_on_e_docs_and%20_e_signatures.pdf", "needs-lawyer-review", "2005-01-01");

  audit(db, orgId, "user-owner", "suite.seeded", { apps: apps.length, customers: 3 });
}

function ensureRoleLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  const userRows = [
    ["user-accountant", "accountant@armosphera.local", "HayHashvapah Accountant", "Accountant"],
    ["user-lawyer", "lawyer@armosphera.local", "Armosphera Lawyer", "Lawyer"],
    ["user-sales", "sales@armosphera.local", "Armosphera Sales", "Salesperson"],
    ["user-service-manager", "service.manager@armosphera.local", "Service Manager", "Service Manager"],
    ["user-auditor", "auditor@armosphera.local", "Read Only Auditor", "Auditor"]
  ];
  const roleApps = {
    Accountant: ["finance", "inventory", "purchase", "docs", "analytics"],
    Lawyer: ["docs", "analytics"],
    Salesperson: ["crm", "campaigns", "docs", "analytics"],
    "Service Manager": ["crm", "desk", "docs", "analytics", "flow"],
    Auditor: ["docs", "analytics"]
  };
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAssignment = db.prepare(`
    INSERT OR IGNORE INTO app_assignments (org_id, role, app_id, enabled)
    VALUES (?, ?, ?, 1)
  `);
  for (const org of orgs) {
    const now = new Date().toISOString();
    for (const [id, email, name, role] of userRows) {
      insertUser.run(id, org.id, email, name, role, hashPassword(DEFAULT_PASSWORD), now);
    }
    for (const [role, appIds] of Object.entries(roleApps)) {
      for (const appId of appIds) insertAssignment.run(org.id, role, appId);
    }
  }
}

function ensureSuiteAppLayer(db) {
  const apps = [
    ["copilot", "Legal & Accounting Copilot", "AI", "Armenian-first cited legal, accounting, payroll, month-close, privacy, and e-sign guidance.", "/app/copilot", "controlled-advisory", 3],
    ["inventory", "Catalog & Inventory", "Operations", "Products, warehouse balances, stock locations, and governed stock moves.", "/app/inventory", "new", 7],
    ["purchase", "Purchase", "Operations", "RFQs, purchase orders, stock receipts, and AP vendor-bill handoff.", "/app/purchase", "new", 8]
  ];
  const insertApp = db.prepare(`
    INSERT OR IGNORE INTO apps (id, name, category, description, route, maturity, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const app of apps) insertApp.run(...app);
  const appOrder = [
    ["crm", 1],
    ["finance", 2],
    ["copilot", 3],
    ["desk", 4],
    ["campaigns", 5],
    ["projects", 6],
    ["inventory", 7],
    ["purchase", 8],
    ["people", 9],
    ["docs", 10],
    ["analytics", 11],
    ["flow", 12]
  ];
  const updatePriority = db.prepare("UPDATE apps SET priority = ? WHERE id = ?");
  for (const [appId, priority] of appOrder) updatePriority.run(priority, appId);

  const orgs = db.prepare("SELECT id FROM organizations").all();
  const insertAssignment = db.prepare(`
    INSERT OR IGNORE INTO app_assignments (org_id, role, app_id, enabled)
    VALUES (?, ?, ?, 1)
  `);
  for (const org of orgs) {
    for (const role of ["Owner", "Admin", "Operator", "Accountant"]) {
      insertAssignment.run(org.id, role, "inventory");
      insertAssignment.run(org.id, role, "purchase");
    }
    for (const role of ["Owner", "Admin", "Accountant", "Lawyer", "Salesperson", "Service Manager", "Auditor"]) {
      insertAssignment.run(org.id, role, "copilot");
    }
  }
}

function ensureSessionGovernanceLayer(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(sessions)").all().map(column => column.name));
  const additions = {
    created_at: "TEXT NOT NULL DEFAULT ''",
    last_seen_at: "TEXT",
    user_agent: "TEXT NOT NULL DEFAULT ''",
    ip_address: "TEXT NOT NULL DEFAULT ''",
    mfa_verified: "INTEGER NOT NULL DEFAULT 0",
    revoked_at: "TEXT",
    revoked_by_user_id: "TEXT",
    revoked_reason: "TEXT NOT NULL DEFAULT ''"
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns.has(name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id, expires_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_revoked
      ON sessions(revoked_at, expires_at);
  `);
  const now = new Date().toISOString();
  db.prepare("UPDATE sessions SET created_at = ? WHERE created_at IS NULL OR created_at = ''").run(now);
}

function ensurePilotPacketLayer(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(pilot_quote_acceptance_handoff_packets)").all().map(column => column.name));
  const additions = {
    period_key: "TEXT NOT NULL DEFAULT ''",
    vat_mode: "TEXT NOT NULL DEFAULT ''"
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns.has(name)) db.exec(`ALTER TABLE pilot_quote_acceptance_handoff_packets ADD COLUMN ${name} ${definition}`);
  }
}

function ensureProfileLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const profileCount = db.prepare("SELECT COUNT(*) AS count FROM customer_profiles WHERE org_id = ?").get(org.id).count;
    if (profileCount === 0) seedCustomerProfiles(db, org.id);

    const eventCount = db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ?").get(org.id).count;
    if (eventCount === 0) seedSuiteEvents(db, org.id);
  }
}

function ensureServiceLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const caseCount = db.prepare("SELECT COUNT(*) AS count FROM service_cases WHERE org_id = ?").get(org.id).count;
    if (caseCount === 0) seedServiceCases(db, org.id);

    const approvalCount = db.prepare("SELECT COUNT(*) AS count FROM workflow_approvals WHERE org_id = ?").get(org.id).count;
    if (approvalCount === 0) seedWorkflowApprovals(db, org.id);
  }
}

function ensureWorkflowExecutionLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const taskCount = db.prepare("SELECT COUNT(*) AS count FROM crm_tasks WHERE org_id = ?").get(org.id).count;
    if (taskCount === 0) seedCrmTasks(db, org.id);
  }
}

function ensureWorkflowRuleVersions(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const rules = db.prepare("SELECT * FROM automation_rules WHERE org_id = ? ORDER BY id").all(org.id);
    const insertVersion = db.prepare(`
      INSERT INTO automation_rule_versions (
        id, org_id, rule_id, version_number, enabled, change_type, reason,
        checksum, changed_by_user_id, changed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(org_id, rule_id, version_number) DO NOTHING
    `);
    for (const rule of rules) {
      const changedAt = new Date().toISOString();
      const payload = {
        ruleId: rule.id,
        trigger: rule.trigger_key,
        action: rule.action_key,
        enabled: Boolean(rule.enabled),
        versionNumber: 1,
        changeType: "seeded"
      };
      const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      insertVersion.run(
        `rule-version-${rule.id}-1`,
        org.id,
        rule.id,
        1,
        rule.enabled ? 1 : 0,
        "seeded",
        "Initial seeded workflow rule version",
        checksum,
        "user-owner",
        changedAt
      );
    }
  }
}

function ensureFinanceLayer(db) {
  // Billing seam: mark which invoice (if any) a project time entry was billed on,
  // so converting unbilled time to an invoice can never double-bill. Idempotent for
  // databases created before this column existed.
  const timeCols = new Set(db.prepare("PRAGMA table_info(project_time_entries)").all().map(c => c.name));
  if (!timeCols.has("billed_invoice_id")) {
    db.exec("ALTER TABLE project_time_entries ADD COLUMN billed_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_project_time_entries_unbilled ON project_time_entries(org_id, project_id, billed_invoice_id)");
  // Per-employee payroll history: link each run to the employee it paid (ON DELETE SET NULL —
  // deleting an employee must NOT erase their payroll ledger history, only unlink it). Idempotent
  // for databases created before this column existed (employee_name free-text remains the fallback).
  const payrollCols = new Set(db.prepare("PRAGMA table_info(payroll_runs)").all().map(c => c.name));
  if (!payrollCols.has("employee_id")) {
    db.exec("ALTER TABLE payroll_runs ADD COLUMN employee_id TEXT REFERENCES people_employees(id) ON DELETE SET NULL");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_payroll_runs_employee ON payroll_runs(org_id, employee_id)");
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    seedFinancePeriods(db, org.id);
    seedDealInvoiceApproval(db, org.id);
    seedTaxRates(db, org.id);
  }
}

function ensureDocsTemplateLayer(db) {
  // Reusable document templates: a body with {{placeholder}} tokens + a declared variable list.
  // A template is a FACTORY for a normal draft document (no new lifecycle) — generation
  // substitutes known vars and leaves a visible FILL marker for the rest. Idempotent seed.
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) seedDocumentTemplates(db, org.id);
}

function seedDocumentTemplates(db, orgId) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM document_templates WHERE org_id = ?").get(orgId).count;
  if (existing > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO document_templates (id, org_id, template_key, name, doc_type, title_template, body_template, variables, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  // Variables {{orgName}}, {{customerName}}, {{date}} are auto-filled at generation time;
  // the rest are writer-supplied (or surface as a visible FILL marker).
  insert.run(`doctpl-${orgId}-nda`, orgId, "nda", "Գաղտնիության համաձայնագիր (NDA)", "nda",
    "Գաղտնիության համաձայնագիր — {{counterparty}}",
    "Սույն գաղտնիության համաձայնագիրը ({{date}}) կնքվում է {{orgName}}-ի և {{counterparty}}-ի միջև։\n\n" +
    "1. Կողմերը պարտավորվում են պահպանել միմյանց առևտրային գաղտնիքը՝ {{termMonths}} ամիս ժամկետով։\n" +
    "2. Գաղտնի տեղեկատվությունը չի կարող փոխանցվել երրորդ անձանց առանց գրավոր համաձայնության։\n" +
    "3. Սույն համաձայնագիրը կարգավորվում է ՀՀ օրենսդրությամբ։\n\n" +
    "Ստորագրված՝ {{orgName}} և {{counterparty}}։",
    JSON.stringify(["orgName", "counterparty", "date", "termMonths"]), now, now);
  insert.run(`doctpl-${orgId}-service`, orgId, "service", "Սպասարկման պայմանագիր", "agreement",
    "Սպասարկման պայմանագիր — {{customerName}}",
    "Սպասարկման պայմանագիր ({{date}}) {{orgName}}-ի (Կատարող) և {{customerName}}-ի (Պատվիրատու) միջև։\n\n" +
    "1. Կատարողը մատուցում է հետևյալ ծառայությունները՝ {{services}}։\n" +
    "2. Ամսական վճարը կազմում է {{monthlyFee}} ՀՀ դրամ՝ ներառյալ ԱԱՀ։\n" +
    "3. Պայմանագիրը գործում է {{startDate}}-ից՝ {{termMonths}} ամիս ժամկետով։\n" +
    "4. Սույն պայմանագիրը կարգավորվում է ՀՀ օրենսդրությամբ։\n\n" +
    "Կատարող՝ {{orgName}}    Պատվիրատու՝ {{customerName}}",
    JSON.stringify(["orgName", "customerName", "date", "services", "monthlyFee", "startDate", "termMonths"]), now, now);
  insert.run(`doctpl-${orgId}-offer`, orgId, "offer", "Աշխատանքի առաջարկ", "offer",
    "Աշխատանքի առաջարկ — {{candidateName}}",
    "Հարգելի՛ {{candidateName}},\n\n{{orgName}}-ն ուրախ է առաջարկել Ձեզ {{position}} պաշտոնը։\n\n" +
    "• Ամսական աշխատավարձ՝ {{grossSalary}} ՀՀ դրամ (համախառն)։\n" +
    "• Աշխատանքի սկիզբ՝ {{startDate}}։\n" +
    "• Փորձաշրջան՝ {{probationMonths}} ամիս։\n\n" +
    "Առաջարկը ուժի մեջ է մինչև {{date}}+14 օր։\n\n{{orgName}}",
    JSON.stringify(["orgName", "candidateName", "position", "grossSalary", "startDate", "probationMonths", "date"]), now, now);
}

function seedTaxRates(db, orgId) {
  // Effective-dated tax rates so recomputing a historical period uses the rate that applied
  // THEN, not today's. The CURRENT rates are seeded effective 2024-01-01 (before every test
  // fixture + demo date), so an "as-of" lookup for any present date resolves to today's values
  // and nothing changes until a future-dated row is added. Income-tax/pension/stamp pull from
  // payroll.DEFAULT_CONFIG (single source of truth); VAT is the inclusive 20% standard rate.
  const existing = db.prepare("SELECT COUNT(*) AS count FROM tax_rates WHERE org_id = ?").get(orgId).count;
  if (existing > 0) return;
  const now = new Date().toISOString();
  const effective = "2024-01-01";
  const insert = db.prepare("INSERT OR IGNORE INTO tax_rates (id, org_id, kind, effective_date, config, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run(`taxrate-${orgId}-payroll-2024`, orgId, "payroll", effective, JSON.stringify(payroll.DEFAULT_CONFIG), "RA payroll rates in force 2023+ (income tax 20%, tiered funded pension, stamp brackets)", now);
  insert.run(`taxrate-${orgId}-vat-2024`, orgId, "vat", effective, JSON.stringify({ rate: 0.2 }), "RA standard VAT 20% (Tax Code Article 63)", now);
}

function ensureQuoteLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    seedQuotes(db, org.id);
  }
}

function ensureCrmSalesLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const leadCount = db.prepare("SELECT COUNT(*) AS count FROM crm_leads WHERE org_id = ?").get(org.id).count;
    if (leadCount === 0) seedCrmLeads(db, org.id);
  }
}

function ensureCatalogLayer(db) {
  const quoteLineColumns = new Set(db.prepare("PRAGMA table_info(quote_lines)").all().map(column => column.name));
  const quoteLineAdditions = {
    catalog_item_id: "TEXT",
    catalog_item_variant_id: "TEXT",
    catalog_price_list_id: "TEXT",
    catalog_price_list_code: "TEXT NOT NULL DEFAULT ''",
    pricing_source: "TEXT NOT NULL DEFAULT 'manual'",
    pricing_customer_segment: "TEXT NOT NULL DEFAULT ''",
    discount_amount: "INTEGER NOT NULL DEFAULT 0",
    margin_status: "TEXT NOT NULL DEFAULT ''",
    margin_rule_code: "TEXT NOT NULL DEFAULT ''",
    margin_rule_minimum_percent: "REAL",
    margin_rule_target_percent: "REAL",
    vat_mode: "TEXT NOT NULL DEFAULT 'standard'",
    fiscal_receipt_required: "INTEGER NOT NULL DEFAULT 0"
  };
  for (const [name, definition] of Object.entries(quoteLineAdditions)) {
    if (!quoteLineColumns.has(name)) db.exec(`ALTER TABLE quote_lines ADD COLUMN ${name} ${definition}`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_lines_catalog_item ON quote_lines(org_id, catalog_item_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_lines_catalog_item_variant ON quote_lines(org_id, catalog_item_variant_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_lines_catalog_price_list ON quote_lines(org_id, catalog_price_list_id)");

  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    seedCatalogUnitsOfMeasure(db, org.id);
    const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM catalog_categories WHERE org_id = ?").get(org.id).count;
    const itemCount = db.prepare("SELECT COUNT(*) AS count FROM catalog_items WHERE org_id = ?").get(org.id).count;
    if (categoryCount === 0 || itemCount === 0) seedCatalogItems(db, org.id);
    backfillCatalogUnitsOfMeasureFromItems(db, org.id);
    seedCatalogItemVariants(db, org.id);
    seedCatalogMarginRules(db, org.id);
    seedCatalogPriceLists(db, org.id);
  }
}

function ensureInventoryLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    seedInventoryCore(db, org.id);
  }
}

function ensurePurchaseLayer(db) {
  const purchaseOrderColumns = new Set(db.prepare("PRAGMA table_info(purchase_orders)").all().map(column => column.name));
  if (!purchaseOrderColumns.has("vendor_id")) db.exec("ALTER TABLE purchase_orders ADD COLUMN vendor_id TEXT REFERENCES purchase_vendors(id) ON DELETE SET NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(org_id, vendor_id, status)");

  const purchaseOrderLineColumns = new Set(db.prepare("PRAGMA table_info(purchase_order_lines)").all().map(column => column.name));
  if (!purchaseOrderLineColumns.has("vendor_price_id")) db.exec("ALTER TABLE purchase_order_lines ADD COLUMN vendor_price_id TEXT REFERENCES purchase_vendor_prices(id) ON DELETE SET NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_vendor_price ON purchase_order_lines(org_id, vendor_price_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_vendor_prices_vendor ON purchase_vendor_prices(org_id, vendor_id, status, catalog_item_id)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
      stock_move_id TEXT NOT NULL REFERENCES stock_moves(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_order
      ON purchase_receipts(org_id, purchase_order_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_line
      ON purchase_receipts(org_id, purchase_order_line_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_reference
      ON purchase_receipts(org_id, purchase_order_id, reference);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
      stock_move_id TEXT NOT NULL REFERENCES stock_moves(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      returned_at TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_returns_order
      ON purchase_returns(org_id, purchase_order_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_returns_line
      ON purchase_returns(org_id, purchase_order_line_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_returns_reference
      ON purchase_returns(org_id, purchase_order_id, reference);
  `);

  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) seedPurchaseVendors(db, org.id);
}

function ensureMarketingLayer(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const campaignCount = db.prepare("SELECT COUNT(*) AS count FROM marketing_campaigns WHERE org_id = ?").get(org.id).count;
    if (campaignCount === 0) seedMarketingCampaigns(db, org.id);
  }
}

function ensureAnalyticsLayer(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_metric_snapshots (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      metric_id TEXT NOT NULL,
      metric_label TEXT NOT NULL,
      metric_unit TEXT NOT NULL,
      metric_value REAL NOT NULL,
      record_count INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      semantic_layer_version TEXT NOT NULL,
      source_apps TEXT NOT NULL,
      formula TEXT NOT NULL,
      definition TEXT NOT NULL,
      checksum TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      captured_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      captured_at TEXT NOT NULL,
      UNIQUE(org_id, metric_id, report_date)
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_metric_snapshots_metric
      ON analytics_metric_snapshots(org_id, metric_id, report_date);

    CREATE INDEX IF NOT EXISTS idx_analytics_metric_snapshots_date
      ON analytics_metric_snapshots(org_id, report_date DESC);

    CREATE TABLE IF NOT EXISTS analytics_report_packets (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      period_key TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      metric_count INTEGER NOT NULL,
      snapshot_count INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      payload TEXT NOT NULL,
      export_content TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_report_packets_org
      ON analytics_report_packets(org_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_analytics_report_packets_type
      ON analytics_report_packets(org_id, report_type, period_key);
  `);
}

function seedCustomerProfiles(db, orgId) {
  const now = new Date().toISOString();
  const customers = db.prepare("SELECT * FROM customers WHERE org_id = ? ORDER BY id").all(orgId);
  const profileMeta = {
    "cust-nare": ["profile-nare", 92, "marketing-consent-recorded", "sales-service-finance"],
    "cust-ani": ["profile-ani", 78, "consent-review-required", "sales-service"],
    "cust-van": ["profile-van", 71, "contract-only", "service-finance"]
  };

  const insertProfile = db.prepare(`
    INSERT INTO customer_profiles (
      id, org_id, customer_id, display_name, tax_id, data_quality_score,
      consent_status, processing_purpose, merge_status, owner_user_id, last_event_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSource = db.prepare(`
    INSERT INTO customer_profile_sources (
      id, org_id, profile_id, source_app, source_entity_type, source_entity_id,
      match_key, confidence, authoritative, last_synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const customer of customers) {
    const [profileId, score, consent, purpose] = profileMeta[customer.id] || [`profile-${customer.id}`, 65, "unknown", "customer-operations"];
    insertProfile.run(
      profileId,
      orgId,
      customer.id,
      customer.name,
      customer.tax_id,
      score,
      consent,
      purpose,
      "canonical",
      "user-owner",
      customer.last_touch,
      now
    );

    const sources = [
      ["crm", "customer", customer.id, `tin:${customer.tax_id || customer.name}`, 98, 1],
      ["finance", "contragent", `hhv-${customer.tax_id || customer.id}`, `tin:${customer.tax_id || customer.name}`, customer.tax_id ? 96 : 70, 1],
      ["desk", "ticket-thread", `desk-${customer.id}`, `phone:${customer.phone || customer.id}`, 82, 0],
      ["campaigns", "consent", `consent-${customer.id}`, `email:${customer.email || customer.id}`, consent.includes("recorded") ? 88 : 55, 0]
    ];
    for (const [sourceApp, entityType, entityId, matchKey, confidence, authoritative] of sources) {
      insertSource.run(
        `${profileId}-${sourceApp}`,
        orgId,
        profileId,
        sourceApp,
        entityType,
        entityId,
        matchKey,
        confidence,
        authoritative,
        now
      );
    }
  }
}

function seedSuiteEvents(db, orgId) {
  const base = Date.now() - 1000 * 60 * 60 * 24;
  const currency = currencyForOrg(db, orgId);
  const events = [
    ["customer.profile.linked", "customer_profile", "profile-nare", "cust-nare", "recorded", { sources: ["crm", "finance", "desk", "campaigns"], match: "tin" }],
    ["crm.deal.stage_changed", "deal", "deal-nare-retainer", "cust-nare", "recorded", { from: "Discovery", to: "Proposal", probability: 70 }],
    ["finance.invoice.overdue", "invoice", "inv-1007", "cust-nare", "needs-action", { number: "HHV-1007", total: 960000, currency, daysOverdue: 6 }],
    ["service.ticket.created", "ticket", "ticket-nare-vat", "cust-nare", "needs-action", { channel: "WhatsApp", priority: "high" }],
    ["workflow.dry_run.ready", "automation_rule", "rule-overdue-task", "cust-nare", "ready", { trigger: "invoice.overdue", action: "crm.task.create", approvalRequired: true }],
    ["campaign.consent.review_required", "customer_profile", "profile-ani", "cust-ani", "needs-review", { consentStatus: "consent-review-required" }]
  ];

  for (const [index, event] of events.entries()) {
    const [eventType, subjectType, subjectId, customerId, status, payload] = event;
    emitSuiteEvent(db, {
      orgId,
      actorUserId: "user-owner",
      eventType,
      subjectType,
      subjectId,
      customerId,
      payload,
      status,
      createdAt: new Date(base + index * 1000 * 60 * 45).toISOString()
    });
  }
}

function seedServiceCases(db, orgId) {
  const now = new Date().toISOString();
  const ticketRows = db.prepare("SELECT * FROM tickets WHERE org_id = ? ORDER BY id").all(orgId);
  const caseMeta = {
    "ticket-nare-vat": [
      "case-nare-vat",
      "AO-CASE-1001",
      "at-risk",
      "Confirm VAT wording from Article 63 source, then draft a procurement-safe WhatsApp reply for human approval.",
      "KB-AM-VAT-INVOICE-WORDING"
    ],
    "ticket-ani-hours": [
      "case-ani-hours",
      "AO-CASE-1002",
      "on-track",
      "Update bot answer and ask owner to confirm holiday opening hours before publishing.",
      "KB-BEAUTY-HOURS-BOT"
    ],
    "ticket-van-catalog": [
      "case-van-catalog",
      "AO-CASE-1003",
      "waiting-customer",
      "Request the seasonal package CSV, then map package price and VAT fields before import.",
      "KB-TOURISM-CATALOG-IMPORT"
    ]
  };
  const ownerByTicket = {
    "ticket-nare-vat": "user-support",
    "ticket-ani-hours": "user-operator",
    "ticket-van-catalog": "user-support"
  };

  const insertCase = db.prepare(`
    INSERT INTO service_cases (
      id, org_id, customer_id, ticket_id, case_number, subject, status, priority,
      channel, owner_user_id, sla_due_at, sla_status, ai_suggestion,
      knowledge_article, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT INTO case_messages (
      id, org_id, case_id, author_type, author_name, channel, body, approval_state, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [index, ticket] of ticketRows.entries()) {
    const [caseId, caseNumber, slaStatus, suggestion, knowledgeArticle] = caseMeta[ticket.id] || [
      `case-${ticket.id}`,
      `AO-CASE-${1100 + index}`,
      "on-track",
      "Review Customer 360 context before replying.",
      "KB-GENERAL-SERVICE"
    ];
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * (6 + index)).toISOString();
    const slaDueAt = new Date(Date.now() + 1000 * 60 * 60 * (4 + index * 8)).toISOString();
    insertCase.run(
      caseId,
      orgId,
      ticket.customer_id,
      ticket.id,
      caseNumber,
      ticket.subject,
      ticket.status === "waiting" ? "waiting-customer" : "open",
      ticket.priority,
      ticket.channel,
      ownerByTicket[ticket.id] || "user-support",
      slaDueAt,
      slaStatus,
      suggestion,
      knowledgeArticle,
      createdAt,
      now
    );
    insertMessage.run(
      `${caseId}-inbound`,
      orgId,
      caseId,
      "customer",
      ticket.channel,
      ticket.channel,
      ticket.subject,
      "not-required",
      createdAt
    );
    insertMessage.run(
      `${caseId}-draft`,
      orgId,
      caseId,
      "ai",
      "Armosphera Assistant",
      ticket.channel,
      suggestion,
      ticket.priority === "high" ? "requires-human-approval" : "draft",
      now
    );
  }
}

function seedWorkflowApprovals(db, orgId) {
  const now = new Date().toISOString();
  const currency = currencyForOrg(db, orgId);
  const approvals = [
    [
      "approval-overdue-nare",
      "rule-overdue-task",
      "cust-nare",
      "Create CRM collection task for overdue HayHashvapah invoice",
      "crm.task.create",
      "financial",
      "pending",
      "External follow-up touches receivable collection and must be approved by an owner.",
      { invoiceId: "inv-1007", total: 960000, currency, proposedChannel: "WhatsApp" }
    ],
    [
      "approval-vat-reply-nare",
      "rule-ticket-360",
      "cust-nare",
      "Approve VAT wording reply for procurement ticket",
      "service.reply.send",
      "legal",
      "pending",
      "VAT wording uses Armenian tax-law context and needs human review before sending.",
      { caseId: "case-nare-vat", knowledgeArticle: "KB-AM-VAT-INVOICE-WORDING" }
    ]
  ];

  const insertApproval = db.prepare(`
    INSERT INTO workflow_approvals (
      id, org_id, rule_id, customer_id, requested_by_user_id, title, action_key,
      risk_level, status, reason, payload, decided_by_user_id, decided_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const approval of approvals) {
    const [id, ruleId, customerId, title, actionKey, riskLevel, status, reason, payload] = approval;
    insertApproval.run(
      id,
      orgId,
      ruleId,
      customerId,
      "user-owner",
      title,
      actionKey,
      riskLevel,
      status,
      reason,
      JSON.stringify(payload),
      null,
      null,
      now
    );
    emitSuiteEvent(db, {
      orgId,
      actorUserId: "user-owner",
      eventType: "workflow.approval.requested",
      subjectType: "workflow_approval",
      subjectId: id,
      customerId,
      status: "needs-approval",
      payload: { title, actionKey, riskLevel }
    });
  }
}

function seedCrmTasks(db, orgId) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO crm_tasks (
      id, org_id, customer_id, deal_id, invoice_id, title, description, status,
      priority, source_key, owner_user_id, due_date, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "task-nare-vat-review",
    orgId,
    "cust-nare",
    "deal-nare-retainer",
    "inv-1007",
    "Review VAT wording before sending quote",
    "Accountant review needed before sending a procurement-safe Armenian response.",
    "open",
    "high",
    "seed:vat-review",
    "user-support",
    new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    now,
    now
  );
}

function seedFinancePeriods(db, orgId) {
  const now = new Date().toISOString();
  const periods = [
    ["period-2026-04", "2026-04", "2026-04-01", "2026-04-30", "closed", "2026-05-08T09:00:00.000Z", "user-owner", "Monthly VAT reporting submitted"],
    ["period-2026-05", "2026-05", "2026-05-01", "2026-05-31", "open", null, null, "Active operating period"],
    ["period-2026-06", "2026-06", "2026-06-01", "2026-06-30", "closed", "2026-05-26T09:00:00.000Z", "user-owner", "Upcoming renewal period locked until owner opens it"],
    ["period-2026-07", "2026-07", "2026-07-01", "2026-07-31", "closed", "2026-05-27T09:00:00.000Z", "user-owner", "Following renewal period locked until owner opens it"],
    ["period-2026-08", "2026-08", "2026-08-01", "2026-08-31", "closed", "2026-05-27T09:30:00.000Z", "user-owner", "Subsequent renewal period locked until owner opens it"],
    ["period-2026-09", "2026-09", "2026-09-01", "2026-09-30", "closed", "2026-05-27T10:00:00.000Z", "user-owner", "Continuation renewal period locked until owner opens it"],
    ["period-2026-10", "2026-10", "2026-10-01", "2026-10-31", "closed", "2026-05-27T10:30:00.000Z", "user-owner", "Ongoing renewal period locked until owner opens it"],
    ["period-2026-11", "2026-11", "2026-11-01", "2026-11-30", "closed", "2026-05-28T10:00:00.000Z", "user-owner", "Next ongoing renewal period locked until owner opens it"],
    ["period-2026-12", "2026-12", "2026-12-01", "2026-12-31", "closed", "2026-05-28T10:30:00.000Z", "user-owner", "Following ongoing renewal period locked until owner opens it"],
    ["period-2027-01", "2027-01", "2027-01-01", "2027-01-31", "closed", "2026-05-28T11:00:00.000Z", "user-owner", "Subsequent ongoing renewal period locked until owner opens it"],
    ["period-2027-02", "2027-02", "2027-02-01", "2027-02-28", "closed", "2026-05-28T11:30:00.000Z", "user-owner", "Next recurring ongoing renewal period locked until owner opens it"]
  ];
  const insertPeriod = db.prepare(`
    INSERT OR IGNORE INTO finance_periods (
      id, org_id, period_key, starts_on, ends_on, status, closed_at,
      closed_by_user_id, reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const period of periods) {
    insertPeriod.run(period[0], orgId, period[1], period[2], period[3], period[4], period[5], period[6], period[7], now, now);
  }
}

function seedDealInvoiceApproval(db, orgId) {
  const exists = db.prepare("SELECT id FROM workflow_approvals WHERE org_id = ? AND id = ?")
    .get(orgId, "approval-deal-nare-invoice");
  if (exists) return;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO workflow_approvals (
      id, org_id, rule_id, customer_id, requested_by_user_id, title, action_key,
      risk_level, status, reason, payload, decided_by_user_id, decided_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "approval-deal-nare-invoice",
    orgId,
    "rule-won-invoice",
    "cust-nare",
    "user-owner",
    "Create HayHashvapah draft invoice from accepted Nare deal",
    "finance.invoice.propose",
    "financial",
    "pending",
    "Draft invoice touches Armenian VAT, period lock, and accounting handoff; owner approval is required before HayHashvapah receives it.",
    JSON.stringify({
      dealId: "deal-nare-retainer",
      issueDate: "2026-05-26",
      periodKey: "2026-05",
      dueDays: 14,
      vatMode: "amd-inclusive-20"
    }),
    null,
    null,
    now
  );
  emitSuiteEvent(db, {
    orgId,
    actorUserId: "user-owner",
    eventType: "workflow.approval.requested",
    subjectType: "workflow_approval",
    subjectId: "approval-deal-nare-invoice",
    customerId: "cust-nare",
    status: "needs-approval",
    payload: { title: "Create HayHashvapah draft invoice from accepted Nare deal", actionKey: "finance.invoice.propose", riskLevel: "financial" }
  });
}

function seedQuotes(db, orgId) {
  const now = new Date().toISOString();
  const currency = currencyForOrg(db, orgId);
  const insertQuote = db.prepare(`
    INSERT INTO quotes (
      id, org_id, customer_id, deal_id, number, title, status, subtotal, vat,
      total, currency, valid_until, public_token, sent_at, accepted_at,
      created_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertLine = db.prepare(`
    INSERT INTO quote_lines (id, org_id, quote_id, description, quantity, unit_price, total, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  const aniTotal = 950000;
  const aniSubtotal = Math.round(aniTotal / 1.2);
  insertQuote.run(
    "quote-ani-inbox",
    orgId,
    "cust-ani",
    "deal-ani-inbox",
    "ARM-Q-2026-0008",
    "Instagram + WhatsApp inbox setup",
    "sent",
    aniSubtotal,
    aniTotal - aniSubtotal,
    aniTotal,
    currency,
    "2026-06-15",
    "public-quote-ani-inbox-token",
    "2026-05-26T09:00:00.000Z",
    null,
    "user-owner",
    now,
    now
  );
  insertLine.run("quote-line-ani-inbox-setup", orgId, "quote-ani-inbox", "Armosphera CRM inbox setup and channel mapping", 1, 550000, 550000, 1);
  insertLine.run("quote-line-ani-training", orgId, "quote-ani-inbox", "Operator training and HayHashvapah handoff checklist", 1, 400000, 400000, 2);

  const nareTotal = 3200000;
  const nareSubtotal = Math.round(nareTotal / 1.2);
  insertQuote.run(
    "quote-nare-retainer",
    orgId,
    "cust-nare",
    "deal-nare-retainer",
    "ARM-Q-2026-0007",
    "Annual patient retention automation",
    "sent",
    nareSubtotal,
    nareTotal - nareSubtotal,
    nareTotal,
    currency,
    "2026-06-10",
    "public-quote-nare-retainer-token",
    "2026-05-25T11:00:00.000Z",
    null,
    "user-owner",
    now,
    now
  );
  insertLine.run("quote-line-nare-retainer", orgId, "quote-nare-retainer", "Annual patient retention automation setup", 1, 2400000, 2400000, 1);
  insertLine.run("quote-line-nare-handoff", orgId, "quote-nare-retainer", "HayHashvapah invoice and VAT handoff configuration", 1, 800000, 800000, 2);
}

function seedCrmLeads(db, orgId) {
  const now = new Date().toISOString();
  const currency = currencyForOrg(db, orgId);
  db.prepare(`
    INSERT INTO crm_leads (
      id, org_id, company_name, contact_name, email, phone, tax_id, segment,
      source, channel, interest, estimated_value, currency, consent_status,
      score, rating, status, routed_to_user_id, next_action,
      created_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    "lead-yerevan-wellness",
    orgId,
    "Երևան Վելնես Կենտրոն",
    "Արմինե Հարությունյան",
    "armine@yerevanwellness.am",
    "+374 94 889900",
    "05550123",
    "Wellness",
    "Instagram",
    "WhatsApp",
    "Booking, WhatsApp reminders, package quotes, and HayHashvapah receivable follow-up",
    1800000,
    currency,
    "marketing-consent-recorded",
    88,
    "hot",
    "qualified",
    "user-sales",
    "Prepare Armenian quote package and confirm HayHashvapah billing details",
    "user-owner",
    now,
    now
  );
}

function seedCatalogItems(db, orgId) {
  const now = new Date().toISOString();
  const currency = currencyForOrg(db, orgId);
  const categorySeedId = baseId => catalogSeedId(orgId, baseId);
  const itemSeedId = baseId => catalogSeedId(orgId, baseId);
  seedCatalogUnitsOfMeasure(db, orgId);
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO catalog_categories (
      id, org_id, name, slug, parent_category_id, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const categories = [
    ["catcat-service-packages", "Service packages", "service-packages", null, "active"],
    ["catcat-tourism-packages", "Tourism packages", "tourism-packages", "catcat-service-packages", "active"],
    ["catcat-hardware", "POS and device hardware", "pos-device-hardware", null, "active"]
  ];
  for (const category of categories) {
    insertCategory.run(
      categorySeedId(category[0]),
      orgId,
      category[1],
      category[2],
      category[3] ? categorySeedId(category[3]) : null,
      category[4],
      now,
      now
    );
  }

  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO catalog_items (
      id, org_id, category_id, sku, name, description, item_type, status,
      unit_of_measure, list_price, standard_cost, currency, vat_mode,
      track_stock, track_lots, fiscal_receipt_required, created_by_user_id,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const items = [
    [
      "catitem-clinic-retention-package",
      "catcat-service-packages",
      "A1-CLINIC-RETENTION",
      "Clinic patient retention automation",
      "Monthly reminders, CRM activity routing, VAT-aware quote handoff, and service follow-up package.",
      "service",
      "active",
      "package",
      3200000,
      0,
      currency,
      "standard",
      0,
      0,
      1
    ],
    [
      "catitem-salon-inbox-package",
      "catcat-service-packages",
      "A1-SALON-INBOX",
      "Instagram and WhatsApp inbox setup",
      "Unified customer inbox setup for Armenian beauty salons with public quote and Docs handoff.",
      "service",
      "active",
      "package",
      950000,
      0,
      currency,
      "standard",
      0,
      0,
      1
    ],
    [
      "catitem-tourism-booking-workflow",
      "catcat-tourism-packages",
      "A1-TOUR-BOOKING",
      "Seasonal booking workflow package",
      "Tourism package catalog import, quote follow-up, customer portal intake, and support handoff.",
      "service",
      "active",
      "package",
      720000,
      0,
      currency,
      "standard",
      0,
      0,
      1
    ],
    [
      "catitem-pos-barcode-scanner",
      "catcat-hardware",
      "HW-BARCODE-SCANNER",
      "POS barcode scanner",
      "Stock-tracked retail hardware anchor for future POS, warehouse, and serial/lot workflows.",
      "stockable",
      "active",
      "unit",
      85000,
      62000,
      currency,
      "standard",
      1,
      0,
      1
    ]
  ];
  for (const item of items) {
    insertItem.run(itemSeedId(item[0]), orgId, categorySeedId(item[1]), item[2], item[3], item[4], item[5], item[6], item[7], item[8], item[9], item[10], item[11], item[12], item[13], item[14], null, now, now);
  }
}

function seedCatalogUnitsOfMeasure(db, orgId) {
  const now = new Date().toISOString();
  const unitSeedId = baseId => catalogSeedId(orgId, baseId);
  const insertUnit = db.prepare(`
    INSERT OR IGNORE INTO catalog_units_of_measure (
      id, org_id, code, name, kind, precision, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const units = [
    ["catuom-unit", "unit", "Unit", "unit", 0, "active"],
    ["catuom-package", "package", "Package", "service", 0, "active"],
    ["catuom-hour", "hour", "Hour", "time", 2, "active"],
    ["catuom-kg", "kg", "Kilogram", "weight", 3, "active"],
    ["catuom-liter", "liter", "Liter", "volume", 3, "active"]
  ];
  for (const unit of units) {
    insertUnit.run(unitSeedId(unit[0]), orgId, unit[1], unit[2], unit[3], unit[4], unit[5], now, now);
  }
}

function backfillCatalogUnitsOfMeasureFromItems(db, orgId) {
  const now = new Date().toISOString();
  const insertUnit = db.prepare(`
    INSERT OR IGNORE INTO catalog_units_of_measure (
      id, org_id, code, name, kind, precision, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows = db.prepare(`
    SELECT DISTINCT TRIM(unit_of_measure) AS code
    FROM catalog_items
    WHERE org_id = ?
      AND unit_of_measure IS NOT NULL
      AND TRIM(unit_of_measure) <> ''
  `).all(orgId);
  for (const row of rows) {
    const code = String(row.code || "").trim();
    if (!code) continue;
    const digest = crypto.createHash("sha256").update(`${orgId}:${code}`).digest("hex").slice(0, 16);
    insertUnit.run(catalogSeedId(orgId, `catuom-custom-${digest}`), orgId, code, code, "custom", 0, "active", now, now);
  }
}

function seedCatalogItemVariants(db, orgId) {
  const now = new Date().toISOString();
  const variantSeedId = baseId => catalogSeedId(orgId, baseId);
  const itemSeedId = baseId => catalogSeedId(orgId, baseId);
  const insertVariant = db.prepare(`
    INSERT OR IGNORE INTO catalog_item_variants (
      id, org_id, catalog_item_id, sku, name, attributes_json,
      unit_of_measure, list_price, standard_cost, currency, status,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const variantSets = [
    {
      itemId: itemSeedId("catitem-pos-barcode-scanner"),
      variants: [
        ["catvar-pos-scanner-usb", "HW-BARCODE-SCANNER-USB", "USB barcode scanner", { connectivity: "USB", warrantyMonths: 12 }],
        ["catvar-pos-scanner-bt", "HW-BARCODE-SCANNER-BT", "Bluetooth barcode scanner", { connectivity: "Bluetooth", warrantyMonths: 12 }]
      ]
    },
    {
      itemId: itemSeedId("catitem-clinic-retention-package"),
      variants: [
        ["catvar-clinic-retention-basic", "A1-CLINIC-RETENTION-BASIC", "Clinic retention basic package", { tier: "basic", channels: "SMS" }],
        ["catvar-clinic-retention-plus", "A1-CLINIC-RETENTION-PLUS", "Clinic retention plus package", { tier: "plus", channels: "SMS+WhatsApp" }]
      ]
    }
  ];
  const itemLookup = db.prepare(`
    SELECT id, unit_of_measure, list_price, standard_cost, currency
    FROM catalog_items
    WHERE org_id = ? AND id = ?
  `);
  for (const set of variantSets) {
    const item = itemLookup.get(orgId, set.itemId);
    if (!item) continue;
    for (const variant of set.variants) {
      insertVariant.run(
        variantSeedId(variant[0]),
        orgId,
        item.id,
        variant[1],
        variant[2],
        JSON.stringify(variant[3]),
        item.unit_of_measure,
        item.list_price,
        item.standard_cost,
        item.currency,
        "active",
        now,
        now
      );
    }
  }
}

function seedCatalogMarginRules(db, orgId) {
  const now = new Date().toISOString();
  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO catalog_margin_rules (
      id, org_id, code, name, scope_type, scope_value,
      minimum_margin_percent, target_margin_percent, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rules = [
    ["catmr-stockable-min-20", "STOCKABLE-MIN-20", "Stockable product minimum margin", "item_type", "stockable", 20, 30],
    ["catmr-service-min-35", "SERVICE-MIN-35", "Service package minimum margin", "item_type", "service", 35, 55],
    ["catmr-hardware-min-25", "HARDWARE-MIN-25", "POS hardware category minimum margin", "category", catalogSeedId(orgId, "catcat-hardware"), 25, 35]
  ];
  for (const rule of rules) {
    insertRule.run(
      catalogSeedId(orgId, rule[0]),
      orgId,
      rule[1],
      rule[2],
      rule[3],
      rule[4],
      rule[5],
      rule[6],
      "active",
      now,
      now
    );
  }
}

function seedCatalogPriceLists(db, orgId) {
  const now = new Date().toISOString();
  const priceLists = [
    {
      baseId: "catpl-standard-sales",
      itemBaseId: "catpli-standard-sales",
      code: "STANDARD-SALES",
      name: "Standard sales price list",
      customerSegment: "standard",
      discountPercent: 0
    },
    {
      baseId: "catpl-loyalty-10",
      itemBaseId: "catpli-loyalty-10",
      code: "LOYALTY-10",
      name: "Loyalty 10% discount",
      customerSegment: "loyalty",
      discountPercent: 10
    }
  ];
  const insertList = db.prepare(`
    INSERT OR IGNORE INTO catalog_price_lists (
      id, org_id, code, name, customer_segment, currency, status,
      starts_at, ends_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const list of priceLists) {
    insertList.run(
      catalogSeedId(orgId, list.baseId),
      orgId,
      list.code,
      list.name,
      list.customerSegment,
      currencyForOrg(db, orgId),
      "active",
      null,
      null,
      now,
      now
    );
  }

  const items = db.prepare(`
    SELECT id, list_price, currency
    FROM catalog_items
    WHERE org_id = ? AND status = 'active'
    ORDER BY sku
  `).all(orgId);
  const variants = db.prepare(`
    SELECT catalog_item_variants.id, catalog_item_variants.catalog_item_id AS catalogItemId,
      catalog_item_variants.list_price AS listPrice, catalog_item_variants.currency
    FROM catalog_item_variants
    JOIN catalog_items ON catalog_items.id = catalog_item_variants.catalog_item_id
      AND catalog_items.org_id = catalog_item_variants.org_id
    WHERE catalog_item_variants.org_id = ?
      AND catalog_item_variants.status = 'active'
      AND catalog_items.status = 'active'
    ORDER BY catalog_items.sku, catalog_item_variants.sku
  `).all(orgId);
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO catalog_price_list_items (
      id, org_id, price_list_id, catalog_item_id, catalog_item_variant_id,
      min_quantity, list_price, discount_percent, currency, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const list of priceLists) {
    const priceListId = catalogSeedId(orgId, list.baseId);
    for (const item of items) {
      insertItem.run(
        catalogSeedId(orgId, `${list.itemBaseId}-${item.id}`),
        orgId,
        priceListId,
        item.id,
        null,
        1,
        item.list_price,
        list.discountPercent,
        item.currency,
        "active",
        now,
        now
      );
    }
    for (const variant of variants) {
      insertItem.run(
        catalogSeedId(orgId, `${list.itemBaseId}-${variant.id}`),
        orgId,
        priceListId,
        variant.catalogItemId,
        variant.id,
        1,
        variant.listPrice,
        list.discountPercent,
        variant.currency,
        "active",
        now,
        now
      );
    }
  }

  const itemById = new Map(items.map(item => [item.id, item]));
  const variantById = new Map(variants.map(variant => [variant.id, variant]));
  const scannerItemId = catalogSeedId(orgId, "catitem-pos-barcode-scanner");
  const quantityBreakRows = [
    {
      baseId: "catpli-standard-sales-qty5-catitem-pos-barcode-scanner",
      priceListId: catalogSeedId(orgId, "catpl-standard-sales"),
      catalogItemId: scannerItemId,
      catalogItemVariantId: null
    },
    {
      baseId: "catpli-standard-sales-qty5-catvar-pos-scanner-usb",
      priceListId: catalogSeedId(orgId, "catpl-standard-sales"),
      catalogItemId: scannerItemId,
      catalogItemVariantId: catalogSeedId(orgId, "catvar-pos-scanner-usb")
    },
    {
      baseId: "catpli-standard-sales-qty5-catvar-pos-scanner-bt",
      priceListId: catalogSeedId(orgId, "catpl-standard-sales"),
      catalogItemId: scannerItemId,
      catalogItemVariantId: catalogSeedId(orgId, "catvar-pos-scanner-bt")
    }
  ];
  for (const row of quantityBreakRows) {
    const item = itemById.get(row.catalogItemId);
    const variant = row.catalogItemVariantId ? variantById.get(row.catalogItemVariantId) : null;
    if (!item || (row.catalogItemVariantId && !variant)) continue;
    insertItem.run(
      catalogSeedId(orgId, row.baseId),
      orgId,
      row.priceListId,
      row.catalogItemId,
      row.catalogItemVariantId,
      5,
      variant?.listPrice || item.list_price,
      5,
      variant?.currency || item.currency,
      "active",
      now,
      now
    );
  }
}

function catalogSeedId(orgId, baseId) {
  if (orgId === "org-armosphera-demo") return baseId;
  const suffix = crypto.createHash("sha256").update(String(orgId)).digest("hex").slice(0, 12);
  return `${baseId}-${suffix}`;
}

function seedInventoryCore(db, orgId) {
  const now = new Date().toISOString();
  const seedId = baseId => stockSeedId(orgId, baseId);
  const insertLocation = db.prepare(`
    INSERT OR IGNORE INTO stock_locations (
      id, org_id, code, name, location_type, status, parent_location_id,
      created_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const locations = [
    ["stockloc-main-warehouse", "WH/STOCK", "Main warehouse", "internal", "active", null],
    ["stockloc-dispatch-staging", "WH/OUT", "Dispatch staging", "internal", "active", "stockloc-main-warehouse"],
    ["stockloc-supplier", "SUPPLIERS", "Supplier receipts", "supplier", "active", null],
    ["stockloc-customer", "CUSTOMERS", "Customer deliveries", "customer", "active", null],
    ["stockloc-inventory-adjustment", "INV/ADJUST", "Inventory adjustment", "inventory", "active", null],
    ["stockloc-scrap", "SCRAP", "Scrap and write-off", "scrap", "active", null]
  ];
  for (const location of locations) {
    insertLocation.run(seedId(location[0]), orgId, location[1], location[2], location[3], location[4], location[5] ? seedId(location[5]) : null, null, now, now);
  }
  if (orgId !== "org-armosphera-demo") return;

  const scannerItemId = catalogSeedId(orgId, "catitem-pos-barcode-scanner");
  const scanner = db.prepare("SELECT id, standard_cost FROM catalog_items WHERE org_id = ? AND id = ? AND track_stock = 1").get(orgId, scannerItemId);
  if (!scanner) return;

  const moveId = seedId("stockmove-pos-scanner-opening");
  db.prepare(`
    INSERT OR IGNORE INTO stock_moves (
      id, org_id, catalog_item_id, source_location_id, destination_location_id,
      move_type, quantity, unit_cost, total_cost, status, reason, reference,
      created_by_user_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    moveId,
    orgId,
    scanner.id,
    seedId("stockloc-inventory-adjustment"),
    seedId("stockloc-main-warehouse"),
    "adjustment",
    12,
    scanner.standard_cost,
    12 * scanner.standard_cost,
    "posted",
    "Opening stock for Armenian POS hardware demo inventory.",
    "OPENING-STOCK",
    null,
    now
  );
  db.prepare(`
    INSERT OR IGNORE INTO stock_quants (
      id, org_id, catalog_item_id, location_id, quantity, reserved_quantity,
      average_cost, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(seedId("stockquant-pos-scanner-main"), orgId, scanner.id, seedId("stockloc-main-warehouse"), 12, 0, scanner.standard_cost, now);
}

function seedPurchaseVendors(db, orgId) {
  if (orgId !== "org-armosphera-demo") return;
  const now = new Date().toISOString();
  const currency = currencyForOrg(db, orgId);
  const vendorId = purchaseSeedId(orgId, "vendor-yerevan-hardware-supply");
  db.prepare(`
    INSERT OR IGNORE INTO purchase_vendors (
      id, org_id, name, tax_id, email, phone, status, payment_terms_days,
      lead_time_days, note, created_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vendorId,
    orgId,
    "Yerevan Hardware Supply",
    "01234568",
    "procurement@yerevan-hardware.example",
    "+374 10 445566",
    "active",
    15,
    2,
    "Seeded Armenian hardware vendor for Purchase RFQ and receipt demos.",
    null,
    now,
    now
  );

  const scannerItemId = catalogSeedId(orgId, "catitem-pos-barcode-scanner");
  const scanner = db.prepare("SELECT id FROM catalog_items WHERE org_id = ? AND id = ? AND track_stock = 1").get(orgId, scannerItemId);
  if (!scanner) return;
  db.prepare(`
    INSERT OR IGNORE INTO purchase_vendor_prices (
      id, org_id, vendor_id, catalog_item_id, currency, unit_cost, min_quantity,
      lead_time_days, valid_from, valid_to, status, note, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)
  `).run(
    purchaseSeedId(orgId, "vendor-price-yerevan-hardware-barcode-scanner"),
    orgId,
    vendorId,
    scanner.id,
    currency,
    60000,
    1,
    2,
    "2026-01-01",
    "active",
    "Preferred POS scanner cost for Armenian SMB replenishment.",
    now,
    now
  );
}

function stockSeedId(orgId, baseId) {
  if (orgId === "org-armosphera-demo") return baseId;
  const suffix = crypto.createHash("sha256").update(String(orgId)).digest("hex").slice(0, 12);
  return `${baseId}-${suffix}`;
}

function purchaseSeedId(orgId, baseId) {
  if (orgId === "org-armosphera-demo") return baseId;
  const suffix = crypto.createHash("sha256").update(String(orgId)).digest("hex").slice(0, 12);
  return `${baseId}-${suffix}`;
}

function seedMarketingCampaigns(db, orgId) {
  const now = new Date().toISOString();
  const currency = currencyForOrg(db, orgId);
  db.prepare(`
    INSERT INTO marketing_campaigns (
      id, org_id, name, channel, audience, status, budget, currency,
      started_at, ended_at, owner_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    "camp-armenia-growth-pilot",
    orgId,
    "Instagram and WhatsApp pilot growth",
    "Instagram/WhatsApp",
    "Clinic, wellness, and tourism operators in Armenia",
    "active",
    250000,
    currency,
    "2026-05-01",
    null,
    "user-sales",
    now,
    now
  );

  const insertAttribution = db.prepare(`
    INSERT INTO marketing_attributions (
      id, org_id, campaign_id, customer_id, lead_id, deal_id, quote_id,
      source_type, source_key, attribution_weight, created_by_user_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(org_id, campaign_id, source_key) DO NOTHING
  `);
  insertAttribution.run(
    "attr-growth-pilot-wellness-lead",
    orgId,
    "camp-armenia-growth-pilot",
    null,
    "lead-yerevan-wellness",
    null,
    null,
    "lead-form",
    "lead:lead-yerevan-wellness",
    100,
    "user-sales",
    now
  );
  insertAttribution.run(
    "attr-growth-pilot-van-tour",
    orgId,
    "camp-armenia-growth-pilot",
    "cust-van",
    null,
    "deal-van-season",
    null,
    "operator-attribution",
    "customer:cust-van:deal-van-season",
    100,
    "user-sales",
    now
  );
  emitSuiteEvent(db, {
    orgId,
    actorUserId: "user-sales",
    eventType: "campaign.attribution.recorded",
    subjectType: "marketing_campaign",
    subjectId: "camp-armenia-growth-pilot",
    customerId: "cust-van",
    status: "recorded",
    payload: { campaignId: "camp-armenia-growth-pilot", dealId: "deal-van-season", sourceType: "operator-attribution" }
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, encoded) {
  const [salt, hash] = String(encoded || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function createSession(db, userId, options = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = new Date().toISOString();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const userAgent = String(options.userAgent || "").trim().slice(0, 240);
  const ipAddress = String(options.ipAddress || "").trim().slice(0, 80);
  const mfaVerified = options.mfaVerified ? 1 : 0;
  db.prepare(`
    INSERT INTO sessions (
      token, user_id, expires_at, created_at, last_seen_at,
      user_agent, ip_address, mfa_verified, revoked_at, revoked_by_user_id, revoked_reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, userId, expires, createdAt, createdAt, userAgent, ipAddress, mfaVerified, null, null, "");
  return { token, expires, createdAt };
}

function getUserBySession(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.id, users.org_id, users.email, users.name, users.role,
      sessions.expires_at, sessions.revoked_at, sessions.mfa_verified
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token = ?").run(new Date().toISOString(), token);
  return row;
}

function audit(db, orgId, userId, type, details) {
  db.prepare("INSERT INTO audit_events (org_id, user_id, type, details, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(orgId, userId || null, type, JSON.stringify(details || {}), new Date().toISOString());
}

function emitSuiteEvent(db, event) {
  const createdAt = event.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO suite_events (
      org_id, actor_user_id, event_type, subject_type, subject_id,
      customer_id, payload, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.orgId,
    event.actorUserId || null,
    event.eventType,
    event.subjectType,
    event.subjectId,
    event.customerId || null,
    JSON.stringify(event.payload || {}),
    event.status || "recorded",
    createdAt
  );

  if (event.customerId) {
    db.prepare(`
      UPDATE customer_profiles
      SET last_event_at = ?
      WHERE org_id = ? AND customer_id = ?
    `).run(createdAt, event.orgId, event.customerId);
  }
}

// Effective-dated rate lookup: "the rate of `kind` in force on `date`" — the row with the
// greatest effective_date that is <= date (mirrors the legal_sources effective-date pattern).
// Returns the parsed config object, or null if no rate is effective yet on that date.
function resolveTaxRate(db, orgId, kind, date) {
  const asOf = /^\d{4}-\d{2}-\d{2}/.test(String(date || "")) ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const row = db.prepare(
    "SELECT config FROM tax_rates WHERE org_id = ? AND kind = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1"
  ).get(orgId, kind, asOf);
  if (!row) return null;
  try { return JSON.parse(row.config); } catch { return null; }
}

// Payroll config in force on `date`; falls back to the hardcoded current defaults if no row
// (e.g. a DB that predates the tax_rates table and hasn't been re-seeded).
function resolvePayrollConfig(db, orgId, date) {
  return resolveTaxRate(db, orgId, "payroll", date) || payroll.DEFAULT_CONFIG;
}

// VAT rate fraction (e.g. 0.2) in force on `date`; defaults to 0.2 if no row.
function resolveVatRate(db, orgId, date) {
  const cfg = resolveTaxRate(db, orgId, "vat", date);
  const rate = cfg && Number(cfg.rate);
  return rate > 0 ? rate : 0.2;
}

module.exports = {
  DEFAULT_EMAIL,
  DEFAULT_PASSWORD,
  audit,
  createSession,
  emitSuiteEvent,
  getUserBySession,
  openDatabase,
  verifyPassword,
  resolveTaxRate,
  resolvePayrollConfig,
  resolveVatRate,
  __test: {
    backfillCatalogUnitsOfMeasureFromItems,
    ensureMoneyPrecisionMigration,
    seedInventoryCore
  }
};
