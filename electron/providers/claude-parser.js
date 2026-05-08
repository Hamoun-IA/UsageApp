function parseClaudeUsage(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Unexpected Claude usage response');
  }
  if (!('five_hour' in json) && !('seven_day' in json)) {
    throw new Error('Unexpected Claude usage response');
  }

  const fh = json.five_hour;
  const sd = json.seven_day;

  const sessionPct = fh && typeof fh.utilization === 'number' ? fh.utilization : null;
  const weeklyPct = sd && typeof sd.utilization === 'number' ? sd.utilization : null;

  const fhResetMs = fh && fh.resets_at ? new Date(fh.resets_at).getTime() : NaN;
  const sdResetMs = sd && sd.resets_at ? new Date(sd.resets_at).getTime() : NaN;

  const sessionResetAt = Number.isFinite(fhResetMs) ? fhResetMs : null;
  const weeklyResetAt = Number.isFinite(sdResetMs) ? sdResetMs : null;

  const sds = json.seven_day_sonnet;
  const sdo = json.seven_day_opus;

  const sevenDaySonnetPct = sds && typeof sds.utilization === 'number' ? sds.utilization : null;
  const sevenDayOpusPct = sdo && typeof sdo.utilization === 'number' ? sdo.utilization : null;

  return { sessionPct, weeklyPct, sessionResetAt, weeklyResetAt, sevenDaySonnetPct, sevenDayOpusPct };
}

function parseClaudePlanLevel(rateLimitsJson) {
  if (!rateLimitsJson || typeof rateLimitsJson !== 'object') return null;
  const tier = rateLimitsJson.rate_limit_tier;
  if (typeof tier !== 'string') return null;

  if (tier === 'default_claude_max_5x') return 'Max (5x)';
  if (tier === 'default_claude_max_20x') return 'Max (20x)';
  if (tier === 'default_claude_pro') return 'Pro';
  if (tier === 'default_claude_free') return 'Free';

  if (tier.startsWith('default_claude_')) {
    const rest = tier.slice('default_claude_'.length);
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }

  return null;
}

module.exports = { parseClaudeUsage, parseClaudePlanLevel };
