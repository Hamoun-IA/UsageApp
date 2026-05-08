import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// Must mock 'electron' before any CJS require() that pulls it in transitively.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getPath: () => '/tmp',
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
  },
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
    provider: 'claude',
    fetchedAt: Date.now(),
    sessionPct: 42,
    weeklyPct: 60,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: 'Pro',
    approximated: false,
    raw: {},
    error: null,
    ...overrides,
  };
}

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

describe('providers:refresh — evaluateAlerts wiring', () => {
  let testDb;
  let ipc;
  let alertsSpy;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');

    // Replace deps.alerts with a spy
    alertsSpy = vi.fn().mockReturnValue([]);
    ipc.deps.alerts = { evaluateAlerts: alertsSpy };
  });

  it('calls evaluateAlerts after insertSnapshot on providers:refresh', async () => {
    const snap = makeSnap();
    ipc.deps.getAdapter = () => ({ id: 'claude', refresh: vi.fn().mockResolvedValue(snap) });

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    await handlers['providers:refresh']({}, 'claude');

    expect(alertsSpy).toHaveBeenCalledTimes(1);
    expect(alertsSpy).toHaveBeenCalledWith(testDb, ipc.deps.db, snap);
  });

  it('returns the snap even when evaluateAlerts throws', async () => {
    const snap = makeSnap();
    ipc.deps.getAdapter = () => ({ id: 'claude', refresh: vi.fn().mockResolvedValue(snap) });
    alertsSpy.mockImplementation(() => { throw new Error('alerts boom'); });

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const result = await handlers['providers:refresh']({}, 'claude');

    // Refresh still returns the snap despite evaluateAlerts throwing
    expect(result).toEqual(snap);
  });
});

describe('providers:refreshAll — evaluateAlerts wiring', () => {
  let testDb;
  let ipc;
  let alertsSpy;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');

    alertsSpy = vi.fn().mockReturnValue([]);
    ipc.deps.alerts = { evaluateAlerts: alertsSpy };
  });

  it('calls evaluateAlerts for each successful snap in providers:refreshAll', async () => {
    const snapA = makeSnap({ provider: 'claude', fetchedAt: 1_000 });
    const snapB = makeSnap({ provider: 'codex',  fetchedAt: 2_000 });
    ipc.deps.listAdapters = () => [
      { id: 'claude', refresh: vi.fn().mockResolvedValue(snapA) },
      { id: 'codex',  refresh: vi.fn().mockResolvedValue(snapB) },
    ];

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    await handlers['providers:refreshAll']({});

    expect(alertsSpy).toHaveBeenCalledTimes(2);
    expect(alertsSpy).toHaveBeenCalledWith(testDb, ipc.deps.db, snapA);
    expect(alertsSpy).toHaveBeenCalledWith(testDb, ipc.deps.db, snapB);
  });

  it('still returns all snaps when evaluateAlerts throws on one', async () => {
    const snapA = makeSnap({ provider: 'claude', fetchedAt: 1_000 });
    const snapB = makeSnap({ provider: 'codex',  fetchedAt: 2_000 });
    ipc.deps.listAdapters = () => [
      { id: 'claude', refresh: vi.fn().mockResolvedValue(snapA) },
      { id: 'codex',  refresh: vi.fn().mockResolvedValue(snapB) },
    ];
    // Throw only on the first call
    alertsSpy
      .mockImplementationOnce(() => { throw new Error('alerts boom'); })
      .mockReturnValue([]);

    const handlers = registerWithFakeIpcMain(ipc, testDb);
    const results = await handlers['providers:refreshAll']({});

    expect(results).toHaveLength(2);
  });
});
