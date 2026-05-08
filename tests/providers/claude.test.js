import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
}));

let tempDir;
beforeEach(() => {
  tempDir = mkdtempSync(resolve(tmpdir(), 'claude-test-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('claude.refresh()', () => {
  it('returns CLI_INACTIVE when usage file absent', async () => {
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = resolve(tempDir, 'never-exists.json');
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('CLI_INACTIVE');
    expect(snap.error.retriable).toBe(true);
    expect(snap.sessionPct).toBeNull();
  });

  it('returns parsed snapshot from real Claude statusLine JSON shape', async () => {
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, JSON.stringify({
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1762588800 },
        seven_day: { used_percentage: 41.2, resets_at: 1763020800 },
      },
      model: { id: 'claude-opus-4-7', display_name: 'Opus' },
    }));
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBe(23.5);
    expect(snap.weeklyPct).toBe(41.2);
    expect(snap.sessionResetAt).toBe(1762588800 * 1000);
    expect(snap.weeklyResetAt).toBe(1763020800 * 1000);
    expect(snap.planLevel).toBe('Subscriber');
  });

  it('returns snapshot with null pcts but no error when rate_limits absent', async () => {
    // Non-subscriber or pre-first-API-response: file exists but no rate_limits key
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, JSON.stringify({
      model: { id: 'claude-opus-4-7', display_name: 'Opus' },
    }));
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.error).toBeNull();
    expect(snap.sessionPct).toBeNull();
    expect(snap.weeklyPct).toBeNull();
    expect(snap.planLevel).toBeNull();
  });

  it('handles individually-absent windows (only five_hour present)', async () => {
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, JSON.stringify({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: 1762588800 },
      },
    }));
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.sessionPct).toBe(10);
    expect(snap.weeklyPct).toBeNull();
    expect(snap.sessionResetAt).toBe(1762588800 * 1000);
    expect(snap.weeklyResetAt).toBeNull();
    expect(snap.planLevel).toBe('Subscriber');
  });

  it('returns CLI_INACTIVE if usage file is stale (> 30 min) but exposes last known values', async () => {
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, JSON.stringify({
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: 1762588800 },
        seven_day: { used_percentage: 60, resets_at: 1763020800 },
      },
    }));
    const oldTime = (Date.now() - 3600_000) / 1000;
    utimesSync(usagePath, oldTime, oldTime);
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('CLI_INACTIVE');
    expect(snap.error.retriable).toBe(true);
    expect(snap.sessionPct).toBe(50);  // Last known value still exposed (per project's "no silent stale" rule, we expose values BUT also the error)
    expect(snap.weeklyPct).toBe(60);
  });

  it('returns PARSE error when JSON is malformed', async () => {
    const usagePath = resolve(tempDir, 'usage.json');
    writeFileSync(usagePath, '{ not valid json');
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    claude.deps.usageFilePath = usagePath;
    const snap = await claude.refresh();
    expect(snap.error.code).toBe('PARSE');
    expect(snap.error.retriable).toBe(false);
  });
});

describe('claude.connect() / disconnect()', () => {
  it('connect() calls patchClaudeSettings via deps', async () => {
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    const fakePatch = vi.fn();
    claude.deps.patchClaudeSettings = fakePatch;
    await claude.connect();
    expect(fakePatch).toHaveBeenCalledOnce();
  });

  it('disconnect() calls unpatchClaudeSettings via deps', async () => {
    vi.resetModules();
    const claude = await import('../../electron/providers/claude.js');
    const fakeUnpatch = vi.fn();
    claude.deps.unpatchClaudeSettings = fakeUnpatch;
    await claude.disconnect();
    expect(fakeUnpatch).toHaveBeenCalledOnce();
  });
});
