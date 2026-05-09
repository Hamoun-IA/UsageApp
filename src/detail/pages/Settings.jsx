import React, { useEffect, useRef, useState } from 'react';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../shared/snapshot-utils.js';
import ShortcutInput from '../components/ShortcutInput.jsx';

const PROVIDERS = ['claude', 'codex', 'ollama', 'zai'];

const RETENTION_OPTIONS = [7, 30, 90, 180];

const POLL_INTERVAL_OPTIONS = [
  { value: 1,  label: '1 minute' },
  { value: 5,  label: '5 minutes' },
  { value: 15, label: '15 minutes' },
];

const styles = {
  root: {
    padding: 24,
    color: '#e5e7eb',
    fontFamily: 'Segoe UI, sans-serif',
  },
  section: {
    marginBottom: 32,
  },
  heading: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 12,
    color: '#f9fafb',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  dot: (color) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
  label: {
    flex: 1,
    fontSize: 13,
  },
  statusText: (connected) => ({
    fontSize: 12,
    color: connected ? '#10b981' : '#9ca3af',
    marginRight: 8,
  }),
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginRight: 8,
  },
  btn: (primary) => ({
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: primary ? '#3b82f6' : '#374151',
    color: '#f9fafb',
  }),
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  subtle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  select: {
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
    cursor: 'pointer',
  },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 12,
  },
  shortcutCode: {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '2px 8px',
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e5e7eb',
  },
};

/**
 * Derive connection status from a snapshot.
 * Returns { connected: bool, statusLabel: string }
 */
function deriveStatus(snap) {
  if (!snap) return { connected: false, statusLabel: 'Déconnecté', isError: false };
  if (!snap.error) return { connected: true, statusLabel: 'Connecté', isError: false };
  const code = snap.error?.code;
  if (code === 'NOT_CONFIGURED') return { connected: false, statusLabel: 'Déconnecté', isError: false };
  if (code === 'AUTH_EXPIRED') return { connected: true, statusLabel: 'Auth expirée', isError: true };
  const msg = snap.error?.message || code || 'Erreur';
  return { connected: false, statusLabel: `Erreur: ${msg}`, isError: true };
}

export default function Settings() {
  const [snapsByProvider, setSnapsByProvider] = useState({});
  const [loading, setLoading] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [pollIntervalMin, setPollIntervalMin] = useState(5);
  const [globalShortcut, setGlobalShortcut] = useState('CommandOrControl+Shift+Alt+U');
  const [shortcutError, setShortcutError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const mountedRef = useRef(true);

  async function loadData() {
    setLoading(true);
    try {
      const api = window.api;
      const [snaps, autostartVal, retentionVal, pollVal, shortcutVal] = await Promise.all([
        api.providers.refreshAll(),
        api.db.getPref('autostart', false),
        api.db.getPref('retentionDays', 90),
        api.db.getPref('pollIntervalMin', 5),
        api.db.getPref('globalShortcut', 'CommandOrControl+Shift+Alt+U'),
      ]);

      if (!mountedRef.current) return;

      const byProvider = {};
      for (const snap of (snaps || [])) {
        byProvider[snap.provider] = snap;
      }
      setSnapsByProvider(byProvider);
      setAutostart(!!autostartVal);
      setRetentionDays(retentionVal ?? 90);
      setPollIntervalMin(pollVal ?? 5);
      setGlobalShortcut(shortcutVal || 'CommandOrControl+Shift+Alt+U');
      setLoadError(null);
    } catch (err) {
      console.error('Settings loadData error:', err);
      if (mountedRef.current) setLoadError('Erreur de chargement — réessaie plus tard.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    if (!window.api) return;
    loadData();
    return () => { mountedRef.current = false; };
  }, []);

  async function handleConnect(providerId) {
    try {
      await window.api.providers.connect(providerId);
      await loadData();
    } catch (err) {
      console.error('connect failed:', err);
    }
  }

  async function handleDisconnect(providerId) {
    try {
      await window.api.providers.disconnect(providerId);
      await loadData();
    } catch (err) {
      console.error('disconnect failed:', err);
    }
  }

  async function handleAutostartChange(e) {
    const checked = e.target.checked;
    setAutostart(checked);
    try {
      await window.api.app.setAutostart(checked);
    } catch (err) {
      console.error('setAutostart failed:', err);
    }
  }

  async function handlePollIntervalChange(e) {
    const val = Number(e.target.value);
    setPollIntervalMin(val);
    try {
      await window.api.app.setPollInterval(val);
    } catch (err) {
      console.error('setPollInterval failed:', err);
    }
  }

  async function handleShortcutChange(accelerator) {
    setShortcutError(null);
    try {
      const result = await window.api.app.setGlobalShortcut(accelerator);
      if (result && result.ok) {
        setGlobalShortcut(accelerator);
      } else {
        const reason = result && result.reason;
        setShortcutError(
          reason === 'CONFLICT'
            ? 'Combinaison déjà utilisée par un autre process.'
            : 'Raccourci invalide.',
        );
      }
    } catch (err) {
      console.error('setGlobalShortcut failed:', err);
      setShortcutError('Erreur — réessaie.');
    }
  }

  async function handleRetentionChange(e) {
    const val = Number(e.target.value);
    setRetentionDays(val);
    try {
      await window.api.db.setPref('retentionDays', val);
    } catch (err) {
      console.error('setPref retentionDays failed:', err);
    }
  }

  return (
    <div style={styles.root}>
      {/* Section 1: Connexions */}
      <section style={styles.section}>
        {loadError && (
          <div style={styles.errorBanner} role="alert">{loadError}</div>
        )}
        <div style={styles.heading}>Connexions</div>
        {PROVIDERS.map((id) => {
          const snap = snapsByProvider[id];
          const { connected, statusLabel, isError } = deriveStatus(snap);
          return (
            <div key={id} style={styles.row}>
              <div style={styles.dot(PROVIDER_COLORS[id])} />
              <span style={styles.label}>{PROVIDER_LABELS[id]}</span>
              <span style={isError ? styles.errorText : styles.statusText(connected)}>
                {statusLabel}
              </span>
              {connected ? (
                <button
                  style={styles.btn(false)}
                  onClick={() => handleDisconnect(id)}
                  disabled={loading}
                >
                  Déconnecter
                </button>
              ) : (
                <button
                  style={styles.btn(true)}
                  onClick={() => handleConnect(id)}
                  disabled={loading}
                >
                  Connecter
                </button>
              )}
            </div>
          );
        })}
      </section>

      {/* Section 2: Démarrage automatique */}
      <section style={styles.section}>
        <div style={styles.heading}>Démarrage automatique</div>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={autostart}
            onChange={handleAutostartChange}
          />
          Lancer au démarrage de Windows
        </label>
        <div style={styles.subtle}>
          Lancera l&apos;app au démarrage de Windows en mode minimisé.
        </div>
      </section>

      {/* Section: Fréquence de rafraîchissement */}
      <section style={styles.section}>
        <div style={styles.heading}>Fréquence de rafraîchissement</div>
        <div style={styles.row}>
          <select
            style={styles.select}
            aria-label="Fréquence"
            value={pollIntervalMin}
            onChange={handlePollIntervalChange}
          >
            {POLL_INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.subtle}>
          Cadence du polling background. Affecte tous les providers.
        </div>
      </section>

      {/* Section 3: Rétention DB */}
      <section style={styles.section}>
        <div style={styles.heading}>Rétention DB</div>
        <div style={{ ...styles.row, marginBottom: 6 }}>
          <select
            style={styles.select}
            value={retentionDays}
            onChange={handleRetentionChange}
          >
            {RETENTION_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} jours
              </option>
            ))}
          </select>
        </div>
        <div style={styles.subtle}>
          Les snapshots plus anciens seront supprimés au prochain démarrage.
        </div>
      </section>

      {/* Section: Raccourci global */}
      <section style={styles.section}>
        <div style={styles.heading}>Raccourci global</div>
        {shortcutError && (
          <div style={styles.errorBanner} role="alert">{shortcutError}</div>
        )}
        <div style={styles.row}>
          <ShortcutInput
            value={globalShortcut}
            onChange={handleShortcutChange}
            onError={(msg) => setShortcutError(msg)}
          />
        </div>
        <div style={styles.subtle}>
          Ouvre/ferme la fenêtre détaillée. Esc pendant la capture annule.
        </div>
      </section>
    </div>
  );
}
