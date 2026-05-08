'use strict';

const DEFAULT_THRESHOLDS = require('../src/shared/alert-defaults.json');

const COOLDOWN_MS = 6 * 3_600_000; // 6 hours

// ---------------------------------------------------------------------------
// evaluateAlerts
// ---------------------------------------------------------------------------

/**
 * Evaluate a freshly-produced snapshot against stored thresholds and append
 * new alerts to the alert log if thresholds are breached and cooldown has passed.
 *
 * @param {import('better-sqlite3').Database} database  - live SQLite connection
 * @param {{ getPref, setPref }} db                     - db helper module
 * @param {{ provider, sessionPct, weeklyPct, error }} snap
 * @param {number} [now]                                - injected for testability
 * @returns {{ provider, type, threshold, value, at }[]}  newly appended alerts
 */
function evaluateAlerts(database, db, snap, now = Date.now()) {
  const provider = snap.provider;

  // 1. Load thresholds — merge with defaults so missing providers still work.
  const storedThresholds = db.getPref(database, 'alertThresholds', null) || {};
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...storedThresholds,
    [provider]: {
      ...(DEFAULT_THRESHOLDS[provider] || DEFAULT_THRESHOLDS.claude),
      ...(storedThresholds[provider] || {}),
    },
  };
  const t = thresholds[provider] || DEFAULT_THRESHOLDS.claude;

  // 2. Load existing alert log and errorFirstSeen state.
  const alertLog = (db.getPref(database, 'alertLog', null) || []).slice();
  const errorFirstSeen = db.getPref(database, 'errorFirstSeen', null) || {};

  // 3. Update errorFirstSeen state machine.
  if (snap.error) {
    if (!errorFirstSeen[provider]) {
      errorFirstSeen[provider] = now;
    }
  } else {
    if (errorFirstSeen[provider]) {
      delete errorFirstSeen[provider];
    }
  }

  // 4. Determine triggered alerts.
  const triggered = [];

  // Session alert
  if (snap.sessionPct != null && snap.sessionPct >= t.session) {
    triggered.push({ type: 'session', threshold: t.session, value: snap.sessionPct });
  }

  // Weekly alert
  if (snap.weeklyPct != null && snap.weeklyPct >= t.weekly) {
    triggered.push({ type: 'weekly', threshold: t.weekly, value: snap.weeklyPct });
  }

  // Persistent error alert
  const errorStart = errorFirstSeen[provider];
  if (errorStart != null && (now - errorStart) >= t.errorHours * 3_600_000) {
    triggered.push({ type: 'persistentError', threshold: t.errorHours, value: (now - errorStart) / 3_600_000 });
  }

  // 5. Apply 6h cooldown — skip if same (provider, type) was alerted recently.
  const newAlerts = [];
  for (const alert of triggered) {
    const recentSame = alertLog.find(
      (entry) =>
        entry.provider === provider &&
        entry.type === alert.type &&
        now - entry.at < COOLDOWN_MS,
    );
    if (!recentSame) {
      const entry = { provider, type: alert.type, threshold: alert.threshold, value: alert.value, at: now };
      alertLog.push(entry);
      newAlerts.push(entry);
    }
  }

  // 6. Cap at 50 entries (drop oldest).
  while (alertLog.length > 50) {
    alertLog.shift();
  }

  // 7. Persist updated alertLog and errorFirstSeen.
  db.setPref(database, 'alertLog', alertLog);
  db.setPref(database, 'errorFirstSeen', errorFirstSeen);

  return newAlerts;
}

module.exports = { evaluateAlerts, DEFAULT_THRESHOLDS };
