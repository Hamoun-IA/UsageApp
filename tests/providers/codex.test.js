import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
  // Stubbed — real BrowserWindow is never reached because tests inject
  // codex.deps.fetchCodexUsage before calling refresh().
  BrowserWindow: class { constructor() { throw new Error('BrowserWindow should not be reached in unit tests'); } },
}));

const sampleUsage = {
  user_id: 'user-xxx',
  plan_type: 'prolite',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: { used_percent: 4, limit_window_seconds: 18000, reset_after_seconds: 8747, reset_at: 1778276695 },
    secondary_window: { used_percent: 16, limit_window_seconds: 604800, reset_after_seconds: 271532, reset_at: 1778539480 },
  },
};

describe('codex.refresh()', () => {
  let codex;
  let mockSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    codex = await import('../../electron/providers/codex.js');
    mockSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    codex.deps.secrets = mockSecrets;
    codex.deps.fetchCodexUsage = vi.fn();
  });

  it('returns NOT_CONFIGURED when no cookie stored', async () => {
    mockSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot when fetcher reports ok with usage payload', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: true, usage: sampleUsage });
    const snap = await codex.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(4);
    expect(snap.weeklyPct).toBe(16);
    expect(snap.sessionResetAt).toBe(1778276695 * 1000);
    expect(snap.weeklyResetAt).toBe(1778539480 * 1000);
    expect(snap.planLevel).toBe('Prolite');
    expect(snap.provider).toBe('codex');
    expect(snap.approximated).toBe(false);
  });

  it('returns AUTH_EXPIRED when fetcher reports session phase 401', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: false, phase: 'session', status: 401, body: '{}' });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.message).toContain('HTTP 401 on /api/auth/session');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED when fetcher reports session phase with noToken (logged-out / decoy)', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({
      ok: false, phase: 'session', noToken: true, keys: 'WARNING_BANNER', body: '{"WARNING_BANNER":"..."}',
    });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.message).toContain('No accessToken');
    expect(snap.error.message).toContain('WARNING_BANNER');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED when fetcher reports usage phase 401', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: false, phase: 'usage', status: 401, body: '{"error":"..."}' });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.message).toContain('HTTP 401 on /wham/usage');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns NETWORK on 503 from session phase', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: false, phase: 'session', status: 503, body: '<html>...' });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.message).toContain('HTTP 503 on /api/auth/session');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns NETWORK on usage phase 5xx', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: false, phase: 'usage', status: 502, body: 'Bad Gateway' });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.message).toContain('HTTP 502 on /wham/usage');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns NETWORK when fetcher reports an in-page exception', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: false, phase: 'exception', message: 'TypeError: cannot read x' });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.message).toContain('page fetch exception');
    expect(snap.error.message).toContain('TypeError');
  });

  it('returns NETWORK when the fetcher promise itself rejects', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockRejectedValue(new Error('window destroyed'));
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.message).toContain('fetcher threw');
    expect(snap.error.message).toContain('window destroyed');
  });

  it('returns QUOTA_EXCEEDED with parsed values when limit_reached is true', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    const limitedUsage = {
      ...sampleUsage,
      rate_limit: { ...sampleUsage.rate_limit, limit_reached: true },
    };
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: true, usage: limitedUsage });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('QUOTA_EXCEEDED');
    expect(snap.error.retriable).toBe(true);
    expect(snap.sessionPct).toBe(4);
    expect(snap.weeklyPct).toBe(16);
  });

  it('returns PARSE when usage response has unexpected shape', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.fetchCodexUsage.mockResolvedValue({ ok: true, usage: { rate_limit: null } });
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('PARSE');
    expect(snap.error.retriable).toBe(false);
  });
});

describe('codex.connect()', () => {
  let codex;
  let mockSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    codex = await import('../../electron/providers/codex.js');
    mockSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    codex.deps.secrets = mockSecrets;
  });

  it('captures cookie via webview and stores it', async () => {
    const mockCapture = vi.fn().mockResolvedValue('__Secure-next-auth.session-token=abc123');
    codex.deps.captureCodexCookie = mockCapture;
    await codex.connect();
    expect(mockCapture).toHaveBeenCalledOnce();
    expect(mockSecrets.setProviderSecret).toHaveBeenCalledWith('codex', '__Secure-next-auth.session-token=abc123');
  });

  it('propagates capture errors without storing', async () => {
    const mockCapture = vi.fn().mockRejectedValue(new Error('User closed the window'));
    codex.deps.captureCodexCookie = mockCapture;
    await expect(codex.connect()).rejects.toThrow('User closed the window');
    expect(mockSecrets.setProviderSecret).not.toHaveBeenCalled();
  });
});
