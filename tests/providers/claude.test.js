import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
}));

const FULL_USAGE = {
  five_hour:        { utilization: 4,  resets_at: '2026-05-09T00:10:01.170686+00:00' },
  seven_day:        { utilization: 37, resets_at: '2026-05-09T21:00:00.170712+00:00' },
  seven_day_sonnet: { utilization: 4,  resets_at: '2026-05-09T21:00:00.170718+00:00' },
  seven_day_opus:   null,
};

function makeFetch({ orgsStatus = 200, orgsBody = [{ uuid: 'org-1' }], usageStatus = 200, usageBody = FULL_USAGE, rlStatus = 200, rlBody = { rate_limit_tier: 'default_claude_max_5x' } } = {}) {
  return vi.fn((url) => {
    if (url.includes('/api/organizations') && !url.includes('/usage') && !url.includes('/rate_limits')) {
      return Promise.resolve({
        ok: orgsStatus >= 200 && orgsStatus < 300,
        status: orgsStatus,
        json: async () => orgsBody,
      });
    }
    if (url.includes('/usage')) {
      return Promise.resolve({
        ok: usageStatus >= 200 && usageStatus < 300,
        status: usageStatus,
        json: async () => usageBody,
      });
    }
    if (url.includes('/rate_limits')) {
      return Promise.resolve({
        ok: rlStatus >= 200 && rlStatus < 300,
        status: rlStatus,
        json: async () => rlBody,
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('claude.refresh()', () => {
  let claude;
  let mockSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    claude = await import('../../electron/providers/claude.js');
    mockSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    claude.deps.secrets = mockSecrets;
  });

  it('returns NOT_CONFIGURED when no cookie stored', async () => {
    mockSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.error.retriable).toBe(false);
    expect(snap.sessionPct).toBeNull();
  });

  it('returns full snapshot on success with planLevel Max (5x)', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch();
    const snap = await claude.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(4);
    expect(snap.weeklyPct).toBe(37);
    expect(snap.sessionResetAt).toBe(new Date('2026-05-09T00:10:01.170686+00:00').getTime());
    expect(snap.weeklyResetAt).toBe(new Date('2026-05-09T21:00:00.170712+00:00').getTime());
    expect(snap.planLevel).toBe('Max (5x)');
    expect(snap.raw.sevenDaySonnetPct).toBe(4);
    expect(snap.raw.sevenDayOpusPct).toBeNull();
    expect(snap.provider).toBe('claude');
    expect(snap.approximated).toBe(false);
  });

  it('returns AUTH_EXPIRED on 401 from /api/organizations', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch({ orgsStatus: 401 });
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED on 401 from /usage', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch({ usageStatus: 401 });
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED when /api/organizations returns 200 but empty array', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch({ orgsBody: [] });
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns NETWORK on 503 from /api/organizations', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch({ orgsStatus: 503 });
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns NETWORK on fetch throw', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns PARSE when /usage returns malformed JSON (no five_hour, no seven_day)', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch({ usageBody: { extra_usage: { is_enabled: true } } });
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('PARSE');
    expect(snap.error.retriable).toBe(false);
  });

  it('tolerates /rate_limits failure — snapshot has percentages, planLevel = null, no error', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('sessionKey=abc123');
    global.fetch = makeFetch({ rlStatus: 500 });
    const snap = await claude.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(4);
    expect(snap.weeklyPct).toBe(37);
    expect(snap.planLevel).toBeNull();
  });
});

describe('claude.connect()', () => {
  let claude;
  let mockSecrets;
  let fakeCapture;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    claude = await import('../../electron/providers/claude.js');
    mockSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    fakeCapture = vi.fn();
    claude.deps.secrets = mockSecrets;
    claude.deps.captureClaudeCookie = fakeCapture;
  });

  it('captures cookie via webview and stores it via secrets', async () => {
    fakeCapture.mockResolvedValue('sessionKey=abc123; foo=bar');
    await claude.connect();
    expect(fakeCapture).toHaveBeenCalledOnce();
    expect(mockSecrets.setProviderSecret).toHaveBeenCalledWith('claude', 'sessionKey=abc123; foo=bar');
  });

  it('propagates capture errors without storing anything', async () => {
    fakeCapture.mockRejectedValue(new Error('User closed the window'));
    await expect(claude.connect()).rejects.toThrow('User closed the window');
    expect(mockSecrets.setProviderSecret).not.toHaveBeenCalled();
  });

  it('disconnect() calls clearProviderSecret', async () => {
    await claude.disconnect();
    expect(mockSecrets.clearProviderSecret).toHaveBeenCalledWith('claude');
  });
});
