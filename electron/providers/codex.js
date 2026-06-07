const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const { parseCodexUsage } = require('./codex-parser');
const { captureCodexCookie } = require('./codex-connect');

const id = 'codex';
const label = 'Codex';
const authMode = 'webview';
const CODEX_PARTITION = 'persist:codex-connect';
const SESSION_URL = 'https://chatgpt.com/api/auth/session';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const USAGE_PATH = '/backend-api/wham/usage';

// Even though net.fetch routes through Chromium, the default UA tag includes
// "Electron/X.Y.Z" which chatgpt.com detects and treats as logged-out. Force
// a clean Chrome UA on every call to look like a normal browser tab.
const MODERN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

// Hardcoded from a recent chatgpt.com deploy. These tag the request as
// originating from a known web client; OpenAI uses them for anti-abuse
// signals. They go stale on each chatgpt.com frontend deploy — accepted
// trade-off until we scrape them dynamically from chatgpt.com HTML.
const OAI_CLIENT_VERSION = 'prod-a9e268687461965b9507d0c5eeb8d58ad00b12dd';
const OAI_CLIENT_BUILD_NUMBER = '7215851';

/**
 * Build the app-level headers added on top of what Chromium's net.fetch
 * already sends (User-Agent, sec-ch-ua*, Cookie via credentials: 'include').
 *
 * Why net.fetch instead of Node's global fetch: as of late 2025, OpenAI's
 * anti-abuse path returns `code: "token_invalidated"` for requests whose
 * TLS fingerprint (JA3) and cookie jar context don't match the browser
 * tab that obtained `cf_clearance`. Even with perfectly-mimicked headers,
 * a Node-fetch request gets the user's session marked invalid. Calling
 * through Electron's net module routes through Chromium's network stack
 * — same JA3, same cookie store as the BrowserWindow used at connect.
 */
// Chromium's net.fetch forbids the "Sec-" family, User-Agent, Cookie, Referer,
// Accept-Encoding etc. — they are CORS-protected/Chromium-controlled and
// setting them throws net::ERR_INVALID_ARGUMENT. The UA is pinned on the
// session via session.setUserAgent(MODERN_UA); sec-fetch + cookie attachment
// happen automatically through credentials:'include'.
function buildUsageExtraHeaders(token, cookieJar) {
  const extra = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'oai-client-version': OAI_CLIENT_VERSION,
    'oai-client-build-number': OAI_CLIENT_BUILD_NUMBER,
    'oai-session-id': randomUUID(),
    'oai-language': 'en-US',
    'x-openai-target-path': USAGE_PATH,
    'x-openai-target-route': USAGE_PATH,
  };
  const oaiIs = cookieJar.get('__Secure-oai-is');
  if (oaiIs) extra['x-oai-is'] = oaiIs;
  const oaiDid = cookieJar.get('oai-did');
  if (oaiDid) extra['oai-device-id'] = oaiDid;
  return extra;
}

function buildSessionExtraHeaders() {
  return {
    Accept: 'application/json',
    'oai-language': 'en-US',
  };
}

const emitter = new EventEmitter();

const deps = {
  secrets: require('../secrets'),
  captureCodexCookie,
  // Lazily resolved at first use — tests inject mocks via `codex.deps.netFetch`
  // and `codex.deps.getSessionCookies` to avoid loading the `electron` module.
  netFetch: null,
  getSessionCookies: null,
};

let sessionUserAgentSet = false;

function resolveNetFetch() {
  if (deps.netFetch) return deps.netFetch;
  const { net, session } = require('electron');
  const codexSession = session.fromPartition(CODEX_PARTITION);
  if (!sessionUserAgentSet) {
    // Pin a clean Chrome 148 UA on the session itself. Default Electron UA
    // includes 'Electron/X.Y.Z' which chatgpt.com treats as suspicious.
    // Doing it on the session (not as a per-call header) is the only way —
    // User-Agent is a forbidden header for net.fetch.
    codexSession.setUserAgent(MODERN_UA);
    sessionUserAgentSet = true;
  }
  return (url, init = {}) => net.fetch(url, { ...init, session: codexSession });
}

function resolveSessionCookieGetter() {
  if (deps.getSessionCookies) return deps.getSessionCookies;
  const { session } = require('electron');
  const codexSession = session.fromPartition(CODEX_PARTITION);
  return () => codexSession.cookies.get({ url: 'https://chatgpt.com' });
}

async function getCookieJarFromSession(cookieGetter) {
  const cookies = await cookieGetter();
  const jar = new Map();
  for (const c of cookies || []) jar.set(c.name, c.value);
  return jar;
}

async function connect() {
  const cookie = await deps.captureCodexCookie();
  // Stored cookie string is kept for backward compat — refresh() only uses it
  // as a "connected" marker. Actual cookies for the network calls come from
  // the persistent session partition that the connect BrowserWindow populated.
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

async function fetchAccessToken(netFetch, cookieJar) {
  const r = await netFetch(SESSION_URL, {
    credentials: 'include',
    headers: buildSessionExtraHeaders(),
  });
  if (r.status === 401 || r.status === 403) {
    return { error: { code: 'AUTH_EXPIRED', message: 'ChatGPT session expired — reconnect Codex', retriable: false } };
  }
  if (!r.ok) return { error: { code: 'NETWORK', message: `HTTP ${r.status} on /api/auth/session`, retriable: true } };
  const j = await r.json();
  if (!j || typeof j.accessToken !== 'string') {
    // Diagnostic: surface response keys, body snippet, and cookie-jar size so
    // the next iteration knows whether the session is logged-out (empty body),
    // shape-shifted (different field name), or cookies are missing entirely.
    const keys = j && typeof j === 'object' ? Object.keys(j).join(',') : '<not-object>';
    const snippet = JSON.stringify(j || null).slice(0, 200);
    return {
      error: {
        code: 'AUTH_EXPIRED',
        message: `No accessToken in /api/auth/session response — reconnect Codex (cookies in jar: ${cookieJar.size}, keys: [${keys}], body: ${snippet})`,
        retriable: false,
      },
    };
  }
  return { token: j.accessToken };
}

async function refresh() {
  const stored = deps.secrets.getProviderSecret(id);
  if (!stored) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Codex first', retriable: false } });
  }
  try {
    const netFetch = resolveNetFetch();
    const cookieGetter = resolveSessionCookieGetter();

    // Fetch the cookie jar BEFORE the session call so diagnostics on the
    // "no accessToken" path can report whether cookies were actually present.
    const cookieJar = await getCookieJarFromSession(cookieGetter);

    const tokenResp = await fetchAccessToken(netFetch, cookieJar);
    if (tokenResp.error) return buildSnapshot({ error: tokenResp.error });
    const r = await netFetch(USAGE_URL, {
      credentials: 'include',
      headers: buildUsageExtraHeaders(tokenResp.token, cookieJar),
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
