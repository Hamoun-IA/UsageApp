/**
 * @typedef {Object} Snapshot
 * @property {string} provider           - 'claude' | 'codex' | 'ollama' | 'zai'
 * @property {number} fetchedAt          - epoch ms
 * @property {number|null} sessionPct    - 0..100 ou null si N/A
 * @property {number|null} weeklyPct
 * @property {number|null} sessionResetAt  - epoch ms ou null
 * @property {number|null} weeklyResetAt
 * @property {string|null} planLevel     - "Pro", "Max", etc.
 * @property {boolean} approximated      - true pour Codex
 * @property {object|null} raw           - payload brut (debug)
 * @property {ProviderError|null} error
 */

/**
 * @typedef {Object} ProviderError
 * @property {string} code     - 'NOT_CONFIGURED' | 'AUTH_EXPIRED' | 'NETWORK' | 'PARSE' | 'CLI_INACTIVE' | 'QUOTA_EXCEEDED'
 * @property {string} message
 * @property {boolean} retriable
 */

const REQUIRED_KEYS = [
  'provider', 'fetchedAt',
  'sessionPct', 'weeklyPct',
  'sessionResetAt', 'weeklyResetAt',
  'planLevel', 'approximated', 'raw', 'error',
];

function isValidSnapshot(s) {
  if (!s || typeof s !== 'object') return false;
  for (const k of REQUIRED_KEYS) {
    if (!(k in s)) return false;
  }
  if (typeof s.provider !== 'string') return false;
  if (typeof s.fetchedAt !== 'number') return false;
  if (typeof s.approximated !== 'boolean') return false;
  return true;
}

/**
 * Adapter interface every provider must implement.
 * Not enforced by JS — documentation only.
 *
 * @typedef {Object} ProviderAdapter
 * @property {string} id
 * @property {string} label
 * @property {'webview'|'cli-file'|'jsonl-tail'} authMode
 * @property {() => Promise<void>} connect
 * @property {() => Promise<void>} disconnect
 * @property {() => Promise<Snapshot>} refresh
 * @property {(cb: (s: Snapshot) => void) => () => void} subscribe
 */

module.exports = { isValidSnapshot };
