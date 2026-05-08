import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// Must mock 'electron' before any CJS require() that pulls it in transitively.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();
const ONE_DAY_MS = 24 * 3_600_000;

function msAgo(days) {
  return NOW - days * ONE_DAY_MS;
}

function insertSnap(database, fetchedAt, provider = 'claude') {
  database.prepare(`
    INSERT INTO usage_snapshots
      (provider, fetched_at, session_pct, weekly_pct, session_reset_at,
       weekly_reset_at, plan_level, approximated, raw_json, error_json)
    VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL)
  `).run(provider, fetchedAt);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pruneOldSnapshots', () => {
  let testDb;
  let pruneOldSnapshots;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const dbModule = await import('../electron/db.js');
    dbModule.migrate(testDb);
    pruneOldSnapshots = dbModule.pruneOldSnapshots;
  });

  it('deletes rows older than retentionDays and returns correct count', () => {
    insertSnap(testDb, msAgo(1));    // 1d ago — should survive (within 30d)
    insertSnap(testDb, msAgo(31));   // 31d ago — should be deleted
    insertSnap(testDb, msAgo(200));  // 200d ago — should be deleted

    const deleted = pruneOldSnapshots(testDb, 30);
    expect(deleted).toBe(2);

    const remaining = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(remaining).toHaveLength(1);
    // The surviving row should be the 1d-ago one (closest to now)
    const survivorFetchedAt = remaining[0].fetched_at;
    expect(survivorFetchedAt).toBeGreaterThanOrEqual(msAgo(1) - 1000);
    expect(survivorFetchedAt).toBeLessThanOrEqual(msAgo(1) + 1000);
  });

  it('returns 0 and does not delete anything when retentionDays is 0', () => {
    insertSnap(testDb, msAgo(1));
    insertSnap(testDb, msAgo(31));
    insertSnap(testDb, msAgo(200));

    const deleted = pruneOldSnapshots(testDb, 0);
    expect(deleted).toBe(0);

    const remaining = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(remaining).toHaveLength(3);
  });

  it('returns 0 and does not delete anything when retentionDays is negative', () => {
    insertSnap(testDb, msAgo(1));
    insertSnap(testDb, msAgo(200));

    const deleted = pruneOldSnapshots(testDb, -1);
    expect(deleted).toBe(0);

    const remaining = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(remaining).toHaveLength(2);
  });

  it('returns 0 and does not delete when retentionDays is a string (non-number)', () => {
    insertSnap(testDb, msAgo(200));

    const deleted = pruneOldSnapshots(testDb, '90');
    expect(deleted).toBe(0);

    const remaining = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(remaining).toHaveLength(1);
  });

  it('returns 0 and does not delete anything when retentionDays is NaN', () => {
    insertSnap(testDb, msAgo(1));
    insertSnap(testDb, msAgo(200));

    const deleted = pruneOldSnapshots(testDb, NaN);
    expect(deleted).toBe(0);

    const remaining = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(remaining).toHaveLength(2);
  });

  it('returns 0 and does not delete anything when retentionDays is Infinity', () => {
    insertSnap(testDb, msAgo(1));
    insertSnap(testDb, msAgo(200));

    const deleted = pruneOldSnapshots(testDb, Infinity);
    expect(deleted).toBe(0);

    const remaining = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(remaining).toHaveLength(2);
  });

  it('verifies surviving row fetched_at is the 1d-ago row', () => {
    const fetchedAt1d = msAgo(1);
    insertSnap(testDb, fetchedAt1d);
    insertSnap(testDb, msAgo(31));
    insertSnap(testDb, msAgo(200));

    pruneOldSnapshots(testDb, 30);

    const rows = testDb.prepare('SELECT fetched_at FROM usage_snapshots').all();
    expect(rows).toHaveLength(1);
    // Allow a small tolerance for test timing
    expect(Math.abs(rows[0].fetched_at - fetchedAt1d)).toBeLessThan(100);
  });
});
