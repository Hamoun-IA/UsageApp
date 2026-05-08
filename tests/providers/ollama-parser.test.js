import { describe, it, expect } from 'vitest';
import { parseOllamaSettings } from '../../electron/providers/ollama-parser.js';

const sampleHtml = `
<html>
<body>
  <div>
    <span>Cloud Usage</span><span>pro</span>
  </div>
  <div>
    <span>Session usage</span><span>42% used</span>
    <div data-time="2026-05-08T16:00:00Z">Resets in 3 hours</div>
  </div>
  <div>
    <span>Weekly usage</span><span>18% used</span>
    <div data-time="2026-05-11T00:00:00Z">Resets in 2 days</div>
  </div>
</body>
</html>
`;

describe('parseOllamaSettings', () => {
  it('extracts plan, session, weekly from HTML', () => {
    const result = parseOllamaSettings(sampleHtml);
    expect(result.planLevel).toBe('Pro');
    expect(result.sessionPct).toBe(42);
    expect(result.weeklyPct).toBe(18);
    expect(result.sessionResetAt).toBe(new Date('2026-05-08T16:00:00Z').getTime());
    expect(result.weeklyResetAt).toBe(new Date('2026-05-11T00:00:00Z').getTime());
  });

  it('handles 0% used', () => {
    const html = `<span>Session usage</span><span>0% used</span><div data-time="2026-05-08T16:00:00Z">Resets in 3 hours</div><span>Weekly usage</span><span>0% used</span><div data-time="2026-05-11T00:00:00Z">Resets in 2 days</div>`;
    const result = parseOllamaSettings(html);
    expect(result.sessionPct).toBe(0);
    expect(result.weeklyPct).toBe(0);
  });

  it('returns nulls when usage section absent (free tier?)', () => {
    const result = parseOllamaSettings('<html><body><h1>Settings</h1></body></html>');
    expect(result.sessionPct).toBeNull();
    expect(result.weeklyPct).toBeNull();
    expect(result.planLevel).toBeNull();
  });

  it('throws when input not a string', () => {
    expect(() => parseOllamaSettings(null)).toThrow();
    expect(() => parseOllamaSettings({})).toThrow();
  });
});
