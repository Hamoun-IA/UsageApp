import React, { useEffect, useState, useRef } from 'react';
import { PROVIDER_COLORS, PROVIDER_LABELS, formatRelativeTime } from '../../shared/snapshot-utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS = ['claude', 'codex', 'ollama', 'zai'];

const DEFAULT_THRESHOLDS = {
  claude: { session: 90, weekly: 95, errorHours: 2 },
  codex:  { session: 90, weekly: 95, errorHours: 2 },
  ollama: { session: 90, weekly: 95, errorHours: 2 },
  zai:    { session: 90, weekly: 95, errorHours: 2 },
};

const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;

const ALERT_TYPE_LABELS = {
  session:       'Session %',
  weekly:        'Weekly %',
  persistentError: 'Erreur persistante',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  errorBanner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 12,
  },
  providerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  dot: (color) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
  providerLabel: {
    fontSize: 13,
    width: 52,
    flexShrink: 0,
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
  },
  numberInput: {
    width: 52,
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 12,
    textAlign: 'right',
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    fontSize: 12,
    color: '#d1d5db',
  },
  logDot: (color) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
  logType: {
    color: '#f87171',
    fontWeight: 600,
    marginRight: 2,
  },
  logMeta: {
    color: '#9ca3af',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },
};

// ---------------------------------------------------------------------------
// Alerts page
// ---------------------------------------------------------------------------

export default function Alerts() {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [alertLog, setAlertLog] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!window.api) return;
    loadData();
  }, []);

  async function loadData() {
    try {
      const [storedThresholds, storedLog] = await Promise.all([
        window.api.db.getPref('alertThresholds', DEFAULT_THRESHOLDS),
        window.api.db.getPref('alertLog', []),
      ]);
      if (!mountedRef.current) return;

      // Merge stored thresholds with defaults so new providers always have values
      const merged = { ...DEFAULT_THRESHOLDS };
      if (storedThresholds) {
        for (const p of PROVIDERS) {
          merged[p] = { ...DEFAULT_THRESHOLDS[p], ...(storedThresholds[p] || {}) };
        }
      }
      setThresholds(merged);
      setAlertLog(storedLog || []);
      setLoadError(null);
    } catch (err) {
      console.error('Alerts loadData error:', err);
      if (mountedRef.current) {
        setLoadError('Erreur de chargement — réessaie plus tard.');
      }
    }
  }

  function handleInputChange(provider, field, rawValue) {
    const num = Number(rawValue);
    if (isNaN(num)) return;
    setThresholds((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: num },
    }));
  }

  async function handleInputBlur(provider, field, rawValue) {
    const num = Number(rawValue);
    if (isNaN(num)) return;
    const updated = {
      ...thresholds,
      [provider]: { ...thresholds[provider], [field]: num },
    };
    setThresholds(updated);
    try {
      await window.api.db.setPref('alertThresholds', updated);
    } catch (err) {
      console.error('setPref alertThresholds failed:', err);
    }
  }

  // Filter alert log to last 7 days
  const now = Date.now();
  const recentAlerts = alertLog.filter((entry) => now - entry.at <= SEVEN_DAYS_MS);

  return (
    <div style={styles.root}>
      {loadError && (
        <div style={styles.errorBanner} role="alert">{loadError}</div>
      )}

      {/* Section 1 — Thresholds */}
      <section style={styles.section}>
        <div style={styles.heading}>Seuils</div>
        {PROVIDERS.map((id) => {
          const t = thresholds[id] || DEFAULT_THRESHOLDS[id];
          return (
            <div key={id} style={styles.providerRow}>
              <div style={styles.dot(PROVIDER_COLORS[id])} />
              <span style={styles.providerLabel}>{PROVIDER_LABELS[id]}</span>

              <div style={styles.inputGroup}>
                <span style={styles.inputLabel}>Session&nbsp;%&nbsp;&ge;</span>
                <input
                  type="number"
                  style={styles.numberInput}
                  value={t.session}
                  min={0}
                  max={100}
                  aria-label={`${PROVIDER_LABELS[id]} session threshold`}
                  onChange={(e) => handleInputChange(id, 'session', e.target.value)}
                  onBlur={(e) => handleInputBlur(id, 'session', e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <span style={styles.inputLabel}>Weekly&nbsp;%&nbsp;&ge;</span>
                <input
                  type="number"
                  style={styles.numberInput}
                  value={t.weekly}
                  min={0}
                  max={100}
                  aria-label={`${PROVIDER_LABELS[id]} weekly threshold`}
                  onChange={(e) => handleInputChange(id, 'weekly', e.target.value)}
                  onBlur={(e) => handleInputBlur(id, 'weekly', e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <span style={styles.inputLabel}>Erreur&nbsp;(h)&nbsp;&ge;</span>
                <input
                  type="number"
                  style={styles.numberInput}
                  value={t.errorHours}
                  min={0}
                  aria-label={`${PROVIDER_LABELS[id]} error hours threshold`}
                  onChange={(e) => handleInputChange(id, 'errorHours', e.target.value)}
                  onBlur={(e) => handleInputBlur(id, 'errorHours', e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Section 2 — Recent alerts log */}
      <section style={styles.section}>
        <div style={styles.heading}>Alertes r&eacute;centes</div>
        {recentAlerts.length === 0 ? (
          <div style={styles.emptyState}>Aucune alerte r&eacute;cente.</div>
        ) : (
          recentAlerts.map((entry, i) => (
            <div key={i} style={styles.logRow}>
              <div style={styles.logDot(PROVIDER_COLORS[entry.provider] || '#9ca3af')} />
              <span>{PROVIDER_LABELS[entry.provider] || entry.provider}</span>
              <span style={styles.logType}>
                {ALERT_TYPE_LABELS[entry.type] || entry.type}
              </span>
              <span>
                {entry.value != null ? `${Math.round(entry.value * 10) / 10}` : ''}
                {entry.type !== 'persistentError' ? '%' : 'h'}
                &nbsp;&ge;&nbsp;{entry.threshold}
                {entry.type !== 'persistentError' ? '%' : 'h'}
              </span>
              <span style={styles.logMeta}>
                {formatRelativeTime(entry.at)}&nbsp;ago
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
