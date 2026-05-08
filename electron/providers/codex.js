const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { aggregateCodexTokens } = require('./codex-aggregator');

const id = 'codex';
const label = 'Codex';
const authMode = 'jsonl-tail';
const STALE_MS = 30 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 60 * 1000;

const emitter = new EventEmitter();

const deps = {
  sessionsDir: path.join(os.homedir(), '.codex', 'sessions'),
  aggregateCodexTokens,
  existsSync: fs.existsSync,
};

async function connect() {
  if (!deps.existsSync(deps.sessionsDir)) {
    throw new Error('Codex CLI introuvable — installe `codex` et lance-le au moins une fois');
  }
}

async function disconnect() {
  // No state to clear.
}

function buildSnapshot(partial) {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null,
    weeklyPct: null,
    sessionResetAt: null,
    weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null,
    error: null,
    ...partial,
  };
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : null;
}

function rateLimitsToFields(rl) {
  if (!rl) {
    return { sessionPct: null, weeklyPct: null, sessionResetAt: null, weeklyResetAt: null, planLevel: null };
  }
  const primary = rl.primary;
  const secondary = rl.secondary;
  return {
    sessionPct: primary && typeof primary.used_percent === 'number' ? primary.used_percent : null,
    weeklyPct: secondary && typeof secondary.used_percent === 'number' ? secondary.used_percent : null,
    sessionResetAt: primary && typeof primary.resets_at === 'number' ? primary.resets_at * 1000 : null,
    weeklyResetAt: secondary && typeof secondary.resets_at === 'number' ? secondary.resets_at * 1000 : null,
    planLevel: capitalize(rl.plan_type),
  };
}

async function refresh() {
  if (!deps.existsSync(deps.sessionsDir)) {
    return buildSnapshot({
      error: { code: 'NOT_CONFIGURED', message: 'Connect Codex first', retriable: false },
    });
  }

  const agg = await deps.aggregateCodexTokens(deps.sessionsDir);
  const fields = rateLimitsToFields(agg.rateLimits);

  if (!agg.rateLimits) {
    return buildSnapshot({
      raw: agg,
      error: {
        code: 'QUOTA_UNKNOWN',
        message: `Tokens utilisés: ${agg.session5hTokens} / 5h, ${agg.weekly7dTokens} / 7j (rate limits pas encore observées)`,
        retriable: false,
      },
    });
  }

  if (agg.lastRateLimitAt && Date.now() - agg.lastRateLimitAt < RATE_LIMIT_WINDOW_MS) {
    return buildSnapshot({
      ...fields,
      raw: agg,
      error: { code: 'QUOTA_EXCEEDED', message: 'Rate limit hit dans les dernières 5h', retriable: true },
    });
  }

  if (agg.rateLimitsAt && Date.now() - agg.rateLimitsAt > STALE_MS) {
    const minutes = Math.round((Date.now() - agg.rateLimitsAt) / 60000);
    return buildSnapshot({
      ...fields,
      raw: agg,
      error: {
        code: 'CLI_INACTIVE',
        message: `Codex inactif depuis ${minutes} min — données rate-limits potentiellement stale`,
        retriable: true,
      },
    });
  }

  return buildSnapshot({ ...fields, raw: agg });
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
