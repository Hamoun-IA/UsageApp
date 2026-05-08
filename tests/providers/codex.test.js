import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
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

const SESSION_URL = 'https://chatgpt.com/api/auth/session';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

function makeFetch(sessionResp, usageResp) {
  return vi.fn().mockImplementation((url) => {
    if (url === SESSION_URL) return Promise.resolve(sessionResp);
    if (url === USAGE_URL) return Promise.resolve(usageResp);
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
}

describe('codex.refresh()', () => {
  let codex;
  let mockSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.resetModules();
    codex = await import('../../electron/providers/codex.js');
    mockSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    codex.deps.secrets = mockSecrets;
  });

  it('returns NOT_CONFIGURED when no cookie stored', async () => {
    mockSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot on success', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = makeFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => sampleUsage }
    );
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

  it('returns AUTH_EXPIRED on 401 from /api/auth/session', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = makeFetch(
      { ok: false, status: 401, json: async () => ({}) },
      null
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED on 401 from /backend-api/wham/usage', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = makeFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: false, status: 401, json: async () => ({}) }
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED when /api/auth/session returns 200 but no accessToken', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = makeFetch(
      { ok: true, status: 200, json: async () => ({ user: 'someone' }) },
      null
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns NETWORK on 503 from session endpoint', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = makeFetch(
      { ok: false, status: 503, json: async () => ({}) },
      null
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns NETWORK on fetch throw', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns QUOTA_EXCEEDED with parsed values when limit_reached is true', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    const limitedUsage = {
      ...sampleUsage,
      rate_limit: { ...sampleUsage.rate_limit, limit_reached: true },
    };
    global.fetch = makeFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => limitedUsage }
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('QUOTA_EXCEEDED');
    expect(snap.error.retriable).toBe(true);
    expect(snap.sessionPct).toBe(4);
    expect(snap.weeklyPct).toBe(16);
  });

  it('returns PARSE when usage response has unexpected shape', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('cookie=abc');
    global.fetch = makeFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => ({ rate_limit: null }) }
    );
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
