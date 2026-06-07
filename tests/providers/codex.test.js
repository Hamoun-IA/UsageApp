import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
  // Stubbed — real net/session is never reached because tests inject
  // codex.deps.netFetch and codex.deps.getSessionCookies before refresh().
  net: { fetch: () => { throw new Error('electron.net.fetch should be mocked via deps.netFetch'); } },
  session: { fromPartition: () => ({ cookies: { get: async () => [] } }) },
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

function makeNetFetch(sessionResp, usageResp) {
  return vi.fn().mockImplementation((url) => {
    if (url === SESSION_URL) return Promise.resolve(sessionResp);
    if (url === USAGE_URL) return Promise.resolve(usageResp);
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
}

function makeCookieGetter(cookies = []) {
  return vi.fn().mockResolvedValue(cookies);
}

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
    // Sensible defaults — overridden per-test as needed.
    codex.deps.netFetch = vi.fn();
    codex.deps.getSessionCookies = makeCookieGetter([]);
  });

  it('returns NOT_CONFIGURED when no cookie stored', async () => {
    mockSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot on success', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
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
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: false, status: 401, json: async () => ({}) },
      null
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED on 401 from /backend-api/wham/usage', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: false, status: 401, json: async () => ({}) }
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns AUTH_EXPIRED when /api/auth/session returns 200 but no accessToken', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ user: 'someone' }) },
      null
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.retriable).toBe(false);
  });

  it('returns NETWORK on 503 from session endpoint', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: false, status: 503, json: async () => ({}) },
      null
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns NETWORK on fetch throw', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns QUOTA_EXCEEDED with parsed values when limit_reached is true', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    const limitedUsage = {
      ...sampleUsage,
      rate_limit: { ...sampleUsage.rate_limit, limit_reached: true },
    };
    codex.deps.netFetch = makeNetFetch(
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
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => ({ rate_limit: null }) }
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('PARSE');
    expect(snap.error.retriable).toBe(false);
  });

  it('sends Bearer + integrity headers to /wham/usage; credentials:include sends cookies via session', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.getSessionCookies = makeCookieGetter([
      { name: '__Secure-oai-is', value: 'ois1.abc.def' },
      { name: 'oai-did', value: 'device-uuid-123' },
      { name: 'cf_clearance', value: 'foo' },
    ]);
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => sampleUsage }
    );
    await codex.refresh();
    const usageCall = codex.deps.netFetch.mock.calls.find(([url]) => url === USAGE_URL);
    expect(usageCall).toBeDefined();
    const init = usageCall[1];
    expect(init.credentials).toBe('include');
    const headers = init.headers;
    expect(headers['Authorization']).toBe('Bearer fake-jwt-token');
    expect(headers['x-oai-is']).toBe('ois1.abc.def');
    expect(headers['oai-device-id']).toBe('device-uuid-123');
    expect(headers['x-openai-target-path']).toBe('/backend-api/wham/usage');
    expect(headers['x-openai-target-route']).toBe('/backend-api/wham/usage');
    expect(headers['oai-client-version']).toMatch(/^prod-/);
    expect(headers['oai-client-build-number']).toBeTruthy();
    expect(headers['oai-session-id']).toMatch(/^[0-9a-f-]{36}$/);
    // No manual Cookie header — net.fetch with credentials:'include' attaches
    // the persistent session's cookies automatically.
    expect(headers['Cookie']).toBeUndefined();
  });

  it('omits x-oai-is when session cookies lack __Secure-oai-is (graceful fallback)', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.getSessionCookies = makeCookieGetter([
      { name: 'cf_clearance', value: 'foo' },
      { name: 'some-other', value: 'bar' },
    ]);
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => sampleUsage }
    );
    await codex.refresh();
    const usageCall = codex.deps.netFetch.mock.calls.find(([url]) => url === USAGE_URL);
    const headers = usageCall[1].headers;
    expect(headers['x-oai-is']).toBeUndefined();
    expect(headers['oai-device-id']).toBeUndefined();
    expect(headers['x-openai-target-path']).toBe('/backend-api/wham/usage');
  });

  it('AUTH_EXPIRED message on /wham/usage 401 includes HTTP status and body snippet for diagnostics', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: false, status: 403, text: async () => '{"detail":"forbidden by OAI"}', json: async () => ({}) }
    );
    const snap = await codex.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
    expect(snap.error.message).toContain('HTTP 403');
    expect(snap.error.message).toContain('forbidden by OAI');
  });

  it('calls /api/auth/session with credentials:include so session cookies are sent by Chromium', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('connected');
    codex.deps.netFetch = makeNetFetch(
      { ok: true, status: 200, json: async () => ({ accessToken: 'fake-jwt-token' }) },
      { ok: true, status: 200, json: async () => sampleUsage }
    );
    await codex.refresh();
    const sessionCall = codex.deps.netFetch.mock.calls.find(([url]) => url === SESSION_URL);
    expect(sessionCall).toBeDefined();
    expect(sessionCall[1].credentials).toBe('include');
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
