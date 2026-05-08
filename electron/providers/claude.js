const { EventEmitter } = require('events');
const { parseClaudeUsage, parseClaudePlanLevel } = require('./claude-parser');
const { captureClaudeCookie } = require('./claude-connect');

const id = 'claude';
const label = 'Claude';
const authMode = 'webview';
const ORGS_URL = 'https://claude.ai/api/organizations';
const usageUrl = (orgId) => `https://claude.ai/api/organizations/${orgId}/usage`;
const rateLimitsUrl = (orgId) => `https://claude.ai/api/organizations/${orgId}/rate_limits`;

const emitter = new EventEmitter();

const deps = {
  secrets: require('../secrets'),
  captureClaudeCookie,
};

async function connect() {
  const cookie = await deps.captureClaudeCookie();
  deps.secrets.setProviderSecret(id, cookie);
}

async function disconnect() {
  deps.secrets.clearProviderSecret(id);
}

function buildSnapshot(partial) {
  return {
    provider: id,
    fetchedAt: Date.now(),
    sessionPct: null, weeklyPct: null,
    sessionResetAt: null, weeklyResetAt: null,
    planLevel: null,
    approximated: false,
    raw: null, error: null,
    ...partial,
  };
}

async function fetchOrgId(cookie) {
  const r = await fetch(ORGS_URL, { headers: { Cookie: cookie } });
  if (r.status === 401 || r.status === 403) {
    return { error: { code: 'AUTH_EXPIRED', message: 'Claude session expired — reconnect Claude', retriable: false } };
  }
  if (!r.ok) return { error: { code: 'NETWORK', message: `HTTP ${r.status} on /api/organizations`, retriable: true } };
  const orgs = await r.json();
  if (!Array.isArray(orgs) || orgs.length === 0 || typeof orgs[0].uuid !== 'string') {
    return { error: { code: 'AUTH_EXPIRED', message: 'No org returned from /api/organizations', retriable: false } };
  }
  return { orgId: orgs[0].uuid };
}

async function refresh() {
  const cookie = deps.secrets.getProviderSecret(id);
  if (!cookie) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Claude first', retriable: false } });
  }
  try {
    const orgResp = await fetchOrgId(cookie);
    if (orgResp.error) return buildSnapshot({ error: orgResp.error });
    const orgId = orgResp.orgId;
    const [usageR, rlR] = await Promise.all([
      fetch(usageUrl(orgId), { headers: { Cookie: cookie } }),
      fetch(rateLimitsUrl(orgId), { headers: { Cookie: cookie } }),
    ]);
    if (usageR.status === 401 || usageR.status === 403) {
      return buildSnapshot({ error: { code: 'AUTH_EXPIRED', message: 'Cookie rejected — reconnect Claude', retriable: false } });
    }
    if (!usageR.ok) {
      return buildSnapshot({ error: { code: 'NETWORK', message: `HTTP ${usageR.status} on /usage`, retriable: true } });
    }
    const usageJson = await usageR.json();
    const parsed = parseClaudeUsage(usageJson);
    let planLevel = null;
    if (rlR.ok) {
      try { planLevel = parseClaudePlanLevel(await rlR.json()); } catch { /* tolerate rate_limits failure — usage is the primary signal */ }
    }
    const { sevenDaySonnetPct, sevenDayOpusPct, ...fields } = parsed;
    return buildSnapshot({ ...fields, planLevel, raw: { usage: usageJson, sevenDaySonnetPct, sevenDayOpusPct } });
  } catch (e) {
    if (e.message && e.message.includes('Unexpected Claude usage response')) {
      return buildSnapshot({ error: { code: 'PARSE', message: e.message, retriable: false } });
    }
    return buildSnapshot({ error: { code: 'NETWORK', message: e.message || String(e), retriable: true } });
  }
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
