import React, { useEffect, useState } from 'react';

export default function App() {
  const [providers, setProviders] = useState([]);
  const [refreshAll, setRefreshAll] = useState(null);

  useEffect(() => {
    window.api.providers.list().then(setProviders);
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'Segoe UI, sans-serif', color: '#9ca3af', background: '#0e1217', minHeight: '100vh' }}>
      <h1 style={{ color: '#e5e7eb' }}>AI Usage Monitor</h1>
      <p>Refonte en cours.</p>
      <h3>Providers IPC test</h3>
      <pre>{JSON.stringify(providers, null, 2)}</pre>
      <button onClick={() => window.api.providers.refreshAll().then(setRefreshAll)}>Refresh all stubs</button>
      <pre>{JSON.stringify(refreshAll, null, 2)}</pre>
    </div>
  );
}
