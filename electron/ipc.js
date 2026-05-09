const { ipcMain, app } = require('electron');
const { listAdapters, getAdapter } = require('./providers');
const db = require('./db');
const alerts = require('./alerts');
const refreshProviders = require('./refresh-providers');

// Dependency container — single mutation surface for tests and production.
// Tests override individual fields (e.g. ipc.deps.getAdapter = stub) before
// calling registerIpcHandlers. Production uses the defaults set here.
const deps = {
  ipcMain,
  getAdapter,
  listAdapters,
  db,
  alerts,
  refreshProviders,
  app: {
    setLoginItemSettings: (...args) => app.setLoginItemSettings(...args),
    getLoginItemSettings: (...args) => app.getLoginItemSettings(...args),
  },
};

function registerIpcHandlers({ db: database }) {
  // `database` is the live SQLite connection opened at app boot (passed in by
  // main.js). `deps.db` holds the module-level db helper functions (insertSnapshot,
  // recentSnapshots, getPref, setPref) so tests can swap them if needed.
  const ipc = deps.ipcMain;

  ipc.handle('providers:list', () => {
    return deps.listAdapters().map(a => ({ id: a.id, label: a.label, authMode: a.authMode }));
  });

  ipc.handle('providers:refresh', async (_e, providerId) => {
    const { snap } = await deps.refreshProviders.refreshAndPersist({
      database,
      db: deps.db,
      alerts: deps.alerts,
      getAdapter: deps.getAdapter,
      providerId,
    });
    return snap;
  });

  ipc.handle('providers:refreshAll', async () => {
    const { snaps } = await deps.refreshProviders.refreshAllAndPersist({
      database,
      db: deps.db,
      alerts: deps.alerts,
      listAdapters: deps.listAdapters,
    });
    return snaps;
  });

  ipc.handle('providers:connect', async (_e, providerId) => {
    const a = deps.getAdapter(providerId);
    return a.connect();
  });

  ipc.handle('providers:disconnect', async (_e, providerId) => {
    const a = deps.getAdapter(providerId);
    return a.disconnect();
  });

  ipc.handle('db:recentSnapshots', (_e, provider, sinceMs) =>
    deps.db.recentSnapshots(database, provider, sinceMs));

  ipc.handle('db:getPref', (_e, key, fallback) =>
    deps.db.getPref(database, key, fallback));

  ipc.handle('db:setPref', (_e, key, value) =>
    deps.db.setPref(database, key, value));

  ipc.handle('app:setAutostart', (_e, enabled) => {
    deps.app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--minimized'] });
    deps.db.setPref(database, 'autostart', !!enabled);
    return true;
  });

  ipc.handle('app:getAutostart', () =>
    deps.app.getLoginItemSettings().openAtLogin);
}

module.exports = { registerIpcHandlers, deps };
