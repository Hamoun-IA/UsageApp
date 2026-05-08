import React from 'react';

export default function Sparkline({ points, color = '#06b6d4', width = 220, height = 36 }) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...points, 1);
  const min = 0;
  const span = Math.max(max - min, 1);
  const stepX = width / (points.length - 1);
  const path = points.map((y, i) => {
    const px = i * stepX;
    const py = height - ((y - min) / span) * height;
    return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}
