const UNIT_5H = 3;
const UNIT_WEEKLY = 6;

function parseZaiResponse(raw) {
  if (!raw || typeof raw !== 'object' || !raw.success || !raw.data) {
    throw new Error(`Unexpected Z.ai response: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  const limits = raw.data.limits || [];
  const session = limits.find(l => l.type === 'TOKENS_LIMIT' && l.unit === UNIT_5H);
  const weekly = limits.find(l => l.type === 'TOKENS_LIMIT' && l.unit === UNIT_WEEKLY);
  const level = raw.data.level ? raw.data.level.charAt(0).toUpperCase() + raw.data.level.slice(1) : null;
  return {
    sessionPct: session ? session.percentage : null,
    weeklyPct: weekly ? weekly.percentage : null,
    sessionResetAt: session?.nextResetTime ?? null,
    weeklyResetAt: weekly?.nextResetTime ?? null,
    planLevel: level,
  };
}

export { parseZaiResponse };
