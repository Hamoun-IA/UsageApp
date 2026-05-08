import { describe, it, expect } from 'vitest';
import { parseCodexUsage } from '../../electron/providers/codex-parser.js';

const sample = {
  user_id: 'user-xxx',
  account_id: 'user-xxx',
  email: 'test@example.com',
  plan_type: 'prolite',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: { used_percent: 4, limit_window_seconds: 18000, reset_after_seconds: 8747, reset_at: 1778276695 },
    secondary_window: { used_percent: 16, limit_window_seconds: 604800, reset_after_seconds: 271532, reset_at: 1778539480 },
  },
  code_review_rate_limit: null,
  additional_rate_limits: [],
};

describe('parseCodexUsage', () => {
  it('maps all 6 keys from a full happy-path response', () => {
    const result = parseCodexUsage(sample);
    expect(result.sessionPct).toBe(4);
    expect(result.weeklyPct).toBe(16);
    expect(result.sessionResetAt).toBe(1778276695 * 1000);
    expect(result.weeklyResetAt).toBe(1778539480 * 1000);
    expect(result.planLevel).toBe('Prolite');
    expect(result.limitReached).toBe(false);
  });

  it('returns null for session fields when primary_window is missing', () => {
    const input = {
      ...sample,
      rate_limit: { ...sample.rate_limit, primary_window: undefined },
    };
    const result = parseCodexUsage(input);
    expect(result.sessionPct).toBeNull();
    expect(result.sessionResetAt).toBeNull();
    expect(result.weeklyPct).toBe(16);
    expect(result.weeklyResetAt).toBe(1778539480 * 1000);
  });

  it('propagates limit_reached: true as boolean true', () => {
    const input = {
      ...sample,
      rate_limit: { ...sample.rate_limit, limit_reached: true },
    };
    const result = parseCodexUsage(input);
    expect(result.limitReached).toBe(true);
  });

  it('capitalizes plan_type correctly', () => {
    expect(parseCodexUsage({ ...sample, plan_type: 'plus' }).planLevel).toBe('Plus');
    expect(parseCodexUsage({ ...sample, plan_type: 'pro' }).planLevel).toBe('Pro');
  });

  it('throws on null, string, or missing rate_limit', () => {
    expect(() => parseCodexUsage(null)).toThrow('Unexpected ChatGPT usage response');
    expect(() => parseCodexUsage('string')).toThrow('Unexpected ChatGPT usage response');
    expect(() => parseCodexUsage({})).toThrow('Unexpected ChatGPT usage response');
    expect(() => parseCodexUsage({ rate_limit: null })).toThrow('Unexpected ChatGPT usage response');
  });
});
