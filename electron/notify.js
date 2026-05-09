'use strict';

// Native Notification toaster for triggered alerts.
//
// In production, `Notification` comes from `require('electron').Notification`.
// In tests, the project's Vitest 4 setup does NOT route CJS require() through
// `vi.mock('electron')` (the mock only applies to ESM `import`), so we expose
// a small `deps` container that tests inject via `notify.deps.Notification = ...`
// before calling `fireAlertNotifications`. This mirrors the dep-injection
// pattern already used in `electron/ipc.js`.

let _electron = null;
try {
  _electron = require('electron');
} catch (_e) {
  _electron = null;
}

const PROVIDER_LABELS = {
  claude: 'Claude',
  codex:  'Codex',
  ollama: 'Ollama',
  zai:    'Z.ai',
};

const TYPE_LABELS_FR = {
  session:         'session',
  weekly:          'weekly',
  persistentError: 'erreur persistante',
};

/**
 * Format a single triggered alert into a "session 92 %" /
 * "erreur persistante 3.5h" fragment for the body line.
 */
function formatAlertFragment(a) {
  const typeLabel = TYPE_LABELS_FR[a.type] || a.type;
  if (a.type === 'persistentError') {
    const h = Math.round(a.value * 10) / 10;
    return `${typeLabel} ${h}h`;
  }
  const pct = Math.round(a.value);
  return `${typeLabel} ${pct} %`;
}

function _resolveNotification() {
  if (deps.Notification) return deps.Notification;
  if (_electron && typeof _electron === 'object' && _electron.Notification) {
    return _electron.Notification;
  }
  return null;
}

/**
 * Group `newAlerts` by provider and emit ONE Notification per provider.
 * No-op when newAlerts is empty or Notifications are unsupported on this OS.
 *
 * @param {Array<{ provider, type, threshold, value, at }>} newAlerts
 */
function fireAlertNotifications(newAlerts) {
  if (!Array.isArray(newAlerts) || newAlerts.length === 0) return;

  const Notification = _resolveNotification();
  if (!Notification || typeof Notification.isSupported !== 'function') return;
  if (!Notification.isSupported()) return;

  const byProvider = new Map();
  for (const a of newAlerts) {
    if (!byProvider.has(a.provider)) byProvider.set(a.provider, []);
    byProvider.get(a.provider).push(a);
  }

  for (const [provider, alerts] of byProvider) {
    const label = PROVIDER_LABELS[provider] || provider;
    const fragments = alerts.map(formatAlertFragment).join(', ');
    const n = new Notification({
      title: `AI Usage — ${label}`,
      body: fragments,
      silent: false,
    });
    try {
      n.show();
    } catch (e) {
      console.error('Notification.show failed:', e);
    }
  }
}

// Single mutation surface for tests; production leaves it untouched and
// `_resolveNotification` falls through to `require('electron').Notification`.
const deps = { Notification: null };

module.exports = { fireAlertNotifications, deps };
