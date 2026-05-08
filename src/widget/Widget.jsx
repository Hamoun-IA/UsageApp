import React, { useEffect, useState } from 'react';

export default function Widget() {
  const [snaps, setSnaps] = useState(null);
  const refresh = () => window.api.providers.refreshAll().then(setSnaps);

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ width: 320, background: '#0e1217', color: '#e5e7eb', padding: 14, fontFamily: 'Segoe UI, sans-serif', fontSize: 12, height: '100vh' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>AI Usage</div>
      <button onClick={refresh}>↻</button>
      <pre style={{ marginTop: 12, fontSize: 10 }}>{JSON.stringify(snaps, null, 2)}</pre>
    </div>
  );
}
