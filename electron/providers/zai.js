const { EventEmitter } = require('events');

const id = 'zai';
const label = 'Z.ai';
const authMode = 'webview';

const emitter = new EventEmitter();

async function connect() {
  throw new Error('zai.connect not implemented (M2)');
}

async function disconnect() {
  // no-op stub
}

async function refresh() {
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
    error: { code: 'NOT_CONFIGURED', message: 'Adapter stub — implement in M2', retriable: false },
  };
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe };
