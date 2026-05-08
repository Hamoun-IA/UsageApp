import React, { useEffect, useState } from 'react';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../shared/snapshot-utils.js';

const PROVIDERS = ['claude', 'codex', 'ollama', 'zai'];

const RETENTION_OPTIONS = [7, 30, 90, 180];

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
  const [loadError, setLoadError] = useState(null);

  async function loadData() {
    setLoading(true);
    try {
      const api = window.api;
      const [snaps, autostartVal, retentionVal] = await Promise.all([
        api.providers.refreshAll(),
        api.db.getPref('autostart', false),
        api.db.getPref('retentionDays', 90),
      ]);

      const byProvider = {};
      for (const snap of (snaps || [])) {
        byProvider[snap.provider] = snap;
      }
      setSnapsByProvider(byProvider);
      setAutostart(!!autostartVal);
      setRetentionDays(retentionVal ?? 90);
      setLoadError(null);
    } catch (err) {
      console.error('Settings loadData error:', err);
      setLoadError('Erreur de chargement — réessaie plus tard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!window.api) return;
    loadData();
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

      {/* Section 4: Raccourci global */}
      <section style={styles.section}>
        <div style={styles.heading}>Raccourci global</div>
        <div style={styles.row}>
          <code style={styles.shortcutCode}>Ctrl+Shift+Alt+U</code>
        </div>
        <div style={styles.subtle}>
          Ouvre la fenêtre détaillée. Configurable dans M5.
        </div>
      </section>
    </div>
  );
}
