import { describe, it, expect, vi, beforeEach } from 'vitest';

// Note: vi.mock('../../electron/secrets.js') cannot intercept require() calls
// made by CJS modules like zai.js in this Vitest + CJS stack. Instead we use
// the deps injection point that zai.js exposes (zai.deps.secrets), which lets
// tests replace the secrets dependency after import without touching vi.mock.

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
}));

describe('zai.refresh()', () => {
  let zai;
  let mockSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.resetModules();
    zai = await import('../../electron/providers/zai.js');
    mockSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    zai.deps.secrets = mockSecrets;
  });

  it('returns NOT_CONFIGURED when no token stored', async () => {
    mockSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await zai.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot on success', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('FAKE_JWT');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        success: true,
        data: {
          limits: [
            { type: 'TOKENS_LIMIT', unit: 3, percentage: 12 },
            { type: 'TOKENS_LIMIT', unit: 6, percentage: 34, nextResetTime: 1778688591979 },
          ],
          level: 'pro',
        },
      }),
    });
    const snap = await zai.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(12);
    expect(snap.weeklyPct).toBe(34);
    expect(snap.planLevel).toBe('Pro');
  });

  it('returns AUTH_EXPIRED on 401', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('FAKE_JWT');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 1001, success: false }),
    });
    const snap = await zai.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
  });

  it('returns NETWORK error on fetch throw', async () => {
    mockSecrets.getProviderSecret.mockReturnValue('FAKE_JWT');
    global.fetch.mockRejectedValue(new Error('ECONNRESET'));
    const snap = await zai.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });
});
