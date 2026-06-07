const { EventEmitter } = require('events');
const { parseCodexUsage } = require('./codex-parser');
const { captureCodexCookie } = require('./codex-connect');
const { browserHeaders } = require('./_browser-headers');

const id = 'codex';
const label = 'Codex';
const authMode = 'webview';
const SESSION_URL = 'https://chatgpt.com/api/auth/session';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const USAGE_PATH = '/backend-api/wham/usage';

/**
 * Parse a Cookie header string ("a=b; c=d") into a Map of name → value.
 * Splits each segment on the FIRST `=` to preserve `=` characters inside values.
 */
function parseCookieJar(cookieStr) {
  const out = new Map();
  if (!cookieStr || typeof cookieStr !== 'string') return out;
  for (const segment of cookieStr.split(/;\s*/)) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    const name = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}

/**
 * Since late 2025, /backend-api/wham/usage requires the full request shape of
 * a real chatgpt.com tab:
 *  - `Cookie` header (cf_clearance for Cloudflare, __Secure-oai-is + session
 *    tokens for OpenAI's anti-abuse check). The Bearer token alone is not
 *    accepted anymore.
 *  - `x-oai-is` (sourced from the `__Secure-oai-is` cookie value).
 *  - Cloudflare-edge routing headers `x-openai-target-path` /
 *    `x-openai-target-route`.
 */
function buildUsageHeaders(token, cookieStr, cookieJar) {
  const extra = {
    Authorization: `Bearer ${token}`,
    Cookie: cookieStr,
    'x-openai-target-path': USAGE_PATH,
    'x-openai-target-route': USAGE_PATH,
    'oai-language': 'en-US',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  };
  const oaiIs = cookieJar.get('__Secure-oai-is');
  if (oaiIs) extra['x-oai-is'] = oaiIs;
  const oaiDid = cookieJar.get('oai-did');
  if (oaiDid) extra['oai-device-id'] = oaiDid;
  return browserHeaders('https://chatgpt.com/codex/cloud/settings/analytics', extra);
}

const emitter = new EventEmitter();

const deps = {
  secrets: require('../secrets'),
  captureCodexCookie,
};

async function connect() {
  const cookie = await deps.captureCodexCookie();
  deps.secrets.setProviderSecret(id, cookie);
}

async function disconnect() {
  deps.secrets.clearProviderSecret(id);
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

async function fetchAccessToken(cookie) {
  const r = await fetch(SESSION_URL, { headers: browserHeaders('https://chatgpt.com/', { Cookie: cookie }) });
  if (r.status === 401 || r.status === 403) {
    return { error: { code: 'AUTH_EXPIRED', message: 'ChatGPT session expired — reconnect Codex', retriable: false } };
  }
  if (!r.ok) return { error: { code: 'NETWORK', message: `HTTP ${r.status} on /api/auth/session`, retriable: true } };
  const j = await r.json();
  if (!j || typeof j.accessToken !== 'string') {
    return { error: { code: 'AUTH_EXPIRED', message: 'No accessToken in /api/auth/session response', retriable: false } };
  }
  return { token: j.accessToken };
}

async function refresh() {
  const cookie = deps.secrets.getProviderSecret(id);
  if (!cookie) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Codex first', retriable: false } });
  }
  try {
    const tokenResp = await fetchAccessToken(cookie);
    if (tokenResp.error) return buildSnapshot({ error: tokenResp.error });
    const cookieJar = parseCookieJar(cookie);
    const r = await fetch(USAGE_URL, {
      headers: buildUsageHeaders(tokenResp.token, cookie, cookieJar),
    });
    if (r.status === 401 || r.status === 403) {
      let snippet = '';
      try { snippet = (await r.text()).slice(0, 200); } catch {}
      return buildSnapshot({ error: { code: 'AUTH_EXPIRED', message: `HTTP ${r.status} on /wham/usage — reconnect Codex (body: ${snippet || '<empty>'})`, retriable: false } });
    }
    if (!r.ok) return buildSnapshot({ error: { code: 'NETWORK', message: `HTTP ${r.status} on wham/usage`, retriable: true } });
    const json = await r.json();
    const parsed = parseCodexUsage(json);
    const { limitReached, ...fields } = parsed;
    if (limitReached) {
      return buildSnapshot({ ...fields, raw: json, error: { code: 'QUOTA_EXCEEDED', message: 'Codex rate limit reached', retriable: true } });
    }
    return buildSnapshot({ ...fields, raw: json });
  } catch (e) {
    if (e.message && e.message.includes('Unexpected ChatGPT usage response')) {
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
