const fs = require('fs');
const path = require('path');

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function listJsonlFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}

async function aggregateCodexTokens(sessionsDir) {
  const result = {
    session5hTokens: 0,
    weekly7dTokens: 0,
    rateLimits: null,
    rateLimitsAt: null,
    lastRateLimitAt: null,
  };

  const files = listJsonlFiles(sessionsDir);
  if (files.length === 0) return result;

  const now = Date.now();
  const fiveHourCutoff = now - FIVE_HOURS_MS;
  const sevenDayCutoff = now - SEVEN_DAYS_MS;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (evt.type !== 'event_msg') continue;
      if (!evt.payload || evt.payload.type !== 'token_count') continue;

      const tsMs = new Date(evt.timestamp).getTime();
      if (!Number.isFinite(tsMs)) continue;

      const last = evt.payload.info && evt.payload.info.last_token_usage;
      const lastTotal = last && typeof last.total_tokens === 'number' ? last.total_tokens : 0;

      if (tsMs >= sevenDayCutoff) result.weekly7dTokens += lastTotal;
      if (tsMs >= fiveHourCutoff) result.session5hTokens += lastTotal;

      const rl = evt.payload.rate_limits;
      if (rl && typeof rl === 'object') {
        if (result.rateLimitsAt === null || tsMs > result.rateLimitsAt) {
          result.rateLimits = rl;
          result.rateLimitsAt = tsMs;
        }
        if (rl.rate_limit_reached_type) {
          if (result.lastRateLimitAt === null || tsMs > result.lastRateLimitAt) {
            result.lastRateLimitAt = tsMs;
          }
        }
      }
    }
  }

  return result;
}

module.exports = { aggregateCodexTokens };
