import { describe, it, expect } from 'vitest';
import { parseZaiResponse } from '../../electron/providers/zai-parser.js';

const sample = {
  code: 200,
  msg: '操作成功',
  data: {
    limits: [
      { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 0 },
      { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 1, nextResetTime: 1778688591979 },
      { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 0, remaining: 1000, percentage: 0, nextResetTime: 1780330191995 },
    ],
    level: 'pro',
  },
  success: true,
};

describe('parseZaiResponse', () => {
  it('extracts session and weekly from limits[]', () => {
    const result = parseZaiResponse(sample);
    expect(result.sessionPct).toBe(0);
    expect(result.weeklyPct).toBe(1);
    expect(result.weeklyResetAt).toBe(1778688591979);
    expect(result.planLevel).toBe('Pro');
  });

  it('returns null pcts when limits missing', () => {
    const empty = { code: 200, success: true, data: { limits: [], level: 'pro' } };
    const result = parseZaiResponse(empty);
    expect(result.sessionPct).toBeNull();
    expect(result.weeklyPct).toBeNull();
  });

  it('throws if response shape unexpected', () => {
    expect(() => parseZaiResponse({ code: 401 })).toThrow();
    expect(() => parseZaiResponse(null)).toThrow();
  });
});
