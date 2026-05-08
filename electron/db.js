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
  migrate(db);
  return db;
}

// ---------------------------------------------------------------------------
// Migration — user_version based
// ---------------------------------------------------------------------------

/**
 * Migrate the given database to the latest schema version.
 * Accepts the db instance explicitly so it can be unit-tested without
 * opening a real SQLite file.
 *
 * @param {import('better-sqlite3').Database} database
 */
function migrate(database) {
  const v = database.pragma('user_version', { simple: true });

  if (v < 2) {
    // Drop tables from the old schema (both the original names referenced in
    // the spec and the names that were used in the earlier implementation).
    database.exec(`
      DROP TABLE IF EXISTS snapshots;
      DROP TABLE IF EXISTS provider_configs;
      DROP TABLE IF EXISTS quotas;
      DROP TABLE IF EXISTS alerts;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS provider_config;
      DROP TABLE IF EXISTS usage_snapshots;
      DROP TABLE IF EXISTS provider_settings;
      DROP TABLE IF EXISTS app_prefs;

      CREATE TABLE usage_snapshots (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        provider         TEXT NOT NULL,
        fetched_at       INTEGER NOT NULL,
        session_pct      REAL,
        weekly_pct       REAL,
        session_reset_at INTEGER,
        weekly_reset_at  INTEGER,
        plan_level       TEXT,
        approximated     INTEGER NOT NULL DEFAULT 0,
        raw_json         TEXT,
        error_json       TEXT
      );
      CREATE INDEX idx_usage_snapshots_provider_fetched
        ON usage_snapshots (provider, fetched_at DESC);

      CREATE TABLE provider_settings (
        provider     TEXT PRIMARY KEY,
        connected    INTEGER NOT NULL DEFAULT 0,
        connected_at INTEGER,
        last_error   TEXT
      );

      CREATE TABLE app_prefs (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    database.pragma('user_version = 2');
  }
}

// ---------------------------------------------------------------------------
// Usage snapshots
// ---------------------------------------------------------------------------

/**
 * Insert a single snapshot into `usage_snapshots`.
 *
 * @param {import('better-sqlite3').Database} database
 * @param {{
 *   provider: string,
 *   fetchedAt: number,
 *   sessionPct: number|null,
 *   weeklyPct: number|null,
 *   sessionResetAt: number|null,
 *   weeklyResetAt: number|null,
 *   planLevel: string|null,
 *   approximated: boolean,
 *   raw: object|null,
 *   error: object|null,
 * }} snap
 */
function insertSnapshot(database, snap) {
  const stmt = database.prepare(`
    INSERT INTO usage_snapshots
      (provider, fetched_at, session_pct, weekly_pct,
       session_reset_at, weekly_reset_at, plan_level, approximated,
       raw_json, error_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    snap.provider,
    snap.fetchedAt,
    snap.sessionPct ?? null,
    snap.weeklyPct ?? null,
    snap.sessionResetAt ?? null,
    snap.weeklyResetAt ?? null,
    snap.planLevel ?? null,
    snap.approximated ? 1 : 0,
    snap.raw ? JSON.stringify(snap.raw) : null,
    snap.error ? JSON.stringify(snap.error) : null,
  );
}

/**
 * Return all snapshots for `provider` whose `fetched_at` >= `sinceMs`.
 *
 * @param {import('better-sqlite3').Database} database
 * @param {string} provider
 * @param {number} sinceMs  Unix timestamp in milliseconds (inclusive lower bound)
 * @returns {Array<object>}
 */
function recentSnapshots(database, provider, sinceMs) {
  return database
    .prepare(
      `SELECT * FROM usage_snapshots
       WHERE provider = ? AND fetched_at >= ?
       ORDER BY fetched_at DESC`,
    )
    .all(provider, sinceMs);
}

// ---------------------------------------------------------------------------
// App preferences (key-value)
// ---------------------------------------------------------------------------

function getPref(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_prefs WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setPref(key, value) {
  db.prepare(`
    INSERT INTO app_prefs (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Provider settings
// ---------------------------------------------------------------------------

function getProviderSettings(provider) {
  if (provider) {
    return db.prepare('SELECT * FROM provider_settings WHERE provider = ?').get(provider);
  }
  return db.prepare('SELECT * FROM provider_settings ORDER BY provider').all();
}

function upsertProviderSettings(cfg) {
  db.prepare(`
    INSERT INTO provider_settings (provider, connected, connected_at, last_error)
    VALUES (@provider, @connected, @connected_at, @last_error)
    ON CONFLICT(provider) DO UPDATE SET
      connected    = excluded.connected,
      connected_at = COALESCE(excluded.connected_at, provider_settings.connected_at),
      last_error   = excluded.last_error
  `).run({
    provider: cfg.provider,
    connected: cfg.connected ? 1 : 0,
    connected_at: cfg.connectedAt ?? null,
    last_error: cfg.lastError ?? null,
  });
}

module.exports = {
  init,
  migrate,
  // usage_snapshots
  insertSnapshot,
  recentSnapshots,
  // app_prefs
  getPref,
  setPref,
  // provider_settings
  getProviderSettings,
  upsertProviderSettings,
};
