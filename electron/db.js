const path = require('node:path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db = null;

function getDbPath() {
  return path.join(app.getPath('userData'), 'usage.sqlite');
}

function init() {
  const file = getDbPath();
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate();
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      provider    TEXT NOT NULL,
      collected_at TEXT NOT NULL,                -- ISO timestamp
      period_start TEXT,                          -- ISO date
      period_end   TEXT,                          -- ISO date
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      requests      INTEGER DEFAULT 0,
      cost_usd      REAL DEFAULT 0,
      model         TEXT,
      raw_json      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_usage_provider_time
      ON usage_snapshots(provider, collected_at);

    CREATE TABLE IF NOT EXISTS quotas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      provider    TEXT NOT NULL UNIQUE,
      monthly_budget_usd REAL,
      monthly_token_limit INTEGER,
      reset_day   INTEGER DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      provider    TEXT NOT NULL,
      kind        TEXT NOT NULL,                 -- budget_pct | tokens_pct | absolute_cost | spike
      threshold   REAL NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      last_fired_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_config (
      provider     TEXT PRIMARY KEY,
      enabled      INTEGER NOT NULL DEFAULT 1,
      base_url     TEXT,
      encrypted_key BLOB,                         -- safeStorage encrypted
      key_kind     TEXT,                          -- e.g. 'admin', 'user'
      org_id       TEXT,
      extra_json   TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default provider rows so the UI has something to bind to.
  const defaults = [
    { provider: 'anthropic', base_url: 'https://api.anthropic.com' },
    { provider: 'openai', base_url: 'https://api.openai.com' },
    { provider: 'ollama', base_url: 'http://localhost:11434' },
    { provider: 'zai', base_url: 'https://api.z.ai/api/paas/v4' },
  ];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO provider_config (provider, base_url, enabled)
    VALUES (@provider, @base_url, 1)
  `);
  const tx = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  tx(defaults);
}

// ---------- Usage snapshots ----------

function insertSnapshots(rows) {
  if (!rows || rows.length === 0) return 0;
  const stmt = db.prepare(`
    INSERT INTO usage_snapshots
      (provider, collected_at, period_start, period_end,
       input_tokens, output_tokens, requests, cost_usd, model, raw_json)
    VALUES
      (@provider, @collected_at, @period_start, @period_end,
       @input_tokens, @output_tokens, @requests, @cost_usd, @model, @raw_json)
  `);
  const tx = db.transaction((items) => {
    for (const r of items) {
      stmt.run({
        provider: r.provider,
        collected_at: r.collected_at || new Date().toISOString(),
        period_start: r.period_start || null,
        period_end: r.period_end || null,
        input_tokens: r.input_tokens || 0,
        output_tokens: r.output_tokens || 0,
        requests: r.requests || 0,
        cost_usd: r.cost_usd || 0,
        model: r.model || null,
        raw_json: r.raw_json ? JSON.stringify(r.raw_json) : null,
      });
    }
  });
  tx(rows);
  return rows.length;
}

function getRecentSnapshots({ provider = null, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const where = provider ? 'WHERE provider = ? AND collected_at >= ?' : 'WHERE collected_at >= ?';
  const params = provider ? [provider, since] : [since];
  return db
    .prepare(`SELECT * FROM usage_snapshots ${where} ORDER BY collected_at DESC LIMIT 5000`)
    .all(...params);
}

function getDailySeries({ provider = null, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const where = provider
    ? 'WHERE provider = ? AND collected_at >= ?'
    : 'WHERE collected_at >= ?';
  const params = provider ? [provider, since] : [since];
  return db
    .prepare(
      `SELECT
         substr(collected_at, 1, 10) AS day,
         provider,
         SUM(input_tokens)  AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         SUM(requests)      AS requests,
         SUM(cost_usd)      AS cost_usd
       FROM usage_snapshots
       ${where}
       GROUP BY day, provider
       ORDER BY day ASC`,
    )
    .all(...params);
}

function getMonthToDateTotals() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return db
    .prepare(
      `SELECT
         provider,
         SUM(input_tokens)  AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         SUM(requests)      AS requests,
         SUM(cost_usd)      AS cost_usd
       FROM usage_snapshots
       WHERE collected_at >= ?
       GROUP BY provider`,
    )
    .all(monthStart);
}

// ---------- Provider config ----------

function getProviderConfigs() {
  return db.prepare('SELECT * FROM provider_config ORDER BY provider').all();
}

function getProviderConfig(provider) {
  return db.prepare('SELECT * FROM provider_config WHERE provider = ?').get(provider);
}

function upsertProviderConfig(cfg) {
  const stmt = db.prepare(`
    INSERT INTO provider_config (provider, enabled, base_url, encrypted_key, key_kind, org_id, extra_json, updated_at)
    VALUES (@provider, @enabled, @base_url, @encrypted_key, @key_kind, @org_id, @extra_json, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      enabled = excluded.enabled,
      base_url = excluded.base_url,
      encrypted_key = COALESCE(excluded.encrypted_key, provider_config.encrypted_key),
      key_kind = excluded.key_kind,
      org_id = excluded.org_id,
      extra_json = excluded.extra_json,
      updated_at = datetime('now')
  `);
  stmt.run({
    provider: cfg.provider,
    enabled: cfg.enabled ? 1 : 0,
    base_url: cfg.base_url || null,
    encrypted_key: cfg.encrypted_key || null,
    key_kind: cfg.key_kind || null,
    org_id: cfg.org_id || null,
    extra_json: cfg.extra_json ? JSON.stringify(cfg.extra_json) : null,
  });
}

function clearProviderKey(provider) {
  db.prepare('UPDATE provider_config SET encrypted_key = NULL WHERE provider = ?').run(provider);
}

// ---------- Quotas ----------

function getQuotas() {
  return db.prepare('SELECT * FROM quotas').all();
}

function upsertQuota(q) {
  db.prepare(`
    INSERT INTO quotas (provider, monthly_budget_usd, monthly_token_limit, reset_day, updated_at)
    VALUES (@provider, @monthly_budget_usd, @monthly_token_limit, @reset_day, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      monthly_budget_usd = excluded.monthly_budget_usd,
      monthly_token_limit = excluded.monthly_token_limit,
      reset_day = excluded.reset_day,
      updated_at = datetime('now')
  `).run({
    provider: q.provider,
    monthly_budget_usd: q.monthly_budget_usd ?? null,
    monthly_token_limit: q.monthly_token_limit ?? null,
    reset_day: q.reset_day ?? 1,
  });
}

// ---------- Alerts ----------

function getAlerts() {
  return db.prepare('SELECT * FROM alerts ORDER BY provider, kind').all();
}

function addAlert(a) {
  const r = db.prepare(`
    INSERT INTO alerts (provider, kind, threshold, enabled)
    VALUES (?, ?, ?, ?)
  `).run(a.provider, a.kind, a.threshold, a.enabled ? 1 : 0);
  return r.lastInsertRowid;
}

function deleteAlert(id) {
  db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
}

function setAlertFired(id) {
  db.prepare("UPDATE alerts SET last_fired_at = datetime('now') WHERE id = ?").run(id);
}

// ---------- Settings (k/v) ----------

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

module.exports = {
  init,
  insertSnapshots,
  getRecentSnapshots,
  getDailySeries,
  getMonthToDateTotals,
  getProviderConfigs,
  getProviderConfig,
  upsertProviderConfig,
  clearProviderKey,
  getQuotas,
  upsertQuota,
  getAlerts,
  addAlert,
  deleteAlert,
  setAlertFired,
  getSetting,
  setSetting,
};
