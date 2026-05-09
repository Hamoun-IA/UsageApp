import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
}));

describe('Poller', () => {
  let Poller;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mod = await import('../electron/poller.js');
    Poller = mod.Poller || mod.default || mod;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not tick before start() is called', async () => {
    const refresh = vi.fn().mockResolvedValue({ snaps: [], newAlerts: [] });
    new Poller({ refresh, onResults: () => {} });

    vi.advanceTimersByTime(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not tick at T0 — only at T+intervalMs', async () => {
    const refresh = vi.fn().mockResolvedValue({ snaps: [], newAlerts: [] });
    const p = new Poller({ refresh, onResults: () => {} });
    p.start(60_000);

    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('ticks repeatedly on the interval cadence', async () => {
    const refresh = vi.fn().mockResolvedValue({ snaps: [], newAlerts: [] });
    const p = new Poller({ refresh, onResults: () => {} });
    p.start(1000);

    vi.advanceTimersByTime(3500);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('calls onResults with the value returned by refresh()', async () => {
    const onResults = vi.fn();
    const payload = { snaps: [{ provider: 'zai' }], newAlerts: [{ provider: 'zai', type: 'session', threshold: 80, value: 90, at: 0 }] };
    const refresh = vi.fn().mockResolvedValue(payload);
    const p = new Poller({ refresh, onResults });
    p.start(1000);

    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(onResults).toHaveBeenCalledWith(payload);
  });

  it('skip-if-running: a tick triggered while the previous one is in-flight is skipped', async () => {
    let resolveRefresh;
    const refresh = vi.fn(() => new Promise((res) => { resolveRefresh = res; }));
    const p = new Poller({ refresh, onResults: () => {} });
    p.start(1000);

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh({ snaps: [], newAlerts: [] });
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('stop() prevents further ticks', async () => {
    const refresh = vi.fn().mockResolvedValue({ snaps: [], newAlerts: [] });
    const p = new Poller({ refresh, onResults: () => {} });
    p.start(1000);

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    p.stop();
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('setInterval(ms) resets the cadence', async () => {
    const refresh = vi.fn().mockResolvedValue({ snaps: [], newAlerts: [] });
    const p = new Poller({ refresh, onResults: () => {} });
    p.start(10_000);

    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(0);

    p.setInterval(1000);

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('swallows errors thrown by refresh() — keeps ticking', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ snaps: [], newAlerts: [] });
    const p = new Poller({ refresh, onResults: () => {} });
    p.start(1000);

    vi.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();

    vi.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
