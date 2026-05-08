const { ipcMain, app } = require('electron');
const { listAdapters, getAdapter } = require('./providers');
const db = require('./db');

// Dependency container — single mutation surface for tests and production.
// Tests override individual fields (e.g. ipc.deps.getAdapter = stub) before
// calling registerIpcHandlers. Production uses the defaults set here.
const deps = {
  ipcMain,
  getAdapter,
  listAdapters,
  db,
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
    const a = deps.getAdapter(providerId);
    const snap = await a.refresh();
    try {
      deps.db.insertSnapshot(database, snap);
    } catch (e) {
      console.error('insertSnapshot failed:', e);
    }
    return snap;
  });

  ipc.handle('providers:refreshAll', async () => {
    const adapters = deps.listAdapters();
    const settled = await Promise.allSettled(adapters.map(a => a.refresh()));
    const results = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`refresh failed for ${adapters[i].id}:`, r.reason);
      return null;
    });
    for (const snap of results) {
      if (!snap) continue;
      try {
        deps.db.insertSnapshot(database, snap);
      } catch (e) {
        console.error('insertSnapshot failed:', e);
      }
    }
    return results.filter(Boolean);
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

  ipc.handle('db:getPref', (_e, key) =>
    deps.db.getPref(database, key));

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
