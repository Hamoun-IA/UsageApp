const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Wrap Electron's safeStorage. On Windows it uses DPAPI under the user account,
 * so the encrypted blob is unreadable by other users.
 */
function isAvailable() {
  return safeStorage.isEncryptionAvailable();
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  if (!isAvailable()) {
    // Fallback: store as-is. We mark it so we can warn the user in the UI.
    return Buffer.from('PLAIN:' + plaintext, 'utf8');
  }
  return safeStorage.encryptString(plaintext);
}

function decrypt(buf) {
  if (!buf) return null;
  // Buffer can come back from sqlite as Uint8Array
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length > 6 && b.slice(0, 6).toString('utf8') === 'PLAIN:') {
    return b.slice(6).toString('utf8');
  }
  if (!isAvailable()) return null;
  try {
    return safeStorage.decryptString(b);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider-key storage (file-backed, safeStorage-encrypted)
// Persists per-provider JWT tokens / API keys across app restarts.
// ---------------------------------------------------------------------------

function secretsFilePath() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(secretsFilePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveAll(map) {
  fs.writeFileSync(secretsFilePath(), JSON.stringify(map), { encoding: 'utf-8' });
}

function setProviderSecret(provider, plainText) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption not available');
  }
  const map = loadAll();
  map[provider] = safeStorage.encryptString(plainText).toString('base64');
  saveAll(map);
}

function getProviderSecret(provider) {
  const map = loadAll();
  if (!map[provider]) return null;
  const buf = Buffer.from(map[provider], 'base64');
  return safeStorage.decryptString(buf);
}

function clearProviderSecret(provider) {
  const map = loadAll();
  delete map[provider];
  saveAll(map);
}

module.exports = {
  isAvailable,
  encrypt,
  decrypt,
  setProviderSecret,
  getProviderSecret,
  clearProviderSecret,
};
