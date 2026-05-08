import React from 'react';

export default function ProgressBar({ pct, color, dimmed = false }) {
  const width = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div style={{ height: 6, background: '#1f2937', borderRadius: 3, overflow: 'hidden', opacity: dimmed ? 0.4 : 1 }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}
