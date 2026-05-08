import { describe, it, expect } from 'vitest';
import { formatRelativeTime, severityFor } from '../../src/shared/snapshot-utils.js';

describe('formatRelativeTime', () => {
  it('formats 30s ago', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toMatch(/30 ?s/);
  });
  it('formats 5min ago', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toMatch(/5 ?min/);
  });
  it('formats 2h ago', () => {
    expect(formatRelativeTime(Date.now() - 2 * 3600_000)).toMatch(/2 ?h/);
  });
});

describe('severityFor', () => {
  it('error → red', () => {
    expect(severityFor({ error: { code: 'NETWORK' }, sessionPct: null, weeklyPct: null })).toBe('error');
  });
  it('weekly > 95 → critical', () => {
    expect(severityFor({ error: null, sessionPct: 50, weeklyPct: 96 })).toBe('critical');
  });
  it('session > 90 → critical', () => {
    expect(severityFor({ error: null, sessionPct: 91, weeklyPct: 50 })).toBe('critical');
  });
  it('session > 80 → warn', () => {
    expect(severityFor({ error: null, sessionPct: 82, weeklyPct: 30 })).toBe('warn');
  });
  it('all green → ok', () => {
    expect(severityFor({ error: null, sessionPct: 30, weeklyPct: 30 })).toBe('ok');
  });
});
