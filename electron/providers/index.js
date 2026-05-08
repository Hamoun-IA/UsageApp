const anthropic = require('./anthropic');
const openai = require('./openai');
const ollama = require('./ollama');
const zai = require('./zai');

const REGISTRY = {
  anthropic,
  openai,
  ollama,
  zai,
};

function get(name) {
  return REGISTRY[name];
}

function list() {
  return Object.entries(REGISTRY).map(([id, mod]) => ({
    id,
    label: mod.label,
    requiresApiKey: mod.requiresApiKey,
    keyKindHint: mod.keyKindHint || null,
    docs: mod.docs || null,
  }));
}

module.exports = { get, list, REGISTRY };
