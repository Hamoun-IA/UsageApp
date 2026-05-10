import React, { useEffect, useRef, useState, useCallback } from 'react';
import ProviderRow from './components/ProviderRow';
import ProviderTabs from './components/ProviderTabs';
import { formatRelativeTime } from '../shared/snapshot-utils';

const REFRESH_THROTTLE_MS = 10_000;

export default function Widget() {
  const [snaps, setSnaps] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('all');
  const rootRef = useRef(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (!rootRef.current || !window.api?.widget?.setHeight) return;
    const observer = new ResizeObserver(() => {
      if (rootRef.current) window.api.widget.setHeight(rootRef.current.offsetHeight);
    });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const refresh = useCallback(async () => {
    lastFetchRef.current = Date.now();
    setRefreshing(true);
    try {
      const result = await window.api.providers.refreshAll();
      setSnaps(result);
      setLastFetch(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleConnect = useCallback(async (providerId) => {
    try {
      await window.api.providers.connect(providerId);
      await refresh();
    } catch (e) {
      console.error('connect failed', e);
    }
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!window.api?.widget?.onShow) return;
    return window.api.widget.onShow(() => {
      if (Date.now() - lastFetchRef.current < REFRESH_THROTTLE_MS) return;
      refresh();
    });
  }, [refresh]);

  const visibleSnaps = activeTab === 'all'
    ? snaps
    : snaps.filter((s) => s.provider === activeTab);

  return (
    <div ref={rootRef} style={{ width: 320, background: '#0e1217', color: '#e5e7eb', padding: 14, fontFamily: 'Segoe UI, sans-serif', fontSize: 12, boxSizing: 'border-box', borderRadius: 10, border: '1px solid #1f2937' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid #1f2937' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>AI Usage</div>
          <div style={{ color: '#9ca3af', fontSize: 11 }}>Mis à jour il y a {formatRelativeTime(lastFetch)}</div>
        </div>
      </div>
      <ProviderTabs active={activeTab} onChange={setActiveTab} />
      <div>
        {visibleSnaps.map(s => (
          <ProviderRow key={s.provider} snap={s} onConnectClick={handleConnect} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTop: '1px solid #1f2937', color: '#9ca3af', fontSize: 11 }}>
        <button onClick={refresh} disabled={refreshing} style={{ background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer' }}>
          ↻ Rafraîchir
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => window.api.app.openSettings()}
                  title="Paramètres" aria-label="Paramètres"
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>⚙</button>
          <button onClick={() => window.api.app.openDetail()}
                  title="Vue détaillée" aria-label="Vue détaillée"
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>⤢</button>
        </div>
      </div>
    </div>
  );
}
