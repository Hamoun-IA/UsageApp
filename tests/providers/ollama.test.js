import { describe, it, expect, vi, beforeEach } from 'vitest';

// CJS modules can't be intercepted by vi.mock for require() calls; use deps injection.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
}));

describe('ollama.refresh()', () => {
  let ollama;
  let fakeSecrets;

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.resetModules();
    ollama = await import('../../electron/providers/ollama.js');
    fakeSecrets = {
      getProviderSecret: vi.fn(),
      setProviderSecret: vi.fn(),
      clearProviderSecret: vi.fn(),
    };
    ollama.deps.secrets = fakeSecrets;
  });

  it('returns NOT_CONFIGURED when no cookie stored', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue(null);
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('NOT_CONFIGURED');
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot on success', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=ABC123');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://ollama.com/settings',
      text: async () => `
        <html><body>
          <div><span>Cloud Usage</span><span>pro</span></div>
          <div>
            <span>Session usage</span><span>42% used</span>
            <div data-time="2026-05-08T16:00:00Z"></div>
          </div>
          <div>
            <span>Weekly usage</span><span>18% used</span>
            <div data-time="2026-05-11T00:00:00Z"></div>
          </div>
        </body></html>
      `,
    });
    const snap = await ollama.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(42);
    expect(snap.weeklyPct).toBe(18);
    expect(snap.planLevel).toBe('Pro');
  });

  it('returns AUTH_EXPIRED when fetch lands on a signin URL', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=EXPIRED');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://ollama.com/signin',
      text: async () => '<form>Sign in</form>',
    });
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
  });

  it('returns AUTH_EXPIRED on 401/403', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=ABC');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      url: 'https://ollama.com/settings',
      text: async () => '',
    });
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('AUTH_EXPIRED');
  });

  it('returns NETWORK error on non-2xx other than 401/403', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=ABC');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      url: 'https://ollama.com/settings',
      text: async () => '',
    });
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });

  it('returns NETWORK error on fetch throw', async () => {
    fakeSecrets.getProviderSecret.mockReturnValue('session=ABC');
    global.fetch.mockRejectedValue(new Error('ETIMEDOUT'));
    const snap = await ollama.refresh();
    expect(snap.error.code).toBe('NETWORK');
    expect(snap.error.retriable).toBe(true);
  });
});
