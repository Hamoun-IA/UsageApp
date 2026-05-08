const claude = require('./claude');
const codex = require('./codex');
const ollama = require('./ollama');
const zai = require('./zai');

const providers = { claude, codex, ollama, zai };

function getAdapter(id) {
  const a = providers[id];
  if (!a) throw new Error(`Unknown provider: ${id}`);
  return a;
}

function listAdapters() {
  return Object.values(providers);
}

// Backwards-compat aliases for existing callsites in scheduler.js / notifier.js / main.js
// These will be removed in Task 1.8 when we rewrite the IPC layer.
function get(id) {
  try { return getAdapter(id); } catch { return undefined; }
}
function list() { return listAdapters(); }

module.exports = { providers, getAdapter, listAdapters, get, list };
