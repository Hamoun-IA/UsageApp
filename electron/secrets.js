const { safeStorage } = require('electron');

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

module.exports = { isAvailable, encrypt, decrypt };
