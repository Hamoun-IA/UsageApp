import { describe, it, expect } from 'vitest';
import { isValidSnapshot } from '../../electron/providers/types.js';

describe('Snapshot validation', () => {
  it('accepts a complete snapshot', () => {
    const s = {
      provider: 'zai',
      fetchedAt: Date.now(),
      sessionPct: 42,
      weeklyPct: 18,
      sessionResetAt: Date.now() + 3600_000,
      weeklyResetAt: Date.now() + 86400_000,
      planLevel: 'Pro',
      approximated: false,
      raw: {},
      error: null,
    };
    expect(isValidSnapshot(s)).toBe(true);
  });

  it('rejects snapshot missing required fields', () => {
    expect(isValidSnapshot({})).toBe(false);
    expect(isValidSnapshot({ provider: 'zai' })).toBe(false);
  });

  it('accepts snapshot with null pct (provider not configured)', () => {
    const s = {
      provider: 'codex',
      fetchedAt: Date.now(),
      sessionPct: null,
      weeklyPct: null,
      sessionResetAt: null,
      weeklyResetAt: null,
      planLevel: null,
      approximated: true,
      raw: null,
      error: { code: 'NOT_CONFIGURED', message: 'Run connect()', retriable: false },
    };
    expect(isValidSnapshot(s)).toBe(true);
  });
});
