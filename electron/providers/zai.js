const { EventEmitter } = require('events');
const { parseZaiResponse } = require('./zai-parser');

// Dependency container — allows test injection without breaking production.
// Tests can replace deps.secrets after import to inject a mock.
const deps = {
  secrets: require('../secrets'),
};

const id = 'zai';
const label = 'Z.ai';
const authMode = 'webview';
const ENDPOINT = 'https://api.z.ai/api/monitor/usage/quota/limit';

const emitter = new EventEmitter();

async function connect() {
  // Webview flow implemented in Task 2.3
  throw new Error('zai.connect: webview flow not yet implemented (Task 2.3)');
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

async function refresh() {
  const token = deps.secrets.getProviderSecret(id);
  if (!token) {
    return buildSnapshot({
      error: { code: 'NOT_CONFIGURED', message: 'Connect Z.ai first', retriable: false },
    });
  }
  try {
    const resp = await fetch(ENDPOINT, { headers: { Authorization: token } });
    if (resp.status === 401 || resp.status === 403) {
      return buildSnapshot({
        error: { code: 'AUTH_EXPIRED', message: 'Token expired — reconnect Z.ai', retriable: false },
      });
    }
    if (!resp.ok) {
      return buildSnapshot({
        error: { code: 'NETWORK', message: `HTTP ${resp.status}`, retriable: true },
      });
    }
    const json = await resp.json();
    const parsed = parseZaiResponse(json);
    return buildSnapshot({ ...parsed, raw: json });
  } catch (e) {
    if (e.message && e.message.includes('Unexpected Z.ai response')) {
      return buildSnapshot({
        error: { code: 'PARSE', message: e.message, retriable: false },
      });
    }
    return buildSnapshot({
      error: { code: 'NETWORK', message: e.message || String(e), retriable: true },
    });
  }
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe, deps };
