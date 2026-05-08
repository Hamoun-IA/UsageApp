import { describe, it, expect } from 'vitest';
import { parseClaudeUsage, parseClaudePlanLevel } from '../../electron/providers/claude-parser.js';

const FULL_PAYLOAD = {
  five_hour:         { utilization: 4,  resets_at: '2026-05-09T00:10:01.170686+00:00' },
  seven_day:         { utilization: 37, resets_at: '2026-05-09T21:00:00.170712+00:00' },
  seven_day_sonnet:  { utilization: 4,  resets_at: '2026-05-09T21:00:00.170718+00:00' },
  seven_day_opus:    null,
  seven_day_oauth_apps: null,
  seven_day_cowork:  null,
  seven_day_omelette:{ utilization: 0,  resets_at: null },
  extra_usage:       { is_enabled: true, monthly_limit: null, used_credits: 25, currency: 'EUR' },
};

describe('parseClaudeUsage', () => {
  it('happy path: full payload maps all 6 keys including epoch ms', () => {
    const result = parseClaudeUsage(FULL_PAYLOAD);
    expect(result.sessionPct).toBe(4);
    expect(result.weeklyPct).toBe(37);
    expect(result.sessionResetAt).toBe(new Date('2026-05-09T00:10:01.170686+00:00').getTime());
    expect(result.weeklyResetAt).toBe(new Date('2026-05-09T21:00:00.170712+00:00').getTime());
    expect(result.sevenDaySonnetPct).toBe(4);
    expect(result.sevenDayOpusPct).toBeNull();
  });

  it('missing seven_day_sonnet yields null for that field, others still work', () => {
    const payload = { ...FULL_PAYLOAD, seven_day_sonnet: undefined };
    const result = parseClaudeUsage(payload);
    expect(result.sevenDaySonnetPct).toBeNull();
    expect(result.sessionPct).toBe(4);
    expect(result.weeklyPct).toBe(37);
  });

  it('seven_day_omelette with resets_at: null does not crash parser', () => {
    expect(() => parseClaudeUsage(FULL_PAYLOAD)).not.toThrow();
    const result = parseClaudeUsage(FULL_PAYLOAD);
    expect(result.sessionPct).toBe(4);
  });

  it('five_hour utilization: 0 maps to sessionPct = 0 (not null)', () => {
    const payload = { ...FULL_PAYLOAD, five_hour: { utilization: 0, resets_at: '2026-05-09T00:10:01.170686+00:00' } };
    const result = parseClaudeUsage(payload);
    expect(result.sessionPct).toBe(0);
  });

  it('throws on non-object input', () => {
    expect(() => parseClaudeUsage(null)).toThrow('Unexpected Claude usage response');
    expect(() => parseClaudeUsage('string')).toThrow('Unexpected Claude usage response');
    expect(() => parseClaudeUsage(42)).toThrow('Unexpected Claude usage response');
    expect(() => parseClaudeUsage([])).toThrow('Unexpected Claude usage response');
  });

  it('throws when both five_hour AND seven_day are absent', () => {
    const payload = { seven_day_sonnet: { utilization: 4, resets_at: null } };
    expect(() => parseClaudeUsage(payload)).toThrow('Unexpected Claude usage response');
  });
});

describe('parseClaudePlanLevel', () => {
  it('maps known tiers correctly', () => {
    expect(parseClaudePlanLevel({ rate_limit_tier: 'default_claude_max_5x' })).toBe('Max (5x)');
    expect(parseClaudePlanLevel({ rate_limit_tier: 'default_claude_max_20x' })).toBe('Max (20x)');
    expect(parseClaudePlanLevel({ rate_limit_tier: 'default_claude_pro' })).toBe('Pro');
    expect(parseClaudePlanLevel({ rate_limit_tier: 'default_claude_free' })).toBe('Free');
  });

  it('returns null for non-string tier and titlecases unknown tiers', () => {
    expect(parseClaudePlanLevel(null)).toBeNull();
    expect(parseClaudePlanLevel({})).toBeNull();
    expect(parseClaudePlanLevel({ rate_limit_tier: 42 })).toBeNull();
    expect(parseClaudePlanLevel({ rate_limit_tier: 'default_claude_enterprise' })).toBe('Enterprise');
    expect(parseClaudePlanLevel({ rate_limit_tier: 'some_other_tier' })).toBeNull();
  });
});
