import React from 'react';
import ProgressBar from '../../widget/components/ProgressBar.jsx';
import Sparkline from './Sparkline.jsx';
import { formatResetIn } from '../../shared/snapshot-utils.js';

export default function ProviderCard({ snap, points, color, label }) {
  const hasError = !!snap?.error;
  const isNotConfigured = snap?.error?.code === 'NOT_CONFIGURED';

  return (
    <div
      style={{
        background: '#1f2937',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Top row: dot + label + plan badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: hasError ? '#6b7280' : color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, color: '#e5e7eb', flex: 1 }}>{label}</span>
        {snap?.planLevel && !hasError && (
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
            {snap.planLevel}
          </span>
        )}
      </div>

      {/* Approximated badge */}
      {snap?.approximated && !hasError && (
        <span style={{ fontSize: 11, color: '#9ca3af' }}>(approximé)</span>
      )}

      {/* Error state */}
      {hasError && (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>
          {isNotConfigured
            ? 'Non configuré'
            : snap.error.message || snap.error.code || 'Erreur inconnue'}
        </div>
      )}

      {/* Session bar */}
      {!hasError && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>Session 5h</span>
            <span style={{ fontSize: 12, color: '#e5e7eb' }}>
              {snap?.sessionPct != null ? `${Math.round(snap.sessionPct)}%` : '—'}
            </span>
          </div>
          <ProgressBar pct={snap?.sessionPct ?? 0} color={color} />
          {snap?.sessionResetAt && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
              Resets in {formatResetIn(snap.sessionResetAt)}
            </div>
          )}
        </div>
      )}

      {/* Weekly bar */}
      {!hasError && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>Weekly</span>
            <span style={{ fontSize: 12, color: '#e5e7eb' }}>
              {snap?.weeklyPct != null ? `${Math.round(snap.weeklyPct)}%` : '—'}
            </span>
          </div>
          <ProgressBar pct={snap?.weeklyPct ?? 0} color={color} />
          {snap?.weeklyResetAt && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
              Resets in {formatResetIn(snap.weeklyResetAt)}
            </div>
          )}
        </div>
      )}

      {/* Sparkline */}
      {!hasError && points && points.length >= 2 && (
        <div style={{ marginTop: 4 }}>
          <Sparkline
            points={points}
            color={color}
            height={36}
          />
        </div>
      )}
    </div>
  );
}
