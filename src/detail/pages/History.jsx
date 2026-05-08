import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  Area,
} from 'recharts';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../shared/snapshot-utils.js';

const PROVIDERS = ['claude', 'codex', 'ollama', 'zai'];
const THIRTY_DAYS_MS = 30 * 24 * 3600_000;

// ---------------------------------------------------------------------------
// Data-prep helpers (exported for unit-testing)
// ---------------------------------------------------------------------------

/**
 * Convert DESC rows from a single provider into a chronological series.
 * @param {Array} rows  - snake_case DB rows (DESC by fetched_at)
 * @param {'session'|'weekly'} window - which metric to read
 * @returns {Array<{time: number, value: number|null}>}
 */
export function prepSingleSeries(rows, window) {
  const field = window === 'weekly' ? 'weekly_pct' : 'session_pct';
  return rows
    .slice()
    .reverse()
    .map(row => ({ time: row.fetched_at, value: row[field] ?? null }));
}

/**
 * Merge rows from all 4 providers into a wide-format chronological series.
 * Rows with the same fetched_at are merged into a single object.
 * @param {Object} rowsByProvider - { claude: [...], codex: [...], ... }
 * @param {'session'|'weekly'} window
 * @returns {Array<{time: number, claude?, codex?, ollama?, zai?}>}
 */
export function prepAllSeries(rowsByProvider, window) {
  const field = window === 'weekly' ? 'weekly_pct' : 'session_pct';

  // Collect all points keyed by timestamp
  const byTime = {};
  for (const provider of PROVIDERS) {
    const rows = rowsByProvider[provider] || [];
    for (const row of rows) {
      const t = row.fetched_at;
      if (!byTime[t]) byTime[t] = { time: t };
      byTime[t][provider] = row[field] ?? null;
    }
  }

  // Sort chronologically
  return Object.values(byTime).sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTickDate(epochMs) {
  const d = new Date(epochMs);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
}

function formatTooltipDate(epochMs) {
  const d = new Date(epochMs);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const h   = String(d.getHours()).padStart(2, '0');
  const m   = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${mon} ${h}:${m}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: 24,
    color: '#e5e7eb',
    fontFamily: 'Segoe UI, sans-serif',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  providerGroup: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  windowGroup: {
    display: 'flex',
    gap: 6,
    marginLeft: 'auto',
  },
  btn: (active) => ({
    padding: '5px 12px',
    fontSize: 12,
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: active ? '#4b5563' : '#1f2937',
    color: active ? '#f9fafb' : '#9ca3af',
    fontWeight: active ? 600 : 400,
    transition: 'background-color 0.15s',
  }),
  chartContainer: {
    width: '100%',
    height: 400,
  },
  emptyState: {
    marginTop: 80,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 12,
  },
};

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: 12,
        color: '#e5e7eb',
      }}
    >
      <div style={{ marginBottom: 4, color: '#9ca3af' }}>{formatTooltipDate(label)}</div>
      {payload.map(entry => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {PROVIDER_LABELS[entry.dataKey] || entry.dataKey}: {entry.value != null ? `${entry.value}%` : '—'}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function History() {
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [selectedWindow, setSelectedWindow] = useState('session');
  const [rowsByProvider, setRowsByProvider] = useState({});
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!window.api?.db?.recentSnapshots) return;
    let mounted = true;

    const sinceMs = Date.now() - THIRTY_DAYS_MS;
    const promises = PROVIDERS.map(provider =>
      window.api.db.recentSnapshots(provider, sinceMs).then(rows => ({ provider, rows: rows || [] }))
    );

    Promise.all(promises)
      .then(results => {
        if (!mounted) return;
        const byProvider = {};
        for (const { provider, rows } of results) {
          byProvider[provider] = rows;
        }
        setRowsByProvider(byProvider);
        setLoadError(null);
      })
      .catch(err => {
        if (!mounted) return;
        console.error('History loadData error:', err);
        setLoadError('Erreur de chargement — réessaie plus tard.');
      });

    return () => { mounted = false; };
  }, [selectedProvider, selectedWindow]);

  // Build chart data
  const isSingle = selectedProvider !== 'all';

  let chartData = [];
  if (isSingle) {
    const rows = rowsByProvider[selectedProvider] || [];
    chartData = prepSingleSeries(rows, selectedWindow);
  } else {
    chartData = prepAllSeries(rowsByProvider, selectedWindow);
  }

  const isEmpty = chartData.length === 0;

  return (
    <div style={styles.root}>
      {/* Top row: provider selector + window selector */}
      <div style={styles.topRow}>
        <div style={styles.providerGroup}>
          <button
            style={styles.btn(selectedProvider === 'all')}
            onClick={() => setSelectedProvider('all')}
            aria-pressed={selectedProvider === 'all'}
          >
            All
          </button>
          {PROVIDERS.map(p => (
            <button
              key={p}
              style={styles.btn(selectedProvider === p)}
              onClick={() => setSelectedProvider(p)}
              aria-pressed={selectedProvider === p}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        <div style={styles.windowGroup}>
          <button
            style={styles.btn(selectedWindow === 'session')}
            onClick={() => setSelectedWindow('session')}
            aria-pressed={selectedWindow === 'session'}
          >
            Session 5h
          </button>
          <button
            style={styles.btn(selectedWindow === 'weekly')}
            onClick={() => setSelectedWindow('weekly')}
            aria-pressed={selectedWindow === 'weekly'}
          >
            Weekly
          </button>
        </div>
      </div>

      {/* Error banner */}
      {loadError && (
        <div style={styles.errorBanner} role="alert">{loadError}</div>
      )}

      {/* Chart or empty state */}
      {isEmpty ? (
        <div style={styles.emptyState}>
          Pas de données pour les 30 derniers jours.
        </div>
      ) : (
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="time"
                tickFormatter={formatTickDate}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#374151' }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              {isSingle ? (
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={PROVIDER_COLORS[selectedProvider]}
                  fill={PROVIDER_COLORS[selectedProvider]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              ) : (
                PROVIDERS.map(p => (
                  <Area
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={PROVIDER_COLORS[p]}
                    fill={PROVIDER_COLORS[p]}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                ))
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
