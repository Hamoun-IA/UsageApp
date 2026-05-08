const { EventEmitter } = require('events');
const { parseOllamaSettings } = require('./ollama-parser');
const { captureOllamaCookie } = require('./ollama-connect');

const id = 'ollama';
const label = 'Ollama';
const authMode = 'webview';
const ENDPOINT = 'https://ollama.com/settings';

const emitter = new EventEmitter();

const deps = {
  secrets: require('../secrets'),
  captureOllamaCookie,
};

async function connect() {
  const cookie = await deps.captureOllamaCookie();
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

async function refresh() {
  const cookie = deps.secrets.getProviderSecret(id);
  if (!cookie) {
    return buildSnapshot({
      error: { code: 'NOT_CONFIGURED', message: 'Connect Ollama first', retriable: false },
    });
  }
  try {
    const resp = await fetch(ENDPOINT, {
      headers: { Cookie: cookie },
      redirect: 'follow',
    });
    if (resp.url && /\/signin/i.test(resp.url)) {
      return buildSnapshot({
        error: { code: 'AUTH_EXPIRED', message: 'Cookie expired — reconnect Ollama', retriable: false },
      });
    }
    if (resp.status === 401 || resp.status === 403) {
      return buildSnapshot({
        error: { code: 'AUTH_EXPIRED', message: 'Auth rejected — reconnect Ollama', retriable: false },
      });
    }
    if (!resp.ok) {
      return buildSnapshot({
        error: { code: 'NETWORK', message: `HTTP ${resp.status}`, retriable: true },
      });
    }
    const html = await resp.text();
    if (/sign[- ]in/i.test(html) && !/Cloud Usage/i.test(html)) {
      return buildSnapshot({
        error: { code: 'AUTH_EXPIRED', message: 'Got signin page — reconnect Ollama', retriable: false },
      });
    }
    const parsed = parseOllamaSettings(html);
    return buildSnapshot({ ...parsed, raw: { html: html.slice(0, 2000) } });
  } catch (e) {
    if (e.message && e.message.includes('parseOllamaSettings')) {
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
