const { EventEmitter } = require('events');

const id = 'codex';
const label = 'Codex';
const authMode = 'jsonl-tail';

const emitter = new EventEmitter();

async function connect() {
  throw new Error('codex.connect not implemented (M3)');
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
    approximated: true,
    raw: null,
    error: { code: 'NOT_CONFIGURED', message: 'Adapter stub — implement in M3', retriable: false },
  };
}

function subscribe(cb) {
  emitter.on('snapshot', cb);
  return () => emitter.off('snapshot', cb);
}

module.exports = { id, label, authMode, connect, disconnect, refresh, subscribe };
