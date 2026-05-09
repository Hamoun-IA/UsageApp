import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
}));

function makeSnap(overrides = {}) {
  return {
    provider: 'zai',
    fetchedAt: 1_700_000_000_000,
    sessionPct: 50,
    weeklyPct: 75,
    sessionResetAt: 1_700_010_000_000,
    weeklyResetAt: 1_700_100_000_000,
    planLevel: 'Pro',
    approximated: false,
    raw: {},
    error: null,
    ...overrides,
  };
}

describe('refreshAndPersist', () => {
  let testDb;
  let mod;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    mod = await import('../electron/refresh-providers.js');
  });

  it('calls adapter.refresh, persists snap, evaluates alerts, returns { snap, newAlerts }', async () => {
    const snap = makeSnap();
    const adapter = { id: 'zai', refresh: vi.fn().mockResolvedValue(snap) };
    const insertSnapshot = vi.fn();
    const evaluateAlerts = vi.fn().mockReturnValue([{ provider: 'zai', type: 'session', threshold: 80, value: 50, at: 1 }]);

    const result = await mod.refreshAndPersist({
      database: testDb,
      db: { insertSnapshot, getPref: () => null, setPref: () => {} },
      alerts: { evaluateAlerts },
      getAdapter: () => adapter,
      providerId: 'zai',
    });

    expect(adapter.refresh).toHaveBeenCalledOnce();
    expect(insertSnapshot).toHaveBeenCalledWith(testDb, snap);
    expect(evaluateAlerts).toHaveBeenCalledWith(testDb, expect.any(Object), snap);
    expect(result.snap).toBe(snap);
    expect(result.newAlerts).toHaveLength(1);
  });

  it('returns snap with empty newAlerts when insertSnapshot throws', async () => {
    const snap = makeSnap();
    const adapter = { id: 'zai', refresh: vi.fn().mockResolvedValue(snap) };
    const insertSnapshot = vi.fn(() => { throw new Error('disk full'); });
    const evaluateAlerts = vi.fn().mockReturnValue([]);

    const result = await mod.refreshAndPersist({
      database: testDb,
      db: { insertSnapshot, getPref: () => null, setPref: () => {} },
      alerts: { evaluateAlerts },
      getAdapter: () => adapter,
      providerId: 'zai',
    });

    expect(result.snap).toBe(snap);
    expect(result.newAlerts).toEqual([]);
    expect(evaluateAlerts).not.toHaveBeenCalled();
  });

  it('returns snap with empty newAlerts when evaluateAlerts throws', async () => {
    const snap = makeSnap();
    const adapter = { id: 'zai', refresh: vi.fn().mockResolvedValue(snap) };
    const insertSnapshot = vi.fn();
    const evaluateAlerts = vi.fn(() => { throw new Error('boom'); });

    const result = await mod.refreshAndPersist({
      database: testDb,
      db: { insertSnapshot, getPref: () => null, setPref: () => {} },
      alerts: { evaluateAlerts },
      getAdapter: () => adapter,
      providerId: 'zai',
    });

    expect(result.snap).toBe(snap);
    expect(result.newAlerts).toEqual([]);
  });
});

describe('refreshAllAndPersist', () => {
  let testDb;
  let mod;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    mod = await import('../electron/refresh-providers.js');
  });

  it('walks all adapters, persists each snap, returns aggregated newAlerts', async () => {
    const snapA = makeSnap({ provider: 'zai' });
    const snapB = makeSnap({ provider: 'claude' });
    const adapters = [
      { id: 'zai', refresh: vi.fn().mockResolvedValue(snapA) },
      { id: 'claude', refresh: vi.fn().mockResolvedValue(snapB) },
    ];
    const insertSnapshot = vi.fn();
    const evaluateAlerts = vi.fn()
      .mockReturnValueOnce([{ provider: 'zai', type: 'session', threshold: 80, value: 50, at: 1 }])
      .mockReturnValueOnce([{ provider: 'claude', type: 'weekly', threshold: 80, value: 75, at: 2 }]);

    const result = await mod.refreshAllAndPersist({
      database: testDb,
      db: { insertSnapshot, getPref: () => null, setPref: () => {} },
      alerts: { evaluateAlerts },
      listAdapters: () => adapters,
    });

    expect(result.snaps).toHaveLength(2);
    expect(result.newAlerts).toHaveLength(2);
    expect(insertSnapshot).toHaveBeenCalledTimes(2);
  });

  it('skips a rejected adapter but keeps the others', async () => {
    const snapOk = makeSnap({ provider: 'zai' });
    const adapters = [
      { id: 'zai', refresh: vi.fn().mockResolvedValue(snapOk) },
      { id: 'claude', refresh: vi.fn().mockRejectedValue(new Error('network')) },
    ];
    const insertSnapshot = vi.fn();
    const evaluateAlerts = vi.fn().mockReturnValue([]);

    const result = await mod.refreshAllAndPersist({
      database: testDb,
      db: { insertSnapshot, getPref: () => null, setPref: () => {} },
      alerts: { evaluateAlerts },
      listAdapters: () => adapters,
    });

    expect(result.snaps).toHaveLength(1);
    expect(result.snaps[0]).toBe(snapOk);
    expect(insertSnapshot).toHaveBeenCalledOnce();
  });

  it('returns empty arrays when there are no adapters', async () => {
    const result = await mod.refreshAllAndPersist({
      database: testDb,
      db: { insertSnapshot: vi.fn(), getPref: () => null, setPref: () => {} },
      alerts: { evaluateAlerts: vi.fn() },
      listAdapters: () => [],
    });

    expect(result.snaps).toEqual([]);
    expect(result.newAlerts).toEqual([]);
  });
});
