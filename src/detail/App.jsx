import React, { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import History from './pages/History.jsx';
import Alerts from './pages/Alerts.jsx';
import Settings from './pages/Settings.jsx';

const VALID_PAGES = ['dashboard', 'history', 'alerts', 'settings'];

function getInitialPage() {
  const params = new URLSearchParams(window.location.search);
  const openTo = params.get('openTo');
  return openTo && VALID_PAGES.includes(openTo) ? openTo : 'dashboard';
}

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  history:   History,
  alerts:    Alerts,
  settings:  Settings,
};

export default function App() {
  const [activePage, setActivePage] = useState(getInitialPage);

  const PageComponent = PAGE_COMPONENTS[activePage] || Dashboard;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#0e1217',
        fontFamily: 'Segoe UI, sans-serif',
      }}
    >
      <Sidebar active={activePage} onChange={setActivePage} />
      <main style={{ flex: 1, minHeight: '100vh', background: '#0e1217' }}>
        <PageComponent />
      </main>
    </div>
  );
}
