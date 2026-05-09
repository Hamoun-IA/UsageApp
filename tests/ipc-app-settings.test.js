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

function makeHandlers(ipc, database) {
  const handlers = {};
  const fakeIpcMain = { handle: (name, fn) => { handlers[name] = fn; } };
  ipc.deps.ipcMain = fakeIpcMain;
  ipc.registerIpcHandlers({ db: database });
  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('app:setAutostart / app:getAutostart IPC handlers', () => {
  let testDb;
  let ipc;
  let fakeApp;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');

    // Inject a fake app with controllable login item settings
    fakeApp = {
      loginItemSettings: { openAtLogin: false },
      setLoginItemSettings(cfg) {
        this.loginItemSettings = { ...this.loginItemSettings, ...cfg };
      },
      getLoginItemSettings() {
        return { ...this.loginItemSettings };
      },
    };
    ipc.deps.app = fakeApp;
  });

  it('app:setAutostart(true) calls setLoginItemSettings with openAtLogin:true + args', async () => {
    const setLoginSpy = vi.spyOn(fakeApp, 'setLoginItemSettings');
    const handlers = makeHandlers(ipc, testDb);

    const result = await handlers['app:setAutostart']({}, true);

    expect(result).toBe(true);
    expect(setLoginSpy).toHaveBeenCalledWith({
      openAtLogin: true,
      args: ['--minimized'],
    });
  });

  it('app:setAutostart(true) persists autostart=true in db', async () => {
    const handlers = makeHandlers(ipc, testDb);
    await handlers['app:setAutostart']({}, true);

    const val = await handlers['db:getPref']({}, 'autostart');
    expect(val).toBe(true);
  });

  it('app:setAutostart(false) calls setLoginItemSettings with openAtLogin:false', async () => {
    const setLoginSpy = vi.spyOn(fakeApp, 'setLoginItemSettings');
    const handlers = makeHandlers(ipc, testDb);

    const result = await handlers['app:setAutostart']({}, false);

    expect(result).toBe(true);
    expect(setLoginSpy).toHaveBeenCalledWith({
      openAtLogin: false,
      args: ['--minimized'],
    });
  });

  it('app:setAutostart(false) persists autostart=false in db', async () => {
    const handlers = makeHandlers(ipc, testDb);
    // First set true, then false
    await handlers['app:setAutostart']({}, true);
    await handlers['app:setAutostart']({}, false);

    const val = await handlers['db:getPref']({}, 'autostart');
    expect(val).toBe(false);
  });

  it('app:getAutostart returns whatever getLoginItemSettings().openAtLogin returns', async () => {
    fakeApp.loginItemSettings = { openAtLogin: true };
    const handlers = makeHandlers(ipc, testDb);

    const result = await handlers['app:getAutostart']({});
    expect(result).toBe(true);
  });

  it('app:getAutostart returns false when openAtLogin is false', async () => {
    fakeApp.loginItemSettings = { openAtLogin: false };
    const handlers = makeHandlers(ipc, testDb);

    const result = await handlers['app:getAutostart']({});
    expect(result).toBe(false);
  });
});

describe('app:setPollInterval IPC handler', () => {
  let testDb;
  let ipc;
  let fakePoller;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');

    fakePoller = { setInterval: vi.fn() };
    ipc.deps.poller = fakePoller;
  });

  it('persists a valid interval (5) and resets the poller cadence', async () => {
    const handlers = makeHandlers(ipc, testDb);
    const result = await handlers['app:setPollInterval']({}, 5);

    expect(result).toBe(true);
    const stored = await handlers['db:getPref']({}, 'pollIntervalMin');
    expect(stored).toBe(5);
    expect(fakePoller.setInterval).toHaveBeenCalledWith(5 * 60_000);
  });

  it('rejects out-of-range values (returns false, does not persist or reset)', async () => {
    const handlers = makeHandlers(ipc, testDb);

    expect(await handlers['app:setPollInterval']({}, 0)).toBe(false);
    expect(await handlers['app:setPollInterval']({}, 61)).toBe(false);
    expect(await handlers['app:setPollInterval']({}, -1)).toBe(false);
    expect(await handlers['app:setPollInterval']({}, 'abc')).toBe(false);
    expect(await handlers['app:setPollInterval']({}, null)).toBe(false);

    expect(fakePoller.setInterval).not.toHaveBeenCalled();
    const stored = await handlers['db:getPref']({}, 'pollIntervalMin');
    expect(stored).toBeNull();
  });

  it('handles missing poller gracefully (still persists)', async () => {
    delete ipc.deps.poller;
    const handlers = makeHandlers(ipc, testDb);
    const result = await handlers['app:setPollInterval']({}, 15);

    expect(result).toBe(true);
    const stored = await handlers['db:getPref']({}, 'pollIntervalMin');
    expect(stored).toBe(15);
  });
});

describe('app:setGlobalShortcut IPC handler', () => {
  let testDb;
  let ipc;
  let registerShortcut;

  beforeEach(async () => {
    vi.resetModules();
    testDb = new Database(':memory:');
    const { migrate } = await import('../electron/db.js');
    migrate(testDb);
    ipc = await import('../electron/ipc.js');

    registerShortcut = vi.fn().mockReturnValue({ ok: true });
    ipc.deps.registerShortcut = registerShortcut;
  });

  it('returns { ok: true } and persists when registerShortcut succeeds', async () => {
    const handlers = makeHandlers(ipc, testDb);
    const result = await handlers['app:setGlobalShortcut']({}, 'CommandOrControl+Alt+M');

    expect(result).toEqual({ ok: true });
    expect(registerShortcut).toHaveBeenCalledWith('CommandOrControl+Alt+M');
    const stored = await handlers['db:getPref']({}, 'globalShortcut');
    expect(stored).toBe('CommandOrControl+Alt+M');
  });

  it('returns { ok: false, reason: "CONFLICT" } and does NOT persist on failure', async () => {
    registerShortcut.mockReturnValueOnce({ ok: false, reason: 'CONFLICT' });
    const handlers = makeHandlers(ipc, testDb);
    const result = await handlers['app:setGlobalShortcut']({}, 'CommandOrControl+Alt+M');

    expect(result).toEqual({ ok: false, reason: 'CONFLICT' });
    const stored = await handlers['db:getPref']({}, 'globalShortcut');
    expect(stored).toBeNull();
  });

  it('rejects empty/non-string accelerators (returns { ok: false, reason: "INVALID" })', async () => {
    const handlers = makeHandlers(ipc, testDb);

    expect(await handlers['app:setGlobalShortcut']({}, '')).toEqual({ ok: false, reason: 'INVALID' });
    expect(await handlers['app:setGlobalShortcut']({}, null)).toEqual({ ok: false, reason: 'INVALID' });
    expect(await handlers['app:setGlobalShortcut']({}, 42)).toEqual({ ok: false, reason: 'INVALID' });
    expect(registerShortcut).not.toHaveBeenCalled();
  });
});
