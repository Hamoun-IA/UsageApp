import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { aggregateCodexTokens } from '../../electron/providers/codex-aggregator.js';

let dir;
beforeEach(() => { dir = mkdtempSync(resolve(tmpdir(), 'codex-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const tokenEvent = (timestamp, last_total_tokens, opts = {}) => JSON.stringify({
  timestamp,
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: last_total_tokens },
      last_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: last_total_tokens },
      model_context_window: 258400,
    },
    rate_limits: opts.rate_limits ?? null,
  },
});

const isoMinusMs = (msAgo) => new Date(Date.now() - msAgo).toISOString();

describe('aggregateCodexTokens', () => {
  it('returns zeros when directory does not exist', async () => {
    const result = await aggregateCodexTokens(resolve(dir, 'does-not-exist'));
    expect(result.session5hTokens).toBe(0);
    expect(result.weekly7dTokens).toBe(0);
    expect(result.rateLimits).toBeNull();
    expect(result.rateLimitsAt).toBeNull();
    expect(result.lastRateLimitAt).toBeNull();
  });

  it('returns zeros when directory empty', async () => {
    const result = await aggregateCodexTokens(dir);
    expect(result.session5hTokens).toBe(0);
    expect(result.weekly7dTokens).toBe(0);
  });

  it('sums last_token_usage.total_tokens by window', async () => {
    mkdirSync(join(dir, '2026', '05', '07'), { recursive: true });
    const lines = [
      tokenEvent(isoMinusMs(1000), 150),                // within 5h
      tokenEvent(isoMinusMs(2 * 3600_000), 300),        // within 5h
      tokenEvent(isoMinusMs(6 * 3600_000), 500),        // outside 5h, inside 7d
      tokenEvent(isoMinusMs(8 * 24 * 3600_000), 999),   // outside 7d
    ];
    writeFileSync(join(dir, '2026', '05', '07', 'rollout-test.jsonl'), lines.join('\n') + '\n');
    const result = await aggregateCodexTokens(dir);
    expect(result.session5hTokens).toBe(150 + 300);
    expect(result.weekly7dTokens).toBe(150 + 300 + 500);
  });

  it('walks nested directories recursively', async () => {
    mkdirSync(join(dir, '2026', '05', '07'), { recursive: true });
    mkdirSync(join(dir, '2026', '04', '27'), { recursive: true });
    writeFileSync(join(dir, '2026', '05', '07', 'a.jsonl'), tokenEvent(isoMinusMs(1000), 100) + '\n');
    writeFileSync(join(dir, '2026', '04', '27', 'b.jsonl'), tokenEvent(isoMinusMs(60_000), 200) + '\n');
    const result = await aggregateCodexTokens(dir);
    expect(result.session5hTokens).toBe(300);
  });

  it('captures the most recent non-null rate_limits', async () => {
    mkdirSync(join(dir, '2026', '05', '07'), { recursive: true });
    const oldRateLimits = {
      limit_id: 'codex', limit_name: null,
      primary: { used_percent: 1.0, window_minutes: 300, resets_at: 1700000000 },
      secondary: { used_percent: 5.0, window_minutes: 10080, resets_at: 1700100000 },
      credits: null, plan_type: 'plus', rate_limit_reached_type: null,
    };
    const newRateLimits = {
      limit_id: 'codex', limit_name: null,
      primary: { used_percent: 7.5, window_minutes: 300, resets_at: 1778114687 },
      secondary: { used_percent: 10.0, window_minutes: 10080, resets_at: 1778539480 },
      credits: null, plan_type: 'prolite', rate_limit_reached_type: null,
    };
    const lines = [
      tokenEvent(isoMinusMs(2 * 3600_000), 100, { rate_limits: oldRateLimits }),
      tokenEvent(isoMinusMs(1 * 3600_000), 50, { rate_limits: newRateLimits }),
      tokenEvent(isoMinusMs(30 * 60_000), 25),
    ];
    writeFileSync(join(dir, '2026', '05', '07', 'rollout-test.jsonl'), lines.join('\n') + '\n');
    const result = await aggregateCodexTokens(dir);
    expect(result.rateLimits.plan_type).toBe('prolite');
    expect(result.rateLimits.primary.used_percent).toBe(7.5);
    expect(result.rateLimits.secondary.resets_at).toBe(1778539480);
    expect(result.rateLimitsAt).not.toBeNull();
  });

  it('records lastRateLimitAt when rate_limit_reached_type is set', async () => {
    mkdirSync(join(dir, '2026', '05', '07'), { recursive: true });
    const reachedRL = {
      limit_id: 'codex', limit_name: null,
      primary: { used_percent: 100.0, window_minutes: 300, resets_at: 1778114687 },
      secondary: { used_percent: 99.0, window_minutes: 10080, resets_at: 1778539480 },
      credits: null, plan_type: 'plus', rate_limit_reached_type: 'primary',
    };
    writeFileSync(
      join(dir, '2026', '05', '07', 'rollout-r.jsonl'),
      tokenEvent(isoMinusMs(15 * 60_000), 0, { rate_limits: reachedRL }) + '\n',
    );
    const result = await aggregateCodexTokens(dir);
    expect(result.lastRateLimitAt).not.toBeNull();
    expect(Date.now() - result.lastRateLimitAt).toBeLessThan(20 * 60_000);
  });

  it('skips invalid JSON lines silently', async () => {
    writeFileSync(join(dir, 'broken.jsonl'),
      `{ not valid json\n${tokenEvent(isoMinusMs(1000), 100)}\nanother bad line\n`
    );
    const result = await aggregateCodexTokens(dir);
    expect(result.session5hTokens).toBe(100);
  });

  it('ignores non-token-count events', async () => {
    writeFileSync(join(dir, 's.jsonl'),
      JSON.stringify({ timestamp: isoMinusMs(1000), type: 'response_item', payload: { type: 'message' } }) + '\n' +
      tokenEvent(isoMinusMs(1000), 50) + '\n'
    );
    const result = await aggregateCodexTokens(dir);
    expect(result.session5hTokens).toBe(50);
  });
});
