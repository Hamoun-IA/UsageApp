import { describe, it, expect, vi, beforeEach } from 'vitest';

const ALERT_WINDOW_MS = 6 * 3_600_000;

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
  nativeImage: {
    createFromPath: vi.fn((p) => ({ _path: p, isEmpty: () => false })),
  },
}));

describe('updateTrayIcon', () => {
  let mod;
  let nativeImage;
  let fakeTray;
  let fakeDb;
  let fakeDbModule;
  let alertLogValue;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../electron/tray-state.js');

    nativeImage = {
      createFromPath: vi.fn((p) => ({ _path: p, isEmpty: () => false })),
    };
    mod.deps.nativeImage = nativeImage;

    fakeTray = { setImage: vi.fn() };
    fakeDb = {};
    alertLogValue = [];
    fakeDbModule = {
      getPref: vi.fn((database, key, fallback) => {
        if (key === 'alertLog') return alertLogValue;
        return fallback;
      }),
    };
  });

  it('uses the normal icon when alertLog is empty', () => {
    alertLogValue = [];
    mod.updateTrayIcon({
      tray: fakeTray,
      database: fakeDb,
      db: fakeDbModule,
      paths: { normal: '/tmp/n.png', critical: '/tmp/c.png' },
      now: 1_700_000_000_000,
    });

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/n.png');
    expect(fakeTray.setImage).toHaveBeenCalledOnce();
  });

  it('uses the critical icon when an entry is within the 6h window', () => {
    const now = 1_700_000_000_000;
    alertLogValue = [{ provider: 'zai', type: 'session', threshold: 80, value: 92, at: now - 60_000 }];
    mod.updateTrayIcon({
      tray: fakeTray,
      database: fakeDb,
      db: fakeDbModule,
      paths: { normal: '/tmp/n.png', critical: '/tmp/c.png' },
      now,
    });

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/c.png');
  });

  it('uses the normal icon when all entries are older than 6h', () => {
    const now = 1_700_000_000_000;
    alertLogValue = [{ provider: 'zai', type: 'session', threshold: 80, value: 92, at: now - ALERT_WINDOW_MS - 1 }];
    mod.updateTrayIcon({
      tray: fakeTray,
      database: fakeDb,
      db: fakeDbModule,
      paths: { normal: '/tmp/n.png', critical: '/tmp/c.png' },
      now,
    });

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/n.png');
  });

  it('ignores malformed entries (missing or non-numeric `at`)', () => {
    const now = 1_700_000_000_000;
    alertLogValue = [
      { provider: 'zai', type: 'session', threshold: 80, value: 92 },
      { provider: 'zai', type: 'session', threshold: 80, value: 92, at: 'not-a-number' },
      { provider: 'zai', type: 'session', threshold: 80, value: 92, at: NaN },
    ];
    mod.updateTrayIcon({
      tray: fakeTray,
      database: fakeDb,
      db: fakeDbModule,
      paths: { normal: '/tmp/n.png', critical: '/tmp/c.png' },
      now,
    });

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/n.png');
  });

  it('treats getPref returning null as "no alerts"', () => {
    fakeDbModule.getPref = vi.fn(() => null);
    mod.updateTrayIcon({
      tray: fakeTray,
      database: fakeDb,
      db: fakeDbModule,
      paths: { normal: '/tmp/n.png', critical: '/tmp/c.png' },
      now: 1_700_000_000_000,
    });

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/n.png');
  });

  it('uses Date.now() when `now` is not provided', () => {
    const realNow = Date.now();
    alertLogValue = [{ provider: 'zai', type: 'session', threshold: 80, value: 92, at: realNow }];
    mod.updateTrayIcon({
      tray: fakeTray,
      database: fakeDb,
      db: fakeDbModule,
      paths: { normal: '/tmp/n.png', critical: '/tmp/c.png' },
    });

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/c.png');
  });
});
