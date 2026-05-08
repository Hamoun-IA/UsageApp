import React from 'react';
import ProgressBar from './ProgressBar';
import { PROVIDER_COLORS, PROVIDER_LABELS, formatResetIn, severityFor } from '../../shared/snapshot-utils';

const ROW_BORDER = '#1f2937';

export default function ProviderRow({ snap, onConnectClick }) {
  const color = PROVIDER_COLORS[snap.provider];
  const label = PROVIDER_LABELS[snap.provider];
  const sev = severityFor(snap);

  if (snap.error?.code === 'NOT_CONFIGURED') {
    return (
      <div style={{ padding: '10px 0', borderBottom: `1px solid ${ROW_BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4b5563' }} />
          <span style={{ fontWeight: 500 }}>{label}</span>
        </div>
        <button onClick={() => onConnectClick(snap.provider)} style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
          Connecter
        </button>
      </div>
    );
  }

  if (snap.error) {
    return (
      <div style={{ padding: '10px 0', borderBottom: `1px solid ${ROW_BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontWeight: 500 }}>{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ef4444' }}>{snap.error.code}</span>
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{snap.error.message}</div>
        {snap.error.code === 'AUTH_EXPIRED' && (
          <button onClick={() => onConnectClick(snap.provider)} style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, marginTop: 4 }}>
            🔒 Reconnect
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${ROW_BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontWeight: 500 }}>{label}</span>
        {snap.approximated && <span style={{ fontSize: 10, color: '#9ca3af' }}>(approximé)</span>}
        {snap.planLevel && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>{snap.planLevel}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span>Session 5h</span>
        <span style={{ color: '#9ca3af' }}>{snap.sessionPct ?? 0}%</span>
      </div>
      <ProgressBar pct={snap.sessionPct} color={color} />
      {snap.sessionResetAt && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Resets in {formatResetIn(snap.sessionResetAt)}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 8, marginBottom: 2 }}>
        <span>Weekly</span>
        <span style={{ color: '#9ca3af' }}>{snap.weeklyPct ?? 0}%</span>
      </div>
      <ProgressBar pct={snap.weeklyPct} color={color} />
      {snap.weeklyResetAt && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Resets in {formatResetIn(snap.weeklyResetAt)}</div>}
    </div>
  );
}
