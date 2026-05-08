import React, { useState, useEffect } from 'react';
import ProviderCard from '../components/ProviderCard.jsx';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../shared/snapshot-utils.js';

const PROVIDERS = ['claude', 'codex', 'ollama', 'zai'];

async function loadData() {
  if (!window.api?.providers?.refreshAll) return { snaps: [], series: {} };

  let snaps = [];
  try {
    const result = await window.api.providers.refreshAll();
    snaps = result || [];
  } catch (e) {
    console.error('refreshAll failed:', e);
  }

  const sinceMs = Date.now() - 24 * 3600_000;
  const series = {};
  for (const provider of PROVIDERS) {
    try {
      const rows = await window.api.db.recentSnapshots(provider, sinceMs);
      // DB returns DESC; reverse to get chronological order (oldest → newest)
      const pts = (rows || [])
        .slice()
        .reverse()
        .map(row => row.session_pct ?? 0);
      series[provider] = pts;
    } catch (e) {
      console.error(`recentSnapshots failed for ${provider}:`, e);
      series[provider] = [];
    }
  }

  return { snaps, series };
}

export default function Dashboard() {
  const [snaps, setSnaps] = useState([]);
  const [seriesByProvider, setSeriesByProvider] = useState({});

  useEffect(() => {
    let mounted = true;
    const run = () => {
      loadData().then(({ snaps: s, series }) => {
        if (!mounted) return;
        setSnaps(s);
        setSeriesByProvider(series);
      });
    };
    run();
    const id = setInterval(run, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Empty state: no providers configured or all snaps are NOT_CONFIGURED, and no series data
  const allNotConfigured =
    snaps.length === 0 ||
    snaps.every(s => s?.error?.code === 'NOT_CONFIGURED');
  const anySeriesData = Object.values(seriesByProvider).some(pts => pts.length > 0);

  if (allNotConfigured && !anySeriesData) {
    return (
      <div style={{ padding: 24, color: '#9ca3af', fontFamily: 'Segoe UI, sans-serif' }}>
        Pas encore de données — clique Connecter dans la barre latérale Settings.
      </div>
    );
  }

  // Build a map from provider id → snap for quick lookup
  const snapByProvider = {};
  for (const s of snaps) {
    if (s?.provider) snapByProvider[s.provider] = s;
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        {PROVIDERS.map(provider => {
          const snap = snapByProvider[provider] ?? { provider, error: { code: 'NOT_CONFIGURED' } };
          const points = seriesByProvider[provider] ?? [];
          return (
            <ProviderCard
              key={provider}
              snap={snap}
              points={points}
              color={PROVIDER_COLORS[provider]}
              label={PROVIDER_LABELS[provider]}
            />
          );
        })}
      </div>
    </div>
  );
}
