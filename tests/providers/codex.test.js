import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

describe('codex.refresh()', () => {
  let codex;
  let fakeAgg;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    codex = await import('../../electron/providers/codex.js');
    fakeAgg = vi.fn();
    codex.deps.sessionsDir = '/path/that/exists';
    codex.deps.aggregateCodexTokens = fakeAgg;
    // Stub fs.existsSync via deps injection so tests don't depend on filesystem
    codex.deps.existsSync = vi.fn().mockReturnValue(true);
  });

  it('returns NOT_CONFIGURED when sessionsDir does not exist', async () => {
    codex.deps.existsSync.mockReturnValue(false);
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot with real %s when rate_limits present', async () => {
    fakeAgg.mockResolvedValue({
      session5hTokens: 410000,
      weekly7dTokens: 410000,
      rateLimits: {
        limit_id: 'codex',
        primary:   { used_percent: 7.5, window_minutes: 300, resets_at: 1778114687 },
        secondary: { used_percent: 12.0, window_minutes: 10080, resets_at: 1778539480 },
        plan_type: 'prolite',
        rate_limit_reached_type: null,
      },
      rateLimitsAt: Date.now() - 60_000, // 1 min ago, fresh
      lastRateLimitAt: null,
    });
    const snap = await codex.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(7.5);
    expect(snap.weeklyPct).toBe(12.0);
    expect(snap.sessionResetAt).toBe(1778114687 * 1000);
    expect(snap.weeklyResetAt).toBe(1778539480 * 1000);
    expect(snap.planLevel).toBe('Prolite');
  });

  it('returns QUOTA_UNKNOWN when rateLimits is null but tokens were seen', async () => {
    fakeAgg.mockResolvedValue({
      session5hTokens: 1500,
      weekly7dTokens: 8000,
      rateLimits: null,
      rateLimitsAt: null,
      lastRateLimitAt: null,
    });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('QUOTA_UNKNOWN');
    expect(snap.error.retriable).toBe(false);
    expect(snap.sessionPct).toBeNull();
    expect(snap.weeklyPct).toBeNull();
    expect(snap.approximated).toBe(true);
    expect(snap.error.message).toContain('1500');
    expect(snap.error.message).toContain('8000');
  });

  it('returns QUOTA_EXCEEDED when rate-limit was hit within last 5h', async () => {
    fakeAgg.mockResolvedValue({
      session5hTokens: 50000,
      weekly7dTokens: 100000,
      rateLimits: {
        limit_id: 'codex',
        primary:   { used_percent: 100.0, window_minutes: 300, resets_at: 1778114687 },
        secondary: { used_percent: 80.0, window_minutes: 10080, resets_at: 1778539480 },
        plan_type: 'plus',
        rate_limit_reached_type: 'primary',
      },
      rateLimitsAt: Date.now() - 60_000,
      lastRateLimitAt: Date.now() - 30 * 60_000,
    });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('QUOTA_EXCEEDED');
    expect(snap.error.retriable).toBe(true);
    expect(snap.sessionPct).toBe(100.0);
    expect(snap.planLevel).toBe('Plus');
  });

  it('returns CLI_INACTIVE when rate_limits info is older than 30 min', async () => {
    fakeAgg.mockResolvedValue({
      session5hTokens: 500,
      weekly7dTokens: 5000,
      rateLimits: {
        limit_id: 'codex',
        primary:   { used_percent: 4.0, window_minutes: 300, resets_at: 1778114687 },
        secondary: { used_percent: 9.0, window_minutes: 10080, resets_at: 1778539480 },
        plan_type: 'plus',
        rate_limit_reached_type: null,
      },
      rateLimitsAt: Date.now() - 90 * 60_000, // 90 min ago, stale
      lastRateLimitAt: null,
    });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('CLI_INACTIVE');
    expect(snap.error.retriable).toBe(true);
    expect(snap.sessionPct).toBe(4.0); // stale value still exposed
  });

  it('handles plan_type missing/null without throwing', async () => {
    fakeAgg.mockResolvedValue({
      session5hTokens: 100,
      weekly7dTokens: 100,
      rateLimits: {
        limit_id: 'codex',
        primary:   { used_percent: 1.0, window_minutes: 300, resets_at: 1778114687 },
        secondary: null,
        plan_type: null,
        rate_limit_reached_type: null,
      },
      rateLimitsAt: Date.now() - 60_000,
      lastRateLimitAt: null,
    });
    const snap = await codex.refresh();
    expect(snap.planLevel).toBeNull();
    expect(snap.weeklyPct).toBeNull();
    expect(snap.weeklyResetAt).toBeNull();
  });
});

describe('codex.connect()', () => {
  let codex;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    codex = await import('../../electron/providers/codex.js');
    codex.deps.existsSync = vi.fn();
  });

  it('resolves when sessionsDir exists', async () => {
    codex.deps.existsSync.mockReturnValue(true);
    await expect(codex.connect()).resolves.toBeUndefined();
  });

  it('throws helpful error when sessionsDir is missing', async () => {
    codex.deps.existsSync.mockReturnValue(false);
    await expect(codex.connect()).rejects.toThrow(/Codex CLI/);
  });
});
