function parseCodexUsage(json) {
  if (!json || typeof json !== 'object' || !json.rate_limit) {
    throw new Error('Unexpected ChatGPT usage response');
  }
  const rl = json.rate_limit;
  const primary = rl.primary_window;
  const secondary = rl.secondary_window;
  const planType = json.plan_type;
  return {
    sessionPct: primary && typeof primary.used_percent === 'number' ? primary.used_percent : null,
    weeklyPct: secondary && typeof secondary.used_percent === 'number' ? secondary.used_percent : null,
    sessionResetAt: primary && typeof primary.reset_at === 'number' ? primary.reset_at * 1000 : null,
    weeklyResetAt: secondary && typeof secondary.reset_at === 'number' ? secondary.reset_at * 1000 : null,
    planLevel: planType ? planType.charAt(0).toUpperCase() + planType.slice(1) : null,
    limitReached: rl.limit_reached === true,
  };
}

module.exports = { parseCodexUsage };
