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
