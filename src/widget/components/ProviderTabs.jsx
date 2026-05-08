import React from 'react';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../../shared/snapshot-utils';

const TABS = ['all', 'claude', 'codex', 'ollama', 'zai'];

export default function ProviderTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
      {TABS.map((t) => {
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              fontSize: 10,
              background: isActive ? '#1e293b' : '#161b22',
              color: isActive ? '#e5e7eb' : '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {t !== 'all' && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: PROVIDER_COLORS[t] }} />
            )}
            {t === 'all' ? 'All' : PROVIDER_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
