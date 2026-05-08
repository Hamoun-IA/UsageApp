import { useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import Layout from './components/Layout.jsx';
import Dashboard from './components/Dashboard.jsx';
import Settings from './components/Settings.jsx';
import Alerts from './components/Alerts.jsx';
import History from './components/History.jsx';

export default function App() {
  const [route, setRoute] = useState('dashboard');
  const [status, setStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const reloadStatus = useCallback(async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
    } catch (e) {
      setStatus({ error: e.message });
    }
  }, []);

  useEffect(() => {
    reloadStatus();
    if (api.onUsageUpdated) {
      const off = api.onUsageUpdated(() => {
        setRefreshTick((t) => t + 1);
        reloadStatus();
      });
      return off;
    }
  }, [reloadStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshNow();
      setRefreshTick((t) => t + 1);
      await reloadStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Layout
      route={route}
      onRoute={setRoute}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      status={status}
    >
      {route === 'dashboard' && <Dashboard refreshTick={refreshTick} status={status} />}
      {route === 'history' && <History refreshTick={refreshTick} />}
      {route === 'alerts' && <Alerts refreshTick={refreshTick} />}
      {route === 'settings' && (
        <Settings refreshTick={refreshTick} onChanged={() => setRefreshTick((t) => t + 1)} />
      )}
    </Layout>
  );
}
