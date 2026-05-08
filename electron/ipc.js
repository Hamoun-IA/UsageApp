const { ipcMain } = require('electron');
const { listAdapters, getAdapter } = require('./providers');
const db = require('./db');

// Dependency container — allows test injection without breaking production.
const deps = {
  ipcMain,
  getAdapter,
  listAdapters,
};

function registerIpcHandlers(handlerDeps) {
  const database = handlerDeps.db;
  const ipc = deps.ipcMain;

  ipc.handle('providers:list', () => {
    return deps.listAdapters().map(a => ({ id: a.id, label: a.label, authMode: a.authMode }));
  });

  ipc.handle('providers:refresh', async (_e, providerId) => {
    const a = deps.getAdapter(providerId);
    const snap = await a.refresh();
    try { db.insertSnapshot(database, snap); } catch (e) { console.error('insertSnapshot failed:', e); }
    return snap;
  });

  ipc.handle('providers:refreshAll', async () => {
    const results = await Promise.all(deps.listAdapters().map(a => a.refresh()));
    for (const snap of results) {
      try { db.insertSnapshot(database, snap); } catch (e) { console.error('insertSnapshot failed:', e); }
    }
    return results;
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
    db.recentSnapshots(database, provider, sinceMs));

  ipc.handle('db:getPref', (_e, key) =>
    db.getPref(database, key));

  ipc.handle('db:setPref', (_e, key, value) =>
    db.setPref(database, key, value));
}

module.exports = { registerIpcHandlers, deps };
