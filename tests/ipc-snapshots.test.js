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

function makeSnap(overrides = {}) {
  return {
    provider: 'zai',
    fetchedAt: 1_700_000_000_000,
    sessionPct: 42,
    weeklyPct: 77,
    sessionResetAt: 1_700_100_000_000,
    weeklyResetAt: 1_700_200_000_000,
    planLevel: 'Pro',
    approximated: false,
    raw: { extra: true },
    error: null,
    ...overrides,
  };
}

// Register handlers with a fake ipcMain and return a map of name → handler fn.
function registerWithFakeIpcMain(ipc, database) {
  const handlers = {};
  const fakeIpcMain = { handle: (name, fn) => { handlers[name] = fn; } };
  ipc.deps.ipcMain = fakeIpcMain;
  ipc.registerIpcHandlers({ db: database });
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('providers:refresh — snapshot persistence', () => {
  let testDb;
  let ipc;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');
  });

  it('inserts exactly one snapshot row after refresh', async () => {
    const snap = makeSnap();
    const stubAdapter = { id: 'zai', refresh: vi.fn().mockResolvedValue(snap) };
    ipc.deps.getAdapter = () => stubAdapter;

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const result = await handlers['providers:refresh']({}, 'zai');

    expect(result).toEqual(snap);

    const rows = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('zai');
    expect(rows[0].fetched_at).toBe(1_700_000_000_000);
    expect(rows[0].session_pct).toBe(42);
    expect(rows[0].weekly_pct).toBe(77);
    expect(rows[0].plan_level).toBe('Pro');
    expect(rows[0].approximated).toBe(0);
  });

  it('returns the snap even when insertSnapshot throws', async () => {
    const snap = makeSnap();
    const stubAdapter = { id: 'zai', refresh: vi.fn().mockResolvedValue(snap) };
    ipc.deps.getAdapter = () => stubAdapter;

    // Break the DB so insert throws.
    testDb.exec('DROP TABLE usage_snapshots');

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const result = await handlers['providers:refresh']({}, 'zai');

    expect(result).toEqual(snap);
  });
});

describe('providers:refreshAll — snapshot persistence', () => {
  let testDb;
  let ipc;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');
  });

  it('inserts one row per adapter', async () => {
    const snapA = makeSnap({ provider: 'zai',   fetchedAt: 1_000 });
    const snapB = makeSnap({ provider: 'claude', fetchedAt: 2_000 });
    const adapterA = { id: 'zai',   refresh: vi.fn().mockResolvedValue(snapA) };
    const adapterB = { id: 'claude', refresh: vi.fn().mockResolvedValue(snapB) };
    ipc.deps.listAdapters = () => [adapterA, adapterB];

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const results = await handlers['providers:refreshAll']({});

    expect(results).toHaveLength(2);

    const rows = testDb.prepare('SELECT * FROM usage_snapshots ORDER BY fetched_at ASC').all();
    expect(rows).toHaveLength(2);
    expect(rows[0].provider).toBe('zai');
    expect(rows[1].provider).toBe('claude');
  });

  it('persists and returns surviving adapter snapshot when one adapter rejects', async () => {
    const snapA = makeSnap({ provider: 'zai', fetchedAt: 1_000 });
    const adapterA = { id: 'zai',   refresh: vi.fn().mockResolvedValue(snapA) };
    const adapterB = { id: 'claude', refresh: vi.fn().mockRejectedValue(new Error('auth error')) };
    ipc.deps.listAdapters = () => [adapterA, adapterB];

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const results = await handlers['providers:refreshAll']({});

    // Only the fulfilled snap is returned (null filtered out).
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('zai');

    // Only the fulfilled snap is persisted.
    const rows = testDb.prepare('SELECT * FROM usage_snapshots').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('zai');
    expect(rows[0].fetched_at).toBe(1_000);
  });
});

describe('db:recentSnapshots', () => {
  let testDb;
  let ipc;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate, insertSnapshot } = await import('../electron/db.js');
    migrate(testDb);
    insertSnapshot(testDb, makeSnap({ fetchedAt: 1_000 }));
    insertSnapshot(testDb, makeSnap({ fetchedAt: 2_000 }));
    insertSnapshot(testDb, makeSnap({ provider: 'claude', fetchedAt: 3_000 }));
    ipc = await import('../electron/ipc.js');
  });

  it('returns only rows for the requested provider since sinceMs', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const rows = await handlers['db:recentSnapshots']({}, 'zai', 0);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.provider === 'zai')).toBe(true);
  });

  it('respects sinceMs lower bound', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const rows = await handlers['db:recentSnapshots']({}, 'zai', 1_500);
    expect(rows).toHaveLength(1);
    expect(rows[0].fetched_at).toBe(2_000);
  });
});

describe('db:getPref / db:setPref', () => {
  let testDb;
  let ipc;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');
  });

  it('round-trips a string value', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    await handlers['db:setPref']({}, 'theme', 'dark');
    const val = await handlers['db:getPref']({}, 'theme');
    expect(val).toBe('dark');
  });

  it('round-trips a number value', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    await handlers['db:setPref']({}, 'refreshInterval', 300);
    const val = await handlers['db:getPref']({}, 'refreshInterval');
    expect(val).toBe(300);
  });

  it('round-trips an object value', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    await handlers['db:setPref']({}, 'windowPos', { x: 10, y: 20 });
    const val = await handlers['db:getPref']({}, 'windowPos');
    expect(val).toEqual({ x: 10, y: 20 });
  });

  it('returns null (default) for unknown key', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const val = await handlers['db:getPref']({}, 'nonexistent');
    expect(val).toBeNull();
  });

  it('upserts — second setPref overwrites first', async () => {
    const handlers = registerWithFakeIpcMain(ipc, testDb);
    await handlers['db:setPref']({}, 'key', 'first');
    await handlers['db:setPref']({}, 'key', 'second');
    const val = await handlers['db:getPref']({}, 'key');
    expect(val).toBe('second');
  });
});
