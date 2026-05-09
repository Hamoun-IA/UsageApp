import { describe, it, expect, vi, beforeEach } from 'vitest';

// In this project's Vitest 4 setup, `vi.mock('electron')` intercepts ESM
// `import` but does NOT intercept CJS `require()` from transformed project
// files. We therefore inject a FakeNotification through `notify.deps.Notification`
// instead — this is the same plain-functions injection pattern used by
// electron/ipc.js (see `ipc.deps.*` overrides in tests/ipc-alerts-wiring.test.js).
const notificationCalls = [];
const showSpy = vi.fn();

class FakeNotification {
  constructor(opts) {
    notificationCalls.push(opts);
  }
  show() {
    showSpy();
  }
  static isSupported() {
    return FakeNotification._supported;
  }
}
FakeNotification._supported = true;

vi.mock('electron', () => ({
  Notification: FakeNotification,
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
}));

describe('fireAlertNotifications', () => {
  let mod;

  beforeEach(async () => {
    notificationCalls.length = 0;
    showSpy.mockReset();
    FakeNotification._supported = true;
    vi.resetModules();
    mod = await import('../electron/notify.js');
    // vi.mock('electron') does not reach the CJS require() inside notify.js,
    // so we inject FakeNotification through the module's deps surface.
    mod.deps.Notification = FakeNotification;
  });

  it('does nothing when newAlerts is empty', () => {
    mod.fireAlertNotifications([]);
    expect(notificationCalls).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
  });

  it('fires one Notification for one alert', () => {
    mod.fireAlertNotifications([
      { provider: 'zai', type: 'session', threshold: 80, value: 92, at: 0 },
    ]);
    expect(notificationCalls).toHaveLength(1);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(notificationCalls[0].title).toMatch(/Z\.ai/);
    expect(notificationCalls[0].body).toMatch(/session/i);
    expect(notificationCalls[0].body).toMatch(/92/);
  });

  it('bundles two alerts of different types for the same provider into one Notification', () => {
    mod.fireAlertNotifications([
      { provider: 'claude', type: 'session', threshold: 80, value: 92, at: 0 },
      { provider: 'claude', type: 'weekly',  threshold: 80, value: 88, at: 0 },
    ]);
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0].body).toMatch(/session/i);
    expect(notificationCalls[0].body).toMatch(/weekly/i);
  });

  it('fires one Notification per distinct provider', () => {
    mod.fireAlertNotifications([
      { provider: 'zai',    type: 'session', threshold: 80, value: 92, at: 0 },
      { provider: 'claude', type: 'session', threshold: 80, value: 91, at: 0 },
      { provider: 'codex',  type: 'weekly',  threshold: 80, value: 90, at: 0 },
    ]);
    expect(notificationCalls).toHaveLength(3);
    expect(showSpy).toHaveBeenCalledTimes(3);
  });

  it('handles persistentError type with hour formatting (no %)', () => {
    mod.fireAlertNotifications([
      { provider: 'ollama', type: 'persistentError', threshold: 2, value: 3.5, at: 0 },
    ]);
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0].body).toMatch(/erreur/i);
    expect(notificationCalls[0].body).not.toMatch(/%/);
  });

  it('no-op when Notification.isSupported() returns false', () => {
    FakeNotification._supported = false;
    mod.fireAlertNotifications([
      { provider: 'zai', type: 'session', threshold: 80, value: 92, at: 0 },
    ]);
    expect(notificationCalls).toHaveLength(0);
    expect(showSpy).not.toHaveBeenCalled();
  });
});
