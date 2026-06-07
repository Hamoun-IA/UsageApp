const { EventEmitter } = require('events');
const { parseCodexUsage } = require('./codex-parser');
const { captureCodexCookie } = require('./codex-connect');
const codexFetcher = require('./codex-fetcher');

const id = 'codex';
const label = 'Codex';
const authMode = 'webview';

const emitter = new EventEmitter();

const deps = {
  secrets: require('../secrets'),
  captureCodexCookie,
  // Injectable for tests: a function returning the shape produced by
  // codex-fetcher.fetchCodexUsage(). Default delegates to the real fetcher.
  fetchCodexUsage: codexFetcher.fetchCodexUsage,
};

async function connect() {
  const cookie = await deps.captureCodexCookie();
  // Stored cookie string is kept as a "connected" marker — actual cookies
  // for network calls live in the persist:codex-connect partition that the
  // BrowserWindow populated during connect and that the fetcher reuses.
  deps.secrets.setProviderSecret(id, cookie);
}

async function disconnect() {
  deps.secrets.clearProviderSecret(id);
  try { codexFetcher.destroy(); } catch {}
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

function authExpired(message) {
  return { code: 'AUTH_EXPIRED', message, retriable: false };
}

function network(message) {
  return { code: 'NETWORK', message, retriable: true };
}

async function refresh() {
  const stored = deps.secrets.getProviderSecret(id);
  if (!stored) {
    return buildSnapshot({ error: { code: 'NOT_CONFIGURED', message: 'Connect Codex first', retriable: false } });
  }
  let result;
  try {
    result = await deps.fetchCodexUsage();
  } catch (e) {
    return buildSnapshot({ error: network(`fetcher threw: ${e.message || String(e)}`) });
  }

  if (!result || result.ok !== true) {
    const phase = result && result.phase;
    if (phase === 'session') {
      if (result.noToken) {
        return buildSnapshot({ error: authExpired(`No accessToken in /api/auth/session — reconnect Codex (keys: [${result.keys}], body: ${result.body})`) });
      }
      if (result.status === 401 || result.status === 403) {
        return buildSnapshot({ error: authExpired(`HTTP ${result.status} on /api/auth/session — reconnect Codex (body: ${result.body || '<empty>'})`) });
      }
      return buildSnapshot({ error: network(`HTTP ${result.status || '?'} on /api/auth/session (body: ${result.body || '<empty>'})`) });
    }
    if (phase === 'usage') {
      if (result.status === 401 || result.status === 403) {
        return buildSnapshot({ error: authExpired(`HTTP ${result.status} on /wham/usage — reconnect Codex (body: ${result.body || '<empty>'})`) });
      }
      return buildSnapshot({ error: network(`HTTP ${result.status || '?'} on /wham/usage (body: ${result.body || '<empty>'})`) });
    }
    if (phase === 'exception') {
      return buildSnapshot({ error: network(`page fetch exception: ${result.message}`) });
    }
    return buildSnapshot({ error: network(`unknown fetcher result: ${JSON.stringify(result).slice(0, 200)}`) });
  }

  // result.ok === true → result.usage is the parsed JSON
  try {
    const parsed = parseCodexUsage(result.usage);
    const { limitReached, ...fields } = parsed;
    if (limitReached) {
      return buildSnapshot({ ...fields, raw: result.usage, error: { code: 'QUOTA_EXCEEDED', message: 'Codex rate limit reached', retriable: true } });
    }
    return buildSnapshot({ ...fields, raw: result.usage });
  } catch (e) {
    if (e.message && e.message.includes('Unexpected ChatGPT usage response')) {
      return buildSnapshot({ error: { code: 'PARSE', message: e.message, retriable: false } });
    }
    return buildSnapshot({ error: network(e.message || String(e)) });
  }
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
