import React, { useState } from 'react';
import { LayoutDashboard, LineChart, Bell, Settings } from 'lucide-react';

const ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'history',   label: 'History',   Icon: LineChart },
  { id: 'alerts',    label: 'Alerts',    Icon: Bell },
  { id: 'settings',  label: 'Settings',  Icon: Settings },
];

export default function Sidebar({ active, onChange }) {
  const [hovered, setHovered] = useState(null);

  return (
    <nav
      style={{
        width: 200,
        minHeight: '100vh',
        background: '#0e1217',
        borderRight: '1px solid #1f2937',
        padding: '16px 0',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {ITEMS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        const isHovered = hovered === id;

        return (
          <div
            key={id}
            role="button"
            aria-current={isActive ? 'page' : undefined}
            tabIndex={0}
            onClick={() => onChange(id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChange(id); }}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              cursor: 'pointer',
              background: isActive ? '#1f2937' : isHovered ? '#161b22' : 'transparent',
              color: isActive ? '#e5e7eb' : '#9ca3af',
              fontFamily: 'Segoe UI, sans-serif',
              fontSize: 13,
              userSelect: 'none',
              transition: 'background 0.1s, color 0.1s',
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </div>
        );
      })}
    </nav>
  );
}
