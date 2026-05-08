import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateAlerts, DEFAULT_THRESHOLDS } from '../electron/alerts.js';

// ---------------------------------------------------------------------------
// Minimal in-memory db helper (no SQLite required)
// ---------------------------------------------------------------------------

function makeDb() {
  const store = {};
  return {
    getPref(_database, key, fallback = null) {
      return key in store ? store[key] : fallback;
    },
    setPref(_database, key, value) {
      store[key] = value;
    },
    _store: store,
  };
}

const DATABASE = {}; // dummy — never used directly by evaluateAlerts

function makeSnap(overrides = {}) {
  return {
    provider: 'claude',
    sessionPct: 50,
    weeklyPct: 50,
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Triggers session alert when sessionPct >= threshold AND no recent cooldown
// ---------------------------------------------------------------------------

describe('evaluateAlerts — session alert', () => {
  it('triggers session alert when sessionPct >= threshold', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 92 });
    const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('session');
    expect(alerts[0].threshold).toBe(DEFAULT_THRESHOLDS.claude.session);
    expect(alerts[0].value).toBe(92);
    expect(alerts[0].provider).toBe('claude');
    expect(alerts[0].at).toBe(1_000_000);
  });

  it('does NOT trigger session alert when sessionPct is below threshold', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 80 });
    const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
    expect(alerts.filter(a => a.type === 'session')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Suppresses duplicate alert within 6h cooldown
// ---------------------------------------------------------------------------

describe('evaluateAlerts — 6h cooldown', () => {
  it('suppresses second alert of same (provider, type) within 6h', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 95 });
    const t0 = 1_000_000_000;

    // First alert — should fire
    const first = evaluateAlerts(DATABASE, db, snap, t0);
    expect(first.filter(a => a.type === 'session')).toHaveLength(1);

    // Second call 1 hour later — should be suppressed
    const second = evaluateAlerts(DATABASE, db, snap, t0 + 3_600_000);
    expect(second.filter(a => a.type === 'session')).toHaveLength(0);
  });

  it('fires again after 6h cooldown has elapsed', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 95 });
    const t0 = 1_000_000_000;

    evaluateAlerts(DATABASE, db, snap, t0);

    // 6 hours + 1 ms later
    const second = evaluateAlerts(DATABASE, db, snap, t0 + 6 * 3_600_000 + 1);
    expect(second.filter(a => a.type === 'session')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Weekly alert independently of session
// ---------------------------------------------------------------------------

describe('evaluateAlerts — weekly alert', () => {
  it('triggers weekly alert when weeklyPct >= threshold', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 50, weeklyPct: 97 });
    const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
    expect(alerts.filter(a => a.type === 'weekly')).toHaveLength(1);
    expect(alerts[0].threshold).toBe(DEFAULT_THRESHOLDS.claude.weekly);
    expect(alerts[0].value).toBe(97);
  });

  it('can trigger both session and weekly alerts independently', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 92, weeklyPct: 97 });
    const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
    expect(alerts.filter(a => a.type === 'session')).toHaveLength(1);
    expect(alerts.filter(a => a.type === 'weekly')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. errorFirstSeen state machine
// ---------------------------------------------------------------------------

describe('evaluateAlerts — errorFirstSeen state machine', () => {
  it('sets errorFirstSeen when snap has an error', () => {
    const db = makeDb();
    const snap = makeSnap({ error: { code: 'AUTH_EXPIRED', message: 'auth expired' } });
    evaluateAlerts(DATABASE, db, snap, 5_000_000);
    const state = db.getPref(DATABASE, 'errorFirstSeen', {});
    expect(state.claude).toBe(5_000_000);
  });

  it('does not overwrite errorFirstSeen if already set', () => {
    const db = makeDb();
    db.setPref(DATABASE, 'errorFirstSeen', { claude: 1_000_000 });
    const snap = makeSnap({ error: { code: 'AUTH_EXPIRED', message: 'auth expired' } });
    evaluateAlerts(DATABASE, db, snap, 5_000_000);
    const state = db.getPref(DATABASE, 'errorFirstSeen', {});
    expect(state.claude).toBe(1_000_000); // unchanged
  });

  it('clears errorFirstSeen when snap has no error', () => {
    const db = makeDb();
    db.setPref(DATABASE, 'errorFirstSeen', { claude: 1_000_000 });
    const snap = makeSnap({ error: null });
    evaluateAlerts(DATABASE, db, snap, 5_000_000);
    const state = db.getPref(DATABASE, 'errorFirstSeen', {});
    expect(state.claude).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Triggers persistentError when error has persisted >= errorHours
// ---------------------------------------------------------------------------

describe('evaluateAlerts — persistentError', () => {
  it('triggers persistentError when error has persisted >= errorHours', () => {
    const db = makeDb();
    const errorHours = DEFAULT_THRESHOLDS.claude.errorHours;
    const t0 = 1_000_000_000;
    // Set errorFirstSeen to t0 - (errorHours * 3600 * 1000) so it just crossed the threshold
    db.setPref(DATABASE, 'errorFirstSeen', { claude: t0 - errorHours * 3_600_000 });
    const snap = makeSnap({ error: { code: 'AUTH_EXPIRED', message: 'expired' } });
    const alerts = evaluateAlerts(DATABASE, db, snap, t0);
    expect(alerts.filter(a => a.type === 'persistentError')).toHaveLength(1);
    expect(alerts[0].threshold).toBe(errorHours);
  });

  it('does NOT trigger persistentError if error has not persisted long enough', () => {
    const db = makeDb();
    const errorHours = DEFAULT_THRESHOLDS.claude.errorHours;
    const t0 = 1_000_000_000;
    // Set errorFirstSeen to 1 ms before crossing the threshold
    db.setPref(DATABASE, 'errorFirstSeen', { claude: t0 - errorHours * 3_600_000 + 1 });
    const snap = makeSnap({ error: { code: 'AUTH_EXPIRED', message: 'expired' } });
    const alerts = evaluateAlerts(DATABASE, db, snap, t0);
    expect(alerts.filter(a => a.type === 'persistentError')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. alertLog capped at 50 entries
// ---------------------------------------------------------------------------

describe('evaluateAlerts — alertLog capped at 50', () => {
  it('drops oldest entries when log exceeds 50', () => {
    const db = makeDb();
    // Pre-fill the log with 50 entries from different providers/types
    const existing = Array.from({ length: 50 }, (_, i) => ({
      provider: 'codex',
      type: 'session',
      threshold: 90,
      value: 91,
      at: i * 1000,
    }));
    db.setPref(DATABASE, 'alertLog', existing);

    // Now trigger a new alert for claude
    const snap = makeSnap({ sessionPct: 95 });
    evaluateAlerts(DATABASE, db, snap, 1_000_000);

    const log = db.getPref(DATABASE, 'alertLog', []);
    expect(log).toHaveLength(50);
    // The oldest entry (at=0) should be gone
    expect(log.find(e => e.at === 0)).toBeUndefined();
    // The newest entry should be the claude alert
    expect(log[log.length - 1].provider).toBe('claude');
  });
});

// ---------------------------------------------------------------------------
// 7. Returns newly triggered alerts
// ---------------------------------------------------------------------------

describe('evaluateAlerts — return value', () => {
  it('returns empty array when no threshold is breached', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 50, weeklyPct: 50, error: null });
    const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
    expect(alerts).toHaveLength(0);
  });

  it('returns the correct entries for each newly fired alert', () => {
    const db = makeDb();
    const snap = makeSnap({ sessionPct: 95, weeklyPct: 97 });
    const now = 2_000_000_000;
    const alerts = evaluateAlerts(DATABASE, db, snap, now);
    expect(alerts).toHaveLength(2);
    expect(alerts.every(a => a.at === now)).toBe(true);
    expect(alerts.map(a => a.type).sort()).toEqual(['session', 'weekly']);
  });
});

// ---------------------------------------------------------------------------
// 8. Uses DEFAULT_THRESHOLDS when alertThresholds pref is absent
// ---------------------------------------------------------------------------

describe('evaluateAlerts — missing alertThresholds pref', () => {
  it('does not crash and uses default thresholds when pref is absent', () => {
    const db = makeDb();
    // No alertThresholds stored — should use defaults
    const snap = makeSnap({ sessionPct: 95 }); // above default 90
    expect(() => {
      const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
      expect(alerts.filter(a => a.type === 'session')).toHaveLength(1);
    }).not.toThrow();
  });

  it('uses custom thresholds when stored', () => {
    const db = makeDb();
    db.setPref(DATABASE, 'alertThresholds', { claude: { session: 80, weekly: 95, errorHours: 2 } });
    const snap = makeSnap({ sessionPct: 85 }); // above custom 80, below default 90
    const alerts = evaluateAlerts(DATABASE, db, snap, 1_000_000);
    expect(alerts.filter(a => a.type === 'session')).toHaveLength(1);
    expect(alerts[0].threshold).toBe(80);
  });
});
