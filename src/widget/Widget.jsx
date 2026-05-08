import React, { useEffect, useRef, useState, useCallback } from 'react';
import ProviderRow from './components/ProviderRow';
import ProviderTabs from './components/ProviderTabs';
import { formatRelativeTime } from '../shared/snapshot-utils';

export default function Widget() {
  const [snaps, setSnaps] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('all');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current || !window.api?.widget?.setHeight) return;
    const observer = new ResizeObserver(() => {
      if (rootRef.current) window.api.widget.setHeight(rootRef.current.offsetHeight);
    });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const refresh = useCallback(async () => {
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
        <span>⚙ ⤢</span>
      </div>
    </div>
  );
}
